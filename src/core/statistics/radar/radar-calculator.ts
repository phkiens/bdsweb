import { Property } from "../../models/property";
import { ConfidenceLevel, minConfidence } from "../confidence-level";
import { MedianUtils } from "../median-utils";
import { PriceUtils } from "../price-utils";
import {
  getLocalDateParts,
  normalizePropertyType,
  PropertyStatusConstants,
  STATS_ZONE_ID,
  StatisticsFilter,
  toCanonicalAreaKey,
  toCanonicalPropertyTypeKey
} from "../statistics-filter";
import { toTitleCase } from "../../utils/vietnamese";
import { RadarConfig } from "./radar-config";
import {
  OpportunityQuadrant,
  RadarAreaSummary,
  RadarOpportunityResult,
  RadarOpportunityResults,
  RadarScoreBreakdown,
  RadarSegmentKey
} from "./radar-models";

const SENTINEL_KEYS = new Set<string>(["chưa xác định", "chua_ro", "null"]);

function sampleCountToConfigConfidence(count: number, config: RadarConfig): ConfidenceLevel {
  if (count < 0) {
    throw new Error(`sample count must be non-negative: ${count}`);
  }
  if (count >= config.goodSample) return ConfidenceLevel.GOOD;
  if (count >= config.minimumSample) return ConfidenceLevel.MEDIUM;
  return ConfidenceLevel.LOW;
}

