'use client';

import { useEffect, useRef } from 'react';
import { MaterialIcon } from '@/components/material-icon';

export function ConfirmationDialog({
  title,
  description,
  confirmLabel,
  danger = false,
  onConfirm,
  onClose
}: {
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog ref={ref} className="confirmation-dialog" aria-labelledby="confirmation-title" onCancel={onClose}>
      <button className="icon-button" type="button" onClick={onClose} aria-label="Cerrar">
        <MaterialIcon name="close" />
      </button>
      <h2 id="confirmation-title">{title}</h2>
      <p>{description}</p>
      <div>
        <button className="button subtle" type="button" onClick={onClose}>
          Cancelar
        </button>
        <button className={`button ${danger ? 'danger' : 'primary'}`} type="button" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
