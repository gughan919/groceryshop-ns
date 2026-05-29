import React, { useEffect, useMemo, useRef, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { Navigation, Route, Zap } from 'lucide-react';
import { CustomerLocation, DeliveryPartner, TrafficLevel, WarehouseLocation } from '../types';
import { db as firestoreDb } from '../firebase';
import { calculateHeading, decodePolyline, findClosestRoutePointIndex, GOOGLE_MAPS_API_KEY, WAREHOUSE_LOCATION, haversineDistanceKm } from '../utils/logistics';

declare global {
  interface Window {
    google?: any;
    __nammaGoogleMapsPromise?: Promise<any>;
  }
}

function loadGoogleMaps() {
  if (window.google?.maps) return Promise.resolve(window.google);
  if (window.__nammaGoogleMapsPromise) return window.__nammaGoogleMapsPromise;
  window.__nammaGoogleMapsPromise = new Promise((resolve, reject) => {
    const mapsKey = (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY || GOOGLE_MAPS_API_KEY;
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(mapsKey)}&libraries=places,geometry&v=weekly`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(window.google);
    script.onerror = () => reject(new Error('Google Maps failed to load.'));
    document.head.appendChild(script);
  });
  return window.__nammaGoogleMapsPromise;
}

function interpolatePoint(from: { lat: number; lng: number }, to: { lat: number; lng: number }, progress: number) {
  return {
    lat: from.lat + (to.lat - from.lat) * progress,
    lng: from.lng + (to.lng - from.lng) * progress
  };
}

function toLatLng(point: { latitude: number; longitude: number }) {
  return { lat: point.latitude, lng: point.longitude };
}

function makeBikerIcon(google: any, heading = 0) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
    <g transform="rotate(${heading.toFixed(1)} 32 32)">
      <circle cx="32" cy="32" r="25" fill="#ff2d2d" stroke="white" stroke-width="5"/>
      <path d="M32 8l8 18h-5v14h-6V26h-5z" fill="white"/>
      <path d="M18 39h7l4-11h8l5 11h-5l-2-5h-5l-2 5H18z" fill="white"/>
      <circle cx="23" cy="43" r="5" fill="#111827" stroke="white" stroke-width="2"/>
      <circle cx="43" cy="43" r="5" fill="#111827" stroke="white" stroke-width="2"/>
    </g>
  </svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(48, 48),
    anchor: new google.maps.Point(24, 24)
  };
}

interface GoogleLiveMapProps {
  orderId?: string;
  warehouse?: WarehouseLocation;
  customerLocation?: CustomerLocation;
  driver?: DeliveryPartner;
  status?: string;
  traffic?: TrafficLevel;
  etaMinutes?: number;
  className?: string;
}

export default function GoogleLiveMap({
  orderId,
  warehouse = WAREHOUSE_LOCATION,
  customerLocation,
  driver,
  status,
  traffic = 'light',
  etaMinutes = 15,
  className = ''
}: GoogleLiveMapProps) {
  const mapNodeRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const routeRef = useRef<any>(null);
  const directionsRef = useRef<any>(null);
  const driverMarkerRef = useRef<any>(null);
  const customerMarkerRef = useRef<any>(null);
  const warehouseMarkerRef = useRef<any>(null);
  const animationFrameRef = useRef<number | null>(null);
  const routeDebounceRef = useRef<number | null>(null);
  const lastRouteKeyRef = useRef('');
  const routePointsRef = useRef<Array<{ lat: number; lng: number }>>([]);
  const routeGeoPointsRef = useRef<Array<{ latitude: number; longitude: number }>>([]);
  const routeIndexRef = useRef(0);
  const rerouteAnchorRef = useRef<{ lat: number; lng: number } | null>(null);
  const [liveGps, setLiveGps] = useState<{ latitude: number; longitude: number; heading?: number; speed?: number; timestamp?: string } | null>(null);
  const [routeMetrics, setRouteMetrics] = useState<{ distanceText: string; durationText: string; currentRoad: string }>({
    distanceText: '',
    durationText: '',
    currentRoad: ''
  });
  const [loadError, setLoadError] = useState('');

  const fallbackCustomer = useMemo(() => customerLocation || {
    latitude: warehouse.latitude + 0.035,
    longitude: warehouse.longitude + 0.025,
    address: 'Customer delivery pin',
    city: 'London',
    state: 'Greater London',
    pincode: 'W1'
  }, [customerLocation, warehouse.latitude, warehouse.longitude]);

  useEffect(() => {
    if (!orderId) return;
    const unsub = onSnapshot(doc(firestoreDb, 'liveTracking', orderId), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as any;
        if (Number.isFinite(data.latitude) && Number.isFinite(data.longitude)) {
          setLiveGps({
            latitude: Number(data.latitude),
            longitude: Number(data.longitude),
            heading: Number.isFinite(data.heading) ? Number(data.heading) : undefined,
            speed: Number.isFinite(data.speed) ? Number(data.speed) : undefined,
            timestamp: data.timestamp
          });
        }
      }
    }, () => {});
    return unsub;
  }, [orderId]);

  const driverPoint = useMemo(() => {
    if (liveGps) {
      return { lat: liveGps.latitude, lng: liveGps.longitude };
    }
    if (driver?.liveLatitude && driver?.liveLongitude) {
      return { lat: driver.liveLatitude, lng: driver.liveLongitude };
    }
    const distance = haversineDistanceKm(warehouse, fallbackCustomer);
    const progress = status === 'Arriving Soon' ? 0.85 : status === 'On the Way' ? 0.55 : status === 'Picked Up' ? 0.25 : 0.08;
    const adjusted = Math.min(0.92, Math.max(0.04, progress + ((Date.now() / 10000) % 0.08)));
    const point = interpolatePoint(
      { lat: warehouse.latitude, lng: warehouse.longitude },
      { lat: fallbackCustomer.latitude, lng: fallbackCustomer.longitude },
      adjusted
    );
    return distance < 0.1 ? { lat: warehouse.latitude + 0.005, lng: warehouse.longitude + 0.005 } : point;
  }, [driver, fallbackCustomer, liveGps, status, warehouse]);

  useEffect(() => {
    let mounted = true;
    loadGoogleMaps()
      .then((google) => {
        if (!mounted || !mapNodeRef.current) return;
        const center = {
          lat: (warehouse.latitude + fallbackCustomer.latitude) / 2,
          lng: (warehouse.longitude + fallbackCustomer.longitude) / 2
        };
        if (!mapRef.current) {
          mapRef.current = new google.maps.Map(mapNodeRef.current, {
            center,
            zoom: 13,
            disableDefaultUI: true,
            clickableIcons: false,
            gestureHandling: 'greedy',
            styles: [
              { featureType: 'poi', stylers: [{ visibility: 'off' }] },
              { featureType: 'transit', stylers: [{ saturation: -40 }] },
              { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#f3f4f6' }] },
              { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#ffe2e2' }] },
              { featureType: 'water', stylers: [{ color: '#dbeafe' }] }
            ]
          });
          directionsRef.current = new google.maps.DirectionsRenderer({
            map: mapRef.current,
            suppressMarkers: true,
            preserveViewport: true,
            polylineOptions: {
              strokeColor: traffic === 'heavy' || traffic === 'severe' ? '#f97316' : '#ff2d2d',
              strokeOpacity: 0.9,
              strokeWeight: 5
            }
          });
          routeRef.current = new google.maps.DirectionsService();
          warehouseMarkerRef.current = new google.maps.Marker({
            map: mapRef.current,
            position: { lat: warehouse.latitude, lng: warehouse.longitude },
            title: 'NammaShop warehouse',
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale: 9,
              fillColor: '#111827',
              fillOpacity: 1,
              strokeColor: '#ffffff',
              strokeWeight: 3
            }
          });
          customerMarkerRef.current = new google.maps.Marker({
            map: mapRef.current,
            position: { lat: fallbackCustomer.latitude, lng: fallbackCustomer.longitude },
            title: 'Delivery address',
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale: 10,
              fillColor: '#10b981',
              fillOpacity: 1,
              strokeColor: '#ffffff',
              strokeWeight: 3
            }
          });
          driverMarkerRef.current = new google.maps.Marker({
            map: mapRef.current,
            position: driverPoint,
            title: 'Delivery partner',
            optimized: false,
            icon: makeBikerIcon(google, liveGps?.heading || 0)
          });
        }

        const bounds = new google.maps.LatLngBounds();
        bounds.extend({ lat: warehouse.latitude, lng: warehouse.longitude });
        bounds.extend({ lat: fallbackCustomer.latitude, lng: fallbackCustomer.longitude });
        bounds.extend(driverPoint);
        mapRef.current.fitBounds(bounds, 64);

        const routeOrigin = rerouteAnchorRef.current || { lat: warehouse.latitude, lng: warehouse.longitude };
        const routeKey = [
          routeOrigin.lat.toFixed(5),
          routeOrigin.lng.toFixed(5),
          fallbackCustomer.latitude.toFixed(5),
          fallbackCustomer.longitude.toFixed(5),
          traffic
        ].join('|');
        if (routeDebounceRef.current) window.clearTimeout(routeDebounceRef.current);
        routeDebounceRef.current = window.setTimeout(() => {
          if (lastRouteKeyRef.current === routeKey || !routeRef.current) return;
          lastRouteKeyRef.current = routeKey;
          routeRef.current.route({
          origin: routeOrigin,
          destination: { lat: fallbackCustomer.latitude, lng: fallbackCustomer.longitude },
          travelMode: google.maps.TravelMode.DRIVING,
          provideRouteAlternatives: true,
          drivingOptions: {
            departureTime: new Date(),
            trafficModel: google.maps.TrafficModel.BEST_GUESS
          }
        }, (result: any, routeStatus: string) => {
          if (routeStatus === 'OK') {
            directionsRef.current.setDirections(result);
            const route = result.routes?.[0];
            const encoded = route?.overview_polyline || '';
            const decoded = encoded ? decodePolyline(encoded) : [];
            const overviewPath = Array.isArray(route?.overview_path)
              ? route.overview_path.map((point: any) => ({ latitude: point.lat(), longitude: point.lng() }))
              : [];
            const routeGeo = decoded.length > 1 ? decoded : overviewPath;
            routeGeoPointsRef.current = routeGeo;
            routePointsRef.current = routeGeo.map(toLatLng);
            routeIndexRef.current = findClosestRoutePointIndex(routeGeo, {
              latitude: driverPoint.lat,
              longitude: driverPoint.lng
            });
            const leg = route?.legs?.[0];
            setRouteMetrics({
              distanceText: leg?.distance?.text || '',
              durationText: leg?.duration_in_traffic?.text || leg?.duration?.text || '',
              currentRoad: leg?.steps?.[Math.min(1, Math.max(0, leg.steps.length - 1))]?.instructions?.replace(/<[^>]+>/g, '') || route?.summary || ''
            });
          }
        });
        }, 350);
      })
      .catch((error) => setLoadError(error.message || 'Map unavailable.'));
    return () => {
      mounted = false;
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (routeDebounceRef.current) window.clearTimeout(routeDebounceRef.current);
    };
  }, [fallbackCustomer, liveGps?.heading, traffic, warehouse, driverPoint]);

  useEffect(() => {
    if (!driverMarkerRef.current || !window.google?.maps) return;
    const marker = driverMarkerRef.current;
    const current = marker.getPosition();
    if (!current) {
      marker.setPosition(driverPoint);
      return;
    }
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    const google = window.google;
    const start = { lat: current.lat(), lng: current.lng() };
    const routeGeo = routeGeoPointsRef.current;
    const routePoints = routePointsRef.current;
    let path = [start, driverPoint];
    if (routeGeo.length > 1 && routePoints.length > 1) {
      const targetIndex = findClosestRoutePointIndex(routeGeo, {
        latitude: driverPoint.lat,
        longitude: driverPoint.lng
      });
      const currentIndex = findClosestRoutePointIndex(routeGeo, {
        latitude: start.lat,
        longitude: start.lng
      });
      const from = Math.min(currentIndex, targetIndex);
      const to = Math.max(currentIndex, targetIndex);
      const forwardSegment = routePoints.slice(from, to + 1);
      const orderedSegment = currentIndex <= targetIndex ? forwardSegment : forwardSegment.reverse();
      path = [start, ...orderedSegment, driverPoint].filter((point, index, list) => {
        const previous = list[index - 1];
        return !previous || Math.abs(previous.lat - point.lat) > 0.000001 || Math.abs(previous.lng - point.lng) > 0.000001;
      });
      routeIndexRef.current = targetIndex;

      const deviationKm = haversineDistanceKm(
        { latitude: driverPoint.lat, longitude: driverPoint.lng },
        routeGeo[targetIndex]
      );
      if (deviationKm > 0.25) {
        rerouteAnchorRef.current = driverPoint;
        lastRouteKeyRef.current = '';
      }
    }

    const segmentDistances = path.map((point, index) => {
      if (index === 0) return 0;
      return haversineDistanceKm(
        { latitude: path[index - 1].lat, longitude: path[index - 1].lng },
        { latitude: point.lat, longitude: point.lng }
      );
    });
    const totalDistance = segmentDistances.reduce((sum, value) => sum + value, 0);
    const durationMs = Math.max(750, Math.min(4500, (totalDistance / Math.max(8, liveGps?.speed || 18)) * 3_600_000));
    const startedAt = performance.now();
    const animate = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / durationMs);
      const eased = 1 - (1 - progress) ** 3;
      const targetDistance = totalDistance * eased;
      let covered = 0;
      let nextPoint = path[path.length - 1];
      let previousPoint = path[0];
      for (let index = 1; index < path.length; index += 1) {
        const segmentDistance = segmentDistances[index];
        if (covered + segmentDistance >= targetDistance) {
          previousPoint = path[index - 1];
          nextPoint = path[index];
          const segmentProgress = segmentDistance === 0 ? 1 : (targetDistance - covered) / segmentDistance;
          const position = interpolatePoint(previousPoint, nextPoint, Math.max(0, Math.min(1, segmentProgress)));
          const heading = liveGps?.heading ?? calculateHeading(
            { latitude: previousPoint.lat, longitude: previousPoint.lng },
            { latitude: nextPoint.lat, longitude: nextPoint.lng }
          );
          marker.setPosition(position);
          marker.setIcon(makeBikerIcon(google, heading));
          break;
        }
        covered += segmentDistance;
      }
      if (progress < 1) animationFrameRef.current = requestAnimationFrame(animate);
    };
    animationFrameRef.current = requestAnimationFrame(animate);
  }, [driverPoint, liveGps?.heading, liveGps?.speed]);

  const distanceKm = haversineDistanceKm(warehouse, fallbackCustomer);

  return (
    <div className={`relative overflow-hidden rounded-2xl border border-slate-100 bg-slate-100 ${className}`}>
      <div ref={mapNodeRef} className="h-[360px] min-h-[300px] w-full sm:h-[430px]" />
      {loadError && (
        <div className="absolute inset-0 grid place-items-center bg-slate-100 text-center text-xs text-slate-500">
          <div>
            <Navigation className="mx-auto mb-2 text-[#ff2d2d]" size={24} />
            <p className="font-bold text-slate-800">Live map fallback active</p>
            <p>{loadError}</p>
          </div>
        </div>
      )}
      <div className="absolute left-3 right-3 top-3 grid grid-cols-3 gap-2 text-[10px] font-bold">
        <div className="rounded-xl bg-white/95 px-3 py-2 shadow-sm backdrop-blur">
          <span className="block text-slate-400">ETA</span>
          <strong className="text-[#ff2d2d]">{routeMetrics.durationText || `${etaMinutes} mins`}</strong>
        </div>
        <div className="rounded-xl bg-white/95 px-3 py-2 shadow-sm backdrop-blur">
          <span className="block text-slate-400">Distance</span>
          <strong>{routeMetrics.distanceText || `${distanceKm.toFixed(1)} km`}</strong>
        </div>
        <div className="rounded-xl bg-white/95 px-3 py-2 shadow-sm backdrop-blur">
          <span className="block text-slate-400">Traffic</span>
          <strong className={traffic === 'heavy' || traffic === 'severe' ? 'text-orange-600' : 'text-emerald-600'}>{traffic}</strong>
        </div>
      </div>
      <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-3 rounded-2xl bg-white/95 px-4 py-3 text-xs shadow-sm backdrop-blur">
        <div className="min-w-0">
          <p className="font-black text-slate-900">Live delivery route</p>
          <p className="truncate text-[11px] text-slate-500">{routeMetrics.currentRoad || fallbackCustomer.address}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1 rounded-full bg-red-50 px-3 py-1.5 font-bold text-[#ff2d2d]">
          <Zap size={12} />
          <span>{status || 'Tracking'}</span>
        </div>
      </div>
    </div>
  );
}
