import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Percent, Save, Loader2 } from 'lucide-react';

export default function RebatesSettings() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-heading font-bold">Rebates & Discounts</h2>
        <p className="text-muted-foreground mt-1">Configure rebates and discount settings</p>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Percent className="h-5 w-5 text-primary" />
            Discount Configuration
          </CardTitle>
          <CardDescription>Set up discount rules and rebate percentages</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="py-12 text-center text-muted-foreground">
            <Percent className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Rebates configuration coming soon</p>
            <p className="text-sm mt-2">This feature will allow you to set up automatic discounts and rebates for subscribers.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
