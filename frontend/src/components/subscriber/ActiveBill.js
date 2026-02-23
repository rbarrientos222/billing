import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileText, Calendar, AlertCircle, CreditCard } from 'lucide-react';

export default function ActiveBill({ invoices, totalPayables, onPayNow }) {
  const unpaidInvoices = invoices?.filter(inv => !inv.paid) || [];
  
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

  return (
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
        {unpaidInvoices.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground" data-testid="no-bills-message">
            <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No outstanding bills</p>
            <p className="text-sm">You're all caught up!</p>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {unpaidInvoices.map((invoice, idx) => {
                const remainingAmount = (invoice.amount || 0) - (invoice.paid_amount || 0);
                const isOverdue = invoice.due_date && new Date(invoice.due_date) < new Date();
                
                return (
                  <div 
                    key={invoice.invoice_number || idx} 
                    className="p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                    data-testid={`invoice-item-${invoice.invoice_number}`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-medium text-sm">{invoice.invoice_number}</p>
                        <p className="text-xs text-muted-foreground">{invoice.description || 'Monthly Service'}</p>
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
                    
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
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
                <span className="font-medium">Total Outstanding</span>
                <span className="text-xl font-bold text-destructive" data-testid="total-outstanding">
                  {formatCurrency(totalPayables)}
                </span>
              </div>
              <Button 
                className="w-full bg-blue-600 hover:bg-blue-700" 
                onClick={onPayNow}
                data-testid="pay-now-button"
              >
                <CreditCard className="w-4 h-4 mr-2" />
                Pay Now
              </Button>
              <p className="text-xs text-center text-muted-foreground mt-2">
                Online payment coming soon. Please visit our office or contact support.
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
