import React, { useEffect, useState } from "react";
import { useLivestream } from "../../core/live/use-livestream";
import { liveEventBus } from "../../core/live/live-event-bus";
import { LiveEventStyle } from "../../core/live/live-event-style";
import { LiveEvent } from "../../core/live/live-event";

interface LiveTagProps {
  propertyId: string;
  className?: string;
}

/**
 * Nhãn nhỏ "🔥 GIẢM GIÁ" gắn lên thẻ/ô giá của BĐS vừa có sự kiện, tự ẩn sau HIGHLIGHT_MS (15 giây).
 * Chuẩn Native Android LiveHighlight.kt.
 */
export const LiveTag: React.FC<LiveTagProps> = ({ propertyId, className = "" }) => {
  const { isLive } = useLivestream();
  const [history, setHistory] = useState<readonly LiveEvent[]>(() => liveEventBus.history);
  const [dismissedSeq, setDismissedSeq] = useState<number>(0);
  const [visible, setVisible] = useState<boolean>(false);

  useEffect(() => {
    return liveEventBus.subscribe((h) => {
      setHistory(h);
    });
  }, []);

  const event = React.useMemo(() => {
    return history.slice().reverse().find((it) => (it.propertyId || it.after.id) === propertyId) || null;
  }, [history, propertyId]);

  useEffect(() => {
    if (!isLive || !event || (event.seq && event.seq === dismissedSeq)) {
      setVisible(false);
      return;
    }

    const publishedAt = event.publishedAt || 0;
    const remaining = LiveEventStyle.HIGHLIGHT_MS - (Date.now() - publishedAt);
    if (remaining > 0) {
      setVisible(true);
      const timer = window.setTimeout(() => {
        setVisible(false);
      }, remaining);
      return () => window.clearTimeout(timer);
    } else {
      setVisible(false);
    }
  }, [isLive, event, dismissedSeq]);

  if (!isLive || !visible || !event) return null;

  const type = event.type;
  const emoji = LiveEventStyle.emoji(type);
  const title = LiveEventStyle.text(event).title;
  const color = LiveEventStyle.color(type);

  return (
    <span
      data-testid="live_tag"
      onClick={(e) => {
        e.stopPropagation();
        if (event.seq) setDismissedSeq(event.seq);
        setVisible(false);
      }}
      style={{ backgroundColor: color }}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-white text-[11px] font-bold shadow-xs select-none cursor-pointer hover:opacity-90 active:scale-95 transition-all ${className}`}
      title="Bấm để ẩn nhãn"
    >
      <span>{emoji}</span>
      <span>{title}</span>
    </span>
  );
};

/**
 * Hook trả về trạng thái hiệu ứng viền/rung cho BĐS vừa có sự kiện (chuẩn LiveHighlight.kt)
 */
export function useLiveHighlight(propertyId: string) {
  const { isLive } = useLivestream();
  const [history, setHistory] = useState<readonly LiveEvent[]>(() => liveEventBus.history);
  const [active, setActive] = useState(false);
  const [isFresh, setIsFresh] = useState(false);

  useEffect(() => {
    return liveEventBus.subscribe((h) => {
      setHistory(h);
    });
  }, []);

  const event = React.useMemo(() => {
    return history.slice().reverse().find((it) => (it.propertyId || it.after.id) === propertyId) || null;
  }, [history, propertyId]);

  useEffect(() => {
    if (!isLive || !event) {
      setActive(false);
      setIsFresh(false);
      return;
    }

    const publishedAt = event.publishedAt || 0;
    const elapsed = Date.now() - publishedAt;
    const remaining = LiveEventStyle.HIGHLIGHT_MS - elapsed;

    if (remaining > 0) {
      setActive(true);
      setIsFresh(elapsed < 2000);

      const freshTimer = elapsed < 2000 ? window.setTimeout(() => setIsFresh(false), 2000 - elapsed) : undefined;
      const endTimer = window.setTimeout(() => {
        setActive(false);
        setIsFresh(false);
      }, remaining);

      return () => {
        if (freshTimer) window.clearTimeout(freshTimer);
        window.clearTimeout(endTimer);
      };
    } else {
      setActive(false);
      setIsFresh(false);
    }
  }, [isLive, event]);

  const color = event ? LiveEventStyle.color(event.type) : undefined;

  return {
    isHighlighted: isLive && active,
    isFresh: isLive && isFresh,
    color,
    event,
  };
}
