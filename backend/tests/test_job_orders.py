"""
Test Job Orders and Technician Module APIs
Tests: Job Order CRUD, Stats, Technician endpoints, SLA tracking
"""
import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_CREDS = {"username": "admin", "password": "@Gello1006"}
TECH_CREDS = {"username": "tech1", "password": "test123"}


class TestAuthentication:
    """Test authentication for admin and technician"""
    
    def test_admin_login(self):
        """Test admin login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_CREDS)
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert data["role"] == "admin"
        assert data["username"] == "admin"
        print(f"Admin login successful, role: {data['role']}")
    
    def test_technician_login(self):
        """Test technician login with tech1/test123"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=TECH_CREDS)
        assert response.status_code == 200, f"Technician login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert data["role"] == "tech"
        assert data["username"] == "tech1"
        print(f"Technician login successful, role: {data['role']}")


@pytest.fixture(scope="module")
def admin_token():
    """Get admin authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_CREDS)
    if response.status_code != 200:
        pytest.skip(f"Admin login failed: {response.text}")
    return response.json()["access_token"]


@pytest.fixture(scope="module")
def tech_token():
    """Get technician authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json=TECH_CREDS)
    if response.status_code != 200:
        pytest.skip(f"Technician login failed: {response.text}")
    return response.json()["access_token"]


@pytest.fixture
def admin_headers(admin_token):
    """Headers with admin auth"""
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture
def tech_headers(tech_token):
    """Headers with technician auth"""
    return {"Authorization": f"Bearer {tech_token}", "Content-Type": "application/json"}


class TestTechniciansEndpoint:
    """Test technicians list endpoint"""
    
    def test_list_technicians(self, admin_headers):
        """Test listing technicians"""
        response = requests.get(f"{BASE_URL}/api/technicians", headers=admin_headers)
        assert response.status_code == 200, f"Failed to list technicians: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} technicians")
        
        # Check if tech1 exists
        tech_usernames = [t.get("username") for t in data]
        assert "tech1" in tech_usernames, "tech1 not found in technicians list"
        print(f"Technicians: {tech_usernames}")


class TestJobOrderStats:
    """Test job order statistics endpoint"""
    
    def test_get_job_order_stats(self, admin_headers):
        """Test getting job order stats"""
        response = requests.get(f"{BASE_URL}/api/joborders/stats", headers=admin_headers)
        assert response.status_code == 200, f"Failed to get stats: {response.text}"
        data = response.json()
        
        # Verify stats structure
        assert "status_counts" in data
        assert "sla_breached_count" in data
        assert "total_job_orders" in data
        
        status_counts = data["status_counts"]
        assert "Open" in status_counts
        assert "In Progress" in status_counts
        assert "On Hold" in status_counts
        assert "Completed" in status_counts
        assert "Cancelled" in status_counts
        
        print(f"Job Order Stats: {data}")
        print(f"SLA Breached Count: {data['sla_breached_count']}")


class TestJobOrderCRUD:
    """Test Job Order CRUD operations"""
    
    def test_list_job_orders(self, admin_headers):
        """Test listing all job orders"""
        response = requests.get(f"{BASE_URL}/api/joborders", headers=admin_headers)
        assert response.status_code == 200, f"Failed to list job orders: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} job orders")
    
    def test_create_job_order(self, admin_headers):
        """Test creating a new job order"""
        # First get a subscriber
        subs_response = requests.get(f"{BASE_URL}/api/subscribers", headers=admin_headers)
        assert subs_response.status_code == 200
        subscribers = subs_response.json()
        
        if not subscribers:
            pytest.skip("No subscribers available for testing")
        
        subscriber = subscribers[0]
        
        # Create job order
        job_data = {
            "subscriber_id": subscriber["account_number"],
            "type": "Installation",
            "description": "TEST_New fiber installation for testing",
            "priority": "Medium",
            "assigned_technicians": ["tech1"],
            "notes": "Test job order created by automated tests"
        }
        
        response = requests.post(f"{BASE_URL}/api/joborders", json=job_data, headers=admin_headers)
        assert response.status_code == 200, f"Failed to create job order: {response.text}"
        data = response.json()
        
        assert "job_order_id" in data
        assert data["job_order_id"].startswith("JO")
        print(f"Created job order: {data['job_order_id']}")
        
        # Store for cleanup
        return data["job_order_id"]
    
    def test_get_job_order_by_id(self, admin_headers):
        """Test getting a specific job order"""
        # First list job orders
        list_response = requests.get(f"{BASE_URL}/api/joborders", headers=admin_headers)
        assert list_response.status_code == 200
        job_orders = list_response.json()
        
        if not job_orders:
            pytest.skip("No job orders available for testing")
        
        job_order_id = job_orders[0]["job_order_id"]
        
        # Get specific job order
        response = requests.get(f"{BASE_URL}/api/joborders/{job_order_id}", headers=admin_headers)
        assert response.status_code == 200, f"Failed to get job order: {response.text}"
        data = response.json()
        
        assert data["job_order_id"] == job_order_id
        assert "subscriber_id" in data
        assert "type" in data
        assert "status" in data
        assert "priority" in data
        print(f"Retrieved job order: {job_order_id}, status: {data['status']}")
    
    def test_update_job_order(self, admin_headers):
        """Test updating a job order"""
        # First list job orders
        list_response = requests.get(f"{BASE_URL}/api/joborders", headers=admin_headers)
        assert list_response.status_code == 200
        job_orders = list_response.json()
        
        # Find an Open job order
        open_jobs = [jo for jo in job_orders if jo["status"] == "Open"]
        if not open_jobs:
            pytest.skip("No Open job orders available for testing")
        
        job_order_id = open_jobs[0]["job_order_id"]
        
        # Update job order
        update_data = {
            "priority": "High",
            "notes": "Updated by automated test"
        }
        
        response = requests.put(f"{BASE_URL}/api/joborders/{job_order_id}", json=update_data, headers=admin_headers)
        assert response.status_code == 200, f"Failed to update job order: {response.text}"
        
        # Verify update
        get_response = requests.get(f"{BASE_URL}/api/joborders/{job_order_id}", headers=admin_headers)
        assert get_response.status_code == 200
        updated_data = get_response.json()
        assert updated_data["priority"] == "High"
        print(f"Updated job order {job_order_id} priority to High")


