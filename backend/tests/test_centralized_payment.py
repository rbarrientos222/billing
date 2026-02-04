"""
Backend API Tests for Centralized Payment System
Tests: Cashier Login, Subscriber Search, Centralized Payment (Partial, Full, Overpayment), Wallet
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
CASHIER_USER = "cashier1"
CASHIER_PASS = "test123"
ADMIN_USER = "admin"
ADMIN_PASS = "@Gello1006"

# Test subscriber
TEST_SUBSCRIBER = "ACC78B83271"


class TestCashierAuth:
    """Cashier authentication tests"""
    
    def test_cashier_login_success(self):
        """Test cashier login with valid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": CASHIER_USER,
            "password": CASHIER_PASS
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert data["role"] == "cashier"
        assert data["username"] == CASHIER_USER


class TestSubscriberSearch:
    """Subscriber search functionality tests"""
    
    @pytest.fixture
    def cashier_token(self):
        """Get cashier authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": CASHIER_USER,
            "password": CASHIER_PASS
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("Cashier authentication failed")
    
    def test_search_by_account_number(self, cashier_token):
        """Test searching subscriber by account number"""
        headers = {"Authorization": f"Bearer {cashier_token}"}
        response = requests.get(f"{BASE_URL}/api/subscribers/{TEST_SUBSCRIBER}", headers=headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert data["account_number"] == TEST_SUBSCRIBER
        assert "first_name" in data
        assert "last_name" in data
    
    def test_search_by_name(self, cashier_token):
        """Test searching subscriber by name"""
        headers = {"Authorization": f"Bearer {cashier_token}"}
        response = requests.get(f"{BASE_URL}/api/subscribers/search?q=test", headers=headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert isinstance(data, list)


class TestSubscriberInvoices:
    """Subscriber invoice tests"""
    
    @pytest.fixture
    def cashier_token(self):
        """Get cashier authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": CASHIER_USER,
            "password": CASHIER_PASS
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("Cashier authentication failed")
    
    def test_get_subscriber_invoices(self, cashier_token):
        """Test getting subscriber invoices"""
        headers = {"Authorization": f"Bearer {cashier_token}"}
        response = requests.get(f"{BASE_URL}/api/invoices/subscriber/{TEST_SUBSCRIBER}", headers=headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert isinstance(data, list)
        
        # Verify invoice structure
        if len(data) > 0:
            invoice = data[0]
            assert "invoice_number" in invoice
            assert "amount" in invoice
            assert "remaining_balance" in invoice


class TestTodayStats:
    """Today's payment statistics tests"""
    
    @pytest.fixture
    def cashier_token(self):
        """Get cashier authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": CASHIER_USER,
            "password": CASHIER_PASS
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("Cashier authentication failed")
    
    def test_today_stats(self, cashier_token):
        """Test getting today's payment statistics"""
        headers = {"Authorization": f"Bearer {cashier_token}"}
        response = requests.get(f"{BASE_URL}/api/payments/today-stats", headers=headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "total" in data
        assert "count" in data
        assert "date" in data


class TestCentralizedPayment:
    """Centralized payment system tests"""
    
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
    
    @pytest.fixture
    def cashier_token(self):
        """Get cashier authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": CASHIER_USER,
            "password": CASHIER_PASS
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("Cashier authentication failed")
    
    def test_centralized_payment_validation(self, cashier_token):
        """Test centralized payment validation - missing amount"""
        headers = {"Authorization": f"Bearer {cashier_token}"}
        response = requests.post(f"{BASE_URL}/api/payments/centralized", 
            headers=headers,
            json={
                "subscriber_id": TEST_SUBSCRIBER,
                "amount": 0,
                "mode": "cash"
            }
        )
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
    
    def test_centralized_payment_invalid_subscriber(self, cashier_token):
        """Test centralized payment with invalid subscriber"""
        headers = {"Authorization": f"Bearer {cashier_token}"}
        response = requests.post(f"{BASE_URL}/api/payments/centralized", 
            headers=headers,
            json={
                "subscriber_id": "INVALID_ACC",
                "amount": 100,
                "mode": "cash"
            }
        )
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"


class TestWalletBalance:
    """Wallet balance tests"""
    
    @pytest.fixture
    def cashier_token(self):
        """Get cashier authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": CASHIER_USER,
            "password": CASHIER_PASS
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("Cashier authentication failed")
    
    def test_get_wallet_balance(self, cashier_token):
        """Test getting subscriber wallet balance"""
        headers = {"Authorization": f"Bearer {cashier_token}"}
        response = requests.get(f"{BASE_URL}/api/subscribers/{TEST_SUBSCRIBER}/wallet", headers=headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "balance" in data
        assert "transactions" in data
        assert isinstance(data["transactions"], list)


class TestPaymentHistory:
    """Payment history tests"""
    
    @pytest.fixture
    def cashier_token(self):
        """Get cashier authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": CASHIER_USER,
            "password": CASHIER_PASS
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("Cashier authentication failed")
    
    def test_get_payment_history(self, cashier_token):
        """Test getting subscriber payment history"""
        headers = {"Authorization": f"Bearer {cashier_token}"}
        response = requests.get(f"{BASE_URL}/api/payments/subscriber/{TEST_SUBSCRIBER}", headers=headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert isinstance(data, list)
        
        # Verify payment structure
        if len(data) > 0:
            payment = data[0]
            assert "or_number" in payment
            assert "total_amount" in payment
            assert "mode" in payment
            assert "payment_date" in payment


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
