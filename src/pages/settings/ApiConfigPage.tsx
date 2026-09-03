import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Save, Key, Sparkles, CheckCircle2, ShieldCheck } from "lucide-react";
import { settingsManager } from "../../data/local/settings-manager";

export const ApiConfigPage: React.FC = () => {
  const navigate = useNavigate();
  const current = settingsManager.getSettings();

  const [supabaseUrl, setSupabaseUrl] = useState(current.supabaseUrl);
  const [supabaseAnonKey, setSupabaseAnonKey] = useState(current.supabaseAnonKey);
  const [geminiApiKey, setGeminiApiKey] = useState(current.geminiApiKey);
  const [geminiModel, setGeminiModel] = useState(current.geminiModel);
  const [saved, setSaved] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    settingsManager.update({
      supabaseUrl: supabaseUrl.trim(),
      supabaseAnonKey: supabaseAnonKey.trim(),
      geminiApiKey: geminiApiKey.trim(),
      geminiModel: geminiModel
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="max-w-xl mx-auto px-4 py-4 md:py-6 pb-24 md:pb-12 space-y-4">
      {/* Top Bar */}
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-slate-600 hover:text-slate-900 text-sm font-medium transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Quay lại Cài đặt</span>
        </button>

        <h1 className="font-bold text-slate-800 text-base">Cấu hình API & AI</h1>
        <div className="w-8" />
      </div>

      {saved && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-emerald-800 text-xs md:text-sm animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Đã lưu thành công cấu hình API!</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-4">
        {/* Supabase Section */}
        <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-2xs space-y-3">
          <div className="flex items-center gap-2 text-blue-700 font-bold text-sm border-b border-slate-100 pb-2">
            <Key className="w-4 h-4" />
            <span>Kết nối Supabase Cloud Backend</span>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Project URL
            </label>
            <input
              type="url"
              value={supabaseUrl}
              onChange={(e) => setSupabaseUrl(e.target.value)}
              placeholder="https://xyzcompany.supabase.co"
              className="w-full text-sm p-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white outline-hidden"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Anon Public API Key
            </label>
            <input
              type="password"
              value={supabaseAnonKey}
              onChange={(e) => setSupabaseAnonKey(e.target.value)}
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
              className="w-full text-sm p-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white outline-hidden font-mono"
            />
          </div>
        </div>

        {/* Gemini AI Section */}
        <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-2xs space-y-3">
          <div className="flex items-center gap-2 text-purple-700 font-bold text-sm border-b border-slate-100 pb-2">
            <Sparkles className="w-4 h-4" />
            <span>Google Gemini AI (Bóc tách tin BĐS)</span>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Gemini API Key
            </label>
            <input
              type="password"
              value={geminiApiKey}
              onChange={(e) => setGeminiApiKey(e.target.value)}
              placeholder="AIzaSy..."
              className="w-full text-sm p-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white outline-hidden font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Model Model
            </label>
            <select
              value={geminiModel}
              onChange={(e) => setGeminiModel(e.target.value)}
              className="w-full text-sm p-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white outline-hidden"
            >
              <option value="gemini-1.5-flash">Gemini 1.5 Flash (Nhanh & Tối ưu)</option>
              <option value="gemini-1.5-pro">Gemini 1.5 Pro (Độ chính xác cao)</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl text-slate-500 text-xs">
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>API Key được lưu trữ cục bộ trên trình duyệt của bạn (Client-side encrypted/localStorage).</span>
        </div>

        <button
          type="submit"
          className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2"
        >
          <Save className="w-4 h-4" />
          <span>Lưu cấu hình API</span>
        </button>
      </form>
    </div>
  );
};
