import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function CompanySettings() {
  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-heading font-bold">Company Settings</h2>
      <Card>
        <CardHeader>
          <CardTitle>Business Information</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Configure company details for receipts and statements</p>
        </CardContent>
      </Card>
    </div>
  );
}
