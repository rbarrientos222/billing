"""
Test suite for Inventory Unit Tracking feature
Tests CRUD operations for inventory items and individual unit tracking with MAC/Serial numbers
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestInventoryUnitTracking:
    """Test inventory unit tracking feature - MAC/Serial number tracking for serialized items"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.admin_token = None
        self.test_item_code = None
        self.test_unit_ids = []
        
    def get_admin_token(self):
        """Get admin authentication token"""
        if self.admin_token:
            return self.admin_token
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "@Gello1006"
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        self.admin_token = response.json()['access_token']
        return self.admin_token
    
    def get_headers(self):
        """Get authorization headers"""
        return {"Authorization": f"Bearer {self.get_admin_token()}"}
    
    # ========== INVENTORY ITEM CRUD TESTS ==========
    
    def test_01_list_inventory_items(self):
        """Test listing all inventory items"""
        response = requests.get(f"{BASE_URL}/api/inventory", headers=self.get_headers())
        assert response.status_code == 200, f"Failed to list inventory: {response.text}"
        items = response.json()
        assert isinstance(items, list), "Response should be a list"
        print(f"✓ Listed {len(items)} inventory items")
        
    def test_02_create_serialized_inventory_item(self):
        """Test creating a serialized inventory item (for MAC/Serial tracking)"""
        unique_name = f"TEST_Router_{uuid.uuid4().hex[:6]}"
        payload = {
            "name": unique_name,
            "category": "Equipment",
            "description": "Test router for unit tracking",
            "quantity": 0,  # Serialized items start with 0, quantity increases as units are added
            "unit": "pcs",
            "cost_per_unit": 2500.00,
            "restock_level": 5,
            "is_serialized": True,
            "is_bulk": False,
            "supplier": "Test Supplier",
            "location": "Warehouse A"
        }
        response = requests.post(f"{BASE_URL}/api/inventory", json=payload, headers=self.get_headers())
        assert response.status_code == 200, f"Failed to create item: {response.text}"
        data = response.json()
        assert "item_code" in data, "Response should contain item_code"
        self.__class__.test_item_code = data['item_code']
        print(f"✓ Created serialized inventory item: {data['item_code']}")
        
    def test_03_get_inventory_item(self):
        """Test getting a single inventory item"""
        if not hasattr(self.__class__, 'test_item_code') or not self.__class__.test_item_code:
            pytest.skip("No test item created")
        
        response = requests.get(f"{BASE_URL}/api/inventory/{self.__class__.test_item_code}", headers=self.get_headers())
        assert response.status_code == 200, f"Failed to get item: {response.text}"
        item = response.json()
        assert item['is_serialized'] == True, "Item should be serialized"
        print(f"✓ Retrieved inventory item: {item['name']}")
        
    def test_04_update_inventory_item(self):
        """Test updating an inventory item"""
        if not hasattr(self.__class__, 'test_item_code') or not self.__class__.test_item_code:
            pytest.skip("No test item created")
        
        updates = {
            "description": "Updated test router description",
            "cost_per_unit": 2800.00
        }
        response = requests.put(f"{BASE_URL}/api/inventory/{self.__class__.test_item_code}", json=updates, headers=self.get_headers())
        assert response.status_code == 200, f"Failed to update item: {response.text}"
        print(f"✓ Updated inventory item")
        
        # Verify update
        response = requests.get(f"{BASE_URL}/api/inventory/{self.__class__.test_item_code}", headers=self.get_headers())
        item = response.json()
        assert item['cost_per_unit'] == 2800.00, "Cost should be updated"
        
    # ========== INVENTORY UNIT TRACKING TESTS ==========
    
    def test_05_add_unit_with_mac_address(self):
        """Test adding a unit with MAC address to serialized item"""
        if not hasattr(self.__class__, 'test_item_code') or not self.__class__.test_item_code:
            pytest.skip("No test item created")
        
        mac_address = f"AA:BB:CC:{uuid.uuid4().hex[:2].upper()}:{uuid.uuid4().hex[:2].upper()}:{uuid.uuid4().hex[:2].upper()}"
        payload = {
            "mac_address": mac_address,
            "serial_number": f"SN{uuid.uuid4().hex[:8].upper()}",
            "notes": "Test unit 1"
        }
        response = requests.post(f"{BASE_URL}/api/inventory/{self.__class__.test_item_code}/units", json=payload, headers=self.get_headers())
        assert response.status_code == 200, f"Failed to add unit: {response.text}"
        data = response.json()
        assert "unit_id" in data, "Response should contain unit_id"
        if not hasattr(self.__class__, 'test_unit_ids'):
            self.__class__.test_unit_ids = []
        self.__class__.test_unit_ids.append(data['unit_id'])
        print(f"✓ Added unit with MAC: {mac_address}, Unit ID: {data['unit_id']}")
        
    def test_06_add_unit_with_serial_only(self):
        """Test adding a unit with only serial number"""
        if not hasattr(self.__class__, 'test_item_code') or not self.__class__.test_item_code:
            pytest.skip("No test item created")
        
        serial_number = f"SN{uuid.uuid4().hex[:10].upper()}"
        payload = {
            "serial_number": serial_number,
            "notes": "Test unit 2 - serial only"
        }
        response = requests.post(f"{BASE_URL}/api/inventory/{self.__class__.test_item_code}/units", json=payload, headers=self.get_headers())
        assert response.status_code == 200, f"Failed to add unit: {response.text}"
        data = response.json()
        if not hasattr(self.__class__, 'test_unit_ids'):
            self.__class__.test_unit_ids = []
        self.__class__.test_unit_ids.append(data['unit_id'])
        print(f"✓ Added unit with Serial: {serial_number}")
        
    def test_07_list_inventory_units(self):
        """Test listing all units for an inventory item"""
        if not hasattr(self.__class__, 'test_item_code') or not self.__class__.test_item_code:
            pytest.skip("No test item created")
        
        response = requests.get(f"{BASE_URL}/api/inventory/{self.__class__.test_item_code}/units", headers=self.get_headers())
        assert response.status_code == 200, f"Failed to list units: {response.text}"
        units = response.json()
        assert isinstance(units, list), "Response should be a list"
        assert len(units) >= 2, f"Should have at least 2 units, got {len(units)}"
        
        # Verify unit structure
        for unit in units:
            assert 'unit_id' in unit, "Unit should have unit_id"
            assert 'status' in unit, "Unit should have status"
            assert unit['status'] == 'available', "New units should be available"
        
        print(f"✓ Listed {len(units)} units for item")
        
    def test_08_verify_quantity_incremented(self):
        """Test that parent inventory quantity is incremented when units are added"""
        if not hasattr(self.__class__, 'test_item_code') or not self.__class__.test_item_code:
            pytest.skip("No test item created")
        
        response = requests.get(f"{BASE_URL}/api/inventory/{self.__class__.test_item_code}", headers=self.get_headers())
        assert response.status_code == 200
        item = response.json()
        assert item['quantity'] >= 2, f"Quantity should be at least 2, got {item['quantity']}"
        print(f"✓ Verified quantity incremented to {item['quantity']}")
        
    def test_09_assign_unit_to_subscriber(self):
        """Test assigning a unit to a subscriber"""
        if not hasattr(self.__class__, 'test_unit_ids') or not self.__class__.test_unit_ids:
            pytest.skip("No test units created")
        
        unit_id = self.__class__.test_unit_ids[0]
        payload = {"subscriber_id": "ACC_TEST_123"}
        response = requests.post(f"{BASE_URL}/api/inventory/units/{unit_id}/assign", json=payload, headers=self.get_headers())
        assert response.status_code == 200, f"Failed to assign unit: {response.text}"
        print(f"✓ Assigned unit {unit_id} to subscriber ACC_TEST_123")
        
        # Verify assignment
        response = requests.get(f"{BASE_URL}/api/inventory/{self.__class__.test_item_code}/units", headers=self.get_headers())
        units = response.json()
        assigned_unit = next((u for u in units if u['unit_id'] == unit_id), None)
        assert assigned_unit is not None, "Unit should exist"
        assert assigned_unit['status'] == 'assigned', "Unit should be assigned"
        assert assigned_unit['assigned_to'] == 'ACC_TEST_123', "Unit should be assigned to correct subscriber"
        
    def test_10_cannot_assign_already_assigned_unit(self):
        """Test that already assigned units cannot be reassigned"""
        if not hasattr(self.__class__, 'test_unit_ids') or not self.__class__.test_unit_ids:
            pytest.skip("No test units created")
        
        unit_id = self.__class__.test_unit_ids[0]  # Already assigned in previous test
        payload = {"subscriber_id": "ACC_OTHER_456"}
        response = requests.post(f"{BASE_URL}/api/inventory/units/{unit_id}/assign", json=payload, headers=self.get_headers())
        assert response.status_code == 400, f"Should fail to reassign: {response.text}"
        print(f"✓ Correctly prevented reassignment of assigned unit")
        
    def test_11_return_unit_from_subscriber(self):
        """Test returning a unit from a subscriber"""
        if not hasattr(self.__class__, 'test_unit_ids') or not self.__class__.test_unit_ids:
            pytest.skip("No test units created")
        
        unit_id = self.__class__.test_unit_ids[0]
        payload = {"status": "available", "notes": "Returned for testing"}
        response = requests.post(f"{BASE_URL}/api/inventory/units/{unit_id}/return", json=payload, headers=self.get_headers())
        assert response.status_code == 200, f"Failed to return unit: {response.text}"
        print(f"✓ Returned unit {unit_id}")
        
        # Verify return
        response = requests.get(f"{BASE_URL}/api/inventory/{self.__class__.test_item_code}/units", headers=self.get_headers())
        units = response.json()
        returned_unit = next((u for u in units if u['unit_id'] == unit_id), None)
        assert returned_unit['status'] == 'available', "Unit should be available after return"
        assert returned_unit['assigned_to'] is None, "Unit should not be assigned"
        
    def test_12_return_unit_as_defective(self):
        """Test returning a unit and marking it as defective"""
        if not hasattr(self.__class__, 'test_unit_ids') or len(self.__class__.test_unit_ids) < 2:
            pytest.skip("Not enough test units")
        
        # First assign the second unit
        unit_id = self.__class__.test_unit_ids[1]
        assign_payload = {"subscriber_id": "ACC_TEST_789"}
        requests.post(f"{BASE_URL}/api/inventory/units/{unit_id}/assign", json=assign_payload, headers=self.get_headers())
        
        # Then return as defective
        return_payload = {"status": "defective", "notes": "Hardware failure"}
        response = requests.post(f"{BASE_URL}/api/inventory/units/{unit_id}/return", json=return_payload, headers=self.get_headers())
        assert response.status_code == 200, f"Failed to return unit: {response.text}"
        
        # Verify defective status
        response = requests.get(f"{BASE_URL}/api/inventory/{self.__class__.test_item_code}/units", headers=self.get_headers())
        units = response.json()
        defective_unit = next((u for u in units if u['unit_id'] == unit_id), None)
        assert defective_unit['status'] == 'defective', "Unit should be marked defective"
        print(f"✓ Returned unit as defective")
        
    def test_13_cannot_delete_assigned_unit(self):
        """Test that assigned units cannot be deleted"""
        if not hasattr(self.__class__, 'test_unit_ids') or not self.__class__.test_unit_ids:
            pytest.skip("No test units created")
        
        # First assign a unit
        unit_id = self.__class__.test_unit_ids[0]
        assign_payload = {"subscriber_id": "ACC_DELETE_TEST"}
        requests.post(f"{BASE_URL}/api/inventory/units/{unit_id}/assign", json=assign_payload, headers=self.get_headers())
        
        # Try to delete
        response = requests.delete(f"{BASE_URL}/api/inventory/units/{unit_id}", headers=self.get_headers())
        assert response.status_code == 400, f"Should fail to delete assigned unit: {response.text}"
        print(f"✓ Correctly prevented deletion of assigned unit")
        
        # Return the unit for cleanup
        return_payload = {"status": "available"}
        requests.post(f"{BASE_URL}/api/inventory/units/{unit_id}/return", json=return_payload, headers=self.get_headers())
        
    def test_14_delete_inventory_unit(self):
        """Test deleting an inventory unit"""
        if not hasattr(self.__class__, 'test_unit_ids') or not self.__class__.test_unit_ids:
            pytest.skip("No test units created")
        
        unit_id = self.__class__.test_unit_ids[0]
        
        # Get current quantity
        response = requests.get(f"{BASE_URL}/api/inventory/{self.__class__.test_item_code}", headers=self.get_headers())
        initial_qty = response.json()['quantity']
        
        # Delete unit
        response = requests.delete(f"{BASE_URL}/api/inventory/units/{unit_id}", headers=self.get_headers())
        assert response.status_code == 200, f"Failed to delete unit: {response.text}"
        print(f"✓ Deleted unit {unit_id}")
        
        # Verify quantity decremented
        response = requests.get(f"{BASE_URL}/api/inventory/{self.__class__.test_item_code}", headers=self.get_headers())
        new_qty = response.json()['quantity']
        assert new_qty == initial_qty - 1, f"Quantity should decrease by 1, was {initial_qty}, now {new_qty}"
        print(f"✓ Verified quantity decremented from {initial_qty} to {new_qty}")
        
    def test_15_duplicate_mac_address_rejected(self):
        """Test that duplicate MAC addresses are rejected"""
        if not hasattr(self.__class__, 'test_item_code') or not self.__class__.test_item_code:
            pytest.skip("No test item created")
        
        mac_address = "DD:EE:FF:11:22:33"
        payload = {"mac_address": mac_address, "serial_number": "SN_UNIQUE_1"}
        
        # Add first unit
        response = requests.post(f"{BASE_URL}/api/inventory/{self.__class__.test_item_code}/units", json=payload, headers=self.get_headers())
        assert response.status_code == 200, f"Failed to add first unit: {response.text}"
        
        # Try to add duplicate
        payload2 = {"mac_address": mac_address, "serial_number": "SN_UNIQUE_2"}
        response = requests.post(f"{BASE_URL}/api/inventory/{self.__class__.test_item_code}/units", json=payload2, headers=self.get_headers())
        assert response.status_code == 400, f"Should reject duplicate MAC: {response.text}"
        assert "already exists" in response.json().get('detail', '').lower()
        print(f"✓ Correctly rejected duplicate MAC address")
        
    def test_16_search_units_by_mac(self):
        """Test searching units by MAC address"""
        response = requests.get(f"{BASE_URL}/api/inventory/units/search?q=DD:EE:FF", headers=self.get_headers())
        assert response.status_code == 200, f"Failed to search units: {response.text}"
        units = response.json()
        assert isinstance(units, list), "Response should be a list"
        print(f"✓ Search returned {len(units)} units")
        
    # ========== EXISTING ITEM TESTS (from main agent context) ==========
    
    def test_17_verify_existing_test_item(self):
        """Verify the existing test item ITM6F481E53 mentioned in context"""
        response = requests.get(f"{BASE_URL}/api/inventory/ITM6F481E53", headers=self.get_headers())
        if response.status_code == 404:
            pytest.skip("Test item ITM6F481E53 not found - may have been cleaned up")
        
        assert response.status_code == 200, f"Failed to get item: {response.text}"
        item = response.json()
        assert item['is_serialized'] == True, "Item should be serialized"
        print(f"✓ Verified existing test item: {item['name']}")
        
    def test_18_verify_existing_units(self):
        """Verify existing units for ITM6F481E53"""
        response = requests.get(f"{BASE_URL}/api/inventory/ITM6F481E53/units", headers=self.get_headers())
        if response.status_code == 404:
            pytest.skip("Test item ITM6F481E53 not found")
        
        assert response.status_code == 200, f"Failed to list units: {response.text}"
        units = response.json()
        print(f"✓ Found {len(units)} units for ITM6F481E53")
        
        # Check for expected units from context
        unit_ids = [u['unit_id'] for u in units]
        if 'UNIT197D9643' in unit_ids:
            assigned_unit = next(u for u in units if u['unit_id'] == 'UNIT197D9643')
            print(f"  - UNIT197D9643: status={assigned_unit['status']}, assigned_to={assigned_unit.get('assigned_to')}")
        if 'UNITF8FF77C4' in unit_ids:
            available_unit = next(u for u in units if u['unit_id'] == 'UNITF8FF77C4')
            print(f"  - UNITF8FF77C4: status={available_unit['status']}")
            
    # ========== CLEANUP ==========
    
    def test_99_cleanup(self):
        """Cleanup test data"""
        if hasattr(self.__class__, 'test_item_code') and self.__class__.test_item_code:
            # Delete all units first
            response = requests.get(f"{BASE_URL}/api/inventory/{self.__class__.test_item_code}/units", headers=self.get_headers())
            if response.status_code == 200:
                units = response.json()
                for unit in units:
                    # Return if assigned
                    if unit.get('status') == 'assigned':
                        requests.post(f"{BASE_URL}/api/inventory/units/{unit['unit_id']}/return", 
                                    json={"status": "available"}, headers=self.get_headers())
                    # Delete unit
                    requests.delete(f"{BASE_URL}/api/inventory/units/{unit['unit_id']}", headers=self.get_headers())
            
            # Delete the item
            response = requests.delete(f"{BASE_URL}/api/inventory/{self.__class__.test_item_code}", headers=self.get_headers())
            print(f"✓ Cleaned up test item {self.__class__.test_item_code}")


class TestInventoryStats:
    """Test inventory statistics endpoints"""
    
    def get_admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "@Gello1006"
        })
        return response.json()['access_token']
    
    def get_headers(self):
        return {"Authorization": f"Bearer {self.get_admin_token()}"}
    
    def test_inventory_stats(self):
        """Test inventory statistics endpoint"""
        response = requests.get(f"{BASE_URL}/api/inventory/stats", headers=self.get_headers())
        assert response.status_code == 200, f"Failed to get stats: {response.text}"
        stats = response.json()
        assert 'total_items' in stats, "Stats should include total_items"
        assert 'total_value' in stats, "Stats should include total_value"
        print(f"✓ Inventory stats: {stats['total_items']} items, ₱{stats['total_value']} total value")
        
    def test_low_stock_items(self):
        """Test low stock items endpoint"""
        response = requests.get(f"{BASE_URL}/api/inventory/low-stock", headers=self.get_headers())
        assert response.status_code == 200, f"Failed to get low stock: {response.text}"
        items = response.json()
        assert isinstance(items, list), "Response should be a list"
        print(f"✓ Low stock items: {len(items)}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
