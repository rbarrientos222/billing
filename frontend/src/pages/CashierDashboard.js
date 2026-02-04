import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { LogOut, Search, Receipt, DollarSign } from 'lucide-react';

export default function CashierDashboard({ user, onLogout }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSubscriber, setSelectedSubscriber] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [paymentHistory, setPaymentHistory] = useState([]);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState('cash');

  const handleSearch = async () => {
    try {
      const response = await axios.get(`/subscribers/${searchTerm}`);
      setSelectedSubscriber(response.data);
      
      const [invoicesRes, paymentsRes] = await Promise.all([
        axios.get(`/invoices/subscriber/${searchTerm}`),
        axios.get(`/payments/subscriber/${searchTerm}`)
      ]);
      setInvoices(invoicesRes.data);
      setPaymentHistory(paymentsRes.data);
    } catch (error) {
      toast.error('Subscriber not found');
      setSelectedSubscriber(null);
      setInvoices([]);
      setPaymentHistory([]);
    }
  };

  const handlePayment = async (invoiceId) => {
    try {
      const response = await axios.post('/payments', {
        invoice_id: invoiceId,
        subscriber_id: selectedSubscriber.account_number,
        amount: parseFloat(paymentAmount),
        mode: paymentMode,
        received_by: user.username
      });
      toast.success(`Payment processed! OR# ${response.data.or_number}`);
      handleSearch();
      setPaymentAmount('');
    } catch (error) {
      toast.error('Payment processing failed');
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b border-border h-16 flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
            <Receipt className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-heading font-bold" data-testid="cashier-dashboard-title">Cashier Module</h1>
            <p className="text-xs text-muted-foreground">{user.username}</p>
          </div>
        </div>
        <Button variant="outline" onClick={onLogout} data-testid="logout-button">
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
                  placeholder="Enter account number or name" 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                  className="flex-1"
                  data-testid="search-input"
                />
                <Button onClick={handleSearch} data-testid="search-button">
                  <Search className="h-4 w-4 mr-2" />
                  Search
                </Button>
              </div>

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
                        <p>{selectedSubscriber.phone}</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h4 className="font-medium">Unpaid Invoices</h4>
                    {invoices.filter(inv => !inv.paid).map((invoice) => (
                      <div key={invoice.invoice_number} className="border rounded-lg p-4">
                        <div className="flex justify-between items-center mb-3">
                          <div>
                            <p className="font-mono text-sm">{invoice.invoice_number}</p>
                            <p className="text-2xl font-bold text-primary">₱{invoice.amount}</p>
                          </div>
                          <span className="text-sm text-muted-foreground">
                            Due: {new Date(invoice.due_date).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="flex gap-2">
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
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="bg-gradient-to-br from-green-600 to-green-700 text-white">
              <CardContent className="pt-6">
                <DollarSign className="h-8 w-8 mb-2 opacity-80" />
                <p className="text-sm opacity-90">Quick Payment</p>
                <p className="text-3xl font-bold font-heading mt-1">₱0.00</p>
                <p className="text-xs opacity-75 mt-2">Total processed today</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button className="w-full" variant="outline">Print Receipt</Button>
                <Button className="w-full" variant="outline">View History</Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
