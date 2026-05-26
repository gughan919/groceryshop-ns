import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  CheckCircle2, 
  Truck, 
  ShoppingBag, 
  MapPin, 
  ArrowRight, 
  Download, 
  HelpCircle, 
  Phone, 
  ShieldCheck, 
  Copy, 
  Check, 
  Mail, 
  Sparkles, 
  ChevronDown, 
  ChevronUp, 
  RefreshCw,
  Clock,
  ExternalLink,
  MessageSquare,
  AlertCircle
} from 'lucide-react';
import { Order, Product, User } from '../types';

import { generateAndUploadInvoice } from '../utils/invoice';

interface OrderSuccessViewProps {
  order: Order;
  products?: Product[];
  addToCart?: (productId: string, quantity?: number) => void;
  notifyUser?: (msg: string, type?: 'success' | 'error') => void;
  currentUser?: User | null;
  token?: string | null;
  onNavigateToProducts: () => void;
  onTrackLiveDispatch: () => void;
  onNavigateToOrders?: () => void;
}

export default function OrderSuccessView({
  order,
  products = [],
  addToCart,
  notifyUser,
  currentUser,
  token,
  onNavigateToProducts,
  onTrackLiveDispatch,
  onNavigateToOrders
}: OrderSuccessViewProps) {
  const [copiedId, setCopiedId] = useState(false);
  const [itemsExpanded, setItemsExpanded] = useState(true);
  const [liveOrder, setLiveOrder] = useState<Order>(order);
  const [isLiveRefreshing, setIsLiveRefreshing] = useState(false);
  const [addedItems, setAddedItems] = useState<Record<string, boolean>>({});

  // Sync state if order prop changes
  useEffect(() => {
    setLiveOrder(order);
  }, [order]);

  // Support responsive simulated sparkles / celebration particles
  const particles = Array.from({ length: 18 }, (_, idx) => ({
    id: idx,
    x: Math.random() * 100, // percentage left
    y: Math.random() * 100, // percentage top
    size: Math.random() * 8 + 4, // size in px
    delay: Math.random() * 1.5,
    color: ['text-emerald-400', 'text-yellow-400', 'text-amber-400', 'text-teal-300'][idx % 4]
  }));

  // Fetch live order details if a token exists to update delivery progress live
  const handleLiveSync = async () => {
    if (!token) return;
    setIsLiveRefreshing(true);
    try {
      const resp = await fetch('/api/orders', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (resp.ok) {
        const list: Order[] = await resp.json();
        const found = list.find(o => o.id === liveOrder.id);
        if (found) {
          setLiveOrder(found);
          if (notifyUser) {
            notifyUser('Latest delivery dispatch coordinates updated successfully!', 'success');
          }
        }
      }
    } catch (err) {
      console.warn('Silent live synchronization fallback:', err);
    } finally {
      setIsLiveRefreshing(false);
    }
  };

  const handleCopyOrderId = () => {
    navigator.clipboard.writeText(liveOrder.id);
    setCopiedId(true);
    if (notifyUser) {
      notifyUser('Order ID copied to clipboard!', 'success');
    }
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handleDownloadInvoice = async () => {
    if (!token) {
      if (notifyUser) notifyUser('Please sign in to retrieve printable receipts.', 'error');
      return;
    }
    try {
      if (liveOrder.invoiceUrl) {
        window.open(liveOrder.invoiceUrl, '_blank');
        return;
      }
      if (notifyUser) notifyUser('Generating your invoice PDF. Please wait...', 'success');
      const newUrl = await generateAndUploadInvoice(liveOrder, token);
      if (newUrl) {
        window.open(newUrl, '_blank');
        if (notifyUser) notifyUser('Invoice generated & saved successfully! 📄', 'success');
        setLiveOrder({ ...liveOrder, invoiceUrl: newUrl });
      } else {
        if (notifyUser) notifyUser('Invoice generation timed out. Try again in a minute.', 'error');
      }
    } catch (err) {
      if (notifyUser) notifyUser('Invoice generation timed out. Try again in a minute.', 'error');
    }
  };

  const handleQuickAdd = (productId: string) => {
    if (addToCart) {
      addToCart(productId, 1);
      setAddedItems(prev => ({ ...prev, [productId]: true }));
      if (notifyUser) {
        notifyUser('Recommended item added to your grocery checkout bag!', 'success');
      }
      setTimeout(() => {
        setAddedItems(prev => ({ ...prev, [productId]: false }));
      }, 2000);
    }
  };

  // Compute dynamic timeline steps from Order object
  const timelineSteps = liveOrder.timeline.map((step, index) => ({
    title: step.status,
    timeLabel: new Date(step.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    description: step.description,
    isCompleted: index < liveOrder.timeline.findIndex(s => s.status === liveOrder.status) + 1,
    isActive: step.status === liveOrder.status
  }));
  
  // Ensure we have at least 4 steps for layout consistency if needed, 
  // but mapping directly to the actual timeline history is better
  const orderStatus = liveOrder.status; // 'Pending' | 'Shipped' | 'Delivered' | 'Cancelled'

  // Pick up 4 in-stock, relevant products to recommend (avoiding ones already bought where possible)
  const purchasedProductIds = liveOrder.items.map(it => it.productId);
  const recommendedItems = products
    .filter(p => !purchasedProductIds.includes(p.id) && p.stock > 0)
    .slice(0, 4);

  // Fallback recommendations if we got none
  const defaultRecommendations = [
    { id: 'rec-1', name: 'Premium Organic Strawberries', price: 3.49, image: 'https://images.unsplash.com/photo-1464965911861-746a04b4bca6?w=200&q=80', unit: '250g Pack' },
    { id: 'rec-2', name: 'Fresh Cream Whole Milk', price: 1.89, image: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=200&q=80', unit: '1 Litre' },
    { id: 'rec-3', name: 'Artisanal Sourdough Bread', price: 2.75, image: 'https://images.unsplash.com/photo-1549931319-a545dcf3bc73?w=200&q=80', unit: '400g Loaf' },
    { id: 'rec-4', name: 'Salted Grass-fed Butter', price: 2.10, image: 'https://images.unsplash.com/photo-1589985270826-4b7bb135bc9d?w=200&q=80', unit: '250g Stick' }
  ];

  const finalRecommendations = recommendedItems.length > 0 ? recommendedItems : defaultRecommendations;

  // Render nicely
  return (
    <div id="premium-order-success-view" className="min-h-screen bg-slate-50 dark:bg-slate-800/50/50 py-10 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      
      {/* Subtle celebratory sparkle particles in background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden select-none">
        {particles.map((p) => (
          <motion.div
            key={p.id}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ 
              opacity: [0, 0.7, 0.7, 0], 
              scale: [0.3, 1.2, 1, 0.5],
              y: ['0px', '-100px']
            }}
            transition={{
              duration: 4,
              repeat: Infinity,
              delay: p.delay,
              ease: "easeInOut"
            }}
            style={{
              position: 'absolute',
              left: `${p.x}%`,
              top: `${p.y}%`,
            }}
            className={`${p.color} pointer-events-none`}
          >
            <Sparkles size={p.size} className="fill-current" />
          </motion.div>
        ))}
      </div>

      <div className="max-w-4xl mx-auto space-y-8 relative z-10">
        
        {/* TOP STATUS HERO BAR */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white dark:bg-slate-900/80 backdrop-blur-md rounded-2xl border border-slate-100 dark:border-slate-800 p-4 shadow-3xs">
          <div className="flex items-center gap-2.5 text-xs text-slate-500 font-medium">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Real-time Secure Connection Active</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleLiveSync}
              disabled={isLiveRefreshing}
              className="px-3.5 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 disabled:opacity-50 transition-all rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw size={12} className={`${isLiveRefreshing ? 'animate-spin' : ''}`} />
              <span>{isLiveRefreshing ? 'Syncing...' : 'Sync Live Status'}</span>
            </button>

            <span className="text-[10px] bg-emerald-50 text-emerald-700 font-bold px-2.5 py-1 rounded-lg border border-emerald-100 uppercase tracking-wider">
              10-Min Speed Route Approved
            </span>
          </div>
        </div>

        {/* CELEBRATION CARD */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="bg-white rounded-3xl border border-slate-200 dark:border-slate-700/80 p-6 sm:p-10 text-center relative shadow-sm overflow-hidden"
        >
          {/* Subtle corner patterns for luxury look */}
          <div className="absolute top-0 right-0 h-32 w-32 bg-radial from-emerald-100/30 to-transparent pointer-events-none rounded-full blur-2xl"></div>
          <div className="absolute -bottom-8 -left-8 h-32 w-32 bg-radial from-amber-100/30 to-transparent pointer-events-none rounded-full blur-2xl"></div>

          <div className="space-y-6">
            
            {/* Success checkmark DRAW animation */}
            <div className="relative inline-flex items-center justify-center">
              <motion.div
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                className="h-24 w-24 bg-emerald-50 rounded-full flex items-center justify-center border border-emerald-100 relative z-15"
              >
                <motion.svg
                  className="w-12 h-12 text-emerald-600"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <motion.polyline
                    points="20 6 9 17 4 12"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ delay: 0.2, duration: 0.6, ease: "easeOut" }}
                  />
                </motion.svg>
              </motion.div>

              {/* Pulsing ring expansion */}
              <motion.div
                animate={{ scale: [1, 1.4, 1.6, 1.4, 1], opacity: [0.1, 0.4, 0, 0.4, 0.1] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                className="absolute inset-0 border-2 border-emerald-500 rounded-full bg-emerald-100/5 z-0 pointer-events-none scale-110"
              />
            </div>

            <div className="space-y-2 max-w-lg mx-auto">
              <span className="text-xs bg-emerald-100 text-emerald-800 font-extrabold px-3 py-1 rounded-full uppercase tracking-widest inline-block text-center mb-1">
                Authorized checkout passed
              </span>
              <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-tight">
                Order Placed Successfully! 🎉
              </h1>
              <p className="text-slate-500 text-sm sm:text-base leading-relaxed">
                Thank you for shopping with us! Your premium fresh groceries have been scheduled in our lightning-fast eco delivery line.
              </p>
            </div>

            {/* Quick Summary Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-100 bg-slate-50 border border-slate-100 rounded-2xl p-4 sm:p-5 max-w-2xl mx-auto gap-4 tracking-tight">
              
              {/* Order Secure ID */}
              <div className="flex flex-col justify-center items-center py-2 sm:py-0">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">Order Identifier</span>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono font-black text-slate-800 dark:text-slate-100 text-sm sm:text-base tracking-tight">{liveOrder.id}</span>
                  <button 
                    onClick={handleCopyOrderId} 
                    className="p-1 hover:bg-slate-200/80 rounded transition-colors text-slate-400 hover:text-slate-700"
                    title="Copy Order ID"
                  >
                    {copiedId ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                  </button>
                </div>
              </div>

              {/* Estimated Speed Time */}
              <div className="flex flex-col justify-center items-center py-2 sm:py-0">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">Estimated Slot</span>
                <div className="flex items-center gap-1 text-emerald-700 font-extrabold text-sm sm:text-base">
                  <Clock size={15} />
                  <span>8 - 10 Minutes</span>
                </div>
              </div>

              {/* Grand Cost paid */}
              <div className="flex flex-col justify-center items-center py-2 sm:py-0">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">Total Paid Amount</span>
                <span className="text-slate-900 font-black text-base sm:text-lg">£{liveOrder.total.toFixed(2)}</span>
              </div>

            </div>

          </div>
        </motion.div>

        {/* INTERACTIVE DELIVERY PROGRESS SECTIONS */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* LEFT 2 COLS: DELIVERY STATUS ROUTE TIMELINE */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 space-y-6 shadow-3xs">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-extrabold text-slate-900 text-md sm:text-lg tracking-tight">Rapid Delivery Timeline</h3>
                  <p className="text-xs text-slate-400">Live progress report of your organic items dispatch.</p>
                </div>
                <span className={`px-2.5 py-1 text-[10px] font-extrabold rounded-lg border uppercase tracking-wider ${
                  orderStatus === 'Delivered' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                  orderStatus === 'Cancelled' ? 'bg-rose-50 text-rose-700 border-rose-100' :
                  'bg-amber-50 text-amber-700 border-amber-100 animate-pulse'
                }`}>
                  Status: {orderStatus}
                </span>
              </div>

              {/* TIMELINE TRACKING PROGRESS */}
              {orderStatus === 'Cancelled' ? (
                <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-center gap-3 text-rose-800 text-xs">
                  <AlertCircle size={20} className="shrink-0" />
                  <div>
                    <h5 className="font-bold">This order has been cancelled</h5>
                    <p className="text-slate-500 mt-0.5">Item stock reservation has been released and payment has been marked for reversal.</p>
                  </div>
                </div>
              ) : (
                <div className="relative pl-6 space-y-8 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[2px] before:bg-slate-100">
                  
                  {timelineSteps.map((step, idx) => (
                    <div key={idx} className="relative flex gap-4 text-xs">
                      
                      {/* Checkpoint Dot Marker */}
                      <div className="absolute -left-[27px] top-0.5 z-10 flex items-center justify-center">
                        {step.isCompleted ? (
                          <div className="h-6 w-6 rounded-full bg-emerald-500 border-4 border-white text-white flex items-center justify-center shadow-sm">
                            <Check size={10} className="stroke-[3]" />
                          </div>
                        ) : step.isActive ? (
                          <div className="h-6 w-6 rounded-full bg-amber-400 border-4 border-white text-white flex items-center justify-center shadow-3xs relative">
                            <span className="absolute inset-0 rounded-full animate-ping bg-amber-400/30"></span>
                            <div className="h-2 w-2 rounded-full bg-white"></div>
                          </div>
                        ) : (
                          <div className="h-6 w-6 rounded-full bg-slate-200 border-4 border-white text-white flex items-center justify-center">
                            <div className="h-1.5 w-1.5 rounded-full bg-slate-400"></div>
                          </div>
                        )}
                      </div>

                      <div className="flex-1 space-y-1 bg-slate-50/50 p-3 rounded-xl border border-slate-100 hover:border-slate-200 transition-colors">
                        <div className="flex items-center justify-between">
                          <h4 className={`font-bold text-sm ${step.isCompleted ? 'text-emerald-800' : 'text-slate-800'}`}>
                            {step.title}
                          </h4>
                          <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">
                            {step.timeLabel}
                          </span>
                        </div>
                        <p className="text-slate-500 text-xs leading-relaxed">{step.description}</p>
                      </div>

                    </div>
                  ))}

                </div>
              )}

              {/* DELIVERY EXECUTIVE DETAIL STRIP */}
              <div className="bg-gradient-to-tr from-slate-900 to-slate-800 text-white rounded-2xl p-5 shadow-sm space-y-4">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <img 
                      src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&q=80" 
                      alt="Rider" 
                      className="h-11 w-11 object-cover rounded-full border border-white/20 shadow"
                    />
                    <div>
                      <h4 className="font-bold text-sm text-yellow-300">Shiva Shankar</h4>
                      <p className="text-[10px] text-slate-300">Your Assigned Premium Rider</p>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-[9px] bg-white/10 px-2.5 py-1 rounded-full uppercase tracking-wider text-slate-300">Vehicle Scooter</span>
                    <p className="font-bold text-xs mt-1">KA-03-HL-1090 (Electric)</p>
                  </div>
                </div>

                <div className="border-t border-white/10 pt-3.5 flex items-center justify-between text-xs text-slate-300">
                  <div className="flex items-center gap-1.5 text-yellow-300">
                    <ShieldCheck size={14} />
                    <span>Secure delivery verification Code PIN:</span>
                    <strong className="font-mono bg-white/15 px-2 py-0.5 rounded tracking-widest text-white text-xs">
                      {liveOrder.id ? liveOrder.id.replace(/\D/g, '').slice(0, 4) || '3948' : '3948'}
                    </strong>
                  </div>

                  <div className="flex items-center gap-2">
                    <a href="tel:+9180706050" className="p-2 bg-white/5 hover:bg-white/10 text-slate-200 rounded-lg transition-all" title="Call Rider">
                      <Phone size={13} />
                    </a>
                  </div>
                </div>
              </div>

            </div>

            {/* EMAIL PORTAL CONFIRMATION BANNER */}
            <div className="bg-emerald-50/50 border border-emerald-100/60 rounded-3xl p-5 flex flex-col sm:flex-row items-center gap-4 text-xs text-emerald-800">
              <div className="h-10 w-10 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600 shrink-0">
                <Mail size={18} />
              </div>
              <div className="flex-1 text-center sm:text-left">
                <h5 className="font-bold text-sm">Email Confirmation Outstanding</h5>
                <p className="text-slate-500 mt-1">
                  We have dispatched a receipt of invoice order confirmation to: <strong className="text-emerald-900 underline font-semibold break-all">{liveOrder.userEmail || currentUser?.email || 'mjjayan2007@gmail.com'}</strong>
                </p>
              </div>
              <button
                onClick={handleDownloadInvoice}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3.5 py-2 rounded-xl text-[10px] tracking-wide cursor-pointer transition-colors flex items-center gap-1 shrink-0"
              >
                <Download size={11} />
                <span>Download PDF</span>
              </button>
            </div>
          </div>

          {/* RIGHT 1 COL: ORDER SUM STRUCTURE & PIN DETAILS */}
          <div className="space-y-6">
            
            {/* DELIVERY SHIPPING ADDRESS PIN */}
            <div className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-3xs space-y-3.5">
              <h4 className="text-xs text-slate-400 font-extrabold uppercase tracking-wider flex items-center gap-1.5">
                <MapPin size={13} className="text-slate-400" />
                <span>Pinned Destination Address</span>
              </h4>

              <div className="text-xs space-y-2 text-slate-600 dark:text-slate-400 leading-relaxed">
                <div>
                  <span className="font-bold text-[9px] text-emerald-800 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full uppercase tracking-wider inline-block">
                    {liveOrder.address.label || 'Home'} Destination
                  </span>
                  <h5 className="font-black text-slate-800 text-sm mt-1">{liveOrder.address.fullName}</h5>
                </div>
                <p className="text-slate-500 leading-normal">{liveOrder.address.street}</p>
                <p className="text-slate-500 leading-normal">
                  {liveOrder.address.city}, {liveOrder.address.state} - {liveOrder.address.pincode}
                </p>
                <div className="text-[11px] font-mono font-bold text-slate-500 flex items-center gap-1.5 border-t border-slate-50 pt-2">
                  <span>Contact Pin: {liveOrder.address.phone}</span>
                </div>
              </div>
            </div>

            {/* EXPANDABLE PURCHASED ITEMS ROW */}
            <div className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-3xs space-y-4">
              <button 
                onClick={() => setItemsExpanded(!itemsExpanded)}
                className="w-full flex justify-between items-center text-left focus:outline-none"
              >
                <h4 className="text-xs text-slate-400 font-extrabold uppercase tracking-wider flex items-center gap-1.5">
                  <ShoppingBag size={13} className="text-slate-400" />
                  <span>Groceries Bag ({liveOrder.items.length} Items)</span>
                </h4>
                {itemsExpanded ? <ChevronUp size={15} className="text-slate-400" /> : <ChevronDown size={15} className="text-slate-400" />}
              </button>

              <AnimatePresence initial={false}>
                {itemsExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden space-y-3"
                  >
                    <div className="border border-slate-100 rounded-2xl divide-y divide-slate-50 overflow-hidden bg-slate-50/20 max-h-56 overflow-y-auto pr-1">
                      {liveOrder.items.map((it) => (
                        <div key={it.id} className="flex justify-between items-center p-3 hover:bg-slate-50/50 transition-colors">
                          <div className="flex items-center gap-2.5">
                            <img
                              src={it.productImage || 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=80&q=80'}
                              alt={it.productName}
                              className="h-10 w-10 object-cover rounded-xl border border-slate-100 shadow-3xs shrink-0"
                              referrerPolicy="no-referrer"
                            />
                            <div>
                              <h5 className="font-bold text-slate-800 text-xs line-clamp-1">{it.productName}</h5>
                              <span className="text-[9px] text-slate-400 font-mono">
                                {it.unit} • £{it.price.toFixed(2)} each
                              </span>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="text-[10px] text-slate-400 font-bold block">x{it.quantity}</span>
                            <span className="text-xs font-mono font-bold text-slate-800 block">
                              £{(it.price * it.quantity).toFixed(2)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* PRICING BREAKDOWN */}
            <div className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-3xs space-y-4">
              <h4 className="text-xs text-slate-400 font-extrabold uppercase tracking-wider">
                Financial Statement Details
              </h4>
              
              <div className="text-xs space-y-2.5 text-slate-500">
                <div className="flex justify-between">
                  <span>Retail Subtotal</span>
                  <span className="font-mono font-semibold text-slate-700">£{liveOrder.subtotal.toFixed(2)}</span>
                </div>

                {liveOrder.discount > 0 && (
                  <div className="flex justify-between text-emerald-600">
                    <span className="flex items-center gap-1">Deducted Coupon: {liveOrder.couponCode ? `[${liveOrder.couponCode}]` : ''}</span>
                    <span className="font-mono font-bold">-£{liveOrder.discount.toFixed(2)}</span>
                  </div>
                )}

                <div className="flex justify-between">
                  <span>Taxes (5% Quick VAT)</span>
                  <span className="font-mono font-semibold text-slate-700">£{liveOrder.tax.toFixed(2)}</span>
                </div>

                <div className="flex justify-between">
                  <span>Eco Dispatch Delivery Fee</span>
                  <span className="font-mono">
                    {liveOrder.deliveryFee === 0 ? (
                      <strong className="text-emerald-700 font-bold uppercase">FREE</strong>
                    ) : (
                      `£${liveOrder.deliveryFee.toFixed(2)}`
                    )}
                  </span>
                </div>

                <div className="border-t border-slate-100 pt-3 mt-3 flex justify-between font-extrabold text-slate-800 text-sm">
                  <span>Grand Total Settled</span>
                  <span className="font-mono text-emerald-700 text-base">£{liveOrder.total.toFixed(2)}</span>
                </div>

                <div className="bg-slate-50 border border-slate-100 rounded-xl p-2.5 text-[10px] text-slate-400 text-center flex items-center justify-center gap-1">
                  <ShieldCheck size={11} className="text-slate-400" />
                  <span>Authorized via {liveOrder.paymentMethod} • Status: {liveOrder.paymentStatus}</span>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* CUSTOMERS ALSO PURCHASED: RECOMMENDED PRODUCTS */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 space-y-6 shadow-3xs">
          <div>
            <span className="text-[10px] bg-emerald-50 text-emerald-700 font-extrabold px-2.5 py-1 rounded-full uppercase tracking-widest inline-block">
              Forgot anything?
            </span>
            <h3 className="font-extrabold text-slate-900 text-md sm:text-lg tracking-tight mt-1.5">Customers Also Purchased</h3>
            <p className="text-xs text-slate-400 font-sans">Grab these morning kitchen essentials in a single eco click. Delivers alongside your current package!</p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {finalRecommendations.map((prod) => (
              <div 
                key={prod.id} 
                className="bg-slate-50 border border-slate-100 rounded-2xl p-3 flex flex-col justify-between hover:border-emerald-300 hover:shadow-3xs transition-all text-xs"
              >
                <div>
                  <img
                    src={prod.image || 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=200&q=80'}
                    alt={prod.name}
                    className="h-24 w-full object-cover rounded-xl border border-slate-150 mb-2.5"
                    referrerPolicy="no-referrer"
                  />
                  <h5 className="font-bold text-slate-800 line-clamp-2 min-h-[2rem]" title={prod.name}>{prod.name}</h5>
                  <span className="text-[10px] text-slate-400 font-mono mt-0.5 block">{prod.unit}</span>
                </div>

                <div className="mt-3 flex items-center justify-between gap-1 pt-2 border-t border-slate-100">
                  <span className="font-black text-slate-800 text-xs sm:text-sm">£{prod.price.toFixed(2)}</span>
                  
                  <button
                    onClick={() => handleQuickAdd(prod.id)}
                    disabled={!!addedItems[prod.id]}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold py-1.5 px-3 rounded-lg hover:shadow-3xs transition-all cursor-pointer disabled:bg-emerald-800 disabled:opacity-80"
                  >
                    {addedItems[prod.id] ? 'Added ✔' : '+ Add'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* HELP AND SUPPORT DIAL CENTER */}
        <div className="bg-gradient-to-tr from-slate-900 to-slate-950 text-white rounded-3xl p-6 sm:p-8 space-y-6 shadow-md">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h4 className="font-extrabold text-white text-md sm:text-lg tracking-tight flex items-center gap-2">
                <HelpCircle className="text-emerald-400" size={20} />
                <span>Need immediate checkout assistance?</span>
              </h4>
              <p className="text-xs text-slate-400 mt-1">Our certified instant organic support companion and dispatch coordinators are online 24/7.</p>
            </div>

            <div className="flex flex-wrap gap-2 shrink-0">
              <a 
                href="mailto:support@nammashop.eco" 
                className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 border border-white/10 transition-colors"
                title="Send official mail"
              >
                <Mail size={12} />
                <span>Email Service</span>
              </a>

              <a 
                href="tel:+442070000000" 
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
                title="Direct voice call link"
              >
                <Phone size={12} />
                <span>Hotline Center</span>
              </a>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-white/10 pt-4 border-t border-white/10 gap-3 text-xs text-slate-400 leading-normal">
            
            <div className="py-2.5 sm:py-0 sm:pr-4 flex gap-2">
              <div className="h-7 w-7 bg-white/5 rounded-lg flex items-center justify-center text-emerald-400 shrink-0 mt-0.5">
                <ShieldCheck size={14} />
              </div>
              <div>
                <h5 className="font-bold text-slate-200">Insurance Enclosed</h5>
                <p className="text-[11px] mt-0.5 text-slate-400">Damaged, crushed, or missing produce are instantly replaced with double value credits.</p>
              </div>
            </div>

            <div className="py-2.5 sm:py-0 sm:px-4 flex gap-2">
              <div className="h-7 w-7 bg-white/5 rounded-lg flex items-center justify-center text-emerald-400 shrink-0 mt-0.5">
                <Clock size={14} />
              </div>
              <div>
                <h5 className="font-bold text-slate-200">10-Minute Target Guarantee</h5>
                <p className="text-[11px] mt-0.5 text-slate-400">If delayed past 15 minutes, claim automatic delivery fee reversal credits.</p>
              </div>
            </div>

            <div className="py-2.5 sm:py-0 sm:pl-4 flex gap-2">
              <div className="h-7 w-7 bg-white/5 rounded-lg flex items-center justify-center text-emerald-400 shrink-0 mt-0.5">
                <MessageSquare size={14} />
              </div>
              <div>
                <h5 className="font-bold text-slate-200">Live AI Assistant Companion</h5>
                <p className="text-[11px] mt-0.5 text-slate-400">Ask the companion to change shipping preferences, add voice notes, or request delivery delays.</p>
              </div>
            </div>

          </div>
        </div>

        {/* BOTTOM ACTION BUTTONS */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-100">
          
          <button
            onClick={onNavigateToProducts}
            className="w-full sm:w-auto px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-2xl transition-all cursor-pointer active:scale-98 flex items-center justify-center gap-1.5"
          >
            <ShoppingBag size={14} />
            <span>Continue Shopping Shelves</span>
          </button>

          <div className="flex flex-col sm:flex-row gap-2.5 w-full sm:w-auto">
            {onNavigateToOrders && (
              <button
                onClick={onNavigateToOrders}
                className="px-5 py-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 text-xs font-bold rounded-2xl transition-all cursor-pointer active:scale-98 flex items-center justify-center gap-1.5"
              >
                <span>View My Orders List</span>
              </button>
            )}

            <button
              onClick={onTrackLiveDispatch}
              className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-6 rounded-2xl text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-sm active:scale-98"
            >
              <Truck size={14} />
              <span>Track Delivery live</span>
              <ArrowRight size={13} className="ml-0.5" />
            </button>
          </div>

        </div>

      </div>
    </div>
  );
}
