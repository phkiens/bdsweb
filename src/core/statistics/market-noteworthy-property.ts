import { Property } from "../models/property";
import { OpportunityQuadrant, RadarSegmentKey } from "./radar/radar-models";

export enum MarketSortMode {
  PRIORITY = "PRIORITY", // "Đáng ưu tiên"
  LIQUIDITY = "LIQUIDITY", // "Dễ bán"
  PRICE_LOW = "PRICE_LOW" // "Giá thấp"
}

export const MARKET_SORT_MODE_LABELS = {
  [MarketSortMode.PRIORITY]: "Đáng ưu tiên",
  [MarketSortMode.LIQUIDITY]: "Dễ bán",
  [MarketSortMode.PRICE_LOW]: "Giá thấp"
} as const;

/**
 * Single evaluated property item displayed in Market Tab.
 *
 * Links individual property metrics with corresponding Radar segment intelligence.
 */
export interface MarketNoteworthyProperty {
  property: Property;
  areaDisplayName: string;
  propertyTypeDisplayName: string;
  propertyPricePerM2: number; // Tỷ VNĐ/m² = price / areaSize
  displayPricePerM2: number; // Triệu VNĐ/m² = propertyPricePerM2 * 1000.0
  targetMedianPricePerM2: number | null; // Tỷ VNĐ/m² của chính phân khúc
  displayTargetMedianPricePerM2: number | null; // Triệu VNĐ/m² của chính phân khúc = targetMedianPricePerM2 * 1000.0
  deviationPercent: number | null; // % so với median phân khúc
  segmentOpportunityScore: number | null;
  segmentSoldRatio: number | null;
  segmentQuadrant: OpportunityQuadrant;
  segmentKey: RadarSegmentKey;
}
