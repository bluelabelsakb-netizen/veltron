import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, Save, RotateCcw, Image as ImageIcon, Trash2, Info } from 'lucide-react';
import { api, ApiError } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../components/Toast.jsx';
import { PageHeader, Loading } from '../components/Primitives.jsx';
import { FormField, useFormState } from '../components/Form.jsx';
import { ConfirmDialog } from '../components/Modal.jsx';

/** Firma profilinin tum alanlari. */
const FIELDS = [
  { name: 'name', label: 'Ünvan', required: true, span: 2, placeholder: 'Veltron Elektrik San. ve Tic. Ltd. Şti.' },
  { name: 'short_name', label: 'Kısa ad', placeholder: 'VELTRON' },
  { name: 'tagline', label: 'Slogan / faaliyet alanı' },
  { name: 'tax_office', label: 'Vergi dairesi' },
  { name: 'tax_number', label: 'Vergi numarası (VKN)' },
  { name: 'phone', label: 'Telefon', type: 'tel' },
  { name: 'email', label: 'E-posta', type: 'email' },
  { name: 'website', label: 'Web sitesi' },
  { name: 'address', label: 'Adres', type: 'textarea', span: 2, rows: 2 },
  { name: 'city', label: 'İl / Şehir' },
  { name: 'bank_name', label: 'Banka ve şube' },
  { name: 'iban', label: 'IBAN', placeholder: 'TR00 0000 0000 0000 0000 0000 00' },
  { name: 'default_tax_rate', label: 'Varsayılan KDV %', type: 'number', min: 0, step: '1' },
  { name: 'payment_term_days', label: 'Ödeme vadesi (gün)', type: 'number', min: 0, step: '1' },
  { name: 'invoice_prefix', label: 'Fatura numara ön eki', placeholder: 'FTR' },
  { name: 'quote_prefix', label: 'Teklif numara ön eki', placeholder: 'TLF' },
  { name: 'work_order_prefix', label: 'İş emri numara ön eki', placeholder: 'IEM', hint: 'örn. IEM-2026-001' },
  { name: 'default_notes', label: 'Varsayılan teklif/fatura notu', type: 'textarea', span: 2, rows: 2 },
  { name: 'invoice_footer', label: 'Evrak altı notu', type: 'textarea', span: 2, rows: 2, hint: 'Fatura/teklif altında çıkar' },
];

const SECTIONS = [
  { title: 'Kimlik', fields: ['name', 'short_name', 'tagline', 'logo', 'tax_office', 'tax_number'] },
  { title: 'İletişim', fields: ['phone', 'email', 'website', 'address', 'city'] },
  { title: 'Banka', fields: ['bank_name', 'iban'] },
  { title: 'Evrak varsayılanları', fields: ['default_tax_rate', 'payment_term_days', 'invoice_prefix', 'quote_prefix', 'work_order_prefix'] },
  { title: 'Notlar', fields: ['default_notes', 'invoice_footer'] },
];

// Logo alanini FormField'in desteklemedigi icin ayri ele aliyoruz.
const FORM_FIELDS = FIELDS.filter((f) => f.name !== 'logo');

