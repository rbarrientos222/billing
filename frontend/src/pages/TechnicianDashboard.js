import React, { useState, useEffect, useMemo } from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { 
  LayoutDashboard, ClipboardList, LogOut, Menu, X, Wifi,
  Users, Play, Pause, CheckCircle, Clock, AlertTriangle,
  Timer, Target, TrendingUp, User
} from 'lucide-react';
import TechnicianJobOrders from '@/components/technician/TechnicianJobOrders';

export default function TechnicianDashboard({ user, onLogout }) {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [stats, setStats] = useState({});
  const [myJobOrders, setMyJobOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  
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
    { name: 'Dashboard', path: '/technician', icon: LayoutDashboard },
    { name: 'My Job Orders', path: '/technician/joborders', icon: ClipboardList },
  ];

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const [statsRes, jobsRes] = await Promise.all([
        axios.get('/joborders/stats'),
        axios.get(`/joborders/technician/${user.username}`)
      ]);
      setStats(statsRes.data || {});
      setMyJobOrders(jobsRes.data || []);
    } catch (error) {
      toast.error('Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (minutes) => {
    if (!minutes) return '-';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  // Calculate my stats
  const myStats = useMemo(() => {
    const counts = { Open: 0, 'In Progress': 0, 'On Hold': 0, Completed: 0, Cancelled: 0 };
    let slaBreached = 0;
    let totalTime = 0;
    let completedCount = 0;

    myJobOrders.forEach(jo => {
      if (counts[jo.status] !== undefined) counts[jo.status]++;
      if (jo.sla_breached) slaBreached++;
      if (jo.status === 'Completed' && jo.time_rendered_minutes) {
        totalTime += jo.time_rendered_minutes;
        completedCount++;
      }
    });

    return {
      ...counts,
      slaBreached,
      avgTime: completedCount > 0 ? Math.round(totalTime / completedCount) : 0,
      total: myJobOrders.length
    };
  }, [myJobOrders]);

  const DashboardHome = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-heading font-bold">Welcome, {user.username}</h2>
        <p className="text-muted-foreground mt-1">Here's your job order summary for today</p>
      </div>

      {/* My Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Open</p>
                <p className="text-2xl font-bold text-blue-600">{myStats.Open}</p>
              </div>
              <ClipboardList className="h-6 w-6 text-blue-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">In Progress</p>
                <p className="text-2xl font-bold text-amber-600">{myStats['In Progress']}</p>
              </div>
              <Play className="h-6 w-6 text-amber-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">On Hold</p>
                <p className="text-2xl font-bold text-gray-600">{myStats['On Hold']}</p>
              </div>
              <Pause className="h-6 w-6 text-gray-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Completed</p>
                <p className="text-2xl font-bold text-green-600">{myStats.Completed}</p>
              </div>
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
          </CardContent>
        </Card>
        <Card className={myStats.slaBreached > 0 ? 'border-red-300 bg-red-50' : ''}>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">SLA Breached</p>
                <p className="text-2xl font-bold text-red-600">{myStats.slaBreached}</p>
              </div>
              <AlertTriangle className={`h-6 w-6 text-red-600 ${myStats.slaBreached > 0 ? 'animate-pulse' : ''}`} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Avg Time</p>
                <p className="text-2xl font-bold">{formatTime(myStats.avgTime)}</p>
              </div>
              <Timer className="h-6 w-6 text-purple-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Active Job Orders */}
      <Card>
        <CardHeader>
          <CardTitle>Active Job Orders</CardTitle>
          <CardDescription>Job orders requiring your attention</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">Loading...</div>
          ) : (
            <div className="space-y-3">
              {myJobOrders
                .filter(jo => ['Open', 'In Progress'].includes(jo.status))
                .slice(0, 5)
                .map(jo => (
                  <div 
                    key={jo.job_order_id} 
                    className={`p-4 rounded-lg border ${jo.sla_breached ? 'bg-red-50 border-red-200' : 'bg-muted/50'}`}
                  >
                    {/* Mobile-friendly layout */}
                    <div className="space-y-2">
                      {/* Job ID on its own row */}
                      <div className="font-mono text-sm font-medium">{jo.job_order_id}</div>
                      
                      {/* Badges row - wrap on mobile */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant={jo.status === 'Open' ? 'secondary' : 'default'} className={jo.status === 'In Progress' ? 'bg-amber-500' : ''}>
                          {jo.status}
                        </Badge>
                        {jo.sla_breached && <Badge variant="destructive">SLA Breach</Badge>}
                        <Badge 
                          className={
                            jo.priority === 'Critical' ? 'bg-red-600' :
                            jo.priority === 'High' ? 'bg-orange-500' :
                            jo.priority === 'Medium' ? 'bg-yellow-500' : 'bg-green-500'
                          }
                        >
                          {jo.priority}
                        </Badge>
                        {jo.scheduled_date && (
                          <span className="text-xs text-muted-foreground">
                            {new Date(jo.scheduled_date).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      
                      {/* Subscriber info */}
                      <div>
                        <p className="font-medium">{jo.subscriber_name}</p>
                        <p className="text-sm text-muted-foreground">{jo.type} - {jo.description?.substring(0, 50)}...</p>
                        <p className="text-xs text-muted-foreground mt-1">{jo.subscriber_address}</p>
                      </div>
                    </div>
                  </div>
                ))}
              {myJobOrders.filter(jo => ['Open', 'In Progress'].includes(jo.status)).length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle className="h-12 w-12 mx-auto mb-3 text-green-500" />
                  <p>All caught up! No pending job orders.</p>
                </div>
              )}
            </div>
          )}
          {myJobOrders.filter(jo => ['Open', 'In Progress'].includes(jo.status)).length > 5 && (
            <div className="mt-4 text-center">
              <Link to="/technician/joborders">
                <Button variant="outline">View All Job Orders</Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );

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
              <span className="ml-3 text-xl font-heading font-bold">Technician</span>
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
            </div>
          </nav>

          {/* User Info */}
          <div className="p-4 border-t border-border">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user.username}</p>
                <p className="text-xs text-muted-foreground">Technician</p>
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
            <Route path="/joborders" element={<TechnicianJobOrders user={user} />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
