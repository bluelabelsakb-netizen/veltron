/**
 * DEMO ŞERİDİ ve LİSANS PANELİ
 * =============================
 * Demo modundayken ekranın üstünde kalıcı bir şerit görünür ve yönetici
 * lisans anahtarı girebilir.
 */
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from './AuthContext.jsx';
import { useToast } from '../components/Toast.jsx';
import { Modal } from '../components/Modal.jsx';
import { FormField, useFormState } from '../components/Form.jsx';
import { dateFmt } from '../lib/api.js';
import { FlaskConical, KeyRound, CalendarClock, Database } from 'lucide-react';

const LicenseContext = createContext(null);

export function LicenseProvider({ children }) {
  const { user, isAdmin } = useAuth();
  const [bilgi, setBilgi] = useState(null);
  const [panelOpen, setPanelOpen] = useState(false);

  const yukle = useCallback(async () => {
    try {
      const res = await api.get('/license');
      setBilgi(res.data);
    } catch {
      /* sunucu kapalıysa şerit gösterilmez */
    }
  }, []);

  useEffect(() => {
    if (user) yukle();
  }, [user, yukle]);

  if (!bilgi?.demo) {
    return (
      <LicenseContext.Provider value={{ bilgi, yukle, panelOpen, setPanelOpen }}>
        {children}
      </LicenseContext.Provider>
    );
  }

  const kalan = bilgi.kalan_gun;
  const uyari = bilgi.suresi_doldu || kalan <= 3;

  return (
    <LicenseContext.Provider value={{ bilgi, yukle, panelOpen, setPanelOpen }}>
      <div className={`demo-banner ${uyari ? 'warn' : ''}`}>
        <div className="demo-banner-inner">
          <span className="demo-badge">
            <FlaskConical size={13} />
            DEMO
          </span>
          <span>
            {bilgi.suresi_doldu ? (
              <>Demo süresi doldu — sistem salt okunur modda. Yeni kayıt girilemiyor.</>
            ) : (
              <>
                <strong>{kalan} gün</strong> kaldı · {bilgi.sirf_kayit} /{' '}
                {bilgi.demo_max_records || '∞'} iş emri
              </>
            )}
          </span>
          {isAdmin ? (
            <button className="btn btn-sm" onClick={() => setPanelOpen(true)}>
              <KeyRound size={12} />
              Lisans
            </button>
          ) : null}
        </div>
      </div>
      {children}
      {panelOpen ? <LicensePanel onClose={() => setPanelOpen(false)} onChanged={yukle} /> : null}
    </LicenseContext.Provider>
  );
}

export function useLicense() {
  return useContext(LicenseContext) || { bilgi: null, yukle: () => {}, panelOpen: false, setPanelOpen: () => {} };
}

const AKTIF_FIELDS = [
  { name: 'key', label: 'Lisans anahtarı', required: true, span: 2, placeholder: 'VELTRON-XXXX-XXXX-XXXX' },
  // ⛔ Yer tutucu gerçek bir müşteri gibi GÖRÜNMEMELİ. "Örn. Deniz Demir
  //    Çelik A.Ş." vardı; o isim demo müşteri listesinde de geçiyordu ve
  //    kullanıcı Firma Profili'ne bu haliyle kaydetmişti. 3 Ekim 2026.
  { name: 'customer_name', label: 'Firma adı', span: 2, placeholder: 'Lisans sahibi firmanın ünvanı' },
];

