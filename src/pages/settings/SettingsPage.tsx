import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Settings,
  RefreshCw,
  Key,
  History,
  Download,
  Upload,
  Trash2,
  CheckCircle2,
  Database,
  ChevronRight
} from "lucide-react";
import { db } from "../../data/local/db";
import { syncManager } from "../../data/sync/sync-manager";

export const SettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [purging, setPurging] = useState(false);

  const handleSyncNow = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const ok = await syncManager.syncNow();
      if (ok) {
        setSyncResult("Đồng bộ dữ liệu thành công!");
      } else {
        setSyncResult("Đồng bộ gặp lỗi hoặc thiết bị đang ngoại tuyến.");
      }
    } catch (e: any) {
      setSyncResult(`Lỗi: ${e.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleBackupJson = async () => {
    try {
      const properties = await db.properties.toArray();
      const customers = await db.customers.toArray();
      const links = await db.customer_property_links.toArray();

      const backupData = {
        version: 1,
        exportedAt: new Date().toISOString(),
        properties,
        customers,
        links
      };

      const jsonStr = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bds_backup_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Backup error", e);
      alert("Lỗi khi tạo file sao lưu.");
    }
  };

  const handleRestoreJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!window.confirm("Khôi phục dữ liệu sẽ ghi đè các bản ghi trùng lặp. Bạn có muốn tiếp tục?")) {
      return;
    }

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (data.properties && Array.isArray(data.properties)) {
        await db.properties.bulkPut(data.properties);
      }
      if (data.customers && Array.isArray(data.customers)) {
        await db.customers.bulkPut(data.customers);
      }
      if (data.links && Array.isArray(data.links)) {
        await db.customer_property_links.bulkPut(data.links);
      }

      alert("Khôi phục cơ sở dữ liệu thành công!");
      window.location.reload();
    } catch (err: any) {
      console.error("Restore error", err);
      alert(`Khôi phục thất bại: ${err.message}`);
    }
  };

  const handlePurgeDeleted = async () => {
    if (!window.confirm("Bạn có chắc muốn dọn dẹp vĩnh viễn các bản ghi đã xóa quá 30 ngày?")) return;
    setPurging(true);
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const count = await db.purgeDeletedOlderThan(thirtyDaysAgo);
    setPurging(false);
    alert(`Đã xóa vĩnh viễn ${count} bản ghi cũ.`);
  };

  const handleSeedDemoData = async () => {
    if (!window.confirm("Nạp 5 BĐS và 3 khách hàng mẫu vào CSDL? Dữ liệu hiện có sẽ được cập nhật.")) return;
    const { seedInitialData } = await import("../../data/local/seed");
    const result = await seedInitialData(db);
    alert(`Đã nạp thành công: ${result.propertiesCount} BĐS, ${result.customersCount} khách hàng mẫu.`);
    window.location.reload();
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-4 md:py-6 pb-24 md:pb-12 space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <Settings className="w-6 h-6 text-slate-700" />
          <span>Cài Đặt Hệ Thống</span>
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Quản lý đồng bộ, cấu hình API, sao lưu và dữ liệu ngoại tuyến
        </p>
      </div>

      {/* Sync Card */}
      <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-2xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <RefreshCw className={`w-5 h-5 ${syncing ? "animate-spin" : ""}`} />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-sm md:text-base">Đồng Bộ Ngay</h3>
              <p className="text-xs text-slate-500">Đẩy và kéo dữ liệu tức thời với Supabase</p>
            </div>
          </div>

          <button
            onClick={handleSyncNow}
            disabled={syncing}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors disabled:opacity-50"
          >
            {syncing ? "Đang đồng bộ..." : "Đồng bộ ngay"}
          </button>
        </div>

        {syncResult && (
          <div className="p-3 bg-slate-50 rounded-xl text-xs flex items-center gap-2 text-slate-700">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{syncResult}</span>
          </div>
        )}
      </div>

      {/* Navigation Settings Options */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xs divide-y divide-slate-100 overflow-hidden">
        <button
          onClick={() => navigate("/settings/api-config")}
          className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition-colors text-left"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <Key className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-800">Cấu hình API & Gemini AI</div>
              <div className="text-xs text-slate-500">Thiết lập Supabase Key, Gemini API Key</div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400" />
        </button>

        <button
          onClick={() => navigate("/settings/sync-history")}
          className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition-colors text-left"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <History className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-800">Lịch sử đồng bộ</div>
              <div className="text-xs text-slate-500">Xem nhật ký các lần push/pull dữ liệu</div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400" />
        </button>
      </div>

      {/* Backup & Restore */}
      <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-2xs space-y-4">
        <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
          <Database className="w-4 h-4 text-blue-600" />
          <span>Sao lưu & Phục hồi cơ sở dữ liệu</span>
        </h3>

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={handleBackupJson}
            className="flex items-center justify-center gap-2 p-3 bg-slate-50 hover:bg-blue-50 text-slate-700 hover:text-blue-700 rounded-xl border border-slate-200 text-xs font-semibold transition-colors"
          >
            <Download className="w-4 h-4 text-blue-600" />
            <span>Sao lưu file JSON</span>
          </button>

          <label className="cursor-pointer flex items-center justify-center gap-2 p-3 bg-slate-50 hover:bg-blue-50 text-slate-700 hover:text-blue-700 rounded-xl border border-slate-200 text-xs font-semibold transition-colors">
            <Upload className="w-4 h-4 text-blue-600" />
            <span>Khôi phục JSON</span>
            <input
              type="file"
              accept=".json"
              onChange={handleRestoreJson}
              className="hidden"
            />
          </label>
        </div>

        <button
          onClick={handlePurgeDeleted}
          disabled={purging}
          className="w-full flex items-center justify-center gap-2 p-2.5 bg-red-50 hover:bg-red-100 text-red-700 rounded-xl text-xs font-semibold transition-colors"
        >
          <Trash2 className="w-4 h-4" />
          <span>Dọn dẹp vĩnh viễn dữ liệu xóa mềm quá 30 ngày</span>
        </button>

        <button
          onClick={handleSeedDemoData}
          className="w-full flex items-center justify-center gap-2 p-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-xs font-semibold transition-colors"
        >
          <Database className="w-4 h-4" />
          <span>Nạp dữ liệu mẫu cố định (5 BĐS, 3 Khách hàng)</span>
        </button>
      </div>

      {/* App Version Info */}
      <div className="text-center text-xs text-slate-400 pt-4">
        BĐS Collector Web v1.0.0 (Behavioral Parity Edition) · IndexedDB v30
      </div>
    </div>
  );
};
