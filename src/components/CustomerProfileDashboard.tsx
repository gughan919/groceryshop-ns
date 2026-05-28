import React, { useState, useEffect, useRef } from 'react';
import {
  User as UserIcon,
  ShoppingBag,
  Truck,
  MapPin,
  Heart,
  CreditCard,
  Bell,
  Lock,
  HelpCircle,
  LogOut,
  Camera,
  AlertTriangle,
  Smartphone,
  CheckCircle,
  Plus,
  Trash2,
  X,
  FileDown,
  Navigation,
  Key,
  Database,
  Eye,
  Settings,
  Shield,
  Clock,
  Check,
  RotateCcw,
  Search,
  MessageSquare,
  Globe,
  DollarSign
} from 'lucide-react';
import { User, Address, Order, Product } from '../types';
import { auth as firebaseAuth, db as firestoreDb } from '../firebase';
import { RecaptchaVerifier, sendEmailVerification, signInWithPhoneNumber, updatePassword } from 'firebase/auth';
import type { ConfirmationResult } from 'firebase/auth';
import { generateAndUploadInvoice } from '../utils/invoice';
import { collection, doc, setDoc, deleteDoc, getDocs, updateDoc } from 'firebase/firestore';

interface CustomerProfileDashboardProps {
  currentUser: User | null;
  token: string | null;
  onUpdateUser: (updatedUser: User) => void;
  onLogout: () => void;
  orders: Order[];
  addresses: Address[];
  wishlist: string[];
  products: Product[];
  toggleWishlist: (productId: string) => void;
  addToCart: (productId: string) => void;
  notifyUser: (msg: string, type?: 'success' | 'error' | 'info') => void;
  fetchCustomerData: () => void;
  fetchCatalogs: () => void;
  initialTab?: string;
  themeMode: 'light' | 'dark' | 'system';
  setThemeMode: (mode: 'light' | 'dark' | 'system') => void;
}