class TestTechnicianJobOrders:
    """Test technician-specific job order endpoints"""
    
    def test_get_technician_job_orders(self, tech_headers):
        """Test getting job orders assigned to tech1"""
        response = requests.get(f"{BASE_URL}/api/joborders/technician/tech1", headers=tech_headers)
        assert response.status_code == 200, f"Failed to get technician job orders: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"tech1 has {len(data)} assigned job orders")
        
        # Verify all returned jobs are assigned to tech1
        for jo in data:
            assert "tech1" in jo.get("assigned_technicians", []), f"Job {jo['job_order_id']} not assigned to tech1"
    
    def test_start_job_order(self, tech_headers, admin_headers):
        """Test starting a job order as technician"""
        # Get job orders assigned to tech1
        response = requests.get(f"{BASE_URL}/api/joborders/technician/tech1", headers=tech_headers)
        assert response.status_code == 200
        job_orders = response.json()
        
        # Find an Open job order
        open_jobs = [jo for jo in job_orders if jo["status"] == "Open"]
        if not open_jobs:
            pytest.skip("No Open job orders assigned to tech1")
        
        job_order_id = open_jobs[0]["job_order_id"]
        
        # Start the job
        start_response = requests.post(f"{BASE_URL}/api/joborders/{job_order_id}/start", headers=tech_headers)
        assert start_response.status_code == 200, f"Failed to start job order: {start_response.text}"
        
        # Verify status changed
        get_response = requests.get(f"{BASE_URL}/api/joborders/{job_order_id}", headers=tech_headers)
        assert get_response.status_code == 200
        data = get_response.json()
        assert data["status"] == "In Progress"
        assert data["started_at"] is not None
        print(f"Started job order {job_order_id}")


class TestSLASettings:
    """Test SLA settings endpoints"""
    
    def test_get_sla_settings(self, admin_headers):
        """Test getting SLA settings"""
        response = requests.get(f"{BASE_URL}/api/settings/sla", headers=admin_headers)
        assert response.status_code == 200, f"Failed to get SLA settings: {response.text}"
        data = response.json()
        
        # Verify SLA structure
        assert "critical_hours" in data
        assert "high_hours" in data
        assert "medium_hours" in data
        assert "low_hours" in data
        
        print(f"SLA Settings: Critical={data['critical_hours']}h, High={data['high_hours']}h, Medium={data['medium_hours']}h, Low={data['low_hours']}h")


class TestSubscribersForJobOrders:
    """Test subscribers endpoint needed for job order creation"""
    
    def test_list_subscribers(self, admin_headers):
        """Test listing subscribers"""
        response = requests.get(f"{BASE_URL}/api/subscribers", headers=admin_headers)
        assert response.status_code == 200, f"Failed to list subscribers: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} subscribers")


class TestInventoryForMaterials:
    """Test inventory endpoint needed for material entry"""
    
    def test_list_inventory(self, admin_headers):
        """Test listing inventory items"""
        response = requests.get(f"{BASE_URL}/api/inventory", headers=admin_headers)
        assert response.status_code == 200, f"Failed to list inventory: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} inventory items")


# Cleanup test data
@pytest.fixture(scope="module", autouse=True)
def cleanup_test_job_orders(admin_token):
    """Cleanup TEST_ prefixed job orders after tests"""
    yield
    
    headers = {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}
    
    # Get all job orders
    response = requests.get(f"{BASE_URL}/api/joborders", headers=headers)
    if response.status_code == 200:
        job_orders = response.json()
        for jo in job_orders:
            if jo.get("description", "").startswith("TEST_"):
                delete_response = requests.delete(f"{BASE_URL}/api/joborders/{jo['job_order_id']}", headers=headers)
                if delete_response.status_code == 200:
                    print(f"Cleaned up test job order: {jo['job_order_id']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
