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
import { Plus, Search, ShoppingCart, DollarSign, Building2, Loader2, Eye, CreditCard, Trash2, CheckCircle, Clock, AlertCircle } from 'lucide-react';

const CATEGORIES = ['Equipment', 'Cable', 'Consumable', 'Tool', 'Other'];
const UNITS = ['pcs', 'meters', 'rolls', 'boxes', 'sets', 'kg', 'liters'];
const PAYMENT_MODES = [{ value: 'cash', label: 'Cash' }, { value: 'bank_transfer', label: 'Bank Transfer' }, { value: 'check', label: 'Check' }, { value: 'gcash', label: 'GCash' }];

function StatusBadge({ status }) {
  if (status === 'paid') return <Badge className="bg-green-600"><CheckCircle className="h-3 w-3 mr-1" />Paid</Badge>;
  if (status === 'partial') return <Badge className="bg-amber-600"><Clock className="h-3 w-3 mr-1" />Partial</Badge>;
  if (status === 'unpaid') return <Badge variant="destructive"><AlertCircle className="h-3 w-3 mr-1" />Unpaid</Badge>;
  return <Badge>{status}</Badge>;
}

function SupplierSelect({ suppliers, value, onChange }) {
  const options = [];
  for (let i = 0; i < suppliers.length; i++) {
    const s = suppliers[i];
    options.push(<SelectItem key={s.supplier_id} value={s.supplier_id}>{s.name}</SelectItem>);
  }
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
      <SelectContent>{options}</SelectContent>
    </Select>
  );
}

function InventorySelect({ items, value, onChange }) {
  const options = [];
  for (let i = 0; i < items.length; i++) {
    const inv = items[i];
    options.push(<SelectItem key={inv.item_code} value={inv.item_code}>{inv.name}</SelectItem>);
  }
  return (
    <Select value={value || ''} onValueChange={onChange}>
      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
      <SelectContent>{options}</SelectContent>
    </Select>
  );
}

function CategorySelect({ value, onChange, disabled }) {
  const options = [];
  for (let i = 0; i < CATEGORIES.length; i++) {
    options.push(<SelectItem key={CATEGORIES[i]} value={CATEGORIES[i]}>{CATEGORIES[i]}</SelectItem>);
  }
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger><SelectValue /></SelectTrigger>
      <SelectContent>{options}</SelectContent>
    </Select>
  );
}

function UnitSelect({ value, onChange }) {
  const options = [];
  for (let i = 0; i < UNITS.length; i++) {
    options.push(<SelectItem key={UNITS[i]} value={UNITS[i]}>{UNITS[i]}</SelectItem>);
  }
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger><SelectValue /></SelectTrigger>
      <SelectContent>{options}</SelectContent>
    </Select>
  );
}

function PaymentModeSelect({ value, onChange }) {
  const options = [];
  for (let i = 0; i < PAYMENT_MODES.length; i++) {
    const m = PAYMENT_MODES[i];
    options.push(<SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>);
  }
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger><SelectValue /></SelectTrigger>
      <SelectContent>{options}</SelectContent>
    </Select>
  );
}

function PurchaseItemForm({ item, index, inventoryItems, onUpdate, onRemove, canRemove }) {
  const qty = parseFloat(item.quantity) || 0;
  const cost = parseFloat(item.unit_cost) || 0;
  const subtotal = qty * cost;
  
  return (
    <div className="p-4 border rounded-lg bg-gray-50 dark:bg-gray-900">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium">Item {index + 1}</span>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={item.is_new_item} onCheckedChange={(c) => onUpdate('is_new_item', c)} />New
          </label>
          {canRemove && (
            <Button type="button" variant="ghost" size="sm" onClick={onRemove}><Trash2 className="h-4 w-4 text-red-600" /></Button>
          )}
        </div>
      </div>
      <div className="grid grid-cols-6 gap-3">
        {!item.is_new_item && (
          <div className="col-span-2">
            <Label className="text-xs">Existing Item</Label>
            <InventorySelect items={inventoryItems} value={item.item_code} onChange={(v) => onUpdate('item_code', v)} />
          </div>
        )}
        <div className={item.is_new_item ? "col-span-2" : ""}>
          <Label className="text-xs">Name</Label>
          <Input value={item.name} onChange={(e) => onUpdate('name', e.target.value)} disabled={!item.is_new_item && item.item_code} />
        </div>
        <div>
          <Label className="text-xs">Category</Label>
          <CategorySelect value={item.category} onChange={(v) => onUpdate('category', v)} disabled={!item.is_new_item && item.item_code} />
        </div>
        <div><Label className="text-xs">Qty</Label><Input type="number" min="0" value={item.quantity} onChange={(e) => onUpdate('quantity', e.target.value)} /></div>
        <div><Label className="text-xs">Unit</Label><UnitSelect value={item.unit} onChange={(v) => onUpdate('unit', v)} /></div>
        <div><Label className="text-xs">Cost (₱)</Label><Input type="number" min="0" value={item.unit_cost} onChange={(e) => onUpdate('unit_cost', e.target.value)} /></div>
      </div>
      {item.is_new_item && (
        <div className="mt-3 flex gap-4">
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={item.is_serialized} onCheckedChange={(c) => onUpdate('is_serialized', c)} />MAC/Serial</label>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={item.is_bulk} onCheckedChange={(c) => onUpdate('is_bulk', c)} />Length</label>
        </div>
      )}
      <div className="mt-2 text-right text-sm"><span className="text-muted-foreground">Subtotal: </span><span className="font-bold">₱{subtotal.toLocaleString()}</span></div>
    </div>
  );
}

