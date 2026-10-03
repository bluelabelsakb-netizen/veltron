/**
 * ALACAK SEKMESİ
 * ==============
 * Vadesi geçen alacakları müşteri bazında gösterir ve müşteriye nazik bir
 * hatırlatma gönderir.
 *
 * ⛔ KULLANICI KARARLARI (3 Ekim 2026) — bu dosyada bunlara uyulur:
 *   1) Hatırlatma OTOMATİK DEĞİL. Kullanıcı seçer → önizler → gönderir.
 *      `zorla` bayrağı olmadan aynı müşteriye aynı gün ikinci kez gidilmez.
 *   2) Metin NAZİK. IBAN, gecikme faizi, hukuki uyarı YOK.
 *   3) Faturalar ekranının İÇİNDE bir sekme — ayrı menü girdisi yok.
 *
 * ⛔ SEKTÖRE ÖZEL DEĞİL. "Vadesi geçen fatura" her sektörde vardır;
 *    alacak takibi yapı şirket, saha firmaları, ecane hepsinde işe yarar.
 *
 * ⛔ E-POSTASI OLMAYAN MÜŞTERİ sessizce atlanmaz. Listede ⛔ rozetiyle
 *    durur ve "Hatırlat" düğmesi kapalı gelir — kullanıcı adresi kursun.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Mail, Loader2, Send, CheckCircle2, X, Paperclip,
  TrendingUp, CalendarClock, History, Users, Info,
} from 'lucide-react';
import { api, money } from '../lib/api.js';
import { useToast } from './Toast.jsx';
import { Modal } from './Modal.jsx';
import { Kpi, KpiMoney, EmptyState, Loading } from './Primitives.jsx';

const KOVA_RENK = {
  danger: '#ef4444',
  warning: '#f59e0b',
  info: '#3b82f6',
  success: '#22c55e',
  muted: '#6b7280',
};

export function AlacakPanel() {
  const toast = useToast();
  const [veri, setVeri] = useState(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [secili, setSecili] = useState([]);
  const [onizleme, setOnizleme] = useState(null);
  const [onizlemeYuklu, setOnizlemeYuklu] = useState(false);
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [ekPdf, setEkPdf] = useState(true);
  const [gecmis, setGecmis] = useState([]);

  const yukle = useCallback(async () => {
    try {
      const d = await api.get('/invoices/alacak');
      setVeri(d.data);
    } catch (err) {
      toast.fromError(err, 'Alacak bilgisi alınamadı');
    } finally {
      setYukleniyor(false);
    }
  }, [toast]);

  useEffect(() => {
    yukle();
  }, [yukle]);

  useEffect(() => {
    api.get('/invoices/alacak/hatirlatmalar?gun=60')
      .then((r) => setGecmis(r.data || []))
      .catch(() => setGecmis([]));
  }, [yukle]);

  const musteriler = veri?.musteriler || [];
  const gonderilebilirler = musteriler.filter((m) => m.email);

  // ⛔ Seçim: yalnızca e-postası olanlar seçilebilir.
  const seciliMusteriler = useMemo(
    () => musteriler.filter((m) => secili.includes(m.customer_id)),
    [musteriler, secili]
  );
  const seciliTutar = seciliMusteriler.reduce((s, m) => s + Number(m.tutar || 0), 0);

  const sec = (id) =>
    setSecili((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const hepsiniSec = () =>
    setSecili(secili.length === gonderilebilirler.length ? [] : gonderilebilirler.map((m) => m.customer_id));

  const onizleAc = async () => {
    setOnizlemeYuklu(true);
    try {
      const d = await api.post('/invoices/alacak/onizle', { customerIds: secili });
      setOnizleme(d.data);
    } catch (err) {
      toast.fromError(err, 'Önizleme alınamadı');
    } finally {
      setOnizlemeYuklu(false);
    }
  };

  const gonder = async (zorla = false) => {
    setGonderiliyor(true);
    try {
      const d = await api.post('/invoices/alacak/hatirlatma', {
        customerIds: secili, ekPdf, zorla,
      });
      const { gonderilen = [], atlanan = [], hatali = [] } = d.data;

      if (gonderilen.length) {
        toast.success(
          `${gonderilen.length} hatırlatma gönderildi`,
          gonderilen
            .map((g) => `${g.musteri}: ${g.adet} fatura`)
            .join(' · ')
            .slice(0, 160)
        );
      }
      // ⛔ Kısmen başarısızsa da bilgi ver — kullanıcı bilmeli.
      if (atlanan.length) {
        toast.info(
          `${atlanan.length} müşteri atlandı`,
          atlanan.map((a) => `${a.musteri || a.customer_id}: ${a.sebep}`).join(' · ').slice(0, 200)
        );
      }
      if (hatali.filter((h) => h.gonderilemedi).length) {
        toast.error(
          `${hatali.filter((h) => h.gonderilemedi).length} hatırlatma gönderilemedi`,
          hatali.filter((h) => h.gonderilemedi).map((h) => h.hata).join(' · ').slice(0, 200)
        );
      }

      setOnizleme(null);
      setSecili([]);
      yukle();
      api.get('/invoices/alacak/hatirlatmalar?gun=60').then((r) => setGecmis(r.data || [])).catch(() => {});
    } catch (err) {
      toast.fromError(err, 'Hatırlatma gönderilemedi');
    } finally {
      setGonderiliyor(false);
    }
  };

  if (yukleniyor) return <Loading label="Alacak hesaplanıyor..." />;
  if (!veri) return <EmptyState title="Alacak bilgisi alınamadı" />;

  const gecmisKova = veri.kovalar.find((k) => k.kova === 'gecmis');

  return (
    <>
      {/* ---------------------------------------------------- kovalar */}
      <div className="kpi-grid">
        <KpiMoney
          label="Toplam alacak"
          value={veri.toplam}
          color={veri.toplam > 0 ? '#f59e0b' : '#22c55e'}
          icon={TrendingUp}
          sub={`${veri.faturaAdet} açık fatura`}
        />
        <KpiMoney
          label="Vadesi geçmiş"
          value={gecmisKova?.tutar || 0}
          color="#ef4444"
          icon={AlertTriangle}
          sub={`${gecmisKova?.adet || 0} fatura`}
        />
        <Kpi
          label="Müşteri"
          value={musteriler.length}
          color="#8b5cf6"
          icon={Users}
          sub={`${veri.hatirlatilabilir} müşteriye hatırlatma gidebilir`}
        />
        <Kpi
          label="Bu ay gönderilen"
          value={gecmis.filter((g) => g.day === veri.bugun?.slice(0, 8) + '01' || g.day?.slice(0, 7) === veri.bugun?.slice(0, 7)).length}
          color="#22c55e"
          icon={CheckCircle2}
          sub="hatırlatma"
          small
        />
      </div>

      {/* ⛔ Bilgilendirme: parasız kalan müşteriler */}
      {veri.hatirlatilamaz > 0 ? (
        <div className="alert warning mb-14">
          <Info size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <strong>
              {veri.hatirlatilamaz} müşteride e-posta adresi yok.
            </strong>
            <div style={{ marginTop: 2 }}>
              Vadesi geçen faturaları var ama hatırlatma gönderilemez. Müşteriler
              ekranından e-posta adresi ekleyin.
            </div>
          </div>
        </div>
      ) : null}

      {/* ------------------------------------------- vade kovası şeridi */}
      <div className="card mb-14">
        <div className="card-head" style={{ border: 'none', padding: 0, marginBottom: 10 }}>
          <CalendarClock size={14} style={{ color: 'var(--primary)' }} />
          <h3 style={{ fontSize: 13 }}>Vade durumu</h3>
        </div>
        <div className="row row-wrap" style={{ gap: 10 }}>
          {veri.kovalar.map((k) => (
            <div
              key={k.kova}
              style={{
                flex: '1 1 150px',
                minWidth: 140,
                padding: '10px 12px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                borderLeft: `3px solid ${KOVA_RENK[k.renk]}`,
              }}
            >
              <div className="label" style={{ fontSize: 11 }}>{k.etiket}</div>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: k.adet ? KOVA_RENK[k.renk] : 'var(--text-muted)',
                }}
              >
                {k.adet}
              </div>
              <div className="text-dim" style={{ fontSize: 11.5 }}>{money(k.tutar)}</div>
            </div>
          ))}
        </div>
        {veri.dovizAdet > 0 ? (
          <div className="field-hint" style={{ marginTop: 8 }}>
            ⛔ {veri.dovizAdet} fatura döviz cinsinden. Tutarlar kuruş çevrimiyle
            TL olarak gösteriliyor; asıl para birimi faturada yazılıdır.
          </div>
        ) : null}
      </div>

      {/* -------------------------------------------------- gönderim kapalı */}
      {!veri.gonderim?.aktif ? (
        <div className="alert warning mb-14">
          <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <strong>E-posta gönderimi kapalı.</strong>
            <div style={{ marginTop: 2 }}>{veri.gonderim?.sebep}</div>
            <div style={{ marginTop: 4 }}>
              Listeyi görebilir ve dışa aktarabilirsin; hatırlatma için
              Ayarlar &gt; Gönderim bölümüne bak.
            </div>
          </div>
        </div>
      ) : null}

      {/* --------------------------------------------------- müşteri listesi */}
      {musteriler.length ? (
        <div className="card">
          <div className="card-head">
            <label className="row" style={{ gap: 7, cursor: 'pointer', userSelect: 'none' }}>
              <input
                type="checkbox"
                checked={secili.length > 0 && secili.length === gonderilebilirler.length}
                onChange={hepsiniSec}
                style={{ width: 15, height: 15, accentColor: 'var(--primary)' }}
              />
              <h3 style={{ fontSize: 13 }}>Vadesi geçen alacaklar</h3>
            </label>
            {secili.length ? (
              <div className="row" style={{ gap: 8 }}>
                <span className="text-dim" style={{ fontSize: 12 }}>
                  {secili.length} müşteri · <strong>{money(seciliTutar)}</strong>
                </span>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={onizleAc}
                  disabled={onizlemeYuklu || !veri.gonderim?.aktif}
                >
                  {onizlemeYuklu ? <Loader2 size={13} className="spin" /> : <Mail size={13} />}
                  Önizle ve gönder
                </button>
              </div>
            ) : null}
          </div>

          <table>
            <thead>
              <tr>
                <th style={{ width: 34 }}></th>
                <th>MÜŞTERİ</th>
                <th style={{ width: 70 }}>FATURA</th>
                <th style={{ width: 110 }}>EN ESKİ VADE</th>
                <th style={{ width: 120 }}>GECİKME</th>
                <th style={{ width: 140, textAlign: 'right' }}>KALAN</th>
                <th style={{ width: 190 }}>HATIRLATMA</th>
              </tr>
            </thead>
            <tbody>
              {musteriler.map((m) => (
                <tr key={m.customer_id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={secili.includes(m.customer_id)}
                      onChange={() => sec(m.customer_id)}
                      disabled={!m.email}
                      title={m.email ? undefined : 'E-posta adresi yok'}
                      style={{ width: 15, height: 15, accentColor: 'var(--primary)' }}
                    />
                  </td>
                  <td>
                    <div className="title truncate">{m.musteri}</div>
                    {m.email ? (
                      <div className="meta truncate">{m.email}</div>
                    ) : (
                      <div className="meta" style={{ color: 'var(--danger)' }}>
                        ⛔ e-posta adresi yok
                      </div>
                    )}
                  </td>
                  <td>{m.adet}</td>
                  <td>{m.enEski}</td>
                  <td>
                    <span className="badge danger">{m.gun} gün</span>
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{money(m.tutar)}</td>
                  <td>
                    <button
                      className="btn btn-sm"
                      disabled={!m.email || !veri.gonderim?.aktif}
                      onClick={() => setSecili([m.customer_id]) || onizleAc()}
                      title={m.email ? undefined : 'Önce müşteriye e-posta adresi ekleyin'}
                    >
                      <Mail size={12} />
                      Hatırlat
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card">
          <EmptyState
            icon={CheckCircle2}
            title="Vadesi geçen fatura yok"
            description="Tüm açık faturaların vadesi henüz dolmamış. Tebrikler."
          />
        </div>
      )}

      {/* ------------------------------------------------------- geçmiş */}
      {gecmis.length ? (
        <div className="card mt-14">
          <div className="card-head">
            <History size={14} style={{ color: 'var(--primary)' }} />
            <h3 style={{ fontSize: 13 }}>Son gönderilen hatırlatmalar</h3>
          </div>
          {gecmis.slice(0, 6).map((g) => (
            <div key={g.id} className="list-row" style={{ padding: '7px 0' }}>
              <div className="grow">
                <div className="title truncate" style={{ fontSize: 12.5 }}>{g.musteri}</div>
                <div className="meta">
                  {g.day} · <span className="mono truncate">{g.recipient}</span>
                  {g.has_pdf ? ' · ekli' : ''}
                </div>
              </div>
              <span style={{ fontSize: 12.5, fontWeight: 600 }}>{money(g.amount_total)}</span>
            </div>
          ))}
        </div>
      ) : null}

      {/* ------------------------------------------------- önizleme penceresi */}
      {onizleme ? (
        <Modal
          open
          onClose={() => setOnizleme(null)}
          title="Hatırlatma önizlemesi"
          subtitle={`${onizleme.gonderilecek} müşteriye gönderilecek · ${money(onizleme.toplamTutar)}`}
          size="lg"
        >
          <div className="alert info mb-14">
            <Info size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              Bu mail müşteriye <strong>gerçekten gidecek</strong>. Göndermeden önce
              metni okuyun. Fatura kâğıtları{' '}
              <strong>{ekPdf ? 'ek olarak eklenecek' : 'eklenmeyecek'}</strong>.
            </span>
          </div>

          <label
            className="row"
            style={{ gap: 8, marginBottom: 14, cursor: 'pointer', userSelect: 'none' }}
          >
            <input
              type="checkbox"
              checked={ekPdf}
              onChange={(e) => setEkPdf(e.target.checked)}
              style={{ width: 15, height: 15, accentColor: 'var(--primary)' }}
            />
            <Paperclip size={13} style={{ color: 'var(--text-dim)' }} />
            <span style={{ fontSize: 12.5 }}>
              Fatura kâğıtlarını ek olarak gönder
            </span>
          </label>

          {onizleme.onizlemeler.map((o) => (
            <div
              key={o.musteri.id}
              className="card"
              style={{ marginBottom: 12, padding: 13, border: '1px solid var(--border)' }}
            >
              <div className="row" style={{ justifyContent: 'space-between', marginBottom: 7 }}>
                <div className="title" style={{ fontSize: 13 }}>{o.musteri.company}</div>
                <span className={`badge ${o.gonderilebilir ? 'success' : 'danger'}`}>
                  {o.gonderilebilir ? `${o.adet} fatura` : 'Gönderilemez'}
                </span>
              </div>

              {!o.gonderilebilir ? (
                <div className="alert warning" style={{ marginBottom: 0 }}>
                  <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>{o.gonderilemezSebebi}</span>
                </div>
              ) : (
                <>
                  {o.koruma?.bugunGonderildi ? (
                    <div className="alert warning" style={{ marginBottom: 9 }}>
                      <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                      <span>
                        Bu müşteriye <strong>bugün zaten</strong> hatırlatma
                        gönderilmiş ({o.koruma.bugunSaat}). Bu ay toplam{' '}
                        {o.koruma.buAyAdet} kez gönderilmiş.
                      </span>
                    </div>
                  ) : null}

                  <div className="field">
                    <label className="field-label">Kime</label>
                    <div className="mono" style={{ fontSize: 12.5 }}>{o.musteri.email}</div>
                  </div>
                  <div className="field">
                    <label className="field-label">Konu</label>
                    <div style={{ fontSize: 12.5 }}>{o.konu}</div>
                  </div>
                  <div className="field">
                    <label className="field-label">Gövde</label>
                    <pre
                      className="mono"
                      style={{
                        whiteSpace: 'pre-wrap',
                        fontSize: 11.5,
                        lineHeight: 1.55,
                        margin: 0,
                        padding: 10,
                        background: 'var(--bg-subtle, rgba(255,255,255,0.03))',
                        borderRadius: 6,
                        maxHeight: 240,
                        overflowY: 'auto',
                      }}
                    >
                      {o.govde}
                    </pre>
                  </div>
                </>
              )}
            </div>
          ))}

          <div className="row" style={{ gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
            <button className="btn" onClick={() => setOnizleme(null)} disabled={gonderiliyor}>
              <X size={13} />
              Vazgeç
            </button>
            <button
              className="btn btn-primary"
              onClick={() => gonder(false)}
              disabled={gonderiliyor || onizleme.gonderilecek === 0}
            >
              {gonderiliyor ? <Loader2 size={13} className="spin" /> : <Send size={13} />}
              {gonderiliyor
                ? 'Gönderiliyor...'
                : `${onizleme.gonderilecek} hatırlatma gönder`}
            </button>
          </div>

          {/* ⛔ Bugün gönderilmiş varsa "bilerek tekrar" yolu açık olmalı.
              Yanlışlıkla iki kere gitmesin ama kasıtlıysa engellenmesin. */}
          {onizleme.onizlemeler.some((o) => o.koruma?.bugunGonderildi) ? (
            <div className="field-hint" style={{ marginTop: 10, textAlign: 'right' }}>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => gonder(true)}
                disabled={gonderiliyor || onizleme.gonderilecek === 0}
              >
                Bugün gönderilmiş olsa da yine gönder
              </button>
            </div>
          ) : null}
        </Modal>
      ) : null}
    </>
  );
}

export default AlacakPanel;
