"""
Backend API Tests for Billing System
Tests: Auth, Subscribers, Billing APIs, Scheduler Status
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_USER = "admin"
ADMIN_PASS = "@Gello1006"
CASHIER_USER = "cashier1"
CASHIER_PASS = "test123"


class TestAuthEndpoints:
    """Authentication endpoint tests"""
    
    def test_admin_login_success(self):
        """Test admin login with valid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": ADMIN_USER,
            "password": ADMIN_PASS
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert data["role"] == "admin"
        assert data["username"] == ADMIN_USER
    
    def test_login_invalid_credentials(self):
        """Test login with invalid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "wronguser",
            "password": "wrongpass"
        })
        assert response.status_code == 401
    
    def test_protected_endpoint_without_token(self):
        """Test accessing protected endpoint without token"""
        response = requests.get(f"{BASE_URL}/api/users")
        assert response.status_code in [401, 403]


class TestBillingSchedulerAPIs:
    """Billing scheduler and automatic billing API tests"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": ADMIN_USER,
            "password": ADMIN_PASS
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("Admin authentication failed")
    
    def test_billing_status_api(self, admin_token):
        """Test GET /api/billing/status - returns scheduler status"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/billing/status", headers=headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "scheduler_running" in data
        assert "auto_billing_enabled" in data
        assert "billing_time" in data
        assert "next_run" in data
        
        # Verify scheduler is running
        assert data["scheduler_running"] == True
    
    def test_manual_billing_trigger_api(self, admin_token):
        """Test POST /api/billing/run-now - manual billing trigger"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.post(f"{BASE_URL}/api/billing/run-now", headers=headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "message" in data
        assert "invoices_generated" in data
        assert isinstance(data["invoices_generated"], int)
    
    def test_billing_logs_api(self, admin_token):
        """Test GET /api/billing/logs - returns billing run history"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/billing/logs", headers=headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Should return a list
        assert isinstance(data, list)
    
    def test_upcoming_billing_api(self, admin_token):
        """Test GET /api/billing/upcoming - returns subscriber counts by billing period"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/billing/upcoming", headers=headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "billing_15th" in data
        assert "billing_30th" in data
        assert "count" in data["billing_15th"]
        assert "days_until" in data["billing_15th"]
        assert "count" in data["billing_30th"]
        assert "days_until" in data["billing_30th"]


class TestSubscriberAPIs:
    """Subscriber management API tests"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": ADMIN_USER,
            "password": ADMIN_PASS
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("Admin authentication failed")
    
    def test_list_subscribers(self, admin_token):
        """Test GET /api/subscribers - list all subscribers"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/subscribers", headers=headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list)
    
    def test_list_plans(self, admin_token):
        """Test GET /api/plans - list subscription plans"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/plans", headers=headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list)
    
    def test_list_invoices(self, admin_token):
        """Test GET /api/invoices - list all invoices"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/invoices", headers=headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list)


class TestMikrotikAPIs:
    """Mikrotik integration API tests (MOCKED - returns 404 when not configured)"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": ADMIN_USER,
            "password": ADMIN_PASS
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("Admin authentication failed")
    
    def test_mikrotik_stats_not_configured(self, admin_token):
        """Test GET /api/mikrotik/stats - returns 404 when not configured (MOCKED)"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/mikrotik/stats", headers=headers)
        
        # Expected to return 404 since Mikrotik is not configured
        assert response.status_code == 404, f"Expected 404 (not configured), got {response.status_code}"
    
    def test_mikrotik_profiles_not_configured(self, admin_token):
        """Test GET /api/mikrotik/profiles - returns 404 when not configured (MOCKED)"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/mikrotik/profiles", headers=headers)
        
        # Expected to return 404 since Mikrotik is not configured
        assert response.status_code == 404, f"Expected 404 (not configured), got {response.status_code}"


class TestDashboardAPIs:
    """Dashboard stats API tests"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": ADMIN_USER,
            "password": ADMIN_PASS
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("Admin authentication failed")
    
    def test_dashboard_stats(self, admin_token):
        """Test GET /api/dashboard/stats - returns dashboard statistics"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/dashboard/stats", headers=headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify response has expected fields
        assert isinstance(data, dict)


class TestUserManagementAPIs:
    """User management API tests"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": ADMIN_USER,
            "password": ADMIN_PASS
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("Admin authentication failed")
    
    def test_list_users(self, admin_token):
        """Test GET /api/users - list all users"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/users", headers=headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        
        # Verify admin user exists
        admin_found = any(u.get("username") == "admin" for u in data)
        assert admin_found, "Admin user should exist in user list"


class TestAddressAPIs:
    """Philippine address API tests"""
    
    def test_get_provinces(self):
        """Test GET /api/addresses/provinces - returns list of provinces"""
        response = requests.get(f"{BASE_URL}/api/addresses/provinces")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "provinces" in data
        assert isinstance(data["provinces"], list)
        assert len(data["provinces"]) > 0


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
