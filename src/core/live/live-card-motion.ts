/**
 * FastOutSlowIn cubic bezier easing (Android standard CubicBezierEasing(0.4f, 0.0f, 0.2f, 1.0f)).
 * Giải chính xác x(t) = progress để lấy t, sau đó tính y(t).
 */
export function fastOutSlowInEasing(x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  // Cubic bezier with P0=(0,0), P1=(0.4, 0.0), P2=(0.2, 1.0), P3=(1,1)
  // x(t) = 3*(1-t)^2 * t * 0.4 + 3*(1-t) * t^2 * 0.2 + t^3
  // y(t) = 3*(1-t)^2 * t * 0.0 + 3*(1-t) * t^2 * 1.0 + t^3
  let t = x;
  for (let i = 0; i < 8; i++) {
    const currentX = 3 * (1 - t) * (1 - t) * t * 0.4 + 3 * (1 - t) * t * t * 0.2 + t * t * t;
    const dx = 3 * (1 - t) * (1 - t) * 0.4 + 6 * (1 - t) * t * (0.2 - 0.4) + 3 * t * t * (1 - 0.2);
    if (Math.abs(currentX - x) < 1e-5 || Math.abs(dx) < 1e-5) break;
    t -= (currentX - x) / dx;
    t = Math.min(1, Math.max(0, t));
  }
  return 3 * (1 - t) * t * t * 1.0 + t * t * t;
}

/**
 * Hàm nội suy giá đếm từ startPrice về targetPrice theo progress [0..1].
 * Thuần túy, test được, khớp 100% logic đếm giá của Android PropertyCard.kt.
 */
export function interpolatePrice(startPrice: number, targetPrice: number, progress: number): number {
  if (progress <= 0) return startPrice;
  if (progress >= 1) return targetPrice;
  const eased = fastOutSlowInEasing(progress);
  return startPrice + (targetPrice - startPrice) * eased;
}

/**
 * Lệch nhịp chuyển động thẻ theo hash id: (id.hashCode() and 0x7fffffff) % 2500 ms (chuẩn Android).
 */
export function computeLivePhaseMs(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (Math.imul(31, hash) + id.charCodeAt(i)) | 0;
  }
  const positive = hash & 0x7fffffff;
  return positive % 2500;
}
