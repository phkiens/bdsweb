import React from "react";
import { useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Info, ArrowRight } from "lucide-react";
import { db } from "../../data/local/db";
import { CustomerPropertyRole } from "../../core/models/enums";
import {
  OwnerPerformanceCalculator,
  PropertyWithOwner
} from "../../core/statistics/owner-performance-calculator";
import { StatisticsFilter } from "../../core/statistics/statistics-filter";
import { DrillDownFilter } from "../../core/statistics/drill-down-filter";
import { createDrillDownUrl } from "../../core/statistics/drill-down-query";

export const OwnerPerformancePage: React.FC = () => {
  const navigate = useNavigate();

  // Query Dexie reactively, capturing "now" inside the query function
  const queryData = useLiveQuery(async () => {
    const now = Date.now();
    const allProperties = await db.properties.filter((p) => !p.isDeleted).toArray();
    const allCustomers = await db.customers.filter((c) => !c.isDeleted).toArray();
    const allLinks = await db.customer_property_links.filter((l) => !l.isDeleted).toArray();

    const customerMap = new Map(allCustomers.map((c) => [c.id, c]));
    const ownerLinksByProp = new Map<string, typeof allLinks>();
    for (const link of allLinks) {
      if (link.role === "OWNER" || link.role === CustomerPropertyRole.OWNER) {
        const list = ownerLinksByProp.get(link.propertyId) ?? [];
        list.push(link);
        ownerLinksByProp.set(link.propertyId, list);
      }
    }

    const propertiesWithOwner: PropertyWithOwner[] = allProperties.map((p) => {
      const links = ownerLinksByProp.get(p.id) ?? [];
      const owners = links
        .map((l) => customerMap.get(l.customerId))
        .filter((c): c is typeof allCustomers[0] => Boolean(c && !c.isDeleted));
      const ownerCount = owners.length;
      return {
        property: p,
        ownerCount,
        ownerId: ownerCount === 1 ? owners[0].id : null,
        ownerName: ownerCount === 1 ? owners[0].name : null
      };
    });

    const result = OwnerPerformanceCalculator.calculate(
      propertiesWithOwner,
      now,
      new StatisticsFilter()
    );

    return {
      now,
      result
    };
  }, []);

  const handleDrillDown = (filter: DrillDownFilter) => {
    navigate(createDrillDownUrl("/properties", filter));
  };

  const isLoading = queryData === undefined;
  const items = queryData?.result?.items ?? [];

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
          <h1 className="text-lg font-bold text-slate-900 truncate">
            Nguồn hàng theo chủ
          </h1>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500">
          <div className="animate-spin w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full" />
          <span className="text-xs font-medium mt-3">
            Đang tải dữ liệu nguồn hàng…
          </span>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && items.length === 0 && (
        <div className="p-6 bg-slate-100 border border-slate-200 rounded-2xl text-center">
          <Info className="w-8 h-8 text-slate-400 mx-auto mb-2" />
          <h3 className="text-sm font-bold text-slate-800">
            Chưa có dữ liệu chủ nhà
          </h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Hệ thống chưa ghi nhận bất động sản có liên kết chủ nhà.
          </p>
        </div>
      )}

      {/* Content */}
      {!isLoading && items.length > 0 && (
        <div className="space-y-3">
          <div className="text-xs text-slate-500 font-medium px-1">
            Tổng số: {items.length} chủ nhà có dữ liệu nguồn hàng
          </div>

          <div className="space-y-3">
            {items.map((item, idx) => {
              const index = idx + 1;
              return (
                <div
                  key={item.ownerId}
                  className="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-slate-900">
                      #{index} {item.ownerName}
                    </span>

                    {item.displaySoldRatioPercent != null && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                        {item.displaySoldRatioPercent.toFixed(0)}% đã bán
                      </span>
                    )}
                  </div>

                  <div className="text-xs text-slate-600 font-medium">
                    {item.totalPropertiesListed} căn rao · {item.soldPropertiesCount} đã bán · {item.activePropertiesCount} đang bán
                  </div>

                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={() => handleDrillDown(item.drillDownFilter)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                    >
                      <span>Xem {item.totalPropertiesListed} căn</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
