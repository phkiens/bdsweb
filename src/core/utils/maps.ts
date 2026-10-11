/**
 * Helper định dạng URL và tọa độ Google Maps (chuẩn Android MapsIntentHelper)
 */

export function buildLocationUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

export function buildCoordinateText(lat: number, lng: number): string {
  return `${lat},${lng}`;
}

export function isValidDisplayCoordinate(lat?: number | null, lng?: number | null): boolean {
  if (lat == null || lng == null) return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat === 0 && lng === 0) return false;
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}
