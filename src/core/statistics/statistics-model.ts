import { Property } from "../models/property";
import { ActionCenterCalculator, ActionItem } from "./action-center-calculator";
import { DataQualityCalculator, DataQualitySummary } from "./data-quality-calculator";
import { DrillDownFilter, DrillDownSource } from "./drill-down-filter";
import { DrillDownFilterFactory } from "./drill-down-filter-factory";
import { InventoryCalculator, InventoryData } from "./inventory-calculator";
import { MarketNoteworthyProperty } from "./market-noteworthy-property";
import { MarketNoteworthyPropertyMapper } from "./market-noteworthy-property-mapper";
import {
  OwnerPerformanceCalculator,
  OwnerPerformanceResult,
  PropertyWithOwner
} from "./owner-performance-calculator";
import { PerformanceCalculator, PerformanceResult } from "./performance-calculator";
import { PriceMapCalculator, PriceMapResult } from "./price-map-calculator";
import { PriceTableCalculator, PriceTableResult } from "./price-table-calculator";
import { RadarCalculator } from "./radar/radar-calculator";
import { RadarOpportunityResult } from "./radar/radar-models";
import { StatisticsFilter } from "./statistics-filter";

export interface HeadlineKpiState {
  forSaleCount: number;
  forSaleFilter: DrillDownFilter | null;
  forSaleSubtitle: string;
  soldCount: number;
  soldFilter: DrillDownFilter | null;
  soldTitle: string;
  soldSubtitle: string;
}

export function createDefaultHeadlineKpiState(): HeadlineKpiState {
  return {
    forSaleCount: 0,
    forSaleFilter: null,
    forSaleSubtitle: "căn hiện có",
    soldCount: 0,
    soldFilter: null,
    soldTitle: "Đã bán",
    soldSubtitle: "tổng số tin đã bán"
  };
}

export interface StatisticsUiState {
  isLoading: boolean;
  selectedTabIndex: number;
  filter: StatisticsFilter;
  properties: Property[];
  propertiesWithOwner: PropertyWithOwner[];
  inventoryData: InventoryData | null;
  headlineKpiState: HeadlineKpiState;
  performanceResult: PerformanceResult | null;
  ownerPerformanceResult: OwnerPerformanceResult | null;
  priceTableResult: PriceTableResult | null;
  priceMapResult: PriceMapResult | null;
  marketProperties: MarketNoteworthyProperty[];
  dataQualitySummary: DataQualitySummary | null;
  actionItems: ActionItem[];
  radarOpportunityResult: RadarOpportunityResult | null;
  errorMessage: string | null;
  snapshotTimeMillis: number;
  unverifiedPendingCount: number;
  unverifiedPendingFilter: DrillDownFilter | null;
}

export type StatisticsV2UiState = StatisticsUiState;

export interface StatisticsPipelineInput {
  allProperties: Property[];
  propertiesWithOwner?: PropertyWithOwner[];
  filter?: StatisticsFilter;
  selectedTabIndex?: number;
  now?: number;
  fileChecker?: (path: string) => boolean;
}

