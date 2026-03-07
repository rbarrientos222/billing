import React, { useState, useRef } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Download, Upload, FileSpreadsheet, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

const API = process.env.NODE_ENV === 'production' ? window.location.origin : process.env.REACT_APP_BACKEND_URL;

export function ExportButton({ endpoint, filename, label = "Export CSV", filters = {}, variant = "outline", size = "sm" }) {
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    try {
      // Build query string from filters
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.append(key, value);
      });
      
      const url = params.toString() ? `${endpoint}?${params.toString()}` : endpoint;
      
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        responseType: 'blob'
      });
      
      // Verify we got data
      if (!response.data || response.data.size === 0) {
        toast.error('No data to export');
        return;
      }
      
      const downloadFilename = filename || 'export.csv';
      
      // Create blob with BOM for Excel compatibility
      const BOM = new Uint8Array([0xEF, 0xBB, 0xBF]);
      const blob = new Blob([BOM, response.data], { type: 'text/csv;charset=utf-8;' });
      
      // Create object URL
      const blobUrl = window.URL.createObjectURL(blob);
      
      // Create and configure link
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = downloadFilename;
      link.style.visibility = 'hidden';
      link.style.position = 'absolute';
      link.style.left = '-9999px';
      
      // Add to DOM
      document.body.appendChild(link);
      
      // Trigger download
      link.click();
      
      // Cleanup
      setTimeout(() => {
        document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);
      }, 1000);
      
      toast.success(`Downloaded: ${downloadFilename}`);
    } catch (error) {
      console.error('Export error:', error);
      toast.error(error.response?.data?.detail || 'Failed to export data');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button variant={variant} size={size} onClick={handleExport} disabled={loading}>
      {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
      {label}
    </Button>
  );
}

export function ImportButton({ endpoint, templateType, onSuccess, label = "Import CSV" }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      if (!selectedFile.name.endsWith('.csv')) {
        toast.error('Please select a CSV file');
        return;
      }
      setFile(selectedFile);
      setResult(null);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const response = await axios.get(`/export/template/${templateType}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        responseType: 'blob'
      });
      
      const downloadFilename = `${templateType}_template.csv`;
      
      // Create blob with BOM for Excel compatibility
      const BOM = new Uint8Array([0xEF, 0xBB, 0xBF]);
      const blob = new Blob([BOM, response.data], { type: 'text/csv;charset=utf-8;' });
      
      // Create object URL
      const blobUrl = window.URL.createObjectURL(blob);
      
      // Create and configure link
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = downloadFilename;
      link.style.visibility = 'hidden';
      
      // Add to DOM and trigger
      document.body.appendChild(link);
      link.click();
      
      // Cleanup
      setTimeout(() => {
        document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);
      }, 1000);
      
      toast.success('Template downloaded');
    } catch (error) {
      toast.error('Failed to download template');
    }
  };

  const handleImport = async () => {
    if (!file) {
      toast.error('Please select a file first');
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await axios.post(endpoint, formData, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'multipart/form-data'
        }
      });

      setResult(response.data);
      toast.success(response.data.message);
      
      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      const errorMsg = error.response?.data?.detail || 'Import failed';
      toast.error(errorMsg);
      setResult({ error: errorMsg });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setOpen(false);
    setFile(null);
    setResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) handleClose();
      else setOpen(true);
    }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Upload className="w-4 h-4 mr-2" />
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5" />
            Import from CSV
          </DialogTitle>
          <DialogDescription>
            Upload a CSV file to import data. Download the template first to see the required format.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Download Template */}
          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <div>
              <p className="text-sm font-medium">Need a template?</p>
              <p className="text-xs text-muted-foreground">Download the CSV template with sample data</p>
            </div>
            <Button variant="secondary" size="sm" onClick={handleDownloadTemplate}>
              <Download className="w-4 h-4 mr-1" />
              Template
            </Button>
          </div>

          {/* File Upload */}
          <div className="space-y-2">
            <Label htmlFor="csv-file">Select CSV File</Label>
            <Input
              id="csv-file"
              type="file"
              accept=".csv"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="cursor-pointer"
            />
            {file && (
              <p className="text-sm text-muted-foreground">
                Selected: {file.name} ({(file.size / 1024).toFixed(1)} KB)
              </p>
            )}
          </div>

          {/* Result */}
          {result && (
            <Alert variant={result.error ? "destructive" : "default"}>
              {result.error ? (
                <AlertCircle className="h-4 w-4" />
              ) : (
                <CheckCircle className="h-4 w-4" />
              )}
              <AlertDescription>
                {result.error ? (
                  result.error
                ) : (
                  <div className="space-y-1">
                    <p>{result.message}</p>
                    {result.errors && result.errors.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs font-medium">Errors:</p>
                        <ul className="text-xs list-disc list-inside">
                          {result.errors.map((err, idx) => (
                            <li key={idx}>{err}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button onClick={handleImport} disabled={!file || loading}>
              {loading ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Importing...</>
              ) : (
                <><Upload className="w-4 h-4 mr-2" />Import</>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
