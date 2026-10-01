/**
 * ŞİFRE SIFIRLAMA TALEBİ (giriş ekranı)
 * ======================================
 * Şifresini unutan kullanıcı giriş ekranından talep bırakır.
 *
 * GÜVENLİK — BURAYA BAK:
 * Bu form yalnızca TALEP bırakır, yeni şifre SEÇTİRMEZ. Şifreyi sadece
 * yönetici onaylar ve sistem üretir (`routes/passwordReset.js` → `/approve`).
 * Aksi halde "admin" adını bilen biri tüm sistemi ele geçirebilirdi.
 *
 * Kullanıcı adı kayıtlı mı bilgisi VERİLMEZ — her durumda aynı mesaj.
 * (Aksi halde biri listeden geçerli kullanıcı adlarını bulabilirdi.)
 *
 * İletişim alanı isteğe bağlı: kullanıcı telefonunu yazmazsa talep yine
 * oluşur; yönetici kendi bildiriminden sonra geçici şifreyi söyler.
 */
import { useState } from 'react';
import { Send, ShieldCheck, Phone, Info } from 'lucide-react';
import { api } from '../lib/api.js';
import { useToast } from '../components/Toast.jsx';
import { Modal } from '../components/Modal.jsx';

export function PasswordResetModal({ open, initialUsername = '', onClose }) {
  const toast = useToast();
  const [username, setUsername] = useState(initialUsername);
  const [contact, setContact] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [mesaj, setMesaj] = useState('');

  const gonder = async (e) => {
    e.preventDefault();
    if (!username.trim()) {
      toast.error('Kullanıcı adı gerekli');
      return;
    }
    setBusy(true);
    try {
      const r = await api.post('/password-reset/request', {
        username: username.trim(),
        contact: contact.trim() || undefined,
        note: note.trim() || undefined,
      });
      setMesaj(r.data?.mesaj || 'Talebiniz alındı.');
    } catch (err) {
      toast.error('Talep gönderilemedi', err.message);
    } finally {
      setBusy(false);
    }
  };

  const footer = mesaj ? (
    <button className="btn btn-primary" onClick={onClose}>
      Tamam
    </button>
  ) : (
    <>
      <button type="button" className="btn" onClick={onClose} disabled={busy}>
        Vazgeç
      </button>
      <button className="btn btn-primary" onClick={gonder} disabled={busy || !username.trim()}>
        <Send size={14} />
        {busy ? 'Gönderiliyor...' : 'Talep Gönder'}
      </button>
    </>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Şifremi Unuttum"
      subtitle="Talebinizi bırakın, yöneticiniz onaylasın"
      size="sm"
      footer={footer}
    >
      {mesaj ? (
        <>
          <div className="alert success" style={{ marginBottom: 14 }}>
            <ShieldCheck size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{mesaj}</span>
          </div>

          <p className="text-dim" style={{ lineHeight: 1.8, marginBottom: 14 }}>
            <strong>Sonraki adım:</strong>
            <br />
            1. Yöneticiniz talebi görür ve onaylar
            <br />
            2. Size bir <strong>geçici şifre</strong> verir
            <br />
            3. O şifreyle girersiniz; sistem sizi
            <br />
            &nbsp;&nbsp;&nbsp;kendi şifrenizi seçmeye <strong>zorlar</strong>
          </p>

          <div className="alert info" style={{ marginBottom: 0 }}>
            <Info size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              <strong>Yeni şifreyi siz seçmezsiniz.</strong> Bu, başkasının sizin
              adınıza talep atıp hesabı ele geçirmesini engeller. Yönetici onayı
              olmadan kimsenin şifresi değişmez.
            </span>
          </div>
        </>
      ) : (
        <form onSubmit={gonder} style={{ margin: '-4px -4px 0' }}>
          <div className="field">
            <label className="field-label" htmlFor="pr-username">
              Kullanıcı adınız
            </label>
            <input
              id="pr-username"
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              autoComplete="username"
              spellCheck={false}
              autoFocus
            />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="pr-contact">
              Telefonunuz <span className="text-dim">(isteğe bağlı)</span>
            </label>
            <div style={{ position: 'relative' }}>
              <input
                id="pr-contact"
                className="input"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="05XX XXX XX XX"
                style={{ paddingLeft: 34 }}
              />
              <Phone
                size={14}
                style={{
                  position: 'absolute', left: 11, top: 11,
                  color: 'var(--text-dim)', pointerEvents: 'none',
                }}
              />
            </div>
            <div className="field-hint">
              Yönetici size nasıl ulaşacağını bilsin diye. Yazmazsanız da
              talebiniz oluşur.
            </div>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="pr-note">
              Açıklama <span className="text-dim">(isteğe bağlı)</span>
            </label>
            <textarea
              id="pr-note"
              className="input"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Hangi cihazda çalışıyordunuz, nerede unuttunuz..."
              style={{ resize: 'vertical' }}
            />
          </div>

          <div className="alert info">
            <Info size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              Talebiniz yöneticiye bildirilir. Yönetici onaylarsa size geçici bir
              şifre verir. <strong>Şifrenizi kendiniz seçmezsiniz</strong> — bu
              güvenlik içindir.
            </span>
          </div>
        </form>
      )}
    </Modal>
  );
}

export default PasswordResetModal;