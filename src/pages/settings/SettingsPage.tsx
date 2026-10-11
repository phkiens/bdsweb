import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Settings,
  RefreshCw,
  History,
  Database,
  ChevronRight,
  FileArchive,
  BarChart3,
  TrendingDown,
  AlertTriangle,
  Map as MapIcon,
  Code2,
  Image,
  Layers,
  X,
  Play,
  RotateCcw,
  Check,
  AlertCircle
} from "lucide-react";
import { db } from "../../data/local/db";
import { CustomerPropertyRole, PropertyType, PropertyStatus } from "../../core/models/enums";
import {
  exportDatabaseToZip,
  importPhotosFromZip,
  importTextFromZip
} from "../../core/utils/zip-backup";
import { ActionCenterCalculator } from "../../core/statistics/action-center-calculator";
import { StatisticsFilter } from "../../core/statistics/statistics-filter";
import {
  settingsManager,
  FilterMode,
  ZOOM_KEEP_CURRENT,
  MAP_ZOOM_SCOPES,
  MAP_RADIUS_DEFAULTS,
  GPS_LOCATE_ZOOM_LIST,
  getMapZoomScope,
  getMapRadiusDefault,
  formatZoomDisplayLabel
} from "../../data/local/settings-manager";
import { parseRawText, getDistinctAreas } from "../../core/engine/property-text-extractor";

interface SingleChoiceOption<T> {
  value: T;
  label: string;
  hint?: string;
}

interface SingleChoiceDialogProps<T> {
  title: string;
  options: SingleChoiceOption<T>[];
  selected: T;
  onSelect: (value: T) => void;
  onClose: () => void;
}

