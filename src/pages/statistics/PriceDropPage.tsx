import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ArrowLeft,
  Filter,
  TrendingDown,
  Check,
  ChevronDown
} from "lucide-react";
import { db } from "../../data/local/db";
import { getVisibleHistories } from "../../data/local/price-history-queries";
import { PropertyPriceHistory } from "../../core/models/price-history";
import { FilterScope } from "../../core/models/enums";
import { FilterState } from "../../core/engine/property-filter";
import { formatPropertyPrice } from "../../core/utils/property-price";
import { toTitleCase } from "../../core/utils/vietnamese";
import { PropertyThumbnail } from "../../components/properties/PropertyThumbnail";
import { PropertyFilterBottomSheet } from "../../components/properties/PropertyFilterBottomSheet";
import {
  PriceDropCalculator,
  PriceDropSort,
  PriceDropWindow,
  PRICE_DROP_SORT_LABELS,
  PRICE_DROP_WINDOW_CONFIG,
  PriceDropItem,
  formatRelativeDropTime,
  priceDropMatchesFilter
} from "../../core/engine/price-drop-calculator";

function formatPpm2(ppm2: number): string {
  if (ppm2 < 1.0) {
    const val = Number((ppm2 * 1000).toFixed(1));
    return `${val} tr/m²`;
  } else {
    const val = Number(ppm2.toFixed(1));
    return `${val} tỷ/m²`;
  }
}

