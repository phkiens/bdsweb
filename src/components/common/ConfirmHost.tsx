import React, { useEffect, useState } from "react";
import { ConfirmModal } from "./ConfirmModal";
import { ConfirmRequest, subscribeConfirm } from "./confirm-dialog";

export const ConfirmHost: React.FC = () => {
  const [req, setReq] = useState<ConfirmRequest | null>(null);

  useEffect(() => subscribeConfirm(setReq), []);

  const close = (ok: boolean) => {
    req?.resolve(ok);
    setReq(null);
  };

  return (
    <ConfirmModal
      isOpen={req !== null}
      title="Xác nhận"
      message={req?.message ?? ""}
      confirmText={req?.confirmText ?? "Xác nhận"}
      cancelText="Hủy"
      variant="danger"
      onConfirm={() => close(true)}
      onCancel={() => close(false)}
    />
  );
};
