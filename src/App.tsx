import React from 'react';
import { AuthProvider, useAuth } from './AuthContext';
import { Login } from './components/Login';
import { UserHome } from './components/UserHome';
import { HelperHome } from './components/HelperHome';
import { AdminDashboard } from './components/AdminDashboard';
import { Loader2 } from 'lucide-react';

import { ErrorBoundary } from './components/ErrorBoundary';

const AppContent: React.FC = () => {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="animate-spin text-indigo-600" size={40} />
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  if (profile?.role === 'admin') {
    return <AdminDashboard />;
  }

  if (profile?.role === 'helper') {
    return <HelperHome />;
  }

  return <UserHome />;
};

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ErrorBoundary>
  );
}
