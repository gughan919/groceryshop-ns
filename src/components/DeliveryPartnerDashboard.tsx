import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, IndianRupee, KeyRound, MapPinned, Navigation, PackageCheck, Phone, Route } from 'lucide-react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db as firestoreDb } from '../firebase';
import { DeliveryTracking, User } from '../types';
import GoogleLiveMap from './GoogleLiveMap';

interface DeliveryPartnerDashboardProps {
  currentUser: User | null;
  token: string | null;
  notifyUser: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export default function DeliveryPartnerDashboard({ currentUser, token, notifyUser }: DeliveryPartnerDashboardProps) {
  const [deliveries, setDeliveries] = useState<DeliveryTracking[]>([]);
  const [activeId, setActiveId] = useState<string>('');
  const [otp, setOtp] = useState('');
  const [autoGpsEnabled, setAutoGpsEnabled] = useState(false);
  const lastGpsRef = useRef<{ latitude: number; longitude: number; timestamp: number } | null>(null);
  const gpsTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(query(collection(firestoreDb, 'tracking'), orderBy('updatedAt', 'desc')), (snapshot) => {
      const rows = snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as DeliveryTracking));
      setDeliveries(rows.filter((item) => item.status !== 'Delivered' && item.status !== 'Cancelled'));
    }, () => setDeliveries([]));
    return unsub;
  }, []);

  useEffect(() => {
    if (!activeId && deliveries[0]) setActiveId(deliveries[0].orderId);
  }, [activeId, deliveries]);

  const active = useMemo(() => deliveries.find((item) => item.orderId === activeId) || deliveries[0], [activeId, deliveries]);
  const assigned = deliveries.filter((item) => !item.driverId || item.driverId === currentUser?.id);

  const callApi = async (path: string, body: Record<string, unknown>, options: { quiet?: boolean } = {}) => {
    if (!token) return notifyUser('Delivery partner login required.', 'error');
    const resp = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body)
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error || 'Delivery action failed.');
    if (!options.quiet) notifyUser(data.message || 'Delivery updated.', 'success');
    return data;
  };

  const acceptDelivery = async (orderId: string) => {
    try {
      await callApi(`/api/delivery/orders/${orderId}/accept`, {});
    } catch (error: any) {
      notifyUser(error.message, 'error');
    }
  };

  const updateLocation = async () => {
    if (!active || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(async (position) => {
      try {
        const lastGps = lastGpsRef.current;
        const now = Date.now();
        const speedKmh = Number.isFinite(position.coords.speed)
          ? Number(((position.coords.speed || 0) * 3.6).toFixed(2))
          : lastGps
            ? Number((Math.hypot(position.coords.latitude - lastGps.latitude, position.coords.longitude - lastGps.longitude) * 111 / Math.max(1, (now - lastGps.timestamp) / 3_600_000)).toFixed(2))
            : 18;
        lastGpsRef.current = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          timestamp: now
        };
        await callApi(`/api/delivery/orders/${active.orderId}/location`, {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          heading: Number.isFinite(position.coords.heading) ? position.coords.heading : undefined,
          speed: speedKmh,
          accuracy: position.coords.accuracy
        });
      } catch (error: any) {
        notifyUser(error.message, 'error');
      }
    }, () => notifyUser('GPS permission is required for live rider tracking.', 'error'));
  };

  useEffect(() => {
    if (!autoGpsEnabled || !active || !navigator.geolocation) return;
    const publish = () => {
      navigator.geolocation.getCurrentPosition(async (position) => {
        const lastGps = lastGpsRef.current;
        const now = Date.now();
        const speedKmh = Number.isFinite(position.coords.speed)
          ? Number(((position.coords.speed || 0) * 3.6).toFixed(2))
          : lastGps
            ? Number((Math.hypot(position.coords.latitude - lastGps.latitude, position.coords.longitude - lastGps.longitude) * 111 / Math.max(1, (now - lastGps.timestamp) / 3_600_000)).toFixed(2))
            : 18;
        lastGpsRef.current = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          timestamp: now
        };
        try {
          await callApi(`/api/delivery/orders/${active.orderId}/location`, {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            heading: Number.isFinite(position.coords.heading) ? position.coords.heading : undefined,
            speed: speedKmh,
            accuracy: position.coords.accuracy
          }, { quiet: true });
        } catch {
          setAutoGpsEnabled(false);
        }
      }, () => setAutoGpsEnabled(false), { enableHighAccuracy: true, maximumAge: 2500, timeout: 5000 });
    };
    publish();
    gpsTimerRef.current = window.setInterval(publish, 3500);
    return () => {
      if (gpsTimerRef.current) window.clearInterval(gpsTimerRef.current);
      gpsTimerRef.current = null;
    };
  }, [active?.orderId, autoGpsEnabled, token]);

  const verifyOtp = async () => {
    if (!active || otp.trim().length < 4) return notifyUser('Enter customer delivery OTP.', 'error');
    try {
      await callApi(`/api/delivery/orders/${active.orderId}/verify-otp`, { otp: otp.trim() });
      setOtp('');
    } catch (error: any) {
      notifyUser(error.message, 'error');
    }
  };

  const navUrl = active
    ? `https://www.google.com/maps/dir/?api=1&origin=${active.driver?.liveLatitude || active.warehouse.latitude},${active.driver?.liveLongitude || active.warehouse.longitude}&destination=${active.customerLocation.latitude},${active.customerLocation.longitude}&travelmode=driving`
    : '#';

  return (
    <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
      <aside className="space-y-4 rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
        <div>
          <p className="text-[10px] font-black uppercase tracking-wider text-[#ff2d2d]">Delivery partner app</p>
          <h2 className="text-xl font-black text-slate-900">Active queue</h2>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-[10px] font-bold">
          <div className="rounded-2xl bg-slate-50 p-3">
            <PackageCheck className="mx-auto mb-1 text-[#ff2d2d]" size={16} />
            {assigned.length} active
          </div>
          <div className="rounded-2xl bg-slate-50 p-3">
            <IndianRupee className="mx-auto mb-1 text-emerald-600" size={16} />
            ₹{assigned.length * 42}
          </div>
          <div className="rounded-2xl bg-slate-50 p-3">
            <CheckCircle2 className="mx-auto mb-1 text-amber-500" size={16} />
            4.8
          </div>
        </div>
        <div className="space-y-2">
          {assigned.length === 0 ? (
            <p className="rounded-2xl bg-slate-50 p-5 text-center text-xs text-slate-400">No delivery queue assigned.</p>
          ) : assigned.map((delivery) => (
            <button
              key={delivery.orderId}
              onClick={() => setActiveId(delivery.orderId)}
              className={`w-full rounded-2xl border p-3 text-left text-xs transition ${active?.orderId === delivery.orderId ? 'border-[#ff2d2d] bg-red-50' : 'border-slate-100 bg-white hover:bg-slate-50'}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-black text-slate-900">{delivery.orderId}</span>
                <span className="rounded-full bg-white px-2 py-0.5 text-[9px] font-black text-[#ff2d2d]">{delivery.status}</span>
              </div>
              <p className="mt-1 line-clamp-2 text-[11px] text-slate-500">{delivery.customerLocation.address}</p>
              <p className="mt-2 font-bold text-slate-700">{delivery.remainingDistanceKm.toFixed(1)} km • {delivery.etaMinutes} mins</p>
            </button>
          ))}
        </div>
      </aside>

      <main className="space-y-5">
        {!active ? (
          <div className="rounded-3xl border border-slate-100 bg-white p-10 text-center text-sm text-slate-400">Waiting for dispatch orders.</div>
        ) : (
          <>
            <GoogleLiveMap
              orderId={active.orderId}
              warehouse={active.warehouse}
              customerLocation={active.customerLocation}
              driver={active.driver}
              status={active.status}
              traffic={active.traffic}
              etaMinutes={active.etaMinutes}
            />

            <section className="grid gap-4 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm md:grid-cols-5">
              <button onClick={() => acceptDelivery(active.orderId)} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#ff2d2d] px-4 py-3 text-xs font-bold text-white">
                <CheckCircle2 size={15} /> Accept
              </button>
              <button onClick={updateLocation} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-xs font-bold text-white">
                <MapPinned size={15} /> Send GPS
              </button>
              <button onClick={() => setAutoGpsEnabled(value => !value)} className={`inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-xs font-bold ${autoGpsEnabled ? 'bg-emerald-600 text-white' : 'bg-white text-slate-700 border border-slate-200'}`}>
                <MapPinned size={15} /> {autoGpsEnabled ? 'Live GPS On' : 'Auto GPS'}
              </button>
              <a href={navUrl} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-xs font-bold text-slate-700">
                <Navigation size={15} /> Navigate
              </a>
              <a href={`tel:${active.customerLocation.pincode}`} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-xs font-bold text-slate-700">
                <Phone size={15} /> Customer
              </a>
            </section>

            <section className="grid gap-5 lg:grid-cols-2">
              <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
                <h3 className="flex items-center gap-2 text-sm font-black text-slate-900"><Route size={16} /> Multi-order route queue</h3>
                <div className="mt-4 space-y-2 text-xs">
                  {assigned.slice(0, 4).map((delivery, index) => (
                    <div key={delivery.orderId} className="flex items-center justify-between rounded-2xl bg-slate-50 p-3">
                      <span className="font-bold text-slate-700">{index + 1}. {delivery.deliveryZone}</span>
                      <span className="text-slate-400">{delivery.etaMinutes} mins</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
                <h3 className="flex items-center gap-2 text-sm font-black text-slate-900"><KeyRound size={16} /> Delivery OTP verification</h3>
                <div className="mt-4 flex gap-2">
                  <input value={otp} onChange={(event) => setOtp(event.target.value)} placeholder="Enter customer OTP" className="min-w-0 flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-xs outline-none focus:border-[#ff2d2d]" />
                  <button onClick={verifyOtp} className="rounded-2xl bg-[#ff2d2d] px-4 py-3 text-xs font-bold text-white">Verify</button>
                </div>
                <p className="mt-3 text-[11px] leading-5 text-slate-500">Orders can be marked delivered only after the customer OTP is verified by the server.</p>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
