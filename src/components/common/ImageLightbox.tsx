import React, { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, ExternalLink, X, ZoomIn, ZoomOut } from "lucide-react";
import {
  ZoomState,
  IDENTITY_ZOOM,
  DOUBLE_TAP_ZOOM,
  clampPan,
  zoomAt
} from "../../core/utils/zoom-pan";

export interface LightboxItem {
  url: string;
  isVideo: boolean;
  fileName?: string;
}

interface ImageLightboxProps {
  items: LightboxItem[];
  startIndex: number;
  onClose: () => void;
}

const SWIPE_THRESHOLD = 60;
const TAP_SLOP = 8;
const DOUBLE_TAP_MS = 300;

/**
 * Trình xem ảnh/video toàn màn hình ngay trong trang (không cần mở tab mới):
 * vuốt/phím ← → để chuyển ảnh, chụm 2 ngón / lăn chuột / chạm đúp để phóng to,
 * kéo để di chuyển khi đang phóng to, Esc để đóng.
 */
export const ImageLightbox: React.FC<ImageLightboxProps> = ({ items, startIndex, onClose }) => {
  const [index, setIndex] = useState(startIndex);
  const [zoom, setZoom] = useState<ZoomState>(IDENTITY_ZOOM);
  const [dragging, setDragging] = useState(false);
  const [swipeDx, setSwipeDx] = useState(0);

  const viewRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const zoomRef = useRef<ZoomState>(IDENTITY_ZOOM);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef({
    startX: 0,
    startY: 0,
    startZoom: IDENTITY_ZOOM,
    pinchDist: 0,
    pinchMid: { x: 0, y: 0 },
    pinched: false,
    moved: false,
    downOnImage: false,
    lastTap: { time: 0, x: 0, y: 0 }
  });

  const count = items.length;
  const current = items[index];

  const applyZoom = useCallback((next: ZoomState) => {
    const img = imgRef.current;
    const view = viewRef.current;
    const clamped =
      img && view
        ? clampPan(next, img.offsetWidth, img.offsetHeight, view.clientWidth, view.clientHeight)
        : next;
    zoomRef.current = clamped;
    setZoom(clamped);
  }, []);

  const goTo = useCallback(
    (next: number) => {
      if (count <= 1) return;
      setIndex((next + count) % count);
      zoomRef.current = IDENTITY_ZOOM;
      setZoom(IDENTITY_ZOOM);
    },
    [count]
  );

  // Toạ độ so với tâm khung xem
  const relPoint = (clientX: number, clientY: number) => {
    const rect = viewRef.current!.getBoundingClientRect();
    return { x: clientX - rect.left - rect.width / 2, y: clientY - rect.top - rect.height / 2 };
  };

  const zoomBy = (factor: number) => applyZoom(zoomAt(zoomRef.current, zoomRef.current.scale * factor, 0, 0));

  // Phím tắt + khoá cuộn trang khi đang mở
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") goTo(index - 1);
      else if (e.key === "ArrowRight") goTo(index + 1);
      else if (e.key === "+" || e.key === "=") zoomBy(1.5);
      else if (e.key === "-") zoomBy(1 / 1.5);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Lăn chuột để phóng to quanh con trỏ (cần listener non-passive để chặn cuộn trang)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const onWheel = (e: WheelEvent) => {
      if (current?.isVideo) return;
      e.preventDefault();
      const p = relPoint(e.clientX, e.clientY);
      applyZoom(zoomAt(zoomRef.current, zoomRef.current.scale * Math.exp(-e.deltaY * 0.002), p.x, p.y));
    };
    view.addEventListener("wheel", onWheel, { passive: false });
    return () => view.removeEventListener("wheel", onWheel);
  }, [applyZoom, current?.isVideo]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (current?.isVideo || (e.target as HTMLElement).closest("button,a")) return;
    // Ghi nhận trước khi capture: sau setPointerCapture, target của pointerup luôn là khung xem
    if (pointers.current.size === 0) gesture.current.downOnImage = e.target === imgRef.current;
    viewRef.current!.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    g.startZoom = zoomRef.current;

    if (pointers.current.size === 1) {
      g.startX = e.clientX;
      g.startY = e.clientY;
      g.moved = false;
      g.pinched = false;
      setDragging(true);
    } else if (pointers.current.size === 2) {
      const [a, b] = Array.from(pointers.current.values());
      g.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      g.pinchMid = relPoint((a.x + b.x) / 2, (a.y + b.y) / 2);
      g.pinched = true;
      g.moved = true;
      setSwipeDx(0);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;

    if (pointers.current.size >= 2) {
      const [a, b] = Array.from(pointers.current.values());
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = relPoint((a.x + b.x) / 2, (a.y + b.y) / 2);
      const zoomed = zoomAt(g.startZoom, (g.startZoom.scale * dist) / (g.pinchDist || 1), g.pinchMid.x, g.pinchMid.y);
      applyZoom({ ...zoomed, x: zoomed.x + mid.x - g.pinchMid.x, y: zoomed.y + mid.y - g.pinchMid.y });
      return;
    }

    if (g.pinched) return;
    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;
    if (Math.abs(dx) + Math.abs(dy) > TAP_SLOP) g.moved = true;

    if (g.startZoom.scale > 1) {
      applyZoom({ scale: g.startZoom.scale, x: g.startZoom.x + dx, y: g.startZoom.y + dy });
    } else if (count > 1) {
      setSwipeDx(dx);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size > 0) return;

    const g = gesture.current;
    setDragging(false);
    setSwipeDx(0);

    if (g.pinched) {
      if (zoomRef.current.scale < 1.05) applyZoom(IDENTITY_ZOOM);
      return;
    }

    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;

    if (g.startZoom.scale <= 1 && Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
      goTo(dx < 0 ? index + 1 : index - 1);
      return;
    }
    if (g.moved) return;

    // Chạm: đúp vào ảnh để phóng to/thu về; chạm ra nền đen để đóng
    const onImage = g.downOnImage;
    const now = Date.now();
    const last = g.lastTap;
    if (onImage && now - last.time < DOUBLE_TAP_MS && Math.hypot(e.clientX - last.x, e.clientY - last.y) < 30) {
      g.lastTap = { time: 0, x: 0, y: 0 };
      const p = relPoint(e.clientX, e.clientY);
      applyZoom(zoomRef.current.scale > 1 ? IDENTITY_ZOOM : zoomAt(zoomRef.current, DOUBLE_TAP_ZOOM, p.x, p.y));
      return;
    }
    g.lastTap = { time: now, x: e.clientX, y: e.clientY };
    if (!onImage && zoomRef.current.scale <= 1) onClose();
  };

  if (!current) return null;

  const toolbarBtn =
    "p-2 rounded-full bg-white/10 hover:bg-white/25 text-white transition-colors disabled:opacity-30";

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col select-none animate-in fade-in" role="dialog" aria-modal="true">
      {/* Thanh công cụ */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 text-white shrink-0">
        <span className="text-sm font-semibold tabular-nums">
          {count > 1 ? `${index + 1} / ${count}` : ""}
        </span>
        <div className="flex items-center gap-1.5">
          {!current.isVideo && (
            <>
              <button type="button" onClick={() => zoomBy(1 / 1.5)} disabled={zoom.scale <= 1} className={toolbarBtn} title="Thu nhỏ" aria-label="Thu nhỏ">
                <ZoomOut className="w-4 h-4" />
              </button>
              <button type="button" onClick={() => zoomBy(1.5)} disabled={zoom.scale >= 5} className={toolbarBtn} title="Phóng to" aria-label="Phóng to">
                <ZoomIn className="w-4 h-4" />
              </button>
            </>
          )}
          <a href={current.url} download={current.fileName} className={toolbarBtn} title="Tải về máy" aria-label="Tải về máy">
            <Download className="w-4 h-4" />
          </a>
          <a href={current.url} target="_blank" rel="noopener noreferrer" className={toolbarBtn} title="Mở tab mới" aria-label="Mở tab mới">
            <ExternalLink className="w-4 h-4" />
          </a>
          <button type="button" onClick={onClose} className={toolbarBtn} title="Đóng (Esc)" aria-label="Đóng">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Khung xem */}
      <div
        ref={viewRef}
        className="relative flex-1 min-h-0 overflow-hidden flex items-center justify-center"
        style={{ touchAction: current.isVideo ? "auto" : "none" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {current.isVideo ? (
          <video key={current.url} src={current.url} controls autoPlay playsInline className="max-w-full max-h-full bg-black" />
        ) : (
          <img
            key={current.url}
            ref={imgRef}
            src={current.url}
            alt={`Ảnh ${index + 1}`}
            draggable={false}
            className="max-w-full max-h-full object-contain will-change-transform"
            style={{
              transform: `translate(${zoom.x + swipeDx}px, ${zoom.y}px) scale(${zoom.scale})`,
              transition: dragging ? "none" : "transform 150ms ease-out",
              cursor: zoom.scale > 1 ? (dragging ? "grabbing" : "grab") : "zoom-in"
            }}
          />
        )}

        {count > 1 && (
          <>
            <button
              type="button"
              onClick={() => goTo(index - 1)}
              className="absolute left-2 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-black/50 hover:bg-black/80 text-white"
              title="Ảnh trước"
              aria-label="Ảnh trước"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <button
              type="button"
              onClick={() => goTo(index + 1)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-black/50 hover:bg-black/80 text-white"
              title="Ảnh sau"
              aria-label="Ảnh sau"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          </>
        )}
      </div>
    </div>
  );
};
