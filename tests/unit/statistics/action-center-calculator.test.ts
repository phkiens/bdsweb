import { describe, it, expect } from "vitest";
import { createDefaultProperty, Property } from "../../../src/core/models/property";
import {
  ActionCenterCalculator,
  ActionPriority
} from "../../../src/core/statistics/action-center-calculator";
import { DataQualityCalculator } from "../../../src/core/statistics/data-quality-calculator";
import {
  DrillDownEvaluationContext
} from "../../../src/core/statistics/drill-down-filter";
import {
  PropertyStatusConstants,
} from "../../../src/core/statistics/statistics-filter";

describe("ActionCenterCalculatorTest", () => {

  // Fixed now: 2026-09-12T12:00:00+07:00
  // In UTC: 2026-09-12 05:00:00 UTC
  const fixedNow = Date.UTC(2026, 8, 12, 5, 0, 0);

  function timeDaysAgo(days: number): number {
    // 2026-09-12 minus days at 10:00:00+07:00 (03:00:00 UTC)
    const baseUtc = Date.UTC(2026, 8, 12, 3, 0, 0);
    return baseUtc - days * 86_400_000;
  }

  function createProp(partial: {
    id: string;
    status?: string;
    createdAt?: number;
    lastEditedAt?: number;
    isVerified?: boolean;
    isDraft?: boolean;
    price?: number;
    areaSize?: number | null;
    r2MediaKeys?: string | null;
  }): Property {
    return createDefaultProperty({
      id: partial.id,
      area: "Hồng Bàng",
      latitude: 20.85,
      longitude: 106.68,
      areaSize: partial.areaSize !== undefined ? partial.areaSize : 60.0,
      price: partial.price !== undefined ? partial.price : 3.0,
      description: `Mô tả ${partial.id}`,
      status: partial.status ?? PropertyStatusConstants.FOR_SALE,
      propertyType: "Nhà phố",
      isVerified: partial.isVerified ?? true,
      isDraft: partial.isDraft ?? false,
      createdAt: partial.createdAt ?? (fixedNow - 86_400_000),
      lastEditedAt: partial.lastEditedAt ?? (fixedNow - 86_400_000),
      r2MediaKeys: partial.r2MediaKeys !== undefined ? partial.r2MediaKeys : '[{"objectKey":"k1","fileName":"f1.jpg"}]',
    });
  }

  it("testActionItemPriorityMappingAndSorting", () => {
    // p1 has MISSING_PRICE (CRITICAL -> HIGH)
    const p1 = createProp({ id: "p1", price: 0.0 });
    // p2 has MISSING_AREA_SIZE (WARNING -> MEDIUM)
    const p2 = createProp({ id: "p2", areaSize: null });
    // p3 has isDraft = true (INFO -> LOW)
    const p3 = createProp({ id: "p3", isDraft: true });

    const items = ActionCenterCalculator.calculate(
      [p1, p2, p3],
      fixedNow
    );

    expect(items.length).toBeGreaterThan(0);
    // HIGH priority must appear before MEDIUM and LOW
    expect(items[0].priority).toEqual(ActionPriority.HIGH);
    expect(items[0].key).toBe("issue_missing_price");
  });

  it("testAgingOver90DaysExcludesDraft", () => {
    const oldCreated = timeDaysAgo(95); // 95 days old

    // 1. Non-draft verified -> counted in aging_over_90d
    const pVerified = createProp({ id: "p-old-verified", createdAt: oldCreated, isDraft: false });
    // 2. Draft verified -> MUST NOT be counted in aging_over_90d
    const pDraft = createProp({ id: "p-old-draft", createdAt: oldCreated, isDraft: true });

    const items = ActionCenterCalculator.calculate(
      [pVerified, pDraft],
      fixedNow
    );

    const agingItem = items.find(it => it.key === "aging_over_90d");
    expect(agingItem).toBeDefined();
    expect(agingItem!.count).toBe(1);
    expect(agingItem!.drillDownFilter.excludeDraft).toBe(true);
    expect(agingItem!.drillDownFilter.minAgeDays).toBe(91);
  });

  it("testStaleUneditedOver30DaysSemantics", () => {
    const thirtyDaysMs = 30 * 86_400_000;
    const staleTime = fixedNow - thirtyDaysMs - 1000; // 30 days + 1 second ago
    const exactThirtyDaysTime = fixedNow - thirtyDaysMs; // exactly 30 days ago
    const futureTime = fixedNow + 86_400_000; // tomorrow

    // pStale: > 30 days old lastEditedAt -> MATCH
    const pStale = createProp({ id: "p-stale", lastEditedAt: staleTime, isDraft: false });
    // pExact: exactly 30 days -> NO MATCH (half-open < threshold)
    const pExact = createProp({ id: "p-exact", lastEditedAt: exactThirtyDaysTime, isDraft: false });
    // pInvalid: lastEditedAt <= 0 -> NO MATCH (timestamp invalid, NO fallback to createdAt)
    const pInvalid = createProp({ id: "p-invalid", lastEditedAt: 0, isDraft: false });
    // pFuture: lastEditedAt > now -> NO MATCH (future timestamp)
    const pFuture = createProp({ id: "p-future", lastEditedAt: futureTime, isDraft: false });
    // pDraft: stale but isDraft = true -> NO MATCH (excludeDraft)
    const pDraft = createProp({ id: "p-draft-stale", lastEditedAt: staleTime, isDraft: true });

    const items = ActionCenterCalculator.calculate(
      [pStale, pExact, pInvalid, pFuture, pDraft],
      fixedNow
    );

    const staleItem = items.find(it => it.key === "stale_unedited_30d");
    expect(staleItem).toBeDefined();
    expect(staleItem!.count).toBe(1);
    expect(staleItem!.drillDownFilter.excludeDraft).toBe(true);
  });

  it("testCountMatchesExactDrillDownPropertyIds", () => {
    const oldCreated = timeDaysAgo(100);
    const oldEdited = fixedNow - 35 * 86_400_000;

    const p1 = createProp({ id: "p1", createdAt: oldCreated, lastEditedAt: oldEdited, isDraft: false });
    const p2 = createProp({ id: "p2", createdAt: oldCreated, lastEditedAt: oldEdited, isDraft: true }); // draft
    const p3 = createProp({ id: "p3", price: 0.0 }); // MISSING_PRICE
    const p4 = createProp({ id: "p4", areaSize: null }); // MISSING_AREA_SIZE

    const props = [p1, p2, p3, p4];
    const items = ActionCenterCalculator.calculate(props, fixedNow);

    const qualitySummary = DataQualityCalculator.calculate(props, fixedNow);
    const issuesByProp = new Map<string, typeof qualitySummary.issues>();
    for (const issue of qualitySummary.issues) {
      const list = issuesByProp.get(issue.propertyId) ?? [];
      list.push(issue);
      issuesByProp.set(issue.propertyId, list);
    }

    const expectedIdsByKey: Record<string, Set<string>> = {
      aging_over_90d: new Set(["p1"]),
      stale_unedited_30d: new Set(["p1"]),
      issue_draft_pending: new Set(["p2"]),
      issue_missing_price: new Set(["p3"]),
      issue_missing_area_size: new Set(["p4"])
    };

    function getDaysDiff(createdMillis: number, nowMillis: number): number {
      const msPerDay = 86_400_000;
      const offset7h = 7 * 3600 * 1000;
      const dayCreated = Math.floor((createdMillis + offset7h) / msPerDay);
      const dayNow = Math.floor((nowMillis + offset7h) / msPerDay);
      return dayNow - dayCreated;
    }

    for (const item of items) {
      const filter = item.drillDownFilter;

      const matchingProps = props.filter(p => {
        const pIssues = new Set((issuesByProp.get(p.id) ?? []).map(i => i.issueType));
        const ageDays = (p.createdAt && p.createdAt > 0) ? getDaysDiff(p.createdAt, fixedNow) : null;

        const context: DrillDownEvaluationContext = {
          property: p,
          issueTypes: pIssues,
          ageDays: ageDays,
          now: fixedNow
        };
        return filter.matches(context);
      });

      const matchingPropIds = new Set(matchingProps.map(p => p.id));
      const expectedPropIds = expectedIdsByKey[item.key] ?? new Set();

      expect(matchingPropIds).toEqual(expectedPropIds);
      expect(item.count).toBe(matchingProps.length);
    }
  });

  it("testActionCenterThreeTierDeterministicSorting", () => {
    // Tier 1: priority desc (HIGH > MEDIUM > LOW)
    // Tier 2: count desc (within same priority, count 2 > count 1)
    // Tier 3: key asc (within same priority and count, alphabetical key order)

    // p_high: missing price -> ActionPriority.HIGH (rank 3), key = "issue_missing_price", count = 1
    const pHigh = createProp({ id: "p-high", price: 0.0 });

    // p_stale1 & p_stale2: lastEditedAt 35d ago -> ActionPriority.MEDIUM (rank 2), key = "stale_unedited_30d", count = 2
    const staleTime = fixedNow - 35 * 86_400_000;
    const pStale1 = createProp({ id: "p-stale-1", lastEditedAt: staleTime });
    const pStale2 = createProp({ id: "p-stale-2", lastEditedAt: staleTime });

    // p_aging: created 100d ago -> ActionPriority.MEDIUM (rank 2), key = "aging_over_90d", count = 1
    const pAging = createProp({ id: "p-aging", createdAt: timeDaysAgo(100), lastEditedAt: fixedNow - 86_400_000 });

    // p_missing_area: missing area size -> ActionPriority.MEDIUM (rank 2), key = "issue_missing_area_size", count = 1
    const pMissingArea = createProp({ id: "p-missing-area", areaSize: null });

    // p_draft: draft pending -> ActionPriority.LOW (rank 1), key = "issue_draft_pending", count = 1
    const pDraft = createProp({ id: "p-draft", isDraft: true });

    const items = ActionCenterCalculator.calculate(
      [pHigh, pStale1, pStale2, pAging, pMissingArea, pDraft],
      fixedNow
    );

    const itemKeys = items.map(it => it.key);
    const expectedKeys = [
      "issue_missing_price",
      "stale_unedited_30d",
      "aging_over_90d",
      "issue_missing_area_size",
      "issue_draft_pending"
    ];

    expect(itemKeys).toEqual(expectedKeys);

    for (let i = 0; i < items.length - 1; i++) {
      const a = items[i];
      const b = items[i + 1];
      if (a.priority.rank !== b.priority.rank) {
        expect(a.priority.rank).toBeGreaterThan(b.priority.rank);
      } else if (a.count !== b.count) {
        expect(a.count).toBeGreaterThan(b.count);
      } else {
        expect(a.key < b.key).toBe(true);
      }
    }
  });
});
