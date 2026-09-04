import React from "react";
import {
  CheckCircle2,
  RefreshCw,
  Clock,
  User,
  Ruler,
  Compass,
  Star,
  ChevronRight,
  Trash2
} from "lucide-react";
import { Property } from "../../core/models/property";
import { PropertyStatus } from "../../core/models/enums";
import { toTitleCase } from "../../core/utils/vietnamese";
import { parseR2MediaKeys } from "../../data/remote/r2-media-client";
import { PropertyThumbnail } from "./PropertyThumbnail";

export enum SyncState {
  NOT_SYNCED = "NOT_SYNCED",
  FULLY_SYNCED = "FULLY_SYNCED",
  PARTIALLY_SYNCED = "PARTIALLY_SYNCED"
}

/**
 * Tính trạng thái đồng bộ khớp 100% với hàm getSyncState trong Native Android PropertyCard.kt
 */
export function getPropertySyncState(property: Property): SyncState {
  if (!property.isTextSynced) return SyncState.NOT_SYNCED;

  const imagePath = property.imagePath;
  if (!imagePath || !imagePath.trim()) {
    return SyncState.FULLY_SYNCED;
  }
  const localPaths = imagePath
    .split("|||")
    .map((s) => s.trim())
    .filter(Boolean);
  if (localPaths.length === 0) {
    return SyncState.FULLY_SYNCED;
  }

  const r2Items = parseR2MediaKeys(property.r2MediaKeys);
  if (r2Items.length === 0) {
    return SyncState.PARTIALLY_SYNCED;
  }

  const r2FileNames = new Set(r2Items.map((i) => i.fileName.toLowerCase()));
  const r2MediaIds = new Set(
    r2Items.map((i) => i.fileName.replace(/\.[^/.]+$/, "").toLowerCase())
  );

  for (const path of localPaths) {
    const fileName = path.split("/").pop()?.split("\\").pop()?.toLowerCase() || "";
    const mediaId = fileName.replace(/\.[^/.]+$/, "");
    const exists = r2FileNames.has(fileName) || r2MediaIds.has(mediaId);
    if (!exists) {
      return SyncState.PARTIALLY_SYNCED;
    }
  }

  return SyncState.FULLY_SYNCED;
}

interface SyncStatusIconProps {
  state: SyncState;
  className?: string;
}

export const SyncStatusIcon: React.FC<SyncStatusIconProps> = ({ state, className = "w-4 h-4" }) => {
  switch (state) {
    case SyncState.FULLY_SYNCED:
      return (
        <span title="Đã đồng bộ đầy đủ lên Supabase & R2" className="inline-flex">
          <CheckCircle2 className={`text-emerald-700 shrink-0 ${className}`} />
        </span>
      );
    case SyncState.PARTIALLY_SYNCED:
      return (
        <span title="Đã đồng bộ text, còn ảnh chưa tải xong lên R2" className="inline-flex">
          <RefreshCw className={`text-amber-600 shrink-0 animate-spin-slow ${className}`} />
        </span>
      );
    case SyncState.NOT_SYNCED:
    default:
      return (
        <span title="Chưa đồng bộ (đang chờ mạng hoặc đang offline)" className="inline-flex">
          <Clock className={`text-slate-400 shrink-0 ${className}`} />
        </span>
      );
  }
};

export interface PropertyCardProps {
  property: Property;
  onClick?: () => void;
  mode?: "verified" | "unverified" | "select";
  isMultiSelectMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
  onToggleNeedToViewToday?: (e: React.MouseEvent) => void;
  onToggleStatus?: (e: React.MouseEvent) => void;
  onVerify?: (e: React.MouseEvent) => void;
  onDelete?: (e: React.MouseEvent) => void;
  className?: string;
}

