"""
Expense Module Backend Tests
Tests for: Expenses CRUD, Expense Categories, Stats, Filters
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAuthentication:
    """Test admin authentication for expense module access"""
    
    def test_admin_login(self):
        """Test admin login to get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "@Gello1006"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert data["role"] == "admin"
        return data["access_token"]


@pytest.fixture(scope="module")
def admin_token():
    """Get admin auth token for all tests"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "username": "admin",
        "password": "@Gello1006"
    })
    if response.status_code == 200:
        return response.json()["access_token"]
    pytest.skip("Admin authentication failed")


@pytest.fixture(scope="module")
def auth_headers(admin_token):
    """Auth headers for API requests"""
    return {"Authorization": f"Bearer {admin_token}"}


class TestExpenseCategories:
    """Test expense categories CRUD operations"""
    
    def test_get_expense_categories(self, auth_headers):
        """Test fetching expense categories - should include preset categories"""
        response = requests.get(f"{BASE_URL}/api/expense-categories", headers=auth_headers)
        assert response.status_code == 200, f"Failed to get categories: {response.text}"
        categories = response.json()
        assert isinstance(categories, list)
        assert len(categories) >= 8, "Should have at least 8 preset categories"
        
        # Verify preset categories exist
        category_names = [c['name'] for c in categories]
        expected_presets = ['Utilities', 'Salaries', 'Supplies', 'Maintenance', 'Fuel', 'Internet', 'Rent', 'Purchase']
        for preset in expected_presets:
            assert preset in category_names, f"Missing preset category: {preset}"
        
        # Verify preset flag
        for cat in categories:
            if cat['name'] in expected_presets:
                assert cat.get('is_preset') == True, f"Category {cat['name']} should be marked as preset"
    
    def test_create_custom_category(self, auth_headers):
        """Test creating a custom expense category"""
        category_data = {
            "name": "TEST_Transportation",
            "description": "Vehicle and travel expenses"
        }
        response = requests.post(f"{BASE_URL}/api/expense-categories", 
                                 headers=auth_headers, json=category_data)
        assert response.status_code == 200, f"Failed to create category: {response.text}"
        data = response.json()
        assert "category_id" in data
        
        # Verify category was created
        get_response = requests.get(f"{BASE_URL}/api/expense-categories", headers=auth_headers)
        categories = get_response.json()
        category_names = [c['name'] for c in categories]
        assert "TEST_Transportation" in category_names
        
        # Verify it's not marked as preset
        for cat in categories:
            if cat['name'] == "TEST_Transportation":
                assert cat.get('is_preset') == False, "Custom category should not be preset"
                return cat['category_id']
    
    def test_create_duplicate_category_fails(self, auth_headers):
        """Test that creating duplicate category fails"""
        category_data = {
            "name": "Utilities",  # Already exists as preset
            "description": "Duplicate test"
        }
        response = requests.post(f"{BASE_URL}/api/expense-categories", 
                                 headers=auth_headers, json=category_data)
        assert response.status_code == 400, "Should fail for duplicate category"
    
    def test_delete_preset_category_fails(self, auth_headers):
        """Test that preset categories cannot be deleted"""
        # Get a preset category ID
        response = requests.get(f"{BASE_URL}/api/expense-categories", headers=auth_headers)
        categories = response.json()
        preset_cat = next((c for c in categories if c.get('is_preset')), None)
        assert preset_cat is not None, "No preset category found"
        
        # Try to delete it
        delete_response = requests.delete(
            f"{BASE_URL}/api/expense-categories/{preset_cat['category_id']}", 
            headers=auth_headers
        )
        assert delete_response.status_code == 400, "Should not allow deleting preset categories"
        assert "preset" in delete_response.json().get('detail', '').lower()
    
    def test_delete_custom_category(self, auth_headers):
        """Test deleting a custom category"""
        # First create a category to delete
        category_data = {
            "name": "TEST_ToDelete",
            "description": "Will be deleted"
        }
        create_response = requests.post(f"{BASE_URL}/api/expense-categories", 
                                        headers=auth_headers, json=category_data)
        assert create_response.status_code == 200
        category_id = create_response.json()['category_id']
        
        # Delete it
        delete_response = requests.delete(
            f"{BASE_URL}/api/expense-categories/{category_id}", 
            headers=auth_headers
        )
        assert delete_response.status_code == 200, f"Failed to delete category: {delete_response.text}"
        
        # Verify it's gone
        get_response = requests.get(f"{BASE_URL}/api/expense-categories", headers=auth_headers)
        categories = get_response.json()
        category_names = [c['name'] for c in categories]
        assert "TEST_ToDelete" not in category_names


class TestExpensesCRUD:
    """Test expenses CRUD operations"""
    
    def test_get_expenses(self, auth_headers):
        """Test fetching all expenses"""
        response = requests.get(f"{BASE_URL}/api/expenses", headers=auth_headers)
        assert response.status_code == 200, f"Failed to get expenses: {response.text}"
        expenses = response.json()
        assert isinstance(expenses, list)
        # Should have existing expenses (9 from purchases + 1 manual)
        assert len(expenses) >= 1, "Should have at least 1 expense"
    
    def test_create_expense(self, auth_headers):
        """Test creating a new expense"""
        expense_data = {
            "category": "Utilities",
            "description": "TEST_Electric bill for January",
            "amount": 5000.00,
            "expense_date": datetime.now().isoformat(),
            "reference_number": "MERALCO-2026-001",
            "is_recurring": True,
            "recurring_type": "monthly"
        }
        response = requests.post(f"{BASE_URL}/api/expenses", 
                                 headers=auth_headers, json=expense_data)
        assert response.status_code == 200, f"Failed to create expense: {response.text}"
        data = response.json()
        assert "expense_id" in data
        
        # Verify expense was created
        get_response = requests.get(f"{BASE_URL}/api/expenses", headers=auth_headers)
        expenses = get_response.json()
        created_expense = next((e for e in expenses if e.get('expense_id') == data['expense_id']), None)
        assert created_expense is not None, "Created expense not found"
        assert created_expense['category'] == "Utilities"
        assert created_expense['amount'] == 5000.00
        assert created_expense['is_recurring'] == True
        assert created_expense['recurring_type'] == "monthly"
        return data['expense_id']
    
    def test_create_non_recurring_expense(self, auth_headers):
        """Test creating a non-recurring expense"""
        expense_data = {
            "category": "Supplies",
            "description": "TEST_Office supplies purchase",
            "amount": 1500.00,
            "expense_date": datetime.now().isoformat(),
            "reference_number": "SUP-2026-001",
            "is_recurring": False
        }
        response = requests.post(f"{BASE_URL}/api/expenses", 
                                 headers=auth_headers, json=expense_data)
        assert response.status_code == 200, f"Failed to create expense: {response.text}"
        data = response.json()
        assert "expense_id" in data
        return data['expense_id']
    
    def test_update_expense(self, auth_headers):
        """Test updating an expense"""
        # First create an expense to update
        expense_data = {
            "category": "Maintenance",
            "description": "TEST_Equipment repair",
            "amount": 2000.00,
            "expense_date": datetime.now().isoformat(),
            "is_recurring": False
        }
        create_response = requests.post(f"{BASE_URL}/api/expenses", 
                                        headers=auth_headers, json=expense_data)
        assert create_response.status_code == 200
        expense_id = create_response.json()['expense_id']
        
        # Update it
        update_data = {
            "description": "TEST_Equipment repair - updated",
            "amount": 2500.00,
            "is_recurring": True,
            "recurring_type": "monthly"
        }
        update_response = requests.put(
            f"{BASE_URL}/api/expenses/{expense_id}", 
            headers=auth_headers, json=update_data
        )
        assert update_response.status_code == 200, f"Failed to update expense: {update_response.text}"
        
        # Verify update
        get_response = requests.get(f"{BASE_URL}/api/expenses", headers=auth_headers)
        expenses = get_response.json()
        updated_expense = next((e for e in expenses if e.get('expense_id') == expense_id), None)
        assert updated_expense is not None
        assert updated_expense['description'] == "TEST_Equipment repair - updated"
        assert updated_expense['amount'] == 2500.00
        assert updated_expense['is_recurring'] == True
        return expense_id
    
    def test_delete_expense(self, auth_headers):
        """Test deleting an expense"""
        # First create an expense to delete
        expense_data = {
            "category": "Fuel",
            "description": "TEST_Gas for vehicle - to delete",
            "amount": 500.00,
            "expense_date": datetime.now().isoformat(),
            "is_recurring": False
        }
        create_response = requests.post(f"{BASE_URL}/api/expenses", 
                                        headers=auth_headers, json=expense_data)
        assert create_response.status_code == 200
        expense_id = create_response.json()['expense_id']
        
        # Delete it
        delete_response = requests.delete(
            f"{BASE_URL}/api/expenses/{expense_id}", 
            headers=auth_headers
        )
        assert delete_response.status_code == 200, f"Failed to delete expense: {delete_response.text}"
        
        # Verify it's gone
        get_response = requests.get(f"{BASE_URL}/api/expenses", headers=auth_headers)
        expenses = get_response.json()
        deleted_expense = next((e for e in expenses if e.get('expense_id') == expense_id), None)
        assert deleted_expense is None, "Expense should be deleted"


class TestPurchaseLinkedExpenses:
    """Test purchase-linked expense restrictions"""
    
    def test_cannot_edit_purchase_linked_expense(self, auth_headers):
        """Test that purchase-linked expenses cannot be edited"""
        # Get expenses and find a purchase-linked one
        response = requests.get(f"{BASE_URL}/api/expenses", headers=auth_headers)
        expenses = response.json()
        purchase_expense = next((e for e in expenses if e.get('reference_type') == 'purchase'), None)
        
        if purchase_expense is None:
            pytest.skip("No purchase-linked expenses found")
        
        # Try to update it
        update_data = {"description": "Trying to edit purchase expense"}
        update_response = requests.put(
            f"{BASE_URL}/api/expenses/{purchase_expense['expense_id']}", 
            headers=auth_headers, json=update_data
        )
        assert update_response.status_code == 400, "Should not allow editing purchase-linked expenses"
        assert "purchase" in update_response.json().get('detail', '').lower()
    
    def test_cannot_delete_purchase_linked_expense(self, auth_headers):
        """Test that purchase-linked expenses cannot be deleted"""
        # Get expenses and find a purchase-linked one
        response = requests.get(f"{BASE_URL}/api/expenses", headers=auth_headers)
        expenses = response.json()
        purchase_expense = next((e for e in expenses if e.get('reference_type') == 'purchase'), None)
        
        if purchase_expense is None:
            pytest.skip("No purchase-linked expenses found")
        
        # Try to delete it
        delete_response = requests.delete(
            f"{BASE_URL}/api/expenses/{purchase_expense['expense_id']}", 
            headers=auth_headers
        )
        assert delete_response.status_code == 400, "Should not allow deleting purchase-linked expenses"
        assert "purchase" in delete_response.json().get('detail', '').lower()


class TestExpenseFilters:
    """Test expense filtering functionality"""
    
    def test_filter_by_category(self, auth_headers):
        """Test filtering expenses by category"""
        response = requests.get(f"{BASE_URL}/api/expenses?category=Utilities", headers=auth_headers)
        assert response.status_code == 200
        expenses = response.json()
        for expense in expenses:
            assert expense['category'] == "Utilities", f"Expected Utilities, got {expense['category']}"
    
    def test_filter_by_recurring(self, auth_headers):
        """Test filtering recurring expenses"""
        response = requests.get(f"{BASE_URL}/api/expenses?is_recurring=true", headers=auth_headers)
        assert response.status_code == 200
        expenses = response.json()
        for expense in expenses:
            assert expense.get('is_recurring') == True, "Expected only recurring expenses"
    
    def test_filter_by_non_recurring(self, auth_headers):
        """Test filtering non-recurring expenses"""
        response = requests.get(f"{BASE_URL}/api/expenses?is_recurring=false", headers=auth_headers)
        assert response.status_code == 200
        expenses = response.json()
        for expense in expenses:
            assert expense.get('is_recurring') in [False, None], "Expected only non-recurring expenses"
    
    def test_filter_by_date_range(self, auth_headers):
        """Test filtering expenses by date range"""
        # Get expenses from last 30 days
        end_date = datetime.now()
        start_date = end_date - timedelta(days=30)
        
        response = requests.get(
            f"{BASE_URL}/api/expenses?start_date={start_date.isoformat()}&end_date={end_date.isoformat()}", 
            headers=auth_headers
        )
        assert response.status_code == 200
        expenses = response.json()
        # Just verify the filter works without errors
        assert isinstance(expenses, list)


class TestExpenseStats:
    """Test expense statistics endpoint"""
    
    def test_get_expense_stats(self, auth_headers):
        """Test fetching expense statistics"""
        response = requests.get(f"{BASE_URL}/api/expenses/stats", headers=auth_headers)
        assert response.status_code == 200, f"Failed to get stats: {response.text}"
        stats = response.json()
        
        # Verify all expected fields are present
        assert "total_expenses" in stats, "Missing total_expenses"
        assert "monthly_expenses" in stats, "Missing monthly_expenses"
        assert "recurring_total" in stats, "Missing recurring_total"
        assert "recurring_count" in stats, "Missing recurring_count"
        assert "categories_count" in stats, "Missing categories_count"
        
        # Verify data types
        assert isinstance(stats['total_expenses'], (int, float))
        assert isinstance(stats['monthly_expenses'], (int, float))
        assert isinstance(stats['recurring_count'], int)
        assert isinstance(stats['categories_count'], int)
        
        # Verify values are non-negative
        assert stats['total_expenses'] >= 0
        assert stats['monthly_expenses'] >= 0
        assert stats['recurring_count'] >= 0
        assert stats['categories_count'] >= 0


class TestAccessControl:
    """Test access control for expense endpoints"""
    
    def test_unauthorized_access_denied(self):
        """Test that unauthorized requests are denied"""
        response = requests.get(f"{BASE_URL}/api/expenses")
        assert response.status_code in [401, 403], "Should deny unauthorized access"
    
    def test_invalid_token_denied(self):
        """Test that invalid tokens are denied"""
        headers = {"Authorization": "Bearer invalid_token_12345"}
        response = requests.get(f"{BASE_URL}/api/expenses", headers=headers)
        assert response.status_code in [401, 403], "Should deny invalid token"


class TestCleanup:
    """Cleanup test data"""
    
    def test_cleanup_test_expenses(self, auth_headers):
        """Clean up TEST_ prefixed expenses"""
        response = requests.get(f"{BASE_URL}/api/expenses", headers=auth_headers)
        expenses = response.json()
        
        for expense in expenses:
            if expense.get('description', '').startswith('TEST_'):
                delete_response = requests.delete(
                    f"{BASE_URL}/api/expenses/{expense['expense_id']}", 
                    headers=auth_headers
                )
                print(f"Cleaned up expense: {expense['expense_id']}")
    
    def test_cleanup_test_categories(self, auth_headers):
        """Clean up TEST_ prefixed categories"""
        response = requests.get(f"{BASE_URL}/api/expense-categories", headers=auth_headers)
        categories = response.json()
        
        for cat in categories:
            if cat.get('name', '').startswith('TEST_'):
                delete_response = requests.delete(
                    f"{BASE_URL}/api/expense-categories/{cat['category_id']}", 
                    headers=auth_headers
                )
                print(f"Cleaned up category: {cat['category_id']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
