export type UserRole = 'user' | 'helper' | 'admin' | 'user-helper';

export interface Location {
  latitude: number;
  longitude: number;
  address?: string;
  district?: string;
  thana?: string;
}

export interface UserProfile {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  role: UserRole;
  phoneNumber?: string;
  isOnline?: boolean;
  category?: string;
  rating?: number;
  totalEarnings?: number;
  location?: Location;
  verified?: boolean;
  verificationStatus?: 'none' | 'pending' | 'approved' | 'rejected';
}

export type RequestStatus = 'pending' | 'assigned' | 'in-progress' | 'completed' | 'cancelled';

export interface ServiceRequest {
  id: string;
  userId: string;
  helperId?: string;
  category: string;
  description: string;
  workAddress?: string;
  status: RequestStatus;
  location: Location;
  estimatedCost?: number;
  createdAt: string;
  completedAt?: string;
  cancelledAt?: string;
  cancelledBy?: 'user' | 'helper';
  urgent?: boolean;
}

export interface ChatMessage {
  id: string;
  requestId: string;
  senderId: string;
  text: string;
  createdAt: string;
}
