import { ConfidenceLevel } from "../confidence-level";

/**
 * 2x2 Commercial Quadrant classification for Opportunity Radar according to Data Contract v1.2.2.
 */
export enum OpportunityQuadrant {
  GOLDEN_OPPORTUNITY = "GOLDEN_OPPORTUNITY",
  CHEAP_BUT_SLOW = "CHEAP_BUT_SLOW",
  HOT_MARKET = "HOT_MARKET",
  HOLDING_RISK = "HOLDING_RISK",
  FAIR_MARKET = "FAIR_MARKET",
  INSUFFICIENT_DATA = "INSUFFICIENT_DATA",
  INDETERMINATE_LIQUIDITY = "INDETERMINATE_LIQUIDITY"
}

/**
 * Canonical composite key identifying a market segment (area, property type).
 */
export interface RadarSegmentKey {
  areaKey: string;
  propertyTypeKey: string;
}

/**
 * Detailed breakdown of the five Opportunity Score components (0.0 to 100.0).
 */
export interface RadarScoreBreakdown {
  priceScore: number;
  liquidityScore: number;
  ageScore: number;
  supplyScore: number;
  confidenceScore: number;
}

/**
 * Summary metrics and evaluation result for a single (area, property type) segment.
 */
export interface RadarAreaSummary {
  key: RadarSegmentKey;
  areaDisplayName: string;
  propertyTypeDisplayName: string;
  activeCount: number;
  newInWindow: number;
  targetPriceSampleCount: number;
  targetMedianPricePerM2: number | null;
  comparatorAreaCount: number;
  benchmarkPriceSampleCount: number;
  benchmarkMedianPricePerM2: number | null;
  priceDeviationPercent: number | null;
  forSaleCreatedInWindow: number;
  soldCreatedInWindow: number;
  liquidityDenominator: number;
  soldRatioProxy: number | null;
  activeAgeSampleCount: number;
  medianAgeDays: number | null;
  confidencePrice: ConfidenceLevel;
  confidenceLiquidity: ConfidenceLevel;
  confidenceAge: ConfidenceLevel;
  overallConfidence: ConfidenceLevel;
  eligible: boolean;
  scoreBreakdown: RadarScoreBreakdown | null;
  opportunityScore: number | null;
  quadrant: OpportunityQuadrant;
}

export interface RadarOpportunitySuccess {
  type: "SUCCESS";
  segments: RadarAreaSummary[];
  eligibleSegments: RadarAreaSummary[];
  topOpportunities: RadarAreaSummary[];
  liquidityP50: number | null;
  liquidityIndeterminate: boolean;
}

export interface RadarOpportunityEmptyInventory {
  type: "EMPTY_INVENTORY";
}

export interface RadarOpportunityInsufficientBenchmark {
  type: "INSUFFICIENT_BENCHMARK";
}

export interface RadarOpportunityInvalidFilter {
  type: "INVALID_FILTER";
  reason: string;
}

/**
 * Discriminated union representing the outcome of the Opportunity Radar calculation.
 */
export type RadarOpportunityResult =
  | RadarOpportunitySuccess
  | RadarOpportunityEmptyInventory
  | RadarOpportunityInsufficientBenchmark
  | RadarOpportunityInvalidFilter;

export const RadarOpportunityResults = {
  EmptyInventory: { type: "EMPTY_INVENTORY" as const },
  InsufficientBenchmark: { type: "INSUFFICIENT_BENCHMARK" as const },
  InvalidFilter(reason: string): RadarOpportunityInvalidFilter {
    return { type: "INVALID_FILTER", reason };
  },
  Success(
    segments: RadarAreaSummary[],
    eligibleSegments: RadarAreaSummary[],
    topOpportunities: RadarAreaSummary[],
    liquidityP50: number | null,
    liquidityIndeterminate: boolean
  ): RadarOpportunitySuccess {
    return {
      type: "SUCCESS",
      segments,
      eligibleSegments,
      topOpportunities,
      liquidityP50,
      liquidityIndeterminate
    };
  }
};
