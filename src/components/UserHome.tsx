import React, { useState, useEffect } from 'react';
import { MapPin, Search, Zap, Wrench, Droplets, GraduationCap, Truck, Sparkles, User, LogOut, History, MessageSquare, DollarSign, CheckCircle, Clock, Loader2, XCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth, handleFirestoreError, OperationType } from '../AuthContext';
import { VoiceRecorder } from './VoiceRecorder';
import { HelperBadge } from './HelperBadge';
import { transcribeVoice, analyzeProblem } from '../services/geminiService';
import { collection, addDoc, query, where, onSnapshot, orderBy, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { ServiceRequest, RequestStatus } from '../types';
import { Chat } from './Chat';
import { reverseGeocode } from '../services/locationService';

const CATEGORIES = [
  { id: 'electrician', name: 'Electrician', icon: Wrench, color: 'bg-yellow-100 text-yellow-700' },
  { id: 'plumber', name: 'Plumber', icon: Droplets, color: 'bg-blue-100 text-blue-700' },
  { id: 'tutor', name: 'Tutor', icon: GraduationCap, color: 'bg-purple-100 text-purple-700' },
  { id: 'delivery', name: 'Delivery', icon: Truck, color: 'bg-green-100 text-green-700' },
  { id: 'cleaner', name: 'Cleaner', icon: Sparkles, color: 'bg-pink-100 text-pink-700' },
  { id: 'other', name: 'Other', icon: Search, color: 'bg-gray-100 text-gray-700' },
];

export const UserHome: React.FC = () => {
  const { user, profile, logout, updateRole } = useAuth();
  const [location, setLocation] = useState<{ lat: number; lng: number; address: string; district?: string; thana?: string } | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [workAddress, setWorkAddress] = useState('');
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeRequests, setActiveRequests] = useState<ServiceRequest[]>([]);
  const [completedRequests, setCompletedRequests] = useState<ServiceRequest[]>([]);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [estimatedCost, setEstimatedCost] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'home' | 'history' | 'chat' | 'profile'>('home');
  const [selectedChatRequestId, setSelectedChatRequestId] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState<string | null>(null);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          setLocation({
            lat: latitude,
            lng: longitude,
            address: 'Detecting address...',
          });
          
          const geoResult = await reverseGeocode(latitude, longitude);
          setLocation({
            lat: latitude,
            lng: longitude,
            address: geoResult.address,
            district: geoResult.district,
            thana: geoResult.thana
          });
        },
        (error) => console.error('Error getting location:', error),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    }
  }, []);

  useEffect(() => {
    if (user) {
      const q = query(
        collection(db, 'requests'),
        where('userId', '==', user.uid),
        where('status', 'in', ['pending', 'assigned', 'in-progress']),
        orderBy('createdAt', 'desc')
      );
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const reqs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ServiceRequest));
        setActiveRequests(reqs);
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'requests');
      });

      // Fetch completed and cancelled requests for history
      const historyQuery = query(
        collection(db, 'requests'),
        where('userId', '==', user.uid),
        where('status', 'in', ['completed', 'cancelled']),
        orderBy('createdAt', 'desc')
      );
      const unsubscribeHistory = onSnapshot(historyQuery, (snapshot) => {
        const reqs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ServiceRequest));
        setCompletedRequests(reqs);
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'requests');
      });

      return () => {
        unsubscribe();
        unsubscribeHistory();
      };
    }
  }, [user]);

  const handleVoiceTranscription = async (base64Audio: string) => {
    setIsTranscribing(true);
    try {
      const text = await transcribeVoice(base64Audio);
      setDescription(text);
      const analysis = await analyzeProblem(text);
      setSelectedCategory(analysis.category.toLowerCase());
      setEstimatedCost(analysis.estimatedCost);
      setShowRequestModal(true);
    } catch (error) {
      console.error('Voice transcription failed', error);
    } finally {
      setIsTranscribing(false);
    }
  };

  const createRequest = async (isUrgent: boolean = false) => {
    if (!user || !location || (!selectedCategory && !isUrgent)) return;

    setIsSubmitting(true);
    try {
      const newRequest = {
        userId: user.uid,
        category: selectedCategory || (isUrgent ? 'Urgent' : 'Other'),
        description,
        workAddress,
        status: 'pending' as RequestStatus,
        location: {
          latitude: location.lat,
          longitude: location.lng,
          address: location.address,
          district: location.district || 'Dhaka',
          thana: location.thana || 'Dhanmondi',
        },
        estimatedCost: estimatedCost || (isUrgent ? 1000 : 500),
        createdAt: new Date().toISOString(),
        urgent: isUrgent,
      };

      const docRef = await addDoc(collection(db, 'requests'), newRequest);
      setShowRequestModal(false);
      setDescription('');
      setWorkAddress('');
      setSelectedCategory(null);
      setEstimatedCost(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'requests');
    } finally {
      setIsSubmitting(false);
    }
  };

  const cancelRequest = async (requestId: string) => {
    if (!user) return;
    setConfirmCancelId(null);
    setIsCancelling(requestId);
    try {
      const requestRef = doc(db, 'requests', requestId);
      await updateDoc(requestRef, {
        status: 'cancelled',
        cancelledAt: new Date().toISOString(),
        cancelledBy: 'user'
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'requests');
    } finally {
      setIsCancelling(null);
    }
  };

  const renderHome = () => (
    <>
      {/* Location Bar */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 mb-8 flex items-center gap-3">
        <MapPin className="text-indigo-600" size={20} />
        <div className="flex-1">
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Your Location</p>
          <p className="text-sm font-semibold text-slate-900">{location?.address || 'Locating...'}</p>
        </div>
        <button className="text-indigo-600 text-sm font-bold">Change</button>
      </div>

      {/* Categories Grid */}
      <section className="mb-10">
        <h2 className="text-lg font-bold text-slate-900 mb-4">What do you need help with?</h2>
        <div className="grid grid-cols-3 gap-4">
          {CATEGORIES.map((cat) => (
            <motion.button
              key={cat.id}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                setSelectedCategory(cat.id);
                setShowRequestModal(true);
              }}
              className="flex flex-col items-center gap-2"
            >
              <div className={`w-16 h-16 rounded-2xl ${cat.color} flex items-center justify-center shadow-sm`}>
                <cat.icon size={28} />
              </div>
              <span className="text-xs font-bold text-slate-700">{cat.name}</span>
            </motion.button>
          ))}
        </div>
      </section>

      {/* Urgent Help Button */}
      <section className="mb-10">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => createRequest(true)}
          className="w-full bg-red-600 text-white p-6 rounded-3xl shadow-xl shadow-red-200 flex items-center justify-center gap-4 group relative overflow-hidden"
        >
          <div className="absolute inset-0 bg-white/10 translate-x-full group-hover:translate-x-0 transition-transform duration-500 skew-x-12" />
          <Zap className="fill-current" size={32} />
          <div className="text-left">
            <p className="text-xl font-black uppercase tracking-tighter italic">Urgent Help</p>
            <p className="text-xs font-medium opacity-80">Helper arrives in 30 mins</p>
          </div>
        </motion.button>
      </section>

      {/* Voice Request */}
      <section className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 flex flex-col items-center text-center mb-10">
        <h3 className="text-lg font-bold text-slate-900 mb-2">Just say what's wrong</h3>
        <p className="text-sm text-slate-500 mb-6">"আমার বাসার ফ্যান ঘুরছে না" বা "I need a plumber"</p>
        <VoiceRecorder onTranscription={handleVoiceTranscription} onTranscribing={setIsTranscribing} />
        {isTranscribing && (
          <div className="mt-4 flex items-center gap-2 text-indigo-600 font-medium animate-pulse">
            <Loader2 className="animate-spin" size={16} />
            <span>Transcribing your request...</span>
          </div>
        )}
      </section>

      {/* Active Requests */}
      {activeRequests.length > 0 && (
        <section>
          <h2 className="text-lg font-bold text-slate-900 mb-4">Active Requests</h2>
          <div className="space-y-4">
            <AnimatePresence mode="popLayout">
              {activeRequests.map((req) => (
                <motion.div
                  layout
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20, scale: 0.95 }}
                  key={req.id}
                  className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4"
                >
                  <div className={`p-3 rounded-xl ${req.urgent ? 'bg-red-100 text-red-600' : 'bg-indigo-100 text-indigo-600'}`}>
                    {req.urgent ? <Zap size={20} /> : <Clock size={20} />}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-slate-900 capitalize">{req.category}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {req.helperId ? (
                        <HelperBadge helperId={req.helperId} showName={true} />
                      ) : (
                        <p className="text-xs text-slate-500">Searching for nearby helpers...</p>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex flex-col items-end gap-2">
                    <p className="text-sm font-bold text-slate-900">৳{req.estimatedCost}</p>
                    <div className="flex items-center gap-3">
                      <button 
                        disabled={isCancelling === req.id}
                        onClick={() => setConfirmCancelId(req.id)}
                        className="text-[10px] font-bold text-red-500 hover:text-red-700 transition-colors flex items-center gap-1"
                      >
                        {isCancelling === req.id ? <Loader2 size={10} className="animate-spin" /> : <XCircle size={10} />}
                        Cancel
                      </button>
                      <button 
                        onClick={() => {
                          if (req.helperId) {
                            setSelectedChatRequestId(req.id);
                            setActiveTab('chat');
                          }
                        }}
                        className={`text-xs font-bold ${req.helperId ? 'text-indigo-600' : 'text-slate-400'}`}
                      >
                        {req.helperId ? 'Chat' : 'Track'}
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </section>
      )}
    </>
  );

  const renderHistory = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-black text-slate-900 tracking-tight">Request History</h2>
        <span className="bg-slate-100 text-slate-500 text-[10px] font-bold px-2 py-1 rounded-full uppercase">{completedRequests.length} Total</span>
      </div>
      
      {completedRequests.length > 0 ? (
        <div className="space-y-4">
          {completedRequests.map((req) => (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              key={req.id}
              className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100"
            >
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-2">
                  <div className={`p-2 rounded-lg ${req.status === 'completed' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                    {req.status === 'completed' ? <CheckCircle size={18} /> : <XCircle size={18} />}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900 capitalize">{req.category}</p>
                    <p className="text-[10px] text-slate-400 font-medium">
                      {new Date(req.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-black text-slate-900">৳{req.estimatedCost}</p>
                  <span className={`text-[8px] font-black uppercase tracking-tighter px-1.5 py-0.5 rounded-md ${
                    req.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  }`}>
                    {req.status}
                  </span>
                </div>
              </div>
              <p className="text-xs text-slate-600 mb-2 line-clamp-2">"{req.description}"</p>
              {req.workAddress && (
                <div className="flex items-center gap-2 text-[10px] text-indigo-600 font-bold mb-2 bg-indigo-50 px-2 py-1 rounded-md w-fit">
                  <MapPin size={10} />
                  <span>{req.workAddress}</span>
                </div>
              )}
              <div className="flex items-center gap-2 text-[10px] text-slate-400">
                <MapPin size={12} />
                <span className="truncate">{req.location.address}</span>
              </div>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-3xl p-12 border border-slate-100 shadow-sm text-center">
          <History className="mx-auto text-slate-200 mb-4" size={64} />
          <p className="text-slate-500 font-bold">No past requests</p>
          <p className="text-xs text-slate-400 mt-1">Your history will appear here once you complete services.</p>
        </div>
      )}
    </div>
  );

  const renderChat = () => (
    <div className="space-y-6">
      <h2 className="text-2xl font-black text-slate-900 tracking-tight">Messages</h2>
      {activeRequests.some(r => r.helperId) ? (
        <div className="space-y-3">
          {activeRequests.filter(r => r.helperId).map(req => (
            <div 
              key={req.id}
              onClick={() => setSelectedChatRequestId(req.id)}
              className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4 cursor-pointer hover:bg-slate-50 transition-colors"
            >
              <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600">
                <User size={24} />
              </div>
              <div className="flex-1">
                <HelperBadge helperId={req.helperId!} showName={true} />
                <p className="text-xs text-slate-500 line-clamp-1">Service: {req.category}</p>
              </div>
              <div className="w-2 h-2 bg-indigo-600 rounded-full" />
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm text-center">
          <MessageSquare className="mx-auto text-slate-300 mb-4" size={48} />
          <p className="text-slate-500 font-medium">No active chats.</p>
          <p className="text-xs text-slate-400 mt-1">Connect with a helper to start chatting.</p>
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
        <h2 className="text-xl font-black text-slate-900">{profile?.displayName || 'User'}</h2>
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
              <DollarSign size={18} />
            </div>
            <span className="text-sm font-bold text-slate-700">Payment Methods</span>
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
          <h1 className="text-xl font-bold text-slate-900">DakDao</h1>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => updateRole('helper')} className="text-sm font-medium text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-full">
            Become a Helper
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
              <h3 className="text-xl font-bold text-slate-900 mb-2">Cancel Request?</h3>
              <p className="text-sm text-slate-500 mb-8">Are you sure you want to cancel this request? This action cannot be undone.</p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setConfirmCancelId(null)}
                  className="flex-1 bg-slate-100 text-slate-900 p-4 rounded-2xl font-bold"
                >
                  No, Keep
                </button>
                <button 
                  onClick={() => cancelRequest(confirmCancelId)}
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
        {activeTab === 'home' && renderHome()}
        {activeTab === 'history' && renderHistory()}
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

      {/* Request Modal */}
      <AnimatePresence>
        {showRequestModal && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-8 shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-slate-900 capitalize">{selectedCategory} Request</h3>
                <button onClick={() => setShowRequestModal(false)} className="text-slate-400 hover:text-slate-600">
                  <Sparkles size={24} />
                </button>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Problem Description</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe your problem briefly..."
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none min-h-[100px]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Work Address</label>
                  <div className="relative">
                    <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input
                      type="text"
                      value={workAddress}
                      onChange={(e) => setWorkAddress(e.target.value)}
                      placeholder="Enter specific address or landmark..."
                      className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="bg-indigo-50 p-4 rounded-2xl flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <DollarSign className="text-indigo-600" size={20} />
                      <span className="text-sm font-bold text-slate-700">Estimated Cost</span>
                    </div>
                    <div className="flex items-center gap-1 bg-white px-3 py-1 rounded-xl border border-indigo-100">
                      <span className="text-lg font-black text-indigo-600">৳</span>
                      <input
                        type="number"
                        value={estimatedCost || ''}
                        onChange={(e) => setEstimatedCost(Number(e.target.value))}
                        className="w-20 bg-transparent text-lg font-black text-indigo-600 outline-none"
                        placeholder="500"
                      />
                    </div>
                  </div>
                  
                  {/* Quick Select Amounts */}
                  <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                    {[200, 500, 1000, 2000].map((amount) => (
                      <button
                        key={amount}
                        onClick={() => setEstimatedCost(amount)}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                          estimatedCost === amount 
                          ? 'bg-indigo-600 text-white shadow-md' 
                          : 'bg-white text-slate-500 border border-slate-100 hover:border-indigo-200'
                        }`}
                      >
                        ৳{amount}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  disabled={isSubmitting}
                  onClick={() => createRequest()}
                  className="w-full bg-indigo-600 text-white p-4 rounded-2xl font-bold shadow-lg shadow-indigo-100 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isSubmitting ? <Loader2 className="animate-spin" /> : 'Confirm Request'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 px-8 py-4 flex justify-around items-center z-10">
        <button 
          onClick={() => setActiveTab('home')}
          className={`flex flex-col items-center gap-1 ${activeTab === 'home' ? 'text-indigo-600' : 'text-slate-400'}`}
        >
          <Zap size={24} />
          <span className="text-[10px] font-bold uppercase">Home</span>
        </button>
        <button 
          onClick={() => setActiveTab('history')}
          className={`flex flex-col items-center gap-1 ${activeTab === 'history' ? 'text-indigo-600' : 'text-slate-400'}`}
        >
          <History size={24} />
          <span className="text-[10px] font-bold uppercase">History</span>
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
