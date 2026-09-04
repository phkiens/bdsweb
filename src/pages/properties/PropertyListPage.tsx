import React, { useState, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate } from "react-router-dom";
import {
  Search,
  Filter,
  Calendar,
  Plus,
  Trash2,
  X,
  CheckSquare,
  Square
} from "lucide-react";
import { db } from "../../data/local/db";
import { syncManager } from "../../data/sync/sync-manager";
import { Property } from "../../core/models/property";
import {
  PropertyStatus,
  PropertySortType,
  FilterScope,
  PropertyListMode
} from "../../core/models/enums";
import {
  FilterState,
  PropertyFilter,
  sortProperties
} from "../../core/engine/property-filter";
import { PropertyCard } from "../../components/properties/PropertyCard";
import { PropertyFilterBottomSheet } from "../../components/properties/PropertyFilterBottomSheet";
import { ConfirmModal } from "../../components/common/ConfirmModal";

export const PropertyListPage: React.FC = () => {
  const navigate = useNavigate();

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [viewTodayOnly, setViewTodayOnly] = useState(false);
  const [showFilterBottomSheet, setShowFilterBottomSheet] = useState(false);

  const [filterState, setFilterState] = useState<FilterState>({
    propertyTypes: new Set(),
    statuses: new Set(),
    selectedPrices: new Set(),
    priceMin: null,
    priceMax: null,
    selectedSizes: new Set(),
    sizeMin: null,
    sizeMax: null,
    areas: new Set(),
    directions: new Set(),
    sortBy: PropertySortType.NEWEST,
    scope: FilterScope.CURRENT_TAB
  });

  // Multi-select state
  const [isMultiSelect, setIsMultiSelect] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

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

  // Derived filtered & sorted properties
  const filteredProperties = useMemo(() => {
    if (!properties) return [];
    const matched = properties.filter((p) =>
      PropertyFilter.matches(
        p,
        filterState,
        searchQuery,
        viewTodayOnly,
        PropertyListMode.VERIFIED
      )
    );
    return sortProperties(matched, filterState.sortBy);
  }, [properties, filterState, searchQuery, viewTodayOnly]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filterState.scope === FilterScope.ALL) count++;
    if (filterState.propertyTypes && filterState.propertyTypes.size > 0) {
      count += filterState.propertyTypes.size;
    }
    if (filterState.statuses && filterState.statuses.size > 0) {
      count += filterState.statuses.size;
    }
    if (filterState.selectedPrices && filterState.selectedPrices.size > 0) {
      count += filterState.selectedPrices.size;
    }
    if (filterState.priceMin != null || filterState.priceMax != null) count++;
    if (filterState.selectedSizes && filterState.selectedSizes.size > 0) {
      count += filterState.selectedSizes.size;
    }
    if (filterState.sizeMin != null || filterState.sizeMax != null) count++;
    if (filterState.areas && filterState.areas.size > 0) {
      count += filterState.areas.size;
    }
    if (filterState.directions && filterState.directions.size > 0) {
      count += filterState.directions.size;
    }
    if (filterState.sortBy && filterState.sortBy !== PropertySortType.NEWEST) count++;
    return count;
  }, [filterState]);

  const handleResetFilter = () => {
    setFilterState({
      propertyTypes: new Set(),
      statuses: new Set(),
      selectedPrices: new Set(),
      priceMin: null,
      priceMax: null,
      selectedSizes: new Set(),
      sizeMin: null,
      sizeMax: null,
      areas: new Set(),
      directions: new Set(),
      sortBy: PropertySortType.NEWEST,
      scope: FilterScope.CURRENT_TAB
    });
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
              placeholder="Tìm kiếm khu vực, chủ nhà, SĐT..."
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
        <span>
          Hiển thị <strong>{filteredProperties.length}</strong> / {properties.length} BĐS{" "}
          {filterState.scope === FilterScope.ALL ? "(Tất cả)" : "chính thức"}
        </span>
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
          {filteredProperties.map((p) => {
            const isSelected = selectedIds.has(p.id);
            return (
              <PropertyCard
                key={p.id}
                property={p}
                onClick={() => navigate(`/properties/${p.id}`)}
                isMultiSelectMode={isMultiSelect}
                isSelected={isSelected}
                onToggleSelect={() => handleToggleSelect(p.id)}
                onToggleNeedToViewToday={(e) => handleToggleNeedToViewToday(e, p)}
                onToggleStatus={(e) => handleToggleStatus(e, p)}
              />
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
        onReset={handleResetFilter}
        activeFilterCount={activeFilterCount}
        totalMatchedCount={filteredProperties.length}
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
    </div>
  );
};