export const PropertyCard: React.FC<PropertyCardProps> = ({
  property,
  onClick,
  mode = "verified",
  isMultiSelectMode = false,
  isSelected = false,
  onToggleSelect,
  onToggleNeedToViewToday,
  onToggleStatus,
  onVerify,
  onDelete,
  className = ""
}) => {
  const isUnverified = !property.isVerified || mode === "unverified";
  const syncState = getPropertySyncState(property);

  // Định dạng giá giống Native: >= 1 tỷ thì làm tròn tỷ, < 1 thì tính triệu
  const formattedPrice =
    property.price > 0
      ? property.price >= 1
        ? `${property.price} tỷ`
        : `${Math.round(property.price * 1000)} triệu`
      : null;

  // Lấy hướng đầu tiên
  const firstDirection = property.direction
    ? property.direction.split("|||").map((s) => s.trim()).filter(Boolean)[0] || null
    : null;

  const handleClick = () => {
    if (isMultiSelectMode) {
      if (onToggleSelect) onToggleSelect();
    } else {
      if (onClick) onClick();
    }
  };

  return (
    <div
      onClick={handleClick}
      data-testid={isUnverified ? `unverified_card_${property.id}` : `property_card_${property.id}`}
      className={`flex items-center px-3 sm:px-4 py-2 sm:py-2.5 transition-colors cursor-pointer select-none group relative ${
        isSelected
          ? "bg-blue-50/70 hover:bg-blue-50"
          : "bg-white hover:bg-slate-50/90 active:bg-slate-100"
      } ${className}`}
    >
      {/* 1. Multi-Select Checkbox */}
      {isMultiSelectMode && (
        <div className="pr-2.5 shrink-0 flex items-center" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelect && onToggleSelect()}
            className="w-4 h-4 text-blue-600 rounded-sm border-slate-300 focus:ring-blue-500 cursor-pointer"
          />
        </div>
      )}

      {/* 2. Thumbnail 60x60dp with Star Badge Overlay */}
      <PropertyThumbnail
        property={property}
        size={60}
        showStarBadge={!isUnverified}
        className="shrink-0"
      />

      {/* 3. Center & Right Content (Flex-1) */}
      <div className="flex-1 min-w-0 pl-3 flex flex-col justify-center gap-1">
        {/* Row 1: Khu vực | Tên chủ nhà */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <h3
              className="font-bold text-sm text-slate-900 truncate"
              title={property.area || "Chưa rõ khu vực"}
            >
              {toTitleCase(property.area) || "Chưa rõ khu vực"}
            </h3>
          </div>

          <div className="shrink-0 flex items-center gap-1 text-slate-500 text-xs max-w-[130px] sm:max-w-[180px]">
            {property.ownerName ? (
              <span className="truncate text-slate-600 font-medium" title={property.ownerName}>
                {property.ownerName}
              </span>
            ) : (
              <span title="Chưa có thông tin chủ nhà" className="inline-flex">
                <User className="w-3.5 h-3.5 text-slate-300" />
              </span>
            )}
          </div>
        </div>

        {/* Row 2: Giá | Diện tích */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            {formattedPrice ? (
              <span className="font-bold text-sm text-blue-600 tracking-tight">
                {formattedPrice}
              </span>
            ) : (
              <span className="text-xs text-slate-400 italic">Chưa có giá</span>
            )}

            {/* Quick status badge on desktop / tablet for verified properties */}
            {onToggleStatus && !isUnverified && (
              <button
                type="button"
                onClick={(e) => onToggleStatus(e)}
                className={`hidden sm:inline-block px-1.5 py-0.2 text-[10px] font-bold rounded-md transition-colors cursor-pointer ${
                  property.status === PropertyStatus.FOR_SALE
                    ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                    : property.status === PropertyStatus.PAUSED
                    ? "bg-amber-50 text-amber-700 hover:bg-amber-100"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
                title="Bấm để chuyển nhanh trạng thái"
              >
                {property.status}
              </button>
            )}
          </div>

          <div className="shrink-0 flex items-center gap-1 text-xs text-slate-600 font-medium">
            {property.areaSize && property.areaSize > 0 ? (
              <span>{property.areaSize} m²</span>
            ) : (
              <span title="Chưa có diện tích" className="inline-flex">
                <Ruler className="w-3.5 h-3.5 text-slate-300" />
              </span>
            )}
          </div>
        </div>

        {/* Row 3: Ngày khảo sát | Hướng + Icon đồng bộ / Badge CHỜ XM / Quick Actions */}
        <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
          <div className="truncate text-[11px] sm:text-xs">
            {property.surveyDate ? (
              <span>{property.surveyDate}</span>
            ) : (
              <span className="text-slate-300">Chưa ghi ngày</span>
            )}
          </div>

          <div className="shrink-0 flex items-center gap-2">
            {/* Hướng */}
            {firstDirection ? (
              <span className="text-slate-500 font-medium text-[11px] sm:text-xs">
                {firstDirection}
              </span>
            ) : (
              <span title="Chưa có hướng" className="inline-flex">
                <Compass className="w-3.5 h-3.5 text-slate-300" />
              </span>
            )}

            {/* Badge CHỜ XM nếu unverified, hoặc SyncStatusIcon nếu verified */}
            {isUnverified ? (
              <div className="flex items-center gap-1.5">
                <span
                  onClick={(e) => {
                    if (onVerify) {
                      e.stopPropagation();
                      onVerify(e);
                    }
                  }}
                  className={`px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-100 text-amber-800 tracking-wider ${
                    onVerify ? "hover:bg-amber-200 cursor-pointer" : ""
                  }`}
                  title={onVerify ? "Bấm để xác thực tin này" : "Tin chờ xác minh"}
                >
                  CHỜ XM
                </span>

                {/* Quick Verify button */}
                {onVerify && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onVerify(e);
                    }}
                    className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-semibold rounded-md shadow-2xs transition-colors cursor-pointer"
                    title="Xác thực BĐS"
                  >
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Xác thực</span>
                  </button>
                )}

                {/* Quick Delete button */}
                {onDelete && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(e);
                    }}
                    className="hidden sm:inline-flex p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
                    title="Xóa tin"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ) : (
              <SyncStatusIcon state={syncState} />
            )}

            {/* Nút xem hôm nay nhanh cho desktop hover */}
            {onToggleNeedToViewToday && !isUnverified && (
              <button
                type="button"
                onClick={(e) => onToggleNeedToViewToday(e)}
                className={`hidden md:flex p-1 rounded-md transition-colors cursor-pointer ${
                  property.needToViewToday
                    ? "text-amber-500 hover:bg-amber-50"
                    : "text-slate-300 hover:text-amber-500 hover:bg-slate-100"
                }`}
                title={property.needToViewToday ? "Bỏ đánh dấu xem hôm nay" : "Đánh dấu xem hôm nay"}
              >
                <Star className={`w-3.5 h-3.5 ${property.needToViewToday ? "fill-amber-400" : ""}`} />
              </button>
            )}

            <ChevronRight className="hidden sm:block w-3.5 h-3.5 text-slate-300 group-hover:text-slate-500 transition-colors" />
          </div>
        </div>
      </div>
    </div>
  );
};
