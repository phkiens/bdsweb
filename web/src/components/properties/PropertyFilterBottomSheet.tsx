import React, { useEffect } from "react";
import { Filter, X, RotateCcw } from "lucide-react";
import {
  FilterState,
  PRICE_BUCKETS,
  SIZE_BUCKETS
} from "../../core/engine/property-filter";
import {
  PropertyStatus,
  PropertySortType,
  FilterScope
} from "../../core/models/enums";

export interface PropertyFilterBottomSheetProps {
  isOpen: boolean;
  filterState: FilterState;
  onFilterChange: React.Dispatch<React.SetStateAction<FilterState>>;
  onClose: () => void;
  onReset: () => void;
  activeFilterCount: number;
  totalMatchedCount?: number;
}

export const PropertyFilterBottomSheet: React.FC<PropertyFilterBottomSheetProps> = ({
  isOpen,
  filterState,
  onFilterChange,
  onClose,
  onReset,
  activeFilterCount,
  totalMatchedCount
}) => {
  // Lắng nghe ESC để đóng
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

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
    onFilterChange((prev) => ({ ...prev, directions: next }));
  };

  const toggleTayTuTrach = () => {
    const next = new Set(filterState.directions);
    if (isTayTuTrach) {
      ["Tây", "Đông Bắc", "Tây Bắc", "Tây Nam"].forEach((d) => next.delete(d));
    } else {
      ["Tây", "Đông Bắc", "Tây Bắc", "Tây Nam"].forEach((d) => next.add(d));
    }
    onFilterChange((prev) => ({ ...prev, directions: next }));
  };

  const toggleDirection = (dir: string) => {
    const next = new Set(filterState.directions);
    if (next.has(dir)) next.delete(dir);
    else next.add(dir);
    onFilterChange((prev) => ({ ...prev, directions: next }));
  };

  const togglePropertyType = (tp: string) => {
    const next = new Set(filterState.propertyTypes);
    if (next.has(tp)) next.delete(tp);
    else next.add(tp);
    onFilterChange((prev) => ({ ...prev, propertyTypes: next }));
  };

  const toggleStatus = (st: PropertyStatus) => {
    const next = new Set(filterState.statuses);
    if (next.has(st)) next.delete(st);
    else next.add(st);
    onFilterChange((prev) => ({ ...prev, statuses: next }));
  };

  const togglePriceBucket = (label: string) => {
    const next = new Set(filterState.selectedPrices);
    if (next.has(label)) next.delete(label);
    else next.add(label);
    onFilterChange((prev) => ({
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
    onFilterChange((prev) => ({
      ...prev,
      selectedSizes: next,
      sizeMin: null,
      sizeMax: null
    }));
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh] sm:max-h-[85vh] animate-in slide-in-from-bottom duration-200 border border-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile Pull Handle Indicator */}
        <div className="sm:hidden pt-2 pb-1 flex justify-center">
          <div className="w-10 h-1 bg-slate-300 rounded-full" />
        </div>

        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-blue-600" />
            <h3 className="font-bold text-slate-900 text-base">Bộ lọc BĐS</h3>
            {activeFilterCount > 0 && (
              <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-[11px] font-bold rounded-full">
                {activeFilterCount} tiêu chí
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {activeFilterCount > 0 && (
              <button
                onClick={onReset}
                className="flex items-center gap-1 text-xs text-red-600 hover:text-red-700 font-semibold px-2 py-1 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Xóa lọc</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Body (Scrollable) */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* Phạm vi */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Phạm vi tìm kiếm
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() =>
                  onFilterChange((prev) => ({ ...prev, scope: FilterScope.CURRENT_TAB }))
                }
                className={`py-2 px-3 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  filterState.scope !== FilterScope.ALL
                    ? "bg-blue-600 text-white shadow-xs"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                SP chính thức
              </button>
              <button
                type="button"
                onClick={() =>
                  onFilterChange((prev) => ({ ...prev, scope: FilterScope.ALL }))
                }
                className={`py-2 px-3 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  filterState.scope === FilterScope.ALL
                    ? "bg-blue-600 text-white shadow-xs"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                Tất cả (gồm tin chờ)
              </button>
            </div>
          </div>

          {/* Loại BĐS */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Loại hình BĐS
            </label>
            <div className="grid grid-cols-2 gap-2">
              {["Nhà", "Đất"].map((tp) => {
                const isSel = filterState.propertyTypes?.has(tp);
                return (
                  <button
                    key={tp}
                    type="button"
                    onClick={() => togglePropertyType(tp)}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                      isSel
                        ? "bg-blue-600 text-white shadow-xs"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    {tp === "Nhà" ? "🏠 Nhà phố / Nhà ở" : "🌳 Đất thổ cư / Đất nền"}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Trạng thái BĐS */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Trạng thái giao dịch
            </label>
            <div className="flex flex-wrap gap-1.5">
              {[PropertyStatus.FOR_SALE, PropertyStatus.PAUSED, PropertyStatus.SOLD].map((st) => {
                const isSel = filterState.statuses?.has(st);
                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => toggleStatus(st)}
                    className={`py-1.5 px-3 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                      isSel
                        ? "bg-blue-600 text-white font-semibold shadow-2xs"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    {st}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Khoảng giá */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Khoảng giá (tỷ VNĐ)
            </label>
            <div className="flex flex-wrap gap-1.5">
              {PRICE_BUCKETS.map((b) => {
                const isSel = filterState.selectedPrices?.has(b.label);
                return (
                  <button
                    key={b.label}
                    type="button"
                    onClick={() => togglePriceBucket(b.label)}
                    className={`py-1.5 px-3 rounded-xl text-xs font-medium transition-all cursor-pointer ${
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

          {/* Diện tích */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Diện tích (m²)
            </label>
            <div className="flex flex-wrap gap-1.5">
              {SIZE_BUCKETS.map((b) => {
                const isSel = filterState.selectedSizes?.has(b.label);
                return (
                  <button
                    key={b.label}
                    type="button"
                    onClick={() => toggleSizeBucket(b.label)}
                    className={`py-1.5 px-3 rounded-xl text-xs font-medium transition-all cursor-pointer ${
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

          {/* Hướng & Cung mệnh */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Hướng nhà & Cung mệnh
            </label>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={toggleDongTuTrach}
                className={`py-1.5 px-3 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  isDongTuTrach
                    ? "bg-blue-600 text-white shadow-2xs"
                    : "bg-blue-50 text-blue-700 hover:bg-blue-100"
                }`}
              >
                🧭 Đông tứ trạch
              </button>
              <button
                type="button"
                onClick={toggleTayTuTrach}
                className={`py-1.5 px-3 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  isTayTuTrach
                    ? "bg-blue-600 text-white shadow-2xs"
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
                      type="button"
                      onClick={() => toggleDirection(d)}
                      className={`py-1 px-2.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
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

          {/* Sắp xếp */}
          <div className="space-y-1.5 pt-2 border-t border-slate-100">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Thứ tự sắp xếp
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {[
                { type: PropertySortType.NEWEST, label: "Mới nhất" },
                { type: PropertySortType.PRICE_ASC, label: "Giá tăng dần" },
                { type: PropertySortType.PRICE_DESC, label: "Giá giảm dần" },
                { type: PropertySortType.SIZE, label: "Diện tích lớn" }
              ].map((s) => {
                const isSel = filterState.sortBy === s.type;
                return (
                  <button
                    key={s.type}
                    type="button"
                    onClick={() =>
                      onFilterChange((prev) => ({ ...prev, sortBy: s.type }))
                    }
                    className={`py-1.5 px-2.5 rounded-xl text-xs font-medium text-center transition-all cursor-pointer ${
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

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/70 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs sm:text-sm shadow-md transition-colors cursor-pointer"
          >
            {totalMatchedCount !== undefined
              ? `Xem ${totalMatchedCount} BĐS phù hợp`
              : "Áp dụng bộ lọc"}
          </button>
        </div>
      </div>
    </div>
  );
};
