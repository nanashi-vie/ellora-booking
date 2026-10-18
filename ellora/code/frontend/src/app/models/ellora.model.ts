export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  role: 'CUSTOMER' | 'OWNER' | 'ADMIN';
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  imageUrl?: string;
}

export interface Salon {
  id: string;
  name: string;
  description: string;
  address: string;
  city: string;
  district?: string | null;
  coordinates: { lat: number; lng: number } | null;
  rating: number;
  reviewCount: number;
  images: string[];
  distance?: number; // Calculated based on user location
  isOpen?: boolean;
  nextAvailable?: string; // ISO date string
  subscriptionTier?: 'STANDARD' | 'VIP' | null;
  subscriptionBadge?: string | null;
}

export interface Service {
  id: string;
  salonId: string;
  name: string;
  description: string;
  durationMinutes: number;
  price: number;
  categoryId?: string;
  imageUrl?: string;
}

export interface Staff {
  id: string;
  salonId: string;
  name: string;
  role: string;
  avatar?: string;
}

export interface Review {
  salonReply?: string;
  salonRepliedAt?: string;
  id: string;
  salonId: string;
  authorId: string;
  authorName: string;
  rating: number;
  comment: string;
  date: string;
}

export interface Booking {
  id: string;
  salonId: string;
  customerId: string;
  serviceIds: string[];
  staffId?: string;
  date: string;
  time: string;
  status: 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';
  totalPrice: number;
}

export interface Promotion {
  id: string;
  title: string;
  description: string;
  discountPercentage?: number;
  imageUrl?: string;
  validUntil?: string;
}
