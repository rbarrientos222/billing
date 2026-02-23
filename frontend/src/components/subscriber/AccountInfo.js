import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { User, Mail, Phone, MapPin, Calendar, CreditCard, Wifi, Key, Loader2, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';

const API = process.env.REACT_APP_BACKEND_URL;

export default function AccountInfo({ subscriber, token }) {
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-PH', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getOrdinalSuffix = (day) => {
    if (day >= 11 && day <= 13) return `${day}th`;
    switch (day % 10) {
      case 1: return `${day}st`;
      case 2: return `${day}nd`;
      case 3: return `${day}rd`;
      default: return `${day}th`;
    }
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      'active': { variant: 'default', className: 'bg-green-500', label: 'Active' },
      'inactive': { variant: 'destructive', className: '', label: 'Inactive' },
      'deactivated': { variant: 'destructive', className: '', label: 'Disconnected' },
      'suspended': { variant: 'secondary', className: 'bg-yellow-500', label: 'Suspended' }
    };
    
    const config = statusConfig[status] || { variant: 'outline', className: '', label: status };
    
    return (
      <Badge variant={config.variant} className={config.className}>
        {config.label}
      </Badge>
    );
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    
    if (newPassword.length < 4) {
      toast.error('Password must be at least 4 characters');
      return;
    }
    
    setChangingPassword(true);
    try {
      await axios.post(
        `${API}/api/subscriber/auth/change-password`,
        { new_password: newPassword },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Password changed successfully');
      setChangePasswordOpen(false);
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to change password');
    } finally {
      setChangingPassword(false);
    }
  };

  if (!subscriber) {
    return (
      <Card data-testid="account-info-card">
        <CardContent className="py-8 text-center text-muted-foreground">
          Loading account information...
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="account-info-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <User className="w-5 h-5 text-blue-600" />
            Account Information
          </CardTitle>
          {getStatusBadge(subscriber.status)}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Account Number & Name */}
        <div className="p-4 bg-accent/50 rounded-lg">
          <p className="text-xs text-muted-foreground mb-1">Account Number</p>
          <p className="font-bold text-lg" data-testid="account-number-display">{subscriber.account_number}</p>
          <p className="font-medium text-muted-foreground">{subscriber.name}</p>
        </div>

        {/* Plan Info */}
        <div className="flex items-center gap-3 p-3 border rounded-lg">
          <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
            <Wifi className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Current Plan</p>
            <p className="font-medium" data-testid="plan-display">{subscriber.plan || 'N/A'}</p>
          </div>
        </div>

        {/* Wallet Balance */}
        {(subscriber.wallet_balance > 0 || subscriber.wallet_balance === 0) && (
          <div className="flex items-center gap-3 p-3 border rounded-lg bg-emerald-50 dark:bg-emerald-900/20">
            <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
              <Wallet className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Wallet Credit</p>
              <p className="font-medium text-emerald-600" data-testid="wallet-balance-display">
                ₱{(subscriber.wallet_balance || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        )}

        {/* Contact Information */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-muted-foreground">Contact Information</h4>
          
          {subscriber.email && (
            <div className="flex items-center gap-3">
              <Mail className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm">{subscriber.email}</span>
            </div>
          )}
          
          {subscriber.mobile && (
            <div className="flex items-center gap-3">
              <Phone className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm">{subscriber.mobile}</span>
            </div>
          )}
          
          {subscriber.address && (
            <div className="flex items-start gap-3">
              <MapPin className="w-4 h-4 text-muted-foreground mt-0.5" />
              <span className="text-sm">{subscriber.address}</span>
            </div>
          )}
        </div>

        {/* Account Details */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-muted-foreground">Account Details</h4>
          
          <div className="flex items-center gap-3">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <div>
              <span className="text-xs text-muted-foreground">Installation Date: </span>
              <span className="text-sm font-medium">{formatDate(subscriber.installation_date)}</span>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <CreditCard className="w-4 h-4 text-muted-foreground" />
            <div>
              <span className="text-xs text-muted-foreground">Billing Day: </span>
              <span className="text-sm font-medium">Every {getOrdinalSuffix(subscriber.billing_day || 1)} of the month</span>
            </div>
          </div>
        </div>

        {/* Change Password Button */}
        <div className="pt-4 border-t">
          <Dialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="w-full" data-testid="change-password-button">
                <Key className="w-4 h-4 mr-2" />
                Change Password
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Change Password</DialogTitle>
                <DialogDescription>
                  Enter your new password below. Password must be at least 4 characters.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleChangePassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="newPassword">New Password</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    placeholder="Enter new password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={4}
                    data-testid="new-password-input"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={4}
                    data-testid="confirm-password-input"
                  />
                </div>
                <Button 
                  type="submit" 
                  className="w-full"
                  disabled={changingPassword}
                  data-testid="submit-password-change-button"
                >
                  {changingPassword ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Changing...
                    </>
                  ) : (
                    'Change Password'
                  )}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardContent>
    </Card>
  );
}
