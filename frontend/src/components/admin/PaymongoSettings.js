import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { 
  CreditCard, Shield, Eye, EyeOff, Check, X, Loader2, 
  AlertTriangle, Info, RefreshCw, ExternalLink 
} from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

export default function PaymongoSettings() {
  const [settings, setSettings] = useState({
    public_key: '',
    secret_key: '',
    webhook_secret: '',
    is_live_mode: false,
    enabled: false,
    service_fee: 0
  });
  const [currentSettings, setCurrentSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [showWebhookSecret, setShowWebhookSecret] = useState(false);
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await axios.get(`${API}/api/settings/paymongo`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setCurrentSettings(response.data);
      
      // Pre-fill public key if configured
      if (response.data.public_key && response.data.public_key !== '') {
        setSettings(prev => ({
          ...prev,
          is_live_mode: response.data.is_live_mode,
          enabled: response.data.enabled,
          service_fee: response.data.service_fee || 0
        }));
      }
    } catch (error) {
      toast.error('Failed to load PayMongo settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    // Validation
    if (!settings.public_key) {
      toast.error('Public key is required');
      return;
    }
    if (!settings.secret_key) {
      toast.error('Secret key is required');
      return;
    }

    setSaving(true);
    try {
      await axios.post(`${API}/api/settings/paymongo`, settings, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      toast.success('PayMongo settings saved successfully');
      fetchSettings();
      // Clear sensitive fields after save
      setSettings(prev => ({ ...prev, secret_key: '', webhook_secret: '' }));
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const response = await axios.post(`${API}/api/settings/paymongo/test`, {}, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setTestResult(response.data);
      if (response.data.success) {
        toast.success('Connection successful!');
      } else {
        toast.error(response.data.message);
      }
    } catch (error) {
      setTestResult({ success: false, message: error.response?.data?.detail || 'Connection test failed' });
      toast.error('Connection test failed');
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">PayMongo Settings</h2>
          <p className="text-muted-foreground">Configure online payment gateway for subscriber payments</p>
        </div>
        {currentSettings?.configured && (
          <Badge variant={currentSettings.enabled ? "default" : "secondary"} className="text-sm">
            {currentSettings.enabled ? "Enabled" : "Disabled"}
          </Badge>
        )}
      </div>

      {/* Security Notice */}
      <Alert>
        <Shield className="h-4 w-4" />
        <AlertDescription>
          Your API keys are encrypted and stored securely. Secret keys are never displayed after saving.
          Always use test keys during development and switch to live keys only in production.
        </AlertDescription>
      </Alert>

      {/* Current Status Card */}
      {currentSettings && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <CreditCard className="w-5 h-5" />
              Current Configuration
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="p-3 bg-accent/50 rounded-lg">
                <p className="text-xs text-muted-foreground">Status</p>
                <div className="flex items-center gap-2 mt-1">
                  {currentSettings.configured ? (
                    <><Check className="w-4 h-4 text-green-500" /><span className="font-medium">Configured</span></>
                  ) : (
                    <><X className="w-4 h-4 text-red-500" /><span className="font-medium">Not Configured</span></>
                  )}
                </div>
              </div>
              <div className="p-3 bg-accent/50 rounded-lg">
                <p className="text-xs text-muted-foreground">Mode</p>
                <p className="font-medium mt-1">
                  {currentSettings.is_live_mode ? (
                    <Badge variant="destructive">LIVE</Badge>
                  ) : (
                    <Badge variant="secondary">TEST</Badge>
                  )}
                </p>
              </div>
              <div className="p-3 bg-accent/50 rounded-lg">
                <p className="text-xs text-muted-foreground">Secret Key</p>
                <div className="flex items-center gap-2 mt-1">
                  {currentSettings.has_secret_key ? (
                    <><Check className="w-4 h-4 text-green-500" /><span className="font-medium">Set</span></>
                  ) : (
                    <><X className="w-4 h-4 text-red-500" /><span className="font-medium">Not Set</span></>
                  )}
                </div>
              </div>
              <div className="p-3 bg-accent/50 rounded-lg">
                <p className="text-xs text-muted-foreground">Webhook Secret</p>
                <div className="flex items-center gap-2 mt-1">
                  {currentSettings.has_webhook_secret ? (
                    <><Check className="w-4 h-4 text-green-500" /><span className="font-medium">Set</span></>
                  ) : (
                    <><AlertTriangle className="w-4 h-4 text-yellow-500" /><span className="font-medium">Optional</span></>
                  )}
                </div>
              </div>
              <div className="p-3 bg-accent/50 rounded-lg">
                <p className="text-xs text-muted-foreground">Service Fee</p>
                <p className="font-medium mt-1">
                  {currentSettings.service_fee > 0 ? (
                    <span className="text-amber-600">₱{currentSettings.service_fee.toFixed(2)}</span>
                  ) : (
                    <span className="text-muted-foreground">None</span>
                  )}
                </p>
              </div>
            </div>
            
            {currentSettings.configured && (
              <div className="mt-4 flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleTestConnection}
                  disabled={testing}
                >
                  {testing ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Testing...</>
                  ) : (
                    <><RefreshCw className="w-4 h-4 mr-2" />Test Connection</>
                  )}
                </Button>
              </div>
            )}

            {testResult && (
              <div className={`mt-4 p-3 rounded-lg ${testResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                <div className="flex items-center gap-2">
                  {testResult.success ? (
                    <Check className="w-4 h-4 text-green-600" />
                  ) : (
                    <X className="w-4 h-4 text-red-600" />
                  )}
                  <span className={testResult.success ? 'text-green-800' : 'text-red-800'}>
                    {testResult.message}
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Configuration Form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Update API Credentials</CardTitle>
          <CardDescription>
            Get your API keys from{' '}
            <a 
              href="https://dashboard.paymongo.com/developers" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline inline-flex items-center gap-1"
            >
              PayMongo Dashboard <ExternalLink className="w-3 h-3" />
            </a>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Mode Toggle */}
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="space-y-0.5">
              <Label className="text-base font-medium">Live Mode</Label>
              <p className="text-sm text-muted-foreground">
                {settings.is_live_mode 
                  ? "⚠️ LIVE mode - Real transactions will be processed" 
                  : "Test mode - No real charges will be made"}
              </p>
            </div>
            <Switch
              checked={settings.is_live_mode}
              onCheckedChange={(checked) => setSettings(prev => ({ 
                ...prev, 
                is_live_mode: checked,
                public_key: '',
                secret_key: ''
              }))}
            />
          </div>

          {settings.is_live_mode && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                You are configuring LIVE mode. Real payments will be processed. 
                Make sure you have tested thoroughly in test mode first.
              </AlertDescription>
            </Alert>
          )}

          {/* Public Key */}
          <div className="space-y-2">
            <Label htmlFor="public_key">
              Public Key <span className="text-red-500">*</span>
            </Label>
            <Input
              id="public_key"
              type="text"
              placeholder={settings.is_live_mode ? "pk_live_..." : "pk_test_..."}
              value={settings.public_key}
              onChange={(e) => setSettings(prev => ({ ...prev, public_key: e.target.value }))}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Your PayMongo public key. Starts with {settings.is_live_mode ? 'pk_live_' : 'pk_test_'}
            </p>
          </div>

          {/* Secret Key */}
          <div className="space-y-2">
            <Label htmlFor="secret_key">
              Secret Key <span className="text-red-500">*</span>
            </Label>
            <div className="relative">
              <Input
                id="secret_key"
                type={showSecretKey ? "text" : "password"}
                placeholder={settings.is_live_mode ? "sk_live_..." : "sk_test_..."}
                value={settings.secret_key}
                onChange={(e) => setSettings(prev => ({ ...prev, secret_key: e.target.value }))}
                className="font-mono text-sm pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3"
                onClick={() => setShowSecretKey(!showSecretKey)}
              >
                {showSecretKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Your PayMongo secret key. This will be encrypted before storage.
            </p>
          </div>

          {/* Webhook Secret (Optional) */}
          <div className="space-y-2">
            <Label htmlFor="webhook_secret">
              Webhook Secret <span className="text-muted-foreground">(Optional)</span>
            </Label>
            <div className="relative">
              <Input
                id="webhook_secret"
                type={showWebhookSecret ? "text" : "password"}
                placeholder="whsk_..."
                value={settings.webhook_secret}
                onChange={(e) => setSettings(prev => ({ ...prev, webhook_secret: e.target.value }))}
                className="font-mono text-sm pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3"
                onClick={() => setShowWebhookSecret(!showWebhookSecret)}
              >
                {showWebhookSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              For webhook signature verification. Get this from PayMongo webhook settings.
            </p>
          </div>

          {/* Enable/Disable */}
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="space-y-0.5">
              <Label className="text-base font-medium">Enable Online Payments</Label>
              <p className="text-sm text-muted-foreground">
                Allow subscribers to pay bills online via PayMongo
              </p>
            </div>
            <Switch
              checked={settings.enabled}
              onCheckedChange={(checked) => setSettings(prev => ({ ...prev, enabled: checked }))}
            />
          </div>

          {/* Service Fee */}
          <div className="space-y-2">
            <Label htmlFor="service_fee">
              Service Fee (₱) <span className="text-muted-foreground">(Optional)</span>
            </Label>
            <Input
              id="service_fee"
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={settings.service_fee}
              onChange={(e) => setSettings(prev => ({ ...prev, service_fee: parseFloat(e.target.value) || 0 }))}
              className="max-w-[200px]"
            />
            <p className="text-xs text-muted-foreground">
              Additional fee charged to subscribers for online payments. This will be added as a separate line item during checkout.
              {settings.service_fee > 0 && (
                <span className="block mt-1 text-amber-600">
                  Current fee: ₱{settings.service_fee.toFixed(2)} will be added to each transaction
                </span>
              )}
            </p>
          </div>

          {/* Save Button */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => {
                setSettings({
                  public_key: '',
                  secret_key: '',
                  webhook_secret: '',
                  is_live_mode: currentSettings?.is_live_mode || false,
                  enabled: currentSettings?.enabled || false,
                  service_fee: currentSettings?.service_fee || 0
                });
              }}
            >
              Reset Form
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</>
              ) : (
                <><Shield className="w-4 h-4 mr-2" />Save Settings</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Info className="w-5 h-5" />
            Supported Payment Methods
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-3 border rounded-lg text-center">
              <p className="font-medium">GCash</p>
              <p className="text-xs text-muted-foreground">E-Wallet</p>
            </div>
            <div className="p-3 border rounded-lg text-center">
              <p className="font-medium">Maya</p>
              <p className="text-xs text-muted-foreground">E-Wallet</p>
            </div>
            <div className="p-3 border rounded-lg text-center">
              <p className="font-medium">Credit Card</p>
              <p className="text-xs text-muted-foreground">Visa/Mastercard</p>
            </div>
            <div className="p-3 border rounded-lg text-center">
              <p className="font-medium">GrabPay</p>
              <p className="text-xs text-muted-foreground">E-Wallet</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
