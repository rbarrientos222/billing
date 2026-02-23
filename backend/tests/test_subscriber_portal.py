"""
Test Suite for Subscriber Portal
Tests all subscriber-facing APIs for the ISP billing system
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test subscriber credentials
TEST_ACCOUNT_NUMBER = "ACC4307BC6B"
TEST_PASSWORD = "0000"


class TestSubscriberAuth:
    """Subscriber authentication tests"""
    
    def test_subscriber_login_success(self):
        """Test successful subscriber login"""
        response = requests.post(
            f"{BASE_URL}/api/subscriber/auth/login",
            json={"account_number": TEST_ACCOUNT_NUMBER, "password": TEST_PASSWORD}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert "access_token" in data
        assert "account_number" in data
        assert "name" in data
        assert "role" in data
        
        # Verify values
        assert data["account_number"] == TEST_ACCOUNT_NUMBER
        assert data["role"] == "subscriber"
        assert len(data["access_token"]) > 0
        
    def test_subscriber_login_case_insensitive(self):
        """Test that account number login is case insensitive"""
        response = requests.post(
            f"{BASE_URL}/api/subscriber/auth/login",
            json={"account_number": TEST_ACCOUNT_NUMBER.lower(), "password": TEST_PASSWORD}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["account_number"] == TEST_ACCOUNT_NUMBER  # Should be uppercase
        
    def test_subscriber_login_invalid_account(self):
        """Test login with invalid account number"""
        response = requests.post(
            f"{BASE_URL}/api/subscriber/auth/login",
            json={"account_number": "INVALID123", "password": TEST_PASSWORD}
        )
        assert response.status_code == 401
        
    def test_subscriber_login_invalid_password(self):
        """Test login with invalid password"""
        response = requests.post(
            f"{BASE_URL}/api/subscriber/auth/login",
            json={"account_number": TEST_ACCOUNT_NUMBER, "password": "wrongpass"}
        )
        assert response.status_code == 401


class TestSubscriberDashboard:
    """Subscriber dashboard API tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token before each test"""
        response = requests.post(
            f"{BASE_URL}/api/subscriber/auth/login",
            json={"account_number": TEST_ACCOUNT_NUMBER, "password": TEST_PASSWORD}
        )
        if response.status_code == 200:
            self.token = response.json()["access_token"]
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Could not authenticate")
            
    def test_get_dashboard(self):
        """Test getting subscriber dashboard data"""
        response = requests.get(
            f"{BASE_URL}/api/subscriber/dashboard",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify structure
        assert "subscriber" in data
        assert "payables" in data
        assert "job_orders" in data
        assert "notifications" in data
        
        # Verify subscriber info
        subscriber = data["subscriber"]
        assert subscriber["account_number"] == TEST_ACCOUNT_NUMBER
        assert "name" in subscriber
        assert "status" in subscriber
        assert "plan" in subscriber
        assert "address" in subscriber
        assert "mobile" in subscriber
        assert "email" in subscriber
        assert "installation_date" in subscriber
        assert "billing_day" in subscriber
        
        # Verify payables structure
        payables = data["payables"]
        assert "total" in payables
        assert "invoice_count" in payables
        assert isinstance(payables["total"], (int, float))
        assert isinstance(payables["invoice_count"], int)
        
        # Verify job orders structure
        job_orders = data["job_orders"]
        assert "open" in job_orders
        assert "completed" in job_orders
        assert "total" in job_orders
        
    def test_dashboard_unauthorized(self):
        """Test dashboard access without token"""
        response = requests.get(f"{BASE_URL}/api/subscriber/dashboard")
        assert response.status_code in [401, 403]


class TestSubscriberInvoices:
    """Subscriber invoices API tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token before each test"""
        response = requests.post(
            f"{BASE_URL}/api/subscriber/auth/login",
            json={"account_number": TEST_ACCOUNT_NUMBER, "password": TEST_PASSWORD}
        )
        if response.status_code == 200:
            self.token = response.json()["access_token"]
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Could not authenticate")
            
    def test_get_invoices(self):
        """Test getting subscriber invoices"""
        response = requests.get(
            f"{BASE_URL}/api/subscriber/invoices",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Should return a list
        assert isinstance(data, list)
        
        # If there are invoices, verify structure
        if len(data) > 0:
            invoice = data[0]
            assert "invoice_number" in invoice
            assert "subscriber_id" in invoice
            assert "amount" in invoice
            assert "paid" in invoice
            
    def test_invoices_unauthorized(self):
        """Test invoices access without token"""
        response = requests.get(f"{BASE_URL}/api/subscriber/invoices")
        assert response.status_code in [401, 403]


class TestSubscriberPayments:
    """Subscriber payments API tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token before each test"""
        response = requests.post(
            f"{BASE_URL}/api/subscriber/auth/login",
            json={"account_number": TEST_ACCOUNT_NUMBER, "password": TEST_PASSWORD}
        )
        if response.status_code == 200:
            self.token = response.json()["access_token"]
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Could not authenticate")
            
    def test_get_payments(self):
        """Test getting subscriber payment history"""
        response = requests.get(
            f"{BASE_URL}/api/subscriber/payments",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Should return a list
        assert isinstance(data, list)
        
        # If there are payments, verify structure
        if len(data) > 0:
            payment = data[0]
            assert "or_number" in payment or "invoice_id" in payment
            assert "subscriber_id" in payment
            assert "mode" in payment
            assert "payment_date" in payment
            
    def test_payments_unauthorized(self):
        """Test payments access without token"""
        response = requests.get(f"{BASE_URL}/api/subscriber/payments")
        assert response.status_code in [401, 403]


class TestSubscriberJobOrders:
    """Subscriber job orders API tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token before each test"""
        response = requests.post(
            f"{BASE_URL}/api/subscriber/auth/login",
            json={"account_number": TEST_ACCOUNT_NUMBER, "password": TEST_PASSWORD}
        )
        if response.status_code == 200:
            self.token = response.json()["access_token"]
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Could not authenticate")
            
    def test_get_job_orders(self):
        """Test getting subscriber job orders"""
        response = requests.get(
            f"{BASE_URL}/api/subscriber/job-orders",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Should return a list
        assert isinstance(data, list)
        
        # If there are job orders, verify structure
        if len(data) > 0:
            job = data[0]
            assert "job_order_id" in job
            assert "subscriber_id" in job
            assert "type" in job
            assert "status" in job
            assert "priority" in job
            
    def test_job_orders_unauthorized(self):
        """Test job orders access without token"""
        response = requests.get(f"{BASE_URL}/api/subscriber/job-orders")
        assert response.status_code in [401, 403]


class TestSubscriberChangePassword:
    """Subscriber password change tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token before each test"""
        response = requests.post(
            f"{BASE_URL}/api/subscriber/auth/login",
            json={"account_number": TEST_ACCOUNT_NUMBER, "password": TEST_PASSWORD}
        )
        if response.status_code == 200:
            self.token = response.json()["access_token"]
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Could not authenticate")
            
    def test_change_password_too_short(self):
        """Test password change with too short password"""
        response = requests.post(
            f"{BASE_URL}/api/subscriber/auth/change-password",
            json={"new_password": "123"},
            headers=self.headers
        )
        assert response.status_code == 400
        
    def test_change_password_unauthorized(self):
        """Test password change without token"""
        response = requests.post(
            f"{BASE_URL}/api/subscriber/auth/change-password",
            json={"new_password": "newpass123"}
        )
        assert response.status_code in [401, 403]


class TestStaffLoginLink:
    """Test the staff login navigation"""
    
    def test_staff_login_endpoint(self):
        """Test that staff login endpoint exists"""
        # Test staff login (admin)
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": "admin", "password": "@Gello1006"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["role"] == "admin"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
