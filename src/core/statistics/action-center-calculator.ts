import { Property } from "../models/property";
import { PropertyStatus } from "../models/enums";
import {
  DataQualityCalculator
} from "./data-quality-calculator";
import {
  DrillDownFilter,
  DrillDownSource
} from "./drill-down-filter";
import { DrillDownFilterFactory } from "./drill-down-filter-factory";
import {
  IssueType,
  ALL_ISSUE_TYPES
} from "./issue-type";
import {
  getLocalDateParts,
  PropertyStatusConstants,
  STATS_ZONE_ID,
  StatisticsFilter,
  VerifiedMode
} from "./statistics-filter";

export interface IActionPriority {
  readonly name: string;
  readonly rank: number;
}

export class ActionPriorityItem implements IActionPriority {
  constructor(
    public readonly name: string,
    public readonly rank: number
  ) {}
}

const ACTION_PRIORITY_HIGH = new ActionPriorityItem("HIGH", 3);
const ACTION_PRIORITY_MEDIUM = new ActionPriorityItem("MEDIUM", 2);
const ACTION_PRIORITY_LOW = new ActionPriorityItem("LOW", 1);

export const ActionPriority = {
  HIGH: ACTION_PRIORITY_HIGH,
  MEDIUM: ACTION_PRIORITY_MEDIUM,
  LOW: ACTION_PRIORITY_LOW
};

export type ActionPriority = ActionPriorityItem;

export interface ActionItem {
  key: string;
  title: string;
  priority: ActionPriority;
  count: number;
  drillDownFilter: DrillDownFilter;
}

