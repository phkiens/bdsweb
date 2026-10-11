import React, { useState, useEffect, useMemo, useRef } from "react";
import { X, Search, List } from "lucide-react";
import {
  FilterState,
  PRICE_BUCKETS,
  SIZE_BUCKETS,
  PropertyFilter
} from "../../core/engine/property-filter";
import {
  PropertyStatus,
  PropertySortType,
  FilterScope
} from "../../core/models/enums";
import {
  normalizeSearch,
  containsWholeWords
} from "../../core/utils/vietnamese";

import { FilterTopRow } from "../../core/models/enums";

export interface PropertyFilterBottomSheetProps {
  isOpen: boolean;
  filterState: FilterState;
  baselineFilter?: FilterState;
  onFilterChange: ((state: FilterState) => void) | React.Dispatch<React.SetStateAction<FilterState>>;
  onClose: () => void;
  onDismissRequest?: () => void;
  distinctAreas?: string[];
  recentAreas?: string[];
  onSelectArea?: (area: string) => void;
  filteredCount?: number;
  totalMatchedCount?: number;
  showStatusFilter?: boolean;
  topRow?: FilterTopRow;
  showSort?: boolean;
  resetButtonLabel?: string;
  onResetFilter?: () => void;
  onReset?: () => void;
  activeFilterCount?: number;
}

const EAST_GROUP = ["Đông", "Nam", "Bắc", "Đông Nam"];
const WEST_GROUP = ["Tây", "Đông Bắc", "Tây Bắc", "Tây Nam"];

