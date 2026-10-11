import { Property } from "../models/property";
import { PropertyStatus } from "../models/enums";
import {
  ConfidenceLevel,
  sampleCountToConfidence
} from "./confidence-level";
import {
  DrillDownFilter,
  DrillDownSource
} from "./drill-down-filter";
import { MedianUtils } from "./median-utils";
import { PriceUtils } from "./price-utils";
import {
  isActiveMarketProperty,
  normalizePropertyType,
  toCanonicalAreaKey,
  toCanonicalPropertyTypeKey,
  VerifiedMode
} from "./statistics-filter";
import { toTitleCase } from "../utils/vietnamese";

export interface IValuationLabel {
  readonly code: string;
  readonly vietnameseTitle: string;
}

export class ValuationLabelItem implements IValuationLabel {
  constructor(
    public readonly code: string,
    public readonly vietnameseTitle: string
  ) {}
}

const VALUATION_DEEP_DISCOUNT = new ValuationLabelItem(
  "DEEP_DISCOUNT",
  "Thấp hơn tham chiếu ≥ 15%"
);
const VALUATION_MODERATE_DISCOUNT = new ValuationLabelItem(
  "MODERATE_DISCOUNT",
  "Thấp hơn tham chiếu 5-15%"
);
const VALUATION_FAIR_MARKET = new ValuationLabelItem(
  "FAIR_MARKET",
  "Sát giá rao tham chiếu"
);
const VALUATION_SLIGHTLY_HIGH = new ValuationLabelItem(
  "SLIGHTLY_HIGH",
  "Cao hơn tham chiếu 5-15%"
);
const VALUATION_HIGH = new ValuationLabelItem(
  "HIGH",
  "Cao hơn tham chiếu ≥ 15%"
);

export const ValuationLabel = {
  DEEP_DISCOUNT: VALUATION_DEEP_DISCOUNT,
  MODERATE_DISCOUNT: VALUATION_MODERATE_DISCOUNT,
  FAIR_MARKET: VALUATION_FAIR_MARKET,
  SLIGHTLY_HIGH: VALUATION_SLIGHTLY_HIGH,
  HIGH: VALUATION_HIGH
};

export type ValuationLabel = ValuationLabelItem;

export function classifyValuationLabel(deviationPercent: number): ValuationLabel {
  if (!Number.isFinite(deviationPercent) || Number.isNaN(deviationPercent)) {
    throw new Error(`deviationPercent must be finite, but was ${deviationPercent}`);
  }
  if (deviationPercent <= -15.0) return ValuationLabel.DEEP_DISCOUNT;
  if (deviationPercent <= -5.0) return ValuationLabel.MODERATE_DISCOUNT;
  if (deviationPercent < 5.0) return ValuationLabel.FAIR_MARKET;
  if (deviationPercent < 15.0) return ValuationLabel.SLIGHTLY_HIGH;
  return ValuationLabel.HIGH;
}

export interface DealPropertyItem {
  property: Property;
  areaDisplayName: string;
  propertyTypeDisplayName: string;
  propertyPricePerM2: number; // Tỷ VNĐ/m²
  displayPricePerM2: number; // Triệu VNĐ/m² (propertyPricePerM2 * 1000.0)
  comparatorSampleCount: number;
  benchmarkMedianPricePerM2: number | null; // Tỷ VNĐ/m²
  displayBenchmarkMedianPricePerM2: number | null; // Triệu VNĐ/m² (benchmarkMedianPricePerM2 * 1000.0)
  deviationPercent: number | null;
  valuationLabel: ValuationLabel | null;
  confidence: ConfidenceLevel;
  reason: string | null;
  drillDownFilter: DrillDownFilter;
}

export interface DealFinderResult {
  totalEligibleProperties: number;
  evaluatedCount: number;
  insufficientDataCount: number;
  items: DealPropertyItem[];
}

const SENTINEL_KEYS = new Set<string>(["chưa xác định", "chua_ro", "null"]);
const INSUFFICIENT_DATA_REASON = "Chưa đủ dữ liệu so sánh (< 5 mẫu)";