export const ActionCenterCalculator = {
  calculate(
    properties: Property[],
    now: number = Date.now(),
    ownerCountProvider?: ((propertyId: string) => number) | null,
    fileChecker: (path: string) => boolean = () => true,
    includeEmpty: boolean = false,
    filter?: StatisticsFilter | null
  ): ActionItem[] {
    const activeProperties = properties.filter((p) => !p.isDeleted);
    const pNow = getLocalDateParts(now, STATS_ZONE_ID);
    const nowDateUtc = Date.UTC(pNow.year, pNow.month - 1, pNow.day);

    const items: ActionItem[] = [];

    // 1. Data Quality Issues
    const qualitySummary = DataQualityCalculator.calculate(
      activeProperties,
      now,
      ownerCountProvider,
      fileChecker
    );

    // Group detected issues by issueType (distinct properties per issue)
    const propertyIssuesByType = new Map<string, Set<string>>();
    for (const issue of qualitySummary.issues) {
      const typeKey = issue.issueType.name;
      const set = propertyIssuesByType.get(typeKey) ?? new Set<string>();
      set.add(issue.propertyId);
      propertyIssuesByType.set(typeKey, set);
    }

    for (const issueType of ALL_ISSUE_TYPES) {
      const propSet = propertyIssuesByType.get(issueType.name);
      const count = propSet ? propSet.size : 0;
      if (!includeEmpty && count === 0) continue;

      let priority: ActionPriority;
      switch (issueType.defaultSeverity.rank) {
        case 3:
          priority = ActionPriority.HIGH;
          break;
        case 2:
          priority = ActionPriority.MEDIUM;
          break;
        case 1:
        default:
          priority = ActionPriority.LOW;
          break;
      }

      let key: string;
      let title: string;
      let drillFilter: DrillDownFilter;

      if (issueType.name === "DRAFT_PENDING") {
        key = "issue_draft_pending";
        title = "Tin nháp chờ duyệt";
        drillFilter = new DrillDownFilter({
          source: DrillDownSource.ACTION_CENTER,
          contextLabel: "Tin nháp chờ duyệt",
          targetIssueType: IssueType.DRAFT_PENDING,
          excludeDraft: false
        });
      } else if (issueType.name === "PRICE_OUTLIER") {
        key = "issue_price_outlier";
        title = "Cảnh báo ngoại lai giá";
        drillFilter = new DrillDownFilter({
          source: DrillDownSource.ACTION_CENTER,
          contextLabel: "Cảnh báo ngoại lai giá",
          targetIssueType: IssueType.PRICE_OUTLIER,
          excludeDraft: true
        });
      } else {
        key = `issue_${issueType.name.toLowerCase()}`;
        title = issueType.vietnameseTitle;
        drillFilter = new DrillDownFilter({
          source: DrillDownSource.ACTION_CENTER,
          contextLabel: issueType.vietnameseTitle,
          targetIssueType: issueType,
          excludeDraft: false
        });
      }

      items.push({
        key,
        title,
        priority,
        count,
        drillDownFilter: drillFilter
      });
    }

    // 2. Tồn kho lâu ngày (> 90 ngày)
    // Population: active, !draft, status == FOR_SALE, ageDays > 90
    const agingOver90Count = activeProperties.filter((p) => {
      if (p.isDraft) return false;
      if (!PropertyStatusConstants.isForSale(p.status)) return false;
      if (p.createdAt <= 0) return false;
      const pCreated = getLocalDateParts(p.createdAt, STATS_ZONE_ID);
      const createdDateUtc = Date.UTC(pCreated.year, pCreated.month - 1, pCreated.day);
      const ageDays = Math.round((nowDateUtc - createdDateUtc) / 86_400_000);
      return ageDays > 90;
    }).length;

    if (includeEmpty || agingOver90Count > 0) {
      items.push({
        key: "aging_over_90d",
        title: "BĐS tồn kho trên 90 ngày",
        priority: ActionPriority.MEDIUM,
        count: agingOver90Count,
        drillDownFilter: new DrillDownFilter({
          source: DrillDownSource.ACTION_CENTER,
          contextLabel: "Tồn kho > 90 ngày",
          targetStatus: PropertyStatus.FOR_SALE,
          verifiedMode: VerifiedMode.ALL,
          excludeDraft: true,
          minAgeDays: 91
        })
      });
    }

    // 3. Chưa cập nhật lâu ngày (> 30 ngày)
    // Population: active, !draft, status == FOR_SALE, 0 < lastEditedAt <= now && lastEditedAt < (now - 30 days)
    const threshold = now - 30 * 86_400_000;
    const staleCount = activeProperties.filter((p) => {
      if (p.isDraft) return false;
      if (!PropertyStatusConstants.isForSale(p.status)) return false;
      return p.lastEditedAt > 0 && p.lastEditedAt <= now && p.lastEditedAt < threshold;
    }).length;

    if (includeEmpty || staleCount > 0) {
      items.push({
        key: "stale_unedited_30d",
        title: "BĐS quá 30 ngày chưa cập nhật",
        priority: ActionPriority.MEDIUM,
        count: staleCount,
        drillDownFilter: new DrillDownFilter({
          source: DrillDownSource.ACTION_CENTER,
          contextLabel: "Chưa cập nhật > 30 ngày",
          targetStatus: PropertyStatus.FOR_SALE,
          verifiedMode: VerifiedMode.ALL,
          excludeDraft: true,
          lastEditedAtBefore: threshold
        })
      });
    }

    // 4. Tin chờ xác minh (Unverified pending listings)
    const unverifiedFilter = DrillDownFilterFactory.createUnverifiedFilter(
      filter,
      now,
      DrillDownSource.ACTION_CENTER
    );
    const unverifiedCount = DrillDownFilterFactory.countMatching(
      activeProperties,
      unverifiedFilter,
      now
    );
    if (includeEmpty || unverifiedCount > 0) {
      items.push({
        key: "unverified_pending",
        title: "tin chờ xác minh",
        priority: ActionPriority.MEDIUM,
        count: unverifiedCount,
        drillDownFilter: unverifiedFilter
      });
    }

    // 5. Deterministic sorting: priority descending -> count descending -> key ascending
    items.sort((a, b) => {
      if (b.priority.rank !== a.priority.rank) {
        return b.priority.rank - a.priority.rank;
      }
      if (b.count !== a.count) {
        return b.count - a.count;
      }
      return a.key.localeCompare(b.key);
    });

    return items;
  }
};
