import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function ExpenseManagement() {
  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-heading font-bold">Expense Management</h2>
      <Card>
        <CardHeader>
          <CardTitle>Expenses</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Track business expenses and recurring costs</p>
        </CardContent>
      </Card>
    </div>
  );
}
