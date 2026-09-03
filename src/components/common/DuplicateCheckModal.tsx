import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { X, Search, CheckCircle2, AlertTriangle, ExternalLink, Plus } from "lucide-react";
import { COORD_DELTA, parseVietnamCoordinates } from "../../core/utils/coordinates";
import { db } from "../../data/local/db";
import { Property } from "../../core/models/property";

interface DuplicateCheckModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialText?: string;
}

export const DuplicateCheckModal: React.FC<DuplicateCheckModalProps> = ({
  isOpen,
  onClose,
  initialText = ""
}) => {
  const navigate = useNavigate();
  const [inputText, setInputText] = useState(initialText);
  const [coords, setCoords] = useState<[number, number] | null>(null);
  const [matches, setMatches] = useState<Property[]>([]);
  const [searched, setSearched] = useState(false);

  if (!isOpen) return null;

  const handleCheck = async () => {
    setSearched(true);
    const parsed = parseVietnamCoordinates(inputText);

    if (!parsed) {
      setCoords(null);
      setMatches([]);
      return;
    }

    setCoords(parsed);
    const [lat, lng] = parsed;

    // Truy vấn Room / Dexie DB theo dung sai 0.000005
    const results = await db.properties
      .filter((p) => {
        if (p.isDeleted || p.latitude === null || p.longitude === null) return false;
        return (
          Math.abs(p.latitude - lat) <= COORD_DELTA &&
          Math.abs(p.longitude - lng) <= COORD_DELTA
        );
      })
      .toArray();

    setMatches(results);
  };

  const handleAddOfficial = () => {
    onClose();
    if (coords) {
      navigate(`/properties/new?lat=${coords[0]}&lng=${coords[1]}`);
    } else {
      navigate(`/properties/new`);
    }
  };

  const handleAddUnverified = () => {
    onClose();
    if (coords) {
      navigate(`/properties/new?isVerified=false&lat=${coords[0]}&lng=${coords[1]}`);
    } else {
      navigate(`/properties/new?isVerified=false`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Search className="w-5 h-5 text-blue-600" />
            <h3 className="font-semibold text-slate-800 text-base">Kiểm tra trùng BĐS</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 flex-1 overflow-y-auto space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
              Dán nội dung tin đăng, tọa độ hoặc link Google Maps:
            </label>
            <textarea
              rows={3}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Ví dụ: 10.7769, 106.7009 hoặc https://maps.app.goo.gl/..."
              className="w-full text-sm p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-hidden transition-all placeholder:text-slate-400"
            />
          </div>

          <button
            onClick={handleCheck}
            className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm rounded-xl transition-colors shadow-xs flex items-center justify-center gap-2"
          >
            <Search className="w-4 h-4" />
            <span>Kiểm tra tọa độ</span>
          </button>

          {searched && (
            <div className="pt-2 border-t border-slate-100">
              {!coords ? (
                <div className="flex items-start gap-2.5 p-3.5 bg-amber-50 rounded-xl text-amber-800 text-xs md:text-sm">
                  <AlertTriangle className="w-5 h-5 shrink-0 text-amber-600 mt-0.5" />
                  <div>
                    <span className="font-semibold">Không tìm thấy tọa độ hợp lệ!</span>
                    <p className="text-amber-700 mt-0.5">
                      Vui lòng đảm bảo văn bản chứa cặp số vĩ độ, kinh độ Việt Nam hoặc liên kết bản đồ.
                    </p>
                  </div>
                </div>
              ) : matches.length > 0 ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-rose-600 text-sm font-semibold">
                    <AlertTriangle className="w-4 h-4" />
                    <span>Đã phát hiện {matches.length} BĐS trùng vị trí (bán kính ~1m):</span>
                  </div>

                  <div className="space-y-2">
                    {matches.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => {
                          onClose();
                          navigate(`/properties/${item.id}`);
                        }}
                        className="p-3 border border-slate-200 hover:border-blue-300 bg-slate-50 hover:bg-blue-50/50 rounded-xl cursor-pointer transition-all flex items-center justify-between"
                      >
                        <div>
                          <div className="font-medium text-slate-800 text-sm">{item.area || "Chưa rõ khu vực"}</div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {item.price} tỷ · {item.propertyType} · {item.status}
                          </div>
                        </div>
                        <ExternalLink className="w-4 h-4 text-blue-600" />
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-start gap-2.5 p-3.5 bg-emerald-50 rounded-xl text-emerald-800 text-xs md:text-sm">
                    <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600 mt-0.5" />
                    <div>
                      <span className="font-semibold">Vị trí chưa có trong hệ thống!</span>
                      <p className="text-emerald-700 mt-0.5">
                        Tọa độ: {coords[0].toFixed(5)}, {coords[1].toFixed(5)}. Bạn có thể tạo sản phẩm mới ngay tại vị trí này.
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={handleAddOfficial}
                      className="flex-1 py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Thêm BĐS chính thức</span>
                    </button>
                    <button
                      onClick={handleAddUnverified}
                      className="flex-1 py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors border border-slate-200"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Thêm tin chờ</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
