/**
 * ÜRÜN (MALZEME) EXCEL İÇE AKTARMA EKRANI
 * ======================================
 * Ürün & Malzeme listesine Excel/CSV ile toplu ekleme veya güncelleme.
 *
 * Akış (diğer içe aktarma ekranlarıyla AYNI):
 *   Dosya seç → önizleme (kaç yeni, kaç güncellenecek, kaç hatalı) → onayla
 *
 * ⛔ ÖNİZLEME HİÇBİR KAYIT YAZMAZ.
 *
 * ⛔ ⛔ EN ÖNEMLİ KURAL — FİYAT VE STOK EZİLMEZ:
 *    Firma listenizdeki "birim fiyat" bayinin kendi fiyatı olabilir.
 *    Siz fiyat sütununu boş bırakırsanız mevcut fiyatı KORUNUR; doldurursanız
 *    o yazılır. Aynı şey kritik stok için geçerli. Sessizce ezmek kâr marjınızı
 *    bozar — bu yüzden sütun başlıklarında uyarı yazılıdır.
 *
 * ⛔ TEKİLLEŞTİRME:
 *   - Stok Kodu (SKU) varsa ona göre eşleşir (en güvenilir)
 *   - SKU yoksa Ad + Birim eşleşir
 */
import { useCallback, useRef, useState } from 'react';
import {
  Upload, FileSpreadsheet, AlertTriangle, Download, Info, RefreshCw,
  Package, Check, X, Pencil,
} from 'lucide-react';
import { api, getServerUrl, getToken, money, number } from '../lib/api.js';
import { useToast } from '../components/Toast.jsx';
import { PageHeader } from '../components/Primitives.jsx';
import { ConfirmDialog } from '../components/Modal.jsx';

const ALAN_ETIKET = {
  name: 'Ürün Adı',
  sku: 'Stok Kodu',
  category: 'Kategori',
  unit: 'Birim',
  min_stock: 'Kritik Stok',
  unit_price: 'Birim Fiyat',
  location: 'Konum',
  notes: 'Notlar',
};

