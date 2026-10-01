/**
 * İLK KURULUM SİHİRBAZI
 * ========================
 * Müşteri programı ilk açtığında karşılaşır.
 * Kendi firma bilgisini bir kez girer; sistemdeki her evrak
 * (fatura, teklif, Excel, baskı) bundan sonra otomatik dolar.
 *
 * Kurulumda .env ile gelen yönetici şifresi değiştirilir (güvenlik için
 * varsayılan şifreyle bırakılmaz).
 */
import { useCallback, useEffect, useState } from 'react';
import {
  Building2, Upload, Check, ChevronRight, ChevronLeft, KeyRound, PartyPopper, Image as ImageIcon,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../components/Toast.jsx';
import { FormField, useFormState } from '../components/Form.jsx';

const ADIMLAR = [
  { anahtar: 'firma', baslik: 'Firma Bilgisi', ikon: Building2 },
  { anahtar: 'logo', baslik: 'Logo', ikon: ImageIcon },
  { anahtar: 'sifre', baslik: 'Güvenlik', ikon: KeyRound },
  { anahtar: 'bitti', baslik: 'Hazır', ikon: PartyPopper },
];

const FIRMA_FIELDS = [
  { name: 'name', label: 'Firma adı *', span: 2, required: true, placeholder: 'Örn. Deniz Demir Çelik A.Ş.' },
  { name: 'short_name', label: 'Kısa ad', span: 2, placeholder: 'Evraklarda kısa görünsün (örn. DENİZ)' },
  { name: 'tax_office', label: 'Vergi dairesi', span: 1 },
  { name: 'tax_number', label: 'Vergi / TC kimlik no', span: 1 },
  { name: 'phone', label: 'Telefon', span: 1 },
  { name: 'email', label: 'E-posta', span: 1, type: 'email' },
  { name: 'address', label: 'Adres', span: 2 },
  { name: 'city', label: 'İl / İlçe', span: 1 },
  { name: 'website', label: 'Web sitesi', span: 1 },
  { name: 'bank_name', label: 'Banka', span: 1 },
  { name: 'iban', label: 'IBAN', span: 1, placeholder: 'TR00 0000 0000 0000 0000 0000 00' },
];

const SIFRE_FIELDS = [
  {
    name: 'currentPassword',
    label: 'Kurulum şifresi',
    type: 'password',
    span: 2,
    required: true,
    placeholder: 'Kurulum sihirbazının verdiği şifre',
  },
  {
    name: 'newPassword',
    label: 'Yeni şifre',
    type: 'password',
    span: 2,
    required: true,
    hint: 'En az 8 karakter, rakam içermeli',
  },
  {
    name: 'confirmPassword',
    label: 'Yeni şifre (tekrar)',
    type: 'password',
    span: 2,
    required: true,
  },
];

/** Kurulum yapıldı mı? .env'de demo_musteri_adi yazıyorsa sayılır. */
function kurulumYapildiMi(company) {
  return !!company?.tax_number || !!company?.address;
}

// NOT: App.jsx'te lazy(() => import(...)) ile yukleniyor. React.lazy
// MODULUN DEFAULT EXPORT'unu bekler. Sadece named export olsaydi bilesen
// tanimsiz olur ve TUM EKRAN KARARDI (siyah ekran).
export default function FirstRunWizard({ company, reload, onDone }) {
  const toast = useToast();
  const { user, refreshUser } = useAuth();
  const [adim, setAdim] = useState(0);
  const [busy, setBusy] = useState(false);
  const [logo, setLogo] = useState(null);
  const [logoOnizleme, setLogoOnizleme] = useState(null);

  const firmaForm = useFormState(FIRMA_FIELDS, {
    name: company?.name && company.name !== 'Veltron' ? company.name : '',
    tax_number: company?.tax_number ?? '',
    address: company?.address ?? '',
  });
  const sifreForm = useFormState(SIFRE_FIELDS, {});

  // Mevcut logo varsa önizlemede göster
  useEffect(() => {
    if (company?.logo) setLogoOnizleme(company.logo);
  }, [company?.logo]);

  const firmaKaydet = useCallback(async () => {
    const v = firmaForm.submit();
    if (!v) return;
    setBusy(true);
    try {
      const yeni = { ...(company || {}), ...v };
      if (logo) yeni.logo = logo;
      await api.put('/company', yeni);
      toast.success('Firma bilgileri kaydedildi');
      await reload();
      setAdim(2);
    } catch (err) {
      toast.fromError(err, 'Kaydedilemedi');
    } finally {
      setBusy(false);
    }
  }, [company, firmaForm, logo, reload, toast]);

  const sifreDegistir = useCallback(async () => {
    const v = sifreForm.submit();
    if (!v) return;
    if (v.newPassword !== v.confirmPassword) {
      sifreForm.setErrors({ confirmPassword: 'Şifreler aynı değil' });
      return;
    }
    if (v.newPassword.length < 8) {
      sifreForm.setErrors({ newPassword: 'En az 8 karakter olmalı' });
      return;
    }
    setBusy(true);
    try {
      await api.post('/auth/change-password', {
        currentPassword: v.currentPassword,
        newPassword: v.newPassword,
      });
      toast.success('Şifreniz değiştirildi', 'Bundan sonra yeni şifreyi kullanın.');
      await refreshUser();
      setAdim(3);
    } catch (err) {
      toast.fromError(err, 'Şifre değiştirilemedi');
    } finally {
      setBusy(false);
    }
  }, [sifreForm, refreshUser, toast]);

  const logoSec = (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Logo değil', 'Lütfen resim dosyası seçin (JPG, PNG).');
      return;
    }
    if (file.size > 700 * 1024) {
      toast.error('Dosya çok büyük', 'Logo en fazla 700 KB olabilir. Lütfen küçültün.');
      return;
    }
    const r = new FileReader();
    r.onload = () => {
      setLogo(r.result);
      setLogoOnizleme(r.result);
    };
    r.readAsDataURL(file);
  };

  const Adim = ADIMLAR[adim];
  const sonAdim = adim === ADIMLAR.length - 1;

  // Logo atlanabilsin (zorunlu değil)
  const ilerle = () => {
    if (adim === 0) return firmaKaydet();
    if (adim === 1) return setAdim(2);
    if (adim === 2) return sifreDegistir();
    return null;
  };

  return (
    <div className="wizard-backdrop">
      <div className="wizard">
        <div className="wizard-head">
          <div className="wizard-brand">
            <div className="wizard-logo">V</div>
            <div>
              <strong>Veltron Kurulumu</strong>
              <div className="text-dim text-sm">3 adım, birkaç dakika</div>
            </div>
          </div>
          <div className="wizard-steps">
            {ADIMLAR.map((a, i) => (
              <div key={a.anahtar} className={`wizard-step ${i === adim ? 'on' : ''} ${i < adim ? 'done' : ''}`}>
                <span>{i < adim ? <Check size={11} /> : i + 1}</span>
                {a.baslik}
              </div>
            ))}
          </div>
        </div>

        <div className="wizard-body">
          {!sonAdim ? (
            <>
              <div className="wizard-title">
                <Adim.ikon size={18} />
                <h2>{Adim.baslik}</h2>
              </div>

              {adim === 0 ? (
                <>
                  <p className="text-dim" style={{ marginBottom: 16 }}>
                    Bu bilgiler <strong>fatura, teklif, Excel çıktısı ve baskılarda</strong> otomatik
                    olarak kullanılır. Bir kez girin, her yerde görünsün.
                  </p>
                  <div className="form-grid">
                    {FIRMA_FIELDS.map((f) => (
                      <FormField
                        key={f.name}
                        field={f}
                        value={firmaForm.values[f.name]}
                        error={firmaForm.errors[f.name]}
                        onChange={(v) => firmaForm.setValue(f.name, v)}
                        disabled={busy}
                      />
                    ))}
                  </div>
                </>
              ) : null}

              {adim === 1 ? (
                <div className="text-center" style={{ padding: '10px 0' }}>
                  <div
                    className="logo-drop"
                    onClick={() => document.getElementById('wizard-logo')?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      logoSec(e.dataTransfer.files?.[0]);
                    }}
                  >
                    {logoOnizleme ? (
                      <img src={logoOnizleme} alt="Logo önizleme" />
                    ) : (
                      <div className="text-dim">
                        <Upload size={26} style={{ marginBottom: 6 }} />
                        <div>Logoyu buraya sürükleyin</div>
                        <div className="text-sm">veya tıklayıp seçin</div>
                      </div>
                    )}
                  </div>
                  <input
                    id="wizard-logo"
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => logoSec(e.target.files?.[0])}
                  />
                  <p className="text-dim text-sm mt-14" style={{ maxWidth: 420, margin: '14px auto 0' }}>
                    Logo; fatura, teklif, Excel dosyası ve ekran görüntüsünde kullanılır.
                    Şeffaf zeminli PNG en iyi görünür. <strong>Zorunlu değil</strong> — sonra da
                    yükleyebilirsiniz.
                  </p>
                </div>
              ) : null}

              {adim === 2 ? (
                <>
                  <p className="text-dim" style={{ marginBottom: 16 }}>
                    Kurulumda size geçici bir şifre verildi. Güvenlik için şimdi kendi şifrenizi
                    belirleyin — <strong>bunu unutmayın</strong>, şifre değiştirme ekranı yok.
                  </p>
                  <div className="form-grid">
                    {SIFRE_FIELDS.map((f) => (
                      <FormField
                        key={f.name}
                        field={f}
                        value={sifreForm.values[f.name]}
                        error={sifreForm.errors[f.name]}
                        onChange={(v) => sifreForm.setValue(f.name, v)}
                        disabled={busy}
                      />
                    ))}
                  </div>
                </>
              ) : null}
            </>
          ) : (
            <div className="text-center" style={{ padding: '18px 0' }}>
              <div className="wizard-done">
                <PartyPopper size={34} />
              </div>
              <h2 style={{ margin: '14px 0 6px' }}>Kurulum tamamlandı</h2>
              <p className="text-dim" style={{ maxWidth: 460, margin: '0 auto' }}>
                Artık iş emirleri açabilir, tartım girebilir, fatura kesebilirsiniz.
                <br />
                Aşama 1: <strong>Firma Profili</strong> ekranından logo ve banka bilgilerini
                tamamlayın.
              </p>
            </div>
          )}
        </div>

        <div className="wizard-foot">
          {adim > 0 && !sonAdim ? (
            <button className="btn" onClick={() => setAdim((a) => a - 1)} disabled={busy}>
              <ChevronLeft size={14} />
              Geri
            </button>
          ) : (
            <div />
          )}
          <div className="spacer" />
          {sonAdim ? (
            <button
              className="btn btn-primary"
              onClick={() => {
                reload();
                onDone?.();
              }}
            >
              Başlayalım
              <ChevronRight size={14} />
            </button>
          ) : (
            <button className="btn btn-primary" onClick={ilerle} disabled={busy}>
              {busy ? 'Kaydediliyor...' : adim === 1 ? 'Devam et' : 'Kaydet ve devam et'}
              <ChevronRight size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
