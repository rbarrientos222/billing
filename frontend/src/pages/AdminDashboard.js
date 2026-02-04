import React, { useState, useEffect } from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { 
  LayoutDashboard, Users, UserCircle, Wifi, Settings, 
  Package, DollarSign, FileText, LogOut, Menu, X,
  TrendingUp, TrendingDown, Activity, AlertCircle
} from 'lucide-react';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

// Sub-pages
import UserManagement from '@/components/admin/UserManagement';
import SubscriberManagement from '@/components/admin/SubscriberManagement';
import MikrotikManagement from '@/components/admin/MikrotikManagement';
import InventoryManagement from '@/components/admin/InventoryManagement';
import ExpenseManagement from '@/components/admin/ExpenseManagement';
import CompanySettings from '@/components/admin/CompanySettings';
import SubscriptionPlans from '@/components/admin/SubscriptionPlans';

export default function AdminDashboard({ user, onLogout }) {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [stats, setStats] = useState({});
  const [mikrotikStats, setMikrotikStats] = useState(null);

  const navigation = [
    { name: 'Dashboard', path: '/admin', icon: LayoutDashboard },
    { name: 'Users', path: '/admin/users', icon: Users },
    { name: 'Subscribers', path: '/admin/subscribers', icon: UserCircle },
    { name: 'Mikrotik', path: '/admin/mikrotik', icon: Wifi },
    { name: 'Subscription Plans', path: '/admin/plans', icon: FileText },
    { name: 'Inventory', path: '/admin/inventory', icon: Package },
    { name: 'Expenses', path: '/admin/expenses', icon: DollarSign },
    { name: 'Settings', path: '/admin/settings', icon: Settings },
  ];

  useEffect(() => {
    fetchDashboardStats();
    fetchMikrotikStats();
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

    // Mock monthly data
    const monthlyData = [
      { month: 'Jan', sales: 45000 },
      { month: 'Feb', sales: 52000 },
      { month: 'Mar', sales: 48000 },
      { month: 'Apr', sales: 61000 },
      { month: 'May', sales: 55000 },
      { month: 'Jun', sales: 67000 },
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
              <CardDescription>Revenue over the last 6 months</CardDescription>
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
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-64' : 'w-0'} transition-all duration-300 bg-card border-r border-border overflow-hidden`}>
        <div className="h-full flex flex-col">
          {/* Logo */}
          <div className="h-16 flex items-center px-6 border-b border-border">
            <Wifi className="h-8 w-8 text-primary" />
            <span className="ml-3 text-xl font-heading font-bold">Admin Panel</span>
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
        <header className="h-16 border-b border-border bg-card flex items-center justify-between px-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            data-testid="sidebar-toggle"
          >
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
          <div className="text-sm text-muted-foreground">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-8">
          <Routes>
            <Route path="/" element={<DashboardHome />} />
            <Route path="/users" element={<UserManagement />} />
            <Route path="/subscribers" element={<SubscriberManagement />} />
            <Route path="/mikrotik" element={<MikrotikManagement />} />
            <Route path="/plans" element={<SubscriptionPlans />} />
            <Route path="/inventory" element={<InventoryManagement />} />
            <Route path="/expenses" element={<ExpenseManagement />} />
            <Route path="/settings" element={<CompanySettings />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}