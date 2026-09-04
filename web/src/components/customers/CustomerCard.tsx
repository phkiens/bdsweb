import React from "react";
import {
  Phone,
  Sparkles,
  Trash2,
  ChevronRight,
  CheckCircle2,
  Building2
} from "lucide-react";
import { Customer } from "../../core/models/customer";
import { CustomerRole, CustomerStatus } from "../../core/models/enums";
import { CustomerAvatar } from "./CustomerAvatar";

export interface CustomerCardProps {
  customer: Customer;
  ownerStats?: {
    totalCount: number;
    forSaleCount: number;
    soldCount: number;
  };
  onClick?: () => void;
  onPhoneClick?: (phone: string) => void;
  onMatchClick?: () => void;
  onDelete?: (e: React.MouseEvent) => void;
  className?: string;
}

export const CustomerCard: React.FC<CustomerCardProps> = ({
  customer,
  ownerStats,
  onClick,
  onPhoneClick,
  onMatchClick,
  onDelete,
  className = ""
}) => {
  const isOwner = customer.role === CustomerRole.OWNER;
  const isClosed = customer.status === CustomerStatus.CLOSED;
  const hasPhone = Boolean(customer.phone && customer.phone.trim());

  // Thống kê BĐS cho Chủ nhà
  const totalHouses = ownerStats?.totalCount ?? 0;
  const forSaleHouses = ownerStats?.forSaleCount ?? 0;
  const soldHouses = ownerStats?.soldCount ?? 0;

  const ownerSummary =
    totalHouses > 0
      ? `${totalHouses} nhà • ${forSaleHouses} đang bán • ${soldHouses} đã bán`
      : "Chưa có BĐS gửi bán";

  return (
    <div
      onClick={onClick}
      data-testid={`customer_card_${customer.id}`}
      className={`flex items-center px-3 sm:px-4 py-2 sm:py-2.5 transition-colors cursor-pointer select-none group relative bg-white hover:bg-slate-50/90 active:bg-slate-100 ${className}`}
    >
      {/* 1. Avatar 44px tròn với màu pastel chuẩn Native Android */}
      <CustomerAvatar
        name={customer.name}
        avatarPath={customer.avatarPath}
        avatarDriveUrl={customer.avatarDriveUrl}
        size={44}
        className="shrink-0"
      />

      {/* 2. Center Content (Flex-1) */}
      <div className="flex-1 min-w-0 pl-3 flex flex-col justify-center gap-0.5">
        {/* Row 1: Tên khách hàng + Closed status + Role Badge */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <h3
              className="font-bold text-sm text-slate-900 truncate"
              title={customer.name}
            >
              {customer.name}
            </h3>

            {isClosed && (
              <span title="Khách hàng đã giao dịch xong (Đã đóng)" className="inline-flex">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              </span>
            )}

            <span
              className={`px-1.5 py-0.2 rounded text-[10px] font-bold shrink-0 ${
                isOwner
                  ? "bg-amber-100 text-amber-800"
                  : "bg-blue-100 text-blue-800"
              }`}
            >
              {isOwner ? "Chủ nhà" : customer.demandType || "Khách mua"}
            </span>
          </div>
        </div>

        {/* Row 2: Chi tiết nhu cầu / Kho hàng */}
        <div className="flex items-center justify-between gap-2 text-xs">
          {isOwner ? (
            <div className="flex items-center gap-1 text-slate-600 truncate">
              <Building2 className="w-3 h-3 text-amber-600 shrink-0" />
              <span className="truncate">{ownerSummary}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 text-slate-600 truncate">
              <span className="font-semibold text-blue-600 shrink-0">
                {customer.priceMin || customer.priceMax
                  ? `${customer.priceMin} - ${customer.priceMax} tỷ`
                  : "Thương lượng"}
              </span>
              <span>•</span>
              <span className="truncate">{customer.propertyType || "Bất kỳ"}</span>
            </div>
          )}
        </div>

        {/* Row 3: SĐT + Khu vực */}
        <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
          <div className="flex items-center gap-2 truncate">
            {hasPhone ? (
              <span
                onClick={(e) => {
                  if (onPhoneClick) {
                    e.stopPropagation();
                    onPhoneClick(customer.phone);
                  }
                }}
                className="font-mono text-slate-700 hover:text-blue-600 hover:underline cursor-pointer"
                title="Bấm để gọi"
              >
                {customer.phone}
              </span>
            ) : (
              <span className="text-slate-400 italic">Chưa có SĐT</span>
            )}

            {customer.demandAreas && (
              <>
                <span>•</span>
                <span className="truncate max-w-[140px] sm:max-w-[220px]" title={customer.demandAreas}>
                  {customer.demandAreas}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 3. Right Action Buttons */}
      <div
        className="shrink-0 flex items-center gap-1 pl-2"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Nút Gọi */}
        {hasPhone && onPhoneClick && (
          <button
            type="button"
            onClick={() => onPhoneClick(customer.phone)}
            className="p-2 rounded-xl text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 transition-colors cursor-pointer"
            title={`Gọi ${customer.name}`}
          >
            <Phone className="w-4 h-4" />
          </button>
        )}

        {/* Nút Ghép BĐS (chỉ cho Buyer còn hoạt động) */}
        {!isOwner && !isClosed && onMatchClick && (
          <button
            type="button"
            onClick={onMatchClick}
            className="p-2 rounded-xl text-slate-500 hover:text-blue-700 hover:bg-blue-50 transition-colors cursor-pointer"
            title="Xem BĐS phù hợp với khách này"
          >
            <Sparkles className="w-4 h-4 text-blue-600" />
          </button>
        )}

        {/* Nút Xóa */}
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="hidden sm:inline-flex p-2 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
            title="Xóa khách hàng"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}

        <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-colors" />
      </div>
    </div>
  );
};