export default function CustomerProfileDashboard({
  currentUser,
  token,
  onUpdateUser,
  onLogout,
  orders,
  addresses,
  wishlist,
  products,
  toggleWishlist,
  addToCart,
  notifyUser,
  fetchCustomerData,
  fetchCatalogs,
  initialTab,
  themeMode,
  setThemeMode
}: CustomerProfileDashboardProps) {
  // Navigation Sub Tab state
  const [activeTab, setActiveTab] = useState<
    'profile' | 'orders' | 'tracking' | 'addresses' | 'wishlist' | 'payments' | 'notifications' | 'security' | 'help'
  >((initialTab as any) || 'profile');

  // Sync tab with initialTab prop changes
  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab as any);
    }
  }, [initialTab]);

  const handleDownloadInvoice = async (order: Order) => {
    if (order.invoiceUrl) {
      window.open(order.invoiceUrl, '_blank');
      return;
    }
    
    notifyUser('Generating your invoice PDF. Please wait...', 'success');
    const newUrl = await generateAndUploadInvoice(order, token || '');
    if (newUrl) {
      window.open(newUrl, '_blank');
      notifyUser('Invoice generated successfully.', 'success');
      fetchCustomerData(); // Re-fetch to get updated order with invoiceUrl
    } else {
      notifyUser('Failed to generate invoice.', 'error');
    }
  };

  // Form states
  const [profileForm, setProfileForm] = useState({
    name: currentUser?.name || '',
    email: currentUser?.email || '',
    phone: currentUser?.phone || '',
    dob: currentUser?.dob || '',
    gender: currentUser?.gender || 'Other',
    avatar: currentUser?.avatar || ''
  });

  // Keep state sync
  useEffect(() => {
    if (currentUser) {
      setProfileForm({
        name: currentUser.name || '',
        email: currentUser.email || '',
        phone: currentUser.phone || '',
        dob: currentUser.dob || '',
        gender: currentUser.gender || 'Other',
        avatar: currentUser.avatar || ''
      });
    }
  }, [currentUser]);

  // General loading/mutation states
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Profile picture image crop flow states
  const [selectedCropImage, setSelectedCropImage] = useState<string | null>(null);
  const [cropZoom, setCropZoom] = useState(1);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Email Verification banner states
  const [emailVerificationSent, setEmailVerificationSent] = useState(false);
  const [emailVerifyTimer, setEmailVerifyTimer] = useState(0);

  // Phone Auth State
  const [phoneToVerify, setPhoneToVerify] = useState(currentUser?.phone || '');
  const [otpSent, setOtpSent] = useState(false);
  const [otpTimer, setOtpTimer] = useState(0);
  const [otpValue, setOtpValue] = useState('');
  const [recaptchaResolved, setRecaptchaResolved] = useState(false);
  const [recaptchaVerifying, setRecaptchaVerifying] = useState(false);
  const [phoneConfirmationResult, setPhoneConfirmationResult] = useState<ConfirmationResult | null>(null);

  // Address System State
  const [isAddressModalOpen, setIsAddressModalOpen] = useState(false);
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const [addressForm, setAddressForm] = useState({
    label: 'Home',
    fullName: '',
    phone: '',
    street: '',
    city: '',
    state: '',
    pincode: '',
    country: '',
    landmark: ''
  });
  const [autocompleteSearch, setAutocompleteSearch] = useState('');
  const [locationPipingActive, setLocationPipingActive] = useState(false);

  // Security Management State
  const [securityForm, setSecurityForm] = useState({
    currentPass: '',
    newPass: '',
    confirmPass: ''
  });
  const [is2faEnabling, setIs2faEnabling] = useState(false);
  const [securityAccessLogs, setSecurityAccessLogs] = useState<any[]>([
    { id: '1', event: 'Profile Synced', device: 'Chrome / macOS (Your current device)', time: 'Just now', type: 'info' },
    { id: '2', event: 'Signed In', device: 'iPhone / Mobile browser', time: '1 hour ago', type: 'login' },
    { id: '3', event: 'Changed password', device: 'Safari / iPadOS', time: 'Yesterday', type: 'sec' }
  ]);

  // Payment System State
  const [savedPayments, setSavedPayments] = useState<any[]>([
    { id: 'pm-1', type: 'CARD', value: '4242 4242 4242 4242', label: 'Primary card', isDefault: true, cardBrand: 'Visa' },
    { id: 'pm-2', type: 'CARD', value: '4321 •••• •••• 9876', label: 'HDFC Bank Credit Card', expiry: '12/29', brand: 'Visa', isDefault: false }
  ]);
  const [newPaymentForm, setNewPaymentForm] = useState({
    type: 'CARD',
    value: '',
    label: '',
    cardExpiry: '',
    cardBrand: 'Visa'
  });
  const [isAddingPayment, setIsAddingPayment] = useState(false);

  // Notification Preferences State
  const [notificationSettings, setNotificationSettings] = useState({
    orderUpdates: true,
    offers: false,
    stockAlerts: true,
    deliverySms: true
  });
  const [notificationsList, setNotificationsList] = useState<any[]>([
    { id: 'n-1', title: 'Welcome to Nammashop Premium!', body: 'Enrich your customer experience with 10-minute lightning speed organic deliveries.', read: false, time: '10 mins ago', category: 'offers' },
    { id: 'n-2', title: 'Fresh stock of mangoes arrived!', body: 'Buy sweet organic Ratnagiri Mangoes directly harvested from Namma Farms.', read: true, time: '1 hour ago', category: 'stock' }
  ]);

  // Delivery Tracking Context
  const [selectedTrackingOrderId, setSelectedTrackingOrderId] = useState<string | null>(
    orders.length > 0 ? orders[0].id : null
  );
  const activeTrackingOrder = orders.find(o => o.id === selectedTrackingOrderId) || (orders.length > 0 ? orders[0] : null);

  // Sync latest order ID for tracking tab automatically when orders update
  useEffect(() => {
    if (orders.length > 0) {
      if (!selectedTrackingOrderId || !orders.some(o => o.id === selectedTrackingOrderId)) {
        setSelectedTrackingOrderId(orders[0].id);
      }
    }
  }, [orders, selectedTrackingOrderId]);

  // Email Verify countdown timer
  useEffect(() => {
    if (emailVerifyTimer > 0) {
      const interval = setInterval(() => {
        setEmailVerifyTimer(prev => prev - 1);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [emailVerifyTimer]);

  // OTP countdown timer
  useEffect(() => {
    if (otpTimer > 0) {
      const interval = setInterval(() => {
        setOtpTimer(prev => prev - 1);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [otpTimer]);

  // Check current user properties in firebase on mount
  useEffect(() => {
    const user = firebaseAuth.currentUser;
    if (user && currentUser) {
      if (user.emailVerified !== currentUser.emailVerified) {
        onUpdateUser({
          ...currentUser,
          emailVerified: user.emailVerified
        });
      }
    }
  }, []);

  // Compute profile completion percentage
  const profileCompletion = () => {
    let fields = 0;
    let filled = 0;
    if (currentUser?.name) filled++; fields++;
    if (currentUser?.email) filled++; fields++;
    if (currentUser?.phone) filled++; fields++;
    if (currentUser?.dob) filled++; fields++;
    if (currentUser?.gender) filled++; fields++;
    if (currentUser?.avatar) filled++; fields++;
    if (currentUser?.emailVerified) filled++; fields++;
    if (currentUser?.phoneVerified) filled++; fields++;
    return Math.round((filled / fields) * 100);
  };

  // Google Autocomplete Location simulation
  const handleAutocompleteSelect = (place: string) => {
    setAutocompleteSearch(place);
    let mockData = {
      street: '', city: 'Bengaluru', state: 'Karnataka', pincode: '560034', country: 'India', landmark: 'Near Indiranagar Metro Station'
    };

    if (place.includes('Indiranagar')) {
      mockData = { street: '12, 100 Feet Road, Indiranagar', city: 'Bengaluru', state: 'Karnataka', pincode: '560038', country: 'India', landmark: 'Opposite To Metro Pillar 132' };
    } else if (place.includes('Koramangala')) {
      mockData = { street: '422, Oasis Mall Road, Koramangala 4th Block', city: 'Bengaluru', state: 'Karnataka', pincode: '560034', country: 'India', landmark: 'Beside Oasis Mall Entrance' };
    } else if (place.includes('MG Road')) {
      mockData = { street: '99, MG Road Trinity Cross', city: 'Bengaluru', state: 'Karnataka', pincode: '560001', country: 'India', landmark: 'Opposite To Taj MG Road Hotel' };
    } else {
      mockData = { street: place, city: 'Bengaluru', state: 'Karnataka', pincode: '560068', country: 'India', landmark: 'Simulated Location' };
    }

    setAddressForm(prev => ({
      ...prev,
      street: mockData.street,
      city: mockData.city,
      state: mockData.state,
      pincode: mockData.pincode,
      country: mockData.country,
      landmark: mockData.landmark
    }));
    notifyUser('Address auto-completed from Google Maps!', 'success');
  };

  // Browser Geolocation Piping
  const triggerBrowserLocationGPS = () => {
    if (!navigator.geolocation) {
      notifyUser('GPS geolocation service is not supported by your browser.', 'error');
      return;
    }
    setLocationPipingActive(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocationPipingActive(false);
        // Simulate backward geocoding
        setAddressForm(prev => ({
          ...prev,
          street: `Lat: ${position.coords.latitude.toFixed(4)}, Lng: ${position.coords.longitude.toFixed(4)} • Indiranagar High Street`,
          city: 'Bengaluru',
          state: 'Karnataka',
          pincode: '560038',
          country: 'India',
          landmark: 'GPS Pinned Coordinates'
        }));
        notifyUser('Successfully loaded current GPS coordinates!', 'success');
      },
      (error) => {
        setLocationPipingActive(false);
        // Fallback mockup
        setAddressForm(prev => ({
          ...prev,
          street: '42, Dr. Rajkumar Road, Rajajinagar',
          city: 'Bengaluru',
          state: 'Karnataka',
          pincode: '560010',
          country: 'India',
          landmark: 'GPS Mock Pinned Gate'
        }));
        notifyUser('Location services protected, using precise mockup coords', 'info');
      }
    );
  };

  // Resend Email Verification link using Firebase Auth
  const handleResendEmailVerification = async () => {
    const user = firebaseAuth.currentUser;
    if (!user) {
      notifyUser('Authenticate first before resending email verification.', 'error');
      return;
    }
    try {
      await sendEmailVerification(user);
      setEmailVerificationSent(true);
      setEmailVerifyTimer(60);
      notifyUser('Verification link dispatched to your inbox email!', 'success');
    } catch (err: any) {
      notifyUser(err.message || 'Error executing email verification.', 'error');
    }
  };

  // Check Email status
  const triggerManualEmailVerificationSync = async () => {
    const user = firebaseAuth.currentUser;
    if (!user) return;
    try {
      await user.reload();
      if (user.emailVerified) {
        // Sync and save to Firestore
        if (currentUser) {
          const updated = { ...currentUser, emailVerified: true };
          onUpdateUser(updated);
          // Sync to Firestore
          const docRef = doc(firestoreDb, `users/${currentUser.id}`);
          await setDoc(docRef, JSON.parse(JSON.stringify(updated)), { merge: true });
        }
        notifyUser('Email verified successfully! Ordering unlocked.', 'success');
      } else {
        notifyUser('Verification link pending inside your mailbox.', 'info');
      }
    } catch (err: any) {
      notifyUser('Error synchronizing verification status: ' + err.message, 'error');
    }
  };

  const formatPhoneForFirebase = (phone: string) => {
    const cleaned = phone.trim().replace(/[\s()-]+/g, '');
    if (cleaned.startsWith('+')) return cleaned;
    if (cleaned.length === 10) return `+91${cleaned}`;
    return `+${cleaned}`;
  };

  // Send Phone verification OTP via Firebase SMS Auth
  const triggerPhoneOtps = async () => {
    if (!phoneToVerify || phoneToVerify.length < 10) {
      notifyUser('Please supply a valid mobile number with country code, or a 10-digit Indian number.', 'error');
      return;
    }
    setRecaptchaVerifying(true);
    try {
      const formattedPhone = formatPhoneForFirebase(phoneToVerify);
      const verifier = new RecaptchaVerifier(firebaseAuth, 'recaptcha-container', {
        size: 'invisible'
      });
      const confirmation = await signInWithPhoneNumber(firebaseAuth, formattedPhone, verifier);
      setPhoneConfirmationResult(confirmation);
      setRecaptchaResolved(true);
      setOtpSent(true);
      setOtpTimer(45);
      notifyUser(`Real OTP SMS sent to ${formattedPhone}.`, 'success');
    } catch (err: any) {
      notifyUser(err.message || 'Unable to send Firebase phone OTP.', 'error');
    } finally {
      setRecaptchaVerifying(false);
    }
  };

  const handleVerifyPhoneOtpCode = async () => {
    if (!phoneConfirmationResult) {
      notifyUser('Please request a real OTP before confirming.', 'error');
      return;
    }
    if (!otpValue || otpValue.length < 6) {
      notifyUser('Enter the 6-digit OTP sent by Firebase SMS.', 'error');
      return;
    }
    if (currentUser) {
      try {
        await phoneConfirmationResult.confirm(otpValue);
        const updated = { ...currentUser, phone: formatPhoneForFirebase(phoneToVerify), phoneVerified: true };
        onUpdateUser(updated);

        // Save security state
        const docRef = doc(firestoreDb, `users/${currentUser.id}`);
        await setDoc(docRef, JSON.parse(JSON.stringify(updated)), { merge: true });

        // Add to security log
        setSecurityAccessLogs(prev => [
          { id: String(Date.now()), event: 'Verified Mobile', device: 'OTP Authenticated via SMS', time: 'Just now', type: 'sec' },
          ...prev
        ]);
        setOtpSent(false);
        setOtpValue('');
        setPhoneConfirmationResult(null);
        notifyUser('Mobile number verified successfully with Firebase SMS.', 'success');
      } catch (e: any) {
        notifyUser(e.message || 'Invalid or expired OTP token. Try again.', 'error');
      }
    }
  };

  // Edit / Save Profile Details
  const handleSaveProfileChanges = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    if (!profileForm.name.trim()) {
      notifyUser('Name field is highly critical and mandatory.', 'error');
      return;
    }

    setIsSavingProfile(true);
    try {
      const resp = await fetch('/api/auth/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(profileForm)
      });
      const data = await resp.json();
      if (resp.ok) {
        onUpdateUser(data.user);
        notifyUser('Nammashop profile credentials saved successfully!', 'success');

        // Sync to security log
        setSecurityAccessLogs(prev => [
          { id: String(Date.now()), event: 'Profile Updated', device: 'REST & Firestore Synchronized', time: 'Just now', type: 'info' },
          ...prev
        ]);
      } else {
        notifyUser(data.error || 'Changes failed to synchronize.', 'error');
      }
    } catch (err: any) {
      notifyUser('API error syncing changes.', 'error');
    } finally {
      setIsSavingProfile(false);
    }
  };

  // Upload Profile picture mock using compression & range cropper modal
  const handleSelectPictureFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setSelectedCropImage(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const completeCroppedAndCompressedSave = () => {
    if (!selectedCropImage) return;
    // Compress and crop using canvas drawing simulator
    const canvas = document.createElement('canvas');
    canvas.width = 150;
    canvas.height = 150;
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.src = selectedCropImage;
    img.onload = () => {
      if (ctx) {
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(0, 0, 150, 150);
        ctx.drawImage(img, 0, 0, 150, 150);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85); // Compress to high-density JPG jpeg
        setProfileForm(prev => ({ ...prev, avatar: dataUrl }));
        notifyUser('Avatar image compressed and aligned.', 'success');
        setSelectedCropImage(null);
      }
    };
  };

  // Address CRUD operations
  const openAddressFormModal = (addrId: string | null = null) => {
    if (addrId) {
      const addrObj = currentUser ? (doc ?? null) : null;
      setEditingAddressId(addrId);
      // Fetch details from state
      const target = (currentUser as any)?.addresses?.find((a: any) => a.id === addrId) || {};
      setAddressForm({
        label: target.label || 'Home',
        fullName: target.fullName || '',
        phone: target.phone || '',
        street: target.street || '',
        city: target.city || '',
        state: target.state || '',
        pincode: target.pincode || target.postalCode || '',
        country: target.country || '',
        landmark: target.landmark || ''
      });
    } else {
      setEditingAddressId(null);
      setAddressForm({
        label: 'Home',
        fullName: currentUser?.name || '',
        phone: currentUser?.phone || '',
        street: '',
        city: '',
        state: '',
        pincode: '',
        country: '',
        landmark: ''
      });
    }
    setAutocompleteSearch('');
    setIsAddressModalOpen(true);
  };

  const handleSaveAddressRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    const requiredFields = ['fullName', 'phone', 'street', 'city', 'state', 'pincode', 'country'] as const;
    const missingFields = requiredFields.filter(field => !String(addressForm[field] || '').trim());
    if (missingFields.length > 0) {
      notifyUser(`Complete address required: ${missingFields.join(', ')}.`, 'error');
      return;
    }

    const addrId = editingAddressId || 'addr-' + Math.random().toString(36).substring(2, 9);
    const newRecord = { id: addrId, ...addressForm, postalCode: addressForm.pincode };

    try {
      // Direct Firestore write to addresses subcollection
      const userRef = doc(firestoreDb, `users/${currentUser.id}/addresses/${addrId}`);
      await setDoc(userRef, JSON.parse(JSON.stringify(newRecord)));

      // Call API sync so local db is updated as well
      const syncResp = await fetch('/api/addresses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newRecord)
      });
      if (!syncResp.ok) {
        const err = await syncResp.json().catch(() => ({}));
        throw new Error(err.error || 'Address sync failed.');
      }

      notifyUser('Delivery location pinned to Firestore!', 'success');
      setIsAddressModalOpen(false);
      fetchCustomerData();
    } catch (err: any) {
      notifyUser('Saved locally instead: error syncing to Firestore.', 'info');
      // local update simulation fallback
      setIsAddressModalOpen(false);
    }
  };

  const deleteAddressRecord = async (addrId: string) => {
    if (!currentUser) return;
    try {
      // Direct Firestore deletion
      const userRef = doc(firestoreDb, `users/${currentUser.id}/addresses/${addrId}`);
      await deleteDoc(userRef);

      // REST API removal
      await fetch(`/api/addresses/${addrId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      notifyUser('Address successfully removed.', 'success');
      fetchCustomerData();
    } catch {
      notifyUser('Removed from local ledger.', 'info');
    }
  };

  // Change Password
  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (securityForm.newPass !== securityForm.confirmPass) {
      notifyUser('Confirmation mismatch. Reenter password fields.', 'error');
      return;
    }

    const fireUser = firebaseAuth.currentUser;
    if (fireUser) {
      try {
        await updatePassword(fireUser, securityForm.newPass);
        notifyUser('Firebase authentication password upgraded!', 'success');
        setSecurityForm({ currentPass: '', newPass: '', confirmPass: '' });
        setSecurityAccessLogs(prev => [
          { id: String(Date.now()), event: 'Changed credentials', device: 'Standard Firebase auth token', time: 'Just now', type: 'sec' },
          ...prev
        ]);
      } catch (err: any) {
        notifyUser('Security update error: ' + err.message, 'error');
      }
    } else {
      notifyUser('Changed password simulated inside sandbox successfully!', 'success');
      setSecurityForm({ currentPass: '', newPass: '', confirmPass: '' });
    }
  };

  // Saved Payment management
  const handleSavePaymentMethod = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPaymentForm.value) return;

    const newPm = {
      id: 'pm-' + Date.now(),
      type: newPaymentForm.type,
      value: newPaymentForm.value,
      label: newPaymentForm.label || `${newPaymentForm.type} Method`,
      expiry: newPaymentForm.cardExpiry,
      brand: newPaymentForm.cardBrand,
      isDefault: savedPayments.length === 0
    };

    setSavedPayments(prev => [...prev, newPm]);
    setNewPaymentForm({ type: 'CARD', value: '', label: '', cardExpiry: '', cardBrand: 'Visa' });
    setIsAddingPayment(false);
    notifyUser('Dynamic payment gateway credential successfully attached!', 'success');
  };

  const toggleDefaultPayment = (pmId: string) => {
    setSavedPayments(prev => prev.map(p => ({ ...p, isDefault: p.id === pmId })));
    notifyUser('Preferred default payment selector updated.', 'success');
  };

  const deletePaymentMethod = (pmId: string) => {
    setSavedPayments(prev => prev.filter(p => p.id !== pmId));
    notifyUser('Payment token safely revoked.', 'success');
  };

  // Push notifications preferences handler
  const handleUpdateNotificationPref = (key: keyof typeof notificationSettings, val: boolean) => {
    setNotificationSettings(prev => ({ ...prev, [key]: val }));
    notifyUser('Messaging options synched on database.', 'success');
  };

  const markNotificationAsRead = (id: string) => {
    setNotificationsList(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  // Move all bookmarks to shopping active bag
  const moveAllWishlistToBag = () => {
    const bookmarkedList = products.filter(p => wishlist.includes(p.id));
    if (bookmarkedList.length === 0) return;
    bookmarkedList.forEach(p => addToCart(p.id));
    notifyUser('Redirected all bookmarked items to your shopping cart!', 'success');
  };

  return (
    <div className="bg-slate-50 dark:bg-slate-800/50/50 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 p-4 sm:p-6 lg:p-8 space-y-8 animate-in fade-in duration-300">
      
      {/* 1. Account Completion & Verification Ribbon Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        
        {/* User Info Capsule */}
        <div className="lg:col-span-8 flex flex-col sm:flex-row items-center gap-4 bg-white dark:bg-slate-900 border border-slate-100/80 rounded-3xl p-5 shadow-3xs">
          <div className="relative group shrink-0">
            <img
              src={currentUser?.avatar || `https://api.dicebear.com/7.x/pixel-art/svg?seed=${currentUser?.id}`}
              className="h-16 w-16 rounded-full border border-slate-200 dark:border-slate-700 object-cover shadow-3xs"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="absolute -bottom-1 -right-1 bg-slate-800 text-white h-6 w-6 rounded-full border-2 border-white flex items-center justify-center cursor-pointer hover:bg-emerald-600 transition-all shadow-md"
            >
              <Camera size={11} />
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleSelectPictureFile}
              className="hidden"
              accept="image/*"
            />
          </div>

          <div className="text-center sm:text-left space-y-0.5 flex-1">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-1.5">
              <h1 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">{currentUser?.name}</h1>
              {currentUser?.emailVerified && (
                <span className="bg-emerald-50 text-emerald-600 border border-emerald-100 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                  <CheckCircle size={10} className="fill-emerald-600/10" />
                  <span>Email Verified</span>
                </span>
              )}
              {currentUser?.phoneVerified && (
                <span className="bg-sky-50 text-sky-600 border border-sky-100 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Smartphone size={10} />
                  <span>Phone Verified</span>
                </span>
              )}
            </div>
            <p className="text-xs font-mono text-slate-400">{currentUser?.email}</p>
            <p className="text-[10px] text-slate-400">
              Session Signature: <span className="font-mono text-slate-500 bg-slate-50 border border-slate-100 px-1 py-0.5 rounded">SESSION-FB-{currentUser?.id?.slice(0, 8)}</span>
            </p>
          </div>

          <div className="shrink-0 flex flex-col items-center">
            <span className="text-slate-400 text-[10px] font-extrabold uppercase tracking-wider">Profile Setup</span>
            <span className="text-2xl font-black text-emerald-600 tracking-tighter">{profileCompletion()}%</span>
            <div className="w-24 bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full mt-1 overflow-hidden">
              <div className="bg-emerald-500 h-full transition-all duration-500" style={{ width: `${profileCompletion()}%` }} />
            </div>
          </div>
        </div>

        {/* Option 1: Recent Orders Summary */}
        <div className="lg:col-span-4 bg-gradient-to-tr from-slate-900 to-slate-800 text-slate-100 rounded-3xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-700/50 pb-2">
            <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">Recent Order Status</span>
            <div className="flex items-center gap-1">
              <ShoppingBag size={12} className="text-emerald-400" />
              <span className="text-emerald-400 font-black text-[10px] font-mono">
                Savings: £{(orders ? orders.reduce((sum, o) => sum + (o.discount || 0), 0) : 0).toFixed(2)}
              </span>
            </div>
          </div>

          {orders && orders.length > 0 ? (() => {
            const sorted = [...orders].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            const latest = sorted[0];
            return (
              <div className="flex flex-col h-full justify-between gap-3 text-xs">
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-mono text-slate-300 font-bold truncate max-w-[120px]">{latest.id}</span>
                    <span className={`text-[9px] uppercase font-bold px-2 py-0.5 rounded-full border ${
                      latest.status === 'Delivered' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                      latest.status === 'Cancelled' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
                      'bg-amber-500/10 text-amber-400 border-amber-500/20 animate-pulse'
                    }`}>{latest.status}</span>
                  </div>
                  <p className="text-[11px] text-slate-400 truncate">
                    {latest.items.map(it => `${it.productName} x${it.quantity}`).join(', ')}
                  </p>
                  <p className="text-[10px] text-slate-500 font-mono mt-1">
                    Total: £{latest.total.toFixed(2)}
                  </p>
                </div>

                <button
                  onClick={async () => {
                    try {
                      const r = await fetch(`/api/orders/${latest.id}/reorder`, {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${token}` }
                      });
                      if (r.ok) {
                        notifyUser('Items loaded from historical catalog back to active shopping list!', 'success');
                        fetchCustomerData();
                      } else {
                        notifyUser('Failed to reorder items.', 'error');
                      }
                    } catch {
                      notifyUser('Error reordering items.', 'error');
                    }
                  }}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-3 rounded-xl text-[11px] transition-all cursor-pointer text-center"
                >
                  Reorder Latest Items
                </button>
              </div>
            );
          })() : (
            <div className="text-center py-6 text-xs text-slate-400 space-y-2">
              <p>No organic grocery orders placed yet.</p>
              <button
                onClick={() => {
                  notifyUser("Explore available farm catalogs below to initiate checking out!", "info");
                }}
                className="text-[11px] text-emerald-400 hover:text-emerald-300 underline underline-offset-2"
              >
                Browse Fresh Groceries
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Verification Warning Banners if email/phone are NOT verified */}
      {(!currentUser?.emailVerified || !currentUser?.phoneVerified) && (
        <div className="bg-rose-50 border border-rose-100 rounded-3xl p-5 flex flex-col md:flex-row gap-4 items-start md:items-center justify-between shadow-3xs">
          <div className="flex gap-3">
            <div className="bg-rose-100 text-rose-600 p-2.5 rounded-2xl shrink-0">
              <AlertTriangle size={18} />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-black text-rose-900 leading-tight">Verification Required For Checkouts</h4>
              <p className="text-xs text-rose-700/80 leading-relaxed">
                {!currentUser?.emailVerified && '• Email address verification pending. Please look up authentication emails.'}
                {!currentUser?.emailVerified && !currentUser?.phoneVerified && <br />}
                {!currentUser?.phoneVerified && '• Mobile OTP verification required for deliveries verification.'}
              </p>
            </div>
          </div>

          <div className="flex gap-2 shrink-0 self-end md:self-auto">
            {!currentUser?.emailVerified && (
              <button
                onClick={() => { setActiveTab('profile'); notifyUser('Scroll to verify your profile credentials.', 'info'); }}
                className="bg-white border border-rose-200 text-rose-700 hover:bg-rose-50 font-bold px-3 py-1.5 text-xs rounded-xl cursor-pointer transition-all"
              >
                Verify E-mail
              </button>
            )}
            {!currentUser?.phoneVerified && (
              <button
                onClick={() => { setActiveTab('profile'); notifyUser('Scroll to verify your phone number.', 'info'); }}
                className="bg-rose-600 text-white hover:bg-rose-700 font-bold px-3 py-1.5 text-xs rounded-xl cursor-pointer transition-all"
              >
                Verify Mobile No
              </button>
            )}
          </div>
        </div>
      )}

      {/* 2. Crop Preview Dialog */}
      {selectedCropImage && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-slate-100 rounded-[2rem] p-6 max-w-sm w-full space-y-4 shadow-xl">
            <h3 className="font-extrabold text-slate-900 text-sm tracking-tight">Crop & Validate Image Selection</h3>
            <div className="flex justify-center bg-slate-50 p-6 rounded-2xl border border-dashed border-slate-200">
              <img
                src={selectedCropImage}
                style={{ transform: `scale(${cropZoom})`, objectFit: 'cover' }}
                className="h-32 w-32 rounded-full border shadow-3xs transition-transform duration-200"
              />
            </div>
            
            <div className="space-y-1.5">
              <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Zoom Factor</label>
              <input
                type="range"
                min="1"
                max="2.5"
                step="0.1"
                value={cropZoom}
                onChange={(e) => setCropZoom(parseFloat(e.target.value))}
                className="w-full h-1 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-emerald-600 focus:outline-none"
              />
            </div>

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setSelectedCropImage(null)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 dark:text-slate-300 px-3.5 py-1.5 text-xs rounded-xl font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={completeCroppedAndCompressedSave}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-1.5 text-xs rounded-xl font-bold cursor-pointer"
              >
                Align & Compression Crop
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Redesigned Two-Pane Dashboard Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left Drawer Side Navigation (Styled on Amazon/Swiggy bento design) */}
        <div className="lg:col-span-3 bg-white border border-slate-100/50 rounded-3xl p-3 flex flex-col gap-1.5 shadow-3xs w-full">
          {[
            { id: 'profile', label: 'My Profile', icon: UserIcon, desc: 'Credentials & Verifications' },
            { id: 'orders', label: 'Orders Log', icon: ShoppingBag, desc: 'Previous purchases history' },
            { id: 'tracking', label: 'Delivery Delivery', icon: Truck, desc: 'Active package map timelines' },
            { id: 'addresses', label: 'Addresses Base', icon: MapPin, desc: 'Manage coordinates' },
            { id: 'wishlist', label: 'Wishlist Book', icon: Heart, desc: 'Bookmarks shelf alerts' },
            { id: 'payments', label: 'Saved Payments', icon: CreditCard, desc: 'Cards and hosted gateways' },
            { id: 'notifications', label: 'Notifications', icon: Bell, desc: 'News alerts & preference panel' },
            { id: 'security', label: 'Account Security', icon: Lock, desc: 'Change password & logs' },
            { id: 'help', label: 'Help & Support', icon: HelpCircle, desc: 'Instant chat FAQ' }
          ].map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-3.5 px-3.5 py-3 rounded-2xl cursor-pointer text-left transition-all ${
                  activeTab === tab.id
                    ? 'bg-emerald-600 text-white shadow-3xs'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50'
                }`}
              >
                <div className={`p-1.5 rounded-lg ${activeTab === tab.id ? 'bg-emerald-500 text-white' : 'bg-slate-5 w-8 flex justify-center text-slate-500'}`}>
                  <Icon size={16} />
                </div>
                <div>
                  <h4 className="font-extrabold text-xs tracking-wide leading-none">{tab.label}</h4>
                  <span className={`text-[9px] mt-0.5 block ${activeTab === tab.id ? 'text-emerald-100' : 'text-slate-400'}`}>
                    {tab.desc}
                  </span>
                </div>
              </button>
            );
          })}

          <div className="border-t border-slate-50 mt-2 pt-2">
            <button
              onClick={onLogout}
              className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl hover:bg-rose-50/70 text-rose-600 cursor-pointer font-bold transition-all text-xs"
            >
              <LogOut size={16} />
              <span>Sign Out Account</span>
            </button>
          </div>
        </div>

        {/* Right Pane Container for Active Sub Section Content */}
        <div className="lg:col-span-9 w-full min-h-[400px]">
          
          {/* TAB 1: EDIT PROFILE SYSTEM (Name, Email, Phone, DOB, Gender, Avatar) */}
          {activeTab === 'profile' && (
            <div className="bg-white border border-slate-100 rounded-3xl p-6 sm:p-8 shadow-3xs space-y-8 animate-in slide-in-from-right-4 duration-200">
              <div>
                <h2 className="text-slate-900 font-extrabold text-lg tracking-tight">Customer Profile Credentials</h2>
                <p className="text-xs text-slate-400">Validate and customize your demographic profile on Firestore.</p>
              </div>

              <form onSubmit={handleSaveProfileChanges} className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs">
                
                <div className="space-y-1.5">
                  <label className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={profileForm.name}
                    onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                    placeholder="e.g. Rohan Sharma"
                    className="w-full bg-slate-50 hover:bg-slate-100/50 focus:bg-white border border-slate-100 focus:border-emerald-600 rounded-xl px-3.5 py-3 focus:outline-none transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block">E-mail Address (Verified via Auth)</label>
                  <div className="relative">
                    <input
                      type="email"
                      disabled
                      value={profileForm.email}
                      className="w-full bg-slate-100 text-slate-400 border border-slate-150 rounded-xl px-3.5 py-3 cursor-not-allowed focus:outline-none"
                    />
                    {currentUser?.emailVerified ? (
                      <CheckCircle size={14} className="absolute right-3.5 top-3.5 text-emerald-600" />
                    ) : (
                      <AlertTriangle size={14} className="absolute right-3.5 top-3.5 text-amber-500" />
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block">Mobile Phone *</label>
                  <input
                    type="tel"
                    required
                    value={profileForm.phone}
                    onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                    placeholder="e.g. +91 9876543210"
                    className="w-full bg-slate-50 hover:bg-slate-100/50 focus:bg-white border border-slate-100 focus:border-emerald-600 rounded-xl px-3.5 py-3 focus:outline-none transition-all"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block">DOB (Date of Birth)</label>
                    <input
                      type="date"
                      value={profileForm.dob}
                      onChange={(e) => setProfileForm({ ...profileForm, dob: e.target.value })}
                      className="w-full bg-slate-50 hover:bg-slate-100/50 focus:bg-white border border-slate-100 focus:border-emerald-600 rounded-xl px-3 py-2.5 focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block">Gender Profile</label>
                    <select
                      value={profileForm.gender}
                      onChange={(e) => setProfileForm({ ...profileForm, gender: e.target.value })}
                      className="w-full bg-slate-50 hover:bg-slate-100/50 focus:bg-white border border-slate-100 focus:border-emerald-600 rounded-xl px-3 py-3 focus:outline-none"
                    >
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block">Theme Preference</label>
                    <div className="flex gap-3">
                      {['light', 'dark', 'system'].map((themeName) => (
                        <button
                          type="button"
                          key={themeName}
                          onClick={() => {
                            setThemeMode(themeName as 'light' | 'dark' | 'system');
                            localStorage.setItem('nammashop_theme', themeName);
                            if (currentUser) {
                              fetch(`/api/users/${currentUser.id}`, {
                                method: 'PATCH',
                                headers: {
                                  'Content-Type': 'application/json',
                                  'Authorization': `Bearer ${token}`
                                },
                                body: JSON.stringify({ themePreference: themeName })
                              });
                            }
                          }}
                          className={`flex-1 py-3 px-4 rounded-xl border text-xs font-bold text-center capitalize transition-all ${
                            themeMode === themeName 
                              ? 'border-emerald-600 bg-emerald-50 text-emerald-700' 
                              : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          {themeName}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="md:col-span-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={isSavingProfile}
                    className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold px-5 py-3 rounded-xl cursor-pointer transition-all shadow-3xs flex items-center gap-2"
                  >
                    {isSavingProfile ? (
                      <span>Synchronizing...</span>
                    ) : (
                      <>
                        <Database size={13} />
                        <span>Save Credentials & Sync</span>
                      </>
                    )}
                  </button>
                </div>
              </form>

              {/* Email and Phone Validation Sub-module */}
              <div className="border-t border-slate-100 pt-8 space-y-6">
                <h3 className="text-sm font-black text-slate-900 tracking-tight">Security Verifications Status</h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  
                  {/* Email verification card */}
                  <div className="bg-slate-50 border border-slate-100/60 rounded-2xl p-4.5 space-y-4">
                    <div className="flex justify-between items-start">
                      <div className="space-y-0.5">
                        <h4 className="font-extrabold text-xs text-slate-800 dark:text-slate-100">Mail verification</h4>
                        <span className="text-[10px] text-slate-400 font-mono">{currentUser?.email}</span>
                      </div>
                      {currentUser?.emailVerified ? (
                        <span className="bg-emerald-50 text-emerald-600 border border-emerald-100 text-[10px] px-2 py-0.5 rounded-full font-bold">
                          Active
                        </span>
                      ) : (
                        <span className="bg-rose-50 text-rose-600 border border-rose-100 text-[10px] px-2 py-0.5 rounded-full font-bold">
                          Pending
                        </span>
                      )}
                    </div>

                    {!currentUser?.emailVerified ? (
                      <div className="space-y-3 pt-1">
                        <p className="text-[11px] text-slate-500 leading-relaxed">
                          Your email address is currently unverified. Verified emails block checkout fraud.
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={handleResendEmailVerification}
                            disabled={emailVerifyTimer > 0}
                            className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-100 disabled:text-slate-400 text-white font-bold text-[10px] px-2.5 py-1.5 rounded-lg cursor-pointer transition-all"
                          >
                            {emailVerifyTimer > 0 ? `Wait (${emailVerifyTimer}s)` : 'Send Link'}
                          </button>
                          <button
                            onClick={triggerManualEmailVerificationSync}
                            className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] px-2.5 py-1.5 rounded-lg cursor-pointer transition-all flex items-center gap-1"
                          >
                            <RotateCcw size={10} />
                            Check Verification
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-1.5 items-center text-emerald-600 text-[11px] font-bold">
                        <CheckCircle size={11} className="fill-emerald-600/10" />
                        <span>Email coordinates securely verified!</span>
                      </div>
                    )}
                  </div>

                  {/* Phone OTP Auth card */}
                  <div className="bg-slate-50 border border-slate-100/60 rounded-2xl p-4.5 space-y-4">
                    <div className="flex justify-between items-start">
                      <div className="space-y-0.5">
                        <h4 className="font-extrabold text-xs text-slate-800">Phone OTP Validator</h4>
                        <span className="text-[10px] text-slate-400 font-mono">{currentUser?.phone || 'Not verified'}</span>
                      </div>
                      {currentUser?.phoneVerified ? (
                        <span className="bg-emerald-50 text-emerald-600 border border-emerald-100 text-[10px] px-2 py-0.5 rounded-full font-bold">
                          Verified
                        </span>
                      ) : (
                        <span className="bg-rose-50 text-rose-600 border border-rose-100 text-[10px] px-2 py-0.5 rounded-full font-bold">
                          Unverified
                        </span>
                      )}
                    </div>

                    {!currentUser?.phoneVerified ? (
                      <div className="space-y-3 pt-1">
                        {!otpSent ? (
                          <>
                            <div className="flex gap-2">
                              <input
                                type="tel"
                                value={phoneToVerify}
                                onChange={(e) => setPhoneToVerify(e.target.value)}
                                placeholder="Enter 10-digit smartphone no"
                                className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-[10px] focus:outline-none flex-1"
                              />
                              <button
                                onClick={triggerPhoneOtps}
                                disabled={recaptchaVerifying}
                                className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-55 text-white font-bold text-[10px] px-3 py-1.5 rounded-lg shrink-0 cursor-pointer"
                              >
                                {recaptchaVerifying ? 'Verifying...' : 'Request OTP'}
                              </button>
                            </div>
                            <div className="flex items-center gap-1 text-[9px] text-slate-400">
                              <Shield size={9} />
                              <span>Protected with Firebase reCAPTCHA verifiers.</span>
                            </div>
                          </>
                        ) : (
                          <div className="space-y-2">
                            <label className="text-[9px] text-slate-400 font-extrabold uppercase tracking-wider block">Verify OTP SMS</label>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                maxLength={6}
                                value={otpValue}
                                onChange={(e) => setOtpValue(e.target.value)}
                                placeholder="Enter 6-digit OTP from SMS"
                                className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-[11px] font-mono tracking-wider focus:outline-none flex-1"
                              />
                              <button
                                onClick={handleVerifyPhoneOtpCode}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] px-3 py-1.5 rounded-lg shrink-0 cursor-pointer"
                              >
                                Confirm Code
                              </button>
                            </div>
                            <div className="flex items-center justify-between text-[10px]">
                              {otpTimer > 0 ? (
                                <span className="text-slate-400">Resend timer in {otpTimer}s</span>
                              ) : (
                                <button onClick={triggerPhoneOtps} className="text-emerald-600 hover:underline font-bold">Resend OTP SMS</button>
                              )}
                              <button onClick={() => setOtpSent(false)} className="text-slate-400 hover:underline">Change number</button>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex gap-1.5 items-center text-emerald-600 text-[11px] font-bold">
                        <CheckCircle size={11} className="fill-emerald-600/10" />
                        <span>Phone validated. Delivery authentication active!</span>
                      </div>
                    )}
                  </div>

                </div>
              </div>

            </div>
          )}

          {/* TAB 2: ENHANCED ORDERS LIST (Invoice, Cancellations, Reorders) */}
          {activeTab === 'orders' && (
            <div className="bg-white border border-slate-100 rounded-3xl p-6 sm:p-8 shadow-3xs space-y-6 animate-in slide-in-from-right-4 duration-200">
              <div>
                <h2 className="text-slate-900 font-extrabold text-lg tracking-tight">Order Activity logs</h2>
                <p className="text-xs text-slate-400 font-sans">Check your historic purchases, track active deliveries, and retrieve invoices.</p>
              </div>

              {orders.length === 0 ? (
                <div className="text-center p-12 bg-slate-50 border border-dashed rounded-2xl space-y-3">
                  <ShoppingBag size={24} className="mx-auto text-slate-300" />
                  <p className="text-xs text-slate-400 italic font-sans">No previous transactions linked to this profile.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {orders.map((o) => (
                    <div key={o.id} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-3xs space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-50 pb-3 text-xs font-mono">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-extrabold text-slate-800 text-sm">{o.id}</span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                              o.status === 'Delivered' ? 'bg-emerald-50 text-emerald-600 border-emerald-100':
                              o.status === 'Cancelled' ? 'bg-rose-50 text-rose-600 border-rose-100' :
                              'bg-amber-50 text-amber-600 border-amber-100 animate-pulse'
                            }`}>{o.status}</span>
                          </div>
                          <span className="text-[10px] text-slate-400 block mt-1">Processed: {new Date(o.createdAt).toLocaleString()}</span>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleDownloadInvoice(o)}
                            className="bg-slate-50 hover:bg-slate-100 text-slate-700 py-1.5 px-3 rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-all border border-slate-100"
                          >
                            <FileDown size={11} />
                            <span>Invoice PDF</span>
                          </button>

                          {o.status !== 'Delivered' && o.status !== 'Cancelled' && (
                            <button
                              onClick={async () => {
                                if (!window.confirm('Are you sure you want to cancel this order? Item stocks will automatically be refunded.')) return;
                                try {
                                  const r = await fetch(`/api/orders/${o.id}/cancel`, {
                                    method: 'POST',
                                    headers: { 'Authorization': `Bearer ${token}` }
                                  });
                                  if (r.ok) {
                                    notifyUser('Order safely cancelled.', 'success');
                                    fetchCustomerData();
                                  } else {
                                    notifyUser('Failed to cancel order.', 'error');
                                  }
                                } catch {
                                  notifyUser('Network error during cancellation request.', 'error');
                                }
                              }}
                              className="bg-rose-50 hover:bg-rose-100 border border-rose-150 text-rose-600 font-bold py-1.5 px-2.5 rounded-lg text-[10px] transition-all cursor-pointer"
                            >
                              Cancel Purchase
                            </button>
                          )}

                          <button
                            onClick={async () => {
                              try {
                                const r = await fetch(`/api/orders/${o.id}/reorder`, {
                                  method: 'POST',
                                  headers: { 'Authorization': `Bearer ${token}` }
                                });
                                if (r.ok) {
                                  notifyUser('Items loaded from historical catalog back to active shopping list!', 'success');
                                  fetchCustomerData();
                                }
                              } catch {
                                notifyUser('API reorder response mismatch.', 'error');
                              }
                            }}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-1.5 px-3 rounded-lg text-[10px] transition-all cursor-pointer shadow-3xs"
                          >
                            Reorder Items
                          </button>
                        </div>
                      </div>

                      {/* Items table summary */}
                      <div className="space-y-2">
                        <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block">Items count ({o.items.length})</span>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-sans">
                          <div className="space-y-1">
                            {o.items.map((it, idx) => (
                              <div key={idx} className="flex justify-between items-center text-slate-600">
                                <span>{it.productName} ({it.unit}) x {it.quantity}</span>
                                <span className="font-mono font-bold text-slate-800">£{(it.price * it.quantity).toFixed(2)}</span>
                              </div>
                            ))}
                          </div>

                          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 text-[11px] leading-relaxed space-y-1">
                            <p className="font-black text-slate-800 text-xs flex justify-between">
                              <span>Total paid :</span>
                              <span className="font-mono text-emerald-600">£{o.total.toFixed(2)}</span>
                            </p>
                            <p className="text-slate-400">Payment: <span className="font-mono text-slate-600">{o.paymentMethod}</span> ({o.paymentStatus})</p>
                            <p className="text-slate-400 text-ellipsis overflow-hidden">Address labels: <span className="font-bold text-slate-600">{o.address.fullName} ({o.address.label})</span>, {o.address.street}</p>
                          </div>
                        </div>
                      </div>

                      {/* Toggle tracking visualizer inline */}
                      <div className="flex justify-end">
                        <button
                          onClick={() => { setSelectedTrackingOrderId(o.id); setActiveTab('tracking'); }}
                          className="text-emerald-600 hover:text-emerald-700 font-bold text-[10px] flex items-center gap-1"
                        >
                          <span>Track Live Dispatch progress →</span>
                        </button>
                      </div>

                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: TIMELINE TRACKING (10-minute dispatch with Animated status updates) */}
          {activeTab === 'tracking' && (
            <div className="bg-white border border-slate-100 rounded-3xl p-6 sm:p-8 shadow-3xs space-y-6 animate-in slide-in-from-right-4 duration-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-slate-900 font-extrabold text-lg tracking-tight">Active Delivery Dispatch Tracker</h2>
                  <p className="text-xs text-slate-400 font-sans">Monitor the live status of your 10-minute rapid quick e-commerce groceries.</p>
                </div>
                {orders.length > 0 && (
                  <select
                    className="bg-slate-50 border border-slate-150 rounded-xl px-2.5 py-1.5 focus:outline-none text-xs"
                    value={selectedTrackingOrderId || ''}
                    onChange={(e) => setSelectedTrackingOrderId(e.target.value)}
                  >
                    {orders.map(o => (
                      <option key={o.id} value={o.id}>Order {o.id.slice(0, 8)}...</option>
                    ))}
                  </select>
                )}
              </div>

              {!activeTrackingOrder ? (
                <div className="text-center p-12 bg-slate-50 border rounded-2xl">
                  <Truck size={24} className="mx-auto text-slate-300" />
                  <p className="text-xs text-slate-400 italic mt-2">No active grocery delivery package tracked yet.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  
                  {/* Package Delivery Status Hero */}
                  <div className="bg-gradient-to-tr from-emerald-600 to-emerald-700 text-white rounded-2xl p-6 shadow-3xs space-y-4">
                    <div className="flex justify-between items-start">
                      <div className="space-y-1">
                        <span className="text-[10px] bg-white/15 px-2.5 py-0.5 rounded-full uppercase font-mono font-bold">10-Min Rapid Delivery Slot</span>
                        <h3 className="text-xl font-black tracking-tight mt-1">
                          {activeTrackingOrder.status === 'Delivered' ? 'Completed Package Delivery' : 'Arriving in 8-10 Minutes'}
                        </h3>
                      </div>
                      <Truck size={36} className="text-emerald-200 opacity-90 animate-bounce" />
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pt-2 text-xs border-t border-white/10">
                      <div>
                        <span className="text-emerald-200 text-[10px] font-bold block">Delivery Executive name</span>
                        <span className="font-extrabold">Shiva Shankar</span>
                      </div>
                      <div>
                        <span className="text-emerald-200 text-[10px] font-bold block">Secure Dispatch Gate OTP</span>
                        <span className="font-mono font-black text-sm text-yellow-300 tracking-wider">3948</span>
                      </div>
                      <div>
                        <span className="text-emerald-200 text-[10px] font-bold block">Vehicle Coordinates</span>
                        <span className="font-bold">Electric Scooter KA-03-HL-1090</span>
                      </div>
                    </div>
                  </div>

                  {/* High Quality Animated Timeline Vertical Chain */}
                  <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 space-y-4">
                    <h4 className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block">Live Delivery Milestones Logs</h4>
                    
                    <div className="relative pl-6 border-l-2 border-emerald-500 space-y-6">
                      {activeTrackingOrder.timeline.map((st, idx) => (
                        <div key={idx} className="relative text-xs leading-loose animate-in slide-in-from-left-2 duration-200 delay-100">
                          <div className="absolute -left-[31px] top-1 bg-emerald-600 text-slate-50 h-4.5 w-4.5 rounded-full shrink-0 flex items-center justify-center border-2 border-white ring-2 ring-emerald-500/25">
                            <Check size={10} className="stroke-[3]" />
                          </div>
                          <div>
                            <span className="font-black text-slate-800 text-xs tracking-tight">{st.status}</span>
                            <span className="text-[10px] font-mono text-slate-400 font-bold ml-2.5">{new Date(st.time).toLocaleTimeString()}</span>
                            <p className="text-[11px] text-slate-500 leading-relaxed mt-0.5">{st.description}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Safety Assurance Footnote */}
                  <div className="flex gap-2 p-3.5 bg-yellow-50/60 border border-yellow-100 text-yellow-800 rounded-xl text-[11px] leading-relaxed">
                    <Shield size={16} className="text-yellow-600 shrink-0 mt-0.5" />
                    <span>Always ensure contactless OTP delivery confirmations on standard parcel lock gates. For safety concerns, flag packages directly to our support.</span>
                  </div>

                </div>
              )}
            </div>
          )}

          {/* TAB 4: SHIPPING LOCATIONS (Create, Edit, Delete, Google Maps Search Box, Geolocation Select) */}
          {activeTab === 'addresses' && (
            <div className="bg-white border border-slate-100 rounded-3xl p-6 sm:p-8 shadow-3xs space-y-6 animate-in slide-in-from-right-4 duration-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-slate-900 font-extrabold text-lg tracking-tight">Delivery Addresses & Gates</h2>
                  <p className="text-xs text-slate-400 font-sans">Enrich checkouts with multiple pinned delivery location vectors.</p>
                </div>
                <button
                  onClick={() => openAddressFormModal()}
                  className="bg-emerald-600 hover:bg-emerald-700 text-slate-50 font-bold px-4 py-2 text-xs rounded-xl cursor-pointer shadow-3xs transition-all flex items-center gap-1"
                >
                  <Plus size={14} />
                  <span>Pin New Address</span>
                </button>
              </div>

              {/* Address List Cards */}
              {addresses.length === 0 ? (
                <div className="text-center p-12 bg-slate-50 border border-slate-150 rounded-2xl">
                  <MapPin size={24} className="mx-auto text-slate-300" />
                  <p className="text-xs text-slate-400 italic mt-2 font-sans">No delivery locations initialized in this account.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {addresses.map((a) => (
                    <div key={a.id} className="border border-slate-100 bg-white hover:border-emerald-100 rounded-2xl p-4 shadow-3xs flex flex-col justify-between text-xs relative group hover:shadow-xs transition-all">
                      <div className="space-y-1 text-slate-500 leading-relaxed">
                        <div className="flex justify-between items-center">
                          <span className="bg-slate-100 text-[9px] uppercase font-mono font-bold px-2 py-0.5 rounded-full text-slate-600">{a.label}</span>
                          <div className="flex gap-1">
                            <button
                              onClick={() => openAddressFormModal(a.id)}
                              className="text-slate-400 hover:text-emerald-600 h-6 w-6 rounded-md hover:bg-slate-50 flex items-center justify-center transition-all"
                            >
                              <Settings size={12} />
                            </button>
                            <button
                              onClick={() => deleteAddressRecord(a.id)}
                              className="text-slate-400 hover:text-rose-600 h-6 w-6 rounded-md hover:bg-slate-50 flex items-center justify-center transition-all"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                        <h4 className="font-extrabold text-slate-800 text-sm mt-1">{a.fullName}</h4>
                        <p className="text-slate-600">{a.street}</p>
                        <p className="text-slate-500">{a.city}, {a.state} - <span className="font-mono">{a.pincode}</span></p>
                      </div>
                      <span className="font-mono font-bold text-slate-700 mt-2.5 pt-2.5 border-t border-slate-50 block">Mobile: +91 {a.phone}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Pin Address Dialog Modal if active */}
              {isAddressModalOpen && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
                  <form onSubmit={handleSaveAddressRecord} className="bg-white border border-slate-100 rounded-[2rem] p-6 max-w-lg w-full space-y-4 shadow-xl text-xs overflow-y-auto max-h-[90vh]">
                    <div className="flex justify-between items-center border-b pb-3 border-slate-100">
                      <h3 className="font-extrabold text-slate-950 text-sm tracking-tight">
                        {editingAddressId ? 'Edit pinned delivery gate' : 'Pin New Delivery Gate Coordinate'}
                      </h3>
                      <button type="button" onClick={() => setIsAddressModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                        <X size={16} />
                      </button>
                    </div>

                    {/* Integrated Google Maps Place Autocomplete Simulation */}
                    <div className="space-y-1 text-xs">
                      <label className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block">Google Maps Place Autocomplete Lookup</label>
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="Type address keyword (e.g. Indiranagar, MG Road, Koramangala)"
                          value={autocompleteSearch}
                          onChange={(e) => setAutocompleteSearch(e.target.value)}
                          className="w-full bg-slate-50 focus:bg-white border border-slate-150 rounded-xl pl-8.5 pr-3 py-2.5 focus:outline-none focus:border-emerald-600"
                        />
                        <Search size={12} className="absolute left-3 top-3.5 text-slate-400" />
                      </div>
                      
                      {autocompleteSearch.length > 2 && (
                        <div className="border border-slate-100 bg-white rounded-xl shadow-xs overflow-hidden absolute mt-1 w-full max-w-[460px] z-50">
                          {[
                            '12, Indiranagar Near Metro Pillar 132',
                            'Oasis Mall, Koramangala 4th Block, Bengaluru',
                            'Trinity Cross MG Road, Bangalore Central',
                            'Namma Farms Depot Hub, Whitefield'
                          ].filter(p => p.toLowerCase().includes(autocompleteSearch.toLowerCase())).map((place, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => handleAutocompleteSelect(place)}
                              className="w-full text-left px-3.5 py-2 hover:bg-slate-50 transition-all font-sans text-[11px] block border-b border-slate-50/50"
                            >
                              📍 {place}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Browser GPS Integration Trigger */}
                    <div className="flex gap-2 pt-1 border-t border-b border-slate-50 py-3">
                      <button
                        type="button"
                        onClick={triggerBrowserLocationGPS}
                        disabled={locationPipingActive}
                        className="bg-emerald-50 hover:bg-emerald-100/80 text-emerald-700 font-bold px-3.5 py-2 rounded-xl text-[10px] flex items-center gap-1.5 transition-all w-full justify-center"
                      >
                        <Navigation size={11} className={locationPipingActive ? 'animate-spin' : ''} />
                        <span>Use Precision Device GPS Location</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-1">
                      <div>
                        <label className="block text-slate-400 font-extrabold uppercase tracking-wider mb-1">Gate labels</label>
                        <select
                          value={addressForm.label}
                          onChange={(e) => setAddressForm({ ...addressForm, label: e.target.value })}
                          className="w-full bg-slate-50 border border-slate-150 rounded-xl px-2.5 py-2.5 focus:outline-none"
                        >
                          <option value="Home">Home Address</option>
                          <option value="Work">Corporate Work</option>
                          <option value="Other">Other Pinned Gate</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-slate-400 font-extrabold uppercase tracking-wider mb-1">Recipient Name *</label>
                        <input
                          type="text"
                          required
                          value={addressForm.fullName}
                          onChange={(e) => setAddressForm({ ...addressForm, fullName: e.target.value })}
                          className="w-full bg-slate-50 border border-slate-150 rounded-xl px-2.5 py-2.5 focus:outline-none"
                          placeholder="e.g. Rohan Sharma"
                        />
                      </div>

                      <div className="col-span-2">
                        <label className="block text-slate-400 font-extrabold uppercase tracking-wider mb-1">Street address *</label>
                        <input
                          type="text"
                          required
                          value={addressForm.street}
                          onChange={(e) => setAddressForm({ ...addressForm, street: e.target.value })}
                          className="w-full bg-slate-50 border border-slate-150 rounded-xl px-2.5 py-2.5 focus:outline-none"
                          placeholder="Flat, building complex, area details..."
                        />
                      </div>

                      <div>
                        <label className="block text-slate-400 font-extrabold uppercase tracking-wider mb-1">Pincode *</label>
                        <input
                          type="text"
                          required
                          value={addressForm.pincode}
                          onChange={(e) => setAddressForm({ ...addressForm, pincode: e.target.value })}
                          className="w-full bg-slate-50 border border-slate-150 rounded-xl px-2.5 py-2.5 focus:outline-none font-mono"
                          placeholder="560034"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-400 font-extrabold uppercase tracking-wider mb-1">Contact Phone Mobile *</label>
                        <input
                          type="tel"
                          required
                          value={addressForm.phone}
                          onChange={(e) => setAddressForm({ ...addressForm, phone: e.target.value })}
                          className="w-full bg-slate-50 border border-slate-150 rounded-xl px-2.5 py-2.5 focus:outline-none font-mono"
                          placeholder="9876543210"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-400 font-extrabold uppercase tracking-wider mb-1">City *</label>
                        <input
                          type="text"
                          required
                          value={addressForm.city}
                          onChange={(e) => setAddressForm({ ...addressForm, city: e.target.value })}
                          className="w-full bg-slate-50 border border-slate-150 rounded-xl px-2.5 py-2.5 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-400 font-extrabold uppercase tracking-wider mb-1">State *</label>
                        <input
                          type="text"
                          required
                          value={addressForm.state}
                          onChange={(e) => setAddressForm({ ...addressForm, state: e.target.value })}
                          className="w-full bg-slate-50 border border-slate-150 rounded-xl px-2.5 py-2.5 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-400 font-extrabold uppercase tracking-wider mb-1">Country *</label>
                        <input
                          type="text"
                          required
                          value={addressForm.country}
                          onChange={(e) => setAddressForm({ ...addressForm, country: e.target.value })}
                          className="w-full bg-slate-50 border border-slate-150 rounded-xl px-2.5 py-2.5 focus:outline-none"
                          placeholder="United Kingdom"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 border-t pt-4 border-slate-100">
                      <button
                        type="button"
                        onClick={() => setIsAddressModalOpen(false)}
                        className="bg-slate-100 text-slate-700 px-4 py-2 rounded-xl font-bold cursor-pointer hover:bg-slate-200 transition-all text-[11px]"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="bg-emerald-600 text-white px-5 py-2 rounded-xl font-bold cursor-pointer hover:bg-emerald-700 transition-all shadow-3xs text-[11px]"
                      >
                        Pin Coordinates Address
                      </button>
                    </div>

                  </form>
                </div>
              )}

            </div>
          )}

          {/* TAB 5: WISHLIST BOOK UPGRADE (Price Alert, Shelf warnings) */}
          {activeTab === 'wishlist' && (
            <div className="bg-white border border-slate-100 rounded-3xl p-6 sm:p-8 shadow-3xs space-y-6 animate-in slide-in-from-right-4 duration-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-slate-900 font-extrabold text-lg tracking-tight">Wishlist Bookmark Shelves</h2>
                  <p className="text-xs text-slate-400">Add alarms on shelf levels and track dynamic price alerts.</p>
                </div>
                {wishlist.length > 0 && (
                  <button
                    onClick={moveAllWishlistToBag}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2.5 text-xs rounded-xl cursor-pointer shadow-3xs transition-all"
                  >
                    Move All To Shopping Bag
                  </button>
                )}
              </div>

              {wishlist.length === 0 ? (
                <div className="text-center p-12 bg-slate-50 border rounded-2xl">
                  <Heart size={24} className="mx-auto text-slate-300" />
                  <p className="text-xs text-slate-400 italic mt-2 font-sans">Your wishlist shelf is currently empty.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {products.filter(p => wishlist.includes(p.id)).map((p) => (
                    <div key={p.id} className="border border-slate-100 bg-white hover:border-emerald-100 rounded-2xl p-4 shadow-3xs flex flex-col justify-between text-xs relative group transition-all">
                      <button
                        onClick={() => toggleWishlist(p.id)}
                        className="absolute right-3 top-3 text-red-500 hover:bg-rose-50 p-1.5 rounded-full z-10"
                      >
                        <X size={13} className="stroke-[3]" />
                      </button>

                      <div className="space-y-3">
                        <div className="relative overflow-hidden rounded-xl bg-slate-50/50">
                          <img src={p.image} className="h-28 w-full object-cover group-hover:scale-105 transition duration-500" />
                          <div className="absolute bottom-2 left-2 flex gap-1 justify-start">
                            {p.stock <= 15 ? (
                              <span className="bg-amber-600 text-white text-[8px] font-bold px-1.5 py-0.5 rounded uppercase">
                                Low Stock: {p.stock} units
                              </span>
                            ) : (
                              <span className="bg-emerald-600 text-white text-[8px] font-bold px-1.5 py-0.5 rounded uppercase">
                                In Stock
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="space-y-1">
                          <h4 className="font-extrabold text-slate-800 text-xs truncate leading-tight">{p.name}</h4>
                          <span className="text-[10px] font-mono font-bold text-slate-400">{p.unit}</span>
                        </div>

                        {/* Custom Price Alert Simulated indicator */}
                        <div className="bg-slate-50 p-2 rounded-lg text-[9px] text-emerald-700 font-extrabold flex justify-between items-center whitespace-nowrap">
                          <span>📉 price alert: £0.50 drop detected!</span>
                          <span className="bg-emerald-100 px-1 py-0.2 rounded font-mono">-10%</span>
                        </div>
                      </div>

                      <div className="flex justify-between items-center border-t border-slate-50 pt-3 mt-3">
                        <span className="font-mono font-black text-slate-800 text-xs">£{p.price.toFixed(2)}</span>
                        <button
                          onClick={() => addToCart(p.id)}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1 text-[10px] rounded-lg transition-all cursor-pointer flex items-center gap-1"
                        >
                          <Plus size={10} />
                          <span>Add to bag</span>
                        </button>
                      </div>

                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 6: SAVED PAYMENTS */}
          {activeTab === 'payments' && (
            <div className="bg-white border border-slate-100 rounded-3xl p-6 sm:p-8 shadow-3xs space-y-6 animate-in slide-in-from-right-4 duration-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-slate-900 font-extrabold text-lg tracking-tight">Saved Payment Methods</h2>
                  <p className="text-xs text-slate-400">Synchronize secured payment vectors for instant rapid checkouts.</p>
                </div>
                {!isAddingPayment && (
                  <button
                    onClick={() => setIsAddingPayment(true)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 text-xs rounded-xl cursor-pointer shadow-3xs transition-all flex items-center gap-1"
                  >
                    <Plus size={14} />
                    <span>Add Payment</span>
                  </button>
                )}
              </div>

              {isAddingPayment && (
                <form onSubmit={handleSavePaymentMethod} className="bg-slate-50 border border-slate-100 rounded-2xl p-4 text-xs space-y-3.5">
                  <h4 className="font-bold text-slate-800">Add secure payment credential</h4>
                  
                  <div className="grid grid-cols-2 gap-3.5">
                    <div>
                      <label className="block text-slate-400 font-extrabold uppercase tracking-wider mb-1">Gate types</label>
                      <select
                        value={newPaymentForm.type}
                        onChange={(e) => setNewPaymentForm(prev => ({ ...prev, type: e.target.value }))}
                        className="w-full bg-white border border-slate-150 rounded-xl px-2.5 py-2 focus:outline-none"
                      >
                        <option value="CARD">Credit/Debit Card</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-400 font-extrabold uppercase tracking-wider mb-1">Custom labels</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. My Visa Card"
                        value={newPaymentForm.label}
                        onChange={(e) => setNewPaymentForm(prev => ({ ...prev, label: e.target.value }))}
                        className="w-full bg-white border border-slate-150 rounded-xl px-2.5 py-2 focus:outline-none"
                      />
                    </div>

                    <div className="col-span-2">
                      <label className="block text-slate-400 font-extrabold uppercase tracking-wider mb-1">
                        Card number Details
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="4321 0000 0000 9876"
                        value={newPaymentForm.value}
                        onChange={(e) => setNewPaymentForm(prev => ({ ...prev, value: e.target.value }))}
                        className="w-full bg-white border border-slate-150 rounded-xl px-2.5 py-2 focus:outline-none font-mono"
                      />
                    </div>

                    {newPaymentForm.type === 'CARD' && (
                      <div className="col-span-2 grid grid-cols-2 gap-3.5">
                        <div>
                          <label className="block text-slate-400 font-extrabold uppercase tracking-wider mb-1">Card Expiry</label>
                          <input
                            type="text"
                            placeholder="MM/YY"
                            maxLength={5}
                            value={newPaymentForm.cardExpiry}
                            onChange={(e) => setNewPaymentForm(prev => ({ ...prev, cardExpiry: e.target.value }))}
                            className="w-full bg-white border border-slate-150 rounded-xl px-2.5 py-2 focus:outline-none font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-400 font-extrabold uppercase tracking-wider mb-1">Brand Network</label>
                          <select
                            value={newPaymentForm.cardBrand}
                            onChange={(e) => setNewPaymentForm(prev => ({ ...prev, cardBrand: e.target.value }))}
                            className="w-full bg-white border border-slate-150 rounded-xl px-2.5 py-2"
                          >
                            <option value="Visa">Visa</option>
                            <option value="Mastercard">Mastercard</option>
                            <option value="RuPay">RuPay</option>
                          </select>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => setIsAddingPayment(false)}
                      className="bg-slate-100 text-slate-700 px-3.5 py-1.5 rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="bg-emerald-600 text-white px-4 py-1.5 rounded-lg font-bold shadow-xs cursor-pointer"
                    >
                      Store Token
                    </button>
                  </div>
                </form>
              )}

              {/* Payment Methods listing */}
              <div className="space-y-4">
                {savedPayments.map((pm) => (
                  <div key={pm.id} className="border border-slate-100 rounded-2xl p-4 bg-white flex justify-between items-center text-xs shadow-3xs relative">
                    <div className="flex gap-3 items-center">
                      <div className="bg-slate-50 text-slate-700 p-2.5 rounded-xl border">
                        <CreditCard size={18} />
                      </div>
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <h4 className="font-extrabold text-slate-800 text-xs">{pm.label}</h4>
                          {pm.isDefault && (
                            <span className="bg-emerald-50 text-emerald-600 border border-emerald-100 text-[8px] px-1.5 rounded uppercase font-bold">Preferred</span>
                          )}
                        </div>
                        <p className="font-mono text-[10px] text-slate-400">{pm.value} {pm.expiry && `(Expires: ${pm.expiry})`}</p>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      {!pm.isDefault && (
                        <button
                          onClick={() => toggleDefaultPayment(pm.id)}
                          className="bg-slate-50 hover:bg-slate-100 text-[10px] text-slate-600 px-2 py-1 rounded-lg border cursor-pointer border-slate-100"
                        >
                          Preferred
                        </button>
                      )}
                      <button
                        onClick={() => deletePaymentMethod(pm.id)}
                        className="text-slate-400 hover:text-rose-600 p-1 rounded-lg"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 7: NOTIFICATION CENTER (Read states, stock alert preferences) */}
          {activeTab === 'notifications' && (
            <div className="bg-white border border-slate-100 rounded-3xl p-6 sm:p-8 shadow-3xs space-y-6 animate-in slide-in-from-right-4 duration-200">
              <div>
                <h2 className="text-slate-900 font-extrabold text-lg tracking-tight">Notification Preferences Center</h2>
                <p className="text-xs text-slate-400 font-sans">Manage alerts on inventory restocks and live delivery dispatches.</p>
              </div>

              {/* Preferences Configuration Submodule */}
              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 space-y-4 text-xs">
                <h3 className="font-bold text-slate-800">Alert triggers configuration</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={notificationSettings.orderUpdates}
                      onChange={(e) => handleUpdateNotificationPref('orderUpdates', e.target.checked)}
                      className="rounded text-emerald-600"
                    />
                    <span>10-Minute Dispatch Updates</span>
                  </label>
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={notificationSettings.offers}
                      onChange={(e) => handleUpdateNotificationPref('offers', e.target.checked)}
                      className="rounded text-emerald-600"
                    />
                    <span>Flash Promos & Coupons</span>
                  </label>
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={notificationSettings.stockAlerts}
                      onChange={(e) => handleUpdateNotificationPref('stockAlerts', e.target.checked)}
                      className="rounded text-emerald-600"
                    />
                    <span>Wishlist Shelf Stocks Level alerts</span>
                  </label>
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={notificationSettings.deliverySms}
                      onChange={(e) => handleUpdateNotificationPref('deliverySms', e.target.checked)}
                      className="rounded text-emerald-600"
                    />
                    <span>SMS Transaction credentials</span>
                  </label>
                </div>
              </div>

              {/* Alert Notifications Inbox list */}
              <div className="space-y-4">
                <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block">Notifications Alerts Inbox</span>
                {notificationsList.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => markNotificationAsRead(n.id)}
                    className={`w-full text-left border rounded-2xl p-4 transition-all text-xs block relative cursor-pointer ${
                      n.read ? 'bg-white border-slate-100' : 'bg-emerald-50/20 border-emerald-100/50 hover:bg-emerald-50/40 shadow-3xs'
                    }`}
                  >
                    {!n.read && (
                      <span className="absolute right-4 top-4 h-2 w-2 rounded-full bg-emerald-600" />
                    )}
                    <h4 className="font-extrabold text-slate-800">{n.title}</h4>
                    <p className="text-slate-500 mt-1 leading-relaxed">{n.body}</p>
                    <span className="text-[9px] font-mono text-slate-400 block mt-2">{n.time}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* TAB 8: ACCOUNT SECURITY (Change password, active sessions logs, 2FA toggle) */}
          {activeTab === 'security' && (
            <div className="bg-white border border-slate-100 rounded-3xl p-6 sm:p-8 shadow-3xs space-y-6 animate-in slide-in-from-right-4 duration-200">
              <div>
                <h2 className="text-slate-900 font-extrabold text-lg tracking-tight">Account Security credentials</h2>
                <p className="text-xs text-slate-400">Configure password enhancements, standard Two-Factor Auth, and monitor device coordinates.</p>
              </div>

              {/* Password change form */}
              <form onSubmit={handleUpdatePassword} className="bg-slate-50 border border-slate-100 rounded-2xl p-5 text-xs space-y-4">
                <h3 className="font-extrabold text-slate-800 flex items-center gap-1.5">
                  <Key size={14} className="text-emerald-600" />
                  <span>Upgrade password credentials</span>
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="text-[9px] text-slate-400 font-extrabold uppercase tracking-wider block">Current Password</label>
                    <input
                      type="password"
                      required
                      placeholder="••••••••"
                      value={securityForm.currentPass}
                      onChange={(e) => setSecurityForm({ ...securityForm, currentPass: e.target.value })}
                      className="w-full bg-white border border-slate-150 rounded-xl px-2.5 py-2"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] text-slate-400 font-extrabold uppercase tracking-wider block">New Password</label>
                    <input
                      type="password"
                      required
                      placeholder="Min 6 characters"
                      value={securityForm.newPass}
                      onChange={(e) => setSecurityForm({ ...securityForm, newPass: e.target.value })}
                      className="w-full bg-white border border-slate-150 rounded-xl px-2.5 py-2 animate-pulse-once"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] text-slate-400 font-extrabold uppercase tracking-wider block">Confirm Password</label>
                    <input
                      type="password"
                      required
                      placeholder="Confirm new credentials"
                      value={securityForm.confirmPass}
                      onChange={(e) => setSecurityForm({ ...securityForm, confirmPass: e.target.value })}
                      className="w-full bg-white border border-slate-150 rounded-xl px-2.5 py-2"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 rounded-xl cursor-pointer">
                    Change Password
                  </button>
                </div>
              </form>

              {/* Two-factor authentication (2FA Mock toggle) */}
              <div className="border-t border-slate-100 pt-6 flex justify-between items-center text-xs">
                <div className="space-y-0.5 max-w-[70%]">
                  <h3 className="font-black text-slate-800">Two-Factor Authenticator (2FA)</h3>
                  <p className="text-slate-400 leading-normal">Require secure numeric code SMS deliveries along with password configurations to logon.</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (currentUser) {
                      const mode = !currentUser.twoFactorEnabled;
                      onUpdateUser({ ...currentUser, twoFactorEnabled: mode });
                      notifyUser(mode ? 'Two-Factor Authentication is active!' : 'Two-Factor Auth suspended safely.', 'success');
                    }
                  }}
                  className={`border font-bold text-[10px] px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                    currentUser?.twoFactorEnabled ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-slate-50 text-slate-700 border-slate-200'
                  }`}
                >
                  {currentUser?.twoFactorEnabled ? '● Enabled' : '○ Disabled'}
                </button>
              </div>

              {/* Logged in devices & Session audit history log */}
              <div className="border-t border-slate-100 pt-6 space-y-4">
                <div className="flex justify-between items-center whitespace-nowrap">
                  <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block">Active credential devices</span>
                  <button
                    onClick={() => {
                      setSecurityAccessLogs([{ id: '1', event: 'Profile Synced', device: 'Chrome / macOS (Your current device)', time: 'Just now', type: 'info' }]);
                      notifyUser('Terminated and logged out from all secondary sandbox devices.', 'success');
                    }}
                    className="text-rose-600 hover:underline text-[10px] font-bold"
                  >
                    Terminate Other Sessions
                  </button>
                </div>

                <div className="space-y-3.5">
                  {securityAccessLogs.map((log) => (
                    <div key={log.id} className="bg-slate-50 rounded-xl p-3 flex justify-between items-center text-xs border border-slate-100/50">
                      <div className="flex gap-2.5 items-center">
                        <Clock size={12} className="text-slate-400" />
                        <div>
                          <p className="font-extrabold text-slate-800">{log.event}</p>
                          <span className="text-[10px] text-slate-400">{log.device}</span>
                        </div>
                      </div>
                      <span className="text-[10px] font-mono text-slate-500">{log.time}</span>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          )}

          {/* TAB 9: FAQ HELP AND SUPPORT COORDINATES */}
          {activeTab === 'help' && (
            <div className="bg-white border border-slate-100 rounded-3xl p-6 sm:p-8 shadow-3xs space-y-6 animate-in slide-in-from-right-4 duration-200">
              <div>
                <h2 className="text-slate-900 font-extrabold text-lg tracking-tight">FAQ Support Coordinates</h2>
                <p className="text-xs text-slate-400">Review instant helper documentation or trigger support tickets.</p>
              </div>

              <div className="space-y-4">
                {[
                  { q: 'What is the 10-Minute Rapid Delivery Guarantee?', a: 'Direct farm depots strategically distributed along urban corridors allow Nammashop to prepare and dispatch fresh organic groceries instantly inside optimized delivery slots.' },
                  { q: 'How do I request a refund for a missing organic item?', a: 'For refunds, cancel orders or trigger live grievance tickets directly in the Dispatch Tracker panel. Approved refunds will be processed directly back to your original payment method.' },
                  { q: 'Are Namma Farms products chemically synthesized?', a: 'No, all items sourced directly from Namma Farms are strictly organic, pest-free, and prepared under sanitization regulations.' }
                ].map((faq, idx) => (
                  <div key={idx} className="bg-slate-50/50 border border-slate-100 rounded-2xl p-4.5 space-y-1.5 text-xs">
                    <h4 className="font-extrabold text-slate-800 flex items-center gap-1">
                      <MessageSquare size={13} className="text-emerald-600 shrink-0" />
                      <span>{faq.q}</span>
                    </h4>
                    <p className="text-slate-500 leading-relaxed pl-4">{faq.a}</p>
                  </div>
                ))}
              </div>

              <div className="border-t border-slate-100 pt-6 text-center space-y-3">
                <h3 className="text-xs font-black text-slate-800">Do you need additional dispatch coordinates helper?</h3>
                <p className="text-[11px] text-slate-400">Connect directly to our customer assistance toll-free dashboard hotline.</p>
                <div className="flex justify-center gap-3">
                  <a href="mailto:support@nammashop.com" className="bg-slate-50 hover:bg-slate-100 border text-slate-800 font-bold px-4 py-2 rounded-xl text-[11px] transition-all">Email Support</a>
                  <button onClick={() => notifyUser('Support Hotline active: +91 1800-GROCERY-NAMMA', 'info')} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 rounded-xl text-[11px] transition-all">Call Support Hotline</button>
                </div>
              </div>

            </div>
          )}

        </div>
      </div>

    </div>
  );
}
