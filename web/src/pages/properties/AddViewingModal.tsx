import React, { useState, useMemo } from "react";
import { X, Search, UserCheck, Calendar, FileText, AlertCircle } from "lucide-react";
import { Customer } from "../../core/models/customer";
import { CustomerPropertyRole, CustomerStatus } from "../../core/models/enums";
import { db } from "../../data/local/db";
import { syncManager } from "../../data/sync/sync-manager";

interface AddViewingModalProps {
  isOpen: boolean;
  onClose: () => void;
  propertyId: string;
  propertyArea: string;
  activeCustomers: Customer[];
  existingLinkedCustomerIds: Set<string>;
  onSuccess: () => void;
}

export const AddViewingModal: React.FC<AddViewingModalProps> = ({
  isOpen,
  onClose,
  propertyId,
  propertyArea,
  activeCustomers,
  existingLinkedCustomerIds,
  onSuccess
}) => {
  const todayFormatted = useMemo(() => {
    const d = new Date();
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  }, []);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [viewDate, setViewDate] = useState(todayFormatted);
  const [viewNote, setViewNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const availableCustomers = useMemo(() => {
    const norm = searchQuery.trim().toLowerCase();
    return activeCustomers.filter((c) => {
      if (existingLinkedCustomerIds.has(c.id)) return false;
      if (c.isDeleted || c.status !== CustomerStatus.ACTIVE) return false;
      if (!norm) return true;
      return (
        c.name.toLowerCase().includes(norm) ||
        c.phone.includes(norm) ||
        (c.demandType && c.demandType.toLowerCase().includes(norm))
      );
    });
  }, [activeCustomers, existingLinkedCustomerIds, searchQuery]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerId) {
      setErrorMsg("Vui lòng chọn một khách hàng từ danh sách.");
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg(null);

      // Check double-linking CAS
      const existing = await db.customer_property_links.get([selectedCustomerId, propertyId]);
      if (existing && !existing.isDeleted) {
        setErrorMsg("Khách này đã có liên kết với BĐS này.");
        setIsSubmitting(false);
        return;
      }

      await db.customer_property_links.put({
        customerId: selectedCustomerId,
        propertyId,
        role: CustomerPropertyRole.VIEWER,
        viewDate: viewDate.trim() || todayFormatted,
        viewNote: viewNote.trim() || null,
        updatedAt: Date.now(),
        isDeleted: false,
        isSynced: false
      });

      await db.enqueueOutbox("LINK", `${selectedCustomerId}:::${propertyId}`, "UPSERT");
      syncManager.pushChanges();
      onSuccess();
      onClose();
    } catch (err) {
      setErrorMsg(`Lỗi khi lưu lượt xem nhà: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center">
              <UserCheck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-sm md:text-base">Thêm khách xem nhà</h3>
              <p className="text-xs text-slate-500">
                Ghi nhận lượt dẫn khách xem tài sản: <strong className="text-slate-700">{propertyArea || "BĐS"}</strong>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Form */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-y-auto p-5 space-y-4">
          {errorMsg && (
            <div className="flex items-start gap-2 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Search Customer */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">Chọn khách hàng từ CRM</label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm tên hoặc SĐT khách..."
                className="w-full pl-9 pr-3 py-2 text-xs md:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-hidden transition-colors"
              />
            </div>

            {/* Customer List Selection */}
            <div className="border border-slate-200 rounded-xl max-h-40 overflow-y-auto divide-y divide-slate-100 bg-white">
              {availableCustomers.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-400">
                  {searchQuery
                    ? "Không tìm thấy khách hàng phù hợp."
                    : "Không còn khách hàng khả dụng chưa liên kết."}
                </div>
              ) : (
                availableCustomers.map((cust) => {
                  const isSelected = selectedCustomerId === cust.id;
                  return (
                    <div
                      key={cust.id}
                      onClick={() => setSelectedCustomerId(cust.id)}
                      className={`p-2.5 flex items-center justify-between cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-purple-50 text-purple-900 font-semibold"
                          : "hover:bg-slate-50 text-slate-700"
                      }`}
                    >
                      <div>
                        <div className="text-xs font-medium">{cust.name}</div>
                        <div className="text-[11px] text-slate-500">{cust.phone}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        {cust.demandType && (
                          <span className="text-[10px] px-2 py-0.5 bg-slate-100 rounded-md text-slate-600">
                            {cust.demandType}
                          </span>
                        )}
                        <input
                          type="radio"
                          name="selectedCustomer"
                          checked={isSelected}
                          onChange={() => setSelectedCustomerId(cust.id)}
                          className="text-purple-600 focus:ring-purple-500"
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Viewing Date */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-500" />
              <span>Ngày dẫn xem (dd/MM/yyyy)</span>
            </label>
            <input
              type="text"
              value={viewDate}
              onChange={(e) => setViewDate(e.target.value)}
              placeholder="dd/MM/yyyy (ví dụ: 25/12/2024)"
              className="w-full px-3 py-2 text-xs md:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-hidden transition-colors"
            />
          </div>

          {/* Viewing Note */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-slate-500" />
              <span>Nhận xét / Phản hồi của khách</span>
            </label>
            <textarea
              rows={3}
              value={viewNote}
              onChange={(e) => setViewNote(e.target.value)}
              placeholder="Ví dụ: Khách khen nhà thoáng, nhưng chê hẻm hơi nhỏ. Đang đàm phán giá 3.8 tỷ..."
              className="w-full p-3 text-xs md:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-hidden transition-colors"
            />
          </div>

          {/* Footer Buttons */}
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !selectedCustomerId}
              className="px-5 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-sm transition-colors flex items-center gap-1.5"
            >
              {isSubmitting ? "Đang lưu..." : "Lưu lượt xem"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
