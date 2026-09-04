import React, { useState, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate } from "react-router-dom";
import {
  Search,
  Filter,
  Calendar,
  Plus,
  Trash2,
  Phone,
  Clock,
  Compass,
  ChevronRight,
  X,
  RotateCcw
} from "lucide-react";
import { db } from "../../data/local/db";
import { Property } from "../../core/models/property";
import {
  PropertyStatus,
  PropertySortType,
  FilterScope,
  PropertyListMode
} from "../../core/models/enums";
import {
  FilterState,
  PRICE_BUCKETS,
  SIZE_BUCKETS,
  PropertyFilter,
  sortProperties
} from "../../core/engine/property-filter";

export const PropertyListPage: React.FC = () => {
  const navigate = useNavigate();

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [viewTodayOnly, setViewTodayOnly] = useState(false);
  const [showFilterDrawer, setShowFilterDrawer] = useState(false);

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

  const isDongTuTrach =
    (filterState.directions?.size ?? 0) === 4 &&
    ["Đông", "Nam", "Bắc", "Đông Nam"].every((d) => filterState.directions?.has(d));

  const isTayTuTrach =
    (filterState.directions?.size ?? 0) === 4 &&
    ["Tây", "Đông Bắc", "Tây Bắc", "Tây Nam"].every((d) => filterState.directions?.has(d));

  const toggleDongTuTrach = () => {
    const next = new Set(filterState.directions);
    if (isDongTuTrach) {
      ["Đông", "Nam", "Bắc", "Đông Nam"].forEach((d) => next.delete(d));
    } else {
      ["Đông", "Nam", "Bắc", "Đông Nam"].forEach((d) => next.add(d));
    }
    setFilterState((prev) => ({ ...prev, directions: next }));
  };

  const toggleTayTuTrach = () => {
    const next = new Set(filterState.directions);
    if (isTayTuTrach) {
      ["Tây", "Đông Bắc", "Tây Bắc", "Tây Nam"].forEach((d) => next.delete(d));
    } else {
      ["Tây", "Đông Bắc", "Tây Bắc", "Tây Nam"].forEach((d) => next.add(d));
    }
    setFilterState((prev) => ({ ...prev, directions: next }));
  };

  const toggleDirection = (dir: string) => {
    const next = new Set(filterState.directions);
    if (next.has(dir)) next.delete(dir);
    else next.add(dir);
    setFilterState((prev) => ({ ...prev, directions: next }));
  };

  const togglePropertyType = (tp: string) => {
    const next = new Set(filterState.propertyTypes);
    if (next.has(tp)) next.delete(tp);
    else next.add(tp);
    setFilterState((prev) => ({ ...prev, propertyTypes: next }));
  };

  const toggleStatus = (st: PropertyStatus) => {
    const next = new Set(filterState.statuses);
    if (next.has(st)) next.delete(st);
    else next.add(st);
    setFilterState((prev) => ({ ...prev, statuses: next }));
  };

  const togglePriceBucket = (label: string) => {
    const next = new Set(filterState.selectedPrices);
    if (next.has(label)) next.delete(label);
    else next.add(label);
    setFilterState((prev) => ({
      ...prev,
      selectedPrices: next,
      priceMin: null,
      priceMax: null
    }));
  };

  const toggleSizeBucket = (label: string) => {
    const next = new Set(filterState.selectedSizes);
    if (next.has(label)) next.delete(label);
    else next.add(label);
    setFilterState((prev) => ({
      ...prev,
      selectedSizes: next,
      sizeMin: null,
      sizeMax: null
    }));
  };

  const handleToggleNeedToViewToday = async (e: React.MouseEvent, p: Property) => {
    e.stopPropagation();
    const nextVal = !p.needToViewToday;
    await db.properties.update(p.id, {
      needToViewToday: nextVal,
      updatedAt: Date.now(),
      isTextSynced: false
    });
  };

  const handleToggleStatus = async (e: React.MouseEvent, p: Property) => {
    e.stopPropagation();
    const nextStatus =
      p.status === PropertyStatus.FOR_SALE ? PropertyStatus.PAUSED : PropertyStatus.FOR_SALE;
    await db.properties.update(p.id, {
      status: nextStatus,
      updatedAt: Date.now(),
      isTextSynced: false
    });
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

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Bạn có chắc muốn xóa ${selectedIds.size} BĐS đã chọn?`)) return;

    const now = Date.now();
    await db.transaction("rw", db.properties, async () => {
      for (const id of selectedIds) {
        await db.properties.update(id, {
          isDeleted: true,
          updatedAt: now,
          isTextSynced: false
        });
      }
    });
    setSelectedIds(new Set());
    setIsMultiSelect(false);
  };

  if (properties === undefined) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-4 md:py-6 pb-24 md:pb-12">
      {/* Top Controls Header */}
      <div className="flex flex-col gap-3 mb-4">
        <div className="flex items-center gap-2">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm kiếm khu vực, chủ nhà, SĐT..."
              className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-hidden shadow-2xs"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* View Today toggle button */}
          <button
            onClick={() => setViewTodayOnly(!viewTodayOnly)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
              viewTodayOnly
                ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
            }`}
            title="Lọc BĐS cần khảo sát hôm nay"
          >
            <Calendar className="w-4 h-4" />
            <span className="hidden sm:inline">Hôm nay</span>
          </button>

          {/* Filter Drawer Toggle */}
          <button
            onClick={() => setShowFilterDrawer(!showFilterDrawer)}
            className={`relative flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
              activeFilterCount > 0 || showFilterDrawer
                ? "bg-blue-50 text-blue-700 border-blue-300"
                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
            }`}
          >
            <Filter className="w-4 h-4" />
            <span className="hidden sm:inline">Bộ lọc</span>
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
            className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
              isMultiSelect
                ? "bg-slate-800 text-white border-slate-800"
                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
            }`}
          >
            {isMultiSelect ? "Hủy chọn" : "Chọn nhiều"}
          </button>
        </div>

        {/* Expandable Advanced Filter Panel */}
        {showFilterDrawer && (
          <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col gap-3.5 animate-in fade-in duration-150">
            {/* Header: Title + Reset Action */}
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-blue-600" />
                Bộ lọc nâng cao {activeFilterCount > 0 && `(${activeFilterCount} tiêu chí)`}
              </span>
              <div className="flex items-center gap-2">
                {activeFilterCount > 0 && (
                  <button
                    onClick={handleResetFilter}
                    className="flex items-center gap-1 text-[11px] text-red-600 hover:text-red-700 font-semibold px-2 py-0.5 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Xóa lọc</span>
                  </button>
                )}
                <button
                  onClick={() => setShowFilterDrawer(false)}
                  className="text-slate-400 hover:text-slate-600 p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Scope (Phạm vi) */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500 w-20 shrink-0">Phạm vi:</span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() =>
                    setFilterState((prev) => ({ ...prev, scope: FilterScope.CURRENT_TAB }))
                  }
                  className={`text-xs px-3 py-1 rounded-lg font-medium transition-colors ${
                    filterState.scope !== FilterScope.ALL
                      ? "bg-blue-600 text-white font-semibold shadow-2xs"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  SP chính thức
                </button>
                <button
                  onClick={() => setFilterState((prev) => ({ ...prev, scope: FilterScope.ALL }))}
                  className={`text-xs px-3 py-1 rounded-lg font-medium transition-colors ${
                    filterState.scope === FilterScope.ALL
                      ? "bg-blue-600 text-white font-semibold shadow-2xs"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  Tất cả (gồm SP chờ)
                </button>
              </div>
            </div>

            {/* Property Types (Loại hình) */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500 w-20 shrink-0">Loại BĐS:</span>
              <div className="flex items-center gap-1.5">
                {["Nhà", "Đất"].map((tp) => {
                  const isSel = filterState.propertyTypes?.has(tp);
                  return (
                    <button
                      key={tp}
                      onClick={() => togglePropertyType(tp)}
                      className={`text-xs px-3 py-1 rounded-lg font-medium transition-colors ${
                        isSel
                          ? "bg-blue-600 text-white font-semibold shadow-2xs"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      }`}
                    >
                      {tp === "Nhà" ? "🏠 Nhà" : "🌳 Đất"}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Statuses (Trạng thái) */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500 w-20 shrink-0">Trạng thái:</span>
              <div className="flex flex-wrap items-center gap-1.5">
                {[PropertyStatus.FOR_SALE, PropertyStatus.SOLD, PropertyStatus.PAUSED].map(
                  (st) => {
                    const isSel = filterState.statuses?.has(st);
                    return (
                      <button
                        key={st}
                        onClick={() => toggleStatus(st)}
                        className={`text-xs px-3 py-1 rounded-lg font-medium transition-colors ${
                          isSel
                            ? "bg-blue-600 text-white font-semibold shadow-2xs"
                            : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                        }`}
                      >
                        {st}
                      </button>
                    );
                  }
                )}
              </div>
            </div>

            {/* Price Buckets (Khoảng giá tỷ) */}
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-slate-500">Khoảng giá (tỷ VNĐ):</span>
              <div className="flex flex-wrap items-center gap-1.5">
                {PRICE_BUCKETS.map((b) => {
                  const isSel = filterState.selectedPrices?.has(b.label);
                  return (
                    <button
                      key={b.label}
                      onClick={() => togglePriceBucket(b.label)}
                      className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors ${
                        isSel
                          ? "bg-blue-600 text-white font-semibold shadow-2xs"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      }`}
                    >
                      {b.label} tỷ
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Size Buckets (Diện tích m2) */}
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-slate-500">Diện tích (m²):</span>
              <div className="flex flex-wrap items-center gap-1.5">
                {SIZE_BUCKETS.map((b) => {
                  const isSel = filterState.selectedSizes?.has(b.label);
                  return (
                    <button
                      key={b.label}
                      onClick={() => toggleSizeBucket(b.label)}
                      className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors ${
                        isSel
                          ? "bg-blue-600 text-white font-semibold shadow-2xs"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      }`}
                    >
                      {b.label} m²
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Directions (Hướng) */}
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-slate-500">Hướng nhà & Cung mệnh:</span>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  onClick={toggleDongTuTrach}
                  className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors ${
                    isDongTuTrach
                      ? "bg-blue-600 text-white font-semibold shadow-2xs"
                      : "bg-blue-50 text-blue-700 hover:bg-blue-100"
                  }`}
                >
                  🧭 Đông tứ trạch
                </button>
                <button
                  onClick={toggleTayTuTrach}
                  className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors ${
                    isTayTuTrach
                      ? "bg-blue-600 text-white font-semibold shadow-2xs"
                      : "bg-blue-50 text-blue-700 hover:bg-blue-100"
                  }`}
                >
                  🧭 Tây tứ trạch
                </button>

                {["Đông", "Tây", "Nam", "Bắc", "Đông Nam", "Đông Bắc", "Tây Nam", "Tây Bắc"].map(
                  (d) => {
                    const isSel = filterState.directions?.has(d);
                    return (
                      <button
                        key={d}
                        onClick={() => toggleDirection(d)}
                        className={`text-xs px-2 py-0.5 rounded-lg font-medium transition-colors ${
                          isSel
                            ? "bg-blue-600 text-white font-semibold shadow-2xs"
                            : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                        }`}
                      >
                        {d}
                      </button>
                    );
                  }
                )}
              </div>
            </div>

            {/* Sort options */}
            <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
              <span className="text-xs font-semibold text-slate-500 w-20 shrink-0">Sắp xếp:</span>
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { type: PropertySortType.NEWEST, label: "Mới nhất" },
                  { type: PropertySortType.PRICE_ASC, label: "Giá ↑" },
                  { type: PropertySortType.PRICE_DESC, label: "Giá ↓" },
                  { type: PropertySortType.SIZE, label: "Diện tích" }
                ].map((s) => {
                  const isSel = filterState.sortBy === s.type;
                  return (
                    <button
                      key={s.type}
                      onClick={() =>
                        setFilterState((prev) => ({ ...prev, sortBy: s.type }))
                      }
                      className={`text-xs px-3 py-1 rounded-lg font-medium transition-colors ${
                        isSel
                          ? "bg-blue-600 text-white font-semibold shadow-2xs"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      }`}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Multi-Select Action Bar */}
      {isMultiSelect && selectedIds.size > 0 && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between animate-in fade-in">
          <span className="text-sm font-semibold text-blue-900">
            Đã chọn {selectedIds.size} BĐS
          </span>
          <button
            onClick={handleDeleteSelected}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Xóa đã chọn</span>
          </button>
        </div>
      )}

      {/* Counter Summary */}
      <div className="flex items-center justify-between text-xs text-slate-500 mb-3 px-1">
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

      {/* Property Cards List */}
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
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs rounded-xl shadow-xs transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Thêm BĐS mới</span>
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredProperties.map((p) => {
            const isSelected = selectedIds.has(p.id);
            return (
              <div
                key={p.id}
                onClick={() => {
                  if (isMultiSelect) {
                    handleToggleSelect(p.id);
                  } else {
                    navigate(`/properties/${p.id}`);
                  }
                }}
                className={`p-4 bg-white border rounded-2xl shadow-2xs hover:shadow-sm transition-all cursor-pointer flex flex-col gap-2 relative ${
                  isSelected
                    ? "border-blue-500 ring-2 ring-blue-100 bg-blue-50/20"
                    : "border-slate-200 hover:border-slate-300"
                }`}
              >
                {/* Header Row: Type, Area, Status, Calendar Toggle */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {isMultiSelect && (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSelect(p.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-4 h-4 text-blue-600 rounded-sm border-slate-300 focus:ring-blue-500"
                      />
                    )}
                    <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 text-slate-700 shrink-0">
                      {p.propertyType}
                    </span>
                    <h3 className="font-semibold text-slate-800 text-sm md:text-base truncate">
                      {p.area || "Chưa có tên khu vực"}
                    </h3>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* Status Badge */}
                    <button
                      onClick={(e) => handleToggleStatus(e, p)}
                      className={`px-2 py-0.5 rounded-full text-[11px] font-bold transition-colors ${
                        p.status === PropertyStatus.FOR_SALE
                          ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                          : p.status === PropertyStatus.PAUSED
                          ? "bg-amber-100 text-amber-800 hover:bg-amber-200"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      }`}
                      title="Click để đổi nhanh trạng thái"
                    >
                      {p.status}
                    </button>

                    {/* Need to view today calendar button */}
                    <button
                      onClick={(e) => handleToggleNeedToViewToday(e, p)}
                      className={`p-1.5 rounded-lg transition-colors ${
                        p.needToViewToday
                          ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
                          : "text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      }`}
                      title={p.needToViewToday ? "Bỏ đánh dấu xem hôm nay" : "Đánh dấu cần xem hôm nay"}
                    >
                      <Calendar className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Metrics Row: Price, Area Size, Direction */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                  <div className="font-bold text-blue-700 text-sm md:text-base">
                    {p.price > 0 ? `${p.price} tỷ` : "Thương lượng"}
                  </div>
                  {p.areaSize && (
                    <div className="flex items-center gap-1">
                      <span>•</span>
                      <span>{p.areaSize} m²</span>
                    </div>
                  )}
                  {p.direction && (
                    <div className="flex items-center gap-1">
                      <span>•</span>
                      <Compass className="w-3.5 h-3.5 text-slate-400" />
                      <span>{p.direction}</span>
                    </div>
                  )}
                  {p.ownerPhone && (
                    <div className="flex items-center gap-1 text-slate-500">
                      <span>•</span>
                      <Phone className="w-3 h-3" />
                      <span>{p.ownerPhone}</span>
                    </div>
                  )}
                </div>

                {/* Description snippet */}
                {p.description && (
                  <p className="text-xs text-slate-500 line-clamp-2 mt-0.5">
                    {p.description}
                  </p>
                )}

                {/* Footer status row */}
                <div className="flex items-center justify-between pt-1 border-t border-slate-50 text-[11px] text-slate-400">
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>KS: {p.surveyDate || "N/A"}</span>
                  </div>

                  <div className="flex items-center gap-1 text-blue-600 font-medium hover:underline">
                    <span>Chi tiết</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </div>
                </div>
              </div>
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
    </div>
  );
};
