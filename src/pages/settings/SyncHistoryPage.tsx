import React from "react";
import { useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, CheckCircle2, AlertTriangle, Trash2 } from "lucide-react";
import { db } from "../../data/local/db";

export const SyncHistoryPage: React.FC = () => {
  const navigate = useNavigate();

  const logs = useLiveQuery(() => {
    return db.sync_logs.reverse().limit(100).toArray();
  }, []);

  const handleClearLogs = async () => {
    if (!window.confirm("Bạn có chắc muốn xóa sạch lịch sử nhật ký đồng bộ?")) return;
    await db.sync_logs.clear();
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-4 md:py-6 pb-24 md:pb-12 space-y-4">
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-slate-600 hover:text-slate-900 text-sm font-medium transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Quay lại Cài đặt</span>
        </button>

        <h1 className="font-bold text-slate-800 text-base">Lịch sử đồng bộ</h1>

        <button
          onClick={handleClearLogs}
          className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg"
          title="Xóa nhật ký"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {logs === undefined ? (
        <div className="flex items-center justify-center min-h-[40vh]">
          <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
        </div>
      ) : logs.length === 0 ? (
        <div className="text-center py-16 bg-white border border-slate-200 rounded-2xl shadow-xs text-xs text-slate-400">
          Chưa có bản ghi nhật ký đồng bộ nào.
        </div>
      ) : (
        <div className="space-y-2">
          {logs.map((item) => (
            <div
              key={item.id}
              className="p-3 bg-white border border-slate-200 rounded-xl shadow-2xs flex items-start gap-3"
            >
              {item.status === "SUCCESS" ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-xs text-slate-800">
                    {item.tag || "Hệ thống"} · {item.type}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {new Date(item.timestamp).toLocaleTimeString("vi-VN")}{" "}
                    {new Date(item.timestamp).toLocaleDateString("vi-VN")}
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-0.5">{item.message}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
