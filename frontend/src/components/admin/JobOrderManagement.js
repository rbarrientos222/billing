import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { TablePagination } from '@/components/ui/table-pagination';
import { toast } from 'sonner';
import { formatPHDate, formatPHDateTime } from '@/lib/utils';
import { 
  Plus, Search, ClipboardList, Clock, AlertTriangle, CheckCircle, 
  XCircle, Pause, Play, Edit, Trash2, Eye, Loader2, Users, Calendar,
  Timer, Target, TrendingUp
} from 'lucide-react';

const JOB_TYPES = [
  'Installation',
  'Repair/Troubleshooting',
  'Relocation',
  'Disconnection',
  'Reactivation',
  'Equipment Replacement',
  'Replace Modem',
  'Pull Out Modem',
  'Others'
];

const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'];
const STATUSES = ['Open', 'In Progress', 'On Hold', 'Completed', 'Cancelled'];

const STATUS_COLORS = {
  'Open': 'bg-blue-100 text-blue-700 border-blue-200',
  'In Progress': 'bg-amber-100 text-amber-700 border-amber-200',
  'On Hold': 'bg-gray-100 text-gray-700 border-gray-200',
  'Completed': 'bg-green-100 text-green-700 border-green-200',
  'Cancelled': 'bg-red-100 text-red-700 border-red-200'
};

const PRIORITY_COLORS = {
  'Critical': 'bg-red-600',
  'High': 'bg-orange-500',
  'Medium': 'bg-yellow-500',
  'Low': 'bg-green-500'
};

