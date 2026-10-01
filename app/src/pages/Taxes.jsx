/**
 * VERGİ BEYANNAMELERİ
 * ====================
 * Yönetim → Vergiler
 *
 * BU SAYFA NE YAPAR / NE YAPMAZ:
 *   ✅ Yapar: faturalardan TOPLANAN KDV'i hesaplar (satış tarafı)
 *   ✅ Yapar: geçmiş dönemleri listeler
 *   ✅ Yapar: beyan girdiğinde farkı gösterir
 *   ❌ YAPMAZ: ödenecek KDV hesaplamaz (alış faturası tablosu yok)
 *   ❌ YAPMAZ: beyan tutarını belirlemez — muhasebeci girer
 *
 * BU YÜZDEN form "beyan tutarı" alanı boş gelir ve kullanıcı bunu
 * doldurur. Sistem karşılaştırır.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  ShieldCheck, AlertTriangle, Save, Trash2, Settings2, Calculator,
  History, TrendingUp, Wallet, CircleCheck, Clock,
} from 'lucide-react';
import { api, money, number, dateFmt } from '../lib/api.js';
import { useToast } from '../components/Toast.jsx';
import { PageHeader, EmptyState, Loading } from '../components/Primitives.jsx';
import { Modal } from '../components/Modal.jsx';

const VERGI_ETIKET = {
  kdv: 'KDV Beyannamesi',
  muhtasar: 'Muhtasar + Prim Hizmet',
  sgk: 'SGK 4/b',
  gecici: 'Geçici Vergi',
  diger: 'Diğer',
};

const DURUM_ETIKET = {
  bekliyor: { label: 'Bekliyor', sinif: 'warning', ikon: Clock },
  odendi: { label: 'Ödendi', sinif: 'success', ikon: CircleCheck },
  gecikti: { label: 'Gecikti', sinif: 'danger', ikon: AlertTriangle },
};

export default function Taxes() {
  const toast = useToast();
  const [veri, setVeri] = useState(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [ayarlarAcik, setAyarlarAcik] = useState(false);
  const [duzenlenen, setDuzenlenen] = useState(null);

  const yukle = useCallback(async () => {
    try {
      const r = await api.get('/taxes/overview');
      setVeri(r.data);
    } catch (err) {
      toast.fromError(err, 'Vergi bilgileri alınamadı');
    } finally {
      setYukleniyor(false);
    }
  }, [toast]);

  useEffect(() => {
    yukle();
  }, [yukle]);

  if (yukleniyor) return <Loading label="Vergi bilgileri hesaplanıyor..." />;
  if (!veri) return <EmptyState icon={AlertTriangle} title="Vergi bilgileri alınamadı" />;

  const { ayarlar, aktif, gecmis, uyari, vergi_turleri: tipler } = veri;

  return (
    <>
      <PageHeader
        title="Vergiler"
        description={`${ayarlar.rejim_etiket} · ${ayarlar.donem_etiket} beyannamesi`}
        badge={<span className="badge info">KDV %{ayarlar.varsayilan_kdv}</span>}
        actions={
          <button className="btn" onClick={() => setAyarlarAcik(true)}>
            <Settings2 size={14} />
            Vergi Ayarları
          </button>
        }
      />

      {/* ⛔ Uyarı — her zaman görünür */}
      <div className="alert warning mb-14">
        <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          <strong>Dikkat:</strong> {uyari}
          <br />
          <strong>Beyan tutarını siz giriyorsunuz</strong> — sistem yalnızca
          karşılaştırma yapar. Vergi beyanı muhasebecinin sorumluluğundadır.
        </span>
      </div>

      {/* --- İçinde bulunulan dönem --- */}
      <div className="card mb-14">
        <div className="card-head">
          <Calculator size={15} style={{ color: 'var(--primary)' }} />
          <h3>{aktif.etiket}</h3>
          <span className="text-dim text-sm">
            {dateFmt(aktif.baslangic)} – {dateFmt(aktif.bitis)}
          </span>
        </div>
        <div className="card-body">
          <div className="grid grid-3 mb-14">
            <div className="stat-box">
              <div className="stat-label">Topladığın KDV</div>
              <div className="stat-value money" style={{ color: 'var(--primary)' }}>
                {money(aktif.toplanan_kdv)}
              </div>
              <div className="stat-note">
                {number(aktif.fatura_adedi)} fatura · matrah {money(aktif.matrah)}
              </div>
            </div>

            <div className="stat-box">
              <div className="stat-label">Beyan ettiğin</div>
              <div className="stat-value money" style={{ color: aktif.kayit ? 'var(--text)' : 'var(--text-dim)' }}>
                {aktif.kayit ? money(aktif.kayit.declared_amount) : '—'}
              </div>
              <div className="stat-note">
                {aktif.kayit ? 'Beyan kaydı girilmiş' : 'Henüz girilmedi'}
              </div>
            </div>

            <div className="stat-box">
              <div className="stat-label">Fark</div>
              <div
                className="stat-value money"
                style={{
                  color:
                    aktif.fark === null
                      ? 'var(--text-dim)'
                      : aktif.fark > 0
                        ? 'var(--warning)'
                        : aktif.fark < 0
                          ? 'var(--danger)'
                          : 'var(--success)',
                }}
              >
                {aktif.fark === null ? '—' : money(aktif.fark)}
              </div>
              <div className="stat-note">
                {aktif.fark === null
                  ? 'Beyan girilince hesaplanır'
                  : aktif.fark === 0
                    ? 'Topladığınla uyumlu'
                    : 'Farkın gerekçesini notlarda yaz'}
              </div>
            </div>
          </div>

          {aktif.kayit ? (
            <div className="stat-row">
              <span className="label">Vergi türü</span>
              <span className="value">
                {VERGI_ETIKET[aktif.kayit.tax_name ? 'diger' : aktif.tax_kind] ||
                  aktif.kayit.tax_name ||
                  VERGI_ETIKET[aktif.tax_kind]}
              </span>
            </div>
          ) : null}
          {aktif.kayit?.due_date ? (
            <div className="stat-row">
              <span className="label">Son ödeme günü</span>
              <span className="value">{dateFmt(aktif.kayit.due_date)}</span>
            </div>
          ) : null}
          {aktif.kayit?.payment_date ? (
            <div className="stat-row">
              <span className="label">Ödeme tarihi</span>
              <span className="value">{dateFmt(aktif.kayit.payment_date)}</span>
            </div>
          ) : null}
          {aktif.kayit?.kalan_borc != null && aktif.kayit.kalan_borc > 0 ? (
            <div className="stat-row">
              <span className="label">Kalan borç</span>
              <span className="value money neg">{money(aktif.kayit.kalan_borc)}</span>
            </div>
          ) : null}
          {aktif.kayit?.note ? (
            <div className="stat-row">
              <span className="label">Gerekçe notu</span>
              <span className="value">{aktif.kayit.note}</span>
            </div>
          ) : null}

          <div className="row mt-14" style={{ gap: 8 }}>
            <button className="btn btn-primary" onClick={() => setDuzenlenen(aktif)}>
              <Save size={14} />
              Beyan Tutarını Gir / Düzenle
            </button>
          </div>
        </div>
      </div>

      {/* --- Geçmiş dönemler --- */}
      <div className="card">
        <div className="card-head">
          <History size={15} style={{ color: 'var(--text-dim)' }} />
          <h3>Geçmiş Dönemler</h3>
          <div className="spacer" />
          <span className="text-dim text-sm">
            {gecmis.filter((g) => g.kayit).length} / {gecmis.length} beyan girilmiş
          </span>
        </div>
        <div className="card-body">
          <div className="list">
            {gecmis.map((d) => {
              const durum = d.kayit ? DURUM_ETIKET[d.kayit.status] : null;
              const Ikon = durum?.ikon;
              return (
                <div className="list-row" key={d.anahtar}>
                  <div className="grow">
                    <div className="title">
                      {d.etiket}
                      {d.kayit ? (
                        <span className={`badge ${durum.sinif}`} style={{ marginLeft: 8 }}>
                          <Ikon size={11} />
                          {durum.label}
                        </span>
                      ) : (
                        <span className="badge" style={{ marginLeft: 8 }}>
                          beyan yok
                        </span>
                      )}
                    </div>
                    <div className="meta">
                      Toplanan KDV {money(d.toplanan_kdv)}
                      {d.kayit ? ` · Beyan ${money(d.kayit.declared_amount)}` : ''}
                      {d.fark !== null ? ` · Fark ${money(d.fark)}` : ''}
                    </div>
                  </div>
                  <button className="btn btn-sm" onClick={() => setDuzenlenen(d)}>
                    {d.kayit ? 'Düzenle' : 'Beyan Gir'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {ayarlarAcik ? (
        <SettingsModal
          ayarlar={ayarlar}
          rejimler={veri.rejimler}
          donemler={veri.donem_tipleri}
          onClose={() => setAyarlarAcik(false)}
          onSaved={() => {
            setAyarlarAcik(false);
            setYukleniyor(true);
            yukle();
          }}
        />
      ) : null}

      {duzenlenen ? (
        <BeyanModal
          donem={duzenlenen}
          tipler={tipler}
          onClose={() => setDuzenlenen(null)}
          onSaved={() => {
            setDuzenlenen(null);
            setYukleniyor(true);
            yukle();
          }}
        />
      ) : null}
    </>
  );
}

/** Vergi ayarları: rejim, dönem tipi, varsayılan KDV. */
function SettingsModal({ ayarlar, rejimler, donemler, onClose, onSaved }) {
  const toast = useToast();
  const [tax_regime, setRejim] = useState(ayarlar.rejim);
  const [tax_period, setDonem] = useState(ayarlar.donem_tipi);
  const [default_tax_rate, setOran] = useState(ayarlar.varsayilan_kdv);
  const [tax_office, setVergiDairesi] = useState(ayarlar.tax_office || '');
  const [busy, setBusy] = useState(false);

  const kaydet = async () => {
    setBusy(true);
    try {
      await api.put('/taxes/settings', {
        tax_regime,
        tax_period,
        default_tax_rate: Number(default_tax_rate),
        tax_office,
      });
      toast.success('Vergi ayarları kaydedildi');
      onSaved();
    } catch (err) {
      toast.fromError(err, 'Ayarlar kaydedilemedi');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Vergi Ayarları"
      subtitle="Bu ayarlar tüm fatura ve teklifleri etkiler"
      footer={
        <>
          <div className="spacer" />
          <button className="btn" onClick={onClose} disabled={busy}>
            Vazgeç
          </button>
          <button className="btn btn-primary" onClick={kaydet} disabled={busy}>
            {busy ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </>
      }
    >
      <div className="field">
        <label className="field-label" htmlFor="rejim">
          İşletme türü
        </label>
        <select
          id="rejim"
          className="input"
          value={tax_regime}
          onChange={(e) => setRejim(e.target.value)}
        >
          {rejimler.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        <div className="field-hint">
          Şirket seçersen geçici vergi çeyreklik, şahıs işletmesi seçersen
          dönem aylığa uyarlanır.
        </div>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="donem">
          Beyanneme dönemi
        </label>
        <select
          id="donem"
          className="input"
          value={tax_period}
          onChange={(e) => setDonem(e.target.value)}
        >
          {donemler.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="oran">
          Varsayılan KDV oranı (%)
        </label>
        <input
          id="oran"
          className="input"
          type="number"
          min="0"
          step="1"
          value={default_tax_rate}
          onChange={(e) => setOran(e.target.value)}
        />
        <div className="field-hint">
          <strong>Bu oran artık gerçekten uygulanır.</strong> Fatura ve teklif
          keserken bu değer varsayılan gelir. Faturaya özel farklı oran
          yine de seçebilirsin.
        </div>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="vd">
          Vergi dairesi
        </label>
        <input
          id="vd"
          className="input"
          value={tax_office}
          onChange={(e) => setVergiDairesi(e.target.value)}
          placeholder="Örn. Gebze VD"
        />
      </div>
    </Modal>
  );
}

/** Beyan tutarı girişi — muhasebecinin girdiği RESMİ tutar. */
function BeyanModal({ donem, tipler, onClose, onSaved }) {
  const toast = useToast();
  const k = donem.kayit;
  const [tax_kind, setTur] = useState(donem.tax_kind || 'kdv');
  const [tax_name, setAd] = useState(k?.tax_name || '');
  const [declared_amount, setTutar] = useState(k?.declared_amount ?? '');
  const [paid_amount, setOdenen] = useState(k?.paid_amount ?? '');
  const [due_date, setSonG] = useState(k?.due_date || '');
  const [payment_date, setOdeT] = useState(k?.payment_date || '');
  const [status, setDurum] = useState(k?.status || 'bekliyor');
  const [note, setNot] = useState(k?.note || '');
  const [busy, setBusy] = useState(false);

  const beyan = Number(declared_amount) || 0;
  const fark = Math.round((beyan - donem.toplanan_kdv) * 100) / 100;

  const kaydet = async () => {
    setBusy(true);
    try {
      await api.put(`/taxes/period/${encodeURIComponent(donem.anahtar)}`, {
        tax_kind,
        tax_name: tax_name || undefined,
        declared_amount: beyan,
        paid_amount: Number(paid_amount) || 0,
        due_date: due_date || undefined,
        payment_date: payment_date || undefined,
        status,
        note: note || undefined,
      });
      toast.success('Beyan kaydedildi', `${donem.etiket} · ${VERGI_ETIKET[tax_kind]}`);
      onSaved();
    } catch (err) {
      toast.fromError(err, 'Kaydedilemedi');
    } finally {
      setBusy(false);
    }
  };

  const sil = async () => {
    if (!k) return;
    setBusy(true);
    try {
      await api.del(`/taxes/period/${k.id}`);
      toast.success('Kayıt silindi');
      onSaved();
    } catch (err) {
      toast.fromError(err, 'Silinemedi');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Beyan Tutarı"
      subtitle={`${donem.etiket} · ${dateFmt(donem.baslangic)} – ${dateFmt(donem.bitis)}`}
      footer={
        <>
          {k ? (
            <button className="btn btn-danger" onClick={sil} disabled={busy}>
              <Trash2 size={14} />
              Kaydı Sil
            </button>
          ) : null}
          <div className="spacer" />
          <button className="btn" onClick={onClose} disabled={busy}>
            Vazgeç
          </button>
          <button className="btn btn-primary" onClick={kaydet} disabled={busy}>
            {busy ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </>
      }
    >
      {/* Sistem ne hesapladı — karşılaştırma için */}
      <div className="alert info mb-14">
        <TrendingUp size={16} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          Sistem bu dönemde faturalardan{' '}
          <strong>{money(donem.toplanan_kdv)} KDV</strong> topladı
          ({number(donem.fatura_adedi)} fatura).
          <br />
          <strong>Sadece satış tarafıdır</strong> — ödenecek KDV hesaplanmaz.
        </span>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="bt-tur">
          Vergi türü
        </label>
        <select
          id="bt-tur"
          className="input"
          value={tax_kind}
          onChange={(e) => setTur(e.target.value)}
        >
          {tipler.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      {tax_kind === 'diger' ? (
        <div className="field">
          <label className="field-label" htmlFor="bt-ad">
            Verginin adı
          </label>
          <input
            id="bt-ad"
            className="input"
            value={tax_name}
            onChange={(e) => setAd(e.target.value)}
            placeholder="Örn. Damga vergisi"
          />
        </div>
      ) : null}

      <div className="field">
        <label className="field-label" htmlFor="bt-tutar">
          Beyan ettiğin tutar (₺)
        </label>
        <input
          id="bt-tutar"
          className="input"
          type="number"
          min="0"
          step="0.01"
          value={declared_amount}
          onChange={(e) => setTutar(e.target.value)}
          placeholder={String(donem.toplanan_kdv.toFixed(2))}
        />
        <div className="field-hint">
          <strong>Resmî beyan tutarını sen yazıyorsun.</strong> Sistem
          hesaplamaz. Kalan yer tutarsan o anda önerilir.
        </div>
      </div>

      {beyan > 0 ? (
        <div className="alert warning mb-14">
          <Calculator size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            Topladığın {money(donem.toplanan_kdv)} · Beyan ettiğin {money(beyan)}{' '}
            · <strong>Fark {money(fark)}</strong>
            {fark !== 0 ? (
              <>
                <br />
                Fark normaldir (istisna, düzeltme, kısmi oran). Nedenini aşağıya
                yazarsan kayıtta görünür.
              </>
            ) : (
              <br />
            )}
          </span>
        </div>
      ) : null}

      <div className="grid grid-2">
        <div className="field">
          <label className="field-label" htmlFor="bt-son">
            Son ödeme günü
          </label>
          <input
            id="bt-son"
            className="input"
            type="date"
            value={due_date}
            onChange={(e) => setSonG(e.target.value)}
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="bt-odeme">
            Ödeme tarihi
          </label>
          <input
            id="bt-odeme"
            className="input"
            type="date"
            value={payment_date}
            onChange={(e) => setOdeT(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-2">
        <div className="field">
          <label className="field-label" htmlFor="bt-odenen">
            Ödediğin tutar (₺)
          </label>
          <input
            id="bt-odenen"
            className="input"
            type="number"
            min="0"
            step="0.01"
            value={paid_amount}
            onChange={(e) => setOdenen(e.target.value)}
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="bt-durum">
            Durum
          </label>
          <select
            id="bt-durum"
            className="input"
            value={status}
            onChange={(e) => setDurum(e.target.value)}
          >
            <option value="bekliyor">Bekliyor</option>
            <option value="odendi">Ödendi</option>
            <option value="gecikti">Gecikti</option>
          </select>
        </div>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="bt-not">
          Farkın gerekçesi / not
        </label>
        <textarea
          id="bt-not"
          className="input"
          rows={2}
          value={note}
          onChange={(e) => setNot(e.target.value)}
          placeholder="Örn. Teşvik belgesi istisnası, geçen dönem düzeltmesi"
          style={{ resize: 'vertical' }}
        />
      </div>
    </Modal>
  );
}