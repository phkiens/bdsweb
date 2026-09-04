import React, { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Save,
  MapPin,
  Camera,
  Upload,
  Sparkles,
  Trash2,
  Building,
  User,
  AlertCircle,
  Compass
} from "lucide-react";
import { db } from "../../data/local/db";
import { createDefaultProperty, Property } from "../../core/models/property";
import { PropertyStatus, PropertyType, Direction } from "../../core/models/enums";
import { canonicalizeVietnamesePhone, toTitleCase } from "../../core/utils/vietnamese";
import { parseVietnamCoordinates } from "../../core/utils/coordinates";
import { syncManager } from "../../data/sync/sync-manager";
import { ensureCustomerForProperty } from "../../core/services/customer-linker";

export const PropertyFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();

  const isEditMode = Boolean(id);
  const paramIsVerified = searchParams.get("isVerified");
  const defaultVerified = paramIsVerified !== null ? paramIsVerified === "true" : true;
  const paramLat = searchParams.get("lat");
  const paramLng = searchParams.get("lng");
  const paramCustomerId = searchParams.get("linkedCustomerId");

  const [formData, setFormData] = useState<Property>(() =>
    createDefaultProperty({
      isVerified: defaultVerified,
      latitude: paramLat ? parseFloat(paramLat) : null,
      longitude: paramLng ? parseFloat(paramLng) : null,
      linkedCustomerId: paramCustomerId || null
    })
  );

  const [loading, setLoading] = useState(isEditMode);
  const [saving, setSaving] = useState(false);
  const [fetchingGps, setFetchingGps] = useState(false);
  const [quickText, setQuickText] = useState("");
  const [previewImages, setPreviewImages] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (isEditMode && id) {
      db.properties.get(id).then((item) => {
        if (item) {
          setFormData(item);
          if (item.imagePath) {
            setPreviewImages(item.imagePath.split("|||").filter(Boolean));
          }
        }
        setLoading(false);
      });
    } else if (!isEditMode && paramCustomerId) {
      db.customers.get(paramCustomerId).then((cust) => {
        if (cust) {
          setFormData((prev) => ({
            ...prev,
            ownerName: prev.ownerName || cust.name,
            ownerPhone: prev.ownerPhone || cust.phone,
            linkedCustomerId: cust.id
          }));
        }
      });
    }
  }, [id, isEditMode, paramCustomerId]);

  const handleFetchGps = () => {
    if (!navigator.geolocation) {
      alert("Trình duyệt của bạn không hỗ trợ định vị GPS.");
      return;
    }

    setFetchingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setFetchingGps(false);
        setFormData((prev) => ({
          ...prev,
          latitude: parseFloat(pos.coords.latitude.toFixed(6)),
          longitude: parseFloat(pos.coords.longitude.toFixed(6))
        }));
      },
      (err) => {
        setFetchingGps(false);
        console.error("GPS Error", err);
        alert(`Không thể lấy vị trí GPS: ${err.message}. Vui lòng cấp quyền định vị.`);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    const newUrls: string[] = [];

    files.forEach((file) => {
      const url = URL.createObjectURL(file);
      newUrls.push(url);
    });

    setPreviewImages((prev) => [...prev, ...newUrls]);
  };

  const handleRemoveImage = (index: number) => {
    setPreviewImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleQuickExtract = () => {
    if (!quickText.trim()) return;

    // Phân tích sơ bộ từ quickText
    const parsedCoords = parseVietnamCoordinates(quickText);
    const phoneMatch = quickText.match(/(?:0|\+84)[1-9]\d{8}/);
    const priceMatch = quickText.match(/(\d+(?:[.,]\d+)?)\s*(?:tỷ|ty|t)/i);
    const areaSizeMatch = quickText.match(/(\d+(?:[.,]\d+)?)\s*(?:m2|m²)/i);

    setFormData((prev) => ({
      ...prev,
      rawText: quickText,
      description: prev.description ? `${prev.description}\n\n${quickText}` : quickText,
      latitude: parsedCoords ? parsedCoords[0] : prev.latitude,
      longitude: parsedCoords ? parsedCoords[1] : prev.longitude,
      ownerPhone: phoneMatch ? canonicalizeVietnamesePhone(phoneMatch[0]) : prev.ownerPhone,
      price: priceMatch ? parseFloat(priceMatch[1].replace(",", ".")) : prev.price,
      areaSize: areaSizeMatch ? parseFloat(areaSizeMatch[1].replace(",", ".")) : prev.areaSize
    }));

    setQuickText("");
  };

  const handleOpenCompass = () => {
    if (typeof window !== "undefined" && "DeviceOrientationEvent" in window) {
      const handleOrientation = (e: DeviceOrientationEvent) => {
        if (e.alpha !== null) {
          const heading = (360 - e.alpha) % 360;
          let dir = Direction.NORTH;
          if (heading >= 22.5 && heading < 67.5) dir = Direction.NORTH_EAST;
          else if (heading >= 67.5 && heading < 112.5) dir = Direction.EAST;
          else if (heading >= 112.5 && heading < 157.5) dir = Direction.SOUTH_EAST;
          else if (heading >= 157.5 && heading < 202.5) dir = Direction.SOUTH;
          else if (heading >= 202.5 && heading < 247.5) dir = Direction.SOUTH_WEST;
          else if (heading >= 247.5 && heading < 292.5) dir = Direction.WEST;
          else if (heading >= 292.5 && heading < 337.5) dir = Direction.NORTH_WEST;

          setFormData((prev) => ({ ...prev, direction: dir }));
          window.removeEventListener("deviceorientation", handleOrientation);
          alert(`La bàn xác định góc ${Math.round(heading)}° - Hướng nhà: ${dir}`);
        }
      };

      if (typeof (DeviceOrientationEvent as any).requestPermission === "function") {
        (DeviceOrientationEvent as any)
          .requestPermission()
          .then((permission: string) => {
            if (permission === "granted") {
              window.addEventListener("deviceorientation", handleOrientation, { once: true });
            }
          })
          .catch(() => alert("Không thể truy cập cảm biến la bàn thiết bị. Vui lòng chọn hướng từ danh sách."));
      } else {
        window.addEventListener("deviceorientation", handleOrientation, { once: true });
      }
    } else {
      alert("Thiết bị không hỗ trợ cảm biến la bàn điện tử. Vui lòng chọn hướng từ danh sách.");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");

    if (!formData.area.trim()) {
      setErrorMessage("Vui lòng nhập tên khu vực hoặc địa chỉ!");
      return;
    }

    setSaving(true);
    try {
      const now = Date.now();
      const updated: Property = {
        ...formData,
        area: toTitleCase(formData.area),
        ownerPhone: canonicalizeVietnamesePhone(formData.ownerPhone),
        imagePath: previewImages.length > 0 ? previewImages.join("|||") : null,
        updatedAt: now,
        lastEditedAt: now,
        isTextSynced: false
      };

      if (isEditMode) {
        await db.properties.put(updated);
      } else {
        await db.properties.add(updated);
      }

      // Tự động tạo/liên kết hồ sơ Chủ nhà (OWNER) theo đúng chuẩn Android
      await ensureCustomerForProperty(db, updated, paramCustomerId);

      // Kích hoạt đồng bộ ngầm nếu online
      syncManager.pushChanges();

      navigate(`/properties/${updated.id}`);
    } catch (err: any) {
      console.error("Save error", err);
      setErrorMessage(err.message || "Lỗi khi lưu bất động sản");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-4 md:py-6 pb-24 md:pb-12">
      {/* Top Bar */}
      <div className="flex items-center justify-between mb-5">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-slate-600 hover:text-slate-900 text-sm font-medium transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Quay lại</span>
        </button>

        <h2 className="font-bold text-slate-800 text-base md:text-lg">
          {isEditMode ? "Chỉnh sửa BĐS" : formData.isVerified ? "Thêm BĐS mới" : "Thêm tin chờ duyệt"}
        </h2>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs rounded-xl shadow-xs transition-colors disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          <span>{saving ? "Đang lưu..." : "Lưu BĐS"}</span>
        </button>
      </div>

      {errorMessage && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-red-700 text-xs md:text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Quick Parse Input Box */}
      <div className="mb-6 p-4 bg-blue-50/60 border border-blue-100 rounded-2xl">
        <div className="flex items-center gap-1.5 text-xs font-bold text-blue-800 uppercase tracking-wider mb-2">
          <Sparkles className="w-4 h-4 text-blue-600" />
          <span>Trích xuất nhanh từ văn bản Zalo / Facebook</span>
        </div>
        <textarea
          rows={2}
          value={quickText}
          onChange={(e) => setQuickText(e.target.value)}
          placeholder="Dán tin nhắn quảng cáo chứa giá, diện tích, tọa độ hoặc SĐT..."
          className="w-full text-xs md:text-sm p-2.5 bg-white border border-blue-200 rounded-xl outline-hidden focus:ring-2 focus:ring-blue-500"
        />
        <div className="flex justify-end mt-2">
          <button
            type="button"
            onClick={handleQuickExtract}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors"
          >
            Điền nhanh vào form
          </button>
        </div>
      </div>

      {/* Main Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Section 1: Basic Info */}
        <div className="p-4 md:p-5 bg-white border border-slate-200 rounded-2xl shadow-2xs space-y-4">
          <h3 className="font-semibold text-slate-800 text-sm border-b border-slate-100 pb-2 flex items-center gap-2">
            <Building className="w-4 h-4 text-blue-600" />
            <span>Thông tin Bất động sản</span>
          </h3>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Khu vực / Tên đường / Địa danh <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={formData.area}
              onChange={(e) => setFormData({ ...formData, area: e.target.value })}
              placeholder="Ví dụ: Phường 25, Quận Bình Thạnh"
              className="w-full text-sm p-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-hidden"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Giá bán (tỷ VNĐ)
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.price || ""}
                onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
                placeholder="Ví dụ: 4.5"
                className="w-full text-sm p-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Diện tích (m²)
              </label>
              <input
                type="number"
                step="0.1"
                value={formData.areaSize || ""}
                onChange={(e) =>
                  setFormData({ ...formData, areaSize: parseFloat(e.target.value) || null })
                }
                placeholder="Ví dụ: 65.5"
                className="w-full text-sm p-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-hidden"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Loại hình</label>
              <select
                value={formData.propertyType}
                onChange={(e) => setFormData({ ...formData, propertyType: e.target.value })}
                className="w-full text-sm p-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white outline-hidden"
              >
                <option value={PropertyType.HOUSE}>Nhà</option>
                <option value={PropertyType.LAND}>Đất</option>
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-slate-600">Hướng nhà</label>
                <button
                  type="button"
                  onClick={handleOpenCompass}
                  className="flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-700 font-semibold cursor-pointer"
                  title="Đo hướng bằng la bàn cảm biến thiết bị"
                >
                  <Compass className="w-3.5 h-3.5" />
                  <span>La bàn</span>
                </button>
              </div>
              <select
                value={formData.direction}
                onChange={(e) => setFormData({ ...formData, direction: e.target.value })}
                className="w-full text-sm p-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white outline-hidden"
              >
                <option value="">Chưa xác định</option>
                {Object.values(Direction).map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Trạng thái</label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              className="w-full text-sm p-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white outline-hidden"
            >
              {Object.values(PropertyStatus).map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Section 2: GPS Location */}
        <div className="p-4 md:p-5 bg-white border border-slate-200 rounded-2xl shadow-2xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
              <MapPin className="w-4 h-4 text-blue-600" />
              <span>Tọa độ thực địa</span>
            </h3>

            <button
              type="button"
              onClick={handleFetchGps}
              disabled={fetchingGps}
              className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors"
            >
              <MapPin className="w-3.5 h-3.5" />
              <span>{fetchingGps ? "Đang lấy GPS..." : "Lấy GPS hiện tại"}</span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Vĩ độ (Lat)</label>
              <input
                type="number"
                step="0.000001"
                value={formData.latitude ?? ""}
                onChange={(e) =>
                  setFormData({ ...formData, latitude: parseFloat(e.target.value) || null })
                }
                placeholder="10.xxxxxx"
                className="w-full text-sm p-2.5 bg-slate-50 border border-slate-300 rounded-xl outline-hidden"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Kinh độ (Lng)</label>
              <input
                type="number"
                step="0.000001"
                value={formData.longitude ?? ""}
                onChange={(e) =>
                  setFormData({ ...formData, longitude: parseFloat(e.target.value) || null })
                }
                placeholder="106.xxxxxx"
                className="w-full text-sm p-2.5 bg-slate-50 border border-slate-300 rounded-xl outline-hidden"
              />
            </div>
          </div>
        </div>

        {/* Section 3: Owner / Contact */}
        <div className="p-4 md:p-5 bg-white border border-slate-200 rounded-2xl shadow-2xs space-y-3">
          <h3 className="font-semibold text-slate-800 text-sm border-b border-slate-100 pb-2 flex items-center gap-2">
            <User className="w-4 h-4 text-blue-600" />
            <span>Thông tin chủ nhà</span>
          </h3>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Tên chủ nhà</label>
              <input
                type="text"
                value={formData.ownerName}
                onChange={(e) => setFormData({ ...formData, ownerName: e.target.value })}
                placeholder="Ví dụ: Anh Tuấn"
                className="w-full text-sm p-2.5 bg-slate-50 border border-slate-300 rounded-xl outline-hidden"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Số điện thoại</label>
              <input
                type="tel"
                value={formData.ownerPhone}
                onChange={(e) => setFormData({ ...formData, ownerPhone: e.target.value })}
                placeholder="0901234567"
                className="w-full text-sm p-2.5 bg-slate-50 border border-slate-300 rounded-xl outline-hidden"
              />
            </div>
          </div>
        </div>

        {/* Section 4: Media Photos */}
        <div className="p-4 md:p-5 bg-white border border-slate-200 rounded-2xl shadow-2xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
              <Camera className="w-4 h-4 text-blue-600" />
              <span>Hình ảnh ({previewImages.length})</span>
            </h3>

            <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors border border-slate-300">
              <Upload className="w-3.5 h-3.5" />
              <span>Chọn ảnh</span>
              <input
                type="file"
                multiple
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
            </label>
          </div>

          {previewImages.length > 0 ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 pt-1">
              {previewImages.map((url, idx) => (
                <div key={idx} className="relative aspect-square rounded-xl overflow-hidden group border border-slate-200">
                  <img src={url} alt={`Photo ${idx}`} className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => handleRemoveImage(idx)}
                    className="absolute top-1 right-1 p-1 bg-black/60 hover:bg-red-600 text-white rounded-full transition-colors opacity-80 hover:opacity-100"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
              Chưa có hình ảnh nào. Bấm "Chọn ảnh" để tải lên.
            </div>
          )}
        </div>

        {/* Section 5: Detailed Description */}
        <div className="p-4 md:p-5 bg-white border border-slate-200 rounded-2xl shadow-2xs space-y-3">
          <h3 className="font-semibold text-slate-800 text-sm border-b border-slate-100 pb-2">
            Mô tả chi tiết & Nhật ký
          </h3>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Mô tả BĐS</label>
            <textarea
              rows={4}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Thông tin kết cấu, số phòng, tiện ích xung quanh, pháp lý sổ đỏ..."
              className="w-full text-sm p-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white outline-hidden"
            />
          </div>
        </div>

        {/* Action Button Bottom */}
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-xl transition-colors"
          >
            Hủy
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? "Đang lưu..." : "Lưu Bất Động Sản"}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
