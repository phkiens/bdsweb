import React, { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ArrowLeft,
  Edit,
  Trash2,
  Share2,
  Phone,
  ExternalLink,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Plus,
  Download,
  BookOpen,
  UserCheck,
  UserPlus,
  ChevronRight,
  Clock
} from "lucide-react";
import { db } from "../../data/local/db";
import { PropertyStatus } from "../../core/models/enums";
import { MatchEngine } from "../../core/engine/match-engine";
import { PhoneActionModal } from "../../components/common/PhoneActionModal";
import { syncManager } from "../../data/sync/sync-manager";
import {
  buildMergedActivityTimeline,
  formatDiaryEntry
} from "../../core/engine/activity-timeline-engine";
import { AddViewingModal } from "./AddViewingModal";

export const PropertyDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [phoneModalNumber, setPhoneModalNumber] = useState<string | null>(null);
  const [diaryInput, setDiaryInput] = useState("");
  const [showAddDiary, setShowAddDiary] = useState(false);
  const [showAddViewingModal, setShowAddViewingModal] = useState(false);
  const [activityFilter, setActivityFilter] = useState<"ALL" | "DIARY" | "VIEWING">("ALL");
  const [activeTab, setActiveTab] = useState<"detail" | "diary" | "matches">("detail");

  const property = useLiveQuery(() => (id ? db.properties.get(id) : undefined), [id]);
  const activeCustomers = useLiveQuery(() =>
    db.customers
      .filter((c) => !c.isDeleted)
      .toArray()
  );
  const propertyLinks = useLiveQuery(
    async () =>
      id
        ? await db.customer_property_links
            .where("propertyId")
            .equals(id)
            .filter((l) => !l.isDeleted)
            .toArray()
        : [],
    [id]
  );

  const customersMap = useMemo(
    () => new Map((activeCustomers || []).map((c) => [c.id, c])),
    [activeCustomers]
  );

  const existingLinkedCustomerIds = useMemo(
    () => new Set((propertyLinks || []).map((l) => l.customerId)),
    [propertyLinks]
  );

  const mergedActivityItems = useMemo(
    () => buildMergedActivityTimeline(property?.diary, propertyLinks || [], customersMap),
    [property?.diary, propertyLinks, customersMap]
  );

  const diaryCount = useMemo(
    () => mergedActivityItems.filter((item) => item.type === "DIARY").length,
    [mergedActivityItems]
  );
  const viewingCount = useMemo(
    () => mergedActivityItems.filter((item) => item.type === "VIEWING").length,
    [mergedActivityItems]
  );

  const displayedActivityItems = useMemo(() => {
    if (activityFilter === "DIARY") {
      return mergedActivityItems.filter((i) => i.type === "DIARY");
    }
    if (activityFilter === "VIEWING") {
      return mergedActivityItems.filter((i) => i.type === "VIEWING");
    }
    return mergedActivityItems;
  }, [mergedActivityItems, activityFilter]);

  if (!property) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  const images = property.imagePath ? property.imagePath.split("|||").filter(Boolean) : [];

  // Match calculations
  const matchEngine = new MatchEngine();
  const matchedCustomers = (activeCustomers || [])
    .map((cust) => ({
      customer: cust,
      result: matchEngine.score(cust, property)
    }))
    .filter((item) => item.result.score > 0)
    .sort((a, b) => b.result.score - a.result.score);

  const handleDelete = async () => {
    if (!window.confirm("Bạn có chắc muốn xóa bất động sản này?")) return;
    await db.properties.update(property.id, {
      isDeleted: true,
      updatedAt: Date.now(),
      isTextSynced: false
    });
    syncManager.pushChanges();
    navigate("/properties");
  };

  const handleVerify = () => {
    navigate(`/properties/edit/${property.id}?openForVerify=true`);
  };

  const handleAddDiary = async () => {
    if (!diaryInput.trim()) return;
    const newEntry = formatDiaryEntry(diaryInput.trim());
    const updatedDiary = property.diary ? `${newEntry}\n${property.diary}` : newEntry;

    await db.properties.update(property.id, {
      diary: updatedDiary,
      updatedAt: Date.now(),
      isTextSynced: false
    });
    syncManager.pushChanges();
    setDiaryInput("");
    setShowAddDiary(false);
  };

  const handleDeleteViewing = async (customerId: string, customerName: string) => {
    if (!window.confirm(`Bạn có chắc muốn xóa lượt xem nhà của ${customerName}?`)) return;
    await db.customer_property_links.update([customerId, property.id], {
      isDeleted: true,
      updatedAt: Date.now(),
      isSynced: false
    });
    syncManager.pushChanges();
  };

  const handleShare = async () => {
    const text = `Cần bán: ${property.area}\nLoại hình: ${property.propertyType}\nGiá: ${
      property.price > 0 ? property.price + " tỷ" : "Thương lượng"
    }\nDiện tích: ${property.areaSize ? property.areaSize + " m²" : "Đang cập nhật"}\nHướng: ${
      property.direction || "Chưa xác định"
    }\nLiên hệ: ${property.ownerPhone}`;

    if (navigator.share) {
      try {
        await navigator.share({ title: property.area, text });
      } catch {
        // User cancelled
      }
    } else {
      await navigator.clipboard.writeText(text);
      alert("Đã sao chép nội dung tin đăng vào bộ nhớ đệm!");
    }
  };

  const handleDownloadAllImages = () => {
    images.forEach((src, idx) => {
      const link = document.createElement("a");
      link.href = src;
      link.download = `bds_${property.id}_img_${idx + 1}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-4 md:py-6 pb-24 md:pb-12">
      {/* Top Bar */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-slate-600 hover:text-slate-900 text-sm font-medium transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Quay lại</span>
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={handleShare}
            className="p-2 text-slate-600 hover:text-blue-600 hover:bg-slate-100 rounded-xl transition-colors"
            title="Chia sẻ"
          >
            <Share2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => navigate(`/properties/edit/${property.id}`)}
            className="p-2 text-slate-600 hover:text-blue-600 hover:bg-slate-100 rounded-xl transition-colors"
            title="Chỉnh sửa"
          >
            <Edit className="w-4 h-4" />
          </button>
          <button
            onClick={handleDelete}
            className="p-2 text-slate-600 hover:text-red-600 hover:bg-slate-100 rounded-xl transition-colors"
            title="Xóa BĐS"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Unverified Promotion Banner */}
      {!property.isVerified && (
        <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-amber-900 text-sm">Tin chờ khảo sát / chưa duyệt</div>
              <div className="text-xs text-amber-700">
                Hãy kiểm tra thông tin thực tế và bấm nút xác thực để chuyển vào kho BĐS chính thức.
              </div>
            </div>
          </div>
          <button
            onClick={handleVerify}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors shrink-0 flex items-center justify-center gap-1.5"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Xác thực tin này</span>
          </button>
        </div>
      )}

      {/* Header Info Card */}
      <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-2xs space-y-3 mb-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-slate-100 text-slate-700">
                {property.propertyType}
              </span>
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                  property.status === PropertyStatus.FOR_SALE
                    ? "bg-emerald-100 text-emerald-800"
                    : property.status === PropertyStatus.PAUSED
                    ? "bg-amber-100 text-amber-800"
                    : "bg-slate-100 text-slate-700"
                }`}
              >
                {property.status}
              </span>
            </div>
            <h1 className="font-bold text-slate-900 text-lg md:text-xl mt-1.5">
              {property.area || "Chưa rõ khu vực"}
            </h1>
          </div>

          <div className="text-right">
            <div className="text-xl md:text-2xl font-black text-blue-700">
              {property.price > 0 ? `${property.price} tỷ` : "Thương lượng"}
            </div>
            {property.areaSize && (
              <div className="text-xs text-slate-500 font-medium">{property.areaSize} m²</div>
            )}
          </div>
        </div>

        {/* Action Buttons Row */}
        <div className="grid grid-cols-4 gap-2 pt-2 border-t border-slate-100">
          <button
            onClick={() => property.ownerPhone && setPhoneModalNumber(property.ownerPhone)}
            disabled={!property.ownerPhone}
            className="flex flex-col items-center justify-center p-2 rounded-xl bg-slate-50 hover:bg-emerald-50 hover:text-emerald-700 text-slate-700 transition-colors disabled:opacity-40"
          >
            <Phone className="w-4 h-4 mb-1 text-emerald-600" />
            <span className="text-[11px] font-semibold">Gọi điện</span>
          </button>

          <button
            onClick={() =>
              property.ownerPhone &&
              window.open(`https://zalo.me/${property.ownerPhone}`, "_blank")
            }
            disabled={!property.ownerPhone}
            className="flex flex-col items-center justify-center p-2 rounded-xl bg-slate-50 hover:bg-blue-50 hover:text-blue-700 text-slate-700 transition-colors disabled:opacity-40"
          >
            <ExternalLink className="w-4 h-4 mb-1 text-sky-600" />
            <span className="text-[11px] font-semibold">Mở Zalo</span>
          </button>

          <button
            onClick={() =>
              property.latitude &&
              property.longitude &&
              navigate(`/map?lat=${property.latitude}&lng=${property.longitude}`)
            }
            disabled={!property.latitude || !property.longitude}
            className="flex flex-col items-center justify-center p-2 rounded-xl bg-slate-50 hover:bg-blue-50 hover:text-blue-700 text-slate-700 transition-colors disabled:opacity-40"
          >
            <MapPin className="w-4 h-4 mb-1 text-blue-600" />
            <span className="text-[11px] font-semibold">Bản đồ</span>
          </button>

          <button
            onClick={handleShare}
            className="flex flex-col items-center justify-center p-2 rounded-xl bg-slate-50 hover:bg-blue-50 hover:text-blue-700 text-slate-700 transition-colors"
          >
            <Share2 className="w-4 h-4 mb-1 text-blue-600" />
            <span className="text-[11px] font-semibold">Chia sẻ</span>
          </button>
        </div>
      </div>

      {/* Media Photo Carousel / Grid */}
      {images.length > 0 && (
        <div className="mb-4 p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-slate-800 text-xs uppercase tracking-wider">
              Hình ảnh thực tế ({images.length})
            </h3>
            <button
              onClick={handleDownloadAllImages}
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-semibold px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors"
              title="Tải toàn bộ ảnh BĐS về máy"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Tải tất cả ảnh</span>
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {images.map((src, idx) => (
              <a
                key={idx}
                href={src}
                download={`bds_${property.id}_img_${idx + 1}.jpg`}
                className="aspect-4/3 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 cursor-pointer block group relative"
                title="Click để tải ảnh"
              >
                <img
                  src={src}
                  alt={`BĐS ${idx}`}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Tabs Switcher: Chi tiết | Nhật ký | Khách phù hợp */}
      <div className="flex border-b border-slate-200 mb-4">
        <button
          onClick={() => setActiveTab("detail")}
          className={`flex-1 py-2.5 text-xs md:text-sm font-semibold border-b-2 transition-colors ${
            activeTab === "detail"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          Chi tiết
        </button>
        <button
          onClick={() => setActiveTab("diary")}
          className={`flex-1 py-2.5 text-xs md:text-sm font-semibold border-b-2 transition-colors flex items-center justify-center gap-1.5 ${
            activeTab === "diary"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <span>Nhật ký & Xem nhà</span>
          <span
            className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
              activeTab === "diary" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600"
            }`}
          >
            {mergedActivityItems.length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab("matches")}
          className={`flex-1 py-2.5 text-xs md:text-sm font-semibold border-b-2 transition-colors flex items-center justify-center gap-1.5 ${
            activeTab === "matches"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Khách phù hợp ({matchedCustomers.length})</span>
        </button>
      </div>

      {/* Tab 1: Detail Info */}
      {activeTab === "detail" && (
        <div className="space-y-4">
          <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs space-y-3">
            <h4 className="font-semibold text-slate-800 text-sm">Đặc điểm bất động sản</h4>
            <div className="grid grid-cols-2 gap-3 text-xs md:text-sm">
              <div>
                <span className="text-slate-500">Hướng nhà:</span>{" "}
                <span className="font-medium text-slate-800">
                  {property.direction || "Chưa xác định"}
                </span>
              </div>
              <div>
                <span className="text-slate-500">Ngày khảo sát:</span>{" "}
                <span className="font-medium text-slate-800">
                  {property.surveyDate || "Chưa khảo sát"}
                </span>
              </div>
              <div>
                <span className="text-slate-500">Tọa độ:</span>{" "}
                <span className="font-mono text-slate-800">
                  {property.latitude ? `${property.latitude}, ${property.longitude}` : "Chưa có"}
                </span>
              </div>
              <div>
                <span className="text-slate-500">Chủ nhà:</span>{" "}
                <span className="font-medium text-slate-800">
                  {property.ownerName || "Chưa rõ"} ({property.ownerPhone || "Chưa có SĐT"})
                </span>
              </div>
            </div>
          </div>

          {property.description && (
            <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs space-y-2">
              <h4 className="font-semibold text-slate-800 text-sm">Mô tả</h4>
              <p className="text-xs md:text-sm text-slate-600 whitespace-pre-line leading-relaxed">
                {property.description}
              </p>
            </div>
          )}

          {/* Activity Preview Card */}
          <div
            onClick={() => setActiveTab("diary")}
            className="p-3.5 bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-2xl cursor-pointer transition-colors flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <Clock className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                  <span>Nhật ký & Xem nhà</span>
                  <span className="px-1.5 py-0.2 bg-blue-100 text-blue-700 rounded-full text-[10px] font-bold">
                    {mergedActivityItems.length}
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 truncate mt-0.5">
                  {mergedActivityItems.length > 0 ? (
                    mergedActivityItems[0].type === "DIARY" ? (
                      <span>
                        {mergedActivityItems[0].displayDate && `${mergedActivityItems[0].displayDate} · `}
                        {mergedActivityItems[0].text}
                      </span>
                    ) : (
                      <span>
                        {mergedActivityItems[0].displayDate && `${mergedActivityItems[0].displayDate} · `}
                        Khách {mergedActivityItems[0].customerName} xem nhà
                      </span>
                    )
                  ) : (
                    "Chưa có ghi chép nhật ký hoặc lượt dẫn khách"
                  )}
                </div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
          </div>
        </div>
      )}

      {/* Tab 2: Merged Activity (Diary + Customer Viewings) */}
      {activeTab === "diary" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-sm font-semibold text-slate-800">Nhật ký & Lịch sử xem nhà</h4>
              <p className="text-[11px] text-slate-500">
                Tổng hợp {mergedActivityItems.length} mốc hoạt động thực địa và dẫn khách
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowAddDiary(true)}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Thêm nhật ký</span>
              </button>
              <button
                onClick={() => setShowAddViewingModal(true)}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-purple-50 text-purple-700 hover:bg-purple-100 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Khách xem nhà</span>
              </button>
            </div>
          </div>

          {showAddDiary && (
            <div className="p-3.5 bg-white border border-blue-200 rounded-2xl shadow-xs space-y-2 animate-in fade-in duration-150">
              <div className="text-xs font-semibold text-slate-700">Ghi chú nhật ký mới</div>
              <textarea
                rows={3}
                value={diaryInput}
                onChange={(e) => setDiaryInput(e.target.value)}
                placeholder="Nhập ghi chép thực địa, đàm phán giá, tình trạng chủ nhà..."
                className="w-full text-xs md:text-sm p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-hidden focus:bg-white focus:border-blue-500 transition-colors"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowAddDiary(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  onClick={handleAddDiary}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors cursor-pointer"
                >
                  Lưu nhật ký
                </button>
              </div>
            </div>
          )}

          {/* Quick Filter Chips */}
          <div className="flex items-center gap-1.5 pb-1 overflow-x-auto">
            <button
              onClick={() => setActivityFilter("ALL")}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors cursor-pointer shrink-0 ${
                activityFilter === "ALL"
                  ? "bg-slate-800 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Tất cả ({mergedActivityItems.length})
            </button>
            <button
              onClick={() => setActivityFilter("DIARY")}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors cursor-pointer shrink-0 flex items-center gap-1 ${
                activityFilter === "DIARY"
                  ? "bg-blue-600 text-white"
                  : "bg-blue-50 text-blue-700 hover:bg-blue-100"
              }`}
            >
              <BookOpen className="w-3 h-3" />
              <span>Nhật ký ({diaryCount})</span>
            </button>
            <button
              onClick={() => setActivityFilter("VIEWING")}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors cursor-pointer shrink-0 flex items-center gap-1 ${
                activityFilter === "VIEWING"
                  ? "bg-purple-600 text-white"
                  : "bg-purple-50 text-purple-700 hover:bg-purple-100"
              }`}
            >
              <UserCheck className="w-3 h-3" />
              <span>Khách xem nhà ({viewingCount})</span>
            </button>
          </div>

          {/* Activity Timeline List */}
          {displayedActivityItems.length === 0 ? (
            <div className="text-center py-12 px-4 bg-white border border-slate-200 rounded-2xl shadow-2xs space-y-2">
              <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-2">
                <Clock className="w-5 h-5" />
              </div>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                {activityFilter === "ALL"
                  ? "Chưa có ghi chép nhật ký hoặc lượt dẫn khách xem nhà nào cho BĐS này."
                  : activityFilter === "DIARY"
                  ? "Chưa có nhật ký ghi chép thực địa."
                  : "Chưa có lịch sử dẫn khách xem nhà."}
              </p>
              <div className="flex items-center justify-center gap-2 pt-2">
                <button
                  onClick={() => setShowAddDiary(true)}
                  className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                >
                  Thêm nhật ký
                </button>
                <button
                  onClick={() => setShowAddViewingModal(true)}
                  className="px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                >
                  Thêm khách xem nhà
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              {displayedActivityItems.map((item) => {
                if (item.type === "DIARY") {
                  return (
                    <div
                      key={item.id}
                      className="p-3.5 bg-white border border-blue-100 rounded-2xl shadow-2xs hover:border-blue-200 transition-colors flex items-start gap-3"
                    >
                      <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                        <BookOpen className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md">
                            Nhật ký
                          </span>
                          {item.displayDate && (
                            <span className="text-[11px] font-semibold text-slate-500">
                              {item.displayDate}
                            </span>
                          )}
                        </div>
                        <p className="text-xs md:text-sm text-slate-700 whitespace-pre-line leading-relaxed">
                          {item.text}
                        </p>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={item.id}
                    className="p-3.5 bg-white border border-purple-100 rounded-2xl shadow-2xs hover:border-purple-200 transition-colors flex items-start justify-between gap-3"
                  >
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0 mt-0.5">
                        <UserCheck className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md">
                            Khách xem nhà
                          </span>
                          {item.displayDate && (
                            <span className="text-[11px] font-semibold text-slate-500">
                              {item.displayDate}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <button
                            onClick={() => navigate(`/customers/${item.customerId}`)}
                            className="text-xs md:text-sm font-bold text-slate-800 hover:text-purple-700 underline decoration-dotted transition-colors cursor-pointer"
                          >
                            {item.customerName}
                          </button>
                          {item.customerPhone && (
                            <span className="text-[11px] text-slate-400">({item.customerPhone})</span>
                          )}
                        </div>
                        {item.note && (
                          <p className="text-xs text-slate-600 mt-1.5 bg-slate-50 p-2 rounded-xl leading-relaxed">
                            {item.note}
                          </p>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteViewing(item.customerId, item.customerName)}
                      className="text-slate-300 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition-colors shrink-0 cursor-pointer"
                      title="Xóa lượt xem nhà này"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Customer Matches */}
      {activeTab === "matches" && (
        <div className="space-y-3">
          <div className="text-xs text-slate-500">
            Tìm thấy <strong>{matchedCustomers.length}</strong> khách hàng có nhu cầu tương thích theo thuật toán 100 điểm:
          </div>

          {matchedCustomers.length === 0 ? (
            <div className="text-center py-10 bg-white border border-slate-200 rounded-2xl text-xs text-slate-400">
              Chưa có khách hàng nào khớp với các tiêu chí của BĐS này.
            </div>
          ) : (
            <div className="space-y-2.5">
              {matchedCustomers.map(({ customer, result }) => (
                <div
                  key={customer.id}
                  onClick={() => navigate(`/customers/${customer.id}`)}
                  className="p-3.5 bg-white border border-slate-200 hover:border-blue-300 rounded-xl shadow-2xs hover:shadow-sm cursor-pointer transition-all flex items-start justify-between gap-3"
                >
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-800 text-sm truncate">
                        {customer.name}
                      </span>
                      <span className="text-xs text-slate-500 font-mono">
                        {customer.phone}
                      </span>
                    </div>

                    <div className="text-xs text-slate-600">
                      Ngân sách: {customer.priceMin} - {customer.priceMax} tỷ · KV:{" "}
                      {customer.demandAreas || "Linh hoạt"}
                    </div>

                    <div className="flex flex-wrap gap-1 mt-1">
                      {result.matchingReasons.map((r, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-[10px] font-medium"
                        >
                          ✓ {r}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col items-end shrink-0">
                    <div className="px-2.5 py-1 rounded-full bg-blue-100 text-blue-800 font-bold text-xs">
                      {result.score}/100 đ
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Phone Action Modal */}
      <PhoneActionModal
        phoneNumber={phoneModalNumber || ""}
        isOpen={Boolean(phoneModalNumber)}
        onClose={() => setPhoneModalNumber(null)}
      />

      {/* Add Customer Viewing Modal */}
      <AddViewingModal
        isOpen={showAddViewingModal}
        onClose={() => setShowAddViewingModal(false)}
        propertyId={property.id}
        propertyArea={property.area}
        activeCustomers={activeCustomers || []}
        existingLinkedCustomerIds={existingLinkedCustomerIds}
        onSuccess={() => {}}
      />
    </div>
  );
};
