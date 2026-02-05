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
import { Plus, Search, ShoppingCart, DollarSign, Building2, Loader2, Eye, CreditCard, Trash2, Calendar, CheckCircle, Clock, AlertCircle } from 'lucide-react';

// Helper to get status badge
const getStatusBadge = (status) => {
  if (status === 'paid') return <Badge className="bg-green-600"><CheckCircle className="h-3 w-3 mr-1" />Paid</Badge>;
  if (status === 'partial') return <Badge className="bg-amber-600"><Clock className="h-3 w-3 mr-1" />Partial</Badge>;
  if (status === 'unpaid') return <Badge variant="destructive"><AlertCircle className="h-3 w-3 mr-1" />Unpaid</Badge>;
  return <Badge>{status}</Badge>;
};

const CATEGORIES = ['Equipment', 'Cable', 'Consumable', 'Tool', 'Other'];
const UNITS = ['pcs', 'meters', 'rolls', 'boxes', 'sets', 'kg', 'liters'];
const PAYMENT_MODES = [
  { value: 'cash', label: 'Cash' }, 
  { value: 'bank_transfer', label: 'Bank Transfer' }, 
  { value: 'check', label: 'Check' }, 
  { value: 'gcash', label: 'GCash' }
];

const emptyItem = () => ({ 
  name: '', category: 'Equipment', quantity: 1, unit: 'pcs', 
  unit_cost: 0, is_new_item: true, is_serialized: false, item_code: '' 
});

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
  
  const [purchaseForm, setPurchaseForm] = useState({
    supplier_id: '', supplier_name: '', po_number: '', invoice_number: '',
    purchase_date: new Date().toISOString().split('T')[0], delivery_date: '', notes: '',
    items: [emptyItem()]
  });
  const [supplierForm, setSupplierForm] = useState({ name: '', contact_person: '', phone: '', email: '', address: '', notes: '' });
  const [paymentForm, setPaymentForm] = useState({ amount: '', payment_mode: 'cash', reference_number: '', notes: '' });

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [p, s, st, i] = await Promise.all([
        axios.get('/purchases'),
        axios.get('/suppliers'),
        axios.get('/purchases/stats'),
        axios.get('/inventory')
      ]);
      setPurchases(p.data || []);
      setSuppliers(s.data || []);
      setStats(st.data || {});
      setInventoryItems(i.data || []);
    } catch (e) {
      toast.error('Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  const resetPurchaseForm = () => {
    setPurchaseForm({
      supplier_id: '', supplier_name: '', po_number: '', invoice_number: '',
      purchase_date: new Date().toISOString().split('T')[0], delivery_date: '', notes: '',
      items: [emptyItem()]
    });
  };

  const handleCreatePurchase = async (e) => {
    e.preventDefault();
    const first = purchaseForm.items[0];
    if (!first || !first.name) {
      toast.error('Please add at least one item');
      return;
    }
    try {
      const processedItems = [];
      for (const item of purchaseForm.items) {
        const qty = parseFloat(item.quantity) || 0;
        const cost = parseFloat(item.unit_cost) || 0;
        processedItems.push({ ...item, quantity: qty, unit_cost: cost, total_cost: qty * cost });
      }
      const payload = {
        ...purchaseForm,
        purchase_date: new Date(purchaseForm.purchase_date).toISOString(),
        delivery_date: purchaseForm.delivery_date ? new Date(purchaseForm.delivery_date).toISOString() : null,
        items: processedItems
      };
      const res = await axios.post('/purchases', payload);
      toast.success('Purchase created: ' + res.data.purchase_id);
      setPurchaseDialogOpen(false);
      resetPurchaseForm();
      fetchAll();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to create purchase');
    }
  };

  const handleCreateSupplier = async (e) => {
    e.preventDefault();
    try {
      await axios.post('/suppliers', supplierForm);
      toast.success('Supplier created');
      setSupplierDialogOpen(false);
      setSupplierForm({ name: '', contact_person: '', phone: '', email: '', address: '', notes: '' });
      fetchAll();
    } catch (e) {
      toast.error('Failed to create supplier');
    }
  };

  const handleAddPayment = async (e) => {
    e.preventDefault();
    if (!selectedPurchase) return;
    try {
      await axios.post('/purchases/' + selectedPurchase.purchase_id + '/payment', {
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
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to add payment');
    }
  };

  const handleViewPurchase = async (purchase) => {
    try {
      const res = await axios.get('/purchases/' + purchase.purchase_id);
      setSelectedPurchase(res.data);
      setViewDialogOpen(true);
    } catch (e) {
      toast.error('Failed to fetch purchase details');
    }
  };

  const handlePayClick = (purchase) => {
    setSelectedPurchase(purchase);
    const remaining = (purchase.total_amount || 0) - (purchase.amount_paid || 0);
    setPaymentForm({ amount: String(remaining), payment_mode: 'cash', reference_number: '', notes: '' });
    setPaymentDialogOpen(true);
  };

  const addPurchaseItem = () => {
    setPurchaseForm({ ...purchaseForm, items: [...purchaseForm.items, emptyItem()] });
  };

  const removePurchaseItem = (index) => {
    if (purchaseForm.items.length > 1) {
      const newItems = purchaseForm.items.filter((_, i) => i !== index);
      setPurchaseForm({ ...purchaseForm, items: newItems });
    }
  };

  const updatePurchaseItem = (index, field, value) => {
    const newItems = [...purchaseForm.items];
    newItems[index] = { ...newItems[index], [field]: value };
    
    if (field === 'item_code' && value) {
      const found = inventoryItems.find(i => i.item_code === value);
      if (found) {
        newItems[index] = {
          ...newItems[index],
          name: found.name,
          category: found.category,
          unit: found.unit,
          unit_cost: found.cost_per_unit,
          is_new_item: false,
          is_serialized: found.is_serialized || false,
          is_bulk: found.is_bulk || false
        };
      }
    }
    if (field === 'is_new_item' && value) {
      newItems[index] = { ...newItems[index], item_code: '' };
    }
    setPurchaseForm({ ...purchaseForm, items: newItems });
  };

  const calculateTotal = () => {
    let total = 0;
    for (const item of purchaseForm.items) {
      total += (parseFloat(item.quantity) || 0) * (parseFloat(item.unit_cost) || 0);
    }
    return total;
  };

  const filtered = purchases.filter(p => {
    const s = searchTerm.toLowerCase();
    let matchS = !searchTerm;
    if (p.purchase_id && p.purchase_id.toLowerCase().indexOf(s) >= 0) matchS = true;
    if (p.supplier_name && p.supplier_name.toLowerCase().indexOf(s) >= 0) matchS = true;
    if (p.po_number && p.po_number.toLowerCase().indexOf(s) >= 0) matchS = true;
    const matchF = statusFilter === 'all' || p.payment_status === statusFilter;
    return matchS && matchF;
  });

  const totalSpent = stats.total_spent || 0;
  const monthlyTotal = stats.monthly_total || 0;
  const monthlyCount = stats.monthly_count || 0;
  const unpaidAmount = stats.unpaid_amount || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-heading font-bold">Purchasing</h2>
          <p className="text-muted-foreground mt-1">Manage purchases and suppliers</p>
        </div>
        <div className="flex gap-2">
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
                    <Select value={purchaseForm.supplier_id} onValueChange={(v) => {
                      const sup = suppliers.find(x => x.supplier_id === v);
                      setPurchaseForm({ ...purchaseForm, supplier_id: v, supplier_name: sup ? sup.name : '' });
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
                
                {/* Items Section */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <Label className="text-lg">Purchase Items</Label>
                    <Button type="button" variant="outline" size="sm" onClick={addPurchaseItem}><Plus className="h-4 w-4 mr-1" />Add Item</Button>
                  </div>
                  
                  <div className="space-y-4">
                    {purchaseForm.items.map((item, idx) => {
                      const itemSubtotal = (parseFloat(item.quantity) || 0) * (parseFloat(item.unit_cost) || 0);
                      return (
                        <div key={idx} className="p-4 border rounded-lg bg-gray-50 dark:bg-gray-900">
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-sm font-medium">Item {idx + 1}</span>
                            <div className="flex items-center gap-4">
                              <label className="flex items-center gap-2 text-sm">
                                <Checkbox checked={item.is_new_item} onCheckedChange={(c) => updatePurchaseItem(idx, 'is_new_item', c)} />New
                              </label>
                              {purchaseForm.items.length > 1 && (
                                <Button type="button" variant="ghost" size="sm" onClick={() => removePurchaseItem(idx)}><Trash2 className="h-4 w-4 text-red-600" /></Button>
                              )}
                            </div>
                          </div>
                          <div className="grid grid-cols-6 gap-3">
                            {!item.is_new_item && (
                              <div className="col-span-2">
                                <Label className="text-xs">Existing Item</Label>
                                <Select value={item.item_code || ''} onValueChange={(v) => updatePurchaseItem(idx, 'item_code', v)}>
                                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                                  <SelectContent>
                                    {inventoryItems.map(inv => <SelectItem key={inv.item_code} value={inv.item_code}>{inv.name}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              </div>
                            )}
                            <div className={item.is_new_item ? "col-span-2" : ""}>
                              <Label className="text-xs">Name</Label>
                              <Input value={item.name} onChange={(e) => updatePurchaseItem(idx, 'name', e.target.value)} disabled={!item.is_new_item && item.item_code} />
                            </div>
                            <div>
                              <Label className="text-xs">Category</Label>
                              <Select value={item.category} onValueChange={(v) => updatePurchaseItem(idx, 'category', v)} disabled={!item.is_new_item && item.item_code}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                              </Select>
                            </div>
                            <div><Label className="text-xs">Qty</Label><Input type="number" min="0" value={item.quantity} onChange={(e) => updatePurchaseItem(idx, 'quantity', e.target.value)} /></div>
                            <div>
                              <Label className="text-xs">Unit</Label>
                              <Select value={item.unit} onValueChange={(v) => updatePurchaseItem(idx, 'unit', v)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>{UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                              </Select>
                            </div>
                            <div><Label className="text-xs">Cost (₱)</Label><Input type="number" min="0" value={item.unit_cost} onChange={(e) => updatePurchaseItem(idx, 'unit_cost', e.target.value)} /></div>
                          </div>
                          {item.is_new_item && (
                            <div className="mt-3 flex gap-4">
                              <label className="flex items-center gap-2 text-sm"><Checkbox checked={item.is_serialized} onCheckedChange={(c) => updatePurchaseItem(idx, 'is_serialized', c)} />MAC/Serial</label>
                              <label className="flex items-center gap-2 text-sm"><Checkbox checked={item.is_bulk} onCheckedChange={(c) => updatePurchaseItem(idx, 'is_bulk', c)} />Length</label>
                            </div>
                          )}
                          <div className="mt-2 text-right text-sm"><span className="text-muted-foreground">Subtotal: </span><span className="font-bold">₱{itemSubtotal.toLocaleString()}</span></div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                
                <div className="flex justify-between items-center p-4 bg-primary/10 rounded-lg">
                  <span className="text-lg font-medium">Total</span>
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
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Total Spent</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">₱{totalSpent.toLocaleString()}</div><p className="text-xs text-muted-foreground">All time</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">This Month</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">₱{monthlyTotal.toLocaleString()}</div><p className="text-xs text-muted-foreground">{monthlyCount} purchases</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Unpaid</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-red-600">₱{unpaidAmount.toLocaleString()}</div><p className="text-xs text-muted-foreground">Pending</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Suppliers</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{suppliers.length}</div><p className="text-xs text-muted-foreground">Vendors</p></CardContent></Card>
      </div>

      {/* Purchases Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div><CardTitle>Purchase Orders</CardTitle><CardDescription>{purchases.length} total</CardDescription></div>
            <div className="flex gap-3">
              <div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9 w-[200px]" placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} /></div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="unpaid">Unpaid</SelectItem>
                  <SelectItem value="partial">Partial</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div> : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground"><ShoppingCart className="h-12 w-12 mx-auto mb-4 opacity-50" /><p>No purchases</p></div>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>ID</TableHead><TableHead>Supplier</TableHead><TableHead>PO#</TableHead><TableHead>Date</TableHead><TableHead>Items</TableHead><TableHead>Total</TableHead><TableHead>Paid</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
              <TableBody>
                {filtered.map((p) => (
                  <TableRow key={p.purchase_id}>
                    <TableCell className="font-mono text-xs">{p.purchase_id}</TableCell>
                    <TableCell>{p.supplier_name || '-'}</TableCell>
                    <TableCell>{p.po_number || '-'}</TableCell>
                    <TableCell>{new Date(p.purchase_date).toLocaleDateString()}</TableCell>
                    <TableCell>{p.items ? p.items.length : 0}</TableCell>
                    <TableCell className="font-bold">₱{(p.total_amount || 0).toLocaleString()}</TableCell>
                    <TableCell className="text-green-600">₱{(p.amount_paid || 0).toLocaleString()}</TableCell>
                    <TableCell>{getStatusBadge(p.payment_status)}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => handleViewPurchase(p)}><Eye className="h-4 w-4 text-blue-600" /></Button>
                      {p.payment_status !== 'paid' && <Button variant="ghost" size="icon" onClick={() => handlePayClick(p)}><CreditCard className="h-4 w-4 text-green-600" /></Button>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* View Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Purchase Details</DialogTitle></DialogHeader>
          {selectedPurchase && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-muted-foreground">Supplier:</span> <span className="font-medium">{selectedPurchase.supplier_name || '-'}</span></div>
                <div><span className="text-muted-foreground">Status:</span> {getStatusBadge(selectedPurchase.payment_status)}</div>
                <div><span className="text-muted-foreground">PO:</span> <span className="font-medium">{selectedPurchase.po_number || '-'}</span></div>
                <div><span className="text-muted-foreground">Invoice:</span> <span className="font-medium">{selectedPurchase.invoice_number || '-'}</span></div>
              </div>
              <Table>
                <TableHeader><TableRow><TableHead>Item</TableHead><TableHead>Qty</TableHead><TableHead>Cost</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
                <TableBody>
                  {selectedPurchase.items && selectedPurchase.items.map((item, i) => (
                    <TableRow key={i}><TableCell>{item.name}</TableCell><TableCell>{item.quantity} {item.unit}</TableCell><TableCell>₱{(item.unit_cost||0).toLocaleString()}</TableCell><TableCell className="text-right font-bold">₱{(item.total_cost||0).toLocaleString()}</TableCell></TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="text-right text-lg font-bold">Total: ₱{(selectedPurchase.total_amount||0).toLocaleString()}</div>
              <div className="flex justify-between p-3 bg-gray-50 rounded">
                <div><span className="text-muted-foreground">Paid:</span> <span className="text-green-600 font-bold">₱{(selectedPurchase.amount_paid||0).toLocaleString()}</span></div>
                <div><span className="text-muted-foreground">Remaining:</span> <span className="text-red-600 font-bold">₱{Math.max(0,(selectedPurchase.total_amount||0)-(selectedPurchase.amount_paid||0)).toLocaleString()}</span></div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Payment</DialogTitle></DialogHeader>
          <form onSubmit={handleAddPayment} className="space-y-4">
            <div><Label>Amount (₱)</Label><Input type="number" min="0" value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} required /></div>
            <div>
              <Label>Mode</Label>
              <Select value={paymentForm.payment_mode} onValueChange={(v) => setPaymentForm({ ...paymentForm, payment_mode: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PAYMENT_MODES.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Reference</Label><Input value={paymentForm.reference_number} onChange={(e) => setPaymentForm({ ...paymentForm, reference_number: e.target.value })} /></div>
            <Button type="submit" className="w-full"><CreditCard className="h-4 w-4 mr-2" />Record Payment</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
