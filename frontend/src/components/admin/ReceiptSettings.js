import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Printer, Upload, Save, Eye, Image, Building2, FileText, X } from 'lucide-react';

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
    or_prefix: 'OR',
    paper_width: 48,
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
    const paperWidth = settings.paper_width || 48;
    const widthMM = `${paperWidth}mm`;
    const logoMaxWidth = paperWidth === 48 ? '35mm' : '40mm';
    const fontSize = paperWidth === 48 ? '9px' : '10px';
    const headerFontSize = paperWidth === 48 ? '11px' : '12px';
    const amountFontSize = paperWidth === 48 ? '12px' : '14px';
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Receipt Preview</title>
        <style>
          @page { size: ${widthMM} auto; margin: 0; }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { 
            font-family: 'Courier New', monospace; 
            font-size: ${fontSize}; 
            width: ${widthMM}; 
            padding: 2mm;
            line-height: 1.2;
          }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .divider { 
            border-top: 1px dashed #000; 
            margin: 3px 0; 
          }
          .row { 
            display: flex; 
            justify-content: space-between; 
            margin: 1px 0;
          }
          .logo { max-width: ${logoMaxWidth}; max-height: 12mm; margin: 0 auto 2mm; display: block; }
          .header { margin-bottom: 2mm; }
          .section { margin: 2mm 0; }
          .amount { font-size: ${amountFontSize}; font-weight: bold; }
          .footer { margin-top: 3mm; font-size: 8px; }
          .small { font-size: 8px; }
        </style>
      </head>
      <body>
        <div class="header center">
          ${settings.company_logo ? `<img src="${settings.company_logo}" class="logo" alt="Logo"/>` : ''}
          <div class="bold" style="font-size: ${headerFontSize};">${settings.company_name || 'Company Name'}</div>
          <div class="small">${settings.company_address || 'Company Address'}</div>
          <div>${settings.company_mobile || ''}</div>
          ${settings.tin_number ? `<div class="small">TIN: ${settings.tin_number}</div>` : ''}
        </div>
        
        <div class="divider"></div>
        
        <div class="center bold" style="font-size: ${headerFontSize}; margin: 2mm 0;">
          ${settings.receipt_title || 'SERVICE INVOICE'}
        </div>
        <div class="center small">${settings.or_prefix || 'OR'}#: ${payment?.or_number || 'OR00000000'}</div>
        
        <div class="divider"></div>
        
        <div class="section">
          <div class="bold">SUBSCRIBER</div>
          <div>${payment?.subscriber_name || 'Customer Name'}</div>
          <div class="small">Acct#: ${payment?.account_number || 'ACC000000'}</div>
          <div class="small">${payment?.address || 'Address'}</div>
        </div>
        
        <div class="divider"></div>
        
        <div class="section">
          <div class="bold">DESCRIPTION</div>
          <div class="small">${payment?.description || 'Payment for services'}</div>
        </div>
        
        <div class="divider"></div>
        
        <div class="section">
          <div class="bold">DETAILS</div>
          ${payment?.invoices_settled?.map(inv => `
            <div class="row small">
              <span>${inv.description || inv.invoice_number}</span>
            </div>
            <div class="row">
              <span></span>
              <span>P${(inv.amount || 0).toFixed(2)}</span>
            </div>
          `).join('') || '<div class="row"><span>Payment</span><span>P0.00</span></div>'}
          ${payment?.is_advance_payment ? `
            <div class="row small">
              <span>Wallet Credit</span>
              <span>P${(payment.wallet_credit || 0).toFixed(2)}</span>
            </div>
          ` : ''}
        </div>
        
        <div class="divider"></div>
        
        <div class="row amount">
          <span>TOTAL</span>
          <span>P${(payment?.total_amount || 0).toFixed(2)}</span>
        </div>
        <div class="row small">
          <span>Mode:</span>
          <span>${payment?.mode || 'Cash'}</span>
        </div>
        
        <div class="divider"></div>
        
        ${settings.vat_registered ? `
          <div class="section small">
            <div>VATable: P${((payment?.total_amount || 0) / (1 + settings.vat_percentage/100)).toFixed(2)}</div>
            <div>VAT ${settings.vat_percentage}%: P${((payment?.total_amount || 0) - (payment?.total_amount || 0) / (1 + settings.vat_percentage/100)).toFixed(2)}</div>
          </div>
          <div class="divider"></div>
        ` : ''}
        
        <div class="section small">
          <div>Date: ${now.toLocaleDateString('en-PH')} ${now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}</div>
          <div>Processed by: ${payment?.received_by || 'Cashier'}</div>
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

  // Preview dimensions based on paper width
  const previewWidth = settings.paper_width === 48 ? '180px' : '220px';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-2xl sm:text-3xl font-heading font-bold" data-testid="receipt-settings-title">Receipt Setup</h2>
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
                    className="w-20 h-20 object-contain border rounded"
                  />
                ) : (
                  <div className="w-20 h-20 border-2 border-dashed rounded flex items-center justify-center text-muted-foreground text-xs">
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
                    data-testid="logo-upload-input"
                  />
                  <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Logo
                  </Button>
                  <p className="text-xs text-muted-foreground">PNG/JPEG, max 500KB</p>
                  {settings.company_logo && (
                    <Button 
                      variant="ghost" 
                      size="sm"
                      className="text-red-600 h-7"
                      onClick={() => setSettings({ ...settings, company_logo: '' })}
                    >
                      <X className="h-3 w-3 mr-1" />
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
                <FileText className="h-5 w-5" />
                Receipt Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Receipt Title</Label>
                  <Input
                    value={settings.receipt_title}
                    onChange={(e) => setSettings({ ...settings, receipt_title: e.target.value })}
                    placeholder="SERVICE INVOICE"
                    data-testid="receipt-title-input"
                  />
                </div>
                <div>
                  <Label>OR/SI Prefix</Label>
                  <Select 
                    value={settings.or_prefix} 
                    onValueChange={(v) => setSettings({ ...settings, or_prefix: v })}
                  >
                    <SelectTrigger data-testid="or-prefix-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="OR">OR (Official Receipt)</SelectItem>
                      <SelectItem value="SI">SI (Sales Invoice)</SelectItem>
                      <SelectItem value="AR">AR (Acknowledgment Receipt)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Paper Width</Label>
                  <Select 
                    value={settings.paper_width?.toString()} 
                    onValueChange={(v) => setSettings({ ...settings, paper_width: parseInt(v) })}
                  >
                    <SelectTrigger data-testid="paper-width-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="48">48mm (Mobile Thermal)</SelectItem>
                      <SelectItem value="58">58mm (Standard Thermal)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>TIN Number (Optional)</Label>
                  <Input
                    value={settings.tin_number}
                    onChange={(e) => setSettings({ ...settings, tin_number: e.target.value })}
                    placeholder="XXX-XXX-XXX-XXX"
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center space-x-2 pt-5">
                  <Checkbox
                    id="vat_registered"
                    checked={settings.vat_registered}
                    onCheckedChange={(checked) => setSettings({ ...settings, vat_registered: checked })}
                    data-testid="vat-registered-checkbox"
                  />
                  <Label htmlFor="vat_registered" className="cursor-pointer">VAT Registered</Label>
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
              
              <div>
                <Label>Footer Text</Label>
                <Input
                  value={settings.footer_text}
                  onChange={(e) => setSettings({ ...settings, footer_text: e.target.value })}
                  placeholder="Thank you for your payment!"
                  data-testid="footer-text-input"
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
                  Auto-print receipt after payment (Cashier module)
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
              Receipt Preview ({settings.paper_width || 48}mm)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div 
              className="bg-white text-black p-3 rounded border-2 mx-auto"
              style={{ 
                width: previewWidth, 
                fontFamily: "'Courier New', monospace",
                fontSize: settings.paper_width === 48 ? '9px' : '10px',
                lineHeight: '1.2'
              }}
              data-testid="receipt-preview"
            >
              {/* Logo */}
              {settings.company_logo && (
                <div className="text-center mb-2">
                  <img 
                    src={settings.company_logo} 
                    alt="Logo" 
                    style={{ maxWidth: settings.paper_width === 48 ? '100px' : '120px', maxHeight: '40px', margin: '0 auto' }}
                  />
                </div>
              )}
              
              {/* Header */}
              <div className="text-center mb-2">
                <div className="font-bold" style={{ fontSize: settings.paper_width === 48 ? '11px' : '12px' }}>
                  {settings.company_name || 'Company Name'}
                </div>
                <div style={{ fontSize: '8px' }}>{settings.company_address || 'Company Address'}</div>
                <div>{settings.company_mobile || 'Mobile Number'}</div>
                {settings.tin_number && <div style={{ fontSize: '8px' }}>TIN: {settings.tin_number}</div>}
              </div>
              
              <div className="border-t border-dashed border-gray-400 my-1"></div>
              
              {/* Receipt Title & OR Number */}
              <div className="text-center font-bold my-1" style={{ fontSize: settings.paper_width === 48 ? '11px' : '12px' }}>
                {settings.receipt_title || 'SERVICE INVOICE'}
              </div>
              <div className="text-center" style={{ fontSize: '8px' }}>
                {settings.or_prefix || 'OR'}#: {previewData?.sample_payment?.or_number?.replace(/^[A-Z]+/, settings.or_prefix || 'OR') || `${settings.or_prefix}20260216SAMPLE`}
              </div>
              
              <div className="border-t border-dashed border-gray-400 my-1"></div>
              
              {/* Subscriber Info */}
              <div className="mb-1">
                <div className="font-bold">SUBSCRIBER</div>
                <div>{previewData?.sample_payment?.subscriber_name || 'Juan Dela Cruz'}</div>
                <div style={{ fontSize: '8px' }}>Acct#: {previewData?.sample_payment?.account_number || 'ACC123456789'}</div>
                <div style={{ fontSize: '8px' }}>{previewData?.sample_payment?.address || '123 Sample St, Manila'}</div>
              </div>
              
              <div className="border-t border-dashed border-gray-400 my-1"></div>
              
              {/* Description */}
              <div className="mb-1">
                <div className="font-bold">DESCRIPTION</div>
                <div style={{ fontSize: '8px' }}>{previewData?.sample_payment?.description || 'Monthly Internet Service Payment'}</div>
              </div>
              
              <div className="border-t border-dashed border-gray-400 my-1"></div>
              
              {/* Transaction Details */}
              <div className="mb-1">
                <div className="font-bold">DETAILS</div>
                <div className="flex justify-between" style={{ fontSize: '8px' }}>
                  <span>Monthly Plan - Feb 2026</span>
                </div>
                <div className="flex justify-between">
                  <span></span>
                  <span>P1,000.00</span>
                </div>
              </div>
              
              <div className="border-t border-dashed border-gray-400 my-1"></div>
              
              {/* Total */}
              <div className="flex justify-between font-bold" style={{ fontSize: settings.paper_width === 48 ? '12px' : '14px' }}>
                <span>TOTAL</span>
                <span>P1,000.00</span>
              </div>
              <div className="flex justify-between" style={{ fontSize: '8px' }}>
                <span>Mode:</span>
                <span>Cash</span>
              </div>
              
              <div className="border-t border-dashed border-gray-400 my-1"></div>
              
              {/* VAT Info */}
              {settings.vat_registered && (
                <>
                  <div style={{ fontSize: '8px' }}>
                    <div>VATable: P{(1000 / (1 + settings.vat_percentage/100)).toFixed(2)}</div>
                    <div>VAT {settings.vat_percentage}%: P{(1000 - 1000 / (1 + settings.vat_percentage/100)).toFixed(2)}</div>
                  </div>
                  <div className="border-t border-dashed border-gray-400 my-1"></div>
                </>
              )}
              
              {/* Transaction Info */}
              <div style={{ fontSize: '8px' }}>
                <div>Date: {new Date().toLocaleDateString('en-PH')} {new Date().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}</div>
                <div>Processed by: {previewData?.sample_payment?.received_by || 'admin'}</div>
              </div>
              
              <div className="border-t border-dashed border-gray-400 my-1"></div>
              
              {/* Footer */}
              <div className="text-center" style={{ fontSize: '8px' }}>
                {settings.footer_text || 'Thank you for your payment!'}
              </div>
            </div>
            
            {/* Printer Info */}
            <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
              <h4 className="text-sm font-medium text-blue-800 dark:text-blue-300 mb-2 flex items-center gap-2">
                <Printer className="h-4 w-4" />
                Bluetooth Printer Info
              </h4>
              <p className="text-xs text-blue-700 dark:text-blue-400">
                For 48mm thermal printers, use the Web Bluetooth API in the Cashier module to print receipts directly to your mobile Bluetooth printer (e.g., RPP02N).
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Note: Web Bluetooth is supported on Chrome/Edge browsers.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
