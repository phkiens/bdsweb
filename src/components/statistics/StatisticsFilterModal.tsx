import React, { useState } from "react";
import { X } from "lucide-react";
import {
  IStatisticsDateRange,
  StatisticsDateRange,
  StatisticsFilter
} from "../../core/statistics/statistics-filter";

export interface PriceRangeOption {
  label: string;
  min: number | null;
  max: number | null;
}

export const PRICE_OPTIONS: PriceRangeOption[] = [
  { label: "Tất cả", min: null, max: null },
  { label: "< 2 tỷ", min: null, max: 2.0 },
  { label: "2–3 tỷ", min: 2.0, max: 3.0 },
  { label: "3–5 tỷ", min: 3.0, max: 5.0 },
  { label: "5–7 tỷ", min: 5.0, max: 7.0 },
  { label: "≥ 7 tỷ", min: 7.0, max: null }
];

export interface StatisticsFilterModalProps {
  isOpen: boolean;
  currentFilter: StatisticsFilter;
  onDismiss: () => void;
  onApply: (filter: StatisticsFilter) => void;
}

export const StatisticsFilterModal: React.FC<StatisticsFilterModalProps> = ({
  isOpen,
  currentFilter,
  onDismiss,
  onApply
}) => {
  const presetRanges: Array<[IStatisticsDateRange, string]> = [
    [StatisticsDateRange.AllTime, "Tất cả"],
    [StatisticsDateRange.Last7Days, "7 ngày"],
    [StatisticsDateRange.Last30Days, "30 ngày"],
    [StatisticsDateRange.Last90Days, "90 ngày"]
  ];

  const [selectedRange, setSelectedRange] = useState<IStatisticsDateRange>(currentFilter.dateRange);
  const [selectedPriceOption, setSelectedPriceOption] = useState<PriceRangeOption>(() => {
    return (
      PRICE_OPTIONS.find(
        (it) => it.min === currentFilter.priceMin && it.max === currentFilter.priceMax
      ) ?? {
        label: "Tùy biến",
        min: currentFilter.priceMin,
        max: currentFilter.priceMax
      }
    );
  });
  const [selectedArea, setSelectedArea] = useState(currentFilter.area ?? "");
  const [selectedType, setSelectedType] = useState(currentFilter.propertyType ?? "");

  // Trang chỉ gắn modal khi mở ⇒ state khởi tạo từ currentFilter mỗi lần mở (không cần effect đồng bộ)

  if (!isOpen) return null;

  const handleReset = () => {
    onApply(new StatisticsFilter());
    onDismiss();
  };

  const handleApply = () => {
    const areaVal = selectedArea.trim();
    const typeVal = selectedType.trim();

    const newFilter = new StatisticsFilter({
      dateRange: selectedRange,
      priceMin: selectedPriceOption.min,
      priceMax: selectedPriceOption.max,
      area: areaVal.length > 0 ? areaVal : null,
      propertyType: typeVal.length > 0 ? typeVal : null,
      status: currentFilter.status,
      verifiedMode: currentFilter.verifiedMode
    });
    onApply(newFilter);
    onDismiss();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in duration-150">
      <div className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh] animate-in slide-in-from-bottom duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-900">Bộ Lọc Thống Kê</h2>
          <button
            onClick={onDismiss}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
            title="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-5 overflow-y-auto space-y-5">
          {/* Cửa sổ thời gian */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2">
              Cửa sổ thời gian
            </label>
            <div className="flex flex-wrap gap-2">
              {presetRanges.map(([range, label]) => {
                const isSelected = selectedRange.type === range.type;
                return (
                  <button
                    key={range.type}
                    type="button"
                    onClick={() => setSelectedRange(range)}
                    className={`px-3.5 py-1.5 text-xs font-medium rounded-full border transition-all cursor-pointer ${
                      isSelected
                        ? "bg-blue-50 text-blue-700 border-blue-400 font-bold shadow-2xs"
                        : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tầm giá */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2">
              Tầm giá
            </label>
            <div className="flex flex-wrap gap-2">
              {PRICE_OPTIONS.map((opt) => {
                const isSelected =
                  selectedPriceOption.min === opt.min && selectedPriceOption.max === opt.max;
                return (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => setSelectedPriceOption(opt)}
                    className={`px-3.5 py-1.5 text-xs font-medium rounded-full border transition-all cursor-pointer ${
                      isSelected
                        ? "bg-blue-50 text-blue-700 border-blue-400 font-bold shadow-2xs"
                        : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Khu vực */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Khu vực (để trống: tất cả)
            </label>
            <input
              type="text"
              value={selectedArea}
              onChange={(e) => setSelectedArea(e.target.value)}
              placeholder="VD: Lê Chân, Hải An..."
              className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-hidden transition-all"
            />
          </div>

          {/* Loại BĐS */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Loại BĐS (để trống: tất cả)
            </label>
            <input
              type="text"
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              placeholder="VD: Nhà, Đất..."
              className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-hidden transition-all"
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center gap-3 p-4 border-t border-slate-100 bg-slate-50/50">
          <button
            type="button"
            onClick={handleReset}
            className="flex-1 py-2.5 px-4 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-colors cursor-pointer"
          >
            Đặt lại
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="flex-1 py-2.5 px-4 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            Áp dụng
          </button>
        </div>
      </div>
    </div>
  );
};
