import React, { useMemo } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Info, ArrowRight } from "lucide-react";
import { db } from "../../data/local/db";
import {
  ValuationCalculator,
  DealPropertyItem,
  ValuationLabel
} from "../../core/statistics/valuation-calculator";
import {
  PropertyStatusConstants,
  toCanonicalAreaKey,
  toCanonicalPropertyTypeKey,
  normalizePropertyType
} from "../../core/statistics/statistics-filter";
import { PriceUtils } from "../../core/statistics/price-utils";
import { toTitleCase } from "../../core/utils/vietnamese";
import { LivestreamBadge } from "../../components/live/LivestreamBadge";

function getValuationBadgeClass(label: ValuationLabel): string {
  switch (label.code) {
    case "DEEP_DISCOUNT":
      return "bg-emerald-50 text-emerald-700 border border-emerald-200";
    case "MODERATE_DISCOUNT":
      return "bg-sky-50 text-sky-700 border border-sky-200";
    case "FAIR_MARKET":
      return "bg-slate-100 text-slate-700 border border-slate-200";
    case "SLIGHTLY_HIGH":
      return "bg-amber-50 text-amber-700 border border-amber-200";
    case "HIGH":
      return "bg-red-50 text-red-700 border border-red-200";
    default:
      return "bg-slate-100 text-slate-700 border border-slate-200";
  }
}

