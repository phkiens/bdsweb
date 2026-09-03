import React, { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate } from "react-router-dom";
import {
  Search,
  Filter,
  Calendar,
  Plus,
  Trash2,
  Phone,
  Clock,
  Compass,
  ChevronRight
} from "lucide-react";
import { db } from "../../data/local/db";
import { Property } from "../../core/models/property";
import { normalizeVietnamese } from "../../core/utils/vietnamese";
import { PropertyStatus } from "../../core/models/enums";

export const PropertyListPage: React.FC = () => {
  const navigate = useNavigate();

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [viewTodayOnly, setViewTodayOnly] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");
  const [selectedType, setSelectedType] = useState<string>("ALL");
  const [showFilterDrawer, setShowFilterDrawer] = useState(false);

  // Multi-select state
  const [isMultiSelect, setIsMultiSelect] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Reactive query from Dexie IndexedDB
  const properties = useLiveQuery(async () => {
    return await db.properties
      .filter((p) => !p.isDeleted && p.isVerified)
      .reverse()
      .sortBy("updatedAt");
  }, []);

  if (properties === undefined) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  // Filter properties in memory
  const filteredProperties = properties.filter((p) => {
    if (viewTodayOnly && !p.needToViewToday) return false;
    if (selectedStatus !== "ALL" && p.status !== selectedStatus) return false;
    if (selectedType !== "ALL" && p.propertyType !== selectedType) return false;

    if (searchQuery.trim()) {
      const q = normalizeVietnamese(searchQuery);
      const inArea = normalizeVietnamese(p.area).includes(q);
      const inOwner = normalizeVietnamese(p.ownerName).includes(q);
      const inPhone = p.ownerPhone.includes(searchQuery.trim());
      const inDesc = normalizeVietnamese(p.description).includes(q);
      if (!inArea && !inOwner && !inPhone && !inDesc) return false;
    }
    return true;
  });

  const handleToggleNeedToViewToday = async (e: React.MouseEvent, p: Property) => {
    e.stopPropagation();
    const nextVal = !p.needToViewToday;
    await db.properties.update(p.id, {
      needToViewToday: nextVal,
      updatedAt: Date.now(),
      isTextSynced: false
    });
  };

  const handleToggleStatus = async (e: React.MouseEvent, p: Property) => {
    e.stopPropagation();
    const nextStatus =
      p.status === PropertyStatus.FOR_SALE ? PropertyStatus.PAUSED : PropertyStatus.FOR_SALE;
    await db.properties.update(p.id, {
      status: nextStatus,
      updatedAt: Date.now(),
      isTextSynced: false
    });
  };

  const handleToggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Bạn có chắc muốn xóa ${selectedIds.size} BĐS đã chọn?`)) return;

    const now = Date.now();
    await db.transaction("rw", db.properties, async () => {
      for (const id of selectedIds) {
        await db.properties.update(id, {
          isDeleted: true,
          updatedAt: now,
          isTextSynced: false
        });
      }
    });
    setSelectedIds(new Set());
    setIsMultiSelect(false);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-4 md:py-6 pb-24 md:pb-12">
      {/* Top Controls Header */}
      <div className="flex flex-col gap-3 mb-4">
        <div className="flex items-center gap-2">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm kiếm khu vực, chủ nhà, SĐT..."
              className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-hidden shadow-2xs"
            />
          </div>

          {/* View Today toggle button */}
          <button
            onClick={() => setViewTodayOnly(!viewTodayOnly)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
              viewTodayOnly
                ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
            }`}
            title="Lọc BĐS cần khảo sát hôm nay"
          >
            <Calendar className="w-4 h-4" />
            <span className="hidden sm:inline">Hôm nay</span>
          </button>

          {/* Filter Drawer Toggle */}
          <button
            onClick={() => setShowFilterDrawer(!showFilterDrawer)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
              selectedStatus !== "ALL" || selectedType !== "ALL"
                ? "bg-blue-50 text-blue-700 border-blue-300"
                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
            }`}
          >
            <Filter className="w-4 h-4" />
            <span className="hidden sm:inline">Bộ lọc</span>
          </button>

          {/* Multi-Select Toggle */}
          <button
            onClick={() => {
              setIsMultiSelect(!isMultiSelect);
              setSelectedIds(new Set());
            }}
            className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
              isMultiSelect
                ? "bg-slate-800 text-white border-slate-800"
                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
            }`}
          >
            {isMultiSelect ? "Hủy chọn" : "Chọn nhiều"}
          </button>
        </div>

        {/* Expandable Quick Filter Chips */}
        {showFilterDrawer && (
          <div className="p-3 bg-white border border-slate-200 rounded-xl shadow-xs flex flex-wrap items-center gap-2 animate-in fade-in duration-150">
            <span className="text-xs font-semibold text-slate-500 mr-1">Trạng thái:</span>
            {["ALL", PropertyStatus.FOR_SALE, PropertyStatus.PAUSED, PropertyStatus.SOLD].map(
              (st) => (
                <button
                  key={st}
                  onClick={() => setSelectedStatus(st)}
                  className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors ${
                    selectedStatus === st
                      ? "bg-blue-600 text-white font-semibold"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {st === "ALL" ? "Tất cả" : st}
                </button>
              )
            )}

            <span className="text-xs font-semibold text-slate-500 ml-3 mr-1">Loại hình:</span>
            {["ALL", "Nhà", "Đất"].map((tp) => (
              <button
                key={tp}
                onClick={() => setSelectedType(tp)}
                className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors ${
                  selectedType === tp
                    ? "bg-blue-600 text-white font-semibold"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {tp === "ALL" ? "Tất cả" : tp}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Multi-Select Action Bar */}
      {isMultiSelect && selectedIds.size > 0 && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between animate-in fade-in">
          <span className="text-sm font-semibold text-blue-900">
            Đã chọn {selectedIds.size} BĐS
          </span>
          <button
            onClick={handleDeleteSelected}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Xóa đã chọn</span>
          </button>
        </div>
      )}

      {/* Counter Summary */}
      <div className="flex items-center justify-between text-xs text-slate-500 mb-3 px-1">
        <span>
          Hiển thị <strong>{filteredProperties.length}</strong> / {properties.length} BĐS chính thức
        </span>
        {viewTodayOnly && (
          <span className="text-blue-600 font-medium">Đang lọc xem hôm nay</span>
        )}
      </div>

      {/* Property Cards List */}
      {filteredProperties.length === 0 ? (
        <div className="text-center py-16 px-4 bg-white border border-slate-200 rounded-2xl shadow-xs">
          <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
            <Search className="w-6 h-6" />
          </div>
          <h4 className="text-base font-semibold text-slate-700">Không tìm thấy bất động sản nào</h4>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            {searchQuery || viewTodayOnly || selectedStatus !== "ALL" || selectedType !== "ALL"
              ? "Hãy thử nới lỏng bộ lọc hoặc từ khóa tìm kiếm."
              : "Bấm nút bên dưới để thêm BĐS đầu tiên vào kho."}
          </p>
          {(searchQuery || viewTodayOnly || selectedStatus !== "ALL" || selectedType !== "ALL") && properties.length > 0 ? (
            <div className="flex flex-col sm:flex-row gap-2 justify-center mt-4">
              <button
                onClick={() => {
                  setSearchQuery("");
                  setViewTodayOnly(false);
                  setSelectedStatus("ALL");
                  setSelectedType("ALL");
                }}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition-colors"
              >
                <span>Xem tất cả {properties.length} BĐS (Bỏ bộ lọc)</span>
              </button>
              <button
                onClick={() => navigate("/properties/new")}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs rounded-xl shadow-xs transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Thêm BĐS mới</span>
              </button>
            </div>
          ) : (
            <button
              onClick={() => navigate("/properties/new")}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs rounded-xl shadow-xs transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Thêm BĐS mới</span>
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredProperties.map((p) => {
            const isSelected = selectedIds.has(p.id);
            return (
              <div
                key={p.id}
                onClick={() => {
                  if (isMultiSelect) {
                    handleToggleSelect(p.id);
                  } else {
                    navigate(`/properties/${p.id}`);
                  }
                }}
                className={`p-4 bg-white border rounded-2xl shadow-2xs hover:shadow-sm transition-all cursor-pointer flex flex-col gap-2 relative ${
                  isSelected
                    ? "border-blue-500 ring-2 ring-blue-100 bg-blue-50/20"
                    : "border-slate-200 hover:border-slate-300"
                }`}
              >
                {/* Header Row: Type, Area, Status, Calendar Toggle */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {isMultiSelect && (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSelect(p.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-4 h-4 text-blue-600 rounded-sm border-slate-300 focus:ring-blue-500"
                      />
                    )}
                    <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 text-slate-700 shrink-0">
                      {p.propertyType}
                    </span>
                    <h3 className="font-semibold text-slate-800 text-sm md:text-base truncate">
                      {p.area || "Chưa có tên khu vực"}
                    </h3>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* Status Badge */}
                    <button
                      onClick={(e) => handleToggleStatus(e, p)}
                      className={`px-2 py-0.5 rounded-full text-[11px] font-bold transition-colors ${
                        p.status === PropertyStatus.FOR_SALE
                          ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                          : p.status === PropertyStatus.PAUSED
                          ? "bg-amber-100 text-amber-800 hover:bg-amber-200"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      }`}
                      title="Click để đổi nhanh trạng thái"
                    >
                      {p.status}
                    </button>

                    {/* Need to view today calendar button */}
                    <button
                      onClick={(e) => handleToggleNeedToViewToday(e, p)}
                      className={`p-1.5 rounded-lg transition-colors ${
                        p.needToViewToday
                          ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
                          : "text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      }`}
                      title={p.needToViewToday ? "Bỏ đánh dấu xem hôm nay" : "Đánh dấu cần xem hôm nay"}
                    >
                      <Calendar className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Metrics Row: Price, Area Size, Direction */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                  <div className="font-bold text-blue-700 text-sm md:text-base">
                    {p.price > 0 ? `${p.price} tỷ` : "Thương lượng"}
                  </div>
                  {p.areaSize && (
                    <div className="flex items-center gap-1">
                      <span>•</span>
                      <span>{p.areaSize} m²</span>
                    </div>
                  )}
                  {p.direction && (
                    <div className="flex items-center gap-1">
                      <span>•</span>
                      <Compass className="w-3.5 h-3.5 text-slate-400" />
                      <span>{p.direction}</span>
                    </div>
                  )}
                  {p.ownerPhone && (
                    <div className="flex items-center gap-1 text-slate-500">
                      <span>•</span>
                      <Phone className="w-3 h-3" />
                      <span>{p.ownerPhone}</span>
                    </div>
                  )}
                </div>

                {/* Description snippet */}
                {p.description && (
                  <p className="text-xs text-slate-500 line-clamp-2 mt-0.5">
                    {p.description}
                  </p>
                )}

                {/* Footer status row */}
                <div className="flex items-center justify-between pt-1 border-t border-slate-50 text-[11px] text-slate-400">
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>KS: {p.surveyDate || "N/A"}</span>
                  </div>

                  <div className="flex items-center gap-1 text-blue-600 font-medium hover:underline">
                    <span>Chi tiết</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Floating Action Button (Mobile & Desktop) */}
      <button
        onClick={() => navigate("/properties/new")}
        className="fixed bottom-20 md:bottom-8 right-6 w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-xl flex items-center justify-center transition-transform hover:scale-105 active:scale-95 z-40"
        title="Thêm BĐS mới"
      >
        <Plus className="w-7 h-7" />
      </button>
    </div>
  );
};
