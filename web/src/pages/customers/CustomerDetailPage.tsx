import React, { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ArrowLeft,
  Phone,
  MessageSquare,
  ExternalLink,
  Trash2,
  Sparkles,
  Plus,
  Building2
} from "lucide-react";
import { db } from "../../data/local/db";
import { CustomerPropertyLink, isEligibleForMatching } from "../../core/models/customer";
import { Property } from "../../core/models/property";
import { CustomerRole } from "../../core/models/enums";
import { MatchEngine } from "../../core/engine/match-engine";
import { PhoneActionModal } from "../../components/common/PhoneActionModal";
import { syncManager } from "../../data/sync/sync-manager";

export const CustomerDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [phoneModalNumber, setPhoneModalNumber] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState<"matches" | "linked" | null>(null);

  const customer = useLiveQuery(() => (id ? db.customers.get(id) : undefined), [id]);
  const properties = useLiveQuery(() =>
    db.properties
      .filter((p) => !p.isDeleted && p.isVerified)
      .toArray()
  );

  const linkedItems = useLiveQuery(async () => {
    if (!id) return [];
    const links = await db.customer_property_links
      .where("customerId")
      .equals(id)
      .filter((l) => !l.isDeleted)
      .toArray();

    if (links.length === 0) return [];

    const propIds = links.map((l) => l.propertyId);
    const props = await db.properties
      .filter((p) => !p.isDeleted && propIds.includes(p.id))
      .toArray();

    const propMap = new Map(props.map((p) => [p.id, p]));

    return links
      .map((l) => ({
        link: l,
        property: propMap.get(l.propertyId)
      }))
      .filter((item): item is { link: CustomerPropertyLink; property: Property } =>
        Boolean(item.property)
      );
  }, [id]);

  const isOwner = customer ? customer.role === CustomerRole.OWNER : false;
  const eligibleForMatching = customer ? isEligibleForMatching(customer) : false;
  const activeTab = selectedTab || (isOwner ? "linked" : "matches");

  // Calculate matched properties ONLY if customer is eligible (BUYER and ACTIVE)
  const matches = useMemo(() => {
    if (!eligibleForMatching || !customer || !properties) return [];
    const matchEngine = new MatchEngine();
    return properties
      .map((p) => ({
        property: p,
        result: matchEngine.score(customer, p)
      }))
      .filter((item) => item.result.score > 0)
      .sort((a, b) => b.result.score - a.result.score);
  }, [eligibleForMatching, customer, properties]);

  // Owner property statistics
  const ownerStats = useMemo(() => {
    if (!linkedItems) return { totalCount: 0, forSaleCount: 0, soldCount: 0 };
    const ownerItems = linkedItems.filter((i) => i.link.role === "OWNER");
    const totalCount = ownerItems.length;
    const forSaleCount = ownerItems.filter((i) => i.property.status === "Đang bán").length;
    const soldCount = ownerItems.filter((i) => i.property.status === "Đã bán").length;
    return { totalCount, forSaleCount, soldCount };
  }, [linkedItems]);

  if (!customer) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

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
              <span
                className={`px-2 py-0.5 rounded-md text-xs font-bold ${
                  isOwner ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"
                }`}
              >
                {isOwner ? "Chủ nhà ký gửi" : customer.demandType || "Khách tìm mua"}
              </span>
              <span className="text-xs font-mono text-slate-500 font-medium">{customer.phone}</span>
            </div>
            <h1 className="text-xl font-bold text-slate-900 mt-1">{customer.name}</h1>
          </div>

          <div className="text-right">
            {isOwner ? (
              <div>
                <div className="text-lg font-black text-amber-700">
                  {ownerStats.totalCount} BĐS
                </div>
                <div className="text-xs text-slate-500">
                  {ownerStats.forSaleCount} đang bán • {ownerStats.soldCount} đã bán
                </div>
              </div>
            ) : (
              <div>
                <div className="text-lg font-black text-blue-700">
                  {customer.priceMin} - {customer.priceMax} tỷ
                </div>
                <div className="text-xs text-slate-500">Ngân sách dự kiến</div>
              </div>
            )}
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
      {isOwner ? (
        <div className="border-b border-slate-200 mb-4 pb-2 flex items-center justify-between">
          <h2 className="text-sm md:text-base font-bold text-slate-800 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-amber-600" />
            <span>Kho BĐS ký gửi của chủ nhà ({(linkedItems || []).length})</span>
          </h2>
        </div>
      ) : (
        <div className="flex border-b border-slate-200 mb-4">
          <button
            onClick={() => setSelectedTab("matches")}
            className={`flex-1 py-2.5 text-xs md:text-sm font-semibold border-b-2 transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === "matches"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>BĐS gợi ý phù hợp ({matches.length})</span>
          </button>
          <button
            onClick={() => setSelectedTab("linked")}
            className={`flex-1 py-2.5 text-xs md:text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
              activeTab === "linked"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            BĐS đã liên kết ({(linkedItems || []).length})
          </button>
        </div>
      )}

      {/* Tab Content for BUYER: Matches */}
      {!isOwner && activeTab === "matches" && (
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

      {/* Tab Linked: Hiển thị khi là OWNER hoặc khi BUYER chọn tab linked */}
      {(isOwner || activeTab === "linked") && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium">
              {isOwner
                ? `Danh sách BĐS do chủ nhà gửi bán (${ownerStats.totalCount})`
                : `Các BĐS sở hữu hoặc đã dẫn khách xem (${linkedItems?.length || 0})`}
            </span>
            <button
              onClick={() =>
                navigate(
                  `/properties/new?linkedCustomerId=${customer.id}&ownerName=${encodeURIComponent(
                    customer.name
                  )}&ownerPhone=${encodeURIComponent(customer.phone)}`
                )
              }
              className={`flex items-center gap-1.5 px-3 py-1.5 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer ${
                isOwner ? "bg-amber-600 hover:bg-amber-700" : "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{isOwner ? "Thêm BĐS cho chủ nhà này" : "Thêm BĐS cho khách này"}</span>
            </button>
          </div>

          {(!linkedItems || linkedItems.length === 0) ? (
            <div className="text-center py-12 px-4 bg-white border border-slate-200 rounded-2xl shadow-xs">
              <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-2.5">
                <Building2 className="w-5 h-5" />
              </div>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Chưa có BĐS nào được liên kết với khách hàng này.
              </p>
              <button
                onClick={() =>
                  navigate(
                    `/properties/new?linkedCustomerId=${customer.id}&ownerName=${encodeURIComponent(
                      customer.name
                    )}&ownerPhone=${encodeURIComponent(customer.phone)}`
                  )
                }
                className="mt-3 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer inline-flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Thêm BĐS ngay</span>
              </button>
            </div>
          ) : (
            linkedItems.map(({ property, link }) => (
              <div
                key={property.id}
                onClick={() => navigate(`/properties/${property.id}`)}
                className="p-4 bg-white border border-slate-200 hover:border-blue-300 rounded-2xl shadow-2xs hover:shadow-sm cursor-pointer transition-all flex items-start justify-between gap-3"
              >
                <div className="space-y-1 flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                        link.role === "OWNER"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-purple-100 text-purple-800"
                      }`}
                    >
                      {link.role === "OWNER" ? "Chủ sở hữu" : "Đã dẫn xem"}
                    </span>
                    <span className="font-semibold text-slate-800 text-sm md:text-base truncate">
                      {property.area}
                    </span>
                  </div>

                  <div className="text-xs text-slate-600 font-medium flex flex-wrap gap-x-3 gap-y-1">
                    <strong className="text-blue-700">
                      {property.price > 0 ? `${property.price} tỷ` : "Thương lượng"}
                    </strong>
                    {property.areaSize && <span>• {property.areaSize} m²</span>}
                    {property.direction && <span>• Hướng: {property.direction}</span>}
                    <span className="text-slate-500">• Loại: {property.propertyType}</span>
                  </div>
                </div>

                <div className="flex flex-col items-end shrink-0">
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                      property.status === "Đang bán"
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {property.status}
                  </span>
                </div>
              </div>
            ))
          )}
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
