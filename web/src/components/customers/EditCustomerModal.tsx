import React, { useState, useEffect } from "react";
import { UserPlus, UserCheck, X } from "lucide-react";
import { Customer } from "../../core/models/customer";
import { CustomerRole, CustomerStatus } from "../../core/models/enums";
import { canonicalizeVietnamesePhone, normalizeVietnamese } from "../../core/utils/vietnamese";
import { prepareCustomerForWrite } from "../../core/services/customer-validator";
import { db } from "../../data/local/db";
import { syncManager } from "../../data/sync/sync-manager";
import { nowTimestamp } from "../../core/utils/date";

export interface EditCustomerModalProps {
  isOpen: boolean;
  customer?: Customer | null; // null/undefined = Add new, Customer object = Edit existing
  onClose: () => void;
  onSaved?: (customer: Customer) => void;
}

export const EditCustomerModal: React.FC<EditCustomerModalProps> = ({
  isOpen,
  customer,
  onClose,
  onSaved
}) => {
  const isEditing = Boolean(customer);

  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    demandType: "Cần mua",
    propertyType: "Nhà",
    demandAreas: "",
    demandDirections: "",
    priceMin: 0,
    priceMax: 0,
    note: "",
    role: CustomerRole.BUYER as CustomerRole | string,
    status: CustomerStatus.ACTIVE as CustomerStatus | string
  });

  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Điền dữ liệu khi mở modal
  useEffect(() => {
    if (customer) {
      setFormData({
        name: customer.name || "",
        phone: customer.phone || "",
        demandType: customer.demandType || "Cần mua",
        propertyType: customer.propertyType || "Nhà",
        demandAreas: customer.demandAreas || "",
        demandDirections: customer.demandDirections || "",
        priceMin: customer.priceMin || 0,
        priceMax: customer.priceMax || 0,
        note: customer.note || "",
        role: customer.role || CustomerRole.BUYER,
        status: customer.status || CustomerStatus.ACTIVE
      });
    } else {
      setFormData({
        name: "",
        phone: "",
        demandType: "Cần mua",
        propertyType: "Nhà",
        demandAreas: "",
        demandDirections: "",
        priceMin: 0,
        priceMax: 0,
        note: "",
        role: CustomerRole.BUYER,
        status: CustomerStatus.ACTIVE
      });
    }
    setErrorMessage("");
  }, [customer, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setErrorMessage("Vui lòng nhập họ tên khách hàng");
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage("");
      const now = nowTimestamp();

      const customerId = customer ? customer.id : `cust-${now}-${Math.random().toString(36).substring(2, 6)}`;

      const draft: Customer = {
        id: customerId,
        name: formData.name.trim(),
        nameNormalized: normalizeVietnamese(formData.name),
        phone: canonicalizeVietnamesePhone(formData.phone),
        demandType: formData.demandType,
        propertyType: formData.propertyType,
        demandAreas: formData.demandAreas.trim(),
        demandDirections: formData.demandDirections.trim(),
        priceMin: Number(formData.priceMin) || 0,
        priceMax: Number(formData.priceMax) || 0,
        note: formData.note.trim(),
        noteNormalized: normalizeVietnamese(formData.note),
        role: formData.role,
        status: formData.status,
        updatedAt: now,
        isSynced: false,
        isDeleted: false,
        avatarPath: customer?.avatarPath || null,
        avatarDriveUrl: customer?.avatarDriveUrl || null
      };

      // Thẩm định và kiểm tra trùng số điện thoại
      const prepared = await prepareCustomerForWrite(db, draft);

      if (isEditing) {
        await db.customers.update(customerId, prepared);
        await db.enqueueOutbox("CUSTOMER", customerId, "UPSERT");
      } else {
        await db.customers.add(prepared);
        await db.enqueueOutbox("CUSTOMER", customerId, "UPSERT");
      }

      await syncManager.pushChanges();

      if (onSaved) onSaved(prepared);
      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message || "Lỗi khi lưu thông tin khách hàng");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-md rounded-2xl shadow-xl overflow-hidden p-5 space-y-4 max-h-[90vh] overflow-y-auto border border-slate-100 animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
            {isEditing ? (
              <UserCheck className="w-5 h-5 text-emerald-600" />
            ) : (
              <UserPlus className="w-5 h-5 text-blue-600" />
            )}
            <span>{isEditing ? "Chỉnh Sửa Khách Hàng" : "Thêm Khách Hàng Mới"}</span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Error message */}
        {errorMessage && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium">
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Tên */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Họ tên khách hàng <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Ví dụ: Anh Hoàng"
              className="w-full text-sm p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-hidden"
            />
          </div>

          {/* SĐT & Vai trò */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Số điện thoại</label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="0901234567"
                className="w-full text-sm p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-hidden font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Phân loại vai trò</label>
              <select
                value={formData.role}
                onChange={(e) => {
                  const newRole = e.target.value;
                  setFormData({
                    ...formData,
                    role: newRole,
                    demandType: newRole === CustomerRole.OWNER ? "Ký gửi BĐS" : "Cần mua"
                  });
                }}
                className="w-full text-sm p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-hidden"
              >
                <option value={CustomerRole.BUYER}>Khách mua / thuê</option>
                <option value={CustomerRole.OWNER}>Chủ nhà ký gửi</option>
              </select>
            </div>
          </div>

          {/* Trạng thái & Nhu cầu */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Trạng thái</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="w-full text-sm p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-hidden"
              >
                <option value={CustomerStatus.ACTIVE}>Đang hoạt động</option>
                <option value={CustomerStatus.CLOSED}>Đã giao dịch xong (Đóng)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Nhu cầu chính</label>
              <select
                value={formData.demandType}
                onChange={(e) => setFormData({ ...formData, demandType: e.target.value })}
                className="w-full text-sm p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-hidden"
              >
                <option value="Cần mua">Cần mua</option>
                <option value="Cần thuê">Cần thuê</option>
                <option value="Cần bán">Cần bán</option>
                <option value="Ký gửi BĐS">Ký gửi BĐS</option>
              </select>
            </div>
          </div>

          {/* Loại BĐS & Khoảng giá */}
          {formData.role !== CustomerRole.OWNER && (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Loại BĐS quan tâm</label>
                <select
                  value={formData.propertyType}
                  onChange={(e) => setFormData({ ...formData, propertyType: e.target.value })}
                  className="w-full text-sm p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-hidden"
                >
                  <option value="Nhà">Nhà</option>
                  <option value="Đất">Đất</option>
                  <option value="Bất kỳ">Bất kỳ</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Giá min (tỷ)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.priceMin || ""}
                    onChange={(e) =>
                      setFormData({ ...formData, priceMin: parseFloat(e.target.value) || 0 })
                    }
                    placeholder="2.0"
                    className="w-full text-sm p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Giá max (tỷ)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.priceMax || ""}
                    onChange={(e) =>
                      setFormData({ ...formData, priceMax: parseFloat(e.target.value) || 0 })
                    }
                    placeholder="5.0"
                    className="w-full text-sm p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-hidden"
                  />
                </div>
              </div>
            </>
          )}

          {/* Khu vực */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Khu vực quan tâm / có nhà (cách nhau bởi ||| hoặc phẩy)
            </label>
            <input
              type="text"
              value={formData.demandAreas}
              onChange={(e) => setFormData({ ...formData, demandAreas: e.target.value })}
              placeholder="Bình Thạnh|||Quận 1"
              className="w-full text-sm p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-hidden"
            />
          </div>

          {/* Ghi chú */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Ghi chú nhu cầu</label>
            <textarea
              rows={2}
              value={formData.note}
              onChange={(e) => setFormData({ ...formData, note: e.target.value })}
              placeholder="Ưu tiên hẻm xe hơi, gần trường học..."
              className="w-full text-sm p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-hidden"
            />
          </div>

          {/* Nút hành động */}
          <div className="flex gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? "Đang lưu..." : isEditing ? "Lưu thay đổi" : "Tạo khách hàng"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
