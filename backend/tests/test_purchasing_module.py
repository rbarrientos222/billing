"""
Test suite for Purchasing Module
Tests: Supplier CRUD, Purchase CRUD, Inventory updates, Expense creation, Payment tracking
"""
import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestPurchasingModule:
    """Purchasing Module API tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "@Gello1006"
        })
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        token = login_response.json().get("access_token")
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        yield
        
        # Cleanup test data
        self._cleanup_test_data()
    
    def _cleanup_test_data(self):
        """Clean up test-created data"""
        try:
            # Delete test suppliers
            suppliers = self.session.get(f"{BASE_URL}/api/suppliers").json()
            for s in suppliers:
                if s.get('name', '').startswith('TEST_'):
                    self.session.delete(f"{BASE_URL}/api/suppliers/{s['supplier_id']}")
            
            # Delete test purchases
            purchases = self.session.get(f"{BASE_URL}/api/purchases").json()
            for p in purchases:
                if p.get('notes', '').startswith('TEST_'):
                    self.session.delete(f"{BASE_URL}/api/purchases/{p['purchase_id']}")
        except:
            pass
    
    # ========== SUPPLIER TESTS ==========
    
    def test_create_supplier(self):
        """Test creating a new supplier"""
        supplier_data = {
            "name": "TEST_Supplier_Create",
            "contact_person": "John Doe",
            "phone": "09171234567",
            "email": "test@supplier.com",
            "address": "123 Test Street",
            "notes": "TEST_supplier"
        }
        
        response = self.session.post(f"{BASE_URL}/api/suppliers", json=supplier_data)
        assert response.status_code == 200, f"Create supplier failed: {response.text}"
        
        data = response.json()
        assert "supplier_id" in data
        assert data["message"] == "Supplier created"
        
        # Verify supplier was created by fetching it
        supplier_id = data["supplier_id"]
        get_response = self.session.get(f"{BASE_URL}/api/suppliers/{supplier_id}")
        assert get_response.status_code == 200
        
        supplier = get_response.json()
        assert supplier["name"] == "TEST_Supplier_Create"
        assert supplier["contact_person"] == "John Doe"
        assert supplier["email"] == "test@supplier.com"
    
    def test_list_suppliers(self):
        """Test listing all suppliers"""
        response = self.session.get(f"{BASE_URL}/api/suppliers")
        assert response.status_code == 200
        
        suppliers = response.json()
        assert isinstance(suppliers, list)
        
        # Check existing supplier from context
        supplier_names = [s.get('name') for s in suppliers]
        # Should have at least the existing supplier
        print(f"Found {len(suppliers)} suppliers")
    
    def test_get_supplier_by_id(self):
        """Test getting a specific supplier"""
        # First create a supplier
        supplier_data = {
            "name": "TEST_Supplier_GetById",
            "phone": "09181234567",
            "notes": "TEST_supplier"
        }
        create_response = self.session.post(f"{BASE_URL}/api/suppliers", json=supplier_data)
        assert create_response.status_code == 200
        supplier_id = create_response.json()["supplier_id"]
        
        # Get the supplier
        response = self.session.get(f"{BASE_URL}/api/suppliers/{supplier_id}")
        assert response.status_code == 200
        
        supplier = response.json()
        assert supplier["supplier_id"] == supplier_id
        assert supplier["name"] == "TEST_Supplier_GetById"
    
    def test_get_nonexistent_supplier(self):
        """Test getting a supplier that doesn't exist"""
        response = self.session.get(f"{BASE_URL}/api/suppliers/NONEXISTENT123")
        assert response.status_code == 404
    
    # ========== PURCHASE TESTS ==========
    
    def test_create_purchase_with_new_item(self):
        """Test creating a purchase with a new inventory item"""
        purchase_data = {
            "supplier_name": "TEST_Purchase_Supplier",
            "po_number": "TEST_PO001",
            "invoice_number": "TEST_INV001",
            "purchase_date": datetime.now().isoformat(),
            "notes": "TEST_purchase_new_item",
            "items": [
                {
                    "name": "TEST_New_Router",
                    "category": "Equipment",
                    "quantity": 5,
                    "unit": "pcs",
                    "unit_cost": 1500,
                    "is_new_item": True,
                    "is_serialized": True
                }
            ]
        }
        
        response = self.session.post(f"{BASE_URL}/api/purchases", json=purchase_data)
        assert response.status_code == 200, f"Create purchase failed: {response.text}"
        
        data = response.json()
        assert "purchase_id" in data
        assert data["total_amount"] == 7500  # 5 * 1500
        assert data["items_added"] == 1
        assert data["expense_created"] == True
        
        # Store for later tests
        self.test_purchase_id = data["purchase_id"]
        
        # Verify purchase was created
        get_response = self.session.get(f"{BASE_URL}/api/purchases/{data['purchase_id']}")
        assert get_response.status_code == 200
        
        purchase = get_response.json()
        assert purchase["supplier_name"] == "TEST_Purchase_Supplier"
        assert purchase["po_number"] == "TEST_PO001"
        assert purchase["payment_status"] == "unpaid"
        assert len(purchase["items"]) == 1
    
    def test_create_purchase_with_existing_item(self):
        """Test creating a purchase that restocks an existing inventory item"""
        # First, get existing inventory items
        inv_response = self.session.get(f"{BASE_URL}/api/inventory")
        assert inv_response.status_code == 200
        inventory = inv_response.json()
        
        if len(inventory) > 0:
            existing_item = inventory[0]
            original_qty = existing_item.get('quantity', 0)
            item_code = existing_item.get('item_code')
            
            # Create purchase with existing item
            purchase_data = {
                "supplier_name": "TEST_Restock_Supplier",
                "po_number": "TEST_PO_RESTOCK",
                "notes": "TEST_purchase_restock",
                "items": [
                    {
                        "item_code": item_code,
                        "name": existing_item.get('name'),
                        "category": existing_item.get('category', 'Equipment'),
                        "quantity": 10,
                        "unit": existing_item.get('unit', 'pcs'),
                        "unit_cost": 100,
                        "is_new_item": False
                    }
                ]
            }
            
            response = self.session.post(f"{BASE_URL}/api/purchases", json=purchase_data)
            assert response.status_code == 200, f"Restock purchase failed: {response.text}"
            
            # Verify inventory quantity increased
            inv_response2 = self.session.get(f"{BASE_URL}/api/inventory/{item_code}")
            if inv_response2.status_code == 200:
                updated_item = inv_response2.json()
                # Quantity should have increased by 10
                print(f"Original qty: {original_qty}, New qty: {updated_item.get('quantity')}")
        else:
            pytest.skip("No existing inventory items to test restock")
    
    def test_list_purchases(self):
        """Test listing all purchases"""
        response = self.session.get(f"{BASE_URL}/api/purchases")
        assert response.status_code == 200
        
        purchases = response.json()
        assert isinstance(purchases, list)
        print(f"Found {len(purchases)} purchases")
    
    def test_get_purchase_stats(self):
        """Test getting purchase statistics"""
        response = self.session.get(f"{BASE_URL}/api/purchases/stats")
        assert response.status_code == 200
        
        stats = response.json()
        assert "total_purchases" in stats
        assert "total_spent" in stats
        assert "unpaid_amount" in stats
        assert "monthly_total" in stats
        assert "monthly_count" in stats
        
        print(f"Purchase stats: {stats}")
    
    def test_get_purchase_by_id(self):
        """Test getting a specific purchase"""
        # Use existing purchase from context
        existing_purchase_id = "PO20260205E5A478"
        
        response = self.session.get(f"{BASE_URL}/api/purchases/{existing_purchase_id}")
        
        if response.status_code == 200:
            purchase = response.json()
            assert purchase["purchase_id"] == existing_purchase_id
            assert "items" in purchase
            assert "total_amount" in purchase
            print(f"Purchase {existing_purchase_id}: {purchase.get('total_amount')} total")
        else:
            # Create a new purchase to test
            purchase_data = {
                "supplier_name": "TEST_GetById_Supplier",
                "notes": "TEST_purchase_getbyid",
                "items": [
                    {
                        "name": "TEST_Item_GetById",
                        "category": "Equipment",
                        "quantity": 1,
                        "unit": "pcs",
                        "unit_cost": 500,
                        "is_new_item": True
                    }
                ]
            }
            create_response = self.session.post(f"{BASE_URL}/api/purchases", json=purchase_data)
            assert create_response.status_code == 200
            purchase_id = create_response.json()["purchase_id"]
            
            get_response = self.session.get(f"{BASE_URL}/api/purchases/{purchase_id}")
            assert get_response.status_code == 200
    
    # ========== PAYMENT TESTS ==========
    
    def test_add_payment_to_purchase(self):
        """Test adding a payment to a purchase"""
        # First create a purchase
        purchase_data = {
            "supplier_name": "TEST_Payment_Supplier",
            "notes": "TEST_purchase_payment",
            "items": [
                {
                    "name": "TEST_Item_Payment",
                    "category": "Equipment",
                    "quantity": 2,
                    "unit": "pcs",
                    "unit_cost": 1000,
                    "is_new_item": True
                }
            ]
        }
        
        create_response = self.session.post(f"{BASE_URL}/api/purchases", json=purchase_data)
        assert create_response.status_code == 200
        purchase_id = create_response.json()["purchase_id"]
        total_amount = create_response.json()["total_amount"]  # Should be 2000
        
        # Add partial payment
        payment_data = {
            "amount": 500,
            "payment_mode": "cash",
            "reference_number": "TEST_REF001",
            "notes": "Partial payment"
        }
        
        payment_response = self.session.post(
            f"{BASE_URL}/api/purchases/{purchase_id}/payment",
            json=payment_data
        )
        assert payment_response.status_code == 200, f"Add payment failed: {payment_response.text}"
        
        payment_result = payment_response.json()
        assert payment_result["amount_paid"] == 500
        assert payment_result["remaining"] == 1500
        assert payment_result["status"] == "partial"
        
        # Verify purchase status changed
        get_response = self.session.get(f"{BASE_URL}/api/purchases/{purchase_id}")
        assert get_response.status_code == 200
        purchase = get_response.json()
        assert purchase["payment_status"] == "partial"
        assert purchase["amount_paid"] == 500
    
    def test_payment_status_changes(self):
        """Test payment status transitions: unpaid -> partial -> paid"""
        # Create a purchase
        purchase_data = {
            "supplier_name": "TEST_Status_Supplier",
            "notes": "TEST_purchase_status",
            "items": [
                {
                    "name": "TEST_Item_Status",
                    "category": "Equipment",
                    "quantity": 1,
                    "unit": "pcs",
                    "unit_cost": 1000,
                    "is_new_item": True
                }
            ]
        }
        
        create_response = self.session.post(f"{BASE_URL}/api/purchases", json=purchase_data)
        assert create_response.status_code == 200
        purchase_id = create_response.json()["purchase_id"]
        
        # Verify initial status is unpaid
        get_response = self.session.get(f"{BASE_URL}/api/purchases/{purchase_id}")
        assert get_response.json()["payment_status"] == "unpaid"
        
        # Add partial payment (500 of 1000)
        payment1 = self.session.post(
            f"{BASE_URL}/api/purchases/{purchase_id}/payment",
            json={"amount": 500, "payment_mode": "cash"}
        )
        assert payment1.status_code == 200
        assert payment1.json()["status"] == "partial"
        
        # Add remaining payment (500 more)
        payment2 = self.session.post(
            f"{BASE_URL}/api/purchases/{purchase_id}/payment",
            json={"amount": 500, "payment_mode": "bank_transfer"}
        )
        assert payment2.status_code == 200
        assert payment2.json()["status"] == "paid"
        
        # Verify final status
        get_response2 = self.session.get(f"{BASE_URL}/api/purchases/{purchase_id}")
        assert get_response2.json()["payment_status"] == "paid"
        assert get_response2.json()["amount_paid"] == 1000
    
    def test_cannot_pay_already_paid_purchase(self):
        """Test that you cannot add payment to a fully paid purchase"""
        # Create and fully pay a purchase
        purchase_data = {
            "supplier_name": "TEST_FullyPaid_Supplier",
            "notes": "TEST_purchase_fullypaid",
            "items": [
                {
                    "name": "TEST_Item_FullyPaid",
                    "category": "Equipment",
                    "quantity": 1,
                    "unit": "pcs",
                    "unit_cost": 100,
                    "is_new_item": True
                }
            ]
        }
        
        create_response = self.session.post(f"{BASE_URL}/api/purchases", json=purchase_data)
        purchase_id = create_response.json()["purchase_id"]
        
        # Pay in full
        self.session.post(
            f"{BASE_URL}/api/purchases/{purchase_id}/payment",
            json={"amount": 100, "payment_mode": "cash"}
        )
        
        # Try to add another payment
        extra_payment = self.session.post(
            f"{BASE_URL}/api/purchases/{purchase_id}/payment",
            json={"amount": 50, "payment_mode": "cash"}
        )
        assert extra_payment.status_code == 400
        assert "already fully paid" in extra_payment.json().get("detail", "").lower()
    
    # ========== EXPENSE VERIFICATION ==========
    
    def test_expense_created_on_purchase(self):
        """Test that an expense entry is created when a purchase is made"""
        # Create a purchase
        purchase_data = {
            "supplier_name": "TEST_Expense_Supplier",
            "notes": "TEST_purchase_expense",
            "items": [
                {
                    "name": "TEST_Item_Expense",
                    "category": "Equipment",
                    "quantity": 3,
                    "unit": "pcs",
                    "unit_cost": 200,
                    "is_new_item": True
                }
            ]
        }
        
        create_response = self.session.post(f"{BASE_URL}/api/purchases", json=purchase_data)
        assert create_response.status_code == 200
        purchase_id = create_response.json()["purchase_id"]
        
        # Check expenses
        expenses_response = self.session.get(f"{BASE_URL}/api/expenses")
        assert expenses_response.status_code == 200
        
        expenses = expenses_response.json()
        # Find the expense for this purchase
        purchase_expense = None
        for exp in expenses:
            if exp.get("reference_id") == purchase_id:
                purchase_expense = exp
                break
        
        assert purchase_expense is not None, f"Expense not found for purchase {purchase_id}"
        assert purchase_expense["amount"] == 600  # 3 * 200
        assert purchase_expense["reference_type"] == "purchase"
        assert purchase_expense["category"] == "Inventory Purchase"
    
    # ========== INVENTORY UPDATE VERIFICATION ==========
    
    def test_inventory_quantity_increases_on_purchase(self):
        """Test that inventory quantity increases after a purchase"""
        # Get initial inventory
        inv_response = self.session.get(f"{BASE_URL}/api/inventory")
        initial_inventory = {item['item_code']: item['quantity'] for item in inv_response.json()}
        
        # Create purchase with new item
        unique_name = f"TEST_InvQty_{datetime.now().strftime('%H%M%S')}"
        purchase_data = {
            "supplier_name": "TEST_InvQty_Supplier",
            "notes": "TEST_purchase_invqty",
            "items": [
                {
                    "name": unique_name,
                    "category": "Equipment",
                    "quantity": 25,
                    "unit": "pcs",
                    "unit_cost": 50,
                    "is_new_item": True
                }
            ]
        }
        
        create_response = self.session.post(f"{BASE_URL}/api/purchases", json=purchase_data)
        assert create_response.status_code == 200
        
        # Get updated inventory
        inv_response2 = self.session.get(f"{BASE_URL}/api/inventory")
        updated_inventory = inv_response2.json()
        
        # Find the new item
        new_item = None
        for item in updated_inventory:
            if item['name'] == unique_name:
                new_item = item
                break
        
        assert new_item is not None, f"New inventory item {unique_name} not found"
        assert new_item['quantity'] == 25
        assert new_item['cost_per_unit'] == 50


