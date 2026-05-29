import { Address, CodEligibility, CustomerLocation, DeliveryStage, DeliveryTimelineEntry, GeoPoint, TrafficLevel, WarehouseLocation } from '../types';

export const GOOGLE_MAPS_API_KEY = 'AIzaSyDbEt9Pv4TenLt7LD3tS0pXdAQsYo7_DJs';

export const WAREHOUSE_LOCATION: WarehouseLocation = {
  latitude: 51.515419,
  longitude: -0.141099,
  address: 'NammaShop Rapid Grocery Warehouse, Oxford Street, London W1D 2LT',
  zone: 'Central London',
  pincode: 'W1D2LT'
};

export const DELIVERY_STAGES: DeliveryStage[] = [
  'Order Placed',
  'Accepted',
  'Preparing',
  'Ready for Pickup',
  'Picked Up',
  'On the Way',
  'Arriving Soon',
  'Delivered'
];

export const STAGE_TO_ORDER_STATUS: Record<DeliveryStage, 'Pending' | 'Packed' | 'Shipped' | 'Out for delivery' | 'Delivered' | 'Cancelled'> = {
  'Order Placed': 'Pending',
  Accepted: 'Pending',
  Preparing: 'Packed',
  'Ready for Pickup': 'Packed',
  'Picked Up': 'Shipped',
  'On the Way': 'Out for delivery',
  'Arriving Soon': 'Out for delivery',
  Delivered: 'Delivered',
  Cancelled: 'Cancelled'
};

export const COD_LIMITS = {
  minOrderValue: 500,
  maxOrderValue: 5000,
  radiusKm: 25,
  preferredRadiusKm: 15,
  blacklistedPincodes: ['560100', '560105', '999999', '000000'],
  remotePincodes: ['560099', '562130', '562125'],
  highRtoPincodes: ['560091', '560107', '562123']
};

export function addressToText(address: Address) {
  return [
    address.house,
    address.street,
    address.locality,
    address.city,
    address.state,
    address.pincode,
    address.country
  ].filter(Boolean).join(', ');
}

export function normalizePincode(value?: string) {
  return String(value || '').toUpperCase().replace(/\s+/g, '');
}

export function haversineDistanceKm(a: GeoPoint, b: GeoPoint) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function decodePolyline(encoded: string): GeoPoint[] {
  const points: GeoPoint[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);

    points.push({
      latitude: lat / 1e5,
      longitude: lng / 1e5
    });
  }

  return points;
}

export function calculateHeading(from: GeoPoint, to: GeoPoint) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const toDeg = (value: number) => (value * 180) / Math.PI;
  const lat1 = toRad(from.latitude);
  const lat2 = toRad(to.latitude);
  const dLng = toRad(to.longitude - from.longitude);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export function findClosestRoutePointIndex(route: GeoPoint[], point: GeoPoint) {
  if (route.length === 0) return 0;
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  route.forEach((routePoint, index) => {
    const distance = haversineDistanceKm(routePoint, point);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });
  return bestIndex;
}

export function fallbackCoordinatesForAddress(address: Address): CustomerLocation {
  const pin = normalizePincode(address.pincode || address.postalCode);
  const seed = Array.from(`${address.street}${address.city}${pin}`).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const radius = 0.035 + (seed % 70) / 1000;
  const angle = (seed % 360) * (Math.PI / 180);
  return {
    address: addressToText(address),
    latitude: Number((WAREHOUSE_LOCATION.latitude + Math.cos(angle) * radius).toFixed(6)),
    longitude: Number((WAREHOUSE_LOCATION.longitude + Math.sin(angle) * radius).toFixed(6)),
    pincode: address.pincode || address.postalCode || '',
    locality: address.locality || address.street.split(',').slice(-1)[0]?.trim(),
    city: address.city,
    state: address.state
  };
}

export function estimateTraffic(distanceKm: number, date = new Date()): TrafficLevel {
  const hour = date.getHours();
  if ((hour >= 8 && hour <= 10) || (hour >= 17 && hour <= 20)) {
    return distanceKm > 8 ? 'heavy' : 'moderate';
  }
  if (distanceKm > 18) return 'moderate';
  return 'light';
}

