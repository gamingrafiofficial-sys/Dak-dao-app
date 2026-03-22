import React, { useState, useEffect } from 'react';
import { Power, MapPin, DollarSign, Star, Bell, CheckCircle, XCircle, User, LogOut, Loader2, Zap, History, MessageSquare, ShieldCheck, ShieldAlert, Clock, BadgeCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth, handleFirestoreError, OperationType } from '../AuthContext';
import { collection, query, where, onSnapshot, doc, updateDoc, serverTimestamp, getDoc, setDoc, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { ServiceRequest } from '../types';
import { Chat } from './Chat';

export const HelperHome: React.FC = () => {
  const { user, profile, logout, updateRole } = useAuth();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'jobs' | 'chat' | 'profile'>('dashboard');
  const [selectedChatRequestId, setSelectedChatRequestId] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(false);

  useEffect(() => {
    if (profile?.isOnline !== undefined) {
      setIsOnline(profile.isOnline);
    }
  }, [profile?.isOnline]);
  const [pendingRequests, setPendingRequests] = useState<ServiceRequest[]>([]);
  const [activeJob, setActiveJob] = useState<ServiceRequest | null>(null);
  const [lastCancelledJob, setLastCancelledJob] = useState<ServiceRequest | null>(null);
  const [completedJobs, setCompletedJobs] = useState<ServiceRequest[]>([]);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isRequestingVerification, setIsRequestingVerification] = useState(false);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);

  useEffect(() => {
    if (navigator.geolocation && user && !profile?.location?.district) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          // Mock reverse geocoding for helper
          updateDoc(doc(db, 'users', user.uid), {
            location: {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              address: 'Dhanmondi, Dhaka',
              district: 'Dhaka',
              thana: 'Dhanmondi'
            }
          });
        },
        (error) => console.error('Error getting helper location:', error)
      );
    }
  }, [user, profile?.location?.district]);

  useEffect(() => {
    if (user && isOnline && profile?.location?.district && profile?.location?.thana) {
      // Listen for pending requests in helper's area
      const q = query(
        collection(db, 'requests'),
        where('status', '==', 'pending'),
        where('location.district', '==', profile.location.district),
        where('location.thana', '==', profile.location.thana)
      );
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const reqs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ServiceRequest));
        const sortedReqs = reqs.sort((a, b) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        setPendingRequests(sortedReqs);
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'requests');
      });
      return () => unsubscribe();
    } else {
      setPendingRequests([]);
    }
  }, [user, isOnline, profile?.location?.district, profile?.location?.thana]);

  useEffect(() => {
    if (user) {
      const q = query(
        collection(db, 'requests'),
        where('helperId', '==', user.uid),
        where('status', 'in', ['assigned', 'in-progress'])
      );
      const unsubscribe = onSnapshot(q, (snapshot) => {
        if (!snapshot.empty) {
          setActiveJob({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as ServiceRequest);
          setLastCancelledJob(null);
        } else {
          // If activeJob was not null but now it is, check if it was cancelled by user
          if (activeJob) {
            // We can fetch the doc to see if it was cancelled
            const checkCancel = async () => {
              try {
                const docSnap = await getDoc(doc(db, 'requests', activeJob.id));
                if (docSnap.exists()) {
                  const data = docSnap.data() as ServiceRequest;
                  if (data.status === 'cancelled' && data.cancelledBy === 'user') {
                    setLastCancelledJob({ id: docSnap.id, ...data });
                  }
                }
              } catch (e) {
                console.error('Error checking cancellation:', e);
              }
            };
            checkCancel();
          }
          setActiveJob(null);
        }
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'requests');
      });

      // Fetch completed and cancelled jobs for history
      const historyQuery = query(
        collection(db, 'requests'),
        where('helperId', '==', user.uid),
        where('status', 'in', ['completed', 'cancelled']),
        orderBy('createdAt', 'desc')
      );
      const unsubscribeHistory = onSnapshot(historyQuery, (snapshot) => {
        const reqs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ServiceRequest));
        setCompletedJobs(reqs);
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'requests');
      });

      return () => {
        unsubscribe();
        unsubscribeHistory();
      };
    }
  }, [user]);

  const toggleOnline = async () => {
    if (!user) return;
    setIsUpdating(true);
    try {
      const newStatus = !isOnline;
      await updateDoc(doc(db, 'users', user.uid), { isOnline: newStatus });
      setIsOnline(newStatus);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    } finally {
      setIsUpdating(false);
    }
  };

  const requestVerification = async () => {
    if (!user) return;
    setIsRequestingVerification(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        verificationStatus: 'pending'
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    } finally {
      setIsRequestingVerification(false);
    }
  };

  const acceptJob = async (requestId: string) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'requests', requestId), {
        helperId: user.uid,
        status: 'assigned',
        assignedAt: new Date().toISOString(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `requests/${requestId}`);
    }
  };

  const completeJob = async (requestId: string) => {
    try {
      await updateDoc(doc(db, 'requests', requestId), {
        status: 'completed',
        completedAt: new Date().toISOString(),
      });
      // Update earnings
      if (user && activeJob) {
        const earnings = (profile?.totalEarnings || 0) + (activeJob.estimatedCost || 0);
        await updateDoc(doc(db, 'users', user.uid), { totalEarnings: earnings });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `requests/${requestId}`);
    }
  };

  const cancelJob = async (requestId: string) => {
    setConfirmCancelId(null);
    try {
      await updateDoc(doc(db, 'requests', requestId), {
        status: 'cancelled',
        cancelledAt: new Date().toISOString(),
        cancelledBy: 'helper'
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `requests/${requestId}`);
    }
  };

  const renderDashboard = () => (
    <>
      {/* Earnings Card */}
      <div className="bg-indigo-600 p-6 rounded-3xl shadow-xl shadow-indigo-100 text-white mb-8">
        <div className="flex justify-between items-start mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <p className="text-indigo-100 text-xs font-bold uppercase tracking-widest">Total Earnings</p>
              {profile?.verified && (
                <div className="bg-white/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <BadgeCheck size={10} className="text-white" />
                  <span className="text-[8px] font-black uppercase tracking-tighter">Verified</span>
                </div>
              )}
            </div>
            <p className="text-3xl font-black">৳{profile?.totalEarnings || 0}</p>
          </div>
          <div className="bg-white/20 p-3 rounded-2xl backdrop-blur-md">
            <DollarSign size={24} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/10">
          <div>
            <p className="text-indigo-100 text-[10px] font-bold uppercase tracking-widest mb-1">Jobs Done</p>
            <p className="text-lg font-bold">12</p>
          </div>
          <div>
            <p className="text-indigo-100 text-[10px] font-bold uppercase tracking-widest mb-1">Rating</p>
            <div className="flex items-center gap-1">
              <p className="text-lg font-bold">{profile?.rating || 4.8}</p>
              <Star size={14} className="fill-yellow-400 text-yellow-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Online Toggle */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl ${isOnline ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-400'}`}>
            <Power size={20} />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900">{isOnline ? 'You are Online' : 'You are Offline'}</p>
            <p className="text-xs text-slate-500">
              {isOnline 
                ? `Ready in ${profile?.location?.thana || 'Detecting...'}, ${profile?.location?.district || ''}` 
                : 'Go online to see requests'}
            </p>
          </div>
        </div>
        <button
          disabled={isUpdating}
          onClick={toggleOnline}
          className={`w-14 h-8 rounded-full transition-colors relative ${isOnline ? 'bg-green-500' : 'bg-slate-200'}`}
        >
          <motion.div
            animate={{ x: isOnline ? 24 : 4 }}
            className="absolute top-1 w-6 h-6 bg-white rounded-full shadow-sm"
          />
        </button>
      </div>

      {/* Verification Status Card */}
      {!profile?.verified && (
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 mb-8">
          <div className="flex items-start gap-4">
            <div className={`p-3 rounded-2xl ${
              profile?.verificationStatus === 'pending' ? 'bg-amber-50 text-amber-600' : 
              profile?.verificationStatus === 'rejected' ? 'bg-red-50 text-red-600' : 'bg-indigo-50 text-indigo-600'
            }`}>
              {profile?.verificationStatus === 'pending' ? <Clock size={24} /> : 
               profile?.verificationStatus === 'rejected' ? <ShieldAlert size={24} /> : <ShieldCheck size={24} />}
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-bold text-slate-900">
                {profile?.verificationStatus === 'pending' ? 'Verification Pending' : 
                 profile?.verificationStatus === 'rejected' ? 'Verification Rejected' : 'Get Verified'}
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                {profile?.verificationStatus === 'pending' ? 'Our team is reviewing your profile. This usually takes 24-48 hours.' : 
                 profile?.verificationStatus === 'rejected' ? 'Your verification was not approved. Please contact support for details.' : 
                 'Verified helpers get more jobs and higher trust from customers.'}
              </p>
              {profile?.verificationStatus !== 'pending' && profile?.verificationStatus !== 'rejected' && (
                <button
                  disabled={isRequestingVerification}
                  onClick={requestVerification}
                  className="mt-4 bg-indigo-600 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-lg shadow-indigo-100 flex items-center gap-2"
                >
                  {isRequestingVerification ? <Loader2 size={14} className="animate-spin" /> : <BadgeCheck size={14} />}
                  Request Verification
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Cancellation Alert */}
      <AnimatePresence>
        {lastCancelledJob && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="mb-8 bg-red-50 border border-red-100 p-4 rounded-2xl flex items-start gap-3"
          >
            <div className="bg-red-100 text-red-600 p-2 rounded-xl">
              <ShieldAlert size={20} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-red-900">Job Cancelled by User</p>
              <p className="text-xs text-red-700 mt-1">
                The user has cancelled the "{lastCancelledJob.category}" request.
              </p>
            </div>
            <button 
              onClick={() => setLastCancelledJob(null)}
              className="text-red-400 hover:text-red-600"
            >
              <XCircle size={18} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Active Job */}
      {activeJob && (
        <section className="mb-10">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Current Job</h2>
          <div className="bg-white p-6 rounded-3xl shadow-md border-2 border-indigo-100">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center">
                  <Zap size={24} />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900 capitalize">{activeJob.category}</p>
                  <p className="text-xs text-slate-500">In Progress</p>
                </div>
              </div>
              <p className="text-lg font-black text-indigo-600">৳{activeJob.estimatedCost}</p>
            </div>
            <p className="text-sm text-slate-600 mb-4 italic">"{activeJob.description}"</p>
            {activeJob.workAddress && (
              <div className="flex items-center gap-3 mb-3 p-3 bg-indigo-50/50 border border-indigo-100 rounded-xl">
                <MapPin size={16} className="text-indigo-600" />
                <div>
                  <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">Work Address</p>
                  <p className="text-xs font-medium text-slate-700">{activeJob.workAddress}</p>
                </div>
              </div>
            )}
            <div className="flex items-center gap-3 mb-6 p-3 bg-slate-50 rounded-xl">
              <MapPin size={16} className="text-slate-400" />
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">General Area</p>
                <p className="text-xs font-medium text-slate-700">{activeJob.location.address}</p>
              </div>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={() => {
                    setSelectedChatRequestId(activeJob.id);
                    setActiveTab('chat');
                  }}
                  className="bg-slate-100 text-slate-700 p-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2"
                >
                  <MessageSquare size={16} />
                  Chat
                </button>
                <button
                  onClick={() => setConfirmCancelId(activeJob.id)}
                  className="bg-red-50 text-red-600 p-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2"
                >
                  <XCircle size={16} />
                  Cancel
                </button>
              </div>
              <button
                onClick={() => completeJob(activeJob.id)}
                className="w-full bg-indigo-600 text-white p-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-indigo-100"
              >
                <CheckCircle size={18} />
                Complete Job
              </button>
            </div>
          </div>
        </section>
      )}

      {/* New Requests */}
      {isOnline && !activeJob && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-900">Nearby Requests</h2>
            <span className="bg-indigo-100 text-indigo-600 text-[10px] font-bold px-2 py-1 rounded-full uppercase">Live</span>
          </div>
          <div className="space-y-4">
            {pendingRequests.length > 0 ? (
              pendingRequests.map((req) => (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  key={req.id}
                  className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-2">
                      {req.urgent && <Zap size={14} className="text-red-500 fill-current" />}
                      <p className="text-sm font-bold text-slate-900">৳{req.estimatedCost}</p>
                    </div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Just now</p>
                  </div>
                  <p className="text-sm text-slate-700 mb-2 line-clamp-2">"{req.description || 'No description provided'}"</p>
                  {req.workAddress && (
                    <div className="flex items-center gap-2 text-indigo-600 mb-3 bg-indigo-50 px-3 py-1.5 rounded-lg w-fit">
                      <MapPin size={12} className="fill-current" />
                      <span className="text-[10px] font-bold uppercase tracking-wider">Address: {req.workAddress}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-slate-500">
                      <MapPin size={14} />
                      <span className="text-xs font-medium">{req.location.address}</span>
                    </div>
                    <button
                      onClick={() => acceptJob(req.id)}
                      className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-lg shadow-indigo-100"
                    >
                      Accept
                    </button>
                  </div>
                </motion.div>
              ))
            ) : (
              <div className="bg-white p-10 rounded-3xl border border-dashed border-slate-200 flex flex-col items-center text-center">
                <Bell className="text-slate-300 mb-4" size={40} />
                <p className="text-sm font-bold text-slate-400">Waiting for new requests...</p>
                <p className="text-xs text-slate-300 mt-1">Keep the app open to receive jobs</p>
              </div>
            )}
          </div>
        </section>
      )}
    </>
  );

  const renderJobs = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-black text-slate-900 tracking-tight">Job History</h2>
        <span className="bg-slate-100 text-slate-500 text-[10px] font-bold px-2 py-1 rounded-full uppercase">{completedJobs.length} Total</span>
      </div>

      {completedJobs.length > 0 ? (
        <div className="space-y-4">
          {completedJobs.map((job) => (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              key={job.id}
              className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100"
            >
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-2">
                  <div className={`p-2 rounded-lg ${job.status === 'completed' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                    {job.status === 'completed' ? <CheckCircle size={18} /> : <XCircle size={18} />}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900 capitalize">{job.category}</p>
                    <p className="text-[10px] text-slate-400 font-medium">
                      {new Date(job.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-black text-slate-900">৳{job.estimatedCost}</p>
                  <span className={`text-[8px] font-black uppercase tracking-tighter px-1.5 py-0.5 rounded-md ${
                    job.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  }`}>
                    {job.status}
                  </span>
                </div>
              </div>
              <p className="text-xs text-slate-600 mb-2 line-clamp-2">"{job.description}"</p>
              {job.workAddress && (
                <div className="flex items-center gap-2 text-[10px] text-indigo-600 font-bold mb-2 bg-indigo-50 px-2 py-1 rounded-md w-fit">
                  <MapPin size={10} />
                  <span>{job.workAddress}</span>
                </div>
              )}
              <div className="flex items-center gap-2 text-[10px] text-slate-400">
                <MapPin size={12} />
                <span className="truncate">{job.location.address}</span>
              </div>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-3xl p-12 border border-slate-100 shadow-sm text-center">
          <History className="mx-auto text-slate-200 mb-4" size={64} />
          <p className="text-slate-500 font-bold">No completed jobs yet</p>
          <p className="text-xs text-slate-400 mt-1">Your history will appear here once you complete jobs.</p>
        </div>
      )}
    </div>
  );

  const renderChat = () => (
    <div className="space-y-6">
      <h2 className="text-2xl font-black text-slate-900 tracking-tight">Messages</h2>
      {activeJob ? (
        <div 
          onClick={() => setSelectedChatRequestId(activeJob.id)}
          className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4 cursor-pointer hover:bg-slate-50 transition-colors"
        >
          <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600">
            <User size={24} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-slate-900">Current Customer</p>
            <p className="text-xs text-slate-500 line-clamp-1">Active job: {activeJob.category}</p>
          </div>
          <div className="w-2 h-2 bg-indigo-600 rounded-full" />
        </div>
      ) : (
        <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm text-center">
          <MessageSquare className="mx-auto text-slate-300 mb-4" size={48} />
          <p className="text-slate-500 font-medium">No active chats.</p>
          <p className="text-xs text-slate-400 mt-1">Chats will appear here when you have an active job.</p>
        </div>
      )}
    </div>
  );

  const renderProfile = () => (
    <div className="space-y-8">
      <div className="text-center">
        <div className="w-24 h-24 rounded-3xl bg-indigo-100 text-indigo-600 flex items-center justify-center mx-auto mb-4 shadow-inner">
          {profile?.photoURL ? (
            <img src={profile.photoURL} alt={profile.displayName} className="w-full h-full rounded-3xl object-cover" />
          ) : (
            <User size={48} />
          )}
        </div>
        <h2 className="text-xl font-black text-slate-900">{profile?.displayName || 'Helper'}</h2>
        <p className="text-sm text-slate-500 font-medium">{profile?.email}</p>
      </div>

      <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 space-y-4">
        <div className="flex items-center justify-between p-3 hover:bg-slate-50 rounded-xl transition-colors cursor-pointer">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-100 rounded-lg text-slate-600">
              <User size={18} />
            </div>
            <span className="text-sm font-bold text-slate-700">Edit Profile</span>
          </div>
          <History size={16} className="text-slate-400 rotate-180" />
        </div>
        <div className="flex items-center justify-between p-3 hover:bg-slate-50 rounded-xl transition-colors cursor-pointer">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-100 rounded-lg text-slate-600">
              <ShieldCheck size={18} />
            </div>
            <span className="text-sm font-bold text-slate-700">Security Settings</span>
          </div>
          <History size={16} className="text-slate-400 rotate-180" />
        </div>
        <div onClick={logout} className="flex items-center justify-between p-3 hover:bg-red-50 rounded-xl transition-colors cursor-pointer group">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-lg text-red-600">
              <LogOut size={18} />
            </div>
            <span className="text-sm font-bold text-red-600">Logout</span>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <header className="bg-white px-6 py-4 shadow-sm flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <div className="bg-indigo-600 text-white p-2 rounded-lg">
            <Zap size={20} />
          </div>
          <h1 className="text-xl font-bold text-slate-900">DakDao Helper</h1>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => updateRole('user')} className="text-sm font-medium text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-full">
            Switch to User
          </button>
          <button onClick={logout} className="text-slate-500 hover:text-red-500 transition-colors">
            <LogOut size={20} />
          </button>
        </div>
      </header>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {confirmCancelId && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-sm rounded-3xl p-8 shadow-2xl text-center"
            >
              <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <XCircle size={32} />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">Cancel Job?</h3>
              <p className="text-sm text-slate-500 mb-8">Are you sure you want to cancel this job? This action cannot be undone.</p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setConfirmCancelId(null)}
                  className="flex-1 bg-slate-100 text-slate-900 p-4 rounded-2xl font-bold"
                >
                  No, Keep
                </button>
                <button 
                  onClick={() => cancelJob(confirmCancelId)}
                  className="flex-1 bg-red-600 text-white p-4 rounded-2xl font-bold shadow-lg shadow-red-100"
                >
                  Yes, Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <main className="px-6 py-6 max-w-2xl mx-auto">
        {activeTab === 'dashboard' && renderDashboard()}
        {activeTab === 'jobs' && renderJobs()}
        {activeTab === 'chat' && renderChat()}
        {activeTab === 'profile' && renderProfile()}
      </main>

      {/* Chat Overlay */}
      <AnimatePresence>
        {selectedChatRequestId && (
          <Chat 
            requestId={selectedChatRequestId} 
            onBack={() => setSelectedChatRequestId(null)} 
          />
        )}
      </AnimatePresence>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 px-8 py-4 flex justify-around items-center z-10">
        <button 
          onClick={() => setActiveTab('dashboard')}
          className={`flex flex-col items-center gap-1 ${activeTab === 'dashboard' ? 'text-indigo-600' : 'text-slate-400'}`}
        >
          <Zap size={24} />
          <span className="text-[10px] font-bold uppercase">Dashboard</span>
        </button>
        <button 
          onClick={() => setActiveTab('jobs')}
          className={`flex flex-col items-center gap-1 ${activeTab === 'jobs' ? 'text-indigo-600' : 'text-slate-400'}`}
        >
          <History size={24} />
          <span className="text-[10px] font-bold uppercase">Jobs</span>
        </button>
        <button 
          onClick={() => setActiveTab('chat')}
          className={`flex flex-col items-center gap-1 ${activeTab === 'chat' ? 'text-indigo-600' : 'text-slate-400'}`}
        >
          <MessageSquare size={24} />
          <span className="text-[10px] font-bold uppercase">Chat</span>
        </button>
        <button 
          onClick={() => setActiveTab('profile')}
          className={`flex flex-col items-center gap-1 ${activeTab === 'profile' ? 'text-indigo-600' : 'text-slate-400'}`}
        >
          <User size={24} />
          <span className="text-[10px] font-bold uppercase">Profile</span>
        </button>
      </nav>
    </div>
  );
};
