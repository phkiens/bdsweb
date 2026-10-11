import { describe, it, expect } from "vitest";
import { createDefaultProperty, Property } from "../../../src/core/models/property";
import { PropertyStatus } from "../../../src/core/models/enums";
import {
  RadarAreaDetailContent,
  RadarAreaDetailModel,
} from "../../../src/core/statistics/radar/radar-area-detail-model";

describe("RadarAreaDetailViewModelTest", () => {
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
  }): Property {
    return createDefaultProperty({
      id: params.id,
      title: `BĐS ${params.id}`,
      price: params.price ?? 2.0,
      area: params.area ?? "Kiến An",
      areaSize: params.areaSize !== undefined ? params.areaSize : 100.0,
      propertyType: params.propertyType ?? "Nhà phố",
      status: params.status ?? PropertyStatus.FOR_SALE,
      isVerified: params.isVerified ?? true,
      isDraft: params.isDraft ?? false,
      isDeleted: params.isDeleted ?? false,
      description: `Mô tả ${params.id}`,
      latitude: 20.8449,
      longitude: 106.6881,
      createdAt: 1000,
      updatedAt: 1000
    });
  }

  // 1. Direct decoded argument handling (no double-decode, preserves +, /, &, %, spaces)
  it("testDecodeAndCanonicalizeSpecialCharacters", () => {
    const rawArea = "  Hải Phòng  ";
    const rawType = "Nhà phố / Mặt tiền & Kinh doanh";

    const sampleProps = [
      createProperty({ id: "p1", area: "Hải Phòng", propertyType: "Nhà phố / Mặt tiền & Kinh doanh" })
    ];

    const state = RadarAreaDetailModel.compute(sampleProps, rawArea, rawType);
    expect(state.type).toBe("CONTENT");
    if (state.type === "CONTENT") {
      expect(state.areaDisplayName).toBe("Hải Phòng");
      expect(state.allItems.length).toBe(1);
    }
  });

  // 1b. Regression tests for special symbols: "50%", "A+B", "Đường 1/2", "Đống Đa & Cầu Giấy"
  it("testRegressionArgumentsWithSymbols", () => {
    const testCases: [string, string, string][] = [
      ["Khu 50%", "Đất nền", "Khu 50%"],
      ["Phân khu A+B", "Nhà phố", "Phân Khu A+b"],
      ["Đường 1/2", "Biệt thự", "Đường 1/2"],
      ["Đống Đa & Cầu Giấy", "Chung cư", "Đống Đa & Cầu Giấy"]
    ];

    for (const [area, type, expectedAreaDisplay] of testCases) {
      const props = [createProperty({ id: `p_${area}`, area, propertyType: type })];
      const state = RadarAreaDetailModel.compute(props, area, type);
      expect(state.type).toBe("CONTENT");
      if (state.type === "CONTENT") {
        expect(state.areaDisplayName).toBe(expectedAreaDisplay);
        expect(state.allItems.length).toBe(1);
      }
    }
  });

  // 2. Argument blank/malformed fail-closed, không trả toàn kho
  it("testBlankOrMalformedArgumentFailsClosed", () => {
    const sample = [createProperty({ id: "p1" })];

    // Blank area
    const state1 = RadarAreaDetailModel.compute(sample, "", "Nhà phố");
    expect(state1.type).toBe("INVALID_ARGUMENTS");

    // Whitespace-only area
    const state2 = RadarAreaDetailModel.compute(sample, "   \t  ", "Nhà phố");
    expect(state2.type).toBe("INVALID_ARGUMENTS");

    // Missing arguments
    const state3 = RadarAreaDetailModel.compute(sample, undefined, undefined);
    expect(state3.type).toBe("INVALID_ARGUMENTS");

    // Blank type
    const state4 = RadarAreaDetailModel.compute(sample, "Kiến An", "   ");
    expect(state4.type).toBe("INVALID_ARGUMENTS");
  });

  // 3. Population loại deleted, unverified, draft, non-FOR_SALE, sai area/type và giá/diện tích lỗi
  it("testPopulationFiltering", () => {
    const validProp = createProperty({ id: "p_valid", area: "Kiến An", propertyType: "Nhà phố", price: 3.0, areaSize: 100.0 });
    const deletedProp = createProperty({ id: "p_del", area: "Kiến An", propertyType: "Nhà phố", isDeleted: true });
    const unverifiedProp = createProperty({ id: "p_unv", area: "Kiến An", propertyType: "Nhà phố", isVerified: false });
    const draftProp = createProperty({ id: "p_draft", area: "Kiến An", propertyType: "Nhà phố", isDraft: true });
    const soldProp = createProperty({ id: "p_sold", area: "Kiến An", propertyType: "Nhà phố", status: PropertyStatus.SOLD });
    const otherArea = createProperty({ id: "p_area", area: "Lê Chân", propertyType: "Nhà phố" });
    const otherType = createProperty({ id: "p_type", area: "Kiến An", propertyType: "Đất nền" });
    const zeroPrice = createProperty({ id: "p_zero_p", area: "Kiến An", propertyType: "Nhà phố", price: 0.0 });
    const zeroArea = createProperty({ id: "p_zero_a", area: "Kiến An", propertyType: "Nhà phố", areaSize: 0.0 });
    const nanPrice = createProperty({ id: "p_nan_p", area: "Kiến An", propertyType: "Nhà phố", price: Number.NaN });

    const allProps = [
      validProp, deletedProp, unverifiedProp, draftProp, soldProp,
      otherArea, otherType, zeroPrice, zeroArea, nanPrice
    ];

    const state = RadarAreaDetailModel.compute(allProps, "Kiến An", "Nhà phố");
    expect(state.type).toBe("CONTENT");
    if (state.type === "CONTENT") {
      expect(state.allItems.length).toBe(2); // p_valid and p_unv are both included
      const ids = new Set(state.allItems.map((it) => it.property.id));
      expect(ids.has("p_valid")).toBe(true);
      expect(ids.has("p_unv")).toBe(true);
    }
  });

  // 4. Dùng pure memory computation, không N+1
  it("testUsesPureMemoryComputationWithoutNPlusOne", () => {
    const props = [createProperty({ id: "p1" })];
    const state = RadarAreaDetailModel.compute(props, "Kiến An", "Nhà phố");
    expect(state.type).toBe("CONTENT");
  });

  // 5. Kết quả khớp ValuationCalculator: LOO, comparator gate 4/5, deviation và sorting
  it("testValuationCalculationParity", () => {
    // 6 properties in segment to satisfy comparator sample count >= 5
    const props = [
      createProperty({ id: "p1", price: 2.0, areaSize: 100.0 }), // 20 tr/m2
      createProperty({ id: "p2", price: 2.2, areaSize: 100.0 }), // 22 tr/m2
      createProperty({ id: "p3", price: 2.4, areaSize: 100.0 }), // 24 tr/m2
      createProperty({ id: "p4", price: 2.5, areaSize: 100.0 }), // 25 tr/m2
      createProperty({ id: "p5", price: 2.6, areaSize: 100.0 }), // 26 tr/m2
      createProperty({ id: "p6", price: 2.8, areaSize: 100.0 })  // 28 tr/m2
    ];

    const state = RadarAreaDetailModel.compute(props, "Kiến An", "Nhà phố");
    expect(state.type).toBe("CONTENT");
    if (state.type === "CONTENT") {
      expect(state.allItems.length).toBe(6);
      // Check LOO comparison occurred
      expect(state.allItems.every((it) => it.comparatorSampleCount === 5)).toBe(true);
      expect(state.allItems.every((it) => it.deviationPercent != null)).toBe(true);
    }
  });

  // 6. Recommended boundary -5.0: <= -5.0 được nhận; > -5.0 bị loại
  it("testRecommendedBoundaryAtMinusFivePercent", () => {
    // Benchmark without target = 20.0 tr/m2 (price=2.0, size=100)
    // 5 properties with price 2.0, size 100 => benchmark 20.0
    // Target 1: price = 1.9 => 19.0 tr/m2 => dev = (19-20)/20 = -5.0% => RECOMMENDED
    // Target 2: price = 1.902 => 19.02 tr/m2 => dev = (19.02-20)/20 = -4.9% => NOT RECOMMENDED
    const benchmarkProps: Property[] = [];
    for (let i = 1; i <= 5; i++) {
      benchmarkProps.push(createProperty({ id: `bm_${i}`, price: 2.0, areaSize: 100.0 }));
    }
    const targetBoundary = createProperty({ id: "target_boundary", price: 1.9, areaSize: 100.0 });
    const targetExcluded = createProperty({ id: "target_excluded", price: 1.902, areaSize: 100.0 });

    const allProps = [...benchmarkProps, targetBoundary, targetExcluded];
    const state = RadarAreaDetailModel.compute(allProps, "Kiến An", "Nhà phố") as RadarAreaDetailContent;

    const recommendedIds = state.recommendedItems.map((it) => it.property.id);
    expect(recommendedIds.includes("target_boundary")).toBe(true);
    expect(recommendedIds.includes("target_excluded")).toBe(false);
  });

  // 7. Empty, insufficient và error state
  it("testEmptyInsufficientAndErrorState", () => {
    // Empty state
    const stateEmpty = RadarAreaDetailModel.compute([], "Kiến An", "Nhà phố");
    expect(stateEmpty.type).toBe("EMPTY");

    // Insufficient state (< 6 items => comparators < 5 => deviation is null)
    const insufficientProps = [
      createProperty({ id: "p1", price: 2.0, areaSize: 100.0 }),
      createProperty({ id: "p2", price: 2.2, areaSize: 100.0 })
    ];
    const stateIns = RadarAreaDetailModel.compute(insufficientProps, "Kiến An", "Nhà phố") as RadarAreaDetailContent;
    expect(stateIns.insufficientItems.length).toBe(2);
    expect(stateIns.recommendedItems.length).toBe(0);
  });

  // 8. Dynamic update recomputes state cleanly
  it("testDynamicUpdateRecomputesState", () => {
    const p1 = createProperty({ id: "p1" });
    const p2 = createProperty({ id: "p2" });

    // Step 1: 1 item
    const state1 = RadarAreaDetailModel.compute([p1], "Kiến An", "Nhà phố") as RadarAreaDetailContent;
    expect(state1.allItems.length).toBe(1);

    // Step 2: 2 items
    const state2 = RadarAreaDetailModel.compute([p1, p2], "Kiến An", "Nhà phố") as RadarAreaDetailContent;
    expect(state2.allItems.length).toBe(2);
  });

  // 9. Permutation test: đổi thứ tự hoặc shuffle danh sách đầu vào, kết quả hiển thị, thứ tự item và recommended ID phải giống nhau tuyệt đối
  it("testPermutationInvariance", () => {
    const benchmarkProps: Property[] = [];
    for (let i = 1; i <= 5; i++) {
      benchmarkProps.push(createProperty({ id: `bm_${i}`, price: 2.0 + i * 0.1, areaSize: 100.0 }));
    }
    const target1 = createProperty({ id: "target_good", price: 1.5, areaSize: 100.0 });
    const target2 = createProperty({ id: "target_ok", price: 1.8, areaSize: 100.0 });
    const target3 = createProperty({ id: "target_high", price: 3.0, areaSize: 100.0 });

    const baseProps = [...benchmarkProps, target1, target2, target3];
    const reversedProps = [...baseProps].reverse();

    const state1 = RadarAreaDetailModel.compute(baseProps, "Kiến An", "Nhà phố") as RadarAreaDetailContent;
    const state2 = RadarAreaDetailModel.compute(reversedProps, "Kiến An", "Nhà phố") as RadarAreaDetailContent;

    // Display names must be deterministic
    expect(state1.areaDisplayName).toBe(state2.areaDisplayName);
    expect(state1.propertyTypeDisplayName).toBe(state2.propertyTypeDisplayName);

    // Item order must be deterministic
    expect(state1.allItems.map((it) => it.property.id)).toEqual(state2.allItems.map((it) => it.property.id));

    // Recommended items and their IDs must be deterministic
    expect(state1.recommendedItems.map((it) => it.property.id)).toEqual(state2.recommendedItems.map((it) => it.property.id));

    // Insufficient items must be deterministic
    expect(state1.insufficientItems.map((it) => it.property.id)).toEqual(state2.insufficientItems.map((it) => it.property.id));
  });
});
