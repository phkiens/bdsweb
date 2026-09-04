import React, { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Inbox,
  Sparkles,
  CheckCircle2,
  Trash2,
  Clock,
  ExternalLink
} from "lucide-react";
import { db } from "../../data/local/db";
import { Property } from "../../core/models/property";
import { PropertyStatus } from "../../core/models/enums";
import { syncManager } from "../../data/sync/sync-manager";
import { createDefaultProperty } from "../../core/models/property";
import { canonicalizeVietnamesePhone, toTitleCase } from "../../core/utils/vietnamese";
import { parseVietnamCoordinates } from "../../core/utils/coordinates";
import { nowTimestamp } from "../../core/utils/date";

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

  const unverifiedList = useLiveQuery(async () => {
    return await db.properties
      .filter((p) => !p.isDeleted && !p.isVerified)
      .reverse()
      .sortBy("updatedAt");
  }, []);

  // Tự động chuẩn hóa các tin chờ bị lưu nhầm diện tích m² vào trường area (ví dụ area = "40", "50"...)
  React.useEffect(() => {
    if (!unverifiedList || unverifiedList.length === 0) return;
    const needsHeal = unverifiedList.filter(
      (p) => !isNaN(Number(p.area)) && Number(p.area) > 0
    );
    if (needsHeal.length > 0) {
      const updates = needsHeal.map((p) => {
        const num = Number(p.area);
        const firstLine = p.rawText ? p.rawText.trim().split("\n")[0].slice(0, 60) : "";
        return {
          ...p,
          area: firstLine ? toTitleCase(firstLine) : "Tin chờ khảo sát",
          areaSize: p.areaSize ?? num
        };
      });
      db.properties.bulkPut(updates);
    }
  }, [unverifiedList]);

  const handleVerify = (p: Property) => {
    navigate(`/properties/edit/${p.id}?openForVerify=true`);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Bạn có chắc muốn xóa tin chờ này?")) return;
    await db.properties.update(id, {
      isDeleted: true,
      updatedAt: nowTimestamp(),
      isTextSynced: false
    });
    syncManager.pushChanges();
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
    syncManager.pushChanges();

    setRawInput("");
    setShowImportModal(false);
  };

  if (unverifiedList === undefined) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-4 md:py-6 pb-24 md:pb-12">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Inbox className="w-6 h-6 text-amber-600" />
            <span>Tin Chờ Khảo Sát & Trích Xuất</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Các bất động sản được bóc tách từ Zalo/FB hoặc chưa qua xác thực thực địa ({unverifiedList.length})
          </p>
        </div>

        <button
          onClick={() => setShowImportModal(true)}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors"
        >
          <Sparkles className="w-4 h-4" />
          <span>Dán tin thô</span>
        </button>
      </div>

      {/* List */}
      {unverifiedList.length === 0 ? (
        <div className="text-center py-16 px-4 bg-white border border-slate-200 rounded-2xl shadow-xs">
          <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-500 flex items-center justify-center mx-auto mb-3">
            <Inbox className="w-6 h-6" />
          </div>
          <h4 className="text-base font-semibold text-slate-700">Hộp thư tin chờ trống</h4>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Chưa có tin chờ duyệt nào. Hãy bấm "Dán tin thô" để trích xuất nhanh bài đăng bất động sản.
          </p>
          <button
            onClick={() => setShowImportModal(true)}
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-medium text-xs rounded-xl shadow-xs transition-colors"
          >
            <Sparkles className="w-4 h-4" />
            <span>Dán tin mới</span>
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {unverifiedList.map((p) => (
            <div
              key={p.id}
              className="p-4 bg-white border border-amber-200/80 hover:border-amber-300 rounded-2xl shadow-2xs space-y-2.5 transition-all"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-800">
                      Chờ duyệt
                    </span>
                    <h3 className="font-semibold text-slate-800 text-sm md:text-base truncate">
                      {p.area && isNaN(Number(p.area))
                        ? p.area
                        : p.rawText
                        ? p.rawText.trim().split("\n")[0].slice(0, 60)
                        : "Tin chờ khảo sát"}
                    </h3>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-600 mt-1 font-medium">
                    <span className="text-blue-700 font-bold">{p.price > 0 ? `${p.price} tỷ` : "Chưa rõ giá"}</span>
                    {(p.areaSize != null || (!isNaN(Number(p.area)) && Number(p.area) > 0)) && (
                      <span>• {p.areaSize ?? p.area} m²</span>
                    )}
                    {p.ownerPhone && <span>• SĐT: {p.ownerPhone}</span>}
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleVerify(p)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors"
                    title="Xác thực chuyển sang danh sách chính thức"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Xác thực</span>
                  </button>
                  <button
                    onClick={() => handleDelete(p.id)}
                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-slate-100 rounded-lg transition-colors"
                    title="Xóa tin"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {p.rawText && (
                <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-xl text-xs text-slate-600 line-clamp-3 font-mono">
                  {p.rawText}
                </div>
              )}

              <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-50">
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span>Cập nhật: {new Date(p.updatedAt).toLocaleDateString("vi-VN")}</span>
                </div>

                <button
                  onClick={() => navigate(`/properties/${p.id}`)}
                  className="flex items-center gap-1 text-blue-600 font-medium hover:underline"
                >
                  <span>Xem chi tiết</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-xl overflow-hidden p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-600" />
                <h3 className="font-bold text-slate-800 text-base">Dán văn bản tin rao BĐS</h3>
              </div>
              <button
                onClick={() => setShowImportModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm"
              >
                ✕
              </button>
            </div>

            <textarea
              rows={6}
              value={rawInput}
              onChange={(e) => setRawInput(e.target.value)}
              placeholder="Dán toàn bộ nội dung tin rao từ Zalo, Facebook, SMS..."
              className="w-full text-xs md:text-sm p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 outline-hidden"
            />

            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => setShowImportModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Hủy
              </button>
              <button
                onClick={handleImportRawText}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors"
              >
                Trích xuất & Lưu tin chờ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