export function calculateEtaMinutes(options: {
  distanceKm: number;
  traffic: TrafficLevel;
  itemCount: number;
  deliverySlot?: string;
  driverAvailable?: boolean;
}) {
  const trafficMultiplier: Record<TrafficLevel, number> = {
    light: 1,
    moderate: 1.25,
    heavy: 1.6,
    severe: 2.1
  };
  const prep = Math.min(18, 6 + options.itemCount * 1.2);
  const travel = (options.distanceKm / 22) * 60 * trafficMultiplier[options.traffic];
  const slotBuffer = options.deliverySlot === 'scheduled' ? 45 : options.deliverySlot === 'evening' ? 25 : 0;
  const availabilityBuffer = options.driverAvailable === false ? 8 : 0;
  return Math.max(8, Math.round(prep + travel + slotBuffer + availabilityBuffer));
}

export function buildTimeline(createdAt: string, stage: DeliveryStage, distanceKm: number, traffic: TrafficLevel, deliveryZone: string): DeliveryTimelineEntry[] {
  const created = new Date(createdAt).getTime();
  const activeIndex = Math.max(0, DELIVERY_STAGES.indexOf(stage));
  return DELIVERY_STAGES.map((status, index) => {
    const predicted = new Date(created + (index * 5 + 2) * 60_000).toISOString();
    const reached = index <= activeIndex;
    return {
      status,
      timestamp: reached ? new Date(created + index * 4 * 60_000).toISOString() : '',
      predictedTime: predicted,
      actualTime: reached ? new Date(created + index * 4 * 60_000).toISOString() : undefined,
      distance: Number(Math.max(0, distanceKm - index * (distanceKm / DELIVERY_STAGES.length)).toFixed(2)),
      traffic,
      deliveryZone,
      note: reached ? `${status} synced in realtime.` : `Expected ${status.toLowerCase()}.`
    };
  });
}

export function evaluateCodEligibility(params: {
  total: number;
  distanceKm: number;
  pincode?: string;
  repeatedCancellations?: number;
  suspicious?: boolean;
  phoneVerified?: boolean;
}): CodEligibility {
  const pincode = normalizePincode(params.pincode);
  const reasons: string[] = [];
  let pincodeRisk: CodEligibility['pincodeRisk'] = 'ok';

  if (params.distanceKm > COD_LIMITS.radiusKm) reasons.push(`COD is available only within ${COD_LIMITS.radiusKm} km.`);
  if (params.total < COD_LIMITS.minOrderValue) reasons.push(`COD minimum order value is ₹${COD_LIMITS.minOrderValue}.`);
  if (params.total > COD_LIMITS.maxOrderValue) reasons.push(`COD maximum order value is ₹${COD_LIMITS.maxOrderValue}.`);
  if (COD_LIMITS.blacklistedPincodes.includes(pincode)) {
    pincodeRisk = 'blacklisted';
    reasons.push('COD is blocked for this pincode.');
  } else if (COD_LIMITS.remotePincodes.includes(pincode)) {
    pincodeRisk = 'remote';
    reasons.push('COD is unavailable for remote delivery areas.');
  } else if (COD_LIMITS.highRtoPincodes.includes(pincode)) {
    pincodeRisk = 'high_rto';
    reasons.push('COD is unavailable for high-return-risk pincodes.');
  }
  if ((params.repeatedCancellations || 0) >= 3) reasons.push('COD blocked due to repeated cancellations.');
  if (params.suspicious) reasons.push('COD blocked by fraud prevention checks.');
  if (!params.phoneVerified) reasons.push('Verify phone OTP before placing COD orders.');

  const fraudScore = Math.min(100, (params.repeatedCancellations || 0) * 20 + (params.suspicious ? 40 : 0) + (pincodeRisk === 'ok' ? 0 : 25));
  return {
    allowed: reasons.length === 0,
    reasons,
    distanceKm: Number(params.distanceKm.toFixed(2)),
    minOrderValue: COD_LIMITS.minOrderValue,
    maxOrderValue: COD_LIMITS.maxOrderValue,
    radiusKm: COD_LIMITS.radiusKm,
    pincodeRisk,
    otpRequired: true,
    fraudScore
  };
}
