import React, { useState, useMemo, useEffect } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Trash2, Home, RotateCcw } from "lucide-react";
import { db } from "../../data/local/db";
import { getVisibleHistories } from "../../data/local/price-history-queries";
import { useLivestream } from "../../core/live/use-livestream";
import { LivestreamBadge } from "../../components/live/LivestreamBadge";
import { LiveEventType, LiveEvent } from "../../core/live/live-event";
import {
  LiveFeedBuilder,
  LiveFeedDay,
  LiveFeedItem,
} from "../../core/live/live-feed";
import { liveFeedPrefs } from "../../core/live/live-feed-prefs";
import { LiveEventStyle } from "../../core/live/live-event-style";
import {
  computeDefaultPriceDrops,
  computePriceDropLeaders,
  PriceDropWindow,
  PRICE_DROP_WINDOW_CONFIG,
  PriceDropItem,
} from "../../core/engine/price-drop-calculator";
import { formatPropertyPrice } from "../../core/utils/property-price";
import { PropertyThumbnail } from "../../components/properties/PropertyThumbnail";
import { LiveGrid } from "../../core/live/live-grid";
import { LiveShowcaseCard } from "../../components/live/LiveShowcaseCard";
import { settingsManager } from "../../data/local/settings-manager";

export const LiveFeedPage: React.FC = () => {
  const navigate = useNavigate();
  const { isLive } = useLivestream();

  const [settings, setSettings] = useState(() => settingsManager.getSettings());
  useEffect(() => {
    return settingsManager.subscribe((s) => setSettings(s));
  }, []);

  const isLiveShowcase = isLive && (settings.liveShowcaseList ?? true);

  const [windowWidth, setWindowWidth] = useState<number>(() =>
    typeof window !== "undefined" ? window.innerWidth : 1024
  );
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const feedColumns = useMemo(() => LiveGrid.feedColumns(windowWidth), [windowWidth]);

  const [filter, setFilter] = useState<LiveEventType | null>(null);
  const [dropWindow, setDropWindow] = useState<PriceDropWindow>(PriceDropWindow.DAYS_30);
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(() => liveFeedPrefs.hiddenKeys());
  const [snackbar, setSnackbar] = useState<{ message: string; undoItem?: LiveFeedItem } | null>(null);

  // Reactive query from Dexie IndexedDB
  const data = useLiveQuery(async () => {
    const properties = await db.properties.toArray();
    const histories = await getVisibleHistories();
    return { properties, histories, now: Date.now() };
  }, []);

  const properties = useMemo(() => data?.properties ?? [], [data]);
  const histories = useMemo(() => data?.histories ?? [], [data]);
  const now = useMemo(() => data?.now ?? Date.now(), [data]);

  // Prune expired hidden entries on mount
  useEffect(() => {
    liveFeedPrefs.prune(Date.now());
    setHiddenKeys(liveFeedPrefs.hiddenKeys());
  }, []);

  // Compute 7-day feed items
  const allFeedItems = useMemo(() => {
    if (properties.length === 0) return [];
    return LiveFeedBuilder.build(properties, histories, now, hiddenKeys);
  }, [properties, histories, now, hiddenKeys]);

  // Compute price drops (includes verified and unverified)
  const priceDrops = useMemo(() => {
    if (properties.length === 0) return [];
    return computeDefaultPriceDrops(properties, histories, now, dropWindow);
  }, [properties, histories, now, dropWindow]);

  const dropFeedItems: LiveFeedItem[] = useMemo(() => {
    return priceDrops.map((drop) => ({
      key: `drop:${drop.property.id}`,
      type: LiveEventType.PRICE_DROP,
      property: drop.property,
      at: drop.lastDropAt,
      oldPrice: drop.previousPrice,
      newPrice: drop.currentPrice,
    }));
  }, [priceDrops]);

  const dropLeaders = useMemo(() => {
    return computePriceDropLeaders(priceDrops);
  }, [priceDrops]);

  // Counts for 4 header showcase cards
  const countDrop = priceDrops.length;
  const countRise = useMemo(
    () => allFeedItems.filter((it) => it.type === LiveEventType.PRICE_RISE).length,
    [allFeedItems]
  );
  const countSold = useMemo(
    () => allFeedItems.filter((it) => it.type === LiveEventType.SOLD).length,
    [allFeedItems]
  );
  const countNew = useMemo(
    () => allFeedItems.filter((it) => it.type === LiveEventType.NEW_LISTING).length,
    [allFeedItems]
  );

  // Dismiss toast auto-hide
  useEffect(() => {
    if (snackbar) {
      const timer = window.setTimeout(() => setSnackbar(null), 4000);
      return () => window.clearTimeout(timer);
    }
  }, [snackbar]);

  const handleOpenItem = (item: LiveFeedItem) => {
    if (item.type === LiveEventType.PRICE_DROP) {
      liveFeedPrefs.hide(`new:${item.property.id}`, item.property.createdAt);
      setHiddenKeys(liveFeedPrefs.hiddenKeys());
    } else {
      liveFeedPrefs.hide(item.key, item.at);
      liveFeedPrefs.hide(`new:${item.property.id}`, item.property.createdAt);
      setHiddenKeys(liveFeedPrefs.hiddenKeys());
    }
    navigate(`/properties/${item.property.id}`);
  };

  const handleDismissItem = (e: React.MouseEvent, item: LiveFeedItem) => {
    e.stopPropagation();
    liveFeedPrefs.hide(item.key, item.at);
    setHiddenKeys(liveFeedPrefs.hiddenKeys());
    setSnackbar({ message: "Đã bỏ tin", undoItem: item });
  };

  const handleUndo = () => {
    if (snackbar?.undoItem) {
      liveFeedPrefs.unhide(snackbar.undoItem.key);
      setHiddenKeys(liveFeedPrefs.hiddenKeys());
      setSnackbar(null);
    }
  };

  // Filter current list
  const currentList =
    filter === LiveEventType.PRICE_DROP
      ? dropFeedItems
      : filter == null
      ? allFeedItems
      : allFeedItems.filter((it) => it.type === filter);

  // Group by day for non-empty list
  const groupedByDay = useMemo(() => {
    const map = new Map<LiveFeedDay, LiveFeedItem[]>();
    map.set(LiveFeedDay.TODAY, []);
    map.set(LiveFeedDay.YESTERDAY, []);
    map.set(LiveFeedDay.EARLIER, []);

    for (const item of currentList) {
      const day = LiveFeedBuilder.dayOf(item.at, now);
      map.get(day)?.push(item);
    }
    return map;
  }, [currentList, now]);

  if (!isLive) {
    return <Navigate to="/properties" replace />;
  }

  const showcaseFilters = [
    { type: LiveEventType.PRICE_DROP, label: "Giảm giá", count: countDrop },
    { type: LiveEventType.SOLD, label: "Đã bán", count: countSold },
    { type: LiveEventType.NEW_LISTING, label: "SP mới", count: countNew },
    { type: LiveEventType.PRICE_RISE, label: "Tăng giá", count: countRise },
  ];

  const formatItemTime = (at: number): string => {
    const day = LiveFeedBuilder.dayOf(at, now);
    const date = new Date(at);
    if (day === LiveFeedDay.TODAY) {
      return date.toLocaleTimeString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    } else {
      const dd = String(date.getDate()).padStart(2, "0");
      const mm = String(date.getMonth() + 1).padStart(2, "0");
      return `${dd}/${mm}`;
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-4 py-3 sm:py-4 pb-24 md:pb-12 min-h-screen">
      {/* Top Bar Header */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
            title="Quay lại"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-black text-slate-900 tracking-tight">Tin mới</h1>
          <LivestreamBadge />
        </div>
      </div>

      {/* 4 Showcase Colored Filter Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
        {showcaseFilters.map(({ type, label, count }) => {
          const isSelected = filter === type;
          const color = LiveEventStyle.color(type);
          return (
            <button
              key={type}
              type="button"
              onClick={() => setFilter(isSelected ? null : type)}
              style={{
                backgroundColor: isSelected ? `${color}25` : `${color}12`,
                borderColor: isSelected ? color : "transparent",
              }}
              className={`p-3 rounded-2xl border-2 text-left transition-all cursor-pointer active:scale-95 flex flex-col justify-between`}
            >
              <div className="text-xs font-semibold text-slate-700">{label}</div>
              <div className="text-2xl sm:text-3xl font-extrabold mt-1" style={{ color }}>
                {count}
              </div>
            </button>
          );
        })}
      </div>

      {/* Chips for Price Drop Window */}
      {filter === LiveEventType.PRICE_DROP && (
        <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
          {[
            PriceDropWindow.DAYS_7,
            PriceDropWindow.DAYS_30,
            PriceDropWindow.ALL,
          ].map((w) => {
            const isSelected = dropWindow === w;
            return (
              <button
                key={w}
                type="button"
                onClick={() => setDropWindow(w)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 border ${
                  isSelected
                    ? "bg-red-600 text-white border-red-600 shadow-xs"
                    : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                }`}
              >
                {PRICE_DROP_WINDOW_CONFIG[w].label}
              </button>
            );
          })}
        </div>
      )}

      {/* Feed List Items */}
      {currentList.length === 0 ? (
        <div className="text-center py-20 px-4 bg-white border border-slate-200 rounded-2xl shadow-xs">
          <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
            <Home className="w-6 h-6" />
          </div>
          <div className="text-base font-semibold text-slate-700">
            {filter === LiveEventType.PRICE_DROP
              ? dropWindow === PriceDropWindow.ALL
                ? "Chưa có BĐS nào giảm giá"
                : `Không có BĐS nào giảm giá trong ${PRICE_DROP_WINDOW_CONFIG[dropWindow].label}`
              : "Chưa có tin mới trong 7 ngày"}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {[LiveFeedDay.TODAY, LiveFeedDay.YESTERDAY, LiveFeedDay.EARLIER].map((day) => {
            const dayItems = groupedByDay.get(day) || [];
            if (dayItems.length === 0) return null;

            const dayLabel =
              day === LiveFeedDay.TODAY
                ? "Hôm nay"
                : day === LiveFeedDay.YESTERDAY
                ? "Hôm qua"
                : "Trước đó";

            return (
              <div key={day} className="space-y-2.5">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1">
                  {dayLabel}
                </div>

                {isLiveShowcase ? (
                  <div
                    className="grid gap-3"
                    style={{
                      gridTemplateColumns: `repeat(${feedColumns}, minmax(0, 1fr))`
                    }}
                  >
                    {dayItems.map((item) => {
                      const titleText = LiveEventStyle.text({
                        type: item.type,
                        before: null,
                        after: item.property
                      } as any).title;

                      let liveBadge: any = null;
                      if (item.type === LiveEventType.NEW_LISTING) {
                        liveBadge = { isNew: true, dropPercent: null, oldPrice: null };
                      } else if (item.type === LiveEventType.PRICE_DROP) {
                        const oldP = item.oldPrice ?? 0;
                        const newP = item.newPrice ?? 0;
                        const drop = oldP > 0 && newP > 0 ? Math.round(((oldP - newP) / oldP) * 100) : null;
                        liveBadge = { isNew: false, dropPercent: drop, oldPrice: item.oldPrice ?? null };
                      } else if (item.type === LiveEventType.PRICE_RISE) {
                        liveBadge = { isNew: false, dropPercent: null, oldPrice: item.oldPrice ?? null };
                      }

                      return (
                        <div key={item.key} className="w-full">
                          <LiveShowcaseCard
                            property={item.property}
                            liveBadge={liveBadge}
                            feedTitle={titleText}
                            feedTime={formatItemTime(item.at)}
                            feedType={item.type}
                            onClick={() => handleOpenItem(item)}
                          />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {dayItems.map((item) => {
                      const typeColor = LiveEventStyle.color(item.type);
                      const titleText = LiveEventStyle.text(
                        new (class {
                          type = item.type;
                          before = null;
                          after = item.property;
                        })()
                      ).title;

                      const subtitle = LiveEventStyle.text(
                        new (class {
                          type = item.type;
                          before = null;
                          after = item.property;
                        })()
                      ).subtitle;

                      const isDropLeaderAmount =
                        filter === LiveEventType.PRICE_DROP &&
                        item.property.id === dropLeaders.topAmountId;
                      const isDropLeaderPercent =
                        filter === LiveEventType.PRICE_DROP &&
                        item.property.id === dropLeaders.topPercentId;

                      const hasPriceChange =
                        (item.type === LiveEventType.PRICE_DROP ||
                          item.type === LiveEventType.PRICE_RISE) &&
                        item.oldPrice != null &&
                        item.oldPrice > 0 &&
                        item.newPrice != null;

                      const pLabel = hasPriceChange
                        ? LiveEventStyle.percentLabel({
                            type: item.type,
                            before: { ...item.property, price: item.oldPrice! },
                            after: { ...item.property, price: item.newPrice! },
                          } as any)
                        : null;

                      return (
                        <div
                          key={item.key}
                          onClick={() => handleOpenItem(item)}
                          style={{ borderColor: typeColor }}
                          className={`bg-white border rounded-2xl p-3 flex items-center gap-3 shadow-2xs hover:shadow-xs transition-all cursor-pointer relative overflow-hidden select-none active:scale-[0.99]`}
                        >
                          {/* Thumbnail */}
                          <div className="shrink-0">
                            <PropertyThumbnail property={item.property} size={72} />
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0 pr-1">
                            <div className="flex items-center justify-between gap-2">
                              <span
                                style={{ backgroundColor: typeColor }}
                                className="px-2 py-0.5 rounded-md text-[10px] font-black text-white uppercase tracking-wider"
                              >
                                {LiveEventStyle.emoji(item.type)} {titleText}
                              </span>
                              <span className="text-[11px] font-medium text-slate-400">
                                {formatItemTime(item.at)}
                              </span>
                            </div>

                            <div className="text-sm font-bold text-slate-900 truncate mt-1">
                              {subtitle}
                            </div>

                            {/* Price Line with Animations for Leaders */}
                            <div className="mt-1 flex items-center gap-1.5 text-xs sm:text-sm">
                              {hasPriceChange ? (
                                <>
                                  <span className="line-through text-slate-400 font-medium">
                                    {formatPropertyPrice(item.oldPrice!)}
                                  </span>
                                  <span className="text-slate-400">→</span>
                                  <span
                                    className={`font-black text-sm sm:text-base text-slate-900 ${
                                      isDropLeaderAmount
                                        ? "animate-live-breathe text-red-600 font-extrabold"
                                        : ""
                                    }`}
                                  >
                                    {formatPropertyPrice(item.newPrice!)}
                                  </span>
                                  {pLabel && (
                                    <span
                                      style={{ color: typeColor }}
                                      className={`font-black ${
                                        isDropLeaderPercent ? "animate-live-breathe font-black" : ""
                                      }`}
                                    >
                                      ({pLabel})
                                    </span>
                                  )}
                                </>
                              ) : (
                                <span className="font-extrabold text-sm sm:text-base text-blue-600">
                                  {formatPropertyPrice(item.property.price) || "Thương lượng"}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Dismiss Button (for non-drops feed items) */}
                          {filter !== LiveEventType.PRICE_DROP && (
                            <button
                              type="button"
                              onClick={(e) => handleDismissItem(e, item)}
                              className="p-2 rounded-xl text-slate-300 hover:text-red-600 hover:bg-red-50 transition-colors shrink-0 cursor-pointer"
                              title="Bỏ tin"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Snackbar / Undo Toast */}
      {snackbar && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-3 text-xs font-semibold animate-in fade-in slide-in-from-bottom-3">
          <span>{snackbar.message}</span>
          {snackbar.undoItem && (
            <button
              type="button"
              onClick={handleUndo}
              className="text-amber-400 hover:text-amber-300 font-bold underline flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Hoàn tác</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
