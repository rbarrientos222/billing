import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Receipt, Calendar, CreditCard, ChevronDown, ChevronUp, CheckCircle } from 'lucide-react';
import { formatPHDateTime } from '@/lib/utils';

export default function PaymentHistory({ payments }) {
  const [showAll, setShowAll] = useState(false);
  
  const displayPayments = showAll ? payments : payments?.slice(0, 5);
  
  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    return formatPHDateTime(dateStr);
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP'
    }).format(amount || 0);
  };

  const getPaymentModeLabel = (mode) => {
    const modes = {
      cash: 'Cash',
      gcash: 'GCash',
      bank_transfer: 'Bank Transfer',
      card: 'Card',
      wallet: 'Wallet'
    };
    return modes[mode] || mode;
  };

  return (
    <Card data-testid="payment-history-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Receipt className="w-5 h-5 text-blue-600" />
          Payment History
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!payments || payments.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground" data-testid="no-payments-message">
            <Receipt className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No payment history</p>
            <p className="text-sm">Your payments will appear here</p>
          </div>
        ) : (
          <div className="space-y-3">
            {displayPayments?.map((payment, idx) => (
              <div 
                key={payment.or_number || idx} 
                className="p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                data-testid={`payment-item-${payment.or_number}`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <CheckCircle className="w-4 h-4 text-green-600" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{payment.or_number || 'Payment'}</p>
                      <p className="text-xs text-muted-foreground">{payment.description || 'Service Payment'}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-green-600">{formatCurrency(payment.total_amount || payment.amount)}</p>
                    {payment.discount_amount > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Discount: {formatCurrency(payment.discount_amount)}
                      </p>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-4 text-xs text-muted-foreground pl-11">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {formatDate(payment.payment_date)}
                  </span>
                  <Badge variant="outline" className="text-xs">
                    <CreditCard className="w-3 h-3 mr-1" />
                    {getPaymentModeLabel(payment.payment_mode)}
                  </Badge>
                </div>
              </div>
            ))}

            {payments?.length > 5 && (
              <Button 
                variant="ghost" 
                className="w-full"
                onClick={() => setShowAll(!showAll)}
                data-testid="toggle-payments-button"
              >
                {showAll ? (
                  <>
                    <ChevronUp className="w-4 h-4 mr-2" />
                    Show Less
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-4 h-4 mr-2" />
                    View All ({payments.length} payments)
                  </>
                )}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
