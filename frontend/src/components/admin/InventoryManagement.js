import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function InventoryManagement() {
  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-heading font-bold">Inventory Management</h2>
      <Card>
        <CardHeader>
          <CardTitle>Inventory Items</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Inventory management module - Track equipment, materials, and bulk items</p>
        </CardContent>
      </Card>
    </div>
  );
}
