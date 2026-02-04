import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import axios from 'axios';
import { toast } from 'sonner';
import { Plus, Search, Loader2 } from 'lucide-react';

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
    billing_period: '30th',
    modem_mac: '',
    pppoe_username: '',
    pppoe_password: '',
    pppoe_profile: '',
    activate_pppoe: false
  });

  useEffect(() => {
    fetchSubscribers();
    fetchPlans();
    fetchProfiles();
    fetchProvinces();
  }, []);

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
        successMessage += ` | Prorated invoice generated: ₱${invoice.amount} (${invoice.invoice_number})`;
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
        activate_pppoe: false
      });
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
                  <Input value={formData.first_name} onChange={(e) => setFormData({ ...formData, first_name: e.target.value })} required />
                </div>
                <div>
                  <Label>Last Name</Label>
                  <Input value={formData.last_name} onChange={(e) => setFormData({ ...formData, last_name: e.target.value })} required />
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
              <div>
                <Label>Billing Period</Label>
                <Select value={formData.billing_period} onValueChange={(value) => setFormData({ ...formData, billing_period: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="15th">15th of Month</SelectItem>
                    <SelectItem value="30th">30th of Month</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
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
                    <TableHead>PPPoE</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSubscribers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
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
                          {sub.pppoe_username ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              Configured
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                              Not Set
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            sub.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                          }`}>
                            {sub.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          {sub.pppoe_username && sub.pppoe_password && sub.pppoe_profile && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleActivateSingle(sub.account_number)}
                              data-testid={`activate-${sub.account_number}`}
                              className="text-green-600 border-green-600 hover:bg-green-50"
                            >
                              Activate PPPoE
                            </Button>
                          )}
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
    </div>
  );
}
