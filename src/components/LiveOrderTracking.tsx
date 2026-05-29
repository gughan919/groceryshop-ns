import React, { useEffect, useMemo, useState } from 'react';
import { Bell, Check, Clock3, FileDown, MessageCircle, Phone, ShieldCheck, Truck, XCircle } from 'lucide-react';
import { collection, doc, onSnapshot, orderBy, query, setDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { db as firestoreDb } from '../firebase';
import { ChatMessage, DeliveryTracking, Order, User } from '../types';
import { DELIVERY_STAGES, fallbackCoordinatesForAddress } from '../utils/logistics';
import GoogleLiveMap from './GoogleLiveMap';
import { generateAndUploadInvoice } from '../utils/invoice';

interface LiveOrderTrackingProps {
  order: Order;
  currentUser?: User | null;
  token?: string | null;
  notifyUser?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export default function LiveOrderTracking({ order, currentUser, token, notifyUser }: LiveOrderTrackingProps) {
  const [tracking, setTracking] = useState<DeliveryTracking | null>((order.delivery as DeliveryTracking) || null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageText, setMessageText] = useState('');
  const [typing, setTyping] = useState(false);
  const [invoiceBusy, setInvoiceBusy] = useState(false);

  useEffect(() => {
    if (!order.id) return;
    const unsub = onSnapshot(doc(firestoreDb, 'tracking', order.id), (snapshot) => {
      if (snapshot.exists()) setTracking(snapshot.data() as DeliveryTracking);
    }, () => {
      setTracking((order.delivery as DeliveryTracking) || null);
    });
    return unsub;
  }, [order.id, order.delivery]);

  useEffect(() => {
    if (!order.id) return;
    const chatRef = collection(firestoreDb, 'messages', order.id, 'items');
    const unsub = onSnapshot(query(chatRef, orderBy('createdAt', 'asc')), (snapshot) => {
      setMessages(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as ChatMessage)));
    }, () => setMessages([]));
    return unsub;
  }, [order.id]);

  const resolvedTracking = useMemo(() => {
    if (tracking) return tracking;
    const customerLocation = order.customerLocation || fallbackCoordinatesForAddress(order.address);
    return {
      id: order.id,
      orderId: order.id,
      userId: order.userId,
      warehouse: order.warehouse!,
      customerLocation,
      status: order.status === 'Delivered' ? 'Delivered' : order.status === 'Out for delivery' ? 'On the Way' : 'Preparing',
      etaMinutes: order.status === 'Delivered' ? 0 : 18,
      etaText: order.status === 'Delivered' ? 'Delivered' : 'Arriving in 18 mins',
      distanceKm: 4.2,
      remainingDistanceKm: 2.8,
      traffic: 'moderate',
      deliveryZone: customerLocation.locality || customerLocation.city,
      delayed: false,
      deliveryOtpRequired: true,
      deliveryOtpVerified: false,
      updatedAt: new Date().toISOString(),
      timeline: []
    } as DeliveryTracking;
  }, [order, tracking]);

  const stageIndex = Math.max(0, DELIVERY_STAGES.indexOf(resolvedTracking.status));
  const etaLabel = resolvedTracking.delayed
    ? resolvedTracking.delayReason || 'Delivery delayed by traffic'
    : resolvedTracking.etaText || `Arriving in ${resolvedTracking.etaMinutes} mins`;

  const sendMessage = async (channel: ChatMessage['channel']) => {
    if (!currentUser || !messageText.trim()) return;
    const text = messageText.trim().slice(0, 800);
    setMessageText('');
    try {
      await addDoc(collection(firestoreDb, 'messages', order.id, 'items'), {
        orderId: order.id,
        channel,
        senderId: currentUser.id,
        senderRole: currentUser.role,
        text,
        createdAt: new Date().toISOString(),
        createdAtServer: serverTimestamp(),
        readBy: [currentUser.id]
      });
      await setDoc(doc(firestoreDb, 'notifications', `${order.id}-${Date.now()}`), {
        orderId: order.id,
        userId: order.userId,
        title: 'New delivery message',
        body: text,
        type: channel,
        read: false,
        createdAt: new Date().toISOString()
      });
    } catch {
      notifyUser?.('Unable to send chat message. Check Firestore permissions.', 'error');
    }
  };

  const downloadInvoice = async () => {
    if (!token) return notifyUser?.('Please sign in to download invoice.', 'error');
    setInvoiceBusy(true);
    try {
      if (order.invoiceUrl) {
        window.open(order.invoiceUrl, '_blank');
      } else {
        const url = await generateAndUploadInvoice(order, token);
        if (url) window.open(url, '_blank');
      }
    } finally {
      setInvoiceBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">
        <GoogleLiveMap
          orderId={order.id}
          warehouse={resolvedTracking.warehouse}
          customerLocation={resolvedTracking.customerLocation}
          driver={resolvedTracking.driver}
          status={resolvedTracking.status}
          traffic={resolvedTracking.traffic}
          etaMinutes={resolvedTracking.etaMinutes}
          className="rounded-none border-0"
        />
        <div className="grid gap-3 p-4 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Live status</p>
            <h3 className="text-xl font-black tracking-tight text-slate-900">{etaLabel}</h3>
            <p className="mt-1 text-xs text-slate-500">
              {resolvedTracking.remainingDistanceKm.toFixed(1)} km away in {resolvedTracking.deliveryZone}
            </p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-3 text-xs">
            <p className="font-black text-slate-800">Delivery OTP</p>
            <p className="mt-1 font-mono text-lg font-black text-[#ff2d2d]">
              {resolvedTracking.deliveryOtpVerified ? 'VERIFIED' : resolvedTracking.deliveryOtpMasked || 'Sent by SMS'}
            </p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-3 text-xs">
            <p className="font-black text-slate-800">Cancellation</p>
            <p className="mt-1 font-bold text-slate-500">{order.cancellationStatus || (order.status === 'Cancelled' ? 'cancelled' : 'none')}</p>
          </div>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-black text-slate-900">Rapid delivery timeline</h3>
              <p className="text-xs text-slate-400">Synced across customer, admin, and delivery partner views.</p>
            </div>
            <span className="rounded-full bg-red-50 px-3 py-1 text-[10px] font-black text-[#ff2d2d]">{resolvedTracking.traffic} traffic</span>
          </div>
          <div className="relative space-y-5 pl-7 before:absolute before:left-[10px] before:top-2 before:h-[calc(100%-18px)] before:w-0.5 before:bg-slate-100">
            {DELIVERY_STAGES.map((stage, index) => {
              const done = index <= stageIndex;
              const item = resolvedTracking.timeline.find((entry) => entry.status === stage);
              return (
                <div key={stage} className="relative">
                  <span className={`absolute -left-7 top-0 grid h-5 w-5 place-items-center rounded-full border-2 border-white ${done ? 'bg-[#ff2d2d] text-white' : 'bg-slate-200 text-slate-400'}`}>
                    {done ? <Check size={12} /> : <Clock3 size={11} />}
                  </span>
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <p className={`text-xs font-black ${done ? 'text-slate-900' : 'text-slate-400'}`}>{stage}</p>
                    <p className="text-[10px] font-bold text-slate-400">
                      {item?.actualTime ? new Date(item.actualTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : item?.predictedTime ? `ETA ${new Date(item.predictedTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Waiting'}
                    </p>
                  </div>
                  <p className="mt-1 text-[11px] leading-5 text-slate-500">{item?.note || (done ? `${stage} completed.` : `${stage} will update automatically.`)}</p>
                </div>
              );
            })}
          </div>
        </section>

        <aside className="space-y-5">
          <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-black text-slate-900">Delivery partner</h3>
            <div className="mt-4 flex items-center gap-3">
              <img
                src={resolvedTracking.driver?.profilePhoto || 'https://api.dicebear.com/7.x/personas/svg?seed=NammaRider'}
                className="h-14 w-14 rounded-2xl border border-slate-100 bg-slate-50"
                alt=""
              />
              <div className="min-w-0 flex-1">
                <p className="font-black text-slate-900">{resolvedTracking.driver?.name || 'Rider assigning soon'}</p>
                <p className="text-[11px] text-slate-500">{resolvedTracking.driver?.vehicleType || 'scooter'} {resolvedTracking.driver?.vehicleNumber || 'NMA-FAST'}</p>
                <p className="text-[11px] font-bold text-amber-500">Rating {resolvedTracking.driver?.rating || 4.8}</p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <a href={`tel:${resolvedTracking.driver?.phone || order.address.phone}`} className="inline-flex items-center justify-center gap-1 rounded-2xl bg-[#ff2d2d] px-3 py-2 text-xs font-bold text-white">
                <Phone size={13} /> Call
              </a>
              <button onClick={() => setTyping(true)} className="inline-flex items-center justify-center gap-1 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700">
                <MessageCircle size={13} /> Chat
              </button>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-900">Order tools</h3>
              <ShieldCheck size={18} className="text-emerald-600" />
            </div>
            <div className="mt-4 grid gap-2 text-xs">
              <button onClick={downloadInvoice} disabled={invoiceBusy} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-3 py-2.5 font-bold text-white disabled:opacity-60">
                <FileDown size={14} /> {invoiceBusy ? 'Preparing invoice' : 'Download invoice'}
              </button>
              <a href="mailto:support@nammashop.com" className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 px-3 py-2.5 font-bold text-slate-700">
                <Bell size={14} /> Store support
              </a>
            </div>
            <p className="mt-3 text-[11px] leading-5 text-slate-500">
              Instructions: {order.deliveryInstructions || 'Leave at door if unavailable. Call before arrival.'}
            </p>
          </section>
        </aside>
      </div>

      <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-black text-slate-900">In-app delivery chat</h3>
            <p className="text-xs text-slate-400">Customer, rider, admin, and store support channels.</p>
          </div>
          {typing && <span className="text-[10px] font-bold text-emerald-600">Support is typing...</span>}
        </div>
        <div className="mt-4 max-h-56 space-y-2 overflow-y-auto rounded-2xl bg-slate-50 p-3">
          {messages.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-400">No messages yet. Send a note to your rider or support.</p>
          ) : messages.map((message) => (
            <div key={message.id} className={`max-w-[82%] rounded-2xl px-3 py-2 text-xs ${message.senderId === currentUser?.id ? 'ml-auto bg-[#ff2d2d] text-white' : 'bg-white text-slate-700'}`}>
              <p>{message.text}</p>
              <span className="mt-1 block text-[9px] opacity-70">{message.createdAt ? new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Now'}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
          <input
            value={messageText}
            onChange={(event) => setMessageText(event.target.value)}
            onFocus={() => setTyping(true)}
            onBlur={() => setTyping(false)}
            placeholder="Type delivery instructions or support message"
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs outline-none focus:border-[#ff2d2d]"
          />
          <button onClick={() => sendMessage('customer_driver')} className="rounded-2xl bg-[#ff2d2d] px-4 py-3 text-xs font-bold text-white">Rider</button>
          <button onClick={() => sendMessage('customer_admin')} className="rounded-2xl bg-slate-900 px-4 py-3 text-xs font-bold text-white">Admin</button>
          <button onClick={() => sendMessage('customer_store')} className="rounded-2xl border border-slate-200 px-4 py-3 text-xs font-bold text-slate-700">Store</button>
        </div>
      </section>

      {order.status === 'Cancelled' && (
        <div className="flex gap-2 rounded-2xl border border-rose-100 bg-rose-50 p-4 text-xs text-rose-700">
          <XCircle size={16} />
          <span>This order has been cancelled. Tracking updates are closed.</span>
        </div>
      )}
    </div>
  );
}
