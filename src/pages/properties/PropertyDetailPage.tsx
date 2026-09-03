import React, { useState } from "react";
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
  Plus
} from "lucide-react";
import { db } from "../../data/local/db";
import { PropertyStatus } from "../../core/models/enums";
import { MatchEngine } from "../../core/engine/match-engine";
import { PhoneActionModal } from "../../components/common/PhoneActionModal";
import { syncManager } from "../../data/sync/sync-manager";

export const PropertyDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [phoneModalNumber, setPhoneModalNumber] = useState<string | null>(null);
  const [diaryInput, setDiaryInput] = useState("");
  const [showAddDiary, setShowAddDiary] = useState(false);
  const [activeTab, setActiveTab] = useState<"detail" | "diary" | "matches">("detail");

  const property = useLiveQuery(() => (id ? db.properties.get(id) : undefined), [id]);
  const activeCustomers = useLiveQuery(() =>
    db.customers
      .where("isDeleted")
      .equals(0 as any)
      .toArray()
  );

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

  const handleVerify = async () => {
    await db.properties.update(property.id, {
      isVerified: true,
      status: PropertyStatus.FOR_SALE,
      updatedAt: Date.now(),
      isTextSynced: false
    });
    syncManager.pushChanges();
    alert("Đã xác thực BĐS thành công và chuyển sang danh mục chính thức!");
  };

  const handleAddDiary = async () => {
    if (!diaryInput.trim()) return;
    const now = new Date();
    const timeStr = `${now.getHours()}:${now.getMinutes()} ${now.getDate()}/${now.getMonth() + 1}`;
    const newEntry = `[${timeStr}] ${diaryInput.trim()}`;
    const updatedDiary = property.diary ? `${newEntry}\n${property.diary}` : newEntry;

    await db.properties.update(property.id, {
      diary: updatedDiary,
      updatedAt: Date.now(),
      isTextSynced: false
    });
    setDiaryInput("");
    setShowAddDiary(false);
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
          <h3 className="font-semibold text-slate-800 text-xs uppercase tracking-wider mb-2">
            Hình ảnh thực tế ({images.length})
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {images.map((src, idx) => (
              <div
                key={idx}
                className="aspect-4/3 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 cursor-pointer"
              >
                <img
                  src={src}
                  alt={`BĐS ${idx}`}
                  className="w-full h-full object-cover hover:scale-105 transition-transform"
                />
              </div>
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
          className={`flex-1 py-2.5 text-xs md:text-sm font-semibold border-b-2 transition-colors ${
            activeTab === "diary"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          Nhật ký làm việc
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
        </div>
      )}

      {/* Tab 2: Diary */}
      {activeTab === "diary" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-slate-800">Lịch sử nhật ký</h4>
            <button
              onClick={() => setShowAddDiary(true)}
              className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Thêm nhật ký</span>
            </button>
          </div>

          {showAddDiary && (
            <div className="p-3 bg-white border border-blue-200 rounded-xl space-y-2">
              <textarea
                rows={2}
                value={diaryInput}
                onChange={(e) => setDiaryInput(e.target.value)}
                placeholder="Nhập ghi chú xem nhà, đàm phán giá..."
                className="w-full text-xs md:text-sm p-2 bg-slate-50 border border-slate-200 rounded-lg outline-hidden"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowAddDiary(false)}
                  className="px-3 py-1 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Hủy
                </button>
                <button
                  onClick={handleAddDiary}
                  className="px-3 py-1 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700"
                >
                  Lưu nhật ký
                </button>
              </div>
            </div>
          )}

          {property.diary ? (
            <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs">
              <pre className="text-xs md:text-sm font-sans text-slate-700 whitespace-pre-wrap leading-relaxed">
                {property.diary}
              </pre>
            </div>
          ) : (
            <div className="text-center py-8 text-xs text-slate-400 bg-white border border-slate-200 rounded-2xl">
              Chưa có ghi chép nhật ký nào cho BĐS này.
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
    </div>
  );
};
