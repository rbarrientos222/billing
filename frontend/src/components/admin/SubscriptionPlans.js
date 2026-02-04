import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import axios from 'axios';
import { toast } from 'sonner';
import { Plus, Loader2, Edit, Trash2 } from 'lucide-react';

export default function SubscriptionPlans() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    speed: '',
    price: '',
    description: ''
  });
  const [editFormData, setEditFormData] = useState({
    name: '',
    speed: '',
    price: '',
    description: '',
    is_active: true
  });

  useEffect(() => {
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/plans');
      setPlans(response.data);
    } catch (error) {
      toast.error('Failed to fetch plans');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post('/plans', { ...formData, price: parseFloat(formData.price), is_active: true });
      toast.success('Plan created successfully');
      setDialogOpen(false);
      setFormData({ name: '', speed: '', price: '', description: '' });
      fetchPlans();
    } catch (error) {
      toast.error('Failed to create plan');
    }
  };

  const handleEdit = (plan) => {
    setSelectedPlan(plan);
    setEditFormData({
      name: plan.name,
      speed: plan.speed,
      price: plan.price.toString(),
      description: plan.description || '',
      is_active: plan.is_active
    });
    setEditDialogOpen(true);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.put(`/plans/${selectedPlan.name}`, {
        ...editFormData,
        price: parseFloat(editFormData.price)
      });
      toast.success('Plan updated successfully');
      setEditDialogOpen(false);
      setSelectedPlan(null);
      fetchPlans();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update plan');
    }
  };

  const handleDelete = async (planName) => {
    if (!window.confirm(`Are you sure you want to delete the plan "${planName}"?`)) return;
    try {
      await axios.delete(`/plans/${planName}`);
      toast.success('Plan deleted successfully');
      fetchPlans();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete plan');
    }
  };

  const handleToggleActive = async (plan) => {
    try {
      await axios.put(`/plans/${plan.name}`, {
        ...plan,
        is_active: !plan.is_active
      });
      toast.success(`Plan ${plan.is_active ? 'deactivated' : 'activated'} successfully`);
      fetchPlans();
    } catch (error) {
      toast.error('Failed to update plan status');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-heading font-bold">Subscription Plans</h2>
          <p className="text-muted-foreground mt-1">Manage internet subscription plans</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Plan
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Subscription Plan</DialogTitle>
              <DialogDescription>Add a new internet subscription plan</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>Plan Name</Label>
                <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
              </div>
              <div>
                <Label>Speed</Label>
                <Input value={formData.speed} onChange={(e) => setFormData({ ...formData, speed: e.target.value })} placeholder="e.g. 50 Mbps" required />
              </div>
              <div>
                <Label>Price (₱)</Label>
                <Input type="number" value={formData.price} onChange={(e) => setFormData({ ...formData, price: e.target.value })} required />
              </div>
              <div>
                <Label>Description</Label>
                <Input value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} />
              </div>
              <Button type="submit" className="w-full">Create Plan</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : plans.length === 0 ? (
          <div className="col-span-full text-center py-12 text-muted-foreground">
            No plans found. Create your first plan!
          </div>
        ) : (
          plans.map((plan) => (
            <Card key={plan.name} className={`hover-lift ${!plan.is_active ? 'opacity-60' : ''}`}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl font-heading">{plan.name}</CardTitle>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(plan)}>
                      <Edit className="h-4 w-4 text-blue-600" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDelete(plan.name)}>
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </div>
                </div>
                <CardDescription>{plan.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Speed:</span>
                    <span className="font-medium">{plan.speed}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Price:</span>
                    <span className="font-bold text-primary text-xl">₱{plan.price?.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Status:</span>
                    <Badge 
                      className={`cursor-pointer ${plan.is_active ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-400 hover:bg-gray-500'}`}
                      onClick={() => handleToggleActive(plan)}
                    >
                      {plan.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Subscription Plan</DialogTitle>
            <DialogDescription>Update the plan details</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div>
              <Label>Plan Name</Label>
              <Input 
                value={editFormData.name} 
                onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })} 
                disabled
                className="bg-muted"
              />
              <p className="text-xs text-muted-foreground mt-1">Plan name cannot be changed</p>
            </div>
            <div>
              <Label>Speed</Label>
              <Input 
                value={editFormData.speed} 
                onChange={(e) => setEditFormData({ ...editFormData, speed: e.target.value })} 
                placeholder="e.g. 50 Mbps" 
                required 
              />
            </div>
            <div>
              <Label>Price (₱)</Label>
              <Input 
                type="number" 
                value={editFormData.price} 
                onChange={(e) => setEditFormData({ ...editFormData, price: e.target.value })} 
                required 
              />
            </div>
            <div>
              <Label>Description</Label>
              <Input 
                value={editFormData.description} 
                onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })} 
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_active"
                checked={editFormData.is_active}
                onChange={(e) => setEditFormData({ ...editFormData, is_active: e.target.checked })}
                className="w-4 h-4 text-primary"
              />
              <Label htmlFor="is_active" className="cursor-pointer">Active</Label>
            </div>
            <div className="flex gap-2">
              <Button type="submit" className="flex-1">Save Changes</Button>
              <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
