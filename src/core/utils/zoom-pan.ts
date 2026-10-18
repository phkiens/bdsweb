// Toán zoom/kéo cho trình xem ảnh phóng to (ImageLightbox).
// Toạ độ tính theo tâm khung xem; transform áp dụng: translate(x, y) scale(scale).

export interface ZoomState {
  scale: number;
  x: number;
  y: number;
}

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 5;
export const DOUBLE_TAP_ZOOM = 2.5;

export const IDENTITY_ZOOM: ZoomState = { scale: 1, x: 0, y: 0 };

/** Giới hạn kéo để ảnh không trôi ra khỏi khung (ảnh nhỏ hơn khung thì giữ giữa). */
export function clampPan(
  state: ZoomState,
  imgW: number,
  imgH: number,
  viewW: number,
  viewH: number
): ZoomState {
  const maxX = Math.max(0, (imgW * state.scale - viewW) / 2);
  const maxY = Math.max(0, (imgH * state.scale - viewH) / 2);
  return {
    scale: state.scale,
    x: Math.min(maxX, Math.max(-maxX, state.x)),
    y: Math.min(maxY, Math.max(-maxY, state.y))
  };
}

/**
 * Phóng to/thu nhỏ quanh điểm (px, py) — điểm đó đứng yên trên màn hình.
 * px, py tính từ tâm khung xem.
 */
export function zoomAt(state: ZoomState, nextScale: number, px: number, py: number): ZoomState {
  const scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextScale));
  if (scale === MIN_ZOOM) return IDENTITY_ZOOM;
  const ratio = scale / state.scale;
  return {
    scale,
    x: px - (px - state.x) * ratio,
    y: py - (py - state.y) * ratio
  };
}
