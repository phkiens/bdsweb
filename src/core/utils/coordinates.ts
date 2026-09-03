export const COORD_DELTA = 0.000005; // ~1 mét dung sai trên mặt đất

/**
 * Kiểm tra xem tọa độ có nằm trong phạm vi lãnh thổ Việt Nam hay không
 */
export function isInVietnam(lat: number, lng: number): boolean {
  return lat >= 8.0 && lat <= 24.0 && lng >= 102.0 && lng <= 110.0;
}

/**
 * Trích xuất tọa độ địa lý Việt Nam từ một chuỗi văn bản tự do
 */
export function parseVietnamCoordinates(text: string): [number, number] | null {
  if (!text) return null;

  // Pattern tìm cặp tọa độ: lat (8..24), lng (102..110)
  const regex = /(?:^|[^\d.])([8-9]|1\d|2[0-4])(?:\.\d+)[,\s]+(10[2-9]|110)(?:\.\d+)(?:$|[^\d.])/;
  const match = text.match(regex);
  if (match) {
    const raw = match[0].trim().replace(/^[^\d.]+/, "").replace(/[^\d.]+$/, "");
    const parts = raw.split(/[,\s]+/);
    if (parts.length >= 2) {
      const lat = parseFloat(parts[0]);
      const lng = parseFloat(parts[1]);
      if (!isNaN(lat) && !isNaN(lng) && isInVietnam(lat, lng)) {
        return [lat, lng];
      }
    }
  }

  // Thử match theo @lat,lng thường gặp trong Google Maps URL
  const atMatch = text.match(/@([8-9]|1\d|2[0-4])\.\d+,(10[2-9]|110)\.\d+/);
  if (atMatch) {
    const coordsStr = atMatch[0].substring(1);
    const [latStr, lngStr] = coordsStr.split(",");
    const lat = parseFloat(latStr);
    const lng = parseFloat(lngStr);
    if (!isNaN(lat) && !isNaN(lng) && isInVietnam(lat, lng)) {
      return [lat, lng];
    }
  }

  return null;
}

/**
 * Trích xuất URL Google Maps nếu có trong văn bản
 */
export function extractMapLinkUrl(text: string): string | null {
  if (!text) return null;
  const mapRegex = /(https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps|www\.google\.com\/maps|maps\.google\.com)[^\s"'<>]+)/i;
  const match = text.match(mapRegex);
  return match ? match[1] : null;
}

/**
 * Tính khoảng cách đường chim bay giữa 2 tọa độ theo công thức Haversine (km)
 */
export function calculateDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Bán kính Trái Đất (km)
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
