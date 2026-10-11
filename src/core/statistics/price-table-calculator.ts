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

/**
 * Single row in the Area Price Table according to plans/STATISTICS_DATA_CONTRACT.md v1.2.2.
 */
export interface AreaPriceRow {
  areaKey: string;
  propertyTypeKey: string;
  areaDisplayName: string;
  propertyTypeDisplayName: string;
  sampleCount: number;
  medianPrice: number; // Tỷ VNĐ (P50 of price)
  medianPricePerM2: number; // Tỷ VNĐ/m² (P50 of pricePerM2)
  displayMedianPricePerM2: number; // Triệu VNĐ/m² (medianPricePerM2 * 1000.0)
  p25PricePerM2: number; // Tỷ VNĐ/m² (P25 of pricePerM2 via R-7)
  p75PricePerM2: number; // Tỷ VNĐ/m² (P75 of pricePerM2 via R-7)
  minPricePerM2: number; // Tỷ VNĐ/m²
  maxPricePerM2: number; // Tỷ VNĐ/m²
  confidence: ConfidenceLevel;
  drillDownFilter: DrillDownFilter;
}

/**
 * Result container for Area Price Table analysis.
 */
export interface PriceTableResult {
  totalRows: number;
  totalPropertiesEvaluated: number;
  rows: AreaPriceRow[];
  overallMedianPricePerM2?: number | null;
}

const SENTINEL_KEYS = new Set<string>(["chưa xác định", "chua_ro", "null"]);

export const PriceTableCalculator = {
  calculate(properties: Property[]): PriceTableResult {
    // 1. Frozen population filter:
    // isActiveMarketProperty == true, price > 0, areaSize > 0, both finite, area & propertyType valid.
    const eligibleProperties = properties.filter((p) => {
      return (
        isActiveMarketProperty(p) &&
        PriceUtils.isValidPriceAndArea(p.price, p.areaSize) &&
        PriceTableCalculator.isValidAreaAndType(p.area, p.propertyType)
      );
    });

    // 2. Group by canonical (areaKey, propertyTypeKey)
    const grouped = new Map<string, Property[]>();
    for (const p of eligibleProperties) {
      const key = `${toCanonicalAreaKey(p.area)}|||${toCanonicalPropertyTypeKey(p.propertyType)}`;
      const list = grouped.get(key) ?? [];
      list.push(p);
      grouped.set(key, list);
    }

    const rows: AreaPriceRow[] = [];

    for (const [keyPair, groupProps] of grouped.entries()) {
      const [areaKey, propertyTypeKey] = keyPair.split("|||");

      const areaDisplayName = toTitleCase(areaKey);
      const propertyTypeDisplayName = toTitleCase(normalizePropertyType(propertyTypeKey));

      const prices = groupProps.map((p) => p.price);
      const unitPrices: number[] = [];
      for (const p of groupProps) {
        const u = PriceUtils.calculatePricePerM2(p.price, p.areaSize);
        if (u != null) unitPrices.push(u);
      }

      const medianPrice = MedianUtils.calculateMedian(prices) ?? 0.0;
      const medianPricePerM2 = MedianUtils.calculateMedian(unitPrices) ?? 0.0;
      const displayMedianPricePerM2 = medianPricePerM2 * 1000.0;
      const p25PricePerM2 = MedianUtils.calculateP25(unitPrices) ?? 0.0;
      const p75PricePerM2 = MedianUtils.calculateP75(unitPrices) ?? 0.0;
      const minPricePerM2 = unitPrices.length > 0 ? Math.min(...unitPrices) : 0.0;
      const maxPricePerM2 = unitPrices.length > 0 ? Math.max(...unitPrices) : 0.0;

      const sampleCount = groupProps.length;
      const confidence = sampleCountToConfidence(sampleCount);

      const drillDownFilter = new DrillDownFilter({
        source: DrillDownSource.DEAL_FINDER,
        contextLabel: `${areaDisplayName} - ${propertyTypeDisplayName}`,
        verifiedMode: VerifiedMode.ALL,
        excludeDraft: true,
        targetStatus: PropertyStatus.FOR_SALE,
        targetArea: areaDisplayName,
        targetPropertyType: propertyTypeDisplayName
      });

      rows.push({
        areaKey,
        propertyTypeKey,
        areaDisplayName,
        propertyTypeDisplayName,
        sampleCount,
        medianPrice,
        medianPricePerM2,
        displayMedianPricePerM2,
        p25PricePerM2,
        p75PricePerM2,
        minPricePerM2,
        maxPricePerM2,
        confidence,
        drillDownFilter
      });
    }

    // 3. Deterministic sorting: sampleCount desc -> areaDisplayName asc -> propertyTypeDisplayName asc
    rows.sort((a, b) => {
      if (b.sampleCount !== a.sampleCount) {
        return b.sampleCount - a.sampleCount;
      }
      const areaCmp = a.areaDisplayName.localeCompare(b.areaDisplayName);
      if (areaCmp !== 0) return areaCmp;
      return a.propertyTypeDisplayName.localeCompare(b.propertyTypeDisplayName);
    });

    const allUnitPrices: number[] = [];
    for (const p of eligibleProperties) {
      const u = PriceUtils.calculatePricePerM2(p.price, p.areaSize);
      if (u != null) allUnitPrices.push(u);
    }
    const overallMedianPricePerM2 = MedianUtils.calculateMedian(allUnitPrices);

    return {
      totalRows: rows.length,
      totalPropertiesEvaluated: eligibleProperties.length,
      rows,
      overallMedianPricePerM2
    };
  },

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
  }
};