export default function ProductImport() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [onizleme, setOnizleme] = useState(null);
  const [sonuc, setSonuc] = useState(null);
  const [onayla, setOnayla] = useState(false);
  const fileRef = useRef(null);

  /** Şablonu indirir. */
  const sablonIndir = async () => {
    try {
      const r = await fetch(`${getServerUrl()}/api/import/product/template`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!r.ok) throw new Error(`Sunucu ${r.status}`);
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'urun-aktarma-sablonu.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.fromError(err, 'Şablon indirilemedi');
    }
  };

  /** Dosyayı sunucuya gönderip önizleme alır (KAYIT YAZMAZ). */
  const dosyaYukle = useCallback(async (file) => {
    if (!file) return;
    if (!/\.(csv|xlsx|xls)$/i.test(file.name)) {
      toast.error('Dosya türü', 'Yalnızca .csv veya .xlsx yükleyebilirsiniz.');
      return;
    }
    setBusy(true);
    setOnizleme(null);
    setSonuc(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`${getServerUrl()}/api/import/product/preview`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: fd,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Sunucu ${res.status}`);
      setOnizleme(json.data);
      toast.success(
        'Dosya okundu',
        `${json.data.toplam_satir} satır · ${json.data.yeni} yeni · ` +
        `${json.data.guncellenecek} güncellenecek` +
        (json.data.hatali ? ` · ${json.data.hatali} hatalı` : '')
      );
    } catch (err) {
      toast.fromError(err, 'Dosya okunamadı');
    } finally {
      setBusy(false);
    }
  }, []);

  /** Onaylanan satırları yazar. */
  const kaydet = async () => {
    if (!onizleme) return;
    setBusy(true);
    try {
      const res = await api.post('/import/product/commit', {
        rows: onizleme.tum_satirlar ?? onizleme.ornek_satirlar,
      });
      setSonuc(res.data);
      setOnayla(false);
      setOnizleme(null);
      if (fileRef.current) fileRef.current.value = '';
      toast.success('İçe aktarma tamamlandı', res.data.mesaj);
    } catch (err) {
      toast.fromError(err, 'Kaydedilemedi');
    } finally {
      setBusy(false);
    }
  };

  const vazgec = () => {
    setOnizleme(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const eslesme = onizleme?.eslesme || {};
  const satirlar = onizleme?.tum_satirlar || [];

  return (
    <>
      <PageHeader
        title="Ürün İçe Aktarma"
        description="Excel dosyanızla ürün ve malzeme ekleyin veya güncelleyin"
      />

      <div className="alert info mb-14">
        <Info size={15} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          Dosyayı yükleyin, sistem <strong>sütunları kendisi tanır</strong> ve ne
          yapılacağını gösterir — <strong>onaylayana kadar hiçbir kayıt yazılmaz.</strong>
          Aynı ürünü iki kez eklememek için <strong>Stok Kodu</strong> sütununu
          doldurun; doluysa ona göre eşleştirilir, boşsa ada ve birime bakılır.
        </span>
      </div>

      {/* ⛔ FİYAT UYARISI — bu ekranın en kritik kuralı */}
      {eslesme.unit_price ? (
        <div className="alert warning mb-14">
          <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            Dosyanızda <strong>Birim Fiyat</strong> sütunu var ve{' '}
            <strong>güncelleme yapılacak satırlarda mevcut fiyatın ÜZERİNE
            yazılacak</strong>. Fiyatları korumak için o sütunu Excel'de
            <strong> tamamen boş bırakın</strong> — boş satırlarda mevcut fiyat
            olduğu gibi kalır. Kritik stok için de aynı kural geçerli.
          </span>
        </div>
      ) : null}

      {/* ---- Şablon indir ---- */}
      <div className="card mb-14">
        <div className="card-body">
          <div className="row" style={{ gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 240 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 3 }}>
                <FileSpreadsheet size={14} style={{ verticalAlign: -2, marginRight: 6 }} />
                Örnek dosya indirin
              </div>
              <div className="text-dim text-sm">
                Sütun başlıklarının nasıl olması gerektiğini gösterir. Sizinkiler
                farklıysa sorun değil — sistem yakın isimleri otomatik tanır.
              </div>
            </div>
            <button className="btn" onClick={sablonIndir}>
              <Download size={14} />
              Şablonu İndir
            </button>
          </div>
        </div>
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
            accept=".xlsx,.xls,.csv"
            hidden
            onChange={(e) => dosyaYukle(e.target.files?.[0])}
          />
        </div>
      </div>

      {/* ---- Sonuç ---- */}
      {sonuc ? (
        <div
          className="alert success mb-14"
          style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}
        >
          <div>
            <Check size={15} style={{ flexShrink: 0, verticalAlign: -2, marginRight: 5 }} />
            <strong>{sonuc.mesaj}</strong>
          </div>
          {sonuc.atlanan_detay?.length ? (
            <details>
              <summary style={{ cursor: 'pointer', fontSize: 12 }}>
                Atlanan satırlar ({sonuc.atlanan})
              </summary>
              <ul style={{ margin: '6px 0 0', paddingLeft: 20, fontSize: 12 }}>
                {sonuc.atlanan_detay.map((a, i) => (
                  <li key={i}>
                    Satır {a.satir}: {a.sebep}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}

      {/* ---- Önizleme ---- */}
      {onizleme ? (
        <div className="card mb-14">
          <div className="card-head">
            <Package size={16} style={{ color: 'var(--primary)' }} />
            <h3>Önizleme</h3>
            <span className="text-dim text-sm">{onizleme.dosya_adi}</span>
          </div>

          <div className="card-body">
            {/* Özet */}
            <div className="row row-wrap" style={{ gap: 8, marginBottom: 14 }}>
              <span className="badge info">{onizleme.toplam_satir} satır</span>
              <span className="badge success">{onizleme.yeni} yeni ürün</span>
              {onizleme.guncellenecek ? (
                <span className="badge warning">{onizleme.guncellenecek} güncellenecek</span>
              ) : null}
              {onizleme.hatali ? (
                <span className="badge danger">{onizleme.hatali} hatalı (atlanacak)</span>
              ) : null}
            </div>

            {onizleme.eslesmeyenler?.length ? (
              <div className="alert warning" style={{ marginBottom: 14 }}>
                <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>
                  Tanınmayan sütunlar: <strong>{onizleme.eslesmeyenler.join(', ')}</strong>
                  <br />
                  Bu sütunlar <strong>kaydedilmeyecek</strong>. Ürün Adı sütunu
                  eşleşmediyse aktarım yapılamaz.
                </span>
              </div>
            ) : null}

            {/* Sütun eşleşmesi */}
            <div style={{ marginBottom: 14 }}>
              <div className="field-label" style={{ marginBottom: 6 }}>
                Sütun eşleşmesi
              </div>
              <div className="row row-wrap" style={{ gap: 6 }}>
                {Object.entries(eslesme).map(([alan, baslik]) => (
                  <span key={alan} className="badge success" title={baslik}>
                    {ALAN_ETIKET[alan] || alan} ← {baslik}
                  </span>
                ))}
                {Object.keys(ALAN_ETIKET)
                  .filter((k) => !eslesme[k])
                  .map((k) => (
                    <span key={k} className="badge muted">
                      {ALAN_ETIKET[k]} — yok
                    </span>
                  ))}
              </div>
            </div>

            {/* Satır tablosu */}
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 34 }}>#</th>
                    <th>Ürün Adı</th>
                    <th>Stok Kodu</th>
                    <th>Birim</th>
                    <th className="sag">Birim Fiyat</th>
                    <th className="sag">Kritik Stok</th>
                    <th>Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {satirlar.slice(0, 100).map((r, i) => (
                    <tr key={i}>
                      <td className="text-dim">{i + 1}</td>
                      <td>{r.name || <span className="text-dim">—</span>}</td>
                      <td className="mono">{r.sku || <span className="text-dim">—</span>}</td>
                      <td>{r.unit || <span className="text-dim">—</span>}</td>
                      <td className="sag">
                        {r.unit_price != null ? (
                          money(r.unit_price)
                        ) : (
                          <span className="text-dim" title="Boş bırakıldı — mevcut fiyat korunacak">
                            korunacak
                          </span>
                        )}
                      </td>
                      <td className="sag">
                        {r.min_stock != null ? (
                          number(r.min_stock)
                        ) : (
                          <span className="text-dim" title="Boş bırakıldı — mevcut stok korunacak">
                            korunacak
                          </span>
                        )}
                      </td>
                      <td>
                        {r._durum === 'yeni' ? (
                          <span className="badge success">Yeni</span>
                        ) : r._durum === 'guncellenecek' ? (
                          <span className="badge warning">
                            <Pencil size={11} /> Güncellenecek
                          </span>
                        ) : (
                          <span className="badge danger" title={r._hata}>
                            <X size={11} /> Atlanacak
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {satirlar.length > 100 ? (
                <div className="text-dim text-sm" style={{ marginTop: 8 }}>
                  İlk 100 satır gösteriliyor (toplam {number(satirlar.length)}).
                </div>
              ) : null}
            </div>

            {onizleme.hatali ? (
              <div className="alert warning" style={{ marginTop: 14, marginBottom: 0 }}>
                <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>
                  <strong>{onizleme.hatali} satır kaydedilmeyecek.</strong> Sebepleri:
                  ürün adı boş ya da negatif stok/fiyat. Excel dosyanı düzeltip yeniden
                  yükleyebilirsiniz.
                </span>
              </div>
            ) : null}

            <div
              className="row"
              style={{ gap: 8, marginTop: 16, justifyContent: 'flex-end' }}
            >
              <button className="btn" onClick={vazgec} disabled={busy}>
                Vazgeç
              </button>
              <button
                className="btn btn-primary"
                onClick={() => setOnayla(true)}
                disabled={busy || onizleme.yeni + onizleme.guncellenecek === 0}
              >
                <Check size={14} />
                {onizleme.guncellenecek
                  ? `${onizleme.yeni} Ekle · ${onizleme.guncellenecek} Güncelle`
                  : `${onizleme.yeni} Ürün Ekle`}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ---- Onay ---- */}
      <ConfirmDialog
        open={onayla}
        onClose={() => setOnayla(false)}
        onConfirm={kaydet}
        busy={busy}
        title="Kayıtlar yazılsın mı?"
        confirmLabel="Evet, Kaydet"
        message={
          onizleme
            ? `${onizleme.yeni} yeni ürün eklenecek` +
              (onizleme.guncellenecek
                ? `, ${onizleme.guncellenecek} ürün güncellenecek`
                : '') +
              (onizleme.hatali ? `, ${onizleme.hatali} hatalı satır atlanacak` : '') +
              (eslesme.unit_price && onizleme.guncellenecek
                ? '\n\nDosyada fiyat olan satırlarda mevcut fiyatların üzerine yazılacak.'
                : '') +
              '\n\nBu işlem geri alınamaz.'
            : ''
        }
      />
    </>
  );
}
