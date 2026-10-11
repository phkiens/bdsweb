import React, { useState, useEffect, useRef } from "react";
import { formatPropertyPrice } from "../../core/utils/property-price";

export interface QuickPriceModalProps {
  isOpen: boolean;
  currentPrice: number;
  isSaving: boolean;
  onDismiss: () => void;
  onConfirm: (newPrice: number) => void;
}

export const QuickPriceModal: React.FC<QuickPriceModalProps> = ({
  isOpen,
  currentPrice,
  isSaving,
  onDismiss,
  onConfirm
}) => {
  // Trang chỉ gắn modal khi mở ⇒ mỗi lần mở là một lần khởi tạo mới
  const [priceInput, setPriceInput] = useState(() => (currentPrice ? currentPrice.toString() : ""));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Khi modal mở: focus và chọn sẵn chữ
  useEffect(() => {
    if (isOpen) {
      const timer = window.setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 50);
      return () => window.clearTimeout(timer);
    }
  }, [isOpen]);

  // Lắng nghe phím ESC để đóng modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isSaving) {
        onDismiss();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isSaving, onDismiss]);

  if (!isOpen) return null;

  const currentPriceFormatted =
    formatPropertyPrice(currentPrice) || `${currentPrice} tỷ`;

  const handleConfirm = () => {
    if (isSaving) return;
    const raw = priceInput.trim().replace(",", ".");
    if (!raw) {
      setErrorMessage("Vui lòng nhập giá");
      return;
    }
    const parsed = parseFloat(raw);
    if (!Number.isFinite(parsed) || parsed <= 0 || Number.isNaN(parsed)) {
      setErrorMessage("Vui lòng nhập giá hợp lệ (> 0)");
      return;
    }

    setErrorMessage(null);
    onConfirm(parsed);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={() => {
        if (!isSaving) onDismiss();
      }}
    >
      <div
        className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-5 space-y-4 border border-slate-100 animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Tiêu đề */}
        <div>
          <h3 className="text-base font-bold text-slate-900 tracking-tight">
            CẬP NHẬT GIÁ
          </h3>
        </div>

        {/* Nội dung */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">Giá hiện tại:</span>
            <span className="font-bold text-blue-600">
              {currentPriceFormatted}
            </span>
          </div>

          <div className="space-y-1">
            <label
              htmlFor="quick-price-input"
              className="text-xs font-semibold text-slate-700"
            >
              Giá mới
            </label>
            <div className="relative rounded-xl shadow-2xs">
              <input
                id="quick-price-input"
                ref={inputRef}
                type="text"
                inputMode="decimal"
                value={priceInput}
                disabled={isSaving}
                onChange={(e) => {
                  setPriceInput(e.target.value);
                  if (errorMessage) {
                    setErrorMessage(null);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleConfirm();
                  }
                }}
                placeholder="Ví dụ: 3.2 hoặc 2,9"
                className={`w-full px-3.5 py-2.5 pr-20 text-sm font-semibold rounded-xl border transition-colors outline-hidden ${
                  errorMessage
                    ? "border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-100"
                    : "border-slate-300 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                } disabled:bg-slate-100 disabled:text-slate-400`}
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400 pointer-events-none">
                tỷ đồng
              </span>
            </div>
            <div className="text-[11px] min-h-[16px]">
              {errorMessage ? (
                <span className="text-red-600 font-medium">{errorMessage}</span>
              ) : (
                <span className="text-slate-400">Đơn vị: tỷ đồng</span>
              )}
            </div>
          </div>
        </div>

        {/* Nút thao tác */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            disabled={isSaving}
            onClick={onDismiss}
            className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
          >
            Hủy
          </button>
          <button
            type="button"
            disabled={isSaving}
            onClick={handleConfirm}
            className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            {isSaving ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Đang lưu...</span>
              </>
            ) : (
              <span>Lưu</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
