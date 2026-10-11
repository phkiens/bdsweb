import { Property } from "../models/property";
import { calculateDistanceKm, isInVietnam } from "../utils/coordinates";

export type MarkerColorType = "blue" | "orange" | "gps" | "red";

export const ROUTE_NEARBY_DEFAULT_RADIUS_KM = 1.0;
export const NORMAL_NEARBY_DEFAULT_RADIUS_KM = 5.0;

export const ROUTE_RADII_OPTIONS: { val: number; label: string }[] = [
  { val: 0.5, label: "500 m" },
  { val: 1.0, label: "1 km" },
  { val: 2.0, label: "2 km" },
  { val: 5.0, label: "5 km" }
];

export const NORMAL_RADII_OPTIONS: { val: number | null; label: string }[] = [
  { val: 1.0, label: "1 km" },
  { val: 2.0, label: "2 km" },
  { val: 5.0, label: "5 km" },
  { val: 10.0, label: "10 km" },
  { val: null, label: "Tất cả" }
];

export function formatRadiusLabel(radiusKm: number | null): string {
  if (radiusKm == null) return "Tất cả";
  if (radiusKm < 1.0) return `${Math.round(radiusKm * 1000)} m`;
  return `${Math.round(radiusKm)} km`;
}

export function formatRadiusButtonText(radiusKm: number | null): string {
  if (radiusKm == null) return "Tất cả";
  if (radiusKm < 1.0) return `${Math.round(radiusKm * 1000)}m`;
  return `${Math.round(radiusKm)}km`;
}

export function getPropertyKey(p: { id: string; isVerified?: boolean }): string {
  return (p.isVerified ? "official_" : "unverified_") + p.id;
}

export function computeRouteCandidateProperties(
  properties: Property[],
  routeKeys: string[],
  selectedKeys: string[]
): Property[] {
  const byKey = new Map<string, Property>();
  properties.forEach((p) => {
    if (p.latitude != null && p.longitude != null) {
      byKey.set("official_" + p.id, p);
      byKey.set("unverified_" + p.id, p);
      byKey.set(p.id, p);
    }
  });

  const displayedKeys = Array.from(
    new Set([...routeKeys, ...selectedKeys.filter((k) => !routeKeys.includes(k))])
  );

  return displayedKeys
    .map((k) => byKey.get(k))
    .filter((p): p is Property => p !== undefined && p.latitude != null && p.longitude != null);
}

export function computeRouteNearbyProperties(
  allProperties: Property[],
  routeCandidates: Property[],
  center: { latitude: number; longitude: number } | null,
  radiusKm: number | null = ROUTE_NEARBY_DEFAULT_RADIUS_KM
): MapPropertyItem[] {
  if (!center || center.latitude == null || center.longitude == null) {
    return [];
  }

  const maxRadius = radiusKm ?? ROUTE_NEARBY_DEFAULT_RADIUS_KM;
  const routeKeySet = new Set<string>();
  routeCandidates.forEach((p) => {
    routeKeySet.add(p.id);
    routeKeySet.add("official_" + p.id);
    routeKeySet.add("unverified_" + p.id);
  });

  const candidates: MapPropertyItem[] = [];

  allProperties.forEach((p) => {
    if (p.isDeleted) return;
    if (p.latitude == null || p.longitude == null) return;
    const key = getPropertyKey(p);
    if (routeKeySet.has(key) || routeKeySet.has(p.id)) return;

    const dist = calculateDistanceKm(
      center.latitude,
      center.longitude,
      p.latitude,
      p.longitude
    );
    if (dist <= maxRadius) {
      candidates.push({
        ...p,
        distanceKm: dist
      });
    }
  });

  return candidates.sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
}

export function combineRouteAndNearbyProperties(
  routeCandidates: Property[],
  nearbyItems: MapPropertyItem[],
  gps: { latitude: number; longitude: number } | null = null
): MapPropertyItem[] {
  const routeWithGpsDist: MapPropertyItem[] = routeCandidates.map((p) => {
    let distanceKm: number | null = null;
    if (gps && p.latitude != null && p.longitude != null) {
      distanceKm = calculateDistanceKm(gps.latitude, gps.longitude, p.latitude, p.longitude);
    }
    return {
      ...p,
      distanceKm
    };
  });

  return [...routeWithGpsDist, ...nearbyItems];
}

export function toggleRouteSelection(
  currentSelectedKeys: string[],
  property: { id: string; isVerified?: boolean }
): string[] {
  const key = getPropertyKey(property);
  if (currentSelectedKeys.includes(key) || currentSelectedKeys.includes(property.id)) {
    return currentSelectedKeys.filter((k) => k !== key && k !== property.id);
  } else {
    return [...currentSelectedKeys, key];
  }
}

export interface MapScanCenter {
  type: "GPS" | "PROPERTY" | "MAP_POINT";
  latitude: number;
  longitude: number;
  propertyId?: string;
  label?: string;
}

export interface MapPropertyItem extends Property {
  distanceKm?: number | null;
}

export function getMarkerColorType(p: Property): "blue" | "orange" {
  return p.isVerified ? "blue" : "orange";
}

export function filterMapProperties(
  properties: Property[],
  scanCenter: MapScanCenter | null,
  radiusKm: number | null,
  viewTodayOnly: boolean = false
): MapPropertyItem[] {
  // 1. Chỉ giữ các BĐS có tọa độ hợp lệ trong lãnh thổ Việt Nam
  const validProps = properties.filter((p) => {
    if (p.isDeleted) return false;
    if (p.latitude == null || p.longitude == null) return false;
    if (!isInVietnam(p.latitude, p.longitude)) return false;
    if (viewTodayOnly && !p.needToViewToday) return false;
    return true;
  });

  // 2. Tính khoảng cách từ tâm quét (nếu có)
  const itemsWithDistance: MapPropertyItem[] = validProps.map((p) => {
    let distanceKm: number | null = null;
    if (scanCenter != null) {
      distanceKm = calculateDistanceKm(
        scanCenter.latitude,
        scanCenter.longitude,
        p.latitude!,
        p.longitude!
      );
    }
    return {
      ...p,
      distanceKm
    };
  });

  // 3. Lọc theo bán kính nếu có cấu hình
  const filtered =
    scanCenter != null && radiusKm != null
      ? itemsWithDistance.filter(
          (item) => item.distanceKm != null && item.distanceKm <= radiusKm
        )
      : itemsWithDistance;

  // 4. Nếu có tâm quét, sắp xếp tăng dần theo khoảng cách (gần nhất lên đầu)
  if (scanCenter != null) {
    return filtered.sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
  }

  return filtered;
}

