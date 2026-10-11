import React, { useState, useMemo } from "react";
import { Info, ArrowRight, ChevronRight, RefreshCw } from "lucide-react";
import { OwnerPerformanceResult } from "../../core/statistics/owner-performance-calculator";
import {
  OpportunityQuadrant,
  RadarAreaSummary,
  RadarOpportunityResult
} from "../../core/statistics/radar/radar-models";
import {
  MARKET_SORT_MODE_LABELS,
  MarketSortMode
} from "../../core/statistics/market-noteworthy-property";

export interface MarketTabProps {
  radarResult: RadarOpportunityResult | null;
  ownerPerformanceResult: OwnerPerformanceResult | null;
  isLoading: boolean;
  errorMessage: string | null;
  onRetry: () => void;
  onOpenSegment: (areaKey: string, propertyTypeKey: string) => void;
  onNavigateToOwnerPerformance: () => void;
}

export const MarketActionBadge: React.FC<{ quadrant: OpportunityQuadrant }> = ({ quadrant }) => {
  let label = "⚪ Sát mặt bằng";
  let bgClass = "bg-slate-100 text-slate-700";

  switch (quadrant) {
    case OpportunityQuadrant.GOLDEN_OPPORTUNITY:
      label = "🟢 Đáng ưu tiên";
      bgClass = "bg-emerald-50 text-emerald-700 border border-emerald-200";
      break;
    case OpportunityQuadrant.HOT_MARKET:
      label = "🔥 Thị trường nóng";
      bgClass = "bg-red-50 text-red-700 border border-red-200";
      break;
    case OpportunityQuadrant.CHEAP_BUT_SLOW:
      label = "🟡 Giá tốt, bán chậm";
      bgClass = "bg-amber-50 text-amber-700 border border-amber-200";
      break;
    case OpportunityQuadrant.HOLDING_RISK:
      label = "🔴 Rủi ro giữ hàng";
      bgClass = "bg-red-50 text-red-700 border border-red-200";
      break;
    case OpportunityQuadrant.FAIR_MARKET:
      label = "⚪ Sát mặt bằng";
      bgClass = "bg-slate-100 text-slate-700 border border-slate-200";
      break;
    case OpportunityQuadrant.INSUFFICIENT_DATA:
    case OpportunityQuadrant.INDETERMINATE_LIQUIDITY:
    default:
      label = "⚪ Chưa đủ dữ liệu";
      bgClass = "bg-slate-100/70 text-slate-500 border border-slate-200/60";
      break;
  }

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold ${bgClass}`}>
      {label}
    </span>
  );
};

export const MarketSegmentCard: React.FC<{
  segment: RadarAreaSummary;
  onClick: () => void;
}> = ({ segment, onClick }) => {
  const pricePerM2Text =
    segment.targetMedianPricePerM2 != null
      ? `${(segment.targetMedianPricePerM2 * 1000.0).toFixed(1)} tr/m²`
      : "-- tr/m²";

  const deviationText =
    segment.priceDeviationPercent != null
      ? `${segment.priceDeviationPercent < 0 ? "↓" : "↑"}${Math.abs(segment.priceDeviationPercent).toFixed(1)}% so mặt bằng`
      : "Chưa có benchmark";

  const liquidityText =
    segment.soldRatioProxy != null
      ? `Thanh khoản ${Math.round(segment.soldRatioProxy * 100.0)}%`
      : "Thanh khoản: --";

  return (
    <div
      onClick={onClick}
      className="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs hover:border-blue-300 transition-all cursor-pointer space-y-2"
    >
      {/* Line 1: Area · Type */}
      <div className="text-sm font-bold text-slate-900">
        {segment.areaDisplayName} · {segment.propertyTypeDisplayName}
      </div>

      {/* Line 2: Price · Benchmark deviation */}
      <div className="text-xs text-slate-600 font-medium">
        {pricePerM2Text} · {deviationText}
      </div>

      {/* Line 3: Liquidity · Active count */}
      <div className="text-xs text-slate-500">
        {liquidityText} · {segment.activeCount} căn
      </div>

      {/* Line 4: Action Badge & Link */}
      <div className="pt-1 flex items-center justify-between">
        <MarketActionBadge quadrant={segment.quadrant} />
        <span className="text-xs font-bold text-blue-600 flex items-center gap-1">
          <span>Xem phân tích</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </span>
      </div>
    </div>
  );
};

export const MarketTab: React.FC<MarketTabProps> = ({
  radarResult,
  ownerPerformanceResult,
  isLoading,
  errorMessage,
  onRetry,
  onOpenSegment,
  onNavigateToOwnerPerformance
}) => {
  const [selectedSortMode, setSelectedSortMode] = useState<MarketSortMode>(
    MarketSortMode.PRIORITY
  );

  const segments = useMemo(() => {
    if (radarResult && radarResult.type === "SUCCESS") {
      return radarResult.segments;
    }
    return [];
  }, [radarResult]);

  const sortedSegments = useMemo(() => {
    return [...segments].sort((a, b) => {
      if (selectedSortMode === MarketSortMode.PRIORITY) {
        const scoreA = a.opportunityScore ?? -Infinity;
        const scoreB = b.opportunityScore ?? -Infinity;
        if (scoreB !== scoreA) return scoreB - scoreA;
      } else if (selectedSortMode === MarketSortMode.LIQUIDITY) {
        const liqA = a.soldRatioProxy ?? -Infinity;
        const liqB = b.soldRatioProxy ?? -Infinity;
        if (liqB !== liqA) return liqB - liqA;
      } else if (selectedSortMode === MarketSortMode.PRICE_LOW) {
        const priceA = a.targetMedianPricePerM2 ?? Infinity;
        const priceB = b.targetMedianPricePerM2 ?? Infinity;
        if (priceA !== priceB) return priceA - priceB;
      }
      if (b.activeCount !== a.activeCount) return b.activeCount - a.activeCount;
      const areaCmp = a.areaDisplayName.localeCompare(b.areaDisplayName);
      if (areaCmp !== 0) return areaCmp;
      return a.propertyTypeDisplayName.localeCompare(b.propertyTypeDisplayName);
    });
  }, [segments, selectedSortMode]);

  const totalOwners = ownerPerformanceResult?.items?.length ?? 0;
  const soldOwners =
    ownerPerformanceResult?.items?.filter((it) => it.soldPropertiesCount > 0).length ?? 0;

  // Loading state
  if (isLoading && segments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-500">
        <div className="animate-spin w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full" />
        <span className="text-xs font-medium mt-3">Đang phân tích thị trường…</span>
      </div>
    );
  }

  // Error state
  if (errorMessage != null && segments.length === 0) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-red-800 space-y-3">
        <div>
          <h3 className="text-sm font-bold">Lỗi phân tích thị trường</h3>
          <p className="text-xs mt-1 text-red-600">{errorMessage}</p>
        </div>
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-xl shadow-2xs transition-colors cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Thử lại</span>
        </button>
      </div>
    );
  }

  // Empty state
  if (segments.length === 0) {
    return (
      <div className="p-6 bg-slate-100 border border-slate-200 rounded-2xl text-center">
        <Info className="w-8 h-8 text-slate-400 mx-auto mb-2" />
        <h3 className="text-sm font-bold text-slate-800">Chưa có dữ liệu thị trường</h3>
        <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
          Không tìm thấy phân khúc nào trong bộ lọc hiện tại.
        </p>
      </div>
    );
  }

  const sortOptions = [
    { mode: MarketSortMode.PRIORITY, label: MARKET_SORT_MODE_LABELS[MarketSortMode.PRIORITY] },
    { mode: MarketSortMode.LIQUIDITY, label: MARKET_SORT_MODE_LABELS[MarketSortMode.LIQUIDITY] },
    { mode: MarketSortMode.PRICE_LOW, label: MARKET_SORT_MODE_LABELS[MarketSortMode.PRICE_LOW] }
  ];

  return (
    <div className="space-y-4">
      {/* Sort FilterChips Row */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {sortOptions.map((opt) => {
          const isSelected = selectedSortMode === opt.mode;
          return (
            <button
              key={opt.mode}
              type="button"
              onClick={() => setSelectedSortMode(opt.mode)}
              className={`px-3.5 py-1.5 text-xs rounded-full border transition-all shrink-0 cursor-pointer ${
                isSelected
                  ? "bg-blue-50 text-blue-700 border-blue-400 font-bold shadow-2xs"
                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50 font-medium"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Segment Cards */}
      <div className="space-y-3">
        {sortedSegments.map((segment) => (
          <MarketSegmentCard
            key={`${segment.key.areaKey}_${segment.key.propertyTypeKey}`}
            segment={segment}
            onClick={() => onOpenSegment(segment.key.areaKey, segment.key.propertyTypeKey)}
          />
        ))}
      </div>

      {/* Owner Performance Link Card at bottom */}
      <div
        onClick={onNavigateToOwnerPerformance}
        className="p-4 bg-slate-100/70 border border-slate-200 rounded-2xl flex items-center justify-between hover:bg-slate-100 transition-colors cursor-pointer"
      >
        <div>
          <div className="text-sm font-bold text-slate-900">Nguồn hàng theo chủ</div>
          <div className="text-xs text-slate-500 mt-1">
            {totalOwners} chủ có dữ liệu · {soldOwners} chủ đã phát sinh bán
          </div>
        </div>
        <ChevronRight className="w-5 h-5 text-blue-600" />
      </div>
    </div>
  );
};
