import React, { useState, useEffect } from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { 
  LayoutDashboard, Users, UserCircle, Wifi, Settings, 
  Package, DollarSign, FileText, LogOut, Menu, X,
  TrendingUp, TrendingDown, Activity, AlertCircle, CalendarDays, ShoppingCart, CreditCard,
  ClipboardList, ChevronDown, ChevronRight, Percent, Printer, FileSpreadsheet
} from 'lucide-react';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

// Sub-pages
import UserManagement from '@/components/admin/UserManagement';
import SubscriberManagement from '@/components/admin/SubscriberManagement';
import MikrotikManagement from '@/components/admin/MikrotikManagement';
import InventoryManagement from '@/components/admin/InventoryManagement';
import JobOrderManagement from '@/components/admin/JobOrderManagement';
// Lazy load PurchasingModule to avoid babel stack overflow
const PurchasingModule = React.lazy(() => import('@/components/admin/PurchasingModule'));
import ExpenseManagement from '@/components/admin/ExpenseManagement';
import CompanySettings from '@/components/admin/CompanySettings';
import SubscriptionPlans from '@/components/admin/SubscriptionPlans';
import BillingCalendar from '@/components/admin/BillingCalendar';
import RebatesSettings from '@/components/admin/RebatesSettings';
import PrinterSettings from '@/components/admin/PrinterSettings';
import SOASettings from '@/components/admin/SOASettings';

