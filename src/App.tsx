import React, { useState, useEffect } from 'react';
import {
  Search,
  ShoppingCart,
  User as UserIcon,
  Plus,
  Minus,
  Heart,
  Eye,
  ArrowRight,
  Tag,
  Star,
  LogIn,
  LogOut,
  Check,
  ShoppingBag,
  ShieldAlert,
  Sparkles,
  MapPin,
  Truck,
  ChevronRight,
  BookmarkCheck,
  Calendar,
  X,
  ChevronLeft,
  AlertCircle,
  FileDown,
  Lock,
  ArrowLeft,
  Trash2,
  CreditCard,
  Smartphone,
  Sun,
  Moon,
  Monitor,
  House,
  LayoutGrid,
  MessageCircle,
  Clock3,
  ShieldCheck,
  Package,
  BadgePercent
} from 'lucide-react';
import { Product, Category, Order, Coupon, DashboardBanner, User, Address, Review } from './types';
import AICompanion from './components/AICompanion';
import AIPage from './components/AIPage';
import AdminPortal from './components/AdminPortal';
import CustomerProfileDashboard from './components/CustomerProfileDashboard';
import OrderSuccessView from './components/OrderSuccessView';
import { auth as firebaseAuth, db as firestoreDb } from './firebase';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  sendEmailVerification,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  ConfirmationResult,
  setPersistence,
  browserLocalPersistence
} from 'firebase/auth';
import { collection, onSnapshot, query, where, orderBy, limit } from 'firebase/firestore';
import { generateAndUploadInvoice } from './utils/invoice';

declare global {
  interface Window {
    recaptchaVerifier: any;
  }
}

const ADMIN_EMAILS = new Set(['admin@nammashop.com', 'mjjayan2007@gmail.com', 'nammashopuk@gmail.com']);
const HOMEPAGE_PRODUCTS_LIMIT = 64;

function isAdminUser(user: User | null) {
  const email = user?.email?.toLowerCase().trim();
  return user?.role === 'admin' || (!!email && (ADMIN_EMAILS.has(email) || email.endsWith('@nammashop.com')));
}

