import React, { useState, useMemo, useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate, useSearchParams } from "react-router-dom";
import { decodeDrillDownQuery } from "../../core/statistics/drill-down-query";
import { applyDrillDownFilter } from "../../core/statistics/drill-down-applier";
import { mediaService } from "../../data/media/media-service";
import {
  Search,
  Filter,
  Calendar,
  Plus,
  Trash2,
  X,
  CheckSquare,
  Square,
  Bell
} from "lucide-react";
import { db } from "../../data/local/db";
import { syncManager } from "../../data/sync/sync-manager";
import { Property } from "../../core/models/property";
import {
  PropertyStatus,
  FilterScope,
  PropertyListMode,
  PropertySortType
} from "../../core/models/enums";
import { liveFeedPrefs } from "../../core/live/live-feed-prefs";
import { liveEventBus } from "../../core/live/live-event-bus";
import { LiveListScroll } from "../../core/live/live-list-scroll";
import { LiveFeedBuilder } from "../../core/live/live-feed";
import { getVisibleHistories } from "../../data/local/price-history-queries";
import {
  FilterState,
  PropertyFilter,
  sortProperties
} from "../../core/engine/property-filter";
import { PropertyCard } from "../../components/properties/PropertyCard";
import { PropertyFilterBottomSheet } from "../../components/properties/PropertyFilterBottomSheet";
import { ConfirmModal } from "../../components/common/ConfirmModal";
import { MultiSelectBottomBar } from "../../components/common/MultiSelectBottomBar";
import { useHideBottomNavWhile } from "../../components/common/bottom-nav-visibility";
import { useLivestream } from "../../core/live/use-livestream";
import { LivestreamBadge } from "../../components/live/LivestreamBadge";
import {
  MapSurveyRoute,
  getMapNavigationMessage
} from "../../core/engine/map-survey-route";
import {
  createDefaultFilterState,
  loadPropertyListState,
  savePropertyListState
} from "../../core/utils/property-list-state";

