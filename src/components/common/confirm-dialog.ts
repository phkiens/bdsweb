// Hộp xác nhận trong app thay cho window.confirm: trình duyệt có thể chặn window.confirm
// (đã bật "không cho trang mở thêm hộp thoại", trình duyệt nhúng trong Zalo…) và trả về false ngay
// mà không hiện gì — nút xoá trông như không hoạt động. ConfirmHost (gắn ở App.tsx) vẽ hộp này.
export interface ConfirmRequest {
  message: string;
  confirmText?: string;
  resolve: (ok: boolean) => void;
}

type Listener = (req: ConfirmRequest) => void;
const listeners = new Set<Listener>();

export function subscribeConfirm(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function confirmDialog(message: string, confirmText?: string): Promise<boolean> {
  if (listeners.size === 0) return Promise.resolve(window.confirm(message));
  return new Promise((resolve) => {
    listeners.forEach((fn) => fn({ message, confirmText, resolve }));
  });
}
