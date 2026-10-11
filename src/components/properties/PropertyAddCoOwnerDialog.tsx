import React, { useState, useMemo } from "react";
import { Search, X, UserPlus, AlertCircle } from "lucide-react";
import { Customer } from "../../core/models/customer";
import { CustomerRole } from "../../core/models/enums";
import { normalizeVietnamese } from "../../core/utils/vietnamese";

export interface PropertyAddCoOwnerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  candidates: Customer[];
  excludedIds: Set<string>;
  onPickExisting: (customerId: string) => Promise<void> | void;
  onCreateNew: (name: string, phone: string) => Promise<void> | void;
}

export const PropertyAddCoOwnerDialog: React.FC<PropertyAddCoOwnerDialogProps> = ({
  isOpen,
  onClose,
  candidates,
  excludedIds,
  onPickExisting,
  onCreateNew
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [showNewUserFields, setShowNewUserFields] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filteredCandidates = useMemo(() => {
    const nonExcluded = candidates.filter((c) => !excludedIds.has(c.id) && !c.isDeleted);
    const query = searchQuery.trim();
    if (!query) return nonExcluded;

    const normQuery = normalizeVietnamese(query);
    return nonExcluded.filter((c) => {
      const matchName = c.nameNormalized
        ? c.nameNormalized.includes(normQuery)
        : normalizeVietnamese(c.name).includes(normQuery);
      const matchPhone = c.phone ? c.phone.includes(query) : false;
      return matchName || matchPhone;
    });
  }, [candidates, excludedIds, searchQuery]);

  if (!isOpen) return null;

  const handlePick = async (customerId: string) => {
    try {
      setIsSubmitting(true);
      setError(null);
      await onPickExisting(customerId);
      onClose();
    } catch (err: any) {
      setError(err?.message || "Không thể thêm đồng sở hữu");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = newName.trim();
    if (!trimmedName) {
      setError("Vui lòng nhập tên người mới.");
      return;
    }
    try {
      setIsSubmitting(true);
      setError(null);
      await onCreateNew(trimmedName, newPhone.trim());
      onClose();
    } catch (err: any) {
      setError(err?.message || "Không thể thêm đồng sở hữu");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleShowNewUser = () => {
    setShowNewUserFields(true);
    const hasDigits = /\d/.test(searchQuery);
    if (hasDigits) {
      setNewPhone(searchQuery.trim());
      setNewName("");
    } else {
      setNewName(searchQuery.trim());
      setNewPhone("");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl max-w-md w-full overflow-hidden border border-slate-100 flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <UserPlus className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-slate-800 text-sm md:text-base">Thêm đồng sở hữu</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-3.5 flex-1">
          {error && (
            <div className="flex items-start gap-2 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Search box */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm tên hoặc SĐT"
              className="w-full pl-9 pr-3 py-2 text-xs md:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-hidden transition-colors"
            />
          </div>

          {/* Candidates List */}
          <div className="border border-slate-200 rounded-xl max-h-56 overflow-y-auto divide-y divide-slate-100 bg-white">
            {filteredCandidates.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">
                Không tìm thấy khách hàng nào
              </div>
            ) : (
              filteredCandidates.map((candidate) => (
                <div
                  key={candidate.id}
                  onClick={() => !isSubmitting && handlePick(candidate.id)}
                  className="p-3 hover:bg-blue-50/50 cursor-pointer transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-xs md:text-sm text-slate-800 truncate">
                      {candidate.name}
                    </span>
                    {candidate.phone && (
                      <span className="text-xs font-mono text-slate-500 shrink-0">
                        {candidate.phone}
                      </span>
                    )}
                  </div>
                  {candidate.role !== CustomerRole.OWNER && (
                    <div className="text-[11px] text-amber-700 font-medium mt-0.5">
                      Khách mua → sẽ chuyển sang Chủ nhà
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* New User Option */}
          {!showNewUserFields ? (
            <button
              type="button"
              onClick={handleShowNewUser}
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              <span>+ Người mới</span>
            </button>
          ) : (
            <form onSubmit={handleCreate} className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5 animate-in fade-in duration-150">
              <div className="text-xs font-bold text-slate-700">Thông tin người mới</div>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Tên"
                className="w-full px-3 py-2 text-xs md:text-sm bg-white border border-slate-200 rounded-xl focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-hidden"
              />
              <input
                type="text"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="SĐT"
                className="w-full px-3 py-2 text-xs md:text-sm bg-white border border-slate-200 rounded-xl focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-hidden"
              />
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowNewUserFields(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                >
                  Đóng
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !newName.trim()}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
                >
                  {isSubmitting ? "Đang thêm..." : "Thêm người mới"}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-100 bg-slate-50/50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
          >
            Hủy
          </button>
        </div>
      </div>
    </div>
  );
};
