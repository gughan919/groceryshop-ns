export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'customer' | 'delivery_partner' | 'store_staff';
  phone?: string;
  avatar?: string;
  isBanned?: boolean;
  dob?: string;
  gender?: string;
  emailVerified?: boolean;
  themePreference?: 'light' | 'dark' | 'system';
  phoneVerified?: boolean;
  twoFactorEnabled?: boolean;
  walletBalance?: number;
}

export interface Address {
  id: string;
  label: string; // Home, Work, etc.
  fullName: string;
  house?: string;
  street: string;
  city: string;
  state: string;
  pincode: string;
  postalCode?: string;
  phone: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  locality?: string;
}

export interface Review {
  id: string;
  productId: string;
  userName: string;
  userAvatar?: string;
  rating: number; // 1 to 5
  comment: string;
  date: string;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string;
  price: number;
  discount: number; // Percentage, e.g. 10 for 10%
  stock: number;
  image: string; // Base64 or Unsplash URL
  categoryId: string;
  brand?: string;
  unit: string; // e.g. "500 g", "1 kg", "1 pack"
  rating: number;
  ratingCount: number;
  isFeatured?: boolean;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  icon: string; // Lucide icon identifier
  banner?: string;
  parentId?: string; // For nested categories
}

export interface OrderItem {
  id: string;
  productId: string;
  productName: string;
  productImage: string;
  price: number; // Discounted purchase price
  quantity: number;
  unit: string;
}

export interface OrderTimeline {
  status: 'Pending' | 'Packed' | 'Shipped' | 'Out for delivery' | 'Delivered' | 'Cancelled';
  time: string;
  description: string;
  predictedTime?: string;
  actualTime?: string;
  distance?: number;
  traffic?: TrafficLevel;
  deliveryZone?: string;
}

export type TrafficLevel = 'light' | 'moderate' | 'heavy' | 'severe';

export type DeliveryStage =
  | 'Order Placed'
  | 'Accepted'
  | 'Preparing'
  | 'Ready for Pickup'
  | 'Picked Up'
  | 'On the Way'
  | 'Arriving Soon'
  | 'Delivered'
  | 'Cancelled';

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface WarehouseLocation extends GeoPoint {
  address: string;
  zone: string;
  pincode: string;
}

export interface CustomerLocation extends GeoPoint {
  address: string;
  pincode: string;
  locality?: string;
  city: string;
  state: string;
}

export interface DeliveryPartner {
  id: string;
  name: string;
  phone: string;
  profilePhoto?: string;
  vehicleType: 'bike' | 'scooter' | 'cycle' | 'van';
  vehicleNumber: string;
  rating: number;
  liveLatitude: number;
  liveLongitude: number;
  availability: 'available' | 'busy' | 'offline';
  activeOrders: string[];
  earningsToday?: number;
  completedOrders?: number;
}

export interface DeliveryTimelineEntry {
  status: DeliveryStage;
  timestamp: string;
  predictedTime?: string;
  actualTime?: string;
  distance?: number;
  traffic?: TrafficLevel;
  deliveryZone?: string;
  note?: string;
}

export interface DeliveryTracking {
  id: string;
  orderId: string;
  userId: string;
  driverId?: string;
  warehouse: WarehouseLocation;
  customerLocation: CustomerLocation;
  driver?: DeliveryPartner;
  status: DeliveryStage;
  etaMinutes: number;
  etaText: string;
  distanceKm: number;
  remainingDistanceKm: number;
  traffic: TrafficLevel;
  deliveryZone: string;
  routePolyline?: string;
  routeSummary?: string;
  delayed: boolean;
  delayReason?: string;
  deliveryOtpRequired: boolean;
  deliveryOtpVerified: boolean;
  deliveryOtpMasked?: string;
  updatedAt: string;
  timeline: DeliveryTimelineEntry[];
}

export interface CodEligibility {
  allowed: boolean;
  reasons: string[];
  distanceKm: number;
  minOrderValue: number;
  maxOrderValue: number;
  radiusKm: number;
  pincodeRisk: 'ok' | 'blacklisted' | 'remote' | 'high_rto';
  otpRequired: boolean;
  fraudScore: number;
}

export interface ChatMessage {
  id: string;
  orderId: string;
  channel: 'customer_driver' | 'customer_admin' | 'customer_store';
  senderId: string;
  senderRole: User['role'];
  text: string;
  createdAt: string;
  readBy?: string[];
}

export interface Order {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  items: OrderItem[];
  subtotal: number;
  discount: number;
  couponCode?: string;
  tax: number;
  deliveryFee: number;
  total: number;
  status: 'Pending' | 'Packed' | 'Shipped' | 'Out for delivery' | 'Delivered' | 'Cancelled';
  paymentMethod: 'COD' | 'Razorpay' | 'Stripe';
  paymentStatus: 'Pending' | 'Paid' | 'Failed';
  address: Address;
  createdAt: string;
  timeline: OrderTimeline[];
  invoiceUrl?: string;
  invoiceId?: string;
  invoiceGeneratedAt?: string;
  invoiceEmailStatus?: 'sent' | 'skipped' | 'failed';
  invoiceEmailError?: string;
  warehouse?: WarehouseLocation;
  customerLocation?: CustomerLocation;
  delivery?: DeliveryTracking;
  driverId?: string;
  deliveryOtpHash?: string;
  deliveryOtpVerified?: boolean;
  codEligibility?: CodEligibility;
  cancellationStatus?: 'none' | 'requested' | 'approved' | 'rejected';
  deliveryInstructions?: string;
}

export interface Coupon {
  id: string;
  code: string;
  type: 'percent' | 'fixed';
  value: number;
  expiryDate: string;
  active: boolean;
  usageLimit: number;
  usageCount: number;
}

export interface DashboardBanner {
  id: string;
  image: string;
  title: string;
  subtitle?: string;
  offerText?: string;
  discount?: number; // Exact product.discount value this banner should route to
  link?: string;
  active: boolean;
  sponsorName?: string;
  badge?: string;
  ctaLabel?: string;
  secondaryCtaLabel?: string;
  campaignType?: 'sponsored' | 'featured' | 'seasonal' | 'offer' | 'advertisement';
  priority?: number;
  startDate?: string;
  endDate?: string;
  targetCategoryId?: string;
  category?: string;
}
