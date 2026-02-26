import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Search, Loader2, Key, RotateCcw, Shield, CheckCircle, XCircle, Eye, EyeOff } from 'lucide-react';
import { TablePagination } from '@/components/ui/table-pagination';

export default function SubscriberPortalSettings() {
  const [subscribers, setSubscribers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  
  // Dialog states
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [selectedSubscriber, setSelectedSubscriber] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  // Bulk selection
  const [selectedAccounts, setSelectedAccounts] = useState([]);

  useEffect(() => {
    fetchSubscribers();
  }, [currentPage, pageSize, searchTerm]);

  const fetchSubscribers = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`/admin/subscriber-portal/logins`, {
        params: { search: searchTerm, page: currentPage, limit: pageSize }
      });
      setSubscribers(response.data.subscribers);
      setTotalPages(response.data.pages);
      setTotalItems(response.data.total);
    } catch (error) {
      toast.error('Failed to load subscribers');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!selectedSubscriber) return;
    
    setSubmitting(true);
    try {
      if (newPassword) {
        // Set custom password
        await axios.post(`/admin/subscriber-portal/reset-password/${selectedSubscriber.account_number}`, {
          new_password: newPassword
        });
        toast.success(`Password updated for ${selectedSubscriber.account_number}`);
      } else {
        // Reset to default
        const response = await axios.post(`/admin/subscriber-portal/reset-to-default/${selectedSubscriber.account_number}`);
        toast.success(`Password reset to default: ${response.data.default_password}`);
      }
      setResetDialogOpen(false);
      setNewPassword('');
      fetchSubscribers();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to reset password');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBulkResetToDefault = async () => {
    if (selectedAccounts.length === 0) {
      toast.error('No accounts selected');
      return;
    }
    
    try {
      const response = await axios.post('/admin/subscriber-portal/bulk-reset', {
        account_numbers: selectedAccounts,
        action: 'reset_to_default'
      });
      toast.success(`Reset ${response.data.updated_count} account(s) to default password`);
      setSelectedAccounts([]);
      fetchSubscribers();
    } catch (error) {
      toast.error('Failed to bulk reset passwords');
    }
  };

  const toggleSelectAccount = (accountNumber) => {
    setSelectedAccounts(prev => 
      prev.includes(accountNumber) 
        ? prev.filter(a => a !== accountNumber)
        : [...prev, accountNumber]
    );
  };

  const toggleSelectAll = () => {
    if (selectedAccounts.length === subscribers.length) {
      setSelectedAccounts([]);
    } else {
      setSelectedAccounts(subscribers.map(s => s.account_number));
    }
  };

  const openResetDialog = (subscriber) => {
    setSelectedSubscriber(subscriber);
    setNewPassword('');
    setResetDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Subscriber Portal Settings</h1>
        <p className="text-muted-foreground">Manage subscriber login credentials for the portal</p>
      </div>

      {/* Info Card */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="pt-4">
          <div className="flex items-start gap-3">
            <Shield className="h-5 w-5 text-blue-600 mt-0.5" />
            <div>
              <p className="font-medium text-blue-900">Password Policy</p>
              <p className="text-sm text-blue-700">
                Default password is the <strong>last 4 digits of the subscriber's phone number</strong>. 
                If no valid phone number exists, the default is <strong>0000</strong>.
                You can set custom passwords for individual subscribers below.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle>Subscriber Logins</CardTitle>
              <CardDescription>{totalItems} total subscribers</CardDescription>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              {selectedAccounts.length > 0 && (
                <Button 
                  variant="outline" 
                  onClick={handleBulkResetToDefault}
                  className="text-amber-600 border-amber-600 hover:bg-amber-50"
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Reset Selected ({selectedAccounts.length}) to Default
                </Button>
              )}
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by account, name, phone..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="pl-8 w-full sm:w-64"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <input
                          type="checkbox"
                          checked={selectedAccounts.length === subscribers.length && subscribers.length > 0}
                          onChange={toggleSelectAll}
                          className="w-4 h-4"
                        />
                      </TableHead>
                      <TableHead>Account / Name</TableHead>
                      <TableHead className="hidden md:table-cell">Phone</TableHead>
                      <TableHead>Password Type</TableHead>
                      <TableHead>Login Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {subscribers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          No subscribers found
                        </TableCell>
                      </TableRow>
                    ) : (
                      subscribers.map((sub) => (
                        <TableRow key={sub.account_number}>
                          <TableCell>
                            <input
                              type="checkbox"
                              checked={selectedAccounts.includes(sub.account_number)}
                              onChange={() => toggleSelectAccount(sub.account_number)}
                              className="w-4 h-4"
                            />
                          </TableCell>
                          <TableCell>
                            <div>
                              <div className="font-mono text-xs text-muted-foreground">{sub.account_number}</div>
                              <div className="font-medium">{sub.first_name} {sub.last_name}</div>
                              <div className="md:hidden text-xs text-muted-foreground">{sub.phone || sub.mobile || 'No phone'}</div>
                            </div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            {sub.phone || sub.mobile || <span className="text-muted-foreground">-</span>}
                          </TableCell>
                          <TableCell>
                            {sub.has_custom_password ? (
                              <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-100">
                                <Key className="mr-1 h-3 w-3" />
                                Custom
                              </Badge>
                            ) : (
                              <div>
                                <Badge variant="outline" className="text-xs">
                                  Default
                                </Badge>
                                <div className="text-xs text-muted-foreground mt-1">
                                  PW: <code className="bg-gray-100 px-1 rounded">{sub.default_password}</code>
                                </div>
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            {sub.can_login ? (
                              <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
                                <CheckCircle className="mr-1 h-3 w-3" />
                                Can Login
                              </Badge>
                            ) : (
                              <Badge className="bg-red-100 text-red-700 hover:bg-red-100">
                                <XCircle className="mr-1 h-3 w-3" />
                                Invalid Phone
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openResetDialog(sub)}
                            >
                              <Key className="mr-1 h-3.5 w-3.5" />
                              <span className="hidden sm:inline">Reset PW</span>
                              <span className="sm:hidden">Reset</span>
                            </Button>
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
                totalItems={totalItems}
                pageSize={pageSize}
                onPageChange={setCurrentPage}
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  setCurrentPage(1);
                }}
              />
            </>
          )}
        </CardContent>
      </Card>

      {/* Reset Password Dialog */}
      <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Subscriber Password</DialogTitle>
            <DialogDescription>
              {selectedSubscriber && (
                <>
                  Reset password for <strong>{selectedSubscriber.account_number}</strong> ({selectedSubscriber.first_name} {selectedSubscriber.last_name})
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-sm text-amber-800">
                <strong>Current Status:</strong>{' '}
                {selectedSubscriber?.has_custom_password ? 'Custom password set' : `Default password: ${selectedSubscriber?.default_password}`}
              </p>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">New Password (leave empty to reset to default)</label>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password or leave empty"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1 h-7 w-7 p-0"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Minimum 4 characters for custom password
              </p>
            </div>
          </div>
          
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setResetDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleResetPassword}
              disabled={submitting || (newPassword && newPassword.length < 4)}
              className={newPassword ? 'bg-purple-600 hover:bg-purple-700' : 'bg-amber-600 hover:bg-amber-700'}
            >
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {newPassword ? 'Set Custom Password' : 'Reset to Default'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
