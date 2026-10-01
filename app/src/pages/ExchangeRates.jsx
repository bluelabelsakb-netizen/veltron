/**
 * DÖVİZ KURLARI EKRANI
 * ====================
 * Ayarlar > Döviz Kurları
 *
 * Kurlar sunucu açılırken TCMB'den otomatik gelir (günde bir kez).
 * Buradan elle de düzeltebilirsin.
 *
 * ÖNEMLİ: Kur KAYIT para biriminde saklanır. Geçmiş bir faturayı
 * değiştirmezsin — o fatura kendi gününün kurunda kalır. Bu yüzden
 * eski tarihli kur kaydını SİLME, sadece bugünü güncelle.
 */
import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Download, Save, Info, CalendarClock, TrendingUp } from 'lucide-react';
import { api, money, number, dateFmt, dateTimeFmt, todayIso } from '../lib/api.js';
import { useToast } from '../components/Toast.jsx';
import { PageHeader } from '../components/Primitives.jsx';
import { EmptyState } from '../components/Primitives.jsx';

const ISTENEN = ['USD', 'EUR'];

export default function ExchangeRates() {
  const toast = useToast();
  const [bugun, setBugun] = useState([]);
  const [gecmis, setGecmis] = useState([]);
  const [cekiliyor, setCekiliyor] = useState(false);
  const [duzenle, setDuzenle] = useState({});
  const [sonCekim, setSonCekim] = useState(null);

  const yukle = useCallback(async () => {
    try {
      const r = await api.get('/currency/rates', { days: 30 });
      setBugun(r.bugun || []);
      setGecmis(r.data || []);
      setSonCekim(r.cekim || null);
    } catch (err) {
      toast.fromError(err, 'Kurlar yüklenemedi');
    }
  }, [toast]);

  useEffect(() => {
    yukle();
  }, [yukle]);

  const kuruCek = useCallback(async () => {
    setCekiliyor(true);
    try {
      const r = await api.get('/currency/rates', { days: 30, auto: '1' });
      setBugun(r.bugun || []);
      setGecmis(r.data || []);
      setSonCekim(r.cekim || null);
      if (r.cekim?.ok) {
        toast.success('Kurlar güncellendi', `${r.cekim.kaynak} · ${r.cekim.guncellenen} para birimi`);
      } else {
        toast.error('Kur alınamadı', r.cekim?.hata || 'Bilinmeyen hata');
      }
    } catch (err) {
      toast.fromError(err, 'Kur alınamadı');
    } finally {
      setCekiliyor(false);
    }
  }, [toast]);

  const kurKaydet = useCallback(
    async (kod) => {
      const deger = Number(String(duzenle[kod] ?? '').replace(',', '.'));
      if (!Number.isFinite(deger) || deger <= 0) {
        toast.error('Geçersiz kur', 'Sıfırdan büyük bir sayı girin.');
        return;
      }
      try {
        await api.post('/currency/rates', {
          currency_code: kod,
          rate_to_try: deger,
          rate_date: todayIso(),
          note: 'elle girildi',
        });
        toast.success(`${kod} kuru kaydedildi`, `1 ${kod} = ${deger.toLocaleString('tr-TR')} ₺`);
        setDuzenle((d) => ({ ...d, [kod]: '' }));
        await yukle();
      } catch (err) {
        toast.fromError(err, 'Kaydedilemedi');
      }
    },
    [duzenle, toast, yukle]
  );

  const onemli = bugun.filter((b) => ISTENEN.includes(b.code));

  return (
    <>
      <PageHeader
        title="Döviz Kurları"
        description="Faturalar yabancı para biriminde kesildiğinde TL karşılığı bu kurlarla hesaplanır"
        actions={
          <button className="btn btn-primary" onClick={kuruCek} disabled={cekiliyor}>
            <RefreshCw size={14} className={cekiliyor ? 'spin' : undefined} />
            {cekiliyor ? 'Kurlar alınıyor...' : 'Kurları Güncelle'}
          </button>
        }
      />

      <div className="alert info mb-14">
        <Info size={16} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          Kurlar <strong>Türkiye Cumhuriyet Merkez Bankası (TCMB)</strong>'ndan otomatik gelir.
          Sunucu açıldığında bir kez çekilir. TCMB her iş günü 15:30'da yayımladığı için
          hafta sonu ve tatillerde kur bir önceki iş gününün kuru olur — bu normaldir.
        </span>
      </div>

      {/* --- Kur kartları --- */}
      <div className="grid grid-2 mb-14">
        {onemli.map((k) => {
          const varMi = k.rate > 0;
          return (
            <div className="card" key={k.code}>
              <div className="card-body">
                <div className="row-between" style={{ marginBottom: 12 }}>
                  <div className="row" style={{ gap: 9 }}>
                    <div
                      style={{
                        width: 34, height: 34, borderRadius: 8,
                        display: 'grid', placeItems: 'center',
                        background: 'var(--primary-soft)', color: '#60a5fa',
                        fontWeight: 800, fontSize: 12,
                      }}
                    >
                      {k.code}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{k.name}</div>
                      <div className="text-dim text-sm">1 {k.code} = ? ₺</div>
                    </div>
                  </div>
                  {varMi ? (
                    <span className="badge success">
                      <TrendingUp size={11} />
                      Güncel
                    </span>
                  ) : (
                    <span className="badge danger">Kur yok</span>
                  )}
                </div>

                <div
                  className="mono"
                  style={{ fontSize: 26, fontWeight: 700, marginBottom: 12 }}
                >
                  {varMi ? k.rate.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : '—'}
                </div>

                {/* Elle düzeltme */}
                <div className="row" style={{ gap: 8 }}>
                  <input
                    className="input"
                    placeholder={varMi ? k.rate.toLocaleString('tr-TR') : 'Kur girin'}
                    value={duzenle[k.code] ?? ''}
                    onChange={(e) => setDuzenle((d) => ({ ...d, [k.code]: e.target.value }))}
                    style={{ flex: 1 }}
                  />
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => kurKaydet(k.code)}
                    disabled={!String(duzenle[k.code] ?? '').trim()}
                  >
                    <Save size={13} />
                    Kaydet
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* --- Diğer para birimleri --- */}
      <div className="card mb-14">
        <div className="card-head">
          <Download size={15} style={{ color: 'var(--primary)' }} />
          <h3>Tüm Para Birimleri</h3>
          <span className="text-dim text-sm">{bugun.length} kayıtlı</span>
        </div>
        <div className="card-body">
          <div className="list">
            {bugun.map((k) => (
              <div className="list-row" key={k.code}>
                <div className="grow">
                  <div className="title">
                    {k.code} <span className="text-dim text-sm">{k.name}</span>
                  </div>
                </div>
                <span className="money" style={{ fontWeight: 600 }}>
                  {k.rate > 0
                    ? `${k.rate.toLocaleString('tr-TR', { maximumFractionDigits: 4 })} ₺`
                    : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* --- Geçmiş --- */}
      <div className="card">
        <div className="card-head">
          <CalendarClock size={15} style={{ color: 'var(--text-dim)' }} />
          <h3>Kur Geçmişi (son 30 gün)</h3>
          <div className="spacer" />
          {sonCekim?.kaynak ? (
            <span className="badge info">{sonCekim.kaynak}</span>
          ) : null}
        </div>
        <div className="card-body">
          {!gecmis.length ? (
            <EmptyState
              compact
              icon={CalendarClock}
              title="Kur geçmişi yok"
              description="Kurları güncelle dediğinde burada günlük kayıtlar oluşur."
            />
          ) : (
            <div className="list" style={{ maxHeight: 340, overflowY: 'auto' }}>
              {gecmis.map((g) => (
                <div className="list-row" key={g.id}>
                  <div className="grow">
                    <div className="title">
                      {g.currency_code}{' '}
                      <span className="text-dim text-sm">
                        {dateFmt(g.rate_date)}
                      </span>
                    </div>
                    <div className="meta">
                      {g.note || 'manuel'}
                      {g.created_at ? ` · ${dateTimeFmt(g.created_at)}` : ''}
                    </div>
                  </div>
                  <span className="money">
                    {Number(g.rate_to_try).toLocaleString('tr-TR', { maximumFractionDigits: 4 })} ₺
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="alert warning mt-14">
        <Info size={16} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          <strong>Geçmiş faturalar etkilenmez.</strong> Fatura tutarı kayıt para
          biriminde ve kesildiği günkü kurla saklanır. Bugün kuru değişse bile
          geçen ayın faturası aynı kalır. Bu yüzden burada yalnızca
          <strong>bugünün</strong> kurunu düzenleyin.
        </span>
      </div>
    </>
  );
}