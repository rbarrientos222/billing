import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { 
  LogOut, User, FileText, Receipt, ClipboardList, Bell, 
  DollarSign, Menu, X, RefreshCw, Wifi, AlertTriangle, Wallet
} from 'lucide-react';

// Subscriber Components
import ActiveBill from '@/components/subscriber/ActiveBill';
import PaymentHistory from '@/components/subscriber/PaymentHistory';
import JobOrders from '@/components/subscriber/JobOrders';
import AccountInfo from '@/components/subscriber/AccountInfo';
import Notifications from '@/components/subscriber/Notifications';

const API = process.env.REACT_APP_BACKEND_URL;

export default function SubscriberPortal({ user, onLogout }) {
  const [dashboardData, setDashboardData] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [payments, setPayments] = useState([]);
  const [jobOrders, setJobOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');

  const token = localStorage.getItem('token');

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      
      const [dashboardRes, invoicesRes, paymentsRes, jobOrdersRes] = await Promise.all([
        axios.get(`${API}/api/subscriber/dashboard`, { headers }),
        axios.get(`${API}/api/subscriber/invoices`, { headers }),
        axios.get(`${API}/api/subscriber/payments`, { headers }),
        axios.get(`${API}/api/subscriber/job-orders`, { headers })
      ]);

      setDashboardData(dashboardRes.data);
      setInvoices(invoicesRes.data);
      setPayments(paymentsRes.data);
      setJobOrders(jobOrdersRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
      if (error.response?.status === 401) {
        toast.error('Session expired. Please login again.');
        onLogout();
      } else {
        toast.error('Failed to load dashboard data');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchAllData();
    setRefreshing(false);
    toast.success('Data refreshed');
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP'
    }).format(amount || 0);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-muted-foreground">Loading your account...</p>
        </div>
      </div>
    );
  }

  const subscriber = dashboardData?.subscriber;
  const payables = dashboardData?.payables;
  const jobStats = dashboardData?.job_orders;
  const walletData = dashboardData?.wallet;
  const notifications = dashboardData?.notifications || [];

  return (
    <div className="min-h-screen bg-background" data-testid="subscriber-portal">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="h-16 flex items-center justify-between">
            {/* Logo & Title */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                <User className="h-5 w-5 text-white" />
              </div>
              <div className="hidden sm:block">
                <h1 className="text-lg font-heading font-bold" data-testid="subscriber-portal-title">
                  My Account
                </h1>
                <p className="text-xs text-muted-foreground">{subscriber?.account_number}</p>
              </div>
            </div>

            {/* Desktop Actions */}
            <div className="hidden md:flex items-center gap-4">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleRefresh}
                disabled={refreshing}
                data-testid="refresh-button"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <div className="text-right">
                <p className="text-sm font-medium">{subscriber?.name}</p>
                <p className="text-xs text-muted-foreground">{subscriber?.plan}</p>
              </div>
              <Button variant="outline" size="sm" onClick={onLogout} data-testid="logout-button">
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </Button>
            </div>

            {/* Mobile Menu Button */}
            <div className="md:hidden flex items-center gap-2">
              <Button 
                variant="ghost" 
                size="icon"
                onClick={handleRefresh}
                disabled={refreshing}
              >
                <RefreshCw className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
              </Button>
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                data-testid="mobile-menu-button"
              >
                {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </Button>
            </div>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-border bg-card p-4 space-y-4">
            <div className="flex items-center gap-3 pb-4 border-b border-border">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                <User className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="font-medium">{subscriber?.name}</p>
                <p className="text-sm text-muted-foreground">{subscriber?.account_number}</p>
                <Badge variant={subscriber?.status === 'active' ? 'default' : 'destructive'} className="mt-1">
                  {subscriber?.status}
                </Badge>
              </div>
            </div>
            <Button variant="outline" className="w-full" onClick={onLogout}>
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Status Banner (if disconnected) */}
        {subscriber?.status !== 'active' && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-3" data-testid="status-banner">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-red-800 dark:text-red-200">Account Disconnected</p>
              <p className="text-sm text-red-600 dark:text-red-300">
                Your service has been temporarily disconnected. Please settle any outstanding balance or contact support.
              </p>
            </div>
          </div>
        )}

        {/* Quick Stats - Mobile Friendly */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          <Card className="p-4" data-testid="stat-payables">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Payables</p>
                <p className="text-lg font-bold text-red-600">{formatCurrency(payables?.total)}</p>
              </div>
            </div>
          </Card>
          
          <Card className="p-4" data-testid="stat-wallet">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
                <Wallet className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Wallet Credit</p>
                <p className="text-lg font-bold text-emerald-600">{formatCurrency(walletData?.balance)}</p>
              </div>
            </div>
          </Card>
          
          <Card className="p-4" data-testid="stat-bills">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <FileText className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Unpaid Bills</p>
                <p className="text-lg font-bold">{payables?.invoice_count || 0}</p>
              </div>
            </div>
          </Card>
          
          <Card className="p-4" data-testid="stat-open-jobs">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
                <ClipboardList className="w-5 h-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Open Jobs</p>
                <p className="text-lg font-bold">{jobStats?.open || 0}</p>
              </div>
            </div>
          </Card>
          
          <Card className="p-4" data-testid="stat-status">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${subscriber?.status === 'active' ? 'bg-green-100' : 'bg-red-100'}`}>
                <Wifi className={`w-5 h-5 ${subscriber?.status === 'active' ? 'text-green-600' : 'text-red-600'}`} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                <p className={`text-lg font-bold capitalize ${subscriber?.status === 'active' ? 'text-green-600' : 'text-red-600'}`}>
                  {subscriber?.status}
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Notifications */}
        {notifications.length > 0 && (
          <div className="mb-6">
            <Notifications notifications={notifications} />
          </div>
        )}

        {/* Tabs for different sections */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-6" data-testid="subscriber-tabs">
            <TabsTrigger value="dashboard" className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              <span className="hidden sm:inline">Bills</span>
            </TabsTrigger>
            <TabsTrigger value="payments" className="flex items-center gap-2">
              <Receipt className="w-4 h-4" />
              <span className="hidden sm:inline">Payments</span>
            </TabsTrigger>
            <TabsTrigger value="jobs" className="flex items-center gap-2">
              <ClipboardList className="w-4 h-4" />
              <span className="hidden sm:inline">Jobs</span>
            </TabsTrigger>
            <TabsTrigger value="account" className="flex items-center gap-2">
              <User className="w-4 h-4" />
              <span className="hidden sm:inline">Account</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="space-y-6">
            <ActiveBill 
              invoices={invoices} 
              totalPayables={payables?.total}
              onPaymentSuccess={handleRefresh}
            />
          </TabsContent>

          <TabsContent value="payments" className="space-y-6">
            <PaymentHistory payments={payments} />
          </TabsContent>

          <TabsContent value="jobs" className="space-y-6">
            <JobOrders jobOrders={jobOrders} />
          </TabsContent>

          <TabsContent value="account" className="space-y-6">
            <AccountInfo subscriber={subscriber} token={token} />
          </TabsContent>
        </Tabs>

        {/* Help Section */}
        <Card className="mt-8" data-testid="help-card">
          <CardContent className="py-6">
            <div className="text-center">
              <h3 className="font-medium mb-2">Need Help?</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Contact our support team for assistance with your account or service.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button variant="outline" size="sm" disabled>
                  <Bell className="w-4 h-4 mr-2" />
                  Chat Support (Coming Soon)
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-8 py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-sm text-muted-foreground">
          <p>© 2025 APL Billing System. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