function PurchaseRow({ purchase, onView, onPay }) {
  const itemCount = purchase.items ? purchase.items.length : 0;
  const total = purchase.total_amount || 0;
  const paid = purchase.amount_paid || 0;
  const dateStr = new Date(purchase.purchase_date).toLocaleDateString();
  
  return (
    <TableRow>
      <TableCell className="font-mono text-xs">{purchase.purchase_id}</TableCell>
      <TableCell>{purchase.supplier_name || '-'}</TableCell>
      <TableCell>{purchase.po_number || '-'}</TableCell>
      <TableCell>{dateStr}</TableCell>
      <TableCell>{itemCount}</TableCell>
      <TableCell className="font-bold">₱{total.toLocaleString()}</TableCell>
      <TableCell className="text-green-600">₱{paid.toLocaleString()}</TableCell>
      <TableCell><StatusBadge status={purchase.payment_status} /></TableCell>
      <TableCell className="text-right">
        <Button variant="ghost" size="icon" onClick={() => onView(purchase)}><Eye className="h-4 w-4 text-blue-600" /></Button>
        {purchase.payment_status !== 'paid' && <Button variant="ghost" size="icon" onClick={() => onPay(purchase)}><CreditCard className="h-4 w-4 text-green-600" /></Button>}
      </TableCell>
    </TableRow>
  );
}

