import React, { useState, useEffect, useRef } from 'react';
import { Send, User, ArrowLeft } from 'lucide-react';
import { motion } from 'motion/react';
import { useAuth } from '../AuthContext';
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { ChatMessage } from '../types';

interface ChatProps {
  requestId: string;
  onBack: () => void;
}

export const Chat: React.FC<ChatProps> = ({ requestId, onBack }) => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query(
      collection(db, 'requests', requestId, 'messages'),
      orderBy('createdAt', 'asc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChatMessage));
      setMessages(msgs);
    });
    return () => unsubscribe();
  }, [requestId]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newMessage.trim()) return;

    try {
      await addDoc(collection(db, 'requests', requestId, 'messages'), {
        requestId,
        senderId: user.uid,
        text: newMessage,
        createdAt: new Date().toISOString(),
      });
      setNewMessage('');
    } catch (error) {
      console.error('Failed to send message', error);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      <header className="bg-white px-6 py-4 shadow-sm flex items-center gap-4">
        <button onClick={onBack} className="text-slate-500">
          <ArrowLeft size={24} />
        </button>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600">
            <User size={20} />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900">Chat with Helper</p>
            <p className="text-[10px] text-green-500 font-bold uppercase">Online</p>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.senderId === user?.uid ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] p-4 rounded-2xl text-sm shadow-sm ${
                msg.senderId === user?.uid
                  ? 'bg-indigo-600 text-white rounded-tr-none'
                  : 'bg-white text-slate-700 rounded-tl-none'
              }`}
            >
              {msg.text}
            </div>
          </div>
        ))}
        <div ref={scrollRef} />
      </div>

      <form onSubmit={sendMessage} className="p-4 bg-white border-t border-slate-100 flex gap-2">
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button
          type="submit"
          className="bg-indigo-600 text-white p-3 rounded-xl shadow-lg shadow-indigo-100"
        >
          <Send size={20} />
        </button>
      </form>
    </div>
  );
};
