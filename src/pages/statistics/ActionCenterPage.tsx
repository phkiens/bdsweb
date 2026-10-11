import React from "react";
import { useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, CheckCircle2, ArrowRight } from "lucide-react";
import { db } from "../../data/local/db";
import { CustomerPropertyRole } from "../../core/models/enums";
import {
  ActionCenterCalculator,
  ActionItem
} from "../../core/statistics/action-center-calculator";
import {
  StatisticsFilter,
  VerifiedMode
} from "../../core/statistics/statistics-filter";
import { DrillDownFilter } from "../../core/statistics/drill-down-filter";
import { createDrillDownUrl } from "../../core/statistics/drill-down-query";

function formatActionItemLabel(item: ActionItem): string {
  const count = item.count;
  const title = item.title;
  if (item.key === "unverified_pending") {
    return `${count} tin chờ xác minh`;
  }
  if (
    title.toLowerCase().startsWith("bđs") ||
    title.toLowerCase().startsWith("tin")
  ) {
    return `${count} ${title}`;
  }
  if (title.toLowerCase().includes("ảnh")) {
    return `${count} ${title.charAt(0).toLowerCase() + title.slice(1)}`;
  }
  if (
    title.toLowerCase().startsWith("thiếu") ||
    title.toLowerCase().startsWith("chưa") ||
    title.toLowerCase().startsWith("không")
  ) {
    return `${count} bất động sản ${title.charAt(0).toLowerCase() + title.slice(1)}`;
  }
  return `${count} bất động sản ${title}`;
}

function getActionText(item: ActionItem): string {
  if (item.key === "unverified_pending") return "Duyệt";
  if (item.key.includes("media") || item.key.includes("sync")) return "Thử lại";
  return "Sửa";
}

export const ActionCenterPage: React.FC = () => {
  const navigate = useNavigate();

  // Query Dexie reactively, capturing "now" inside the query function
  const queryData = useLiveQuery(async () => {
    const now = Date.now();
    const allProperties = await db.properties.filter((p) => !p.isDeleted).toArray();
    const allCustomers = await db.customers.filter((c) => !c.isDeleted).toArray();
    const allLinks = await db.customer_property_links.filter((l) => !l.isDeleted).toArray();

    const customerMap = new Map(allCustomers.map((c) => [c.id, c]));
    const ownerCountMap = new Map<string, number>();
    for (const link of allLinks) {
      if (link.role === "OWNER" || link.role === CustomerPropertyRole.OWNER) {
        const customer = customerMap.get(link.customerId);
        if (customer && !customer.isDeleted) {
          ownerCountMap.set(
            link.propertyId,
            (ownerCountMap.get(link.propertyId) ?? 0) + 1
          );
        }
      }
    }

    const items = ActionCenterCalculator.calculate(
      allProperties,
      now,
      (id) => ownerCountMap.get(id) ?? 0,
      () => true,
      false,
      new StatisticsFilter()
    );

    return {
      now,
      items
    };
  }, []);

  const handleDrillDown = (drillDownFilter: DrillDownFilter) => {
    if (drillDownFilter.verifiedMode === VerifiedMode.UNVERIFIED_ONLY) {
      navigate(createDrillDownUrl("/unverified", drillDownFilter));
    } else {
      navigate(createDrillDownUrl("/properties", drillDownFilter));
    }
  };

  const isLoading = queryData === undefined;
  const actionItems = queryData?.items ?? [];

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-4 py-3 sm:py-4 pb-24 md:pb-12 space-y-4">
      {/* Top App Bar matching Android TopAppBar */}
      <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="p-2 -ml-1 text-slate-600 hover:text-slate-900 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
            title="Quay lại"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold text-slate-900 truncate">Cần xử lý</h1>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500">
          <div className="animate-spin w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full" />
          <span className="text-xs font-medium mt-3">
            Đang kiểm tra chất lượng dữ liệu…
          </span>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && actionItems.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <CheckCircle2 className="w-12 h-12 text-blue-600 mb-3" />
          <span className="text-base font-semibold text-slate-700">
            Không có mục nào cần xử lý
          </span>
        </div>
      )}

      {/* Action Items List */}
      {!isLoading && actionItems.length > 0 && (
        <div className="space-y-2">
          {actionItems.map((item) => {
            const label = formatActionItemLabel(item);
            const actionText = getActionText(item);

            return (
              <div
                key={item.key}
                onClick={() => handleDrillDown(item.drillDownFilter)}
                className="w-full p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs hover:border-blue-300 transition-all cursor-pointer flex items-center justify-between gap-3"
              >
                <span className="text-sm font-medium text-slate-800 flex-1">
                  {label}
                </span>

                <div className="flex items-center gap-1 text-xs font-semibold text-blue-600 shrink-0">
                  <span>{actionText}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
