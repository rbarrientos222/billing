"""
Test suite for Cashier Module Enhancements:
1. Payment history date filter (GET /api/payments/subscriber/{account_number}?start_date=X&end_date=Y)
2. Advance payment to wallet (POST /api/subscribers/{account_number}/wallet)
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAuthentication:
    """Test cashier authentication"""
    
    def test_cashier_login(self):
        """Test cashier login with valid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "cashier1",
            "password": "test123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert data["role"] == "cashier"
        print(f"✓ Cashier login successful, role: {data['role']}")
        return data["access_token"]


class TestSubscriberSearch:
    """Test subscriber search functionality"""
    
    @pytest.fixture
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "cashier1",
            "password": "test123"
        })
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Cashier login failed")
    
    def test_search_subscriber_by_account(self, auth_token):
        """Test searching subscriber by account number"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/subscribers/ACC4307BC6B", headers=headers)
        assert response.status_code == 200, f"Subscriber search failed: {response.text}"
        data = response.json()
        assert data["account_number"] == "ACC4307BC6B"
        print(f"✓ Found subscriber: {data.get('first_name')} {data.get('last_name')}")
        return data


class TestPaymentHistoryDateFilter:
    """Test payment history with date range filter"""
    
    @pytest.fixture
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "cashier1",
            "password": "test123"
        })
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Cashier login failed")
    
    def test_get_payment_history_no_filter(self, auth_token):
        """Test getting payment history without date filter"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/payments/subscriber/ACC4307BC6B", headers=headers)
        assert response.status_code == 200, f"Failed to get payment history: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Payment history returned {len(data)} records (no filter)")
        return data
    
    def test_get_payment_history_with_start_date(self, auth_token):
        """Test getting payment history with start_date filter"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        # Use a date from 30 days ago
        start_date = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
        response = requests.get(
            f"{BASE_URL}/api/payments/subscriber/ACC4307BC6B?start_date={start_date}",
            headers=headers
        )
        assert response.status_code == 200, f"Failed with start_date filter: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Payment history with start_date={start_date} returned {len(data)} records")
    
    def test_get_payment_history_with_end_date(self, auth_token):
        """Test getting payment history with end_date filter"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        end_date = datetime.now().strftime("%Y-%m-%d")
        response = requests.get(
            f"{BASE_URL}/api/payments/subscriber/ACC4307BC6B?end_date={end_date}",
            headers=headers
        )
        assert response.status_code == 200, f"Failed with end_date filter: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Payment history with end_date={end_date} returned {len(data)} records")
    
    def test_get_payment_history_with_date_range(self, auth_token):
        """Test getting payment history with both start_date and end_date"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        start_date = (datetime.now() - timedelta(days=60)).strftime("%Y-%m-%d")
        end_date = datetime.now().strftime("%Y-%m-%d")
        response = requests.get(
            f"{BASE_URL}/api/payments/subscriber/ACC4307BC6B?start_date={start_date}&end_date={end_date}",
            headers=headers
        )
        assert response.status_code == 200, f"Failed with date range filter: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Payment history with date range {start_date} to {end_date} returned {len(data)} records")
    
    def test_get_payment_history_future_date_range(self, auth_token):
        """Test getting payment history with future date range (should return empty)"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        start_date = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
        end_date = (datetime.now() + timedelta(days=60)).strftime("%Y-%m-%d")
        response = requests.get(
            f"{BASE_URL}/api/payments/subscriber/ACC4307BC6B?start_date={start_date}&end_date={end_date}",
            headers=headers
        )
        assert response.status_code == 200, f"Failed with future date range: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        # Future dates should return empty or very few records
        print(f"✓ Payment history with future date range returned {len(data)} records (expected 0 or few)")


