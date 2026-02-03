import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LogOut, User } from 'lucide-react';

export default function SubscriberPortal({ user, onLogout }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b border-border h-16 flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
            <User className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-heading font-bold" data-testid="subscriber-portal-title">Subscriber Portal</h1>
            <p className="text-xs text-muted-foreground">{user.username}</p>
          </div>
        </div>
        <Button variant="outline" onClick={onLogout}>
          <LogOut className="h-4 w-4 mr-2" />
          Logout
        </Button>
      </header>

      <main className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>My Account</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">View payments, job orders, and account history</p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
