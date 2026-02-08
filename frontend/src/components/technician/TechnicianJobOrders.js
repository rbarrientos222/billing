import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { TablePagination } from '@/components/ui/table-pagination';
import { toast } from 'sonner';
import { 
  Search, ClipboardList, Play, Pause, CheckCircle, XCircle, 
  Eye, Loader2, Package, Plus, Trash2, AlertTriangle, Timer,
  MapPin, User, Calendar, Wrench
} from 'lucide-react';

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

export default function TechnicianJobOrders({ user }) {
  const [jobOrders, setJobOrders] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [inventoryUnits, setInventoryUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [materialDialogOpen, setMaterialDialogOpen] = useState(false);
  const [selectedJobOrder, setSelectedJobOrder] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  
  // Material entry state
  const [selectedItem, setSelectedItem] = useState('');
  const [selectedUnit, setSelectedUnit] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [materialsToAdd, setMaterialsToAdd] = useState([]);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [jobsRes, invRes] = await Promise.all([
        axios.get(`/joborders/technician/${user.username}`),
        axios.get('/inventory')
      ]);
      setJobOrders(jobsRes.data || []);
      setInventory(invRes.data || []);
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
        jo.type?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'all' || jo.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [jobOrders, searchTerm, statusFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredJobOrders.length / pageSize));
  const paginatedJobOrders = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredJobOrders.slice(start, start + pageSize);
  }, [filteredJobOrders, currentPage, pageSize]);

  const handleStartJob = async (jobOrderId) => {
    try {
      await axios.post(`/joborders/${jobOrderId}/start`);
      toast.success('Job order started');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to start job order');
    }
  };

  const handleCompleteJob = async (jobOrderId) => {
    if (!window.confirm('Are you sure you want to mark this job as completed?')) return;
    
    try {
      const response = await axios.post(`/joborders/${jobOrderId}/complete`);
      toast.success(`Job completed! Time rendered: ${formatTime(response.data.time_rendered_minutes)}`);
      fetchData();
      setViewDialogOpen(false);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to complete job order');
    }
  };

  const handlePutOnHold = async (jobOrderId) => {
    try {
      await axios.put(`/joborders/${jobOrderId}`, { status: 'On Hold' });
      toast.success('Job order put on hold');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update status');
    }
  };

  const handleResumeJob = async (jobOrderId) => {
    try {
      await axios.put(`/joborders/${jobOrderId}`, { status: 'In Progress' });
      toast.success('Job order resumed');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update status');
    }
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

  const openMaterialDialog = (jo) => {
    setSelectedJobOrder(jo);
    setMaterialsToAdd([]);
    setSelectedItem('');
    setSelectedUnit('');
    setQuantity(1);
    setMaterialDialogOpen(true);
  };

  // Fetch units when item is selected
  const fetchUnitsForItem = async (itemCode) => {
    try {
      const response = await axios.get(`/inventory/${itemCode}/units`);
      setInventoryUnits(response.data.filter(u => u.status === 'available') || []);
    } catch (error) {
      setInventoryUnits([]);
    }
  };

  const handleItemSelect = (itemCode) => {
    setSelectedItem(itemCode);
    setSelectedUnit('');
    const item = inventory.find(i => i.item_code === itemCode);
    if (item?.is_serialized) {
      fetchUnitsForItem(itemCode);
    } else {
      setInventoryUnits([]);
    }
  };

  const addMaterialToList = () => {
    if (!selectedItem) {
      toast.error('Please select an item');
      return;
    }
    
    const item = inventory.find(i => i.item_code === selectedItem);
    if (!item) return;
    
    if (item.is_serialized && !selectedUnit) {
      toast.error('Please select a unit for serialized items');
      return;
    }
    
    const unit = inventoryUnits.find(u => u.unit_id === selectedUnit);
    
    const material = {
      item_code: selectedItem,
      name: item.name,
      quantity: item.is_serialized ? 1 : quantity,
      unit: item.unit,
      unit_id: item.is_serialized ? selectedUnit : null,
      mac_address: unit?.mac_address,
      serial_number: unit?.serial_number,
      is_serialized: item.is_serialized
    };
    
    setMaterialsToAdd([...materialsToAdd, material]);
    setSelectedItem('');
    setSelectedUnit('');
    setQuantity(1);
    setInventoryUnits([]);
  };

  const removeMaterialFromList = (index) => {
    setMaterialsToAdd(materialsToAdd.filter((_, i) => i !== index));
  };

  const handleSubmitMaterials = async () => {
    if (materialsToAdd.length === 0) {
      toast.error('Please add at least one material');
      return;
    }
    
    setSubmitting(true);
    try {
      const payload = materialsToAdd.map(m => ({
        item_code: m.item_code,
        quantity: m.quantity,
        unit_id: m.unit_id
      }));
      
      await axios.post(`/joborders/${selectedJobOrder.job_order_id}/materials`, payload);
      toast.success('Materials added successfully');
      setMaterialDialogOpen(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to add materials');
    } finally {
      setSubmitting(false);
    }
  };

  const formatTime = (minutes) => {
    if (!minutes) return '-';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  const selectedItemData = inventory.find(i => i.item_code === selectedItem);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-heading font-bold">My Job Orders</h2>
        <p className="text-muted-foreground mt-1">Manage and fulfill your assigned job orders</p>
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
            <SelectItem value="Open">Open</SelectItem>
            <SelectItem value="In Progress">In Progress</SelectItem>
            <SelectItem value="On Hold">On Hold</SelectItem>
            <SelectItem value="Completed">Completed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Job Orders */}
      <Card>
        <CardHeader>
          <CardTitle>Assigned Job Orders</CardTitle>
          <CardDescription>{filteredJobOrders.length} total</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4">
              {paginatedJobOrders.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <ClipboardList className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No job orders found</p>
                </div>
              ) : (
                paginatedJobOrders.map((jo) => (
                  <div 
                    key={jo.job_order_id} 
                    className={`p-4 rounded-lg border ${jo.sla_breached ? 'bg-red-50 border-red-200' : 'bg-card'}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-sm font-bold">{jo.job_order_id}</span>
                          <Badge className={STATUS_COLORS[jo.status]}>{jo.status}</Badge>
                          <Badge className={PRIORITY_COLORS[jo.priority]}>{jo.priority}</Badge>
                          {jo.sla_breached && <Badge variant="destructive">SLA Breach</Badge>}
                        </div>
                        
                        <div className="mt-2 space-y-1">
                          <div className="flex items-center gap-2 text-sm">
                            <User className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{jo.subscriber_name}</span>
                            <span className="text-muted-foreground">({jo.subscriber_id})</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <MapPin className="h-4 w-4" />
                            <span className="truncate">{jo.subscriber_address}</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <Wrench className="h-4 w-4 text-muted-foreground" />
                            <span>{jo.type}</span>
                          </div>
                          {jo.scheduled_date && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Calendar className="h-4 w-4" />
                              <span>{new Date(jo.scheduled_date).toLocaleDateString()}</span>
                              {jo.scheduled_time_slot && <span>@ {jo.scheduled_time_slot}</span>}
                            </div>
                          )}
                        </div>
                        
                        <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{jo.description}</p>
                        
                        {jo.time_rendered_minutes && jo.status === 'Completed' && (
                          <div className="mt-2 flex items-center gap-2 text-sm text-green-600">
                            <Timer className="h-4 w-4" />
                            <span>Time rendered: {formatTime(jo.time_rendered_minutes)}</span>
                          </div>
                        )}
                      </div>
                      
                      <div className="flex flex-col gap-2">
                        <Button variant="outline" size="sm" onClick={() => openViewDialog(jo)}>
                          <Eye className="h-4 w-4 mr-1" />
                          View
                        </Button>
                        
                        {jo.status === 'Open' && (
                          <Button size="sm" onClick={() => handleStartJob(jo.job_order_id)}>
                            <Play className="h-4 w-4 mr-1" />
                            Start
                          </Button>
                        )}
                        
                        {jo.status === 'In Progress' && (
                          <>
                            <Button size="sm" variant="secondary" onClick={() => handlePutOnHold(jo.job_order_id)}>
                              <Pause className="h-4 w-4 mr-1" />
                              Hold
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => openMaterialDialog(jo)}>
                              <Package className="h-4 w-4 mr-1" />
                              Materials
                            </Button>
                            <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => handleCompleteJob(jo.job_order_id)}>
                              <CheckCircle className="h-4 w-4 mr-1" />
                              Complete
                            </Button>
                          </>
                        )}
                        
                        {jo.status === 'On Hold' && (
                          <Button size="sm" onClick={() => handleResumeJob(jo.job_order_id)}>
                            <Play className="h-4 w-4 mr-1" />
                            Resume
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
              
              <TablePagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={filteredJobOrders.length}
                pageSize={pageSize}
                onPageChange={setCurrentPage}
                onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1); }}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* View Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
              
              <div className="grid grid-cols-3 gap-4 p-3 bg-muted rounded-lg">
                <div>
                  <Label className="text-muted-foreground text-xs">Created</Label>
                  <p className="text-sm">{new Date(selectedJobOrder.created_at).toLocaleString()}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">Started</Label>
                  <p className="text-sm">{selectedJobOrder.started_at ? new Date(selectedJobOrder.started_at).toLocaleString() : '-'}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">Completed</Label>
                  <p className="text-sm">{selectedJobOrder.completed_at ? new Date(selectedJobOrder.completed_at).toLocaleString() : '-'}</p>
                </div>
              </div>
              
              {(selectedJobOrder.materials_used || []).length > 0 && (
                <div>
                  <Label className="text-muted-foreground">Materials Used</Label>
                  <div className="mt-2 rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Item</TableHead>
                          <TableHead>Qty</TableHead>
                          <TableHead>Unit</TableHead>
                          <TableHead>MAC/Serial</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedJobOrder.materials_used.map((mat, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-medium">{mat.name}</TableCell>
                            <TableCell>{mat.quantity}</TableCell>
                            <TableCell>{mat.unit}</TableCell>
                            <TableCell className="font-mono text-xs">
                              {mat.mac_address || mat.serial_number || '-'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
              
              {selectedJobOrder.notes && (
                <div>
                  <Label className="text-muted-foreground">Notes</Label>
                  <p className="text-sm">{selectedJobOrder.notes}</p>
                </div>
              )}
              
              {selectedJobOrder.status === 'In Progress' && (
                <div className="flex gap-2 pt-4 border-t">
                  <Button variant="outline" className="flex-1" onClick={() => openMaterialDialog(selectedJobOrder)}>
                    <Package className="h-4 w-4 mr-2" />
                    Add Materials
                  </Button>
                  <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={() => handleCompleteJob(selectedJobOrder.job_order_id)}>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Complete Job
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Material Entry Dialog */}
      <Dialog open={materialDialogOpen} onOpenChange={setMaterialDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Materials Used</DialogTitle>
            <DialogDescription>Record materials used for job order {selectedJobOrder?.job_order_id}</DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Add Material Form */}
            <div className="p-4 border rounded-lg space-y-4">
              <div>
                <Label>Select Item</Label>
                <Select value={selectedItem} onValueChange={handleItemSelect}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose an inventory item" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {inventory.filter(i => i.quantity > 0 || i.is_serialized).map(item => (
                      <SelectItem key={item.item_code} value={item.item_code}>
                        <div className="flex items-center justify-between gap-4">
                          <span>{item.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {item.is_serialized ? 'Serialized' : `Qty: ${item.quantity}`}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {selectedItemData?.is_serialized ? (
                <div>
                  <Label>Select Unit (MAC/Serial)</Label>
                  <Select value={selectedUnit} onValueChange={setSelectedUnit}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a unit" />
                    </SelectTrigger>
                    <SelectContent>
                      {inventoryUnits.length === 0 ? (
                        <SelectItem value="none" disabled>No available units</SelectItem>
                      ) : (
                        inventoryUnits.map(unit => (
                          <SelectItem key={unit.unit_id} value={unit.unit_id}>
                            {unit.mac_address || unit.serial_number}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              ) : selectedItem && (
                <div>
                  <Label>Quantity</Label>
                  <Input
                    type="number"
                    min="1"
                    max={selectedItemData?.quantity || 999}
                    value={quantity}
                    onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Available: {selectedItemData?.quantity} {selectedItemData?.unit}
                  </p>
                </div>
              )}
              
              <Button type="button" onClick={addMaterialToList} disabled={!selectedItem}>
                <Plus className="h-4 w-4 mr-2" />
                Add to List
              </Button>
            </div>
            
            {/* Materials List */}
            {materialsToAdd.length > 0 && (
              <div>
                <Label>Materials to Add</Label>
                <div className="mt-2 rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead>Qty</TableHead>
                        <TableHead>Unit</TableHead>
                        <TableHead>MAC/Serial</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {materialsToAdd.map((mat, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="font-medium">{mat.name}</TableCell>
                          <TableCell>{mat.quantity}</TableCell>
                          <TableCell>{mat.unit}</TableCell>
                          <TableCell className="font-mono text-xs">
                            {mat.mac_address || mat.serial_number || '-'}
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" onClick={() => removeMaterialFromList(idx)}>
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setMaterialDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmitMaterials} disabled={submitting || materialsToAdd.length === 0}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Materials ({materialsToAdd.length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