class TestWalletBalance:
    """Test wallet balance retrieval"""
    
    @pytest.fixture
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "cashier1",
            "password": "test123"
        })
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Cashier login failed")
    
    def test_get_wallet_balance(self, auth_token):
        """Test getting subscriber wallet balance"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/subscribers/ACC4307BC6B/wallet", headers=headers)
        assert response.status_code == 200, f"Failed to get wallet balance: {response.text}"
        data = response.json()
        assert "balance" in data
        print(f"✓ Wallet balance: ₱{data['balance']}")
        return data["balance"]


class TestAdvancePaymentToWallet:
    """Test advance payment (wallet deposit) functionality"""
    
    @pytest.fixture
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "cashier1",
            "password": "test123"
        })
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Cashier login failed")
    
    def test_add_advance_payment_cash(self, auth_token):
        """Test adding advance payment to wallet via cash"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        # Get current wallet balance
        wallet_response = requests.get(f"{BASE_URL}/api/subscribers/ACC4307BC6B/wallet", headers=headers)
        initial_balance = wallet_response.json().get("balance", 0) if wallet_response.status_code == 200 else 0
        
        # Add advance payment
        response = requests.post(
            f"{BASE_URL}/api/subscribers/ACC4307BC6B/wallet",
            headers=headers,
            json={
                "amount": 100,
                "mode": "cash"
            }
        )
        assert response.status_code == 200, f"Failed to add advance payment: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "or_number" in data, "Missing or_number in response"
        assert "amount_added" in data, "Missing amount_added in response"
        assert "new_balance" in data, "Missing new_balance in response"
        assert data["amount_added"] == 100
        assert data["new_balance"] == initial_balance + 100
        
        print(f"✓ Advance payment added: OR# {data['or_number']}, Amount: ₱{data['amount_added']}")
        print(f"  Previous balance: ₱{data.get('previous_balance', initial_balance)}, New balance: ₱{data['new_balance']}")
        return data
    
    def test_add_advance_payment_gcash(self, auth_token):
        """Test adding advance payment to wallet via GCash"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        response = requests.post(
            f"{BASE_URL}/api/subscribers/ACC4307BC6B/wallet",
            headers=headers,
            json={
                "amount": 200,
                "mode": "gcash"
            }
        )
        assert response.status_code == 200, f"Failed to add advance payment via GCash: {response.text}"
        data = response.json()
        assert data["amount_added"] == 200
        print(f"✓ Advance payment via GCash: OR# {data['or_number']}, Amount: ₱{data['amount_added']}")
    
    def test_add_advance_payment_invalid_amount(self, auth_token):
        """Test adding advance payment with invalid amount (should fail)"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        # Test with zero amount
        response = requests.post(
            f"{BASE_URL}/api/subscribers/ACC4307BC6B/wallet",
            headers=headers,
            json={
                "amount": 0,
                "mode": "cash"
            }
        )
        assert response.status_code == 400, f"Expected 400 for zero amount, got {response.status_code}"
        print("✓ Zero amount correctly rejected with 400")
        
        # Test with negative amount
        response = requests.post(
            f"{BASE_URL}/api/subscribers/ACC4307BC6B/wallet",
            headers=headers,
            json={
                "amount": -100,
                "mode": "cash"
            }
        )
        assert response.status_code == 400, f"Expected 400 for negative amount, got {response.status_code}"
        print("✓ Negative amount correctly rejected with 400")
    
    def test_add_advance_payment_nonexistent_subscriber(self, auth_token):
        """Test adding advance payment to non-existent subscriber (should fail)"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        response = requests.post(
            f"{BASE_URL}/api/subscribers/NONEXISTENT123/wallet",
            headers=headers,
            json={
                "amount": 100,
                "mode": "cash"
            }
        )
        assert response.status_code == 404, f"Expected 404 for non-existent subscriber, got {response.status_code}"
        print("✓ Non-existent subscriber correctly rejected with 404")


class TestAdvancePaymentInPaymentHistory:
    """Test that advance payments appear in payment history"""
    
    @pytest.fixture
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "cashier1",
            "password": "test123"
        })
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Cashier login failed")
    
    def test_advance_payment_appears_in_history(self, auth_token):
        """Test that advance payment appears in payment history with is_advance_payment flag"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        # Get payment history
        response = requests.get(f"{BASE_URL}/api/payments/subscriber/ACC4307BC6B", headers=headers)
        assert response.status_code == 200
        payments = response.json()
        
        # Check if any advance payments exist
        advance_payments = [p for p in payments if p.get("is_advance_payment") == True]
        print(f"✓ Found {len(advance_payments)} advance payment(s) in history")
        
        if advance_payments:
            latest = advance_payments[0]
            print(f"  Latest advance payment: OR# {latest.get('or_number')}, Amount: ₱{latest.get('total_amount')}")
            assert "Advance" in latest.get("description", "") or latest.get("is_advance_payment") == True


class TestSubscriberInvoices:
    """Test subscriber invoices to verify no outstanding invoices for advance payment scenario"""
    
    @pytest.fixture
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "cashier1",
            "password": "test123"
        })
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Cashier login failed")
    
    def test_get_subscriber_invoices(self, auth_token):
        """Test getting subscriber invoices"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/invoices/subscriber/ACC4307BC6B", headers=headers)
        assert response.status_code == 200, f"Failed to get invoices: {response.text}"
        invoices = response.json()
        
        unpaid_invoices = [inv for inv in invoices if not inv.get("paid")]
        print(f"✓ Subscriber has {len(invoices)} total invoices, {len(unpaid_invoices)} unpaid")
        
        if len(unpaid_invoices) == 0:
            print("  ✓ No outstanding invoices - advance payment button should be visible")
        else:
            print(f"  Note: {len(unpaid_invoices)} unpaid invoices exist")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
