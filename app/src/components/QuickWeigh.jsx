/**
 * HIZLI TARTIM GIRIŞI
 * ===================
 * Kantar göstergesini okuyup elle yaziyorsun. Bu bileşen:
 *   - Son tartımları gösterir (tıkla, kopyala)
 *   - "Aynı araç" deyip tırın boş tartımını tekrar kullanır
 *   - Büyük rakam düğmeleriyle klavyeye gerek kalmaz
 *
 * Göstergeden otomatik okuma YAPILMAZ (bilinçli karar — bkz. AI-DEVIR.md).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Scale, History, Copy, Check, Delete, Truck } from 'lucide-react';
import { api, dateFmt, number, weightDisplay } from '../lib/api.js';
import { useToast } from '../components/Toast.jsx';

/** Büyük rakam düğmeleri (kantar odası eldivenli ellerle kullanılır). */
const RAKAMLAR = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

function RakamPad({ deger, onDegis }) {
  const bas = (r) => {
    const mevcut = String(deger ?? '').replace(',', '.');
    if (r === 'sil') onDegis((mevcut.slice(0, -1) || '').toString());
    else if (r === 'virgul') onDegis(mevcut.includes('.') ? mevcut : `${mevcut}.`);
    else onDegis(`${mevcut}${r}`.replace(/^0+(?=\d)/, ''));
  };
  return (
    <div className="weight-pad">
      {[...RAKAMLAR, 'virgul', 'sil'].map((r) => (
        <button
          key={r}
          type="button"
          className={`btn weight-key ${r === 'sil' ? 'danger' : ''}`}
          onClick={() => bas(r)}
        >
          {r === 'sil' ? <Delete size={16} /> : r === 'virgul' ? ',' : r}
        </button>
      ))}
    </div>
  );
}

