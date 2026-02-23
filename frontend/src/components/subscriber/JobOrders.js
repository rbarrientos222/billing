import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ClipboardList, Calendar, User, ChevronDown, ChevronUp, Clock, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

export default function JobOrders({ jobOrders }) {
  const [showAll, setShowAll] = useState(false);
  
  const displayOrders = showAll ? jobOrders : jobOrders?.slice(0, 5);
  
  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-PH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      'Open': { variant: 'default', icon: Clock, className: 'bg-yellow-500' },
      'In Progress': { variant: 'default', icon: Loader2, className: 'bg-blue-500' },
      'Completed': { variant: 'default', icon: CheckCircle, className: 'bg-green-500' },
      'Cancelled': { variant: 'secondary', icon: AlertCircle, className: '' }
    };
    
    const config = statusConfig[status] || { variant: 'outline', icon: Clock, className: '' };
    const Icon = config.icon;
    
    return (
      <Badge variant={config.variant} className={config.className}>
        <Icon className={`w-3 h-3 mr-1 ${status === 'In Progress' ? 'animate-spin' : ''}`} />
        {status}
      </Badge>
    );
  };

  const getJobTypeLabel = (type) => {
    const types = {
      'New Installation': 'New Installation',
      'Repair': 'Repair',
      'Relocation': 'Relocation',
      'Upgrade': 'Upgrade',
      'Termination': 'Termination',
      'Maintenance': 'Maintenance'
    };
    return types[type] || type;
  };

  return (
    <Card data-testid="job-orders-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <ClipboardList className="w-5 h-5 text-blue-600" />
          Job Orders
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!jobOrders || jobOrders.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground" data-testid="no-job-orders-message">
            <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No job orders</p>
            <p className="text-sm">Your service requests will appear here</p>
          </div>
        ) : (
          <div className="space-y-3">
            {displayOrders?.map((job, idx) => (
              <div 
                key={job.job_order_id || idx} 
                className="p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                data-testid={`job-order-item-${job.job_order_id}`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-medium text-sm">{job.job_order_id}</p>
                    <p className="text-xs text-muted-foreground">{getJobTypeLabel(job.job_type)}</p>
                  </div>
                  {getStatusBadge(job.status)}
                </div>
                
                {job.remarks && (
                  <p className="text-sm text-muted-foreground mb-2 bg-accent/50 p-2 rounded">
                    {job.remarks}
                  </p>
                )}
                
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {formatDate(job.created_at)}
                  </span>
                  {job.assigned_technician && (
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3" />
                      {job.assigned_technician}
                    </span>
                  )}
                </div>

                {job.scheduled_date && (
                  <div className="mt-2 text-xs">
                    <span className="text-muted-foreground">Scheduled: </span>
                    <span className="font-medium">{formatDate(job.scheduled_date)}</span>
                  </div>
                )}
              </div>
            ))}

            {jobOrders?.length > 5 && (
              <Button 
                variant="ghost" 
                className="w-full"
                onClick={() => setShowAll(!showAll)}
                data-testid="toggle-job-orders-button"
              >
                {showAll ? (
                  <>
                    <ChevronUp className="w-4 h-4 mr-2" />
                    Show Less
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-4 h-4 mr-2" />
                    View All ({jobOrders.length} orders)
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
