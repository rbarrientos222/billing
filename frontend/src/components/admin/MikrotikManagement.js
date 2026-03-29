import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import axios from 'axios';
import { toast } from 'sonner';
import { 
  Wifi, RefreshCw, Server, Loader2, CheckCircle, XCircle, Plus, 
  Edit2, Trash2, Zap, MoreVertical, Signal, Users, Activity
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function MikrotikManagement() {
  const [routers, setRouters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState({});
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [selectedRouter, setSelectedRouter] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [testResultDialog, setTestResultDialog] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [testingDetailed, setTestingDetailed] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    ip_address: '',
    port: 8728,
    username: '',
    password: '',
    version: 'v7',
    is_active: true
  });

  useEffect(() => {
    fetchRouters();
  }, []);

  const fetchRouters = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/mikrotik/routers');
      // First, set routers without stats (fast load)
      const routersData = response.data.map(router => ({ 
        ...router, 
        stats: { connected: false, loading: true } 
      }));
      setRouters(routersData);
      setLoading(false);
      
      // Then fetch stats for each router individually and concurrently (non-blocking)
      response.data.forEach((router) => {
        // Use setTimeout to ensure truly parallel execution
        setTimeout(async () => {
          try {
            const statsRes = await axios.get(`/mikrotik/routers/${router.router_id}/stats`, {
              timeout: 15000 // 15 second timeout per router
            });
            console.log(`Stats for ${router.name}:`, statsRes.data);
            setRouters(prev => prev.map(r => 
              r.router_id === router.router_id 
                ? { ...r, stats: { ...statsRes.data, loading: false } }
                : r
            ));
          } catch (err) {
            console.log(`Failed to get stats for ${router.name}:`, err.message);
            setRouters(prev => prev.map(r => 
              r.router_id === router.router_id 
                ? { ...r, stats: { connected: false, loading: false } }
                : r
            ));
          }
        }, 0);
      });
    } catch (error) {
      setLoading(false);
      // Try legacy config if new endpoint fails
      try {
        const legacyRes = await axios.get('/mikrotik/config');
        if (legacyRes.data && legacyRes.data.name) {
          setRouters([{ ...legacyRes.data, router_id: 'legacy', stats: { connected: false } }]);
        }
      } catch {
        console.error('Failed to fetch routers');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAddRouter = async () => {
    if (!formData.name || !formData.ip_address || !formData.username || !formData.password) {
      toast.error('Please fill all required fields');
      return;
    }
    
    setSubmitting(true);
    try {
      await axios.post('/mikrotik/routers', formData);
      toast.success('Mikrotik router added successfully');
      setShowAddDialog(false);
      resetForm();
      fetchRouters();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to add router');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateRouter = async () => {
    if (!formData.name || !formData.ip_address || !formData.username) {
      toast.error('Please fill all required fields');
      return;
    }
    
    setSubmitting(true);
    try {
      await axios.put(`/mikrotik/routers/${selectedRouter.router_id}`, formData);
      toast.success('Router updated successfully');
      setShowEditDialog(false);
      resetForm();
      fetchRouters();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update router');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteRouter = async (router) => {
    if (!window.confirm(`Delete router "${router.name}"? This cannot be undone.`)) return;
    
    try {
      await axios.delete(`/mikrotik/routers/${router.router_id}`);
      toast.success('Router deleted');
      fetchRouters();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete router');
    }
  };

  const handleTestConnection = async (router, showDetailedDialog = false) => {
    if (showDetailedDialog) {
      setTestingDetailed(true);
      setTestResult(null);
      setSelectedRouter(router);
      setTestResultDialog(true);
    }
    
    setTesting({ ...testing, [router.router_id]: true });
    try {
      // Use the detailed test-connection endpoint
      const response = await axios.post('/mikrotik/test-connection', {
        ip_address: router.ip_address,
        port: router.port || 8728,
        username: router.username,
        password: router.password, // Will use saved password if empty
        version: router.version || 'v7'
      }, {
        timeout: 30000
      });
      
      if (showDetailedDialog) {
        setTestResult(response.data);
        setTestingDetailed(false);
      }
      
      if (response.data.success) {
        if (!showDetailedDialog) {
          toast.success(`${router.name}: Connection successful! (${response.data.router_info?.active_clients || 0} clients)`);
        }
        // Update this router's stats
        setRouters(prev => prev.map(r => 
          r.router_id === router.router_id 
            ? { 
                ...r, 
                stats: { 
                  connected: true, 
                  loading: false,
                  ...response.data.router_info,
                  active_clients: response.data.router_info?.active_clients
                } 
              }
            : r
        ));
      } else {
        const lastStep = response.data.steps?.[response.data.steps.length - 1];
        const errorMsg = lastStep?.error || lastStep?.message || 'Connection failed';
        if (!showDetailedDialog) {
          toast.error(`${router.name}: ${errorMsg}`);
        }
        setRouters(prev => prev.map(r => 
          r.router_id === router.router_id 
            ? { ...r, stats: { connected: false, loading: false, error: errorMsg } }
            : r
        ));
      }
    } catch (error) {
      const errorMsg = error.response?.data?.detail || error.message;
      if (showDetailedDialog) {
        setTestResult({ 
          success: false, 
          steps: [{ step: 'Connection', status: 'failed', message: 'Request failed', error: errorMsg }] 
        });
        setTestingDetailed(false);
      } else {
        toast.error(`${router.name}: Test failed - ${errorMsg}`);
      }
      setRouters(prev => prev.map(r => 
        r.router_id === router.router_id 
          ? { ...r, stats: { connected: false, loading: false, error: errorMsg } }
          : r
      ));
    } finally {
      setTesting({ ...testing, [router.router_id]: false });
    }
  };

  const openEditDialog = (router) => {
    setSelectedRouter(router);
    setFormData({
      name: router.name,
      ip_address: router.ip_address,
      port: router.port || 8728,
      username: router.username,
      password: '',
      version: router.version || 'v7',
      is_active: router.is_active !== false
    });
    setShowEditDialog(true);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      ip_address: '',
      port: 8728,
      username: '',
      password: '',
      version: 'v7',
      is_active: true
    });
    setSelectedRouter(null);
  };

  const getStatusBadge = (router) => {
    if (router.stats?.loading) {
      return <Badge variant="outline" className="text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin mr-1" />
        Checking...
      </Badge>;
    }
    if (router.stats?.connected) {
      return <Badge className="bg-green-600">Online</Badge>;
    }
    return <Badge variant="destructive">Offline</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-heading font-bold" data-testid="mikrotik-management-title">
            Mikrotik Management
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Configure and manage multiple Mikrotik routers
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchRouters} disabled={loading}>
            <RefreshCw className={`h-4 w-4 sm:mr-2 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Button size="sm" onClick={() => { resetForm(); setShowAddDialog(true); }} data-testid="add-router-btn">
            <Plus className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Add Router</span>
            <span className="sm:hidden">Add</span>
          </Button>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                <Server className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Routers</p>
                <p className="text-xl font-bold">{routers.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                <Signal className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Online</p>
                <p className="text-xl font-bold text-green-600">
                  {routers.filter(r => r.stats?.connected).length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 dark:bg-red-900 rounded-lg">
                <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Offline</p>
                <p className="text-xl font-bold text-red-600">
                  {routers.filter(r => !r.stats?.connected).length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-900 rounded-lg">
                <Users className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Active Clients</p>
                <p className="text-xl font-bold">
                  {routers.reduce((sum, r) => sum + (r.stats?.active_clients || 0), 0)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Routers List */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Wifi className="h-5 w-5" />
            Configured Routers ({routers.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="px-2 sm:px-6">
          {loading ? (
            <div className="text-center py-8">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
              <p className="text-muted-foreground mt-2">Loading routers...</p>
            </div>
          ) : routers.length === 0 ? (
            <div className="text-center py-8">
              <Server className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No Mikrotik routers configured yet.</p>
              <Button className="mt-4" onClick={() => setShowAddDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Your First Router
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {routers.map((router) => (
                <div 
                  key={router.router_id} 
                  className="border rounded-lg p-3 sm:p-4 bg-card hover:bg-muted/50 transition-colors"
                >
                  {/* Mobile & Desktop Layout */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      {/* Status Icon */}
                      <div className={`p-2 rounded-lg shrink-0 ${
                        router.stats?.connected 
                          ? 'bg-green-100 dark:bg-green-900' 
                          : 'bg-red-100 dark:bg-red-900'
                      }`}>
                        {router.stats?.connected 
                          ? <CheckCircle className="h-5 w-5 text-green-600" />
                          : <XCircle className="h-5 w-5 text-red-600" />
                        }
                      </div>
                      
                      {/* Router Info */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-semibold truncate">{router.name}</h4>
                          {getStatusBadge(router)}
                          {!router.is_active && (
                            <Badge variant="outline" className="text-muted-foreground">Disabled</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground font-mono">
                          {router.ip_address}:{router.port || 8728}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          RouterOS {router.version?.toUpperCase() || 'v7'} • User: {router.username}
                        </p>
                        
                        {/* Stats - Show on connected */}
                        {router.stats?.connected && (
                          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs">
                            <span className="text-muted-foreground">
                              CPU: <span className="font-medium text-foreground">{router.stats.cpu_load}%</span>
                            </span>
                            <span className="text-muted-foreground">
                              Clients: <span className="font-medium text-foreground">{router.stats.active_clients || 0}</span>
                            </span>
                            <span className="text-muted-foreground hidden sm:inline">
                              Uptime: <span className="font-medium text-foreground">{router.stats.uptime || 'N/A'}</span>
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-8 w-8 p-0 hidden sm:flex"
                        onClick={() => handleTestConnection(router, false)}
                        disabled={testing[router.router_id]}
                      >
                        {testing[router.router_id] 
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <Zap className="h-4 w-4" />
                        }
                      </Button>
                      
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleTestConnection(router, false)}>
                            <Zap className="mr-2 h-4 w-4" />
                            Quick Test
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleTestConnection(router, true)}>
                            <Activity className="mr-2 h-4 w-4" />
                            Detailed Test
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openEditDialog(router)}>
                            <Edit2 className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => handleDeleteRouter(router)}
                            className="text-red-600"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Router Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Mikrotik Router</DialogTitle>
            <DialogDescription>Configure a new Mikrotik router for PPPoE management</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Router Name *</Label>
              <Input 
                value={formData.name} 
                onChange={(e) => setFormData({ ...formData, name: e.target.value })} 
                placeholder="e.g., Main Office Router"
                data-testid="router-name-input"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>IP Address *</Label>
                <Input 
                  value={formData.ip_address} 
                  onChange={(e) => setFormData({ ...formData, ip_address: e.target.value })} 
                  placeholder="192.168.1.1"
                />
              </div>
              <div>
                <Label>Port</Label>
                <Input 
                  type="number" 
                  value={formData.port} 
                  onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) || 8728 })} 
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Username *</Label>
                <Input 
                  value={formData.username} 
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })} 
                  placeholder="admin"
                />
              </div>
              <div>
                <Label>Password *</Label>
                <Input 
                  type="password" 
                  value={formData.password} 
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })} 
                  placeholder="Enter password"
                />
              </div>
            </div>
            
            <div>
              <Label>RouterOS Version</Label>
              <Select value={formData.version} onValueChange={(v) => setFormData({ ...formData, version: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="v6">RouterOS v6</SelectItem>
                  <SelectItem value="v7">RouterOS v7</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-center justify-between">
              <Label>Active</Label>
              <Switch 
                checked={formData.is_active} 
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
            <Button onClick={handleAddRouter} disabled={submitting} data-testid="save-router-btn">
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Add Router
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Router Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Router</DialogTitle>
            <DialogDescription>Update router configuration. Leave password blank to keep current.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Router Name *</Label>
              <Input 
                value={formData.name} 
                onChange={(e) => setFormData({ ...formData, name: e.target.value })} 
                placeholder="e.g., Main Office Router"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>IP Address *</Label>
                <Input 
                  value={formData.ip_address} 
                  onChange={(e) => setFormData({ ...formData, ip_address: e.target.value })} 
                  placeholder="192.168.1.1"
                />
              </div>
              <div>
                <Label>Port</Label>
                <Input 
                  type="number" 
                  value={formData.port} 
                  onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) || 8728 })} 
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Username *</Label>
                <Input 
                  value={formData.username} 
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })} 
                  placeholder="admin"
                />
              </div>
              <div>
                <Label>Password</Label>
                <Input 
                  type="password" 
                  value={formData.password} 
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })} 
                  placeholder="Leave blank to keep"
                />
              </div>
            </div>
            
            <div>
              <Label>RouterOS Version</Label>
              <Select value={formData.version} onValueChange={(v) => setFormData({ ...formData, version: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="v6">RouterOS v6</SelectItem>
                  <SelectItem value="v7">RouterOS v7</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-center justify-between">
              <Label>Active</Label>
              <Switch 
                checked={formData.is_active} 
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>Cancel</Button>
            <Button onClick={handleUpdateRouter} disabled={submitting}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Test Connection Result Dialog */}
      <Dialog open={testResultDialog} onOpenChange={setTestResultDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Connection Test: {selectedRouter?.name}
            </DialogTitle>
            <DialogDescription>
              {selectedRouter?.ip_address}:{selectedRouter?.port || 8728}
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            {testingDetailed ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span className="ml-3">Testing connection...</span>
              </div>
            ) : testResult ? (
              <div className="space-y-4">
                {/* Overall Status */}
                <div className={`p-3 rounded-lg flex items-center gap-3 ${testResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                  {testResult.success ? (
                    <CheckCircle className="h-6 w-6 text-green-600" />
                  ) : (
                    <XCircle className="h-6 w-6 text-red-600" />
                  )}
                  <div>
                    <p className={`font-semibold ${testResult.success ? 'text-green-700' : 'text-red-700'}`}>
                      {testResult.success ? 'Connection Successful' : 'Connection Failed'}
                    </p>
                    {testResult.router_info && (
                      <p className="text-sm text-green-600">
                        {testResult.router_info.active_clients} active clients
                      </p>
                    )}
                  </div>
                </div>

                {/* Step by Step Results */}
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Connection Steps:</p>
                  {testResult.steps?.map((step, idx) => (
                    <div key={idx} className={`p-3 rounded border ${step.status === 'success' ? 'bg-green-50/50 border-green-200' : 'bg-red-50/50 border-red-200'}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {step.status === 'success' ? (
                            <CheckCircle className="h-4 w-4 text-green-600" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-600" />
                          )}
                          <span className="font-medium text-sm">{step.step}</span>
                        </div>
                        {step.time_ms && (
                          <span className="text-xs text-muted-foreground">{step.time_ms}ms</span>
                        )}
                      </div>
                      <p className="text-sm mt-1 ml-6">{step.message}</p>
                      {step.error && (
                        <p className="text-sm mt-1 ml-6 text-red-600 font-mono bg-red-100 p-2 rounded text-xs">
                          Error: {step.error}
                        </p>
                      )}
                    </div>
                  ))}
                </div>

                {/* Router Info if successful */}
                {testResult.router_info && (
                  <div className="border rounded-lg p-3 bg-muted/30">
                    <p className="text-sm font-medium mb-2">Router Information:</p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">Version:</span>
                        <span className="ml-2 font-mono">{testResult.router_info.version || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Board:</span>
                        <span className="ml-2 font-mono">{testResult.router_info.board_name || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">CPU Load:</span>
                        <span className="ml-2 font-mono">{testResult.router_info.cpu_load || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Memory:</span>
                        <span className="ml-2 font-mono">{testResult.router_info.free_memory || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Uptime:</span>
                        <span className="ml-2 font-mono">{testResult.router_info.uptime || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Active Clients:</span>
                        <span className="ml-2 font-mono font-bold text-green-600">{testResult.router_info.active_clients || 0}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setTestResultDialog(false)}>Close</Button>
            <Button onClick={() => handleTestConnection(selectedRouter, true)} disabled={testingDetailed}>
              {testingDetailed ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Retest
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
