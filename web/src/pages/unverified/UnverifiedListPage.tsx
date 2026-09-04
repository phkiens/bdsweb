import React, { useState, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Inbox,
  Sparkles,
  Search,
  X,
  Trash2,
  CheckSquare,
  Square,
  Layers,
  List,
  MapPin,
  AlertTriangle
} from "lucide-react";
import { db } from "../../data/local/db";
import { Property } from "../../core/models/property";
import { PropertyStatus } from "../../core/models/enums";
import { syncManager } from "../../data/sync/sync-manager";
import { createDefaultProperty } from "../../core/models/property";
import { canonicalizeVietnamesePhone, toTitleCase, normalizeVietnamese } from "../../core/utils/vietnamese";
import { parseVietnamCoordinates, calculateDistanceKm, isInVietnam } from "../../core/utils/coordinates";
import { nowTimestamp } from "../../core/utils/date";
import { PropertyCard } from "../../components/properties/PropertyCard";
import { ConfirmModal } from "../../components/common/ConfirmModal";

export interface PropertyCluster {
  center: Property;
  properties: Property[];
}

export interface AreaCluster {
  areaName: string;
  properties: Property[];
}

/**
 * Thuật toán gom cụm địa lý theo bán kính 2km (Đồng bộ Part 6 UnverifiedViewModel.kt)
 */
export function getGeoClusteredProperties(properties: Property[]): PropertyCluster[] {
  const withCoords = properties.filter(
    (p) => p.latitude != null && p.longitude != null && isInVietnam(p.latitude, p.longitude)
  );
  const clusters: PropertyCluster[] = [];
  const visited = new Set<string>();

  for (const prop of withCoords) {
    if (visited.has(prop.id)) continue;
    const currentCluster: Property[] = [prop];
    visited.add(prop.id);

    for (const other of withCoords) {
      if (visited.has(other.id)) continue;
      const dist = calculateDistanceKm(
        prop.latitude!,
        prop.longitude!,
        other.latitude!,
        other.longitude!
      );
      if (dist <= 2.0) {
        currentCluster.push(other);
        visited.add(other.id);
      }
    }
    clusters.push({ center: prop, properties: currentCluster });
  }
  return clusters;
}

/**
 * Thuật toán phân nhóm theo khu vực/tên đường cho BĐS chưa có tọa độ
 */
export function getAreaClusteredProperties(properties: Property[]): AreaCluster[] {
  const groups = new Map<string, Property[]>();

  for (const p of properties) {
    const rawArea = (p.area || "").trim();
    const areaKey = rawArea || "Chưa rõ khu vực";
    const list = groups.get(areaKey) || [];
    list.push(p);
    groups.set(areaKey, list);
  }

  const result: AreaCluster[] = [];
  groups.forEach((items, areaName) => {
    result.push({ areaName, properties: items });
  });

  // Sắp xếp nhóm có nhiều BĐS nhất lên đầu
  result.sort((a, b) => b.properties.length - a.properties.length);
  return result;
}

