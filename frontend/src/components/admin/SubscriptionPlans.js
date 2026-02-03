import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import axios from 'axios';
import { toast } from 'sonner';
import { Plus, Loader2 } from 'lucide-react';

export default function SubscriptionPlans() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    speed: '',
    price: '',
    description: ''
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
            <Card key={plan.name} className="hover-lift">
              <CardHeader>
                <CardTitle className="text-xl font-heading">{plan.name}</CardTitle>
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
                    <span className="font-bold text-primary text-xl">₱{plan.price}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Status:</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      plan.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {plan.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}