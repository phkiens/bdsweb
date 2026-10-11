import React, { useRef } from 'react';
import { useLivestream } from '../../core/live/use-livestream';
import { liveControlBus } from '../../core/live/live-control-bus';

interface LivestreamBadgeProps {
  isOverlay?: boolean;
  className?: string;
}

export const LivestreamBadge: React.FC<LivestreamBadgeProps> = ({
  isOverlay = false,
  className = '',
}) => {
  const { isLive } = useLivestream();
  const timerRef = useRef<number | null>(null);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);

  if (!isLive) return null;

  const handlePointerDown = (e: React.PointerEvent) => {
    // Only primary button (left click or touch)
    if (e.button !== 0) return;
    startPosRef.current = { x: e.clientX, y: e.clientY };
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      try {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate(30);
        }
      } catch {
        // ignore vibration error
      }
      liveControlBus.open();
      timerRef.current = null;
    }, 500);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!startPosRef.current || !timerRef.current) return;
    const dx = e.clientX - startPosRef.current.x;
    const dy = e.clientY - startPosRef.current.y;
    if (dx * dx + dy * dy > 100) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const handlePointerUp = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    startPosRef.current = null;
  };

  const baseClasses = isOverlay
    ? 'bg-white/92 text-red-600 border border-black/10 shadow-sm'
    : 'bg-red-100 text-red-700';

  return (
    <div
      data-testid="livestream_badge"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onContextMenu={(e) => e.preventDefault()}
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full select-none cursor-pointer transition-transform active:scale-95 ${baseClasses} ${className}`}
      title="Nhấn giữ để mở bảng điều khiển livestream"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse" />
      <span className="text-[11px] font-bold leading-tight">Livestream</span>
    </div>
  );
};
