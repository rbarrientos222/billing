import React, { useState, useEffect } from 'react';
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
import { toast } from 'sonner';
import { 
  Plus, Search, Package, AlertTriangle, Edit, Trash2, 
  TrendingDown, TrendingUp, DollarSign, Loader2, History,
  Cable, Box, Wrench
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
  const [selectedItem, setSelectedItem] = useState(null);
  const [itemHistory, setItemHistory] = useState([]);
  
  const [formData, setFormData] = useState({
    name: '',
    category: 'Equipment',
    description: '',
    quantity: '',
    unit: 'pcs',
    cost_per_unit: '',
    restock_level: '',
    is_bulk: false,
    total_length: '',
    supplier: '',
    location: '',
    mac_address: '',
    serial_number: '',
    notes: ''
  });

  const [adjustData, setAdjustData] = useState({
    type: 'deduct',
    amount: '',
    reason: ''
  });

  const categories = [
    { value: 'Equipment', label: 'Equipment', icon: Box },
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...formData,
        quantity: parseFloat(formData.quantity) || 0,
        cost_per_unit: parseFloat(formData.cost_per_unit) || 0,
        restock_level: parseFloat(formData.restock_level) || 0,
        total_length: formData.is_bulk ? parseFloat(formData.total_length) || 0 : null
      };
      
      await axios.post('/inventory', payload);
      toast.success('Item added to inventory');
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
      is_bulk: item.is_bulk || false,
      total_length: item.total_length?.toString() || '',
      supplier: item.supplier || '',
      location: item.location || '',
      mac_address: item.mac_address || '',
      serial_number: item.serial_number || '',
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

  const resetForm = () => {
    setFormData({
      name: '',
      category: 'Equipment',
      description: '',
      quantity: '',
      unit: 'pcs',
      cost_per_unit: '',
      restock_level: '',
      is_bulk: false,
      total_length: '',
      supplier: '',
      location: '',
      mac_address: '',
      serial_number: '',
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

  const getCategoryIcon = (category) => {
    const cat = categories.find(c => c.value === category);
    return cat ? cat.icon : Package;
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
                  <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v })}>
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
                
                <div className="col-span-2 flex items-center space-x-2 p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
                  <Checkbox 
                    id="is_bulk"
                    checked={formData.is_bulk}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_bulk: checked })}
                  />
                  <label htmlFor="is_bulk" className="text-sm cursor-pointer">
                    <strong>Track by length/measurement</strong> (for cables, wires, etc.)
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
                    <p className="text-xs text-muted-foreground mt-1">
                      Enter total length in meters. This will be deducted as materials are used.
                    </p>
                  </div>
                )}

                {!formData.is_bulk && (
                  <div>
                    <Label>Quantity *</Label>
                    <Input 
                      type="number"
                      value={formData.quantity} 
                      onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                      placeholder="0"
                      required={!formData.is_bulk}
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
                <div>
                  <Label>MAC Address</Label>
                  <Input 
                    value={formData.mac_address} 
                    onChange={(e) => setFormData({ ...formData, mac_address: e.target.value })}
                    placeholder="For network equipment"
                  />
                </div>
                <div>
                  <Label>Serial Number</Label>
                  <Input 
                    value={formData.serial_number} 
                    onChange={(e) => setFormData({ ...formData, serial_number: e.target.value })}
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
                  {filteredItems.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        No items found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredItems.map((item) => {
                      const Icon = getCategoryIcon(item.category);
                      return (
                        <TableRow key={item.item_code} className={item.low_stock ? 'bg-red-50 dark:bg-red-950/20' : ''}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{item.name}</p>
                              <p className="text-xs text-muted-foreground font-mono">{item.item_code}</p>
                              {item.is_bulk && (
                                <Badge variant="outline" className="text-xs mt-1">
                                  <Cable className="h-3 w-3 mr-1" />
                                  Bulk/Length
                                </Badge>
                              )}
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
                              <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={() => handleAdjust(item)}
                                title="Adjust Stock"
                              >
                                <TrendingDown className="h-4 w-4" />
                              </Button>
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
              <div>
                <Label>Quantity</Label>
                <Input 
                  type="number"
                  value={formData.quantity} 
                  onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                />
              </div>
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
              {selectedItem?.is_bulk && (
                <p className="text-xs text-muted-foreground mt-1">
                  For cables: Enter length in meters used during installation
                </p>
              )}
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
    </div>
  );
}