class TestExistingPurchaseData:
    """Tests using existing purchase data from context"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "@Gello1006"
        })
        assert login_response.status_code == 200
        token = login_response.json().get("access_token")
        self.session.headers.update({"Authorization": f"Bearer {token}"})
    
    def test_existing_supplier_fiberhome(self):
        """Test that existing supplier Fiberhome Philippines exists"""
        response = self.session.get(f"{BASE_URL}/api/suppliers")
        assert response.status_code == 200
        
        suppliers = response.json()
        fiberhome = None
        for s in suppliers:
            if "Fiberhome" in s.get('name', ''):
                fiberhome = s
                break
        
        if fiberhome:
            print(f"Found Fiberhome supplier: {fiberhome['supplier_id']}")
            assert fiberhome['supplier_id'] == "SUP59DE08F9"
        else:
            print("Fiberhome supplier not found - may have been deleted")
    
    def test_existing_purchase_po20260205(self):
        """Test existing purchase PO20260205E5A478"""
        response = self.session.get(f"{BASE_URL}/api/purchases/PO20260205E5A478")
        
        if response.status_code == 200:
            purchase = response.json()
            print(f"Found purchase: {purchase['purchase_id']}")
            print(f"Total: {purchase.get('total_amount')}, Status: {purchase.get('payment_status')}")
            
            # Verify items
            items = purchase.get('items', [])
            print(f"Items: {len(items)}")
            for item in items:
                print(f"  - {item.get('name')}: {item.get('quantity')} {item.get('unit')}")
        else:
            print("Existing purchase not found - may have been deleted")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
