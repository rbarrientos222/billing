import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { LogOut, Search, Receipt, DollarSign, Wallet, CreditCard, Check, AlertCircle } from 'lucide-react';

export default function CashierDashboard({ user, onLogout }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedSubscriber, setSelectedSubscriber] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [paymentHistory, setPaymentHistory] = useState([]);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState('cash');
  const [todayStats, setTodayStats] = useState({ total: 0, count: 0 });
  const [searching, setSearching] = useState(false);
  const [walletBalance, setWalletBalance] = useState(0);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [paymentResult, setPaymentResult] = useState(null);

  // Fetch today's payment stats on load
  useEffect(() => {
    fetchTodayStats();
  }, []);

  const fetchTodayStats = async () => {
    try {
      const response = await axios.get('/payments/today-stats');
      setTodayStats(response.data);
    } catch (error) {
      console.error('Failed to fetch today stats');
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
    
    try {
      const [invoicesRes, paymentsRes] = await Promise.all([
        axios.get(`/invoices/subscriber/${subscriber.account_number}`),
        axios.get(`/payments/subscriber/${subscriber.account_number}`)
      ]);
      setInvoices(invoicesRes.data);
      setPaymentHistory(paymentsRes.data);
      
      // Fetch wallet balance
      try {
        const walletRes = await axios.get(`/subscribers/${subscriber.account_number}/wallet`);
        setWalletBalance(walletRes.data.balance || 0);
      } catch (e) {
        setWalletBalance(0);
      }
    } catch (error) {
      toast.error('Failed to load subscriber details');
    }
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
        mode: paymentMode
      });
      
      // Show detailed result
      const result = response.data;
      let message = `Payment processed! OR# ${result.or_number}\n`;
      
      if (result.invoices_fully_paid?.length > 0) {
        message += `✓ ${result.invoices_fully_paid.length} invoice(s) fully paid\n`;
      }
      if (result.invoices_partially_paid?.length > 0) {
        message += `◐ ${result.invoices_partially_paid.length} invoice(s) partially paid\n`;
      }
      if (result.wallet_credit_added > 0) {
        message += `💰 ₱${result.wallet_credit_added.toLocaleString()} added to wallet`;
      }
      
      toast.success(message, { duration: 5000 });
      setPaymentResult(result);
      
      // Refresh subscriber data and today's stats
      selectSubscriber(selectedSubscriber);
      fetchTodayStats();
      setPaymentAmount('');
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

      <main className="p-6 max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Search Subscriber</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input 
                  placeholder="Search by account number, name, or phone..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                  className="flex-1"
                  data-testid="search-input"
                />
                <Button onClick={handleSearch} disabled={searching} data-testid="search-button">
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
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <h4 className="font-medium">Unpaid Invoices</h4>
                      {totalUnpaid > 0 && (
                        <div className="text-right">
                          <span className="text-sm text-muted-foreground">Total Balance:</span>
                          <p className="text-xl font-bold text-red-600">₱{totalUnpaid.toLocaleString()}</p>
                        </div>
                      )}
                    </div>
                    {invoices.filter(inv => !inv.paid).map((invoice) => (
                      <div key={invoice.invoice_number} className="border rounded-lg p-4">
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex-1">
                            <p className="font-mono text-sm text-muted-foreground">{invoice.invoice_number}</p>
                            <p className="text-sm mt-1" title={invoice.description}>
                              {invoice.description || `${invoice.plan_name || 'Monthly'} Bill`}
                            </p>
                            {invoice.type && (
                              <Badge variant="outline" className="text-xs mt-1">
                                {invoice.type}
                              </Badge>
                            )}
                          </div>
                          <div className="text-right">
                            <p className="text-2xl font-bold text-primary">₱{invoice.amount?.toLocaleString()}</p>
                            <span className="text-xs text-muted-foreground">
                              Due: {new Date(invoice.due_date).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                        <div className="flex gap-2 mt-3">
                          <Input 
                            type="number" 
                            placeholder="Amount"
                            value={paymentAmount}
                            onChange={(e) => setPaymentAmount(e.target.value)}
                          />
                          <Select value={paymentMode} onValueChange={setPaymentMode}>
                            <SelectTrigger className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="cash">Cash</SelectItem>
                              <SelectItem value="gcash">GCash</SelectItem>
                              <SelectItem value="bank">Bank</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button onClick={() => handlePayment(invoice.invoice_number)} data-testid="pay-button">
                            Pay
                          </Button>
                        </div>
                      </div>
                    ))}
                    {invoices.filter(inv => !inv.paid).length === 0 && (
                      <p className="text-center text-muted-foreground py-4">No unpaid invoices</p>
                    )}
                  </div>
                </div>
              )}

              {/* Payment History */}
              {selectedSubscriber && paymentHistory.length > 0 && (
                <div className="mt-6 space-y-2">
                  <h4 className="font-medium">Payment History</h4>
                  <div className="rounded-md border max-h-60 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted sticky top-0">
                        <tr>
                          <th className="text-left p-2">OR Number</th>
                          <th className="text-left p-2">Amount</th>
                          <th className="text-left p-2">Mode</th>
                          <th className="text-left p-2">Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paymentHistory.map((payment) => (
                          <tr key={payment.or_number} className="border-t">
                            <td className="p-2 font-mono text-xs">{payment.or_number}</td>
                            <td className="p-2 font-bold text-green-600">₱{payment.amount.toLocaleString()}</td>
                            <td className="p-2 capitalize">{payment.mode}</td>
                            <td className="p-2 text-xs">{new Date(payment.payment_date).toLocaleDateString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="bg-gradient-to-br from-green-600 to-green-700 text-white">
              <CardContent className="pt-6">
                <DollarSign className="h-8 w-8 mb-2 opacity-80" />
                <p className="text-sm opacity-90">Today's Collections</p>
                <p className="text-3xl font-bold font-heading mt-1">₱{todayStats.total?.toLocaleString() || '0.00'}</p>
                <p className="text-xs opacity-75 mt-2">{todayStats.count || 0} payment(s) processed today</p>
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
            
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button className="w-full" variant="outline" disabled={!selectedSubscriber}>
                  Print Receipt
                </Button>
                <Button className="w-full" variant="outline" onClick={() => {
                  setSelectedSubscriber(null);
                  setInvoices([]);
                  setPaymentHistory([]);
                  setSearchTerm('');
                  setSearchResults([]);
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