export default function JobOrderManagement() {
  const [jobOrders, setJobOrders] = useState([]);
  const [stats, setStats] = useState({});
  const [technicians, setTechnicians] = useState([]);
  const [subscribers, setSubscribers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [selectedJobOrder, setSelectedJobOrder] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  
  // Subscriber search autocomplete
  const [subscriberSearch, setSubscriberSearch] = useState('');
  const [showSubscriberSuggestions, setShowSubscriberSuggestions] = useState(false);
  const [selectedSubscriberInfo, setSelectedSubscriberInfo] = useState(null);
  
  const [formData, setFormData] = useState({
    subscriber_id: '',
    type: 'Installation',
    description: '',
    priority: 'Medium',
    assigned_technicians: [],
    scheduled_date: '',
    scheduled_time_slot: '',
    notes: '',
    new_address: {
      province: '',
      municipality: '',
      barangay: '',
      street: ''
    }
  });

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [jobsRes, statsRes, techRes, subsRes] = await Promise.all([
        axios.get('/joborders'),
        axios.get('/joborders/stats'),
        axios.get('/technicians'),
        axios.get('/subscribers')
      ]);
      setJobOrders(jobsRes.data || []);
      setStats(statsRes.data || {});
      setTechnicians(techRes.data || []);
      setSubscribers(subsRes.data || []);
    } catch (error) {
      toast.error('Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  const filteredJobOrders = useMemo(() => {
    return jobOrders.filter(jo => {
      const matchesSearch = !searchTerm || 
        jo.job_order_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        jo.subscriber_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        jo.subscriber_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        jo.type?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'all' || jo.status === statusFilter;
      const matchesPriority = priorityFilter === 'all' || jo.priority === priorityFilter;
      return matchesSearch && matchesStatus && matchesPriority;
    });
  }, [jobOrders, searchTerm, statusFilter, priorityFilter]);

  // Reset pagination on filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, priorityFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredJobOrders.length / pageSize));
  const paginatedJobOrders = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredJobOrders.slice(start, start + pageSize);
  }, [filteredJobOrders, currentPage, pageSize]);

  // Subscriber autocomplete suggestions
  const subscriberSuggestions = useMemo(() => {
    if (!subscriberSearch || subscriberSearch.length < 2) return [];
    const search = subscriberSearch.toLowerCase();
    return subscribers.filter(sub => 
      sub.account_number?.toLowerCase().includes(search) ||
      sub.first_name?.toLowerCase().includes(search) ||
      sub.last_name?.toLowerCase().includes(search) ||
      `${sub.first_name} ${sub.last_name}`.toLowerCase().includes(search)
    ).slice(0, 10);
  }, [subscribers, subscriberSearch]);

  const selectSubscriber = (sub) => {
    setFormData({...formData, subscriber_id: sub.account_number});
    setSubscriberSearch(`${sub.account_number} - ${sub.first_name} ${sub.last_name}`);
    setSelectedSubscriberInfo(sub);
    setShowSubscriberSuggestions(false);
  };

  const resetForm = () => {
    setFormData({
      subscriber_id: '',
      type: 'Installation',
      description: '',
      priority: 'Medium',
      assigned_technicians: [],
      scheduled_date: '',
      scheduled_time_slot: '',
      notes: '',
      new_address: {
        province: '',
        municipality: '',
        barangay: '',
        street: ''
      }
    });
    setSubscriberSearch('');
    setSelectedSubscriberInfo(null);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!formData.subscriber_id || !formData.description) {
      toast.error('Please fill in required fields');
      return;
    }
    
    // Validate new address for relocation
    if (formData.type === 'Relocation' && !formData.new_address?.street) {
      toast.error('Please enter the new address for relocation');
      return;
    }
    
    setSubmitting(true);
    try {
      const payload = {
        ...formData,
        scheduled_date: formData.scheduled_date ? new Date(formData.scheduled_date).toISOString() : null
      };
      const response = await axios.post('/joborders', payload);
      toast.success(`Job order created: ${response.data.job_order_id}`);
      setCreateDialogOpen(false);
      resetForm();
      fetchAll();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create job order');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!selectedJobOrder) return;
    
    setSubmitting(true);
    try {
      await axios.put(`/joborders/${selectedJobOrder.job_order_id}`, formData);
      toast.success('Job order updated');
      setEditDialogOpen(false);
      fetchAll();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update job order');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (jobOrderId) => {
    if (!window.confirm('Are you sure you want to delete this job order?')) return;
    
    try {
      await axios.delete(`/joborders/${jobOrderId}`);
      toast.success('Job order deleted');
      fetchAll();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete job order');
    }
  };

  const openEditDialog = (jo) => {
    setSelectedJobOrder(jo);
    // Default to current date if no scheduled_date exists
    const today = new Date().toISOString().split('T')[0];
    setFormData({
      type: jo.type,
      description: jo.description,
      status: jo.status,
      priority: jo.priority,
      assigned_technicians: jo.assigned_technicians || [],
      scheduled_date: jo.scheduled_date ? jo.scheduled_date.split('T')[0] : today,
      scheduled_time_slot: jo.scheduled_time_slot || '',
      notes: jo.notes || ''
    });
    setEditDialogOpen(true);
  };

  const openViewDialog = async (jo) => {
    try {
      const response = await axios.get(`/joborders/${jo.job_order_id}`);
      setSelectedJobOrder(response.data);
      setViewDialogOpen(true);
    } catch (error) {
      toast.error('Failed to fetch job order details');
    }
  };

  const formatTime = (minutes) => {
    if (!minutes) return '-';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  const statusCounts = stats.status_counts || {};

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-heading font-bold">Job Orders</h2>
          <p className="text-muted-foreground mt-1">Manage service requests and installations</p>
        </div>
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="create-job-order-btn">
              <Plus className="h-4 w-4 mr-2" />
              New Job Order
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Job Order</DialogTitle>
              <DialogDescription>Create a new service request or installation job</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="relative">
                <Label>Subscriber *</Label>
                <Input
                  placeholder="Type to search subscriber (name or account number)..."
                  value={subscriberSearch}
                  onChange={(e) => {
                    setSubscriberSearch(e.target.value);
                    setShowSubscriberSuggestions(true);
                    if (!e.target.value) {
                      setFormData({...formData, subscriber_id: ''});
                      setSelectedSubscriberInfo(null);
                    }
                  }}
                  onFocus={() => setShowSubscriberSuggestions(true)}
                />
                {showSubscriberSuggestions && subscriberSuggestions.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-white border rounded-md shadow-lg max-h-60 overflow-y-auto">
                    {subscriberSuggestions.map(sub => (
                      <div
                        key={sub.account_number}
                        className="px-3 py-2 hover:bg-muted cursor-pointer border-b last:border-b-0"
                        onClick={() => selectSubscriber(sub)}
                      >
                        <p className="font-medium">{sub.first_name} {sub.last_name}</p>
                        <p className="text-xs text-muted-foreground">{sub.account_number} • {sub.street}, {sub.barangay}</p>
                      </div>
                    ))}
                  </div>
                )}
                {selectedSubscriberInfo && (
                  <div className="mt-2 p-2 bg-green-50 rounded-md text-sm">
                    <p className="font-medium text-green-700">{selectedSubscriberInfo.first_name} {selectedSubscriberInfo.last_name}</p>
                    <p className="text-green-600 text-xs">{selectedSubscriberInfo.street}, {selectedSubscriberInfo.barangay}, {selectedSubscriberInfo.municipality}</p>
                  </div>
                )}
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Type *</Label>
                  <Select value={formData.type} onValueChange={(v) => setFormData({...formData, type: v})}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {JOB_TYPES.map(type => (
                        <SelectItem key={type} value={type}>{type}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Priority *</Label>
                  <Select value={formData.priority} onValueChange={(v) => setFormData({...formData, priority: v})}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITIES.map(p => (
                        <SelectItem key={p} value={p}>
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${PRIORITY_COLORS[p]}`} />
                            {p}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div>
                <Label>Description *</Label>
                <Textarea 
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  placeholder="Describe the work to be done..."
                  rows={3}
                />
              </div>
              
              {/* Relocation New Address */}
              {formData.type === 'Relocation' && (
                <div className="p-4 border border-amber-200 bg-amber-50 rounded-lg space-y-3">
                  <Label className="text-amber-700 font-medium">New Address for Relocation *</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Province</Label>
                      <Input
                        placeholder="Province"
                        value={formData.new_address?.province || ''}
                        onChange={(e) => setFormData({...formData, new_address: {...formData.new_address, province: e.target.value}})}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Municipality</Label>
                      <Input
                        placeholder="Municipality"
                        value={formData.new_address?.municipality || ''}
                        onChange={(e) => setFormData({...formData, new_address: {...formData.new_address, municipality: e.target.value}})}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Barangay</Label>
                      <Input
                        placeholder="Barangay"
                        value={formData.new_address?.barangay || ''}
                        onChange={(e) => setFormData({...formData, new_address: {...formData.new_address, barangay: e.target.value}})}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Street / House No. *</Label>
                      <Input
                        placeholder="Street address"
                        value={formData.new_address?.street || ''}
                        onChange={(e) => setFormData({...formData, new_address: {...formData.new_address, street: e.target.value}})}
                      />
                    </div>
                  </div>
                </div>
              )}
              
              <div>
                <Label>Assign Technicians</Label>
                <div className="flex flex-wrap gap-2 mt-2 p-3 border rounded-lg min-h-[60px]">
                  {technicians.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No technicians available</p>
                  ) : (
                    technicians.map(tech => {
                      const isSelected = formData.assigned_technicians.includes(tech.username);
                      return (
                        <Badge
                          key={tech.username}
                          variant={isSelected ? "default" : "outline"}
                          className={`cursor-pointer ${isSelected ? 'bg-primary' : ''}`}
                          onClick={() => {
                            if (isSelected) {
                              setFormData({...formData, assigned_technicians: formData.assigned_technicians.filter(t => t !== tech.username)});
                            } else {
                              setFormData({...formData, assigned_technicians: [...formData.assigned_technicians, tech.username]});
                            }
                          }}
                        >
                          {tech.username}
                        </Badge>
                      );
                    })
                  )}
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Scheduled Date</Label>
                  <Input 
                    type="date"
                    value={formData.scheduled_date}
                    onChange={(e) => setFormData({...formData, scheduled_date: e.target.value})}
                  />
                </div>
                <div>
                  <Label>Time Slot</Label>
                  <Select value={formData.scheduled_time_slot} onValueChange={(v) => setFormData({...formData, scheduled_time_slot: v})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select time" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="08:00-10:00">08:00 - 10:00</SelectItem>
                      <SelectItem value="10:00-12:00">10:00 - 12:00</SelectItem>
                      <SelectItem value="13:00-15:00">13:00 - 15:00</SelectItem>
                      <SelectItem value="15:00-17:00">15:00 - 17:00</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div>
                <Label>Notes</Label>
                <Textarea 
                  value={formData.notes}
                  onChange={(e) => setFormData({...formData, notes: e.target.value})}
                  placeholder="Additional notes..."
                  rows={2}
                />
              </div>
              
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create Job Order
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Open</p>
                <p className="text-2xl font-bold text-blue-600">{statusCounts.Open || 0}</p>
              </div>
              <ClipboardList className="h-6 w-6 text-blue-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">In Progress</p>
                <p className="text-2xl font-bold text-amber-600">{statusCounts['In Progress'] || 0}</p>
              </div>
              <Play className="h-6 w-6 text-amber-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">On Hold</p>
                <p className="text-2xl font-bold text-gray-600">{statusCounts['On Hold'] || 0}</p>
              </div>
              <Pause className="h-6 w-6 text-gray-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Completed</p>
                <p className="text-2xl font-bold text-green-600">{statusCounts.Completed || 0}</p>
              </div>
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
          </CardContent>
        </Card>
        <Card className={stats.sla_breached_count > 0 ? 'border-red-300 bg-red-50' : ''}>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">SLA Breached</p>
                <p className="text-2xl font-bold text-red-600">{stats.sla_breached_count || 0}</p>
              </div>
              <AlertTriangle className={`h-6 w-6 text-red-600 ${stats.sla_breached_count > 0 ? 'animate-pulse' : ''}`} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Avg Time</p>
                <p className="text-2xl font-bold">{formatTime(stats.avg_time_rendered_minutes)}</p>
              </div>
              <Timer className="h-6 w-6 text-purple-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by ID, subscriber, or type..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {STATUSES.map(s => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priority</SelectItem>
            {PRIORITIES.map(p => (
              <SelectItem key={p} value={p}>{p}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Job Orders Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg sm:text-xl">Job Orders</CardTitle>
          <CardDescription>{filteredJobOrders.length} total</CardDescription>
        </CardHeader>
        <CardContent className="px-2 sm:px-6">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Mobile View - Cards */}
              <div className="space-y-2 sm:hidden">
                {paginatedJobOrders.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <ClipboardList className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    No job orders found
                  </div>
                ) : (
                  paginatedJobOrders.map((jo) => (
                    <div key={jo.job_order_id} className={`p-3 border rounded-lg ${jo.sla_breached ? 'bg-red-50 border-red-200' : 'bg-card'}`}>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-mono text-xs text-muted-foreground">{jo.job_order_id}</p>
                          <p className="font-medium text-sm truncate">{jo.subscriber_name || jo.subscriber_id}</p>
                          <p className="text-xs text-muted-foreground truncate">{jo.type}</p>
                        </div>
                        <Badge className={STATUS_COLORS[jo.status] + " shrink-0 text-xs"}>{jo.status}</Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 mb-2">
                        <div className="flex items-center gap-1">
                          <div className={`w-2 h-2 rounded-full ${PRIORITY_COLORS[jo.priority]}`} />
                          <span className="text-xs">{jo.priority}</span>
                        </div>
                        {jo.sla_breached && <Badge variant="destructive" className="text-[10px] px-1 py-0">SLA</Badge>}
                        {(jo.assigned_technicians || []).length > 0 && (
                          <Badge variant="outline" className="text-[10px] px-1 py-0">
                            {jo.assigned_technicians[0]}{jo.assigned_technicians.length > 1 ? ` +${jo.assigned_technicians.length - 1}` : ''}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t">
                        <span className="text-xs text-muted-foreground">
                          {formatPHDate(jo.created_at)}
                        </span>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openViewDialog(jo)}>
                            <Eye className="h-4 w-4 text-blue-600" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEditDialog(jo)}>
                            <Edit className="h-4 w-4 text-amber-600" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleDelete(jo.job_order_id)}>
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Desktop View - Table */}
              <div className="rounded-md border hidden sm:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Job Order ID</TableHead>
                      <TableHead>Subscriber</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Assigned</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedJobOrders.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                          <ClipboardList className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          No job orders found
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedJobOrders.map((jo) => (
                        <TableRow key={jo.job_order_id} className={jo.sla_breached ? 'bg-red-50' : ''}>
                          <TableCell>
                            <div className="font-mono text-xs">{jo.job_order_id}</div>
                            {jo.sla_breached && (
                              <Badge variant="destructive" className="text-xs mt-1">SLA Breach</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">{jo.subscriber_name || jo.subscriber_id}</div>
                            <div className="text-xs text-muted-foreground truncate max-w-[200px]">{jo.subscriber_address}</div>
                          </TableCell>
                          <TableCell>{jo.type}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className={`w-2 h-2 rounded-full ${PRIORITY_COLORS[jo.priority]}`} />
                              {jo.priority}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={STATUS_COLORS[jo.status]}>{jo.status}</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {(jo.assigned_technicians || []).length === 0 ? (
                                <span className="text-muted-foreground text-xs">Unassigned</span>
                              ) : (
                                jo.assigned_technicians.slice(0, 2).map(t => (
                                  <Badge key={t} variant="outline" className="text-xs">{t}</Badge>
                                ))
                              )}
                              {(jo.assigned_technicians || []).length > 2 && (
                                <Badge variant="outline" className="text-xs">+{jo.assigned_technicians.length - 2}</Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs">
                            {formatPHDate(jo.created_at)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" onClick={() => openViewDialog(jo)}>
                                <Eye className="h-4 w-4 text-blue-600" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => openEditDialog(jo)}>
                                <Edit className="h-4 w-4 text-amber-600" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => handleDelete(jo.job_order_id)}>
                                <Trash2 className="h-4 w-4 text-red-600" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              
              <TablePagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={filteredJobOrders.length}
                pageSize={pageSize}
                onPageChange={setCurrentPage}
                onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1); }}
              />
            </>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Job Order</DialogTitle>
            <DialogDescription>{selectedJobOrder?.job_order_id}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdate} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Type</Label>
                <Select value={formData.type} onValueChange={(v) => setFormData({...formData, type: v})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {JOB_TYPES.map(type => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={formData.status} onValueChange={(v) => setFormData({...formData, status: v})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div>
              <Label>Priority</Label>
              <Select value={formData.priority} onValueChange={(v) => setFormData({...formData, priority: v})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map(p => (
                    <SelectItem key={p} value={p}>
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${PRIORITY_COLORS[p]}`} />
                        {p}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label>Description</Label>
              <Textarea 
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                rows={3}
              />
            </div>
            
            <div>
              <Label>Assign Technicians</Label>
              <div className="flex flex-wrap gap-2 mt-2 p-3 border rounded-lg min-h-[60px]">
                {technicians.map(tech => {
                  const isSelected = (formData.assigned_technicians || []).includes(tech.username);
                  return (
                    <Badge
                      key={tech.username}
                      variant={isSelected ? "default" : "outline"}
                      className={`cursor-pointer ${isSelected ? 'bg-primary' : ''}`}
                      onClick={() => {
                        if (isSelected) {
                          setFormData({...formData, assigned_technicians: formData.assigned_technicians.filter(t => t !== tech.username)});
                        } else {
                          setFormData({...formData, assigned_technicians: [...(formData.assigned_technicians || []), tech.username]});
                        }
                      }}
                    >
                      {tech.username}
                    </Badge>
                  );
                })}
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Scheduled Date</Label>
                <Input 
                  type="date"
                  value={formData.scheduled_date}
                  onChange={(e) => setFormData({...formData, scheduled_date: e.target.value})}
                />
              </div>
              <div>
                <Label>Time Slot</Label>
                <Select value={formData.scheduled_time_slot || ''} onValueChange={(v) => setFormData({...formData, scheduled_time_slot: v})}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select time" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="08:00-10:00">08:00 - 10:00</SelectItem>
                    <SelectItem value="10:00-12:00">10:00 - 12:00</SelectItem>
                    <SelectItem value="13:00-15:00">13:00 - 15:00</SelectItem>
                    <SelectItem value="15:00-17:00">15:00 - 17:00</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div>
              <Label>Notes</Label>
              <Textarea 
                value={formData.notes || ''}
                onChange={(e) => setFormData({...formData, notes: e.target.value})}
                rows={2}
              />
            </div>
            
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Job Order Details</DialogTitle>
            <DialogDescription>{selectedJobOrder?.job_order_id}</DialogDescription>
          </DialogHeader>
          {selectedJobOrder && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Subscriber</Label>
                  <p className="font-medium">{selectedJobOrder.subscriber_name}</p>
                  <p className="text-sm text-muted-foreground">{selectedJobOrder.subscriber_id}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Address</Label>
                  <p className="text-sm">{selectedJobOrder.subscriber_address}</p>
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label className="text-muted-foreground">Type</Label>
                  <p className="font-medium">{selectedJobOrder.type}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Priority</Label>
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${PRIORITY_COLORS[selectedJobOrder.priority]}`} />
                    <span className="font-medium">{selectedJobOrder.priority}</span>
                  </div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Status</Label>
                  <Badge className={STATUS_COLORS[selectedJobOrder.status]}>{selectedJobOrder.status}</Badge>
                </div>
              </div>
              
              <div>
                <Label className="text-muted-foreground">Description</Label>
                <p className="text-sm">{selectedJobOrder.description}</p>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Assigned Technicians</Label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {(selectedJobOrder.assigned_technicians || []).length === 0 ? (
                      <span className="text-sm text-muted-foreground">Unassigned</span>
                    ) : (
                      selectedJobOrder.assigned_technicians.map(t => (
                        <Badge key={t} variant="outline">{t}</Badge>
                      ))
                    )}
                  </div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Schedule</Label>
                  <p className="text-sm">
                    {selectedJobOrder.scheduled_date ? formatPHDate(selectedJobOrder.scheduled_date) : '-'}
                    {selectedJobOrder.scheduled_time_slot && ` @ ${selectedJobOrder.scheduled_time_slot}`}
                  </p>
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-4 p-3 bg-muted rounded-lg">
                <div>
                  <Label className="text-muted-foreground text-xs">Created</Label>
                  <p className="text-sm">{formatPHDateTime(selectedJobOrder.created_at)}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">Started</Label>
                  <p className="text-sm">{selectedJobOrder.started_at ? formatPHDateTime(selectedJobOrder.started_at) : '-'}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">Completed</Label>
                  <p className="text-sm">{selectedJobOrder.completed_at ? formatPHDateTime(selectedJobOrder.completed_at) : '-'}</p>
                </div>
              </div>
              
              {selectedJobOrder.time_rendered_minutes && (
                <div className="p-3 bg-green-50 rounded-lg">
                  <Label className="text-green-700">Time Rendered</Label>
                  <p className="text-lg font-bold text-green-600">{formatTime(selectedJobOrder.time_rendered_minutes)}</p>
                </div>
              )}
              
              {(selectedJobOrder.materials_used || []).length > 0 && (
                <div>
                  <Label className="text-muted-foreground">Materials Used</Label>
                  <div className="mt-2 space-y-2">
                    {selectedJobOrder.materials_used.map((mat, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2 bg-muted rounded">
                        <span className="text-sm">{mat.name}</span>
                        <span className="text-sm font-medium">{mat.quantity} {mat.unit || 'pcs'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {selectedJobOrder.notes && (
                <div>
                  <Label className="text-muted-foreground">Notes</Label>
                  <p className="text-sm">{selectedJobOrder.notes}</p>
                </div>
              )}
              
              {selectedJobOrder.completion_remarks && (
                <div>
                  <Label className="text-muted-foreground">Completion Remarks</Label>
                  <p className="text-sm bg-green-50 p-3 rounded-lg border border-green-200">{selectedJobOrder.completion_remarks}</p>
                  {selectedJobOrder.completed_by && (
                    <p className="text-xs text-muted-foreground mt-1">Completed by: {selectedJobOrder.completed_by}</p>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
