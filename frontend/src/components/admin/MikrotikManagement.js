import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import axios from 'axios';
import { toast } from 'sonner';
import { Wifi, RefreshCw, Server, Loader2, CheckCircle, XCircle, AlertCircle, Zap } from 'lucide-react';

export default function MikrotikManagement() {
  const [config, setConfig] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResults, setTestResults] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    ip_address: '',
    port: 8728,
    username: '',
    password: '',
    version: 'v7'
  });

  useEffect(() => {
    fetchConfig();
    fetchStats();
  }, []);

  const fetchConfig = async () => {
    try {
      const response = await axios.get('/mikrotik/config');
      if (response.data && response.data.name) {
        setConfig(response.data);
        setFormData({ ...response.data, password: '' });
      }
    } catch (error) {
      console.error('Failed to fetch config');
    }
  };

  const fetchStats = async () => {
    try {
      const response = await axios.get('/mikrotik/stats');
      setStats(response.data);
    } catch (error) {
      console.error('Failed to fetch stats');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await axios.post('/mikrotik/config', formData);
      toast.success('Mikrotik configuration saved');
      fetchConfig();
      fetchStats();
    } catch (error) {
      toast.error('Failed to save configuration');
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setLoading(true);
    try {
      const response = await axios.post('/mikrotik/sync');
      toast.success(response.data.message);
    } catch (error) {
      toast.error('Failed to sync accounts');
    } finally {
      setLoading(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResults(null);
    try {
      const response = await axios.post('/mikrotik/test-connection', {
        ip_address: formData.ip_address,
        port: formData.port,
        username: formData.username,
        password: formData.password || undefined
      });
      setTestResults(response.data);
      if (response.data.success) {
        toast.success('Connection successful!');
      } else {
        toast.error('Connection failed. Check the details below.');
      }
    } catch (error) {
      toast.error('Test failed: ' + (error.response?.data?.detail || 'Unknown error'));
      setTestResults({
        success: false,
        steps: [{
          step: 'Request',
          status: 'failed',
          message: 'Failed to execute test',
          error: error.response?.data?.detail || error.message
        }]
      });
    } finally {
      setTesting(false);
    }
  };

  const getStepIcon = (status) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-600" />;
      case 'warning':
        return <AlertCircle className="h-4 w-4 text-amber-600" />;
      default:
        return <Loader2 className="h-4 w-4 animate-spin" />;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-heading font-bold" data-testid="mikrotik-management-title">Mikrotik Management</h2>
        <p className="text-muted-foreground mt-1">Configure and manage Mikrotik router integration</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              Router Configuration
            </CardTitle>
            <CardDescription>Enter your Mikrotik router credentials</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>Router Name</Label>
                <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Main Router" required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>IP Address</Label>
                  <Input value={formData.ip_address} onChange={(e) => setFormData({ ...formData, ip_address: e.target.value })} placeholder="192.168.1.1" required />
                </div>
                <div>
                  <Label>Port</Label>
                  <Input type="number" value={formData.port} onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) })} required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Username</Label>
                  <Input value={formData.username} onChange={(e) => setFormData({ ...formData, username: e.target.value })} placeholder="admin" required />
                </div>
                <div>
                  <Label>Password</Label>
                  <Input type="password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} placeholder="Enter password" required={!config} />
                </div>
              </div>
              <div>
                <Label>RouterOS Version</Label>
                <Select value={formData.version} onValueChange={(value) => setFormData({ ...formData, version: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="v6">RouterOS v6</SelectItem>
                    <SelectItem value="v7">RouterOS v7</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex gap-3 pt-2">
                <Button type="submit" disabled={loading} data-testid="save-mikrotik-config-button">
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Save Configuration
                </Button>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={handleTestConnection} 
                  disabled={testing || !formData.ip_address || !formData.username}
                  data-testid="test-connection-button"
                >
                  {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />}
                  Test Connection
                </Button>
              </div>
              
              {/* Test Results */}
              {testResults && (
                <div className="mt-4 border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">Connection Test Results</h4>
                    <Badge variant={testResults.success ? "default" : "destructive"}>
                      {testResults.success ? "Success" : "Failed"}
                    </Badge>
                  </div>
                  
                  <div className="space-y-2">
                    {testResults.steps?.map((step, idx) => (
                      <div key={idx} className={`flex items-start gap-3 p-2 rounded ${
                        step.status === 'success' ? 'bg-green-50 dark:bg-green-950/30' :
                        step.status === 'failed' ? 'bg-red-50 dark:bg-red-950/30' :
                        'bg-amber-50 dark:bg-amber-950/30'
                      }`}>
                        {getStepIcon(step.status)}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-sm">{step.step}</span>
                            {step.time_ms && (
                              <span className="text-xs text-muted-foreground">{step.time_ms}ms</span>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">{step.message}</p>
                          {step.error && (
                            <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-mono">{step.error}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  {testResults.router_info && (
                    <div className="mt-3 pt-3 border-t">
                      <h5 className="text-sm font-medium mb-2">Router Information</h5>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Version:</span>
                          <span className="font-mono">{testResults.router_info.version || 'N/A'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Board:</span>
                          <span className="font-mono">{testResults.router_info.board_name || 'N/A'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">CPU Load:</span>
                          <span className="font-mono">{testResults.router_info.cpu_load || 'N/A'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Active Clients:</span>
                          <span className="font-mono">{testResults.router_info.active_clients ?? 'N/A'}</span>
                        </div>
                        <div className="flex justify-between col-span-2">
                          <span className="text-muted-foreground">Uptime:</span>
                          <span className="font-mono text-xs">{testResults.router_info.uptime || 'N/A'}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </form>
          </CardContent>
        </Card>

        <div className="space-y-6">
          {stats && (
            <Card className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950 dark:to-green-900 border-green-200 dark:border-green-800">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-green-900 dark:text-green-100">
                  <Wifi className="h-5 w-5" />
                  Router Status
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm text-green-800 dark:text-green-200">
                  <span>CPU Load:</span>
                  <span className="font-mono font-medium">{stats.cpu_load}</span>
                </div>
                <div className="flex justify-between text-sm text-green-800 dark:text-green-200">
                  <span>Free Memory:</span>
                  <span className="font-mono font-medium">{stats.free_memory}</span>
                </div>
                <div className="flex justify-between text-sm text-green-800 dark:text-green-200">
                  <span>Total Memory:</span>
                  <span className="font-mono font-medium">{stats.total_memory}</span>
                </div>
                <div className="flex justify-between text-sm text-green-800 dark:text-green-200">
                  <span>Uptime:</span>
                  <span className="font-mono font-medium text-xs">{stats.uptime}</span>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button className="w-full" onClick={handleSync} disabled={loading || !config} data-testid="sync-accounts-button">
                <RefreshCw className="h-4 w-4 mr-2" />
                Sync PPPoE Accounts
              </Button>
              <Button className="w-full" variant="outline" onClick={fetchStats} disabled={!config}>
                Refresh Stats
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
