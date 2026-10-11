import React, { useState, useMemo, useEffect } from "react";
import { ChevronRight, Trash2, X } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { getVisibleHistories } from "../../data/local/price-history-queries";
import {
  PropertyPriceHistory,
  PriceHistoryChangeType,
  PriceEditKind,
  toDisplayLabel
} from "../../core/models/price-history";
import {
  formatPrice,
  summarizeLatestPriceChange
} from "../../core/utils/price-history-ops";
import { ConfirmModal } from "../common/ConfirmModal";

export interface PropertyPriceHistorySectionProps {
  propertyId: string;
  histories?: PropertyPriceHistory[];
  onClearHistory?: () => void;
  className?: string;
}

function formatDateTime(timestamp: number): string {
  const d = new Date(timestamp);
  const pad = (n: number) => n.toString().padStart(2, "0");
  const day = pad(d.getDate());
  const month = pad(d.getMonth() + 1);
  const year = d.getFullYear();
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

export const PropertyPriceHistorySection: React.FC<PropertyPriceHistorySectionProps> = ({
  propertyId,
  histories: propHistories,
  onClearHistory,
  className
}) => {
  const [showBottomSheet, setShowBottomSheet] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Lắng nghe ESC để đóng bottom sheet
  useEffect(() => {
    if (!showBottomSheet) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowBottomSheet(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showBottomSheet]);

  // Lấy dữ liệu lịch sử giá hiển thị được nếu không truyền trực tiếp
  const queriedHistories = useLiveQuery(
    () => (propertyId ? getVisibleHistories(propertyId) : []),
    [propertyId]
  );

  const rawList = useMemo(
    () => propHistories ?? queriedHistories ?? [],
    [propHistories, queriedHistories]
  );

  // Sắp xếp giảm dần theo revision, rồi đến recordedAt (mới nhất lên trên cùng - giống Android)
  const histories = useMemo(
    () =>
      [...rawList].sort(
        (a, b) => b.revision - a.revision || b.recordedAt - a.recordedAt
      ),
    [rawList]
  );

  // Ẩn cả khối khi không có dòng nào (giống Android: if (histories.isEmpty()) return)
  if (histories.length === 0) {
    return null;
  }

  const summary = summarizeLatestPriceChange(histories);

  return (
    <>
      {/* Hàng "Biến động giá" + tóm tắt */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setShowBottomSheet(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setShowBottomSheet(true);
          }
        }}
        className={`w-full min-h-[48px] max-h-[52px] flex items-center justify-between px-3.5 py-3 cursor-pointer hover:bg-slate-50 transition-colors select-none ${
          className || ""
        }`}
        aria-label={`Biến động giá, ${summary.text}`}
      >
        <span className="text-sm font-medium text-slate-800">Biến động giá</span>
        <div className="flex items-center gap-1">
          <span
            className={`text-sm font-semibold ${
              summary.isDecrease === true
                ? "text-red-600"
                : summary.isDecrease === false
                ? "text-blue-600"
                : "text-slate-500"
            }`}
          >
            {summary.text}
          </span>
          <ChevronRight className="w-4 h-4 text-slate-400" />
        </div>
      </div>

      {/* Bottom Sheet / Modal Lịch sử biến động giá */}
      {showBottomSheet && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
          onClick={() => setShowBottomSheet(false)}
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
              <h3 className="font-bold text-slate-900 text-base">
                Lịch sử biến động giá
              </h3>
              <div className="flex items-center gap-1">
                {onClearHistory && (
                  <button
                    type="button"
                    onClick={() => setShowConfirm(true)}
                    className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                    title="Xoá lịch sử giá căn này"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowBottomSheet(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                  title="Đóng"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Dòng thời gian DetailedPriceHistoryTimeline */}
            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              {histories.map((history, index) => {
                const dateStr = formatDateTime(history.recordedAt);
                const isLast = index === histories.length - 1;

                // Màu chỉ báo timeline
                const isMarketChange =
                  history.changeType === PriceHistoryChangeType.PRICE_CHANGE &&
                  history.editKind === PriceEditKind.MARKET_CHANGE;
                const prev = history.previousPrice ?? history.currentPrice;
                const dotColor = isMarketChange
                  ? history.currentPrice < prev
                    ? "bg-red-500"
                    : "bg-blue-600"
                  : "bg-slate-300";

                const editKindLabel =
                  history.changeType === PriceHistoryChangeType.PRICE_CHANGE
                    ? toDisplayLabel(history.editKind)
                    : null;
                const dateWithKind = editKindLabel
                  ? `${dateStr} · ${editKindLabel}`
                  : dateStr;

                return (
                  <div key={history.id || index} className="flex gap-2.5">
                    {/* Cột chỉ báo dòng thời gian */}
                    <div className="flex flex-col items-center w-4 shrink-0">
                      <div className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${dotColor}`} />
                      {!isLast && (
                        <div className="w-0.5 flex-1 min-h-[36px] bg-slate-200 mt-1" />
                      )}
                    </div>

                    {/* Nội dung bản ghi */}
                    <div className={`flex-1 min-w-0 ${isLast ? "" : "pb-3"}`}>
                      {/* Dòng 1: Giá hiện tại + Tag biến động */}
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-sm text-slate-900">
                          {formatPrice(history.currentPrice)}
                        </span>

                        {/* Tag */}
                        {history.changeType === PriceHistoryChangeType.PRICE_CHANGE && (
                          (() => {
                            const pPrice = history.previousPrice;
                            if (pPrice != null && pPrice > 0) {
                              const diff = history.currentPrice - pPrice;
                              const diffAbs = Math.abs(diff);
                              const pct = (diffAbs / pPrice) * 100.0;
                              const pctStr = parseFloat(pct.toFixed(1)).toString();

                              if (diff < -1e-4) {
                                return (
                                  <span className="px-1.5 py-0.5 rounded text-[11px] font-bold bg-red-100 text-red-700">
                                    ↓ {formatPrice(diffAbs)} (-{pctStr}%)
                                  </span>
                                );
                              } else if (diff > 1e-4) {
                                return (
                                  <span className="px-1.5 py-0.5 rounded text-[11px] font-bold bg-blue-100 text-blue-700">
                                    ↑ {formatPrice(diffAbs)} (+{pctStr}%)
                                  </span>
                                );
                              } else {
                                return (
                                  <span className="text-xs text-slate-500">
                                    Không đổi
                                  </span>
                                );
                              }
                            }
                            return null;
                          })()
                        )}

                        {history.changeType === PriceHistoryChangeType.BASELINE && (
                          <span className="px-1.5 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-600">
                            Mốc ban đầu
                          </span>
                        )}

                        {history.changeType === PriceHistoryChangeType.RESTORE_BASELINE && (
                          <span className="px-1.5 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-600">
                            Khôi phục dữ liệu
                          </span>
                        )}
                      </div>

                      {/* Dòng 2: Ngày · Loại sửa & Giá/m² */}
                      <div className="flex items-center justify-between text-xs text-slate-400 mt-0.5">
                        <span>{dateWithKind}</span>
                        {history.currentPricePerM2 != null && (
                          <span>
                            {history.currentPricePerM2 < 1.0
                              ? `${parseFloat((history.currentPricePerM2 * 1000).toFixed(1))} tr/m²`
                              : `${parseFloat(history.currentPricePerM2.toFixed(1))} tỷ/m²`}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Hộp xác nhận xoá lịch sử giá */}
      {showConfirm && (
        <ConfirmModal
          isOpen={showConfirm}
          title="Xoá lịch sử giá căn này?"
          message="Mọi máy sẽ không còn thấy biến động giá cũ của căn này. Giá hiện tại thành mốc mới; lần đổi giá sau vẫn được ghi."
          confirmText="Xác nhận"
          cancelText="Hủy"
          variant="danger"
          onConfirm={() => {
            setShowConfirm(false);
            setShowBottomSheet(false);
            onClearHistory?.();
          }}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </>
  );
};