export const UnverifiedListPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Khởi tạo nội dung văn bản chia sẻ từ PWA Web Share Target URL params
  const sharedText = searchParams.get("text");
  const sharedTitle = searchParams.get("title");
  const sharedUrl = searchParams.get("url");
  const initialShared = [sharedTitle, sharedText, sharedUrl]
    .filter(Boolean)
    .join("\n")
    .trim();

  const [showImportModal, setShowImportModal] = useState(Boolean(initialShared));
  const [rawInput, setRawInput] = useState(initialShared);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");

  // Multi-select state
  const [isMultiSelect, setIsMultiSelect] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Clustered View state (PARITY-UNVER-002)
  const [isClusteredView, setIsClusteredView] = useState(false);

  // Confirm delete modal states
  const [singleDeleteProperty, setSingleDeleteProperty] = useState<Property | null>(null);
  const [batchDeleteModalOpen, setBatchDeleteModalOpen] = useState(false);

  // Truy vấn danh sách tin chờ khảo sát từ IndexedDB
  const rawUnverifiedList = useLiveQuery(async () => {
    return await db.properties
      .filter((p) => !p.isDeleted && !p.isVerified)
      .reverse()
      .sortBy("updatedAt");
  }, []);

  // Lọc theo tìm kiếm từ khóa
  const filteredList = useMemo(() => {
    if (!rawUnverifiedList) return [];
    if (!searchQuery.trim()) return rawUnverifiedList;

    const queryNorm = normalizeVietnamese(searchQuery.trim());
    return rawUnverifiedList.filter((p) => {
      const areaNorm = normalizeVietnamese(p.area || "");
      const ownerNorm = normalizeVietnamese(p.ownerName || "");
      const phoneNorm = p.ownerPhone ? p.ownerPhone.replace(/\D/g, "") : "";
      const textNorm = normalizeVietnamese(p.rawText || "");

      return (
        areaNorm.includes(queryNorm) ||
        ownerNorm.includes(queryNorm) ||
        phoneNorm.includes(searchQuery.trim().replace(/\D/g, "")) ||
        textNorm.includes(queryNorm)
      );
    });
  }, [rawUnverifiedList, searchQuery]);

  // Tính toán cụm vị trí (Geo & Area) khi ở chế độ xem gom cụm (PARITY-UNVER-002)
  const { geoClusters, areaClusters, withoutCoords } = useMemo(() => {
    if (!filteredList || filteredList.length === 0) {
      return { geoClusters: [], areaClusters: [], withoutCoords: [] };
    }
    const geo = getGeoClusteredProperties(filteredList);
    const without = filteredList.filter(
      (p) => p.latitude == null || p.longitude == null || !isInVietnam(p.latitude, p.longitude)
    );
    const area = getAreaClusteredProperties(without);
    return { geoClusters: geo, areaClusters: area, withoutCoords: without };
  }, [filteredList]);

  const handleVerify = (p: Property) => {
    navigate(`/properties/edit/${p.id}?openForVerify=true`);
  };

  const handleConfirmSingleDelete = async () => {
    if (!singleDeleteProperty) return;
    const now = nowTimestamp();
    await db.properties.update(singleDeleteProperty.id, {
      isDeleted: true,
      updatedAt: now,
      isTextSynced: false
    });
    await db.enqueueOutbox("PROPERTY", singleDeleteProperty.id, "DELETE");
    syncManager.pushChanges();
    setSingleDeleteProperty(null);
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

  const handleSelectAll = () => {
    if (selectedIds.size === filteredList.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredList.map((p) => p.id)));
    }
  };

  const handleConfirmBatchDelete = async () => {
    if (selectedIds.size === 0) return;

    const now = nowTimestamp();
    await db.transaction("rw", [db.properties, db.sync_outbox], async () => {
      for (const id of selectedIds) {
        await db.properties.update(id, {
          isDeleted: true,
          updatedAt: now,
          isTextSynced: false
        });
        await db.enqueueOutbox("PROPERTY", id, "DELETE");
      }
    });
    syncManager.pushChanges();
    setSelectedIds(new Set());
    setIsMultiSelect(false);
    setBatchDeleteModalOpen(false);
  };

  const handleImportRawText = async () => {
    if (!rawInput.trim()) return;

    // Parse thông tin thô
    const parsedCoords = parseVietnamCoordinates(rawInput);
    const phoneMatch = rawInput.match(/(?:0|\+84)[1-9]\d{8}/);
    const priceMatch = rawInput.match(/(\d+(?:[.,]\d+)?)\s*(?:tỷ|ty|t)/i);
    const areaSizeMatch = rawInput.match(/(\d+(?:[.,]\d+)?)\s*(?:m2|m²)/i);

    const firstLine = rawInput.trim().split("\n")[0].slice(0, 60);

    const newUnverified = createDefaultProperty({
      area: toTitleCase(firstLine) || "Tin trích xuất mới",
      rawText: rawInput,
      description: rawInput,
      latitude: parsedCoords ? parsedCoords[0] : null,
      longitude: parsedCoords ? parsedCoords[1] : null,
      ownerPhone: phoneMatch ? canonicalizeVietnamesePhone(phoneMatch[0]) : "",
      price: priceMatch ? parseFloat(priceMatch[1].replace(",", ".")) : 0,
      areaSize: areaSizeMatch ? parseFloat(areaSizeMatch[1].replace(",", ".")) : null,
      isVerified: false,
      status: PropertyStatus.PENDING_SURVEY
    });

    await db.properties.add(newUnverified);
    await db.enqueueOutbox("PROPERTY", newUnverified.id, "UPSERT");
    syncManager.pushChanges();

    setRawInput("");
    setShowImportModal(false);
  };

  if (rawUnverifiedList === undefined) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin w-8 h-8 border-4 border-amber-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  const isAllSelected =
    filteredList.length > 0 && selectedIds.size === filteredList.length;

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-4 py-3 sm:py-4 pb-24 md:pb-12">
      {/* Top Header & Controls */}
      <div className="flex flex-col gap-2.5 mb-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Inbox className="w-6 h-6 text-amber-600" />
              <span>Tin Chờ Khảo Sát</span>
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Bất động sản bóc tách từ Zalo/FB hoặc chưa qua khảo sát thực địa ({rawUnverifiedList.length})
            </p>
          </div>

          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            <span>Dán tin thô</span>
          </button>
        </div>

        {/* Search & Actions Bar (Responsive) */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          {/* Ô tìm kiếm chiếm trọn chiều ngang trên mobile */}
          <div className="relative flex-1 min-w-0">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm kiếm khu vực, chủ nhà, SĐT, nội dung..."
              className="w-full pl-9 pr-8 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-hidden shadow-2xs transition-all"
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

          {/* Action buttons */}
          <div className="flex items-center gap-1.5 shrink-0 justify-between sm:justify-start">
            {/* Nút chuyển đổi chế độ xem gom cụm theo khu vực (PARITY-UNVER-002) */}
            <button
              onClick={() => setIsClusteredView(!isClusteredView)}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                isClusteredView
                  ? "bg-amber-600 text-white border-amber-600 shadow-2xs"
                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
              }`}
              title={isClusteredView ? "Chuyển về danh sách phẳng" : "Xem gom cụm theo khu vực / tọa độ"}
            >
              {isClusteredView ? (
                <>
                  <List className="w-3.5 h-3.5" />
                  <span>Xem phẳng</span>
                </>
              ) : (
                <>
                  <Layers className="w-3.5 h-3.5" />
                  <span>Xem gom cụm</span>
                </>
              )}
            </button>

            <button
              onClick={() => {
                setIsMultiSelect(!isMultiSelect);
                setSelectedIds(new Set());
              }}
              className={`flex-1 sm:flex-initial px-3 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                isMultiSelect
                  ? "bg-slate-800 text-white border-slate-800 shadow-2xs"
                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
              }`}
            >
              {isMultiSelect ? "Hủy chọn" : "Chọn nhiều"}
            </button>
          </div>
        </div>
      </div>

      {/* Multi-Select Action Bar */}
      {isMultiSelect && (
        <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-3">
            <button
              onClick={handleSelectAll}
              className="flex items-center gap-1.5 text-xs font-semibold text-amber-900 hover:text-amber-950 cursor-pointer"
            >
              {isAllSelected ? (
                <CheckSquare className="w-4 h-4 text-amber-600" />
              ) : (
                <Square className="w-4 h-4 text-slate-400" />
              )}
              <span>{isAllSelected ? "Bỏ chọn tất cả" : "Chọn tất cả"}</span>
            </button>
            <span className="text-xs text-amber-800 font-medium">
              Đã chọn <strong>{selectedIds.size}</strong> tin
            </span>
          </div>

          {selectedIds.size > 0 && (
            <button
              onClick={() => setBatchDeleteModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Xóa ({selectedIds.size})</span>
            </button>
          )}
        </div>
      )}

      {/* Summary count */}
      <div className="flex items-center justify-between text-xs text-slate-500 mb-2 px-1">
        <span>
          Hiển thị <strong>{filteredList.length}</strong> / {rawUnverifiedList.length} tin chờ
          {isClusteredView && ` • ${geoClusters.length} cụm tọa độ, ${areaClusters.length} nhóm khu vực`}
        </span>
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="text-amber-600 hover:text-amber-700 underline font-medium cursor-pointer"
          >
            Bỏ lọc tìm kiếm
          </button>
        )}
      </div>

      {/* List / Clustered View */}
      {filteredList.length === 0 ? (
        <div className="text-center py-16 px-4 bg-white border border-slate-200 rounded-2xl shadow-xs">
          <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-500 flex items-center justify-center mx-auto mb-3">
            <Inbox className="w-6 h-6" />
          </div>
          <h4 className="text-base font-semibold text-slate-700">
            {searchQuery ? "Không tìm thấy tin chờ phù hợp" : "Hộp thư tin chờ trống"}
          </h4>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            {searchQuery
              ? "Hãy thử tìm kiếm bằng từ khóa hoặc số điện thoại khác."
              : "Chưa có tin chờ duyệt nào. Hãy bấm 'Dán tin thô' để trích xuất nhanh bài đăng bất động sản."}
          </p>
          <button
            onClick={() => (searchQuery ? setSearchQuery("") : setShowImportModal(true))}
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-medium text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            <span>{searchQuery ? "Xem tất cả tin chờ" : "Dán tin mới"}</span>
          </button>
        </div>
      ) : isClusteredView ? (
        /* Chế độ xem gom cụm vị trí (PARITY-UNVER-002: Geo clusters 2km & Area groups) */
        <div className="space-y-6 animate-in fade-in duration-150">
          {/* Section 1: Cụm có tọa độ theo bán kính 2km (Tương đồng Part 6 Native Android) */}
          {geoClusters.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-1.5 px-1 text-xs font-bold text-amber-800 uppercase tracking-wider">
                <MapPin className="w-3.5 h-3.5 text-amber-600" />
                <span>Nhóm Vị Trí Phù Hợp (Bán kính 2km)</span>
                <span className="text-[11px] font-semibold text-slate-500 normal-case ml-1">
                  ({geoClusters.length} cụm)
                </span>
              </div>

              {geoClusters.map((cluster, clusterIndex) => (
                <div
                  key={`geo_cluster_${clusterIndex}_${cluster.center.id}`}
                  className="bg-slate-50/70 border border-slate-200 rounded-2xl p-3 shadow-2xs space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200/80">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-6 h-6 rounded-lg bg-amber-100 text-amber-800 text-xs font-bold flex items-center justify-center shrink-0">
                        #{clusterIndex + 1}
                      </span>
                      <span className="font-bold text-slate-800 text-sm truncate">
                        {cluster.center.area || "Khu vực khảo sát"}
                      </span>
                    </div>
                    <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200 shrink-0">
                      {cluster.properties.length} BĐS
                    </span>
                  </div>

                  <div className="space-y-2 pl-1 sm:pl-2">
                    {cluster.properties.map((p) => {
                      const isSelected = selectedIds.has(p.id);
                      return (
                        <div
                          key={`cluster_${clusterIndex}_${p.id}`}
                          className="bg-white border border-slate-200 hover:border-amber-300 rounded-xl shadow-2xs overflow-hidden transition-all"
                        >
                          <PropertyCard
                            property={p}
                            mode="unverified"
                            onClick={() => navigate(`/properties/${p.id}`)}
                            onVerify={() => handleVerify(p)}
                            onDelete={() => setSingleDeleteProperty(p)}
                            isMultiSelectMode={isMultiSelect}
                            isSelected={isSelected}
                            onToggleSelect={() => handleToggleSelect(p.id)}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Section 2: BĐS chưa có tọa độ phân nhóm theo tên đường/khu vực */}
          {withoutCoords.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-1.5 px-1 text-xs font-bold text-amber-700 uppercase tracking-wider">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                <span>Chưa Có Tọa Độ (Theo Khu Vực / Tên Đường)</span>
                <span className="text-[11px] font-semibold text-slate-500 normal-case ml-1">
                  ({withoutCoords.length} tin cần định vị)
                </span>
              </div>

              {areaClusters.map((areaCluster, areaIndex) => (
                <div
                  key={`area_cluster_${areaIndex}_${areaCluster.areaName}`}
                  className="bg-amber-50/30 border border-amber-200/80 rounded-2xl p-3 shadow-2xs space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-2 pb-2 border-b border-amber-100">
                    <div className="flex items-center gap-2 min-w-0">
                      <MapPin className="w-4 h-4 text-amber-600 shrink-0" />
                      <span className="font-bold text-slate-800 text-sm truncate">
                        {areaCluster.areaName}
                      </span>
                    </div>
                    <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200 shrink-0">
                      {areaCluster.properties.length} BĐS
                    </span>
                  </div>

                  <div className="space-y-2 pl-1 sm:pl-2">
                    {areaCluster.properties.map((p) => {
                      const isSelected = selectedIds.has(p.id);
                      return (
                        <div
                          key={`area_prop_${areaIndex}_${p.id}`}
                          className="bg-white border border-slate-200 hover:border-amber-300 rounded-xl shadow-2xs overflow-hidden transition-all"
                        >
                          <PropertyCard
                            property={p}
                            mode="unverified"
                            onClick={() => navigate(`/properties/${p.id}`)}
                            onVerify={() => handleVerify(p)}
                            onDelete={() => setSingleDeleteProperty(p)}
                            isMultiSelectMode={isMultiSelect}
                            isSelected={isSelected}
                            onToggleSelect={() => handleToggleSelect(p.id)}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Chế độ danh sách phẳng mặc định - Container space-y-3 đảm bảo 100% selector E2E test .space-y-3 > div */
        <div className="space-y-3">
          {filteredList.map((p) => {
            const isSelected = selectedIds.has(p.id);
            return (
              <div
                key={p.id}
                className="bg-white border border-slate-200 hover:border-amber-300 rounded-xl shadow-2xs overflow-hidden transition-all"
              >
                <PropertyCard
                  property={p}
                  mode="unverified"
                  onClick={() => navigate(`/properties/${p.id}`)}
                  onVerify={() => handleVerify(p)}
                  onDelete={() => setSingleDeleteProperty(p)}
                  isMultiSelectMode={isMultiSelect}
                  isSelected={isSelected}
                  onToggleSelect={() => handleToggleSelect(p.id)}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-xl overflow-hidden p-5 space-y-4 border border-slate-100 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-600" />
                <h3 className="font-bold text-slate-800 text-base">Dán văn bản tin rao BĐS</h3>
              </div>
              <button
                onClick={() => setShowImportModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <textarea
              rows={6}
              value={rawInput}
              onChange={(e) => setRawInput(e.target.value)}
              placeholder="Dán toàn bộ nội dung tin rao từ Zalo, Facebook, SMS..."
              className="w-full text-xs md:text-sm p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 outline-hidden transition-all"
            />

            <div className="flex gap-2 justify-end pt-2 border-t border-slate-100">
              <button
                onClick={() => setShowImportModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Hủy
              </button>
              <button
                onClick={handleImportRawText}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                Trích xuất & Lưu tin chờ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal xác nhận xóa một tin */}
      <ConfirmModal
        isOpen={Boolean(singleDeleteProperty)}
        title="Xóa tin chờ khảo sát"
        message={`Bạn có chắc chắn muốn xóa tin chờ "${singleDeleteProperty?.area || "này"}"?\nThao tác này sẽ đánh dấu xóa và đồng bộ lên hệ thống.`}
        confirmText="Xóa tin"
        cancelText="Hủy"
        variant="danger"
        onConfirm={handleConfirmSingleDelete}
        onCancel={() => setSingleDeleteProperty(null)}
      />

      {/* Modal xác nhận xóa hàng loạt */}
      <ConfirmModal
        isOpen={batchDeleteModalOpen}
        title="Xóa hàng loạt tin chờ"
        message={`Bạn có chắc chắn muốn xóa ${selectedIds.size} tin chờ đã chọn?\nThao tác này sẽ đánh dấu xóa và đồng bộ lên đám mây.`}
        confirmText="Xóa các tin đã chọn"
        cancelText="Hủy"
        variant="danger"
        onConfirm={handleConfirmBatchDelete}
        onCancel={() => setBatchDeleteModalOpen(false)}
      />
    </div>
  );
};