export const PriceDropPage: React.FC = () => {
  const navigate = useNavigate();

  const [selectedWindow, setSelectedWindow] = useState<PriceDropWindow>(
    PriceDropWindow.DAYS_30
  );
  const [selectedSort, setSelectedSort] = useState<PriceDropSort>(
    PriceDropSort.RECENT
  );
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [filterState, setFilterState] = useState<FilterState>({
    scope: FilterScope.ALL
  });

  // Reactive query from Dexie IndexedDB
  const data = useLiveQuery(async () => {
    const properties = await db.properties.toArray();
    const histories = await getVisibleHistories();
    // Mốc "bây giờ" lấy cùng lúc đọc dữ liệu (không gọi Date.now khi vẽ)
    return { properties, histories, now: Date.now() };
  }, []);

  const properties = useMemo(() => data?.properties ?? [], [data]);
  const histories = useMemo(() => data?.histories ?? [], [data]);
  const dataNow = data?.now ?? 0;
  const isLoading = data === undefined;

  const historiesByProp = useMemo(() => {
    const map = new Map<string, PropertyPriceHistory[]>();
    for (const h of histories) {
      const list = map.get(h.propertyId);
      if (list) {
        list.push(h);
      } else {
        map.set(h.propertyId, [h]);
      }
    }
    return map;
  }, [histories]);

  const items = useMemo(() => {
    if (properties.length === 0) return [];
    const calculated = PriceDropCalculator.calculate(
      properties,
      historiesByProp,
      dataNow,
      selectedWindow,
      selectedSort
    );
    return calculated.filter((item) => priceDropMatchesFilter(item.property, filterState));
  }, [properties, historiesByProp, dataNow, selectedWindow, selectedSort, filterState]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filterState.scope === FilterScope.CURRENT_TAB) count++;
    if (filterState.propertyTypes && filterState.propertyTypes.size > 0)
      count += filterState.propertyTypes.size;
    if (filterState.statuses && filterState.statuses.size > 0)
      count += filterState.statuses.size;
    if (filterState.selectedPrices && filterState.selectedPrices.size > 0)
      count += filterState.selectedPrices.size;
    if (filterState.priceMin != null || filterState.priceMax != null) count++;
    if (filterState.selectedSizes && filterState.selectedSizes.size > 0)
      count += filterState.selectedSizes.size;
    if (filterState.sizeMin != null || filterState.sizeMax != null) count++;
    if (filterState.areas && filterState.areas.size > 0) count += filterState.areas.size;
    if (filterState.directions && filterState.directions.size > 0)
      count += filterState.directions.size;
    return count;
  }, [filterState]);

  const handleCardClick = (item: PriceDropItem) => {
    if (item.property.isVerified) {
      navigate(`/properties/${item.property.id}`);
    } else {
      navigate(`/unverified/${item.property.id}`);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-4 md:py-6 pb-24 md:pb-12 space-y-4">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-600 transition-colors cursor-pointer"
            title="Quay lại"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg md:text-xl font-bold text-slate-900">Giá vừa giảm</h1>
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
            </div>
            <p className="text-xs text-slate-500">
              {isLoading
                ? "Đang tính…"
                : `${items.length} căn · ${PRICE_DROP_WINDOW_CONFIG[selectedWindow].label}`}
            </p>
          </div>
        </div>

        {/* Filter Button with Badge */}
        <button
          onClick={() => setShowFilterSheet(true)}
          className={`relative p-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
            activeFilterCount > 0
              ? "bg-blue-50 border-blue-200 text-blue-700"
              : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
          }`}
          title="Bộ lọc"
        >
          <Filter className="w-4 h-4" />
          <span className="hidden sm:inline">Bộ lọc</span>
          {activeFilterCount > 0 && (
            <span className="w-2 h-2 rounded-full bg-blue-600" />
          )}
        </button>
      </div>

      {/* 1 hàng gộp: Chọn khung ngày + Sắp xếp */}
      <div className="flex items-center justify-between gap-2 overflow-x-auto pb-1 no-scrollbar">
        {/* Chips chọn khung ngày */}
        <div className="flex items-center gap-1.5 shrink-0">
          {[
            PriceDropWindow.DAYS_7,
            PriceDropWindow.DAYS_30,
            PriceDropWindow.DAYS_90,
            PriceDropWindow.ALL
          ].map((windowKey) => {
            const isSelected = selectedWindow === windowKey;
            return (
              <button
                key={windowKey}
                onClick={() => setSelectedWindow(windowKey)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                  isSelected
                    ? "bg-blue-600 text-white shadow-xs"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {PRICE_DROP_WINDOW_CONFIG[windowKey].label}
              </button>
            );
          })}
        </div>

        {/* Nút dropdown sắp xếp */}
        <div className="relative shrink-0">
          <button
            onClick={() => setSortMenuOpen((prev) => !prev)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-full text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
          >
            <span>{PRICE_DROP_SORT_LABELS[selectedSort].shortLabel}</span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
          </button>

          {sortMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setSortMenuOpen(false)}
              />
              <div className="absolute right-0 mt-1 w-48 bg-white border border-slate-200 rounded-xl shadow-lg z-50 py-1 divide-y divide-slate-100">
                {[
                  PriceDropSort.RECENT,
                  PriceDropSort.AMOUNT_DESC,
                  PriceDropSort.PERCENT_DESC
                ].map((s) => {
                  const isCur = selectedSort === s;
                  return (
                    <button
                      key={s}
                      onClick={() => {
                        setSelectedSort(s);
                        setSortMenuOpen(false);
                      }}
                      className="w-full px-3 py-2 text-left text-xs font-medium flex items-center justify-between hover:bg-slate-50 cursor-pointer"
                    >
                      <span className={isCur ? "font-bold text-blue-600" : "text-slate-700"}>
                        {PRICE_DROP_SORT_LABELS[s].label}
                      </span>
                      {isCur && <Check className="w-3.5 h-3.5 text-blue-600" />}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Danh sách thẻ hoặc trạng thái rỗng */}
      {isLoading ? (
        <div className="text-center py-16 text-xs text-slate-400">
          Đang tải dữ liệu giảm giá…
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 px-4 bg-white border border-slate-200 rounded-2xl shadow-2xs">
          <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
            <TrendingDown className="w-6 h-6" />
          </div>
          <h4 className="text-base font-semibold text-slate-700">
            {selectedWindow === PriceDropWindow.ALL
              ? "Chưa có BĐS nào giảm giá"
              : `Không có BĐS nào giảm giá trong ${PRICE_DROP_WINDOW_CONFIG[selectedWindow].label}`}
          </h4>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Thử chọn khung 90 ngày hoặc điều chỉnh lại bộ lọc.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {items.map((item) => {
            const p = item.property;
            const relativeTime = formatRelativeDropTime(item.lastDropAt, dataNow);
            const dropAmountStr =
              formatPropertyPrice(item.dropAmount) ?? `${item.dropAmount} tỷ`;

            const parts = [
              `↓ ${dropAmountStr}`,
              item.currentPricePerM2 ? formatPpm2(item.currentPricePerM2) : null,
              item.totalDropCountSinceBaseline > 1
                ? `Giảm ${item.totalDropCountSinceBaseline} lần`
                : null
            ].filter(Boolean);

            return (
              <div
                key={p.id}
                onClick={() => handleCardClick(item)}
                className="bg-white border border-slate-200 rounded-2xl p-3 shadow-2xs hover:shadow-xs transition-shadow cursor-pointer flex items-center gap-3"
              >
                {/* Thumbnail 56px */}
                <PropertyThumbnail
                  property={p}
                  size={56}
                  showStarBadge={false}
                  className="rounded-xl"
                />

                {/* 3 dòng thông tin */}
                <div className="flex-1 min-w-0 space-y-1">
                  {/* Dòng 1: Tiêu đề + Nhãn Chờ XM + Relative time */}
                  <div className="flex items-center gap-1.5 min-w-0">
                    {!p.isVerified && (
                      <span className="shrink-0 px-1.5 py-0.5 bg-amber-100 text-amber-900 rounded text-[10px] font-bold">
                        CHỜ XM
                      </span>
                    )}
                    <h3 className="font-bold text-slate-900 text-sm truncate flex-1">
                      {toTitleCase(p.area) || "Chưa rõ khu vực"}
                    </h3>
                    <span className="text-slate-400 text-xs shrink-0">{relativeTime}</span>
                  </div>

                  {/* Dòng 2: Giá mới, giá cũ gạch ngang, -% */}
                  <div className="flex items-baseline gap-2">
                    <span className="text-base font-bold text-blue-600">
                      {formatPropertyPrice(item.currentPrice) ?? `${item.currentPrice} tỷ`}
                    </span>
                    <span className="text-xs line-through text-slate-400">
                      {formatPropertyPrice(item.previousPrice) ?? `${item.previousPrice} tỷ`}
                    </span>
                    <span className="px-1.5 py-0.2 bg-rose-100 text-rose-700 font-bold text-[11px] rounded">
                      -{Number(item.dropPercent.toFixed(1))}%
                    </span>
                  </div>

                  {/* Dòng 3: ↓tiền · giá/m² · số lần giảm */}
                  <div className="text-xs text-slate-500 truncate">
                    {parts.join(" · ")}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Property Filter BottomSheet */}
      <PropertyFilterBottomSheet
        isOpen={showFilterSheet}
        filterState={filterState}
        onFilterChange={setFilterState}
        onClose={() => setShowFilterSheet(false)}
        onReset={() => setFilterState({ scope: FilterScope.ALL })}
        activeFilterCount={activeFilterCount}
        totalMatchedCount={items.length}
      />
    </div>
  );
};
