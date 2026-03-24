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
import { formatPHDate, formatPHDateTime } from '@/lib/utils';
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
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
  const [selectedJobOrder, setSelectedJobOrder] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [completionRemarks, setCompletionRemarks] = useState('');
  
  // Equipment selection for Pull Out / Replace Modem
  const [subscriberEquipment, setSubscriberEquipment] = useState([]);
  const [selectedEquipmentId, setSelectedEquipmentId] = useState('');
  const [newEquipmentId, setNewEquipmentId] = useState('');
  const [markDefective, setMarkDefective] = useState(true);
  const [availableUnits, setAvailableUnits] = useState([]);
  
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
    setSubmitting(true);
    try {
      const payload = { 
        completion_remarks: completionRemarks || null,
        equipment_unit_id: selectedEquipmentId || null,
        new_equipment_unit_id: newEquipmentId || null,
        mark_defective: markDefective
      };
      const response = await axios.post(`/joborders/${jobOrderId}/complete`, payload);
      toast.success(`Job completed! Time rendered: ${formatTime(response.data.time_rendered_minutes)}`);
      setCompleteDialogOpen(false);
      setCompletionRemarks('');
      setSelectedEquipmentId('');
      setNewEquipmentId('');
      setMarkDefective(true);
      fetchData();
      setViewDialogOpen(false);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to complete job order');
    } finally {
      setSubmitting(false);
    }
  };

  const openCompleteDialog = async (jo) => {
    setSelectedJobOrder(jo);
    setCompletionRemarks('');
    setSelectedEquipmentId('');
    setNewEquipmentId('');
    setMarkDefective(true);
    
    // Fetch subscriber equipment for Pull Out / Replace Modem jobs
    if (['Pull Out Modem', 'Replace Modem'].includes(jo.type)) {
      try {
        const equipRes = await axios.get(`/subscribers/${jo.subscriber_id}/equipment`);
        setSubscriberEquipment(equipRes.data.filter(e => e.item_type === 'equipment' || e.mac_address || e.serial_number) || []);
      } catch (error) {
        setSubscriberEquipment([]);
      }
    }
    
    // Fetch available units for Replace Modem
    if (jo.type === 'Replace Modem') {
      try {
        // Get all serialized inventory items and their available units
        const invRes = await axios.get('/inventory');
        const serializedItems = invRes.data.filter(i => i.is_serialized);
        let allUnits = [];
        for (const item of serializedItems) {
          try {
            const unitsRes = await axios.get(`/inventory/${item.item_code}/units`);
            const available = unitsRes.data.filter(u => u.status === 'available').map(u => ({...u, item_name: item.name}));
            allUnits = [...allUnits, ...available];
          } catch (e) {}
        }
        setAvailableUnits(allUnits);
      } catch (error) {
        setAvailableUnits([]);
      }
    }
    
    setCompleteDialogOpen(true);
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
    const totalMins = Math.round(minutes); // Round to avoid floating point precision issues
    const hours = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
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
                          <div className="text-xs text-muted-foreground font-mono">
                            {jo.subscriber_id}
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <User className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="font-medium">{jo.subscriber_name}</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <MapPin className="h-4 w-4 shrink-0" />
                            <span className="truncate">{jo.subscriber_address}</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <Wrench className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span>{jo.type}</span>
                          </div>
                          {jo.scheduled_date && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Calendar className="h-4 w-4 shrink-0" />
                              <span>{formatPHDate(jo.scheduled_date)}</span>
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
                            <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => openCompleteDialog(jo)}>
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
              
              {(selectedJobOrder.materials_used || []).length > 0 && (
                <div>
                  <Label className="text-muted-foreground">Materials Used ({selectedJobOrder.materials_used.length})</Label>
                  
                  {/* Mobile View - Cards */}
                  <div className="mt-2 space-y-2 sm:hidden">
                    {selectedJobOrder.materials_used.map((mat, idx) => (
                      <div key={idx} className="p-3 border rounded-lg bg-muted/30">
                        <p className="font-medium text-sm">{mat.name}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                          <span className="font-semibold text-foreground">{mat.quantity} {mat.unit || 'pcs'}</span>
                          {(mat.mac_address || mat.serial_number) && (
                            <span className="font-mono truncate">• {mat.mac_address || mat.serial_number}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  {/* Desktop View - Table */}
                  <div className="mt-2 rounded-md border hidden sm:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Item</TableHead>
                          <TableHead className="w-16 text-center">Qty</TableHead>
                          <TableHead className="w-20">Unit</TableHead>
                          <TableHead>MAC/Serial</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedJobOrder.materials_used.map((mat, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-medium">{mat.name}</TableCell>
                            <TableCell className="text-center">{mat.quantity}</TableCell>
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
              
              {selectedJobOrder.completion_remarks && (
                <div>
                  <Label className="text-muted-foreground">Completion Remarks</Label>
                  <p className="text-sm bg-green-50 p-2 rounded">{selectedJobOrder.completion_remarks}</p>
                </div>
              )}
              
              {selectedJobOrder.status === 'In Progress' && (
                <div className="flex gap-2 pt-4 border-t">
                  <Button variant="outline" className="flex-1" onClick={() => openMaterialDialog(selectedJobOrder)}>
                    <Package className="h-4 w-4 mr-2" />
                    Add Materials
                  </Button>
                  <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={() => { setViewDialogOpen(false); openCompleteDialog(selectedJobOrder); }}>
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Materials Used</DialogTitle>
            <DialogDescription>Job Order: {selectedJobOrder?.job_order_id}</DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Add Material Form */}
            <div className="p-3 sm:p-4 border rounded-lg space-y-4">
              <div>
                <Label>Select Item</Label>
                <Select value={selectedItem} onValueChange={handleItemSelect}>
                  <SelectTrigger className="mt-1">
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
                    <SelectTrigger className="mt-1">
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
                    inputMode="numeric"
                    pattern="[0-9]*"
                    min="1"
                    max={selectedItemData?.quantity || 999}
                    value={quantity}
                    onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                    className="mt-1 text-center text-lg font-medium h-12 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    placeholder="Enter quantity"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Available: {selectedItemData?.quantity} {selectedItemData?.unit}
                  </p>
                </div>
              )}
              
              <Button type="button" onClick={addMaterialToList} disabled={!selectedItem} className="w-full sm:w-auto">
                <Plus className="h-4 w-4 mr-2" />
                Add to List
              </Button>
            </div>
            
            {/* Materials List - Mobile Friendly Cards */}
            {materialsToAdd.length > 0 && (
              <div>
                <Label className="text-sm font-medium">Materials to Add ({materialsToAdd.length})</Label>
                
                {/* Mobile View - Cards */}
                <div className="mt-2 space-y-2 sm:hidden">
                  {materialsToAdd.map((mat, idx) => (
                    <div key={idx} className="p-3 border rounded-lg bg-muted/30 flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{mat.name}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                          <span className="font-semibold text-foreground">{mat.quantity} {mat.unit || 'pcs'}</span>
                          {(mat.mac_address || mat.serial_number) && (
                            <span className="font-mono truncate">• {mat.mac_address || mat.serial_number}</span>
                          )}
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => removeMaterialFromList(idx)} className="shrink-0">
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  ))}
                </div>
                
                {/* Desktop View - Table */}
                <div className="mt-2 rounded-md border hidden sm:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead className="w-16 text-center">Qty</TableHead>
                        <TableHead className="w-20">Unit</TableHead>
                        <TableHead>MAC/Serial</TableHead>
                        <TableHead className="w-12"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {materialsToAdd.map((mat, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="font-medium">{mat.name}</TableCell>
                          <TableCell className="text-center">{mat.quantity}</TableCell>
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
          
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setMaterialDialogOpen(false)} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button onClick={handleSubmitMaterials} disabled={submitting || materialsToAdd.length === 0} className="w-full sm:w-auto">
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Materials ({materialsToAdd.length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Complete Job Dialog */}
      <Dialog open={completeDialogOpen} onOpenChange={setCompleteDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Complete Job Order</DialogTitle>
            <DialogDescription>
              {selectedJobOrder?.job_order_id} - {selectedJobOrder?.subscriber_name}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm"><strong>Type:</strong> {selectedJobOrder?.type}</p>
              <p className="text-sm mt-1"><strong>Description:</strong> {selectedJobOrder?.description}</p>
            </div>
            
            {/* Relocation - Show new address */}
            {selectedJobOrder?.type === 'Relocation' && selectedJobOrder?.new_address && (
              <div className="p-4 border border-amber-200 bg-amber-50 rounded-lg">
                <Label className="text-amber-700 font-medium">New Address (will be updated)</Label>
                <p className="text-sm mt-1">
                  {selectedJobOrder.new_address.street}, {selectedJobOrder.new_address.barangay}, {selectedJobOrder.new_address.municipality}, {selectedJobOrder.new_address.province}
                </p>
              </div>
            )}
            
            {/* Pull Out Modem - Select equipment to return */}
            {selectedJobOrder?.type === 'Pull Out Modem' && (
              <div className="p-4 border border-blue-200 bg-blue-50 rounded-lg space-y-3">
                <Label className="text-blue-700 font-medium">Select Equipment to Pull Out</Label>
                <Select value={selectedEquipmentId} onValueChange={setSelectedEquipmentId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select equipment to return" />
                  </SelectTrigger>
                  <SelectContent>
                    {subscriberEquipment.length === 0 ? (
                      <SelectItem value="none" disabled>No equipment found</SelectItem>
                    ) : (
                      subscriberEquipment.map(equip => (
                        <SelectItem key={equip.unit_id} value={equip.unit_id}>
                          {equip.item_name} - {equip.mac_address || equip.serial_number}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <p className="text-xs text-blue-600">Equipment will be returned to inventory as available.</p>
              </div>
            )}
            
            {/* Replace Modem - Select old (defective) and new equipment */}
            {selectedJobOrder?.type === 'Replace Modem' && (
              <div className="p-4 border border-red-200 bg-red-50 rounded-lg space-y-4">
                <div>
                  <Label className="text-red-700 font-medium">Select Defective Equipment</Label>
                  <Select value={selectedEquipmentId} onValueChange={setSelectedEquipmentId}>
                    <SelectTrigger className="mt-2">
                      <SelectValue placeholder="Select defective equipment" />
                    </SelectTrigger>
                    <SelectContent>
                      {subscriberEquipment.length === 0 ? (
                        <SelectItem value="none" disabled>No equipment found</SelectItem>
                      ) : (
                        subscriberEquipment.map(equip => (
                          <SelectItem key={equip.unit_id} value={equip.unit_id}>
                            {equip.item_name} - {equip.mac_address || equip.serial_number}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-2 mt-2">
                    <input 
                      type="checkbox" 
                      id="mark-defective"
                      checked={markDefective}
                      onChange={(e) => setMarkDefective(e.target.checked)}
                      className="rounded"
                    />
                    <Label htmlFor="mark-defective" className="text-xs text-red-600 cursor-pointer">
                      Mark as defective (will not be available in inventory)
                    </Label>
                  </div>
                </div>
                
                <div>
                  <Label className="text-green-700 font-medium">Select New Replacement Equipment</Label>
                  <Select value={newEquipmentId} onValueChange={setNewEquipmentId}>
                    <SelectTrigger className="mt-2">
                      <SelectValue placeholder="Select new equipment to assign" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableUnits.length === 0 ? (
                        <SelectItem value="none" disabled>No available units</SelectItem>
                      ) : (
                        availableUnits.map(unit => (
                          <SelectItem key={unit.unit_id} value={unit.unit_id}>
                            {unit.item_name} - {unit.mac_address || unit.serial_number}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            
            <div>
              <Label htmlFor="completion-remarks">Completion Remarks / Notes</Label>
              <Textarea
                id="completion-remarks"
                placeholder="Enter any remarks or notes about the completed work..."
                value={completionRemarks}
                onChange={(e) => setCompletionRemarks(e.target.value)}
                rows={3}
                className="mt-2"
              />
              <p className="text-xs text-muted-foreground mt-1">Optional: Add details about what was done, issues encountered, etc.</p>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleteDialogOpen(false)}>Cancel</Button>
            <Button 
              className="bg-green-600 hover:bg-green-700" 
              onClick={() => handleCompleteJob(selectedJobOrder?.job_order_id)}
              disabled={submitting || 
                (selectedJobOrder?.type === 'Pull Out Modem' && !selectedEquipmentId) ||
                (selectedJobOrder?.type === 'Replace Modem' && (!selectedEquipmentId || !newEquipmentId))
              }
            >
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <CheckCircle className="h-4 w-4 mr-2" />
              Complete Job
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
