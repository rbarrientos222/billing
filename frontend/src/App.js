import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import axios from 'axios';
import '@/App.css';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';

// Pages
import LoginPage from '@/pages/LoginPage';
import SubscriberLogin from '@/pages/SubscriberLogin';
import AdminDashboard from '@/pages/AdminDashboard';
import CashierDashboard from '@/pages/CashierDashboard';
import TechnicianDashboard from '@/pages/TechnicianDashboard';
import SubscriberPortal from '@/pages/SubscriberPortal';
import BillingDashboard from '@/pages/BillingDashboard';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Setup axios defaults
axios.defaults.baseURL = API;
axios.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.clear();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const role = localStorage.getItem('role');
    const username = localStorage.getItem('username');
    
    if (token && role && username) {
      setUser({ token, role, username });
    }
    setLoading(false);
  }, []);

  const handleLogin = (token, role, username, name = '') => {
    localStorage.setItem('token', token);
    localStorage.setItem('role', role);
    localStorage.setItem('username', username);
    if (name) localStorage.setItem('name', name);
    setUser({ token, role, username, name });
  };

  const handleSubscriberLogin = (token, role, accountNumber, name) => {
    localStorage.setItem('token', token);
    localStorage.setItem('role', role);
    localStorage.setItem('username', accountNumber);
    localStorage.setItem('name', name);
    setUser({ token, role, username: accountNumber, name });
  };

  const handleLogout = () => {
    localStorage.clear();
    setUser(null);
    toast.success('Logged out successfully');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-lg text-muted-foreground">Loading...</div>
      </div>
    );
  }

  const ProtectedRoute = ({ children, allowedRoles }) => {
    if (!user) {
      return <Navigate to="/login" replace />;
    }
    if (allowedRoles && !allowedRoles.includes(user.role)) {
      toast.error('Access denied');
      return <Navigate to="/login" replace />;
    }
    return children;
  };

  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={!user ? <LoginPage onLogin={handleLogin} /> : <Navigate to="/" replace />} />
          <Route path="/subscriber/login" element={!user ? <SubscriberLogin onLogin={handleSubscriberLogin} /> : <Navigate to="/subscriber" replace />} />
          
          <Route path="/" element={
            <ProtectedRoute>
              {user?.role === 'admin' && <Navigate to="/admin" replace />}
              {user?.role === 'cashier' && <Navigate to="/cashier" replace />}
              {user?.role === 'tech' && <Navigate to="/technician" replace />}
              {user?.role === 'billing' && <Navigate to="/billing" replace />}
              {(user?.role === 'user' || user?.role === 'subscriber') && <Navigate to="/subscriber" replace />}
            </ProtectedRoute>
          } />
          
          <Route path="/admin/*" element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AdminDashboard user={user} onLogout={handleLogout} />
            </ProtectedRoute>
          } />
          
          <Route path="/cashier/*" element={
            <ProtectedRoute allowedRoles={['cashier', 'admin']}>
              <CashierDashboard user={user} onLogout={handleLogout} />
            </ProtectedRoute>
          } />
          
          <Route path="/technician/*" element={
            <ProtectedRoute allowedRoles={['tech', 'admin']}>
              <TechnicianDashboard user={user} onLogout={handleLogout} />
            </ProtectedRoute>
          } />
          
          <Route path="/billing/*" element={
            <ProtectedRoute allowedRoles={['billing', 'admin']}>
              <BillingDashboard user={user} onLogout={handleLogout} />
            </ProtectedRoute>
          } />
          
          <Route path="/subscriber/*" element={
            <ProtectedRoute allowedRoles={['user', 'admin', 'subscriber']}>
              <SubscriberPortal user={user} onLogout={handleLogout} />
            </ProtectedRoute>
          } />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-right" richColors />
    </div>
  );
}

export default App;