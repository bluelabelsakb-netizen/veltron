/**
 * FATURA İÇE AKTARMA EKRANI
 * ==========================
 * e-Fatura portalından (veya Logo/Foriba/Paraşüt/Deha'dan) alınan
 * Excel/CSV dosyasını sisteme alır.
 *
 * Akış: Dosya seç → önizleme (kaç yeni, kaç mükerrer) → onayla
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Upload, FileSpreadsheet, Check, X, AlertTriangle, Download, Info, RefreshCw } from 'lucide-react';
import { api, getServerUrl, getToken, money, number } from '../lib/api.js';
import { useToast } from '../components/Toast.jsx';
import { PageHeader } from '../components/Primitives.jsx';
import { Modal, ConfirmDialog } from '../components/Modal.jsx';

const ALAN_ETIKET = {
  fatura_no: 'Fatura No',
  tarih: 'Tarih',
  vade: 'Vade',
  musteri: 'Müşteri',
  vergi_no: 'Vergi No',
  aciklama: 'Açıklama',
  miktar: 'Miktar',
  birim: 'Birim',
  birim_fiyat: 'Birim Fiyat',
  tutar: 'Tutar',
  kdv_orani: 'KDV %',
  kdv_tutari: 'KDV Tutarı',
  genel_toplam: 'Genel Toplam',
  odeme_turu: 'Ödeme Türü',
};

export default function InvoiceImport() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [onizleme, setOnizleme] = useState(null);
  const [esleme, setEsleme] = useState({});
  const [dosya, setDosya] = useState(null);
  const [mukerrerAtla, setMukerrerAtla] = useState(true);
  const [musteriOlustur, setMusteriOlustur] = useState(true);
  const [onayla, setOnayla] = useState(false);
  const [sonuc, setSonuc] = useState(null);
  const fileRef = useRef(null);

  /** Dosyayı sunucuya gönderip önizleme alır. */
  const dosyaYukle = async (file) => {
    if (!file) return;
    const uzanti = /\.(csv|xlsx|xls)$/i.test(file.name);
    if (!uzanti) {
      toast.error('Dosya türü', 'Yalnızca .csv veya .xlsx yükleyebilirsiniz.');
      return;
    }
    setBusy(true);
    setOnizleme(null);
    setSonuc(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`${getServerUrl()}/api/import/invoice/preview`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: fd,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Sunucu ${res.status}`);
      setOnizleme(json.data);
      setEsleme(json.data.eslesme || {});
      setDosya(file);
      toast.success(
        'Dosya okundu',
        `${json.data.toplam_satir} satır · ${json.data.yeni} yeni · ${json.data.mukerrer} mükerrer`
      );
    } catch (err) {
      toast.fromError(err, 'Dosya okunamadı');
    } finally {
      setBusy(false);
    }
  };

  /** Önizlemede gelen satırları kalıcı yazar. */
  const kaydet = async () => {
    if (!onizleme) return;
    setBusy(true);
    try {
      const res = await api.post('/import/invoice/commit', {
        rows: onizleme.tum_satirlar ?? onizleme.ornek_satirlar,
        esleme,
        dosya_adi: onizleme.dosya_adi,
        mukerrer_atla: mukerrerAtla,
        musteri_olustur: musteriOlustur,
      });
      setSonuc(res.data);
      setOnayla(false);
      setOnizleme(null);
      setDosya(null);
      if (fileRef.current) fileRef.current.value = '';
      toast.success('İçe aktarma tamamlandı', res.message);
    } catch (err) {
      toast.fromError(err, 'Kaydedilemedi');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Fatura İçe Aktarma"
        description="e-Fatura portalından aldığınız dosyayı sisteme alın"
      />

      <div className="alert info mb-14">
        <Info size={15} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          <strong>GİB'e doğrudan bağlanılamaz</strong> — bunu sadece özel entegratörler
          yapabilir. Bu yol her portalda çalışır: e-Fatura / e-Arşiv ekranında
          <strong> "Excel'e aktar"</strong> deyip buraya yüklemeniz yeterli.
          GİB, Logo, Foriba, Paraşüt, Deha — hepsinin çıktısı okunur.
        </span>
      </div>

      {/* ---- Yükleme ---- */}
      <div className="card mb-14">
        <div className="card-body">
          <div
            className="logo-drop"
            style={{ height: 140 }}
            onClick={() => !busy && fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              dosyaYukle(e.dataTransfer.files?.[0]);
            }}
          >
            {busy ? (
              <div className="text-dim">
                <RefreshCw size={24} className="spin" style={{ marginBottom: 6 }} />
                <div>Dosya okunuyor...</div>
              </div>
            ) : (
              <div className="text-dim">
                <Upload size={26} style={{ marginBottom: 6 }} />
                <div>
                  <strong style={{ color: 'var(--text)' }}>Dosyayı buraya sürükleyin</strong>
                </div>
                <div className="text-sm">veya tıklayıp seçin — .xlsx veya .csv</div>
              </div>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            style={{ display: 'none' }}
            onChange={(e) => dosyaYukle(e.target.files?.[0])}
          />

          <div className="row mt-14" style={{ gap: 10 }}>
            <button
              className="btn btn-sm"
              onClick={async () => {
                const r = await fetch(`${getServerUrl()}/api/import/invoice/template`, {
                  headers: { Authorization: `Bearer ${getToken()}` },
                });
                const b = await r.blob();
                const a = document.createElement('a');
                a.href = URL.createObjectURL(b);
                a.download = 'fatura-aktarma-sablonu.xlsx';
                a.click();
                setTimeout(() => URL.revokeObjectURL(a.href), 3000);
              }}
            >
              <Download size={13} />
              Örnek şablonu indir
            </button>
            <span className="text-dim text-sm">
              Sütun adları farklı olsa da otomatik eşleştirilir.
            </span>
          </div>
        </div>
      </div>

      {/* ---- Sonuç ---- */}
      {sonuc ? (
        <div className="card mb-14" style={{ borderColor: 'var(--success)' }}>
          <div className="card-head">
            <Check size={15} style={{ color: 'var(--success)' }} />
            <h3>İçe aktarma tamamlandı</h3>
          </div>
          <div className="card-body">
            <div className="stat-row">
              <span className="label">Eklenen fatura</span>
              <span className="value" style={{ color: '#4ade80', fontWeight: 700 }}>
                {number(sonuc.eklenen)}
              </span>
            </div>
            {sonuc.atlanan ? (
              <div className="stat-row">
                <span className="label">Atlanan (mükerrer)</span>
                <span className="value">{number(sonuc.atlanan)}</span>
              </div>
            ) : null}
            {sonuc.hatalar?.length ? (
              <div className="stat-row">
                <span className="label">Hatalı satır</span>
                <span className="value" style={{ color: '#f87171' }}>{sonuc.hatalar.length}</span>
              </div>
            ) : null}
            {sonuc.hatalar?.length ? (
              <div className="mt-14">
                {sonuc.hatalar.slice(0, 5).map((h, i) => (
                  <div key={i} className="text-sm text-dim">
                    • {h}
                  </div>
                ))}
              </div>
            ) : null}
            <button
              className="btn btn-sm mt-14"
              onClick={() => {
                setSonuc(null);
                setDosya(null);
                if (fileRef.current) fileRef.current.value = '';
              }}
            >
              <X size={13} />
              Başka dosya
            </button>
          </div>
        </div>
      ) : null}

      {/* ---- Önizleme ---- */}
      {onizleme ? (
        <Modal
          open
          onClose={() => setOnizleme(null)}
          title="Aktarımı gözden geçirin"
          subtitle={`${onizleme.dosya_adi} · ${onizleme.sayfa || 'sayfa 1'}`}
          size="lg"
          footer={
            <>
              <div className="spacer" />
              <button className="btn" onClick={() => setOnizleme(null)} disabled={busy}>
                Vazgeç
              </button>
              <button
                className="btn btn-primary"
                onClick={() => setOnayla(true)}
                disabled={busy || onizleme.yeni === 0}
              >
                <Check size={14} />
                {onizleme.yeni} fatura ekle
              </button>
            </>
          }
        >
          <div className="grid grid-3 mb-14">
            <div className="kpi">
              <div className="kpi-value">{number(onizleme.toplam_satir)}</div>
              <div className="kpi-label">Toplam satır</div>
            </div>
            <div className="kpi">
              <div className="kpi-value" style={{ color: '#4ade80' }}>
                {number(onizleme.yeni)}
              </div>
              <div className="kpi-label">Yeni</div>
            </div>
            <div className="kpi">
              <div className="kpi-value" style={{ color: onizleme.mukerrer ? '#fbbf24' : undefined }}>
                {number(onizleme.mukerrer)}
              </div>
              <div className="kpi-label">Mükerrer</div>
            </div>
          </div>

          <h4 style={{ margin: '16px 0 8px' }}>Sütun eşleştirmesi</h4>
          <div className="row row-wrap" style={{ gap: 6 }}>
            {Object.entries(ALAN_ETIKET).map(([alan, etiket]) => {
              const baslik = esleme[alan];
              return (
                <span key={alan} className={`chip-select ${baslik ? 'on' : ''}`} style={{ cursor: 'default' }}>
                  {baslik ? <Check size={10} /> : <X size={10} />}
                  {etiket}
                  {baslik ? ` ← "${baslik}"` : ' (bulunamadı)'}
                </span>
              );
            })}
          </div>

          {Object.keys(esleme).length < 2 ? (
            <div className="alert warning mt-14">
              <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>
                Çok az sütun eşleşti. Dosyanın ilk satırı başlık satırı olmalı.
                Bulunanlar: {onizleme.basliklar.slice(0, 6).join(', ')}
              </span>
            </div>
          ) : null}

          <h4 style={{ margin: '16px 0 8px' }}>İlk 5 satır</h4>
          <div className="card" style={{ overflowX: 'auto' }}>
            <table className="mini-table">
              <thead>
                <tr>
                  {Object.keys(esleme).slice(0, 6).map((k) => (
                    <th key={k}>{ALAN_ETIKET[k] || k}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {onizleme.ornek_satirlar.map((s, i) => (
                  <tr key={i} style={s._mukerrer ? { opacity: 0.5 } : undefined}>
                    {Object.keys(esleme).slice(0, 6).map((k) => (
                      <td key={k}>
                        {String(s[esleme[k]] ?? '').slice(0, 26)}
                        {s._mukerrer && k === 'fatura_no' ? ' (var)' : ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <label className="row mt-14" style={{ gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={mukerrerAtla}
              onChange={(e) => setMukerrerAtla(e.target.checked)}
            />
            <span className="text-sm">Mükerrer fatura numaralarını atla (önerilir)</span>
          </label>
          <label className="row mt-6" style={{ gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={musteriOlustur}
              onChange={(e) => setMusteriOlustur(e.target.checked)}
            />
            <span className="text-sm">
              Bulunmayan müşterileri otomatik oluştur (kapatırsanız fatura müşterisiz kaydedilir)
            </span>
          </label>
        </Modal>
      ) : null}

      {onayla ? (
        <ConfirmDialog
          open
          title={`${onizleme?.yeni || 0} fatura eklensin mi?`}
          message="Faturalar Faturalar ekranına yeni kayıt olarak eklenir. Daha sonra düzenleyebilirsiniz."
          confirmLabel="Evet, ekle"
          onConfirm={kaydet}
          onClose={() => setOnayla(false)}
        />
      ) : null}
    </>
  );
}
