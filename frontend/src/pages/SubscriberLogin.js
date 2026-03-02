import React, { useState } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Loader2, User, Wifi, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

const API = process.env.REACT_APP_BACKEND_URL;

export default function SubscriberLogin({ onLogin }) {
  const [accountNumber, setAccountNumber] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await axios.post(`${API}/api/subscriber/auth/login`, { 
        account_number: accountNumber.toUpperCase(), 
        password 
      });
      const { access_token, account_number: acctNo, name } = response.data;
      
      toast.success(`Welcome, ${name}!`);
      onLogin(access_token, 'subscriber', acctNo, name);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-blue-600 to-blue-800 p-12 flex-col justify-between relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 left-0 w-96 h-96 bg-blue-400 rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 right-0 w-96 h-96 bg-blue-300 rounded-full blur-3xl"></div>
        </div>
        
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-12">
            <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center">
              <User className="w-6 h-6 text-blue-600" />
            </div>
            <span className="text-2xl font-heading font-bold text-white">Subscriber Portal</span>
          </div>
          
          <h1 className="text-5xl font-heading font-bold text-white mb-6 leading-tight">
            Manage Your<br />Account Online
          </h1>
          <p className="text-lg text-blue-100 leading-relaxed max-w-md">
            View your bills, track payments, monitor job orders, and stay updated with your internet service status.
          </p>
        </div>

        <div className="relative z-10 space-y-4">
          <div className="flex items-center gap-3 text-blue-100">
            <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
              <Wifi className="w-4 h-4" />
            </div>
            <span>Check service status anytime</span>
          </div>
          <div className="flex items-center gap-3 text-blue-100">
            <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
              <User className="w-4 h-4" />
            </div>
            <span>View and manage your account</span>
          </div>
        </div>
      </div>

      {/* Right Side - Login Form */}
      <div className="w-full lg:w-1/2 flex flex-col items-center justify-center p-8 bg-background">
        <div className="w-full max-w-md">
          {/* Mobile Header */}
          <div className="lg:hidden mb-8 text-center">
            <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <User className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-heading font-bold">Subscriber Portal</h1>
            <p className="text-muted-foreground mt-1">Manage your account online</p>
          </div>

          <Card className="w-full border-border shadow-xl" data-testid="subscriber-login-card">
            <CardHeader className="space-y-1">
              <CardTitle className="text-3xl font-heading font-bold" data-testid="subscriber-login-title">
                Sign In
              </CardTitle>
              <CardDescription className="text-base">
                Enter your account number and password
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="accountNumber">Account Number</Label>
                  <Input
                    id="accountNumber"
                    data-testid="account-number-input"
                    type="text"
                    placeholder="e.g., SUB-00001"
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value.toUpperCase())}
                    required
                    className="h-11 uppercase"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    data-testid="subscriber-password-input"
                    type="password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="h-11"
                  />
                  <p className="text-xs text-muted-foreground">
                    Default password: Last 4 digits of your mobile number
                  </p>
                </div>
                <Button 
                  type="submit" 
                  className="w-full h-11 text-base font-medium bg-blue-600 hover:bg-blue-700" 
                  disabled={loading}
                  data-testid="subscriber-login-button"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    'Sign In'
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