function LicensePanel({ onClose, onChanged }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [demos, setDemos] = useState(null);
  const [demoGun, setDemoGun] = useState(30);
  const [demoLimit, setDemoLimit] = useState(500);
  const form = useFormState(AKTIF_FIELDS, {});

  useEffect(() => {
    api
      .get('/license/full')
      .then((r) => setDemos(r.data))
      .catch(() => {});
  }, []);

  const aktifEt = async () => {
    const v = form.submit();
    if (!v) return;
    setBusy(true);
    try {
      const res = await api.post('/license/activate', v);
      toast.success('Lisans aktif', res.message);
      onChanged();
      onClose();
    } catch (err) {
      toast.fromError(err, 'Aktive edilemedi');
    } finally {
      setBusy(false);
    }
  };

  const demoBaslat = async () => {
    setBusy(true);
    try {
      const res = await api.post('/license/demo', { days: demoGun, max_records: demoLimit });
      toast.success('Demo modu başlatıldı', res.message);
      onChanged();
    } catch (err) {
      toast.fromError(err, 'Başlatılamadı');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Lisans ve Demo"
      subtitle="Satış gösterimi ve gerçek kullanıma geçiş"
      size="md"
      footer={
        <>
          <div className="spacer" />
          <button className="btn" onClick={onClose}>
            Kapat
          </button>
        </>
      }
    >
      {demos ? (
        <div className="card mb-14">
          <div className="card-body">
            <div className="stat-row">
              <span className="label">Durum</span>
              <span className="value">
                {demos.demo ? (
                  <span className="badge warning">DEMO</span>
                ) : (
                  <span className="badge success">Lisanslı</span>
                )}
              </span>
            </div>
            <div className="stat-row">
              <span className="label">Müşteri</span>
              <span className="value">{demos.customer_name || '—'}</span>
            </div>
            <div className="stat-row">
              <span className="label">Lisans anahtarı</span>
              <span className="value mono">
                {demos.license_key ? `${demos.license_key.slice(0, 8)}••••` : '—'}
              </span>
            </div>
            {demos.demo ? (
              <>
                <div className="stat-row">
                  <span className="label">Demo başlangıç</span>
                  <span className="value">{dateFmt(demos.demo_started_at)}</span>
                </div>
                <div className="stat-row">
                  <span className="label">Demo bitiş</span>
                  <span className="value">{dateFmt(demos.demo_expires_at)}</span>
                </div>
                <div className="stat-row">
                  <span className="label">Kayıt kullanımı</span>
                  <span className="value">
                    {demos.sirf_kayit} / {demos.demo_max_records || '∞'} iş emri
                  </span>
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      <h4 style={{ marginBottom: 8 }}>Lisansı Aktive Et</h4>
      <p className="text-dim text-sm mb-14">
        Müşteri lisans aldıysa anahtarı gir. Sistem demo kısıtlamalarından çıkar ve
        tam kullanıma açılır.
      </p>
      <div className="form-grid mb-14">
        {AKTIF_FIELDS.map((f) => (
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
      <button className="btn btn-primary" onClick={aktifEt} disabled={busy} style={{ width: '100%' }}>
        <KeyRound size={14} />
        {busy ? 'Aktive ediliyor...' : 'Lisansı Aktive Et'}
      </button>

      <h4 style={{ margin: '22px 0 8px' }}>Yeniden Demo Modu</h4>
      <p className="text-dim text-sm mb-14">
        Bir başka firmaya göstermek için tekrar demo moduna al. Mevcut lisans
        silinir, kısıtlamalar geri gelir.
      </p>
      <div className="row row-wrap mb-14" style={{ gap: 12 }}>
        <label className="row" style={{ gap: 7 }}>
          <CalendarClock size={14} className="text-dim" />
          <span className="text-sm">Süre</span>
          <input
            type="number"
            className="input"
            style={{ width: 84 }}
            min="1"
            max="365"
            value={demoGun}
            onChange={(e) => setDemoGun(Number(e.target.value))}
          />
          <span className="text-sm">gün</span>
        </label>
        <label className="row" style={{ gap: 7 }}>
          <Database size={14} className="text-dim" />
          <span className="text-sm">Kayıt sınırı</span>
          <input
            type="number"
            className="input"
            style={{ width: 90 }}
            min="0"
            value={demoLimit}
            onChange={(e) => setDemoLimit(Number(e.target.value))}
          />
        </label>
      </div>
      <button className="btn" onClick={demoBaslat} disabled={busy}>
        <FlaskConical size={14} />
        Demo Modunu Başlat
      </button>
    </Modal>
  );
}
