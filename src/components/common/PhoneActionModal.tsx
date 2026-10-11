import React, { useState } from "react";
import { X, Phone, MessageSquare, ExternalLink, Copy, Check } from "lucide-react";
import { canonicalizeVietnamesePhone } from "../../core/utils/vietnamese";
import { useLivestream } from "../../core/live/use-livestream";
import { maskOwnerPhone } from "../../core/live/privacy";

interface PhoneActionModalProps {
  phoneNumber: string;
  isOpen: boolean;
  onClose: () => void;
  protectOwnerPhone?: boolean;
}

export const PhoneActionModal: React.FC<PhoneActionModalProps> = ({
  phoneNumber,
  isOpen,
  onClose,
  protectOwnerPhone = true
}) => {
  const { isLive } = useLivestream();
  const shouldProtect = isLive && protectOwnerPhone;
  const [copied, setCopied] = useState(false);

  if (!isOpen || !phoneNumber) return null;

  const cleanPhone = canonicalizeVietnamesePhone(phoneNumber);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(cleanPhone);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error("Failed to copy", e);
    }
  };

  const handleOpenZalo = () => {
    window.open(`https://zalo.me/${cleanPhone}`, "_blank");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-sm rounded-2xl shadow-xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h3 className="font-semibold text-slate-800 text-base">Liên hệ số điện thoại</h3>
            <p className="text-xs text-slate-500 font-mono mt-0.5">
              {shouldProtect ? maskOwnerPhone(phoneNumber, true) : phoneNumber}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Items */}
        <div className="p-4 space-y-2">
          {/* Call direct */}
          <button
            type="button"
            onClick={() => {
              if (shouldProtect) {
                alert("Đang bật Livestream — Không thể thực hiện cuộc gọi");
                return;
              }
              window.location.href = `tel:${cleanPhone}`;
              onClose();
            }}
            className={`flex items-center gap-3 w-full p-3 text-left font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-700 rounded-xl transition-colors border border-slate-100 hover:border-blue-200 cursor-pointer ${
              shouldProtect ? "opacity-60" : ""
            }`}
          >
            <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
              <Phone className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-semibold">Gọi điện thoại trực tiếp</div>
              <div className="text-xs text-slate-500">
                {shouldProtect ? maskOwnerPhone(cleanPhone, true) : cleanPhone}
              </div>
            </div>
          </button>

          {/* SMS */}
          <button
            type="button"
            onClick={() => {
              if (shouldProtect) {
                alert("Đang bật Livestream — Không thể gửi tin nhắn SMS");
                return;
              }
              window.location.href = `sms:${cleanPhone}`;
              onClose();
            }}
            className={`flex items-center gap-3 w-full p-3 text-left font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-700 rounded-xl transition-colors border border-slate-100 hover:border-blue-200 cursor-pointer ${
              shouldProtect ? "opacity-60" : ""
            }`}
          >
            <div className="w-9 h-9 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-semibold">Gửi tin nhắn SMS</div>
              <div className="text-xs text-slate-500">Mở ứng dụng tin nhắn</div>
            </div>
          </button>

          {/* Zalo */}
          <button
            type="button"
            onClick={() => {
              if (shouldProtect) {
                alert("Đang bật Livestream — Không thể mở Zalo");
                return;
              }
              handleOpenZalo();
            }}
            className={`flex items-center gap-3 w-full p-3 text-left font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-700 rounded-xl transition-colors border border-slate-100 hover:border-blue-200 cursor-pointer ${
              shouldProtect ? "opacity-60" : ""
            }`}
          >
            <div className="w-9 h-9 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center shrink-0">
              <ExternalLink className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-semibold">Mở Zalo chat</div>
              <div className="text-xs text-slate-500">
                {shouldProtect ? "zalo.me/••••••••••" : `zalo.me/${cleanPhone}`}
              </div>
            </div>
          </button>

          {/* Copy */}
          <button
            type="button"
            onClick={() => {
              if (shouldProtect) {
                alert("Đang bật Livestream — Không thể sao chép SĐT");
                return;
              }
              handleCopy();
            }}
            className={`flex items-center gap-3 w-full p-3 text-left font-medium text-slate-700 hover:bg-slate-50 rounded-xl transition-colors border border-slate-100 cursor-pointer ${
              shouldProtect ? "opacity-60" : ""
            }`}
          >
            <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
              {copied ? <Check className="w-5 h-5 text-emerald-600" /> : <Copy className="w-5 h-5" />}
            </div>
            <div>
              <div className="text-sm font-semibold">{copied ? "Đã sao chép!" : "Sao chép số"}</div>
              <div className="text-xs text-slate-500">Lưu vào bộ nhớ đệm</div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};
