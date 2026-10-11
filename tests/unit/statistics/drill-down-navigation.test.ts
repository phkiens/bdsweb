import { describe, it, expect } from "vitest";
import { PropertyStatus } from "../../../src/core/models/enums";
import {
  createDrillDownUrl,
  decodeDrillDownQuery,
  DrillDownFilter,
  DrillDownJsonCodec,
  DrillDownQueryCodec,
  DrillDownSource,
  encodeDrillDownQuery
} from "../../../src/core/statistics/drill-down-filter";
import { IssueType } from "../../../src/core/statistics/issue-type";
import { VerifiedMode } from "../../../src/core/statistics/statistics-filter";

describe("DrillDownNavigationTest", () => {
  it("testJsonSerializationRoundTrip_allFields", () => {
    const original = new DrillDownFilter({
      source: DrillDownSource.AGING_BUCKET,
      contextLabel: "Quá hạn > 90 ngày",
      verifiedMode: VerifiedMode.VERIFIED_ONLY,
      excludeDraft: true,
      targetStatus: PropertyStatus.FOR_SALE,
      targetArea: "Lê Chân",
      targetPropertyType: "Nhà ngõ",
      targetOwnerId: "owner_123",
      minAgeDays: 90,
      maxAgeDays: 365,
      createdAtFrom: 1700000000000,
      createdAtTo: 1710000000000,
      lastEditedAtBefore: 1705000000000,
      targetIssueType: IssueType.MISSING_PRICE,
      deviationMin: -25.0,
      deviationMax: -10.0
    });

    const jsonString = DrillDownJsonCodec.encodeJson(original);
    const decoded = DrillDownJsonCodec.decodeJson(jsonString);

    expect(decoded).toEqual(original);
  });

  it("testJsonSerializationRoundTrip_minimalFields", () => {
    const original = new DrillDownFilter({
      source: DrillDownSource.ACTION_CENTER,
      contextLabel: "Tất cả BĐS cần xử lý"
    });

    const jsonString = DrillDownJsonCodec.encodeJson(original);
    const decoded = DrillDownJsonCodec.decodeJson(jsonString);

    expect(decoded).toEqual(original);
  });

  it("testSpecialCharactersRoundTrip_urlEncodeAndDecode", () => {
    const original = new DrillDownFilter({
      source: DrillDownSource.DEAL_FINDER,
      contextLabel: "Lọc: 50% & Đường 1/2",
      targetArea: "Đống Đa & Cầu Giấy",
      targetPropertyType: "Đường 1/2 & Hẻm 3/4",
      targetStatus: PropertyStatus.FOR_SALE
    });

    const serialized = DrillDownJsonCodec.encodeJson(original);
    const urlEncoded = encodeURIComponent(serialized);
    const urlDecoded = decodeURIComponent(urlEncoded);
    const deserialized = DrillDownJsonCodec.decodeJson(urlDecoded);

    expect(deserialized).toEqual(original);
    expect(deserialized?.targetArea).toBe("Đống Đa & Cầu Giấy");
    expect(deserialized?.targetPropertyType).toBe("Đường 1/2 & Hẻm 3/4");
    expect(deserialized?.targetStatus).toBe(PropertyStatus.FOR_SALE);
    expect(deserialized?.contextLabel).toBe("Lọc: 50% & Đường 1/2");
  });

  it("testVietnameseDiacriticsRoundTrip", () => {
    const original = new DrillDownFilter({
      source: DrillDownSource.OWNER_PERFORMANCE,
      contextLabel: "Chủ nhà: Nguyễn Văn A - Biệt thự nghỉ dưỡng & Liền kề",
      targetArea: "Quận Ngô Quyền, Phường Lạch Tray",
      targetPropertyType: "Biệt thự nghỉ dưỡng & Liền kề",
      targetStatus: PropertyStatus.FOR_SALE
    });

    const serialized = DrillDownJsonCodec.encodeJson(original);
    const deserialized = DrillDownJsonCodec.decodeJson(serialized);

    expect(deserialized).toEqual(original);
  });

  it("testProcessRecreationSimulation_viaSavedStateHandle", () => {
    const original = new DrillDownFilter({
      source: DrillDownSource.DEAL_FINDER,
      contextLabel: "BĐS giá tốt: 50% & Đường 1/2",
      targetArea: "Đống Đa & Cầu Giấy",
      targetPropertyType: "Mặt phố"
    });

    const jsonPayload = DrillDownJsonCodec.encodeJson(original);

    // In web, simulated navigation argument via URLSearchParams or location search
    const searchParams = new URLSearchParams({ drilldown: jsonPayload });
    const retrievedPayload = searchParams.get("drilldown");
    expect(retrievedPayload).not.toBeNull();

    const restoredFilter = DrillDownJsonCodec.decodeJson(retrievedPayload);
    expect(restoredFilter).toEqual(original);
  });

  it("testNavigationArgument_specialCharacters_noDoubleDecodeCorruption", () => {
    // Test that special characters like %, +, &, / in filter are safely preserved
    const original = new DrillDownFilter({
      source: DrillDownSource.DEAL_FINDER,
      contextLabel: "Lọc 50% & Phân khúc A+B",
      targetArea: "Ngô Quyền & Hải An",
      targetPropertyType: "Đường 1/2"
    });
    const jsonPayload = DrillDownJsonCodec.encodeJson(original);

    // Simulate Web router URL: route navigated with encoded drilldown param
    const routeUrl = `/properties?drilldown=${encodeURIComponent(jsonPayload)}`;
    const queryString = routeUrl.substring(routeUrl.indexOf("?"));
    const searchParams = new URLSearchParams(queryString);
    const simulatedNavArg = searchParams.get("drilldown");

    // Destination receives simulatedNavArg directly WITHOUT extra decodeURIComponent
    const restored = DrillDownJsonCodec.decodeJson(simulatedNavArg);
    expect(restored).not.toBeNull();
    expect(restored?.contextLabel).toBe("Lọc 50% & Phân khúc A+B");
    expect(restored?.targetArea).toBe("Ngô Quyền & Hải An");
    expect(restored?.targetPropertyType).toBe("Đường 1/2");

    // If extra decodeURIComponent WERE mistakenly performed (the bug):
    // Passing simulatedNavArg to decodeURIComponent might corrupt or alter '+' in some decoders
    const decodedViaQueryHelper = decodeDrillDownQuery(queryString);
    expect(decodedViaQueryHelper).toEqual(original);
  });

  it("testMalformedJsonHandling_returnsNull", () => {
    const invalidJson = "{ invalid_json: true ";
    const result = DrillDownJsonCodec.decodeJson(invalidJson);
    expect(result).toBeNull();
  });

  it("testDrillDownQueryCodec_roundTripAndUrlBuilding", () => {
    const original = new DrillDownFilter({
      source: DrillDownSource.INVENTORY,
      contextLabel: "BĐS đang bán · 30 ngày",
      targetStatus: PropertyStatus.FOR_SALE,
      targetArea: "Hải An"
    });

    const queryString = encodeDrillDownQuery(original);
    expect(queryString.startsWith("drilldown=")).toBe(true);

    const decodedFromQuery = decodeDrillDownQuery(queryString);
    expect(decodedFromQuery).toEqual(original);

    const fullUrl = createDrillDownUrl("/kho", original);
    expect(fullUrl.startsWith("/kho?drilldown=")).toBe(true);

    const decodedFromUrl = decodeDrillDownQuery(fullUrl.substring(fullUrl.indexOf("?")));
    expect(decodedFromUrl).toEqual(original);

    // Also via DrillDownQueryCodec namespace
    expect(DrillDownQueryCodec.decodeQuery(queryString)).toEqual(original);
  });
});
