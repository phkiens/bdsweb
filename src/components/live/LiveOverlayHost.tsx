import React, { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import { useLivestream } from "../../core/live/use-livestream";
import { liveEventBus } from "../../core/live/live-event-bus";
import { liveNoticeBus, MediaRestoredNotice } from "../../core/live/live-notice-bus";
import { LiveOverlayState } from "../../core/live/live-overlay-state";
import { LiveEvent, LiveEventType } from "../../core/live/live-event";
import { LiveEventStyle } from "../../core/live/live-event-style";
import { formatPropertyPrice } from "../../core/utils/property-price";

interface LiveOverlayHostProps {
  onOpenProperty?: (propertyId: string) => void;
  resetOnStart?: boolean;
}

/**
 * Lớp phủ live trên mọi màn hình (chuẩn Native Android LiveOverlayHost.kt).
 * Banner sự kiện (vị trí top, thời gian hiện 6s, countdown bar, sweep shine, xếp hàng/backlog tối đa 3, bấm mở căn).
 * Tự động reset trạng thái khi vừa bật live: sự kiện cũ không hiện.
 */
export const LiveOverlayHost: React.FC<LiveOverlayHostProps> = ({
  onOpenProperty,
  resetOnStart = true,
}) => {
  const { isLive } = useLivestream();
  const navigate = useNavigate();

  const [history, setHistory] = useState<readonly LiveEvent[]>(() => liveEventBus.history);
  const [restored, setRestored] = useState<MediaRestoredNotice | null>(() => liveNoticeBus.mediaRestored);
  const [lastShownSeq, setLastShownSeq] = useState<number>(() => LiveOverlayState.lastShownSeq);
  const [restoredAck, setRestoredAck] = useState<number>(() => LiveOverlayState.restoredAck);

  // Drag up tracking
  const [dragY, setDragY] = useState(0);
  const startYRef = useRef<number | null>(null);

  // Subscribe to buses and state
  useEffect(() => {
    const unsubHistory = liveEventBus.subscribe((h) => setHistory(h));
    const unsubNotice = liveNoticeBus.subscribe((n) => setRestored(n));
    const unsubState = LiveOverlayState.subscribe(() => {
      setLastShownSeq(LiveOverlayState.lastShownSeq);
      setRestoredAck(LiveOverlayState.restoredAck);
    });

    return () => {
      unsubHistory();
      unsubNotice();
      unsubState();
    };
  }, []);

  // Reset overlay state when livestream turns on
  const prevLiveRef = useRef<boolean>(false);
  useEffect(() => {
    if (isLive && !prevLiveRef.current && resetOnStart) {
      LiveOverlayState.reset();
      setLastShownSeq(LiveOverlayState.lastShownSeq);
      setRestoredAck(LiveOverlayState.restoredAck);
    }
    prevLiveRef.current = isLive;
  }, [isLive, resetOnStart]);

  // Backlog and queue calculation matching Android (không live ⇒ không có gì để hiện)
  const pending0 = isLive ? history.filter((it) => (it.seq ?? 0) > lastShownSeq) : [];
  const floor =
    pending0.length > LiveEventStyle.MAX_BACKLOG
      ? (pending0[pending0.length - LiveEventStyle.MAX_BACKLOG - 1].seq ?? lastShownSeq)
      : lastShownSeq;
  const pending = pending0.filter((it) => (it.seq ?? 0) > floor);
  const current = pending[0] || null;

  const showRestored = isLive && current == null && restored != null && restored.seq > restoredAck;

  // Auto-hide timer for event banner
  useEffect(() => {
    if (current && current.seq) {
      const seq = current.seq;
      const timer = window.setTimeout(() => {
        LiveOverlayState.lastShownSeq = seq;
        setLastShownSeq(seq);
      }, LiveEventStyle.BANNER_MS);
      return () => window.clearTimeout(timer);
    }
  }, [current?.seq]);

  // Auto-hide timer for restored banner
  useEffect(() => {
    if (showRestored && restored) {
      const seq = restored.seq;
      const timer = window.setTimeout(() => {
        LiveOverlayState.restoredAck = seq;
        setRestoredAck(seq);
      }, LiveEventStyle.BANNER_MS);
      return () => window.clearTimeout(timer);
    }
  }, [showRestored, restored?.seq]);

  if (!current && !showRestored) return null;

  const handleDismissCurrent = () => {
    if (current && current.seq) {
      LiveOverlayState.lastShownSeq = current.seq;
      setLastShownSeq(current.seq);
    } else if (showRestored && restored) {
      LiveOverlayState.restoredAck = restored.seq;
      setRestoredAck(restored.seq);
    }
    setDragY(0);
  };

  const handleOpenProperty = () => {
    if (current) {
      const propId = current.propertyId || current.after.id;
      if (onOpenProperty) {
        onOpenProperty(propId);
      } else {
        navigate(`/properties/${propId}`);
      }
      handleDismissCurrent();
    } else if (showRestored && restored) {
      handleDismissCurrent();
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    startYRef.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (startYRef.current == null) return;
    const dy = e.touches[0].clientY - startYRef.current;
    if (dy < 0) {
      setDragY(dy);
    }
  };

  const handleTouchEnd = () => {
    if (dragY < -40) {
      handleDismissCurrent();
    }
    setDragY(0);
    startYRef.current = null;
  };

  if (current) {
    const text = LiveEventStyle.text(current);
    const color = LiveEventStyle.color(current.type);
    const emoji = LiveEventStyle.emoji(current.type);

    const isPriceChange =
      (current.type === LiveEventType.PRICE_DROP || current.type === LiveEventType.PRICE_RISE) &&
      current.before != null &&
      current.before.price > 0.0;
    const pLabel = LiveEventStyle.percentLabel(current);

    return (
      <div
        data-testid="live_overlay_host"
        className="fixed top-3 sm:top-5 left-1/2 z-50 w-[calc(100%-1.5rem)] max-w-[520px] pointer-events-auto transition-transform"
        style={{ transform: `translate(-50%, ${dragY}px)` }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div
          data-testid="live_banner"
          onClick={handleOpenProperty}
          style={{
            background: `linear-gradient(135deg, ${color} 0%, rgba(15, 23, 42, 0.95) 100%)`,
            boxShadow: `0 10px 25px -5px ${color}66, 0 8px 10px -6px rgba(0, 0, 0, 0.4)`,
          }}
          className="relative rounded-2xl p-3 sm:p-3.5 text-white shadow-2xl cursor-pointer select-none overflow-hidden border border-white/25 active:scale-[0.99] transition-all"
        >
          {/* Sweep light animation */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div className="w-1/2 h-full bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-12 animate-live-shine" />
          </div>

          <div className="relative z-10 flex items-center gap-3">
            {/* Emoji or Image */}
            <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center shrink-0 border border-white/20 text-2xl shadow-inner">
              <span className="animate-live-breathe">{emoji}</span>
            </div>

            {/* Content Column */}
            <div className="flex-1 min-w-0 pr-1">
              <div className="text-[17px] sm:text-lg font-black tracking-wide leading-tight drop-shadow-xs">
                {text.title}
              </div>
              <div className="text-xs sm:text-sm font-semibold text-white/90 truncate mt-0.5">
                {text.subtitle}
              </div>

              {isPriceChange ? (
                <div className="text-xs sm:text-sm font-bold text-white truncate mt-0.5 flex items-center gap-1.5">
                  <span className="line-through text-white/70">
                    {formatPropertyPrice(current.before!.price)}
                  </span>
                  <span>→</span>
                  <span className="font-extrabold text-sm sm:text-base text-yellow-300">
                    {formatPropertyPrice(current.after.price)}
                  </span>
                  {pLabel && <span className="font-black text-yellow-200">({pLabel})</span>}
                </div>
              ) : text.detail ? (
                <div className="text-xs sm:text-sm font-bold text-white/95 truncate mt-0.5">
                  {text.detail}
                </div>
              ) : null}
            </div>

            {/* Close Button */}
            <button
              type="button"
              data-testid="live_banner_close"
              onClick={(e) => {
                e.stopPropagation();
                handleDismissCurrent();
              }}
              className="p-1.5 rounded-full hover:bg-white/20 text-white/80 hover:text-white transition-colors shrink-0 cursor-pointer"
              title="Đóng thông báo"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Countdown Progress Bar */}
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20 overflow-hidden">
            <div
              className="h-full bg-white/90"
              style={{
                animation: `live-countdown ${LiveEventStyle.BANNER_MS}ms linear forwards`,
              }}
            />
          </div>
        </div>

        <style>{`
          @keyframes live-countdown {
            from { width: 100%; }
            to { width: 0%; }
          }
        `}</style>
      </div>
    );
  }

  if (showRestored && restored) {
    return (
      <div
        data-testid="live_overlay_host"
        className="fixed top-3 sm:top-5 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-1.5rem)] max-w-[520px] pointer-events-auto"
        onClick={handleOpenProperty}
      >
        <div
          data-testid="live_banner"
          style={{
            background: "linear-gradient(135deg, #3949AB 0%, #1e1b4b 100%)",
          }}
          className="relative rounded-2xl p-3 text-white shadow-2xl cursor-pointer select-none overflow-hidden border border-white/20 flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center shrink-0 text-xl">
              ✅
            </div>
            <div className="min-w-0">
              <div className="text-base font-black tracking-wide">ĐÃ TẢI XONG ẢNH</div>
              <div className="text-xs font-semibold text-white/90 truncate">
                {restored.successCount}/{restored.totalCount} ảnh đã về máy
              </div>
            </div>
          </div>
          <button
            type="button"
            data-testid="live_banner_close"
            onClick={(e) => {
              e.stopPropagation();
              handleDismissCurrent();
            }}
            className="p-1.5 rounded-full hover:bg-white/20 text-white/80 hover:text-white transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
    );
  }

  return null;
};