export default function AdminDashboard({ user, onLogout }) {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false); // Default closed on mobile
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [stats, setStats] = useState({});
  const [mikrotikStats, setMikrotikStats] = useState(null);
  const [monthlySales, setMonthlySales] = useState([]);

  // Check if screen is desktop size
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 1024);

  useEffect(() => {
    const handleResize = () => {
      const desktop = window.innerWidth >= 1024;
      setIsDesktop(desktop);
      if (desktop) {
        setSidebarOpen(true);
      } else {
        setSidebarOpen(false);
      }
    };

    // Set initial state
    handleResize();
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Close sidebar on navigation (mobile only)
  useEffect(() => {
    if (!isDesktop) {
      setSidebarOpen(false);
    }
  }, [location.pathname, isDesktop]);

  const navigation = [
    { name: 'Dashboard', path: '/admin', icon: LayoutDashboard },
    { name: 'Subscribers', path: '/admin/subscribers', icon: UserCircle },
    { name: 'Job Orders', path: '/admin/joborders', icon: ClipboardList },
    { name: 'Mikrotik', path: '/admin/mikrotik', icon: Wifi },
    { name: 'Purchasing', path: '/admin/purchasing', icon: ShoppingCart },
    { name: 'Inventory', path: '/admin/inventory', icon: Package },
    { name: 'Expenses', path: '/admin/expenses', icon: DollarSign },
  ];

  const settingsSubMenu = [
    { name: 'Users', path: '/admin/settings/users', icon: Users },
    { name: 'Plans', path: '/admin/settings/plans', icon: CreditCard },
    { name: 'Rebates', path: '/admin/settings/rebates', icon: Percent },
    { name: 'Printer Setup', path: '/admin/settings/printer', icon: Printer },
    { name: 'SOA Setup', path: '/admin/settings/soa', icon: FileSpreadsheet },
    { name: 'Company', path: '/admin/settings/company', icon: Settings },
  ];

  // Open settings sub-menu if on a settings page
  useEffect(() => {
    if (location.pathname.startsWith('/admin/settings')) {
      setSettingsOpen(true);
    }
  }, [location.pathname]);

  useEffect(() => {
    fetchDashboardStats();
    fetchMikrotikStats();
    fetchMonthlySales();
  }, []);

  const fetchDashboardStats = async () => {
    try {
      const response = await axios.get('/dashboard/stats');
      setStats(response.data);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  const fetchMikrotikStats = async () => {
    try {
      const response = await axios.get('/mikrotik/stats');
      setMikrotikStats(response.data);
    } catch (error) {
      console.error('Failed to fetch Mikrotik stats:', error);
      // Set a placeholder to show "not configured" message
      if (error.response?.status === 404) {
        setMikrotikStats({ not_configured: true });
      }
    }
  };

  const fetchMonthlySales = async () => {
    try {
      const response = await axios.get('/stats/monthly-sales');
      setMonthlySales(response.data);
    } catch (error) {
      console.error('Failed to fetch monthly sales:', error);
    }
  };

  const DashboardHome = () => {
    const statCards = [
      { 
        title: 'Gross Sales', 
        value: `₱${(stats.gross_sales || 0).toLocaleString()}`, 
        icon: TrendingUp, 
        trend: '+12.5%',
        color: 'text-green-600',
        bg: 'bg-green-50'
      },
      { 
        title: 'Net Sales', 
        value: `₱${(stats.net_sales || 0).toLocaleString()}`, 
        icon: DollarSign, 
        trend: '+8.2%',
        color: 'text-green-600',
        bg: 'bg-green-50'
      },
      { 
        title: 'Expenses', 
        value: `₱${(stats.expenses || 0).toLocaleString()}`, 
        icon: TrendingDown, 
        trend: '-3.1%',
        color: 'text-red-600',
        bg: 'bg-red-50'
      },
      { 
        title: 'Receivables', 
        value: `₱${(stats.receivables || 0).toLocaleString()}`, 
        icon: AlertCircle, 
        trend: `${stats.unpaid_invoices || 0} unpaid`,
        color: 'text-amber-600',
        bg: 'bg-amber-50'
      },
    ];

    const activityCards = [
      { title: 'Active Subscribers', value: stats.active_subscribers || 0, icon: UserCircle, color: 'text-green-600' },
      { title: 'Open Tickets', value: stats.open_tickets || 0, icon: Activity, color: 'text-blue-600' },
      { title: 'Total Invoices', value: stats.total_invoices || 0, icon: FileText, color: 'text-purple-600' },
    ];

    // Use live monthly sales data
    const monthlyData = monthlySales.length > 0 ? monthlySales : [
      { month: 'Jan', sales: 0 },
      { month: 'Feb', sales: 0 },
      { month: 'Mar', sales: 0 },
      { month: 'Apr', sales: 0 },
      { month: 'May', sales: 0 },
      { month: 'Jun', sales: 0 },
    ];

    return (
      <div className="space-y-8">
        {/* Welcome */}
        <div>
          <h1 className="text-4xl font-heading font-bold text-foreground mb-2" data-testid="admin-dashboard-title">Dashboard</h1>
          <p className="text-muted-foreground">Welcome back, {user.username}! Here's your business overview.</p>
        </div>

        {/* Main Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {statCards.map((stat, idx) => (
            <Card key={idx} className="hover-lift border-border" data-testid={`stat-card-${idx}`}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{stat.title}</CardTitle>
                <div className={`${stat.bg} p-2 rounded-lg`}>
                  <stat.icon className={`h-5 w-5 ${stat.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold font-heading">{stat.value}</div>
                <p className={`text-xs ${stat.color} mt-1`}>{stat.trend} from last month</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Charts and Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Monthly Sales Chart */}
          <Card className="lg:col-span-2 border-border">
            <CardHeader>
              <CardTitle className="font-heading">Monthly Sales Trend</CardTitle>
              <CardDescription>Revenue over the last 12 months</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={monthlyData}>
                  <defs>
                    <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" />
                  <YAxis stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                  <Area type="monotone" dataKey="sales" stroke="hsl(var(--primary))" fillOpacity={1} fill="url(#colorSales)" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Activity Cards */}
          <div className="space-y-6">
            {activityCards.map((card, idx) => (
              <Card key={idx} className="hover-lift border-border">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">{card.title}</p>
                      <p className="text-3xl font-bold font-heading">{card.value}</p>
                    </div>
                    <card.icon className={`h-8 w-8 ${card.color}`} />
                  </div>
                </CardContent>
              </Card>
            ))}

            {/* Mikrotik Status */}
            {mikrotikStats && (
              <Card className="border-border bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950 dark:to-green-900">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-medium text-green-900 dark:text-green-100">Mikrotik Router</h3>
                    <Wifi className="h-5 w-5 text-green-600" />
                  </div>
                  {mikrotikStats.not_configured ? (
                    <div className="text-sm text-green-700 dark:text-green-300 text-center py-4">
                      <p>Router not configured</p>
                      <button 
                        onClick={() => window.location.href = '/admin/mikrotik'}
                        className="text-green-600 dark:text-green-400 underline text-xs mt-2 inline-block hover:text-green-700"
                      >
                        Configure Mikrotik
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between text-green-800 dark:text-green-200">
                        <span>Active Clients:</span>
                        <span className="font-bold font-mono text-lg text-green-600">{mikrotikStats.active_clients || 0}</span>
                      </div>
                      <div className="flex justify-between text-green-800 dark:text-green-200">
                        <span>CPU Load:</span>
                        <span className="font-mono font-medium">{mikrotikStats.cpu_load}</span>
                      </div>
                      <div className="flex justify-between text-green-800 dark:text-green-200">
                        <span>Free Memory:</span>
                        <span className="font-mono font-medium">{mikrotikStats.free_memory}</span>
                      </div>
                      <div className="flex justify-between text-green-800 dark:text-green-200">
                        <span>Uptime:</span>
                        <span className="font-mono font-medium text-xs">{mikrotikStats.uptime}</span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Billing Calendar Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <BillingCalendar />
          
          {/* Quick Actions Card */}
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="font-heading flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-primary" />
                Billing Quick Actions
              </CardTitle>
              <CardDescription>Manage your billing operations</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Link to="/admin/subscribers" className="block">
                  <div className="bg-muted/50 hover:bg-muted rounded-lg p-4 text-center transition-colors cursor-pointer">
                    <UserCircle className="h-8 w-8 mx-auto mb-2 text-primary" />
                    <p className="text-sm font-medium">View Subscribers</p>
                    <p className="text-xs text-muted-foreground">{stats.active_subscribers || 0} active</p>
                  </div>
                </Link>
                <Link to="/admin/plans" className="block">
                  <div className="bg-muted/50 hover:bg-muted rounded-lg p-4 text-center transition-colors cursor-pointer">
                    <FileText className="h-8 w-8 mx-auto mb-2 text-blue-600" />
                    <p className="text-sm font-medium">Manage Plans</p>
                    <p className="text-xs text-muted-foreground">Subscription plans</p>
                  </div>
                </Link>
              </div>
              
              <div className="border-t border-border pt-4">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="text-sm font-medium">Billing Overview</h4>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={async () => {
                      try {
                        const res = await axios.post('/billing/run-now');
                        toast.success(res.data.message);
                        fetchStats();
                      } catch (err) {
                        toast.error(err.response?.data?.detail || 'Failed to run billing');
                      }
                    }}
                    data-testid="run-billing-btn"
                  >
                    <CalendarDays className="h-3 w-3 mr-1" />
                    Run Billing
                  </Button>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Total Invoices</span>
                    <span className="font-medium">{stats.total_invoices || 0}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Unpaid Invoices</span>
                    <span className="font-medium text-amber-600">{stats.unpaid_invoices || 0}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Total Receivables</span>
                    <span className="font-medium text-red-600">₱{(stats.receivables || 0).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-screen bg-background">
      {/* Mobile Overlay */}
      {sidebarOpen && !isDesktop && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        ${isDesktop 
          ? (sidebarOpen ? 'w-64' : 'w-0') 
          : (sidebarOpen ? 'translate-x-0' : '-translate-x-full')
        }
        ${isDesktop ? '' : 'fixed inset-y-0 left-0 z-50 w-64'}
        transition-all duration-300 bg-card border-r border-border overflow-hidden
      `}>
        <div className="h-full flex flex-col">
          {/* Logo */}
          <div className="h-16 flex items-center justify-between px-4 border-b border-border">
            <div className="flex items-center">
              <Wifi className="h-8 w-8 text-primary" />
              <span className="ml-3 text-xl font-heading font-bold">Admin</span>
            </div>
            {!isDesktop && (
              <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(false)}>
                <X className="h-5 w-5" />
              </Button>
            )}
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto py-6 px-3">
            <div className="space-y-1">
              {navigation.map((item) => {
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    data-testid={`nav-${item.name.toLowerCase().replace(' ', '-')}`}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                      isActive
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    <item.icon className="h-5 w-5" />
                    {item.name}
                  </Link>
                );
              })}
              
              {/* Settings with Sub-menu */}
              <div>
                <button
                  onClick={() => setSettingsOpen(!settingsOpen)}
                  className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    location.pathname.startsWith('/admin/settings')
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Settings className="h-5 w-5" />
                    Settings
                  </div>
                  {settingsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
                
                {settingsOpen && (
                  <div className="ml-4 mt-1 space-y-1 border-l-2 border-muted pl-3">
                    {settingsSubMenu.map((item) => {
                      const isActive = location.pathname === item.path;
                      return (
                        <Link
                          key={item.path}
                          to={item.path}
                          data-testid={`nav-settings-${item.name.toLowerCase().replace(' ', '-')}`}
                          className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${
                            isActive
                              ? 'bg-primary text-primary-foreground shadow-sm'
                              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                          }`}
                        >
                          <item.icon className="h-4 w-4" />
                          {item.name}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </nav>

          {/* User Info */}
          <div className="p-4 border-t border-border">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user.username}</p>
                <p className="text-xs text-muted-foreground">Administrator</p>
              </div>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              className="w-full" 
              onClick={onLogout}
              data-testid="logout-button"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-16 border-b border-border bg-card flex items-center justify-between px-4 lg:px-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            data-testid="sidebar-toggle"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="text-xs sm:text-sm text-muted-foreground">
            {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-8">
          <Routes>
            <Route path="/" element={<DashboardHome />} />
            <Route path="/subscribers" element={<SubscriberManagement />} />
            <Route path="/joborders" element={<JobOrderManagement />} />
            <Route path="/mikrotik" element={<MikrotikManagement />} />
            <Route path="/inventory" element={<InventoryManagement />} />
            <Route path="/purchasing" element={
              <React.Suspense fallback={<div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>}>
                <PurchasingModule />
              </React.Suspense>
            } />
            <Route path="/expenses" element={<ExpenseManagement />} />
            {/* Settings Sub-routes */}
            <Route path="/settings/users" element={<UserManagement />} />
            <Route path="/settings/plans" element={<SubscriptionPlans />} />
            <Route path="/settings/rebates" element={<RebatesSettings />} />
            <Route path="/settings/printer" element={<PrinterSettings />} />
            <Route path="/settings/soa" element={<SOASettings />} />
            <Route path="/settings/company" element={<CompanySettings />} />
            {/* Legacy routes for backwards compatibility */}
            <Route path="/users" element={<UserManagement />} />
            <Route path="/plans" element={<SubscriptionPlans />} />
            <Route path="/settings" element={<CompanySettings />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}