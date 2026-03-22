import React, { useState, useEffect } from 'react';
import { ShieldCheck, ShieldAlert, User, CheckCircle, XCircle, Loader2, Zap, LogOut, Search, BadgeCheck, Users, Clock, CheckCircle2, History, DollarSign, MapPin, Briefcase } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth, handleFirestoreError, OperationType } from '../AuthContext';
import { collection, query, where, onSnapshot, doc, updateDoc, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile, ServiceRequest } from '../types';

type AdminTab = 'all' | 'pending' | 'verified' | 'live' | 'work';

export const AdminDashboard: React.FC = () => {
  const { user, profile, logout } = useAuth();
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [completedRequests, setCompletedRequests] = useState<ServiceRequest[]>([]);
  const [liveRequests, setLiveRequests] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AdminTab>('all');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (user && profile?.role === 'admin') {
      // Listen to all users
      const usersQuery = query(collection(db, 'users'));
      const unsubscribeUsers = onSnapshot(usersQuery, (snapshot) => {
        const users = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile));
        setAllUsers(users);
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'users');
      });

      // Listen to completed requests
      const completedQuery = query(
        collection(db, 'requests'),
        where('status', '==', 'completed'),
        orderBy('completedAt', 'desc')
      );
      const unsubscribeCompleted = onSnapshot(completedQuery, (snapshot) => {
        const reqs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ServiceRequest));
        setCompletedRequests(reqs);
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'requests');
      });

      // Listen to live requests (pending, assigned, in-progress)
      const liveQuery = query(
        collection(db, 'requests'),
        where('status', 'in', ['pending', 'assigned', 'in-progress']),
        orderBy('createdAt', 'desc')
      );
      const unsubscribeLive = onSnapshot(liveQuery, (snapshot) => {
        const reqs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ServiceRequest));
        setLiveRequests(reqs);
        setLoading(false);
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'requests');
        setLoading(false);
      });

      return () => {
        unsubscribeUsers();
        unsubscribeCompleted();
        unsubscribeLive();
      };
    }
  }, [user, profile?.role]);

  const handleVerification = async (userId: string, status: 'approved' | 'rejected' | 'none') => {
    setProcessingId(userId);
    try {
      await updateDoc(doc(db, 'users', userId), {
        verificationStatus: status,
        verified: status === 'approved'
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`);
    } finally {
      setProcessingId(null);
    }
  };

  const filteredUsers = allUsers.filter(u => {
    const matchesSearch = (u.displayName?.toLowerCase() || '').includes(searchTerm.toLowerCase()) || 
                         (u.email?.toLowerCase() || '').includes(searchTerm.toLowerCase());
    
    if (activeTab === 'pending') return matchesSearch && u.verificationStatus === 'pending';
    if (activeTab === 'verified') return matchesSearch && u.verified === true;
    return matchesSearch;
  });

  const stats = {
    totalUsers: allUsers.length,
    pendingUsers: allUsers.filter(u => u.verificationStatus === 'pending').length,
    verifiedUsers: allUsers.filter(u => u.verified).length,
    completedWork: completedRequests.length,
    totalRevenue: completedRequests.reduce((sum, req) => sum + (req.estimatedCost || 0), 0)
  };

  const renderUserTable = (users: UserProfile[]) => (
    <div className="overflow-x-auto bg-white rounded-2xl border border-slate-100 shadow-sm mb-24">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-100">
            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">User</th>
            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Role</th>
            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {users.length > 0 ? (
            users.map((u) => (
              <tr key={u.uid} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-100 overflow-hidden flex-shrink-0">
                      {u.photoURL ? (
                        <img src={u.photoURL} alt={u.displayName || ''} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-400">
                          <User size={20} />
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-1">
                        <p className="text-sm font-bold text-slate-900">{u.displayName || 'Anonymous'}</p>
                        {u.verified && <BadgeCheck size={14} className="text-blue-500 fill-blue-50" />}
                      </div>
                      <p className="text-xs text-slate-500">{u.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter ${
                    u.role === 'helper' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-700'
                  }`}>
                    {u.role}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    {u.verificationStatus === 'pending' ? (
                      <span className="flex items-center gap-1 text-amber-600 text-xs font-bold">
                        <Clock size={12} /> Pending
                      </span>
                    ) : u.verified ? (
                      <span className="flex items-center gap-1 text-green-600 text-xs font-bold">
                        <CheckCircle2 size={12} /> Verified
                      </span>
                    ) : (
                      <span className="text-slate-400 text-xs font-bold">Standard</span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4">
                  {u.verificationStatus === 'pending' ? (
                    <div className="flex items-center gap-2">
                      <button
                        disabled={processingId === u.uid}
                        onClick={() => handleVerification(u.uid, 'approved')}
                        className="p-2 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition-colors"
                        title="Approve"
                      >
                        {processingId === u.uid ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                      </button>
                      <button
                        disabled={processingId === u.uid}
                        onClick={() => handleVerification(u.uid, 'rejected')}
                        className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                        title="Reject"
                      >
                        <XCircle size={16} />
                      </button>
                    </div>
                  ) : (
                    <button 
                      disabled={processingId === u.uid}
                      onClick={() => handleVerification(u.uid, u.verified ? 'none' : 'approved')}
                      className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-2 ${
                        u.verified 
                        ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' 
                        : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'
                      }`}
                    >
                      {processingId === u.uid ? <Loader2 size={12} className="animate-spin" /> : (u.verified ? 'Revoke' : 'Verify')}
                    </button>
                  )}
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={4} className="px-6 py-12 text-center">
                <div className="flex flex-col items-center text-slate-400">
                  <Users size={40} className="mb-2 opacity-20" />
                  <p className="text-sm font-bold">No users found</p>
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );

  const renderLiveWorkTable = () => (
    <div className="space-y-4 mb-24">
      {liveRequests.length > 0 ? (
        liveRequests.map((req) => (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            key={req.id}
            className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100"
          >
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl ${
                  req.status === 'pending' ? 'bg-amber-50 text-amber-600' : 
                  req.status === 'assigned' ? 'bg-blue-50 text-blue-600' : 
                  'bg-indigo-50 text-indigo-600'
                }`}>
                  <Zap size={20} className={req.status === 'in-progress' ? 'animate-pulse' : ''} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-slate-900">{req.category}</p>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-tighter ${
                      req.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                      req.status === 'assigned' ? 'bg-blue-100 text-blue-700' :
                      'bg-indigo-100 text-indigo-700'
                    }`}>
                      {req.status}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 font-medium">Requested {new Date(req.createdAt).toLocaleString()}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-black text-slate-900">৳{req.estimatedCost}</p>
                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-tighter">Budget</p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-3 mb-4">
              <p className="text-xs text-slate-600 line-clamp-2 italic">"{req.description}"</p>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-50">
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase mb-2">Customer</p>
                {(() => {
                  const customer = allUsers.find(u => u.uid === req.userId);
                  return (
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-slate-100 overflow-hidden flex items-center justify-center text-slate-400">
                        {customer?.photoURL ? (
                          <img src={customer?.photoURL} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <User size={12} />
                        )}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-slate-700">{customer?.displayName || 'Unknown'}</span>
                        <span className="text-[8px] text-slate-400 leading-none">{customer?.email}</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase mb-2">Assigned Helper</p>
                {req.helperId ? (() => {
                  const helper = allUsers.find(u => u.uid === req.helperId);
                  return (
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-indigo-100 overflow-hidden flex items-center justify-center text-indigo-600">
                        {helper?.photoURL ? (
                          <img src={helper.photoURL} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <User size={12} />
                        )}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-slate-700">{helper?.displayName || 'Unknown Helper'}</span>
                        <span className="text-[8px] text-slate-400 leading-none">{helper?.email}</span>
                      </div>
                    </div>
                  );
                })() : (
                  <span className="text-[10px] text-slate-400 italic">Waiting for helper...</span>
                )}
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-slate-50">
              <p className="text-[10px] text-slate-400 font-bold uppercase mb-2">Location</p>
              <div className="flex items-start gap-1">
                <MapPin size={12} className="text-slate-400 mt-0.5" />
                <span className="text-[10px] text-slate-600 font-medium leading-tight">{req.location.address}</span>
              </div>
            </div>
          </motion.div>
        ))
      ) : (
        <div className="bg-white p-12 rounded-3xl border border-dashed border-slate-200 flex flex-col items-center text-center">
          <Zap className="text-slate-200 mb-4" size={48} />
          <p className="text-sm font-bold text-slate-400">No live requests at the moment</p>
        </div>
      )}
    </div>
  );

  const renderWorkTable = () => (
    <div className="space-y-4 mb-24">
      {completedRequests.length > 0 ? (
        completedRequests.map((req) => (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            key={req.id}
            className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100"
          >
            <div className="flex justify-between items-start mb-3">
              <div className="flex items-center gap-2">
                <div className="bg-green-50 text-green-600 p-2 rounded-lg">
                  <Briefcase size={18} />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900">{req.category}</p>
                  <p className="text-[10px] text-slate-400 font-medium">Completed {new Date(req.completedAt || '').toLocaleDateString()}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-black text-indigo-600">৳{req.estimatedCost}</p>
                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-tighter">Revenue</p>
              </div>
            </div>
            <p className="text-xs text-slate-600 mb-4 line-clamp-2">{req.description}</p>
            <div className="flex items-center justify-between pt-3 border-t border-slate-50">
              <div className="flex items-center gap-2">
                <MapPin size={12} className="text-slate-400" />
                <span className="text-[10px] text-slate-500 font-medium">{req.location.address}</span>
              </div>
              <div className="flex items-center gap-1">
                <CheckCircle2 size={12} className="text-green-500" />
                <span className="text-[10px] font-bold text-green-600 uppercase">Done</span>
              </div>
            </div>
          </motion.div>
        ))
      ) : (
        <div className="bg-white p-12 rounded-3xl border border-dashed border-slate-200 flex flex-col items-center text-center">
          <History className="text-slate-200 mb-4" size={48} />
          <p className="text-sm font-bold text-slate-400">No completed work yet</p>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <header className="bg-white px-6 py-4 shadow-sm flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <div className="bg-indigo-600 text-white p-2 rounded-lg">
            <ShieldCheck size={20} />
          </div>
          <h1 className="text-xl font-bold text-slate-900">DakDao Admin</h1>
        </div>
        <button onClick={logout} className="text-slate-500 hover:text-red-500 transition-colors">
          <LogOut size={20} />
        </button>
      </header>

      <main className="px-6 py-6 max-w-6xl mx-auto">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1">Total Users</p>
            <p className="text-2xl font-black text-slate-900">{stats.totalUsers}</p>
          </div>
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
            <p className="text-amber-500 text-[10px] font-bold uppercase tracking-widest mb-1">Pending</p>
            <p className="text-2xl font-black text-slate-900">{stats.pendingUsers}</p>
          </div>
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
            <p className="text-blue-500 text-[10px] font-bold uppercase tracking-widest mb-1">Verified</p>
            <p className="text-2xl font-black text-slate-900">{stats.verifiedUsers}</p>
          </div>
          <div className="bg-indigo-600 p-6 rounded-3xl shadow-lg shadow-indigo-100 text-white">
            <p className="text-indigo-100 text-[10px] font-bold uppercase tracking-widest mb-1">Total Revenue</p>
            <p className="text-2xl font-black">৳{stats.totalRevenue}</p>
          </div>
        </div>

        {/* Search (only for users) */}
        {activeTab !== 'work' && (
          <div className="relative mb-6">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Search users..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-white rounded-2xl border border-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm font-medium"
            />
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="animate-spin text-indigo-600" size={40} />
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              {activeTab === 'live' ? renderLiveWorkTable() : activeTab === 'work' ? renderWorkTable() : renderUserTable(filteredUsers)}
            </motion.div>
          </AnimatePresence>
        )}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 px-6 py-3 z-50">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <button
            onClick={() => setActiveTab('all')}
            className={`flex flex-col items-center gap-1 transition-colors ${
              activeTab === 'all' ? 'text-indigo-600' : 'text-slate-400'
            }`}
          >
            <Users size={20} />
            <span className="text-[10px] font-bold uppercase tracking-tighter">All Users</span>
          </button>
          <button
            onClick={() => setActiveTab('pending')}
            className={`flex flex-col items-center gap-1 transition-colors relative ${
              activeTab === 'pending' ? 'text-indigo-600' : 'text-slate-400'
            }`}
          >
            <Clock size={20} />
            <span className="text-[10px] font-bold uppercase tracking-tighter">Pending</span>
            {stats.pendingUsers > 0 && (
              <span className="absolute -top-1 -right-1 bg-amber-500 text-white text-[8px] font-black w-4 h-4 flex items-center justify-center rounded-full border-2 border-white">
                {stats.pendingUsers}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('verified')}
            className={`flex flex-col items-center gap-1 transition-colors ${
              activeTab === 'verified' ? 'text-indigo-600' : 'text-slate-400'
            }`}
          >
            <BadgeCheck size={20} />
            <span className="text-[10px] font-bold uppercase tracking-tighter">Verified</span>
          </button>
          <button
            onClick={() => setActiveTab('live')}
            className={`flex flex-col items-center gap-1 transition-colors relative ${
              activeTab === 'live' ? 'text-indigo-600' : 'text-slate-400'
            }`}
          >
            <Zap size={20} className={activeTab === 'live' ? 'animate-pulse' : ''} />
            <span className="text-[10px] font-bold uppercase tracking-tighter">Live Work</span>
            {liveRequests.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-indigo-500 text-white text-[8px] font-black w-4 h-4 flex items-center justify-center rounded-full border-2 border-white">
                {liveRequests.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('work')}
            className={`flex flex-col items-center gap-1 transition-colors ${
              activeTab === 'work' ? 'text-indigo-600' : 'text-slate-400'
            }`}
          >
            <History size={20} />
            <span className="text-[10px] font-bold uppercase tracking-tighter">Work</span>
          </button>
        </div>
      </nav>
    </div>
  );
};

