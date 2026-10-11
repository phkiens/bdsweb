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
  Clock,
  X
} from "lucide-react";
import { db } from "../../data/local/db";
import { PropertyStatus, CustomerRole, CustomerPropertyRole } from "../../core/models/enums";
import { Customer } from "../../core/models/customer";
import {
  getCoOwners,
  addCoOwner,
  addNewCoOwner,
  removeCoOwner,
  reconcileOwnerStatus,
  getActiveOwnerAndCoOwnerLinksForProperty
} from "../../core/services/co-owner";
import { PropertyCoOwnersSection } from "../../components/properties/PropertyCoOwnersSection";
import { PropertyAddCoOwnerDialog } from "../../components/properties/PropertyAddCoOwnerDialog";
import { MatchEngine } from "../../core/engine/match-engine";
import { PhoneActionModal } from "../../components/common/PhoneActionModal";
import { syncManager } from "../../data/sync/sync-manager";
import {
  buildMergedActivityTimeline,
  formatDiaryEntry
} from "../../core/engine/activity-timeline-engine";
import { AddViewingModal } from "./AddViewingModal";
import { PropertyMediaGallery } from "../../components/properties/PropertyMediaGallery";
import { formatPropertyPrice } from "../../core/utils/property-price";
import { decodeListingTexts, buildPropertyShareBody } from "../../core/utils/listing-text";
import { getVisibleHistories } from "../../data/local/price-history-queries";
import {
  applyQuickPriceEdit,
  applyClearPriceHistory
} from "../../core/utils/price-history-ops";
import { PropertyPriceHistorySection } from "../../components/properties/PropertyPriceHistorySection";
import { QuickPriceModal } from "../../components/properties/QuickPriceModal";

