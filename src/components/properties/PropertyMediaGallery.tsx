import React, { useEffect, useState } from "react";
import { Camera, Download, Loader2, Plus, Trash2, Upload, ExternalLink, Image as ImageIcon } from "lucide-react";
import { Property } from "../../core/models/property";
import { mediaService } from "../../data/media/media-service";
import { parseR2MediaKeys, R2MediaItem } from "../../data/remote/r2-media-client";

interface PropertyMediaGalleryProps {
  property: Property;
  onUpdated?: () => void;
}

interface ImageItemState {
  item?: R2MediaItem;
  srcUrl: string | null;
  loading: boolean;
  error?: string;
  isLegacyLocal?: boolean;
}

export const PropertyMediaGallery: React.FC<PropertyMediaGalleryProps> = ({
  property,
  onUpdated
}) => {
  const [imageStates, setImageStates] = useState<ImageItemState[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{
    current: number;
    total: number;
    message: string;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedPreview, setSelectedPreview] = useState<string | null>(null);

  const r2Items: R2MediaItem[] = parseR2MediaKeys(property.r2MediaKeys);
  const legacyImages: string[] = property.imagePath
    ? property.imagePath.split("|||").filter(Boolean)
    : [];

  // Tải URL cho các ảnh R2 hoặc fallback legacy images
  useEffect(() => {
    let isCancelled = false;

    async function loadUrls() {
      if (r2Items.length > 0) {
        // Khởi tạo trạng thái đang tải cho các ảnh R2
        const initial: ImageItemState[] = r2Items.map((item) => ({
          item,
          srcUrl: null,
          loading: true
        }));
        setImageStates(initial);

        // Ký URL song song
        const resolved = await Promise.all(
          r2Items.map(async (item) => {
            try {
              const url = await mediaService.resolveImageUrl(property.id, item);
              return {
                item,
                srcUrl: url,
                loading: false,
                error: url ? undefined : "Không thể tạo URL tải ảnh"
              };
            } catch (err: any) {
              return {
                item,
                srcUrl: null,
                loading: false,
                error: err?.message || "Lỗi tải ảnh"
              };
            }
          })
        );

        if (!isCancelled) {
          setImageStates(resolved);
        }
      } else if (legacyImages.length > 0) {
        // Fallback sang ảnh cục bộ/object URL cũ
        setImageStates(
          legacyImages.map((src) => ({
            srcUrl: src,
            loading: false,
            isLegacyLocal: true
          }))
        );
      } else {
        setImageStates([]);
      }
    }

    loadUrls();

    return () => {
      isCancelled = true;
    };
  }, [property.id, property.r2MediaKeys, property.imagePath]);

  // Xử lý upload ảnh mới
  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const files = Array.from(e.target.files);
    e.target.value = ""; // reset input

    setUploading(true);
    setErrorMessage(null);

    const result = await mediaService.uploadPropertyImages(
      property,
      files,
      (current, total, message) => {
        setUploadProgress({ current, total, message });
      }
    );

    setUploading(false);
    setUploadProgress(null);

    if (!result.success) {
      setErrorMessage(result.error || "Tải ảnh lên R2 thất bại");
    } else {
      if (onUpdated) onUpdated();
    }
  };

  // Xử lý xóa ảnh
  const handleDeleteImage = async (item: R2MediaItem) => {
    if (!window.confirm("Bạn có chắc chắn muốn xóa ảnh này khỏi BĐS?")) return;

    const res = await mediaService.deletePropertyImage(property.id, item.objectKey);
    if (!res.success) {
      alert(`Xóa ảnh thất bại: ${res.error}`);
    } else {
      if (onUpdated) onUpdated();
    }
  };

  // Tải tất cả ảnh về máy
  const handleDownloadAll = () => {
    imageStates.forEach((st, idx) => {
      if (st.srcUrl) {
        const link = document.createElement("a");
        link.href = st.srcUrl;
        link.download = `bds_${property.id}_img_${idx + 1}.jpg`;
        link.target = "_blank";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    });
  };

  const totalCount = imageStates.length;

  return (
    <div className="mb-4 p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Camera className="w-4 h-4 text-blue-600" />
          <h3 className="font-semibold text-slate-800 text-xs uppercase tracking-wider">
            Hình ảnh thực tế ({totalCount})
          </h3>
          {r2Items.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-50 text-sky-700 border border-sky-200">
              Cloudflare R2
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {totalCount > 0 && (
            <button
              onClick={handleDownloadAll}
              className="flex items-center gap-1 text-xs text-slate-600 hover:text-blue-700 font-semibold px-2 py-1 rounded-lg hover:bg-slate-100 transition-colors"
              title="Tải toàn bộ ảnh BĐS về máy"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Tải tất cả</span>
            </button>
          )}

          <label className="cursor-pointer flex items-center gap-1 text-xs text-white bg-blue-600 hover:bg-blue-700 font-semibold px-2.5 py-1.5 rounded-xl shadow-xs transition-colors disabled:opacity-50">
            <Plus className="w-3.5 h-3.5" />
            <span>Thêm ảnh</span>
            <input
              type="file"
              multiple
              accept="image/jpeg,image/png,video/mp4"
              onChange={handleFileInputChange}
              disabled={uploading}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {/* Progress / Status banner */}
      {uploading && uploadProgress && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl space-y-1.5 animate-in fade-in">
          <div className="flex items-center justify-between text-xs text-blue-900 font-medium">
            <span className="flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
              <span>{uploadProgress.message}</span>
            </span>
            <span>
              {uploadProgress.current}/{uploadProgress.total}
            </span>
          </div>
          <div className="w-full bg-blue-200 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-blue-600 h-1.5 transition-all duration-300 rounded-full"
              style={{
                width: `${Math.round((uploadProgress.current / uploadProgress.total) * 100)}%`
              }}
            />
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
          {errorMessage}
        </div>
      )}

      {/* Media Grid */}
      {totalCount > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
          {imageStates.map((st, idx) => (
            <div
              key={st.item?.objectKey || idx}
              className="group relative aspect-4/3 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 shadow-2xs"
            >
              {st.loading ? (
                <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 text-slate-400">
                  <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                  <span className="text-[10px]">Đang tải...</span>
                </div>
              ) : st.srcUrl ? (
                <>
                  <img
                    src={st.srcUrl}
                    alt={`BĐS ${property.area} ${idx + 1}`}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200 cursor-pointer"
                    onClick={() => setSelectedPreview(st.srcUrl)}
                  />

                  {/* Overlay buttons */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <a
                      href={st.srcUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 bg-white/90 hover:bg-white text-slate-800 rounded-lg transition-transform hover:scale-110 shadow-xs"
                      title="Mở ảnh gốc"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>

                    <a
                      href={st.srcUrl}
                      download={`bds_${property.id}_img_${idx + 1}.jpg`}
                      className="p-1.5 bg-white/90 hover:bg-white text-slate-800 rounded-lg transition-transform hover:scale-110 shadow-xs"
                      title="Tải ảnh"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </a>

                    {st.item && (
                      <button
                        onClick={() => handleDeleteImage(st.item!)}
                        className="p-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-transform hover:scale-110 shadow-xs"
                        title="Xóa ảnh này"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center text-slate-400">
                  <ImageIcon className="w-5 h-5 mb-1" />
                  <span className="text-[10px] text-red-500">{st.error || "Lỗi ảnh"}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-6 border border-dashed border-slate-200 rounded-xl space-y-1.5 bg-slate-50/50">
          <ImageIcon className="w-6 h-6 text-slate-300 mx-auto" />
          <div className="text-xs text-slate-500 font-medium">Chưa có hình ảnh nào</div>
          <div className="text-[11px] text-slate-400">
            Bấm "Thêm ảnh" để tải ảnh thực tế lên Cloudflare R2
          </div>
        </div>
      )}

      {/* Modal xem trước ảnh phóng to */}
      {selectedPreview && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in"
          onClick={() => setSelectedPreview(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl">
            <img
              src={selectedPreview}
              alt="Preview"
              className="max-w-full max-h-[85vh] object-contain rounded-2xl"
            />
            <button
              onClick={() => setSelectedPreview(null)}
              className="absolute top-3 right-3 p-2 bg-black/60 hover:bg-black text-white rounded-full text-xs font-bold"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
