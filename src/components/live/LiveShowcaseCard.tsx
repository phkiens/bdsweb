import React, { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { Camera, ChevronLeft, ChevronRight, Home, Check } from "lucide-react";
import { Property } from "../../core/models/property";
import { PropertyStatus } from "../../core/models/enums";
import { toTitleCase } from "../../core/utils/vietnamese";
import { formatPropertyPrice } from "../../core/utils/property-price";
import { LiveCardBadge } from "../../core/live/live-card-badges";
import { computeLivePhaseMs, interpolatePrice } from "../../core/live/live-card-motion";
import { LiveTag, useLiveHighlight } from "./LiveTag";
import { mediaService } from "../../data/media/media-service";
import { MediaItem } from "../../core/models/media";
import { LiveEventType } from "../../core/live/live-event";
import { LiveEventStyle } from "../../core/live/live-event-style";

export interface LiveShowcaseCardProps {
  property: Property;
  onClick: () => void;
  liveBadge?: LiveCardBadge | null;
  isMultiSelectMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
  className?: string;
  feedTitle?: string;
  feedTime?: string;
  feedType?: LiveEventType;
}

/**
 * Thẻ trưng bày dạng ảnh phủ toàn bộ khi live (Live Showcase Card).
 * Tỉ lệ 4:3, bo 12px, chữ trắng đè thẳng lên ảnh kèm bóng chữ (không dải nền).
 * Vuốt ngang lật ảnh bằng CSS scroll-snap, bộ đếm 📷 i/n, lazy load ảnh.
 * Chuẩn 100% Native Android PropertyCard.kt (showcase = true).
 */
export const LiveShowcaseCard: React.FC<LiveShowcaseCardProps> = ({
  property,
  onClick,
  liveBadge,
  isMultiSelectMode = false,
  isSelected = false,
  onToggleSelect,
  className = "",
  feedTitle,
  feedTime,
  feedType
}) => {
  // 1. All hooks unconditionally declared at the top before any logic/returns
  // Nguồn ảnh: URL sẵn (ảnh trên máy) hoặc MediaItem R2 chưa ký; chỉ ký trang đang xem + trang kế
  const [sources, setSources] = useState<Array<{ url?: string; item?: MediaItem }>>([]);
  const [signedUrls, setSignedUrls] = useState<Record<number, string>>({});
  const [activePageIndex, setActivePageIndex] = useState<number>(0);
  const [displayedPriceVal, setDisplayedPriceVal] = useState<number>(() => {
    return !property.isVerified
      ? property.price
      : (liveBadge?.oldPrice ?? property.price);
  });

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pointerStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  const phaseMs = useMemo(() => computeLivePhaseMs(property.id), [property.id]);
  const highlight = useLiveHighlight(property.id);

  const isUnverified = !property.isVerified;
  const isSold = property.status === PropertyStatus.SOLD || property.status === "Đã bán" || feedType === LiveEventType.SOLD;

  // 2. Danh sách nguồn ảnh (không ký URL ở bước này)
  useEffect(() => {
    let isCancelled = false;

    async function loadSources() {
      if (property.r2MediaKeys === "[]") {
        if (!isCancelled) setSources([]);
        return;
      }

      const collected: Array<{ url?: string; item?: MediaItem }> = [];
      if (property.imagePath && property.imagePath.trim()) {
        property.imagePath
          .split("|||")
          .map((s) => s.trim())
          .filter(
            (s) =>
              s.startsWith("http://") ||
              s.startsWith("https://") ||
              s.startsWith("blob:") ||
              s.startsWith("data:")
          )
          .forEach((url) => collected.push({ url }));
      }

      try {
        const mediaItems: MediaItem[] = await mediaService.fetchPropertyMedia(property.id, property);
        mediaItems.forEach((item) => collected.push({ item }));
      } catch {
        // Offline hoặc lỗi lấy danh sách ảnh: giữ phần đã có
      }

      if (!isCancelled) {
        setSources(collected);
        setSignedUrls({});
        setActivePageIndex(0);
      }
    }

    loadSources();
    return () => {
      isCancelled = true;
    };
  }, [property.id, property.imagePath, property.r2MediaKeys]);

  // 2b. Ký URL lười: chỉ trang đang xem và trang kế (mỗi trang ký một lần)
  const requestedRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    requestedRef.current = new Set();
  }, [sources]);
  useEffect(() => {
    // Không huỷ khi lật trang: URL đã ký vẫn được giữ (setState sau khi thẻ bị gỡ là vô hại)
    [activePageIndex, activePageIndex + 1].forEach((idx) => {
      const src = sources[idx];
      if (!src || requestedRef.current.has(idx)) return;
      requestedRef.current.add(idx);
      if (src.url) {
        setSignedUrls((prev) => ({ ...prev, [idx]: src.url! }));
      } else if (src.item) {
        mediaService
          .resolveImageUrl(property.id, src.item)
          .then((url) => {
            if (url) setSignedUrls((prev) => ({ ...prev, [idx]: url }));
          })
          .catch(() => {
            requestedRef.current.delete(idx);
          });
      }
    });
  }, [sources, activePageIndex, property.id]);

  // 3. Price Countdown Animation (cũ -> mới một lần khi có sự kiện giảm giá)
  useEffect(() => {
    const oldPrice = !isUnverified ? liveBadge?.oldPrice : null;
    const targetPrice = property.price;

    if (oldPrice != null && oldPrice > targetPrice) {
      setDisplayedPriceVal(oldPrice);
      let rafId: number | null = null;
      let startTime = 0;
      const delayMs = 300;
      const durationMs = 900;

      const timer = window.setTimeout(() => {
        const step = (now: number) => {
          if (!startTime) startTime = now;
          const elapsed = now - startTime;
          const progress = Math.min(1, Math.max(0, elapsed / durationMs));
          const current = interpolatePrice(oldPrice, targetPrice, progress);
          setDisplayedPriceVal(current);

          if (progress < 1) {
            rafId = requestAnimationFrame(step);
          } else {
            setDisplayedPriceVal(targetPrice);
          }
        };
        rafId = requestAnimationFrame(step);
      }, delayMs);

      return () => {
        window.clearTimeout(timer);
        if (rafId !== null) cancelAnimationFrame(rafId);
      };
    } else {
      setDisplayedPriceVal(targetPrice);
    }
  }, [property.id, property.price, liveBadge?.oldPrice, isUnverified]);

  // 4. Scroll listener for photo pager counter
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el || sources.length <= 1) return;
    const width = el.clientWidth || 1;
    const newIndex = Math.round(el.scrollLeft / width);
    setActivePageIndex(Math.max(0, Math.min(sources.length - 1, newIndex)));
  }, [sources.length]);

  const handlePrevPhoto = (e: React.MouseEvent) => {
    e.stopPropagation();
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollBy({ left: -el.clientWidth, behavior: "smooth" });
  };

  const handleNextPhoto = (e: React.MouseEvent) => {
    e.stopPropagation();
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollBy({ left: el.clientWidth, behavior: "smooth" });
  };

  // 5. Pointer gestures (distinguish swipe from click)
  const handlePointerDown = (e: React.PointerEvent) => {
    pointerStartRef.current = { x: e.clientX, y: e.clientY, time: Date.now() };
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!pointerStartRef.current) return;
    if ((e.target as HTMLElement).closest("button")) {
      pointerStartRef.current = null;
      return;
    }
    const dx = Math.abs(e.clientX - pointerStartRef.current.x);
    const dy = Math.abs(e.clientY - pointerStartRef.current.y);
    const dt = Date.now() - pointerStartRef.current.time;
    pointerStartRef.current = null;

    if (dx < 8 && dy < 8 && dt < 450) {
      if (isMultiSelectMode && onToggleSelect) {
        onToggleSelect();
      } else {
        onClick();
      }
    }
  };

  // 6. Pre-calculate text fields
  const typePrefix = property.propertyType ? `${property.propertyType} · ` : "";
  const areaTitle = toTitleCase(property.area) || "Chưa rõ khu vực";

  const dimensionParts: string[] = [];
  if (property.areaSize != null && property.areaSize > 0) {
    dimensionParts.push(`${Number(property.areaSize.toFixed(1))} m²`);
  }
  const firstDirection = property.direction
    ? property.direction.split("|||").map((d) => d.trim()).filter(Boolean)[0]
    : undefined;
  if (firstDirection) {
    dimensionParts.push(firstDirection);
  }
  const subtitleLine = dimensionParts.join(" · ");

  const shadowStyle = {
    textShadow: "0 2px 8px rgba(0, 0, 0, 0.9)"
  };

  const hasMultipleImages = sources.length > 1;

  return (
    <div
      data-testid={`property_card_${property.id}`}
      data-showcase="true"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      style={
        highlight.isHighlighted && highlight.color
          ? ({ "--live-highlight-color": highlight.color } as React.CSSProperties)
          : undefined
      }
      className={`group relative aspect-[4/3] w-full rounded-[12px] overflow-hidden bg-slate-800 border border-slate-700/60 select-none cursor-pointer transition-shadow ${
        isMultiSelectMode && isSelected ? "ring-3 ring-blue-600" : ""
      } ${highlight.isHighlighted ? "animate-live-pulse-border" : ""} ${
        highlight.isFresh ? "animate-live-shake" : ""
      } ${className}`}
    >
      {/* Photo carousel with CSS scroll-snap */}
      {sources.length > 0 ? (
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="w-full h-full flex overflow-x-auto snap-x snap-mandatory scrollbar-none"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {sources.map((_, idx) => {
            const url = Math.abs(idx - activePageIndex) <= 1 ? signedUrls[idx] : undefined;
            return (
              <div
                key={idx}
                className="w-full h-full shrink-0 snap-center snap-always relative overflow-hidden bg-slate-900"
              >
                {url ? (
                  <img
                    src={url}
                    alt=""
                    loading={idx === 0 ? "eager" : "lazy"}
                    className="w-full h-full object-cover pointer-events-none select-none"
                  />
                ) : (
                  <div className="w-full h-full bg-slate-800" />
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-slate-800 text-slate-500">
          <Home className="w-12 h-12 opacity-40" />
        </div>
      )}

      {/* Mouse navigation buttons (‹ / ›) - only visible on hover when multiple photos */}
      {hasMultipleImages && (
        <>
          <button
            type="button"
            onClick={handlePrevPhoto}
            aria-label="Ảnh trước"
            className="absolute left-2 top-1/2 -translate-y-1/2 z-15 w-7 h-7 rounded-full bg-black/50 hover:bg-black/75 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer shadow-md"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleNextPhoto}
            aria-label="Ảnh sau"
            className="absolute right-2 top-1/2 -translate-y-1/2 z-15 w-7 h-7 rounded-full bg-black/50 hover:bg-black/75 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer shadow-md"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </>
      )}

      {/* Top Left: Badges Row (Selection, CHỜ XM, Giảm %, Mới) */}
      <div className="absolute top-2 left-2 z-15 flex items-center gap-1.5 pointer-events-none">
        {isMultiSelectMode && (
          <div
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect?.();
            }}
            className={`w-6 h-6 rounded-md flex items-center justify-center pointer-events-auto transition-colors ${
              isSelected ? "bg-blue-600 text-white" : "bg-black/60 border border-white/40 text-transparent"
            }`}
          >
            <Check className="w-4 h-4" />
          </div>
        )}

        {isUnverified ? (
          <span
            className="animate-live-wiggle inline-flex items-center px-2 py-0.5 rounded-[6px] text-white text-[13px] font-bold bg-[#7c3aed] shadow-md select-none"
            style={{ animationDelay: `${600 + phaseMs}ms` }}
          >
            CHỜ XM
          </span>
        ) : (
          <>
            {liveBadge?.dropPercent != null && (
              <span
                className="animate-live-wiggle inline-flex items-center px-2 py-0.5 rounded-[6px] text-[#412402] text-[13px] font-bold bg-[#FAC775] shadow-md select-none"
                style={{ animationDelay: `${600 + phaseMs}ms` }}
              >
                Giảm {liveBadge.dropPercent}%
              </span>
            )}
            {liveBadge?.isNew && (
              <span
                className="relative overflow-hidden inline-flex items-center px-2 py-0.5 rounded-[6px] text-[#04342C] text-[13px] font-bold bg-[#9FE1CB] shadow-md select-none animate-live-breathe-scale"
                style={{ animationDelay: `${phaseMs}ms` }}
              >
                Mới
                <span className="absolute inset-0 overflow-hidden rounded-[6px] pointer-events-none">
                  <span
                    className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/60 to-transparent animate-live-breathe-sweep"
                    style={{ animationDelay: `${phaseMs}ms` }}
                  />
                </span>
              </span>
            )}
          </>
        )}
      </div>

      {/* Top Right: Photo Counter & LiveTag */}
      <div className="absolute top-2 right-2 z-15 flex flex-col items-end gap-1 pointer-events-none">
        <LiveTag propertyId={property.id} className="pointer-events-auto" />

        {sources.length > 0 && (
          <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[10px] bg-black/45 text-white text-[12px] font-medium shadow-xs select-none">
            <Camera className="w-3.5 h-3.5" />
            <span style={shadowStyle}>
              {hasMultipleImages ? `${activePageIndex + 1}/${sources.length}` : "1"}
            </span>
          </div>
        )}
      </div>

      {/* Feed View: Header chip & time badge if provided */}
      {feedTitle && (
        <div className="absolute top-9 left-2 z-15 flex items-center gap-1.5 pointer-events-none">
          <span
            style={{ backgroundColor: feedType ? LiveEventStyle.color(feedType) : "#1d4ed8" }}
            className="px-2 py-0.5 rounded-md text-[10px] font-black text-white uppercase tracking-wider shadow-sm"
          >
            {feedType ? `${LiveEventStyle.emoji(feedType)} ` : ""}
            {feedTitle}
          </span>
          {feedTime && (
            <span className="text-[11px] font-medium text-white/90 px-1.5 py-0.5 bg-black/40 rounded-md" style={shadowStyle}>
              {feedTime}
            </span>
          )}
        </div>
      )}

      {/* Center: SOLD Stamp ("ĐÃ BÁN") */}
      {isSold && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
          <div className="px-3.5 py-1 rounded-[6px] border-[2.5px] border-[#F09595] bg-[#501313]/60 text-[#F09595] text-[22px] font-bold tracking-wider uppercase select-none shadow-lg animate-live-sold-stamp">
            ĐÃ BÁN
          </div>
        </div>
      )}

      {/* Bottom Content: Price pill + Title + Dimensions (Chữ trắng đè thẳng lên ảnh, chỉ có bóng chữ) */}
      <div className="absolute bottom-0 inset-x-0 p-2.5 z-15 flex flex-col items-start pointer-events-none">
        {/* Price pill */}
        <div className="bg-black/72 rounded-[8px] px-2.5 py-0.5 inline-flex items-baseline gap-2 mb-1 shadow-sm">
          <span className="text-[27px] font-bold text-white leading-tight" style={shadowStyle}>
            {formatPropertyPrice(displayedPriceVal)}
          </span>
          {!isUnverified && liveBadge?.oldPrice != null && (
            <span className="text-[13px] text-[#B4B2A9] line-through font-normal" style={shadowStyle}>
              {formatPropertyPrice(liveBadge.oldPrice)}
            </span>
          )}
        </div>

        {/* Type & Area */}
        <div className="text-[14px] text-white font-medium truncate w-full" style={shadowStyle}>
          {typePrefix}
          {areaTitle}
        </div>

        {/* Dimensions & Direction */}
        {subtitleLine && (
          <div className="text-[13px] text-white/95 font-medium truncate w-full mt-0.5" style={shadowStyle}>
            {subtitleLine}
          </div>
        )}
      </div>
    </div>
  );
};