export const ValuationCalculator = {
  isValidAreaAndType(
    area: string | null | undefined,
    propertyType: string | null | undefined
  ): boolean {
    const canonicalArea = toCanonicalAreaKey(area);
    const canonicalType = toCanonicalPropertyTypeKey(propertyType);
    return (
      canonicalArea.length > 0 &&
      !SENTINEL_KEYS.has(canonicalArea) &&
      canonicalType.length > 0 &&
      !SENTINEL_KEYS.has(canonicalType)
    );
  },

  isEligible(p: Property): boolean {
    return (
      isActiveMarketProperty(p) &&
      PriceUtils.isValidPriceAndArea(p.price, p.areaSize) &&
      ValuationCalculator.isValidAreaAndType(p.area, p.propertyType)
    );
  },

  calculate(
    targetProperties: Property[],
    benchmarkProperties: Property[]
  ): DealFinderResult {
    // 1. Frozen population filtering
    const eligibleTargets = targetProperties.filter(ValuationCalculator.isEligible);
    const eligibleBenchmarks = benchmarkProperties.filter(ValuationCalculator.isEligible);

    // 2. Group benchmark properties by canonical (areaKey, propertyTypeKey)
    const benchmarkGrouped = new Map<string, Property[]>();
    for (const p of eligibleBenchmarks) {
      const key = `${toCanonicalAreaKey(p.area)}|||${toCanonicalPropertyTypeKey(p.propertyType)}`;
      const list = benchmarkGrouped.get(key) ?? [];
      list.push(p);
      benchmarkGrouped.set(key, list);
    }

    // Group target properties by canonical (areaKey, propertyTypeKey)
    const targetGrouped = new Map<string, Property[]>();
    for (const p of eligibleTargets) {
      const key = `${toCanonicalAreaKey(p.area)}|||${toCanonicalPropertyTypeKey(p.propertyType)}`;
      const list = targetGrouped.get(key) ?? [];
      list.push(p);
      targetGrouped.set(key, list);
    }

    const allItems: DealPropertyItem[] = [];

    for (const [keyPair, segmentTargets] of targetGrouped.entries()) {
      const [areaKey, propertyTypeKey] = keyPair.split("|||");

      const areaDisplayName = toTitleCase(areaKey);
      const propertyTypeDisplayName = toTitleCase(normalizePropertyType(propertyTypeKey));

      const drillDownFilter = new DrillDownFilter({
        source: DrillDownSource.DEAL_FINDER,
        contextLabel: `${areaDisplayName} - ${propertyTypeDisplayName}`,
        verifiedMode: VerifiedMode.ALL,
        excludeDraft: true,
        targetStatus: PropertyStatus.FOR_SALE,
        targetArea: areaDisplayName,
        targetPropertyType: propertyTypeDisplayName
      });

      const benchmarkSegment = benchmarkGrouped.get(keyPair) ?? [];

      for (const targetProperty of segmentTargets) {
        const propertyPricePerM2 = targetProperty.price / targetProperty.areaSize!;
        const displayPricePerM2 = propertyPricePerM2 * 1000.0;

        // Leave-One-Out (LOO) by ID
        const comparators = benchmarkSegment.filter((it) => it.id !== targetProperty.id);
        const comparatorSampleCount = comparators.length;

        if (comparatorSampleCount < 5) {
          allItems.push({
            property: targetProperty,
            areaDisplayName,
            propertyTypeDisplayName,
            propertyPricePerM2,
            displayPricePerM2,
            comparatorSampleCount,
            benchmarkMedianPricePerM2: null,
            displayBenchmarkMedianPricePerM2: null,
            deviationPercent: null,
            valuationLabel: null,
            confidence: ConfidenceLevel.LOW,
            reason: INSUFFICIENT_DATA_REASON,
            drillDownFilter
          });
        } else {
          const comparatorUnitPrices = comparators.map(
            (it) => it.price / it.areaSize!
          );
          const benchmarkMedianPricePerM2 =
            MedianUtils.calculateMedian(comparatorUnitPrices) ?? 0.0;
          const displayBenchmarkMedianPricePerM2 =
            benchmarkMedianPricePerM2 * 1000.0;
          const deviationPercent =
            benchmarkMedianPricePerM2 > 0.0
              ? ((propertyPricePerM2 - benchmarkMedianPricePerM2) /
                  benchmarkMedianPricePerM2) *
                100.0
              : 0.0;
          const valuationLabel = classifyValuationLabel(deviationPercent);
          const confidence = sampleCountToConfidence(comparatorSampleCount);

          allItems.push({
            property: targetProperty,
            areaDisplayName,
            propertyTypeDisplayName,
            propertyPricePerM2,
            displayPricePerM2,
            comparatorSampleCount,
            benchmarkMedianPricePerM2,
            displayBenchmarkMedianPricePerM2,
            deviationPercent,
            valuationLabel,
            confidence,
            reason: null,
            drillDownFilter
          });
        }
      }
    }

    // 3. Deterministic sorting:
    // Evaluated items: deviationPercent asc -> price asc -> id asc
    const evaluatedItems = allItems
      .filter((it) => it.deviationPercent != null)
      .sort((a, b) => {
        if (a.deviationPercent! !== b.deviationPercent!) {
          return a.deviationPercent! - b.deviationPercent!;
        }
        if (a.property.price !== b.property.price) {
          return a.property.price - b.property.price;
        }
        return a.property.id.localeCompare(b.property.id);
      });

    // Unevaluated items: price asc -> id asc
    const insufficientItems = allItems
      .filter((it) => it.deviationPercent == null)
      .sort((a, b) => {
        if (a.property.price !== b.property.price) {
          return a.property.price - b.property.price;
        }
        return a.property.id.localeCompare(b.property.id);
      });

    const sortedItems = [...evaluatedItems, ...insufficientItems];

    return {
      totalEligibleProperties: sortedItems.length,
      evaluatedCount: evaluatedItems.length,
      insufficientDataCount: insufficientItems.length,
      items: sortedItems
    };
  },

  findDeals(
    targetProperties: Property[],
    benchmarkProperties: Property[],
    minDiscountPercent: number = 15.0
  ): DealPropertyItem[] {
    if (
      !Number.isFinite(minDiscountPercent) ||
      Number.isNaN(minDiscountPercent) ||
      minDiscountPercent < 0.0
    ) {
      throw new Error(
        `minDiscountPercent must be finite and >= 0, but was ${minDiscountPercent}`
      );
    }
    const result = ValuationCalculator.calculate(
      targetProperties,
      benchmarkProperties
    );
    return result.items.filter(
      (it) => it.deviationPercent != null && it.deviationPercent <= -minDiscountPercent
    );
  }
};
