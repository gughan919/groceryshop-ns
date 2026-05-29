import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  Plus,
  Trash2,
  Edit2,
  Package,
  ListCollapse,
  ShoppingBag,
  Users,
  Image,
  Tag,
  AlertTriangle,
  FileText,
  RefreshCw,
  Ban,
  CheckCircle2,
  Save,
  X,
  Truck
} from 'lucide-react';
import { Product, Category, Order, Coupon, DashboardBanner, User } from '../types';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';
import AdminLogisticsPanel from './AdminLogisticsPanel';

interface AdminPortalProps {
  onNotify: (message: string, type: 'success' | 'error') => void;
  categories: Category[];
  products: Product[];
  orders: Order[];
  coupons: Coupon[];
  banners: DashboardBanner[];
  onRefreshAllData: () => void;
}

export default function AdminPortal({
  onNotify,
  categories,
  products,
  orders,
  coupons,
  banners,
  onRefreshAllData
}: AdminPortalProps) {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'products' | 'categories' | 'orders' | 'logistics' | 'coupons' | 'banners' | 'users'>('dashboard');
  const [analytics, setAnalytics] = useState<any>(null);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(false);
  const token = localStorage.getItem('nammashop_token') || '';

  // State arrays for CRUD UI
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isAddingProduct, setIsAddingProduct] = useState(false);
  const [imageUploadProgress, setImageUploadProgress] = useState(-1);

  const handleImageUpload = async (file: File, setter: React.Dispatch<React.SetStateAction<any>>) => {
    // 1. EXTENSION AND TYPE VALIDATION
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    if (!validTypes.includes(file.type)) {
      onNotify('Invalid format. Allow only JPG, JPEG, PNG, WEBP.', 'error');
      return;
    }
    // 2. SIZE VALIDATION (< 5MB)
    if (file.size > 5 * 1024 * 1024) {
      onNotify('Image exceeds 5MB size limit.', 'error');
      return;
    }
    // 3. Prevent empty / 0-byte uploads
    if (file.size === 0) {
      onNotify('Image file is empty.', 'error');
      return;
    }

    try {
      const storageRef = ref(storage, `admin_uploads/${Date.now()}_${file.name}`);
      const uploadTask = uploadBytesResumable(storageRef, file);

      uploadTask.on('state_changed', 
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setImageUploadProgress(Math.round(progress));
        }, 
        (error) => {
          onNotify('Failed to upload image.', 'error');
          setImageUploadProgress(-1);
        }, 
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          setter((prev: any) => ({ ...prev, image: downloadURL }));
          setImageUploadProgress(-1);
          onNotify('Image uploaded successfully!', 'success');
        }
      );
    } catch {
      onNotify('Unexpected upload error.', 'error');
      setImageUploadProgress(-1);
    }
  };

  const [productForm, setProductForm] = useState({
    name: '',
    description: '',
    price: '',
    discount: '0',
    stock: '10',
    image: '',
    categoryId: categories[0]?.id || 'cat-fruits-veg',
    brand: '',
    unit: '1 kg',
    expiryDate: '2027-12-31',
    tags: 'organic, fresh',
    availabilityStatus: 'Enabled'
  });

  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [categoryForm, setCategoryForm] = useState({
    name: '',
    icon: 'Apple',
    banner: ''
  });

  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
  const [isAddingCoupon, setIsAddingCoupon] = useState(false);
  const [couponForm, setCouponForm] = useState({
    code: '',
    type: 'percent' as 'percent' | 'fixed',
    value: '',
    expiryDate: '2026-12-31',
    usageLimit: '100'
  });

  const [isAddingBanner, setIsAddingBanner] = useState(false);
  const [bannerForm, setBannerForm] = useState({
    image: '',
    title: '',
    subtitle: '',
    offerText: '',
    discount: '',
    link: '',
    sponsorName: '',
    badge: '',
    ctaLabel: 'Shop Now',
    secondaryCtaLabel: 'Explore Collection',
    campaignType: 'sponsored',
    priority: '99',
    startDate: '',
    endDate: '',
    targetCategoryId: '',
    active: true
  });

  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [adminProductSearch, setAdminProductSearch] = useState('');
  const [adminStockFilter, setAdminStockFilter] = useState<'all' | 'in' | 'low' | 'out'>('all');
  const [adminCategoryFilter, setAdminCategoryFilter] = useState('all');
  const [adminVisibleCount, setAdminVisibleCount] = useState(8);

  useEffect(() => {
    fetchAnalytics();
    if (activeTab === 'users') {
      fetchUsers();
    }
  }, [activeTab]);

  const filteredAdminProducts = products.filter((p) => {
    const matchesSearch = p.name.toLowerCase().includes(adminProductSearch.toLowerCase()) || (p.brand || '').toLowerCase().includes(adminProductSearch.toLowerCase());
    const matchesCategory = adminCategoryFilter === 'all' || p.categoryId === adminCategoryFilter;
    const matchesStock =
      adminStockFilter === 'all' ||
      (adminStockFilter === 'in' && p.stock > 10) ||
      (adminStockFilter === 'low' && p.stock > 0 && p.stock <= 10) ||
      (adminStockFilter === 'out' && p.stock === 0);
    return matchesSearch && matchesCategory && matchesStock;
  });

  const fetchAnalytics = async () => {
    setIsLoadingAnalytics(true);
    try {
      const resp = await fetch('/api/admin/analytics', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await resp.json();
      if (resp.ok) {
        setAnalytics(data);
      } else {
        onNotify(data.error || 'Failed loading analytics.', 'error');
      }
    } catch {
      onNotify('Server offline. Running in dashboard preview mode.', 'error');
    } finally {
      setIsLoadingAnalytics(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const resp = await fetch('/api/admin/users', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await resp.json();
      if (resp.ok) {
        setAllUsers(data);
      }
    } catch {
      console.warn('Unable to retrieve admin users directory offline.');
    }
  };

  const toggleUserBan = async (id: string) => {
    try {
      const resp = await fetch(`/api/admin/users/${id}/toggle-ban`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await resp.json();
      if (resp.ok) {
        onNotify(`User status toggled successfully.`, 'success');
        fetchUsers();
        onRefreshAllData();
      } else {
        onNotify(data.error || 'Operation denied.', 'error');
      }
    } catch {
      onNotify('API error toggling user ban status.', 'error');
    }
  };

  // Product CRUD Operations
  const handleProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const isEdit = editingProduct !== null;
    const url = isEdit ? `/api/admin/products/${editingProduct.id}` : '/api/admin/products';
    const method = isEdit ? 'PUT' : 'POST';

    try {
      const resp = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(productForm)
      });
      const data = await resp.json();
      if (resp.ok) {
        onNotify(isEdit ? 'Product listing saved.' : 'New product successfully curated on shelves!', 'success');
        setIsAddingProduct(false);
        setEditingProduct(null);
        onRefreshAllData();
        fetchAnalytics();
      } else {
        onNotify(data.error || 'Failed to persist product details.', 'error');
      }
    } catch {
      onNotify('Failed communicating with server catalog manager.', 'error');
    }
  };

  const deleteProduct = async (id: string) => {
    if (!confirm('Are you absolutely sure you want to remove this product? Customers will no longer be able to purchase it.')) return;
    try {
      const resp = await fetch(`/api/admin/products/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (resp.ok) {
        onNotify('Product removed from shelves.', 'success');
        onRefreshAllData();
        fetchAnalytics();
      } else {
        const errorData = await resp.json();
        onNotify(errorData.error || 'Failed deleting.', 'error');
      }
    } catch {
      onNotify('Error deleting.', 'error');
    }
  };

  // Category CRUD
  const handleCategorySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const isEdit = editingCategory !== null;
    const url = isEdit ? `/api/admin/categories/${editingCategory.id}` : '/api/admin/categories';
    const method = isEdit ? 'PUT' : 'POST';

    try {
      const resp = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(categoryForm)
      });
      if (resp.ok) {
        onNotify('Categories catalog configuration synced.', 'success');
        setIsAddingCategory(false);
        setEditingCategory(null);
        onRefreshAllData();
      }
    } catch {
      onNotify('Network error creating category.', 'error');
    }
  };

  // Coupon Operations
  const handleCouponSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const isEdit = editingCoupon !== null;
    const url = isEdit ? `/api/admin/coupons/${editingCoupon.id}` : '/api/admin/coupons';
    const method = isEdit ? 'PUT' : 'POST';

    try {
      const resp = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(couponForm)
      });
      if (resp.ok) {
        onNotify('Discount Coupon details written securely.', 'success');
        setIsAddingCoupon(false);
        setEditingCoupon(null);
        onRefreshAllData();
      }
    } catch {
      onNotify('Network error saving coupon.', 'error');
    }
  };

  const deleteCoupon = async (id: string) => {
    try {
      await fetch(`/api/admin/coupons/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      onNotify('Coupon code deleted successfully.', 'success');
      onRefreshAllData();
    } catch {
      onNotify('Failed to delete coupon.', 'error');
    }
  };

  // Banner Operations
  const handleBannerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...bannerForm,
        discount: bannerForm.discount === '' ? undefined : Number(bannerForm.discount),
        campaignType: bannerForm.discount ? 'offer' : bannerForm.campaignType
      };
      const resp = await fetch('/api/admin/banners', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      if (resp.ok) {
        onNotify('New promotional slider published on homepage.', 'success');
        setIsAddingBanner(false);
        setBannerForm({
          image: '',
          title: '',
          subtitle: '',
          offerText: '',
          discount: '',
          link: '',
          sponsorName: '',
          badge: '',
          ctaLabel: 'Shop Now',
          secondaryCtaLabel: 'Explore Collection',
          campaignType: 'sponsored',
          priority: '99',
          startDate: '',
          endDate: '',
          targetCategoryId: '',
          active: true
        });
        onRefreshAllData();
      }
    } catch {
      onNotify('Failed to upload banner.', 'error');
    }
  };

  const deleteBanner = async (id: string) => {
    try {
      await fetch(`/api/admin/banners/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      onNotify('Promotional banner deleted.', 'success');
      onRefreshAllData();
    } catch {
      onNotify('Failed to delete banner.', 'error');
    }
  };

  const updateBanner = async (id: string, updates: Partial<DashboardBanner>) => {
    try {
      const resp = await fetch(`/api/admin/banners/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(updates)
      });
      if (resp.ok) {
        onNotify('Banner campaign updated.', 'success');
        onRefreshAllData();
      } else {
        onNotify('Failed to update banner campaign.', 'error');
      }
    } catch {
      onNotify('Failed to update banner campaign.', 'error');
    }
  };

  // Update order delivery statuses
  const updateOrderStatus = async (orderId: string, status: Order['status'], description: string) => {
    try {
      const resp = await fetch(`/api/admin/orders/${orderId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status, description })
      });
      if (resp.ok) {
        onNotify(`Order ${orderId} status set to "${status}"`, 'success');
        onRefreshAllData();
        fetchAnalytics();
      } else {
        const error = await resp.json();
        onNotify(error.error || 'Failed update.', 'error');
      }
    } catch {
      onNotify('API network error changing timeline status.', 'error');
    }
  };

  const selectProductForEdit = (p: Product) => {
    setEditingProduct(p);
    setProductForm({
      name: p.name,
      description: p.description,
      price: String(p.price),
      discount: String(p.discount),
      stock: String(p.stock),
      image: p.image,
      categoryId: p.categoryId,
      brand: p.brand || '',
      unit: p.unit,
      expiryDate: (p as any).expiryDate || '2027-12-31',
      tags: (p as any).tags || 'organic, fresh',
      availabilityStatus: (p as any).availabilityStatus || (p.stock > 0 ? 'Enabled' : 'Disabled')
    });
    setIsAddingProduct(true);
  };

  const resetProductForm = () => {
    setIsAddingProduct(false);
    setEditingProduct(null);
    setProductForm({
      name: '',
      description: '',
      price: '',
      discount: '0',
      stock: '10',
      image: '',
      categoryId: categories[0]?.id || 'cat-fruits-veg',
      brand: '',
      unit: '1 kg',
      expiryDate: '2027-12-31',
      tags: 'organic, fresh',
      availabilityStatus: 'Enabled'
    });
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 min-h-[500px] w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-3xl p-4 sm:p-6 shadow-sm overflow-hidden">
      
      {/* Sidebar Navigation Panel */}
      <div className="w-full lg:w-64 flex flex-col gap-1 shrink-0 border-b lg:border-b-0 lg:border-r border-slate-100 pb-4 lg:pb-0 lg:pr-6">
        <div className="px-3 py-1.5 mb-4 bg-emerald-100/50 rounded-xl">
          <h4 className="text-emerald-800 text-xs font-semibold tracking-wide uppercase leading-tight">Nammashop Dashboard</h4>
          <p className="text-[10px] text-emerald-600/90 font-mono tracking-wider mt-0.5">ADMIN SECURITY CLEARANCE ENABLED</p>
        </div>

        <button
          onClick={() => setActiveTab('dashboard')}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium cursor-pointer transition-all ${activeTab === 'dashboard' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:bg-slate-800 hover:text-slate-900 dark:text-white'}`}
        >
          <BarChart3 size={15} />
          <span>Overview Analytics</span>
        </button>

        <button
          onClick={() => setActiveTab('products')}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium cursor-pointer transition-all ${activeTab === 'products' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
        >
          <Package size={15} />
          <span>Inventory Shelves</span>
        </button>

        <button
          onClick={() => setActiveTab('categories')}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium cursor-pointer transition-all ${activeTab === 'categories' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
        >
          <ListCollapse size={15} />
          <span>Category Clusters</span>
        </button>

        <button
          onClick={() => setActiveTab('orders')}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium cursor-pointer transition-all ${activeTab === 'orders' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
        >
          <ShoppingBag size={15} />
          <span>Customer Orders</span>
          {orders.filter(o => o.status === 'Pending').length > 0 && (
            <span className="ml-auto bg-amber-500 text-[10px] text-white font-bold h-4 w-4 rounded-full flex items-center justify-center">
              {orders.filter(o => o.status === 'Pending').length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('logistics')}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium cursor-pointer transition-all ${activeTab === 'logistics' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
        >
          <Truck size={15} />
          <span>Logistics Live</span>
          {orders.filter(o => o.status === 'Out for delivery').length > 0 && (
            <span className="ml-auto bg-red-500 text-[10px] text-white font-bold h-4 min-w-4 rounded-full flex items-center justify-center px-1">
              {orders.filter(o => o.status === 'Out for delivery').length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('coupons')}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium cursor-pointer transition-all ${activeTab === 'coupons' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
        >
          <Tag size={15} />
          <span>Discount Coupons</span>
        </button>

        <button
          onClick={() => setActiveTab('banners')}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium cursor-pointer transition-all ${activeTab === 'banners' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
        >
          <Image size={15} />
          <span>Homepage Banners</span>
        </button>

        <button
          onClick={() => setActiveTab('users')}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium cursor-pointer transition-all ${activeTab === 'users' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
        >
          <Users size={15} />
          <span>Customers Base</span>
        </button>
      </div>

      {/* Main Administrative Action Panel */}
      <div className="flex-1 overflow-x-hidden min-h-[450px]">
        
        {/* TAB 1: OVERVIEW ANALYTICS */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6 animate-in fade-in duration-150">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-gray-900 font-bold text-base tracking-tight">Analytics Dashboard</h3>
                <p className="text-xs text-gray-500">Live indicators compiled from database transactions</p>
              </div>
              <button
                onClick={fetchAnalytics}
                className="p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 active:scale-95 text-slate-500 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 text-xs font-medium"
              >
                <RefreshCw size={12} className={isLoadingAnalytics ? 'animate-spin text-emerald-600' : ''} />
                <span>Refresh Logs</span>
              </button>
            </div>

            {/* Quick Metrics Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white border border-gray-100 p-4 rounded-2xl shadow-xs">
                <p className="text-[10px] text-gray-400 font-semibold tracking-wider uppercase">GROSS REVENUE</p>
                <h4 className="text-gray-800 font-bold text-lg mt-1 tracking-tight">£{analytics?.revenue?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}</h4>
                <span className="text-[10px] text-emerald-600 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded-md mt-1.5 inline-block">10 min Delivery Active</span>
              </div>
              
              <div className="bg-white border border-gray-100 p-4 rounded-2xl shadow-xs">
                <p className="text-[10px] text-gray-400 font-semibold tracking-wider uppercase">ORDERS VOLUME</p>
                <h4 className="text-gray-800 font-bold text-lg mt-1 tracking-tight">{analytics?.ordersCount || '0'}</h4>
                <span className="text-[10px] text-slate-500 font-mono bg-slate-50 px-1.5 py-0.5 rounded-md mt-1.5 inline-block">Total Placement</span>
              </div>

              <div className="bg-white border border-gray-100 p-4 rounded-2xl shadow-xs">
                <p className="text-[10px] text-gray-400 font-semibold tracking-wider uppercase">PENDING SHIPMENTS</p>
                <h4 className="text-gray-800 font-bold text-lg mt-1 tracking-tight">{analytics?.pendingDeliveries || '0'}</h4>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md mt-1.5 inline-block ${analytics?.pendingDeliveries > 0 ? 'bg-amber-50 text-amber-700 animate-pulse' : 'bg-slate-100 text-slate-600'}`}>Dispatch Queue</span>
              </div>

              <div className="bg-white border border-gray-100 p-4 rounded-2xl shadow-xs opacity-95">
                <p className="text-[10px] text-gray-400 font-semibold tracking-wider uppercase">LOW STOCK WARNINGS</p>
                <h4 className="text-gray-800 font-bold text-lg mt-1 tracking-tight">{analytics?.lowStockAlerts || '0'}</h4>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md mt-1.5 inline-block ${analytics?.lowStockAlerts > 0 ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>Requires Refill</span>
              </div>
            </div>

            {/* Custom Responsive SVG Chart Engine */}
            <div className="bg-white border border-gray-100 rounded-2xl p-4 sm:p-5">
              <h4 className="text-xs text-slate-700 dark:text-slate-300 font-semibold uppercase tracking-wider mb-4">Sales Trends (Past 7 Days Transactions)</h4>
              
              <div className="w-full h-44 mt-2 relative">
                <svg className="w-full h-full overflow-visible" viewBox="0 0 500 150">
                  <defs>
                    <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity="0.4" />
                      <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>
                  
                  {/* Grid Lines */}
                  <line x1="0" y1="20" x2="500" y2="20" stroke="#f1f5f9" strokeWidth="1" />
                  <line x1="0" y1="65" x2="500" y2="65" stroke="#f1f5f9" strokeWidth="1" />
                  <line x1="0" y1="110" x2="500" y2="110" stroke="#f1f5f9" strokeWidth="1" />
                  
                  {/* Area Shader path */}
                  <path
                    d="M 5 140 H 495 L 495 110 L 400 90 L 310 115 L 220 50 L 125 105 L 5 115 Z"
                    fill="url(#salesGrad)"
                    className="transition-all duration-300"
                  />
                  
                  {/* Trendline stroke */}
                  <path
                    d="M 5 50 L 100 85 L 180 30 L 260 95 L 340 50 L 420 110 L 495 20"
                    fill="none"
                    stroke="#059669"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    className="transition-all duration-300"
                  />
                  
                  {/* Scatter Plot Circles */}
                  <circle cx="5" cy="50" r="4.5" className="fill-emerald-800 hover:scale-125 cursor-help" />
                  <circle cx="100" cy="85" r="4.5" className="fill-emerald-800 hover:scale-125" />
                  <circle cx="180" cy="30" r="4.5" className="fill-emerald-800 hover:scale-125" />
                  <circle cx="260" cy="95" r="4.5" className="fill-emerald-800 hover:scale-125" />
                  <circle cx="340" cy="50" r="4.5" className="fill-emerald-800 hover:scale-125" />
                  <circle cx="420" cy="110" r="4.5" className="fill-emerald-800 hover:scale-125" />
                  <circle cx="495" cy="20" r="4.5" className="fill-emerald-800 hover:scale-125" />
                </svg>
                
                {/* Horizontal X-Axis Legends */}
                <div className="flex justify-between mt-3 text-[10px] text-gray-400 font-mono font-medium">
                  <span>May 18</span>
                  <span>May 19</span>
                  <span>May 20</span>
                  <span>May 21</span>
                  <span>May 22</span>
                  <span>May 23</span>
                  <span>Today</span>
                </div>
              </div>
            </div>

            {/* Bottom splits: Low Stocks Warnings & Top Selling list */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Product Stock Alerts */}
              <div className="bg-white border border-gray-100 rounded-2xl p-4">
                <div className="flex items-center gap-2 border-b border-gray-50 pb-2.5 mb-2.5">
                  <AlertTriangle className="text-rose-500" size={16} />
                  <h4 className="text-xs text-gray-800 font-bold uppercase tracking-wider">Low Stock Refill Alerts</h4>
                </div>
                {analytics?.lowStockProducts && analytics.lowStockProducts.length > 0 ? (
                  <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                    {analytics.lowStockProducts.map((p: any) => (
                      <div key={p.id} className="flex justify-between items-center text-xs bg-slate-50 border border-slate-100 p-2 rounded-xl">
                        <span className="text-gray-700 font-medium">{p.name}</span>
                        <span className="text-rose-700 font-mono font-bold bg-rose-50 px-2.5 py-0.5 rounded-md border border-rose-100">{p.stock} left</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-emerald-600 bg-emerald-50 px-3 py-2 rounded-xl border border-emerald-100">✔ Shelves replenishment optimal. All products active above minimum levels (10 pcs).</p>
                )}
              </div>

              {/* Best Product Sellers */}
              <div className="bg-white border border-gray-100 rounded-2xl p-4">
                <div className="flex items-center gap-2 border-b border-gray-50 pb-2.5 mb-2.5">
                  <ShoppingBag size={16} className="text-emerald-600" />
                  <h4 className="text-xs text-gray-800 font-bold uppercase tracking-wider">Top-Performing Grocery Items</h4>
                </div>
                {analytics?.topSellers && analytics.topSellers.length > 0 ? (
                  <div className="space-y-2">
                    {analytics.topSellers.map((s: any, idx: number) => (
                      <div key={idx} className="flex justify-between items-center text-xs">
                        <div className="flex items-center gap-2">
                          <span className="text-gray-400 font-bold font-mono">#{idx+1}</span>
                          <span className="text-gray-800 font-semibold">{s.name}</span>
                        </div>
                        <span className="text-gray-500 font-mono">{s.quantity} sold (£{Number(s.revenue).toFixed(2)})</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic">No sales transactions logged in the system yet.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: INVENTORY PRODUCTS CRUDS */}
        {activeTab === 'products' && (
          <div className="space-y-6 animate-in fade-in duration-150">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-gray-900 font-bold text-base tracking-tight">Grocery Shelves Management</h3>
                <p className="text-xs text-gray-500">Curate stocks, adjust price margins, define discounts and configure unit weights.</p>
              </div>
              
              {!isAddingProduct && (
                <button
                  onClick={() => setIsAddingProduct(true)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs px-3.5 py-2.5 rounded-xl cursor-pointer flex items-center gap-2 active:scale-95 transition-all shadow-xs"
                >
                  <Plus size={14} />
                  <span>Curate Product</span>
                </button>
              )}
            </div>

            {/* Add / Edit Form Overlay */}
            {isAddingProduct && (
              <form onSubmit={handleProductSubmit} className="bg-white border border-gray-100 rounded-2xl p-4 sm:p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-gray-50 pb-3">
                  <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">{editingProduct ? 'Edit Existing Shelf item' : 'Place New Item on Catalogue'}</h4>
                  <button
                    type="button"
                    onClick={resetProductForm}
                    className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-1 rounded-lg"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="block text-gray-500 font-semibold mb-1">Product Title name *</label>
                    <input
                      type="text"
                      required
                      value={productForm.name}
                      onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                      placeholder="e.g. Organic Seedless Watermelon"
                      className="w-full bg-slate-50 border border-slate-100 hover:border-slate-200 focus:border-emerald-500 px-3 py-2 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 border-box"
                    />
                  </div>

                  <div>
                    <label className="block text-gray-500 font-semibold mb-1">Brand or Farm tag</label>
                    <input
                      type="text"
                      value={productForm.brand}
                      onChange={(e) => setProductForm({ ...productForm, brand: e.target.value })}
                      placeholder="e.g. Namma Farms, Amul, Cadbury"
                      className="w-full bg-slate-50 border border-slate-100 hover:border-slate-200 focus:border-emerald-500 px-3 py-2 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-gray-500 font-semibold mb-1">Comprehensive Description details</label>
                    <textarea
                      value={productForm.description}
                      onChange={(e) => setProductForm({ ...productForm, description: e.target.value })}
                      placeholder="Specify nutrients, organic status, freshness attributes, usage conditions..."
                      className="w-full bg-slate-50 border border-slate-100 hover:border-slate-200 focus:border-emerald-500 px-3 py-2 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 h-20 resize-none"
                    />
                  </div>

                  <div>
                    <label className="block text-gray-500 font-semibold mb-1">Catalog Category *</label>
                    <select
                      value={productForm.categoryId}
                      onChange={(e) => setProductForm({ ...productForm, categoryId: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-100 hover:border-slate-200 focus:border-emerald-500 px-3 py-2 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    >
                      {categories.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-gray-500 font-semibold mb-1">Unit Pack definition *</label>
                    <input
                      type="text"
                      required
                      value={productForm.unit}
                      onChange={(e) => setProductForm({ ...productForm, unit: e.target.value })}
                      placeholder="e.g. 500 g, 1 kg, Pack of 6, 250 ml"
                      className="w-full bg-slate-50 border border-slate-100 hover:border-slate-200 focus:border-emerald-500 px-3 py-2 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-gray-500 font-semibold mb-1">Price (£ GBP) *</label>
                    <input
                      type="number"
                      required
                      min="0.01"
                      step="0.01"
                      value={productForm.price}
                      onChange={(e) => setProductForm({ ...productForm, price: e.target.value })}
                      placeholder="e.g. 2.99"
                      className="w-full bg-slate-50 border border-slate-100 hover:border-slate-200 focus:border-emerald-500 px-3 py-2 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-gray-500 font-semibold mb-1">Discount discount (%)</label>
                    <input
                      type="number"
                      min="0"
                      max="99"
                      value={productForm.discount}
                      onChange={(e) => setProductForm({ ...productForm, discount: e.target.value })}
                      placeholder="e.g. 15"
                      className="w-full bg-slate-50 border border-slate-100 hover:border-slate-200 focus:border-emerald-500 px-3 py-2 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-gray-500 font-semibold mb-1">Active inventory stock *</label>
                    <input
                      type="number"
                      required
                      min="0"
                      value={productForm.stock}
                      onChange={(e) => setProductForm({ ...productForm, stock: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-100 hover:border-slate-200 focus:border-emerald-500 px-3 py-2 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-gray-500 font-semibold mb-1">Expiry Date *</label>
                    <input
                      type="date"
                      required
                      value={productForm.expiryDate}
                      onChange={(e) => setProductForm({ ...productForm, expiryDate: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-100 hover:border-slate-200 focus:border-emerald-500 px-3 py-2 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-gray-500 font-semibold mb-1">Search Tags (Comma separated)</label>
                    <input
                      type="text"
                      value={productForm.tags}
                      onChange={(e) => setProductForm({ ...productForm, tags: e.target.value })}
                      placeholder="e.g. snack, organic, milk, breakfast"
                      className="w-full bg-slate-50 border border-slate-100 hover:border-slate-200 focus:border-emerald-500 px-3 py-2 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-gray-500 font-semibold mb-1">Availability Status</label>
                    <select
                      value={productForm.availabilityStatus}
                      onChange={(e) => setProductForm({ ...productForm, availabilityStatus: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-100 hover:border-slate-200 focus:border-emerald-500 px-3 py-2 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    >
                      <option value="Enabled">Enabled (Visible in Shop Catalog)</option>
                      <option value="Disabled">Disabled (Hidden / Suspended)</option>
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-gray-500 font-semibold mb-2">Product Image (Drag & Drop File, click to Browse or type Unsplash Link)</label>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      
                      {/* Drag & Drop Card */}
                      <div 
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          const file = e.dataTransfer.files?.[0];
                          if (file) handleImageUpload(file, setProductForm);
                        }}
                        className="md:col-span-2 border-2 border-dashed border-slate-200 hover:border-emerald-400 bg-slate-50/50 hover:bg-slate-50 p-4 rounded-xl flex flex-col items-center justify-center text-center transition-all relative cursor-pointer groupmin-h-[110px]"
                      >
                        <input 
                          type="file" 
                          accept="image/jpeg, image/png, image/webp"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleImageUpload(file, setProductForm);
                          }}
                          className="absolute inset-0 opacity-0 cursor-pointer" 
                        />
                        <Image className="text-slate-400 group-hover:text-emerald-500 mb-1.5 transition-colors" size={24} />
                        <span className="text-xs text-slate-600 font-medium">Drag-and-drop a product photo here</span>
                        <span className="text-[10px] text-slate-400 mt-0.5">or click to browse native storage</span>
                      </div>

                      {/* Image Preview Block */}
                      <div className="border border-slate-100 bg-slate-50 rounded-xl p-2 flex flex-col items-center justify-center relative overflow-hidden min-h-[110px]">
                        {imageUploadProgress > -1 ? (
                          <div className="w-full px-4 text-center">
                            <div className="w-full bg-gray-200 rounded-full h-1.5 mb-1">
                              <div className="bg-emerald-600 h-1.5 rounded-full" style={{ width: `${imageUploadProgress}%` }}></div>
                            </div>
                            <span className="text-[10px] text-slate-500 font-bold">{imageUploadProgress}%</span>
                          </div>
                        ) : productForm.image ? (
                          <>
                            <img 
                              src={productForm.image} 
                              alt="Form preview" 
                              className="w-full h-full object-cover rounded-lg"
                              referrerPolicy="no-referrer"
                            />
                            <button
                              type="button"
                              onClick={() => setProductForm(prev => ({ ...prev, image: '' }))}
                              className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 shadow-xs hover:bg-red-600 active:scale-95 transition-all cursor-pointer"
                              title="Delete picture"
                            >
                              <X size={10} />
                            </button>
                          </>
                        ) : (
                          <div className="text-center p-2 text-slate-400">
                            <span className="text-[10px] uppercase font-mono tracking-wider block">No Preview</span>
                            <span className="text-[9px] mt-0.5 block line-clamp-2 leading-relaxed">Photo converts automatically to Base64 payload</span>
                          </div>
                        )}
                      </div>

                    </div>

                    <div className="mt-2.5">
                      <label className="text-[10px] text-gray-400 block mb-1">Alternatively, paste an absolute Unsplash image URL below:</label>
                      <input
                        type="text"
                        value={productForm.image}
                        onChange={(e) => setProductForm({ ...productForm, image: e.target.value })}
                        placeholder="https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format..."
                        className="w-full bg-slate-50 border border-slate-100 hover:border-slate-200 focus:border-emerald-500 px-3 py-1.5 rounded-xl text-[11px] focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 justify-end pt-2 text-xs">
                  <button
                    type="button"
                    onClick={resetProductForm}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-xl transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl transition-all cursor-pointer shadow-xs"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            )}

            <div className="space-y-3 rounded-2xl border border-gray-100 bg-white p-4">
              <div className="grid gap-2 sm:grid-cols-3">
                <input value={adminProductSearch} onChange={(e) => setAdminProductSearch(e.target.value)} placeholder="Search product or brand..." className="rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-emerald-500" />
                <select value={adminCategoryFilter} onChange={(e) => setAdminCategoryFilter(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-emerald-500">
                  <option value="all">All categories</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <select value={adminStockFilter} onChange={(e) => setAdminStockFilter(e.target.value as any)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-emerald-500">
                  <option value="all">All stock</option><option value="in">In stock</option><option value="low">Low stock</option><option value="out">Out of stock</option>
                </select>
              </div>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {filteredAdminProducts.slice(0, adminVisibleCount).map((p) => (
                  <div key={p.id} className="min-w-[230px] max-w-[230px] rounded-2xl border border-slate-200 bg-white p-3">
                    <img src={p.image} alt={p.name} className="h-24 w-full rounded-xl object-cover" referrerPolicy="no-referrer" />
                    <p className="mt-2 line-clamp-2 text-xs font-bold text-slate-900">{p.name}</p>
                    <p className="text-[10px] text-slate-500">{categories.find((c) => c.id === p.categoryId)?.name || 'Unknown'} • {p.unit}</p>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-sm font-extrabold text-slate-900">£{Number(p.price).toFixed(2)}</span>
                      <span className="rounded-full bg-red-50 px-2 py-1 text-[10px] font-bold text-red-600">{p.discount}% off</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-[10px] font-semibold text-slate-600">Stock: {p.stock}</span>
                      <div className="flex items-center gap-1">
                        <button onClick={() => selectProductForEdit(p)} className="rounded-lg border border-blue-100 p-1.5 text-blue-600"><Edit2 size={12} /></button>
                        <button onClick={() => deleteProduct(p.id)} className="rounded-lg border border-rose-100 p-1.5 text-rose-600"><Trash2 size={12} /></button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {filteredAdminProducts.length > adminVisibleCount && (
                <button onClick={() => setAdminVisibleCount((v) => v + 8)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700">Load More</button>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: CATEGORIES CRUDS */}
        {activeTab === 'categories' && (
          <div className="space-y-6 animate-in fade-in duration-150">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-gray-900 font-bold text-base tracking-tight">Category Catalog Clusters</h3>
                <p className="text-xs text-gray-500">Arrange visual hierarchy settings to cluster product listings matching slider menus.</p>
              </div>

              {!isAddingCategory && (
                <button
                  onClick={() => setIsAddingCategory(true)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs px-3.5 py-2.5 rounded-xl cursor-pointer flex items-center gap-2 active:scale-95 transition-all shadow-xs"
                >
                  <Plus size={14} />
                  <span>Curate Category</span>
                </button>
              )}
            </div>

            {/* Category Add form */}
            {isAddingCategory && (
              <form onSubmit={handleCategorySubmit} className="bg-white border border-gray-100 p-4 rounded-2xl space-y-3.5">
                <h4 className="text-xs text-slate-700 font-bold uppercase tracking-wider">Cluster Category Parameters</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="block text-gray-500 font-semibold mb-1">Category Title Name *</label>
                    <input
                      type="text"
                      required
                      value={categoryForm.name}
                      onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                      placeholder="e.g. Health Supplements"
                      className="w-full bg-slate-50 border border-slate-100 hover:border-slate-200 focus:border-emerald-500 px-3 py-2 rounded-xl focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-gray-500 font-semibold mb-1">Lucide Icon Identifier *</label>
                    <input
                      type="text"
                      required
                      value={categoryForm.icon}
                      onChange={(e) => setCategoryForm({ ...categoryForm, icon: e.target.value })}
                      placeholder="e.g. Apple, Cookie, Coffee, Beef"
                      className="w-full bg-slate-50 border border-slate-100 hover:border-slate-200 focus:border-emerald-500 px-3 py-2 rounded-xl focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex gap-2 justify-end pt-1 text-xs">
                  <button
                    type="button"
                    onClick={() => setIsAddingCategory(false)}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg shadow-xs"
                  >
                    Post Category
                  </button>
                </div>
              </form>
            )}

            {/* List */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {categories.map(c => (
                <div key={c.id} className="bg-white border border-gray-100 p-4 rounded-2xl flex items-center justify-between shadow-xs">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center justify-center font-mono text-emerald-800 font-semibold uppercase">
                      {c.name.substring(0,2)}
                    </div>
                    <div>
                      <h4 className="text-gray-800 font-bold text-xs leading-tight">{c.name}</h4>
                      <p className="text-[10px] text-gray-400 mt-1 font-mono">{c.id} • icon : {c.icon}</p>
                    </div>
                  </div>
                  
                  <button
                    onClick={async () => {
                      if (!confirm(`Warning: Deleting ${c.name} will not delete its associated products, but they will become uncategorized. Continue?`)) return;
                      try {
                        await fetch(`/api/admin/categories/${c.id}`, {
                          method: 'DELETE',
                          headers: { 'Authorization': `Bearer ${token}` }
                        });
                        onNotify('Category indices purged.', 'success');
                        onRefreshAllData();
                      } catch {
                        onNotify('Category deletion error.', 'error');
                      }
                    }}
                    className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-all border border-transparent hover:border-rose-100"
                    title="Purge cluster"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 4: CUSTOMER ORDERS LIST AND SHIPPING TIMELINES */}
        {activeTab === 'orders' && (
          <div className="space-y-6 animate-in fade-in duration-150">
            <div>
              <h3 className="text-gray-900 font-bold text-base tracking-tight">Active Customer Shipments</h3>
              <p className="text-xs text-gray-500">Track current orders in real time. Push live timeline steps to trigger delivery partner coordinates.</p>
            </div>

            <div className="space-y-4">
              {orders.length === 0 ? (
                <p className="text-xs text-gray-400 italic text-center py-10">No customer transactions logged in store record.</p>
              ) : (
                orders.map(o => (
                  <div key={o.id} className="bg-white border border-gray-100 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-50 pb-3 text-xs">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-800 font-extrabold font-mono text-sm">{o.id}</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                            o.status === 'Delivered' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                            o.status === 'Cancelled' ? 'bg-rose-50 text-rose-600 border-rose-100' :
                            'bg-amber-50 text-amber-600 border-amber-100 animate-pulse'
                          }`}>{o.status.toUpperCase()}</span>
                        </div>
                        <p className="text-[10px] text-gray-400 font-medium font-mono mt-1">E-mail: {o.userEmail} • Date: {new Date(o.createdAt).toLocaleString()}</p>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <select
                          value={o.status}
                          onChange={(e) => updateOrderStatus(o.id, e.target.value as any, `Timeline updated by dispatcher: ${e.target.value}`)}
                          className="bg-slate-50 border border-slate-100 hover:border-slate-200 outline-none rounded-lg px-2.5 py-1.5 font-bold text-[11px] text-slate-700 cursor-pointer"
                        >
                          <option value="Pending">Pending Audit</option>
                          <option value="Packed">Bagged & Packed</option>
                          <option value="Shipped">Shipped Logistics</option>
                          <option value="Out for delivery">Out For Delivery</option>
                          <option value="Delivered">Delivered Done</option>
                          <option value="Cancelled">Cancelled Purged</option>
                        </select>
                        
                        <a
                          href={o.invoiceUrl || `/api/orders/${o.id}/invoice`}
                          download
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-1.5 px-3 rounded-lg text-[11px] flex items-center gap-1 cursor-pointer transition-all"
                        >
                          <FileText size={11} />
                          <span>Invoice</span>
                        </a>
                      </div>
                    </div>

                    {/* Cost metrics and delivery details */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                      <div className="space-y-1.5 bg-slate-50/50 p-3 rounded-xl border border-slate-100/50">
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">Itemized Shopping Bag</p>
                        {o.items.map((it, idx) => (
                          <div key={idx} className="flex justify-between items-center text-gray-700">
                            <span>{it.productName} ({it.unit}) x <strong>{it.quantity}</strong></span>
                            <span className="font-mono text-gray-800 font-semibold">£{(it.price * it.quantity).toFixed(2)}</span>
                          </div>
                        ))}
                        <div className="border-t border-slate-100 pt-1.5 mt-1.5 flex justify-between font-bold text-gray-900">
                          <span>Grand total</span>
                          <span className="font-mono font-extrabold text-emerald-800">£{o.total.toFixed(2)}</span>
                        </div>
                      </div>

                      <div className="space-y-1 bg-slate-50/50 p-3 rounded-xl border border-slate-100/50 leading-relaxed text-gray-600">
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">Recipient Delivery Coordinates</p>
                        <p className="font-bold text-gray-800">{o.address.fullName} ({o.address.label})</p>
                        <p>{o.address.street}</p>
                        <p>{o.address.city}, {o.address.state} - {o.address.pincode}</p>
                        <p className="font-mono font-medium text-slate-800 mt-1">Mobile: +91 {o.address.phone}</p>
                        <p className="text-[11px] font-medium text-emerald-700 mt-1.5 flex items-center gap-1">
                          <CheckCircle2 size={12} />
                          <span>Gate passcode verified • COD / Payment Mode secured</span>
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'logistics' && (
          <div className="space-y-6 animate-in fade-in duration-150">
            <div>
              <h3 className="text-gray-900 font-bold text-base tracking-tight">Realtime Logistics Control Tower</h3>
              <p className="text-xs text-gray-500">Monitor routes, riders, COD risk, delay alerts, and live customer tracking documents.</p>
            </div>
            <AdminLogisticsPanel orders={orders} token={token} onNotify={onNotify} />
          </div>
        )}

        {/* TAB 5: COUPONS MANAGEMENTS */}
        {activeTab === 'coupons' && (
          <div className="space-y-6 animate-in fade-in duration-150">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-gray-900 font-bold text-base tracking-tight">Promotional coupon Codes</h3>
                <p className="text-xs text-gray-500">Provide flat cashbacks or percentage cuts. Configure expiry coordinates and total limit bounds.</p>
              </div>

              {!isAddingCoupon && (
                <button
                  onClick={() => setIsAddingCoupon(true)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs px-3.5 py-2.5 rounded-xl cursor-pointer flex items-center gap-2 active:scale-95 transition-all shadow-xs"
                >
                  <Plus size={14} />
                  <span>Curate Coupon</span>
                </button>
              )}
            </div>

            {isAddingCoupon && (
              <form onSubmit={handleCouponSubmit} className="bg-white border border-gray-100 p-4 rounded-2xl space-y-4">
                <h4 className="text-xs text-slate-700 font-bold uppercase tracking-wider">Configure Coupon parameters</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="block text-gray-500 font-semibold mb-1">Coupon code tag *</label>
                    <input
                      type="text"
                      required
                      value={couponForm.code}
                      onChange={(e) => setCouponForm({ ...couponForm, code: e.target.value })}
                      placeholder="e.g. MONSOON40"
                      className="w-full bg-slate-50 border border-slate-100 focus:border-emerald-500 px-3 py-2 rounded-xl focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-gray-500 font-semibold mb-1">Calculation type *</label>
                    <select
                      value={couponForm.type}
                      onChange={(e) => setCouponForm({ ...couponForm, type: e.target.value as any })}
                      className="w-full bg-slate-50 border border-slate-100 focus:border-emerald-500 px-3 py-2 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    >
                      <option value="percent">Percentage deduction (%)</option>
                      <option value="fixed">Flat pounds cashback (£)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-gray-500 font-semibold mb-1">Deduction count value *</label>
                    <input
                      type="number"
                      required
                      min="1"
                      value={couponForm.value}
                      onChange={(e) => setCouponForm({ ...couponForm, value: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-100 focus:border-emerald-500 px-3 py-2 rounded-xl focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-gray-500 font-semibold mb-1">Expiry Date Calendar limit *</label>
                    <input
                      type="date"
                      required
                      value={couponForm.expiryDate}
                      onChange={(e) => setCouponForm({ ...couponForm, expiryDate: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-100 focus:border-emerald-500 px-3 py-2 rounded-xl focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-gray-500 font-semibold mb-1">Max allocation Limit count *</label>
                    <input
                      type="number"
                      required
                      min="1"
                      value={couponForm.usageLimit}
                      onChange={(e) => setCouponForm({ ...couponForm, usageLimit: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-100 focus:border-emerald-500 px-3 py-2 rounded-xl focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex gap-2 justify-end pt-1 text-xs">
                  <button
                    type="button"
                    onClick={() => setIsAddingCoupon(false)}
                    className="px-3 py-1.5 bg-slate-100 text-slate-700 font-medium rounded-lg hover:bg-slate-200 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-3 py-1.5 bg-emerald-600 text-white font-medium rounded-lg shadow-xs hover:bg-emerald-750 cursor-pointer"
                  >
                    Save Coupon
                  </button>
                </div>
              </form>
            )}

            {/* List */}
            <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
              <table className="w-full text-left text-xs text-gray-500">
                <thead className="bg-slate-50 text-[10px] text-gray-400 font-bold uppercase border-b border-gray-100">
                  <tr>
                    <th className="px-5 py-3">Code tag</th>
                    <th className="px-4 py-3">Benefit Value</th>
                    <th className="px-4 py-3">Expiry Calendar</th>
                    <th className="px-4 py-3">Utilization Tracker</th>
                    <th className="px-5 py-3 text-right">Settings Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 text-gray-700">
                  {coupons.map(c => (
                    <tr key={c.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-5 py-3 font-mono font-black text-emerald-800 text-sm">{c.code}</td>
                      <td className="px-4 py-3 font-medium">
                        {c.type === 'percent' ? `${c.value}% deduction` : `£${Number(c.value).toFixed(2)} FLAT`}
                      </td>
                      <td className="px-4 py-3 font-mono text-gray-500">{new Date(c.expiryDate).toLocaleDateString()}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="font-semibold text-slate-800">{c.usageCount}</span>
                        <span className="text-slate-400"> / {c.usageLimit} claims used</span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          onClick={() => deleteCoupon(c.id)}
                          className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-all hover:border hover:border-rose-100"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 6: HOMEPAGE BANNERS */}
        {activeTab === 'banners' && (
          <div className="space-y-6 animate-in fade-in duration-150">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-gray-900 font-bold text-base tracking-tight">Promotional Homepage Banners</h3>
                <p className="text-xs text-gray-500">Inject dynamic premium promotional slides on Nammashop customer gates.</p>
              </div>

              {!isAddingBanner && (
                <button
                  onClick={() => setIsAddingBanner(true)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs px-3.5 py-2.5 rounded-xl cursor-pointer flex items-center gap-2 active:scale-95 transition-all shadow-xs"
                >
                  <Plus size={14} />
                  <span>Curate Banner</span>
                </button>
              )}
            </div>

            {isAddingBanner && (
              <form onSubmit={handleBannerSubmit} className="bg-white border border-gray-100 p-4 rounded-2xl space-y-4">
                <h4 className="text-xs text-slate-700 font-bold uppercase tracking-wider">Configure Promo Slider parameters</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="block text-gray-500 font-semibold mb-1">Banner Catchy Title *</label>
                    <input
                      type="text"
                      required
                      value={bannerForm.title}
                      onChange={(e) => setBannerForm({ ...bannerForm, title: e.target.value })}
                      placeholder="e.g. Weekend Icecreams 20% OFF"
                      className="w-full bg-slate-50 border border-slate-100 focus:border-emerald-500 px-3 py-2 rounded-xl focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-gray-500 font-semibold mb-1">Subtext description</label>
                    <input
                      type="text"
                      value={bannerForm.subtitle}
                      onChange={(e) => setBannerForm({ ...bannerForm, subtitle: e.target.value })}
                      placeholder="e.g. Crafted dairy pops delivered frozen cold"
                      className="w-full bg-slate-50 border border-slate-100 focus:border-emerald-500 px-3 py-2 rounded-xl focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-gray-500 font-semibold mb-1">Exact discount route (%)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      value={bannerForm.discount}
                      onChange={(e) => setBannerForm({ ...bannerForm, discount: e.target.value })}
                      placeholder="e.g. 10"
                      className="w-full bg-slate-50 border border-slate-100 focus:border-emerald-500 px-3 py-2 rounded-xl focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-gray-500 font-semibold mb-1">Offer text</label>
                    <input
                      type="text"
                      value={bannerForm.offerText}
                      onChange={(e) => setBannerForm({ ...bannerForm, offerText: e.target.value })}
                      placeholder="e.g. 10% OFF on Grocery Essentials"
                      className="w-full bg-slate-50 border border-slate-100 focus:border-emerald-500 px-3 py-2 rounded-xl focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-gray-500 font-semibold mb-1">Sponsor / brand</label>
                    <input
                      type="text"
                      value={bannerForm.sponsorName}
                      onChange={(e) => setBannerForm({ ...bannerForm, sponsorName: e.target.value })}
                      placeholder="e.g. Tesco Finest"
                      className="w-full bg-slate-50 border border-slate-100 focus:border-emerald-500 px-3 py-2 rounded-xl focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-gray-500 font-semibold mb-1">Badge label</label>
                    <input
                      type="text"
                      value={bannerForm.badge}
                      onChange={(e) => setBannerForm({ ...bannerForm, badge: e.target.value })}
                      placeholder="e.g. Sponsored"
                      className="w-full bg-slate-50 border border-slate-100 focus:border-emerald-500 px-3 py-2 rounded-xl focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-gray-500 font-semibold mb-1">Primary CTA</label>
                    <select
                      value={bannerForm.ctaLabel}
                      onChange={(e) => setBannerForm({ ...bannerForm, ctaLabel: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-100 focus:border-emerald-500 px-3 py-2 rounded-xl focus:outline-none"
                    >
                      <option value="Shop Now">Shop Now</option>
                      <option value="View Offer">View Offer</option>
                      <option value="Explore Collection">Explore Collection</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-gray-500 font-semibold mb-1">Secondary CTA</label>
                    <select
                      value={bannerForm.secondaryCtaLabel}
                      onChange={(e) => setBannerForm({ ...bannerForm, secondaryCtaLabel: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-100 focus:border-emerald-500 px-3 py-2 rounded-xl focus:outline-none"
                    >
                      <option value="Explore Collection">Explore Collection</option>
                      <option value="Shop Now">Shop Now</option>
                      <option value="View Offer">View Offer</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-gray-500 font-semibold mb-1">Campaign type</label>
                    <select
                      value={bannerForm.campaignType}
                      onChange={(e) => setBannerForm({ ...bannerForm, campaignType: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-100 focus:border-emerald-500 px-3 py-2 rounded-xl focus:outline-none"
                    >
                      <option value="sponsored">Sponsored brand</option>
                      <option value="featured">Featured product</option>
                      <option value="seasonal">Seasonal campaign</option>
                      <option value="offer">Offer / discount</option>
                      <option value="advertisement">Advertisement</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-gray-500 font-semibold mb-1">Priority order</label>
                    <input
                      type="number"
                      value={bannerForm.priority}
                      onChange={(e) => setBannerForm({ ...bannerForm, priority: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-100 focus:border-emerald-500 px-3 py-2 rounded-xl focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-gray-500 font-semibold mb-1">Start date</label>
                    <input
                      type="datetime-local"
                      value={bannerForm.startDate}
                      onChange={(e) => setBannerForm({ ...bannerForm, startDate: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-100 focus:border-emerald-500 px-3 py-2 rounded-xl focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-gray-500 font-semibold mb-1">End date</label>
                    <input
                      type="datetime-local"
                      value={bannerForm.endDate}
                      onChange={(e) => setBannerForm({ ...bannerForm, endDate: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-100 focus:border-emerald-500 px-3 py-2 rounded-xl focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-gray-500 font-semibold mb-1">Target category</label>
                    <select
                      value={bannerForm.targetCategoryId}
                      onChange={(e) => setBannerForm({ ...bannerForm, targetCategoryId: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-100 focus:border-emerald-500 px-3 py-2 rounded-xl focus:outline-none"
                    >
                      <option value="">No category redirect</option>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>{category.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-gray-500 font-semibold mb-1">Redirect link</label>
                    <input
                      type="text"
                      value={bannerForm.link}
                      onChange={(e) => setBannerForm({ ...bannerForm, link: e.target.value })}
                      placeholder="/offers/summer-fresh"
                      className="w-full bg-slate-50 border border-slate-100 focus:border-emerald-500 px-3 py-2 rounded-xl focus:outline-none"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-gray-500 font-semibold mb-1">Upload Image or Paste Link *</label>
                    <div className="flex flex-col gap-2">
                      <input
                        type="file"
                        accept="image/jpeg, image/png, image/webp"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleImageUpload(file, setBannerForm);
                        }}
                        className="w-full bg-slate-50 border border-slate-100 p-1.5 rounded-xl text-xs"
                      />
                      <input
                        type="text"
                        required
                        value={bannerForm.image}
                        onChange={(e) => setBannerForm({ ...bannerForm, image: e.target.value })}
                        placeholder="https://images.unsplash.com/photo-..."
                        className="w-full bg-slate-50 border border-slate-100 focus:border-emerald-500 px-3 py-2 rounded-xl focus:outline-none"
                      />
                    </div>
                    {imageUploadProgress > -1 && (
                      <div className="w-full bg-gray-200 rounded-full h-1 mt-2">
                        <div className="bg-emerald-600 h-1 rounded-full" style={{ width: `${imageUploadProgress}%` }}></div>
                      </div>
                    )}
                  </div>

                  <div className="md:col-span-2">
                    <label className="flex items-center gap-2 text-gray-500 font-semibold">
                      <input
                        type="checkbox"
                        checked={bannerForm.active}
                        onChange={(e) => setBannerForm({ ...bannerForm, active: e.target.checked })}
                        className="accent-emerald-600"
                      />
                      <span>Campaign active on publish</span>
                    </label>
                  </div>
                </div>

                <div className="flex gap-2 justify-end pt-1 text-xs">
                  <button
                    type="button"
                    onClick={() => setIsAddingBanner(false)}
                    className="px-3 py-1.5 bg-slate-100 text-slate-700 font-medium rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-3 py-1.5 bg-emerald-600 text-white font-medium rounded-lg shadow-xs"
                  >
                    Publish Slider
                  </button>
                </div>
              </form>
            )}

            {/* List */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {banners.map(b => (
                <div key={b.id} className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-xs relative">
                  <img src={b.image} alt={b.title} className="h-28 w-full object-cover brightness-70" referrerPolicy="no-referrer" />
                  <div className="p-4 bg-white space-y-1.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">{b.badge || b.campaignType || 'Campaign'}</span>
                      <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${b.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{b.active ? 'Active' : 'Paused'}</span>
                    </div>
                    <h4 className="text-gray-800 font-bold block truncate leading-tight">{b.title}</h4>
                    <p className="text-[10px] text-gray-400 font-medium tracking-wide block truncate">{b.subtitle || 'No subtext.'}</p>
                    <p className="text-[10px] text-rose-500 font-bold">
                      {b.discount ? `${b.discount}% exact discount route` : 'No discount route'}
                    </p>
                    <p className="text-[10px] text-slate-500">Sponsor: {b.sponsorName || 'NammaShop'}</p>
                    <p className="text-[10px] text-slate-400">Priority {b.priority || 99}{b.startDate ? ` • Starts ${new Date(b.startDate).toLocaleDateString()}` : ''}</p>
                    <div className="flex justify-between items-center border-t border-gray-50 pt-2 mt-2">
                      <span className="text-[9px] text-slate-400 font-mono tracking-wider">ID: {b.id}</span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => updateBanner(b.id, { active: !b.active })}
                          className="p-1 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-md border border-slate-200 text-[10px]"
                        >
                          {b.active ? 'Pause' : 'Activate'}
                        </button>
                        <button
                          onClick={() => updateBanner(b.id, { priority: Math.max(1, (b.priority || 99) - 1) })}
                          className="p-1 px-2.5 bg-amber-50 hover:bg-amber-100 text-amber-700 font-bold rounded-md border border-amber-100 text-[10px]"
                        >
                          Raise
                        </button>
                        <button
                          onClick={() => deleteBanner(b.id)}
                          className="p-1 px-2.5 bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold rounded-md border border-rose-100 text-[10px]"
                        >
                          Purge
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 7: ENROLLED USERS AND BAN/UNBAN POLICY */}
        {activeTab === 'users' && (
          <div className="space-y-6 animate-in fade-in duration-150">
            <div>
              <h3 className="text-gray-900 font-bold text-base tracking-tight">Customers Security roster</h3>
              <p className="text-xs text-gray-500">View customer catalogs, manage roles, and toggle access states.</p>
            </div>

            <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
              <table className="w-full text-left text-xs text-gray-500">
                <thead className="bg-slate-50 text-[10px] text-gray-400 font-bold uppercase border-b border-gray-100">
                  <tr>
                    <th className="px-5 py-3">Customer Profile</th>
                    <th className="px-4 py-3">Registered E-mail</th>
                    <th className="px-4 py-3">System Role</th>
                    <th className="px-4 py-3">Security status</th>
                    <th className="px-5 py-3 text-right">Roster Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 text-gray-700">
                  {allUsers.map(u => (
                    <tr key={u.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-5 py-3.5 flex items-center gap-2.5">
                        <img src={u.avatar || `https://api.dicebear.com/7.x/pixel-art/svg?seed=${u.id}`} className="h-8 w-8 rounded-full border border-gray-100" />
                        <span className="text-slate-800 font-bold text-xs">{u.name}</span>
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-500">{u.email}</td>
                      <td className="px-4 py-3 uppercase text-[10px] font-bold">
                        <span className={`px-2 py-0.5 rounded-md ${u.role === 'admin' ? 'bg-indigo-50 text-indigo-700 font-bold border border-indigo-100' : 'bg-slate-50 text-slate-500 border border-slate-100'}`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {u.isBanned ? (
                          <span className="bg-rose-50 border border-rose-100 text-rose-600 text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider">SUSPENDED</span>
                        ) : (
                          <span className="bg-emerald-50 border border-emerald-100 text-emerald-600 text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider">ACTIVE ACCESS</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right whitespace-nowrap">
                        {u.email === 'admin@nammashop.com' || u.email === 'mjjayan2007@gmail.com' ? (
                          <span className="text-xs text-gray-400 italic">Predefined Core Owner</span>
                        ) : (
                          <button
                            onClick={() => toggleUserBan(u.id)}
                            className={`px-3 py-1 rounded-lg border font-bold text-[10px] cursor-pointer transition-all ${
                              u.isBanned
                                ? 'bg-emerald-600 hover:bg-emerald-700 border-emerald-700 text-white'
                                : 'bg-rose-50 hover:bg-rose-100 border-rose-100 text-rose-600'
                            }`}
                          >
                            {u.isBanned ? 'Re-enable Access' : 'Suspend Account'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