export const PropertyListPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const drilldownRaw = searchParams.get("drilldown");
  const drillDownFilter = useMemo(() => {
    if (!drilldownRaw) return null;
    return decodeDrillDownQuery(searchParams);
  }, [drilldownRaw, searchParams]);

  // Read persisted view state once through lazy initial state (W004)
  const [initialViewState] = useState(() => loadPropertyListState());

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState(initialViewState.searchQuery);
  const [viewTodayOnly, setViewTodayOnly] = useState(initialViewState.viewTodayOnly);
  const [showFilterBottomSheet, setShowFilterBottomSheet] = useState(false);
  const [filterState, setFilterState] = useState<FilterState>(initialViewState.filterState);

  // Persist view state whenever search query, today toggle, or filter state changes
  useEffect(() => {
    savePropertyListState({
      searchQuery,
      viewTodayOnly,
      filterState
    });
  }, [searchQuery, viewTodayOnly, filterState]);

  // Multi-select state
  const [isMultiSelect, setIsMultiSelect] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  // Ẩn thanh điều hướng đáy khi đang chọn nhiều
  useHideBottomNavWhile(isMultiSelect && selectedIds.size > 0);

  // FAB position state (BEH-PROP-008: Chuyển đổi vị trí FAB trái/phải hỗ trợ thao tác một tay)
  const [fabPosition, setFabPosition] = useState<"left" | "right">(() => {
    try {
      return (localStorage.getItem("bds_fab_position") as "left" | "right") || "right";
    } catch {
      return "right";
    }
  });

  const toggleFabPosition = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = fabPosition === "right" ? "left" : "right";
    setFabPosition(next);
    try {
      localStorage.setItem("bds_fab_position", next);
    } catch {
      // ignore
    }
  };

  // Reactive query from Dexie IndexedDB
  const properties = useLiveQuery(async () => {
    return await db.properties
      .filter((p) => !p.isDeleted && (filterState.scope === FilterScope.ALL ? true : p.isVerified))
      .toArray();
  }, [filterState.scope]);

  const { isLive } = useLivestream();

  // Derived filtered & sorted properties (ranked with Owner Match parity)
  const rankedResults = useMemo(() => {
    if (!properties) return { items: [], ownerMatchStart: -1 };
    const allowOwner = !isLive;
    let matched = properties.filter((p) =>
      PropertyFilter.matches(
        p,
        filterState,
        searchQuery,
        viewTodayOnly,
        PropertyListMode.VERIFIED,
        allowOwner
      )
    );
    if (drillDownFilter) {
      matched = applyDrillDownFilter(matched, drillDownFilter);
    }
    const sorted = sortProperties(matched, filterState.sortBy);
    return PropertyFilter.rankSearchResults(sorted, searchQuery, allowOwner);
  }, [properties, filterState, searchQuery, viewTodayOnly, drillDownFilter, isLive]);

  const filteredProperties = rankedResults.items;
  const ownerMatchStart = rankedResults.ownerMatchStart;

  // Cuộn về đầu trang khi đổi từ khóa tìm kiếm
  useEffect(() => {
    if (searchQuery.trim()) {
      window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    }
  }, [searchQuery]);

  // Batch preload media metadata for properties in current view (up to 100) to avoid N+1 RPC queries
  useEffect(() => {
    if (filteredProperties && filteredProperties.length > 0) {
      mediaService.preloadPropertiesMedia(filteredProperties.slice(0, 100));
    }
  }, [filteredProperties]);

  // Livestream: tính số tin chưa ẩn trên chuông thông báo
  const liveFeedData = useLiveQuery(async () => {
    if (!isLive) return 0;
    const allProps = await db.properties.filter((p) => !p.isDeleted).toArray();
    const allHist = await getVisibleHistories();
    const hidden = liveFeedPrefs.hiddenKeys();
    const feed = LiveFeedBuilder.build(allProps, allHist, Date.now(), hidden);
    return feed.length;
  }, [isLive]);
  const liveFeedCount = liveFeedData ?? 0;

  // Livestream: tự cuộn lên đầu khi có sự kiện lúc ở sát đầu và không tìm kiếm
  useEffect(() => {
    if (!isLive) return;
    let lastSeq = liveEventBus.latestSeq();
    return liveEventBus.subscribe((hist) => {
      const newest = hist[hist.length - 1];
      if (!newest || (newest.seq ?? 0) <= lastSeq) return;
      lastSeq = newest.seq ?? 0;

      const scrollTop = window.scrollY || document.documentElement.scrollTop || 0;
      const canAuto = LiveListScroll.shouldAutoScroll(scrollTop, searchQuery);
      const isDefaultSort =
        !filterState.sortBy || filterState.sortBy === PropertySortType.NEWEST;
      if (canAuto && isDefaultSort) {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  }, [isLive, searchQuery, filterState.sortBy]);

  const distinctAreas = useMemo(() => {
    if (!properties) return [];
    const set = new Set<string>();
    properties.forEach((p) => {
      if (p.area && p.area.trim()) set.add(p.area.trim());
    });
    return Array.from(set).sort();
  }, [properties]);

  const activeFilterCount = useMemo(() => {
    return PropertyFilter.activeFilterCount(filterState);
  }, [filterState]);

  const handleResetFilter = () => {
    setFilterState(createDefaultFilterState());
    setSearchQuery("");
    setViewTodayOnly(false);
  };

  const handleToggleNeedToViewToday = async (e: React.MouseEvent, p: Property) => {
    e.stopPropagation();
    const nextVal = !p.needToViewToday;
    const now = Date.now();
    await db.properties.update(p.id, {
      needToViewToday: nextVal,
      updatedAt: now,
      isTextSynced: false
    });
    await db.enqueueOutbox("PROPERTY", p.id, "UPSERT");
    syncManager.pushChanges();
  };

  const handleToggleStatus = async (e: React.MouseEvent, p: Property) => {
    e.stopPropagation();
    const nextStatus =
      p.status === PropertyStatus.FOR_SALE ? PropertyStatus.PAUSED : PropertyStatus.FOR_SALE;
    const now = Date.now();
    await db.properties.update(p.id, {
      status: nextStatus,
      updatedAt: now,
      isTextSynced: false
    });
    await db.enqueueOutbox("PROPERTY", p.id, "UPSERT");
    syncManager.pushChanges();
  };

  const handleToggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const handleSelectAll = () => {
    if (selectedIds.size === filteredProperties.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredProperties.map((p) => p.id)));
    }
  };

  const handleConfirmDeleteSelected = async () => {
    if (selectedIds.size === 0) return;

    const now = Date.now();
    await db.transaction("rw", [db.properties, db.sync_outbox], async () => {
      for (const id of selectedIds) {
        await db.properties.update(id, {
          isDeleted: true,
          updatedAt: now,
          isTextSynced: false
        });
        await db.enqueueOutbox("PROPERTY", id, "DELETE");
      }
    });
    syncManager.pushChanges();
    setSelectedIds(new Set());
    setIsMultiSelect(false);
    setConfirmDeleteOpen(false);
  };

  const handleShowOnMap = () => {
    if (!properties) return;
    const orderedSelected = properties.filter((p) => selectedIds.has(p.id));
    const result = MapSurveyRoute.build(orderedSelected);
    const msg = getMapNavigationMessage(result);
    if (msg) {
      alert(msg);
    }
    if (result.type === "success") {
      navigate(result.route);
    }
  };

  if (properties === undefined) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  const isAllSelected =
    filteredProperties.length > 0 && selectedIds.size === filteredProperties.length;

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-4 py-3 sm:py-4 pb-24 md:pb-12">
      {/* Top Controls Header - PARITY-PROP-004: Responsive mobile ergonomics */}
      <div className="flex flex-col gap-2.5 mb-3">
        {/* On mobile: Row 1 is full-width Search Box; Row 2 is button actions. On tablet/desktop: 1 clean row */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          {/* Search Box - Chiếm trọn chiều ngang trên mobile tránh bị ép nhỏ */}
          <div className="relative flex-1 min-w-0">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Khu vực, chủ, SĐT, giá..."
              className="w-full pl-9 pr-8 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-hidden shadow-2xs transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                title="Xóa tìm kiếm"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Action Buttons Row */}
          <div className="flex items-center gap-1.5 shrink-0 justify-between sm:justify-start">
            {/* View Today toggle button */}
            <button
              onClick={() => setViewTodayOnly(!viewTodayOnly)}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                viewTodayOnly
                  ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
              }`}
              title="Lọc BĐS cần khảo sát hôm nay"
            >
              <Calendar className="w-4 h-4" />
              <span>Hôm nay</span>
            </button>

            {/* Filter Drawer Toggle - PARITY-PROP-003: Mở BottomSheet thay vì đẩy layout */}
            <button
              onClick={() => setShowFilterBottomSheet(true)}
              className={`flex-1 sm:flex-initial relative flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                activeFilterCount > 0
                  ? "bg-blue-50 text-blue-700 border-blue-300 shadow-2xs"
                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
              }`}
              title="Mở bộ lọc nâng cao"
            >
              <Filter className="w-4 h-4" />
              <span>Bộ lọc</span>
              {activeFilterCount > 0 && (
                <span className="ml-0.5 px-1.5 py-0.2 bg-blue-600 text-white text-[10px] font-bold rounded-full">
                  {activeFilterCount}
                </span>
              )}
            </button>

            {/* Multi-Select Toggle */}
            <button
              onClick={() => {
                setIsMultiSelect(!isMultiSelect);
                setSelectedIds(new Set());
              }}
              className={`flex-1 sm:flex-initial px-3 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                isMultiSelect
                  ? "bg-slate-800 text-white border-slate-800 shadow-2xs"
                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
              }`}
            >
              {isMultiSelect ? "Hủy chọn" : "Chọn nhiều"}
            </button>
          </div>
        </div>
      </div>

      {/* Drill-down Banner */}
      {Boolean(drilldownRaw) && (
        <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-semibold text-blue-900 truncate">
              {drillDownFilter
                ? `Đang xem từ Thống kê (${drillDownFilter.contextLabel})`
                : "Dữ liệu bộ lọc không hợp lệ."}
            </span>
          </div>
          <button
            onClick={() => {
              searchParams.delete("drilldown");
              setSearchParams(searchParams, { replace: true });
            }}
            className="text-xs font-bold text-blue-700 hover:text-blue-900 px-2 py-1 rounded-md hover:bg-blue-100 transition-colors shrink-0 cursor-pointer"
          >
            Xóa lọc
          </button>
        </div>
      )}

      {/* Multi-Select Action Bar */}
      {isMultiSelect && (
        <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-3">
            <button
              onClick={handleSelectAll}
              className="flex items-center gap-1.5 text-xs font-semibold text-blue-800 hover:text-blue-950 cursor-pointer"
            >
              {isAllSelected ? (
                <CheckSquare className="w-4 h-4 text-blue-600" />
              ) : (
                <Square className="w-4 h-4 text-slate-400" />
              )}
              <span>{isAllSelected ? "Bỏ chọn tất cả" : "Chọn tất cả"}</span>
            </button>
            <span className="text-xs text-blue-700 font-medium">
              Đã chọn <strong>{selectedIds.size}</strong> BĐS
            </span>
          </div>

          {selectedIds.size > 0 && (
            <button
              onClick={() => setConfirmDeleteOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Xóa ({selectedIds.size})</span>
            </button>
          )}
        </div>
      )}

      {/* Counter Summary */}
      <div className="flex items-center justify-between text-xs text-slate-500 mb-2 px-1">
        <div className="flex items-center gap-2">
          <span>
            Hiển thị <strong>{filteredProperties.length}</strong> / {properties.length} BĐS{" "}
            {filterState.scope === FilterScope.ALL ? "(Tất cả)" : "chính thức"}
          </span>
          <LivestreamBadge />
          {isLive && (
            <button
              type="button"
              data-testid="live_feed_button"
              onClick={() => navigate("/live-feed")}
              className="relative p-1.5 rounded-full text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
              title="Tin mới"
            >
              <Bell className="w-4 h-4" />
              {liveFeedCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center leading-none">
                  {liveFeedCount > 9 ? "9+" : liveFeedCount}
                </span>
              )}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {viewTodayOnly && (
            <span className="text-blue-600 font-medium">Đang lọc xem hôm nay</span>
          )}
          {activeFilterCount > 0 && (
            <button
              onClick={handleResetFilter}
              className="text-red-500 hover:text-red-700 underline font-medium cursor-pointer"
            >
              Xóa bộ lọc ({activeFilterCount})
            </button>
          )}
        </div>
      </div>

      {/* Property Cards List - Đạt parity mật độ cao 76dp như Native Compose */}
      {filteredProperties.length === 0 ? (
        <div className="text-center py-16 px-4 bg-white border border-slate-200 rounded-2xl shadow-xs">
          <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
            <Search className="w-6 h-6" />
          </div>
          <h4 className="text-base font-semibold text-slate-700">Không tìm thấy bất động sản nào</h4>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            {searchQuery || viewTodayOnly || activeFilterCount > 0
              ? "Hãy thử nới lỏng bộ lọc hoặc từ khóa tìm kiếm."
              : "Bấm nút bên dưới để thêm BĐS đầu tiên vào kho."}
          </p>
          {(searchQuery || viewTodayOnly || activeFilterCount > 0) && properties.length > 0 ? (
            <div className="flex flex-col sm:flex-row gap-2 justify-center mt-4">
              <button
                onClick={handleResetFilter}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition-colors cursor-pointer"
              >
                <span>Xem tất cả {properties.length} BĐS (Bỏ bộ lọc)</span>
              </button>
              <button
                onClick={() => navigate("/properties/new")}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Thêm BĐS mới</span>
              </button>
            </div>
          ) : (
            <button
              onClick={() => navigate("/properties/new")}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Thêm BĐS mới</span>
            </button>
          )}
        </div>
      ) : (
        /* Danh sách phẳng có đường phân cách mỏng (Continuous Flat List matching Native) */
        <div className="bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-hidden divide-y divide-slate-100">
          {filteredProperties.map((p, index) => {
            const isSelected = selectedIds.has(p.id);
            return (
              <React.Fragment key={p.id}>
                {index === ownerMatchStart && (
                  <div className="w-full px-4 py-2 bg-blue-50/70 text-blue-700 text-xs font-semibold">
                    Khớp tên chủ ({filteredProperties.length - ownerMatchStart})
                  </div>
                )}
                <PropertyCard
                  property={p}
                  onClick={() => {
                    if (isLive) {
                      liveFeedPrefs.hide(`new:${p.id}`, p.createdAt);
                    }
                    navigate(`/properties/${p.id}`);
                  }}
                  isMultiSelectMode={isMultiSelect}
                  isSelected={isSelected}
                  onToggleSelect={() => handleToggleSelect(p.id)}
                  onToggleNeedToViewToday={(e) => handleToggleNeedToViewToday(e, p)}
                  onToggleStatus={(e) => handleToggleStatus(e, p)}
                />
              </React.Fragment>
            );
          })}
        </div>
      )}

      {/* Floating Action Button with Left/Right repositioning for one-handed operation (BEH-PROP-008) */}
      <div
        className={`fixed bottom-20 md:bottom-8 ${
          fabPosition === "left" ? "left-6" : "right-6"
        } z-40 flex items-center gap-1.5 transition-all duration-200`}
      >
        {fabPosition === "right" && (
          <button
            onClick={toggleFabPosition}
            className="w-6 h-6 rounded-full bg-white/90 hover:bg-white text-slate-500 hover:text-slate-800 shadow-md border border-slate-200 flex items-center justify-center text-[11px] font-bold cursor-pointer"
            title="Chuyển nút sang mép trái (thao tác 1 tay)"
          >
            ←
          </button>
        )}

        <button
          onClick={() => navigate("/properties/new")}
          className="w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-xl flex items-center justify-center transition-transform hover:scale-105 active:scale-95 cursor-pointer"
          title="Thêm BĐS mới"
        >
          <Plus className="w-7 h-7" />
        </button>

        {fabPosition === "left" && (
          <button
            onClick={toggleFabPosition}
            className="w-6 h-6 rounded-full bg-white/90 hover:bg-white text-slate-500 hover:text-slate-800 shadow-md border border-slate-200 flex items-center justify-center text-[11px] font-bold cursor-pointer"
            title="Chuyển nút sang mép phải"
          >
            →
          </button>
        )}
      </div>

      {/* Property Filter BottomSheet (PARITY-PROP-003) */}
      <PropertyFilterBottomSheet
        isOpen={showFilterBottomSheet}
        filterState={filterState}
        onFilterChange={setFilterState}
        onClose={() => setShowFilterBottomSheet(false)}
        onResetFilter={handleResetFilter}
        distinctAreas={distinctAreas}
        onSelectArea={(area) => {
          setFilterState((prev) => ({
            ...prev,
            areas: new Set([...(prev.areas || []), area])
          }));
        }}
        filteredCount={filteredProperties.length}
      />

      {/* Modal xác nhận xóa hàng loạt */}
      <ConfirmModal
        isOpen={confirmDeleteOpen}
        title="Xác nhận xóa bất động sản"
        message={`Bạn có chắc chắn muốn xóa ${selectedIds.size} bất động sản đã chọn?\nThao tác này sẽ đánh dấu xóa và đồng bộ lên đám mây.`}
        confirmText="Xóa BĐS"
        cancelText="Hủy"
        variant="danger"
        onConfirm={handleConfirmDeleteSelected}
        onCancel={() => setConfirmDeleteOpen(false)}
      />

      {/* Thanh chọn nhiều đáy dùng chung: Xem trên bản đồ (N) */}
      {isMultiSelect && selectedIds.size > 0 && (
        <MultiSelectBottomBar
          count={selectedIds.size}
          onShowOnMap={handleShowOnMap}
        />
      )}
    </div>
  );
};
