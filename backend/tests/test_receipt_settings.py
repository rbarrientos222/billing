"""
Receipt Settings API Tests
Tests for the receipt printing feature in ISP Billing System
- Receipt settings GET/POST endpoints
- Receipt data retrieval for printing
- Receipt preview endpoint
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


class TestAuthentication:
    """Test authentication for receipt endpoints"""
    
    def test_admin_login(self):
        """Test admin login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": ADMIN_USER,
            "password": ADMIN_PASS
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert data["role"] == "admin"
        pytest.admin_token = data["access_token"]
        print(f"✓ Admin login successful")
    
    def test_cashier_login(self):
        """Test cashier login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": CASHIER_USER,
            "password": CASHIER_PASS
        })
        if response.status_code == 200:
            data = response.json()
            pytest.cashier_token = data["access_token"]
            print(f"✓ Cashier login successful")
        else:
            # Create cashier user if not exists
            admin_response = requests.post(f"{BASE_URL}/api/auth/login", json={
                "username": ADMIN_USER,
                "password": ADMIN_PASS
            })
            admin_token = admin_response.json()["access_token"]
            create_response = requests.post(
                f"{BASE_URL}/api/users",
                json={
                    "username": CASHIER_USER,
                    "full_name": "Test Cashier",
                    "role": "cashier",
                    "password": CASHIER_PASS
                },
                headers={"Authorization": f"Bearer {admin_token}"}
            )
            if create_response.status_code in [200, 400]:  # 400 if already exists
                login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
                    "username": CASHIER_USER,
                    "password": CASHIER_PASS
                })
                if login_response.status_code == 200:
                    pytest.cashier_token = login_response.json()["access_token"]
                    print(f"✓ Cashier created and login successful")
                else:
                    pytest.skip("Could not create/login cashier")


class TestReceiptSettingsAPI:
    """Test receipt settings CRUD operations"""
    
    def test_get_receipt_settings_empty(self):
        """GET /api/settings/receipt - should return empty or existing settings"""
        response = requests.get(
            f"{BASE_URL}/api/settings/receipt",
            headers={"Authorization": f"Bearer {pytest.admin_token}"}
        )
        assert response.status_code == 200, f"Failed to get receipt settings: {response.text}"
        data = response.json()
        # Should return either empty object or existing settings
        assert isinstance(data, dict)
        print(f"✓ GET receipt settings returned: {len(data)} fields")
    
    def test_save_receipt_settings(self):
        """POST /api/settings/receipt - save receipt settings"""
        settings = {
            "company_name": "TEST ISP Company",
            "company_address": "123 Test Street, Test City",
            "company_mobile": "09123456789",
            "company_email": "test@testisp.com",
            "tin_number": "123-456-789-000",
            "vat_registered": True,
            "vat_percentage": 12.0,
            "footer_text": "Thank you for your payment!",
            "receipt_title": "SERVICE INVOICE",
            "or_prefix": "OR",
            "paper_width": 48,
            "auto_print": False
        }
        
        response = requests.post(
            f"{BASE_URL}/api/settings/receipt",
            json=settings,
            headers={"Authorization": f"Bearer {pytest.admin_token}"}
        )
        assert response.status_code == 200, f"Failed to save receipt settings: {response.text}"
        data = response.json()
        assert data.get("message") == "Receipt settings saved"
        print(f"✓ Receipt settings saved successfully")
    
    def test_verify_saved_settings(self):
        """Verify settings were persisted correctly"""
        response = requests.get(
            f"{BASE_URL}/api/settings/receipt",
            headers={"Authorization": f"Bearer {pytest.admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify saved values
        assert data.get("company_name") == "TEST ISP Company"
        assert data.get("company_address") == "123 Test Street, Test City"
        assert data.get("company_mobile") == "09123456789"
        assert data.get("tin_number") == "123-456-789-000"
        assert data.get("vat_registered") == True
        assert data.get("vat_percentage") == 12.0
        assert data.get("receipt_title") == "SERVICE INVOICE"
        assert data.get("or_prefix") == "OR"
        assert data.get("paper_width") == 48
        assert data.get("auto_print") == False
        print(f"✓ All receipt settings verified correctly")
    
    def test_update_receipt_settings(self):
        """Update receipt settings with different values"""
        settings = {
            "company_name": "Updated ISP Company",
            "company_address": "456 Updated Street",
            "company_mobile": "09987654321",
            "company_email": "updated@isp.com",
            "tin_number": "999-888-777-666",
            "vat_registered": False,
            "vat_percentage": 0,
            "footer_text": "Thanks!",
            "receipt_title": "OFFICIAL RECEIPT",
            "or_prefix": "SI",
            "paper_width": 58,
            "auto_print": True
        }
        
        response = requests.post(
            f"{BASE_URL}/api/settings/receipt",
            json=settings,
            headers={"Authorization": f"Bearer {pytest.admin_token}"}
        )
        assert response.status_code == 200
        
        # Verify update
        get_response = requests.get(
            f"{BASE_URL}/api/settings/receipt",
            headers={"Authorization": f"Bearer {pytest.admin_token}"}
        )
        data = get_response.json()
        assert data.get("company_name") == "Updated ISP Company"
        assert data.get("or_prefix") == "SI"
        assert data.get("paper_width") == 58
        assert data.get("auto_print") == True
        print(f"✓ Receipt settings updated and verified")


class TestReceiptPreview:
    """Test receipt preview endpoint"""
    
    def test_get_receipt_preview(self):
        """GET /api/receipt/preview - returns sample data for preview"""
        response = requests.get(
            f"{BASE_URL}/api/receipt/preview",
            headers={"Authorization": f"Bearer {pytest.admin_token}"}
        )
        assert response.status_code == 200, f"Failed to get preview: {response.text}"
        data = response.json()
        
        # Should have settings and sample_payment
        assert "settings" in data
        assert "sample_payment" in data
        
        sample = data["sample_payment"]
        assert "or_number" in sample
        assert "subscriber_name" in sample
        assert "account_number" in sample
        assert "total_amount" in sample
        assert "mode" in sample
        assert "received_by" in sample
        print(f"✓ Receipt preview data received: OR# {sample.get('or_number')}")


class TestReceiptDataRetrieval:
    """Test receipt data retrieval for printing"""
    
    @pytest.fixture(autouse=True)
    def setup_test_payment(self):
        """Ensure we have a test payment to retrieve"""
        # First check if there are any payments
        response = requests.get(
            f"{BASE_URL}/api/payments",
            headers={"Authorization": f"Bearer {pytest.admin_token}"}
        )
        if response.status_code == 200:
            payments = response.json()
            if payments and len(payments) > 0:
                pytest.test_or_number = payments[0].get('or_number')
                return
        pytest.test_or_number = None
    
    def test_get_receipt_data_admin(self):
        """GET /api/receipt/data/{or_number} - admin access"""
        if not getattr(pytest, 'test_or_number', None):
            pytest.skip("No payment found to test receipt data")
        
        response = requests.get(
            f"{BASE_URL}/api/receipt/data/{pytest.test_or_number}",
            headers={"Authorization": f"Bearer {pytest.admin_token}"}
        )
        assert response.status_code == 200, f"Failed to get receipt data: {response.text}"
        data = response.json()
        
        # Should have settings and payment
        assert "settings" in data
        assert "payment" in data
        
        payment = data["payment"]
        assert "or_number" in payment
        assert "subscriber_name" in payment
        assert "total_amount" in payment
        assert "mode" in payment
        print(f"✓ Receipt data retrieved for OR# {pytest.test_or_number}")
    
    def test_get_receipt_data_cashier(self):
        """GET /api/receipt/data/{or_number} - cashier access"""
        if not getattr(pytest, 'test_or_number', None):
            pytest.skip("No payment found to test receipt data")
        if not getattr(pytest, 'cashier_token', None):
            pytest.skip("Cashier not available")
        
        response = requests.get(
            f"{BASE_URL}/api/receipt/data/{pytest.test_or_number}",
            headers={"Authorization": f"Bearer {pytest.cashier_token}"}
        )
        assert response.status_code == 200, f"Cashier should be able to access receipt data: {response.text}"
        print(f"✓ Cashier can access receipt data")
    
    def test_get_receipt_data_not_found(self):
        """GET /api/receipt/data/{or_number} - non-existent OR number"""
        response = requests.get(
            f"{BASE_URL}/api/receipt/data/NONEXISTENT999",
            headers={"Authorization": f"Bearer {pytest.admin_token}"}
        )
        assert response.status_code == 404, f"Should return 404 for non-existent payment: {response.text}"
        print(f"✓ Correctly returns 404 for non-existent payment")


class TestAccessControl:
    """Test access control for receipt endpoints"""
    
    def test_receipt_settings_requires_auth(self):
        """Receipt settings require authentication"""
        response = requests.get(f"{BASE_URL}/api/settings/receipt")
        assert response.status_code == 403 or response.status_code == 401
        print(f"✓ Receipt settings require authentication")
    
    def test_save_settings_requires_admin(self):
        """Saving receipt settings requires admin role"""
        if not getattr(pytest, 'cashier_token', None):
            pytest.skip("Cashier not available")
        
        response = requests.post(
            f"{BASE_URL}/api/settings/receipt",
            json={"company_name": "Should Fail"},
            headers={"Authorization": f"Bearer {pytest.cashier_token}"}
        )
        assert response.status_code == 403, f"Cashier should not be able to save settings: {response.text}"
        print(f"✓ Only admin can save receipt settings")


class TestCleanup:
    """Restore default receipt settings"""
    
    def test_restore_default_settings(self):
        """Restore settings to reasonable defaults"""
        settings = {
            "company_name": "",
            "company_address": "",
            "company_mobile": "",
            "company_email": "",
            "tin_number": "",
            "vat_registered": False,
            "vat_percentage": 12.0,
            "footer_text": "Thank you for your payment!",
            "receipt_title": "SERVICE INVOICE",
            "or_prefix": "OR",
            "paper_width": 48,
            "auto_print": False
        }
        
        response = requests.post(
            f"{BASE_URL}/api/settings/receipt",
            json=settings,
            headers={"Authorization": f"Bearer {pytest.admin_token}"}
        )
        assert response.status_code == 200
        print(f"✓ Receipt settings restored to defaults")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
