/**
 * Hiệu ứng "Tâm điểm" (Live Spotlight): thẻ càng xa giữa màn hình càng nhỏ + tối.
 * Chuẩn 100% Native Android LiveSpotlight.kt.
 */
export const LiveSpotlight = {
  MIN_SCALE_DROP: 0.10, // thẻ ở mép: scale 0.90
  MAX_ALPHA_DROP: 0.45, // thẻ ở mép: alpha 0.55
  CENTER_ZONE: 0.25,    // 25% nửa khung quanh tâm: sáng hẳn

  /** 0 = ở vùng giữa khung (sáng/to nhất), 1 = ở mép hoặc ngoài khung. */
  distanceFactor(itemOffset: number, itemSize: number, viewportStart: number, viewportEnd: number): number {
    const half = (viewportEnd - viewportStart) / 2;
    if (half <= 0) return 0;
    const center = viewportStart + half;
    const itemCenter = itemOffset + itemSize / 2;
    const dist = Math.abs(itemCenter - center) / half; // 0..(>1)
    const factor = (dist - LiveSpotlight.CENTER_ZONE) / (1 - LiveSpotlight.CENTER_ZONE);
    return Math.min(1, Math.max(0, factor));
  },

  calculateScale(distanceFactor: number): number {
    return 1 - LiveSpotlight.MIN_SCALE_DROP * distanceFactor;
  },

  calculateAlpha(distanceFactor: number): number {
    return 1 - LiveSpotlight.MAX_ALPHA_DROP * distanceFactor;
  }
};
