import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ArrowLeft,
  Phone,
  MessageSquare,
  ExternalLink,
  Trash2,
  Sparkles
} from "lucide-react";
import { db } from "../../data/local/db";
import { MatchEngine } from "../../core/engine/match-engine";
import { PhoneActionModal } from "../../components/common/PhoneActionModal";
import { syncManager } from "../../data/sync/sync-manager";

export const CustomerDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [phoneModalNumber, setPhoneModalNumber] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"matches" | "linked">("matches");

  const customer = useLiveQuery(() => (id ? db.customers.get(id) : undefined), [id]);
  const properties = useLiveQuery(() =>
    db.properties
      .where("isDeleted")
      .equals(0 as any)
      .and((p) => p.isVerified)
      .toArray()
  );

  const linkedLinks = useLiveQuery(() =>
    id
      ? db.customer_property_links
          .where("customerId")
          .equals(id)
          .and((l) => !l.isDeleted)
          .toArray()
      : []
  , [id]);

  if (!customer) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  // Calculate matched properties
  const matchEngine = new MatchEngine();
  const matches = (properties || [])
    .map((p) => ({
      property: p,
      result: matchEngine.score(customer, p)
    }))
    .filter((item) => item.result.score > 0)
    .sort((a, b) => b.result.score - a.result.score);

  const handleDelete = async () => {
    if (!window.confirm("Bạn có chắc muốn xóa khách hàng này?")) return;
    await db.customers.update(customer.id, {
      isDeleted: true,
      updatedAt: Date.now(),
      isSynced: false
    });
    syncManager.pushChanges();
    navigate("/customers");
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

        <button
          onClick={handleDelete}
          className="p-2 text-slate-400 hover:text-red-600 hover:bg-slate-100 rounded-xl transition-colors"
          title="Xóa khách hàng"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Customer Header Card */}
      <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-2xs space-y-3 mb-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-blue-100 text-blue-800">
                {customer.demandType}
              </span>
              <span className="text-xs font-mono text-slate-500 font-medium">{customer.phone}</span>
            </div>
            <h1 className="text-xl font-bold text-slate-900 mt-1">{customer.name}</h1>
          </div>

          <div className="text-right">
            <div className="text-lg font-black text-blue-700">
              {customer.priceMin} - {customer.priceMax} tỷ
            </div>
            <div className="text-xs text-slate-500">Ngân sách dự kiến</div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs text-slate-600 pt-2 border-t border-slate-100">
          <div>
            <span className="text-slate-400">Loại BĐS:</span>{" "}
            <span className="font-semibold text-slate-800">{customer.propertyType || "Bất kỳ"}</span>
          </div>
          <div>
            <span className="text-slate-400">Khu vực:</span>{" "}
            <span className="font-semibold text-slate-800">{customer.demandAreas || "Linh hoạt"}</span>
          </div>
          <div>
            <span className="text-slate-400">Hướng:</span>{" "}
            <span className="font-semibold text-slate-800">{customer.demandDirections || "Linh hoạt"}</span>
          </div>
        </div>

        {customer.note && (
          <p className="text-xs text-slate-500 italic bg-slate-50 p-2 rounded-xl">
            Ghi chú: {customer.note}
          </p>
        )}

        {/* Contact Buttons */}
        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100">
          <button
            onClick={() => customer.phone && setPhoneModalNumber(customer.phone)}
            disabled={!customer.phone}
            className="flex items-center justify-center gap-1.5 py-2 bg-slate-50 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 rounded-xl text-xs font-semibold transition-colors disabled:opacity-40"
          >
            <Phone className="w-4 h-4 text-emerald-600" />
            <span>Gọi điện</span>
          </button>

          <button
            onClick={() =>
              customer.phone && window.open(`https://zalo.me/${customer.phone}`, "_blank")
            }
            disabled={!customer.phone}
            className="flex items-center justify-center gap-1.5 py-2 bg-slate-50 hover:bg-sky-50 text-slate-700 hover:text-sky-700 rounded-xl text-xs font-semibold transition-colors disabled:opacity-40"
          >
            <ExternalLink className="w-4 h-4 text-sky-600" />
            <span>Mở Zalo</span>
          </button>

          <a
            href={`sms:${customer.phone}`}
            className="flex items-center justify-center gap-1.5 py-2 bg-slate-50 hover:bg-blue-50 text-slate-700 hover:text-blue-700 rounded-xl text-xs font-semibold transition-colors"
          >
            <MessageSquare className="w-4 h-4 text-blue-600" />
            <span>Gửi SMS</span>
          </a>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 mb-4">
        <button
          onClick={() => setActiveTab("matches")}
          className={`flex-1 py-2.5 text-xs md:text-sm font-semibold border-b-2 transition-colors flex items-center justify-center gap-1.5 ${
            activeTab === "matches"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>BĐS gợi ý phù hợp ({matches.length})</span>
        </button>
        <button
          onClick={() => setActiveTab("linked")}
          className={`flex-1 py-2.5 text-xs md:text-sm font-semibold border-b-2 transition-colors ${
            activeTab === "linked"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          BĐS đã liên kết ({(linkedLinks || []).length})
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === "matches" && (
        <div className="space-y-3">
          {matches.length === 0 ? (
            <div className="text-center py-10 bg-white border border-slate-200 rounded-2xl text-xs text-slate-400">
              Chưa tìm thấy BĐS nào phù hợp với các tiêu chí của khách hàng này.
            </div>
          ) : (
            matches.map(({ property, result }) => (
              <div
                key={property.id}
                onClick={() => navigate(`/properties/${property.id}`)}
                className="p-4 bg-white border border-slate-200 hover:border-blue-300 rounded-2xl shadow-2xs hover:shadow-sm cursor-pointer transition-all flex items-start justify-between gap-3"
              >
                <div className="space-y-1 flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-800 text-sm md:text-base truncate">
                      {property.area}
                    </span>
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700">
                      {property.propertyType}
                    </span>
                  </div>

                  <div className="text-xs text-slate-600 font-medium">
                    <strong className="text-blue-700">{property.price} tỷ</strong>
                    {property.areaSize && <span> • {property.areaSize} m²</span>}
                    {property.direction && <span> • Hướng: {property.direction}</span>}
                  </div>

                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {result.matchingReasons.map((r, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-[10px] font-medium"
                      >
                        ✓ {r}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col items-end shrink-0">
                  <div className="px-3 py-1 rounded-full bg-blue-100 text-blue-800 font-black text-xs">
                    {result.score}/100 đ
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab Linked */}
      {activeTab === "linked" && (
        <div className="text-center py-10 bg-white border border-slate-200 rounded-2xl text-xs text-slate-400">
          Chưa có BĐS nào được gắn cờ đã xem hoặc sở hữu bởi khách hàng này.
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
