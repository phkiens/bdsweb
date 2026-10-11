import { describe, it, expect } from "vitest";
import { createDefaultProperty, Property } from "../../../src/core/models/property";
import {
  PropertyStatusConstants,
  StatisticsFilter
} from "../../../src/core/statistics/statistics-filter";
import { IssueType } from "../../../src/core/statistics/issue-type";
import { StatisticsModel } from "../../../src/core/statistics/statistics-model";

describe("StatisticsViewModelTest", () => {
  const fixedInstant = 1_700_000_000_000; // Fixed timestamp

  function createProperty(params: {
    id: string;
    area?: string;
    propertyType?: string;
    status?: string;
    price?: number;
    areaSize?: number | null;
    isVerified?: boolean;
    isDraft?: boolean;
    isDeleted?: boolean;
    createdAt?: number;
    updatedAt?: number;
  }): Property {
    const createdAt = params.createdAt ?? fixedInstant - 10 * 86_400_000;
    const updatedAt = params.updatedAt ?? fixedInstant - 10 * 86_400_000;
    return createDefaultProperty({
      id: params.id,
      title: `BĐS ${params.id}`,
      price: params.price ?? 2.0,
      area: params.area ?? "Lê Chân",
      latitude: null,
      longitude: null,
      description: "",
      areaSize: params.areaSize !== undefined ? params.areaSize : 50.0,
      propertyType: params.propertyType ?? "Nhà ngõ",
      status: params.status ?? PropertyStatusConstants.FOR_SALE,
      isVerified: params.isVerified ?? true,
      isDraft: params.isDraft ?? false,
      isDeleted: params.isDeleted ?? false,
      createdAt,
      updatedAt
    });
  }

  it("testAllActivePropertiesFlow_preservesUnverifiedAndDraft", () => {
    const p1 = createProperty({ id: "p1", isVerified: true, isDraft: false });
    const p2 = createProperty({ id: "p2", isVerified: false, isDraft: false }); // unverified
    const p3 = createProperty({ id: "p3", isVerified: false, isDraft: true }); // draft

    const state = StatisticsModel.calculateSnapshot({
      allProperties: [p1, p2, p3],
      now: fixedInstant
    });

    expect(state.isLoading).toBe(false);
    expect(state.errorMessage).toBeNull();

    // preserves all 3 (including unverified & draft)
    expect(state.properties.length).toBe(3);
    // Inventory data counts active business properties (excludes drafts)
    expect(state.inventoryData?.totalInventory).toBe(2);
    expect(state.inventoryData?.draftExcludedCount).toBe(1);
  });

  it("testFailClosedWhenOwnerIdInGlobalFilter", () => {
    const p1 = createProperty({ id: "p1" });

    // Initial snapshot without ownerId
    const stateInit = StatisticsModel.calculateSnapshot({
      allProperties: [p1],
      now: fixedInstant
    });
    expect(stateInit.errorMessage).toBeNull();

    // Snapshot with non-blank ownerId in global filter
    const stateFailClosed = StatisticsModel.calculateSnapshot({
      allProperties: [p1],
      filter: new StatisticsFilter({ ownerId: "owner_xyz" }),
      now: fixedInstant
    });

    expect(stateFailClosed.errorMessage).not.toBeNull();
    expect(
      stateFailClosed.errorMessage!.includes(
        "Bộ lọc thống kê toàn cục không hỗ trợ tiêu chí chủ nhà"
      )
    ).toBe(true);
  });

  it("testPreAggregatedOwnerMapUsedForDataQuality", () => {
    const p1 = createProperty({ id: "p1" });
    const p2 = createProperty({ id: "p2" });

    const state = StatisticsModel.calculateSnapshot({
      allProperties: [p1, p2],
      propertiesWithOwner: [
        {
          property: p1,
          ownerId: "c1",
          ownerName: "Chủ nhà 1",
          ownerCount: 1
        },
        {
          property: p2,
          ownerId: null,
          ownerName: null,
          ownerCount: 0
        }
      ],
      now: fixedInstant
    });

    expect(state.errorMessage).toBeNull();
    // p2 has no owner => should show up in MISSING_OWNER issue
    const noOwnerIssue = state.dataQualitySummary?.issues.find(
      (it) => it.issueType.name === IssueType.MISSING_OWNER.name
    );
    expect(noOwnerIssue).toBeDefined();
    expect(noOwnerIssue?.propertyId).toBe("p2");
  });

  it("testEmptyDatabaseProducesEmptyCalculations", () => {
    const state = StatisticsModel.calculateSnapshot({
      allProperties: [],
      now: fixedInstant
    });
    expect(state.inventoryData?.totalInventory ?? 0).toBe(0);
  });

  it("testDefaultSelectedTabIndexIsZero", () => {
    const defaultState = StatisticsModel.createDefaultUiState();
    expect(defaultState.selectedTabIndex).toBe(0);

    const snapshot = StatisticsModel.calculateSnapshot({
      allProperties: [],
      now: fixedInstant
    });
    expect(snapshot.selectedTabIndex).toBe(0);
  });

  it("testSelectTab_coercesToValidRangeZeroToTwo", () => {
    // Valid indices 0, 1
    const state0 = StatisticsModel.calculateSnapshot({
      allProperties: [],
      selectedTabIndex: 0,
      now: fixedInstant
    });
    expect(state0.selectedTabIndex).toBe(0);

    const state1 = StatisticsModel.calculateSnapshot({
      allProperties: [],
      selectedTabIndex: 1,
      now: fixedInstant
    });
    expect(state1.selectedTabIndex).toBe(1);

    // Map tab (index 2) coerced to 1 in web snapshot logic
    const state2 = StatisticsModel.calculateSnapshot({
      allProperties: [],
      selectedTabIndex: 2,
      now: fixedInstant
    });
    expect(state2.selectedTabIndex).toBe(1);

    // Out-of-range index 3 coerced to 1
    const state3 = StatisticsModel.calculateSnapshot({
      allProperties: [],
      selectedTabIndex: 3,
      now: fixedInstant
    });
    expect(state3.selectedTabIndex).toBe(1);

    // Negative index coerced to 0
    const stateNeg = StatisticsModel.calculateSnapshot({
      allProperties: [],
      selectedTabIndex: -1,
      now: fixedInstant
    });
    expect(stateNeg.selectedTabIndex).toBe(0);
  });

  it("testMarketPropertiesCalculated_inSnapshot", () => {
    // Need at least 3 areas with >= 5 properties for Radar to have >= 2 comparator areas
    const props: Property[] = [];
    for (let i = 1; i <= 5; i++) {
      props.push(createProperty({ id: `lc_${i}`, area: "Lê Chân", propertyType: "Nhà ngõ", price: 2.0, areaSize: 50.0 }));
      props.push(createProperty({ id: `nq_${i}`, area: "Ngô Quyền", propertyType: "Nhà ngõ", price: 3.0, areaSize: 50.0 }));
      props.push(createProperty({ id: `ha_${i}`, area: "Hải An", propertyType: "Nhà ngõ", price: 4.0, areaSize: 50.0 }));
    }

    const state = StatisticsModel.calculateSnapshot({
      allProperties: props,
      now: fixedInstant
    });

    expect(state.errorMessage).toBeNull();
    expect(state.isLoading).toBe(false);
    expect(state.marketProperties).toBeDefined();
    expect(state.marketProperties.length).toBe(15);
  });
});
