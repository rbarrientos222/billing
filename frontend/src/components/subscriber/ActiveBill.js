import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { FileText, Calendar, AlertCircle, CreditCard, Loader2, ExternalLink, CheckCircle } from 'lucide-react';

const API = process.env.NODE_ENV === 'production' ? window.location.origin : process.env.REACT_APP_BACKEND_URL;

export default function ActiveBill({ invoices, totalPayables, onPaymentSuccess }) {
  const [unpaidInvoices, setUnpaidInvoices] = useState([]);
  const [selectedInvoices, setSelectedInvoices] = useState([]);
  const [paymentEnabled, setPaymentEnabled] = useState(false);
  const [serviceFee, setServiceFee] = useState(0);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [checkingPayment, setCheckingPayment] = useState(false);

  useEffect(() => {
    const unpaid = invoices?.filter(inv => !inv.paid) || [];
    setUnpaidInvoices(unpaid);
    // Select all invoices by default
    setSelectedInvoices(unpaid.map(inv => inv.invoice_number));
    
    // Check if PayMongo is enabled
    checkPaymentEnabled();
  }, [invoices]);

  // Check URL for payment result
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paymentStatus = params.get('payment');
    const ref = params.get('ref');

    if (paymentStatus === 'success' && ref) {
      verifyPayment(ref);
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
    } else if (paymentStatus === 'cancelled') {
      toast.info('Payment was cancelled');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const checkPaymentEnabled = async () => {
    try {
      const response = await axios.get(`${API}/api/paymongo/public-key`);
      setPaymentEnabled(response.data.enabled);
      setServiceFee(response.data.service_fee || 0);
    } catch (error) {
      setPaymentEnabled(false);
      setServiceFee(0);
    }
  };

  const verifyPayment = async (referenceId) => {
    setCheckingPayment(true);
    try {
      const response = await axios.get(`${API}/api/subscriber/pay/status/${referenceId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      
      if (response.data.status === 'completed') {
        toast.success('Payment successful! Your bills have been updated.');
        if (onPaymentSuccess) onPaymentSuccess();
      } else if (response.data.status === 'pending') {
        toast.info('Payment is being processed. Please wait a moment and refresh.');
      }
    } catch (error) {
      console.error('Payment verification error:', error);
    } finally {
      setCheckingPayment(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-PH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP'
    }).format(amount || 0);
  };

  const toggleInvoice = (invoiceNumber) => {
    setSelectedInvoices(prev => {
      if (prev.includes(invoiceNumber)) {
        return prev.filter(id => id !== invoiceNumber);
      }
      return [...prev, invoiceNumber];
    });
  };

  const selectAll = () => {
    if (selectedInvoices.length === unpaidInvoices.length) {
      setSelectedInvoices([]);
    } else {
      setSelectedInvoices(unpaidInvoices.map(inv => inv.invoice_number));
    }
  };

  const calculateSelectedTotal = () => {
    return unpaidInvoices
      .filter(inv => selectedInvoices.includes(inv.invoice_number))
      .reduce((sum, inv) => sum + ((inv.amount || 0) - (inv.paid_amount || 0)), 0);
  };

  const handlePayNow = () => {
    if (selectedInvoices.length === 0) {
      toast.error('Please select at least one invoice to pay');
      return;
    }
    setPaymentDialogOpen(true);
  };

  const handleConfirmPayment = async () => {
    setProcessing(true);
    try {
      const response = await axios.post(`${API}/api/subscriber/pay/create-checkout`, {
        amount: calculateSelectedTotal(),
        invoice_ids: selectedInvoices,
        description: `Payment for ${selectedInvoices.length} invoice(s)`
      }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });

      // Redirect to PayMongo checkout
      window.location.href = response.data.checkout_url;
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to initiate payment');
      setProcessing(false);
    }
  };

  return (
    <>
      <Card data-testid="active-bill-card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileText className="w-5 h-5 text-blue-600" />
              Current Bills
            </CardTitle>
            {totalPayables > 0 && (
              <Badge variant="destructive" data-testid="total-payables-badge">
                {formatCurrency(totalPayables)} Due
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {checkingPayment && (
            <div className="flex items-center justify-center py-4 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              Verifying payment...
            </div>
          )}

          {unpaidInvoices.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground" data-testid="no-bills-message">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No outstanding bills</p>
              <p className="text-sm">You're all caught up!</p>
            </div>
          ) : (
            <>
              {/* Select All */}
              {paymentEnabled && unpaidInvoices.length > 1 && (
                <div className="flex items-center gap-2 pb-2 border-b">
                  <Checkbox 
                    checked={selectedInvoices.length === unpaidInvoices.length}
                    onCheckedChange={selectAll}
                  />
                  <span className="text-sm text-muted-foreground">Select all invoices</span>
                </div>
              )}

              <div className="space-y-3">
                {unpaidInvoices.map((invoice, idx) => {
                  const remainingAmount = (invoice.amount || 0) - (invoice.paid_amount || 0);
                  const isOverdue = invoice.due_date && new Date(invoice.due_date) < new Date();
                  const isSelected = selectedInvoices.includes(invoice.invoice_number);
                  
                  return (
                    <div 
                      key={invoice.invoice_number || idx} 
                      className={`p-4 border rounded-lg transition-colors ${isSelected && paymentEnabled ? 'border-blue-500 bg-blue-50/50' : 'hover:bg-accent/50'}`}
                      data-testid={`invoice-item-${invoice.invoice_number}`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-start gap-3">
                          {paymentEnabled && (
                            <Checkbox 
                              checked={isSelected}
                              onCheckedChange={() => toggleInvoice(invoice.invoice_number)}
                              className="mt-1"
                            />
                          )}
                          <div>
                            <p className="font-medium text-sm">{invoice.invoice_number}</p>
                            <p className="text-xs text-muted-foreground">{invoice.description || 'Monthly Service'}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-lg">{formatCurrency(remainingAmount)}</p>
                          {invoice.paid_amount > 0 && (
                            <p className="text-xs text-muted-foreground">
                              Partial: {formatCurrency(invoice.paid_amount)} paid
                            </p>
                          )}
                        </div>
                      </div>
                      
                      <div className={`flex items-center gap-4 text-xs text-muted-foreground ${paymentEnabled ? 'pl-7' : ''}`}>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          Due: {formatDate(invoice.due_date)}
                        </span>
                        {isOverdue && (
                          <Badge variant="destructive" className="text-xs">
                            <AlertCircle className="w-3 h-3 mr-1" />
                            Overdue
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Total and Pay Button */}
              <div className="pt-4 border-t">
                <div className="flex items-center justify-between mb-4">
                  <span className="font-medium">
                    {paymentEnabled && selectedInvoices.length > 0 
                      ? `Selected (${selectedInvoices.length})`
                      : 'Total Outstanding'}
                  </span>
                  <span className="text-xl font-bold text-destructive" data-testid="total-outstanding">
                    {formatCurrency(paymentEnabled ? calculateSelectedTotal() : totalPayables)}
                  </span>
                </div>
                
                {paymentEnabled ? (
                  <Button 
                    className="w-full bg-blue-600 hover:bg-blue-700" 
                    onClick={handlePayNow}
                    disabled={selectedInvoices.length === 0}
                    data-testid="pay-now-button"
                  >
                    <CreditCard className="w-4 h-4 mr-2" />
                    Pay Now Online
                  </Button>
                ) : (
                  <>
                    <Button 
                      className="w-full bg-blue-600 hover:bg-blue-700" 
                      disabled
                      data-testid="pay-now-button"
                    >
                      <CreditCard className="w-4 h-4 mr-2" />
                      Pay Now
                    </Button>
                    <p className="text-xs text-center text-muted-foreground mt-2">
                      Online payment coming soon. Please visit our office or contact support.
                    </p>
                  </>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Payment Confirmation Dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5" />
              Confirm Payment
            </DialogTitle>
            <DialogDescription>
              You are about to pay for {selectedInvoices.length} invoice(s)
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Selected Invoices Summary */}
            <div className="bg-accent/50 p-4 rounded-lg space-y-2">
              {unpaidInvoices
                .filter(inv => selectedInvoices.includes(inv.invoice_number))
                .map(inv => (
                  <div key={inv.invoice_number} className="flex justify-between text-sm">
                    <span>{inv.invoice_number}</span>
                    <span className="font-medium">
                      {formatCurrency((inv.amount || 0) - (inv.paid_amount || 0))}
                    </span>
                  </div>
                ))
              }
              <div className="pt-2 border-t">
                <div className="flex justify-between text-sm">
                  <span>Subtotal</span>
                  <span className="font-medium">{formatCurrency(calculateSelectedTotal())}</span>
                </div>
                {serviceFee > 0 && (
                  <div className="flex justify-between text-sm text-amber-600 mt-1">
                    <span>Service Fee</span>
                    <span className="font-medium">{formatCurrency(serviceFee)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold mt-2 pt-2 border-t">
                  <span>Total to Pay</span>
                  <span className="text-blue-600">{formatCurrency(calculateSelectedTotal() + serviceFee)}</span>
                </div>
              </div>
            </div>

            {/* Payment Methods Info */}
            <div className="text-sm text-muted-foreground">
              <p className="font-medium mb-2">Accepted Payment Methods:</p>
              <div className="flex gap-2 flex-wrap">
                <Badge variant="outline">GCash</Badge>
                <Badge variant="outline">Maya</Badge>
                <Badge variant="outline">Credit Card</Badge>
                <Badge variant="outline">GrabPay</Badge>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <Button 
                variant="outline" 
                className="flex-1"
                onClick={() => setPaymentDialogOpen(false)}
                disabled={processing}
              >
                Cancel
              </Button>
              <Button 
                className="flex-1 bg-blue-600 hover:bg-blue-700"
                onClick={handleConfirmPayment}
                disabled={processing}
              >
                {processing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Proceed to Payment
                  </>
                )}
              </Button>
            </div>

            <p className="text-xs text-center text-muted-foreground">
              You will be redirected to PayMongo's secure checkout page
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
