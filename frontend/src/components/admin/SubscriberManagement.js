import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import axios from 'axios';
import { toast } from 'sonner';
import { Plus, Search, Loader2, Calculator, Calendar, MoreHorizontal, Edit, Power, PowerOff, Trash2, DollarSign, RefreshCw } from 'lucide-react';

export default function SubscriberManagement() {
  const [subscribers, setSubscribers] = useState([]);
  const [plans, setPlans] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [provinces, setProvinces] = useState([]);
  const [municipalities, setMunicipalities] = useState([]);
  const [barangays, setBarangays] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [selectedSubscriberHistory, setSelectedSubscriberHistory] = useState(null);
  const [paymentHistory, setPaymentHistory] = useState([]);
  const [invoiceHistory, setInvoiceHistory] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSubscribers, setSelectedSubscribers] = useState([]);
  const [activating, setActivating] = useState(false);
  
  // New dialog states
  const [changePlanDialogOpen, setChangePlanDialogOpen] = useState(false);
  const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false);
  const [reactivateDialogOpen, setReactivateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [chargeDialogOpen, setChargeDialogOpen] = useState(false);
  const [selectedSubscriber, setSelectedSubscriber] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  
  // Form states for actions
  const [changePlanForm, setChangePlanForm] = useState({ new_plan_id: '', new_pppoe_profile: '', generate_prorated_bill: true });
  const [deactivateForm, setDeactivateForm] = useState({ disconnection_profile: 'NON-PAYMENTS', reason: '', generate_final_bill: true });
  const [reactivateForm, setReactivateForm] = useState({ pppoe_profile: '', plan_id: '', generate_prorated_bill: true });
  const [deleteForm, setDeleteForm] = useState({ admin_password: '' });
  const [chargeForm, setChargeForm] = useState({ description: '', amount: '', charge_type: 'Equipment' });
  
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    street: '',
    barangay: '',
    municipality: '',
    province: '',
    plan_id: '',
    billing_day: 30,
    installation_date: new Date().toISOString().split('T')[0],
    modem_mac: '',
    pppoe_username: '',
    pppoe_password: '',
    pppoe_profile: '',
    activate_pppoe: false,
    generate_prorated_bill: true
  });
  const [proratedPreview, setProratedPreview] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  useEffect(() => {
    fetchSubscribers();
    fetchPlans();
    fetchProfiles();
    fetchProvinces();
  }, []);

  // Auto-generate PPPoE username when first/last name changes
  useEffect(() => {
    if (formData.first_name || formData.last_name) {
      const generatedUsername = (formData.first_name + formData.last_name)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, ''); // Remove special characters and spaces
      setFormData(prev => ({ ...prev, pppoe_username: generatedUsername }));
    }
  }, [formData.first_name, formData.last_name]);

  // Fetch prorated preview when plan or billing day or installation date changes
  useEffect(() => {
    if (formData.plan_id && formData.billing_day && formData.generate_prorated_bill && formData.installation_date) {
      fetchProratedPreview();
    } else {
      setProratedPreview(null);
    }
  }, [formData.plan_id, formData.billing_day, formData.generate_prorated_bill, formData.installation_date]);

  const fetchProratedPreview = async () => {
    if (!formData.plan_id) return;
    
    setLoadingPreview(true);
    try {
      const response = await axios.post('/billing/preview-prorated', {
        plan_id: formData.plan_id,
        billing_day: formData.billing_day,
        installation_date: formData.installation_date
      });
      setProratedPreview(response.data);
    } catch (error) {
      console.error('Failed to fetch prorated preview');
      setProratedPreview(null);
    } finally {
      setLoadingPreview(false);
    }
  };

  const fetchSubscribers = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/subscribers');
      setSubscribers(response.data);
    } catch (error) {
      toast.error('Failed to fetch subscribers');
    } finally {
      setLoading(false);
    }
  };

  const fetchPlans = async () => {
    try {
      const response = await axios.get('/plans');
      setPlans(response.data);
    } catch (error) {
      console.error('Failed to fetch plans');
    }
  };

  const fetchProfiles = async () => {
    try {
      const response = await axios.get('/mikrotik/profiles');
      setProfiles(response.data.profiles || []);
    } catch (error) {
      console.error('Failed to fetch Mikrotik profiles');
    }
  };

  const fetchProvinces = async () => {
    try {
      const response = await axios.get('/addresses/provinces');
      setProvinces(response.data.provinces || []);
    } catch (error) {
      console.error('Failed to fetch provinces');
    }
  };

  const fetchMunicipalities = async (province) => {
    try {
      const response = await axios.get(`/addresses/municipalities/${encodeURIComponent(province)}`);
      setMunicipalities(response.data.municipalities || []);
      setBarangays([]);
    } catch (error) {
      console.error('Failed to fetch municipalities');
    }
  };

  const fetchBarangays = async (province, municipality) => {
    try {
      const response = await axios.get(`/addresses/barangays/${encodeURIComponent(province)}/${encodeURIComponent(municipality)}`);
      setBarangays(response.data.barangays || []);
    } catch (error) {
      console.error('Failed to fetch barangays');
    }
  };

  const handleProvinceChange = (value) => {
    setFormData({ ...formData, province: value, municipality: '', barangay: '' });
    fetchMunicipalities(value);
  };

  const handleMunicipalityChange = (value) => {
    setFormData({ ...formData, municipality: value, barangay: '' });
    fetchBarangays(formData.province, value);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await axios.post('/subscribers', {
        ...formData,
        account_number: '',
        is_active: true,
        installation_date: new Date().toISOString()
      });
      
      let successMessage = `Subscriber created with account number: ${response.data.account_number}`;
      
      if (response.data.pppoe_created) {
        successMessage += ' | PPPoE account created in Mikrotik ✓';
      } else if (response.data.pppoe_error) {
        successMessage += ` | PPPoE creation failed: ${response.data.pppoe_error}`;
      }
      
      if (response.data.prorated_invoice) {
        const invoice = response.data.prorated_invoice;
        successMessage += ` | Prorated invoice: ₱${invoice.amount} (${invoice.days_covered} days)`;
      } else if (response.data.billing_note) {
        successMessage += ` | ${response.data.billing_note}`;
      }
      
      toast.success(successMessage);
      setDialogOpen(false);
      setFormData({ 
        first_name: '', 
        last_name: '', 
        email: '', 
        phone: '', 
        street: '',
        barangay: '',
        municipality: '',
        province: '',
        plan_id: '', 
        billing_period: '30th', 
        modem_mac: '',
        pppoe_username: '',
        pppoe_password: '',
        pppoe_profile: '',
        activate_pppoe: false,
        generate_prorated_bill: true
      });
      setProratedPreview(null);
      setMunicipalities([]);
      setBarangays([]);
      fetchSubscribers();
    } catch (error) {
      toast.error('Failed to create subscriber');
    }
  };

  const filteredSubscribers = subscribers.filter((sub) =>
    sub.first_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    sub.last_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    sub.account_number?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSelectSubscriber = (accountNumber) => {
    setSelectedSubscribers(prev => 
      prev.includes(accountNumber) 
        ? prev.filter(id => id !== accountNumber)
        : [...prev, accountNumber]
    );
  };

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedSubscribers(filteredSubscribers.map(sub => sub.account_number));
    } else {
      setSelectedSubscribers([]);
    }
  };

  const handleBulkActivate = async () => {
    if (selectedSubscribers.length === 0) {
      toast.error('No subscribers selected');
      return;
    }

    setActivating(true);
    try {
      const response = await axios.post('/subscribers/bulk-activate-pppoe', selectedSubscribers);
      const { results } = response.data;
      
      let message = `✓ Activated ${results.success.length} accounts`;
      if (results.failed.length > 0) {
        message += ` | ${results.failed.length} failed`;
      }
      if (results.skipped.length > 0) {
        message += ` | ${results.skipped.length} skipped`;
      }
      
      toast.success(message);
      setSelectedSubscribers([]);
      fetchSubscribers();
    } catch (error) {
      toast.error('Bulk activation failed');
    } finally {
      setActivating(false);
    }
  };

  const handleActivateSingle = async (accountNumber) => {
    try {
      await axios.post(`/subscribers/${accountNumber}/activate-pppoe`);
      toast.success('PPPoE account activated in Mikrotik');
      fetchSubscribers();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to activate PPPoE');
    }
  };

  const handleViewHistory = async (subscriber) => {
    try {
      setSelectedSubscriberHistory(subscriber);
      const [paymentsRes, invoicesRes] = await Promise.all([
        axios.get(`/payments/subscriber/${subscriber.account_number}`),
        axios.get(`/invoices/subscriber/${subscriber.account_number}`)
      ]);
      setPaymentHistory(paymentsRes.data);
      setInvoiceHistory(invoicesRes.data);
      setHistoryDialogOpen(true);
    } catch (error) {
      toast.error('Failed to fetch payment history');
    }
  };

  // Action handlers
  const openChangePlanDialog = (subscriber) => {
    setSelectedSubscriber(subscriber);
    setChangePlanForm({
      new_plan_id: subscriber.plan_id || '',
      new_pppoe_profile: subscriber.pppoe_profile || '',
      generate_prorated_bill: true
    });
    setChangePlanDialogOpen(true);
  };

  const handleChangePlan = async () => {
    if (!selectedSubscriber) return;
    setActionLoading(true);
    try {
      const response = await axios.post(`/subscribers/${selectedSubscriber.account_number}/change-plan`, changePlanForm);
      toast.success(response.data.message);
      if (response.data.prorated_invoice) {
        toast.info(`Prorated invoice: ₱${response.data.prorated_invoice.amount} (${response.data.prorated_invoice.type})`);
      }
      setChangePlanDialogOpen(false);
      fetchSubscribers();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to change plan');
    } finally {
      setActionLoading(false);
    }
  };

  const openDeactivateDialog = (subscriber) => {
    setSelectedSubscriber(subscriber);
    setDeactivateForm({
      disconnection_profile: 'NON-PAYMENTS',
      reason: '',
      generate_final_bill: true
    });
    setDeactivateDialogOpen(true);
  };

  const handleDeactivate = async () => {
    if (!selectedSubscriber) return;
    setActionLoading(true);
    try {
      const response = await axios.post(`/subscribers/${selectedSubscriber.account_number}/deactivate`, deactivateForm);
      toast.success(response.data.message);
      if (response.data.final_invoice) {
        toast.info(`Final bill: ₱${response.data.final_invoice.amount} (${response.data.final_invoice.days_charged} days)`);
      }
      setDeactivateDialogOpen(false);
      fetchSubscribers();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to deactivate subscriber');
    } finally {
      setActionLoading(false);
    }
  };

  const openReactivateDialog = (subscriber) => {
    setSelectedSubscriber(subscriber);
    setReactivateForm({
      pppoe_profile: subscriber.previous_pppoe_profile || '',
      plan_id: subscriber.plan_id || '',
      generate_prorated_bill: true
    });
    setReactivateDialogOpen(true);
  };

  const handleReactivate = async () => {
    if (!selectedSubscriber) return;
    setActionLoading(true);
    try {
      const response = await axios.post(`/subscribers/${selectedSubscriber.account_number}/reactivate`, reactivateForm);
      toast.success(response.data.message);
      if (response.data.prorated_invoice) {
        toast.info(`Prorated bill: ₱${response.data.prorated_invoice.amount} (${response.data.prorated_invoice.days_covered} days)`);
      }
      setReactivateDialogOpen(false);
      fetchSubscribers();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to reactivate subscriber');
    } finally {
      setActionLoading(false);
    }
  };

  const openDeleteDialog = (subscriber) => {
    setSelectedSubscriber(subscriber);
    setDeleteForm({ admin_password: '' });
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!selectedSubscriber || !deleteForm.admin_password) return;
    setActionLoading(true);
    try {
      const response = await axios.delete(`/subscribers/${selectedSubscriber.account_number}`, { data: deleteForm });
      toast.success(response.data.message);
      setDeleteDialogOpen(false);
      fetchSubscribers();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete subscriber');
    } finally {
      setActionLoading(false);
    }
  };

  const openChargeDialog = (subscriber) => {
    setSelectedSubscriber(subscriber);
    setChargeForm({ description: '', amount: '', charge_type: 'Equipment' });
    setChargeDialogOpen(true);
  };

  const handleAddCharge = async () => {
    if (!selectedSubscriber || !chargeForm.description || !chargeForm.amount) return;
    setActionLoading(true);
    try {
      const response = await axios.post(`/subscribers/${selectedSubscriber.account_number}/charges`, chargeForm);
      toast.success(`Charge added: ₱${chargeForm.amount} - ${chargeForm.description}`);
      setChargeDialogOpen(false);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to add charge');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-heading font-bold" data-testid="subscriber-management-title">Subscriber Management</h2>
          <p className="text-muted-foreground mt-1">Manage subscriber accounts</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="add-subscriber-button">
              <Plus className="h-4 w-4 mr-2" />
              Add Subscriber
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Register New Subscriber</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>First Name</Label>
                  <Input 
                    value={formData.first_name} 
                    onChange={(e) => setFormData({ ...formData, first_name: e.target.value.toUpperCase() })} 
                    style={{ textTransform: 'uppercase' }}
                    required 
                  />
                </div>
                <div>
                  <Label>Last Name</Label>
                  <Input 
                    value={formData.last_name} 
                    onChange={(e) => setFormData({ ...formData, last_name: e.target.value.toUpperCase() })} 
                    style={{ textTransform: 'uppercase' }}
                    required 
                  />
                </div>
              </div>
              <div>
                <Label>Email</Label>
                <Input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
              </div>
              <div>
                <Label>Phone</Label>
                <Input value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
              </div>
              
              {/* Address Section */}
              <div className="col-span-2 pt-4 border-t">
                <h4 className="font-medium mb-3">Address Information</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Province</Label>
                    <Select value={formData.province} onValueChange={handleProvinceChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select province" />
                      </SelectTrigger>
                      <SelectContent>
                        {provinces.map((prov) => (
                          <SelectItem key={prov} value={prov}>{prov}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Municipality/City</Label>
                    <Select 
                      value={formData.municipality} 
                      onValueChange={handleMunicipalityChange}
                      disabled={!formData.province}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select municipality" />
                      </SelectTrigger>
                      <SelectContent>
                        {municipalities.map((muni) => (
                          <SelectItem key={muni} value={muni}>{muni}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Barangay</Label>
                    <Select 
                      value={formData.barangay} 
                      onValueChange={(value) => setFormData({ ...formData, barangay: value })}
                      disabled={!formData.municipality}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select barangay" />
                      </SelectTrigger>
                      <SelectContent>
                        {barangays.map((brgy) => (
                          <SelectItem key={brgy} value={brgy}>{brgy}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Street/House No.</Label>
                    <Input 
                      value={formData.street} 
                      onChange={(e) => setFormData({ ...formData, street: e.target.value })} 
                      placeholder="e.g., 123 Main Street"
                    />
                  </div>
                </div>
              </div>
              
              <div>
                <Label>Subscription Plan</Label>
                <Select value={formData.plan_id} onValueChange={(value) => setFormData({ ...formData, plan_id: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select plan" />
                  </SelectTrigger>
                  <SelectContent>
                    {plans.map((plan) => (
                      <SelectItem key={plan.name} value={plan.name}>{plan.name} - ₱{plan.price}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Installation Date</Label>
                  <Input 
                    type="date" 
                    value={formData.installation_date} 
                    onChange={(e) => setFormData({ ...formData, installation_date: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label>Billing Day (Day of Month)</Label>
                  <Select 
                    value={formData.billing_day.toString()} 
                    onValueChange={(value) => setFormData({ ...formData, billing_day: parseInt(value) })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select billing day" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[200px]">
                      {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                        <SelectItem key={day} value={day.toString()}>
                          {day}{day === 1 ? 'st' : day === 2 ? 'nd' : day === 3 ? 'rd' : 'th'} of Month
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              {/* Prorated Billing Section */}
              <div className="col-span-2 mt-2">
                <div className="flex items-center space-x-2 mb-3">
                  <Checkbox 
                    id="generate_prorated_bill" 
                    checked={formData.generate_prorated_bill}
                    onCheckedChange={(checked) => setFormData({ ...formData, generate_prorated_bill: checked })}
                  />
                  <Label htmlFor="generate_prorated_bill" className="text-sm cursor-pointer">
                    Generate prorated bill (charge from installation date until billing date)
                  </Label>
                </div>
                
                {formData.generate_prorated_bill && formData.plan_id && (
                  <div className="bg-muted/50 rounded-lg p-3 border">
                    <div className="flex items-center gap-2 mb-2">
                      <Calculator className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium">Prorated Bill Preview</span>
                    </div>
                    {loadingPreview ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Calculating...
                      </div>
                    ) : proratedPreview ? (
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Plan:</span>
                          <span className="font-medium">{proratedPreview.plan_name}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Monthly Rate:</span>
                          <span>₱{proratedPreview.monthly_rate?.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Period:</span>
                          <span>{proratedPreview.start_date} to {proratedPreview.end_date}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Days Covered:</span>
                          <span>{proratedPreview.days_covered} days</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Daily Rate:</span>
                          <span>₱{proratedPreview.daily_rate}</span>
                        </div>
                        <div className="flex justify-between pt-2 border-t mt-2">
                          <span className="font-medium">Prorated Amount:</span>
                          <span className="font-bold text-primary text-lg">₱{proratedPreview.prorated_amount?.toLocaleString()}</span>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                          <Calendar className="h-3 w-3" />
                          Due: {proratedPreview.due_date}
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">Select a plan to see prorated calculation</p>
                    )}
                  </div>
                )}
                
                {!formData.generate_prorated_bill && (
                  <div className="bg-amber-50 dark:bg-amber-950/30 rounded-lg p-3 border border-amber-200 dark:border-amber-800">
                    <p className="text-sm text-amber-700 dark:text-amber-300">
                      <strong>No prorated bill:</strong> First invoice will be generated on the {formData.billing_day}{formData.billing_day === 1 ? 'st' : formData.billing_day === 2 ? 'nd' : formData.billing_day === 3 ? 'rd' : 'th'} of the month during the regular billing cycle.
                    </p>
                  </div>
                )}
              </div>

              <div>
                <Label>Modem MAC Address</Label>
                <Input value={formData.modem_mac} onChange={(e) => setFormData({ ...formData, modem_mac: e.target.value })} placeholder="AA:BB:CC:DD:EE:FF" />
              </div>
              
              {/* PPPoE Account Section */}
              <div className="pt-4 border-t">
                <h4 className="font-medium mb-3 text-primary">PPPoE Account Configuration</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>PPPoE Username</Label>
                    <Input 
                      value={formData.pppoe_username} 
                      onChange={(e) => setFormData({ ...formData, pppoe_username: e.target.value })} 
                      placeholder="username@isp"
                    />
                  </div>
                  <div>
                    <Label>PPPoE Password</Label>
                    <Input 
                      type="password"
                      value={formData.pppoe_password} 
                      onChange={(e) => setFormData({ ...formData, pppoe_password: e.target.value })} 
                      placeholder="Enter password"
                    />
                  </div>
                  <div className="col-span-2">
                    <Label>PPPoE Profile (from Mikrotik)</Label>
                    {profiles.length > 0 ? (
                      <Select value={formData.pppoe_profile} onValueChange={(value) => setFormData({ ...formData, pppoe_profile: value })}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select profile from Mikrotik" />
                        </SelectTrigger>
                        <SelectContent>
                          {profiles.map((profile) => (
                            <SelectItem key={profile} value={profile}>{profile}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="space-y-2">
                        <Input 
                          value={formData.pppoe_profile} 
                          onChange={(e) => setFormData({ ...formData, pppoe_profile: e.target.value })} 
                          placeholder="e.g., 50mbps, 100mbps"
                        />
                        <p className="text-xs text-muted-foreground">
                          Configure Mikrotik in settings to see available profiles
                        </p>
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="mt-4 flex items-center space-x-2 p-3 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
                  <input
                    type="checkbox"
                    id="activate_pppoe"
                    checked={formData.activate_pppoe}
                    onChange={(e) => setFormData({ ...formData, activate_pppoe: e.target.checked })}
                    className="w-4 h-4 text-primary bg-white border-gray-300 rounded focus:ring-primary"
                  />
                  <label htmlFor="activate_pppoe" className="text-sm font-medium text-green-900 dark:text-green-100 cursor-pointer">
                    Activate PPPoE account immediately upon saving (creates account in Mikrotik)
                  </label>
                </div>
              </div>
              
              <Button type="submit" className="w-full">Register Subscriber</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>All Subscribers</CardTitle>
              <CardDescription>{filteredSubscribers.length} total subscribers</CardDescription>
            </div>
            <div className="flex items-center gap-3">
              {selectedSubscribers.length > 0 && (
                <Button 
                  onClick={handleBulkActivate} 
                  disabled={activating}
                  data-testid="bulk-activate-button"
                  className="bg-green-600 hover:bg-green-700"
                >
                  {activating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Activate Selected ({selectedSubscribers.length})
                </Button>
              )}
              <div className="relative w-64">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search subscribers..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8"
                  data-testid="search-input"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <input
                        type="checkbox"
                        checked={selectedSubscribers.length === filteredSubscribers.length && filteredSubscribers.length > 0}
                        onChange={handleSelectAll}
                        className="w-4 h-4 text-primary bg-white border-gray-300 rounded focus:ring-primary"
                      />
                    </TableHead>
                    <TableHead>Account #</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Wallet</TableHead>
                    <TableHead>PPPoE</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSubscribers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                        No subscribers found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredSubscribers.map((sub) => (
                      <TableRow key={sub.account_number}>
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={selectedSubscribers.includes(sub.account_number)}
                            onChange={() => handleSelectSubscriber(sub.account_number)}
                            className="w-4 h-4 text-primary bg-white border-gray-300 rounded focus:ring-primary"
                          />
                        </TableCell>
                        <TableCell className="font-mono text-xs">{sub.account_number}</TableCell>
                        <TableCell className="font-medium">{sub.first_name} {sub.last_name}</TableCell>
                        <TableCell>{sub.phone}</TableCell>
                        <TableCell>{sub.plan_id}</TableCell>
                        <TableCell>
                          {(sub.wallet_balance || 0) > 0 ? (
                            <span className="text-green-600 font-medium">₱{(sub.wallet_balance || 0).toLocaleString()}</span>
                          ) : (
                            <span className="text-muted-foreground">₱0</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {sub.pppoe_username ? (
                            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                              Configured
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-gray-50 text-gray-600">
                              Not Set
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={sub.is_active ? "default" : "secondary"} className={sub.is_active ? "bg-green-600" : "bg-red-100 text-red-700"}>
                            {sub.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleViewHistory(sub)}
                              className="text-blue-600 border-blue-600 hover:bg-blue-50"
                            >
                              View History
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuItem onClick={() => openChangePlanDialog(sub)}>
                                  <Edit className="mr-2 h-4 w-4" />
                                  Change Plan
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => openChargeDialog(sub)}>
                                  <DollarSign className="mr-2 h-4 w-4" />
                                  Add Charge
                                </DropdownMenuItem>
                                {sub.pppoe_username && sub.pppoe_password && sub.pppoe_profile && !sub.is_active === false && (
                                  <DropdownMenuItem onClick={() => handleActivateSingle(sub.account_number)}>
                                    <RefreshCw className="mr-2 h-4 w-4" />
                                    Sync to Mikrotik
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                {sub.is_active ? (
                                  <DropdownMenuItem onClick={() => openDeactivateDialog(sub)} className="text-amber-600">
                                    <PowerOff className="mr-2 h-4 w-4" />
                                    Deactivate
                                  </DropdownMenuItem>
                                ) : (
                                  <DropdownMenuItem onClick={() => openReactivateDialog(sub)} className="text-green-600">
                                    <Power className="mr-2 h-4 w-4" />
                                    Reactivate
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => openDeleteDialog(sub)} className="text-red-600">
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payment History Dialog */}
      <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Payment History - {selectedSubscriberHistory?.first_name} {selectedSubscriberHistory?.last_name}</DialogTitle>
            <DialogDescription>
              Account: {selectedSubscriberHistory?.account_number}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Wallet Balance Card */}
            {(selectedSubscriberHistory?.wallet_balance || 0) > 0 && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-600 rounded-full flex items-center justify-center">
                    <DollarSign className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="text-sm text-green-700 font-medium">Wallet Credit Available</p>
                    <p className="text-2xl font-bold text-green-600">₱{(selectedSubscriberHistory?.wallet_balance || 0).toLocaleString()}</p>
                  </div>
                </div>
                <Badge className="bg-green-600">Active Credit</Badge>
              </div>
            )}

            {/* Invoices */}
            <div>
              <h3 className="font-medium mb-3 text-lg">Invoices</h3>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoiceHistory.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-4 text-muted-foreground">
                          No invoices found
                        </TableCell>
                      </TableRow>
                    ) : (
                      invoiceHistory.map((invoice) => (
                        <TableRow key={invoice.invoice_number}>
                          <TableCell className="font-mono text-xs">{invoice.invoice_number}</TableCell>
                          <TableCell className="max-w-[250px]">
                            <p className="text-sm truncate" title={invoice.description || invoice.plan_name}>
                              {invoice.description || `${invoice.plan_name || 'Monthly'} Bill`}
                            </p>
                            {invoice.type && (
                              <Badge variant="outline" className="text-xs mt-1">
                                {invoice.type}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="font-bold">₱{invoice.amount?.toLocaleString()}</TableCell>
                          <TableCell>{new Date(invoice.due_date).toLocaleDateString()}</TableCell>
                          <TableCell>
                            <Badge variant={invoice.paid ? "default" : "destructive"} className={invoice.paid ? "bg-green-600" : ""}>
                              {invoice.paid ? 'Paid' : 'Unpaid'}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Payments */}
            <div>
              <h3 className="font-medium mb-3 text-lg">Payment Records</h3>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>OR Number</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Mode</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Received By</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paymentHistory.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-4 text-muted-foreground">
                          No payments found
                        </TableCell>
                      </TableRow>
                    ) : (
                      paymentHistory.map((payment) => (
                        <TableRow key={payment.or_number}>
                          <TableCell className="font-mono text-xs">{payment.or_number}</TableCell>
                          <TableCell className="font-bold text-green-600">₱{(payment.total_amount || payment.amount || 0).toLocaleString()}</TableCell>
                          <TableCell className="capitalize">{payment.mode}</TableCell>
                          <TableCell>{new Date(payment.payment_date).toLocaleString()}</TableCell>
                          <TableCell>{payment.received_by}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Change Plan Dialog */}
      <Dialog open={changePlanDialogOpen} onOpenChange={setChangePlanDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change Subscription Plan</DialogTitle>
            <DialogDescription>
              {selectedSubscriber && `Update plan for ${selectedSubscriber.first_name} ${selectedSubscriber.last_name}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Current Plan</Label>
              <p className="text-sm text-muted-foreground">{selectedSubscriber?.plan_id || 'None'}</p>
            </div>
            <div>
              <Label>New Plan</Label>
              <Select value={changePlanForm.new_plan_id} onValueChange={(v) => setChangePlanForm({...changePlanForm, new_plan_id: v})}>
                <SelectTrigger>
                  <SelectValue placeholder="Select new plan" />
                </SelectTrigger>
                <SelectContent>
                  {plans.map((plan) => (
                    <SelectItem key={plan.name} value={plan.name}>
                      {plan.name} - ₱{plan.price}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>New PPPoE Profile (Mikrotik)</Label>
              <Select value={changePlanForm.new_pppoe_profile} onValueChange={(v) => setChangePlanForm({...changePlanForm, new_pppoe_profile: v})}>
                <SelectTrigger>
                  <SelectValue placeholder="Select profile" />
                </SelectTrigger>
                <SelectContent>
                  {profiles.map((profile) => (
                    <SelectItem key={profile} value={profile}>{profile}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="generate_prorated_change"
                checked={changePlanForm.generate_prorated_bill}
                onCheckedChange={(c) => setChangePlanForm({...changePlanForm, generate_prorated_bill: c})}
              />
              <Label htmlFor="generate_prorated_change" className="text-sm">Generate prorated adjustment bill</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChangePlanDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleChangePlan} disabled={actionLoading || !changePlanForm.new_plan_id}>
              {actionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Update Plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deactivate Dialog */}
      <Dialog open={deactivateDialogOpen} onOpenChange={setDeactivateDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-amber-600">Deactivate Subscriber</DialogTitle>
            <DialogDescription>
              {selectedSubscriber && `Deactivate ${selectedSubscriber.first_name} ${selectedSubscriber.last_name}'s account`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Disconnection Profile (No Internet)</Label>
              <Select value={deactivateForm.disconnection_profile} onValueChange={(v) => setDeactivateForm({...deactivateForm, disconnection_profile: v})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {profiles.map((profile) => (
                    <SelectItem key={profile} value={profile}>{profile}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">Usually "NON-PAYMENTS" or a profile without bandwidth</p>
            </div>
            <div>
              <Label>Reason</Label>
              <Input 
                value={deactivateForm.reason} 
                onChange={(e) => setDeactivateForm({...deactivateForm, reason: e.target.value})}
                placeholder="e.g., Non-payment, Customer request"
              />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="generate_final_bill"
                checked={deactivateForm.generate_final_bill}
                onCheckedChange={(c) => setDeactivateForm({...deactivateForm, generate_final_bill: c})}
              />
              <Label htmlFor="generate_final_bill" className="text-sm">Generate final bill (prorated to disconnection date)</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeactivateDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeactivate} disabled={actionLoading}>
              {actionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Deactivate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reactivate Dialog */}
      <Dialog open={reactivateDialogOpen} onOpenChange={setReactivateDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-green-600">Reactivate Subscriber</DialogTitle>
            <DialogDescription>
              {selectedSubscriber && `Reactivate ${selectedSubscriber.first_name} ${selectedSubscriber.last_name}'s account`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Subscription Plan</Label>
              <Select value={reactivateForm.plan_id} onValueChange={(v) => setReactivateForm({...reactivateForm, plan_id: v})}>
                <SelectTrigger>
                  <SelectValue placeholder="Select plan" />
                </SelectTrigger>
                <SelectContent>
                  {plans.map((plan) => (
                    <SelectItem key={plan.name} value={plan.name}>
                      {plan.name} - ₱{plan.price}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>PPPoE Profile</Label>
              <Select value={reactivateForm.pppoe_profile} onValueChange={(v) => setReactivateForm({...reactivateForm, pppoe_profile: v})}>
                <SelectTrigger>
                  <SelectValue placeholder="Select active profile" />
                </SelectTrigger>
                <SelectContent>
                  {profiles.map((profile) => (
                    <SelectItem key={profile} value={profile}>{profile}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="generate_prorated_reactivate"
                checked={reactivateForm.generate_prorated_bill}
                onCheckedChange={(c) => setReactivateForm({...reactivateForm, generate_prorated_bill: c})}
              />
              <Label htmlFor="generate_prorated_reactivate" className="text-sm">Generate prorated bill (from today to billing date)</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReactivateDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleReactivate} disabled={actionLoading || !reactivateForm.pppoe_profile} className="bg-green-600 hover:bg-green-700">
              {actionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Reactivate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-600">Delete Subscriber</DialogTitle>
            <DialogDescription>
              This action is permanent and cannot be undone. The PPPoE account will also be removed from Mikrotik.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-3 bg-red-50 rounded-lg border border-red-200">
              <p className="text-sm text-red-700">
                <strong>Warning:</strong> You are about to delete <strong>{selectedSubscriber?.first_name} {selectedSubscriber?.last_name}</strong> ({selectedSubscriber?.account_number}).
              </p>
            </div>
            <div>
              <Label>Enter Admin Password to Confirm</Label>
              <Input 
                type="password"
                value={deleteForm.admin_password} 
                onChange={(e) => setDeleteForm({...deleteForm, admin_password: e.target.value})}
                placeholder="Your admin password"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={actionLoading || !deleteForm.admin_password}>
              {actionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete Permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Charge Dialog */}
      <Dialog open={chargeDialogOpen} onOpenChange={setChargeDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Manual Charge</DialogTitle>
            <DialogDescription>
              {selectedSubscriber && `Add charge for ${selectedSubscriber.first_name} ${selectedSubscriber.last_name}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Charge Type</Label>
              <Select value={chargeForm.charge_type} onValueChange={(v) => setChargeForm({...chargeForm, charge_type: v})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Equipment">Equipment</SelectItem>
                  <SelectItem value="Service Fee">Service Fee</SelectItem>
                  <SelectItem value="Reconnection Fee">Reconnection Fee</SelectItem>
                  <SelectItem value="Installation">Installation</SelectItem>
                  <SelectItem value="Relocation">Relocation</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Description</Label>
              <Input 
                value={chargeForm.description} 
                onChange={(e) => setChargeForm({...chargeForm, description: e.target.value})}
                placeholder="e.g., Router replacement, Cable repair"
              />
            </div>
            <div>
              <Label>Amount (₱)</Label>
              <Input 
                type="number"
                value={chargeForm.amount} 
                onChange={(e) => setChargeForm({...chargeForm, amount: e.target.value})}
                placeholder="0.00"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChargeDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAddCharge} disabled={actionLoading || !chargeForm.description || !chargeForm.amount}>
              {actionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add Charge
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
