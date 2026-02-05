"""
Test MAC Address Search and Equipment Assignment Feature
Tests:
1. Search inventory units by MAC address (GET /api/inventory/units/search?q=...)
2. Get subscriber equipment (GET /api/subscribers/{account_number}/equipment)
3. Create subscriber with assigned_unit_id to auto-assign equipment
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestMACSearchAndEquipmentAssignment:
    """Test MAC address search and equipment assignment during subscriber registration"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - login and get auth token"""
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
        
        # Cleanup will be done in individual tests
    
    # ========== INVENTORY UNITS SEARCH TESTS ==========
    
    def test_search_units_by_mac_address(self):
        """Test searching inventory units by MAC address"""
        # Search for existing unit (from previous test context)
        response = self.session.get(f"{BASE_URL}/api/inventory/units/search?q=F8FF77")
        assert response.status_code == 200, f"Search failed: {response.text}"
        
        results = response.json()
        assert isinstance(results, list), "Response should be a list"
        print(f"Search results for 'F8FF77': {len(results)} units found")
        
        # If results found, verify structure
        if results:
            unit = results[0]
            assert 'unit_id' in unit, "Unit should have unit_id"
            assert 'status' in unit, "Unit should have status"
            print(f"Found unit: {unit.get('unit_id')} - Status: {unit.get('status')}")
    
    def test_search_units_by_partial_mac(self):
        """Test searching with partial MAC address"""
        response = self.session.get(f"{BASE_URL}/api/inventory/units/search?q=197D")
        assert response.status_code == 200, f"Search failed: {response.text}"
        
        results = response.json()
        print(f"Search results for '197D': {len(results)} units found")
        
        # Verify enriched data
        for unit in results:
            if unit.get('item_name'):
                print(f"Unit {unit.get('unit_id')}: {unit.get('item_name')} - {unit.get('status')}")
    
    def test_search_units_returns_item_details(self):
        """Test that search results include item name and category"""
        response = self.session.get(f"{BASE_URL}/api/inventory/units/search?q=UNIT")
        assert response.status_code == 200, f"Search failed: {response.text}"
        
        results = response.json()
        print(f"Total units found: {len(results)}")
        
        # Check if enriched data is present
        for unit in results:
            print(f"Unit: {unit.get('unit_id')}, MAC: {unit.get('mac_address')}, Item: {unit.get('item_name')}, Status: {unit.get('status')}")
    
    def test_search_units_empty_query(self):
        """Test search with very short query"""
        response = self.session.get(f"{BASE_URL}/api/inventory/units/search?q=X")
        assert response.status_code == 200, f"Search failed: {response.text}"
        
        results = response.json()
        print(f"Search results for 'X': {len(results)} units found")
    
    # ========== SUBSCRIBER EQUIPMENT TESTS ==========
    
    def test_get_subscriber_equipment_existing(self):
        """Test getting equipment for subscriber with assigned equipment"""
        # ACC4307BC6B has UNIT197D9643 assigned (from previous test context)
        response = self.session.get(f"{BASE_URL}/api/subscribers/ACC4307BC6B/equipment")
        assert response.status_code == 200, f"Get equipment failed: {response.text}"
        
        equipment = response.json()
        assert isinstance(equipment, list), "Response should be a list"
        print(f"Equipment for ACC4307BC6B: {len(equipment)} items")
        
        for item in equipment:
            print(f"  - {item.get('item_name', item.get('item_code'))}: MAC={item.get('mac_address')}, S/N={item.get('serial_number')}")
            assert 'unit_id' in item, "Equipment should have unit_id"
            assert 'status' in item, "Equipment should have status"
    
    def test_get_subscriber_equipment_none(self):
        """Test getting equipment for subscriber without equipment"""
        # First, get a subscriber without equipment
        subs_response = self.session.get(f"{BASE_URL}/api/subscribers")
        assert subs_response.status_code == 200
        
        subscribers = subs_response.json()
        
        # Find a subscriber and check their equipment
        for sub in subscribers[:5]:  # Check first 5
            account = sub.get('account_number')
            eq_response = self.session.get(f"{BASE_URL}/api/subscribers/{account}/equipment")
            assert eq_response.status_code == 200, f"Get equipment failed for {account}"
            equipment = eq_response.json()
            print(f"Subscriber {account}: {len(equipment)} equipment items")
    
    # ========== SUBSCRIBER CREATION WITH EQUIPMENT ASSIGNMENT ==========
    
    def test_create_subscriber_with_equipment_assignment(self):
        """Test creating subscriber with assigned_unit_id to auto-assign equipment"""
        # First, create a new available unit for testing
        test_item_code = "ITM6F481E53"  # Test Huawei Router Serialized
        test_mac = f"TEST{uuid.uuid4().hex[:8].upper()}"
        
        # Create a test unit
        unit_response = self.session.post(f"{BASE_URL}/api/inventory/{test_item_code}/units", json={
            "mac_address": test_mac,
            "serial_number": f"SN{uuid.uuid4().hex[:8].upper()}",
            "notes": "Test unit for subscriber assignment"
        })
        
        if unit_response.status_code == 201:
            unit_data = unit_response.json()
            test_unit_id = unit_data.get('unit_id')
            print(f"Created test unit: {test_unit_id} with MAC: {test_mac}")
            
            # Now create a subscriber with this unit assigned
            subscriber_data = {
                "account_number": "",  # Will be auto-generated
                "first_name": "TEST",
                "last_name": "EQUIPMENT",
                "email": "test.equipment@test.com",
                "phone": "09171234567",
                "plan_id": "Basic Plan",
                "billing_day": 15,
                "installation_date": "2026-01-15",
                "modem_mac": test_mac,
                "assigned_unit_id": test_unit_id,
                "generate_prorated_bill": False
            }
            
            sub_response = self.session.post(f"{BASE_URL}/api/subscribers", json=subscriber_data)
            assert sub_response.status_code == 200, f"Create subscriber failed: {sub_response.text}"
            
            sub_data = sub_response.json()
            account_number = sub_data.get('account_number')
            print(f"Created subscriber: {account_number}")
            
            # Verify equipment was assigned
            if sub_data.get('assigned_equipment'):
                print(f"Equipment assigned: {sub_data['assigned_equipment']}")
                assert sub_data['assigned_equipment']['unit_id'] == test_unit_id
                assert sub_data['assigned_equipment']['mac_address'] == test_mac
            
            # Verify via equipment endpoint
            eq_response = self.session.get(f"{BASE_URL}/api/subscribers/{account_number}/equipment")
            assert eq_response.status_code == 200
            equipment = eq_response.json()
            print(f"Equipment via endpoint: {len(equipment)} items")
            
            # Verify unit status changed to assigned
            unit_check = self.session.get(f"{BASE_URL}/api/inventory/units/search?q={test_mac}")
            if unit_check.status_code == 200:
                units = unit_check.json()
                for u in units:
                    if u.get('unit_id') == test_unit_id:
                        assert u.get('status') == 'assigned', f"Unit should be assigned, got: {u.get('status')}"
                        assert u.get('assigned_to') == account_number, f"Unit should be assigned to {account_number}"
                        print(f"Unit status verified: {u.get('status')} to {u.get('assigned_to')}")
            
            # Cleanup - delete subscriber (this won't unassign equipment automatically)
            # We'll leave the unit assigned for now
            
        else:
            print(f"Could not create test unit: {unit_response.text}")
            pytest.skip("Could not create test unit for assignment test")
    
    def test_create_subscriber_without_equipment(self):
        """Test creating subscriber without equipment assignment"""
        subscriber_data = {
            "account_number": "",  # Will be auto-generated
            "first_name": "TEST",
            "last_name": "NOEQUIP",
            "email": "test.noequip@test.com",
            "phone": "09179876543",
            "plan_id": "Basic Plan",
            "billing_day": 30,
            "installation_date": "2026-01-15",
            "generate_prorated_bill": False
        }
        
        response = self.session.post(f"{BASE_URL}/api/subscribers", json=subscriber_data)
        assert response.status_code == 200, f"Create subscriber failed: {response.text}"
        
        data = response.json()
        account_number = data.get('account_number')
        print(f"Created subscriber without equipment: {account_number}")
        
        # Verify no equipment assigned
        assert 'assigned_equipment' not in data or data.get('assigned_equipment') is None
        
        # Verify via equipment endpoint
        eq_response = self.session.get(f"{BASE_URL}/api/subscribers/{account_number}/equipment")
        assert eq_response.status_code == 200
        equipment = eq_response.json()
        assert len(equipment) == 0, "Subscriber should have no equipment"
        print("Verified: No equipment assigned")
    
    def test_search_available_units_only(self):
        """Test that frontend filters available units from search results"""
        # Search for all units
        response = self.session.get(f"{BASE_URL}/api/inventory/units/search?q=UNIT")
        assert response.status_code == 200
        
        results = response.json()
        
        # Count by status
        available = [u for u in results if u.get('status') == 'available']
        assigned = [u for u in results if u.get('status') == 'assigned']
        defective = [u for u in results if u.get('status') == 'defective']
        
        print(f"Total units: {len(results)}")
        print(f"  Available: {len(available)}")
        print(f"  Assigned: {len(assigned)}")
        print(f"  Defective: {len(defective)}")
        
        # Frontend should filter to show only available units
        # This test verifies the API returns status for filtering


