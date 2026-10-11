import { describe, it, expect } from "vitest";
import { createDefaultProperty, Property } from "../../../src/core/models/property";
import { PropertyStatus } from "../../../src/core/models/enums";
import {
  DrillDownEvaluationContext,
  DrillDownFilter,
  DrillDownJsonCodec,
  DrillDownSource
} from "../../../src/core/statistics/drill-down-filter";
import { IssueType } from "../../../src/core/statistics/issue-type";
import {
  PropertyStatusConstants,
  VerifiedMode
} from "../../../src/core/statistics/statistics-filter";

describe("DrillDownFilterTest", () => {
  function dummyProperty(params?: {
    id?: string;
    isDraft?: boolean;
    isVerified?: boolean;
    isDeleted?: boolean;
    status?: string;
    area?: string;
    propertyType?: string;
    createdAt?: number;
    lastEditedAt?: number;
  }): Property {
    return createDefaultProperty({
      id: params?.id ?? "p-test",
      area: params?.area ?? "Hải An",
      latitude: 20.85,
      longitude: 106.68,
      areaSize: 60.0,
      price: 3.0,
      description: "Mô tả",
      status: params?.status ?? PropertyStatusConstants.FOR_SALE,
      propertyType: params?.propertyType ?? "Nhà phố",
      isDraft: params?.isDraft ?? false,
      isVerified: params?.isVerified ?? true,
      isDeleted: params?.isDeleted ?? false,
      createdAt: params?.createdAt ?? 100_000,
      lastEditedAt: params?.lastEditedAt ?? 100_000
    });
  }

  it("testJsonRoundTripWithVietnameseAndSpecialCharacters", () => {
    const filter = new DrillDownFilter({
      source: DrillDownSource.ACTION_CENTER,
      contextLabel: "Khu vực Hải An & Đồ Sơn 100% / Mặt tiền",
      verifiedMode: VerifiedMode.VERIFIED_ONLY,
      excludeDraft: true,
      targetStatus: PropertyStatus.FOR_SALE,
      targetArea: "Hải An",
      targetPropertyType: "Nhà phố",
      targetOwnerId: "cust-123",
      minAgeDays: 91,
      maxAgeDays: 180,
      createdAtFrom: 50_000,
      createdAtTo: 100_000,
      lastEditedAtBefore: 80_000,
      targetIssueType: IssueType.PRICE_OUTLIER,
      deviationMin: -15.0,
      deviationMax: 25.0,
      priceMin: 2.0,
      priceMax: 5.0,
      areaSizeMin: 40.0,
      areaSizeMax: 100.0
    });

    const json = DrillDownJsonCodec.encodeJson(filter);
    expect(json.includes("%20")).toBe(false);

    const decoded = DrillDownJsonCodec.decodeJson(json);
    expect(decoded).not.toBeNull();
    expect(decoded).toEqual(filter);
  });

  it("testMalformedJsonReturnsNullFailClosed", () => {
    expect(DrillDownJsonCodec.decodeJson(null)).toBeNull();
    expect(DrillDownJsonCodec.decodeJson("")).toBeNull();
    expect(DrillDownJsonCodec.decodeJson("   ")).toBeNull();
    expect(DrillDownJsonCodec.decodeJson("not-a-json-payload")).toBeNull();
    expect(DrillDownJsonCodec.decodeJson('{"source": "NON_EXISTENT_ENUM"}')).toBeNull();
  });

  it("testInvalidVerifiedModeReturnsNullFailClosed", () => {
    const json = '{"source":"ACTION_CENTER","contextLabel":"test","verifiedMode":"INVALID_MODE"}';
    const result = DrillDownJsonCodec.decodeJson(json);
    expect(result).toBeNull();
  });

  it("testInvalidTargetStatusReturnsNullFailClosed", () => {
    const json = '{"source":"ACTION_CENTER","contextLabel":"test","targetStatus":"UNKNOWN_STATUS"}';
    const result = DrillDownJsonCodec.decodeJson(json);
    expect(result).toBeNull();
  });

  it("testValidPhysicalPropertyStatusDecodesSuccessfully", () => {
    const json = '{"source":"ACTION_CENTER","contextLabel":"test","targetStatus":"Đang bán"}';
    const result = DrillDownJsonCodec.decodeJson(json);
    expect(result).not.toBeNull();
    expect(result?.targetStatus).toBe(PropertyStatus.FOR_SALE);
  });

  it("testExcludeDraftSemantics", () => {
    const filterExcludeDraft = new DrillDownFilter({
      source: DrillDownSource.ACTION_CENTER,
      contextLabel: "Aging test",
      excludeDraft: true
    });

    const filterKeepDraft = new DrillDownFilter({
      source: DrillDownSource.ACTION_CENTER,
      contextLabel: "Quality test",
      excludeDraft: false,
      targetIssueType: IssueType.DRAFT_PENDING
    });

    const draftProp = dummyProperty({ isDraft: true });
    const nonDraftProp = dummyProperty({ isDraft: false });

    const draftContext: DrillDownEvaluationContext = {
      property: draftProp,
      issueTypes: new Set([IssueType.DRAFT_PENDING])
    };
    const nonDraftContext: DrillDownEvaluationContext = {
      property: nonDraftProp
    };

    // When excludeDraft = true, draft property must NOT match
    expect(filterExcludeDraft.matches(draftContext)).toBe(false);
    expect(filterExcludeDraft.matches(nonDraftContext)).toBe(true);

    // When excludeDraft = false, draft property CAN match targetIssueType
    expect(filterKeepDraft.matches(draftContext)).toBe(true);
  });

  it("testFailClosedWhenContextDataIsMissing", () => {
    const prop = dummyProperty();

    // 1. targetOwnerId specified, but context.ownerId is null -> MUST return false
    const filterOwner = new DrillDownFilter({
      source: DrillDownSource.OWNER_PERFORMANCE,
      contextLabel: "Owner",
      targetOwnerId: "c1"
    });
    expect(filterOwner.matches({ property: prop, ownerId: null })).toBe(false);

    // 2. targetIssueType specified, but context.issueTypes is empty -> MUST return false
    const filterIssue = new DrillDownFilter({
      source: DrillDownSource.DATA_QUALITY_ISSUE,
      contextLabel: "Issue",
      targetIssueType: IssueType.MISSING_PRICE
    });
    expect(filterIssue.matches({ property: prop, issueTypes: new Set() })).toBe(false);

    // 3. minAgeDays specified, but context.ageDays is null -> MUST return false
    const filterAge = new DrillDownFilter({
      source: DrillDownSource.AGING_BUCKET,
      contextLabel: "Age",
      minAgeDays: 31
    });
    expect(filterAge.matches({ property: prop, ageDays: null })).toBe(false);

    // 4. deviationMin specified, but context.deviationPercent is null -> MUST return false
    const filterDev = new DrillDownFilter({
      source: DrillDownSource.DEAL_FINDER,
      contextLabel: "Deal",
      deviationMin: -10.0
    });
    expect(filterDev.matches({ property: prop, deviationPercent: null })).toBe(false);
  });

  it("testLastEditedAtBeforeHalfOpenSemantics", () => {
    const now = 1_000_000;
    const threshold = 900_000;
    const filter = new DrillDownFilter({
      source: DrillDownSource.ACTION_CENTER,
      contextLabel: "Stale test",
      lastEditedAtBefore: threshold
    });

    // 1. edited < threshold -> MATCH
    const pStale = dummyProperty({ lastEditedAt: 850_000 });
    expect(filter.matches({ property: pStale, now })).toBe(true);

    // 2. edited == threshold -> NO MATCH (half-open boundary)
    const pExact = dummyProperty({ lastEditedAt: threshold });
    expect(filter.matches({ property: pExact, now })).toBe(false);

    // 3. edited > threshold -> NO MATCH
    const pRecent = dummyProperty({ lastEditedAt: 950_000 });
    expect(filter.matches({ property: pRecent, now })).toBe(false);

    // 4. edited <= 0 -> NO MATCH (invalid timestamp, never fallback to createdAt)
    const pInvalid = dummyProperty({ lastEditedAt: 0, createdAt: 100_000 });
    expect(filter.matches({ property: pInvalid, now })).toBe(false);

    // 5. edited in future (edited > now) -> NO MATCH
    const pFuture = dummyProperty({ lastEditedAt: 1_100_000 });
    expect(filter.matches({ property: pFuture, now })).toBe(false);
  });

  it("testDeletedPropertyNeverMatches", () => {
    const filter = new DrillDownFilter({
      source: DrillDownSource.ACTION_CENTER,
      contextLabel: "All"
    });
    const deletedProp = dummyProperty({ isDeleted: true });
    expect(filter.matches({ property: deletedProp })).toBe(false);
  });

  it("testPriceAndAreaSizeFiltering_halfOpenAndFailClosed", () => {
    const filter = new DrillDownFilter({
      source: DrillDownSource.OWNER_PERFORMANCE,
      contextLabel: "Price and Area bounds",
      priceMin: 2.0,
      priceMax: 5.0,
      areaSizeMin: 50.0,
      areaSizeMax: 100.0
    });

    // Matching: price = 3.0, areaSize = 60.0 -> MATCH
    const pMatch = { ...dummyProperty(), price: 3.0, areaSize: 60.0 };
    expect(filter.matches({ property: pMatch })).toBe(true);

    // Boundary: price == priceMin (2.0) -> MATCH (minInclusive)
    const pMinPrice = { ...dummyProperty(), price: 2.0, areaSize: 60.0 };
    expect(filter.matches({ property: pMinPrice })).toBe(true);

    // Boundary: price == priceMax (5.0) -> NO MATCH (maxExclusive)
    const pMaxPrice = { ...dummyProperty(), price: 5.0, areaSize: 60.0 };
    expect(filter.matches({ property: pMaxPrice })).toBe(false);

    // Below priceMin
    const pBelowPrice = { ...dummyProperty(), price: 1.99, areaSize: 60.0 };
    expect(filter.matches({ property: pBelowPrice })).toBe(false);

    // Boundary: areaSize == areaSizeMin (50.0) -> MATCH (minInclusive)
    const pMinArea = { ...dummyProperty(), price: 3.0, areaSize: 50.0 };
    expect(filter.matches({ property: pMinArea })).toBe(true);

    // Boundary: areaSize == areaSizeMax (100.0) -> NO MATCH (maxExclusive)
    const pMaxArea = { ...dummyProperty(), price: 3.0, areaSize: 100.0 };
    expect(filter.matches({ property: pMaxArea })).toBe(false);

    // Below areaSizeMin
    const pBelowArea = { ...dummyProperty(), price: 3.0, areaSize: 49.9 };
    expect(filter.matches({ property: pBelowArea })).toBe(false);

    // Fail-closed: null areaSize -> NO MATCH
    const pNullArea = { ...dummyProperty(), price: 3.0, areaSize: null };
    expect(filter.matches({ property: pNullArea })).toBe(false);

    // Fail-closed: NaN or infinite price -> NO MATCH
    const pNanPrice = { ...dummyProperty(), price: Number.NaN, areaSize: 60.0 };
    expect(filter.matches({ property: pNanPrice })).toBe(false);
  });

  it("testSoldAtFiltering_halfOpenAndFailClosed", () => {
    const filter = new DrillDownFilter({
      source: DrillDownSource.INVENTORY,
      contextLabel: "Sold in window",
      targetStatus: PropertyStatus.SOLD,
      soldAtFrom: 100_000,
      soldAtTo: 200_000
    });

    // Matching: soldAt inside [100_000, 200_000)
    const pMatch = { ...dummyProperty({ status: PropertyStatusConstants.SOLD }), soldAt: 150_000 };
    expect(filter.matches({ property: pMatch })).toBe(true);

    // Boundary: soldAt == soldAtFrom (100_000) -> MATCH (fromInclusive)
    const pAtStart = { ...dummyProperty({ status: PropertyStatusConstants.SOLD }), soldAt: 100_000 };
    expect(filter.matches({ property: pAtStart })).toBe(true);

    // Boundary: soldAt == soldAtTo (200_000) -> NO MATCH (toExclusive)
    const pAtEnd = { ...dummyProperty({ status: PropertyStatusConstants.SOLD }), soldAt: 200_000 };
    expect(filter.matches({ property: pAtEnd })).toBe(false);

    // Below soldAtFrom
    const pBeforeStart = { ...dummyProperty({ status: PropertyStatusConstants.SOLD }), soldAt: 99_999 };
    expect(filter.matches({ property: pBeforeStart })).toBe(false);

    // Above soldAtTo
    const pAfterEnd = { ...dummyProperty({ status: PropertyStatusConstants.SOLD }), soldAt: 250_000 };
    expect(filter.matches({ property: pAfterEnd })).toBe(false);

    // Fail-closed: soldAt == null must NOT match
    const pNullSoldAt = { ...dummyProperty({ status: PropertyStatusConstants.SOLD }), soldAt: null };
    expect(filter.matches({ property: pNullSoldAt })).toBe(false);

    // When soldAt bounds are null (AllTime), null soldAt is allowed
    const allTimeFilter = new DrillDownFilter({
      source: DrillDownSource.INVENTORY,
      contextLabel: "All time sold",
      targetStatus: PropertyStatus.SOLD,
      soldAtFrom: null,
      soldAtTo: null
    });
    expect(allTimeFilter.matches({ property: pNullSoldAt })).toBe(true);
    expect(allTimeFilter.matches({ property: pMatch })).toBe(true);
  });

  it("testSoldAtFilterSerializationRoundTrip", () => {
    const filter = new DrillDownFilter({
      source: DrillDownSource.INVENTORY,
      contextLabel: "BĐS đã bán · bán trong 30 ngày",
      targetStatus: PropertyStatus.SOLD,
      soldAtFrom: 1_700_000_000,
      soldAtTo: 1_702_592_000
    });

    const json = DrillDownJsonCodec.encodeJson(filter);
    const decoded = DrillDownJsonCodec.decodeJson(json);

    expect(decoded).not.toBeNull();
    expect(decoded).toEqual(filter);
    expect(decoded?.soldAtFrom).toBe(1_700_000_000);
    expect(decoded?.soldAtTo).toBe(1_702_592_000);
  });
});
