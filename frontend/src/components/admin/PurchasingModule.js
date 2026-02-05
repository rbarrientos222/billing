import React, { useState, useEffect, Suspense } from 'react';
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
import { Plus, Search, ShoppingCart, DollarSign, Building2, Loader2, Eye, CreditCard, Trash2, Calendar, CheckCircle, Clock, AlertCircle } from 'lucide-react';

// Stats Card Component
function StatsCard({ title, value, icon: Icon, description, valueClass }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${valueClass || ''}`}>{value}</div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

// Status Badge Component
function StatusBadge({ status }) {
  if (status === 'paid') return <Badge className="bg-green-600"><CheckCircle className="h-3 w-3 mr-1" />Paid</Badge>;
  if (status === 'partial') return <Badge className="bg-amber-600"><Clock className="h-3 w-3 mr-1" />Partial</Badge>;
  if (status === 'unpaid') return <Badge variant="destructive"><AlertCircle className="h-3 w-3 mr-1" />Unpaid</Badge>;
  return <Badge>{status}</Badge>;
}

// Purchase Row Component
function PurchaseRow({ purchase, onView, onPay }) {
  const itemCount = purchase.items ? purchase.items.length : 0;
  const purchaseDate = new Date(purchase.purchase_date).toLocaleDateString();
  const totalAmount = purchase.total_amount || 0;
  const amountPaid = purchase.amount_paid || 0;
  
  return (
    <TableRow>
      <TableCell className="font-mono text-xs">{purchase.purchase_id}</TableCell>
      <TableCell>{purchase.supplier_name || '-'}</TableCell>
      <TableCell>{purchase.po_number || '-'}</TableCell>
      <TableCell>{purchaseDate}</TableCell>
      <TableCell>{itemCount} item(s)</TableCell>
      <TableCell className="font-bold">₱{totalAmount.toLocaleString()}</TableCell>
      <TableCell className="text-green-600">₱{amountPaid.toLocaleString()}</TableCell>
      <TableCell><StatusBadge status={purchase.payment_status} /></TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          <Button variant="ghost" size="icon" onClick={() => onView(purchase)} title="View Details">
            <Eye className="h-4 w-4 text-blue-600" />
          </Button>
          {purchase.payment_status !== 'paid' && (
            <Button variant="ghost" size="icon" onClick={() => onPay(purchase)} title="Add Payment">
              <CreditCard className="h-4 w-4 text-green-600" />
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

// Purchase Item Row Component  
function PurchaseItemRow({ item, index, isNew, inventoryItems, categories, units, onUpdate, onRemove, canRemove }) {
  const subtotal = (parseFloat(item.quantity) || 0) * (parseFloat(item.unit_cost) || 0);
  
  return (
    <div className="p-4 border rounded-lg bg-gray-50 dark:bg-gray-900">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium">Item {index + 1}</span>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={item.is_new_item} onCheckedChange={(checked) => onUpdate('is_new_item', checked)} />
            New Item
          </label>
          {canRemove && (
            <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
              <Trash2 className="h-4 w-4 text-red-600" />
            </Button>
          )}
        </div>
      </div>
      
      <div className="grid grid-cols-6 gap-3">
        {!item.is_new_item && (
          <div className="col-span-2">
            <Label className="text-xs">Select Existing Item</Label>
            <Select value={item.item_code || ''} onValueChange={(value) => onUpdate('item_code', value)}>
              <SelectTrigger><SelectValue placeholder="Select item" /></SelectTrigger>
              <SelectContent>
                {inventoryItems.map(inv => (
                  <SelectItem key={inv.item_code} value={inv.item_code}>{inv.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        
        <div className={item.is_new_item ? "col-span-2" : ""}>
          <Label className="text-xs">Item Name</Label>
          <Input value={item.name || ''} onChange={(e) => onUpdate('name', e.target.value)} disabled={!item.is_new_item && item.item_code} />
        </div>
        
        <div>
          <Label className="text-xs">Category</Label>
          <Select value={item.category || 'Equipment'} onValueChange={(value) => onUpdate('category', value)} disabled={!item.is_new_item && item.item_code}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        
        <div>
          <Label className="text-xs">Quantity</Label>
          <Input type="number" min="0" step="0.01" value={item.quantity || ''} onChange={(e) => onUpdate('quantity', e.target.value)} />
        </div>
        
        <div>
          <Label className="text-xs">Unit</Label>
          <Select value={item.unit || 'pcs'} onValueChange={(value) => onUpdate('unit', value)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {units.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        
        <div>
          <Label className="text-xs">Unit Cost (₱)</Label>
          <Input type="number" min="0" step="0.01" value={item.unit_cost || ''} onChange={(e) => onUpdate('unit_cost', e.target.value)} />
        </div>
      </div>
      
      {item.is_new_item && (
        <div className="mt-3 flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={item.is_serialized || false} onCheckedChange={(checked) => onUpdate('is_serialized', checked)} />
            Track by MAC/Serial
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={item.is_bulk || false} onCheckedChange={(checked) => onUpdate('is_bulk', checked)} />
            Track by Length
          </label>
        </div>
      )}
      
      <div className="mt-2 text-right">
        <span className="text-sm text-muted-foreground">Subtotal: </span>
        <span className="font-bold">₱{subtotal.toLocaleString()}</span>
      </div>
    </div>
  );
}

export default function PurchasingModule() {
  const [purchases, setPurchases] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  
  const [purchaseDialogOpen, setPurchaseDialogOpen] = useState(false);
  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState(null);
  
  const emptyItem = { name: '', category: 'Equipment', quantity: 1, unit: 'pcs', unit_cost: 0, is_new_item: true, is_serialized: false, item_code: '' };
  const [purchaseForm, setPurchaseForm] = useState({
    supplier_id: '', supplier_name: '', po_number: '', invoice_number: '',
    purchase_date: new Date().toISOString().split('T')[0], delivery_date: '', notes: '',
    items: [{ ...emptyItem }]
  });
  const [supplierForm, setSupplierForm] = useState({ name: '', contact_person: '', phone: '', email: '', address: '', notes: '' });
  const [paymentForm, setPaymentForm] = useState({ amount: '', payment_mode: 'cash', reference_number: '', notes: '' });

  const categories = ['Equipment', 'Cable', 'Consumable', 'Tool', 'Other'];
  const units = ['pcs', 'meters', 'rolls', 'boxes', 'sets', 'kg', 'liters'];
  const paymentModes = [{ value: 'cash', label: 'Cash' }, { value: 'bank_transfer', label: 'Bank Transfer' }, { value: 'check', label: 'Check' }, { value: 'gcash', label: 'GCash' }];

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    try {
      const results = await Promise.all([
        axios.get('/purchases'),
        axios.get('/suppliers'),
        axios.get('/purchases/stats'),
        axios.get('/inventory')
      ]);
      setPurchases(results[0].data);
      setSuppliers(results[1].data);
      setStats(results[2].data);
      setInventoryItems(results[3].data);
    } catch (error) {
      toast.error('Failed to fetch data');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreatePurchase(e) {
    e.preventDefault();
    const firstItem = purchaseForm.items[0];
    if (!firstItem || !firstItem.name) {
      toast.error('Please add at least one item');
      return;
    }
    try {
      const processedItems = purchaseForm.items.map(item => {
        const qty = parseFloat(item.quantity) || 0;
        const cost = parseFloat(item.unit_cost) || 0;
        return { ...item, quantity: qty, unit_cost: cost, total_cost: qty * cost };
      });
      const payload = {
        ...purchaseForm,
        purchase_date: new Date(purchaseForm.purchase_date).toISOString(),
        delivery_date: purchaseForm.delivery_date ? new Date(purchaseForm.delivery_date).toISOString() : null,
        items: processedItems
      };
      const response = await axios.post('/purchases', payload);
      toast.success('Purchase created: ' + response.data.purchase_id);
      setPurchaseDialogOpen(false);
      resetPurchaseForm();
      fetchAll();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create purchase');
    }
  }

  async function handleCreateSupplier(e) {
    e.preventDefault();
    try {
      await axios.post('/suppliers', supplierForm);
      toast.success('Supplier created');
      setSupplierDialogOpen(false);
      setSupplierForm({ name: '', contact_person: '', phone: '', email: '', address: '', notes: '' });
      fetchAll();
    } catch (error) {
      toast.error('Failed to create supplier');
    }
  }

  async function handleAddPayment(e) {
    e.preventDefault();
    if (!selectedPurchase) return;
    try {
      const url = '/purchases/' + selectedPurchase.purchase_id + '/payment';
      await axios.post(url, {
        amount: parseFloat(paymentForm.amount),
        payment_mode: paymentForm.payment_mode,
        reference_number: paymentForm.reference_number,
        notes: paymentForm.notes
      });
      toast.success('Payment recorded');
      setPaymentDialogOpen(false);
      setPaymentForm({ amount: '', payment_mode: 'cash', reference_number: '', notes: '' });
      fetchAll();
      const updated = await axios.get('/purchases/' + selectedPurchase.purchase_id);
      setSelectedPurchase(updated.data);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to add payment');
    }
  }

  async function handleViewPurchase(purchase) {
    try {
      const response = await axios.get('/purchases/' + purchase.purchase_id);
      setSelectedPurchase(response.data);
      setViewDialogOpen(true);
    } catch (error) {
      toast.error('Failed to fetch purchase details');
    }
  }

  function resetPurchaseForm() {
    setPurchaseForm({
      supplier_id: '', supplier_name: '', po_number: '', invoice_number: '',
      purchase_date: new Date().toISOString().split('T')[0], delivery_date: '', notes: '',
      items: [{ ...emptyItem }]
    });
  }

  function addPurchaseItem() {
    const newItems = [...purchaseForm.items, { ...emptyItem }];
    setPurchaseForm({ ...purchaseForm, items: newItems });
  }

  function removePurchaseItem(index) {
    if (purchaseForm.items.length > 1) {
      const newItems = purchaseForm.items.filter((_, i) => i !== index);
      setPurchaseForm({ ...purchaseForm, items: newItems });
    }
  }

  function updatePurchaseItem(index, field, value) {
    const newItems = [...purchaseForm.items];
    newItems[index] = { ...newItems[index], [field]: value };
    
    if (field === 'item_code' && value) {
      const existingItem = inventoryItems.find(i => i.item_code === value);
      if (existingItem) {
        newItems[index] = {
          ...newItems[index],
          name: existingItem.name,
          category: existingItem.category,
          unit: existingItem.unit,
          unit_cost: existingItem.cost_per_unit,
          is_new_item: false,
          is_serialized: existingItem.is_serialized || false,
          is_bulk: existingItem.is_bulk || false
        };
      }
    }
    if (field === 'is_new_item' && value) {
      newItems[index] = { ...newItems[index], item_code: '' };
    }
    setPurchaseForm({ ...purchaseForm, items: newItems });
  }

  function calculateTotal() {
    let total = 0;
    for (let i = 0; i < purchaseForm.items.length; i++) {
      const item = purchaseForm.items[i];
      const qty = parseFloat(item.quantity) || 0;
      const cost = parseFloat(item.unit_cost) || 0;
      total += qty * cost;
    }
    return total;
  }

  function handlePayClick(purchase) {
    setSelectedPurchase(purchase);
    const remaining = (purchase.total_amount || 0) - (purchase.amount_paid || 0);
    setPaymentForm({ amount: String(remaining), payment_mode: 'cash', reference_number: '', notes: '' });
    setPaymentDialogOpen(true);
  }

  // Filter purchases
  const filteredPurchases = purchases.filter(p => {
    const searchLower = searchTerm.toLowerCase();
    let matchesSearch = searchTerm === '';
    if (!matchesSearch) {
      if (p.purchase_id && p.purchase_id.toLowerCase().indexOf(searchLower) >= 0) matchesSearch = true;
      if (p.supplier_name && p.supplier_name.toLowerCase().indexOf(searchLower) >= 0) matchesSearch = true;
      if (p.po_number && p.po_number.toLowerCase().indexOf(searchLower) >= 0) matchesSearch = true;
    }
    const matchesStatus = statusFilter === 'all' || p.payment_status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalSpent = stats.total_spent || 0;
  const monthlyTotal = stats.monthly_total || 0;
  const monthlyCount = stats.monthly_count || 0;
  const unpaidAmount = stats.unpaid_amount || 0;
  const supplierCount = suppliers.length;
  const purchaseCount = purchases.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-heading font-bold">Purchasing</h2>
          <p className="text-muted-foreground mt-1">Manage purchases and suppliers</p>
        </div>
        <div className="flex gap-2">
          {/* Supplier Dialog */}
          <Dialog open={supplierDialogOpen} onOpenChange={setSupplierDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline"><Building2 className="h-4 w-4 mr-2" />Add Supplier</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Supplier</DialogTitle>
                <DialogDescription>Enter supplier/vendor details</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateSupplier} className="space-y-4">
                <div><Label>Supplier Name *</Label><Input value={supplierForm.name} onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })} required /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Contact Person</Label><Input value={supplierForm.contact_person} onChange={(e) => setSupplierForm({ ...supplierForm, contact_person: e.target.value })} /></div>
                  <div><Label>Phone</Label><Input value={supplierForm.phone} onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })} /></div>
                </div>
                <div><Label>Email</Label><Input type="email" value={supplierForm.email} onChange={(e) => setSupplierForm({ ...supplierForm, email: e.target.value })} /></div>
                <div><Label>Address</Label><Input value={supplierForm.address} onChange={(e) => setSupplierForm({ ...supplierForm, address: e.target.value })} /></div>
                <Button type="submit" className="w-full">Create Supplier</Button>
              </form>
            </DialogContent>
          </Dialog>
          
          {/* Purchase Dialog */}
          <Dialog open={purchaseDialogOpen} onOpenChange={setPurchaseDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />New Purchase</Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create New Purchase</DialogTitle>
                <DialogDescription>Record a new purchase from supplier</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreatePurchase} className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Supplier</Label>
                    <Select value={purchaseForm.supplier_id} onValueChange={(value) => {
                      const supplier = suppliers.find(s => s.supplier_id === value);
                      setPurchaseForm({ ...purchaseForm, supplier_id: value, supplier_name: supplier ? supplier.name : '' });
                    }}>
                      <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                      <SelectContent>
                        {suppliers.map(s => <SelectItem key={s.supplier_id} value={s.supplier_id}>{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Or Enter Supplier Name</Label><Input value={purchaseForm.supplier_name} onChange={(e) => setPurchaseForm({ ...purchaseForm, supplier_name: e.target.value, supplier_id: '' })} /></div>
                </div>
                
                <div className="grid grid-cols-4 gap-4">
                  <div><Label>PO Number</Label><Input value={purchaseForm.po_number} onChange={(e) => setPurchaseForm({ ...purchaseForm, po_number: e.target.value })} /></div>
                  <div><Label>Invoice Number</Label><Input value={purchaseForm.invoice_number} onChange={(e) => setPurchaseForm({ ...purchaseForm, invoice_number: e.target.value })} /></div>
                  <div><Label>Purchase Date</Label><Input type="date" value={purchaseForm.purchase_date} onChange={(e) => setPurchaseForm({ ...purchaseForm, purchase_date: e.target.value })} /></div>
                  <div><Label>Delivery Date</Label><Input type="date" value={purchaseForm.delivery_date} onChange={(e) => setPurchaseForm({ ...purchaseForm, delivery_date: e.target.value })} /></div>
                </div>
                
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <Label className="text-lg">Purchase Items</Label>
                    <Button type="button" variant="outline" size="sm" onClick={addPurchaseItem}><Plus className="h-4 w-4 mr-1" />Add Item</Button>
                  </div>
                  
                  <div className="space-y-4">
                    {purchaseForm.items.map((item, index) => (
                      <PurchaseItemRow
                        key={index}
                        item={item}
                        index={index}
                        isNew={item.is_new_item}
                        inventoryItems={inventoryItems}
                        categories={categories}
                        units={units}
                        onUpdate={(field, value) => updatePurchaseItem(index, field, value)}
                        onRemove={() => removePurchaseItem(index)}
                        canRemove={purchaseForm.items.length > 1}
                      />
                    ))}
                  </div>
                </div>
                
                <div className="flex justify-between items-center p-4 bg-primary/10 rounded-lg">
                  <span className="text-lg font-medium">Total Amount</span>
                  <span className="text-2xl font-bold text-primary">₱{calculateTotal().toLocaleString()}</span>
                </div>
                
                <div><Label>Notes</Label><Input value={purchaseForm.notes} onChange={(e) => setPurchaseForm({ ...purchaseForm, notes: e.target.value })} /></div>
                
                <Button type="submit" className="w-full" size="lg"><ShoppingCart className="h-4 w-4 mr-2" />Create Purchase</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <StatsCard title="Total Spent" value={'₱' + totalSpent.toLocaleString()} icon={DollarSign} description="All time purchases" />
        <StatsCard title="This Month" value={'₱' + monthlyTotal.toLocaleString()} icon={Calendar} description={monthlyCount + ' purchases'} />
        <StatsCard title="Unpaid Amount" value={'₱' + unpaidAmount.toLocaleString()} icon={AlertCircle} description="Pending payments" valueClass="text-red-600" />
        <StatsCard title="Suppliers" value={supplierCount} icon={Building2} description="Registered vendors" />
      </div>

      {/* Purchases List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Purchase Orders</CardTitle>
              <CardDescription>{purchaseCount} total purchases</CardDescription>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-9 w-[250px]" placeholder="Search PO, supplier..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[150px]"><SelectValue placeholder="Filter status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="unpaid">Unpaid</SelectItem>
                  <SelectItem value="partial">Partial</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : filteredPurchases.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground"><ShoppingCart className="h-12 w-12 mx-auto mb-4 opacity-50" /><p>No purchases found</p></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Purchase ID</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>PO #</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Paid</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPurchases.map((purchase) => (
                  <PurchaseRow 
                    key={purchase.purchase_id} 
                    purchase={purchase} 
                    onView={handleViewPurchase}
                    onPay={handlePayClick}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* View Purchase Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Purchase Details - {selectedPurchase ? selectedPurchase.purchase_id : ''}</DialogTitle></DialogHeader>
          {selectedPurchase && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div><Label className="text-xs text-muted-foreground">Supplier</Label><p className="font-medium">{selectedPurchase.supplier_name || '-'}</p></div>
                <div><Label className="text-xs text-muted-foreground">Status</Label><p><StatusBadge status={selectedPurchase.payment_status} /></p></div>
                <div><Label className="text-xs text-muted-foreground">PO Number</Label><p className="font-medium">{selectedPurchase.po_number || '-'}</p></div>
                <div><Label className="text-xs text-muted-foreground">Invoice Number</Label><p className="font-medium">{selectedPurchase.invoice_number || '-'}</p></div>
                <div><Label className="text-xs text-muted-foreground">Purchase Date</Label><p className="font-medium">{new Date(selectedPurchase.purchase_date).toLocaleDateString()}</p></div>
                <div><Label className="text-xs text-muted-foreground">Delivery Date</Label><p className="font-medium">{selectedPurchase.delivery_date ? new Date(selectedPurchase.delivery_date).toLocaleDateString() : '-'}</p></div>
              </div>
              
              <div>
                <Label className="text-lg mb-3 block">Items Purchased</Label>
                <Table>
                  <TableHeader><TableRow><TableHead>Item</TableHead><TableHead>Category</TableHead><TableHead>Qty</TableHead><TableHead>Unit Cost</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {selectedPurchase.items && selectedPurchase.items.map((item, index) => (
                      <TableRow key={index}>
                        <TableCell><div><p className="font-medium">{item.name}</p><p className="text-xs text-muted-foreground font-mono">{item.item_code}</p></div></TableCell>
                        <TableCell>{item.category}</TableCell>
                        <TableCell>{item.quantity} {item.unit}</TableCell>
                        <TableCell>₱{(item.unit_cost || 0).toLocaleString()}</TableCell>
                        <TableCell className="text-right font-bold">₱{(item.total_cost || 0).toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="mt-4 text-right"><span className="text-lg">Total: </span><span className="text-2xl font-bold text-primary">₱{(selectedPurchase.total_amount || 0).toLocaleString()}</span></div>
              </div>
              
              <div>
                <div className="flex items-center justify-between mb-3">
                  <Label className="text-lg">Payment History</Label>
                  {selectedPurchase.payment_status !== 'paid' && (
                    <Button size="sm" onClick={() => handlePayClick(selectedPurchase)}><Plus className="h-4 w-4 mr-1" />Add Payment</Button>
                  )}
                </div>
                {selectedPurchase.payments && selectedPurchase.payments.length > 0 ? (
                  <Table>
                    <TableHeader><TableRow><TableHead>Payment ID</TableHead><TableHead>Amount</TableHead><TableHead>Mode</TableHead><TableHead>Reference</TableHead><TableHead>Date</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {selectedPurchase.payments.map((payment, index) => (
                        <TableRow key={index}>
                          <TableCell className="font-mono text-xs">{payment.payment_id}</TableCell>
                          <TableCell className="font-bold text-green-600">₱{(payment.amount || 0).toLocaleString()}</TableCell>
                          <TableCell className="capitalize">{payment.payment_mode}</TableCell>
                          <TableCell>{payment.reference_number || '-'}</TableCell>
                          <TableCell>{new Date(payment.payment_date).toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-center py-4 text-muted-foreground">No payments recorded</p>
                )}
                <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg flex justify-between">
                  <div><p className="text-sm text-muted-foreground">Amount Paid</p><p className="text-xl font-bold text-green-600">₱{(selectedPurchase.amount_paid || 0).toLocaleString()}</p></div>
                  <div className="text-right"><p className="text-sm text-muted-foreground">Remaining Balance</p><p className="text-xl font-bold text-red-600">₱{Math.max(0, (selectedPurchase.total_amount || 0) - (selectedPurchase.amount_paid || 0)).toLocaleString()}</p></div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Payment Dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Payment</DialogTitle><DialogDescription>Record payment for {selectedPurchase ? selectedPurchase.purchase_id : ''}</DialogDescription></DialogHeader>
          <form onSubmit={handleAddPayment} className="space-y-4">
            {selectedPurchase && (
              <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                <div className="flex justify-between text-sm"><span>Total Amount:</span><span className="font-bold">₱{(selectedPurchase.total_amount || 0).toLocaleString()}</span></div>
                <div className="flex justify-between text-sm"><span>Already Paid:</span><span className="text-green-600">₱{(selectedPurchase.amount_paid || 0).toLocaleString()}</span></div>
                <div className="flex justify-between text-sm font-bold border-t mt-2 pt-2"><span>Remaining:</span><span className="text-red-600">₱{Math.max(0, (selectedPurchase.total_amount || 0) - (selectedPurchase.amount_paid || 0)).toLocaleString()}</span></div>
              </div>
            )}
            <div><Label>Payment Amount (₱)</Label><Input type="number" min="0" step="0.01" value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} required /></div>
            <div>
              <Label>Payment Mode</Label>
              <Select value={paymentForm.payment_mode} onValueChange={(value) => setPaymentForm({ ...paymentForm, payment_mode: value })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {paymentModes.map(mode => <SelectItem key={mode.value} value={mode.value}>{mode.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Reference Number</Label><Input value={paymentForm.reference_number} onChange={(e) => setPaymentForm({ ...paymentForm, reference_number: e.target.value })} /></div>
            <div><Label>Notes</Label><Input value={paymentForm.notes} onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })} /></div>
            <Button type="submit" className="w-full"><CreditCard className="h-4 w-4 mr-2" />Record Payment</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