export default function CompanyProfile() {
  const { isAdmin } = useAuth();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [clearing, setClearing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/company');
      setProfile(res.data);
    } catch (err) {
      toast.fromError(err, 'Firma profili yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const initial = useMemo(() => {
    if (!profile) return {};
    const base = {};
    for (const f of FORM_FIELDS) base[f.name] = profile[f.name] ?? '';
    return base;
  }, [profile]);

  const form = useFormState(FORM_FIELDS, initial);

  const save = async () => {
    const values = form.submit();
    if (!values) return;
    setBusy(true);
    try {
      await api.put('/company', { ...values, logo: profile?.logo ?? null });
      toast.success('Firma profili kaydedildi', 'Evrak başlıkları güncellendi.');
      load();
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length) {
        form.setErrors(err.fieldErrors);
        toast.error('Eksik hatalı alan var');
      } else {
        toast.fromError(err, 'Kaydedilemedi');
      }
    } finally {
      setBusy(false);
    }
  };

  const pickLogo = (file) => {
    if (!file) return;
    if (file.size > 700 * 1024) {
      toast.warning('Dosya çok büyük', 'Logo en fazla 700 KB olabilir. Lütfen küçültün.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setProfile((p) => ({ ...p, logo: reader.result }));
      toast.success('Logo yüklendi', 'Kaydet tuşuna basarak kalıcı hale getirin.');
    };
    reader.readAsDataURL(file);
  };

  const clearProfile = async () => {
    setBusy(true);
    try {
      const res = await api.post('/company/reset');
      setProfile(res.data);
      setClearing(false);
      toast.success('Profil temizlendi', 'Ünvan dışındaki alanlar boşaltıldı.');
    } catch (err) {
      toast.fromError(err, 'Temizlenemedi');
    } finally {
      setBusy(false);
    }
  };

  if (loading || !profile) return <Loading label="Firma profili yükleniyor..." />;

  return (
    <div className="page">
      <PageHeader
        title="Firma Profili"
        description="Teklif ve faturada kullanılan evrak başlığı, banka ve varsayılan ayarlar"
        actions={
          isAdmin ? (
            <>
              <button className="btn" onClick={() => setClearing(true)} disabled={busy}>
                <RotateCcw size={14} />
                Temizle
              </button>
              <button className="btn btn-primary" onClick={save} disabled={busy}>
                <Save size={15} />
                {busy ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
            </>
          ) : null
        }
      />

      {!isAdmin ? (
        <div className="alert warning mb-14">
          <Info size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>Bu sayfayı yalnızca yöneticiler düzenleyebilir. Şu an salt okunur görüntülüyorsunuz.</span>
        </div>
      ) : null}

      <div className="grid-2-1">
        <div className="stack">
          {/* ---- Logo ---- */}
          <div className="card">
            <div className="card-head">
              <ImageIcon size={15} style={{ color: 'var(--primary)' }} />
              <h3>Logo</h3>
            </div>
            <div className="card-body">
              <div className="row" style={{ gap: 18, alignItems: 'flex-start' }}>
                <div
                  style={{
                    width: 132, height: 132, flexShrink: 0,
                    border: '1px dashed var(--border-strong)', borderRadius: 'var(--radius)',
                    display: 'grid', placeItems: 'center', background: '#fff', overflow: 'hidden',
                  }}
                >
                  {profile.logo ? (
                    <img src={profile.logo} alt="Firma logosu" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                  ) : (
                    <Building2 size={38} color="#94a3b8" />
                  )}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <input
                    id="logo-input"
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml,image/webp"
                    style={{ display: 'none' }}
                    onChange={(e) => pickLogo(e.target.files?.[0])}
                    disabled={!isAdmin}
                  />
                  <div className="row row-wrap" style={{ gap: 8 }}>
                    <label
                      className="btn btn-sm"
                      htmlFor="logo-input"
                      style={{ cursor: isAdmin ? 'pointer' : 'not-allowed', opacity: isAdmin ? 1 : 0.5 }}
                    >
                      Logo yükle
                    </label>
                    {profile.logo ? (
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => setProfile((p) => ({ ...p, logo: null }))}
                        disabled={!isAdmin}
                      >
                        <Trash2 size={13} />
                        Kaldır
                      </button>
                    ) : null}
                  </div>
                  <div className="field-hint" style={{ marginTop: 8 }}>
                    PNG, JPG veya SVG · en fazla 700 KB · şeffaf zeminli (PNG) önerilir.
                    <br />
                    Evrak başlığında sol üstte, en fazla 132×132 piksel gösterilir.
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ---- Form ---- */}
          <div className="card">
            <div className="card-body">
              {SECTIONS.map((sec) => (
                <div className="form-section" key={sec.title}>
                  <div className="form-section-title">{sec.title}</div>
                  <div className="form-grid">
                    {sec.fields.map((name) => {
                      const def = FORM_FIELDS.find((x) => x.name === name);
                      if (!def) return null;
                      return (
                        <FormField
                          key={def.name}
                          field={def}
                          value={form.values[def.name]}
                          error={form.errors[def.name]}
                          onChange={(v) => form.setValue(def.name, v)}
                          disabled={!isAdmin || busy}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {isAdmin ? (
            <div className="row">
              <div className="spacer" />
              <button className="btn" onClick={load} disabled={busy}>
                Vazgeç
              </button>
              <button className="btn btn-primary" onClick={save} disabled={busy}>
                <Save size={15} />
                {busy ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
            </div>
          ) : null}
        </div>

        {/* ---- Canlı önizleme ---- */}
        <div className="card" style={{ position: 'sticky', top: 0, alignSelf: 'start' }}>
          <div className="card-head">
            <h3>Evrak Başlığı Önizleme</h3>
          </div>
          <div className="card-body">
            <div
              style={{
                background: '#fff', color: '#111', borderRadius: 6, padding: 18,
                fontSize: 11, lineHeight: 1.55, minHeight: 260,
              }}
            >
              <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
                {profile.logo ? (
                  <img src={profile.logo} alt="" style={{ maxWidth: 56, maxHeight: 56, objectFit: 'contain' }} />
                ) : null}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 14, letterSpacing: '-0.02em' }}>
                    {form.values.name || profile.name}
                  </div>
                  {form.values.tagline ? (
                    <div style={{ color: '#555', fontSize: 10, marginTop: 1 }}>{form.values.tagline}</div>
                  ) : null}
                </div>
              </div>

              <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb', margin: '12px 0' }} />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 9, color: '#888', letterSpacing: '0.06em' }}>İLETİŞİM</div>
                  {profile.address ? <div>{profile.address}</div> : null}
                  {form.values.city ? <div>{form.values.city}</div> : null}
                  {profile.phone ? <div>{profile.phone}</div> : null}
                  {profile.email ? <div>{profile.email}</div> : null}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 9, color: '#888', letterSpacing: '0.06em' }}>VERGİ / BANKA</div>
                  {profile.tax_office ? <div>{profile.tax_office}</div> : null}
                  {profile.tax_number ? <div>VKN: {profile.tax_number}</div> : null}
                  {profile.bank_name ? <div style={{ marginTop: 6 }}>{profile.bank_name}</div> : null}
                  {profile.iban ? <div style={{ fontSize: 9.5, wordBreak: 'break-all' }}>{profile.iban}</div> : null}
                </div>
              </div>

              {profile.default_notes ? (
                <div style={{ marginTop: 14, paddingTop: 10, borderTop: '1px dashed #e5e7eb', color: '#444', fontSize: 10 }}>
                  {profile.default_notes}
                </div>
              ) : null}
            </div>

            <div className="field-hint" style={{ marginTop: 12 }}>
              Bu blok, teklif ve fatura ekranlarının üstünde ve yazdırılan çıktının
              köşesinde aynen görünür.
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={clearing}
        onClose={() => setClearing(false)}
        onConfirm={clearProfile}
        busy={busy}
        title="Firma profili temizlensin mi?"
        message="Ünvan dışındaki tüm alanlar (logo, adres, banka, numara önekleri) boşaltılır.\n\nFaturalarınızın üzerindeki başlık bilgisi silinir. Bu işlem geri alınamaz."
        confirmLabel="Temizle"
      />
    </div>
  );
}
