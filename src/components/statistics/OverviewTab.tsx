import React from "react";
import {
  Info,
  AlertTriangle,
  TrendingDown,
  ArrowRight,
  ChevronRight
} from "lucide-react";
import { PropertyStatus } from "../../core/models/enums";
import { HeadlineKpiState } from "../../core/statistics/statistics-model";
import { InventoryData } from "../../core/statistics/inventory-calculator";
import { PerformanceResult } from "../../core/statistics/performance-calculator";
import { RadarOpportunityResult } from "../../core/statistics/radar/radar-models";
import { PriceTableResult } from "../../core/statistics/price-table-calculator";
import { DataQualitySummary } from "../../core/statistics/data-quality-calculator";
import { DrillDownFilter, DrillDownSource } from "../../core/statistics/drill-down-filter";
import { IssueType } from "../../core/statistics/issue-type";
import {
  StatisticsFilter,
  VerifiedMode
} from "../../core/statistics/statistics-filter";

export interface OverviewTabProps {
  inventoryData: InventoryData | null;
  headlineKpiState?: HeadlineKpiState;
  performanceResult?: PerformanceResult | null;
  radarResult: RadarOpportunityResult | null;
  priceTableResult: PriceTableResult | null;
  filter: StatisticsFilter;
  dataQualitySummary: DataQualitySummary | null;
  issueCount: number;
  isLoading: boolean;
  errorMessage: string | null;
  unverifiedPendingCount?: number;
  unverifiedPendingFilter?: DrillDownFilter | null;
  onNavigateToMarket: () => void;
  onNavigateToActionCenter: () => void;
  onDrillDown: (filter: DrillDownFilter) => void;
  onNavigateToPriceDrops?: () => void;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  inventoryData,
  headlineKpiState = {
    forSaleCount: 0,
    forSaleFilter: null,
    forSaleSubtitle: "căn hiện có",
    soldCount: 0,
    soldFilter: null,
    soldTitle: "Đã bán",
    soldSubtitle: "tổng số tin đã bán"
  },
  radarResult,
  priceTableResult,
  filter,
  dataQualitySummary,
  issueCount,
  isLoading,
  errorMessage,
  unverifiedPendingCount = 0,
  unverifiedPendingFilter = null,
  onNavigateToMarket,
  onNavigateToActionCenter,
  onDrillDown,
  onNavigateToPriceDrops
}) => {
  // Loading state
  if (isLoading && inventoryData == null) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-500">
        <div className="animate-spin w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full" />
        <span className="text-xs font-medium mt-3">Đang tải dữ liệu tổng quan…</span>
      </div>
    );
  }

  // Error state
  if (errorMessage != null && inventoryData == null) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-red-800">
        <h3 className="text-sm font-bold">Lỗi tải dữ liệu</h3>
        <p className="text-xs mt-1 text-red-600">{errorMessage}</p>
      </div>
    );
  }

  const totalInventory = inventoryData?.totalInventory ?? 0;
  const forSaleCount = headlineKpiState.forSaleCount;
  const soldCount = headlineKpiState.soldCount;

  // Empty state
  if (totalInventory === 0 && forSaleCount === 0 && soldCount === 0) {
    return (
      <div className="p-6 bg-slate-100 border border-slate-200 rounded-2xl text-center">
        <Info className="w-8 h-8 text-slate-400 mx-auto mb-2" />
        <h3 className="text-sm font-bold text-slate-800">Chưa có dữ liệu kho hàng</h3>
        <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
          Không tìm thấy bất động sản nào trong bộ lọc hiện tại.
        </p>
      </div>
    );
  }

  const isDefaultFilter =
    filter.dateRange.type === "ALL_TIME" &&
    !filter.area &&
    !filter.propertyType &&
    !filter.status &&
    filter.priceMin == null &&
    filter.priceMax == null &&
    filter.areaSizeMin == null &&
    filter.areaSizeMax == null;

  const medianLabel = isDefaultFilter
    ? "Median kho đang bán"
    : "Median kho đang bán trong bộ lọc";

  const medianPriceText =
    priceTableResult?.overallMedianPricePerM2 != null
      ? `${(priceTableResult.overallMedianPricePerM2 * 1000.0).toFixed(1)} tr/m²`
      : "-- tr/m²";

  const topOpportunity =
    radarResult && radarResult.type === "SUCCESS" && radarResult.topOpportunities.length > 0
      ? radarResult.topOpportunities[0]
      : null;

  const agingOver90 = inventoryData?.agingBuckets?.daysOver90 ?? 0;
  const missingGpsCount = dataQualitySummary?.issuesByType?.[IssueType.MISSING_GPS.name] ?? 0;

  return (
    <div className="space-y-4">
      {/* 1. Headline KPI Cards (Đang bán & Đã bán) */}
      <div className="grid grid-cols-2 gap-3">
        {/* Card 1: Đang bán */}
        <div
          onClick={() => {
            if (headlineKpiState.forSaleFilter) {
              onDrillDown(headlineKpiState.forSaleFilter);
            }
          }}
          className={`p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs transition-all ${
            headlineKpiState.forSaleFilter
              ? "cursor-pointer hover:border-blue-300 hover:shadow-xs active:scale-[0.99]"
              : ""
          }`}
        >
          <div className="text-xs font-bold text-slate-700">Đang bán</div>
          <div className="text-2xl font-black text-blue-600 mt-1.5">
            {headlineKpiState.forSaleCount}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {headlineKpiState.forSaleSubtitle}
          </div>
        </div>

        {/* Card 2: Đã bán */}
        <div
          onClick={() => {
            if (headlineKpiState.soldFilter) {
              onDrillDown(headlineKpiState.soldFilter);
            }
          }}
          className={`p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs transition-all ${
            headlineKpiState.soldFilter
              ? "cursor-pointer hover:border-blue-300 hover:shadow-xs active:scale-[0.99]"
              : ""
          }`}
        >
          <div className="text-xs font-bold text-slate-700 truncate">
            {headlineKpiState.soldTitle}
          </div>
          <div className="text-2xl font-black text-blue-600 mt-1.5">
            {headlineKpiState.soldCount}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5 truncate">
            {headlineKpiState.soldSubtitle}
          </div>
        </div>
      </div>

      {/* 2. Median Price Card */}
      <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs">
        <div className="text-2xl font-black text-blue-600">{medianPriceText}</div>
        <div className="text-xs text-slate-500 mt-0.5 font-medium">{medianLabel}</div>
      </div>

      {/* 3. Section: Đáng chú ý (Top 1 opportunity) */}
      <div>
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 px-1">
          Đáng chú ý
        </h3>
        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs">
          {topOpportunity ? (
            <div>
              <div className="text-sm font-bold text-slate-900">
                {topOpportunity.areaDisplayName} · {topOpportunity.propertyTypeDisplayName}
              </div>
              <div className="text-xs text-slate-600 mt-1.5">
                {topOpportunity.priceDeviationPercent != null ? (
                  <>
                    <span>
                      {topOpportunity.priceDeviationPercent < 0 ? "↓" : "↑"}
                      {Math.abs(topOpportunity.priceDeviationPercent).toFixed(1)}% mặt bằng
                    </span>
                  </>
                ) : (
                  <span>Giá sát mặt bằng</span>
                )}
                {topOpportunity.soldRatioProxy != null && (
                  <span> · thanh khoản {Math.round(topOpportunity.soldRatioProxy * 100.0)}%</span>
                )}
              </div>
              <div className="flex justify-end mt-3">
                <button
                  type="button"
                  onClick={onNavigateToMarket}
                  className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800 cursor-pointer"
                >
                  <span>Xem thị trường</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <div className="text-xs text-slate-500">
              Chưa đủ dữ liệu để xác định cơ hội nổi bật trong bộ lọc hiện tại.
            </div>
          )}
        </div>
      </div>

      {/* 4. Section: Cần làm (Action Center Summary & Aging) */}
      <div>
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 px-1">
          Cần làm
        </h3>
        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs divide-y divide-slate-100">
          {/* Tin chờ xác minh row */}
          {unverifiedPendingCount > 0 && (
            <div
              onClick={() => {
                if (unverifiedPendingFilter) {
                  onDrillDown(unverifiedPendingFilter);
                }
              }}
              className="py-2.5 first:pt-0 flex items-center justify-between cursor-pointer hover:bg-slate-50/80 -mx-2 px-2 rounded-lg transition-colors"
            >
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-amber-500 shrink-0" />
                <span className="text-xs font-medium text-slate-800">
                  {unverifiedPendingCount} tin chờ xác minh
                </span>
              </div>
              <div className="flex items-center gap-1 text-xs font-bold text-blue-600">
                <span>Duyệt</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </div>
            </div>
          )}

          {/* Aging > 90 days row */}
          <div
            onClick={() => {
              onDrillDown(
                new DrillDownFilter({
                  source: DrillDownSource.AGING_BUCKET,
                  contextLabel: "Tồn kho trên 90 ngày",
                  minAgeDays: 91,
                  verifiedMode: VerifiedMode.VERIFIED_ONLY,
                  targetStatus: PropertyStatus.FOR_SALE
                })
              );
            }}
            className="py-2.5 flex items-center justify-between cursor-pointer hover:bg-slate-50/80 -mx-2 px-2 rounded-lg transition-colors"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
              <span className="text-xs font-medium text-slate-800">
                {agingOver90} căn tồn trên 90 ngày
              </span>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </div>

          {/* Missing GPS row */}
          {missingGpsCount > 0 && (
            <div
              onClick={onNavigateToActionCenter}
              className="py-2.5 flex items-center justify-between cursor-pointer hover:bg-slate-50/80 -mx-2 px-2 rounded-lg transition-colors"
            >
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-sky-500 shrink-0" />
                <span className="text-xs font-medium text-slate-800">
                  {missingGpsCount} căn thiếu GPS
                </span>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </div>
          )}

          {/* Bottom link to Action Center */}
          <div className="pt-3 flex justify-end">
            <button
              type="button"
              onClick={onNavigateToActionCenter}
              className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800 cursor-pointer"
            >
              <span>
                Xem {issueCount > 0 ? `${issueCount} mục` : "các việc"} cần xử lý
              </span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* 5. Section: Giá vừa giảm */}
      <div>
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 px-1">
          Tín hiệu giá
        </h3>
        <div
          onClick={() => onNavigateToPriceDrops?.()}
          className="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs hover:border-blue-300 transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-red-500" />
              <span className="text-sm font-bold text-slate-900">Giá vừa giảm</span>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Theo dõi các BĐS vừa điều chỉnh giảm giá gần đây để kịp thời nắm bắt cơ hội thương lượng.
          </p>
          <div className="flex justify-end mt-3">
            <span className="text-xs font-bold text-blue-600 flex items-center gap-1">
              <span>Xem danh sách giá vừa giảm</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
