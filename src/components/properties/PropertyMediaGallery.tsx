import React, { useEffect, useState } from "react";
import {
  Camera,
  Download,
  Loader2,
  Plus,
  Trash2,
  ExternalLink,
  Image as ImageIcon,
  ArrowLeft,
  ArrowRight,
  Star,
  Film,
  RotateCw
} from "lucide-react";
import { Property } from "../../core/models/property";
import { MediaItem } from "../../core/models/media";
import { mediaService } from "../../data/media/media-service";
import { confirmDialog } from "../common/confirm-dialog";
import { ImageLightbox, LightboxItem } from "../common/ImageLightbox";

interface PropertyMediaGalleryProps {
  property: Property;
  onUpdated?: () => void;
}

interface ImageItemState {
  item?: MediaItem;
  srcUrl: string | null;
  loading: boolean;
  error?: string;
}

async function resolveItem(propertyId: string, item: MediaItem): Promise<ImageItemState> {
  try {
    const url = await mediaService.resolveDisplayUrl(propertyId, item);
    return {
      item,
      srcUrl: url,
      loading: false,
      error: url ? undefined : mediaService.getImageUrlError(item) || "Không thể tạo URL xem media"
    };
  } catch (err: any) {
    return { item, srcUrl: null, loading: false, error: err?.message || "Lỗi tải media" };
  }
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
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [actionLoadingKey, setActionLoadingKey] = useState<string | null>(null);

  // Tải media theo phân cấp nghiêm ngặt (RPC -> fallback r2_media_keys -> fallback Drive nếu unmanaged)
  useEffect(() => {
    let isCancelled = false;

    async function loadMedia() {
      // Zero media semantics:
      if (property.r2MediaKeys === "[]") {
        if (!isCancelled) setImageStates([]);
        return;
      }

      try {
        const items = await mediaService.fetchPropertyMedia(property.id, property);

        if (isCancelled) return;

        if (items.length === 0) {
          setImageStates([]);
          return;
        }

        const initial: ImageItemState[] = items.map((item) => ({
          item,
          srcUrl: null,
          loading: true
        }));
        setImageStates(initial);

        // Ký URL song song có cache (lỗi tạm thời đã được tự thử lại bên trong)
        const resolved = await Promise.all(items.map((item) => resolveItem(property.id, item)));

        if (!isCancelled) {
          setImageStates(resolved);
        }
      } catch (err) {
        if (!isCancelled) {
          setImageStates([]);
        }
      }
    }

    loadMedia();

    return () => {
      isCancelled = true;
    };
  }, [property]);

  // Thử ký lại một ô lỗi (hoặc ảnh tải hỏng do URL hết hạn) mà không phải tải lại trang
  const retryItem = async (item: MediaItem) => {
    mediaService.invalidateImageUrl(item);
    const update = (next: ImageItemState) =>
      setImageStates((prev) => prev.map((st) => (st.item?.objectKey === item.objectKey ? next : st)));
    update({ item, srcUrl: null, loading: true });
    update(await resolveItem(property.id, item));
  };

  const markImageBroken = (item: MediaItem) => {
    mediaService.invalidateImageUrl(item);
    setImageStates((prev) =>
      prev.map((st) =>
        st.item?.objectKey === item.objectKey ? { ...st, srcUrl: null, error: "Không tải được ảnh" } : st
      )
    );
  };

  // Xử lý upload ảnh/video mới (Phase E)
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
      setErrorMessage(result.error || "Tải media lên Cloudflare R2 thất bại");
    } else {
      if (onUpdated) onUpdated();
    }
  };

  // Xử lý xóa media (Phase F)
  const handleDeleteMedia = async (item: MediaItem) => {
    if (!(await confirmDialog(`Bạn có chắc chắn muốn xóa file ${item.fileName} khỏi BĐS?`, "Xóa"))) {
      return;
    }

    setActionLoadingKey(item.objectKey);
    const res = await mediaService.deletePropertyImage(property.id, item.objectKey);
    setActionLoadingKey(null);

    if (!res.success) {
      alert(`Xóa media thất bại: ${res.error}`);
    } else {
      if (onUpdated) onUpdated();
    }
  };

  // Di chuyển thứ tự (Phase G - Reorder)
  const handleMoveOrder = async (index: number, direction: "left" | "right" | "first") => {
    const currentItems = imageStates
      .map((st) => st.item)
      .filter((it): it is MediaItem => Boolean(it));

    if (currentItems.length <= 1) return;

    const newItems = [...currentItems];
    const target = newItems[index];

    if (direction === "first") {
      newItems.splice(index, 1);
      newItems.unshift(target);
    } else if (direction === "left" && index > 0) {
      newItems[index] = newItems[index - 1];
      newItems[index - 1] = target;
    } else if (direction === "right" && index < newItems.length - 1) {
      newItems[index] = newItems[index + 1];
      newItems[index + 1] = target;
    } else {
      return;
    }

    setActionLoadingKey(target.objectKey);
    const res = await mediaService.reorderPropertyImages(
      property.id,
      newItems.map((it) => it.objectKey)
    );
    setActionLoadingKey(null);

    if (!res.success) {
      alert(`Đổi thứ tự media thất bại: ${res.error}`);
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
        link.download = st.item?.fileName || `bds_${property.id}_media_${idx + 1}.jpg`;
        link.target = "_blank";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    });
  };

  const totalCount = imageStates.length;

  // Danh sách cho trình xem phóng to: chỉ các media đã ký URL được
  const viewableStates = imageStates.filter((st) => st.srcUrl);
  const lightboxItems: LightboxItem[] = viewableStates.map((st) => ({
    url: st.srcUrl!,
    isVideo: st.item?.contentType === "video/mp4",
    fileName: st.item?.fileName
  }));
  const openLightbox = (st: ImageItemState) => {
    const i = viewableStates.indexOf(st);
    if (i >= 0) setLightboxIndex(i);
  };

  return (
    <div className="mb-4 p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Camera className="w-4 h-4 text-blue-600" />
          <h3 className="font-semibold text-slate-800 text-xs uppercase tracking-wider">
            Hình ảnh & Video ({totalCount})
          </h3>
          {property.r2MediaKeys && property.r2MediaKeys !== "[]" && (
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
              title="Tải toàn bộ media BĐS về máy"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Tải tất cả</span>
            </button>
          )}

          <label className="cursor-pointer flex items-center gap-1 text-xs text-white bg-blue-600 hover:bg-blue-700 font-semibold px-2.5 py-1.5 rounded-xl shadow-xs transition-colors disabled:opacity-50">
            <Plus className="w-3.5 h-3.5" />
            <span>Thêm ảnh/video</span>
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
          {imageStates.map((st, idx) => {
            const isVideo = st.item?.contentType === "video/mp4";
            const isActionLoading = actionLoadingKey === st.item?.objectKey;

            return (
              <div
                key={st.item?.objectKey || idx}
                className="group relative aspect-4/3 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 shadow-2xs"
              >
                {st.loading || isActionLoading ? (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 text-slate-400">
                    <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                    <span className="text-[10px]">
                      {isActionLoading ? "Đang xử lý..." : "Đang tải..."}
                    </span>
                  </div>
                ) : st.srcUrl ? (
                  <>
                    {isVideo ? (
                      <div
                        className="w-full h-full relative flex items-center justify-center bg-slate-900 cursor-pointer"
                        onClick={() => openLightbox(st)}
                      >
                        <video
                          src={st.srcUrl}
                          className="w-full h-full object-cover opacity-80"
                          muted
                          playsInline
                        />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="p-3 rounded-full bg-black/60 text-white shadow-lg group-hover:scale-110 transition-transform">
                            <Film className="w-5 h-5 text-sky-400" />
                          </div>
                        </div>
                        <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/70 text-[9px] font-bold text-white uppercase">
                          MP4
                        </span>
                      </div>
                    ) : (
                      <img
                        src={st.srcUrl}
                        alt={`BĐS ${property.area} ${idx + 1}`}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200 cursor-pointer"
                        onClick={() => openLightbox(st)}
                        onError={() => st.item && markImageBroken(st.item)}
                      />
                    )}

                    {/* Badge ảnh đại diện (Ảnh đầu tiên) */}
                    {idx === 0 && (
                      <span className="absolute top-1.5 left-1.5 z-10 px-1.5 py-0.5 rounded bg-blue-600 text-white text-[9px] font-bold shadow-xs">
                        Ảnh bìa
                      </span>
                    )}

                    {/* Reorder and Action Overlay — phủ lên ảnh nên bấm vào vùng trống cũng mở xem phóng to */}
                    <div
                      className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-2 cursor-zoom-in"
                      onClick={() => openLightbox(st)}
                    >
                      {/* Top Action Buttons (Reorder: Set as cover, move left, move right) */}
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1">
                          {idx > 0 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleMoveOrder(idx, "left");
                              }}
                              className="p-1 bg-white/90 hover:bg-white text-slate-800 rounded-md transition-colors"
                              title="Di chuyển sang trái"
                            >
                              <ArrowLeft className="w-3 h-3" />
                            </button>
                          )}
                          {idx < totalCount - 1 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleMoveOrder(idx, "right");
                              }}
                              className="p-1 bg-white/90 hover:bg-white text-slate-800 rounded-md transition-colors"
                              title="Di chuyển sang phải"
                            >
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          )}
                        </div>

                        {idx > 0 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMoveOrder(idx, "first");
                            }}
                            className="flex items-center gap-1 px-1.5 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-md text-[10px] font-semibold transition-colors"
                            title="Đặt làm ảnh bìa đại diện"
                          >
                            <Star className="w-2.5 h-2.5 fill-white" />
                            <span>Đặt ảnh bìa</span>
                          </button>
                        )}
                      </div>

                      {/* Bottom Action Buttons (Open link, download, delete) */}
                      <div className="flex items-center justify-end gap-1.5">
                        <a
                          href={st.srcUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="p-1.5 bg-white/90 hover:bg-white text-slate-800 rounded-lg transition-transform hover:scale-110 shadow-xs"
                          title="Mở tab mới"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>

                        <a
                          href={st.srcUrl}
                          download={st.item?.fileName || `bds_${property.id}_${idx + 1}.jpg`}
                          onClick={(e) => e.stopPropagation()}
                          className="p-1.5 bg-white/90 hover:bg-white text-slate-800 rounded-lg transition-transform hover:scale-110 shadow-xs"
                          title="Tải về máy"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </a>

                        {st.item && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteMedia(st.item!);
                            }}
                            className="p-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-transform hover:scale-110 shadow-xs"
                            title="Xóa media này"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-1 p-2 text-center text-slate-400">
                    <ImageIcon className="w-5 h-5" />
                    <span className="text-[10px] text-red-500 line-clamp-2 break-all">{st.error || "Lỗi media"}</span>
                    {st.item && (
                      <button
                        type="button"
                        onClick={() => retryItem(st.item!)}
                        className="mt-0.5 flex items-center gap-1 px-2 py-1 rounded-lg bg-white border border-slate-200 text-[11px] font-semibold text-blue-700 hover:bg-blue-50 transition-colors"
                      >
                        <RotateCw className="w-3 h-3" />
                        <span>Thử lại</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-6 border border-dashed border-slate-200 rounded-xl space-y-1.5 bg-slate-50/50">
          <ImageIcon className="w-6 h-6 text-slate-300 mx-auto" />
          <div className="text-xs text-slate-500 font-medium">Chưa có hình ảnh nào</div>
          <div className="text-[11px] text-slate-400">
            Bấm "Thêm ảnh/video" để tải media thực tế lên Cloudflare R2
          </div>
        </div>
      )}

      {/* Trình xem ảnh / video phóng to */}
      {lightboxIndex !== null && lightboxItems.length > 0 && (
        <ImageLightbox
          items={lightboxItems}
          startIndex={Math.min(lightboxIndex, lightboxItems.length - 1)}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  );
};
