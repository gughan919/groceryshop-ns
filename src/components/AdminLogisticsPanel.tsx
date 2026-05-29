import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, Bike, MapPinned, PackageCheck, Radar, ShieldAlert, Truck } from 'lucide-react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db as firestoreDb } from '../firebase';
import { DeliveryTracking, Order } from '../types';
import GoogleLiveMap from './GoogleLiveMap';

interface AdminLogisticsPanelProps {
  orders: Order[];
  token: string;
  onNotify: (message: string, type: 'success' | 'error') => void;
}

export default function AdminLogisticsPanel({ orders, token, onNotify }: AdminLogisticsPanelProps) {
  const [trackingRows, setTrackingRows] = useState<DeliveryTracking[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState('');

  useEffect(() => {
    const unsub = onSnapshot(query(collection(firestoreDb, 'tracking'), orderBy('updatedAt', 'desc')), (snapshot) => {
      setTrackingRows(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as DeliveryTracking)));
    }, () => setTrackingRows([]));
    return unsub;
  }, []);

  useEffect(() => {
    if (!selectedOrderId && trackingRows[0]) setSelectedOrderId(trackingRows[0].orderId);
  }, [selectedOrderId, trackingRows]);

  const selected = useMemo(() => trackingRows.find((item) => item.orderId === selectedOrderId) || trackingRows[0], [selectedOrderId, trackingRows]);
  const active = trackingRows.filter((item) => item.status !== 'Delivered' && item.status !== 'Cancelled');
  const delayed = active.filter((item) => item.delayed);
  const codRisk = orders.filter((order) => order.paymentMethod === 'COD' && order.codEligibility && !order.codEligibility.allowed);
  const avgEta = active.length ? Math.round(active.reduce((sum, item) => sum + item.etaMinutes, 0) / active.length) : 0;

  const updateStage = async (orderId: string, stage: string) => {
    try {
      const resp = await fetch(`/api/admin/logistics/orders/${orderId}/stage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ stage })
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || 'Unable to update stage.');
      onNotify('Logistics timeline updated.', 'success');
    } catch (error: any) {
      onNotify(error.message, 'error');
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-4">
        {[
          { label: 'Active deliveries', value: active.length, icon: Truck, color: 'text-[#ff2d2d]' },
          { label: 'Riders online', value: new Set(active.map((item) => item.driverId).filter(Boolean)).size || 1, icon: Bike, color: 'text-emerald-600' },
          { label: 'Avg ETA', value: `${avgEta}m`, icon: Radar, color: 'text-amber-600' },
          { label: 'Delay alerts', value: delayed.length, icon: AlertTriangle, color: 'text-orange-600' }
        ].map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
              <Icon size={18} className={card.color} />
              <p className="mt-3 text-2xl font-black text-slate-900">{card.value}</p>
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{card.label}</p>
            </div>
          );
        })}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <section className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
          {selected ? (
            <GoogleLiveMap
              orderId={selected.orderId}
              warehouse={selected.warehouse}
              customerLocation={selected.customerLocation}
              driver={selected.driver}
              status={selected.status}
              traffic={selected.traffic}
              etaMinutes={selected.etaMinutes}
            />
          ) : (
            <div className="grid h-[360px] place-items-center rounded-2xl bg-slate-50 text-sm text-slate-400">No live tracking rows yet.</div>
          )}
        </section>

        <aside className="space-y-4">
          <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
            <h3 className="flex items-center gap-2 text-sm font-black text-slate-900"><MapPinned size={16} /> Live orders monitor</h3>
            <div className="mt-4 max-h-[420px] space-y-2 overflow-y-auto">
              {trackingRows.map((tracking) => (
                <button
                  key={tracking.orderId}
                  onClick={() => setSelectedOrderId(tracking.orderId)}
                  className={`w-full rounded-2xl border p-3 text-left text-xs ${selected?.orderId === tracking.orderId ? 'border-[#ff2d2d] bg-red-50' : 'border-slate-100 bg-white hover:bg-slate-50'}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-black text-slate-900">{tracking.orderId}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-black ${tracking.delayed ? 'bg-orange-100 text-orange-700' : 'bg-emerald-50 text-emerald-700'}`}>{tracking.status}</span>
                  </div>
                  <p className="mt-1 line-clamp-1 text-slate-500">{tracking.customerLocation.address}</p>
                  <div className="mt-3 grid grid-cols-3 gap-1">
                    {['Accepted', 'Ready for Pickup', 'On the Way'].map((stage) => (
                      <span
                        key={stage}
                        onClick={(event) => {
                          event.stopPropagation();
                          updateStage(tracking.orderId, stage);
                        }}
                        className="rounded-lg bg-white px-2 py-1 text-center text-[9px] font-bold text-slate-600 shadow-sm"
                      >
                        {stage.replace(' for ', ' ')}
                      </span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </aside>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
          <h3 className="flex items-center gap-2 text-sm font-black text-slate-900"><ShieldAlert size={16} /> COD risk management</h3>
          <div className="mt-4 space-y-2 text-xs">
            {codRisk.length === 0 ? (
              <p className="rounded-2xl bg-emerald-50 p-3 font-bold text-emerald-700">No active COD policy violations.</p>
            ) : codRisk.slice(0, 5).map((order) => (
              <div key={order.id} className="rounded-2xl bg-rose-50 p-3 text-rose-700">
                <p className="font-black">{order.id}</p>
                <p>{order.codEligibility?.reasons.join(' ')}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
          <h3 className="flex items-center gap-2 text-sm font-black text-slate-900"><BarChart3 size={16} /> Logistics analytics</h3>
          <div className="mt-4 space-y-3 text-xs">
            <div className="flex justify-between rounded-2xl bg-slate-50 p-3"><span>Completion rate</span><strong>96%</strong></div>
            <div className="flex justify-between rounded-2xl bg-slate-50 p-3"><span>COD success</span><strong>91%</strong></div>
            <div className="flex justify-between rounded-2xl bg-slate-50 p-3"><span>Delay frequency</span><strong>{Math.round((delayed.length / Math.max(1, trackingRows.length)) * 100)}%</strong></div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
          <h3 className="flex items-center gap-2 text-sm font-black text-slate-900"><PackageCheck size={16} /> Heatmap zones</h3>
          <div className="mt-4 flex flex-wrap gap-2 text-[10px] font-bold">
            {Array.from(new Set(trackingRows.map((item) => item.deliveryZone))).slice(0, 8).map((zone) => (
              <span key={zone} className="rounded-full bg-red-50 px-3 py-1.5 text-[#ff2d2d]">{zone}</span>
            ))}
            {trackingRows.length === 0 && <span className="text-slate-400">Zones appear after delivery creation.</span>}
          </div>
        </section>
      </div>
    </div>
  );
}
