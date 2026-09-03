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
  ChevronRight,
  FileArchive
} from "lucide-react";
import { db } from "../../data/local/db";
import { syncManager } from "../../data/sync/sync-manager";
import { exportDatabaseToZip, importDatabaseFromZip } from "../../core/utils/zip-backup";

export const SettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [purging, setPurging] = useState(false);
  const [backupProgress, setBackupProgress] = useState<string | null>(null);

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

  const handleBackupZip = async () => {
    try {
      setBackupProgress("Đang khởi tạo tệp ZIP...");
      const blob = await exportDatabaseToZip(db, (msg) => setBackupProgress(msg));
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bds_backup_${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      setBackupProgress(null);
    } catch (e: any) {
      console.error("Backup ZIP error", e);
      setBackupProgress(null);
      alert(`Lỗi khi tạo tệp ZIP: ${e.message}`);
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

  const handleRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!window.confirm("Khôi phục dữ liệu sẽ ghi đè các bản ghi trùng lặp. Bạn có muốn tiếp tục?")) {
      return;
    }

    try {
      if (file.name.toLowerCase().endsWith(".zip")) {
        setBackupProgress("Đang giải nén và đọc tệp ZIP...");
        const res = await importDatabaseFromZip(file, db, (msg) => setBackupProgress(msg));
        setBackupProgress(null);
        alert(
          `Khôi phục tệp ZIP thành công!\n- Bất động sản: ${res.propertiesCount}\n- Khách hàng: ${res.customersCount}\n- Liên kết: ${res.linksCount}\n- Hình ảnh: ${res.imagesCount}`
        );
        window.location.reload();
      } else {
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

        alert("Khôi phục cơ sở dữ liệu từ file JSON thành công!");
        window.location.reload();
      }
    } catch (err: any) {
      setBackupProgress(null);
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

        {backupProgress && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800 flex items-center gap-2 animate-pulse">
            <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
            <span className="font-medium">{backupProgress}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={handleBackupZip}
            className="flex items-center justify-center gap-2 p-3 bg-blue-50 hover:bg-blue-100 text-blue-800 rounded-xl border border-blue-200 text-xs font-bold transition-colors cursor-pointer"
            title="Đóng gói tệp nén ZIP bao gồm cả JSON và hình ảnh tương thích với Android ZipHelper"
          >
            <FileArchive className="w-4 h-4 text-blue-600" />
            <span>Sao lưu tệp ZIP (Chuẩn Android)</span>
          </button>

          <label className="cursor-pointer flex items-center justify-center gap-2 p-3 bg-slate-50 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 rounded-xl border border-slate-200 hover:border-emerald-200 text-xs font-bold transition-colors">
            <Upload className="w-4 h-4 text-emerald-600" />
            <span>Khôi phục (.zip / .json)</span>
            <input
              type="file"
              accept=".zip,.json"
              onChange={handleRestoreFile}
              className="hidden"
            />
          </label>
        </div>

        <button
          onClick={handleBackupJson}
          className="w-full flex items-center justify-center gap-2 p-2.5 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl border border-slate-200 text-xs font-semibold transition-colors cursor-pointer"
          title="Sao lưu nhanh thành một tệp JSON văn bản"
        >
          <Download className="w-4 h-4 text-slate-500" />
          <span>Sao lưu tệp JSON đơn lẻ</span>
        </button>

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
