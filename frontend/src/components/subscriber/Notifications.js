import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Bell, AlertTriangle, Info, CreditCard, Wifi, X } from 'lucide-react';

export default function Notifications({ notifications, onDismiss }) {
  const getNotificationIcon = (type) => {
    const icons = {
      'warning': AlertTriangle,
      'billing': CreditCard,
      'info': Info,
      'service': Wifi
    };
    return icons[type] || Bell;
  };

  const getNotificationStyle = (type) => {
    const styles = {
      'warning': {
        bg: 'bg-red-50 dark:bg-red-900/20',
        border: 'border-red-200 dark:border-red-800',
        icon: 'text-red-600'
      },
      'billing': {
        bg: 'bg-yellow-50 dark:bg-yellow-900/20',
        border: 'border-yellow-200 dark:border-yellow-800',
        icon: 'text-yellow-600'
      },
      'info': {
        bg: 'bg-blue-50 dark:bg-blue-900/20',
        border: 'border-blue-200 dark:border-blue-800',
        icon: 'text-blue-600'
      },
      'service': {
        bg: 'bg-green-50 dark:bg-green-900/20',
        border: 'border-green-200 dark:border-green-800',
        icon: 'text-green-600'
      }
    };
    return styles[type] || styles.info;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString('en-PH', {
      month: 'short',
      day: 'numeric'
    });
  };

  if (!notifications || notifications.length === 0) {
    return null;
  }

  return (
    <Card data-testid="notifications-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Bell className="w-5 h-5 text-blue-600" />
          Notifications
          <Badge variant="secondary" className="ml-2">{notifications.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {notifications.map((notification, idx) => {
          const Icon = getNotificationIcon(notification.type);
          const style = getNotificationStyle(notification.type);
          
          return (
            <div 
              key={idx}
              className={`p-4 rounded-lg border ${style.bg} ${style.border} relative`}
              data-testid={`notification-item-${idx}`}
            >
              {onDismiss && (
                <button 
                  onClick={() => onDismiss(idx)}
                  className="absolute top-2 right-2 p-1 hover:bg-white/50 rounded"
                  data-testid={`dismiss-notification-${idx}`}
                >
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              )}
              
              <div className="flex items-start gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${style.bg}`}>
                  <Icon className={`w-4 h-4 ${style.icon}`} />
                </div>
                <div className="flex-1 pr-6">
                  <p className="font-medium text-sm">{notification.title}</p>
                  <p className="text-sm text-muted-foreground mt-1">{notification.message}</p>
                  {notification.created_at && (
                    <p className="text-xs text-muted-foreground mt-2">
                      {formatDate(notification.created_at)}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
