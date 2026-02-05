import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { TablePagination } from '@/components/ui/table-pagination';
import { toast } from 'sonner';
import { 
  Plus, Search, Package, AlertTriangle, Edit, Trash2, 
  TrendingDown, TrendingUp, DollarSign, Loader2, History,
  Cable, Box, Wrench, Wifi, HardDrive, List, UserCheck
} from 'lucide-react';

export default function InventoryManagement() {
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState({});
  const [lowStockItems, setLowStockItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [unitsDialogOpen, setUnitsDialogOpen] = useState(false);
  const [addUnitDialogOpen, setAddUnitDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [itemHistory, setItemHistory] = useState([]);
  const [itemUnits, setItemUnits] = useState([]);
  const [loadingUnits, setLoadingUnits] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    category: 'Equipment',
    description: '',
    quantity: '',
    unit: 'pcs',
    cost_per_unit: '',
    restock_level: '',
    is_serialized: false,
    is_bulk: false,
    total_length: '',
    supplier: '',
    location: '',
    notes: ''
  });

  const [adjustData, setAdjustData] = useState({
    type: 'deduct',
    amount: '',
    reason: ''
  });

  const [unitFormData, setUnitFormData] = useState({
    mac_address: '',
    serial_number: '',
    notes: ''
  });

  const categories = [
    { value: 'Equipment', label: 'Equipment (Routers, Modems)', icon: Wifi },
    { value: 'Cable', label: 'Cables & Wires', icon: Cable },
    { value: 'Consumable', label: 'Consumables', icon: Package },
    { value: 'Tool', label: 'Tools', icon: Wrench },
    { value: 'Other', label: 'Other', icon: Package }
  ];

  const units = [
    { value: 'pcs', label: 'Pieces' },
    { value: 'meters', label: 'Meters' },
    { value: 'rolls', label: 'Rolls' },
    { value: 'boxes', label: 'Boxes' },
    { value: 'sets', label: 'Sets' },
    { value: 'kg', label: 'Kilograms' },
    { value: 'liters', label: 'Liters' }
  ];

  useEffect(() => {
    fetchInventory();
    fetchStats();
    fetchLowStock();
  }, []);

  const fetchInventory = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/inventory');
      setItems(response.data);
    } catch (error) {
      toast.error('Failed to fetch inventory');
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await axios.get('/inventory/stats');
      setStats(response.data);
    } catch (error) {
      console.error('Failed to fetch stats');
    }
  };

  const fetchLowStock = async () => {
    try {
      const response = await axios.get('/inventory/low-stock');
      setLowStockItems(response.data);
    } catch (error) {
      console.error('Failed to fetch low stock items');
    }
  };

  const fetchItemUnits = async (item) => {
    setLoadingUnits(true);
    try {
      const response = await axios.get(`/inventory/${item.item_code}/units`);
      setItemUnits(response.data);
    } catch (error) {
      toast.error('Failed to fetch units');
    } finally {
      setLoadingUnits(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...formData,
        quantity: formData.is_serialized ? 0 : (parseFloat(formData.quantity) || 0),
        cost_per_unit: parseFloat(formData.cost_per_unit) || 0,
        restock_level: parseFloat(formData.restock_level) || 0,
        total_length: formData.is_bulk ? parseFloat(formData.total_length) || 0 : null
      };
      
      await axios.post('/inventory', payload);
      toast.success('Item added to inventory');
      
      if (formData.is_serialized) {
        toast.info('This item is set for unit tracking. Add individual units with MAC/Serial numbers.');
      }
      
      setDialogOpen(false);
      resetForm();
      fetchInventory();
      fetchStats();
      fetchLowStock();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to add item');
    }
  };

  const handleEdit = (item) => {
    setSelectedItem(item);
    setFormData({
      name: item.name,
      category: item.category,
      description: item.description || '',
      quantity: item.quantity?.toString() || '',
      unit: item.unit,
      cost_per_unit: item.cost_per_unit?.toString() || '',
      restock_level: item.restock_level?.toString() || '',
      is_serialized: item.is_serialized || false,
      is_bulk: item.is_bulk || false,
      total_length: item.total_length?.toString() || '',
      supplier: item.supplier || '',
      location: item.location || '',
      notes: item.notes || ''
    });
    setEditDialogOpen(true);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...formData,
        quantity: parseFloat(formData.quantity) || 0,
        cost_per_unit: parseFloat(formData.cost_per_unit) || 0,
        restock_level: parseFloat(formData.restock_level) || 0,
        total_length: formData.is_bulk ? parseFloat(formData.total_length) || null : null
      };
      
      await axios.put(`/inventory/${selectedItem.item_code}`, payload);
      toast.success('Item updated');
      setEditDialogOpen(false);
      resetForm();
      fetchInventory();
      fetchStats();
      fetchLowStock();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update item');
    }
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`Delete "${item.name}" from inventory?`)) return;
    try {
      await axios.delete(`/inventory/${item.item_code}`);
      toast.success('Item deleted');
      fetchInventory();
      fetchStats();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete item');
    }
  };

  const handleAdjust = (item) => {
    setSelectedItem(item);
    setAdjustData({ type: 'deduct', amount: '', reason: '' });
    setAdjustDialogOpen(true);
  };

  const handleAdjustSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await axios.post(`/inventory/${selectedItem.item_code}/adjust`, {
        type: adjustData.type,
        amount: parseFloat(adjustData.amount),
        reason: adjustData.reason
      });
      
      toast.success(response.data.message);
      
      if (response.data.low_stock) {
        toast.warning(`Low stock alert: ${selectedItem.name} is below restock level!`);
      }
      
      setAdjustDialogOpen(false);
      fetchInventory();
      fetchStats();
      fetchLowStock();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to adjust inventory');
    }
  };

  const handleViewHistory = async (item) => {
    setSelectedItem(item);
    try {
      const response = await axios.get(`/inventory/${item.item_code}/history`);
      setItemHistory(response.data);
      setHistoryDialogOpen(true);
    } catch (error) {
      toast.error('Failed to fetch history');
    }
  };

  const handleViewUnits = async (item) => {
    setSelectedItem(item);
    await fetchItemUnits(item);
    setUnitsDialogOpen(true);
  };

  const handleAddUnit = async (e) => {
    e.preventDefault();
    try {
      if (!unitFormData.mac_address && !unitFormData.serial_number) {
        toast.error('Please enter MAC address or Serial number');
        return;
      }
      
      await axios.post(`/inventory/${selectedItem.item_code}/units`, unitFormData);
      toast.success('Unit added to inventory');
      setUnitFormData({ mac_address: '', serial_number: '', notes: '' });
      setAddUnitDialogOpen(false);
      await fetchItemUnits(selectedItem);
      fetchInventory();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to add unit');
    }
  };

  const handleDeleteUnit = async (unitId) => {
    if (!window.confirm('Delete this unit from inventory?')) return;
    try {
      await axios.delete(`/inventory/units/${unitId}`);
      toast.success('Unit deleted');
      await fetchItemUnits(selectedItem);
      fetchInventory();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete unit');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      category: 'Equipment',
      description: '',
      quantity: '',
      unit: 'pcs',
      cost_per_unit: '',
      restock_level: '',
      is_serialized: false,
      is_bulk: false,
      total_length: '',
      supplier: '',
      location: '',
      notes: ''
    });
    setSelectedItem(null);
  };

  const filteredItems = items.filter(item => {
    const matchesSearch = item.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         item.item_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         item.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, categoryFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, currentPage, pageSize]);

  const handlePageChange = (page) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  const handlePageSizeChange = (size) => {
    setPageSize(size);
    setCurrentPage(1);
  };

  const getCategoryIcon = (category) => {
    const cat = categories.find(c => c.value === category);
    return cat ? cat.icon : Package;
  };

  const getUnitStatusBadge = (status) => {
    switch (status) {
      case 'available': return <Badge className="bg-green-600">Available</Badge>;
      case 'assigned': return <Badge className="bg-blue-600">Assigned</Badge>;
      case 'defective': return <Badge variant="destructive">Defective</Badge>;
      case 'returned': return <Badge variant="secondary">Returned</Badge>;
      default: return <Badge>{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-heading font-bold">Inventory Management</h2>
          <p className="text-muted-foreground mt-1">Manage stock, equipment, and materials</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Item
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add Inventory Item</DialogTitle>
              <DialogDescription>Add a new item to your inventory</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label>Item Name *</Label>
                  <Input 
                    value={formData.name} 
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Fiber Optic Cable, ONU Router"
                    required 
                  />
                </div>
                <div>
                  <Label>Category *</Label>
                  <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v, is_serialized: v === 'Equipment' })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map(cat => (
                        <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Unit *</Label>
                  <Select value={formData.unit} onValueChange={(v) => setFormData({ ...formData, unit: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {units.map(u => (
                        <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                {/* Serialized tracking for equipment */}
                <div className="col-span-2 flex items-center space-x-2 p-3 bg-purple-50 dark:bg-purple-950 rounded-lg border border-purple-200">
                  <Checkbox 
                    id="is_serialized"
                    checked={formData.is_serialized}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_serialized: checked, is_bulk: checked ? false : formData.is_bulk })}
                  />
                  <label htmlFor="is_serialized" className="text-sm cursor-pointer">
                    <div className="flex items-center gap-2">
                      <HardDrive className="h-4 w-4 text-purple-600" />
                      <strong>Track individual units with MAC/Serial</strong>
                    </div>
                    <span className="text-xs text-muted-foreground">For modems, routers, ONUs - each unit tracked separately</span>
                  </label>
                </div>
                
                {/* Bulk tracking for cables */}
                <div className="col-span-2 flex items-center space-x-2 p-3 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200">
                  <Checkbox 
                    id="is_bulk"
                    checked={formData.is_bulk}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_bulk: checked, is_serialized: checked ? false : formData.is_serialized })}
                  />
                  <label htmlFor="is_bulk" className="text-sm cursor-pointer">
                    <div className="flex items-center gap-2">
                      <Cable className="h-4 w-4 text-blue-600" />
                      <strong>Track by length/measurement</strong>
                    </div>
                    <span className="text-xs text-muted-foreground">For cables, wires - deduct meters as used</span>
                  </label>
                </div>

                {formData.is_bulk && (
                  <div className="col-span-2">
                    <Label>Total Length (meters) *</Label>
                    <Input 
                      type="number"
                      value={formData.total_length} 
                      onChange={(e) => setFormData({ ...formData, total_length: e.target.value, quantity: e.target.value })}
                      placeholder="e.g., 2000 for 2km"
                      required={formData.is_bulk}
                    />
                  </div>
                )}

                {!formData.is_bulk && !formData.is_serialized && (
                  <div>
                    <Label>Quantity *</Label>
                    <Input 
                      type="number"
                      value={formData.quantity} 
                      onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                      placeholder="0"
                      required={!formData.is_bulk && !formData.is_serialized}
                    />
                  </div>
                )}

                {formData.is_serialized && (
                  <div className="col-span-2 p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200">
                    <p className="text-sm text-amber-700 dark:text-amber-300">
                      <strong>Note:</strong> Quantity will be calculated automatically as you add individual units. 
                      After creating this item, use "Manage Units" to add each device with its MAC address or serial number.
                    </p>
                  </div>
                )}
                
                <div>
                  <Label>Cost per Unit (₱)</Label>
                  <Input 
                    type="number"
                    step="0.01"
                    value={formData.cost_per_unit} 
                    onChange={(e) => setFormData({ ...formData, cost_per_unit: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <Label>Restock Level</Label>
                  <Input 
                    type="number"
                    value={formData.restock_level} 
                    onChange={(e) => setFormData({ ...formData, restock_level: e.target.value })}
                    placeholder="Alert when below this"
                  />
                </div>
                <div>
                  <Label>Supplier</Label>
                  <Input 
                    value={formData.supplier} 
                    onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Storage Location</Label>
                  <Input 
                    value={formData.location} 
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  />
                </div>
                <div className="col-span-2">
                  <Label>Description</Label>
                  <Input 
                    value={formData.description} 
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>
              </div>
              <Button type="submit" className="w-full">Add to Inventory</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Items</p>
                <p className="text-3xl font-bold">{stats.total_items || 0}</p>
              </div>
              <Package className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Value</p>
                <p className="text-3xl font-bold">₱{(stats.total_value || 0).toLocaleString()}</p>
              </div>
              <DollarSign className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
        <Card className={lowStockItems.length > 0 ? 'border-red-300 bg-red-50 dark:bg-red-950/20' : ''}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Low Stock Items</p>
                <p className="text-3xl font-bold text-red-600">{stats.low_stock_count || 0}</p>
              </div>
              <AlertTriangle className={`h-8 w-8 ${lowStockItems.length > 0 ? 'text-red-600 animate-pulse' : 'text-gray-400'}`} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Categories</p>
                <p className="text-3xl font-bold">{Object.keys(stats.categories || {}).length}</p>
              </div>
              <Box className="h-8 w-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Low Stock Alerts */}
      {lowStockItems.length > 0 && (
        <Card className="border-red-300 bg-red-50 dark:bg-red-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-red-700 dark:text-red-400 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Low Stock Alert - Restock Required
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {lowStockItems.map(item => (
                <Badge key={item.item_code} variant="destructive" className="text-sm py-1 px-3">
                  {item.name}: {item.quantity} {item.unit} (min: {item.restock_level})
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search and Filter */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, code, or description..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Filter by category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map(cat => (
              <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Inventory Table */}
      <Card>
        <CardHeader>
          <CardTitle>Inventory Items</CardTitle>
          <CardDescription>{filteredItems.length} items</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Stock</TableHead>
                    <TableHead>Unit Cost</TableHead>
                    <TableHead>Total Value</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedItems.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        No items found
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedItems.map((item) => {
                      const Icon = getCategoryIcon(item.category);
                      return (
                        <TableRow key={item.item_code} className={item.low_stock ? 'bg-red-50 dark:bg-red-950/20' : ''}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{item.name}</p>
                              <p className="text-xs text-muted-foreground font-mono">{item.item_code}</p>
                              <div className="flex gap-1 mt-1">
                                {item.is_serialized && (
                                  <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
                                    <HardDrive className="h-3 w-3 mr-1" />
                                    MAC/Serial
                                  </Badge>
                                )}
                                {item.is_bulk && (
                                  <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                                    <Cable className="h-3 w-3 mr-1" />
                                    Bulk/Length
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Icon className="h-4 w-4 text-muted-foreground" />
                              <span>{item.category}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className={`font-bold ${item.low_stock ? 'text-red-600' : ''}`}>
                              {item.quantity?.toLocaleString()} {item.unit}
                            </span>
                            {item.restock_level > 0 && (
                              <p className="text-xs text-muted-foreground">
                                Min: {item.restock_level}
                              </p>
                            )}
                          </TableCell>
                          <TableCell>₱{item.cost_per_unit?.toLocaleString()}</TableCell>
                          <TableCell className="font-medium">
                            ₱{item.total_value?.toLocaleString()}
                          </TableCell>
                          <TableCell>
                            {item.low_stock ? (
                              <Badge variant="destructive">
                                <AlertTriangle className="h-3 w-3 mr-1" />
                                Low Stock
                              </Badge>
                            ) : (
                              <Badge className="bg-green-600">In Stock</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              {item.is_serialized && (
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  onClick={() => handleViewUnits(item)}
                                  title="Manage Units (MAC/Serial)"
                                  className="text-purple-600 border-purple-300"
                                >
                                  <List className="h-4 w-4" />
                                </Button>
                              )}
                              {!item.is_serialized && (
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  onClick={() => handleAdjust(item)}
                                  title="Adjust Stock"
                                >
                                  <TrendingDown className="h-4 w-4" />
                                </Button>
                              )}
                              <Button 
                                variant="ghost" 
                                size="icon"
                                onClick={() => handleViewHistory(item)}
                                title="View History"
                              >
                                <History className="h-4 w-4 text-blue-600" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon"
                                onClick={() => handleEdit(item)}
                                title="Edit"
                              >
                                <Edit className="h-4 w-4 text-amber-600" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon"
                                onClick={() => handleDelete(item)}
                                title="Delete"
                              >
                                <Trash2 className="h-4 w-4 text-red-600" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
              
              {/* Pagination */}
              <TablePagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={filteredItems.length}
                pageSize={pageSize}
                onPageChange={handlePageChange}
                onPageSizeChange={handlePageSizeChange}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Item: {selectedItem?.name}</DialogTitle>
            <DialogDescription>Update inventory item details</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Item Name</Label>
                <Input 
                  value={formData.name} 
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required 
                />
              </div>
              {!formData.is_serialized && (
                <div>
                  <Label>Quantity</Label>
                  <Input 
                    type="number"
                    value={formData.quantity} 
                    onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                  />
                </div>
              )}
              <div>
                <Label>Cost per Unit (₱)</Label>
                <Input 
                  type="number"
                  step="0.01"
                  value={formData.cost_per_unit} 
                  onChange={(e) => setFormData({ ...formData, cost_per_unit: e.target.value })}
                />
              </div>
              <div>
                <Label>Restock Level</Label>
                <Input 
                  type="number"
                  value={formData.restock_level} 
                  onChange={(e) => setFormData({ ...formData, restock_level: e.target.value })}
                />
              </div>
              <div>
                <Label>Location</Label>
                <Input 
                  value={formData.location} 
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit" className="flex-1">Save Changes</Button>
              <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Adjust Stock Dialog */}
      <Dialog open={adjustDialogOpen} onOpenChange={setAdjustDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust Stock: {selectedItem?.name}</DialogTitle>
            <DialogDescription>
              Current stock: <strong>{selectedItem?.quantity} {selectedItem?.unit}</strong>
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAdjustSubmit} className="space-y-4">
            <div>
              <Label>Adjustment Type</Label>
              <Select value={adjustData.type} onValueChange={(v) => setAdjustData({ ...adjustData, type: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="deduct">
                    <div className="flex items-center gap-2">
                      <TrendingDown className="h-4 w-4 text-red-600" />
                      Deduct (Use/Remove)
                    </div>
                  </SelectItem>
                  <SelectItem value="add">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-green-600" />
                      Add (Restock)
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Amount ({selectedItem?.unit})</Label>
              <Input 
                type="number"
                step="0.01"
                value={adjustData.amount} 
                onChange={(e) => setAdjustData({ ...adjustData, amount: e.target.value })}
                placeholder={`e.g., 100 ${selectedItem?.unit}`}
                required
              />
            </div>
            <div>
              <Label>Reason</Label>
              <Input 
                value={adjustData.reason} 
                onChange={(e) => setAdjustData({ ...adjustData, reason: e.target.value })}
                placeholder="e.g., Installation at subscriber #ACC123"
              />
            </div>
            <Button type="submit" className="w-full">
              {adjustData.type === 'deduct' ? 'Deduct Stock' : 'Add Stock'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* History Dialog */}
      <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Stock History: {selectedItem?.name}</DialogTitle>
            <DialogDescription>Recent adjustments and movements</DialogDescription>
          </DialogHeader>
          <div className="max-h-[400px] overflow-y-auto">
            {itemHistory.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No history found</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Balance</TableHead>
                    <TableHead>By</TableHead>
                    <TableHead>Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itemHistory.map((log, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="text-xs">
                        {new Date(log.adjusted_at).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Badge className={log.type === 'add' ? 'bg-green-600' : 'bg-red-600'}>
                          {log.type === 'add' ? '+' : '-'} {log.type}
                        </Badge>
                      </TableCell>
                      <TableCell className={log.type === 'add' ? 'text-green-600' : 'text-red-600'}>
                        {log.type === 'add' ? '+' : '-'}{log.amount} {log.unit}
                      </TableCell>
                      <TableCell>{log.new_qty} {log.unit}</TableCell>
                      <TableCell>{log.adjusted_by}</TableCell>
                      <TableCell className="text-xs max-w-[150px] truncate" title={log.reason}>
                        {log.reason || '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Units Management Dialog */}
      <Dialog open={unitsDialogOpen} onOpenChange={setUnitsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HardDrive className="h-5 w-5 text-purple-600" />
              Unit Tracking: {selectedItem?.name}
            </DialogTitle>
            <DialogDescription>
              Manage individual units with MAC addresses and serial numbers
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex justify-between items-center mb-4">
            <div className="text-sm">
              <span className="text-muted-foreground">Total Units: </span>
              <span className="font-bold">{itemUnits.length}</span>
              <span className="mx-2">|</span>
              <span className="text-green-600">Available: {itemUnits.filter(u => u.status === 'available').length}</span>
              <span className="mx-2">|</span>
              <span className="text-blue-600">Assigned: {itemUnits.filter(u => u.status === 'assigned').length}</span>
            </div>
            <Button size="sm" onClick={() => setAddUnitDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Add Unit
            </Button>
          </div>

          {loadingUnits ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : itemUnits.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <HardDrive className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No units added yet</p>
              <p className="text-sm">Add individual units with their MAC addresses or serial numbers</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Unit ID</TableHead>
                  <TableHead>MAC Address</TableHead>
                  <TableHead>Serial Number</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Assigned To</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {itemUnits.map((unit) => (
                  <TableRow key={unit.unit_id}>
                    <TableCell className="font-mono text-xs">{unit.unit_id}</TableCell>
                    <TableCell className="font-mono text-sm">{unit.mac_address || '-'}</TableCell>
                    <TableCell className="font-mono text-sm">{unit.serial_number || '-'}</TableCell>
                    <TableCell>{getUnitStatusBadge(unit.status)}</TableCell>
                    <TableCell>
                      {unit.assigned_to ? (
                        <div className="flex items-center gap-1">
                          <UserCheck className="h-4 w-4 text-blue-600" />
                          <span className="font-mono text-xs">{unit.assigned_to}</span>
                        </div>
                      ) : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteUnit(unit.unit_id)}
                        disabled={unit.status === 'assigned'}
                        title={unit.status === 'assigned' ? 'Cannot delete assigned unit' : 'Delete unit'}
                      >
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Unit Dialog */}
      <Dialog open={addUnitDialogOpen} onOpenChange={setAddUnitDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Unit to {selectedItem?.name}</DialogTitle>
            <DialogDescription>Enter MAC address and/or serial number</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddUnit} className="space-y-4">
            <div>
              <Label>MAC Address</Label>
              <Input 
                value={unitFormData.mac_address} 
                onChange={(e) => setUnitFormData({ ...unitFormData, mac_address: e.target.value.toUpperCase() })}
                placeholder="e.g., AA:BB:CC:DD:EE:FF"
                style={{ textTransform: 'uppercase' }}
              />
              <p className="text-xs text-muted-foreground mt-1">For network equipment (routers, modems, ONUs)</p>
            </div>
            <div>
              <Label>Serial Number</Label>
              <Input 
                value={unitFormData.serial_number} 
                onChange={(e) => setUnitFormData({ ...unitFormData, serial_number: e.target.value.toUpperCase() })}
                placeholder="e.g., SN123456789"
                style={{ textTransform: 'uppercase' }}
              />
              <p className="text-xs text-muted-foreground mt-1">For equipment without MAC address</p>
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Input 
                value={unitFormData.notes} 
                onChange={(e) => setUnitFormData({ ...unitFormData, notes: e.target.value })}
                placeholder="Any additional notes"
              />
            </div>
            <Button type="submit" className="w-full">Add Unit</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
