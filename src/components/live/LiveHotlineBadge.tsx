import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Phone } from 'lucide-react';
import { settingsManager } from '../../data/local/settings-manager';
import { LiveHotlineLayout } from '../../core/live/hotline-layout';
import { useLivestream } from '../../core/live/use-livestream';

export const LiveHotlineBadge: React.FC = () => {
  const { isLive } = useLivestream();
  const [settings, setSettings] = useState(() => settingsManager.getSettings());
  const badgeRef = useRef<HTMLDivElement | null>(null);

  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ clientX: number; clientY: number; badgeX: number; badgeY: number } | null>(null);

  useEffect(() => {
    return settingsManager.subscribe(s => {
      setSettings(s);
    });
  }, []);

  const text = (settings.liveHotlineText || '').trim();
  const fx = settings.liveHotlineFx ?? 1;
  const fy = settings.liveHotlineFy ?? 0.25;

  const updatePositionFromFraction = useCallback(() => {
    if (!badgeRef.current || typeof window === 'undefined') return;
    const badgeRect = badgeRef.current.getBoundingClientRect();
    const badgeW = badgeRect.width;
    const badgeH = badgeRect.height;
    const winW = window.innerWidth;
    const winH = window.innerHeight;

    const x = LiveHotlineLayout.fromFraction(fx, badgeW, winW);
    const y = LiveHotlineLayout.fromFraction(fy, badgeH, winH);
    setPosition({ x, y });
  }, [fx, fy]);

  useEffect(() => {
    if (!isLive || !text) return;
    updatePositionFromFraction();

    const handleResize = () => {
      if (!isDraggingRef.current) {
        updatePositionFromFraction();
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isLive, text, updatePositionFromFraction]);

  if (!isLive || !text) {
    return null;
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !badgeRef.current) return;
    isDraggingRef.current = true;
    const currentX = position?.x ?? 0;
    const currentY = position?.y ?? 0;
    dragStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      badgeX: currentX,
      badgeY: currentY,
    };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current || !dragStartRef.current || !badgeRef.current) return;
    const deltaX = e.clientX - dragStartRef.current.clientX;
    const deltaY = e.clientY - dragStartRef.current.clientY;
    const rawX = dragStartRef.current.badgeX + deltaX;
    const rawY = dragStartRef.current.badgeY + deltaY;

    const badgeW = badgeRef.current.offsetWidth;
    const badgeH = badgeRef.current.offsetHeight;
    const winW = window.innerWidth;
    const winH = window.innerHeight;

    const clampedX = LiveHotlineLayout.clamp(rawX, badgeW, winW);
    const clampedY = LiveHotlineLayout.clamp(rawY, badgeH, winH);
    setPosition({ x: clampedX, y: clampedY });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current || !badgeRef.current) return;
    isDraggingRef.current = false;
    dragStartRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    const currentX = position?.x ?? 0;
    const currentY = position?.y ?? 0;
    const badgeW = badgeRef.current.offsetWidth;
    const badgeH = badgeRef.current.offsetHeight;
    const winW = window.innerWidth;
    const winH = window.innerHeight;

    const snappedX = LiveHotlineLayout.snapX(currentX, badgeW, winW, 24);
    const clampedY = LiveHotlineLayout.clamp(currentY, badgeH, winH);

    const newFx = LiveHotlineLayout.toFraction(snappedX, badgeW, winW);
    const newFy = LiveHotlineLayout.toFraction(clampedY, badgeH, winH);

    setPosition({ x: snappedX, y: clampedY });
    settingsManager.setLiveHotlinePosition(newFx, newFy);
  };

  const style: React.CSSProperties = position
    ? {
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        touchAction: 'none',
      }
    : {
        position: 'fixed',
        right: 0,
        top: '25%',
        touchAction: 'none',
      };

  return (
    <div
      ref={badgeRef}
      data-testid="live_hotline_badge"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{
        ...style,
        backgroundColor: '#E24B4A',
      }}
      className="z-[8000] flex items-center gap-1.5 px-3 py-1.5 select-none cursor-move rounded-xl shadow-lg max-w-[80vw]"
    >
      <Phone className="w-5 h-5 text-white shrink-0" fill="currentColor" />
      <span
        className="font-black text-white text-[19px] leading-tight truncate"
        style={{
          textShadow: '0 2px 4px rgba(80, 19, 19, 0.6)',
        }}
      >
        {text}
      </span>
    </div>
  );
};
