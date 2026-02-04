import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, Clock, Users, AlertTriangle, CheckCircle, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

export default function BillingCalendar() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [billingData, setBillingData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [schedulerStatus, setSchedulerStatus] = useState(null);

  useEffect(() => {
    fetchBillingData();
  }, []);

  const fetchBillingData = async () => {
    try {
      setLoading(true);
      const [upcomingRes, statusRes] = await Promise.all([
        axios.get('/billing/upcoming'),
        axios.get('/billing/status')
      ]);
      setBillingData(upcomingRes.data);
      setSchedulerStatus(statusRes.data);
    } catch (error) {
      console.error('Failed to fetch billing data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getDaysInMonth = (date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const today = new Date();
  const isCurrentMonth = currentDate.getMonth() === today.getMonth() && 
                         currentDate.getFullYear() === today.getFullYear();

  const renderCalendar = () => {
    const daysInMonth = getDaysInMonth(currentDate);
    const firstDay = getFirstDayOfMonth(currentDate);
    const days = [];

    // Empty cells for days before the first day of the month
    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className="h-10 sm:h-12"></div>);
    }

    // Days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const isToday = isCurrentMonth && day === today.getDate();
      const isBillingDay = day === 15 || day === 30 || (day === daysInMonth && daysInMonth < 30);
      const isPast = isCurrentMonth && day < today.getDate();
      
      // Count subscribers for this billing day
      let subscriberCount = 0;
      if (billingData) {
        if (day === 15) {
          subscriberCount = billingData.billing_15th?.count || 0;
        } else if (day === 30 || (day === daysInMonth && daysInMonth < 30)) {
          subscriberCount = billingData.billing_30th?.count || 0;
        }
      }

      days.push(
        <div
          key={day}
          className={`h-10 sm:h-12 flex flex-col items-center justify-center rounded-lg relative transition-all
            ${isToday ? 'bg-primary text-primary-foreground font-bold ring-2 ring-primary ring-offset-2' : ''}
            ${isBillingDay && !isToday ? 'bg-amber-100 dark:bg-amber-900/30 border-2 border-amber-400' : ''}
            ${isPast && isBillingDay ? 'opacity-50' : ''}
            ${!isToday && !isBillingDay ? 'hover:bg-muted' : ''}
          `}
        >
          <span className={`text-sm ${isBillingDay && !isToday ? 'font-semibold text-amber-700 dark:text-amber-300' : ''}`}>
            {day}
          </span>
          {isBillingDay && subscriberCount > 0 && (
            <span className={`text-[10px] ${isToday ? 'text-primary-foreground' : 'text-amber-600 dark:text-amber-400'}`}>
              {subscriberCount}
            </span>
          )}
        </div>
      );
    }

    return days;
  };

  if (loading) {
    return (
      <Card className="border-border">
        <CardContent className="pt-6 flex items-center justify-center h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border" data-testid="billing-calendar">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="font-heading flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              Billing Calendar
            </CardTitle>
            <CardDescription>Upcoming billing dates and subscriber counts</CardDescription>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={prevMonth}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium min-w-[120px] text-center">
              {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
            </span>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={nextMonth}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-1">
          {dayNames.map(day => (
            <div key={day} className="h-8 flex items-center justify-center text-xs font-medium text-muted-foreground">
              {day}
            </div>
          ))}
          {renderCalendar()}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-4 pt-2 border-t border-border text-xs">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-primary"></div>
            <span>Today</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-amber-100 border-2 border-amber-400"></div>
            <span>Billing Day</span>
          </div>
        </div>

        {/* Billing Summary */}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <Users className="h-4 w-4 text-blue-600" />
              <span className="text-xs font-medium text-blue-700 dark:text-blue-300">15th Billing</span>
            </div>
            <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">
              {billingData?.billing_15th?.count || 0}
            </p>
            <p className="text-xs text-blue-600 dark:text-blue-400">
              {billingData?.billing_15th?.days_until || 0} days until next
            </p>
          </div>
          <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950 dark:to-purple-900 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <Users className="h-4 w-4 text-purple-600" />
              <span className="text-xs font-medium text-purple-700 dark:text-purple-300">30th Billing</span>
            </div>
            <p className="text-2xl font-bold text-purple-900 dark:text-purple-100">
              {billingData?.billing_30th?.count || 0}
            </p>
            <p className="text-xs text-purple-600 dark:text-purple-400">
              {billingData?.billing_30th?.days_until || 0} days until next
            </p>
          </div>
        </div>

        {/* Scheduler Status */}
        <div className="flex items-center justify-between bg-muted/50 rounded-lg p-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">Auto-billing</span>
          </div>
          {schedulerStatus?.scheduler_running ? (
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
              <CheckCircle className="h-3 w-3 mr-1" />
              Active ({schedulerStatus?.settings?.billing_time || '00:01'})
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
              <AlertTriangle className="h-3 w-3 mr-1" />
              Inactive
            </Badge>
          )}
        </div>

        {/* Pending Invoices */}
        {schedulerStatus?.pending_invoices > 0 && (
          <div className="flex items-center justify-between bg-amber-50 dark:bg-amber-950/30 rounded-lg p-3 border border-amber-200 dark:border-amber-800">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <span className="text-sm text-amber-700 dark:text-amber-300">Pending Invoices</span>
            </div>
            <Badge className="bg-amber-500">
              {schedulerStatus.pending_invoices}
            </Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