const SingleChoiceDialog = <T,>({
  title,
  options,
  selected,
  onSelect,
  onClose
}: SingleChoiceDialogProps<T>) => {
  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-3 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
          <h3 className="font-bold text-slate-800 text-base">{title}</h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-1 max-h-[60vh] overflow-y-auto py-1">
          {options.map((opt, idx) => {
            const isChosen = opt.value === selected;
            return (
              <label
                key={idx}
                onClick={() => {
                  onSelect(opt.value);
                  onClose();
                }}
                className={`flex items-start gap-3 p-3 rounded-xl cursor-pointer transition-colors ${
                  isChosen ? "bg-blue-50/70 border border-blue-200" : "hover:bg-slate-50 border border-transparent"
                }`}
              >
                <input
                  type="radio"
                  name={title}
                  checked={isChosen}
                  onChange={() => {
                    onSelect(opt.value);
                    onClose();
                  }}
                  className="mt-0.5 text-blue-600 focus:ring-blue-500"
                />
                <div className="flex-1">
                  <div className={`text-sm font-semibold ${isChosen ? "text-blue-900" : "text-slate-800"}`}>
                    {opt.label}
                  </div>
                  {opt.hint && (
                    <div className="text-xs text-slate-500 mt-0.5 leading-snug">
                      {opt.hint}
                    </div>
                  )}
                </div>
              </label>
            );
          })}
        </div>

        <div className="flex justify-end pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};

export const SettingsPage: React.FC = () => {
  const navigate = useNavigate();

  // Settings State
  const [settings, setSettings] = useState(() => settingsManager.getSettings());
  const [backupProgress, setBackupProgress] = useState<string | null>(null);
  const [issueCount, setIssueCount] = useState<number>(0);

  // Modals
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [mapModalOpen, setMapModalOpen] = useState(false);
  const [regexModalOpen, setRegexModalOpen] = useState(false);

  // Map SingleChoiceDialog states
  const [showMapZoomDialog, setShowMapZoomDialog] = useState(false);
  const [showMapRadiusDialog, setShowMapRadiusDialog] = useState(false);
  const [showGpsZoomDialog, setShowGpsZoomDialog] = useState(false);
  const [showCoordinatePickerZoomDialog, setShowCoordinatePickerZoomDialog] = useState(false);
  const [showPropertyZoomDialog, setShowPropertyZoomDialog] = useState(false);
  const [showMapLinkZoomDialog, setShowMapLinkZoomDialog] = useState(false);

  // Hidden File Inputs for Zip Import
  const photoInputRef = useRef<HTMLInputElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);

  // Filter Modal local draft
  const [draftFilterMode, setDraftFilterMode] = useState<FilterMode>(
    settings.rememberLastFilter
      ? FilterMode.LAST_USED
      : (settings.defaultPropertyType || settings.defaultStatus)
      ? FilterMode.FIXED
      : FilterMode.ALL
  );
  const [draftDefaultType, setDraftDefaultType] = useState(settings.defaultPropertyType || "");
  const [draftDefaultStatus, setDraftDefaultStatus] = useState(settings.defaultStatus || "");

  // Regex Modal local draft
  const [draftRegexText, setDraftRegexText] = useState(settingsManager.getActiveRegexJson());
  const [regexValidationMsg, setRegexValidationMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [testListingText, setTestListingText] = useState("");
  const [testExtractResult, setTestExtractResult] = useState<any | null>(null);

  // Subscribe to settings changes
  useEffect(() => {
    return settingsManager.subscribe((newSettings) => {
      setSettings(newSettings);
    });
  }, []);

  // Tính số mục "Cần xử lý" 1 lần khi mở trang bằng ActionCenterCalculator (giống Android)
  useEffect(() => {
    let isMounted = true;
    const calculateActionItems = async () => {
      try {
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

        if (isMounted) {
          setIssueCount(items.length);
        }
      } catch (err) {
        console.error("Failed to calculate action items count", err);
      }
    };

    calculateActionItems();
    return () => {
      isMounted = false;
    };
  }, []);

  // ZIP EXPORT
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

  // ZIP IMPORT: PHOTOS ONLY
  const handleImportPhotosFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setBackupProgress("Đang giải nén và nhập hình ảnh...");
      const res = await importPhotosFromZip(file, db, (msg) => setBackupProgress(msg));
      setBackupProgress(null);
      alert(res.message);
    } catch (err: any) {
      setBackupProgress(null);
      console.error("Import photos error", err);
      alert(`Lỗi nhập ảnh: ${err.message}`);
    } finally {
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  };

  // ZIP IMPORT: TEXT ONLY (REQUIRES NETWORK)
  const handleImportTextFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setBackupProgress("Đang giải nén và kiểm tra dữ liệu chữ...");
      const res = await importTextFromZip(file, db, {
        onProgress: (msg) => setBackupProgress(msg)
      });
      setBackupProgress(null);
      alert(res.message);
    } catch (err: any) {
      setBackupProgress(null);
      console.error("Import text error", err);
      alert(`Lỗi nhập dữ liệu chữ: ${err.message}`);
    } finally {
      if (textInputRef.current) textInputRef.current.value = "";
    }
  };

  // FILTER MODAL ACTIONS
  const handleOpenFilterModal = () => {
    const currentMode = settings.rememberLastFilter
      ? FilterMode.LAST_USED
      : (settings.defaultPropertyType || settings.defaultStatus)
      ? FilterMode.FIXED
      : FilterMode.ALL;
    setDraftFilterMode(currentMode);
    setDraftDefaultType(settings.defaultPropertyType || "");
    setDraftDefaultStatus(settings.defaultStatus || "");
    setFilterModalOpen(true);
  };

  const handleSaveFilterModal = () => {
    if (draftFilterMode === FilterMode.LAST_USED) {
      settingsManager.updateFilterMode(FilterMode.LAST_USED);
    } else if (draftFilterMode === FilterMode.FIXED) {
      settingsManager.updateFilterMode(
        FilterMode.FIXED,
        draftDefaultType === "Tất cả" ? "" : draftDefaultType,
        draftDefaultStatus === "Tất cả" ? "" : draftDefaultStatus
      );
    } else {
      settingsManager.updateFilterMode(FilterMode.ALL, "", "");
    }
    setFilterModalOpen(false);
  };

  // MAP MODAL ACTIONS
  const handleOpenMapModal = () => {
    setMapModalOpen(true);
  };

  // REGEX MODAL ACTIONS
  const handleOpenRegexModal = () => {
    setDraftRegexText(settingsManager.getActiveRegexJson());
    setRegexValidationMsg(null);
    setTestListingText("");
    setTestExtractResult(null);
    setRegexModalOpen(true);
  };

  const handleValidateRegex = () => {
    const res = settingsManager.validateRegexJson(draftRegexText);
    if (res.valid) {
      setRegexValidationMsg({ ok: true, text: "Cú pháp JSON regex hợp lệ!" });
    } else {
      setRegexValidationMsg({ ok: false, text: res.error || "Cú pháp JSON regex không hợp lệ." });
    }
  };

  const handleResetDefaultRegex = () => {
    if (window.confirm("Khôi phục bộ regex bóc tách về cấu hình mặc định ban đầu?")) {
      const def = settingsManager.restoreDefaultRegex();
      setDraftRegexText(def);
      setRegexValidationMsg({ ok: true, text: "Đã khôi phục về bộ regex mặc định." });
    }
  };

  const handleRunTestExtract = async () => {
    if (!testListingText.trim()) {
      alert("Vui lòng nhập văn bản tin nhắn BĐS mẫu để chạy thử.");
      return;
    }
    const val = settingsManager.validateRegexJson(draftRegexText);
    if (!val.valid) {
      alert(`Không thể chạy thử vì JSON regex có lỗi: ${val.error}`);
      return;
    }
    try {
      const areas = await getDistinctAreas(db);
      const result = parseRawText(testListingText, areas, draftRegexText);
      setTestExtractResult(result);
    } catch (err: any) {
      alert(`Lỗi chạy thử: ${err.message}`);
    }
  };

  const handleSaveRegexModal = () => {
    const val = settingsManager.validateRegexJson(draftRegexText);
    if (!val.valid) {
      alert(`Không thể lưu vì JSON regex có lỗi: ${val.error}`);
      return;
    }
    settingsManager.saveCustomRegex(draftRegexText);
    setRegexModalOpen(false);
  };

  // Format Subtitles
  const currentFilterSubtitle = (() => {
    if (settings.rememberLastFilter) {
      return "Nhớ lần trước";
    }
    const typeStr = settings.defaultPropertyType?.trim() || "";
    const statusStr = settings.defaultStatus?.trim() || "";
    if (!typeStr && !statusStr) {
      return "Tất cả";
    }
    const displayType = typeStr || "Tất cả";
    const displayStatus = statusStr || "Tất cả";
    return `${displayType} · ${displayStatus}`;
  })();

  const currentMapSubtitle = `${getMapRadiusDefault(settings.mapDefaultRadius).displayName} · ${getMapZoomScope(settings.mapMinZoomScope).displayName}`;
  const currentRegexSubtitle = settings.customExtractionRegex ? "Đã tùy chỉnh" : "Mặc định hệ thống";

  return (
    <div className="max-w-2xl mx-auto px-4 py-4 md:py-6 pb-24 md:pb-12 space-y-5">
      {/* Hidden file inputs */}
      <input
        ref={photoInputRef}
        type="file"
        accept=".zip,application/zip"
        onChange={handleImportPhotosFile}
        className="hidden"
      />
      <input
        ref={textInputRef}
        type="file"
        accept=".zip,application/zip"
        onChange={handleImportTextFile}
        className="hidden"
      />

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <Settings className="w-6 h-6 text-slate-700" />
          <span>Cài Đặt Hệ Thống</span>
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Sao lưu, hiển thị, công cụ và nâng cao
        </p>
      </div>

      {backupProgress && (
        <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-2xl text-xs text-blue-800 flex items-center gap-2 animate-pulse">
          <RefreshCw className="w-4 h-4 animate-spin text-blue-600 shrink-0" />
          <span className="font-medium">{backupProgress}</span>
        </div>
      )}

      {/* 1. NHÓM SAO LƯU */}
      <div className="space-y-1.5">
        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">Sao lưu</div>
        <div className="bg-white border border-slate-200 rounded-2xl shadow-2xs divide-y divide-slate-100 overflow-hidden">
          {/* Xuất sao lưu ZIP */}
          <button
            onClick={handleBackupZip}
            className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition-colors text-left cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <FileArchive className="w-4 h-4" />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-800">Xuất sao lưu ZIP</div>
                <div className="text-xs text-slate-500">
                  {settings.lastZipExportTime || "Chưa xuất lần nào"}
                </div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </button>

          {/* Nhập ảnh từ ZIP */}
          <button
            onClick={() => photoInputRef.current?.click()}
            className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition-colors text-left cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                <Image className="w-4 h-4" />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-800">Nhập ảnh từ ZIP</div>
                <div className="text-xs text-slate-500">
                  {settings.lastZipImportTime ? `Lần nhập gần nhất: ${settings.lastZipImportTime}` : "Chỉ gắn ảnh vào BĐS hiện có"}
                </div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </button>

          {/* Nhập dữ liệu chữ từ ZIP */}
          <button
            onClick={() => textInputRef.current?.click()}
            className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition-colors text-left cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <Database className="w-4 h-4" />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-800">Nhập dữ liệu chữ từ ZIP</div>
                <div className="text-xs text-slate-500">Cần có mạng · Chỉ thêm bản ghi mới chưa có</div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </button>
        </div>
      </div>

      {/* 2. NHÓM HIỂN THỊ */}
      <div className="space-y-1.5">
        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">Hiển thị</div>
        <div className="bg-white border border-slate-200 rounded-2xl shadow-2xs divide-y divide-slate-100 overflow-hidden">
          {/* Bộ lọc khi mở danh sách */}
          <button
            onClick={handleOpenFilterModal}
            className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition-colors text-left cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center">
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-800">Bộ lọc khi mở danh sách</div>
                <div className="text-xs text-slate-500">{currentFilterSubtitle}</div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </button>


          {/* Bản đồ */}
          <button
            onClick={handleOpenMapModal}
            className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition-colors text-left cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center">
                <MapIcon className="w-4 h-4" />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-800">Bản đồ</div>
                <div className="text-xs text-slate-500">{currentMapSubtitle}</div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </button>
        </div>
      </div>

      {/* 3. NHÓM CÔNG CỤ */}
      <div className="space-y-1.5">
        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">Công cụ</div>
        <div className="bg-white border border-slate-200 rounded-2xl shadow-2xs divide-y divide-slate-100 overflow-hidden">
          <button
            onClick={() => navigate("/statistics")}
            className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition-colors text-left cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <BarChart3 className="w-4 h-4" />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-800">Thống kê</div>
                <div className="text-xs text-slate-500">Tổng quan và phân tích dữ liệu BĐS</div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </button>

          <button
            onClick={() => navigate("/price-drops")}
            className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition-colors text-left cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                <TrendingDown className="w-4 h-4" />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-800">Giá vừa giảm</div>
                <div className="text-xs text-slate-500">Danh sách BĐS vừa điều chỉnh giảm giá</div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </button>

          {issueCount > 0 && (
            <button
              onClick={() => navigate("/action-center")}
              className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition-colors text-left cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-800">Cần xử lý</div>
                  <div className="text-xs text-slate-500">Các việc cần chuẩn hóa dữ liệu</div>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
                  {issueCount} mục
                </span>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </div>
            </button>
          )}

        </div>
      </div>

      {/* 4. NHÓM NÂNG CAO */}
      <div className="space-y-1.5">
        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">Nâng cao</div>
        <div className="bg-white border border-slate-200 rounded-2xl shadow-2xs divide-y divide-slate-100 overflow-hidden">
          {/* Bộ regex bóc tách */}
          <button
            onClick={handleOpenRegexModal}
            className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition-colors text-left cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center">
                <Code2 className="w-4 h-4" />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-800">Bộ regex bóc tách</div>
                <div className="text-xs text-slate-500">{currentRegexSubtitle}</div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </button>

          <button
            onClick={() => navigate("/settings/sync-history")}
            className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition-colors text-left cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <History className="w-4 h-4" />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-800">Nhật ký đồng bộ</div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </button>

        </div>
      </div>

      {/* App Version Info */}
      <div className="text-center text-xs text-slate-400 pt-4">
        BĐS Collector Web · Android Behavioral Parity Edition · v30
      </div>

      {/* ==================== MODAL: BỘ LỌC KHI MỞ DANH SÁCH ==================== */}
      {filterModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-800 text-base">Bộ lọc khi mở danh sách</h3>
              <button
                onClick={() => setFilterModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              {/* Option 1: LAST_USED */}
              <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50">
                <input
                  type="radio"
                  name="filterMode"
                  value={FilterMode.LAST_USED}
                  checked={draftFilterMode === FilterMode.LAST_USED}
                  onChange={() => setDraftFilterMode(FilterMode.LAST_USED)}
                  className="mt-0.5 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <div className="text-sm font-semibold text-slate-800">Nhớ bộ lọc lần trước</div>
                  <div className="text-xs text-slate-500">Giữ nguyên bộ lọc đã áp dụng ở lần xem gần nhất</div>
                </div>
              </label>

              {/* Option 2: FIXED */}
              <label className="flex flex-col gap-2 p-3 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50">
                <div className="flex items-start gap-3">
                  <input
                    type="radio"
                    name="filterMode"
                    value={FilterMode.FIXED}
                    checked={draftFilterMode === FilterMode.FIXED}
                    onChange={() => setDraftFilterMode(FilterMode.FIXED)}
                    className="mt-0.5 text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <div className="text-sm font-semibold text-slate-800">Cố định theo lựa chọn</div>
                    <div className="text-xs text-slate-500">Luôn mở danh sách theo loại hình và trạng thái định sẵn</div>
                  </div>
                </div>

                {draftFilterMode === FilterMode.FIXED && (
                  <div className="pt-2 pl-7 space-y-2 border-t border-slate-100 mt-2">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Loại hình:</label>
                      <select
                        value={draftDefaultType}
                        onChange={(e) => setDraftDefaultType(e.target.value)}
                        className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg outline-hidden"
                      >
                        <option value="">Tất cả</option>
                        <option value={PropertyType.HOUSE}>Nhà</option>
                        <option value={PropertyType.LAND}>Đất</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Trạng thái:</label>
                      <select
                        value={draftDefaultStatus}
                        onChange={(e) => setDraftDefaultStatus(e.target.value)}
                        className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg outline-hidden"
                      >
                        <option value="">Tất cả</option>
                        <option value={PropertyStatus.FOR_SALE}>Đang bán</option>
                        <option value={PropertyStatus.SOLD}>Đã bán</option>
                      </select>
                    </div>
                  </div>
                )}
              </label>

              {/* Option 3: ALL */}
              <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50">
                <input
                  type="radio"
                  name="filterMode"
                  value={FilterMode.ALL}
                  checked={draftFilterMode === FilterMode.ALL}
                  onChange={() => setDraftFilterMode(FilterMode.ALL)}
                  className="mt-0.5 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <div className="text-sm font-semibold text-slate-800">Luôn hiện tất cả</div>
                  <div className="text-xs text-slate-500">Xóa sạch bộ lọc, luôn hiển thị toàn bộ kho hàng khi mở</div>
                </div>
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setFilterModalOpen(false)}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleSaveFilterModal}
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors cursor-pointer"
              >
                Xác nhận
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== MODAL: CÀI ĐẶT BẢN ĐỒ ==================== */}
      {mapModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-800 text-base">Bản đồ</h3>
              <button
                onClick={() => setMapModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="divide-y divide-slate-100 bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
              <button
                type="button"
                onClick={() => setShowMapZoomDialog(true)}
                className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition-colors text-left cursor-pointer"
              >
                <div>
                  <div className="text-sm font-semibold text-slate-800">Mức thu nhỏ tối đa</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {getMapZoomScope(settings.mapMinZoomScope).displayName}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </button>

              <button
                type="button"
                onClick={() => setShowMapRadiusDialog(true)}
                className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition-colors text-left cursor-pointer"
              >
                <div>
                  <div className="text-sm font-semibold text-slate-800">Bán kính quét mặc định</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {getMapRadiusDefault(settings.mapDefaultRadius).displayName}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </button>

              <button
                type="button"
                onClick={() => setShowGpsZoomDialog(true)}
                className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition-colors text-left cursor-pointer"
              >
                <div>
                  <div className="text-sm font-semibold text-slate-800">Zoom khi định vị</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {formatZoomDisplayLabel(settings.gpsLocateZoom)}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </button>

              <button
                type="button"
                onClick={() => setShowCoordinatePickerZoomDialog(true)}
                className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition-colors text-left cursor-pointer"
              >
                <div>
                  <div className="text-sm font-semibold text-slate-800">Zoom khi chọn vị trí</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {formatZoomDisplayLabel(settings.coordinatePickerZoom)}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </button>

              <button
                type="button"
                onClick={() => setShowPropertyZoomDialog(true)}
                className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition-colors text-left cursor-pointer"
              >
                <div>
                  <div className="text-sm font-semibold text-slate-800">Zoom khi tìm quanh BĐS</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {formatZoomDisplayLabel(settings.propertyNearbyZoom)}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </button>

              <button
                type="button"
                onClick={() => setShowMapLinkZoomDialog(true)}
                className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition-colors text-left cursor-pointer"
              >
                <div>
                  <div className="text-sm font-semibold text-slate-800">Zoom khi mở link Maps</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {formatZoomDisplayLabel(settings.mapLinkNearbyZoom)}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setMapModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SingleChoiceDialogs for Map settings */}
      {showMapZoomDialog && (
        <SingleChoiceDialog
          title="Mức thu nhỏ tối đa"
          options={MAP_ZOOM_SCOPES.map((s) => ({
            value: s.key,
            label: s.displayName,
            hint: s.hint
          }))}
          selected={settings.mapMinZoomScope ?? "DISTRICT"}
          onSelect={(scope) => settingsManager.update({ mapMinZoomScope: scope })}
          onClose={() => setShowMapZoomDialog(false)}
        />
      )}

      {showMapRadiusDialog && (
        <SingleChoiceDialog
          title="Bán kính quét mặc định"
          options={MAP_RADIUS_DEFAULTS.map((r) => ({
            value: r.radiusKm,
            label: r.displayName
          }))}
          selected={settings.mapDefaultRadius}
          onSelect={(radius) => settingsManager.update({ mapDefaultRadius: radius })}
          onClose={() => setShowMapRadiusDialog(false)}
        />
      )}

      {showGpsZoomDialog && (
        <SingleChoiceDialog
          title="Zoom khi định vị"
          options={GPS_LOCATE_ZOOM_LIST.map((z) => ({
            value: z.zoom,
            label: z.displayName,
            hint: z.hint
          }))}
          selected={settings.gpsLocateZoom}
          onSelect={(zoom) => settingsManager.update({ gpsLocateZoom: zoom })}
          onClose={() => setShowGpsZoomDialog(false)}
        />
      )}

      {showCoordinatePickerZoomDialog && (
        <SingleChoiceDialog
          title="Zoom khi chọn vị trí"
          options={GPS_LOCATE_ZOOM_LIST.map((z) => ({
            value: z.zoom,
            label: z.displayName,
            hint: z.hint
          }))}
          selected={settings.coordinatePickerZoom}
          onSelect={(zoom) => settingsManager.update({ coordinatePickerZoom: zoom })}
          onClose={() => setShowCoordinatePickerZoomDialog(false)}
        />
      )}

      {showPropertyZoomDialog && (
        <SingleChoiceDialog
          title="Zoom khi tìm quanh BĐS"
          options={[
            { value: ZOOM_KEEP_CURRENT, label: "Giữ nguyên góc nhìn" },
            ...GPS_LOCATE_ZOOM_LIST.map((z) => ({
              value: z.zoom,
              label: z.displayName,
              hint: z.hint
            }))
          ]}
          selected={settings.propertyNearbyZoom}
          onSelect={(zoom) => settingsManager.update({ propertyNearbyZoom: zoom })}
          onClose={() => setShowPropertyZoomDialog(false)}
        />
      )}

      {showMapLinkZoomDialog && (
        <SingleChoiceDialog
          title="Zoom khi mở link Maps"
          options={[
            { value: ZOOM_KEEP_CURRENT, label: "Giữ nguyên góc nhìn" },
            ...GPS_LOCATE_ZOOM_LIST.map((z) => ({
              value: z.zoom,
              label: z.displayName,
              hint: z.hint
            }))
          ]}
          selected={settings.mapLinkNearbyZoom}
          onSelect={(zoom) => settingsManager.update({ mapLinkNearbyZoom: zoom })}
          onClose={() => setShowMapLinkZoomDialog(false)}
        />
      )}

      {/* ==================== MODAL: BỘ REGEX BÓC TÁCH ==================== */}
      {regexModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full max-h-[92vh] overflow-y-auto p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Code2 className="w-5 h-5 text-violet-600" />
                <h3 className="font-bold text-slate-800 text-base">Bộ regex bóc tách tin BĐS</h3>
              </div>
              <button
                onClick={() => setRegexModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-700">JSON cấu hình biểu thức regex</label>
                <button
                  type="button"
                  onClick={handleResetDefaultRegex}
                  className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-blue-600 cursor-pointer font-medium"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Khôi phục mặc định</span>
                </button>
              </div>

              <textarea
                rows={10}
                value={draftRegexText}
                onChange={(e) => {
                  setDraftRegexText(e.target.value);
                  setRegexValidationMsg(null);
                }}
                className="w-full text-xs font-mono p-3 bg-slate-50 border border-slate-200 rounded-xl outline-hidden focus:ring-2 focus:ring-violet-500"
              />

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleValidateRegex}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-xs rounded-lg transition-colors cursor-pointer"
                >
                  Kiểm tra cú pháp JSON
                </button>

                {regexValidationMsg && (
                  <div className={`text-xs flex items-center gap-1 font-medium ${regexValidationMsg.ok ? "text-emerald-600" : "text-rose-600"}`}>
                    {regexValidationMsg.ok ? <Check className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                    <span>{regexValidationMsg.text}</span>
                  </div>
                )}
              </div>

              {/* Chạy thử bóc tách */}
              <div className="pt-3 border-t border-slate-100 space-y-2">
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <Play className="w-3.5 h-3.5 text-blue-600" />
                  <span>Chạy thử trên văn bản mẫu</span>
                </label>
                <textarea
                  rows={3}
                  value={testListingText}
                  onChange={(e) => setTestListingText(e.target.value)}
                  placeholder="Dán nội dung tin quảng cáo BĐS mẫu vào đây để thử bóc tách..."
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-hidden focus:ring-2 focus:ring-blue-500"
                />

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleRunTestExtract}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs rounded-lg transition-colors cursor-pointer"
                  >
                    Chạy thử bóc tách
                  </button>
                </div>

                {testExtractResult && (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
                    <div className="font-bold text-slate-700 mb-1 border-b border-slate-200 pb-1">Kết quả bóc tách:</div>
                    <div><span className="text-slate-500">Giá:</span> <b>{testExtractResult.price != null ? `${testExtractResult.price} tỷ` : "Chưa nhận diện"}</b></div>
                    <div><span className="text-slate-500">Diện tích:</span> <b>{testExtractResult.area != null ? `${testExtractResult.area} m²` : "Chưa nhận diện"}</b></div>
                    <div><span className="text-slate-500">Số điện thoại:</span> <b>{testExtractResult.ownerPhone || "Chưa nhận diện"}</b></div>
                    <div><span className="text-slate-500">Địa chỉ / Khu vực:</span> <b>{testExtractResult.address || "Chưa nhận diện"}</b></div>
                    <div><span className="text-slate-500">Hướng:</span> <b>{testExtractResult.direction || "Chưa nhận diện"}</b></div>
                    <div><span className="text-slate-500">Link Maps:</span> <b>{testExtractResult.mapLink || "Không có"}</b></div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setRegexModalOpen(false)}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleSaveRegexModal}
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors cursor-pointer"
              >
                Lưu regex
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