const PropertyDealCard: React.FC<{
  item: DealPropertyItem;
  onOpenProperty: (propertyId: string, isVerified: boolean) => void;
}> = ({ item, onOpenProperty }) => {
  const title = item.property.title?.trim() || `BĐS #${item.property.id.slice(0, 8)}`;
  const priceStr = PriceUtils.formatOneDecimal(item.property.price);
  const areaStr =
    item.property.areaSize != null
      ? PriceUtils.formatOneDecimal(item.property.areaSize)
      : "—";
  const unitPriceStr = PriceUtils.formatOneDecimal(item.displayPricePerM2);

  const isEvaluated =
    item.deviationPercent != null &&
    item.displayBenchmarkMedianPricePerM2 != null;

  return (
    <div
      onClick={() => onOpenProperty(item.property.id, item.property.isVerified)}
      className="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs hover:border-blue-300 transition-all cursor-pointer space-y-2.5"
    >
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-sm font-bold text-slate-900 truncate flex-1">
          {title}
        </h4>

        {item.valuationLabel && (
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold shrink-0 ${getValuationBadgeClass(
              item.valuationLabel
            )}`}
          >
            {item.valuationLabel.vietnameseTitle}
          </span>
        )}
      </div>

      <div className="text-sm font-semibold text-slate-800">
        {priceStr} tỷ • {areaStr} m² • {unitPriceStr} tr/m²
      </div>

      <div className="text-xs">
        {isEvaluated ? (
          <span className="text-slate-600">
            {item.deviationPercent! < 0
              ? `Rẻ hơn mặt bằng ${PriceUtils.formatOneDecimal(-item.deviationPercent!)}%`
              : item.deviationPercent! > 0
              ? `Cao hơn mặt bằng ${PriceUtils.formatOneDecimal(item.deviationPercent!)}%`
              : "Ngang mặt bằng"}{" "}
            (Mặt bằng: {PriceUtils.formatOneDecimal(item.displayBenchmarkMedianPricePerM2!)} tr/m²)
          </span>
        ) : (
          <span className="text-slate-400">
            {item.reason || "Chưa đủ dữ liệu so sánh (< 5 mẫu)"}
          </span>
        )}
      </div>

      <div className="flex justify-end pt-1">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenProperty(item.property.id, item.property.isVerified);
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
        >
          <span>Xem chi tiết căn</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

export const RadarAreaDetailPage: React.FC = () => {
  const navigate = useNavigate();
  const { area: paramArea, type: paramType } = useParams<{
    area?: string;
    type?: string;
  }>();
  const [searchParams] = useSearchParams();

  const rawArea = paramArea || searchParams.get("area") || "";
  const rawType = paramType || searchParams.get("type") || "";

  const canonicalArea = toCanonicalAreaKey(rawArea);
  const canonicalType = toCanonicalPropertyTypeKey(rawType);

  // Live query from Dexie, capturing "now" inside query function
  const queryData = useLiveQuery(async () => {
    const now = Date.now();
    const allProperties = await db.properties.filter((p) => !p.isDeleted).toArray();

    if (!canonicalArea || !canonicalType) {
      return {
        now,
        isInvalid: true,
        allProperties: []
      };
    }

    return {
      now,
      isInvalid: false,
      allProperties
    };
  }, [canonicalArea, canonicalType]);

  // Derived UI State
  const uiState = useMemo(() => {
    if (!queryData) {
      return { type: "LOADING" as const };
    }

    if (queryData.isInvalid) {
      return {
        type: "INVALID_ARGUMENTS" as const,
        message: "Tham số khu vực hoặc loại hình không hợp lệ"
      };
    }

    const { allProperties } = queryData;

    const segmentProperties = allProperties.filter((p) => {
      const size = p.areaSize;
      const price = p.price;
      return (
        !p.isDeleted &&
        !p.isDraft &&
        PropertyStatusConstants.isActiveMarket(p.status) &&
        toCanonicalAreaKey(p.area) === canonicalArea &&
        toCanonicalPropertyTypeKey(p.propertyType) === canonicalType &&
        price > 0.0 &&
        Number.isFinite(price) &&
        !Number.isNaN(price) &&
        size != null &&
        size > 0.0 &&
        Number.isFinite(size) &&
        !Number.isNaN(size)
      );
    });

    if (segmentProperties.length === 0) {
      return { type: "EMPTY" as const };
    }

    const dealResult = ValuationCalculator.calculate(
      segmentProperties,
      allProperties
    );

    const allItems = dealResult.items;
    const recommendedItems = allItems.filter(
      (it) => it.deviationPercent != null && it.deviationPercent <= -5.0
    );
    const insufficientItems = allItems.filter(
      (it) => it.deviationPercent == null
    );
    const otherEvaluated = allItems.filter(
      (it) => !recommendedItems.includes(it) && !insufficientItems.includes(it)
    );

    const areaDisplayName = toTitleCase(canonicalArea);
    const propertyTypeDisplayName = normalizePropertyType(canonicalType);

    return {
      type: "CONTENT" as const,
      areaDisplayName,
      propertyTypeDisplayName,
      allItems,
      recommendedItems,
      insufficientItems,
      otherEvaluated
    };
  }, [queryData, canonicalArea, canonicalType]);

  const handleOpenProperty = (propertyId: string, isVerified: boolean) => {
    if (isVerified) {
      navigate(`/properties/${propertyId}`);
    } else {
      navigate(`/unverified/${propertyId}`);
    }
  };

  const titleText =
    uiState.type === "CONTENT"
      ? `${uiState.areaDisplayName} — ${uiState.propertyTypeDisplayName}`
      : "Chi tiết phân khúc";

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-4 py-3 sm:py-4 pb-24 md:pb-12 space-y-4">
      {/* Top App Bar */}
      <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="p-2 -ml-1 text-slate-600 hover:text-slate-900 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
            title="Quay lại"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold text-slate-900 truncate flex items-center gap-2">
            <span>{titleText}</span>
            <LivestreamBadge />
          </h1>
        </div>
      </div>

      {/* Loading */}
      {uiState.type === "LOADING" && (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500">
          <div className="animate-spin w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full" />
          <span className="text-xs font-medium mt-3">
            Đang tải dữ liệu phân khúc…
          </span>
        </div>
      )}

      {/* Invalid Arguments */}
      {uiState.type === "INVALID_ARGUMENTS" && (
        <div className="p-6 bg-red-50 border border-red-200 rounded-2xl text-center space-y-3">
          <Info className="w-8 h-8 text-red-500 mx-auto" />
          <h3 className="text-sm font-bold text-red-800">{uiState.message}</h3>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            Quay lại
          </button>
        </div>
      )}

      {/* Empty */}
      {uiState.type === "EMPTY" && (
        <div className="p-6 bg-slate-100 border border-slate-200 rounded-2xl text-center">
          <Info className="w-8 h-8 text-slate-400 mx-auto mb-2" />
          <h3 className="text-sm font-bold text-slate-800">
            Không có BĐS đang bán trong phân khúc này
          </h3>
        </div>
      )}

      {/* Content */}
      {uiState.type === "CONTENT" && (
        <div className="space-y-4">
          {/* Hero Banner */}
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-2xl">
            <h3 className="text-sm font-bold text-blue-900">
              {uiState.recommendedItems.length > 0
                ? `Nên xem ${uiState.recommendedItems.length} căn thấp hơn mặt bằng từ 5%`
                : "Không có căn nào thấp hơn mặt bằng từ 5%"}
            </h3>
            <p className="text-xs text-blue-700/80 mt-1">
              Định giá theo phương pháp trung vị loại trừ (Leave-One-Out) cùng phân khúc.
            </p>
          </div>

          {/* Group 1: Đề xuất giá tốt */}
          {uiState.recommendedItems.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-blue-700 uppercase tracking-wider px-1">
                Đề Xuất Giá Tốt ({uiState.recommendedItems.length})
              </h3>
              <div className="space-y-3">
                {uiState.recommendedItems.map((item) => (
                  <PropertyDealCard
                    key={item.property.id}
                    item={item}
                    onOpenProperty={handleOpenProperty}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Group 2: Các căn đã định giá khác */}
          {uiState.otherEvaluated.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wider px-1">
                Các Căn Khác Trong Phân Khúc ({uiState.otherEvaluated.length})
              </h3>
              <div className="space-y-3">
                {uiState.otherEvaluated.map((item) => (
                  <PropertyDealCard
                    key={item.property.id}
                    item={item}
                    onOpenProperty={handleOpenProperty}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Group 3: Chưa đủ dữ liệu so sánh */}
          {uiState.insufficientItems.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">
                Chưa Đủ Dữ Liệu So Sánh ({uiState.insufficientItems.length})
              </h3>
              <div className="space-y-3">
                {uiState.insufficientItems.map((item) => (
                  <PropertyDealCard
                    key={item.property.id}
                    item={item}
                    onOpenProperty={handleOpenProperty}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