export const PropertyDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [phoneModalNumber, setPhoneModalNumber] = useState<string | null>(null);
  const [diaryInput, setDiaryInput] = useState("");
  const [showAddDiary, setShowAddDiary] = useState(false);
  const [showAddViewingModal, setShowAddViewingModal] = useState(false);
  const [activityFilter, setActivityFilter] = useState<"ALL" | "DIARY" | "VIEWING">("ALL");
  const [activeTab, setActiveTab] = useState<"detail" | "diary" | "matches">("detail");
  const [showQuickPriceModal, setShowQuickPriceModal] = useState(false);
  const [isPriceSaving, setIsPriceSaving] = useState(false);

  const property = useLiveQuery(() => (id ? db.properties.get(id) : undefined), [id]);
  const rawHistories = useLiveQuery(
    () => (id ? getVisibleHistories(id) : []),
    [id]
  );
  const priceHistories = useMemo(
    () =>
      rawHistories
        ? [...rawHistories].sort(
            (a, b) => b.revision - a.revision || b.recordedAt - a.recordedAt
          )
        : [],
    [rawHistories]
  );
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

  // Hook phải đứng trước lệnh return sớm bên dưới (quy tắc hook của React).
  const [showShareModal, setShowShareModal] = useState(false);
  const [includeBasic, setIncludeBasic] = useState(true);
  const [includeDesc, setIncludeDesc] = useState(true);
  const [includeLocation, setIncludeLocation] = useState(false);
  const [includeOwner, setIncludeOwner] = useState(false);
  const [selectedShareDescTab, setSelectedShareDescTab] = useState<1 | 2>(1);
  // null = chưa bấm chọn ⇒ dùng tab mặc định (Tin 1, trừ khi Tin 1 rỗng mà có Tin 2).
  const [detailTabChoice, setSelectedDetailTab] = useState<1 | 2 | null>(null);

  const decodedDesc = useMemo(
    () => decodeListingTexts(property?.description),
    [property?.description]
  );
  const hasDetailTin1 = Boolean(decodedDesc.first && decodedDesc.first.trim().length > 0);
  const hasDetailTin2 = Boolean(decodedDesc.second && decodedDesc.second.trim().length > 0);

  const selectedDetailTab = detailTabChoice ?? (!hasDetailTin1 && hasDetailTin2 ? 2 : 1);

  const shareTin1 = useMemo(() => {
    if (!property) return "";
    if (!property.description || property.description.trim() === "") {
      return property.rawText || "";
    }
    return decodedDesc.first;
  }, [property, decodedDesc.first]);

  const [showAddCoOwnerModal, setShowAddCoOwnerModal] = useState(false);
  const coOwners = useLiveQuery(
    async () => (id ? getCoOwners(db, id) : []),
    [id]
  );
  const mainOwnerCustomerId = property?.linkedCustomerId;
  const excludedCoOwnerCustomerIds = useMemo(() => {
    const ids = new Set<string>();
    if (mainOwnerCustomerId) ids.add(mainOwnerCustomerId);
    (propertyLinks || []).forEach((l) => {
      if (l.role === CustomerRole.OWNER || l.role === CustomerPropertyRole.CO_OWNER) {
        ids.add(l.customerId);
      }
    });
    return ids;
  }, [mainOwnerCustomerId, propertyLinks]);

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

  const handlePickCoOwner = async (customerId: string) => {
    if (!property) return;
    const result = await addCoOwner(db, property.id, customerId);
    let msg = "Không thể thêm đồng sở hữu";
    if (result.type === "Added") {
      msg = result.convertedFromBuyer
        ? "Đã thêm đồng sở hữu (chuyển sang Chủ nhà)"
        : "Đã thêm đồng sở hữu";
    } else if (result.type === "AlreadyMainOwner") {
      msg = "Người này đang là chủ chính";
    } else if (result.type === "AlreadyCoOwner") {
      msg = "Người này đã là đồng sở hữu";
    }
    alert(msg);
  };

  const handleCreateNewCoOwner = async (name: string, phone: string) => {
    if (!property) return;
    const result = await addNewCoOwner(db, property.id, name, phone);
    let msg = "Không thể thêm đồng sở hữu";
    if (result.type === "Added") {
      msg = result.convertedFromBuyer
        ? "Đã thêm đồng sở hữu (chuyển sang Chủ nhà)"
        : "Đã thêm đồng sở hữu";
    } else if (result.type === "AlreadyMainOwner") {
      msg = "Người này đang là chủ chính";
    } else if (result.type === "AlreadyCoOwner") {
      msg = "Người này đã là đồng sở hữu";
    }
    alert(msg);
  };

  const handleRemoveCoOwner = async (coOwner: Customer) => {
    if (!property) return;
    await removeCoOwner(db, property.id, coOwner.id);
    alert("Đã gỡ đồng sở hữu");
  };

  const handleDelete = async () => {
    if (!window.confirm("Bạn có chắc muốn xóa bất động sản này?")) return;
    const now = Date.now();
    const ownerLinks = await getActiveOwnerAndCoOwnerLinksForProperty(db, property.id);
    await db.properties.update(property.id, {
      isDeleted: true,
      updatedAt: now,
      isTextSynced: false
    });
    await db.enqueueOutbox("PROPERTY", property.id, "DELETE");
    for (const link of ownerLinks) {
      await reconcileOwnerStatus(db, link.customerId);
    }
    syncManager.pushChanges();
    navigate("/properties");
  };

  const handleVerify = () => {
    navigate(`/properties/edit/${property.id}?openForVerify=true`);
  };

  const handleQuickPriceConfirm = async (newPrice: number) => {
    if (!property) return;
    setIsPriceSaving(true);
    try {
      const currentProp = await db.properties.get(property.id);
      if (!currentProp) {
        alert("Không tìm thấy bất động sản.");
        setIsPriceSaving(false);
        return;
      }
      const result = applyQuickPriceEdit(
        currentProp,
        currentProp.price,
        newPrice,
        Date.now()
      );
      switch (result.kind) {
        case "INVALID":
          alert("Giá không hợp lệ");
          break;
        case "UNCHANGED":
          alert("Giá không thay đổi");
          setShowQuickPriceModal(false);
          break;
        case "CONFLICT":
          alert("Giá BĐS vừa thay đổi, vui lòng mở lại để sửa.");
          break;
        case "OK": {
          await db.properties.put(result.updated);
          await db.enqueueOutbox("PROPERTY", result.updated.id, "UPSERT");
          syncManager.pushChanges();
          const oldStr =
            formatPropertyPrice(currentProp.price) ?? `${currentProp.price} tỷ`;
          const newStr =
            formatPropertyPrice(result.updated.price) ??
            `${result.updated.price} tỷ`;
          alert(`Đã cập nhật giá: ${oldStr} → ${newStr}`);
          setShowQuickPriceModal(false);
          break;
        }
      }
    } catch (error) {
      console.error("Lỗi khi cập nhật giá BĐS:", error);
      alert("Lỗi khi cập nhật giá");
    } finally {
      setIsPriceSaving(false);
    }
  };

  const handleClearPriceHistory = async () => {
    if (!property || priceHistories.length === 0) return;
    const upTo = Math.max(...priceHistories.map((h) => h.revision));
    if (!Number.isFinite(upTo)) return;
    try {
      const updatedProperty = applyClearPriceHistory(property, upTo, Date.now());
      if (updatedProperty) {
        await db.properties.put(updatedProperty);
        await db.enqueueOutbox("PROPERTY", updatedProperty.id, "UPSERT");
        syncManager.pushChanges();
        alert("Đã xoá lịch sử giá căn này");
      }
    } catch (error) {
      console.error("Lỗi xoá lịch sử giá:", error);
      alert("Không xoá được lịch sử giá, thử lại sau");
    }
  };

  const handleAddDiary = async () => {
    if (!diaryInput.trim()) return;
    const newEntry = formatDiaryEntry(diaryInput.trim());
    const updatedDiary = property.diary ? `${newEntry}\n${property.diary}` : newEntry;
    const now = Date.now();

    await db.properties.update(property.id, {
      diary: updatedDiary,
      updatedAt: now,
      isTextSynced: false
    });
    await db.enqueueOutbox("PROPERTY", property.id, "UPSERT");
    syncManager.pushChanges();
    setDiaryInput("");
    setShowAddDiary(false);
  };

  const handleDeleteViewing = async (customerId: string, customerName: string) => {
    if (!window.confirm(`Bạn có chắc muốn xóa lượt xem nhà của ${customerName}?`)) return;
    const now = Date.now();
    await db.customer_property_links.update([customerId, property.id], {
      isDeleted: true,
      updatedAt: now,
      isSynced: false
    });
    await db.enqueueOutbox("LINK", `${customerId}:::${property.id}`, "DELETE");
    syncManager.pushChanges();
  };

  const shareTin2 = decodedDesc.second;
  const hasShareTin1 = Boolean(shareTin1 && shareTin1.trim().length > 0);
  const hasShareTin2 = Boolean(shareTin2 && shareTin2.trim().length > 0);

  const hasCoords = Boolean(
    property?.latitude &&
    property?.longitude &&
    property.latitude !== 0 &&
    property.longitude !== 0
  );

  const canShowOwner = Boolean(
    (property?.ownerName && property.ownerName.trim().length > 0) ||
    (property?.ownerPhone && property.ownerPhone.trim().length > 0)
  );

  const handleShare = () => {
    setIncludeBasic(true);
    setIncludeDesc(true);
    setIncludeLocation(false);
    setIncludeOwner(false);
    setSelectedShareDescTab(!hasShareTin1 && hasShareTin2 ? 2 : 1);
    setShowShareModal(true);
  };

  const handleExecuteShare = async () => {
    if (!property) return;
    const resolvedDescText = selectedShareDescTab === 1 ? shareTin1 : shareTin2;
    const shareBody = buildPropertyShareBody(property, resolvedDescText, {
      includeBasic,
      includeDesc,
      includeLocation: hasCoords && includeLocation,
      includeOwner: canShowOwner && includeOwner
    });

    if (navigator.share) {
      try {
        await navigator.share({ title: property.area || "Chia sẻ BĐS", text: shareBody });
      } catch {
        // User cancelled
      }
    } else {
      await navigator.clipboard.writeText(shareBody);
      alert("Đã sao chép nội dung tin đăng vào bộ nhớ đệm!");
    }
    setShowShareModal(false);
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
            <button
              type="button"
              onClick={() => setShowQuickPriceModal(true)}
              className="text-right group cursor-pointer rounded-lg hover:bg-blue-50/60 px-1.5 py-0.5 -mr-1.5 transition-colors block ml-auto"
              title="Bấm để sửa giá nhanh"
            >
              <div className="text-xl md:text-2xl font-black text-blue-700 group-hover:text-blue-800 transition-colors">
                {formatPropertyPrice(property.price) || "Thương lượng"}
              </div>
            </button>
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

      {/* Media Photo Carousel / Grid (Cloudflare R2 & Local Fallback) */}
      <PropertyMediaGallery property={property} />

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
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-hidden">
            <PropertyPriceHistorySection
              propertyId={property.id}
              histories={priceHistories}
              onClearHistory={handleClearPriceHistory}
            />
            {priceHistories.length > 0 && (
              <div className="border-t border-slate-100" />
            )}
            <div className="p-4 space-y-3">
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
          </div>

          {/* Co-Owners Section */}
          <PropertyCoOwnersSection
            coOwners={coOwners || []}
            onOpenCustomer={(customerId) => navigate(`/customers/${customerId}`)}
            onPhoneClick={(phone) => setPhoneModalNumber(phone)}
            onRemoveCoOwner={handleRemoveCoOwner}
            onAddClick={() => setShowAddCoOwnerModal(true)}
          />

          {(hasDetailTin1 || hasDetailTin2) && (
            <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-slate-800 text-sm">Mô tả</h4>
                {hasDetailTin2 && (
                  <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => setSelectedDetailTab(1)}
                      className={`px-3 py-1 rounded-md transition-colors ${
                        selectedDetailTab === 1
                          ? "bg-white text-blue-600 shadow-2xs"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      Tin 1
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedDetailTab(2)}
                      className={`px-3 py-1 rounded-md transition-colors ${
                        selectedDetailTab === 2
                          ? "bg-white text-blue-600 shadow-2xs"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      Tin 2
                    </button>
                  </div>
                )}
              </div>
              <p className="text-xs md:text-sm text-slate-600 whitespace-pre-line leading-relaxed">
                {selectedDetailTab === 1 ? decodedDesc.first : decodedDesc.second}
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

      {/* Share Property Modal */}
      {showShareModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-800 text-base">Chia sẻ tin đăng</h3>
              <button
                type="button"
                onClick={() => setShowShareModal(false)}
                className="p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto">
              <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={includeBasic}
                  onChange={(e) => setIncludeBasic(e.target.checked)}
                  className="mt-0.5 w-4 h-4 text-blue-600 rounded-md border-slate-300 focus:ring-blue-500"
                />
                <div className="text-xs md:text-sm text-slate-700">
                  <div className="font-semibold">📋 Thông tin cơ bản</div>
                  <div className="text-xs text-slate-500">Khu vực, giá, diện tích, loại hình, hướng</div>
                </div>
              </label>

              <div className="p-3 rounded-xl border border-slate-100 hover:bg-slate-50 transition-colors">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeDesc}
                    onChange={(e) => setIncludeDesc(e.target.checked)}
                    className="mt-0.5 w-4 h-4 text-blue-600 rounded-md border-slate-300 focus:ring-blue-500"
                  />
                  <div className="text-xs md:text-sm text-slate-700 font-semibold">
                    📝 Mô tả chi tiết BĐS
                  </div>
                </label>
                {includeDesc && hasShareTin2 && (
                  <div className="flex items-center gap-2 mt-2.5 ml-7">
                    <button
                      type="button"
                      disabled={!hasShareTin1}
                      onClick={() => setSelectedShareDescTab(1)}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                        selectedShareDescTab === 1
                          ? "bg-blue-600 text-white shadow-2xs"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      } disabled:opacity-40`}
                    >
                      Tin 1
                    </button>
                    <button
                      type="button"
                      disabled={!hasShareTin2}
                      onClick={() => setSelectedShareDescTab(2)}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                        selectedShareDescTab === 2
                          ? "bg-blue-600 text-white shadow-2xs"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      } disabled:opacity-40`}
                    >
                      Tin 2
                    </button>
                  </div>
                )}
              </div>

              {hasCoords && (
                <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={includeLocation}
                    onChange={(e) => setIncludeLocation(e.target.checked)}
                    className="mt-0.5 w-4 h-4 text-blue-600 rounded-md border-slate-300 focus:ring-blue-500"
                  />
                  <div className="text-xs md:text-sm text-slate-700">
                    <div className="font-semibold">📍 Định vị</div>
                    <div className="text-xs text-slate-500">Link Google Maps</div>
                  </div>
                </label>
              )}

              {canShowOwner && (
                <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={includeOwner}
                    onChange={(e) => setIncludeOwner(e.target.checked)}
                    className="mt-0.5 w-4 h-4 text-blue-600 rounded-md border-slate-300 focus:ring-blue-500"
                  />
                  <div className="text-xs md:text-sm text-slate-700">
                    <div className="font-semibold">📞 Chủ nhà</div>
                    <div className="text-xs text-slate-500">
                      {property.ownerName || "Chủ nhà"}
                      {property.ownerPhone ? ` (${property.ownerPhone})` : ""}
                    </div>
                  </div>
                </label>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-slate-100 bg-slate-50">
              <button
                type="button"
                onClick={() => setShowShareModal(false)}
                className="px-4 py-2 text-xs md:text-sm font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200 rounded-xl transition-colors"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleExecuteShare}
                className="px-5 py-2 text-xs md:text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs transition-colors"
              >
                Chia sẻ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Price Modal */}
      {showQuickPriceModal && (
      <QuickPriceModal
        isOpen={showQuickPriceModal}
        currentPrice={property.price}
        isSaving={isPriceSaving}
        onDismiss={() => setShowQuickPriceModal(false)}
        onConfirm={handleQuickPriceConfirm}
      />
      )}

      {/* Add Co-Owner Dialog */}
      <PropertyAddCoOwnerDialog
        isOpen={showAddCoOwnerModal}
        onClose={() => setShowAddCoOwnerModal(false)}
        candidates={activeCustomers || []}
        excludedIds={excludedCoOwnerCustomerIds}
        onPickExisting={handlePickCoOwner}
        onCreateNew={handleCreateNewCoOwner}
      />
    </div>
  );
};
