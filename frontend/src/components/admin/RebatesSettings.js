import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Percent, Plus, Pencil, Trash2, Users, CreditCard, Tag, Clock, CheckCircle, XCircle } from 'lucide-react';

export default function RebatesSettings() {
  const [discounts, setDiscounts] = useState([]);
  const [plans, setPlans] = useState([]);
  const [subscribers, setSubscribers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingDiscount, setEditingDiscount] = useState(null);
  const [stats, setStats] = useState({ total_discounts_given: 0, total_times_used: 0, active_discounts: 0 });
  
  const [form, setForm] = useState({
    name: '',
    discount_type: 'fixed',
    value: '',
    duration: 'recurring',
    apply_to: 'all_active',
    subscriber_ids: [],
    plan_ids: [],
    is_active: true
  });

  useEffect(() => {
    fetchDiscounts();
    fetchPlans();
    fetchSubscribers();
    fetchStats();
  }, []);

  const fetchDiscounts = async () => {
    try {
      const response = await axios.get('/discounts');
      setDiscounts(response.data);
    } catch (error) {
      toast.error('Failed to fetch discounts');
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

  const fetchSubscribers = async () => {
    try {
      const response = await axios.get('/subscribers?limit=1000');
      // API returns array directly or object with subscribers key
      const subs = Array.isArray(response.data) ? response.data : (response.data.subscribers || []);
      setSubscribers(subs);
    } catch (error) {
      console.error('Failed to fetch subscribers');
    }
  };

  const fetchStats = async () => {
    try {
      const response = await axios.get('/discounts/stats/total');
      setStats(response.data);
    } catch (error) {
      console.error('Failed to fetch stats');
    }
  };

  const resetForm = () => {
    setForm({
      name: '',
      discount_type: 'fixed',
      value: '',
      duration: 'recurring',
      apply_to: 'all_active',
      subscriber_ids: [],
      plan_ids: [],
      is_active: true
    });
    setEditingDiscount(null);
  };

  const handleOpenDialog = (discount = null) => {
    if (discount) {
      setEditingDiscount(discount);
      setForm({
        name: discount.name,
        discount_type: discount.discount_type,
        value: discount.value.toString(),
        duration: discount.duration,
        apply_to: discount.apply_to,
        subscriber_ids: discount.subscriber_ids || [],
        plan_ids: discount.plan_ids || [],
        is_active: discount.is_active
      });
    } else {
      resetForm();
    }
    setShowDialog(true);
  };

  const handleSubmit = async () => {
    if (!form.name || !form.value) {
      toast.error('Please fill in all required fields');
      return;
    }

    const payload = {
      ...form,
      value: parseFloat(form.value)
    };

    try {
      if (editingDiscount) {
        await axios.put(`/discounts/${editingDiscount.discount_id}`, payload);
        toast.success('Discount updated successfully');
      } else {
        await axios.post('/discounts', payload);
        toast.success('Discount created successfully');
      }
      setShowDialog(false);
      resetForm();
      fetchDiscounts();
      fetchStats();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save discount');
    }
  };

  const handleDelete = async (discountId) => {
    if (!window.confirm('Are you sure you want to delete this discount?')) return;
    
    try {
      await axios.delete(`/discounts/${discountId}`);
      toast.success('Discount deleted');
      fetchDiscounts();
      fetchStats();
    } catch (error) {
      toast.error('Failed to delete discount');
    }
  };

  const handleToggleActive = async (discount) => {
    try {
      await axios.put(`/discounts/${discount.discount_id}`, {
        is_active: !discount.is_active
      });
      fetchDiscounts();
      fetchStats();
      toast.success(`Discount ${discount.is_active ? 'deactivated' : 'activated'}`);
    } catch (error) {
      toast.error('Failed to update discount');
    }
  };

  const toggleSubscriber = (accountNumber) => {
    setForm(prev => ({
      ...prev,
      subscriber_ids: prev.subscriber_ids.includes(accountNumber)
        ? prev.subscriber_ids.filter(id => id !== accountNumber)
        : [...prev.subscriber_ids, accountNumber]
    }));
  };

  const togglePlan = (planName) => {
    setForm(prev => ({
      ...prev,
      plan_ids: prev.plan_ids.includes(planName)
        ? prev.plan_ids.filter(p => p !== planName)
        : [...prev.plan_ids, planName]
    }));
  };

  const formatValue = (discount) => {
    if (discount.discount_type === 'percentage') {
      return `${discount.value}%`;
    }
    return `₱${discount.value.toLocaleString()}`;
  };

  const getApplyToLabel = (applyTo) => {
    switch (applyTo) {
      case 'all_active': return 'All Active Subscribers';
      case 'selected_subscribers': return 'Selected Subscribers';
      case 'by_plan': return 'By Plan';
      default: return applyTo;
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground">Loading discounts...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-heading font-bold" data-testid="rebates-title">Rebates & Discounts</h2>
          <p className="text-muted-foreground mt-1">Manage discounts and rebates for subscribers</p>
        </div>
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogTrigger asChild>
            <Button onClick={() => handleOpenDialog()} data-testid="add-discount-btn">
              <Plus className="h-4 w-4 mr-2" />
              Add Discount
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingDiscount ? 'Edit Discount' : 'Create New Discount'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label>Discount Name / Label *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g., Senior Citizen Discount, Loyalty Rebate"
                  data-testid="discount-name-input"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Type</Label>
                  <Select value={form.discount_type} onValueChange={(v) => setForm({ ...form, discount_type: v })}>
                    <SelectTrigger data-testid="discount-type-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixed">Fixed Amount (₱)</SelectItem>
                      <SelectItem value="percentage">Percentage (%)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Value *</Label>
                  <Input
                    type="number"
                    value={form.value}
                    onChange={(e) => setForm({ ...form, value: e.target.value })}
                    placeholder={form.discount_type === 'fixed' ? '50' : '5'}
                    data-testid="discount-value-input"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {form.discount_type === 'fixed' ? 'Amount in Pesos' : 'Percentage off total'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Duration</Label>
                  <Select value={form.duration} onValueChange={(v) => setForm({ ...form, duration: v })}>
                    <SelectTrigger data-testid="discount-duration-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="recurring">Recurring (Every Billing)</SelectItem>
                      <SelectItem value="one-time">One-Time Only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Apply To</Label>
                  <Select value={form.apply_to} onValueChange={(v) => setForm({ ...form, apply_to: v })}>
                    <SelectTrigger data-testid="discount-apply-to-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all_active">All Active Subscribers</SelectItem>
                      <SelectItem value="selected_subscribers">Selected Subscribers</SelectItem>
                      <SelectItem value="by_plan">By Subscription Plan</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {form.apply_to === 'selected_subscribers' && (
                <div>
                  <Label>Select Subscribers</Label>
                  <div className="border rounded-lg p-3 max-h-48 overflow-y-auto mt-2">
                    {subscribers.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No subscribers found</p>
                    ) : (
                      <div className="space-y-2">
                        {subscribers.filter(s => s.status === 'active').map((sub) => (
                          <div key={sub.account_number} className="flex items-center space-x-2">
                            <Checkbox
                              id={sub.account_number}
                              checked={form.subscriber_ids.includes(sub.account_number)}
                              onCheckedChange={() => toggleSubscriber(sub.account_number)}
                            />
                            <Label htmlFor={sub.account_number} className="text-sm cursor-pointer">
                              {sub.first_name} {sub.last_name} ({sub.account_number})
                            </Label>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {form.subscriber_ids.length} subscriber(s) selected
                  </p>
                </div>
              )}

              {form.apply_to === 'by_plan' && (
                <div>
                  <Label>Select Plans</Label>
                  <div className="border rounded-lg p-3 max-h-48 overflow-y-auto mt-2">
                    {plans.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No plans found</p>
                    ) : (
                      <div className="space-y-2">
                        {plans.map((plan) => (
                          <div key={plan.name} className="flex items-center space-x-2">
                            <Checkbox
                              id={plan.name}
                              checked={form.plan_ids.includes(plan.name)}
                              onCheckedChange={() => togglePlan(plan.name)}
                            />
                            <Label htmlFor={plan.name} className="text-sm cursor-pointer">
                              {plan.name} - ₱{plan.price?.toLocaleString()}/mo
                            </Label>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {form.plan_ids.length} plan(s) selected
                  </p>
                </div>
              )}

              <div className="flex items-center space-x-2 pt-2 border-t">
                <Checkbox
                  id="is_active"
                  checked={form.is_active}
                  onCheckedChange={(checked) => setForm({ ...form, is_active: checked })}
                />
                <Label htmlFor="is_active" className="cursor-pointer">Active (discount will be applied)</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
              <Button onClick={handleSubmit} data-testid="save-discount-btn">
                {editingDiscount ? 'Update Discount' : 'Create Discount'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Discounts Given</p>
                <p className="text-2xl font-bold text-green-600">₱{stats.total_discounts_given.toLocaleString()}</p>
              </div>
              <Tag className="h-8 w-8 text-green-600 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Times Used</p>
                <p className="text-2xl font-bold">{stats.total_times_used}</p>
              </div>
              <Clock className="h-8 w-8 text-muted-foreground opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Discounts</p>
                <p className="text-2xl font-bold text-primary">{stats.active_discounts}</p>
              </div>
              <Percent className="h-8 w-8 text-primary opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Discounts List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Percent className="h-5 w-5" />
            Discount List
          </CardTitle>
          <CardDescription>Manage active and inactive discounts</CardDescription>
        </CardHeader>
        <CardContent>
          {discounts.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <Tag className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No discounts configured yet</p>
              <p className="text-sm mt-2">Click "Add Discount" to create your first discount.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {discounts.map((discount) => (
                <div
                  key={discount.discount_id}
                  className={`border rounded-lg p-4 ${!discount.is_active ? 'opacity-60 bg-muted/50' : ''}`}
                  data-testid={`discount-${discount.discount_id}`}
                >
                  <div className="flex flex-col sm:flex-row justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="font-semibold">{discount.name}</h4>
                        <Badge variant={discount.is_active ? 'default' : 'secondary'}>
                          {discount.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                        <Badge variant="outline">
                          {discount.duration === 'recurring' ? 'Recurring' : 'One-Time'}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Tag className="h-4 w-4" />
                          {formatValue(discount)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="h-4 w-4" />
                          {getApplyToLabel(discount.apply_to)}
                          {discount.apply_to === 'selected_subscribers' && ` (${discount.subscriber_ids?.length || 0})`}
                          {discount.apply_to === 'by_plan' && ` (${discount.plan_ids?.length || 0} plans)`}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-4 w-4" />
                          Used {discount.times_used || 0} times
                        </span>
                        {discount.total_amount_discounted > 0 && (
                          <span className="text-green-600">
                            Total: ₱{discount.total_amount_discounted.toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleToggleActive(discount)}
                        title={discount.is_active ? 'Deactivate' : 'Activate'}
                      >
                        {discount.is_active ? (
                          <XCircle className="h-4 w-4 text-red-500" />
                        ) : (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenDialog(discount)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(discount.discount_id)}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