export const StatisticsModel = {
  createDefaultUiState(): StatisticsUiState {
    return {
      isLoading: true,
      selectedTabIndex: 0,
      filter: new StatisticsFilter(),
      properties: [],
      propertiesWithOwner: [],
      inventoryData: null,
      headlineKpiState: createDefaultHeadlineKpiState(),
      performanceResult: null,
      ownerPerformanceResult: null,
      priceTableResult: null,
      priceMapResult: null,
      marketProperties: [],
      dataQualitySummary: null,
      actionItems: [],
      radarOpportunityResult: null,
      errorMessage: null,
      snapshotTimeMillis: 0,
      unverifiedPendingCount: 0,
      unverifiedPendingFilter: null
    };
  },

  /**
   * Pure calculation function corresponding to Android's StatisticsViewModel.calculateSnapshot.
   */
  calculateSnapshot(input: StatisticsPipelineInput): StatisticsUiState {
    const allProperties = input.allProperties;
    const propertiesWithOwner = input.propertiesWithOwner ?? [];
    const filter = input.filter ?? new StatisticsFilter();
    const selectedTabIndex = Math.min(1, Math.max(0, input.selectedTabIndex ?? 0));
    const now = input.now ?? Date.now();
    const fileChecker = input.fileChecker ?? (() => true);

    // Fail-closed check: ownerId is not supported as a global Statistics filter
    if (filter.ownerId != null && filter.ownerId.trim().length > 0) {
      return {
        isLoading: false,
        selectedTabIndex,
        filter,
        properties: allProperties,
        propertiesWithOwner,
        inventoryData: null,
        headlineKpiState: createDefaultHeadlineKpiState(),
        performanceResult: null,
        ownerPerformanceResult: null,
        priceTableResult: null,
        priceMapResult: null,
        marketProperties: [],
        dataQualitySummary: null,
        actionItems: [],
        radarOpportunityResult: null,
        errorMessage:
          "Bộ lọc thống kê toàn cục không hỗ trợ tiêu chí chủ nhà. Vui lòng bỏ chọn chủ nhà.",
        snapshotTimeMillis: now,
        unverifiedPendingCount: 0,
        unverifiedPendingFilter: null
      };
    }

    try {
      const ownerMap = new Map<string, PropertyWithOwner>();
      for (const rec of propertiesWithOwner) {
        ownerMap.set(rec.property.id, rec);
      }
      const ownerCountProvider = (propertyId: string): number => {
        return ownerMap.get(propertyId)?.ownerCount ?? 0;
      };

      // Filtered properties for calculators that don't receive filter directly
      const filteredProperties = allProperties.filter((prop) =>
        filter.matches(prop, now, true, true)
      );
      const filteredOwnerRecords = propertiesWithOwner.filter((record) =>
        filter.matches(record.property, now, true, true)
      );

      const inventoryData = InventoryCalculator.calculate(allProperties, {
        filter,
        now
      });

      const performanceResult = PerformanceCalculator.calculate(
        filteredProperties,
        filter,
        now
      );

      const ownerPerformanceResult = OwnerPerformanceCalculator.calculate(
        filteredOwnerRecords,
        now,
        filter
      );

      const priceTableResult = PriceTableCalculator.calculate(filteredProperties);

      const priceMapResult = PriceMapCalculator.calculate(
        filteredProperties,
        filter,
        priceTableResult,
        performanceResult,
        now
      );

      const radarOpportunityResult = RadarCalculator.calculate(
        allProperties,
        filter,
        undefined,
        now
      );

      const marketProperties = MarketNoteworthyPropertyMapper.map(
        filteredProperties,
        radarOpportunityResult,
        filter,
        now
      );

      const dataQualitySummary = DataQualityCalculator.calculate(
        allProperties,
        now,
        ownerCountProvider,
        fileChecker
      );

      const actionItems = ActionCenterCalculator.calculate(
        allProperties,
        now,
        ownerCountProvider,
        fileChecker,
        false,
        filter
      );

      const unverifiedPendingFilter = DrillDownFilterFactory.createUnverifiedFilter(
        filter,
        now,
        DrillDownSource.INVENTORY
      );
      const unverifiedPendingCount = DrillDownFilterFactory.countMatching(
        allProperties,
        unverifiedPendingFilter,
        now
      );

      const forSaleFilter = DrillDownFilterFactory.createForSaleKpiFilter(
        filter,
        now,
        DrillDownSource.INVENTORY
      );
      const forSaleCount = DrillDownFilterFactory.countMatching(
        allProperties,
        forSaleFilter,
        now
      );

      const soldFilter = DrillDownFilterFactory.createSoldKpiFilter(
        filter,
        now,
        DrillDownSource.INVENTORY
      );
      const soldCount = DrillDownFilterFactory.countMatching(
        allProperties,
        soldFilter,
        now
      );

      let soldTitle = "Đã bán";
      let soldSubtitle = "tổng số tin đã bán";
      switch (filter.dateRange.type) {
        case "ALL_TIME":
          soldTitle = "Đã bán";
          soldSubtitle = "tổng số tin đã bán";
          break;
        case "LAST_7_DAYS":
          soldTitle = "Đã bán · 7 ngày";
          soldSubtitle = "bán trong 7 ngày";
          break;
        case "LAST_30_DAYS":
          soldTitle = "Đã bán · 30 ngày";
          soldSubtitle = "bán trong 30 ngày";
          break;
        case "LAST_90_DAYS":
          soldTitle = "Đã bán · 90 ngày";
          soldSubtitle = "bán trong 90 ngày";
          break;
        case "CUSTOM":
          soldTitle = "Đã bán · trong kỳ";
          soldSubtitle = "bán trong kỳ";
          break;
      }

      const forSaleSubtitle =
        filter.dateRange.type === "ALL_TIME" ? "căn hiện có" : "căn tạo trong kỳ";

      const headlineKpiState: HeadlineKpiState = {
        forSaleCount,
        forSaleFilter,
        forSaleSubtitle,
        soldCount,
        soldFilter,
        soldTitle,
        soldSubtitle
      };

      return {
        isLoading: false,
        selectedTabIndex,
        filter,
        properties: allProperties,
        propertiesWithOwner,
        inventoryData,
        headlineKpiState,
        performanceResult,
        ownerPerformanceResult,
        priceTableResult,
        priceMapResult,
        marketProperties,
        dataQualitySummary,
        actionItems,
        radarOpportunityResult,
        errorMessage: null,
        snapshotTimeMillis: now,
        unverifiedPendingCount,
        unverifiedPendingFilter
      };
    } catch (e: any) {
      return {
        isLoading: false,
        selectedTabIndex,
        filter,
        properties: allProperties,
        propertiesWithOwner,
        inventoryData: null,
        headlineKpiState: createDefaultHeadlineKpiState(),
        performanceResult: null,
        ownerPerformanceResult: null,
        priceTableResult: null,
        priceMapResult: null,
        marketProperties: [],
        dataQualitySummary: null,
        actionItems: [],
        radarOpportunityResult: null,
        errorMessage: e?.message ?? "Đã xảy ra lỗi khi tổng hợp số liệu thống kê.",
        snapshotTimeMillis: now,
        unverifiedPendingCount: 0,
        unverifiedPendingFilter: null
      };
    }
  }
};
