import React, { useState, useEffect } from 'react';
import { ShieldCheck, User, BadgeCheck } from 'lucide-react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile } from '../types';

interface HelperBadgeProps {
  helperId: string;
  showName?: boolean;
}

export const HelperBadge: React.FC<HelperBadgeProps> = ({ helperId, showName = false }) => {
  const [helper, setHelper] = useState<UserProfile | null>(null);

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'users', helperId), (doc) => {
      if (doc.exists()) {
        setHelper(doc.data() as UserProfile);
      }
    });
    return () => unsubscribe();
  }, [helperId]);

  if (!helper) return null;

  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <div className="w-8 h-8 rounded-full bg-slate-100 overflow-hidden">
          {helper.photoURL ? (
            <img src={helper.photoURL} alt={helper.displayName || ''} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-400">
              <User size={16} />
            </div>
          )}
        </div>
        {helper.verified && (
          <div className="absolute -bottom-1 -right-1 bg-blue-500 text-white p-0.5 rounded-full border-2 border-white">
            <BadgeCheck size={10} />
          </div>
        )}
      </div>
      {showName && (
        <div className="flex flex-col">
          <div className="flex items-center gap-1">
            <span className="text-xs font-bold text-slate-900">{helper.displayName}</span>
            {helper.verified && <BadgeCheck size={12} className="text-blue-500 fill-blue-50" />}
          </div>
          <span className="text-[10px] text-slate-500 capitalize">{helper.category}</span>
        </div>
      )}
    </div>
  );
};
