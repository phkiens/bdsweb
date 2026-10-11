import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Filter, Share2, RefreshCw } from "lucide-react";
import { db } from "../../data/local/db";
import { CustomerPropertyRole } from "../../core/models/enums";
import { PropertyWithOwner } from "../../core/statistics/owner-performance-calculator";
import {
  StatisticsFilter,
  VerifiedMode
} from "../../core/statistics/statistics-filter";
import {
  StatisticsModel,
  StatisticsUiState
} from "../../core/statistics/statistics-model";
import { StatisticsSummaryExporter } from "../../core/statistics/statistics-summary-exporter";
import { DrillDownFilter } from "../../core/statistics/drill-down-filter";
import { createDrillDownUrl } from "../../core/statistics/drill-down-query";
import { getVisibleHistories } from "../../core/statistics/drill-down-applier";
import { OverviewTab } from "../../components/statistics/OverviewTab";
import { MarketTab } from "../../components/statistics/MarketTab";
import { StatisticsFilterModal } from "../../components/statistics/StatisticsFilterModal";
import { useLivestream } from "../../core/live/use-livestream";
import { LivestreamBadge } from "../../components/live/LivestreamBadge";

export const StatisticsPage: React.FC = () => {
  const navigate = useNavigate();
  const { isLive } = useLivestream();

  const [selectedTabIndex, setSelectedTabIndex] = useState<number>(0);
  const [filter, setFilter] = useState<StatisticsFilter>(() => new StatisticsFilter());
  const [showFilterModal, setShowFilterModal] = useState<boolean>(false);
  const [retryTrigger, setRetryTrigger] = useState<number>(0);

  // 4. Dexie reactive query with "now" timestamp captured inside query function (no Date.now() in render)
  const queryData = useLiveQuery(
    async () => {
      const now = Date.now();
      const allProperties = await db.properties.filter((p) => !p.isDeleted).toArray();
      const allCustomers = await db.customers.filter((c) => !c.isDeleted).toArray();
      const allLinks = await db.customer_property_links.filter((l) => !l.isDeleted).toArray();
      const allRawHistories = await db.price_histories.toArray();

      const customerMap = new Map(allCustomers.map((c) => [c.id, c]));
      const ownerLinksByProp = new Map<string, typeof allLinks>();
      for (const link of allLinks) {
        if (
          link.role === "OWNER" ||
          link.role === CustomerPropertyRole.OWNER
        ) {
          const list = ownerLinksByProp.get(link.propertyId) ?? [];
          list.push(link);
          ownerLinksByProp.set(link.propertyId, list);
        }
      }

      const propertiesWithOwner: PropertyWithOwner[] = allProperties.map((p) => {
        const links = ownerLinksByProp.get(p.id) ?? [];
        const owners = links
          .map((l) => customerMap.get(l.customerId))
          .filter((c): c is typeof allCustomers[0] => Boolean(c && !c.isDeleted));
        const ownerCount = owners.length;
        return {
          property: p,
          ownerCount,
          ownerId: ownerCount === 1 ? owners[0].id : null,
          ownerName: ownerCount === 1 ? owners[0].name : null
        };
      });

      const visibleHistories = getVisibleHistories(allRawHistories, allProperties);

      return {
        now,
        allProperties,
        propertiesWithOwner,
        visibleHistories
      };
    },
    [retryTrigger]
  );

  // Pure snapshot calculation using domain StatisticsModel.calculateSnapshot
  const uiState: StatisticsUiState = useMemo(() => {
    if (!queryData) {
      return StatisticsModel.createDefaultUiState();
    }
    return StatisticsModel.calculateSnapshot({
      allProperties: queryData.allProperties,
      propertiesWithOwner: queryData.propertiesWithOwner,
      filter,
      selectedTabIndex,
      now: queryData.now
    });
  }, [queryData, filter, selectedTabIndex]);

  // Handle drill-down navigation to /properties or /unverified
  const handleDrillDown = (drillDownFilter: DrillDownFilter) => {
    if (drillDownFilter.verifiedMode === VerifiedMode.UNVERIFIED_ONLY) {
      navigate(createDrillDownUrl("/unverified", drillDownFilter));
    } else {
      navigate(createDrillDownUrl("/properties", drillDownFilter));
    }
  };

  // Handle share / export report
  const handleShare = async () => {
    if (uiState.snapshotTimeMillis <= 0 || uiState.isLoading) return;
    try {
      const summary = StatisticsSummaryExporter.export(
        uiState,
        uiState.snapshotTimeMillis,
        isLive
      );

      if (navigator.share) {
        try {
          await navigator.share({
            title: "Báo cáo Thống kê BĐS",
            text: summary
          });
          return;
        } catch {
          // User cancelled or share rejected -> fallback
        }
      }

      if (navigator.clipboard) {
        try {
          await navigator.clipboard.writeText(summary);
          alert("Đã sao chép báo cáo thống kê vào bộ nhớ tạm!");
          return;
        } catch {
          // Fallback to file download
        }
      }

      // Download text file fallback
      const blob = new Blob([summary], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bao-cao-thong-ke-${new Date(uiState.snapshotTimeMillis).toISOString().slice(0, 10)}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert("Không thể xuất báo cáo: " + (err?.message || "Lỗi không xác định"));
    }
  };

  const handleOpenSegment = (areaKey: string, propertyTypeKey: string) => {
    navigate(
      `/radar/${encodeURIComponent(areaKey)}/${encodeURIComponent(propertyTypeKey)}`
    );
  };

  const tabTitles = ["Tổng quan", "Thị trường"];

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-4 py-3 sm:py-4 pb-24 md:pb-12 space-y-4">
      {/* Top App Bar matching Android TopAppBar */}
      <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="p-2 -ml-1 text-slate-600 hover:text-slate-900 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
            title="Quay lại"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold text-slate-900 truncate flex items-center gap-2">
            <span>Báo cáo thống kê</span>
            <LivestreamBadge />
          </h1>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setShowFilterModal(true)}
            className="p-2 text-slate-600 hover:text-slate-900 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
            title="Bộ lọc"
          >
            <Filter className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={handleShare}
            disabled={uiState.snapshotTimeMillis <= 0 || uiState.isLoading}
            className="p-2 text-slate-600 hover:text-slate-900 disabled:text-slate-300 disabled:hover:bg-transparent rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
            title="Xuất báo cáo"
          >
            <Share2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Tabs Header: 2 Tabs strictly (Tổng quan / Thị trường) */}
      <div className="flex border-b border-slate-200">
        {tabTitles.map((title, idx) => {
          const isSelected = selectedTabIndex === idx;
          return (
            <button
              key={title}
              type="button"
              onClick={() => setSelectedTabIndex(idx)}
              className={`flex-1 py-3 text-xs sm:text-sm font-bold border-b-2 transition-all cursor-pointer ${
                isSelected
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {title}
            </button>
          );
        })}
      </div>

      {/* Global Error Message Banner if error exists */}
      {uiState.errorMessage != null && !uiState.isLoading && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between text-xs text-red-700 animate-in fade-in">
          <span>{uiState.errorMessage}</span>
          <button
            type="button"
            onClick={() => setRetryTrigger((r) => r + 1)}
            className="inline-flex items-center gap-1 font-bold text-red-800 hover:underline cursor-pointer ml-2 shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Thử lại</span>
          </button>
        </div>
      )}

      {/* Tab Contents */}
      {selectedTabIndex === 0 && (
        <OverviewTab
          inventoryData={uiState.inventoryData}
          headlineKpiState={uiState.headlineKpiState}
          performanceResult={uiState.performanceResult}
          radarResult={uiState.radarOpportunityResult}
          priceTableResult={uiState.priceTableResult}
          filter={uiState.filter}
          dataQualitySummary={uiState.dataQualitySummary}
          issueCount={uiState.actionItems.length}
          isLoading={uiState.isLoading}
          errorMessage={uiState.errorMessage}
          unverifiedPendingCount={uiState.unverifiedPendingCount}
          unverifiedPendingFilter={uiState.unverifiedPendingFilter}
          onNavigateToMarket={() => setSelectedTabIndex(1)}
          onNavigateToActionCenter={() => navigate("/action-center")}
          onDrillDown={handleDrillDown}
          onNavigateToPriceDrops={() => navigate("/price-drops")}
        />
      )}

      {selectedTabIndex === 1 && (
        <MarketTab
          radarResult={uiState.radarOpportunityResult}
          ownerPerformanceResult={uiState.ownerPerformanceResult}
          isLoading={uiState.isLoading}
          errorMessage={uiState.errorMessage}
          onRetry={() => setRetryTrigger((r) => r + 1)}
          onOpenSegment={handleOpenSegment}
          onNavigateToOwnerPerformance={() => navigate("/owner-performance")}
        />
      )}

      {/* Statistics Filter Modal */}
      {showFilterModal && (
        <StatisticsFilterModal
          isOpen={showFilterModal}
          currentFilter={filter}
          onDismiss={() => setShowFilterModal(false)}
          onApply={(newFilter) => setFilter(newFilter)}
        />
      )}
    </div>
  );
};
