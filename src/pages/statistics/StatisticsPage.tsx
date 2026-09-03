import React from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { BarChart3, Building, Inbox, Users, CheckCircle, Clock } from "lucide-react";
import { db } from "../../data/local/db";
import { PropertyStatus } from "../../core/models/enums";

export const StatisticsPage: React.FC = () => {
  const properties = useLiveQuery(() => db.properties.filter((p) => !p.isDeleted).toArray());
  const customers = useLiveQuery(() => db.customers.filter((c) => !c.isDeleted).toArray());

  const totalProps = (properties || []).filter((p) => p.isVerified).length;
  const totalUnverified = (properties || []).filter((p) => !p.isVerified).length;
  const forSaleCount = (properties || []).filter((p) => p.status === PropertyStatus.FOR_SALE).length;
  const soldCount = (properties || []).filter((p) => p.status === PropertyStatus.SOLD).length;
  const totalCustomers = (customers || []).length;

  return (
    <div className="max-w-4xl mx-auto px-4 py-4 md:py-6 pb-24 md:pb-12 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-blue-600" />
          <span>Thống Kê Dữ Liệu Thực Địa</span>
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">Tổng quan số lượng và tiến độ khảo sát nguồn hàng</p>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs">
          <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold">
            <Building className="w-4 h-4 text-blue-600" />
            <span>BĐS Chính Thức</span>
          </div>
          <div className="text-2xl font-black text-slate-900 mt-2">{totalProps}</div>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs">
          <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold">
            <Inbox className="w-4 h-4 text-amber-600" />
            <span>Tin Chờ Khảo Sát</span>
          </div>
          <div className="text-2xl font-black text-slate-900 mt-2">{totalUnverified}</div>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs">
          <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold">
            <Users className="w-4 h-4 text-indigo-600" />
            <span>Khách Hàng (CRM)</span>
          </div>
          <div className="text-2xl font-black text-slate-900 mt-2">{totalCustomers}</div>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs">
          <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold">
            <CheckCircle className="w-4 h-4 text-emerald-600" />
            <span>Đang Bán (Active)</span>
          </div>
          <div className="text-2xl font-black text-slate-900 mt-2">{forSaleCount}</div>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs">
          <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold">
            <Clock className="w-4 h-4 text-slate-600" />
            <span>Đã Bán (Sold)</span>
          </div>
          <div className="text-2xl font-black text-slate-900 mt-2">{soldCount}</div>
        </div>
      </div>
    </div>
  );
};
