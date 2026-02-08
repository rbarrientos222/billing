import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FileSpreadsheet } from 'lucide-react';

export default function SOASettings() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-heading font-bold">SOA Setup</h2>
        <p className="text-muted-foreground mt-1">Configure Statement of Account templates</p>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            SOA Template Configuration
          </CardTitle>
          <CardDescription>Customize your statement of account layout and content</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="py-12 text-center text-muted-foreground">
            <FileSpreadsheet className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>SOA setup coming soon</p>
            <p className="text-sm mt-2">This feature will allow you to customize SOA templates and auto-email settings.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
