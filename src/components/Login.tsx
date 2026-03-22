import React, { useState } from 'react';
import { Zap, ShieldCheck, Clock, MapPin, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../AuthContext';

export const Login: React.FC = () => {
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const handleLogin = async () => {
    setError(null);
    setIsLoggingIn(true);
    try {
      await login();
    } catch (err: any) {
      if (err.code === 'auth/popup-closed-by-user') {
        setError('Sign-in popup was closed before completion. Please try again.');
      } else {
        setError(`Login failed: ${err.message || 'An unexpected error occurred'}. Please try again.`);
        console.error('Login error details:', err);
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-indigo-600 flex flex-col items-center justify-center p-8 text-white">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="mb-12 text-center"
      >
        <div className="w-24 h-24 bg-white text-indigo-600 rounded-[2rem] flex items-center justify-center shadow-2xl mx-auto mb-6">
          <Zap size={48} fill="currentColor" />
        </div>
        <h1 className="text-5xl font-black tracking-tighter mb-2 italic">DakDao</h1>
        <p className="text-indigo-100 font-medium">Help is just a call away</p>
      </motion.div>

      <div className="w-full max-w-sm space-y-4 mb-12">
        <div className="flex items-center gap-4 bg-white/10 p-4 rounded-2xl backdrop-blur-md">
          <div className="bg-white/20 p-2 rounded-lg">
            <Clock size={20} />
          </div>
          <p className="text-sm font-bold">30-Minute Service Guarantee</p>
        </div>
        <div className="flex items-center gap-4 bg-white/10 p-4 rounded-2xl backdrop-blur-md">
          <div className="bg-white/20 p-2 rounded-lg">
            <ShieldCheck size={20} />
          </div>
          <p className="text-sm font-bold">Verified & Trusted Helpers</p>
        </div>
        <div className="flex items-center gap-4 bg-white/10 p-4 rounded-2xl backdrop-blur-md">
          <div className="bg-white/20 p-2 rounded-lg">
            <MapPin size={20} />
          </div>
          <p className="text-sm font-bold">Real-time Location Tracking</p>
        </div>
      </div>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="w-full max-w-sm bg-red-500/20 border border-red-500/50 p-4 rounded-2xl mb-6 flex items-start gap-3"
          >
            <AlertCircle className="shrink-0 text-red-200" size={20} />
            <p className="text-sm font-medium text-red-100">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        onClick={handleLogin}
        disabled={isLoggingIn}
        className="w-full max-w-sm bg-white text-indigo-600 p-5 rounded-2xl font-black text-lg shadow-xl shadow-indigo-900/20 hover:bg-indigo-50 transition-colors flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-6 h-6" />
        {isLoggingIn ? 'Connecting...' : 'Continue with Google'}
      </button>

      <p className="mt-8 text-xs text-indigo-200 font-medium">
        By continuing, you agree to our Terms & Privacy Policy
      </p>
    </div>
  );
};
