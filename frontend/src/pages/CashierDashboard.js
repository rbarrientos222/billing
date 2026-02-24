import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { LogOut, Search, Receipt, DollarSign, Wallet, CreditCard, Check, AlertCircle, History, Calendar, ChevronDown, ChevronUp, Plus, Filter, X, Printer, Bluetooth, Percent } from 'lucide-react';

export default function CashierDashboard({ user, onLogout }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedSubscriber, setSelectedSubscriber] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [paymentHistory, setPaymentHistory] = useState([]);
  const [filteredPaymentHistory, setFilteredPaymentHistory] = useState([]);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState('cash');
  const [todayStats, setTodayStats] = useState({ total: 0, count: 0 });
  const [searching, setSearching] = useState(false);
  const [walletBalance, setWalletBalance] = useState(0);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [paymentResult, setPaymentResult] = useState(null);
  
  // Payment history visibility and date filter
  const [showPaymentHistory, setShowPaymentHistory] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loadingHistory, setLoadingHistory] = useState(false);
  
  // Advance payment (wallet deposit) state
  const [showAdvancePayment, setShowAdvancePayment] = useState(false);
  const [advanceAmount, setAdvanceAmount] = useState('');
  const [advancePaymentMode, setAdvancePaymentMode] = useState('cash');
  const [processingAdvance, setProcessingAdvance] = useState(false);
  
  // Receipt printing state
  const [receiptSettings, setReceiptSettings] = useState(null);
  const [autoPrintReceipt, setAutoPrintReceipt] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [bluetoothDevice, setBluetoothDevice] = useState(null);
  const printCharacteristicRef = useRef(null);
  
  // Discount/Rebate state
  const [availableDiscounts, setAvailableDiscounts] = useState([]);
  const [selectedDiscounts, setSelectedDiscounts] = useState([]);
  const [totalDiscountAmount, setTotalDiscountAmount] = useState(0);

  // Fetch today's payment stats and receipt settings on load
  useEffect(() => {
    fetchTodayStats();
    fetchReceiptSettings();
  }, []);

  const fetchTodayStats = async () => {
    try {
      const response = await axios.get('/payments/today-stats');
      setTodayStats(response.data);
    } catch (error) {
      console.error('Failed to fetch today stats');
    }
  };

  // Fetch receipt settings
  const fetchReceiptSettings = async () => {
    try {
      const response = await axios.get('/settings/receipt');
      setReceiptSettings(response.data);
      setAutoPrintReceipt(response.data?.auto_print || false);
    } catch (error) {
      console.error('Failed to fetch receipt settings');
    }
  };

  // Generate receipt HTML for printing
  const generateReceiptHTML = (settings, payment) => {
    const paperWidth = settings?.paper_width || 48;
    const widthMM = `${paperWidth}mm`;
    const logoMaxWidth = paperWidth === 48 ? '30mm' : '35mm';
    const orPrefix = settings?.or_prefix || 'OR';
    
    const paymentDate = payment?.payment_date ? new Date(payment.payment_date) : new Date();
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Receipt</title>
        <style>
          @page { size: ${widthMM} auto; margin: 0; }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { 
            font-family: 'Courier New', monospace; 
            font-size: 8px; 
            width: ${widthMM}; 
            padding: 2mm;
            line-height: 1.1;
          }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .divider { border-top: 1px dashed #000; margin: 2px 0; }
          .row { display: flex; justify-content: space-between; margin: 1px 0; }
          .logo { max-width: ${logoMaxWidth}; max-height: 10mm; margin: 0 auto 2mm; display: block; }
          .company-name { font-size: 10px; font-weight: bold; }
          .branch { font-size: 7px; }
          .address { font-size: 6px; }
          .contact { font-size: 7px; }
          .title { font-size: 9px; font-weight: bold; }
          .or-number { font-size: 7px; }
          .section-header { font-size: 7px; font-weight: bold; }
          .subscriber-info { font-size: 6px; }
          .details { font-size: 6px; }
          .amount { font-size: 10px; font-weight: bold; }
          .small { font-size: 6px; }
        </style>
      </head>
      <body>
        <div class="center">
          ${settings?.company_logo ? `<img src="${settings.company_logo}" class="logo" alt="Logo"/>` : ''}
          <div class="company-name">${settings?.company_name || 'Company'}</div>
          ${settings?.company_branch ? `<div class="branch">${settings.company_branch}</div>` : ''}
          <div class="address">${settings?.company_address || ''}</div>
          <div class="contact">${settings?.company_mobile || ''}</div>
          ${settings?.tin_number ? `<div class="small">TIN: ${settings.tin_number}</div>` : ''}
        </div>
        
        <div class="divider"></div>
        
        <div class="center title" style="margin: 1mm 0;">
          ${settings?.receipt_title || 'SERVICE INVOICE'}
        </div>
        <div class="center or-number">${orPrefix}#: ${payment?.or_number || ''}</div>
        
        <div class="divider"></div>
        
        <div>
          <div class="section-header">SUBSCRIBER</div>
          <div class="subscriber-info">${payment?.subscriber_name || ''}</div>
          <div class="subscriber-info">Acct#: ${payment?.account_number || ''}</div>
          <div class="subscriber-info">${payment?.address || ''}</div>
        </div>
        
        <div class="divider"></div>
        
        <div>
          <div class="section-header">DESCRIPTION</div>
          <div class="details">${payment?.description || 'Payment for services'}</div>
        </div>
        
        <div class="divider"></div>
        
        <div>
          <div class="section-header">DETAILS</div>
          ${(payment?.invoices_settled || []).map(inv => `
            <div class="details">${inv.description || inv.invoice_number || 'Invoice'}</div>
            <div class="row details">
              <span></span>
              <span>P${(inv.amount || 0).toFixed(2)}</span>
            </div>
          `).join('')}
          ${(payment?.invoices_partial || []).map(inv => `
            <div class="details">${inv.description || inv.invoice_number || 'Invoice'} (Partial)</div>
            <div class="row details">
              <span></span>
              <span>P${(inv.amount_paid || 0).toFixed(2)}</span>
            </div>
          `).join('')}
          ${payment?.is_advance_payment ? `
            <div class="row details">
              <span>Wallet Credit</span>
              <span>P${(payment.wallet_credit || 0).toFixed(2)}</span>
            </div>
          ` : ''}
        </div>
        
        ${payment?.total_discount > 0 ? `
          <div class="divider"></div>
          <div class="row details">
            <span>Subtotal:</span>
            <span>P${(payment.original_amount || payment.total_amount + payment.total_discount).toFixed(2)}</span>
          </div>
          ${(payment?.applied_discounts || []).map(d => `
            <div class="row details" style="color: green;">
              <span>${d.name || 'Discount'}:</span>
              <span>-P${(d.discount_amount || 0).toFixed(2)}</span>
            </div>
          `).join('')}
        ` : ''}
        
        <div class="divider"></div>
        
        <div class="row amount">
          <span>TOTAL PAID</span>
          <span>P${(payment?.total_amount || 0).toFixed(2)}</span>
        </div>
        <div class="row small">
          <span>Mode:</span>
          <span>${payment?.mode || 'Cash'}</span>
        </div>
        
        <div class="divider"></div>
        
        ${settings?.vat_registered ? `
          <div class="small">
            <div>VATable: P${((payment?.total_amount || 0) / (1 + (settings.vat_percentage || 12)/100)).toFixed(2)}</div>
            <div>VAT ${settings.vat_percentage || 12}%: P${((payment?.total_amount || 0) - (payment?.total_amount || 0) / (1 + (settings.vat_percentage || 12)/100)).toFixed(2)}</div>
          </div>
          <div class="divider"></div>
        ` : ''}
        
        <div class="small">
          <div>Date: ${paymentDate.toLocaleDateString('en-PH')} ${paymentDate.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}</div>
          <div>Processed by: ${payment?.received_by || user.username}</div>
        </div>
        
        <div class="divider"></div>
        
        <div class="center small" style="white-space: pre-line;">
          ${(settings?.footer_text || 'Thank you for your payment!').replace(/\n/g, '<br>')}
        </div>
      </body>
      </html>
    `;
  };

  // Print receipt using browser print dialog
  const printReceiptBrowser = async (orNumber) => {
    setPrinting(true);
    try {
      const response = await axios.get(`/receipt/data/${orNumber}`);
      const { settings, payment } = response.data;
      
      const printWindow = window.open('', '_blank', 'width=400,height=600');
      printWindow.document.write(generateReceiptHTML(settings, payment));
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 250);
      
      toast.success('Receipt sent to print');
    } catch (error) {
      toast.error('Failed to print receipt');
      console.error('Print error:', error);
    } finally {
      setPrinting(false);
    }
  };

  // Connect to Bluetooth printer
  const connectBluetoothPrinter = async () => {
    try {
      if (!navigator.bluetooth) {
        toast.error('Web Bluetooth is not supported in this browser. Use Chrome or Edge.');
        return false;
      }
      
      const device = await navigator.bluetooth.requestDevice({
        filters: [
          { services: ['000018f0-0000-1000-8000-00805f9b34fb'] }, // Common thermal printer service
          { namePrefix: 'RPP' }, // RPP series printers
          { namePrefix: 'Printer' },
          { namePrefix: 'BT' },
        ],
        optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb', '0000ff00-0000-1000-8000-00805f9b34fb', 'e7810a71-73ae-499d-8c15-faa9aef0c3f2']
      });
      
      toast.info(`Connecting to ${device.name}...`);
      
      const server = await device.gatt.connect();
      const services = await server.getPrimaryServices();
      
      let characteristic = null;
      for (const service of services) {
        const characteristics = await service.getCharacteristics();
        for (const char of characteristics) {
          if (char.properties.write || char.properties.writeWithoutResponse) {
            characteristic = char;
            break;
          }
        }
        if (characteristic) break;
      }
      
      if (!characteristic) {
        throw new Error('No writable characteristic found');
      }
      
      setBluetoothDevice(device);
      printCharacteristicRef.current = characteristic;
      toast.success(`Connected to ${device.name}`);
      return true;
    } catch (error) {
      if (error.name === 'NotFoundError') {
        toast.error('No printer selected');
      } else {
        toast.error(`Bluetooth error: ${error.message}`);
      }
      console.error('Bluetooth error:', error);
      return false;
    }
  };

  // Generate ESC/POS commands for thermal printer
  const generateESCPOS = (settings, payment) => {
    const ESC = 0x1B;
    const GS = 0x1D;
    const LF = 0x0A;
    
    const encoder = new TextEncoder();
    const commands = [];
    
    // Initialize printer
    commands.push(new Uint8Array([ESC, 0x40])); // ESC @ - Initialize
    
    // Center align
    commands.push(new Uint8Array([ESC, 0x61, 0x01])); // ESC a 1 - Center
    
    // Company name (bold)
    commands.push(new Uint8Array([ESC, 0x45, 0x01])); // Bold on
    commands.push(encoder.encode(settings?.company_name || 'Company'));
    commands.push(new Uint8Array([LF]));
    commands.push(new Uint8Array([ESC, 0x45, 0x00])); // Bold off
    
    // Branch (if exists)
    if (settings?.company_branch) {
      commands.push(encoder.encode(settings.company_branch));
      commands.push(new Uint8Array([LF]));
    }
    
    // Company address
    if (settings?.company_address) {
      commands.push(encoder.encode(settings.company_address));
      commands.push(new Uint8Array([LF]));
    }
    if (settings?.company_mobile) {
      commands.push(encoder.encode(settings.company_mobile));
      commands.push(new Uint8Array([LF]));
    }
    
    if (settings?.tin_number) {
      commands.push(encoder.encode(`TIN: ${settings.tin_number}`));
      commands.push(new Uint8Array([LF]));
    }
    
    // Divider
    commands.push(encoder.encode('------------------------'));
    commands.push(new Uint8Array([LF]));
    
    // Receipt title
    commands.push(new Uint8Array([ESC, 0x45, 0x01])); // Bold on
    commands.push(encoder.encode(settings?.receipt_title || 'SERVICE INVOICE'));
    commands.push(new Uint8Array([LF]));
    commands.push(new Uint8Array([ESC, 0x45, 0x00])); // Bold off
    
    // OR Number
    commands.push(encoder.encode(`${settings?.or_prefix || 'OR'}#: ${payment?.or_number || ''}`));
    commands.push(new Uint8Array([LF]));
    
    // Divider
    commands.push(encoder.encode('------------------------'));
    commands.push(new Uint8Array([LF]));
    
    // Left align for details
    commands.push(new Uint8Array([ESC, 0x61, 0x00])); // Left align
    
    // Subscriber
    commands.push(encoder.encode('SUBSCRIBER'));
    commands.push(new Uint8Array([LF]));
    commands.push(encoder.encode(payment?.subscriber_name || ''));
    commands.push(new Uint8Array([LF]));
    commands.push(encoder.encode(`Acct#: ${payment?.account_number || ''}`));
    commands.push(new Uint8Array([LF]));
    // Subscriber address
    if (payment?.address) {
      commands.push(encoder.encode(payment.address));
      commands.push(new Uint8Array([LF]));
    }
    
    // Divider
    commands.push(encoder.encode('------------------------'));
    commands.push(new Uint8Array([LF]));
    
    // Description
    commands.push(encoder.encode('DESCRIPTION'));
    commands.push(new Uint8Array([LF]));
    commands.push(encoder.encode(payment?.description || 'Payment'));
    commands.push(new Uint8Array([LF]));
    
    // Divider
    commands.push(encoder.encode('------------------------'));
    commands.push(new Uint8Array([LF]));
    
    // Total
    commands.push(new Uint8Array([ESC, 0x45, 0x01])); // Bold
    const totalLine = `TOTAL: P${(payment?.total_amount || 0).toFixed(2)}`;
    commands.push(encoder.encode(totalLine));
    commands.push(new Uint8Array([LF]));
    commands.push(new Uint8Array([ESC, 0x45, 0x00])); // Bold off
    commands.push(encoder.encode(`Mode: ${payment?.mode || 'Cash'}`));
    commands.push(new Uint8Array([LF]));
    
    // Divider
    commands.push(encoder.encode('------------------------'));
    commands.push(new Uint8Array([LF]));
    
    // Date and processor
    const paymentDate = payment?.payment_date ? new Date(payment.payment_date) : new Date();
    commands.push(encoder.encode(`Date: ${paymentDate.toLocaleDateString('en-PH')}`));
    commands.push(new Uint8Array([LF]));
    commands.push(encoder.encode(`Processed by: ${payment?.received_by || ''}`));
    commands.push(new Uint8Array([LF]));
    
    // Divider
    commands.push(encoder.encode('------------------------'));
    commands.push(new Uint8Array([LF]));
    
    // Footer (centered) - handle multiple lines
    commands.push(new Uint8Array([ESC, 0x61, 0x01])); // Center
    const footerLines = (settings?.footer_text || 'Thank you!').split('\n');
    for (const line of footerLines) {
      commands.push(encoder.encode(line.trim()));
      commands.push(new Uint8Array([LF]));
    }
    commands.push(new Uint8Array([LF, LF])); // Extra lines
    
    // Cut paper
    commands.push(new Uint8Array([GS, 0x56, 0x00])); // Full cut
    
    // Combine all commands
    const totalLength = commands.reduce((acc, cmd) => acc + cmd.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const cmd of commands) {
      result.set(cmd, offset);
      offset += cmd.length;
    }
    
    return result;
  };

  // Print to Bluetooth thermal printer
  const printReceiptBluetooth = async (orNumber) => {
    setPrinting(true);
    try {
      // Ensure connected
      if (!printCharacteristicRef.current) {
        const connected = await connectBluetoothPrinter();
        if (!connected) {
          setPrinting(false);
          return;
        }
      }
      
      const response = await axios.get(`/receipt/data/${orNumber}`);
      const { settings, payment } = response.data;
      
      const escposData = generateESCPOS(settings, payment);
      
      // Send data in chunks (BLE has packet size limits)
      const chunkSize = 100;
      for (let i = 0; i < escposData.length; i += chunkSize) {
        const chunk = escposData.slice(i, i + chunkSize);
        await printCharacteristicRef.current.writeValue(chunk);
        await new Promise(resolve => setTimeout(resolve, 50)); // Small delay between chunks
      }
      
      toast.success('Receipt printed successfully');
    } catch (error) {
      console.error('Bluetooth print error:', error);
      if (error.message?.includes('GATT')) {
        setBluetoothDevice(null);
        printCharacteristicRef.current = null;
        toast.error('Printer disconnected. Please reconnect.');
      } else {
        toast.error('Failed to print receipt');
      }
    } finally {
      setPrinting(false);
    }
  };

  // Auto-print after successful payment
  const handleAutoPrint = async (orNumber) => {
    if (autoPrintReceipt && orNumber) {
      // Small delay to let payment UI update
      setTimeout(() => {
        if (bluetoothDevice && printCharacteristicRef.current) {
          printReceiptBluetooth(orNumber);
        } else {
          printReceiptBrowser(orNumber);
        }
      }, 500);
    }
  };

  const handleSearch = async () => {
    if (!searchTerm.trim()) return;
    setSearching(true);
    setSearchResults([]);
    
    try {
      // First try exact account number match
      const response = await axios.get(`/subscribers/${searchTerm}`);
      selectSubscriber(response.data);
    } catch (error) {
      // If not found by account number, search by name
      try {
        const searchResponse = await axios.get(`/subscribers/search?q=${encodeURIComponent(searchTerm)}`);
        if (searchResponse.data.length === 1) {
          // Single result, select directly
          selectSubscriber(searchResponse.data[0]);
        } else if (searchResponse.data.length > 1) {
          // Multiple results, show list
          setSearchResults(searchResponse.data);
          setSelectedSubscriber(null);
          setInvoices([]);
          setPaymentHistory([]);
        } else {
          toast.error('Subscriber not found');
          setSelectedSubscriber(null);
          setInvoices([]);
          setPaymentHistory([]);
        }
      } catch (searchError) {
        toast.error('Subscriber not found');
        setSelectedSubscriber(null);
        setInvoices([]);
        setPaymentHistory([]);
      }
    } finally {
      setSearching(false);
    }
  };

  const selectSubscriber = async (subscriber) => {
    setSelectedSubscriber(subscriber);
    setSearchResults([]);
    setPaymentResult(null);
    setSelectedDiscounts([]);
    setTotalDiscountAmount(0);
    
    try {
      const [invoicesRes, paymentsRes] = await Promise.all([
        axios.get(`/invoices/subscriber/${subscriber.account_number}`),
        axios.get(`/payments/subscriber/${subscriber.account_number}`)
      ]);
      console.log('Invoices received:', invoicesRes.data);
      setInvoices(invoicesRes.data);
      setPaymentHistory(paymentsRes.data);
      
      // Fetch wallet balance
      try {
        const walletRes = await axios.get(`/subscribers/${subscriber.account_number}/wallet`);
        setWalletBalance(walletRes.data.balance || 0);
      } catch (e) {
        setWalletBalance(0);
      }
      
      // Fetch available discounts for this subscriber
      try {
        const discountsRes = await axios.get(`/subscribers/${subscriber.account_number}/discounts`);
        setAvailableDiscounts(discountsRes.data || []);
      } catch (e) {
        setAvailableDiscounts([]);
      }
    } catch (error) {
      toast.error('Failed to load subscriber details');
    }
  };

  // Calculate discount amount based on discount type and total bill
  const calculateDiscountAmount = (discount, billAmount) => {
    if (discount.discount_type === 'percentage') {
      return (billAmount * discount.value) / 100;
    }
    return discount.value;
  };

  // Toggle discount selection
  const toggleDiscount = (discount) => {
    const totalBill = invoices.filter(inv => !inv.paid).reduce((sum, inv) => 
      sum + (inv.amount - (inv.paid_amount || 0)), 0
    );
    
    setSelectedDiscounts(prev => {
      const exists = prev.find(d => d.discount_id === discount.discount_id);
      if (exists) {
        // Remove discount
        const newSelected = prev.filter(d => d.discount_id !== discount.discount_id);
        const newTotal = newSelected.reduce((sum, d) => sum + d.discount_amount, 0);
        setTotalDiscountAmount(newTotal);
        return newSelected;
      } else {
        // Add discount
        const discountAmount = calculateDiscountAmount(discount, totalBill);
        const newDiscount = {
          discount_id: discount.discount_id,
          name: discount.name,
          discount_type: discount.discount_type,
          value: discount.value,
          discount_amount: discountAmount
        };
        const newSelected = [...prev, newDiscount];
        const newTotal = newSelected.reduce((sum, d) => sum + d.discount_amount, 0);
        setTotalDiscountAmount(newTotal);
        return newSelected;
      }
    });
  };

  const handleCentralizedPayment = async () => {
    if (!paymentAmount || parseFloat(paymentAmount) <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }
    
    setProcessingPayment(true);
    try {
      const response = await axios.post('/payments/centralized', {
        subscriber_id: selectedSubscriber.account_number,
        amount: parseFloat(paymentAmount),
        mode: paymentMode,
        applied_discounts: selectedDiscounts
      });
      
      // Show detailed result
      const result = response.data;
      let message = `Payment processed! OR# ${result.or_number}\n`;
      
      if (result.total_discount > 0) {
        message += `🏷️ Discount applied: ₱${result.total_discount.toLocaleString()}\n`;
      }
      if (result.invoices_fully_paid?.length > 0) {
        message += `✓ ${result.invoices_fully_paid.length} invoice(s) fully paid\n`;
      }
      if (result.invoices_partially_paid?.length > 0) {
        message += `◐ ${result.invoices_partially_paid.length} invoice(s) partially paid\n`;
      }
      if (result.wallet_credit_added > 0) {
        message += `💰 ₱${(result.wallet_credit_added || 0).toLocaleString()} added to wallet`;
      }
      
      toast.success(message, { duration: 5000 });
      setPaymentResult(result);
      
      // Auto-print receipt if enabled
      handleAutoPrint(result.or_number);
      
      // Refresh subscriber data and today's stats
      selectSubscriber(selectedSubscriber);
      fetchTodayStats();
      setPaymentAmount('');
      setSelectedDiscounts([]);
      setTotalDiscountAmount(0);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Payment processing failed');
    } finally {
      setProcessingPayment(false);
    }
  };

  // Calculate total unpaid amount (considering partial payments)
  const totalUnpaid = invoices
    .filter(inv => !inv.paid)
    .reduce((sum, inv) => sum + (inv.remaining_balance || inv.amount || 0), 0);

  // Fetch payment history with optional date filter
  const fetchPaymentHistory = async (startDate = '', endDate = '') => {
    if (!selectedSubscriber) return;
    
    setLoadingHistory(true);
    try {
      let url = `/payments/subscriber/${selectedSubscriber.account_number}`;
      const params = new URLSearchParams();
      if (startDate) params.append('start_date', startDate);
      if (endDate) params.append('end_date', endDate);
      if (params.toString()) url += `?${params.toString()}`;
      
      const response = await axios.get(url);
      setPaymentHistory(response.data);
    } catch (error) {
      toast.error('Failed to fetch payment history');
    } finally {
      setLoadingHistory(false);
    }
  };

  // Apply date filter
  const handleApplyDateFilter = () => {
    fetchPaymentHistory(dateFrom, dateTo);
  };

  // Clear date filter
  const handleClearDateFilter = () => {
    setDateFrom('');
    setDateTo('');
    fetchPaymentHistory('', '');
  };

  // Handle advance payment (wallet deposit)
  const handleAdvancePayment = async () => {
    if (!advanceAmount || parseFloat(advanceAmount) <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }
    
    setProcessingAdvance(true);
    try {
      const response = await axios.post(`/subscribers/${selectedSubscriber.account_number}/wallet`, {
        amount: parseFloat(advanceAmount),
        mode: advancePaymentMode
      });
      
      toast.success(`Advance payment of ₱${parseFloat(advanceAmount).toLocaleString()} added to wallet! OR# ${response.data.or_number}`, { duration: 5000 });
      
      // Refresh data
      setWalletBalance(response.data.new_balance);
      setAdvanceAmount('');
      setShowAdvancePayment(false);
      fetchTodayStats();
      
      // Refresh payment history if visible
      if (showPaymentHistory) {
        fetchPaymentHistory(dateFrom, dateTo);
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to process advance payment');
    } finally {
      setProcessingAdvance(false);
    }
  };

  // Get status badge for invoice
  const getInvoiceStatus = (invoice) => {
    if (invoice.paid) {
      return <Badge className="bg-green-600"><Check className="h-3 w-3 mr-1" />Paid</Badge>;
    }
    if (invoice.paid_amount > 0) {
      return <Badge variant="outline" className="border-yellow-500 text-yellow-600"><AlertCircle className="h-3 w-3 mr-1" />Partial</Badge>;
    }
    return <Badge variant="destructive">Unpaid</Badge>;
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b border-border h-16 flex items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center shrink-0">
            <Receipt className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-heading font-bold truncate" data-testid="cashier-dashboard-title">Cashier Module</h1>
            <p className="text-xs text-muted-foreground truncate">{user.username}</p>
          </div>
        </div>
        <Button variant="outline" onClick={onLogout} data-testid="logout-button" className="shrink-0">
          <LogOut className="h-4 w-4 mr-2" />
          Logout
        </Button>
      </header>

      <main className="p-4 sm:p-6 max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          <Card className="lg:col-span-2">
            <CardHeader className="pb-3 sm:pb-6">
              <CardTitle className="text-lg sm:text-xl">Search Subscriber</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-2">
                <Input 
                  placeholder="Account #, name, or phone..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                  className="flex-1"
                  data-testid="search-input"
                />
                <Button onClick={handleSearch} disabled={searching} data-testid="search-button" className="w-full sm:w-auto">
                  <Search className="h-4 w-4 mr-2" />
                  {searching ? 'Searching...' : 'Search'}
                </Button>
              </div>

              {/* Search Results List */}
              {searchResults.length > 0 && (
                <div className="border rounded-lg divide-y">
                  <p className="text-sm text-muted-foreground px-4 py-2 bg-muted">
                    Found {searchResults.length} subscribers - Click to select
                  </p>
                  {searchResults.map((sub) => (
                    <div 
                      key={sub.account_number}
                      className="p-3 hover:bg-muted cursor-pointer transition-colors"
                      onClick={() => selectSubscriber(sub)}
                    >
                      <p className="font-medium">{sub.first_name} {sub.last_name}</p>
                      <p className="text-sm text-muted-foreground font-mono">{sub.account_number}</p>
                    </div>
                  ))}
                </div>
              )}

              {selectedSubscriber && (
                <div className="space-y-4">
                  <div className="bg-green-50 dark:bg-green-950 p-4 rounded-lg border border-green-200 dark:border-green-800">
                    <h3 className="font-medium text-lg mb-2">
                      {selectedSubscriber.first_name} {selectedSubscriber.last_name}
                    </h3>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">Account:</span>
                        <p className="font-mono">{selectedSubscriber.account_number}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Phone:</span>
                        <p>{selectedSubscriber.phone || 'N/A'}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Plan:</span>
                        <p>{selectedSubscriber.plan_id || 'N/A'}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Status:</span>
                        <Badge variant={selectedSubscriber.is_active ? "default" : "secondary"} className={selectedSubscriber.is_active ? "bg-green-600" : ""}>
                          {selectedSubscriber.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                    </div>
                    {/* Wallet Balance Display */}
                    {walletBalance > 0 && (
                      <div className="mt-3 pt-3 border-t border-green-300 dark:border-green-700">
                        <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                          <Wallet className="h-4 w-4" />
                          <span className="text-sm font-medium">Wallet Credit:</span>
                          <span className="font-bold">₱{walletBalance.toLocaleString()}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Centralized Payment Section */}
                  {totalUnpaid > 0 && (
                    <Card className="border-2 border-primary">
                      <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2">
                          <CreditCard className="h-5 w-5" />
                          Process Payment
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex justify-between items-center bg-muted p-3 rounded-lg">
                          <span className="text-sm text-muted-foreground">Total Outstanding:</span>
                          <div className="text-right">
                            <span className="text-2xl font-bold text-red-600">₱{totalUnpaid.toLocaleString()}</span>
                            {totalDiscountAmount > 0 && (
                              <div className="text-sm text-green-600">
                                - ₱{totalDiscountAmount.toLocaleString()} discount
                              </div>
                            )}
                          </div>
                        </div>
                        
                        {/* Available Discounts */}
                        {availableDiscounts.length > 0 && (
                          <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-3">
                            <Label className="text-green-800 dark:text-green-300 mb-2 flex items-center gap-2">
                              <Percent className="h-4 w-4" />
                              Available Discounts/Rebates
                            </Label>
                            <div className="flex flex-wrap gap-2 mt-2">
                              {availableDiscounts.map((discount) => {
                                const isSelected = selectedDiscounts.find(d => d.discount_id === discount.discount_id);
                                const discountAmt = calculateDiscountAmount(discount, totalUnpaid);
                                return (
                                  <Button
                                    key={discount.discount_id}
                                    variant={isSelected ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => toggleDiscount(discount)}
                                    className={isSelected ? "bg-green-600 hover:bg-green-700" : "border-green-500 text-green-700 dark:text-green-400"}
                                    data-testid={`discount-${discount.discount_id}`}
                                  >
                                    {discount.name}: {discount.discount_type === 'percentage' ? `${discount.value}%` : `₱${discount.value}`}
                                    {isSelected && ` (-₱${discountAmt.toLocaleString()})`}
                                  </Button>
                                );
                              })}
                            </div>
                            {totalDiscountAmount > 0 && (
                              <div className="mt-2 pt-2 border-t border-green-200 dark:border-green-800 flex justify-between">
                                <span className="text-sm text-green-700 dark:text-green-400">Amount to pay after discount:</span>
                                <span className="font-bold text-green-700 dark:text-green-400">
                                  ₱{Math.max(0, totalUnpaid - totalDiscountAmount).toLocaleString()}
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                        
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="sm:col-span-1">
                            <Label htmlFor="payment-amount">Payment Amount</Label>
                            <Input
                              id="payment-amount"
                              type="number"
                              placeholder="Enter amount"
                              value={paymentAmount}
                              onChange={(e) => setPaymentAmount(e.target.value)}
                              className="text-lg font-medium"
                              data-testid="payment-amount-input"
                            />
                            {totalDiscountAmount > 0 && (
                              <p className="text-xs text-green-600 mt-1">
                                Pay ₱{Math.max(0, totalUnpaid - totalDiscountAmount).toLocaleString()} to clear all invoices
                              </p>
                            )}
                          </div>
                          <div>
                            <Label>Payment Mode</Label>
                            <Select value={paymentMode} onValueChange={setPaymentMode}>
                              <SelectTrigger data-testid="payment-mode-select">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="cash">Cash</SelectItem>
                                <SelectItem value="gcash">GCash</SelectItem>
                                <SelectItem value="bank">Bank Transfer</SelectItem>
                                <SelectItem value="card">Credit/Debit Card</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex items-end">
                            <Button 
                              onClick={handleCentralizedPayment} 
                              disabled={processingPayment || !paymentAmount}
                              className="w-full h-10"
                              data-testid="process-payment-button"
                            >
                              {processingPayment ? 'Processing...' : 'Process Payment'}
                            </Button>
                          </div>
                        </div>

                        {/* Quick amount buttons */}
                        <div className="flex flex-wrap gap-2">
                          <span className="text-sm text-muted-foreground mr-2 self-center">Quick:</span>
                          {invoices.filter(inv => !inv.paid).slice(0, 3).map((inv, idx) => (
                            <Button 
                              key={idx}
                              variant="outline" 
                              size="sm"
                              onClick={() => setPaymentAmount(inv.remaining_balance?.toString() || inv.amount?.toString())}
                            >
                              ₱{(inv.remaining_balance || inv.amount)?.toLocaleString()}
                            </Button>
                          ))}
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => setPaymentAmount(totalUnpaid.toString())}
                            className="bg-primary/10"
                          >
                            Pay All (₱{totalUnpaid.toLocaleString()})
                          </Button>
                        </div>

                        {/* Payment Preview */}
                        {paymentAmount && parseFloat(paymentAmount) > 0 && (
                          <div className="bg-blue-50 dark:bg-blue-950 p-3 rounded-lg border border-blue-200 dark:border-blue-800 text-sm">
                            <p className="font-medium text-blue-800 dark:text-blue-300 mb-1">Payment Preview:</p>
                            {parseFloat(paymentAmount) < totalUnpaid ? (
                              <p className="text-blue-700 dark:text-blue-400">
                                ₱{parseFloat(paymentAmount).toLocaleString()} will be applied to oldest invoice(s). 
                                Remaining balance: ₱{(totalUnpaid - parseFloat(paymentAmount)).toLocaleString()}
                              </p>
                            ) : parseFloat(paymentAmount) === totalUnpaid ? (
                              <p className="text-green-700 dark:text-green-400">
                                ✓ This will pay all outstanding invoices in full.
                              </p>
                            ) : (
                              <p className="text-green-700 dark:text-green-400">
                                ✓ All invoices paid. ₱{(parseFloat(paymentAmount) - totalUnpaid).toLocaleString()} will be credited to wallet.
                              </p>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {/* Payment Result Feedback */}
                  {paymentResult && (
                    <Card className="border-green-500 bg-green-50 dark:bg-green-950">
                      <CardContent className="pt-4">
                        <div className="flex items-center gap-2 text-green-700 dark:text-green-400 mb-2">
                          <Check className="h-5 w-5" />
                          <span className="font-medium">Payment Successful!</span>
                        </div>
                        <div className="text-sm space-y-1">
                          <p>OR#: <span className="font-mono font-medium">{paymentResult.or_number}</span></p>
                          <p>Amount: <span className="font-bold">₱{paymentResult.total_paid?.toLocaleString()}</span></p>
                          {paymentResult.invoices_fully_paid?.length > 0 && (
                            <p className="text-green-600">✓ {paymentResult.invoices_fully_paid.length} invoice(s) fully paid</p>
                          )}
                          {paymentResult.invoices_partially_paid?.length > 0 && (
                            <p className="text-yellow-600">◐ {paymentResult.invoices_partially_paid.length} invoice(s) partially paid</p>
                          )}
                          {paymentResult.wallet_credit_added > 0 && (
                            <p className="text-blue-600">💰 ₱{paymentResult.wallet_credit_added?.toLocaleString()} added to wallet</p>
                          )}
                        </div>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="mt-3"
                          onClick={() => setPaymentResult(null)}
                        >
                          Dismiss
                        </Button>
                      </CardContent>
                    </Card>
                  )}

                  {/* Invoice List */}
                  <div className="space-y-2">
                    <h4 className="font-medium">Invoices</h4>
                    {invoices.filter(inv => !inv.paid).length > 0 ? (
                      <div className="space-y-2">
                        {invoices.filter(inv => !inv.paid).map((invoice) => (
                          <div key={invoice.invoice_number} className="border rounded-lg p-3 hover:bg-muted/50 transition-colors">
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <p className="font-mono text-sm text-muted-foreground">{invoice.invoice_number}</p>
                                  {getInvoiceStatus(invoice)}
                                </div>
                                <p className="text-sm" title={invoice.description}>
                                  {invoice.description || `${invoice.plan_name || 'Monthly'} Bill`}
                                </p>
                                {invoice.type && (
                                  <Badge variant="outline" className="text-xs mt-1">
                                    {invoice.type}
                                  </Badge>
                                )}
                              </div>
                              <div className="text-right">
                                <p className="text-lg font-bold text-primary">₱{(invoice.remaining_balance || invoice.amount)?.toLocaleString()}</p>
                                {invoice.paid_amount > 0 && (
                                  <p className="text-xs text-muted-foreground">
                                    Total: ₱{invoice.amount?.toLocaleString()} | Paid: ₱{invoice.paid_amount?.toLocaleString()}
                                  </p>
                                )}
                                <span className="text-xs text-muted-foreground">
                                  Due: {new Date(invoice.due_date).toLocaleDateString()}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="text-center py-8 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
                          <Check className="h-12 w-12 mx-auto text-green-600 mb-2" />
                          <p className="text-green-700 dark:text-green-400 font-medium">All invoices paid!</p>
                          {walletBalance > 0 && (
                            <p className="text-sm text-muted-foreground mt-1">
                              Wallet credit available: ₱{walletBalance.toLocaleString()}
                            </p>
                          )}
                        </div>
                        
                        {/* Advance Payment Section */}
                        {!showAdvancePayment ? (
                          <Button 
                            onClick={() => setShowAdvancePayment(true)}
                            variant="outline"
                            className="w-full border-blue-500 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950"
                            data-testid="show-advance-payment-btn"
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Add Advance Payment to Wallet
                          </Button>
                        ) : (
                          <Card className="border-2 border-blue-500" data-testid="advance-payment-card">
                            <CardHeader className="pb-3">
                              <div className="flex justify-between items-center">
                                <CardTitle className="flex items-center gap-2 text-blue-600">
                                  <Wallet className="h-5 w-5" />
                                  Add Advance Payment
                                </CardTitle>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  onClick={() => setShowAdvancePayment(false)}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                              <p className="text-sm text-muted-foreground">
                                Add funds to the subscriber's wallet for future bills.
                              </p>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div className="sm:col-span-1">
                                  <Label htmlFor="advance-amount">Amount</Label>
                                  <Input
                                    id="advance-amount"
                                    type="number"
                                    placeholder="Enter amount"
                                    value={advanceAmount}
                                    onChange={(e) => setAdvanceAmount(e.target.value)}
                                    className="text-lg font-medium"
                                    data-testid="advance-amount-input"
                                  />
                                </div>
                                <div>
                                  <Label>Payment Mode</Label>
                                  <Select value={advancePaymentMode} onValueChange={setAdvancePaymentMode}>
                                    <SelectTrigger data-testid="advance-payment-mode-select">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="cash">Cash</SelectItem>
                                      <SelectItem value="gcash">GCash</SelectItem>
                                      <SelectItem value="bank">Bank Transfer</SelectItem>
                                      <SelectItem value="card">Credit/Debit Card</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="flex items-end">
                                  <Button 
                                    onClick={handleAdvancePayment} 
                                    disabled={processingAdvance || !advanceAmount}
                                    className="w-full h-10 bg-blue-600 hover:bg-blue-700"
                                    data-testid="process-advance-payment-btn"
                                  >
                                    {processingAdvance ? 'Processing...' : 'Add to Wallet'}
                                  </Button>
                                </div>
                              </div>
                              {walletBalance > 0 && (
                                <p className="text-sm text-muted-foreground">
                                  Current wallet balance: <span className="font-bold text-blue-600">₱{walletBalance.toLocaleString()}</span>
                                </p>
                              )}
                            </CardContent>
                          </Card>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Payment History - Hidden by default */}
              {selectedSubscriber && (
                <div className="mt-6 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium flex items-center gap-2">
                      <History className="h-4 w-4" />
                      Payment History
                    </h4>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (!showPaymentHistory) {
                          fetchPaymentHistory(dateFrom, dateTo);
                        }
                        setShowPaymentHistory(!showPaymentHistory);
                      }}
                      data-testid="toggle-payment-history-btn"
                    >
                      {showPaymentHistory ? (
                        <>
                          <ChevronUp className="h-4 w-4 mr-1" />
                          Hide History
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-4 w-4 mr-1" />
                          Show History ({paymentHistory.length})
                        </>
                      )}
                    </Button>
                  </div>
                  
                  {showPaymentHistory && (
                    <div className="space-y-3">
                      {/* Date Range Filter */}
                      <div className="flex flex-wrap gap-2 items-end p-3 bg-muted rounded-lg" data-testid="date-filter-section">
                        <div className="flex-1 min-w-[140px]">
                          <Label className="text-xs text-muted-foreground">From Date</Label>
                          <Input
                            type="date"
                            value={dateFrom}
                            onChange={(e) => setDateFrom(e.target.value)}
                            className="h-9"
                            data-testid="date-from-input"
                          />
                        </div>
                        <div className="flex-1 min-w-[140px]">
                          <Label className="text-xs text-muted-foreground">To Date</Label>
                          <Input
                            type="date"
                            value={dateTo}
                            onChange={(e) => setDateTo(e.target.value)}
                            className="h-9"
                            data-testid="date-to-input"
                          />
                        </div>
                        <Button 
                          size="sm" 
                          onClick={handleApplyDateFilter}
                          disabled={loadingHistory}
                          className="h-9"
                          data-testid="apply-date-filter-btn"
                        >
                          <Filter className="h-4 w-4 mr-1" />
                          Apply
                        </Button>
                        {(dateFrom || dateTo) && (
                          <Button 
                            size="sm" 
                            variant="ghost"
                            onClick={handleClearDateFilter}
                            className="h-9"
                            data-testid="clear-date-filter-btn"
                          >
                            <X className="h-4 w-4 mr-1" />
                            Clear
                          </Button>
                        )}
                      </div>
                      
                      {/* Payment History Table */}
                      {loadingHistory ? (
                        <div className="text-center py-4 text-muted-foreground">
                          Loading payment history...
                        </div>
                      ) : paymentHistory.length > 0 ? (
                        <div className="rounded-md border max-h-72 overflow-y-auto" data-testid="payment-history-table">
                          <table className="w-full text-sm">
                            <thead className="bg-muted sticky top-0">
                              <tr>
                                <th className="text-left p-2">OR Number</th>
                                <th className="text-left p-2">Description</th>
                                <th className="text-left p-2">Amount</th>
                                <th className="text-left p-2">Mode</th>
                                <th className="text-left p-2">Date</th>
                                <th className="text-center p-2">Print</th>
                              </tr>
                            </thead>
                            <tbody>
                              {paymentHistory.map((payment) => (
                                <tr key={payment.or_number} className="border-t hover:bg-muted/50">
                                  <td className="p-2 font-mono text-xs">{payment.or_number}</td>
                                  <td className="p-2 text-xs max-w-[200px] truncate" title={payment.description || 'Payment'}>
                                    {payment.description || payment.invoice_id || 'Payment'}
                                    {payment.is_advance_payment && (
                                      <Badge variant="outline" className="ml-1 text-xs border-blue-500 text-blue-600">Advance</Badge>
                                    )}
                                  </td>
                                  <td className="p-2 font-bold text-green-600">₱{(payment.total_amount || payment.amount || 0).toLocaleString()}</td>
                                  <td className="p-2 capitalize">{payment.mode}</td>
                                  <td className="p-2 text-xs">{new Date(payment.payment_date).toLocaleDateString()}</td>
                                  <td className="p-2 text-center">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 w-7 p-0"
                                      onClick={() => {
                                        if (bluetoothDevice && printCharacteristicRef.current) {
                                          printReceiptBluetooth(payment.or_number);
                                        } else {
                                          printReceiptBrowser(payment.or_number);
                                        }
                                      }}
                                      disabled={printing}
                                      data-testid={`print-receipt-${payment.or_number}`}
                                    >
                                      <Printer className="h-4 w-4" />
                                    </Button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="text-center py-4 text-muted-foreground border rounded-lg">
                          {(dateFrom || dateTo) ? 'No payments found for the selected date range' : 'No payment history found'}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="bg-gradient-to-br from-green-600 to-green-700 text-white">
              <CardContent className="pt-6">
                <DollarSign className="h-8 w-8 mb-2 opacity-80" />
                <p className="text-sm opacity-90">My Collections Today</p>
                <p className="text-3xl font-bold font-heading mt-1">₱{todayStats.total?.toLocaleString() || '0.00'}</p>
                <p className="text-xs opacity-75 mt-2">{todayStats.count || 0} payment(s) I processed today</p>
              </CardContent>
            </Card>
            
            {selectedSubscriber && totalUnpaid > 0 && (
              <Card className="bg-gradient-to-br from-red-500 to-red-600 text-white">
                <CardContent className="pt-6">
                  <Receipt className="h-8 w-8 mb-2 opacity-80" />
                  <p className="text-sm opacity-90">Outstanding Balance</p>
                  <p className="text-3xl font-bold font-heading mt-1">₱{totalUnpaid.toLocaleString()}</p>
                  <p className="text-xs opacity-75 mt-2">
                    {invoices.filter(inv => !inv.paid).length} unpaid invoice(s)
                  </p>
                </CardContent>
              </Card>
            )}

            {selectedSubscriber && walletBalance > 0 && (
              <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white">
                <CardContent className="pt-6">
                  <Wallet className="h-8 w-8 mb-2 opacity-80" />
                  <p className="text-sm opacity-90">Wallet Credit</p>
                  <p className="text-3xl font-bold font-heading mt-1">₱{walletBalance.toLocaleString()}</p>
                  <p className="text-xs opacity-75 mt-2">Available for future bills</p>
                </CardContent>
              </Card>
            )}
            
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {/* Bluetooth Printer Connection */}
                <Button 
                  className="w-full" 
                  variant={bluetoothDevice ? "default" : "outline"}
                  onClick={connectBluetoothPrinter}
                  data-testid="connect-bluetooth-btn"
                >
                  <Bluetooth className="h-4 w-4 mr-2" />
                  {bluetoothDevice ? `Connected: ${bluetoothDevice.name}` : 'Connect Bluetooth Printer'}
                </Button>
                
                {/* Auto-print Toggle */}
                <div className="flex items-center space-x-2 p-2 rounded-lg bg-muted">
                  <Checkbox
                    id="auto-print"
                    checked={autoPrintReceipt}
                    onCheckedChange={setAutoPrintReceipt}
                    data-testid="auto-print-checkbox"
                  />
                  <Label htmlFor="auto-print" className="text-sm cursor-pointer">
                    Auto-print receipt after payment
                  </Label>
                </div>
                
                <Button 
                  className="w-full" 
                  variant="outline" 
                  disabled={!paymentResult?.or_number || printing}
                  onClick={() => {
                    if (bluetoothDevice && printCharacteristicRef.current) {
                      printReceiptBluetooth(paymentResult.or_number);
                    } else {
                      printReceiptBrowser(paymentResult.or_number);
                    }
                  }}
                  data-testid="print-last-receipt-btn"
                >
                  <Printer className="h-4 w-4 mr-2" />
                  {printing ? 'Printing...' : 'Print Last Receipt'}
                </Button>
                
                <Button className="w-full" variant="outline" onClick={() => {
                  setSelectedSubscriber(null);
                  setInvoices([]);
                  setPaymentHistory([]);
                  setSearchTerm('');
                  setSearchResults([]);
                  setPaymentResult(null);
                }}>
                  Clear / New Search
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
