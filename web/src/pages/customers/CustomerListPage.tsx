import React, { useState, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate } from "react-router-dom";
import {
  Users,
  Search,
  UserPlus,
  ArrowUpDown,
  X
} from "lucide-react";
import { db } from "../../data/local/db";
import { Customer } from "../../core/models/customer";
import {
  CustomerFilter,
  OwnerStockFilter,
  OwnerPropertySort
} from "../../core/models/enums";
import { PhoneActionModal } from "../../components/common/PhoneActionModal";
import { syncManager } from "../../data/sync/sync-manager";
import { nowTimestamp } from "../../core/utils/date";
import {
  calculateOwnerPropertyStats,
  applyCustomerFilters
} from "../../core/engine/customer-filter";
import { CustomerCard } from "../../components/customers/CustomerCard";
import { EditCustomerModal } from "../../components/customers/EditCustomerModal";
import { ConfirmModal } from "../../components/common/ConfirmModal";

export const CustomerListPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [customerFilter, setCustomerFilter] = useState<CustomerFilter>(CustomerFilter.ALL);
  const [ownerStockFilter, setOwnerStockFilter] = useState<OwnerStockFilter>(OwnerStockFilter.ALL);
  const [ownerPropertySort, setOwnerPropertySort] = useState<OwnerPropertySort>(OwnerPropertySort.DEFAULT);
  const [phoneModalNumber, setPhoneModalNumber] = useState<string | null>(null);

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);

  const customers = useLiveQuery(async () => {
    return await db.customers
      .filter((c) => !c.isDeleted)
      .reverse()
      .sortBy("updatedAt");
  }, []);

  const links = useLiveQuery(async () => {
    return await db.customer_property_links
      .filter((l) => !l.isDeleted)
      .toArray();
  }, []);

  const properties = useLiveQuery(async () => {
    return await db.properties
      .filter((p) => !p.isDeleted)
      .toArray();
  }, []);

  const ownerPropertyStats = useMemo(() => {
    if (!links || !properties) return {};
    return calculateOwnerPropertyStats(links, properties);
  }, [links, properties]);

  const filteredCustomers = useMemo(() => {
    return applyCustomerFilters(
      customers || [],
      customerFilter,
      ownerPropertyStats,
      searchQuery,
      ownerStockFilter,
      ownerPropertySort
    );
  }, [customers, customerFilter, ownerPropertyStats, searchQuery, ownerStockFilter, ownerPropertySort]);

  const handleConfirmDelete = async () => {
    if (!customerToDelete) return;
    const now = nowTimestamp();
    await db.customers.update(customerToDelete.id, {
      isDeleted: true,
      updatedAt: now,
      isSynced: false
    });
    await db.enqueueOutbox("CUSTOMER", customerToDelete.id, "DELETE");
    await syncManager.pushChanges();
    setCustomerToDelete(null);
  };

  if (customers === undefined) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-4 py-3 sm:py-4 pb-24 md:pb-12">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
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
          className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors cursor-pointer"
        >
          <UserPlus className="w-4 h-4" />
          <span>Thêm khách</span>
        </button>
      </div>

      {/* Filter Tabs & Search */}
      <div className="space-y-2 mb-3">
        {/* Search box chiếm trọn chiều ngang */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm theo tên khách, SĐT, khu vực..."
            className="w-full pl-9 pr-8 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-hidden shadow-2xs transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              title="Xóa tìm kiếm"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Primary Role Filter Tabs */}
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {[
            { id: CustomerFilter.ALL, label: "Tất cả" },
            { id: CustomerFilter.BUYER_ACTIVE, label: "Khách mua" },
            { id: CustomerFilter.OWNER_ACTIVE, label: "Chủ nhà" },
            { id: CustomerFilter.CLOSED, label: "Đã đóng" }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setCustomerFilter(tab.id)}
              className={`text-xs px-3 py-1.5 rounded-xl font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                customerFilter === tab.id
                  ? "bg-blue-600 text-white shadow-2xs"
                  : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Sub-filter bar exclusively for OWNER context */}
        {customerFilter === CustomerFilter.OWNER_ACTIVE && (
          <div className="p-2.5 bg-white border border-slate-200 rounded-xl shadow-2xs flex flex-wrap items-center justify-between gap-2 animate-in fade-in duration-150">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-semibold text-slate-500 mr-1">Kho hàng:</span>
              {[
                { id: OwnerStockFilter.ALL, label: "Tất cả" },
                { id: OwnerStockFilter.HAS_STOCK, label: "Còn hàng" },
                { id: OwnerStockFilter.SOLD_OUT, label: "Đã bán hết" }
              ].map((st) => (
                <button
                  key={st.id}
                  onClick={() => setOwnerStockFilter(st.id)}
                  className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                    ownerStockFilter === st.id
                      ? "bg-amber-600 text-white font-semibold"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1.5">
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={ownerPropertySort}
                onChange={(e) => setOwnerPropertySort(e.target.value as OwnerPropertySort)}
                className="text-xs py-1 px-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 font-medium outline-hidden"
              >
                <option value={OwnerPropertySort.DEFAULT}>Sắp xếp: Mặc định</option>
                <option value={OwnerPropertySort.DESCENDING}>Giảm dần số nhà</option>
                <option value={OwnerPropertySort.ASCENDING}>Tăng dần số nhà</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Customer List - Continuous flat list with 76dp density */}
      {filteredCustomers.length === 0 ? (
        <div className="text-center py-16 px-4 bg-white border border-slate-200 rounded-2xl shadow-xs">
          <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-3">
            <Users className="w-6 h-6" />
          </div>
          <h4 className="text-base font-semibold text-slate-700">Chưa có khách hàng nào</h4>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            {searchQuery
              ? "Không tìm thấy khách hàng phù hợp với từ khóa."
              : "Bấm nút 'Thêm khách' để ghi nhận nhu cầu mua hoặc ký gửi bất động sản."}
          </p>
          <button
            onClick={() => (searchQuery ? setSearchQuery("") : setShowAddModal(true))}
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>{searchQuery ? "Xóa tìm kiếm" : "Thêm khách mới"}</span>
          </button>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-hidden divide-y divide-slate-100">
          {filteredCustomers.map((c) => (
            <CustomerCard
              key={c.id}
              customer={c}
              ownerStats={ownerPropertyStats[c.id]}
              onClick={() => navigate(`/customers/${c.id}`)}
              onPhoneClick={(phone) => setPhoneModalNumber(phone)}
              onMatchClick={() => navigate(`/customers/${c.id}?tab=matches`)}
              onDelete={(e) => {
                e.stopPropagation();
                setCustomerToDelete(c);
              }}
            />
          ))}
        </div>
      )}

      {/* Add Customer Modal */}
      <EditCustomerModal
        isOpen={showAddModal}
        customer={null}
        onClose={() => setShowAddModal(false)}
      />

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(customerToDelete)}
        title="Xóa khách hàng"
        message={`Bạn có chắc chắn muốn xóa khách hàng "${customerToDelete?.name || ""}"?\nThao tác này sẽ xóa khách hàng khỏi danh sách và đồng bộ lên đám mây.`}
        confirmText="Xóa khách"
        cancelText="Hủy"
        variant="danger"
        onConfirm={handleConfirmDelete}
        onCancel={() => setCustomerToDelete(null)}
      />

      {/* Phone modal */}
      <PhoneActionModal
        phoneNumber={phoneModalNumber || ""}
        isOpen={Boolean(phoneModalNumber)}
        onClose={() => setPhoneModalNumber(null)}
      />
    </div>
  );
};
