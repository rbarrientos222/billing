import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ExportButton, ImportButton } from '@/components/admin/ImportExport';
import { toast } from 'sonner';
import { 
  FileText, Calendar, DollarSign, Users, TrendingUp, 
  AlertCircle, Clock, Filter, Download, RefreshCw, Loader2,
  ChevronDown, ChevronUp, Upload, Database
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts';

const API = process.env.REACT_APP_BACKEND_URL;

const COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

export default function Reports() {
  const [activeTab, setActiveTab] = useState('receivables');
  const [loading, setLoading] = useState(false);
  
  // Receivables state
  const [receivables, setReceivables] = useState(null);
  const [expandedBucket, setExpandedBucket] = useState(null);
  
  // Collections state
  const [collections, setCollections] = useState(null);
  const [collectionStartDate, setCollectionStartDate] = useState('');
  const [collectionEndDate, setCollectionEndDate] = useState('');
  
  // Collections by Collector state
  const [collectorData, setCollectorData] = useState(null);
  const [collectorStartDate, setCollectorStartDate] = useState('');
  const [collectorEndDate, setCollectorEndDate] = useState('');

  useEffect(() => {
    if (activeTab === 'receivables') {
      fetchReceivables();
    } else if (activeTab === 'collections') {
      fetchCollections();
    } else if (activeTab === 'collectors') {
      fetchCollectorData();
    }
  }, [activeTab]);

  const fetchReceivables = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API}/api/reports/receivables`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setReceivables(response.data);
    } catch (error) {
      toast.error('Failed to fetch receivables report');
    } finally {
      setLoading(false);
    }
  };

  const fetchCollections = async () => {
    setLoading(true);
    try {
      let url = `${API}/api/reports/collections`;
      const params = new URLSearchParams();
      if (collectionStartDate) params.append('start_date', collectionStartDate);
      if (collectionEndDate) params.append('end_date', collectionEndDate);
      if (params.toString()) url += `?${params.toString()}`;
      
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setCollections(response.data);
    } catch (error) {
      toast.error('Failed to fetch collections report');
    } finally {
      setLoading(false);
    }
  };

  const fetchCollectorData = async () => {
    setLoading(true);
    try {
      let url = `${API}/api/reports/collections-by-collector`;
      const params = new URLSearchParams();
      if (collectorStartDate) params.append('start_date', collectorStartDate);
      if (collectorEndDate) params.append('end_date', collectorEndDate);
      if (params.toString()) url += `?${params.toString()}`;
      
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setCollectorData(response.data);
    } catch (error) {
      toast.error('Failed to fetch collector data');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2
    }).format(amount || 0);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-PH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getAgingColor = (bucket) => {
    switch (bucket) {
      case 'current': return 'bg-green-500';
      case '1_30_days': return 'bg-yellow-500';
      case '31_60_days': return 'bg-orange-500';
      case '61_90_days': return 'bg-red-500';
      case 'over_90_days': return 'bg-red-700';
      default: return 'bg-gray-500';
    }
  };

  const getAgingLabel = (bucket) => {
    switch (bucket) {
      case 'current': return 'Current (Not Yet Due)';
      case '1_30_days': return '1-30 Days Overdue';
      case '31_60_days': return '31-60 Days Overdue';
      case '61_90_days': return '61-90 Days Overdue';
      case 'over_90_days': return 'Over 90 Days Overdue';
      default: return bucket;
    }
  };

  // Prepare pie chart data for receivables
  const getReceivablesPieData = () => {
    if (!receivables) return [];
    const { aging } = receivables;
    return [
      { name: 'Current', value: aging.current.amount, color: '#22c55e' },
      { name: '1-30 Days', value: aging['1_30_days'].amount, color: '#eab308' },
      { name: '31-60 Days', value: aging['31_60_days'].amount, color: '#f97316' },
      { name: '61-90 Days', value: aging['61_90_days'].amount, color: '#ef4444' },
      { name: '>90 Days', value: aging.over_90_days.amount, color: '#b91c1c' },
    ].filter(d => d.value > 0);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Reports</h2>
          <p className="text-muted-foreground">Generate and view financial reports</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full h-auto flex flex-wrap gap-1 p-1">
          <TabsTrigger value="receivables" className="flex-1 min-w-[80px] flex items-center justify-center gap-1 px-2 py-2 text-xs sm:text-sm">
            <AlertCircle className="w-4 h-4 hidden sm:block" />
            <span>Receivables</span>
          </TabsTrigger>
          <TabsTrigger value="collections" className="flex-1 min-w-[80px] flex items-center justify-center gap-1 px-2 py-2 text-xs sm:text-sm">
            <DollarSign className="w-4 h-4 hidden sm:block" />
            <span>Collections</span>
          </TabsTrigger>
          <TabsTrigger value="collectors" className="flex-1 min-w-[80px] flex items-center justify-center gap-1 px-2 py-2 text-xs sm:text-sm">
            <Users className="w-4 h-4 hidden sm:block" />
            <span className="hidden sm:inline">By Collector</span>
            <span className="sm:hidden">Collector</span>
          </TabsTrigger>
          <TabsTrigger value="import" className="flex-1 min-w-[80px] flex items-center justify-center gap-1 px-2 py-2 text-xs sm:text-sm">
            <Database className="w-4 h-4 hidden sm:block" />
            <span className="hidden sm:inline">Data Import</span>
            <span className="sm:hidden">Import</span>
          </TabsTrigger>
        </TabsList>

        {/* RECEIVABLES TAB */}
        <TabsContent value="receivables" className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Accounts Receivable Aging Report</h3>
            <Button variant="outline" onClick={fetchReceivables} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : receivables ? (
            <>
              {/* Total Receivable Card */}
              <Card className="bg-gradient-to-r from-blue-600 to-blue-700 text-white">
                <CardContent className="pt-6">
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="text-center sm:text-left">
                      <p className="text-sm opacity-90">Total Receivables</p>
                      <p className="text-3xl sm:text-4xl font-bold mt-2">{formatCurrency(receivables.total_receivable)}</p>
                      <p className="text-xs opacity-75 mt-2">
                        As of {formatDate(receivables.generated_at)}
                      </p>
                    </div>
                    <div className="w-32 h-32 sm:w-48 sm:h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={getReceivablesPieData()}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={25}
                            outerRadius={50}
                          >
                            {getReceivablesPieData().map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Aging Buckets */}
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                {Object.entries(receivables.aging).map(([bucket, data]) => (
                  <Card 
                    key={bucket} 
                    className={`cursor-pointer transition-all hover:shadow-lg ${expandedBucket === bucket ? 'ring-2 ring-primary' : ''}`}
                    onClick={() => setExpandedBucket(expandedBucket === bucket ? null : bucket)}
                  >
                    <CardContent className="pt-4">
                      <div className={`w-3 h-3 rounded-full ${getAgingColor(bucket)} mb-2`}></div>
                      <p className="text-xs text-muted-foreground">{getAgingLabel(bucket)}</p>
                      <p className="text-xl font-bold mt-1">{formatCurrency(data.amount)}</p>
                      <p className="text-xs text-muted-foreground">{data.count} invoice(s)</p>
                      <div className="mt-2 flex items-center text-xs text-muted-foreground">
                        {expandedBucket === bucket ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        <span className="ml-1">Details</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Expanded Details */}
              {expandedBucket && receivables.aging[expandedBucket].invoices.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${getAgingColor(expandedBucket)}`}></div>
                      {getAgingLabel(expandedBucket)} - Details
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="rounded-md border overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted">
                          <tr>
                            <th className="px-4 py-2 text-left">Invoice #</th>
                            <th className="px-4 py-2 text-left">Subscriber</th>
                            <th className="px-4 py-2 text-left">Due Date</th>
                            <th className="px-4 py-2 text-left">Days Overdue</th>
                            <th className="px-4 py-2 text-right">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {receivables.aging[expandedBucket].invoices.slice(0, 20).map((inv, idx) => (
                            <tr key={idx} className="border-t">
                              <td className="px-4 py-2 font-mono text-xs">{inv.invoice_number}</td>
                              <td className="px-4 py-2">
                                <p className="font-medium">{inv.subscriber_name || inv.subscriber_id}</p>
                                <p className="text-xs text-muted-foreground">{inv.subscriber_id}</p>
                              </td>
                              <td className="px-4 py-2">{formatDate(inv.due_date)}</td>
                              <td className="px-4 py-2">
                                {inv.days_overdue > 0 ? (
                                  <Badge variant="destructive">{inv.days_overdue} days</Badge>
                                ) : (
                                  <Badge variant="secondary">Not due</Badge>
                                )}
                              </td>
                              <td className="px-4 py-2 text-right font-medium">{formatCurrency(inv.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {receivables.aging[expandedBucket].invoices.length > 20 && (
                        <p className="text-center text-sm text-muted-foreground py-2">
                          Showing 20 of {receivables.aging[expandedBucket].invoices.length} invoices
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <p className="text-center text-muted-foreground py-8">No data available</p>
          )}
        </TabsContent>

        {/* COLLECTIONS TAB */}
        <TabsContent value="collections" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <Filter className="w-5 h-5" />
                Filter Collections
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 sm:gap-4 items-end">
                <div className="space-y-1 sm:space-y-2">
                  <Label className="text-xs sm:text-sm">Start Date</Label>
                  <Input
                    type="date"
                    value={collectionStartDate}
                    onChange={(e) => setCollectionStartDate(e.target.value)}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1 sm:space-y-2">
                  <Label className="text-xs sm:text-sm">End Date</Label>
                  <Input
                    type="date"
                    value={collectionEndDate}
                    onChange={(e) => setCollectionEndDate(e.target.value)}
                    className="h-9"
                  />
                </div>
                <div className="col-span-2 flex flex-wrap gap-2 sm:gap-4">
                  <Button onClick={fetchCollections} disabled={loading} size="sm" className="flex-1 sm:flex-none">
                    {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1 sm:mr-2" />}
                    <span className="hidden sm:inline">Generate Report</span>
                    <span className="sm:hidden">Generate</span>
                  </Button>
                  <ExportButton 
                    endpoint="/export/payments" 
                    filename={`payments_${new Date().toISOString().split('T')[0]}.csv`}
                    filters={{ start_date: collectionStartDate, end_date: collectionEndDate }}
                    label="Export"
                  />
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => {
                      setCollectionStartDate('');
                      setCollectionEndDate('');
                    }}
                  >
                    Clear
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : collections ? (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="bg-gradient-to-r from-green-600 to-green-700 text-white">
                  <CardContent className="pt-6">
                    <DollarSign className="w-8 h-8 mb-2 opacity-80" />
                    <p className="text-sm opacity-90">Total Collections</p>
                    <p className="text-3xl font-bold mt-1">{formatCurrency(collections.total_amount)}</p>
                    <p className="text-xs opacity-75 mt-2">{collections.total_count} payment(s)</p>
                  </CardContent>
                </Card>

                {/* By Payment Mode */}
                {Object.entries(collections.by_mode || {}).map(([mode, data], idx) => (
                  <Card key={mode}>
                    <CardContent className="pt-6">
                      <p className="text-sm text-muted-foreground capitalize">{mode.replace('_', ' ')}</p>
                      <p className="text-2xl font-bold mt-1">{formatCurrency(data.amount)}</p>
                      <p className="text-xs text-muted-foreground">{data.count} payment(s)</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Payments Table */}
              <Card>
                <CardHeader>
                  <CardTitle>Payment Details</CardTitle>
                  <CardDescription>
                    {collectionStartDate || collectionEndDate 
                      ? `${collectionStartDate || 'Beginning'} to ${collectionEndDate || 'Now'}`
                      : "Today's collections"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {/* Mobile View - Cards */}
                  <div className="space-y-2 sm:hidden max-h-96 overflow-y-auto">
                    {collections.payments?.map((p, idx) => (
                      <div key={idx} className="p-3 border rounded-lg bg-card">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div>
                            <p className="font-mono text-xs text-muted-foreground">{p.or_number}</p>
                            <p className="font-medium text-sm mt-0.5">{p.subscriber_name}</p>
                            <p className="text-xs text-muted-foreground">{p.subscriber_id}</p>
                          </div>
                          <span className="font-bold text-green-600">{formatCurrency(p.total_amount || p.amount)}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs pt-2 border-t">
                          <Badge variant="outline" className="capitalize">
                            {p.payment_mode?.replace('_', ' ')}
                          </Badge>
                          <span className="text-muted-foreground">{formatDate(p.payment_date)}</span>
                          <span className="text-muted-foreground">by {p.received_by}</span>
                        </div>
                      </div>
                    ))}
                    {(!collections.payments || collections.payments.length === 0) && (
                      <p className="text-center text-muted-foreground py-8">No payments found</p>
                    )}
                  </div>
                  
                  {/* Desktop View - Table */}
                  <div className="rounded-md border overflow-x-auto max-h-96 overflow-y-auto hidden sm:block">
                    <table className="w-full text-sm">
                      <thead className="bg-muted sticky top-0">
                        <tr>
                          <th className="px-4 py-2 text-left">OR #</th>
                          <th className="px-4 py-2 text-left">Subscriber</th>
                          <th className="px-4 py-2 text-left">Date</th>
                          <th className="px-4 py-2 text-left">Mode</th>
                          <th className="px-4 py-2 text-left">Received By</th>
                          <th className="px-4 py-2 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {collections.payments?.map((p, idx) => (
                          <tr key={idx} className="border-t hover:bg-muted/50">
                            <td className="px-4 py-2 font-mono text-xs">{p.or_number}</td>
                            <td className="px-4 py-2">
                              <p className="font-medium">{p.subscriber_name}</p>
                              <p className="text-xs text-muted-foreground">{p.subscriber_id}</p>
                            </td>
                            <td className="px-4 py-2 text-xs">{formatDate(p.payment_date)}</td>
                            <td className="px-4 py-2">
                              <Badge variant="outline" className="capitalize">
                                {p.payment_mode?.replace('_', ' ')}
                              </Badge>
                            </td>
                            <td className="px-4 py-2">{p.received_by}</td>
                            <td className="px-4 py-2 text-right font-medium">{formatCurrency(p.total_amount || p.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {(!collections.payments || collections.payments.length === 0) && (
                      <p className="text-center text-muted-foreground py-8">No payments found</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <p className="text-center text-muted-foreground py-8">Click "Generate Report" to view collections</p>
          )}
        </TabsContent>

        {/* COLLECTIONS BY COLLECTOR TAB */}
        <TabsContent value="collectors" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Filter className="w-5 h-5" />
                Filter by Date Range
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4 items-end">
                <div className="space-y-2">
                  <Label>Start Date</Label>
                  <Input
                    type="date"
                    value={collectorStartDate}
                    onChange={(e) => setCollectorStartDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>End Date</Label>
                  <Input
                    type="date"
                    value={collectorEndDate}
                    onChange={(e) => setCollectorEndDate(e.target.value)}
                  />
                </div>
                <Button onClick={fetchCollectorData} disabled={loading}>
                  {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                  Generate Report
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setCollectorStartDate('');
                    setCollectorEndDate('');
                  }}
                >
                  Clear
                </Button>
              </div>
            </CardContent>
          </Card>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : collectorData ? (
            <>
              {/* Summary */}
              <Card className="bg-gradient-to-r from-purple-600 to-purple-700 text-white">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm opacity-90">Total Collections by All Collectors</p>
                      <p className="text-4xl font-bold mt-2">{formatCurrency(collectorData.total_amount)}</p>
                      <p className="text-xs opacity-75 mt-2">
                        {collectorData.total_count} payment(s) from {collectorData.collectors?.length || 0} collector(s)
                      </p>
                      <p className="text-xs opacity-75 mt-1">
                        {collectorStartDate || collectorEndDate 
                          ? `${collectorStartDate || 'Beginning'} to ${collectorEndDate || 'Now'}`
                          : "Current Month"}
                      </p>
                    </div>
                    <Users className="w-16 h-16 opacity-30" />
                  </div>
                </CardContent>
              </Card>

              {/* Bar Chart */}
              <Card>
                <CardHeader>
                  <CardTitle>Collections by Collector</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={collectorData.collectors} layout="vertical" margin={{ left: 80, right: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" tickFormatter={(value) => `₱${(value/1000).toFixed(0)}k`} />
                        <YAxis type="category" dataKey="name" width={80} />
                        <Tooltip 
                          formatter={(value) => formatCurrency(value)}
                          labelFormatter={(label) => `Collector: ${label}`}
                        />
                        <Bar dataKey="amount" name="Collection Amount" radius={[0, 4, 4, 0]}>
                          {collectorData.collectors?.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Collector Table */}
              <Card>
                <CardHeader>
                  <CardTitle>Collector Performance</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="rounded-md border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted">
                        <tr>
                          <th className="px-4 py-3 text-left">Rank</th>
                          <th className="px-4 py-3 text-left">Collector</th>
                          <th className="px-4 py-3 text-center">Payments</th>
                          <th className="px-4 py-3 text-right">Total Collection</th>
                          <th className="px-4 py-3 text-right">Share %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {collectorData.collectors?.map((c, idx) => (
                          <tr key={idx} className="border-t hover:bg-muted/50">
                            <td className="px-4 py-3">
                              <Badge variant={idx === 0 ? "default" : "outline"} className={idx === 0 ? "bg-yellow-500" : ""}>
                                #{idx + 1}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 font-medium">{c.name}</td>
                            <td className="px-4 py-3 text-center">{c.count}</td>
                            <td className="px-4 py-3 text-right font-bold">{formatCurrency(c.amount)}</td>
                            <td className="px-4 py-3 text-right text-muted-foreground">
                              {collectorData.total_amount > 0 
                                ? ((c.amount / collectorData.total_amount) * 100).toFixed(1) 
                                : 0}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {(!collectorData.collectors || collectorData.collectors.length === 0) && (
                      <p className="text-center text-muted-foreground py-8">No collector data found</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <p className="text-center text-muted-foreground py-8">Click "Generate Report" to view collector data</p>
          )}
        </TabsContent>

        {/* DATA IMPORT TAB */}
        <TabsContent value="import" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Invoices Import/Export */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Invoices
                </CardTitle>
                <CardDescription>
                  Import/Export invoice records for billing integration
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <ExportButton 
                    endpoint="/export/invoices" 
                    filename={`invoices_${new Date().toISOString().split('T')[0]}.csv`}
                    label="Export Invoices"
                  />
                  <ImportButton 
                    endpoint="/import/invoices" 
                    templateType="invoices"
                    label="Import Invoices"
                  />
                </div>
                <div className="text-xs text-muted-foreground space-y-1">
                  <p><strong>Export:</strong> Downloads all invoices as CSV</p>
                  <p><strong>Import:</strong> Creates/updates invoices from CSV</p>
                  <p><strong>Required fields:</strong> subscriber_id, amount</p>
                </div>
              </CardContent>
            </Card>

            {/* Payments Import/Export */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5" />
                  Payments
                </CardTitle>
                <CardDescription>
                  Import/Export payment records for historical data migration
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <ExportButton 
                    endpoint="/export/payments" 
                    filename={`payments_${new Date().toISOString().split('T')[0]}.csv`}
                    label="Export Payments"
                  />
                  <ImportButton 
                    endpoint="/import/payments" 
                    templateType="payments"
                    label="Import Payments"
                  />
                </div>
                <div className="text-xs text-muted-foreground space-y-1">
                  <p><strong>Export:</strong> Downloads all payments as CSV</p>
                  <p><strong>Import:</strong> Imports historical payment records</p>
                  <p><strong>Required fields:</strong> subscriber_id, total_amount</p>
                  <p className="text-amber-600"><strong>Note:</strong> Duplicate OR numbers are skipped</p>
                </div>
              </CardContent>
            </Card>

            {/* Subscribers Import/Export */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Subscribers
                </CardTitle>
                <CardDescription>
                  Import/Export subscriber records
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <ExportButton 
                    endpoint="/export/subscribers" 
                    filename={`subscribers_${new Date().toISOString().split('T')[0]}.csv`}
                    label="Export Subscribers"
                  />
                  <ImportButton 
                    endpoint="/import/subscribers" 
                    templateType="subscribers"
                    label="Import Subscribers"
                  />
                </div>
                <div className="text-xs text-muted-foreground space-y-1">
                  <p><strong>Export:</strong> Downloads all subscribers as CSV</p>
                  <p><strong>Import:</strong> Creates/updates subscriber accounts</p>
                  <p><strong>Note:</strong> New accounts get default portal password: 0000</p>
                </div>
              </CardContent>
            </Card>

            {/* Expenses Import/Export */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5" />
                  Expenses
                </CardTitle>
                <CardDescription>
                  Import/Export expense records
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <ExportButton 
                    endpoint="/export/expenses" 
                    filename={`expenses_${new Date().toISOString().split('T')[0]}.csv`}
                    label="Export Expenses"
                  />
                  <ImportButton 
                    endpoint="/import/expenses" 
                    templateType="expenses"
                    label="Import Expenses"
                  />
                </div>
                <div className="text-xs text-muted-foreground space-y-1">
                  <p><strong>Export:</strong> Downloads all expenses as CSV</p>
                  <p><strong>Import:</strong> Imports new expense records</p>
                  <p><strong>Required fields:</strong> date, amount, category</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Import Tips */}
          <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200">
            <CardContent className="pt-6">
              <h4 className="font-medium mb-2 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-blue-600" />
                Import Tips
              </h4>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li>Download the template first to see the required column format</li>
                <li>Leave account_number/invoice_number/or_number empty to auto-generate</li>
                <li>Dates should be in YYYY-MM-DD format</li>
                <li>For status fields, use: active/inactive, true/false, yes/no</li>
                <li>Existing records are updated, new records are created</li>
              </ul>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