export const RadarCalculator = {
  /**
   * Calculates Opportunity Radar result.
   *
   * @param properties full list of properties.
   * @param filter active StatisticsFilter.
   * @param config RadarConfig parameters.
   * @param now current epoch millisecond timestamp, must be > 0.
   * @return RadarOpportunityResult representing calculation outcome.
   */
  calculate(
    properties: Property[],
    filter: StatisticsFilter,
    config: RadarConfig = new RadarConfig(),
    now: number = Date.now()
  ): RadarOpportunityResult {
    if (now <= 0) {
      throw new Error(`now must be strictly positive: ${now}`);
    }

    // Fail-closed on ownerId non-blank
    if (filter.ownerId != null && filter.ownerId.trim().length > 0) {
      return RadarOpportunityResults.InvalidFilter(
        "filter.ownerId must be blank for Radar"
      );
    }

    // Radar target inventory requires active market status
    if (filter.status != null && !PropertyStatusConstants.isActiveMarket(filter.status)) {
      return RadarOpportunityResults.InvalidFilter(
        `Unsupported status filter: ${filter.status}. Radar only supports active market or unrestricted status.`
      );
    }

    const pNow = getLocalDateParts(now, STATS_ZONE_ID);
    const nowDateUtc = Date.UTC(pNow.year, pNow.month - 1, pNow.day);

    // 1. Base population filtering: non-deleted, non-draft, non-blank non-sentinel area & type
    const isBaseValid = (p: Property): boolean => {
      if (p.isDeleted || p.isDraft) return false;
      const aKey = toCanonicalAreaKey(p.area);
      const tKey = toCanonicalPropertyTypeKey(p.propertyType);
      return (
        aKey.length > 0 &&
        !SENTINEL_KEYS.has(aKey) &&
        tKey.length > 0 &&
        !SENTINEL_KEYS.has(tKey)
      );
    };

    const basePopulation = properties.filter(isBaseValid);

    // 2. Bước 1: Target inventory population (isActiveMarket, matches non-date filter)
    const targetInventory = basePopulation.filter((p) => {
      return (
        PropertyStatusConstants.isActiveMarket(p.status) &&
        filter.matches(p, now, true, true, false)
      );
    });

    if (targetInventory.length === 0) {
      return RadarOpportunityResults.EmptyInventory;
    }

    // Group target properties by (areaKey, propertyTypeKey)
    const targetSegmentsMap = new Map<string, Property[]>();
    for (const prop of targetInventory) {
      const aKey = toCanonicalAreaKey(prop.area);
      const tKey = toCanonicalPropertyTypeKey(prop.propertyType);
      const keyStr = `${aKey}|||${tKey}`;
      const list = targetSegmentsMap.get(keyStr) ?? [];
      list.push(prop);
      targetSegmentsMap.set(keyStr, list);
    }

    // Filter for liquidity calculation (removes status restriction so SOLD properties match)
    const liquidityFilter = new StatisticsFilter({
      dateRange: filter.dateRange,
      area: filter.area,
      propertyType: filter.propertyType,
      status: null,
      verifiedMode: filter.verifiedMode,
      priceMin: filter.priceMin,
      priceMax: filter.priceMax,
      areaSizeMin: filter.areaSizeMin,
      areaSizeMax: filter.areaSizeMax,
      ownerId: filter.ownerId
    });

    // Filter for benchmark price pool (removes area restriction so comparator areas match)
    const benchmarkFilter = new StatisticsFilter({
      dateRange: filter.dateRange,
      area: null,
      propertyType: filter.propertyType,
      status: filter.status,
      verifiedMode: filter.verifiedMode,
      priceMin: filter.priceMin,
      priceMax: filter.priceMax,
      areaSizeMin: filter.areaSizeMin,
      areaSizeMax: filter.areaSizeMax,
      ownerId: filter.ownerId
    });

    // 3. Evaluate each target segment
    const summaries: RadarAreaSummary[] = [];

    for (const [keyStr, segProps] of targetSegmentsMap.entries()) {
      const [areaKey, propertyTypeKey] = keyStr.split("|||");
      const key: RadarSegmentKey = { areaKey, propertyTypeKey };

      const areaDisplayName = toTitleCase(key.areaKey);
      const propertyTypeDisplayName = toTitleCase(normalizePropertyType(key.propertyTypeKey));

      // Bước 2: Target price and benchmark
      const targetValidPriceProps = segProps.filter((p) =>
        PriceUtils.isValidPriceAndArea(p.price, p.areaSize)
      );
      const targetPriceSampleCount = targetValidPriceProps.length;
      const targetMedianPricePerM2 =
        targetPriceSampleCount === 0
          ? null
          : MedianUtils.calculateMedian(
              targetValidPriceProps.map((p) => p.price / p.areaSize!)
            );

      // Benchmark pool: same property type, DIFFERENT area, isActiveMarket, valid price, matches benchmarkFilter (no date window)
      const comparatorProps = basePopulation.filter((p) => {
        return (
          toCanonicalPropertyTypeKey(p.propertyType) === key.propertyTypeKey &&
          toCanonicalAreaKey(p.area) !== key.areaKey &&
          PropertyStatusConstants.isActiveMarket(p.status) &&
          PriceUtils.isValidPriceAndArea(p.price, p.areaSize) &&
          benchmarkFilter.matches(p, now, true, true, false)
        );
      });

      // Group comparator properties by comparator area
      const comparatorPropsByArea = new Map<string, Property[]>();
      for (const p of comparatorProps) {
        const cAreaKey = toCanonicalAreaKey(p.area);
        const list = comparatorPropsByArea.get(cAreaKey) ?? [];
        list.push(p);
        comparatorPropsByArea.set(cAreaKey, list);
      }

      // Qualifying comparator areas must have at least minimumSample valid price samples
      const qualifyingComparatorProps: Property[] = [];
      let comparatorAreaCount = 0;
      for (const list of comparatorPropsByArea.values()) {
        if (list.length >= config.minimumSample) {
          comparatorAreaCount++;
          qualifyingComparatorProps.push(...list);
        }
      }

      const benchmarkPriceSampleCount = qualifyingComparatorProps.length;
      const benchmarkMedianPricePerM2 =
        qualifyingComparatorProps.length === 0
          ? null
          : MedianUtils.calculateMedian(
              qualifyingComparatorProps.map((p) => p.price / p.areaSize!)
            );

      const priceDeviationPercent =
        targetMedianPricePerM2 != null &&
        Number.isFinite(targetMedianPricePerM2) &&
        benchmarkMedianPricePerM2 != null &&
        Number.isFinite(benchmarkMedianPricePerM2) &&
        benchmarkMedianPricePerM2 > 0.0
          ? ((targetMedianPricePerM2 - benchmarkMedianPricePerM2) / benchmarkMedianPricePerM2) * 100.0
          : null;

      // Bước 3: Liquidity in date window for this (areaKey, propertyTypeKey)
      const segmentCandidatesForLiquidity = basePopulation.filter((p) => {
        if (
          toCanonicalAreaKey(p.area) !== key.areaKey ||
          toCanonicalPropertyTypeKey(p.propertyType) !== key.propertyTypeKey
        ) {
          return false;
        }
        if (!liquidityFilter.matches(p, now, true, true, true)) {
          return false;
        }
        if (filter.dateRange.type === "ALL_TIME") {
          if (p.createdAt <= 0) return false;
          const pCreated = getLocalDateParts(p.createdAt, STATS_ZONE_ID);
          const createdDateUtc = Date.UTC(pCreated.year, pCreated.month - 1, pCreated.day);
          if (createdDateUtc > nowDateUtc) return false;
        }
        return true;
      });

      let forSaleCreatedInWindow = 0;
      let soldCreatedInWindow = 0;
      for (const p of segmentCandidatesForLiquidity) {
        if (PropertyStatusConstants.isActiveMarket(p.status)) {
          forSaleCreatedInWindow++;
        } else if (PropertyStatusConstants.isSold(p.status)) {
          soldCreatedInWindow++;
        }
      }

      const newInWindow = forSaleCreatedInWindow;
      const liquidityDenominator = forSaleCreatedInWindow + soldCreatedInWindow;
      const soldRatioProxy =
        liquidityDenominator === 0 ? null : soldCreatedInWindow / liquidityDenominator;

      // Bước 4: Aging & active count
      const activeCount = segProps.length;
      const validAgeDays: number[] = [];
      for (const p of segProps) {
        if (p.createdAt > 0) {
          const pCreated = getLocalDateParts(p.createdAt, STATS_ZONE_ID);
          const createdDateUtc = Date.UTC(pCreated.year, pCreated.month - 1, pCreated.day);
          if (createdDateUtc <= nowDateUtc) {
            validAgeDays.push(Math.round((nowDateUtc - createdDateUtc) / 86_400_000));
          }
        }
      }

      const activeAgeSampleCount = validAgeDays.length;
      const medianAgeDays = validAgeDays.length === 0 ? null : MedianUtils.calculateMedian(validAgeDays);

      // Bước 5: Confidence & eligibility
      const confPriceTarget = sampleCountToConfigConfidence(targetPriceSampleCount, config);
      const confPriceBenchmark = sampleCountToConfigConfidence(benchmarkPriceSampleCount, config);
      const confidencePrice = minConfidence(confPriceTarget, confPriceBenchmark);
      const confidenceLiquidity = sampleCountToConfigConfidence(liquidityDenominator, config);
      const confidenceAge = sampleCountToConfigConfidence(activeAgeSampleCount, config);
      const overallConfidence = minConfidence(confidencePrice, confidenceLiquidity, confidenceAge);

      const structuralGatePassed = comparatorAreaCount >= config.minimumComparatorAreas;
      const priceSamplesGatePassed =
        targetPriceSampleCount >= config.minimumSample &&
        benchmarkPriceSampleCount >= config.minimumSample;
      const confidenceGatesPassed =
        confidencePrice.name !== "LOW" &&
        confidenceLiquidity.name !== "LOW" &&
        confidenceAge.name !== "LOW";
      const valuesFinite =
        targetMedianPricePerM2 != null &&
        Number.isFinite(targetMedianPricePerM2) &&
        benchmarkMedianPricePerM2 != null &&
        Number.isFinite(benchmarkMedianPricePerM2) &&
        priceDeviationPercent != null &&
        Number.isFinite(priceDeviationPercent) &&
        soldRatioProxy != null &&
        Number.isFinite(soldRatioProxy) &&
        medianAgeDays != null &&
        Number.isFinite(medianAgeDays);

      const eligible =
        structuralGatePassed && priceSamplesGatePassed && confidenceGatesPassed && valuesFinite;

      // Bước 6: Opportunity score
      let scoreBreakdown: RadarScoreBreakdown | null = null;
      let opportunityScore: number | null = null;

      if (eligible) {
        const priceScore = Math.min(
          100.0,
          Math.max(0.0, 50.0 - priceDeviationPercent! * 2.0)
        );
        const liquidityScore = Math.min(
          100.0,
          Math.max(0.0, soldRatioProxy! * 100.0)
        );
        const ageScore = Math.min(
          100.0,
          Math.max(0.0, 100.0 - medianAgeDays! / 1.5)
        );
        let supplyScore: number;
        if (activeCount < 5) {
          supplyScore = activeCount * 15.0;
        } else if (activeCount <= 25) {
          supplyScore = 100.0;
        } else {
          supplyScore = Math.min(100.0, Math.max(30.0, 100.0 - (activeCount - 25) * 2.0));
        }
        let confidenceScore: number;
        if (overallConfidence.name === "GOOD") {
          confidenceScore = 100.0;
        } else if (overallConfidence.name === "MEDIUM") {
          confidenceScore = 60.0;
        } else {
          confidenceScore = 0.0;
        }

        scoreBreakdown = {
          priceScore,
          liquidityScore,
          ageScore,
          supplyScore,
          confidenceScore
        };

        const rawScore =
          priceScore * config.priceWeight +
          liquidityScore * config.liquidityWeight +
          ageScore * config.ageWeight +
          supplyScore * config.supplyWeight +
          confidenceScore * config.confidenceWeight;
        opportunityScore = Math.min(100.0, Math.max(0.0, rawScore));
      }

      summaries.push({
        key,
        areaDisplayName,
        propertyTypeDisplayName,
        activeCount,
        newInWindow,
        targetPriceSampleCount,
        targetMedianPricePerM2,
        comparatorAreaCount,
        benchmarkPriceSampleCount,
        benchmarkMedianPricePerM2,
        priceDeviationPercent,
        forSaleCreatedInWindow,
        soldCreatedInWindow,
        liquidityDenominator,
        soldRatioProxy,
        activeAgeSampleCount,
        medianAgeDays,
        confidencePrice,
        confidenceLiquidity,
        confidenceAge,
        overallConfidence,
        eligible,
        scoreBreakdown,
        opportunityScore,
        quadrant: OpportunityQuadrant.INSUFFICIENT_DATA // temporary
      });
    }

    // Check if any segment meets the structural benchmark gate
    const hasAnyStructuralBenchmark = summaries.some(
      (it) => it.comparatorAreaCount >= config.minimumComparatorAreas
    );
    if (!hasAnyStructuralBenchmark) {
      return RadarOpportunityResults.InsufficientBenchmark;
    }

    // Bước 7: Liquidity P50 & Quadrant Assignment
    const eligibleSummaries = summaries.filter((it) => it.eligible);
    const eligibleRatios = eligibleSummaries.map((it) => it.soldRatioProxy!);

    let liquidityP50: number | null = null;
    let liquidityIndeterminate = false;

    if (eligibleRatios.length === 0) {
      liquidityP50 = null;
      liquidityIndeterminate = false;
    } else {
      liquidityP50 = MedianUtils.calculateMedian(eligibleRatios);
      const firstRatio = eligibleRatios[0];
      liquidityIndeterminate = eligibleRatios.every((it) => Math.abs(it - firstRatio) <= 1e-9);
    }

    const finalizedSummaries: RadarAreaSummary[] = summaries.map((summary) => {
      if (!summary.eligible) {
        return { ...summary, quadrant: OpportunityQuadrant.INSUFFICIENT_DATA };
      }
      if (liquidityIndeterminate) {
        return { ...summary, quadrant: OpportunityQuadrant.INDETERMINATE_LIQUIDITY };
      }
      const isHighLiquidity = summary.soldRatioProxy! >= liquidityP50!;
      const dev = summary.priceDeviationPercent!;
      const isLowPrice = dev <= config.lowPriceThresholdPercent;
      const isHighPrice = dev >= config.highPriceThresholdPercent;

      let quadrant: OpportunityQuadrant;
      if (!isLowPrice && !isHighPrice) {
        quadrant = OpportunityQuadrant.FAIR_MARKET;
      } else if (isLowPrice && isHighLiquidity) {
        quadrant = OpportunityQuadrant.GOLDEN_OPPORTUNITY;
      } else if (isLowPrice && !isHighLiquidity) {
        quadrant = OpportunityQuadrant.CHEAP_BUT_SLOW;
      } else if (isHighPrice && isHighLiquidity) {
        quadrant = OpportunityQuadrant.HOT_MARKET;
      } else {
        quadrant = OpportunityQuadrant.HOLDING_RISK;
      }
      return { ...summary, quadrant };
    });

    // Bước 8: Sorting and result-level state
    finalizedSummaries.sort((a, b) => {
      if (a.eligible !== b.eligible) {
        return a.eligible ? -1 : 1;
      }
      const aScore = a.opportunityScore ?? -Infinity;
      const bScore = b.opportunityScore ?? -Infinity;
      if (aScore !== bScore) {
        return bScore - aScore;
      }
      const areaCmp = a.areaDisplayName.localeCompare(b.areaDisplayName);
      if (areaCmp !== 0) return areaCmp;
      const typeCmp = a.propertyTypeDisplayName.localeCompare(b.propertyTypeDisplayName);
      if (typeCmp !== 0) return typeCmp;
      const keyAreaCmp = a.key.areaKey.localeCompare(b.key.areaKey);
      if (keyAreaCmp !== 0) return keyAreaCmp;
      return a.key.propertyTypeKey.localeCompare(b.key.propertyTypeKey);
    });

    const sortedEligible = finalizedSummaries.filter((it) => it.eligible);
    const topOpportunities = sortedEligible.slice(0, 3);

    return RadarOpportunityResults.Success(
      finalizedSummaries,
      sortedEligible,
      topOpportunities,
      liquidityP50,
      liquidityIndeterminate
    );
  }
};