function PurchasesList({ purchases, loading, onView, onPay }) {
  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }
  if (purchases.length === 0) {
    return <div className="text-center py-12 text-muted-foreground"><ShoppingCart className="h-12 w-12 mx-auto mb-4 opacity-50" /><p>No purchases</p></div>;
  }
  
  const rows = [];
  for (let i = 0; i < purchases.length; i++) {
    rows.push(<PurchaseRow key={purchases[i].purchase_id} purchase={purchases[i]} onView={onView} onPay={onPay} />);
  }
  
  return (
    <Table>
      <TableHeader><TableRow><TableHead>ID</TableHead><TableHead>Supplier</TableHead><TableHead>PO#</TableHead><TableHead>Date</TableHead><TableHead>Items</TableHead><TableHead>Total</TableHead><TableHead>Paid</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
      <TableBody>{rows}</TableBody>
    </Table>
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

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [p, s, st, i] = await Promise.all([axios.get('/purchases'), axios.get('/suppliers'), axios.get('/purchases/stats'), axios.get('/inventory')]);
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
      items: [{ ...emptyItem }]
    });
  };

  const handleCreatePurchase = async (e) => {
    e.preventDefault();
    if (!purchaseForm.items[0] || !purchaseForm.items[0].name) {
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
      toast.error(e.response?.data?.detail || 'Failed');
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
      toast.error('Failed');
    }
  };

  const handleAddPayment = async (e) => {
    e.preventDefault();
    if (!selectedPurchase) return;
    try {
      await axios.post('/purchases/' + selectedPurchase.purchase_id + '/payment', {
        amount: parseFloat(paymentForm.amount), payment_mode: paymentForm.payment_mode,
        reference_number: paymentForm.reference_number, notes: paymentForm.notes
      });
      toast.success('Payment recorded');
      setPaymentDialogOpen(false);
      setPaymentForm({ amount: '', payment_mode: 'cash', reference_number: '', notes: '' });
      fetchAll();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed');
    }
  };

  const handleViewPurchase = async (purchase) => {
    try {
      const res = await axios.get('/purchases/' + purchase.purchase_id);
      setSelectedPurchase(res.data);
      setViewDialogOpen(true);
    } catch (e) {
      toast.error('Failed');
    }
  };

  const handlePayClick = (purchase) => {
    setSelectedPurchase(purchase);
    const remaining = (purchase.total_amount || 0) - (purchase.amount_paid || 0);
    setPaymentForm({ amount: String(remaining), payment_mode: 'cash', reference_number: '', notes: '' });
    setPaymentDialogOpen(true);
  };

  const addPurchaseItem = () => {
    setPurchaseForm({ ...purchaseForm, items: [...purchaseForm.items, { ...emptyItem }] });
  };

  const removePurchaseItem = (index) => {
    if (purchaseForm.items.length > 1) {
      setPurchaseForm({ ...purchaseForm, items: purchaseForm.items.filter((_, i) => i !== index) });
    }
  };

  const updatePurchaseItem = (index, field, value) => {
    const newItems = [...purchaseForm.items];
    newItems[index] = { ...newItems[index], [field]: value };
    if (field === 'item_code' && value) {
      const found = inventoryItems.find(i => i.item_code === value);
      if (found) {
        newItems[index] = { ...newItems[index], name: found.name, category: found.category, unit: found.unit, unit_cost: found.cost_per_unit, is_new_item: false, is_serialized: found.is_serialized || false, is_bulk: found.is_bulk || false };
      }
    }
    if (field === 'is_new_item' && value) newItems[index] = { ...newItems[index], item_code: '' };
    setPurchaseForm({ ...purchaseForm, items: newItems });
  };

  const calculateTotal = () => {
    let total = 0;
    for (const item of purchaseForm.items) total += (parseFloat(item.quantity) || 0) * (parseFloat(item.unit_cost) || 0);
    return total;
  };

  // Filter
  const filtered = [];
  for (const p of purchases) {
    const s = searchTerm.toLowerCase();
    let matchS = !searchTerm || (p.purchase_id && p.purchase_id.toLowerCase().indexOf(s) >= 0) || (p.supplier_name && p.supplier_name.toLowerCase().indexOf(s) >= 0) || (p.po_number && p.po_number.toLowerCase().indexOf(s) >= 0);
    const matchF = statusFilter === 'all' || p.payment_status === statusFilter;
    if (matchS && matchF) filtered.push(p);
  }

  // Build item forms
  const itemForms = [];
  for (let i = 0; i < purchaseForm.items.length; i++) {
    const item = purchaseForm.items[i];
    itemForms.push(
      <PurchaseItemForm key={i} item={item} index={i} inventoryItems={inventoryItems}
        onUpdate={(f, v) => updatePurchaseItem(i, f, v)} onRemove={() => removePurchaseItem(i)} canRemove={purchaseForm.items.length > 1} />
    );
  }

  const totalSpent = stats.total_spent || 0;
  const monthlyTotal = stats.monthly_total || 0;
  const monthlyCount = stats.monthly_count || 0;
  const unpaidAmount = stats.unpaid_amount || 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-heading font-bold">Purchasing</h2>
          <p className="text-muted-foreground mt-1">Manage purchases and suppliers</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={supplierDialogOpen} onOpenChange={setSupplierDialogOpen}>
            <DialogTrigger asChild><Button variant="outline"><Building2 className="h-4 w-4 mr-2" />Add Supplier</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Supplier</DialogTitle><DialogDescription>Enter supplier details</DialogDescription></DialogHeader>
              <form onSubmit={handleCreateSupplier} className="space-y-4">
                <div><Label>Name *</Label><Input value={supplierForm.name} onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })} required /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Contact</Label><Input value={supplierForm.contact_person} onChange={(e) => setSupplierForm({ ...supplierForm, contact_person: e.target.value })} /></div>
                  <div><Label>Phone</Label><Input value={supplierForm.phone} onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })} /></div>
                </div>
                <div><Label>Email</Label><Input type="email" value={supplierForm.email} onChange={(e) => setSupplierForm({ ...supplierForm, email: e.target.value })} /></div>
                <div><Label>Address</Label><Input value={supplierForm.address} onChange={(e) => setSupplierForm({ ...supplierForm, address: e.target.value })} /></div>
                <Button type="submit" className="w-full">Create</Button>
              </form>
            </DialogContent>
          </Dialog>
          
          <Dialog open={purchaseDialogOpen} onOpenChange={setPurchaseDialogOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />New Purchase</Button></DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Create Purchase</DialogTitle><DialogDescription>Record a new purchase</DialogDescription></DialogHeader>
              <form onSubmit={handleCreatePurchase} className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Supplier</Label><SupplierSelect suppliers={suppliers} value={purchaseForm.supplier_id} onChange={(v) => { const sup = suppliers.find(x => x.supplier_id === v); setPurchaseForm({ ...purchaseForm, supplier_id: v, supplier_name: sup ? sup.name : '' }); }} /></div>
                  <div><Label>Or Enter Name</Label><Input value={purchaseForm.supplier_name} onChange={(e) => setPurchaseForm({ ...purchaseForm, supplier_name: e.target.value, supplier_id: '' })} /></div>
                </div>
                <div className="grid grid-cols-4 gap-4">
                  <div><Label>PO Number</Label><Input value={purchaseForm.po_number} onChange={(e) => setPurchaseForm({ ...purchaseForm, po_number: e.target.value })} /></div>
                  <div><Label>Invoice #</Label><Input value={purchaseForm.invoice_number} onChange={(e) => setPurchaseForm({ ...purchaseForm, invoice_number: e.target.value })} /></div>
                  <div><Label>Purchase Date</Label><Input type="date" value={purchaseForm.purchase_date} onChange={(e) => setPurchaseForm({ ...purchaseForm, purchase_date: e.target.value })} /></div>
                  <div><Label>Delivery Date</Label><Input type="date" value={purchaseForm.delivery_date} onChange={(e) => setPurchaseForm({ ...purchaseForm, delivery_date: e.target.value })} /></div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-3"><Label className="text-lg">Items</Label><Button type="button" variant="outline" size="sm" onClick={addPurchaseItem}><Plus className="h-4 w-4 mr-1" />Add</Button></div>
                  <div className="space-y-4">{itemForms}</div>
                </div>
                <div className="flex justify-between items-center p-4 bg-primary/10 rounded-lg"><span className="text-lg font-medium">Total</span><span className="text-2xl font-bold text-primary">₱{calculateTotal().toLocaleString()}</span></div>
                <div><Label>Notes</Label><Input value={purchaseForm.notes} onChange={(e) => setPurchaseForm({ ...purchaseForm, notes: e.target.value })} /></div>
                <Button type="submit" className="w-full" size="lg"><ShoppingCart className="h-4 w-4 mr-2" />Create Purchase</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Total Spent</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">₱{totalSpent.toLocaleString()}</div><p className="text-xs text-muted-foreground">All time</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">This Month</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">₱{monthlyTotal.toLocaleString()}</div><p className="text-xs text-muted-foreground">{monthlyCount} purchases</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Unpaid</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-red-600">₱{unpaidAmount.toLocaleString()}</div><p className="text-xs text-muted-foreground">Pending</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Suppliers</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{suppliers.length}</div><p className="text-xs text-muted-foreground">Vendors</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div><CardTitle>Purchases</CardTitle><CardDescription>{purchases.length} total</CardDescription></div>
            <div className="flex gap-3">
              <div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9 w-[200px]" placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} /></div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">All</SelectItem><SelectItem value="unpaid">Unpaid</SelectItem><SelectItem value="partial">Partial</SelectItem><SelectItem value="paid">Paid</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent><PurchasesList purchases={filtered} loading={loading} onView={handleViewPurchase} onPay={handlePayClick} /></CardContent>
      </Card>

      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Purchase Details</DialogTitle></DialogHeader>
          {selectedPurchase && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-muted-foreground">Supplier:</span> <span className="font-medium">{selectedPurchase.supplier_name || '-'}</span></div>
                <div><span className="text-muted-foreground">Status:</span> <StatusBadge status={selectedPurchase.payment_status} /></div>
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

      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Payment</DialogTitle></DialogHeader>
          <form onSubmit={handleAddPayment} className="space-y-4">
            <div><Label>Amount (₱)</Label><Input type="number" min="0" value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} required /></div>
            <div><Label>Mode</Label><PaymentModeSelect value={paymentForm.payment_mode} onChange={(v) => setPaymentForm({ ...paymentForm, payment_mode: v })} /></div>
            <div><Label>Reference</Label><Input value={paymentForm.reference_number} onChange={(e) => setPaymentForm({ ...paymentForm, reference_number: e.target.value })} /></div>
            <Button type="submit" className="w-full"><CreditCard className="h-4 w-4 mr-2" />Record Payment</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
