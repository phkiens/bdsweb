import React, { useState, useMemo } from "react";
import { Search, X } from "lucide-react";
import { Property } from "../../core/models/property";
import { toTitleCase } from "../../core/utils/vietnamese";
import { formatPropertyPrice } from "../../core/utils/property-price";
import {
  PropertyPickerFormat,
  buildPickerCandidates,
  PickerCandidate
} from "../../core/engine/map-survey-route";
import { PropertyThumbnail } from "./PropertyThumbnail";
import { useLivestream } from "../../core/live/use-livestream";

export interface PropertyPickerRow {
  property: Property;
  trailing?: string | null;
  enabled?: boolean;
  disabledReason?: string | null;
}

export interface PropertyPickerModalProps {
  isOpen: boolean;
  title?: string;
  query?: string;
  onQueryChange?: (q: string) => void;
  rows?: PropertyPickerRow[];
  // Pool mode (đối chiếu ExtraPropertyPickerSheet ở Giá vừa giảm)
  pool?: Property[];
  anchors?: Property[];
  extraIds?: Set<string>;
  onToggleExtra?: (id: string) => void;
  // Generic toggle
  selectedIds?: Set<string>;
  onToggle?: (id: string) => void;
  onClose: () => void;
  confirmText?: string;
  searchPlaceholder?: string;
}

export const PropertyPickerModal: React.FC<PropertyPickerModalProps> = ({
  isOpen,
  title = "Thêm SP vào chuyến đi xem",
  query: externalQuery,
  onQueryChange: externalOnQueryChange,
  rows,
  pool,
  anchors = [],
  extraIds,
  onToggleExtra,
  selectedIds,
  onToggle,
  onClose,
  confirmText = "Xong",
  searchPlaceholder = "Tìm khu vực, giá, SĐT…"
}) => {
  const [internalQuery, setInternalQuery] = useState("");
  const { isLive } = useLivestream();

  const currentQuery = externalQuery !== undefined ? externalQuery : internalQuery;
  const handleQueryChange = (val: string) => {
    if (externalOnQueryChange) {
      externalOnQueryChange(val);
    } else {
      setInternalQuery(val);
    }
  };

  const candidates: PickerCandidate[] = useMemo(() => {
    if (!pool) return [];
    return buildPickerCandidates(pool, anchors, currentQuery, !isLive);
  }, [pool, anchors, currentQuery, isLive]);

  const displayRows: PropertyPickerRow[] = useMemo(() => {
    if (rows) return rows;
    return candidates.map((c) => ({
      property: c.property,
      trailing: c.distanceKm != null ? `~${c.distanceKm.toFixed(1)} km` : null,
      enabled: c.hasLocation,
      disabledReason: !c.hasLocation ? "Chưa định vị" : null
    }));
  }, [rows, candidates]);

  const activeCheckedSet = extraIds ?? selectedIds ?? new Set<string>();
  const handleToggle = (id: string) => {
    if (onToggleExtra) {
      onToggleExtra(id);
    } else if (onToggle) {
      onToggle(id);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in duration-150">
      <div className="bg-white w-full max-w-lg rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col max-h-[85vh] sm:max-h-[80vh] overflow-hidden border border-slate-100 animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2 border-b border-slate-100">
          <h3 className="font-bold text-slate-800 text-base">{title}</h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
            title="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Input */}
        <div className="p-4 border-b border-slate-100">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={currentQuery}
              onChange={(e) => handleQueryChange(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full pl-9 pr-8 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-hidden transition-all"
            />
            {currentQuery && (
              <button
                onClick={() => handleQueryChange("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                title="Xóa"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Candidate List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5 min-h-[160px]">
          {displayRows.length === 0 ? (
            <div className="text-center py-10 text-xs text-slate-500">
              Không tìm thấy BĐS nào
            </div>
          ) : (
            displayRows.map((row) => {
              const p = row.property;
              const isChecked = activeCheckedSet.has(p.id);
              const enabled = row.enabled !== false;

              // Format detail line
              const formattedPrice =
                formatPropertyPrice(p.price) ||
                (p.price != null && p.price > 0 ? `${p.price} tỷ` : "");
              const fullDetail = PropertyPickerFormat.detailLine(p);
              const detailRest = formattedPrice
                ? fullDetail.slice(formattedPrice.length)
                : fullDetail;

              return (
                <div
                  key={p.id}
                  onClick={() => {
                    if (enabled) handleToggle(p.id);
                  }}
                  className={`rounded-xl p-2.5 flex items-center gap-3 transition-colors ${
                    isChecked
                      ? "bg-blue-50/70 border-2 border-blue-600"
                      : "bg-slate-50/70 border border-slate-200"
                  } ${
                    enabled
                      ? "cursor-pointer hover:bg-slate-100/80"
                      : "opacity-40 cursor-not-allowed"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    disabled={!enabled}
                    onChange={() => {
                      if (enabled) handleToggle(p.id);
                    }}
                    className="w-4 h-4 text-blue-600 rounded-sm border-slate-300 focus:ring-blue-500 cursor-pointer"
                    onClick={(e) => e.stopPropagation()}
                  />

                  {/* Thumbnail */}
                  <PropertyThumbnail
                    property={p}
                    size={56}
                    showStarBadge={false}
                    className="rounded-lg shrink-0"
                  />

                  {/* Content */}
                  <div className="flex-1 min-w-0 space-y-0.5">
                    {/* Dòng 1: CHỜ XM + Khu vực + Trailing */}
                    <div className="flex items-center gap-1.5 min-w-0">
                      {!p.isVerified && (
                        <span className="shrink-0 px-1.5 py-0.2 bg-amber-100 text-amber-900 rounded text-[10px] font-bold">
                          CHỜ XM
                        </span>
                      )}
                      <h4 className="font-bold text-slate-900 text-sm truncate flex-1">
                        {toTitleCase(p.area) || "Chưa rõ khu vực"}
                      </h4>
                      {row.trailing && (
                        <span className="text-xs text-slate-500 shrink-0 font-medium">
                          {row.trailing}
                        </span>
                      )}
                    </div>

                    {/* Dòng 2: Giá · m² · Hướng */}
                    <div className="text-xs truncate">
                      <span className="font-bold text-blue-600">
                        {formattedPrice}
                      </span>
                      {detailRest && (
                        <span className="text-slate-500">
                          {detailRest}
                        </span>
                      )}
                    </div>

                    {/* Dòng 3: Disabled reason */}
                    {!enabled && row.disabledReason && (
                      <div className="text-[11px] font-semibold text-rose-600 truncate">
                        {row.disabledReason}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-white">
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
