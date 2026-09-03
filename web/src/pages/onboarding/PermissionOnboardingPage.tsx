import React from "react";
import { useNavigate } from "react-router-dom";
import { MapPin, RefreshCw, ArrowRight, ShieldCheck, Database } from "lucide-react";
import { settingsManager } from "../../data/local/settings-manager";

export const PermissionOnboardingPage: React.FC = () => {
  const navigate = useNavigate();

  const handleStart = () => {
    settingsManager.update({ hasShownOnboarding: true });
    navigate("/properties");
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-3xl shadow-xl max-w-md w-full p-6 md:p-8 space-y-6">
        {/* Logo & Title */}
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-blue-600 text-white font-black text-2xl rounded-2xl flex items-center justify-center mx-auto shadow-md">
            B
          </div>
          <h1 className="text-xl md:text-2xl font-black text-slate-900">
            BĐS Collector Web
          </h1>
          <p className="text-xs md:text-sm text-slate-500">
            Ứng dụng quản lý bất động sản thực địa dành cho môi giới BĐS Việt Nam
          </p>
        </div>

        {/* Core Capabilities Highlights */}
        <div className="space-y-3.5">
          <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-2xl">
            <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-800">Hoạt động ngoại tuyến 100% (Offline-First)</h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Dữ liệu được lưu trữ trực tiếp trên thiết bị (IndexedDB). Hoàn toàn sử dụng được khi mất mạng.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-2xl">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-800">Định vị thực địa & Chống trùng</h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Lấy tọa độ GPS chính xác, phát hiện trùng lặp trong bán kính 1m và tối ưu lộ trình khảo sát.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-2xl">
            <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
              <RefreshCw className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-800">Đồng bộ hai chiều Supabase Realtime</h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Tự động hội tụ dữ liệu đa thiết bị với cơ chế bảo vệ chống ghi đè phiên bản cũ.
              </p>
            </div>
          </div>
        </div>

        {/* CTA Button */}
        <button
          onClick={handleStart}
          className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-2xl shadow-md transition-all flex items-center justify-center gap-2 group"
        >
          <span>Bắt đầu sử dụng ngay</span>
          <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
        </button>

        <div className="text-center">
          <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Kế thừa nguyên bản kiến trúc và dữ liệu từ Android Native</span>
          </span>
        </div>
      </div>
    </div>
  );
};
