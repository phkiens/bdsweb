import React, { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate } from "react-router-dom";
import {
  Users,
  Search,
  Phone,
  ChevronRight,
  UserPlus,
  Trash2
} from "lucide-react";
import { db } from "../../data/local/db";
import { Customer } from "../../core/models/customer";
import { CustomerRole, CustomerStatus } from "../../core/models/enums";
import { canonicalizeVietnamesePhone, normalizeVietnamese } from "../../core/utils/vietnamese";
import { PhoneActionModal } from "../../components/common/PhoneActionModal";
import { syncManager } from "../../data/sync/sync-manager";
import { nowTimestamp } from "../../core/utils/date";

export const CustomerListPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDemand, setSelectedDemand] = useState<string>("ALL");
  const [phoneModalNumber, setPhoneModalNumber] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  // Form add customer
  const [newCustomer, setNewCustomer] = useState({
    name: "",
    phone: "",
    demandType: "Cần mua",
    propertyType: "Nhà",
    demandAreas: "",
    demandDirections: "",
    priceMin: 0,
    priceMax: 0,
    note: "",
    role: CustomerRole.BUYER
  });

  const customers = useLiveQuery(async () => {
    return await db.customers
      .filter((c) => !c.isDeleted)
      .reverse()
      .sortBy("updatedAt");
  }, []);

  const filteredCustomers = (customers || []).filter((c) => {
    if (selectedDemand !== "ALL" && c.demandType !== selectedDemand) return false;
    if (searchQuery.trim()) {
      const q = normalizeVietnamese(searchQuery);
      const inName = normalizeVietnamese(c.name).includes(q);
      const inPhone = c.phone.includes(searchQuery.trim());
      const inArea = normalizeVietnamese(c.demandAreas).includes(q);
      if (!inName && !inPhone && !inArea) return false;
    }
    return true;
  });

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustomer.name.trim()) return;

    const now = Date.now();
    const id = `cust-${now}-${Math.random().toString(36).substring(2, 6)}`;
    const cust: Customer = {
      id,
      name: newCustomer.name.trim(),
      nameNormalized: normalizeVietnamese(newCustomer.name),
      phone: canonicalizeVietnamesePhone(newCustomer.phone),
      demandType: newCustomer.demandType,
      propertyType: newCustomer.propertyType,
      demandAreas: newCustomer.demandAreas.trim(),
      demandDirections: newCustomer.demandDirections.trim(),
      priceMin: Number(newCustomer.priceMin) || 0,
      priceMax: Number(newCustomer.priceMax) || 0,
      note: newCustomer.note.trim(),
      noteNormalized: normalizeVietnamese(newCustomer.note),
      role: newCustomer.role,
      status: CustomerStatus.ACTIVE,
      updatedAt: now,
      isSynced: false,
      isDeleted: false,
      avatarPath: null,
      avatarDriveUrl: null
    };

    await db.customers.add(cust);
    syncManager.pushChanges();

    setShowAddModal(false);
    setNewCustomer({
      name: "",
      phone: "",
      demandType: "Cần mua",
      propertyType: "Nhà",
      demandAreas: "",
      demandDirections: "",
      priceMin: 0,
      priceMax: 0,
      note: "",
      role: CustomerRole.BUYER
    });
  };

  const handleDeleteCustomer = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!window.confirm("Bạn có chắc muốn xóa khách hàng này?")) return;
    await db.customers.update(id, {
      isDeleted: true,
      updatedAt: nowTimestamp(),
      isSynced: false
    });
    syncManager.pushChanges();
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-4 md:py-6 pb-24 md:pb-12">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Users className="w-6 h-6 text-blue-600" />
            <span>Quản Lý Khách Hàng (CRM)</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Danh sách khách mua, chủ nhà và tự động ghép nối BĐS ({filteredCustomers.length})
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors"
        >
          <UserPlus className="w-4 h-4" />
          <span>Thêm khách mới</span>
        </button>
      </div>

      {/* Filter & Search */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm theo tên khách, SĐT, khu vực..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-hidden"
          />
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {["ALL", "Cần mua", "Cần thuê", "Cần bán"].map((dm) => (
            <button
              key={dm}
              onClick={() => setSelectedDemand(dm)}
              className={`text-xs px-3 py-2 rounded-xl font-semibold whitespace-nowrap transition-colors ${
                selectedDemand === dm
                  ? "bg-blue-600 text-white"
                  : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
              }`}
            >
              {dm === "ALL" ? "Tất cả nhu cầu" : dm}
            </button>
          ))}
        </div>
      </div>

      {/* Customer List */}
      {filteredCustomers.length === 0 ? (
        <div className="text-center py-16 px-4 bg-white border border-slate-200 rounded-2xl shadow-xs">
          <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-3">
            <Users className="w-6 h-6" />
          </div>
          <h4 className="text-base font-semibold text-slate-700">Chưa có khách hàng nào</h4>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Bấm nút "Thêm khách mới" để ghi nhận nhu cầu mua hoặc ký gửi bất động sản.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredCustomers.map((c) => (
            <div
              key={c.id}
              onClick={() => navigate(`/customers/${c.id}`)}
              className="p-4 bg-white border border-slate-200 hover:border-blue-300 rounded-2xl shadow-2xs hover:shadow-sm transition-all cursor-pointer flex items-start justify-between gap-3"
            >
              <div className="space-y-1.5 flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-100 text-blue-800">
                    {c.demandType}
                  </span>
                  <h3 className="font-semibold text-slate-800 text-sm md:text-base truncate">
                    {c.name}
                  </h3>
                  <span className="text-xs text-slate-500 font-mono">
                    {c.phone}
                  </span>
                </div>

                <div className="text-xs text-slate-600 flex flex-wrap gap-x-3 gap-y-1">
                  <span>
                    Ngân sách:{" "}
                    <strong className="text-blue-700">
                      {c.priceMin} - {c.priceMax} tỷ
                    </strong>
                  </span>
                  <span>• Loại: {c.propertyType || "Bất kỳ"}</span>
                  {c.demandAreas && <span>• KV: {c.demandAreas}</span>}
                </div>

                {c.note && (
                  <p className="text-xs text-slate-500 line-clamp-1 italic">
                    Ghi chú: {c.note}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                {c.phone && (
                  <button
                    onClick={() => setPhoneModalNumber(c.phone)}
                    className="p-2 rounded-xl bg-slate-50 hover:bg-emerald-50 text-slate-600 hover:text-emerald-700 transition-colors"
                    title="Liên hệ khách hàng"
                  >
                    <Phone className="w-4 h-4" />
                  </button>
                )}

                <button
                  onClick={(e) => handleDeleteCustomer(e, c.id)}
                  className="p-2 rounded-xl bg-slate-50 hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors"
                  title="Xóa khách hàng"
                >
                  <Trash2 className="w-4 h-4" />
                </button>

                <ChevronRight className="w-4 h-4 text-slate-400" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Customer Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-xl overflow-hidden p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-blue-600" />
                <span>Thêm Khách Hàng Mới</span>
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateCustomer} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Họ tên khách hàng <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newCustomer.name}
                  onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                  placeholder="Ví dụ: Anh Hoàng"
                  className="w-full text-sm p-2.5 bg-slate-50 border border-slate-300 rounded-xl outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Số điện thoại</label>
                <input
                  type="tel"
                  value={newCustomer.phone}
                  onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                  placeholder="0901234567"
                  className="w-full text-sm p-2.5 bg-slate-50 border border-slate-300 rounded-xl outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Nhu cầu</label>
                  <select
                    value={newCustomer.demandType}
                    onChange={(e) => setNewCustomer({ ...newCustomer, demandType: e.target.value })}
                    className="w-full text-sm p-2.5 bg-slate-50 border border-slate-300 rounded-xl outline-hidden"
                  >
                    <option value="Cần mua">Cần mua</option>
                    <option value="Cần thuê">Cần thuê</option>
                    <option value="Cần bán">Cần bán</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Loại BĐS</label>
                  <select
                    value={newCustomer.propertyType}
                    onChange={(e) => setNewCustomer({ ...newCustomer, propertyType: e.target.value })}
                    className="w-full text-sm p-2.5 bg-slate-50 border border-slate-300 rounded-xl outline-hidden"
                  >
                    <option value="Nhà">Nhà</option>
                    <option value="Đất">Đất</option>
                    <option value="Bất kỳ">Bất kỳ</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Giá min (tỷ)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={newCustomer.priceMin || ""}
                    onChange={(e) =>
                      setNewCustomer({ ...newCustomer, priceMin: parseFloat(e.target.value) || 0 })
                    }
                    placeholder="2.0"
                    className="w-full text-sm p-2.5 bg-slate-50 border border-slate-300 rounded-xl outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Giá max (tỷ)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={newCustomer.priceMax || ""}
                    onChange={(e) =>
                      setNewCustomer({ ...newCustomer, priceMax: parseFloat(e.target.value) || 0 })
                    }
                    placeholder="5.0"
                    className="w-full text-sm p-2.5 bg-slate-50 border border-slate-300 rounded-xl outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Khu vực quan tâm (cách nhau bởi ||| hoặc phẩy)
                </label>
                <input
                  type="text"
                  value={newCustomer.demandAreas}
                  onChange={(e) => setNewCustomer({ ...newCustomer, demandAreas: e.target.value })}
                  placeholder="Bình Thạnh|||Quận 1"
                  className="w-full text-sm p-2.5 bg-slate-50 border border-slate-300 rounded-xl outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Ghi chú nhu cầu</label>
                <textarea
                  rows={2}
                  value={newCustomer.note}
                  onChange={(e) => setNewCustomer({ ...newCustomer, note: e.target.value })}
                  placeholder="Ưu tiên hẻm xe hơi, gần trường học..."
                  className="w-full text-sm p-2.5 bg-slate-50 border border-slate-300 rounded-xl outline-hidden"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2.5 bg-slate-100 text-slate-700 text-xs font-semibold rounded-xl"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-blue-600 text-white text-xs font-semibold rounded-xl hover:bg-blue-700 shadow-xs"
                >
                  Lưu khách hàng
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Phone modal */}
      <PhoneActionModal
        phoneNumber={phoneModalNumber || ""}
        isOpen={Boolean(phoneModalNumber)}
        onClose={() => setPhoneModalNumber(null)}
      />
    </div>
  );
};
