import { Property } from "../models/property";
import { calculateDistanceKm, isInVietnam } from "../utils/coordinates";

export type MarkerColorType = "blue" | "orange" | "gps";

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

