import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Building2, Upload, Loader2, Save, Image, Phone, Mail, MapPin, FileText } from 'lucide-react';

export default function CompanySettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({
    company_logo: '',
    company_name: '',
    company_branch: '',
    company_address: '',
    company_mobile: '',
    company_email: '',
    company_tin: '',
    receipt_footer: 'Thank you for your payment!',
    soa_footer: 'If you have questions or concerns about this statement please contact on the details provided above.'
  });
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await axios.get('/settings/company');
      if (response.data) {
        setSettings(prev => ({ ...prev, ...response.data }));
      }
    } catch (error) {
      console.error('Failed to fetch settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        toast.error('Logo file must be less than 2MB');
        return;
      }
      
      const reader = new FileReader();
      reader.onloadend = () => {
        setSettings(prev => ({ ...prev, company_logo: reader.result }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    if (!settings.company_name) {
      toast.error('Company name is required');
      return;
    }
    
    setSaving(true);
    try {
      await axios.post('/settings/company', settings);
      toast.success('Company settings saved successfully');
    } catch (error) {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (field, value) => {
    setSettings(prev => ({ ...prev, [field]: value }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-heading font-bold">Company Settings</h2>
          <p className="text-muted-foreground mt-1">Configure your business information for receipts, SOA, and documents</p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save Changes
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Company Logo */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Image className="h-5 w-5 text-primary" />
              Company Logo
            </CardTitle>
            <CardDescription>Upload your company logo for receipts and statements</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center gap-4">
              <div className="w-48 h-48 border-2 border-dashed rounded-lg flex items-center justify-center bg-muted/50 overflow-hidden">
                {settings.company_logo ? (
                  <img 
                    src={settings.company_logo} 
                    alt="Company Logo" 
                    className="max-w-full max-h-full object-contain"
                  />
                ) : (
                  <div className="text-center text-muted-foreground">
                    <Building2 className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No logo uploaded</p>
                  </div>
                )}
              </div>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleLogoUpload}
                accept="image/*"
                className="hidden"
              />
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload Logo
                </Button>
                {settings.company_logo && (
                  <Button 
                    variant="outline" 
                    className="text-red-600"
                    onClick={() => handleChange('company_logo', '')}
                  >
                    Remove
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">Recommended: PNG or JPG, max 2MB</p>
            </div>
          </CardContent>
        </Card>

        {/* Company Details */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              Business Information
            </CardTitle>
            <CardDescription>Your company details for official documents</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="company_name">Company Name *</Label>
              <Input
                id="company_name"
                value={settings.company_name}
                onChange={(e) => handleChange('company_name', e.target.value)}
                placeholder="Your Company Name"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="company_branch">Branch Name (Optional)</Label>
              <Input
                id="company_branch"
                value={settings.company_branch || ''}
                onChange={(e) => handleChange('company_branch', e.target.value)}
                placeholder="Main Branch"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="company_tin">TIN Number</Label>
              <Input
                id="company_tin"
                value={settings.company_tin || ''}
                onChange={(e) => handleChange('company_tin', e.target.value)}
                placeholder="000-000-000-000"
              />
            </div>
          </CardContent>
        </Card>

        {/* Contact Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5 text-primary" />
              Contact Information
            </CardTitle>
            <CardDescription>Contact details shown on receipts and statements</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="company_address" className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                Address
              </Label>
              <Textarea
                id="company_address"
                value={settings.company_address}
                onChange={(e) => handleChange('company_address', e.target.value)}
                placeholder="Street, Barangay, City, Province"
                rows={2}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="company_mobile" className="flex items-center gap-1">
                <Phone className="h-3.5 w-3.5" />
                Mobile Number
              </Label>
              <Input
                id="company_mobile"
                value={settings.company_mobile}
                onChange={(e) => handleChange('company_mobile', e.target.value)}
                placeholder="0917 123 4567"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="company_email" className="flex items-center gap-1">
                <Mail className="h-3.5 w-3.5" />
                Email Address
              </Label>
              <Input
                id="company_email"
                type="email"
                value={settings.company_email || ''}
                onChange={(e) => handleChange('company_email', e.target.value)}
                placeholder="billing@company.com"
              />
            </div>
          </CardContent>
        </Card>

        {/* Document Footers */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Document Settings
            </CardTitle>
            <CardDescription>Custom messages for receipts and statements</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="receipt_footer">Receipt Footer Message</Label>
              <Textarea
                id="receipt_footer"
                value={settings.receipt_footer || ''}
                onChange={(e) => handleChange('receipt_footer', e.target.value)}
                placeholder="Thank you for your payment!"
                rows={2}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="soa_footer">SOA Footer Message</Label>
              <Textarea
                id="soa_footer"
                value={settings.soa_footer || ''}
                onChange={(e) => handleChange('soa_footer', e.target.value)}
                placeholder="If you have questions or concerns..."
                rows={3}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Preview */}
      <Card>
        <CardHeader>
          <CardTitle>Preview</CardTitle>
          <CardDescription>How your company info will appear on documents</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg p-6 bg-white max-w-md">
            <div className="flex items-start gap-4">
              {settings.company_logo && (
                <img src={settings.company_logo} alt="Logo" className="w-16 h-16 object-contain" />
              )}
              <div>
                <h3 className="font-bold text-lg">{settings.company_name || 'Your Company Name'}</h3>
                {settings.company_branch && <p className="text-sm text-gray-600">{settings.company_branch}</p>}
                <p className="text-sm text-gray-600">{settings.company_address || 'Company Address'}</p>
                <p className="text-sm text-gray-600">{settings.company_email}</p>
                <p className="text-sm text-gray-600">{settings.company_mobile}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