export default function App() {
  // Theme Preference State
  const [themeMode, setThemeMode] = useState<'light' | 'dark' | 'system'>(() => {
    return (localStorage.getItem('nammashop_theme') as 'light' | 'dark' | 'system') || 'system';
  });

  // Apply Theme logic
  useEffect(() => {
    const root = window.document.documentElement;
    const isSystemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (themeMode === 'dark' || (themeMode === 'system' && isSystemDark)) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [themeMode]);

  // Handle system preference change listener
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => {
      if (themeMode === 'system') {
        if (e.matches) window.document.documentElement.classList.add('dark');
        else window.document.documentElement.classList.remove('dark');
      }
    };
    mediaQuery.addEventListener('change', onChange);
    return () => mediaQuery.removeEventListener('change', onChange);
  }, [themeMode]);

  // Authentication & session state
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const urlToken = params.get('token');
      if (urlToken) {
        localStorage.setItem('nammashop_token', urlToken);
        return urlToken;
      }
    } catch (e) {
      console.warn('URL parsing for auto-token failed', e);
    }
    try {
      return localStorage.getItem('nammashop_token');
    } catch {
      return null;
    }
  });
  
  // Modal toggles for Auth
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'forgot' | 'phone' | null>(null);
  const [authInitialized, setAuthInitialized] = useState(false);
  const [authForm, setAuthForm] = useState({ email: '', password: '', name: '', phone: '', otpInput: '' });
  const [verificationRequiredEmail, setVerificationRequiredEmail] = useState<string | null>(null);
  const [phoneVerificationInProgress, setPhoneVerificationInProgress] = useState<boolean>(false);
  const [phoneConfirmationResult, setPhoneConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  // Core Store States (Retrieved dynamically from backend API)
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [banners, setBanners] = useState<DashboardBanner[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);

  // Filtering, Searching, & Navigation states
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('nammashop_recent_searches') || '[]');
    } catch {
      return [];
    }
  });

  const saveRecentSearchAndSubmit = (term: string) => {
    const trimmed = term.trim();
    if (!trimmed) return;
    setRecentSearches(prev => {
      const filtered = prev.filter(item => item !== trimmed);
      const next = [trimmed, ...filtered].slice(0, 5);
      localStorage.setItem('nammashop_recent_searches', JSON.stringify(next));
      return next;
    });
    setSearchTerm(trimmed);
    setIsSearchFocused(false);
  };

  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [sortOption, setSortOption] = useState<string>('featured');
  const [brandFilter, setBrandFilter] = useState<string>('');
  const [onlyInStock, setOnlyInStock] = useState<boolean>(false);
  const [railVisibleCounts, setRailVisibleCounts] = useState<Record<string, number>>({});

  // Local/Session Cart persistent states
  const [cart, setCart] = useState<{ productId: string, quantity: number }[]>(() => {
    const saved = localStorage.getItem('nammashop_cart');
    return saved ? JSON.parse(saved) : [];
  });
  const [couponCodeInput, setCouponCodeInput] = useState('');
  const [activeAppliedCoupon, setActiveAppliedCoupon] = useState<Coupon | null>(null);

  // Wishlist locally persisted state
  const [wishlist, setWishlist] = useState<string[]>(() => {
    const saved = localStorage.getItem('nammashop_wishlist');
    return saved ? JSON.parse(saved) : [];
  });

  // Current viewed pages or details
  const [activeProductOverlay, setActiveProductOverlay] = useState<Product | null>(null);
  const [isCartDrawerOpen, setIsCartDrawerOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'catalog' | 'checkout' | 'profile' | 'admin' | 'ai' | 'success'>(() => {
    try {
      const saved = localStorage.getItem('nammashop_viewMode');
      if (saved === 'success' || saved === 'checkout' || saved === 'profile' || saved === 'ai' || saved === 'admin') {
        return saved as any;
      }
    } catch {}
    return 'catalog';
  });
  
  // Tracking timelines
  const [activeTrackingOrder, setActiveTrackingOrder] = useState<Order | null>(() => {
    try {
      const saved = localStorage.getItem('nammashop_last_order');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [profileSubTab, setProfileSubTab] = useState<'profile' | 'orders' | 'addresses' | 'wishlist' | 'tracking'>('profile');

  // Checkout shipping states
  const [selectedAddressId, setSelectedAddressId] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'COD' | 'Razorpay' | 'Stripe'>('COD');
  const [isAddingNewAddress, setIsAddingNewAddress] = useState(false);
  const [isPendingCheckout, setIsPendingCheckout] = useState(false);
  const [stripeRedirecting, setStripeRedirecting] = useState(false);
  const [stripeSessionUrl, setStripeSessionUrl] = useState<string>('');
  const [newAddressForm, setNewAddressForm] = useState({
    label: 'Home',
    fullName: '',
    street: '',
    city: '',
    state: '',
    pincode: '',
    phone: ''
  });
  const [addressErrors, setAddressErrors] = useState<Record<string, string>>({});

  // Review Submissions
  const [reviewRatingInput, setReviewRatingInput] = useState<number>(5);
  const [reviewCommentInput, setReviewCommentInput] = useState<string>('');

  // Notifications system Toast state
  const [notification, setNotification] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
  const [notifications, setNotifications] = useState<any[]>([]); // NEW: Notification History

  // NEW: Real-time listener for incoming orders (Admin)
  useEffect(() => {
    if (!currentUser || currentUser.role !== 'admin') return;

    const ordersRef = collection(firestoreDb, 'orders');
    const unsub = onSnapshot(query(ordersRef, orderBy('createdAt', 'desc')), (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const newOrder = { id: change.doc.id, ...change.doc.data() } as Order;
          setNotifications(prev => [{
            id: Date.now(),
            message: `New Order #${newOrder.id.slice(0, 8)} - £${newOrder.total.toFixed(2)}`,
            timestamp: new Date().toISOString()
          }, ...prev]);
          notifyUser(`New Order Received: #${newOrder.id.slice(0, 8)}`, 'success');
        }
      });
    }, (error) => {
      console.warn('Admin real-time order notifications listener restricted:', error.message);
    });
    return () => unsub();
  }, [currentUser]);

  // Banner slide index
  const [bannerIndex, setBannerIndex] = useState(0);
  const [recentlyViewedIds, setRecentlyViewedIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('nammashop_recently_viewed') || '[]');
    } catch {
      return [];
    }
  });
  const [deliverySlot, setDeliverySlot] = useState<'express' | 'evening' | 'scheduled'>('express');
  const categoryMap = new Map(categories.map((category) => [category.id, category.name]));
  const whatsappSupportNumber = '447700900123';
  const activeBanner = banners[bannerIndex];
  const recentlyViewedProducts = recentlyViewedIds
    .map((id) => products.find((product) => product.id === id))
    .filter(Boolean) as Product[];
  const featuredProducts = products.filter((product) => product.isFeatured).slice(0, 8);
  const bestSellerProducts = [...products]
    .sort((a, b) => (b.rating * (b.ratingCount || 1)) - (a.rating * (a.ratingCount || 1)))
    .slice(0, 8);
  const flashSaleProducts = [...products]
    .filter((product) => product.discount > 0)
    .sort((a, b) => b.discount - a.discount)
    .slice(0, 8);
  const trendingProducts = [...products]
    .sort((a, b) => ((b.ratingCount || 0) + b.stock) - ((a.ratingCount || 0) + a.stock))
    .slice(0, 8);
  const personalizedProducts = wishlist.length > 0
    ? products.filter((product) => wishlist.includes(product.id)).slice(0, 4)
    : featuredProducts.slice(0, 4);
  const accentGradients = [
    'from-red-500/12 to-red-50',
    'from-slate-900/8 to-slate-50',
    'from-neutral-400/12 to-neutral-50',
    'from-rose-500/12 to-rose-50'
  ];
  const curatedCategoryCards = categories.slice(0, 8).map((category, index) => ({
    ...category,
    accent: accentGradients[index % accentGradients.length]
  }));
  const dailyEssentialsProducts = products
    .filter((product) => product.stock > 0)
    .sort((a, b) => ((b.ratingCount || 0) + b.rating) - ((a.ratingCount || 0) + a.rating))
    .slice(0, 8);
  const freshPicksProducts = products
    .filter((product) => product.stock > 0 && product.rating >= 4)
    .sort((a, b) => b.stock - a.stock)
    .slice(0, 8);
  const weeklyPopularProducts = [...bestSellerProducts].slice(0, 8);

  useEffect(() => {
    localStorage.setItem('nammashop_recently_viewed', JSON.stringify(recentlyViewedIds));
  }, [recentlyViewedIds]);

  useEffect(() => {
    const titleByViewMode: Record<typeof viewMode, string> = {
      catalog: 'NammaShop UK | Fresh groceries in minutes',
      checkout: 'Secure checkout | NammaShop UK',
      profile: 'Your account | NammaShop UK',
      admin: 'Admin console | NammaShop',
      ai: 'AI kitchen assistant | NammaShop UK',
      success: 'Order confirmed | NammaShop UK'
    };
    document.title = titleByViewMode[viewMode];

    const upsertMeta = (selector: string, content: string, attr: 'name' | 'property') => {
      let element = document.head.querySelector(`meta[${attr}="${selector}"]`) as HTMLMetaElement | null;
      if (!element) {
        element = document.createElement('meta');
        element.setAttribute(attr, selector);
        document.head.appendChild(element);
      }
      element.content = content;
    };

    upsertMeta('description', 'Premium UK grocery delivery with fast checkout, curated shelves, and trusted doorstep delivery.', 'name');
    upsertMeta('og:title', document.title, 'property');
    upsertMeta('og:description', 'Discover fresh produce, pantry staples, and premium grocery deals with NammaShop UK.', 'property');
  }, [viewMode]);

  const openProductOverlay = (product: Product) => {
    setActiveProductOverlay(product);
    setRecentlyViewedIds((prev) => [product.id, ...prev.filter((id) => id !== product.id)].slice(0, 10));
  };

  const getProductVariants = (product: Product) => {
    const baseUnit = product.unit;
    return [baseUnit, `2 x ${baseUnit}`, `Family ${baseUnit}`].slice(0, 3);
  };

  const handleBannerNavigate = (banner: DashboardBanner, fallbackCategoryId?: string | null) => {
    if (fallbackCategoryId) {
      setSelectedCategoryId(fallbackCategoryId);
      setViewMode('catalog');
      return;
    }
    if (banner.targetCategoryId) {
      setSelectedCategoryId(banner.targetCategoryId);
      setViewMode('catalog');
      return;
    }
    if (banner.link?.startsWith('/')) {
      try {
        const url = new URL(banner.link, window.location.origin);
        const category = url.searchParams.get('category');
        if (category) setSelectedCategoryId(category);
        setViewMode('catalog');
        return;
      } catch {}
    }
    if (banner.link) {
      window.open(banner.link, '_blank', 'noopener,noreferrer');
    }
  };

  // Trigger toast notify helper
  const notifyUser = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification(null);
    }, 4500);
  };

  const getFriendlyAuthError = (error: any) => {
    console.error('Auth error:', error);
    if (error.code === 'auth/operation-not-allowed') {
      return 'The requested sign-in method is currently disabled. Please contact the administrator to enable it in the Firebase Console.';
    }
    if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
      return 'Incorrect email or password.';
    }
    if (error.code === 'auth/email-already-in-use') {
      return 'An account with this email already exists.';
    }
    return 'Authentication service is currently unavailable. Please try again later.';
  };

  useEffect(() => {
    localStorage.setItem('nammashop_viewMode', viewMode);
  }, [viewMode]);

  useEffect(() => {
    if (activeTrackingOrder) {
      localStorage.setItem('nammashop_last_order', JSON.stringify(activeTrackingOrder));
    } else {
      localStorage.removeItem('nammashop_last_order');
    }
  }, [activeTrackingOrder]);

  // Bootstrap data fetches and synchronize real-time Firebase Authentication state
  useEffect(() => {
    fetchCatalogs();

    let cancelled = false;
    const bootstrapAuth = async () => {
      try {
        await setPersistence(firebaseAuth, browserLocalPersistence);
      } catch (error) {
        console.warn('Firebase auth persistence setup failed, continuing with backend session.', error);
      }
    };

    bootstrapAuth();

    const unsubscribe = onAuthStateChanged(firebaseAuth, async (firebaseUser) => {
      if (cancelled) return;
      if (firebaseUser) {
        try {
          const resp = await fetch('/api/auth/firebase-sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              uid: firebaseUser.uid,
              email: firebaseUser.email,
              name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Nammashop User',
              avatar: firebaseUser.photoURL || `https://api.dicebear.com/7.x/pixel-art/svg?seed=${encodeURIComponent(firebaseUser.email || '')}`
            })
          });
          const data = await resp.json();
          if (resp.ok && data.success) {
            localStorage.setItem('nammashop_token', data.token);
            setToken(data.token);
            setCurrentUser(data.user);
            fetchCustomerData(data.token);
            setAuthInitialized(true);
          }
        } catch (e) {
          console.warn('Firebase user sync failed, preserving backend session while retrying later.', e);
          if (token) {
            await validateSession(token, false);
          } else {
            setAuthInitialized(true);
          }
        }
      } else {
        if (token) {
          await validateSession(token, false);
        } else {
          setAuthInitialized(true);
        }
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  // Stripe Checkout Callback Handler
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('status');
    const orderId = params.get('orderId');
    const urlToken = params.get('token');

    let activeToken = token;
    
    if (urlToken) {
      localStorage.setItem('nammashop_token', urlToken);
      if (token !== urlToken) {
        setToken(urlToken);
        activeToken = urlToken;
      }
    }

    if (status === 'stripe-success') {
      if (!activeToken) {
        const storedToken = localStorage.getItem('nammashop_token');
        if (storedToken) {
          activeToken = storedToken;
          setToken(storedToken);
        } else {
          return; // Wait for active session token to resolve
        }
      }
      
      notifyUser('Verifying payment details with Stripe... 💳⏳', 'success');
      
      fetch('/api/orders/confirm-stripe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${activeToken}`
        },
        body: JSON.stringify({ orderId })
      })
      .then(async (res) => {
        const data = await res.json();
        if (res.ok) {
          notifyUser('Stripe Payment Verified! Order scheduled in eco dispatch route. 🎉', 'success');
          setCart([]);
          localStorage.removeItem('nammashop_cart'); // Clear persistent cart bag
          setActiveAppliedCoupon(null);
          setCouponCodeInput('');
          
          // Clear URL parameter queries completely to standard home state cleanly
          window.history.replaceState({}, '', '/');
          
          setActiveTrackingOrder(data.order);
          // Insert the updated order into React state instantly
          setOrders(prev => {
            const list = prev.filter(o => o.id !== orderId);
            return [data.order, ...list];
          });
          setViewMode('success');
        } else {
          notifyUser(data.error || 'Payment gateway failed verification checkpoint.', 'error');
          window.history.replaceState({}, '', '/');
        }
      })
      .catch((err) => {
        console.error('Error on Stripe confirmation:', err);
        notifyUser('A gateway connection exception occurred.', 'error');
        window.history.replaceState({}, '', '/');
      });
    } else if (status === 'stripe-cancel') {
      notifyUser('Stripe checkout session was canceled. Your selected groceries are saved in your cart.', 'error');
      window.history.replaceState({}, '', '/');
    }
  }, [token]);

  // Real-time Firestore synchronization for catalog products, categories, active banners, and coupons
  useEffect(() => {
    let unsubProducts: () => void;
    let unsubCategories: () => void;
    let unsubBanners: () => void;
    let unsubCoupons: () => void;

    try {
      const productsRef = query(collection(firestoreDb, 'products'), limit(HOMEPAGE_PRODUCTS_LIMIT));
      unsubProducts = onSnapshot(productsRef, (snapshot) => {
        const prodList: Product[] = [];
        snapshot.forEach((doc) => {
          prodList.push({ id: doc.id, ...doc.data() } as Product);
        });
        if (prodList.length > 0) {
          setProducts(prodList);
        }
      }, (error) => {
        console.warn('Real-time Products snapshot listener pending/offline. Falling back to REST API.');
      });

      unsubCategories = onSnapshot(collection(firestoreDb, 'categories'), (snapshot) => {
        const catList: Category[] = [];
        snapshot.forEach((doc) => {
          catList.push({ id: doc.id, ...doc.data() } as Category);
        });
        if (catList.length > 0) setCategories(catList);
      }, (error) => {
        console.warn('Real-time Categories snapshot listener offline.');
      });

      unsubBanners = onSnapshot(collection(firestoreDb, 'banners'), (snapshot) => {
        const banList: DashboardBanner[] = [];
        snapshot.forEach((doc) => {
          banList.push({ id: doc.id, ...doc.data() } as DashboardBanner);
        });
        if (banList.length > 0) setBanners(banList);
      }, (error) => {
        console.warn('Real-time Banners snapshot listener offline.');
      });

      unsubCoupons = onSnapshot(collection(firestoreDb, 'coupons'), (snapshot) => {
        const cpList: Coupon[] = [];
        snapshot.forEach((doc) => {
          cpList.push({ id: doc.id, ...doc.data() } as Coupon);
        });
        if (cpList.length > 0) setCoupons(cpList);
      }, (error) => {
        console.warn('Real-time Coupons snapshot listener offline.');
      });

    } catch (e) {
      console.warn('Failed attaching real-time Firestore catalog listeners:', e);
    }

    return () => {
      if (unsubProducts) unsubProducts();
      if (unsubCategories) unsubCategories();
      if (unsubBanners) unsubBanners();
      if (unsubCoupons) unsubCoupons();
    };
  }, []);

  // Real-time Firestore synchronization for orders and user delivery addresses
  useEffect(() => {
    if (!currentUser) return;

    let unsubOrders: () => void;
    let unsubAddresses: () => void;

    try {
      const ordersRef = collection(firestoreDb, 'orders');
      const orderQuery = currentUser.role === 'admin'
        ? query(ordersRef)
        : query(ordersRef, where('userId', '==', currentUser.id));

      unsubOrders = onSnapshot(orderQuery, (snapshot) => {
        const ordList: Order[] = [];
        snapshot.forEach((doc) => {
          ordList.push({ id: doc.id, ...doc.data() } as Order);
        });
        // Sort orders by createdAt descending to show latest first
        ordList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setOrders(ordList);
      }, (error) => {
        console.warn('Real-time Orders query listener offline/pending permissions. Responding via fallback REST:', error.message);
      });

      const addressesRef = collection(firestoreDb, `users/${currentUser.id}/addresses`);
      unsubAddresses = onSnapshot(addressesRef, (snapshot) => {
        const addrList: Address[] = [];
        snapshot.forEach((doc) => {
          addrList.push({ id: doc.id, ...doc.data() } as Address);
        });
        setAddresses(addrList);
        if (addrList.length > 0 && !selectedAddressId) {
          setSelectedAddressId(addrList[0].id);
        }
      }, (error) => {
        console.warn('Real-time Addresses query listener offline/pending.');
      });

    } catch (e) {
      console.warn('Failed attaching authenticated real-time Firestore queries:', e);
    }

    return () => {
      if (unsubOrders) unsubOrders();
      if (unsubAddresses) unsubAddresses();
    };
  }, [currentUser]);

  // Sync cart shifts
  useEffect(() => {
    localStorage.setItem('nammashop_cart', JSON.stringify(cart));
  }, [cart]);

  // Sync wishlist shifts
  useEffect(() => {
    localStorage.setItem('nammashop_wishlist', JSON.stringify(wishlist));
  }, [wishlist]);

  // Setup auto banner cycling slider
  useEffect(() => {
    if (banners.length > 1) {
      const interval = setInterval(() => {
        setBannerIndex(prev => (prev + 1) % banners.length);
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [banners]);

  // Dynamic route redirection listener to secure and handle custom admin URLs
  useEffect(() => {
    const checkAdminPath = () => {
      const path = window.location.pathname;
      if (path === '/admin' || path === '/dashboard/admin') {
        if (currentUser) {
          if (isAdminUser(currentUser)) {
            setViewMode('admin');
            notifyUser('Welcome back to Nammashop Administrator Suite.', 'success');
          } else {
            notifyUser('Access Denied. Normal customer accounts do not have administrative clearance.', 'error');
            setViewMode('catalog');
            window.history.replaceState({}, '', '/');
          }
        } else if (authInitialized) {
          setAuthMode('login');
          notifyUser('Please log in with admin permissions to gain backend access.', 'error');
          window.history.replaceState({}, '', '/');
        }
      }
    };
    checkAdminPath();
    window.addEventListener('popstate', checkAdminPath);
    return () => window.removeEventListener('popstate', checkAdminPath);
  }, [currentUser, authInitialized]);

  const fetchCatalogs = async () => {
    try {
      // 1. Fetch categories
      const catResp = await fetch('/api/categories');
      if (catResp.ok) setCategories(await catResp.json());

      // 2. Fetch products
      const prodParams = new URLSearchParams();
      if (searchTerm) prodParams.append('search', searchTerm);
      if (selectedCategoryId) prodParams.append('category', selectedCategoryId);
      if (brandFilter) prodParams.append('brand', brandFilter);
      if (sortOption) prodParams.append('sort', sortOption);
      if (onlyInStock) prodParams.append('availableOnly', 'true');

      prodParams.append('limit', String(HOMEPAGE_PRODUCTS_LIMIT));
      const prodResp = await fetch(`/api/products?${prodParams.toString()}`);
      if (prodResp.ok) setProducts(await prodResp.json());

      // 3. Banners
      const banResp = await fetch('/api/banners');
      if (banResp.ok) setBanners(await banResp.json());

      // 4. Coupons (Admin visibility only, or mock available list for display)
      const cpResp = await fetch('/api/admin/coupons', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (cpResp.ok) setCoupons(await cpResp.json());
      else {
        // Fallback demo coupon tags
        setCoupons([
          { id: 'cp-30', code: 'NAMMA30', type: 'percent', value: 30, expiryDate: '2027-12-31', active: true, usageLimit: 1000, usageCount: 0 },
          { id: 'cp-50', code: 'SUPER50', type: 'fixed', value: 50, expiryDate: '2027-12-31', active: true, usageLimit: 500, usageCount: 0 }
        ]);
      }
    } catch (err) {
      console.warn('Backend API fetching offline. Bootstrapping simulated local layers...');
    }
  };

  const validateSession = async (sessionToken: string, clearOnFailure = true) => {
    try {
      const resp = await fetch('/api/auth/me', {
        headers: {
          'Authorization': `Bearer ${sessionToken}`
        }
      });
      const data = await resp.json();
      if (resp.ok && data.success) {
        localStorage.setItem('nammashop_token', sessionToken);
        setToken(sessionToken);
        setCurrentUser(data.user);
        fetchCustomerData(sessionToken);
        setAuthInitialized(true);
      } else {
        // Expired or bad token
        if (clearOnFailure) {
          handleSignOut();
        } else {
          setAuthInitialized(true);
        }
      }
    } catch {
      // Client offline fallback mode for testing
      console.warn('Using cache auth authentication settings.');
      setAuthInitialized(true);
    }
  };

  const fetchCustomerData = async (sessionToken: string) => {
    try {
      // Fetch user specific entries
      const addrsResp = await fetch('/api/addresses', {
        headers: { 'Authorization': `Bearer ${sessionToken}` }
      });
      if (addrsResp.ok) {
        const addrList = await addrsResp.json();
        setAddresses(addrList);
        if (addrList.length > 0) setSelectedAddressId(addrList[0].id);
      }

      const ordResp = await fetch('/api/orders', {
        headers: { 'Authorization': `Bearer ${sessionToken}` }
      });
      if (ordResp.ok) setOrders(await ordResp.json());
    } catch {
      console.warn('Customer profiles mapping offline.');
    }
  };

  // Trigger search and filter refetch
  useEffect(() => {
    fetchCatalogs();
  }, [searchTerm, selectedCategoryId, sortOption, brandFilter, onlyInStock]);

  useEffect(() => {
    // Generate recaptcha verifier when auth mode opens
    if (authMode && !window.recaptchaVerifier) {
      window.recaptchaVerifier = new RecaptchaVerifier(firebaseAuth, 'recaptcha-container', {
        'size': 'invisible',
      });
    }
  }, [authMode]);

  const handleSendPhoneOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setAuthError(null);
    try {
      const cleanPhone = authForm.phone.trim().replace(/[\s()-]+/g, '');
      const formattedPhone = cleanPhone.startsWith('+') ? cleanPhone : `+${cleanPhone}`;
      if (!window.recaptchaVerifier) {
        window.recaptchaVerifier = new RecaptchaVerifier(firebaseAuth, 'recaptcha-container', {
          'size': 'invisible',
        });
      }
      
      const appVerifier = window.recaptchaVerifier;
      const confirmationResult = await signInWithPhoneNumber(firebaseAuth, formattedPhone, appVerifier);
      setPhoneConfirmationResult(confirmationResult);
      setPhoneVerificationInProgress(true);
      notifyUser('SMS OTP sent securely via Firebase Phone Auth!', 'success');
    } catch (err: any) {
      setAuthError(err.message || 'SMS dispatch failed.');
      notifyUser(err.message || 'Failed to send OTP.', 'error');
    }
  };

  const handleVerifyPhoneOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    if (!phoneConfirmationResult) return;
    try {
      const result = await phoneConfirmationResult.confirm(authForm.otpInput);
      const user = result.user;
      
      // Sync auth with our backend
      const loginResp = await fetch('/api/auth/firebase-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: `user-fb-${user.uid}`,
          phone: user.phoneNumber,
          name: authForm.name || 'Nammashop User'
        })
      });
      const loginData = await loginResp.json();
      if (loginResp.ok) {
        setToken(loginData.token);
        setCurrentUser(loginData.user);
        setPhoneVerificationInProgress(false);
        setPhoneConfirmationResult(null);
        setAuthMode(null);
        notifyUser('Phone verification successful!', 'success');
      } else {
        notifyUser('Failed to sync verified phone account.', 'error');
      }
    } catch (err: any) {
      setAuthError('Incorrect OTP code.');
      notifyUser('Invalid OTP. Please check the code and try again.', 'error');
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    try {
      let uid = 'user-' + Math.random().toString(36).substring(2, 11);
      
      try {
        // Try Real Firebase Auth registration first
        const userCredential = await createUserWithEmailAndPassword(firebaseAuth, authForm.email, authForm.password);
        if (userCredential.user) {
          uid = userCredential.user.uid;
          await sendEmailVerification(userCredential.user);
          notifyUser(`Account registered! A verification email has been sent to ${authForm.email}`, 'success');
        }
      } catch (fbErr: any) {
        console.error('Firebase Auth registration failed:', fbErr);
        setAuthError(getFriendlyAuthError(fbErr));
        notifyUser(getFriendlyAuthError(fbErr), 'error');
        return; // Stop if registration failed
      }

      // Sync and complete account registry via Express / Database service
      const resp = await fetch('/api/auth/firebase-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid,
          email: authForm.email,
          name: authForm.name,
          phone: authForm.phone,
          avatar: `https://api.dicebear.com/7.x/pixel-art/svg?seed=${encodeURIComponent(authForm.name)}`
        })
      });
      const data = await resp.json();
      if (resp.ok && data.success) {
        setAuthMode('login');
      } else {
        notifyUser(data.error || 'Account synchronization mismatch.', 'error');
      }
    } catch (err: any) {
      setAuthError(err.message || 'Registration request aborted.');
      notifyUser(err.message || 'Registration request aborted.', 'error');
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const resp = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: verificationRequiredEmail,
          otp: authForm.otpInput
        })
      });
      const data = await resp.json();
      if (resp.ok) {
        notifyUser('Nammashop e-mail successfully verified!', 'success');
        
        // Retrieve synced backend token
        const loginResp = await fetch('/api/auth/firebase-sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uid: `user-fb-${verificationRequiredEmail?.split('@')[0]}`,
            email: verificationRequiredEmail,
            name: authForm.name || verificationRequiredEmail?.split('@')[0] || 'Nammashop User',
            phone: authForm.phone
          })
        });
        const loginData = await loginResp.json();
        if (loginResp.ok) {
          localStorage.setItem('nammashop_token', loginData.token);
          setToken(loginData.token);
          setCurrentUser(loginData.user);
          setVerificationRequiredEmail(null);
          setAuthMode(null);
        }
      } else {
        notifyUser(data.error || 'Incorrect OTP code token.', 'error');
      }
    } catch {
      notifyUser('Communication with OTP dispatcher aborted.', 'error');
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      let uid = '';
      let authenticatedEmail = authForm.email;
      let authenticatedName = '';
      
      let firebaseAuthSucceeded = false;
      try {
        setAuthError(null);
        await setPersistence(firebaseAuth, browserLocalPersistence);
        const userCredential = await signInWithEmailAndPassword(firebaseAuth, authForm.email, authForm.password);
        if (userCredential.user) {
          uid = userCredential.user.uid;
          authenticatedEmail = userCredential.user.email || authForm.email;
          authenticatedName = userCredential.user.displayName || '';

          if (!userCredential.user.emailVerified) {
            if (ADMIN_EMAILS.has(authForm.email.toLowerCase().trim())) {
              await signOut(firebaseAuth);
              firebaseAuthSucceeded = false;
            } else {
            setAuthError("Email is not verified. Please check your inbox or spam folder.");
            notifyUser("Access Denied: Please verify your email first.", 'error');
            await signOut(firebaseAuth);
            return;
            }
          } else {
            firebaseAuthSucceeded = true;
          }
        }
      } catch (fbErr: any) {
        console.warn('Firebase Auth login failed, attempting direct backend fallback:', fbErr.code);
        firebaseAuthSucceeded = false;
      }

      // Synchronize session token with Express (if Firebase succeeded, or attempt direct backend login)
      const loginPayload = firebaseAuthSucceeded 
        ? { uid, email: authenticatedEmail, name: authenticatedName }
        : { email: authForm.email, password: authForm.password }; // Direct login payload

      const resp = await fetch(firebaseAuthSucceeded ? '/api/auth/firebase-sync' : '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginPayload)
      });
      const data = await resp.json();
      
      if (resp.ok) {
        localStorage.setItem('nammashop_token', data.token);
        setToken(data.token);
        setCurrentUser(data.user);
        setAuthInitialized(true);
        notifyUser(`Welcome back to Nammashop, ${data.user.name}! 🚀`, 'success');
        setAuthMode(null);
        setViewMode(data.user.role === 'admin' ? 'admin' : 'catalog');
      } else {
        const message = firebaseAuthSucceeded
          ? data.error || 'Authentication synchronization failed.'
          : data.error || 'Invalid e-mail or password credentials.';
        notifyUser(message, 'error');
        setAuthError(message);
      }
    } catch (err: any) {
        notifyUser(getFriendlyAuthError(err), 'error');
        setAuthError(getFriendlyAuthError(err));
    }
  };

  const handleGoogleMockLogin = async () => {
    try {
      // Attempt Real Firebase Google Social Login popup
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(firebaseAuth, provider);
      const firebaseUser = result.user;

      const resp = await fetch('/api/auth/firebase-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          name: firebaseUser.displayName || 'Google User',
          avatar: firebaseUser.photoURL || `https://api.dicebear.com/7.x/pixel-art/svg?seed=${encodeURIComponent(firebaseUser.email || '')}`
        })
      });
      const data = await resp.json();
      if (resp.ok) {
        localStorage.setItem('nammashop_token', data.token);
        setToken(data.token);
        setCurrentUser(data.user);
        notifyUser(`Google Auth verified! Welcome ${data.user.name} 🌱`, 'success');
        setAuthMode(null);
        setViewMode(data.user.role === 'admin' ? 'admin' : 'catalog');
      }
    } catch (fbErr: any) {
      console.error('Google Popup login failed, attempting backend Google fallback:', fbErr);
      const fallbackEmail = authForm.email.trim().toLowerCase();
      if (!fallbackEmail) {
        const message = 'Enter your Google e-mail address above, then press Google sign-on again.';
        setAuthError(message);
        notifyUser(message, 'error');
        return;
      }

      try {
        const resp = await fetch('/api/auth/google', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: fallbackEmail,
            name: fallbackEmail.split('@')[0] || 'Google User',
            googleId: `fallback-${fallbackEmail}`,
            avatar: `https://api.dicebear.com/7.x/pixel-art/svg?seed=${encodeURIComponent(fallbackEmail)}`
          })
        });
        const data = await resp.json();
        if (resp.ok) {
          localStorage.setItem('nammashop_token', data.token);
          setToken(data.token);
          setCurrentUser(data.user);
          notifyUser(`Google account connected. Welcome ${data.user.name}!`, 'success');
          setAuthMode(null);
          setViewMode(data.user.role === 'admin' ? 'admin' : 'catalog');
        } else {
          setAuthError(data.error || 'Google sign-on failed.');
          notifyUser(data.error || 'Google sign-on failed.', 'error');
        }
      } catch (fallbackErr: any) {
        const message = fallbackErr?.message || getFriendlyAuthError(fbErr);
        setAuthError(message);
        notifyUser(message, 'error');
      }
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(firebaseAuth);
    } catch (e) {
      console.warn('Firebase logout exception');
    }
    localStorage.removeItem('nammashop_token');
    setToken(null);
    setCurrentUser(null);
    setAddresses([]);
    setOrders([]);
    setViewMode('catalog');
    notifyUser('Logged out safely. See you soon!');
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      try {
        await sendPasswordResetEmail(firebaseAuth, authForm.email);
        notifyUser('Firebase Password Reset link dispatched to your inbox!', 'success');
        setAuthMode('login');
        return;
      } catch (fbErr: any) {
        console.warn('Firebase pass reset error: ', fbErr);
        notifyUser(fbErr.message || 'Firebase password reset email could not be sent.', 'error');
        return;
      }
    } catch {
      notifyUser('Reset server offline.', 'error');
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const resp = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: verificationRequiredEmail,
          otp: authForm.otpInput,
          newPassword: authForm.password
        })
      });
      if (resp.ok) {
        notifyUser('Credential recovered successfully. Sign in with your new password!', 'success');
        setVerificationRequiredEmail(null);
        setAuthMode('login');
      } else {
        notifyUser('Reset authorization token mismatch.', 'error');
      }
    } catch {
      notifyUser('Communication with reset module aborted.', 'error');
    }
  };

  // Cart operations
  const addToCart = (productId: string, qty: number = 1) => {
    const freshTarget = products.find(p => p.id === productId);
    if (!freshTarget) return;

    if (freshTarget.stock === 0) {
      notifyUser('Oops! This premium grocery is strictly OUT OF STOCK right now.', 'error');
      return;
    }

    setCart(prev => {
      const matchIdx = prev.findIndex(item => item.productId === productId);
      const currentCartQty = matchIdx !== -1 ? prev[matchIdx].quantity : 0;
      const proposedQty = currentCartQty + qty;

      if (proposedQty > freshTarget.stock) {
        notifyUser(`Cannot add more. Complete stock available on shelves is ${freshTarget.stock} units.`, 'error');
        // Cap to max
        if (matchIdx !== -1) {
          const updated = [...prev];
          updated[matchIdx].quantity = freshTarget.stock;
          return updated;
        } else {
          return [...prev, { productId, quantity: freshTarget.stock }];
        }
      }

      notifyUser(`Added ${freshTarget.name} to cart. Fresh delivery incoming!`, 'success');

      if (matchIdx !== -1) {
        const updated = [...prev];
        updated[matchIdx].quantity = proposedQty;
        return updated;
      } else {
        return [...prev, { productId, quantity:ProposedQtyCalculationHelper(proposedQty) }];
      }
    });

    function ProposedQtyCalculationHelper(proposedQty: number) {
      return proposedQty;
    }
  };

  const decreaseCartCount = (productId: string) => {
    setCart(prev => {
      const matchIdx = prev.findIndex(item => item.productId === productId);
      if (matchIdx === -1) return prev;
      const proposed = prev[matchIdx].quantity - 1;
      if (proposed === 0) {
        return prev.filter(item => item.productId !== productId);
      } else {
        const updated = [...prev];
        updated[matchIdx].quantity = proposed;
        return updated;
      }
    });
  };

  const addProductsFromRecipeToCart = (productIds: string[]) => {
    productIds.forEach(id => {
      const p = products.find(prod => prod.id === id);
      if (p && p.stock > 0) {
        addToCart(id, 1);
      }
    });
    setIsCartDrawerOpen(true);
  };

  const toggleWishlist = (id: string) => {
    setWishlist(prev => {
      if (prev.includes(id)) {
        notifyUser('Removed from custom wishlist.');
        return prev.filter(i => i !== id);
      } else {
        notifyUser('Added to custom wishlist. Ready to restock!');
        return [...prev, id];
      }
    });
  };

  // Cart valuations
  const cartDetails = cart.map(item => {
    const entry = products.find(p => p.id === item.productId);
    return {
      productId: item.productId,
      quantity: item.quantity,
      details: entry
    };
  }).filter(c => c.details !== undefined);

  const cartSubtotal = cartDetails.reduce((sum, item) => {
    const finalPrice = item.details!.price * (1 - item.details!.discount / 100);
    return sum + (finalPrice * item.quantity);
  }, 0);

  const applyCouponCode = async () => {
    if (!token) {
      notifyUser('Sign-in required to calculate promotional codes.', 'error');
      setAuthMode('login');
      return;
    }
    try {
      const resp = await fetch('/api/coupons/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ code: couponCodeInput })
      });
      const data = await resp.json();
      if (resp.ok && data.success) {
        setActiveAppliedCoupon(data.coupon);
        notifyUser(`Coupon "${data.coupon.code}" verified! Saved £${data.coupon.type === 'percent' ? `${data.coupon.value}%` : `${data.coupon.value}`}.`, 'success');
      } else {
        notifyUser(data.error || 'Invalid promotional coupon.', 'error');
      }
    } catch {
      notifyUser('API error checking coupon code.', 'error');
    }
  };

  const activeCouponDiscount = activeAppliedCoupon
    ? (activeAppliedCoupon.type === 'percent'
        ? (cartSubtotal * (activeAppliedCoupon.value / 100))
        : activeAppliedCoupon.value)
    : 0;

  const deliveryFeeBySlot = {
    express: 2.99,
    evening: 1.49,
    scheduled: 0
  };
  const finalDeliveryFee = cartSubtotal >= 20 || cartSubtotal === 0 ? 0 : deliveryFeeBySlot[deliverySlot];
  const computedTax = cartSubtotal * 0.05; // 5% VAT on organic groceries
  const cartGrandTotal = Math.max(0, cartSubtotal - activeCouponDiscount + finalDeliveryFee + computedTax);

  const validateAddressForm = () => {
    const errors: Record<string, string> = {};
    const { fullName, street, city, state, pincode, phone } = newAddressForm;

    if (!fullName.trim() || fullName.trim().length < 2) {
      errors.fullName = "Recipient name must be at least 2 letters.";
    } else if (/[0-9_@./#&+-]/.test(fullName)) {
      errors.fullName = "Name cannot contain digits or special characters.";
    }

    if (!street.trim()) {
      errors.street = "Street address is required.";
    }

    if (!city.trim()) {
      errors.city = "City is required.";
    } else if (/[0-9_@./#&+-]/.test(city)) {
      errors.city = "City name cannot contain digits or special characters.";
    }

    if (!state.trim()) {
      errors.state = "State or county is required.";
    } else if (/[0-9_@./#&+-]/.test(state)) {
      errors.state = "State name cannot contain digits or special characters.";
    }

    // Comprehensive ZIP regex
    const cleanPin = pincode.replace(/\s+/g, '').toUpperCase();
    const inPinRegex = /^[1-9][0-9]{5}$/; // India 6 digits
    const usZipRegex = /^\d{5}(-\d{4})?$/; // US 5 or 9 digits
    const ukPinRegex = /^[A-Z]{1,2}[0-9R][0-9A-Z]?\s?[0-9][A-Z]{2}$/i; // UK Postcode

    const isValidPin = inPinRegex.test(cleanPin) || usZipRegex.test(cleanPin) || ukPinRegex.test(pincode.trim());

    if (!pincode.trim()) {
      errors.pincode = "Postal pincode is required.";
    } else if (!isValidPin) {
      errors.pincode = "Specify a valid pincode (6-digit Indian PIN, US ZIP, or UK postcode).";
    }

    // Phone Country code matching verification
    const cleanPhone = phone.trim().replace(/[\s()-]+/g, '');
    const inPhoneRegex = /^(?:\+91|91)?[6789]\d{9}$/;
    const usPhoneRegex = /^(?:\+1|1)?\d{10}$/;
    const ukPhoneRegex = /^(?:\+44|44)?(?:7\d{9}|1\d{8,9}|2\d{9})$/;
    const isValidPhone = inPhoneRegex.test(cleanPhone) || usPhoneRegex.test(cleanPhone) || ukPhoneRegex.test(cleanPhone);

    if (!phone.trim()) {
      errors.phone = "Phone contact mobile is required.";
    } else if (!isValidPhone) {
      errors.phone = "Invalid format. Provide a valid mobile contact (UK, IN, or US number).";
    }

    setAddressErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Address placement
  const handleAddNewAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    
    // Execute active client-side validations
    if (!validateAddressForm()) {
      notifyUser('Please correct the validation errors on the form.', 'error');
      return;
    }

    try {
      const resp = await fetch('/api/addresses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newAddressForm)
      });
      const data = await resp.json();
      if (resp.ok) {
        notifyUser('Delivery coordinates pinned!', 'success');
        setIsAddingNewAddress(false);
        fetchCustomerData(token);
        setSelectedAddressId(data.address.id);
        setAddressErrors({}); // Clear errors
        setNewAddressForm({
          label: 'Home',
          fullName: '',
          street: '',
          city: '',
          state: '',
          pincode: '',
          phone: ''
        });
      }
    } catch {
      notifyUser('Error writing shipping address coordinates.', 'error');
    }
  };

  // Dispatch checkout orders
  const checkoutCartAndPay = async () => {
    if (isPendingCheckout) return;
    if (!token) {
      notifyUser('Authorization required to compile payments. Access denied.', 'error');
      setAuthMode('login');
      return;
    }
    if (cart.length === 0) {
      notifyUser('Empty cart drawer. Please select grocery items first.', 'error');
      return;
    }
    if (!selectedAddressId) {
      notifyUser('Please select or specify shipping coordinates address.', 'error');
      return;
    }

    const payloadTargetAddress = addresses.find(a => a.id === selectedAddressId);
    if (!payloadTargetAddress) return;

    let paymentWindow: Window | null = null;
    if (paymentMethod === 'Stripe') {
      try {
        paymentWindow = window.open('about:blank', '_blank');
        if (paymentWindow) {
          paymentWindow.document.write(`
            <html>
              <head>
                <title>Nammashop Secure Gateway</title>
                <style>
                  body {
                    background-color: #0f172a;
                    color: #f8fafc;
                    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    height: 100vh;
                    margin: 0;
                    overflow: hidden;
                    text-align: center;
                  }
                  .loader {
                    border: 4px solid #1e293b;
                    border-top: 4px solid #10b981;
                    border-radius: 50%;
                    width: 50px;
                    height: 50px;
                    animation: spin 1s linear infinite;
                    margin-bottom: 20px;
                  }
                  @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                  }
                  h2 {
                    font-size: 20px;
                    margin: 0 0 8px 0;
                    font-weight: 700;
                    letter-spacing: -0.025em;
                  }
                  p {
                    color: #94a3b8;
                    font-size: 14px;
                    margin: 0;
                  }
                </style>
              </head>
              <body>
                <div class="loader"></div>
                <h2>Connecting to Stripe Gateway</h2>
                <p>Spawning secure payment connection, please do not close this window...</p>
              </body>
            </html>
          `);
        }
      } catch (err) {
        console.warn('Initial window.open blocked by aggressive browser configuration', err);
      }
    }

    setIsPendingCheckout(true);
    try {
      const resp = await fetch('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          items: cartDetails.map(it => ({
            productId: it.productId,
            productName: it.details!.name,
            quantity: it.quantity
          })),
          subtotal: cartSubtotal,
          discount: activeCouponDiscount,
          couponCode: activeAppliedCoupon?.code,
          address: payloadTargetAddress,
          paymentMethod,
          clientToken: token,
          clientOrigin: window.location.origin
        })
      });

      const data = await resp.json();
      if (resp.ok) {
        if (data.stripeSessionUrl) {
          setStripeSessionUrl(data.stripeSessionUrl);
          setStripeRedirecting(true);
          
          notifyUser('Stripe payment initialized securely. Redirecting... 💳', 'success');
          
          if (paymentWindow) {
            paymentWindow.location.href = data.stripeSessionUrl;
          } else {
            // Springback redirect
            try {
              if (window.self !== window.top) {
                window.top!.location.href = data.stripeSessionUrl;
              } else {
                window.location.href = data.stripeSessionUrl;
              }
            } catch (e) {
              console.warn('Sandbox browser redirect block caught. Retrying window.open inline:', e);
              const win = window.open(data.stripeSessionUrl, '_blank');
              if (!win) {
                window.location.href = data.stripeSessionUrl;
              }
            }
          }
          return;
        }

        if (paymentWindow) {
          paymentWindow.close();
        }

        if (data.stripeMocked) {
          notifyUser('STRIPE PAYMENT SIMULATED! Order successfully placed. 💳🎉', 'success');
        } else {
          notifyUser('ORDER AUTHORIZED AND COMMITTED SUCCESSFULLY! 🎉', 'success');
        }
        setCart([]); // Clear cart persistent bag
        setActiveAppliedCoupon(null);
        setCouponCodeInput('');
        fetchCustomerData(token);
        fetchCatalogs(); // Refresh stock reductions instantly
        
        generateAndUploadInvoice(data.order, token).then(() => {
          fetchCustomerData(token);
        });

        setActiveTrackingOrder(data.order);
        setViewMode('success');
      } else {
        if (paymentWindow) {
          paymentWindow.close();
        }
        notifyUser(data.error || 'Server rejected order transaction.', 'error');
      }
    } catch {
      if (paymentWindow) {
        paymentWindow.close();
      }
      notifyUser('Api checkout payment gateway timeout.', 'error');
    } finally {
      setIsPendingCheckout(false);
    }
  };

  // Reorder groceries in 1-click
  const executeReorderLog = async (oId: string) => {
    try {
      const resp = await fetch(`/api/orders/${oId}/reorder`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await resp.json();
      if (resp.ok) {
        data.addedToCart.forEach((item: any) => {
          setCart(prev => {
            const index = prev.findIndex(c => c.productId === item.productId);
            if (index !== -1) {
              const updated = [...prev];
              updated[index].quantity = Math.min(updated[index].quantity + item.quantity, 100);
              return updated;
            } else {
              return [...prev, { productId: item.productId, quantity: item.quantity }];
            }
          });
        });
        notifyUser('Previous groceries loaded into checkout drawer!', 'success');
        setIsCartDrawerOpen(true);
      } else {
        notifyUser(data.error || 'Failed reordering.', 'error');
      }
    } catch {
      notifyUser('Communication parsing error.', 'error');
    }
  };

  // Submit product ratings & reviews
  const handleSubmitProductReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      notifyUser('Sign-in required to post review feedback.', 'error');
      setAuthMode('login');
      return;
    }
    if (!activeProductOverlay) return;

    try {
      const resp = await fetch('/api/reviews', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          productId: activeProductOverlay.id,
          rating: reviewRatingInput,
          comment: reviewCommentInput
        })
      });
      if (resp.ok) {
        notifyUser('Feedback posted. Thank you for your review!', 'success');
        setReviewCommentInput('');
        setReviewRatingInput(5);
        // Refetch product specs details
        const detailsResp = await fetch(`/api/products/${activeProductOverlay.id}`);
        if (detailsResp.ok) {
          const freshSpec = await detailsResp.json();
          // Update details overlay
          setActiveProductOverlay(freshSpec);
          fetchCatalogs();
        }
      }
    } catch {
      notifyUser('APIs offline posting review.', 'error');
    }
  };

  return (
    <div className="min-h-screen bg-transparent dark:bg-slate-950 text-slate-800 dark:text-slate-100 flex flex-col font-['Manrope'] select-none relative transition-colors duration-300">
      <div id="recaptcha-container"></div>
      
      {/* Visual Toast Notification Overlay */}
      {notification && (
        <div
          id="system-notification-toast"
          className={`fixed top-6 left-1/2 -translate-x-1/2 z-55 flex items-center gap-2.5 px-5 py-3 rounded-2xl shadow-xl transition-all duration-300 animate-in fade-in slide-in-from-top-6 ${
            notification.type === 'error'
              ? 'bg-slate-900 text-white border border-slate-800'
              : 'bg-[#ff2d2d] text-white border border-[#e12626]'
          }`}
        >
          {notification.type === 'error' ? <AlertCircle size={16} /> : <Check size={16} />}
          <span className="text-xs font-semibold tracking-wide">{notification.message}</span>
        </div>
      )}

      {/* Stripe Redirection Glassmorphism Overlay */}
      {stripeRedirecting && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md z-[9999] flex flex-col items-center justify-center text-white p-6 animate-fade-in">
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-8 max-w-sm w-full text-center space-y-6 shadow-2xl">
            <div className="relative w-16 h-16 mx-auto">
              {/* Pulsating ripples */}
              <div className="absolute inset-0 rounded-full border border-[#ff2d2d]/30 animate-ping opacity-75" />
              <div className="absolute inset-2 rounded-full border border-[#ff2d2d]/50 animate-pulse" />
              <div className="absolute inset-4 bg-[#ff2d2d] rounded-full flex items-center justify-center shadow-lg">
                <CreditCard className="text-white animate-bounce" size={24} />
              </div>
            </div>
            
            <div className="space-y-2">
              <h3 className="font-extrabold text-base tracking-tight">Securing Stripe Connection</h3>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Standardizing compatibility & routing. Redirecting directly to the safe payment checkout gateway...
              </p>
            </div>

            <div className="pt-2 flex flex-col gap-2">
              <a 
                href={stripeSessionUrl} 
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1.5 bg-[#ff2d2d] hover:bg-[#e12626] text-white font-bold text-xs py-2.5 px-5 rounded-xl shadow-xs transition-all"
              >
                <span>Proceed to Checkout Now ↗</span>
              </a>
              <button 
                onClick={() => setStripeRedirecting(false)} 
                className="text-[10px] text-slate-500 hover:text-slate-400 transition-colors"
              >
                Cancel & Go Back
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DEMO ADMINISTRATIVE SHORTCUT INDICATOR BAR */}
      <div className="bg-[linear-gradient(90deg,#111827,#2b2b2b)] text-slate-100 px-4 py-1.5 flex flex-wrap items-center justify-between gap-2 text-[10px] sm:text-xs z-35 border-b border-slate-800">
        <div className="flex items-center gap-1.5 font-mono">
          <span className="h-2 w-2 rounded-full bg-[#ff2d2d] animate-pulse"></span>
          <span>SYSTEM INTEGRATION RUNNING ON LOCAL ENGINE PORT: 3000</span>
        </div>
        
        <div className="flex items-center gap-2">
          {isAdminUser(currentUser) ? (
            <button
              onClick={() => setViewMode(viewMode === 'admin' ? 'catalog' : 'admin')}
              className="bg-[#ff2d2d] hover:bg-[#e12626] text-white px-2 py-0.5 rounded font-bold cursor-pointer transition-all"
            >
              {viewMode === 'admin' ? '💻 SWITCH TO CUSTOMER GATE' : '📊 LAUNCH SYSTEM ADMIN SUITE'}
            </button>
          ) : (
            <span className="text-slate-400 italic">Test account admin login: admin@nammashop.com (admin123)</span>
          )}
        </div>
      </div>

      {/* STICKY HEADER VIEW NAVIGATION */}
      <header className="sticky top-0 z-40 bg-[rgba(255,255,255,0.94)] dark:bg-slate-900/95 backdrop-blur-xl border-b border-slate-200/70 shadow-[0_18px_60px_-32px_rgba(15,23,42,0.18)] py-3.5 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          
          {/* Logo Name */}
          <div
            onClick={() => { setViewMode('catalog'); setSelectedCategoryId(null); }}
            className="flex items-center gap-2 cursor-pointer group"
          >
            <div className="bg-[#ff2d2d] group-hover:bg-[#e12626] text-white p-2 rounded-xl transition-all shadow-xs">
              <ShoppingBag size={20} className="group-hover:rotate-6 transition-transform" />
            </div>
            <div>
              <h1 className="text-slate-950 font-extrabold text-lg tracking-wider leading-none">NAMMASHOP</h1>
              <p className="text-[9px] text-[#ff2d2d] font-bold uppercase tracking-widest mt-0.5">Quick Commerce</p>
            </div>
          </div>

          {/* FLUID FLOATING SEARCH BOX */}
          {viewMode === 'catalog' && (
            <div className="hidden md:flex flex-1 max-w-lg relative block box-border" onFocus={() => setIsSearchFocused(true)}>
              <input
                id="search-instant-autocomplete"
                type="text"
                placeholder="Search premium Alphonso mangoes, Amul full-cream milk, white eggs, chips..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    saveRecentSearchAndSubmit(searchTerm);
                  }
                }}
                className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:border-slate-700 focus:border-emerald-500 rounded-2xl pl-10 pr-4 py-2 text-xs focus:outline-none transition-all placeholder:text-gray-400 font-medium"
              />
              <Search className="absolute left-3.5 top-2.5 text-slate-400" size={15} />
              {searchTerm && (
                <button
                  onClick={() => { setSearchTerm(''); setIsSearchFocused(false); }}
                  className="absolute right-3.5 top-2 text-xs font-bold text-slate-400 hover:text-slate-600 dark:text-slate-400 cursor-pointer"
                >
                  Clear
                </button>
              )}

              {/* Advanced Suggestions & Autocomplete Dropdown Panel */}
              {isSearchFocused && (
                <div 
                  className="absolute top-11 left-0 right-0 bg-white border border-gray-100 rounded-2xl shadow-xl overflow-hidden p-4 z-50 animate-in fade-in duration-100 block"
                  onMouseLeave={() => setIsSearchFocused(false)}
                >
                  <div className="flex items-center justify-between border-b border-gray-50 pb-2 mb-3">
                    <span className="text-[10px] uppercase font-bold tracking-widest text-gray-400 font-sans">Search Assistant</span>
                    <button 
                      onClick={(e) => { e.stopPropagation(); setIsSearchFocused(false); }} 
                      className="text-gray-400 hover:text-gray-600 text-[10px] font-bold cursor-pointer font-sans"
                    >
                      Hide
                    </button>
                  </div>

                  {/* 1. Recents */}
                  {recentSearches.length > 0 && (
                    <div className="mb-3 text-left">
                      <div className="text-[11px] font-semibold text-gray-500 mb-1.5 flex items-center gap-1 font-sans">⏰ Recent Searches</div>
                      <div className="flex flex-wrap gap-1.5">
                        {recentSearches.map((tag, idx) => (
                          <button
                            key={idx}
                            onClick={() => { setSearchTerm(tag); setIsSearchFocused(false); }}
                            className="text-[10px] bg-gray-50 hover:bg-red-50 text-gray-600 hover:text-[#ff2d2d] font-medium px-2.5 py-1 rounded-full cursor-pointer transition-colors font-sans"
                          >
                            {tag}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 2. Trending */}
                  <div className="mb-3 text-left">
                    <div className="text-[11px] font-semibold text-gray-500 mb-1.5 flex items-center gap-1 font-sans">🔥 Trending Today</div>
                    <div className="flex flex-wrap gap-1.5">
                      {['Alphonso Mango', 'Amul Milk', 'Butter', 'Lays Masala', 'Fresh Eggs', 'Aashirvaad Atta'].map((tag, idx) => (
                        <button
                          key={idx}
                          onClick={() => { setSearchTerm(tag); setIsSearchFocused(false); }}
                          className="text-[10px] bg-slate-50 hover:bg-red-50 text-slate-600 hover:text-[#ff2d2d] font-medium px-2.5 py-1 rounded-full cursor-pointer transition-colors font-sans"
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 3. Auto-suggestions */}
                  {searchTerm.trim().length > 0 && (
                    <div className="text-left">
                      <div className="text-[11px] font-semibold text-[#ff2d2d] mb-1.5 font-sans">🥦 Live Product Matching</div>
                      <div className="space-y-1">
                        {products
                          .filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()) || (p.brand?.toLowerCase() || '').includes(searchTerm.toLowerCase()))
                          .slice(0, 4)
                          .map(p => (
                            <button
                              key={p.id}
                              onClick={() => { setSearchTerm(p.name); setIsSearchFocused(false); }}
                              className="w-full text-left text-xs text-gray-700 hover:text-[#ff2d2d] hover:bg-red-50/50 px-2.5 py-1.5 rounded-lg flex items-center justify-between transition-all cursor-pointer font-sans"
                            >
                              <span>{p.name}</span>
                              <span className="text-[9px] font-semibold text-[#ff2d2d] bg-red-50 px-1.5 py-0.5 rounded-md">{p.unit}</span>
                            </button>
                          ))
                        }
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Right Actions Trigger */}
          <div className="flex items-center gap-2 sm:gap-3 text-xs font-medium">
            
            {/* Catalog shortcuts */}
            <button
              onClick={() => { setViewMode('catalog'); setSelectedCategoryId(null); }}
              className={`px-3 py-2 rounded-xl transition-all cursor-pointer ${viewMode === 'catalog' ? 'text-[#ff2d2d] bg-red-50 font-bold' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              Shelves Catalog
            </button>

            {/* Theme Toggle */}
            <button
              onClick={() => {
                const newTheme = themeMode === 'dark' ? 'light' : 'dark';
                setThemeMode(newTheme);
                localStorage.setItem('nammashop_theme', newTheme);
                if (currentUser) {
                  fetch(`/api/users/${currentUser.id}`, {
                    method: 'PATCH',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ themePreference: newTheme })
                  });
                }
              }}
              className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="Toggle Dark Mode"
            >
              {themeMode === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            {/* AI Assistant shortcut */}
            <button
              onClick={() => setViewMode('ai')}
              className={`items-center gap-1.5 px-3 py-2 rounded-xl transition-all cursor-pointer ${viewMode === 'catalog' ? 'hidden' : 'flex'} ${viewMode === 'ai' ? 'text-[#ff2d2d] bg-red-50 font-bold font-sans' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              <Sparkles size={14} className="text-[#ff2d2d]" />
              <span>AI Kitchen</span>
            </button>

            {/* Profile trigger */}
            {currentUser ? (
              <button
                onClick={() => { setViewMode('profile'); setProfileSubTab('orders'); }}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl cursor-pointer ${viewMode === 'profile' ? 'text-[#ff2d2d] bg-red-50 font-bold' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                <img src={currentUser.avatar || `https://api.dicebear.com/7.x/pixel-art/svg?seed=${currentUser.id}`} className="h-5 w-5 rounded-full border border-gray-100 shrink-0" />
                <span className="hidden sm:inline">{currentUser.name.split(' ')[0]}</span>
              </button>
            ) : (
              <button
                onClick={() => setAuthMode('login')}
                className="flex items-center gap-1 bg-[#ff2d2d] hover:bg-[#e12626] active:scale-95 text-white font-semibold px-3.5 py-2 rounded-xl transition-all shadow-xs cursor-pointer"
              >
                <LogIn size={14} />
                <span>Join Nammashop</span>
              </button>
            )}

            {/* Shopping active badge */}
            {viewMode !== 'admin' && (
              <button
                onClick={() => setIsCartDrawerOpen(true)}
                className="relative bg-slate-900 text-white p-2.5 rounded-xl cursor-pointer hover:bg-slate-800 transition-all shadow-xs flex items-center justify-center aspect-square shrink-0"
              >
                <ShoppingCart size={15} />
                {cart.length > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-[#ff2d2d] text-[9px] font-bold text-white h-4.5 w-4.5 rounded-full flex items-center justify-center shadow-md animate-bounce">
                    {cart.reduce((sum, item) => sum + item.quantity, 0)}
                  </span>
                )}
              </button>
            )}

            {/* Logout shortcut */}
            {currentUser && (
              <button
                onClick={handleSignOut}
                className="p-2 border border-slate-100 hover:bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-xl transition-all cursor-pointer"
                title="Sign out of account"
              >
                <LogOut size={14} />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* MOBILE INSTANT AUTOCALENDAR SEARCH ACCORDION */}
      <div className="md:hidden bg-[rgba(255,255,255,0.78)] backdrop-blur-xl border-b border-white/70 px-4 py-3 space-y-3">
        <div className="flex items-center justify-between text-[11px]">
          <div>
            <p className="font-semibold text-slate-900">Delivering in 15-20 mins</p>
            <p className="text-slate-500">Fresh picks across London zones</p>
          </div>
          <div className="rounded-full bg-red-50 border border-red-100 px-3 py-1 text-[#ff2d2d] font-bold">
            Free over £20
          </div>
        </div>
        <div className="relative">
          <input
            type="text"
            placeholder="Search fruit, milk, bread, snacks..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-2xl pl-10 pr-3 py-3 text-sm focus:outline-none shadow-sm"
          />
          <Search className="absolute left-3.5 top-3.5 text-slate-400" size={16} />
        </div>
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {['Fresh berries', 'Breakfast', 'Dinner in 10', 'Weekly staples'].map((tag) => (
            <button
              key={tag}
              onClick={() => setSearchTerm(tag)}
              className="shrink-0 rounded-full border border-white/80 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-600 shadow-sm"
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* BODY PLATFORM CONTEXT ROUTING */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 pb-32 md:pb-24">
        
        {/* VIEW 1: INVENTORY ADMIN PANEL */}
        {viewMode === 'admin' && authInitialized && isAdminUser(currentUser) && (
          <AdminPortal
            onNotify={notifyUser}
            categories={categories}
            products={products}
            orders={orders}
            coupons={coupons}
            banners={banners}
            onRefreshAllData={fetchCatalogs}
          />
        )}

        {viewMode === 'admin' && (!authInitialized || !isAdminUser(currentUser)) && (
          <div className="bg-white border border-slate-100 rounded-2xl p-8 text-center shadow-sm">
            <Lock className="mx-auto text-slate-400 mb-3" size={28} />
            <h2 className="text-lg font-black text-slate-900">Admin authentication required</h2>
            <p className="text-sm text-slate-500 mt-1">
              {!authInitialized ? 'Restoring secure admin session...' : 'Please sign in with an administrator account.'}
            </p>
            {authInitialized && (
              <button
                onClick={() => setAuthMode('login')}
                className="mt-4 bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-bold"
              >
                Admin Login
              </button>
            )}
          </div>
        )}

        {/* VIEW 2: CHECKOUT BILLING SHEET */}
        {viewMode === 'checkout' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Back to shelves navigation */}
            <button
              onClick={() => setViewMode('catalog')}
              className="flex items-center gap-1 text-xs text-emerald-700 font-bold hover:underline cursor-pointer"
            >
              <ChevronLeft size={16} />
              <span>Back to Grocery Shelves Catalogue</span>
            </button>

            <div className="flex flex-col lg:flex-row gap-8 items-start">
              
              {/* Delivery Coordinates & Payment Selection Gate */}
              <div className="flex-1 space-y-6 w-full">
                
                {/* addresses block */}
                <div className="bg-white border border-gray-100 rounded-3xl p-5 sm:p-6 shadow-3xs space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-gray-900 font-extrabold text-base tracking-tight flex items-center gap-1.5">
                      <MapPin size={18} className="text-emerald-600" />
                      <span>Select Delivery coordinates Address</span>
                    </h3>
                    
                    {!isAddingNewAddress && (
                      <button
                        onClick={() => setIsAddingNewAddress(true)}
                        className="text-emerald-700 hover:text-emerald-800 text-xs font-bold flex items-center gap-1 tracking-wide"
                      >
                        <Plus size={14} />
                        <span>Pinned Location</span>
                      </button>
                    )}
                  </div>

                  {isAddingNewAddress ? (
                    <form onSubmit={handleAddNewAddress} className="border border-slate-100 bg-slate-50/50 rounded-2xl p-4 text-xs space-y-3.5">
                      <h4 className="font-bold text-gray-800">Add shipping and delivery gate passcode</h4>
                      <div className="grid grid-cols-2 gap-3.5">
                        
                        <div>
                          <label className="block text-slate-500 font-medium mb-1">Gate coordinates (label)</label>
                          <select
                            value={newAddressForm.label}
                            onChange={(e) => setNewAddressForm({ ...newAddressForm, label: e.target.value })}
                            className="w-full bg-white border border-slate-100 rounded-lg px-2.5 py-1.5 focus:outline-none"
                          >
                            <option value="Home">Home Address</option>
                            <option value="Work">Corporate Work</option>
                            <option value="Other">Other Pinned Gate</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-slate-500 font-medium mb-1">Recipient Name *</label>
                          <input
                            type="text"
                            required
                            value={newAddressForm.fullName}
                            onChange={(e) => setNewAddressForm({ ...newAddressForm, fullName: e.target.value })}
                            placeholder="e.g. Rohan Sharma"
                            className={`w-full bg-white border ${addressErrors.fullName ? 'border-red-400 focus:ring-1 focus:ring-red-500/50' : 'border-slate-100'} rounded-lg px-2.5 py-1.5 focus:outline-none`}
                          />
                          {addressErrors.fullName && <p className="text-red-500 text-[10px] fixed mt-0.5">{addressErrors.fullName}</p>}
                        </div>

                        <div className="col-span-2">
                          <label className="block text-slate-500 font-medium mb-1">Street address *</label>
                          <input
                            type="text"
                            required
                            value={newAddressForm.street}
                            onChange={(e) => setNewAddressForm({ ...newAddressForm, street: e.target.value })}
                            placeholder="e.g. Flat 402, Sunset Heights, Koramangala 4th Block"
                            className={`w-full bg-white border ${addressErrors.street ? 'border-red-400 focus:ring-1 focus:ring-red-500/50' : 'border-slate-100'} rounded-lg px-2.5 py-1.5 focus:outline-none`}
                          />
                          {addressErrors.street && <p className="text-red-500 text-[10px] fixed mt-0.5">{addressErrors.street}</p>}
                        </div>

                        <div>
                          <label className="block text-slate-500 font-medium mb-1">City *</label>
                          <input
                            type="text"
                            required
                            value={newAddressForm.city}
                            onChange={(e) => setNewAddressForm({ ...newAddressForm, city: e.target.value })}
                            placeholder="e.g. Bengaluru"
                            className={`w-full bg-white border ${addressErrors.city ? 'border-red-400 focus:ring-1 focus:ring-red-500/50' : 'border-slate-100'} rounded-lg px-2.5 py-1.5 focus:outline-none`}
                          />
                          {addressErrors.city && <p className="text-red-500 text-[10px] fixed mt-0.5">{addressErrors.city}</p>}
                        </div>

                        <div>
                          <label className="block text-slate-500 font-medium mb-1">State *</label>
                          <input
                            type="text"
                            required
                            value={newAddressForm.state}
                            onChange={(e) => setNewAddressForm({ ...newAddressForm, state: e.target.value })}
                            placeholder="e.g. Karnataka"
                            className={`w-full bg-white border ${addressErrors.state ? 'border-red-400 focus:ring-1 focus:ring-red-500/50' : 'border-slate-100'} rounded-lg px-2.5 py-1.5 focus:outline-none`}
                          />
                          {addressErrors.state && <p className="text-red-500 text-[10px] fixed mt-0.5">{addressErrors.state}</p>}
                        </div>

                        <div>
                          <label className="block text-slate-500 font-medium mb-1">Pincode *</label>
                          <input
                            type="text"
                            required
                            value={newAddressForm.pincode}
                            onChange={(e) => setNewAddressForm({ ...newAddressForm, pincode: e.target.value })}
                            placeholder="e.g. 560034"
                            className={`w-full bg-white border ${addressErrors.pincode ? 'border-red-400 focus:ring-1 focus:ring-red-500/50' : 'border-slate-100'} rounded-lg px-2.5 py-1.5 focus:outline-none`}
                          />
                          {addressErrors.pincode && <p className="text-red-500 text-[10px] fixed mt-0.5">{addressErrors.pincode}</p>}
                        </div>

                        <div>
                          <label className="block text-slate-500 font-medium mb-1">Contact Phone Mobile *</label>
                          <input
                            type="text"
                            required
                            value={newAddressForm.phone}
                            onChange={(e) => setNewAddressForm({ ...newAddressForm, phone: e.target.value })}
                            placeholder="e.g. 9876543210"
                            className={`w-full bg-white border ${addressErrors.phone ? 'border-red-400 focus:ring-1 focus:ring-red-500/50' : 'border-slate-100'} rounded-lg px-2.5 py-1.5 focus:outline-none`}
                          />
                          {addressErrors.phone && <p className="text-red-500 text-[10px] fixed mt-0.5">{addressErrors.phone}</p>}
                        </div>
                      </div>

                      <div className="flex gap-2 justify-end pt-1">
                        <button
                          type="button"
                          onClick={() => setIsAddingNewAddress(false)}
                          className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 dark:text-slate-300 font-semibold rounded-lg transition-all"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-750 text-white font-semibold rounded-lg shadow-xs transition-all"
                        >
                          Save Coordinates
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {addresses.length === 0 ? (
                        <p className="text-xs text-rose-500 font-semibold bg-rose-50 p-3 rounded-2xl border border-rose-100 md:col-span-2">⚠️ Pinned address registry empty. Please pin a shipping coordinate above to enable instant delivery!</p>
                      ) : (
                        addresses.map(a => (
                          <div
                            key={a.id}
                            onClick={() => setSelectedAddressId(a.id)}
                            className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                              selectedAddressId === a.id
                                ? 'border-emerald-600 bg-emerald-50/20 shadow-xs ring-1 ring-emerald-600'
                                : 'border-slate-100 bg-white hover:bg-slate-50'
                            }`}
                          >
                            <div className="text-xs leading-relaxed text-gray-500">
                              <span className="font-extrabold text-xs text-gray-800 bg-slate-100 px-2 py-0.5 rounded-full inline-block mb-2 uppercase">{a.label}</span>
                              <h4 className="font-bold text-gray-800">{a.fullName}</h4>
                              <p className="mt-1">{a.street}</p>
                              <p>{a.city}, {a.state} - {a.pincode}</p>
                            </div>
                            <span className="text-[11px] font-mono font-bold text-slate-700 mt-2.5 block">Mobile: {a.phone}</span>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* Gateway Payment selection */}
                <div className="bg-white border border-gray-100 rounded-3xl p-5 sm:p-6 shadow-3xs space-y-4">
                  <h3 className="text-gray-900 font-extrabold text-base tracking-tight flex items-center gap-1.5">
                    <Calendar size={18} className="text-emerald-600" />
                    <span>Select delivery slot</span>
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[
                      { id: 'express', title: 'Express', eta: '15-20 mins', fee: '£2.99', desc: 'Fastest priority dispatch for urgent grocery runs.' },
                      { id: 'evening', title: 'Evening saver', eta: '6pm - 9pm', fee: '£1.49', desc: 'Lower fee with a wider same-day delivery window.' },
                      { id: 'scheduled', title: 'Scheduled', eta: 'Choose tomorrow', fee: 'Free', desc: 'Best for bigger baskets and planned weekly orders.' }
                    ].map((slot) => (
                      <button
                        key={slot.id}
                        type="button"
                        onClick={() => setDeliverySlot(slot.id as typeof deliverySlot)}
                        className={`rounded-2xl border p-4 text-left transition-all ${
                          deliverySlot === slot.id
                            ? 'border-emerald-600 bg-emerald-50/30 ring-1 ring-emerald-600'
                            : 'border-slate-100 bg-white hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-bold text-sm text-gray-900">{slot.title}</span>
                          <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-emerald-700 border border-emerald-100">{slot.fee}</span>
                        </div>
                        <p className="mt-2 text-xs font-semibold text-slate-600">{slot.eta}</p>
                        <p className="mt-1 text-[11px] leading-5 text-slate-500">{slot.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Gateway Payment selection */}
                <div className="bg-white border border-gray-100 rounded-3xl p-5 sm:p-6 shadow-3xs space-y-4">
                  <h3 className="text-gray-900 font-extrabold text-base tracking-tight flex items-center gap-1.5">
                    <Truck size={18} className="text-emerald-600" />
                    <span>Select Payment Gateway Mode</span>
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div
                      onClick={() => setPaymentMethod('COD')}
                      className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                        paymentMethod === 'COD'
                          ? 'border-emerald-600 bg-emerald-50/20 ring-1 ring-emerald-600'
                          : 'border-slate-100 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <span className="font-bold text-xs text-gray-800 block">Cash on Delivery (COD)</span>
                      <p className="text-[10px] text-gray-400 mt-1">Pay flat cash-back at your corridor doorway steps upon package delivery.</p>
                    </div>

                    <div
                      onClick={() => setPaymentMethod('Razorpay')}
                      className={`p-4 rounded-2xl border transition-all cursor-pointer opacity-90 ${
                        paymentMethod === 'Razorpay'
                          ? 'border-emerald-600 bg-emerald-50/20 ring-1 ring-emerald-600'
                          : 'border-slate-100 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <span className="font-bold text-xs text-gray-800 block">UPI / Razorpay Gateway</span>
                      <p className="text-[10px] text-gray-400 mt-1">Prepay via direct secure Netbanking, UPI, GPay, or Net Banking API.</p>
                    </div>

                    <div
                      onClick={() => setPaymentMethod('Stripe')}
                      className={`p-4 rounded-2xl border transition-all cursor-pointer opacity-90 ${
                        paymentMethod === 'Stripe'
                          ? 'border-emerald-600 bg-emerald-50/20 ring-1 ring-emerald-600'
                          : 'border-slate-100 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <span className="font-bold text-xs text-gray-800 block">Stripe Credit Cards</span>
                      <p className="text-[10px] text-gray-400 mt-1">Enter credentials securely protected under end-to-end PCI regulations.</p>
                    </div>
                  </div>
                </div>

              </div>

              {/* Order total overview summary bills */}
              <div className="w-full lg:w-[360px] bg-white border border-gray-100 p-5 sm:p-6 rounded-3xl shrink-0 shadow-xs space-y-4">
                <h4 className="text-gray-900 font-bold text-sm tracking-tight border-b border-gray-50 pb-2.5">Checkout Receipt summary</h4>
                
                <div className="space-y-3">
                  {cartDetails.map((it, idx) => {
                    const priceNode = it.details!.price * (1 - it.details!.discount / 100);
                    return (
                      <div key={idx} className="flex justify-between items-center text-xs text-slate-600">
                        <span>{it.details!.name} ({it.details!.unit}) x <strong>{it.quantity}</strong></span>
                        <span className="font-mono font-bold text-slate-800">£{(priceNode * it.quantity).toFixed(2)}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Coupon widget */}
                <div className="border-t border-b border-gray-50 py-3 mt-3.5 space-y-2">
                  <div className="flex gap-1.5 items-center">
                    <input
                      type="text"
                      placeholder="Use Coupon: NAMMA30"
                      value={couponCodeInput}
                      onChange={(e) => setCouponCodeInput(e.target.value)}
                      className="flex-1 bg-slate-50 border border-slate-100 px-3 py-1.5 text-xs rounded-xl focus:outline-none"
                    />
                    <button
                      onClick={applyCouponCode}
                      className="bg-slate-900 text-white hover:bg-slate-800 text-[10px] font-bold px-3 py-2 rounded-xl cursor-pointer"
                    >
                      Apply
                    </button>
                  </div>
                  {activeAppliedCoupon && (
                    <div className="bg-emerald-50 border border-emerald-100 p-2 rounded-xl flex items-center justify-between text-[11px] text-emerald-800">
                      <span>🎉 PROMO CODE: <strong>{activeAppliedCoupon.code}</strong> matched!</span>
                      <button
                        onClick={() => { setActiveAppliedCoupon(null); setCouponCodeInput(''); }}
                        className="font-bold text-[10px] text-emerald-600 hover:underline"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>

                {/* Costs breakdown */}
                <div className="text-xs space-y-2 leading-none pb-2">
                  <div className="flex justify-between text-slate-500">
                    <span>Retail bill subtotal</span>
                    <span className="font-mono font-semibold">£{cartSubtotal.toFixed(2)}</span>
                  </div>
                  {activeCouponDiscount > 0 && (
                    <div className="flex justify-between text-emerald-600">
                      <span>Promo Coupon Discount</span>
                      <span className="font-mono font-semibold">-£{activeCouponDiscount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-slate-500">
                    <span>VAT & Organic Cess (5%)</span>
                    <span className="font-mono font-semibold">£{computedTax.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>Delivery fee ({deliverySlot})</span>
                    <span className="font-mono font-semibold">
                      {finalDeliveryFee === 0 ? <strong className="text-emerald-600 uppercase">FREE</strong> : `£${finalDeliveryFee.toFixed(2)}`}
                    </span>
                  </div>
                </div>

                <div className="border-t border-gray-100 pt-3 flex justify-between items-center text-slate-900 dark:text-white font-extrabold text-sm">
                  <span>Grand Total Bill</span>
                  <span className="font-mono font-extrabold text-lg text-emerald-700">£{cartGrandTotal.toFixed(2)}</span>
                </div>

                <button
                  onClick={checkoutCartAndPay}
                  disabled={isPendingCheckout}
                  className={`w-full ${isPendingCheckout ? 'bg-slate-450 cursor-not-allowed opacity-80' : 'bg-emerald-600 hover:bg-emerald-700 active:scale-95'} py-3 rounded-2xl text-white font-bold text-xs tracking-wider transition-all mt-4 cursor-pointer flex items-center justify-center gap-1.5 shadow-sm`}
                >
                  {isPendingCheckout ? (
                    <div className="h-3 w-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Lock size={12} />
                  )}
                  <span>{isPendingCheckout ? 'AUTHORIZING AND SECURING...' : 'PLACE ORDER & CONFIRM DELIVERY SLOT'}</span>
                </button>
                
                <p className="text-[10px] text-center text-slate-400">Secure banking connections are active. PCI-DSS shielded.</p>
              </div>

            </div>
          </div>
        )}

        {/* VIEW 2.5: AI SMART KITCHEN ASSISTANT AND RECIPE GENERATOR CONTAINER */}
        {viewMode === 'ai' && (
          <AIPage
            products={products}
            onAddProductsToCart={addProductsFromRecipeToCart}
            cartItemIds={cart.map(c => c.productId)}
            notifyUser={notifyUser}
            addToCart={addToCart}
            setViewMode={setViewMode}
          />
        )}

        {/* VIEW 3: CUSTOMER PORTALS PROFILE DASHBOARD (Order Timeline monitoring) */}
        {viewMode === 'profile' && (
          <CustomerProfileDashboard
            currentUser={currentUser}
            token={token}
            onUpdateUser={(updatedUser) => {
              setCurrentUser(updatedUser);
            }}
            onLogout={handleSignOut}
            orders={orders}
            addresses={addresses}
            wishlist={wishlist}
            products={products}
            toggleWishlist={toggleWishlist}
            addToCart={addToCart}
            notifyUser={notifyUser}
            fetchCustomerData={() => fetchCustomerData(token!)}
            fetchCatalogs={fetchCatalogs}
            initialTab={profileSubTab}
            themeMode={themeMode}
            setThemeMode={setThemeMode}
          />
        )}

        {/* VIEW 3.5: CHECKOUT SUCCESS LANDING RECEIPT */}
        {viewMode === 'success' && activeTrackingOrder && (
          <OrderSuccessView
            order={activeTrackingOrder}
            products={products}
            addToCart={addToCart}
            notifyUser={notifyUser}
            currentUser={currentUser}
            token={token}
            onNavigateToProducts={() => {
              setViewMode('catalog');
            }}
            onTrackLiveDispatch={() => {
              setProfileSubTab('tracking');
              setViewMode('profile');
            }}
            onNavigateToOrders={() => {
              setProfileSubTab('orders');
              setViewMode('profile');
            }}
          />
        )}

        {/* VIEW 4: DEFAULT HOMEPAGE HERO & PRODUCT SHELVES CATALOGS */}
        {viewMode === 'catalog' && (
          <div className="space-y-8 animate-in fade-in duration-200">
            <section className="flex justify-center sm:justify-start">
              <button
                onClick={() => setViewMode('ai')}
                className="group relative inline-flex items-center overflow-hidden rounded-full bg-[linear-gradient(90deg,#ff5858_0%,#ff2d2d_42%,#e12626_100%)] p-1 shadow-[0_24px_50px_-24px_rgba(255,45,45,0.5)] transition hover:scale-[1.01]"
              >
                <span className="flex items-center gap-3 rounded-full bg-[linear-gradient(90deg,rgba(255,45,45,0.96),rgba(225,38,38,0.98))] px-5 py-3 text-white sm:px-7">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full border border-white/35 bg-white/10">
                    <Sparkles size={18} className="text-white" />
                  </span>
                  <span className="text-left">
                    <span className="block text-[10px] font-bold uppercase tracking-[0.28em] text-red-100/85">
                      Smart cooking
                    </span>
                    <span className="block text-xl font-extrabold tracking-tight">
                      AI Kitchen
                    </span>
                  </span>
                </span>
                <span className="absolute right-5 h-3 w-3 rounded-full bg-red-200 opacity-90 shadow-[0_0_20px_rgba(254,202,202,0.9)]" />
              </button>
            </section>

            <section className="relative overflow-hidden rounded-[2rem] border border-slate-200/80 bg-white text-slate-900 shadow-[0_28px_80px_-38px_rgba(15,23,42,0.18)]">
              {activeBanner && (
                <>
                  <img
                    src={activeBanner.image}
                    alt={activeBanner.title}
                    loading="eager"
                    className="absolute inset-0 h-full w-full object-cover opacity-25"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,45,45,0.16),transparent_26%),linear-gradient(120deg,rgba(255,255,255,0.82),rgba(255,246,246,0.96))]" />
                </>
              )}
              <div className="relative grid gap-6 p-5 sm:p-7 lg:grid-cols-[1.3fr_0.9fr] lg:p-10">
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-[0.24em] text-slate-700">
                    <span className="rounded-full bg-red-50 text-[#ff2d2d] px-3 py-1">{activeBanner?.badge || 'Sponsored campaign'}</span>
                    <span className="rounded-full bg-slate-100 px-3 py-1">{activeBanner?.sponsorName || 'UK grocery express'}</span>
                  </div>
                  <div className="space-y-3">
                    <h2 className="max-w-xl font-['Fraunces'] text-3xl leading-[1.05] sm:text-5xl">
                      {activeBanner?.title || 'Premium groceries, household essentials, and weekly staples delivered beautifully.'}
                    </h2>
                    <p className="max-w-lg text-sm leading-6 text-slate-600 sm:text-base">
                      {activeBanner?.subtitle || 'Built for UK shoppers with fast delivery windows, curated offers, and a polished mobile-first experience that feels like a real production storefront.'}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={() => activeBanner ? handleBannerNavigate(activeBanner) : window.scrollTo({ top: 720, behavior: 'smooth' })}
                      className="rounded-2xl bg-[#ff2d2d] px-5 py-3 text-sm font-bold text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-[#e12626]"
                    >
                      {activeBanner?.ctaLabel || 'Shop Now'}
                    </button>
                    <button
                      onClick={() => activeBanner ? handleBannerNavigate(activeBanner, activeBanner.targetCategoryId || null) : setIsCartDrawerOpen(true)}
                      className="rounded-2xl border border-red-200 bg-white px-5 py-3 text-sm font-bold text-[#ff2d2d] backdrop-blur transition hover:bg-red-50"
                    >
                      {activeBanner?.secondaryCtaLabel || 'Explore Collection'}
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'Avg. delivery', value: '18 mins' },
                      { label: 'Live offers', value: `${flashSaleProducts.length}+` },
                      { label: 'Free delivery', value: '£20+' }
                    ].map((stat) => (
                      <div key={stat.label} className="rounded-2xl border border-slate-200 bg-white/90 p-3 backdrop-blur">
                        <p className="text-lg font-extrabold">{stat.value}</p>
                        <p className="text-[11px] text-slate-500">{stat.label}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid gap-3 self-end">
                  {banners.length > 1 && (
                    <div className="flex items-center justify-between rounded-[1.5rem] border border-slate-200 bg-white/92 p-3 backdrop-blur-md">
                      <button
                        onClick={() => setBannerIndex((prev) => (prev - 1 + banners.length) % banners.length)}
                        className="rounded-full bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-200"
                      >
                        Prev
                      </button>
                      <div className="flex gap-2">
                        {banners.map((banner, idx) => (
                          <button
                            key={banner.id}
                            onClick={() => setBannerIndex(idx)}
                            className={`h-2.5 rounded-full transition-all ${idx === bannerIndex ? 'w-8 bg-[#ff2d2d]' : 'w-2.5 bg-slate-300'}`}
                            aria-label={`Go to banner ${idx + 1}`}
                          />
                        ))}
                      </div>
                      <button
                        onClick={() => setBannerIndex((prev) => (prev + 1) % banners.length)}
                        className="rounded-full bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-200"
                      >
                        Next
                      </button>
                    </div>
                  )}
                  {[
                    { icon: Clock3, title: 'Delivery promise', desc: 'Slots from 15 minutes with evening and scheduled windows.' },
                    { icon: ShieldCheck, title: 'Trusted checkout', desc: 'Secure card payments, trusted doorstep delivery, and order tracking.' },
                    { icon: BadgePercent, title: 'Weekly savings', desc: 'Flash deals, bundle pricing, and personalized recommendations.' }
                  ].map((item) => (
                    <div key={item.title} className="rounded-[1.5rem] border border-white/12 bg-white/10 p-4 backdrop-blur-md">
                      <item.icon size={18} className="mb-3 text-[#ff2d2d]" />
                      <h3 className="text-sm font-bold">{item.title}</h3>
                      <p className="mt-1 text-xs leading-5 text-slate-600">{item.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
              <div className="rounded-[2rem] border border-white/70 bg-[rgba(255,255,255,0.8)] p-4 shadow-[0_18px_50px_-34px_rgba(15,23,42,0.35)] backdrop-blur-xl sm:p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">Quick categories</p>
                    <h3 className="text-lg font-extrabold text-slate-900">Start with a department</h3>
                  </div>
                  <button
                    onClick={() => setSelectedCategoryId(null)}
                    className="rounded-full bg-slate-900 px-4 py-2 text-[11px] font-bold text-white"
                  >
                    View all
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {curatedCategoryCards.map((category) => (
                    <button
                      key={category.id}
                      onClick={() => setSelectedCategoryId(category.id)}
                      className={`rounded-[1.5rem] border p-4 text-left transition hover:-translate-y-0.5 ${
                        selectedCategoryId === category.id
                          ? 'border-[#ff2d2d] bg-red-50 shadow-md'
                          : `border-white/70 bg-gradient-to-br ${category.accent} shadow-sm`
                      }`}
                    >
                      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-slate-700 shadow-sm">
                        <LayoutGrid size={18} />
                      </div>
                      <p className="text-sm font-bold text-slate-900">{category.name}</p>
                      <p className="mt-1 text-[11px] text-slate-500">Fresh arrivals and pantry picks</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-[2rem] border border-amber-100 bg-gradient-to-br from-amber-50 via-white to-orange-50 p-4 shadow-[0_18px_50px_-34px_rgba(15,23,42,0.35)] sm:p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-amber-600">Flash offers</p>
                    <h3 className="text-lg font-extrabold text-slate-900">Deals ending today</h3>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-[11px] font-bold text-amber-700 shadow-sm">
                    Save up to 35%
                  </span>
                </div>
                <div className="space-y-3">
                  {flashSaleProducts.slice(0, 3).map((product) => (
                    <button
                      key={product.id}
                      onClick={() => openProductOverlay(product)}
                      className="flex w-full items-center gap-3 rounded-[1.4rem] border border-white/80 bg-white/85 p-3 text-left shadow-sm transition hover:-translate-y-0.5"
                    >
                      <img src={product.image} alt={product.name} className="h-16 w-16 rounded-2xl object-cover" referrerPolicy="no-referrer" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-slate-900">{product.name}</p>
                        <p className="mt-1 text-[11px] text-slate-500">{product.brand || 'NammaShop Select'} • {product.unit}</p>
                        <div className="mt-2 flex items-center gap-2">
                          <span className="rounded-full bg-red-50 px-2 py-1 text-[10px] font-bold text-[#ff2d2d]">{product.discount}% off</span>
                          <span className="text-sm font-extrabold text-slate-900">£{(product.price * (1 - product.discount / 100)).toFixed(2)}</span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                { icon: Truck, title: '10-20 min delivery', desc: 'Fast dispatch across local coverage zones.' },
                { icon: ShieldCheck, title: 'Trusted quality', desc: 'Fresh stock, moderated reviews, and secure checkout.' },
                { icon: Package, title: 'Careful packing', desc: 'Cold-chain groceries packed separately where needed.' },
                { icon: BookmarkCheck, title: 'Smart recommendations', desc: 'Repeat past favourites and discover curated picks.' }
              ].map((item) => (
                <div key={item.title} className="rounded-[1.6rem] border border-white/70 bg-[rgba(255,255,255,0.76)] p-4 shadow-[0_18px_50px_-34px_rgba(15,23,42,0.35)] backdrop-blur-xl">
                  <item.icon size={18} className="text-[#ff2d2d]" />
                  <h3 className="mt-4 text-sm font-extrabold text-slate-900">{item.title}</h3>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{item.desc}</p>
                </div>
              ))}
            </section>

            <div className="space-y-3 rounded-[2rem] border border-white/70 bg-[rgba(255,255,255,0.76)] backdrop-blur-xl p-4 sm:p-5 shadow-[0_18px_50px_-34px_rgba(15,23,42,0.35)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-gray-900 font-extrabold text-sm uppercase tracking-widest">Browse by category</h3>
                  <p className="text-xs text-slate-500">Dynamic shelf filters designed for mobile-first discovery.</p>
                </div>
              </div>
              <div className="flex items-center gap-3 overflow-x-auto pb-2 pr-1 no-scrollbar select-none">
                <button
                  onClick={() => setSelectedCategoryId(null)}
                  className={`px-4 py-2.5 rounded-2xl text-xs font-semibold whitespace-nowrap transition-all border shrink-0 cursor-pointer ${
                    selectedCategoryId === null
                        ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                        : 'bg-white text-slate-700 hover:bg-slate-50 border-slate-100/70'
                  }`}
                >
                  All Categories
                </button>
                {categories.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setSelectedCategoryId(c.id)}
                    className={`px-4 py-2.5 rounded-2xl text-xs font-semibold whitespace-nowrap transition-all border shrink-0 cursor-pointer flex items-center gap-2 ${
                      selectedCategoryId === c.id
                        ? 'bg-[#ff2d2d] text-white border-[#ff2d2d] shadow-sm'
                        : 'bg-white text-slate-700 hover:bg-slate-50 border-slate-100/70'
                    }`}
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-black/5 text-[10px] font-extrabold">{c.name.charAt(0)}</span>
                    <span>{c.name}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 bg-[rgba(255,255,255,0.78)] border border-white/70 rounded-[2rem] p-4 shadow-[0_18px_50px_-34px_rgba(15,23,42,0.35)] backdrop-blur-xl text-xs">
              <div className="flex flex-wrap items-center gap-2.5">
                <select
                  value={sortOption}
                  onChange={(e) => setSortOption(e.target.value)}
                  className="bg-slate-50 border border-slate-100 hover:border-slate-200 outline-none rounded-xl px-3 py-2 font-bold text-[11px] text-slate-600 cursor-pointer"
                >
                  <option value="featured">Featured first</option>
                  <option value="discount">Biggest discounts</option>
                  <option value="price-low">Price: low to high</option>
                  <option value="price-high">Price: high to low</option>
                  <option value="rating">Top rated</option>
                </select>
                <select
                  value={brandFilter}
                  onChange={(e) => setBrandFilter(e.target.value)}
                  className="bg-slate-50 border border-slate-100 hover:border-slate-200 outline-none rounded-xl px-3 py-2 font-bold text-[11px] text-slate-600 cursor-pointer"
                >
                  <option value="">All Brands</option>
                  <option value="Namma Farms">Namma Farms</option>
                  <option value="Amul">Amul Dairy</option>
                  <option value="Lays">Lays</option>
                  <option value="Coca Cola">Coca Cola</option>
                  <option value="Cadbury">Cadbury Chocolates</option>
                </select>
                <label className="flex items-center gap-2 cursor-pointer font-bold select-none text-slate-500 text-[11px] mt-0.5">
                  <input
                    type="checkbox"
                    checked={onlyInStock}
                    onChange={(e) => setOnlyInStock(e.target.checked)}
                    className="rounded text-[#ff2d2d] focus:ring-[#ff2d2d] accent-[#ff2d2d] shrink-0"
                  />
                  <span>In stock only</span>
                </label>
              </div>
              <span className="text-[10px] text-gray-400 font-mono tracking-wider uppercase">Compact mode: <strong>{Math.min(products.length, HOMEPAGE_PRODUCTS_LIMIT)}</strong> loaded</span>
            </div>

            <section className="space-y-8">
              {[
                { title: 'Best Sellers', subtitle: 'Most purchased and highest confidence picks.', items: bestSellerProducts },
                { title: 'Daily Essentials', subtitle: 'Fast-repeat staples for everyday grocery runs.', items: dailyEssentialsProducts },
                { title: 'Trending Products', subtitle: 'What shoppers are adding right now.', items: trendingProducts },
                { title: 'Recommended For You', subtitle: wishlist.length > 0 ? 'Personalized from your activity.' : 'Curated starter recommendations.', items: personalizedProducts },
                { title: 'Fresh Picks', subtitle: 'High-rated in-stock produce and fresh categories.', items: freshPicksProducts },
                { title: 'Weekly Popular', subtitle: 'Top movers from this week.', items: weeklyPopularProducts },
                { title: 'Seasonal Offers', subtitle: 'Discount-led limited-time grocery deals.', items: flashSaleProducts },
                { title: 'Best sellers', subtitle: 'Most-loved items based on ratings and repeat buying signals.', items: bestSellerProducts },
                ...(recentlyViewedProducts.length > 0 ? [{ title: 'Recently viewed', subtitle: 'Pick up where you left off.', items: recentlyViewedProducts.slice(0, 8) }] : [])
              ].filter((rail, idx, arr) => arr.findIndex((r) => r.title === rail.title) === idx).map((rail) => {
                const railKey = rail.title.toLowerCase().replace(/\s+/g, '-');
                const visibleCount = railVisibleCounts[railKey] || 8;
                const visibleItems = rail.items.slice(0, visibleCount);
                return (
                <section key={rail.title} className="space-y-4">
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">Curated rail</p>
                      <h3 className="text-xl font-extrabold text-slate-900">{rail.title}</h3>
                      <p className="text-sm text-slate-500">{rail.subtitle}</p>
                    </div>
                  </div>
                  <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory no-scrollbar">
                    {visibleItems.map((p) => {
                      const hasDiscount = p.discount > 0;
                      const finalUnitPrice = p.price * (1 - p.discount / 100);
                      const isSavedInWishlist = wishlist.includes(p.id);
                      const cartItem = cart.find((c) => c.productId === p.id);

                      return (
                        <article
                          key={`${rail.title}-${p.id}`}
                          className="group snap-start min-w-[170px] max-w-[170px] sm:min-w-[200px] sm:max-w-[200px] rounded-[1.4rem] border border-white/80 bg-[rgba(255,255,255,0.95)] p-2.5 shadow-[0_18px_50px_-34px_rgba(15,23,42,0.45)] transition duration-200 hover:-translate-y-1 hover:shadow-[0_22px_60px_-30px_rgba(15,23,42,0.35)]"
                        >
                          <div className="relative">
                            {hasDiscount && (
                              <div className="absolute left-3 top-3 z-10 rounded-full bg-rose-500 px-2.5 py-1 text-[10px] font-bold text-white">
                                {p.discount}% OFF
                              </div>
                            )}
                            <button
                              onClick={() => toggleWishlist(p.id)}
                              className={`absolute right-3 top-3 z-10 rounded-full p-2 shadow-sm transition ${
                                isSavedInWishlist ? 'bg-rose-50 text-rose-500' : 'bg-white/85 text-slate-400'
                              }`}
                            >
                              <Heart size={14} className={isSavedInWishlist ? 'fill-current' : ''} />
                            </button>
                            <button
                              onClick={() => openProductOverlay(p)}
                              className="relative flex h-[132px] w-full items-center justify-center overflow-hidden rounded-[1.4rem] bg-slate-50 sm:h-[170px]"
                            >
                              <img
                                src={p.image}
                                alt={p.name}
                                className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                                referrerPolicy="no-referrer"
                              />
                              <div className="absolute inset-x-3 bottom-3 flex items-center justify-between rounded-full bg-white/88 px-3 py-2 text-[10px] font-bold text-slate-700 backdrop-blur">
                                <span>{p.stock > 0 ? `${p.stock} left` : 'Sold out'}</span>
                                <span className="flex items-center gap-1 text-amber-500"><Star size={11} className="fill-current" />{p.rating}</span>
                              </div>
                            </button>
                          </div>

                          <div className="mt-3.5">
                            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">{p.brand || 'NammaShop Select'}</p>
                            <button
                              onClick={() => openProductOverlay(p)}
                              className="mt-1 line-clamp-2 text-left text-sm font-extrabold leading-5 text-slate-900"
                            >
                              {p.name}
                            </button>
                            <div className="mt-3 flex flex-wrap gap-1.5">
                              {getProductVariants(p).map((variant) => (
                                <span key={variant} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-semibold text-slate-500">
                                  {variant}
                                </span>
                              ))}
                            </div>
                            <div className="mt-3 flex items-end justify-between gap-3">
                              <div>
                                {hasDiscount && <p className="text-[11px] text-slate-400 line-through">£{p.price.toFixed(2)}</p>}
                                <p className="text-lg font-extrabold text-slate-900">£{finalUnitPrice.toFixed(2)}</p>
                                <p className="text-[11px] text-slate-500">{p.unit}</p>
                              </div>
                              {p.stock === 0 ? (
                                <span className="rounded-xl bg-rose-50 px-3 py-2 text-[10px] font-bold text-rose-600">Out of stock</span>
                              ) : cartItem ? (
                                <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-2 py-2">
                                  <button onClick={() => decreaseCartCount(p.id)} className="rounded-lg bg-white p-1.5 shadow-sm"><Minus size={12} /></button>
                                  <span className="min-w-4 text-center text-sm font-extrabold">{cartItem.quantity}</span>
                                  <button onClick={() => addToCart(p.id, 1)} className="rounded-lg bg-white p-1.5 shadow-sm"><Plus size={12} /></button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => addToCart(p.id, 1)}
                                  className="rounded-2xl bg-[#ff2d2d] px-4 py-3 text-xs font-bold uppercase tracking-[0.18em] text-white transition hover:bg-[#e12626]"
                                >
                                  Quick add
                                </button>
                              )}
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                  {rail.items.length > visibleCount && (
                    <button
                      onClick={() => setRailVisibleCounts((prev) => ({ ...prev, [railKey]: visibleCount + 4 }))}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                    >
                      View More
                    </button>
                  )}
                </section>
              )})}
            </section>

            {products.length === 0 ? (
              <div className="text-center py-16 space-y-2 bg-[rgba(255,255,255,0.82)] border border-white/70 rounded-[2rem] shadow-[0_18px_50px_-34px_rgba(15,23,42,0.35)] backdrop-blur-xl">
                <AlertCircle className="mx-auto text-slate-300" size={32} />
                <h4 className="font-sans font-extrabold text-slate-800 text-sm">No matches found</h4>
                <p className="text-slate-400 text-xs">Try another category, search term, or reset the filters.</p>
              </div>
            ) : null}
          </div>
        )}

      </main>

      {/* FLOAT STICKY BILL BAR SUMMARY FOOTERS ON DECK */}
      {viewMode === 'catalog' && cart.length > 0 && !isCartDrawerOpen && (
        <div
          onClick={() => setIsCartDrawerOpen(true)}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-45 bg-slate-900 hover:bg-slate-800 active:scale-102 text-white px-5 py-3 w-[calc(100vw-2.5rem)] max-w-md rounded-2xl flex items-center justify-between shadow-xl cursor-pointer transition-all animate-bounce"
        >
          <div className="flex items-center gap-3">
            <div className="bg-[#ff2d2d] p-2 rounded-xl text-white shadow-md">
              <ShoppingCart size={15} />
            </div>
            <div className="text-left text-xs leading-none">
              <span className="font-extrabold font-mono text-sm inline-block">{cart.reduce((sum, item) => sum + item.quantity, 0)} units scheduled</span>
              <p className="text-[10px] text-slate-400 font-medium mt-1 uppercase tracking-wider">Subtotal: £{cartSubtotal.toFixed(2)}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-1 font-bold text-xs text-red-300 uppercase tracking-widest leading-none">
            <span>Bill Drawer</span>
            <ChevronRight size={14} />
          </div>
        </div>
      )}

      {/* SEGMENT 4: REAL-TIME SECURE SHOPPING CART DRAWERS SLIDERS */}
      {isCartDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-3xs animate-in fade-in duration-200">
          
          {/* Close trigger margins wrapper */}
          <div className="flex-1" onClick={() => setIsCartDrawerOpen(false)} />
          
          <div className="w-full max-w-md bg-white h-full flex flex-col justify-between overflow-hidden shadow-2xl relative animate-in slide-in-from-right duration-200">
            
            {/* Header drawer controls */}
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingCart size={16} className="text-[#ff2d2d]" />
                <h3 className="font-extrabold text-sm text-slate-800 tracking-tight">Shopping Checkout Drawer</h3>
              </div>
              <button
                onClick={() => setIsCartDrawerOpen(false)}
                className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-1 rounded-lg transition-all"
              >
                <X size={18} />
              </button>
            </div>

            {/* Cart entries lists */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {cartDetails.length === 0 ? (
                <div className="text-center py-24 space-y-2 text-slate-400">
                  <ShoppingBag size={32} className="mx-auto text-slate-200" />
                  <p className="text-xs">Your shopping drawer is perfectly empty.</p>
                  <button
                    onClick={() => setIsCartDrawerOpen(false)}
                    className="font-bold text-xs text-[#ff2d2d] hover:underline pt-2 inline-block cursor-pointer"
                  >
                    Browse farm groceries
                  </button>
                </div>
              ) : (
                cartDetails.map(it => {
                  const unitPrice = it.details!.price * (1 - it.details!.discount / 100);
                  return (
                    <div key={it.productId} className="flex gap-3 bg-slate-50/50 p-3 rounded-2xl border border-slate-100 text-xs text-slate-800 justify-between items-center relative">
                      <div className="flex gap-2.5 items-center">
                        <img src={it.details!.image} className="h-11 w-11 object-cover rounded-xl border border-slate-100 shadow-3xs" referrerPolicy="no-referrer" />
                        <div>
                          <h4 className="font-bold text-gray-800 line-clamp-1">{it.details!.name}</h4>
                          <span className="text-[10px] text-gray-400 font-mono inline-block mt-0.5">{it.details!.unit} • £{unitPrice.toFixed(2)}</span>
                        </div>
                      </div>

                      {/* Counts adjuster */}
                      <div className="flex items-center gap-2 bg-white border border-slate-100 p-1.5 rounded-xl shadow-3xs whitespace-nowrap">
                        <button
                          onClick={() => decreaseCartCount(it.productId)}
                          className="bg-slate-50 p-1 hover:bg-slate-100 rounded-md transition-all cursor-pointer"
                        >
                          <Minus size={9} className="stroke-[3]" />
                        </button>
                        <span className="font-mono font-extrabold text-slate-800 text-xs px-1">{it.quantity}</span>
                        <button
                          onClick={() => addToCart(it.productId, 1)}
                          className="bg-slate-50 p-1 hover:bg-slate-100 rounded-md transition-all cursor-pointer"
                        >
                          <Plus size={9} className="stroke-[3]" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Bill summary footer */}
            {cartDetails.length > 0 && (
              <div className="p-5 border-t border-gray-100 bg-[#FAFBFB] space-y-4">
                <div className="space-y-2 text-xs text-slate-500">
                  <div className="flex justify-between">
                    <span>Retail bag subtotal</span>
                    <span className="font-mono font-semibold">£{cartSubtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>VAT (5%) & Cess</span>
                    <span className="font-mono font-semibold">£{computedTax.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>10 minute delivery fee</span>
                    <span className="font-mono font-semibold">
                      {finalDeliveryFee === 0 ? <strong className="text-[#ff2d2d] uppercase">FREE</strong> : `£${finalDeliveryFee.toFixed(2)}`}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-800 font-extrabold pt-2 border-t border-slate-100/60 leading-none">
                    <span>Calculated Total</span>
                    <span className="font-mono text-[#ff2d2d] text-base">£{cartGrandTotal.toFixed(2)}</span>
                  </div>
                </div>

                <button
                  onClick={() => {
                    if (!token) {
                      notifyUser('Please sign in to complete checkout billing details.', 'error');
                      setAuthMode('login');
                      return;
                    }
                    setIsCartDrawerOpen(false);
                    setViewMode('checkout');
                  }}
                  className="w-full bg-slate-900 hover:bg-slate-800 active:scale-95 text-white font-extrabold text-xs py-3.5 rounded-2xl tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1 leading-none uppercase shadow-sm"
                >
                  <span>Go to Checkout billing</span>
                  <ArrowRight size={14} />
                </button>
              </div>
            )}

          </div>
        </div>
      )}

      {/* SEGMENT 5: PRODUCT DETAIL OVERLAYS AND RATINGS */}
      {activeProductOverlay && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-3xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
          
          <div className="bg-white border border-slate-100 rounded-3xl w-full max-w-2xl overflow-hidden max-h-[85vh] flex flex-col shadow-2xl relative animate-in zoom-in-95 duration-200">
            
            <button
              onClick={() => setActiveProductOverlay(null)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 bg-white/70 backdrop-blur-3xs p-1.5 rounded-full z-15 shadow-3xs"
            >
              <X size={16} />
            </button>

            {/* Scrollable specs sheet */}
            <div className="overflow-y-auto p-5 sm:p-6 space-y-6 flex-1">
              
              <div className="flex flex-col md:flex-row gap-6">
                <img
                  src={activeProductOverlay.image}
                  alt={activeProductOverlay.name}
                  className="w-full md:w-64 h-48 md:h-56 object-cover rounded-2xl border"
                  referrerPolicy="no-referrer"
                />
                
                <div className="space-y-3 flex-1 text-xs text-slate-600">
                  <span className="bg-red-50 text-[#ff2d2d] font-extrabold border border-red-100 px-2.5 py-0.5 rounded-full uppercase text-[10px] inline-block tracking-wider">{activeProductOverlay.brand || 'Namma Farms'}</span>
                  <h3 className="text-gray-900 font-extrabold text-base sm:text-lg leading-tight tracking-tight">{activeProductOverlay.name}</h3>
                  <p className="font-mono font-medium text-slate-400 text-xs">Unit Size: {activeProductOverlay.unit} • left in stock: {activeProductOverlay.stock} pcs</p>
                  
                  <div className="flex items-center gap-1 font-mono font-bold text-sm text-slate-800">
                    <Star className="text-amber-500 fill-current" size={13} />
                    <span>{activeProductOverlay.rating} / 5.0 Rating</span>
                    <span className="text-gray-400 font-sans">({activeProductOverlay.ratingCount} claims reviews posted)</span>
                  </div>

                  <p className="text-gray-500 leading-relaxed pt-1.5 text-[11px] whitespace-pre-wrap">{activeProductOverlay.description}</p>
                  
                  <div className="pt-2">
                    <button
                      onClick={() => {
                        addToCart(activeProductOverlay.id);
                        setActiveProductOverlay(null);
                      }}
                      className="bg-[#ff2d2d] hover:bg-[#e12626] text-white font-bold px-4 py-2 text-xs rounded-xl transition-all cursor-pointer shadow-xs uppercase tracking-wide inline-block"
                    >
                      Add unit to Cart (£{(activeProductOverlay.price * (1 - activeProductOverlay.discount/100)).toFixed(2)})
                    </button>
                  </div>
                </div>
              </div>

              {/* Dynamic ratings details */}
              <div className="border-t border-gray-100 pt-5 space-y-4 font-sans">
                <h4 className="text-slate-800 font-bold tracking-tight text-sm">Customer Reviews Feedback</h4>
                
                {/* Form to submit review */}
                <form onSubmit={handleSubmitProductReview} className="bg-slate-50 border border-slate-100 rounded-2xl p-4 text-xs space-y-3">
                  <p className="font-bold text-gray-800 uppercase tracking-widest text-[9px]">Post Rating Feedback</p>
                  <div className="flex gap-2 items-center">
                    <span className="text-gray-500 font-medium">Select Stars:</span>
                    <div className="flex gap-1.5 text-amber-500">
                      {[1,2,3,4,5].map((starIdx) => (
                        <button
                          key={starIdx}
                          type="button"
                          onClick={() => setReviewRatingInput(starIdx)}
                          className="hover:scale-110 active:scale-95 cursor-pointer"
                        >
                          <Star size={18} className={starIdx <= reviewRatingInput ? 'fill-current' : 'text-slate-300'} />
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-gray-500 font-medium">Write comments</label>
                    <textarea
                      required
                      value={reviewCommentInput}
                      onChange={(e) => setReviewCommentInput(e.target.value)}
                      placeholder="Comment on freshness, packing quality, speed of Nammashop courier courier partner..."
                      className="w-full bg-white border border-slate-100 text-slate-800 rounded-xl px-3 py-1.5 focus:outline-none resize-none h-14"
                    />
                  </div>

                  <button
                    type="submit"
                    className="bg-slate-900 border border-slate-950 hover:bg-slate-800 text-white font-bold px-3.5 py-1.5 rounded-lg text-[10px]"
                  >
                    Post Review
                  </button>
                </form>

                {/* Reviews List */}
                <div className="space-y-3">
                  {(activeProductOverlay as any).reviews && (activeProductOverlay as any).reviews.length > 0 ? (
                    (activeProductOverlay as any).reviews.map((rev: any) => (
                      <div key={rev.id} className="bg-slate-50/50 border border-slate-100 p-3 rounded-2xl flex gap-3 text-xs">
                        <img src={rev.userAvatar || 'https://api.dicebear.com/7.x/pixel-art/svg?seed=NammaReview'} className="h-6 w-6 rounded-full border border-gray-100" />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-gray-800">{rev.userName}</span>
                            <div className="flex items-center text-amber-500 font-mono text-[10px]">
                              {[...Array(rev.rating)].map((_, i) => <Star key={i} size={8} className="fill-current" />)}
                            </div>
                            <span className="text-[10px] text-gray-400 font-mono">{new Date(rev.date).toLocaleDateString()}</span>
                          </div>
                          <p className="text-gray-600 font-medium mt-1 leading-normal text-[11px]">{rev.comment}</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-slate-400 italic text-[11px]">No feedback reviews posted for this grocery item. Be the first one!</p>
                  )}
                </div>

              </div>
              
            </div>
          </div>
        </div>
      )}

      {/* SEGMENT 6: AUTHENTICATION DIALOG PORTAL MODULE */}
      {authMode && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-3xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-250">
          
          <div className="bg-white border text-xs border-slate-100 rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl relative p-5 sm:p-6 animate-in zoom-in-95 duration-200 space-y-4">
            
            <button
              onClick={() => { setAuthMode(null); setVerificationRequiredEmail(null); }}
              className="absolute right-4 top-4 text-slate-400 hover:bg-slate-50 p-1.5 rounded-full"
            >
              <X size={16} />
            </button>

            {authError && (
              <div className="bg-rose-50 border border-rose-100 p-2.5 rounded-lg text-rose-700 text-[10px] mb-3 text-center">
                {authError}
              </div>
            )}
            
            {/* PHONE OTP VERIFICATION VIEW */}
            {phoneVerificationInProgress ? (
              <div className="space-y-4">
                <div className="text-center">
                  <Smartphone size={25} className="mx-auto text-indigo-600 animate-pulse" />
                  <h3 className="font-extrabold text-slate-900 font-sans text-sm mt-2">Verify Phone Number</h3>
                  <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">Enter the 6-digit SMS OTP sent to <strong className="text-slate-800">{authForm.phone}</strong></p>
                </div>

                <form
                  onSubmit={handleVerifyPhoneOtp}
                  className="space-y-3"
                >
                  <div className="space-y-1">
                    <label className="block text-slate-500 font-semibold mb-1">Enter 6-Digit OTP</label>
                    <input
                      type="text"
                      required
                      placeholder="Enter SMS code"
                      value={authForm.otpInput}
                      onChange={(e) => setAuthForm({ ...authForm, otpInput: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-100 px-3 py-2 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 text-center font-mono font-bold tracking-widest text-lg"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-indigo-600 hover:bg-indigo-700 py-2.5 rounded-xl text-white font-bold tracking-wider"
                  >
                    Confirm Code
                  </button>
                  <button
                    type="button"
                    onClick={handleSendPhoneOtp}
                    className="w-full bg-slate-100 hover:bg-slate-200 py-2 rounded-xl text-slate-700 font-bold tracking-wider text-xs"
                  >
                    Resend OTP
                  </button>
                </form>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="text-center space-y-1 leading-tight">
                  <div className="bg-red-50 border border-red-100 p-2 rounded-full w-max mx-auto shadow-3xs text-[#ff2d2d]">
                    <LogIn size={20} />
                  </div>
                  <h3 className="font-extrabold text-slate-900 text-sm">
                    {authMode === 'login' ? 'Welcome back to Nammashop' : authMode === 'register' ? 'Create Free Account' : 'Phone Login'}
                  </h3>
                  <p className="text-slate-400 text-[11px]">Join Blinkit/Zepto-grade fresh quick-commerce network.</p>
                </div>

                {authMode === 'phone' ? (
                  <form onSubmit={handleSendPhoneOtp} className="space-y-3.5 text-xs text-slate-600">
                    <div className="space-y-1">
                      <label className="block font-medium mb-1 text-slate-500">Mobile coordinates</label>
                      <input
                        type="text"
                        required
                        value={authForm.phone}
                        onChange={(e) => setAuthForm({ ...authForm, phone: e.target.value })}
                        placeholder="e.g. +91 9876543210"
                        className="w-full bg-slate-50 border border-slate-100 px-3.5 py-1.5 rounded-xl focus:outline-none"
                      />
                    </div>
                    <button
                      type="submit"
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold tracking-wider py-2.5 rounded-xl mt-3 shadow-xs cursor-pointer"
                    >
                      Send OTP via SMS
                    </button>
                  </form>
                ) : (
                  <form
                    onSubmit={authMode === 'login' ? handleLogin : handleRegister}
                    className="space-y-3.5 text-xs text-slate-600"
                  >
                    {authMode === 'register' && (
                      <div className="space-y-1 select-none">
                        <label className="block font-medium mb-1 text-slate-500">Full Name *</label>
                        <input
                          type="text"
                          required
                          value={authForm.name}
                          onChange={(e) => setAuthForm({ ...authForm, name: e.target.value })}
                          placeholder="e.g. Rohan Sharma"
                          className="w-full bg-slate-50 border border-slate-100 px-3.5 py-1.5 rounded-xl focus:outline-none"
                        />
                      </div>
                    )}

                    <div className="space-y-1">
                      <label className="block font-medium mb-1 text-slate-500">Registered E-mail address *</label>
                      <input
                        type="email"
                        required
                        value={authForm.email}
                        onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
                        placeholder="e.g. admin@nammashop.com"
                        className="w-full bg-slate-50 border border-slate-100 px-3.5 py-1.5 rounded-xl focus:outline-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block font-medium mb-1 text-slate-500">Security Password *</label>
                      <input
                        type="password"
                        required
                        value={authForm.password}
                        onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                        placeholder="••••••••"
                        className="w-full bg-slate-50 border border-slate-100 px-3.5 py-1.5 rounded-xl focus:outline-none"
                      />
                    </div>

                    {authMode === 'register' && (
                      <div className="space-y-1">
                        <label className="block font-medium mb-1 text-slate-500">Mobile coordinates</label>
                        <input
                          type="text"
                          value={authForm.phone}
                          onChange={(e) => setAuthForm({ ...authForm, phone: e.target.value })}
                          placeholder="e.g. +91 9876543210"
                          className="w-full bg-slate-50 border border-slate-100 px-3.5 py-1.5 rounded-xl focus:outline-none"
                        />
                      </div>
                    )}

                    <button
                      type="submit"
                      className="w-full bg-[#ff2d2d] hover:bg-[#e12626] text-white font-bold tracking-wider py-2.5 rounded-xl mt-3 shadow-xs cursor-pointer"
                    >
                      {authMode === 'login' ? 'Sign In Gate' : 'Create Free Account'}
                    </button>
                  </form>
                )}

                {/* Options toggle */}
                <div className="flex justify-between text-[11px] font-bold text-slate-600 mt-2 hover:underline">
                  {authMode === 'login' ? (
                    <>
                      <button type="button" onClick={() => setAuthMode('phone')}>Login with Phone (OTP)</button>
                      <button type="button" onClick={() => setAuthMode('register')}>Create account indices</button>
                    </>
                  ) : authMode === 'register' ? (
                    <button type="button" onClick={() => setAuthMode('login')} className="mx-auto block">Already registered? Log in gate</button>
                  ) : (
                    <button type="button" onClick={() => setAuthMode('login')} className="mx-auto block">Return to Email Login</button>
                  )}
                </div>

                {/* Google single sign-on splits */}
                <div className="relative flex py-2 items-center">
                  <div className="flex-grow border-t border-slate-100"></div>
                  <span className="flex-shrink mx-3 text-slate-400 text-[10px] uppercase font-bold tracking-widest">or single sign-on</span>
                  <div className="flex-grow border-t border-slate-100"></div>
                </div>

                <button
                  type="button"
                  onClick={handleGoogleMockLogin}
                  className="w-full text-slate-700 font-bold border border-slate-150 py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 hover:bg-slate-50 cursor-pointer"
                >
                  <img src="https://images.unsplash.com/photo-1573804633927-bfcbcd909acd?q=80&w=120&auto=format&fit=crop" className="h-4 w-4 rounded-full" />
                  <span>Connect with Google Single Sign-on</span>
                </button>
              </div>
            )}

          </div>
        </div>
      )}

      {/* FLOAT STICKY BOT ASSISTANT CHATS */}
      {viewMode !== 'admin' && viewMode !== 'catalog' && (
        <AICompanion
          products={products}
          onAddProductsToCart={addProductsFromRecipeToCart}
          cartItemIds={cart.map(c => c.productId)}
          addToCart={addToCart}
          setViewMode={setViewMode}
          notifyUser={notifyUser}
        />
      )}

      {viewMode !== 'admin' && (
        <a
          href={`https://wa.me/${whatsappSupportNumber}?text=${encodeURIComponent('Hi NammaShop, I need help with my grocery order.')}`}
          target="_blank"
          rel="noreferrer"
          className="fixed bottom-24 right-4 z-40 flex items-center gap-2 rounded-full bg-[#25D366] px-4 py-3 text-sm font-bold text-white shadow-[0_20px_45px_-20px_rgba(37,211,102,0.8)] transition hover:scale-[1.02] md:bottom-6 md:right-6"
        >
          <MessageCircle size={18} />
          <span className="hidden sm:inline">WhatsApp support</span>
        </a>
      )}

      {viewMode !== 'admin' && (
        <nav className="fixed inset-x-4 bottom-4 z-40 rounded-[1.6rem] border border-white/70 bg-[rgba(255,255,255,0.92)] p-2 shadow-[0_24px_60px_-28px_rgba(15,23,42,0.45)] backdrop-blur-xl md:hidden">
          <div className="grid grid-cols-4 gap-1 text-[10px] font-bold text-slate-500">
            <button
              onClick={() => setViewMode('catalog')}
              className={`flex flex-col items-center gap-1 rounded-2xl px-2 py-2 ${viewMode === 'catalog' ? 'bg-red-50 text-[#ff2d2d]' : ''}`}
            >
              <House size={16} />
              <span>Home</span>
            </button>
            <button
              onClick={() => setSelectedCategoryId(null)}
              className="flex flex-col items-center gap-1 rounded-2xl px-2 py-2"
            >
              <LayoutGrid size={16} />
              <span>Browse</span>
            </button>
            <button
              onClick={() => setIsCartDrawerOpen(true)}
              className="relative flex flex-col items-center gap-1 rounded-2xl px-2 py-2"
            >
              <ShoppingCart size={16} />
              <span>Basket</span>
              {cart.length > 0 && (
                <span className="absolute right-5 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#ff2d2d] px-1 text-[9px] text-white">
                  {cart.reduce((sum, item) => sum + item.quantity, 0)}
                </span>
              )}
            </button>
            <button
              onClick={() => currentUser ? setViewMode('profile') : setAuthMode('login')}
              className={`flex flex-col items-center gap-1 rounded-2xl px-2 py-2 ${viewMode === 'profile' ? 'bg-red-50 text-[#ff2d2d]' : ''}`}
            >
              <UserIcon size={16} />
              <span>{currentUser ? 'Account' : 'Login'}</span>
            </button>
          </div>
        </nav>
      )}

      {/* SYSTEMFOOTER */}
      <footer className="bg-white/70 border-t border-white/80 py-10 mt-12 text-xs text-slate-400 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 grid gap-6 md:grid-cols-4">
          <div className="space-y-2">
            <p className="font-semibold text-slate-700 tracking-wide">NammaShop UK</p>
            <p className="text-[11px] leading-5">Premium grocery delivery for fresh produce, pantry staples, and weekly essentials.</p>
          </div>
          <div className="space-y-2">
            <p className="font-semibold text-slate-700">Support</p>
            <p className="text-[11px]">WhatsApp support</p>
            <p className="text-[11px]">Returns and refunds</p>
            <p className="text-[11px]">Order assistance</p>
          </div>
          <div className="space-y-2">
            <p className="font-semibold text-slate-700">Shopping</p>
            <p className="text-[11px]">Fresh produce</p>
            <p className="text-[11px]">Household essentials</p>
            <p className="text-[11px]">Offers and flash sales</p>
          </div>
          <div className="space-y-2">
            <p className="font-semibold text-slate-700">Trust</p>
            <p className="text-[11px]">Secure checkout</p>
            <p className="text-[11px]">Tracked delivery</p>
            <p className="text-[11px]">Invoice-ready orders</p>
          </div>
        </div>
      </footer>

    </div>
  );
}
