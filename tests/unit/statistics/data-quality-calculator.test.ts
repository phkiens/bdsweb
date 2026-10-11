import { describe, it, expect } from "vitest";
import { createDefaultProperty, Property } from "../../../src/core/models/property";
import {
  DataQualityCalculator
} from "../../../src/core/statistics/data-quality-calculator";
import {
} from "../../../src/core/statistics/issue-type";
import {
  PropertyStatusConstants,
} from "../../../src/core/statistics/statistics-filter";

describe("DataQualityCalculatorTest", () => {

  // Fixed timestamp: 2026-09-12T12:00:00+07:00
  // In UTC: 2026-09-12 05:00:00 UTC
  const fixedNow = Date.UTC(2026, 8, 12, 5, 0, 0);

  function validProperty(partial?: Partial<Property>): Property {
    return createDefaultProperty({
      id: "prop-valid",
      area: "Hải An",
      propertyType: "Nhà phố",
      price: 3.5,
      areaSize: 70.0,
      status: PropertyStatusConstants.FOR_SALE,
      createdAt: fixedNow - 86_400_000,
      isVerified: true,
      isDraft: false,
      isDeleted: false,
      latitude: 20.85,
      longitude: 106.68,
      r2MediaKeys: JSON.stringify([{ objectKey: "k1", fileName: "f1.jpg" }]),
      imagePath: null,
      driveMediaIds: null,
      ...partial
    });
  }

  it("testValidPropertyHasZeroIssuesWhenOwnerCountIsOne", () => {
    const prop = validProperty();
    const summary = DataQualityCalculator.calculate(
      [prop],
      fixedNow,
      () => 1
    );
    expect(summary.totalIssues).toBe(0);
    expect(summary.issues).toHaveLength(0);
  });

  it("testInvalidDateAndFutureDate", () => {
    const propInvalid = validProperty({ id: "p-invalid-date", createdAt: 0 });
    // Tomorrow: 2026-09-13 00:00:00+07:00 (Date.UTC(2026, 8, 13) - 7h)
    const tomorrow = Date.UTC(2026, 8, 13) - 7 * 3600 * 1000;
    const propFuture = validProperty({ id: "p-future-date", createdAt: tomorrow });

    const summary = DataQualityCalculator.calculate(
      [propInvalid, propFuture],
      fixedNow
    );

    const types = summary.issues.map((it) => it.issueType.name);
    expect(types).toContain("INVALID_DATE");
    expect(types).toContain("FUTURE_DATE");
  });

  it("testUnknownStatus", () => {
    const propUnknown = validProperty({ status: "Đang đàm phán" });
    const summary = DataQualityCalculator.calculate([propUnknown], fixedNow);
    expect(summary.issues.some((it) => it.issueType.name === "UNKNOWN_STATUS")).toBe(true);
  });

  it("testMissingPriceAndAreaSize", () => {
    const propZeroPrice = validProperty({ id: "p-price", price: 0.0 });
    const propNullArea = validProperty({ id: "p-area", areaSize: null });

    const summary = DataQualityCalculator.calculate([propZeroPrice, propNullArea], fixedNow);
    expect(summary.issues.some((it) => it.issueType.name === "MISSING_PRICE")).toBe(true);
    expect(summary.issues.some((it) => it.issueType.name === "MISSING_AREA_SIZE")).toBe(true);
  });

  it("testMissingAreaNameAndPropertyTypeWithSentinels", () => {
    const propSentinelArea = validProperty({ id: "p-s-area", area: "chưa xác định" });
    const propBlankType = validProperty({ id: "p-b-type", propertyType: "   " });

    const summary = DataQualityCalculator.calculate([propSentinelArea, propBlankType], fixedNow);
    expect(summary.issues.some((it) => it.issueType.name === "MISSING_AREA_NAME")).toBe(true);
    expect(summary.issues.some((it) => it.issueType.name === "MISSING_PROPERTY_TYPE")).toBe(true);
  });

  it("testMissingGps", () => {
    const propNullGps = validProperty({ id: "p-gps-null", latitude: null, longitude: null });
    const propOutOfRange = validProperty({ id: "p-gps-range", latitude: 95.0, longitude: 200.0 });

    const summary = DataQualityCalculator.calculate([propNullGps, propOutOfRange], fixedNow);
    expect(summary.issues.filter((it) => it.issueType.name === "MISSING_GPS")).toHaveLength(2);
  });

  it("testNoMediaReferenceAndBrokenLocalMedia", () => {
    const propNoMedia = validProperty({ id: "p-no-media", r2MediaKeys: null, imagePath: null });
    const propBrokenMedia = validProperty({
      id: "p-broken-media",
      r2MediaKeys: null,
      imagePath: "/storage/file1.jpg ||| /storage/file2.jpg"
    });

    // fileChecker: file1 exists, file2 does not
    const fileChecker = (path: string) => path === "/storage/file1.jpg";

    const summary = DataQualityCalculator.calculate(
      [propNoMedia, propBrokenMedia],
      fixedNow,
      null,
      fileChecker
    );

    expect(summary.issues.some((it) => it.issueType.name === "NO_MEDIA_REFERENCE")).toBe(true);
    const brokenIssue = summary.issues.find((it) => it.issueType.name === "BROKEN_LOCAL_MEDIA");
    expect(brokenIssue).toBeDefined();
    expect(brokenIssue!.brokenFileCount).toBe(1);
    expect(brokenIssue!.totalLocalFiles).toBe(2);
  });

  it("testOwnerEvidenceTriState", () => {
    const prop = validProperty();

    // 1. null provider -> No owner issues emitted (tri-state unknown)
    const summaryNull = DataQualityCalculator.calculate([prop], fixedNow, null);
    expect(
      summaryNull.issues.some(
        (it) => it.issueType.name === "MISSING_OWNER" || it.issueType.name === "MULTIPLE_OWNERS"
      )
    ).toBe(false);

    // 2. count = 0 -> MISSING_OWNER
    const summaryZero = DataQualityCalculator.calculate([prop], fixedNow, () => 0);
    expect(summaryZero.issues.some((it) => it.issueType.name === "MISSING_OWNER")).toBe(true);

    // 3. count = 1 -> valid, no issue
    const summaryOne = DataQualityCalculator.calculate([prop], fixedNow, () => 1);
    expect(
      summaryOne.issues.some(
        (it) => it.issueType.name === "MISSING_OWNER" || it.issueType.name === "MULTIPLE_OWNERS"
      )
    ).toBe(false);

    // 4. count = 2 -> MULTIPLE_OWNERS
    const summaryMulti = DataQualityCalculator.calculate([prop], fixedNow, () => 2);
    expect(summaryMulti.issues.some((it) => it.issueType.name === "MULTIPLE_OWNERS")).toBe(true);
  });

  it("testDraftPendingDetected", () => {
    const draftProp = validProperty({ isDraft: true });
    const summary = DataQualityCalculator.calculate([draftProp], fixedNow);
    expect(summary.issues.some((it) => it.issueType.name === "DRAFT_PENDING")).toBe(true);
  });

  it("testPriceOutlierGateLessThanFiveSamples", () => {
    // 4 properties in same (area, propertyType) with one extreme outlier
    const props = [
      validProperty({ id: "p1", price: 3.0, areaSize: 100.0 }), // 30 tr/m²
      validProperty({ id: "p2", price: 3.1, areaSize: 100.0 }), // 31 tr/m²
      validProperty({ id: "p3", price: 3.2, areaSize: 100.0 }), // 32 tr/m²
      validProperty({ id: "p4", price: 30.0, areaSize: 100.0 }) // 300 tr/m² (extreme outlier)
    ];

    const summary = DataQualityCalculator.calculate(props, fixedNow);
    // Gate < 5: must NOT flag any PRICE_OUTLIER
    expect(summary.issues.some((it) => it.issueType.name === "PRICE_OUTLIER")).toBe(false);
  });

  it("testPriceOutlierGateFiveOrMoreSamplesFlagsOutlier", () => {
    // 5 properties in same (area, propertyType): 4 normal + 1 extreme outlier
    const props = [
      validProperty({ id: "p1", price: 3.0, areaSize: 100.0 }), // 30 tr/m²
      validProperty({ id: "p2", price: 3.1, areaSize: 100.0 }), // 31 tr/m²
      validProperty({ id: "p3", price: 3.0, areaSize: 100.0 }), // 30 tr/m²
      validProperty({ id: "p4", price: 3.2, areaSize: 100.0 }), // 32 tr/m²
      validProperty({ id: "p5", price: 30.0, areaSize: 100.0 }) // 300 tr/m² (extreme outlier)
    ];

    const summary = DataQualityCalculator.calculate(props, fixedNow);
    const outlierIssues = summary.issues.filter((it) => it.issueType.name === "PRICE_OUTLIER");
    expect(outlierIssues).toHaveLength(1);
    expect(outlierIssues[0].propertyId).toBe("p5");
  });

  it("testDeletedPropertiesAreExcluded", () => {
    const deletedProp = validProperty({ id: "p-deleted", isDeleted: true, price: 0.0 });
    const summary = DataQualityCalculator.calculate([deletedProp], fixedNow);
    expect(summary.totalIssues).toBe(0);
  });

  it("testDeterministicFourTierSorting", () => {
    // Prepare properties that produce CRITICAL, WARNING, and INFO issues
    const pCritical = validProperty({ id: "p-crit", price: 0.0, createdAt: fixedNow - 1000 });
    const pWarning1 = validProperty({ id: "p-warn-b", areaSize: null, createdAt: fixedNow - 2000 });
    const pWarning2 = validProperty({ id: "p-warn-a", areaSize: null, createdAt: fixedNow - 1000 });
    const pInfo = validProperty({ id: "p-info", isDraft: true, createdAt: fixedNow - 500 });

    const summary = DataQualityCalculator.calculate(
      [pCritical, pWarning1, pWarning2, pInfo],
      fixedNow
    );

    const severities = summary.issues.map((it) => it.severity.name);
    // Tier 1: CRITICAL before WARNING before INFO
    expect(severities[0]).toBe("CRITICAL");
    expect(severities[1]).toBe("WARNING");
    expect(severities[2]).toBe("WARNING");
    expect(severities[3]).toBe("INFO");

    // Between pWarning1 and pWarning2: pWarning2 has newer createdAt (fixedNow - 1000 vs fixedNow - 2000)
    const warningIssues = summary.issues.filter((it) => it.severity.name === "WARNING");
    expect(warningIssues[0].propertyId).toBe("p-warn-a");
    expect(warningIssues[1].propertyId).toBe("p-warn-b");
  });

  it("testPropertyWithOnlyDriveMediaIdsYieldsNoMediaReferenceIssue", () => {
    const propDriveOnly = validProperty({
      id: "p-drive-only",
      r2MediaKeys: null,
      imagePath: null,
      driveMediaIds: JSON.stringify({ photo1: "drive-123" })
    });

    const summary = DataQualityCalculator.calculate([propDriveOnly], fixedNow);
    expect(
      summary.issues.some(
        (it) => it.issueType.name === "NO_MEDIA_REFERENCE" && it.propertyId === "p-drive-only"
      )
    ).toBe(true);
  });
});
