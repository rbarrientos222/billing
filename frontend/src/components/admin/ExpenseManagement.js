import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ExportButton, ImportButton } from '@/components/admin/ImportExport';
import { toast } from 'sonner';
import { 
  DollarSign, Plus, Search, Filter, X, Edit2, Trash2, 
  Calendar, RefreshCw, Tag, TrendingUp, Receipt, FolderPlus,
  BarChart3, PieChart, TrendingDown, ArrowUpRight, ArrowDownRight
} from 'lucide-react';
import { 
  AreaChart, Area, BarChart, Bar, PieChart as RechartsPie, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend 
} from 'recharts';

// Chart colors
const COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

export default function ExpenseManagement() {
  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [stats, setStats] = useState({});
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('expenses');
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterRecurring, setFilterRecurring] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  
  // Dialogs
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [showEditExpense, setShowEditExpense] = useState(false);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [showManageCategories, setShowManageCategories] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState(null);
  
  // Form state
  const [formData, setFormData] = useState({
    category: '',
    description: '',
    amount: '',
    expense_date: new Date().toISOString().split('T')[0],
    reference_number: '',
    is_recurring: false,
    recurring_type: ''
  });
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryDesc, setNewCategoryDesc] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [expensesRes, categoriesRes, statsRes, analyticsRes] = await Promise.all([
        axios.get('/expenses'),
        axios.get('/expense-categories'),
        axios.get('/expenses/stats'),
        axios.get('/expenses/analytics')
      ]);
      setExpenses(expensesRes.data);
      setCategories(categoriesRes.data);
      setStats(statsRes.data);
      setAnalytics(analyticsRes.data);
    } catch (error) {
      toast.error('Failed to load expenses');
    } finally {
      setLoading(false);
    }
  };

  const fetchExpenses = async () => {
    try {
      let url = '/expenses?';
      const params = new URLSearchParams();
      if (filterCategory && filterCategory !== 'all') params.append('category', filterCategory);
      if (filterRecurring === 'yes') params.append('is_recurring', 'true');
      if (filterRecurring === 'no') params.append('is_recurring', 'false');
      if (dateFrom) params.append('start_date', dateFrom);
      if (dateTo) params.append('end_date', dateTo);
      
      const response = await axios.get(`/expenses?${params.toString()}`);
      setExpenses(response.data);
    } catch (error) {
      toast.error('Failed to fetch expenses');
    }
  };

  const handleApplyFilters = () => {
    fetchExpenses();
  };

  const handleClearFilters = () => {
    setFilterCategory('all');
    setFilterRecurring('all');
    setDateFrom('');
    setDateTo('');
    setSearchTerm('');
    fetchData();
  };

  const handleAddExpense = async () => {
    if (!formData.category || !formData.description || !formData.amount) {
      toast.error('Please fill in all required fields');
      return;
    }
    
    setSubmitting(true);
    try {
      await axios.post('/expenses', {
        ...formData,
        amount: parseFloat(formData.amount),
        expense_date: new Date(formData.expense_date).toISOString()
      });
      toast.success('Expense added successfully');
      setShowAddExpense(false);
      resetForm();
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to add expense');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditExpense = async () => {
    if (!formData.category || !formData.description || !formData.amount) {
      toast.error('Please fill in all required fields');
      return;
    }
    
    setSubmitting(true);
    try {
      await axios.put(`/expenses/${selectedExpense.expense_id}`, {
        ...formData,
        amount: parseFloat(formData.amount),
        expense_date: new Date(formData.expense_date).toISOString()
      });
      toast.success('Expense updated successfully');
      setShowEditExpense(false);
      resetForm();
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update expense');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteExpense = async (expense) => {
    if (!window.confirm(`Delete expense "${expense.description}"?`)) return;
    
    try {
      await axios.delete(`/expenses/${expense.expense_id}`);
      toast.success('Expense deleted');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete expense');
    }
  };

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) {
      toast.error('Please enter a category name');
      return;
    }
    
    setSubmitting(true);
    try {
      await axios.post('/expense-categories', {
        name: newCategoryName.trim(),
        description: newCategoryDesc.trim()
      });
      toast.success('Category added');
      setNewCategoryName('');
      setNewCategoryDesc('');
      setShowAddCategory(false);
      const res = await axios.get('/expense-categories');
      setCategories(res.data);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to add category');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteCategory = async (category) => {
    if (category.is_preset) {
      toast.error('Cannot delete preset categories');
      return;
    }
    if (!window.confirm(`Delete category "${category.name}"?`)) return;
    
    try {
      await axios.delete(`/expense-categories/${category.category_id}`);
      toast.success('Category deleted');
      const res = await axios.get('/expense-categories');
      setCategories(res.data);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete category');
    }
  };

  const resetForm = () => {
    setFormData({
      category: '',
      description: '',
      amount: '',
      expense_date: new Date().toISOString().split('T')[0],
      reference_number: '',
      is_recurring: false,
      recurring_type: ''
    });
    setSelectedExpense(null);
  };

  const openEditDialog = (expense) => {
    setSelectedExpense(expense);
    setFormData({
      category: expense.category,
      description: expense.description,
      amount: expense.amount.toString(),
      expense_date: expense.expense_date ? expense.expense_date.split('T')[0] : new Date().toISOString().split('T')[0],
      reference_number: expense.reference_number || '',
      is_recurring: expense.is_recurring || false,
      recurring_type: expense.recurring_type || ''
    });
    setShowEditExpense(true);
  };

  // Filter expenses by search term
  const filteredExpenses = expenses.filter(exp => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      exp.description?.toLowerCase().includes(term) ||
      exp.category?.toLowerCase().includes(term) ||
      exp.reference_number?.toLowerCase().includes(term) ||
      exp.expense_id?.toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-heading font-bold">Expense Management</h2>
          <p className="text-muted-foreground mt-1 text-sm">Track and manage expenses</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ExportButton 
            endpoint="/export/expenses" 
            filename={`expenses_${new Date().toISOString().split('T')[0]}.csv`}
            filters={{ start_date: dateFrom, end_date: dateTo }}
            label="Export"
          />
          <ImportButton 
            endpoint="/import/expenses" 
            templateType="expenses"
            onSuccess={fetchExpenses}
            label="Import"
          />
          <Button variant="outline" size="sm" onClick={() => setShowManageCategories(true)} data-testid="manage-categories-btn" className="sm:size-default">
            <Tag className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Categories</span>
          </Button>
          <Button size="sm" onClick={() => { resetForm(); setShowAddExpense(true); }} data-testid="add-expense-btn" className="sm:size-default">
            <Plus className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Add Expense</span>
            <span className="sm:hidden">Add</span>
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card>
          <CardContent className="pt-4 sm:pt-6">
            <div className="flex items-center gap-2 sm:gap-4">
              <div className="p-2 sm:p-3 bg-red-100 dark:bg-red-900 rounded-lg">
                <DollarSign className="h-5 w-5 sm:h-6 sm:w-6 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">Total</p>
                <p className="text-lg sm:text-2xl font-bold text-red-600" data-testid="total-expenses">
                  ₱{(stats.total_expenses || 0).toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-4 sm:pt-6">
            <div className="flex items-center gap-2 sm:gap-4">
              <div className="p-2 sm:p-3 bg-orange-100 dark:bg-orange-900 rounded-lg">
                <Calendar className="h-5 w-5 sm:h-6 sm:w-6 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">This Month</p>
                <p className="text-lg sm:text-2xl font-bold" data-testid="monthly-expenses">
                  ₱{(stats.monthly_expenses || 0).toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-4 sm:pt-6">
            <div className="flex items-center gap-2 sm:gap-4">
              <div className="p-2 sm:p-3 bg-blue-100 dark:bg-blue-900 rounded-lg">
                <RefreshCw className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">Recurring</p>
                <p className="text-lg sm:text-2xl font-bold" data-testid="recurring-count">
                  {stats.recurring_count || 0}
                </p>
                <p className="text-[10px] sm:text-xs text-muted-foreground">
                  ₱{(stats.recurring_total || 0).toLocaleString()}/cycle
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-4 sm:pt-6">
            <div className="flex items-center gap-2 sm:gap-4">
              <div className="p-2 sm:p-3 bg-purple-100 dark:bg-purple-900 rounded-lg">
                <Tag className="h-5 w-5 sm:h-6 sm:w-6 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">Categories</p>
                <p className="text-lg sm:text-2xl font-bold" data-testid="categories-count">
                  {stats.categories_count || 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for Expenses and Reports */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="expenses" data-testid="expenses-tab" className="flex-1 sm:flex-none">
            <Receipt className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Expenses</span>
          </TabsTrigger>
          <TabsTrigger value="reports" data-testid="reports-tab" className="flex-1 sm:flex-none">
            <BarChart3 className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Reports & Analytics</span>
            <span className="sm:hidden">Reports</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="expenses" className="space-y-4">
          {/* Filters */}
          <Card>
        <CardContent className="pt-4 sm:pt-6">
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 sm:gap-3 items-end">
            <div className="col-span-2 sm:flex-1 sm:min-w-[200px]">
              <Label className="text-xs text-muted-foreground">Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search expenses..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                  data-testid="search-expenses"
                />
              </div>
            </div>
            
            <div>
              <Label className="text-xs text-muted-foreground">Category</Label>
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger data-testid="filter-category" className="w-full">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {categories.map(cat => (
                    <SelectItem key={cat.name} value={cat.name}>{cat.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label className="text-xs text-muted-foreground">Type</Label>
              <Select value={filterRecurring} onValueChange={setFilterRecurring}>
                <SelectTrigger data-testid="filter-recurring" className="w-full">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="recurring">Recurring</SelectItem>
                  <SelectItem value="onetime">One-time</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label className="text-xs text-muted-foreground">From</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                data-testid="filter-date-from"
                className="h-9"
              />
            </div>
            
            <div>
              <Label className="text-xs text-muted-foreground">To</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                data-testid="filter-date-to"
                className="h-9"
              />
            </div>
            
            <div className="col-span-2 sm:col-span-1 flex gap-2">
              <Button onClick={handleApplyFilters} size="sm" className="flex-1 sm:flex-none" data-testid="apply-filter-btn">
                <Filter className="h-4 w-4 sm:mr-1" />
                <span className="hidden sm:inline">Filter</span>
              </Button>
            
              {(filterCategory && filterCategory !== 'all') || (filterRecurring && filterRecurring !== 'all') || dateFrom || dateTo ? (
                <Button variant="ghost" size="sm" onClick={handleClearFilters} data-testid="clear-filters-btn">
                  <X className="h-4 w-4 sm:mr-1" />
                  <span className="hidden sm:inline">Clear</span>
                </Button>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Expenses Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Receipt className="h-5 w-5" />
            Expenses ({filteredExpenses.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="px-2 sm:px-6">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading expenses...</div>
          ) : filteredExpenses.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No expenses found. Click "Add Expense" to create one.
            </div>
          ) : (
            <>
              {/* Mobile View - Cards */}
              <div className="space-y-2 sm:hidden">
                {filteredExpenses.map((expense) => (
                  <div key={expense.expense_id} className="p-3 border rounded-lg bg-card">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-muted-foreground">
                          {expense.expense_date ? new Date(expense.expense_date).toLocaleDateString() : '-'}
                        </p>
                        <p className="font-medium text-sm line-clamp-2">{expense.description}</p>
                        {expense.reference_number && (
                          <p className="text-xs text-muted-foreground font-mono">Ref: {expense.reference_number}</p>
                        )}
                      </div>
                      <span className="font-bold text-red-600 shrink-0">₱{expense.amount?.toLocaleString()}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 mb-2">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">{expense.category}</Badge>
                      {expense.is_recurring ? (
                        <Badge className="bg-blue-600 text-[10px] px-1.5 py-0">
                          <RefreshCw className="h-2.5 w-2.5 mr-0.5" />
                          {expense.recurring_type || 'Recurring'}
                        </Badge>
                      ) : expense.reference_type === 'purchase' ? (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Purchase</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">One-time</Badge>
                      )}
                    </div>
                    <div className="flex items-center justify-end pt-2 border-t">
                      {expense.reference_type !== 'purchase' ? (
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEditDialog(expense)}>
                            <Edit2 className="h-4 w-4 text-amber-600" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleDeleteExpense(expense)}>
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Auto-created</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              
              {/* Desktop View - Table */}
              <div className="rounded-md border overflow-x-auto hidden sm:block">
                <table className="w-full text-sm" data-testid="expenses-table">
                  <thead className="bg-muted">
                    <tr>
                      <th className="text-left p-3">Date</th>
                      <th className="text-left p-3">Category</th>
                      <th className="text-left p-3">Description</th>
                      <th className="text-left p-3">Reference</th>
                      <th className="text-right p-3">Amount</th>
                      <th className="text-center p-3">Type</th>
                      <th className="text-center p-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredExpenses.map((expense) => (
                      <tr key={expense.expense_id} className="border-t hover:bg-muted/50">
                        <td className="p-3 whitespace-nowrap">
                          {expense.expense_date ? new Date(expense.expense_date).toLocaleDateString() : '-'}
                        </td>
                        <td className="p-3">
                          <Badge variant="outline">{expense.category}</Badge>
                        </td>
                        <td className="p-3 max-w-[250px] truncate" title={expense.description}>
                          {expense.description}
                        </td>
                        <td className="p-3 font-mono text-xs">
                          {expense.reference_number || '-'}
                        </td>
                        <td className="p-3 text-right font-bold text-red-600">
                          ₱{expense.amount?.toLocaleString()}
                        </td>
                        <td className="p-3 text-center">
                          {expense.is_recurring ? (
                            <Badge className="bg-blue-600">
                              <RefreshCw className="h-3 w-3 mr-1" />
                              {expense.recurring_type || 'Recurring'}
                            </Badge>
                          ) : expense.reference_type === 'purchase' ? (
                            <Badge variant="secondary">Purchase</Badge>
                          ) : (
                            <Badge variant="outline">One-time</Badge>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          {expense.reference_type !== 'purchase' ? (
                            <div className="flex justify-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openEditDialog(expense)}
                                data-testid={`edit-expense-${expense.expense_id}`}
                              >
                                <Edit2 className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteExpense(expense)}
                                className="text-red-600 hover:text-red-700"
                                data-testid={`delete-expense-${expense.expense_id}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">Auto-created</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
        </TabsContent>

        {/* Reports & Analytics Tab */}
        <TabsContent value="reports" className="space-y-6">
          {analytics ? (
            <>
              {/* Month Comparison Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">This Month</p>
                        <p className="text-2xl font-bold">₱{(analytics.month_comparison?.this_month || 0).toLocaleString()}</p>
                      </div>
                      <Calendar className="h-8 w-8 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Last Month</p>
                        <p className="text-2xl font-bold">₱{(analytics.month_comparison?.last_month || 0).toLocaleString()}</p>
                      </div>
                      <Calendar className="h-8 w-8 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Change</p>
                        <div className="flex items-center gap-2">
                          <p className={`text-2xl font-bold ${analytics.month_comparison?.change >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {analytics.month_comparison?.change >= 0 ? '+' : ''}₱{Math.abs(analytics.month_comparison?.change || 0).toLocaleString()}
                          </p>
                          {analytics.month_comparison?.change >= 0 ? (
                            <ArrowUpRight className="h-5 w-5 text-red-600" />
                          ) : (
                            <ArrowDownRight className="h-5 w-5 text-green-600" />
                          )}
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {analytics.month_comparison?.change_percentage >= 0 ? '+' : ''}{analytics.month_comparison?.change_percentage}% from last month
                    </p>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Avg Daily Expense</p>
                        <p className="text-2xl font-bold">₱{(analytics.avg_daily_expense || 0).toLocaleString()}</p>
                      </div>
                      <TrendingUp className="h-8 w-8 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Charts Row 1: Monthly Trend */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Monthly Expense Trend
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={analytics.monthly_trend || []}>
                        <defs>
                          <linearGradient id="expenseGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="month_short" className="text-xs" />
                        <YAxis 
                          tickFormatter={(value) => `₱${(value/1000).toFixed(0)}k`}
                          className="text-xs"
                        />
                        <Tooltip 
                          formatter={(value) => [`₱${value.toLocaleString()}`, 'Expenses']}
                          contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="amount" 
                          stroke="#ef4444" 
                          fillOpacity={1}
                          fill="url(#expenseGradient)"
                          strokeWidth={2}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Charts Row 2: Category Breakdown & Expense Types */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Category Breakdown Pie Chart */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <PieChart className="h-5 w-5" />
                      Expenses by Category
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <RechartsPie>
                          <Pie
                            data={analytics.category_breakdown || []}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={100}
                            paddingAngle={2}
                            dataKey="amount"
                            nameKey="category"
                            label={({ category, percentage }) => `${category} (${percentage}%)`}
                            labelLine={false}
                          >
                            {(analytics.category_breakdown || []).map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip 
                            formatter={(value) => `₱${value.toLocaleString()}`}
                            contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                          />
                        </RechartsPie>
                      </ResponsiveContainer>
                    </div>
                    {/* Legend */}
                    <div className="flex flex-wrap justify-center gap-3 mt-4">
                      {(analytics.category_breakdown || []).slice(0, 6).map((item, index) => (
                        <div key={item.category} className="flex items-center gap-2 text-sm">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                          <span>{item.category}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Expense Types & Sources */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <BarChart3 className="h-5 w-5" />
                      Expense Breakdown
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Recurring vs One-time */}
                    <div>
                      <p className="text-sm font-medium mb-3">By Type</p>
                      <div className="h-[100px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={analytics.expense_types || []} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis type="number" tickFormatter={(value) => `₱${(value/1000).toFixed(0)}k`} />
                            <YAxis type="category" dataKey="type" width={80} />
                            <Tooltip 
                              formatter={(value) => `₱${value.toLocaleString()}`}
                              contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                            />
                            <Bar dataKey="amount" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                    
                    {/* Manual vs Purchase */}
                    <div>
                      <p className="text-sm font-medium mb-3">By Source</p>
                      <div className="h-[100px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={analytics.expense_sources || []} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis type="number" tickFormatter={(value) => `₱${(value/1000).toFixed(0)}k`} />
                            <YAxis type="category" dataKey="source" width={100} />
                            <Tooltip 
                              formatter={(value) => `₱${value.toLocaleString()}`}
                              contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                            />
                            <Bar dataKey="amount" fill="#22c55e" radius={[0, 4, 4, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Top Expenses Table */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Top 5 Expenses
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="rounded-md border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted">
                        <tr>
                          <th className="text-left p-3">#</th>
                          <th className="text-left p-3">Description</th>
                          <th className="text-left p-3">Category</th>
                          <th className="text-left p-3">Date</th>
                          <th className="text-right p-3">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(analytics.top_expenses || []).map((expense, index) => (
                          <tr key={index} className="border-t">
                            <td className="p-3 font-bold text-muted-foreground">{index + 1}</td>
                            <td className="p-3">{expense.description}</td>
                            <td className="p-3"><Badge variant="outline">{expense.category}</Badge></td>
                            <td className="p-3 text-muted-foreground">{expense.date || '-'}</td>
                            <td className="p-3 text-right font-bold text-red-600">₱{expense.amount?.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              Loading analytics...
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Add Expense Dialog */}
      <Dialog open={showAddExpense} onOpenChange={setShowAddExpense}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Expense</DialogTitle>
            <DialogDescription>Record a business expense</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Category *</Label>
              <Select value={formData.category} onValueChange={(v) => setFormData({...formData, category: v})}>
                <SelectTrigger data-testid="expense-category-select">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map(cat => (
                    <SelectItem key={cat.category_id} value={cat.name}>{cat.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label>Description *</Label>
              <Input
                placeholder="e.g., Meralco bill for January"
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                data-testid="expense-description-input"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Amount *</Label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={formData.amount}
                  onChange={(e) => setFormData({...formData, amount: e.target.value})}
                  data-testid="expense-amount-input"
                />
              </div>
              <div>
                <Label>Date *</Label>
                <Input
                  type="date"
                  value={formData.expense_date}
                  onChange={(e) => setFormData({...formData, expense_date: e.target.value})}
                  data-testid="expense-date-input"
                />
              </div>
            </div>
            
            <div>
              <Label>Reference # (Receipt/Invoice)</Label>
              <Input
                placeholder="Optional reference number"
                value={formData.reference_number}
                onChange={(e) => setFormData({...formData, reference_number: e.target.value})}
                data-testid="expense-reference-input"
              />
            </div>
            
            <div className="flex items-center space-x-2">
              <Checkbox
                id="is_recurring"
                checked={formData.is_recurring}
                onCheckedChange={(checked) => setFormData({...formData, is_recurring: checked})}
                data-testid="expense-recurring-checkbox"
              />
              <Label htmlFor="is_recurring" className="cursor-pointer">This is a recurring expense</Label>
            </div>
            
            {formData.is_recurring && (
              <div>
                <Label>Recurring Type</Label>
                <Select value={formData.recurring_type} onValueChange={(v) => setFormData({...formData, recurring_type: v})}>
                  <SelectTrigger data-testid="expense-recurring-type-select">
                    <SelectValue placeholder="Select frequency" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddExpense(false)}>Cancel</Button>
            <Button onClick={handleAddExpense} disabled={submitting} data-testid="submit-expense-btn">
              {submitting ? 'Adding...' : 'Add Expense'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Expense Dialog */}
      <Dialog open={showEditExpense} onOpenChange={setShowEditExpense}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Expense</DialogTitle>
            <DialogDescription>Update expense details</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Category *</Label>
              <Select value={formData.category} onValueChange={(v) => setFormData({...formData, category: v})}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map(cat => (
                    <SelectItem key={cat.category_id} value={cat.name}>{cat.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label>Description *</Label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Amount *</Label>
                <Input
                  type="number"
                  value={formData.amount}
                  onChange={(e) => setFormData({...formData, amount: e.target.value})}
                />
              </div>
              <div>
                <Label>Date *</Label>
                <Input
                  type="date"
                  value={formData.expense_date}
                  onChange={(e) => setFormData({...formData, expense_date: e.target.value})}
                />
              </div>
            </div>
            
            <div>
              <Label>Reference #</Label>
              <Input
                value={formData.reference_number}
                onChange={(e) => setFormData({...formData, reference_number: e.target.value})}
              />
            </div>
            
            <div className="flex items-center space-x-2">
              <Checkbox
                id="edit_is_recurring"
                checked={formData.is_recurring}
                onCheckedChange={(checked) => setFormData({...formData, is_recurring: checked})}
              />
              <Label htmlFor="edit_is_recurring" className="cursor-pointer">Recurring expense</Label>
            </div>
            
            {formData.is_recurring && (
              <div>
                <Label>Recurring Type</Label>
                <Select value={formData.recurring_type} onValueChange={(v) => setFormData({...formData, recurring_type: v})}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select frequency" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditExpense(false)}>Cancel</Button>
            <Button onClick={handleEditExpense} disabled={submitting} data-testid="update-expense-btn">
              {submitting ? 'Updating...' : 'Update Expense'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manage Categories Dialog */}
      <Dialog open={showManageCategories} onOpenChange={setShowManageCategories}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Expense Categories</DialogTitle>
            <DialogDescription>Manage expense categories. Preset categories cannot be deleted.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 max-h-[400px] overflow-y-auto">
            {categories.map(cat => (
              <div key={cat.category_id} className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <p className="font-medium">{cat.name}</p>
                  {cat.description && (
                    <p className="text-xs text-muted-foreground">{cat.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {cat.is_preset ? (
                    <Badge variant="secondary">Preset</Badge>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteCategory(cat)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowManageCategories(false)}>Close</Button>
            <Button onClick={() => { setShowManageCategories(false); setShowAddCategory(true); }} data-testid="add-category-btn">
              <FolderPlus className="h-4 w-4 mr-2" />
              Add Category
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Category Dialog */}
      <Dialog open={showAddCategory} onOpenChange={setShowAddCategory}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Category</DialogTitle>
            <DialogDescription>Create a custom expense category</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Category Name *</Label>
              <Input
                placeholder="e.g., Transportation"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                data-testid="new-category-name-input"
              />
            </div>
            <div>
              <Label>Description</Label>
              <Input
                placeholder="Optional description"
                value={newCategoryDesc}
                onChange={(e) => setNewCategoryDesc(e.target.value)}
                data-testid="new-category-desc-input"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddCategory(false)}>Cancel</Button>
            <Button onClick={handleAddCategory} disabled={submitting} data-testid="submit-category-btn">
              {submitting ? 'Adding...' : 'Add Category'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
