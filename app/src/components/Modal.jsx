import { useEffect } from 'react';
import { X } from 'lucide-react';

/** Escape ile kapanir, arka plana tiklaninca kapatilir. */
export function Modal({ open, onClose, title, subtitle, size = 'md', children, footer, closeOnBackdrop = true }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const sizeClass = size === 'sm' ? 'sm' : size === 'lg' ? 'lg' : size === 'xl' ? 'xl' : '';

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className={`modal ${sizeClass}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2>{title}</h2>
            {subtitle ? <div className="sub">{subtitle}</div> : null}
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Kapat">
            <X size={17} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>
  );
}

/** Silme gibi geri alinamaz islemler icin onay kutusu. */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = 'Emin misiniz?',
  message,
  confirmLabel = 'Sil',
  danger = true,
  busy = false,
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <div className="spacer" />
          <button className="btn" onClick={onClose} disabled={busy}>
            Vazgeç
          </button>
          <button
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'İşleniyor...' : confirmLabel}
          </button>
        </>
      }
    >
      <div style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--text-muted)', whiteSpace: 'pre-line' }}>
        {message}
      </div>
    </Modal>
  );
}