export const PropertyFilterBottomSheet: React.FC<PropertyFilterBottomSheetProps> = ({
  isOpen,
  filterState,
  baselineFilter = {},
  onFilterChange,
  onClose,
  onDismissRequest,
  distinctAreas = [],
  recentAreas = [],
  onSelectArea,
  filteredCount,
  totalMatchedCount,
  showStatusFilter = true,
  topRow = FilterTopRow.SCOPE,
  showSort = true,
  resetButtonLabel = "Về mặc định",
  onResetFilter,
  onReset
}) => {
  // State hooks
  const [areaInput, setAreaInput] = useState("");
  const [showAllAreaModal, setShowAllAreaModal] = useState(false);
  const [areaModalQuery, setAreaModalQuery] = useState("");

  // Ref hooks
  const areaContainerRef = useRef<HTMLDivElement>(null);
  const areaInputRef = useRef<HTMLInputElement>(null);

  // Memo hooks
  const activeCount = useMemo(() => {
    return PropertyFilter.activeFilterCount(filterState, baselineFilter);
  }, [filterState, baselineFilter]);

  const currentDirSet = useMemo(() => {
    return filterState.directions ?? new Set<string>();
  }, [filterState.directions]);

  const isDongTuTrach = useMemo(() => {
    return (
      currentDirSet.size > 0 &&
      EAST_GROUP.every((d) => currentDirSet.has(d))
    );
  }, [currentDirSet]);

  const isTayTuTrach = useMemo(() => {
    return (
      currentDirSet.size > 0 &&
      WEST_GROUP.every((d) => currentDirSet.has(d))
    );
  }, [currentDirSet]);

  const topAreaSuggestions = useMemo(() => {
    const selectedAreas = filterState.areas ?? new Set<string>();
    const trimmedInput = areaInput.trim();

    if (!trimmedInput) {
      const recentsFiltered = recentAreas
        .filter((a) => !selectedAreas.has(a) && distinctAreas.includes(a))
        .slice(0, 4);
      const padded = distinctAreas
        .filter((a) => !selectedAreas.has(a) && !recentsFiltered.includes(a))
        .slice(0, 4 - recentsFiltered.length);
      return [...recentsFiltered, ...padded];
    } else {
      const normInput = normalizeSearch(trimmedInput);
      return distinctAreas
        .filter(
          (a) =>
            !selectedAreas.has(a) &&
            (containsWholeWords(normalizeSearch(a), normInput) ||
              normalizeSearch(a).includes(normInput))
        )
        .slice(0, 4);
    }
  }, [areaInput, distinctAreas, recentAreas, filterState.areas]);

  const { selectedAreasForModal, unselectedAreasForModal } = useMemo(() => {
    const selectedAreas = filterState.areas ?? new Set<string>();
    const normQuery = normalizeSearch(areaModalQuery.trim());

    const isVisible = (a: string) =>
      !normQuery ||
      containsWholeWords(normalizeSearch(a), normQuery) ||
      normalizeSearch(a).includes(normQuery);

    const distinctSelected = distinctAreas.filter((a) => selectedAreas.has(a));
    const extraSelected = Array.from(selectedAreas).filter(
      (a) => !distinctAreas.includes(a)
    );
    const selected = [...distinctSelected, ...extraSelected].filter(isVisible);
    const unselected = distinctAreas
      .filter((a) => !selectedAreas.has(a))
      .filter(isVisible);

    return {
      selectedAreasForModal: selected,
      unselectedAreasForModal: unselected
    };
  }, [distinctAreas, filterState.areas, areaModalQuery]);

  // Effect hooks
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showAllAreaModal) {
          setShowAllAreaModal(false);
        } else {
          if (onDismissRequest) onDismissRequest();
          else onClose();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, showAllAreaModal, onClose, onDismissRequest]);

  // Early return strictly AFTER all React hooks
  if (!isOpen) return null;

  // Actions
  const handleDismiss = () => {
    if (onDismissRequest) onDismissRequest();
    else onClose();
  };

  const handleReset = () => {
    if (onResetFilter) onResetFilter();
    else if (onReset) onReset();
  };

  const updateFilter = (nextState: FilterState) => {
    (onFilterChange as (val: FilterState) => void)(nextState);
  };

  const handleSelectAreaValue = (area: string) => {
    if (onSelectArea) {
      onSelectArea(area);
    } else {
      const nextAreas = new Set(filterState.areas ?? []);
      nextAreas.add(area);
      updateFilter({ ...filterState, areas: nextAreas });
    }
    setAreaInput("");
  };

  const handleRemoveAreaValue = (area: string) => {
    const nextAreas = new Set(filterState.areas ?? []);
    nextAreas.delete(area);
    updateFilter({ ...filterState, areas: nextAreas });
  };

  const handleToggleAreaInModal = (area: string) => {
    const nextAreas = new Set(filterState.areas ?? []);
    if (nextAreas.has(area)) {
      nextAreas.delete(area);
    } else {
      nextAreas.add(area);
    }
    updateFilter({ ...filterState, areas: nextAreas });
  };

  const handleAreaInputDone = () => {
    const trimmed = areaInput.trim();
    if (!trimmed) return;
    const matched =
      distinctAreas.find(
        (a) => a.toLowerCase() === trimmed.toLowerCase()
      ) ?? trimmed;
    handleSelectAreaValue(matched);
  };

  const toggleDongTuTrach = () => {
    const next = new Set(currentDirSet);
    if (isDongTuTrach) {
      EAST_GROUP.forEach((d) => next.delete(d));
    } else {
      EAST_GROUP.forEach((d) => next.add(d));
    }
    updateFilter({ ...filterState, directions: next });
  };

  const toggleTayTuTrach = () => {
    const next = new Set(currentDirSet);
    if (isTayTuTrach) {
      WEST_GROUP.forEach((d) => next.delete(d));
    } else {
      WEST_GROUP.forEach((d) => next.add(d));
    }
    updateFilter({ ...filterState, directions: next });
  };

  const togglePropertyType = (tp: string) => {
    const next = new Set(filterState.propertyTypes);
    if (next.has(tp)) next.delete(tp);
    else next.add(tp);
    updateFilter({ ...filterState, propertyTypes: next });
  };

  const toggleStatus = (st: PropertyStatus | string) => {
    const next = new Set(filterState.statuses);
    if (next.has(st)) next.delete(st);
    else next.add(st);
    updateFilter({ ...filterState, statuses: next });
  };

  const togglePriceBucket = (label: string) => {
    const next = new Set(filterState.selectedPrices);
    if (next.has(label)) next.delete(label);
    else next.add(label);
    updateFilter({
      ...filterState,
      selectedPrices: next,
      priceMin: null,
      priceMax: null
    });
  };

  const toggleSizeBucket = (label: string) => {
    const next = new Set(filterState.selectedSizes);
    if (next.has(label)) next.delete(label);
    else next.add(label);
    updateFilter({
      ...filterState,
      selectedSizes: next,
      sizeMin: null,
      sizeMax: null
    });
  };

  const countDisplay = filteredCount ?? totalMatchedCount;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
      onClick={handleDismiss}
    >
      <div
        className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh] sm:max-h-[85vh] animate-in slide-in-from-bottom duration-200 border border-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile Pull Handle Indicator */}
        <div className="sm:hidden pt-2 pb-1 flex justify-center">
          <div className="w-10 h-1 bg-slate-300 rounded-full" />
        </div>

        {/* 1. TIÊU ĐỀ */}
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-1.5">
            <h3 className="font-bold text-slate-900 text-base">Bộ lọc</h3>
            {activeCount > 0 && (
              <span className="text-xs font-semibold text-blue-600">
                · {activeCount} đang bật
              </span>
            )}
          </div>

          <button
            onClick={handleDismiss}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
            title="Đóng"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* NỘI DUNG CUỘN (Không nhãn, các hàng chip ô đều) */}
        <div className="p-4 overflow-y-auto space-y-3 flex-1">
          {/* 2. HÀNG ĐẦU (theo topRow) */}
          {topRow === FilterTopRow.SCOPE && (
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() =>
                  updateFilter({ ...filterState, scope: FilterScope.CURRENT_TAB })
                }
                className={`py-2 px-1 text-center rounded-xl text-xs font-semibold transition-all cursor-pointer select-none truncate ${
                  filterState.scope !== FilterScope.ALL
                    ? "bg-blue-600 text-white shadow-2xs font-bold"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {showStatusFilter ? "SP chính" : "SP chờ"}
              </button>
              <button
                type="button"
                onClick={() =>
                  updateFilter({ ...filterState, scope: FilterScope.ALL })
                }
                className={`py-2 px-1 text-center rounded-xl text-xs font-semibold transition-all cursor-pointer select-none truncate ${
                  filterState.scope === FilterScope.ALL
                    ? "bg-blue-600 text-white shadow-2xs font-bold"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                Tất cả
              </button>
            </div>
          )}

          {topRow === FilterTopRow.SOURCES && (
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => {
                  const sources = new Set(filterState.sources ?? ["OFFICIAL", "UNVERIFIED"]);
                  if (sources.has("OFFICIAL")) sources.delete("OFFICIAL");
                  else sources.add("OFFICIAL");
                  updateFilter({ ...filterState, sources });
                }}
                className={`py-2 px-1 text-center rounded-xl text-xs font-semibold transition-all cursor-pointer select-none truncate ${
                  (filterState.sources ?? new Set(["OFFICIAL", "UNVERIFIED"])).has("OFFICIAL")
                    ? "bg-blue-600 text-white shadow-2xs font-bold"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                Chính thức
              </button>
              <button
                type="button"
                onClick={() => {
                  const sources = new Set(filterState.sources ?? ["OFFICIAL", "UNVERIFIED"]);
                  if (sources.has("UNVERIFIED")) sources.delete("UNVERIFIED");
                  else sources.add("UNVERIFIED");
                  updateFilter({ ...filterState, sources });
                }}
                className={`py-2 px-1 text-center rounded-xl text-xs font-semibold transition-all cursor-pointer select-none truncate ${
                  (filterState.sources ?? new Set(["OFFICIAL", "UNVERIFIED"])).has("UNVERIFIED")
                    ? "bg-blue-600 text-white shadow-2xs font-bold"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                Chờ
              </button>
            </div>
          )}

          {/* 3. LOẠI + TRẠNG THÁI */}
          <div
            className={`grid gap-1.5 ${
              showStatusFilter || filterState.scope === FilterScope.ALL
                ? "grid-cols-4"
                : "grid-cols-2"
            }`}
          >
            <button
              type="button"
              onClick={() => togglePropertyType("Nhà")}
              className={`py-2 px-1 text-center rounded-xl text-xs font-semibold transition-all cursor-pointer select-none truncate ${
                filterState.propertyTypes?.has("Nhà")
                  ? "bg-blue-600 text-white shadow-2xs font-bold"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              Nhà
            </button>
            <button
              type="button"
              onClick={() => togglePropertyType("Đất")}
              className={`py-2 px-1 text-center rounded-xl text-xs font-semibold transition-all cursor-pointer select-none truncate ${
                filterState.propertyTypes?.has("Đất")
                  ? "bg-blue-600 text-white shadow-2xs font-bold"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              Đất
            </button>
            {(showStatusFilter || filterState.scope === FilterScope.ALL) && (
              <>
                <button
                  type="button"
                  onClick={() => toggleStatus(PropertyStatus.FOR_SALE)}
                  className={`py-2 px-1 text-center rounded-xl text-xs font-semibold transition-all cursor-pointer select-none truncate ${
                    filterState.statuses?.has(PropertyStatus.FOR_SALE)
                      ? "bg-blue-600 text-white shadow-2xs font-bold"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  Đang bán
                </button>
                <button
                  type="button"
                  onClick={() => toggleStatus(PropertyStatus.SOLD)}
                  className={`py-2 px-1 text-center rounded-xl text-xs font-semibold transition-all cursor-pointer select-none truncate ${
                    filterState.statuses?.has(PropertyStatus.SOLD)
                      ? "bg-blue-600 text-white shadow-2xs font-bold"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  Đã bán
                </button>
              </>
            )}
          </div>

          {/* 4. GIÁ (4 cột × 2 hàng, đơn vị ở ô đầu/cuối) */}
          <div className="grid grid-cols-4 gap-1.5">
            {PRICE_BUCKETS.map((bucket, index) => {
              const isSelected = filterState.selectedPrices?.has(bucket.label);
              const label =
                index === 0
                  ? "<1 tỷ"
                  : index === PRICE_BUCKETS.length - 1
                  ? ">10 tỷ"
                  : bucket.label;
              return (
                <button
                  key={bucket.label}
                  type="button"
                  onClick={() => togglePriceBucket(bucket.label)}
                  className={`py-2 px-1 text-center rounded-xl text-xs font-semibold transition-all cursor-pointer select-none truncate ${
                    isSelected
                      ? "bg-blue-600 text-white shadow-2xs font-bold"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* 5. DIỆN TÍCH (3 cột × 2 hàng, đơn vị ở ô đầu/cuối) */}
          <div className="grid grid-cols-3 gap-1.5">
            {SIZE_BUCKETS.map((bucket, index) => {
              const isSelected = filterState.selectedSizes?.has(bucket.label);
              const label =
                index === 0
                  ? "<30 m²"
                  : index === SIZE_BUCKETS.length - 1
                  ? ">150 m²"
                  : bucket.label;
              return (
                <button
                  key={bucket.label}
                  type="button"
                  onClick={() => toggleSizeBucket(bucket.label)}
                  className={`py-2 px-1 text-center rounded-xl text-xs font-semibold transition-all cursor-pointer select-none truncate ${
                    isSelected
                      ? "bg-blue-600 text-white shadow-2xs font-bold"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* 6. KHU VỰC (hàng chip trên, ô tìm dưới, cuộn cụm khu vực khi focus) */}
          <div ref={areaContainerRef} className="space-y-1.5 pt-0.5">
            {/* Hàng chip khu vực (Đã chọn + Gợi ý nhanh) */}
            {((filterState.areas && filterState.areas.size > 0) ||
              topAreaSuggestions.length > 0) && (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                {Array.from(filterState.areas ?? []).map((areaName) => (
                  <button
                    key={`sel_${areaName}`}
                    type="button"
                    onClick={() => handleRemoveAreaValue(areaName)}
                    className="py-1 px-2.5 rounded-full text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-all cursor-pointer shrink-0 flex items-center gap-1"
                  >
                    <span>{areaName}</span>
                    <X className="w-3 h-3" />
                  </button>
                ))}

                {topAreaSuggestions.map((suggestion) => (
                  <button
                    key={`sug_${suggestion}`}
                    type="button"
                    onClick={() => handleSelectAreaValue(suggestion)}
                    className="py-1 px-2.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 transition-all cursor-pointer shrink-0"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}

            {/* Ô tìm kiếm khu vực */}
            <div className="relative flex items-center">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={areaInputRef}
                type="text"
                value={areaInput}
                onChange={(e) => setAreaInput(e.target.value)}
                onFocus={() => {
                  areaContainerRef.current?.scrollIntoView({
                    behavior: "smooth",
                    block: "nearest"
                  });
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAreaInputDone();
                  }
                }}
                placeholder="Tìm khu vực..."
                className="w-full pl-9 pr-20 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-hidden transition-all"
              />

              <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {areaInput && (
                  <button
                    type="button"
                    onClick={() => setAreaInput("")}
                    className="p-1 text-slate-400 hover:text-slate-600 rounded-md cursor-pointer"
                    title="Xóa"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}

                {distinctAreas.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setAreaModalQuery("");
                      setShowAllAreaModal(true);
                    }}
                    className="flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-blue-600 px-1.5 py-1 rounded-md hover:bg-slate-100 cursor-pointer transition-colors"
                    title="Tất cả khu vực"
                  >
                    <List className="w-3.5 h-3.5" />
                    <span>{distinctAreas.length}</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* 7. HƯỚNG (chỉ 2 nút đều: Đông tứ trạch, Tây tứ trạch) */}
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={toggleDongTuTrach}
              className={`py-2 px-1 text-center rounded-xl text-xs font-semibold transition-all cursor-pointer select-none truncate ${
                isDongTuTrach
                  ? "bg-blue-600 text-white shadow-2xs font-bold"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              Đông tứ trạch
            </button>
            <button
              type="button"
              onClick={toggleTayTuTrach}
              className={`py-2 px-1 text-center rounded-xl text-xs font-semibold transition-all cursor-pointer select-none truncate ${
                isTayTuTrach
                  ? "bg-blue-600 text-white shadow-2xs font-bold"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              Tây tứ trạch
            </button>
          </div>

          {/* 8. SẮP XẾP */}
          {showSort && (
            <div className="grid grid-cols-4 gap-1.5 pt-0.5">
              {[
                { type: PropertySortType.NEWEST, label: "Mới nhất" },
                { type: PropertySortType.PRICE_ASC, label: "Giá ↑" },
                { type: PropertySortType.PRICE_DESC, label: "Giá ↓" },
                { type: PropertySortType.SIZE, label: "Diện tích" }
              ].map((s) => {
                const isSelected = filterState.sortBy === s.type;
                return (
                  <button
                    key={s.type}
                    type="button"
                    onClick={() =>
                      updateFilter({ ...filterState, sortBy: s.type })
                    }
                    className={`py-2 px-1 text-center rounded-xl text-xs font-semibold transition-all cursor-pointer select-none truncate ${
                      isSelected
                        ? "bg-blue-600 text-white shadow-2xs font-bold"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 9. CHÂN (Sticky footer: một nút đặt lại, một nút áp dụng) */}
        <div className="p-3 border-t border-slate-100 bg-white shrink-0 flex items-center gap-2">
          <button
            type="button"
            onClick={handleReset}
            className="flex-1 py-2.5 px-3 border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold rounded-xl text-xs transition-colors cursor-pointer text-center truncate"
          >
            {resetButtonLabel}
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            className="flex-[1.2] py-2.5 px-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs shadow-md transition-colors cursor-pointer text-center truncate"
          >
            {countDisplay !== undefined
              ? `Xem ${countDisplay} kết quả`
              : "Áp dụng"}
          </button>
        </div>
      </div>

      {/* Modal: Tất cả khu vực */}
      {showAllAreaModal && (
        <div
          className="fixed inset-0 z-60 bg-black/50 flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setShowAllAreaModal(false)}
        >
          <div
            className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh] border border-slate-100 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between shrink-0">
              <h4 className="font-bold text-slate-900 text-sm">
                Tất cả khu vực ({distinctAreas.length})
              </h4>
              <button
                type="button"
                onClick={() => setShowAllAreaModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Search */}
            <div className="p-3 border-b border-slate-100 shrink-0">
              <div className="relative flex items-center">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={areaModalQuery}
                  onChange={(e) => setAreaModalQuery(e.target.value)}
                  placeholder="Tìm kiếm khu vực..."
                  className="w-full pl-9 pr-8 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-hidden transition-all"
                />
                {areaModalQuery && (
                  <button
                    type="button"
                    onClick={() => setAreaModalQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Area chips content */}
            <div className="p-3 overflow-y-auto space-y-3 flex-1">
              {selectedAreasForModal.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[11px] font-bold text-blue-700 uppercase tracking-wider">
                    Đã chọn ({selectedAreasForModal.length})
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedAreasForModal.map((area) => (
                      <button
                        key={`modal_sel_${area}`}
                        type="button"
                        onClick={() => handleToggleAreaInModal(area)}
                        className="py-1 px-2.5 rounded-full text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors cursor-pointer flex items-center gap-1"
                      >
                        <span>{area}</span>
                        <X className="w-3 h-3" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {unselectedAreasForModal.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Chưa chọn ({unselectedAreasForModal.length})
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {unselectedAreasForModal.map((area) => (
                      <button
                        key={`modal_unsel_${area}`}
                        type="button"
                        onClick={() => handleToggleAreaInModal(area)}
                        className="py-1 px-2.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
                      >
                        {area}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {selectedAreasForModal.length === 0 &&
                unselectedAreasForModal.length === 0 && (
                  <div className="text-center py-6 text-xs text-slate-400">
                    Không tìm thấy khu vực phù hợp
                  </div>
                )}
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-slate-100 shrink-0">
              <button
                type="button"
                onClick={() => setShowAllAreaModal(false)}
                className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs shadow-xs transition-colors cursor-pointer text-center"
              >
                Hoàn tất ({(filterState.areas?.size ?? 0)} đã chọn)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
