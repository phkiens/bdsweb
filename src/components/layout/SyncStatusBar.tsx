import React, { useEffect, useState } from "react";
import { RefreshCw, CheckCircle, AlertCircle, WifiOff } from "lucide-react";
import { syncManager, SyncState } from "../../data/sync/sync-manager";

export const SyncStatusBar: React.FC = () => {
  const [state, setState] = useState<SyncState>("IDLE");
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    return syncManager.subscribe((newState, msg) => {
      setState(newState);
      if (msg) setMessage(msg);
    });
  }, []);

  const handleSyncNow = () => {
    syncManager.syncNow();
  };

  return (
    <div className="fixed bottom-18 md:bottom-4 right-4 z-30 flex items-center gap-2 bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-full shadow-md border border-slate-200 text-xs text-slate-700">
      {state === "SYNCING" && (
        <>
          <RefreshCw className="w-3.5 h-3.5 text-blue-600 animate-spin" />
          <span className="font-medium text-blue-600">Đang đồng bộ...</span>
        </>
      )}

      {state === "IDLE" && (
        <>
          <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
          <span className="text-slate-600">Đã cập nhật</span>
          <button
            onClick={handleSyncNow}
            className="ml-1 p-1 hover:bg-slate-100 rounded-full text-slate-500 hover:text-blue-600 transition-colors"
            title="Đồng bộ ngay"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
        </>
      )}

      {state === "CONFLICT" && (
        <>
          <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
          <span className="text-amber-700 font-medium">{message || "Xung đột dữ liệu"}</span>
          <button
            onClick={handleSyncNow}
            className="ml-1 text-blue-600 hover:underline font-medium"
            title="Đồng bộ lại"
          >
            Đồng bộ lại
          </button>
        </>
      )}

      {state === "ERROR" && (
        <>
          <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
          <span className="text-amber-700">{message || "Lỗi đồng bộ"}</span>
          <button
            onClick={handleSyncNow}
            className="ml-1 text-blue-600 hover:underline font-medium"
          >
            Thử lại
          </button>
        </>
      )}

      {state === "OFFLINE" && (
        <>
          <WifiOff className="w-3.5 h-3.5 text-red-500" />
          <span className="text-red-600">Ngoại tuyến</span>
        </>
      )}
    </div>
  );
};
