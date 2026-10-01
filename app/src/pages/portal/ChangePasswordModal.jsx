/**
 * MUSTERI SIFRE DEGISTIRME
 * Müşteri hesaplarının kendi şifresini değiştirebilmesi için.
 * Aynı uç admin/personel için de kullanılabilir (portal dışında).
 */
import { useState } from 'react';
import { KeyRound, ShieldCheck, Info } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useToast } from '../../components/Toast.jsx';
import { Modal } from '../../components/Modal.jsx';
import { FormField, useFormState } from '../../components/Form.jsx';

const FIELDS = [
  {
    name: 'currentPassword',
    label: 'Mevcut şifre',
    type: 'password',
    span: 2,
    required: true,
    placeholder: 'Şu anda kullandığınız şifre',
  },
  { name: 'newPassword', label: 'Yeni şifre', type: 'password', span: 2, required: true, hint: 'En az 6 karakter' },
  {
    name: 'confirmPassword',
    label: 'Yeni şifre (tekrar)',
    type: 'password',
    span: 2,
    required: true,
    placeholder: 'Yeni şifreyi tekrar girin',
  },
];

export function ChangePasswordModal({ onClose, onDone }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const form = useFormState(FIELDS, {});

  const submit = async () => {
    const v = form.submit();
    if (!v) return;

    // Eşleşme kontrolü sunucuya girmeden
    if (v.newPassword !== v.confirmPassword) {
      form.setErrors({ confirmPassword: 'Şifreler aynı değil' });
      return;
    }
    if (v.newPassword.length < 6) {
      form.setErrors({ newPassword: 'En az 6 karakter olmalı' });
      return;
    }
    if (v.newPassword === v.currentPassword) {
      form.setErrors({ newPassword: 'Yeni şifre eskisiyle aynı olamaz' });
      return;
    }

    setBusy(true);
    try {
      await api.post('/auth/change-password', {
        currentPassword: v.currentPassword,
        newPassword: v.newPassword,
      });
      toast.success('Şifreniz değiştirildi', 'Bundan sonra yeni şifrenizle gireceksiniz.');
      onDone?.();
      onClose();
    } catch (err) {
      toast.fromError(err, 'Şifre değiştirilemedi');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Şifre Değiştir"
      subtitle="Hesabınıza ait şifreyi güncelleyin"
      size="sm"
      footer={
        <>
          <div className="spacer" />
          <button className="btn" onClick={onClose} disabled={busy}>
            Vazgeç
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>
            <KeyRound size={14} />
            {busy ? 'Kaydediliyor...' : 'Şifreyi Değiştir'}
          </button>
        </>
      }
    >
      <div className="alert info mb-14">
        <ShieldCheck size={15} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          Mevcut şifrenizi bildiğinizi doğrulamak için isteriz. Şifreniz veritabanında şifreli
          (bcrypt) olarak saklanır, hiçbir yerde açık metin tutulmaz.
        </span>
      </div>

      <div className="form-grid">
        {FIELDS.map((f) => (
          <FormField
            key={f.name}
            field={f}
            value={form.values[f.name]}
            error={form.errors[f.name]}
            onChange={(v) => form.setValue(f.name, v)}
            disabled={busy}
          />
        ))}
      </div>

      {form.values.newPassword && form.values.newPassword.length >= 4 ? (
        <div className="mt-14">
          <div className="label text-dim text-sm mb-4">Şifre gücü</div>
          <div className="row gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                style={{
                  height: 4, flex: 1, borderRadius: 2,
                  background:
                    form.values.newPassword.length >= i * 3
                      ? form.values.newPassword.length >= 10
                        ? '#22c55e'
                        : form.values.newPassword.length >= 7
                          ? '#f59e0b'
                          : '#ef4444'
                      : 'var(--bg-active)',
                }}
              />
            ))}
          </div>
          <div className="text-dim text-sm mt-4">
            {form.values.newPassword.length < 7
              ? 'Daha uzun bir şifre seçin (en az 8-10 karakter önerilir)'
              : form.values.newPassword.length < 10
                ? 'Kabul edilebilir'
                : 'İyi'}
          </div>
        </div>
      ) : null}

      <div className="alert mt-14" style={{ marginBottom: 0 }}>
        <Info size={15} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          Şifrenizi unuttuysanız yöneticinize başvurun; hesabınız için yeni şifre oluşturabilir.
        </span>
      </div>
    </Modal>
  );
}

/** `lazy(() => import(...))` icin default export ZORUNLU. */
export default ChangePasswordModal;