export function QuickWeigh({ workOrder, onTartimGirildi }) {
  const toast = useToast();
  const [gecmis, setGecmis] = useState([]);
  const [secili, setSecili] = useState('tare'); // 'tare' | 'gross'
  const [deger, setDeger] = useState('');
  const [kaydedildi, setKaydedildi] = useState(false);

  const gecmisiGetir = useCallback(async () => {
    try {
      const res = await api.get('/work-orders', { limit: 12, sort: 'work_date:desc' });
      // Tartimi olanlar
      setGecmis(
        (res.data || [])
          .filter((w) => w.tare_weight || w.gross_weight)
          .map((w) => ({
            id: w.id,
            number: w.number,
            customer: w.customer_name,
            subject: w.subject,
            tare: w.tare_weight,
            gross: w.gross_weight,
            net: w.net_weight,
            date: w.work_date,
          }))
      );
    } catch {
      /* gecmis kritik degil */
    }
  }, []);

  useEffect(() => {
    gecmisiGetir();
  }, [gecmisiGetir]);

  /** Tırın aynısı mı? Konu/müşteri eşleşirse boş tartımı birebir kullan. */
  const aracTahminEt = useCallback(
    (g) => {
      if (!workOrder?.customer_id) return null;
      return (
        gecmis.find(
          (x) => x.tare && workOrder.subject && x.subject === workOrder.subject
        ) || null
      );
    },
    [gecmis, workOrder]
  );

  const seciliDeger = secili === 'tare' ? workOrder?.tare_weight : workOrder?.gross_weight;
  const digeri = secili === 'tare' ? workOrder?.gross_weight : workOrder?.tare_weight;
  const digeriVar = digeri !== null && digeri !== undefined && digeri !== '';

  const net = useMemo(() => {
    const t = secili === 'tare' ? Number(deger || seciliDeger || 0) : Number(seciliDeger || 0);
    const g = secili === 'gross' ? Number(deger || seciliDeger || 0) : Number(digeri || 0);
    if (!t || !g) return null;
    return Math.round((g - t) * 1000) / 1000;
  }, [secili, deger, seciliDeger, digeri]);

  const kaydet = async () => {
    const v = Number(String(deger).replace(',', '.'));
    if (!v || v <= 0) {
      toast.error('Geçersiz değer', 'Tartım 0’dan büyük olmalı.');
      return;
    }
    if (secili === 'gross' && digeriVar && v < Number(digeri)) {
      toast.error('Hata', `Dolu tartım (${v} kg), boş tartımdan (${digeri} kg) küçük olamaz.`);
      return;
    }
    try {
      await api.put(`/work-orders/${workOrder.id}`, {
        [secili === 'tare' ? 'tare_weight' : 'gross_weight']: v,
      });
      setKaydedildi(true);
      setTimeout(() => setKaydedildi(false), 2000);
      toast.success(
        `${secili === 'tare' ? 'Boş' : 'Dolu'} tartım kaydedildi`,
        `${number(v)} kg${net ? ` · Net ${weightDisplay(net, workOrder.unit)}` : ''}`
      );
      setDeger('');
      onTartimGirildi?.();
    } catch (err) {
      toast.fromError(err, 'Kaydedilemedi');
    }
  };

  const gecmiseKopyala = (g, tip) => {
    const v = tip === 'tare' ? g.tare : g.gross;
    if (!v) return;
    setSecili(tip);
    setDeger(String(v));
  };

  return (
    <div className="card mb-14">
      <div className="card-head">
        <Scale size={15} style={{ color: 'var(--primary)' }} />
        <h3>Hızlı Tartım Girişi</h3>
        <div className="spacer" />
        {kaydedildi ? (
          <span className="badge success">
            <Check size={11} /> Kaydedildi
          </span>
        ) : null}
      </div>

      <div className="card-body">
        <div className="row row-wrap mb-14" style={{ gap: 12 }}>
          <div className="seg">
            <button
              type="button"
              className={`seg-item ${secili === 'tare' ? 'on' : ''}`}
              onClick={() => { setSecili('tare'); setDeger(''); }}
            >
              Boş (tır)
            </button>
            <button
              type="button"
              className={`seg-item ${secili === 'gross' ? 'on' : ''}`}
              onClick={() => { setSecili('gross'); setDeger(''); }}
            >
              Dolu
            </button>
          </div>

          {workOrder?.subject ? (
            <span className="chip muted">
              <Truck size={11} />
              {workOrder.subject}
            </span>
          ) : null}
        </div>

        <div className="quick-weigh">
          {/* ---- Rakam girişi ---- */}
          <div>
            <div className="label text-dim text-sm mb-4">
              {secili === 'tare' ? 'Boş tartım' : 'Dolu tartım'} (kg)
            </div>
            <input
              className="input mono"
              style={{ fontSize: 26, textAlign: 'center', padding: '10px', minHeight: 58 }}
              inputMode="decimal"
              placeholder="0"
              value={deger || (seciliDeger ? String(seciliDeger) : '')}
              onChange={(e) => setDeger(e.target.value.replace(/[^0-9.,]/g, ''))}
              autoFocus
            />

            <div className="row mt-14" style={{ gap: 8 }}>
              <button className="btn btn-primary grow" onClick={kaydet} disabled={!deger}>
                <Check size={14} />
                Kaydet
              </button>
              {seciliDeger ? (
                <button className="btn" onClick={() => setDeger(String(seciliDeger))} title="Mevcut değeri düzenle">
                  <Copy size={13} />
                </button>
              ) : null}
            </div>

            <RakamPad deger={deger} onDegis={setDeger} />
          </div>

          {/* ---- Hesap + son tartımlar ---- */}
          <div>
            <div className="label text-dim text-sm mb-4">Net ağırlık</div>
            <div className="quick-net">
              {net !== null ? (
                <>
                  <div className="mono" style={{ fontSize: 30, fontWeight: 700 }}>
                    {weightDisplay(net, workOrder?.unit || 'Ton')}
                  </div>
                  <div className="text-dim text-sm">
                    {number(net)} kg
                    {workOrder?.unit_price ? ` × ${number(workOrder.unit_price)} = ${number(net / (workOrder.unit === 'Kg' ? 1 : 1000) * workOrder.unit_price)} ₺` : ''}
                  </div>
                </>
              ) : (
                <div className="text-dim" style={{ fontSize: 13 }}>
                  Her iki tartım girilince net otomatik hesaplanır.
                  <br />
                  Net <strong>asla elle girilmez</strong> — dolu eksi boş.
                </div>
              )}
            </div>

            <div className="label text-dim text-sm mb-4 mt-14">
              <History size={11} style={{ verticalAlign: -1, marginRight: 4 }} />
              Son tartımlar (tıkla, kopyalansın)
            </div>
            {!gecmis.length ? (
              <div className="text-dim text-sm">Henüz tartım kaydı yok.</div>
            ) : (
              <div className="list" style={{ maxHeight: 210, overflowY: 'auto' }}>
                {gecmis.map((g) => (
                  <div className="list-row" key={g.id} style={{ fontSize: 12 }}>
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="truncate" style={{ fontWeight: 600 }}>
                        {g.subject || g.number}
                      </div>
                      <div className="text-dim" style={{ fontSize: 11 }}>
                        boş {number(g.tare)} · dolu {number(g.gross)} · net {weightDisplay(g.net, 'Ton')}
                      </div>
                    </div>
                    <button
                      className="btn btn-sm"
                      onClick={() => gecmiseKopyala(g, 'tare')}
                      title="Boş tartımı kopyala"
                    >
                      B
                    </button>
                    <button
                      className="btn btn-sm"
                      onClick={() => gecmiseKopyala(g, 'gross')}
                      title="Dolu tartımı kopyala"
                    >
                      D
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