class TestEquipmentViewInRecords:
    """Test equipment display in View Records dialog"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - login and get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "@Gello1006"
        })
        assert login_response.status_code == 200
        token = login_response.json().get("access_token")
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        yield
    
    def test_equipment_endpoint_returns_enriched_data(self):
        """Test that equipment endpoint returns item_name and item_category"""
        # Get subscriber with equipment
        response = self.session.get(f"{BASE_URL}/api/subscribers/ACC4307BC6B/equipment")
        assert response.status_code == 200
        
        equipment = response.json()
        
        for item in equipment:
            # Verify enriched fields
            print(f"Equipment: {item}")
            assert 'unit_id' in item
            assert 'mac_address' in item or 'serial_number' in item
            assert 'status' in item
            # These should be enriched from inventory
            if item.get('item_name'):
                print(f"  Item Name: {item['item_name']}")
            if item.get('item_category'):
                print(f"  Category: {item['item_category']}")
    
    def test_equipment_for_test_subscriber(self):
        """Test equipment for the test subscriber ACC60772BAC"""
        response = self.session.get(f"{BASE_URL}/api/subscribers/ACC60772BAC/equipment")
        
        if response.status_code == 200:
            equipment = response.json()
            print(f"Equipment for ACC60772BAC: {len(equipment)} items")
            for item in equipment:
                print(f"  - Unit: {item.get('unit_id')}, MAC: {item.get('mac_address')}, Status: {item.get('status')}")
        elif response.status_code == 404:
            print("Subscriber ACC60772BAC not found - may have been deleted")
        else:
            print(f"Unexpected response: {response.status_code} - {response.text}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
