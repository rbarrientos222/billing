import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Plus, Edit2, Trash2, Wifi, Loader2, Users } from 'lucide-react';

export default function PPPoEProfileManagement() {
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [profileToDelete, setProfileToDelete] = useState(null);
  const [subscriberCounts, setSubscriberCounts] = useState({});

  const [formData, setFormData] = useState({
    name: '',
    rate_limit: '',
    description: '',
    is_active: true
  });

  useEffect(() => {
    fetchProfiles();
  }, []);

  const fetchProfiles = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/pppoe-profiles');
      setProfiles(response.data || []);
      
      // Fetch subscriber counts for each profile
      const counts = {};
      for (const profile of response.data || []) {
        try {
          const countRes = await axios.get(`/subscribers/count?pppoe_profile=${encodeURIComponent(profile.name)}`);
          counts[profile.name] = countRes.data.count || 0;
        } catch {
          counts[profile.name] = 0;
        }
      }
      setSubscriberCounts(counts);
    } catch (error) {
      toast.error('Failed to fetch PPPoE profiles');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (profile = null) => {
    if (profile) {
      setEditingProfile(profile);
      setFormData({
        name: profile.name,
        rate_limit: profile.rate_limit || '',
        description: profile.description || '',
        is_active: profile.is_active !== false
      });
    } else {
      setEditingProfile(null);
      setFormData({
        name: '',
        rate_limit: '',
        description: '',
        is_active: true
      });
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error('Profile name is required');
      return;
    }

    setSaving(true);
    try {
      if (editingProfile) {
        await axios.put(`/pppoe-profiles/${encodeURIComponent(editingProfile.name)}`, {
          rate_limit: formData.rate_limit,
          description: formData.description,
          is_active: formData.is_active
        });
        toast.success('Profile updated successfully');
      } else {
        await axios.post('/pppoe-profiles', formData);
        toast.success('Profile created successfully');
      }
      setDialogOpen(false);
      fetchProfiles();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!profileToDelete) return;
    
    try {
      await axios.delete(`/pppoe-profiles/${encodeURIComponent(profileToDelete.name)}`);
      toast.success('Profile deleted successfully');
      setDeleteConfirmOpen(false);
      setProfileToDelete(null);
      fetchProfiles();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete profile');
    }
  };

  const confirmDelete = (profile) => {
    setProfileToDelete(profile);
    setDeleteConfirmOpen(true);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Wifi className="h-5 w-5" />
              PPPoE Profiles
            </CardTitle>
            <CardDescription>
              Manage PPPoE profiles for subscriber assignment. These profiles are used when registering new subscribers.
            </CardDescription>
          </div>
          <Button onClick={() => handleOpenDialog()} data-testid="add-profile-btn">
            <Plus className="h-4 w-4 mr-2" />
            Add Profile
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : profiles.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Wifi className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No PPPoE profiles configured</p>
            <p className="text-sm mt-2">Add profiles to assign to subscribers during registration</p>
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Profile Name</TableHead>
                  <TableHead>Rate Limit</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Subscribers</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {profiles.map((profile) => (
                  <TableRow key={profile.name} data-testid={`profile-row-${profile.name}`}>
                    <TableCell className="font-medium">{profile.name}</TableCell>
                    <TableCell>
                      {profile.rate_limit ? (
                        <code className="text-xs bg-muted px-2 py-1 rounded">{profile.rate_limit}</code>
                      ) : (
                        <span className="text-muted-foreground text-sm">Not set</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {profile.description || <span className="text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Users className="h-3 w-3 text-muted-foreground" />
                        <span>{subscriberCounts[profile.name] || 0}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={profile.is_active ? "default" : "secondary"}>
                        {profile.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenDialog(profile)}
                          data-testid={`edit-profile-${profile.name}`}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => confirmDelete(profile)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          data-testid={`delete-profile-${profile.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Add/Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingProfile ? 'Edit PPPoE Profile' : 'Add PPPoE Profile'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Profile Name *</Label>
                <Input
                  id="name"
                  placeholder="e.g., 10Mbps, 20Mbps, Premium"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  disabled={!!editingProfile}
                  data-testid="profile-name-input"
                />
                {editingProfile && (
                  <p className="text-xs text-muted-foreground">Profile name cannot be changed</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="rate_limit">Rate Limit</Label>
                <Input
                  id="rate_limit"
                  placeholder="e.g., 10M/10M, 20M/5M"
                  value={formData.rate_limit}
                  onChange={(e) => setFormData({ ...formData, rate_limit: e.target.value })}
                  data-testid="profile-rate-limit-input"
                />
                <p className="text-xs text-muted-foreground">
                  Format: download/upload (e.g., 10M/10M for 10Mbps symmetric)
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  placeholder="Optional description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  data-testid="profile-description-input"
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Active Status</Label>
                  <p className="text-xs text-muted-foreground">
                    Inactive profiles won't appear in subscriber registration
                  </p>
                </div>
                <Switch
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                  data-testid="profile-active-switch"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving} data-testid="save-profile-btn">
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Profile'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Profile</DialogTitle>
            </DialogHeader>
            <p className="py-4">
              Are you sure you want to delete the profile "{profileToDelete?.name}"?
              {subscriberCounts[profileToDelete?.name] > 0 && (
                <span className="block mt-2 text-red-600 font-medium">
                  Warning: {subscriberCounts[profileToDelete?.name]} subscriber(s) are using this profile.
                </span>
              )}
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDelete} data-testid="confirm-delete-btn">
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
