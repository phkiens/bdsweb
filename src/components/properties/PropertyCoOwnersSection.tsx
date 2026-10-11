import React, { useState } from "react";
import { Users, Plus, Trash2, Phone } from "lucide-react";
import { Customer } from "../../core/models/customer";
import { ConfirmModal } from "../common/ConfirmModal";

export interface PropertyCoOwnersSectionProps {
  coOwners: Customer[];
  onOpenCustomer: (customerId: string) => void;
  onPhoneClick: (phone: string) => void;
  onRemoveCoOwner: (coOwner: Customer) => Promise<void> | void;
  onAddClick: () => void;
  className?: string;
}

export const PropertyCoOwnersSection: React.FC<PropertyCoOwnersSectionProps> = ({
  coOwners,
  onOpenCustomer,
  onPhoneClick,
  onRemoveCoOwner,
  onAddClick,
  className = ""
}) => {
  const [coOwnerToRemove, setCoOwnerToRemove] = useState<Customer | null>(null);

  const handleConfirmRemove = async () => {
    if (!coOwnerToRemove) return;
    const target = coOwnerToRemove;
    setCoOwnerToRemove(null);
    await onRemoveCoOwner(target);
  };

  return (
    <div className={`p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs space-y-3 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
            <Users className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h4 className="font-semibold text-slate-800 text-sm">Đồng sở hữu</h4>
              {coOwners.length > 0 && (
                <span className="px-1.5 py-0.2 bg-amber-100 text-amber-800 rounded-full text-[10px] font-bold">
                  {coOwners.length}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500">Chủ đồng sở hữu ngoài chủ chính</p>
          </div>
        </div>

        <button
          type="button"
          onClick={onAddClick}
          className="flex items-center gap-1 px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Thêm đồng sở hữu</span>
        </button>
      </div>

      {coOwners.length === 0 ? (
        <div className="text-center py-4 px-2 border border-dashed border-slate-200 rounded-xl text-xs text-slate-400">
          Chưa có đồng sở hữu nào cho căn này.
        </div>
      ) : (
        <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden bg-slate-50/40">
          {coOwners.map((coOwner) => (
            <div
              key={coOwner.id}
              className="p-3 flex items-center justify-between gap-3 hover:bg-white transition-colors"
            >
              <div
                onClick={() => onOpenCustomer(coOwner.id)}
                className="cursor-pointer min-w-0 flex-1"
              >
                <div className="text-xs md:text-sm font-bold text-slate-800 hover:text-blue-600 transition-colors truncate">
                  {coOwner.name}
                </div>
                {coOwner.phone && (
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      onPhoneClick(coOwner.phone);
                    }}
                    className="text-[11px] font-mono text-blue-600 hover:underline inline-flex items-center gap-1 mt-0.5 cursor-pointer"
                  >
                    <Phone className="w-3 h-3" />
                    <span>{coOwner.phone}</span>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => setCoOwnerToRemove(coOwner)}
                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                title="Gỡ đồng sở hữu"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Confirm Modal for Removing Co-Owner */}
      <ConfirmModal
        isOpen={Boolean(coOwnerToRemove)}
        title="Gỡ đồng sở hữu"
        message={`Bạn có chắc chắn muốn gỡ "${coOwnerToRemove?.name}" khỏi danh sách đồng sở hữu của BĐS này?`}
        confirmText="Gỡ"
        cancelText="Hủy"
        variant="danger"
        onConfirm={handleConfirmRemove}
        onCancel={() => setCoOwnerToRemove(null)}
      />
    </div>
  );
};
