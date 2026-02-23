import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Printer, Upload, Save, Eye, Image, Building2 } from 'lucide-react';

export default function ReceiptSettings() {
  const [settings, setSettings] = useState({
    company_logo: '',
    company_name: '',
    company_address: '',
    company_mobile: '',
    company_email: '',
    tin_number: '',
    vat_registered: false,
    vat_percentage: 12,
    footer_text: 'Thank you for your payment!',
    receipt_title: 'SERVICE INVOICE',
    auto_print: false
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchSettings();
    fetchPreview();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await axios.get('/settings/receipt');
      if (response.data && Object.keys(response.data).length > 0) {
        setSettings(prev => ({ ...prev, ...response.data }));
      }
    } catch (error) {
      console.error('Failed to fetch receipt settings');
    } finally {
      setLoading(false);
    }
  };

  const fetchPreview = async () => {
    try {
      const response = await axios.get('/receipt/preview');
      setPreviewData(response.data);
    } catch (error) {
      console.error('Failed to fetch preview');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.post('/settings/receipt', settings);
      toast.success('Receipt settings saved successfully');
      fetchPreview();
    } catch (error) {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 500000) {
        toast.error('Image too large. Please use an image under 500KB');
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        setSettings({ ...settings, company_logo: event.target.result });
      };
      reader.readAsDataURL(file);
    }
  };

  const handlePrintPreview = () => {
    const printWindow = window.open('', '_blank', 'width=400,height=600');
    printWindow.document.write(generateReceiptHTML(settings, previewData?.sample_payment));
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 250);
  };

  const generateReceiptHTML = (settings, payment) => {
    const now = new Date();
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Receipt Preview</title>
        <style>
          @page { size: 58mm auto; margin: 0; }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { 
            font-family: 'Courier New', monospace; 
            font-size: 10px; 
            width: 58mm; 
            padding: 3mm;
            line-height: 1.3;
          }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .divider { 
            border-top: 1px dashed #000; 
            margin: 4px 0; 
          }
          .row { 
            display: flex; 
            justify-content: space-between; 
            margin: 2px 0;
          }
          .logo { max-width: 40mm; max-height: 15mm; margin: 0 auto 3mm; display: block; }
          .header { margin-bottom: 3mm; }
          .section { margin: 3mm 0; }
          .amount { font-size: 14px; font-weight: bold; }
          .footer { margin-top: 4mm; font-size: 9px; }
        </style>
      </head>
      <body>
        <div class="header center">
          ${settings.company_logo ? `<img src="${settings.company_logo}" class="logo" alt="Logo"/>` : ''}
          <div class="bold" style="font-size: 12px;">${settings.company_name || 'Company Name'}</div>
          <div>${settings.company_address || 'Company Address'}</div>
          <div>${settings.company_mobile || ''}</div>
          ${settings.tin_number ? `<div>TIN: ${settings.tin_number}</div>` : ''}
        </div>
        
        <div class="divider"></div>
        
        <div class="center bold" style="font-size: 11px; margin: 3mm 0;">
          ${settings.receipt_title || 'SERVICE INVOICE'}
        </div>
        
        <div class="divider"></div>
        
        <div class="section">
          <div class="bold">SUBSCRIBER INFO</div>
          <div>${payment?.subscriber_name || 'Customer Name'}</div>
          <div>Acct#: ${payment?.account_number || 'ACC000000'}</div>
          <div style="font-size: 9px;">${payment?.address || 'Address'}</div>
        </div>
        
        <div class="divider"></div>
        
        <div class="section">
          <div class="bold">TRANSACTION DETAILS</div>
          ${payment?.invoices_settled?.map(inv => `
            <div class="row">
              <span>${inv.description || inv.invoice_number}</span>
            </div>
            <div class="row">
              <span></span>
              <span>₱${(inv.amount || 0).toFixed(2)}</span>
            </div>
          `).join('') || '<div class="row"><span>Payment</span><span>₱0.00</span></div>'}
          ${payment?.is_advance_payment ? `
            <div class="row">
              <span>Wallet Credit</span>
              <span>₱${(payment.wallet_credit || 0).toFixed(2)}</span>
            </div>
          ` : ''}
        </div>
        
        <div class="divider"></div>
        
        <div class="row amount">
          <span>TOTAL PAID</span>
          <span>₱${(payment?.total_amount || 0).toFixed(2)}</span>
        </div>
        <div class="row">
          <span>Payment Mode:</span>
          <span>${payment?.mode || 'Cash'}</span>
        </div>
        
        <div class="divider"></div>
        
        ${settings.vat_registered ? `
          <div class="section" style="font-size: 9px;">
            <div>VATable Sales: ₱${((payment?.total_amount || 0) / (1 + settings.vat_percentage/100)).toFixed(2)}</div>
            <div>VAT ${settings.vat_percentage}%: ₱${((payment?.total_amount || 0) - (payment?.total_amount || 0) / (1 + settings.vat_percentage/100)).toFixed(2)}</div>
          </div>
          <div class="divider"></div>
        ` : ''}
        
        <div class="section" style="font-size: 9px;">
          <div>OR#: ${payment?.or_number || 'OR00000000'}</div>
          <div>Date: ${now.toLocaleDateString('en-PH')} ${now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}</div>
          <div>Cashier: ${payment?.received_by || 'Cashier'}</div>
        </div>
        
        <div class="divider"></div>
        
        <div class="footer center">
          ${settings.footer_text || 'Thank you for your payment!'}
        </div>
      </body>
      </html>
    `;
  };

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground">Loading settings...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-2xl sm:text-3xl font-heading font-bold">Receipt Setup</h2>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handlePrintPreview} data-testid="preview-receipt-btn">
            <Eye className="h-4 w-4 mr-2" />
            Print Preview
          </Button>
          <Button onClick={handleSave} disabled={saving} data-testid="save-receipt-settings-btn">
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Saving...' : 'Save Settings'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Settings Form */}
        <div className="space-y-6">
          {/* Company Logo */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Image className="h-5 w-5" />
                Company Logo
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                {settings.company_logo ? (
                  <img 
                    src={settings.company_logo} 
                    alt="Company Logo" 
                    className="w-24 h-24 object-contain border rounded"
                  />
                ) : (
                  <div className="w-24 h-24 border-2 border-dashed rounded flex items-center justify-center text-muted-foreground">
                    No Logo
                  </div>
                )}
                <div className="space-y-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg"
                    onChange={handleLogoUpload}
                    className="hidden"
                  />
                  <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Logo
                  </Button>
                  <p className="text-xs text-muted-foreground">PNG or JPEG, max 500KB</p>
                  {settings.company_logo && (
                    <Button 
                      variant="ghost" 
                      size="sm"
                      className="text-red-600"
                      onClick={() => setSettings({ ...settings, company_logo: '' })}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Company Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Company Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Company Name</Label>
                <Input
                  value={settings.company_name}
                  onChange={(e) => setSettings({ ...settings, company_name: e.target.value })}
                  placeholder="Your Company Name"
                  data-testid="company-name-input"
                />
              </div>
              <div>
                <Label>Address</Label>
                <Textarea
                  value={settings.company_address}
                  onChange={(e) => setSettings({ ...settings, company_address: e.target.value })}
                  placeholder="Complete business address"
                  rows={2}
                  data-testid="company-address-input"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Mobile Number</Label>
                  <Input
                    value={settings.company_mobile}
                    onChange={(e) => setSettings({ ...settings, company_mobile: e.target.value })}
                    placeholder="09XX XXX XXXX"
                    data-testid="company-mobile-input"
                  />
                </div>
                <div>
                  <Label>Email (Optional)</Label>
                  <Input
                    value={settings.company_email}
                    onChange={(e) => setSettings({ ...settings, company_email: e.target.value })}
                    placeholder="email@company.com"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Receipt Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Printer className="h-5 w-5" />
                Receipt Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Receipt Title</Label>
                <Input
                  value={settings.receipt_title}
                  onChange={(e) => setSettings({ ...settings, receipt_title: e.target.value })}
                  placeholder="SERVICE INVOICE"
                  data-testid="receipt-title-input"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>TIN Number (Optional)</Label>
                  <Input
                    value={settings.tin_number}
                    onChange={(e) => setSettings({ ...settings, tin_number: e.target.value })}
                    placeholder="XXX-XXX-XXX-XXX"
                  />
                </div>
                <div>
                  <Label>VAT %</Label>
                  <Input
                    type="number"
                    value={settings.vat_percentage}
                    onChange={(e) => setSettings({ ...settings, vat_percentage: parseFloat(e.target.value) || 0 })}
                    disabled={!settings.vat_registered}
                  />
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="vat_registered"
                  checked={settings.vat_registered}
                  onCheckedChange={(checked) => setSettings({ ...settings, vat_registered: checked })}
                />
                <Label htmlFor="vat_registered" className="cursor-pointer">VAT Registered</Label>
              </div>
              <div>
                <Label>Footer Text</Label>
                <Input
                  value={settings.footer_text}
                  onChange={(e) => setSettings({ ...settings, footer_text: e.target.value })}
                  placeholder="Thank you for your payment!"
                />
              </div>
              <div className="flex items-center space-x-2 pt-2 border-t">
                <Checkbox
                  id="auto_print"
                  checked={settings.auto_print}
                  onCheckedChange={(checked) => setSettings({ ...settings, auto_print: checked })}
                  data-testid="auto-print-checkbox"
                />
                <Label htmlFor="auto_print" className="cursor-pointer">
                  Auto-print receipt after payment
                </Label>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Live Preview */}
        <Card className="lg:sticky lg:top-4 h-fit">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Receipt Preview (58mm)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div 
              className="bg-white text-black p-4 rounded border-2 mx-auto"
              style={{ 
                width: '220px', 
                fontFamily: "'Courier New', monospace",
                fontSize: '10px',
                lineHeight: '1.3'
              }}
            >
              {/* Logo */}
              {settings.company_logo && (
                <div className="text-center mb-2">
                  <img 
                    src={settings.company_logo} 
                    alt="Logo" 
                    style={{ maxWidth: '120px', maxHeight: '45px', margin: '0 auto' }}
                  />
                </div>
              )}
              
              {/* Header */}
              <div className="text-center mb-2">
                <div className="font-bold" style={{ fontSize: '12px' }}>
                  {settings.company_name || 'Company Name'}
                </div>
                <div style={{ fontSize: '9px' }}>{settings.company_address || 'Company Address'}</div>
                <div>{settings.company_mobile || 'Mobile Number'}</div>
                {settings.tin_number && <div style={{ fontSize: '9px' }}>TIN: {settings.tin_number}</div>}
              </div>
              
              <div className="border-t border-dashed border-gray-400 my-2"></div>
              
              {/* Receipt Title */}
              <div className="text-center font-bold my-2" style={{ fontSize: '11px' }}>
                {settings.receipt_title || 'SERVICE INVOICE'}
              </div>
              
              <div className="border-t border-dashed border-gray-400 my-2"></div>
              
              {/* Subscriber Info */}
              <div className="mb-2">
                <div className="font-bold">SUBSCRIBER INFO</div>
                <div>{previewData?.sample_payment?.subscriber_name || 'Juan Dela Cruz'}</div>
                <div>Acct#: {previewData?.sample_payment?.account_number || 'ACC123456789'}</div>
                <div style={{ fontSize: '9px' }}>{previewData?.sample_payment?.address || '123 Sample St, Manila'}</div>
              </div>
              
              <div className="border-t border-dashed border-gray-400 my-2"></div>
              
              {/* Transaction Details */}
              <div className="mb-2">
                <div className="font-bold">TRANSACTION DETAILS</div>
                <div className="flex justify-between">
                  <span>Monthly Plan - Feb 2026</span>
                </div>
                <div className="flex justify-between">
                  <span></span>
                  <span>₱1,000.00</span>
                </div>
              </div>
              
              <div className="border-t border-dashed border-gray-400 my-2"></div>
              
              {/* Total */}
              <div className="flex justify-between font-bold" style={{ fontSize: '12px' }}>
                <span>TOTAL PAID</span>
                <span>₱1,000.00</span>
              </div>
              <div className="flex justify-between">
                <span>Payment Mode:</span>
                <span>Cash</span>
              </div>
              
              <div className="border-t border-dashed border-gray-400 my-2"></div>
              
              {/* VAT Info */}
              {settings.vat_registered && (
                <>
                  <div style={{ fontSize: '9px' }}>
                    <div>VATable Sales: ₱{(1000 / (1 + settings.vat_percentage/100)).toFixed(2)}</div>
                    <div>VAT {settings.vat_percentage}%: ₱{(1000 - 1000 / (1 + settings.vat_percentage/100)).toFixed(2)}</div>
                  </div>
                  <div className="border-t border-dashed border-gray-400 my-2"></div>
                </>
              )}
              
              {/* Transaction Info */}
              <div style={{ fontSize: '9px' }}>
                <div>OR#: OR20260216SAMPLE</div>
                <div>Date: {new Date().toLocaleDateString('en-PH')} {new Date().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}</div>
                <div>Cashier: admin</div>
              </div>
              
              <div className="border-t border-dashed border-gray-400 my-2"></div>
              
              {/* Footer */}
              <div className="text-center" style={{ fontSize: '9px' }}>
                {settings.footer_text || 'Thank you for your payment!'}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
