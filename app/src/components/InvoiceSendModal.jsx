/**
 * FATURA GÖNDERME MODALI
 * ======================
 * Faturayı e-posta ile gönderir. PDF eki hazırlanır ve eklenir.
 *
 * ⛔ Kural: Müşteride e-posta kayıtlıysa otomatik doldurulur; yoksa
 * kullanıcıdan istenir (soru: "kayıtlı varsa onu, yoksa sorsun").
 *
 * ⛔ Gönderim durumu kapalıysa nedenini gösterir — kullanıcı ne yapması
 * gerektiğini bilmeli (Ayarlar > Gönderim).
 *
 * ⛔ EK PAKETİ (3 Ekim 2026)
 *   Faturayla birlikte belgeler de gidebilir:
 *     - Faturaya yüklenmiş belgeler (sözleşme, tutanak, ek sayfa)
 *     - Fatura bir iş emrine bağlıysa o iş emrinin belgeleri OTOMATİK gelir
 *       (TIR fotoğrafı = tartım kanıtı, irsaliye). Kullanıcı ayrıca
 *       yüklemez; sadece "gönderilsin mi" işaretler.
 *   Sektöre özel değil: tartım kâğıdı, irsaliye, sözleşme, reçete... hepsi
 *   aynı yerde. Bu yüzden "ek" adı kullanıldı, "tartım" değil.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  Send, FileText, Loader2, CheckCircle2, AlertTriangle, History, X,
  Paperclip, Upload, Trash2,
} from 'lucide-react';
import { api, dateTimeFmt, getServerUrl, getToken } from '../lib/api.js';
import { useToast } from '../components/Toast.jsx';
import { Modal } from './Modal.jsx';
import { Tip } from './Primitives.jsx';

/** 4096 bayttan büyük dosya adını kısaltır. */
function kb(bayt) {
  if (!bayt) return '';
  return bayt >= 1024 * 1024
    ? `${(bayt / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bayt / 1024))} KB`;
}

/**
 * @param {object} props
 * @param {object} props.invoice   fatura satırı (customer_id, number, customer_name)
 * @param {Function} props.onClose
 */
export function InvoiceSendModal({ invoice, onClose }) {
  const toast = useToast();
  const [durum, setDurum] = useState(null);
  const [gecmis, setGecmis] = useState([]);
  const [kime, setKime] = useState('');
  const [mesaj, setMesaj] = useState('');
  const [eklePdf, setEklePdf] = useState(true);
  const [ekIsEmBelgeleri, setEkIsEmBelgeleri] = useState(true);
  const [ekFaturaBelgeleri, setEkFaturaBelgeleri] = useState(true);
  const [ekler, setEkler] = useState({ fatura: [], isEmri: [] });
  const [ekYuklu, setEkYuklu] = useState(false);
  const [ekSecili, setEkSecili] = useState([]); // tek tek kapatılabilsin
  const [busy, setBusy] = useState(false);
  const [hata, setHata] = useState('');

  const ekleriYenile = useCallback(async () => {
    try {
      const r = await api.get(`/invoices/${invoice.id}/ekler`);
      setEkler(r.data || { fatura: [], isEmri: [] });
    } catch {
      // ⛔ Ek listesi alınamazsa gönderim yine de yapılabilir; sessiz geç.
    }
  }, [invoice.id]);

  const load = useCallback(async () => {
    try {
      const [d, g] = await Promise.all([
        api.get('/invoices/gonderim-durumu'),
        api.get(`/invoices/${invoice.id}/postalar`),
      ]);
      setDurum(d.data);
      setGecmis(g.data || []);
    } catch (err) {
      setHata(err.message || 'Gönderim durumu alınamadı');
    }
    ekleriYenile();
  }, [invoice.id, ekleriYenile]);

  useEffect(() => {
    load();
    // Müşterinin kayıtlı e-postası varsa doldur
    const kayitli = invoice?.customer_email || '';
    if (kayitli) setKime(kayitli);
  }, [load, invoice?.customer_email]);

  const gonder = async (e) => {
    e.preventDefault();
    if (!kime.trim()) {
      setHata('E-posta adresi gerekli.');
      return;
    }
    setBusy(true);
    setHata('');
    try {
      const res = await api.post(`/invoices/${invoice.id}/posta`, {
        kime: kime.trim(),
        mesaj,
        eklePdf,
        ekIsEmBelgeleri,
        ekFaturaBelgeleri,
        ekIds: ekSecili,
      });
      toast.success(
        'Fatura gönderildi',
        `${res.data.kime} adresine ${
          res.data.ekSayisi > 1
            ? `${res.data.ekSayisi} dosya`
            : `${Math.round(res.data.pdfBoyut / 1024)} KB PDF`
        } ile.`
      );
      load();
    } catch (err) {
      setHata(err.message || 'Gönderilemedi');
    } finally {
      setBusy(false);
    }
  };

  /** Faturaya belge ekler. ⛔ FormData kullanılır; api.post JSON gönderir. */
  const ekYukle = async (e) => {
    const dosya = e.target.files?.[0];
    e.target.value = ''; // aynı dosya tekrar seçilebilsin
    if (!dosya) return;
    setEkYuklu(true);
    try {
      const fd = new FormData();
      fd.append('file', dosya);
      const base = getServerUrl();
      const token = getToken();
      const r = await fetch(`${base}/api/invoices/${invoice.id}/ekler`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      const veri = await r.json().catch(() => null);
      if (!r.ok) throw new Error(veri?.error || `Sunucu ${r.status}`);
      toast.success('Belge eklendi', dosya.name);
      ekleriYenile();
    } catch (err) {
      toast.fromError(err, 'Belge eklenemedi');
    } finally {
      setEkYuklu(false);
    }
  };

  const ekSil = async (ekId, ad) => {
    try {
      await api.del(`/invoices/ekler/${ekId}`);
      toast.success('Belge silindi', ad);
      ekleriYenile();
    } catch (err) {
      toast.fromError(err, 'Belge silinemedi');
    }
  };

  const pdfIndir = async () => {
    setBusy(true);
    try {
      // api.raw donen degeri JSON'a cevirmeye calisir; PDF icin fetch kullanilir
      const base = getServerUrl();
      const token = getToken();
      const r = await fetch(`${base}/api/invoices/${invoice.id}/pdf?indir=1`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!r.ok) {
        const veri = await r.json().catch(() => null);
        throw new Error(veri?.error || `Sunucu ${r.status} döndü`);
      }
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `Fatura-${invoice.number}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('PDF indirildi');
    } catch (err) {
      toast.fromError(err, 'PDF indirilemedi');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Fatura gönder" subtitle={invoice?.number}>
      {/* Gönderim durumu */}
      {durum && !durum.aktif ? (
        <div className="alert warning" style={{ marginBottom: 14 }}>
          <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <strong>E-posta gönderimi kapalı.</strong>
            <div style={{ marginTop: 2 }}>{durum.sebep}</div>
            <div style={{ marginTop: 4 }}>
              PDF indirmeye yine de çalışır. Gönderim için Ayarlar &gt; Gönderim bölümüne bak.
            </div>
          </div>
        </div>
      ) : durum ? (
        <div
          className="alert info"
          style={{ marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <span>
            Bugün {durum.gonderilenBugun} fatura gönderildi · kalan kota{' '}
            <strong>{durum.kalan}</strong> / {durum.kota}
          </span>
        </div>
      ) : null}

      {hata ? (
        <div className="alert" style={{ marginBottom: 14 }}>
          <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ whiteSpace: 'pre-line' }}>{hata}</span>
        </div>
      ) : null}

      <form onSubmit={gonder} className="auth-fields">
        <div className="field">
          <label className="field-label" htmlFor="kime">
            Kime
          </label>
          <input
            id="kime"
            className="input"
            type="email"
            value={kime}
            onChange={(e) => setKime(e.target.value)}
            placeholder="musteri@ornek.com"
            spellCheck={false}
            disabled={busy}
          />
          {!invoice?.customer_email ? (
            <div className="field-hint">
              Müşteride kayıtlı e-posta yok — adresi yukarıya yazın. Kalıcı olması için
              Müşteriler ekranından ekleyin.
            </div>
          ) : null}
        </div>

        <div className="field">
          <label className="field-label" htmlFor="mesaj">
            Mesaj <span className="text-dim">(isteğe bağlı)</span>
          </label>
          <textarea
            id="mesaj"
            className="input"
            rows={3}
            value={mesaj}
            onChange={(e) => setMesaj(e.target.value)}
            placeholder={`${invoice?.number} numaralı faturanız eki olarak gönderilmektedir.`}
            disabled={busy}
          />
        </div>

        {/* ⛔ EK PAKETİ — müşteriye neyin gideceğini kullanıcı görsün */}
        <div
          style={{
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: 11,
            marginBottom: 14,
            background: 'var(--bg-subtle, transparent)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              marginBottom: 8,
              fontSize: 12.5,
              fontWeight: 600,
            }}
          >
            <Paperclip size={13} style={{ color: 'var(--primary)' }} />
            Eklenecek belgeler
            <span className="text-dim" style={{ fontWeight: 400 }}>
              {eklePdf || ekFaturaBelgeleri ? 1 : 0} fatura
              {ekIsEmBelgeleri ? ` + ${ekler.isEmri?.length || 0} iş emri` : ''}
            </span>
          </div>

          {/* Fatura kâğıdı */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 6 }}>
            <input
              type="checkbox"
              checked={eklePdf}
              onChange={(e) => setEklePdf(e.target.checked)}
              style={{ width: 15, height: 15, accentColor: 'var(--primary)' }}
              disabled={busy}
            />
            <FileText size={13} style={{ color: 'var(--text-dim)' }} />
            <span style={{ fontSize: 12.5 }}>Fatura kâğıdı (PDF)</span>
          </label>

          {/* Faturaya yüklenmiş belgeler */}
          {ekFaturaBelgeleri ? (
            (ekler.fatura || []).length ? (
              (ekler.fatura || []).map((e) => (
                <div
                  key={e.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: 5,
                    paddingLeft: 23,
                  }}
                >
                  <Paperclip size={12} style={{ color: 'var(--text-dim)' }} />
                  <span className="grow truncate" style={{ fontSize: 12 }} title={e.file_name}>
                    {e.file_name}
                  </span>
                  <span className="text-dim" style={{ fontSize: 11 }}>
                    {kb(e.size_bytes)}
                  </span>
                  <button
                    type="button"
                    className="btn"
                    style={{ padding: '2px 5px' }}
                    title="Sil"
                    onClick={() => ekSil(e.id, e.file_name)}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))
            ) : null
          ) : null}

          <label
            style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 6 }}
          >
            <input
              type="checkbox"
              checked={ekFaturaBelgeleri}
              onChange={(e) => setEkFaturaBelgeleri(e.target.checked)}
              style={{ width: 15, height: 15, accentColor: 'var(--primary)' }}
              disabled={busy}
            />
            <span style={{ fontSize: 12.5 }}>
              Faturaya eklenmiş belgeler
              {!ekler.fatura?.length && (
                <span className="text-dim"> — henüz yok</span>
              )}
            </span>
          </label>

          {/* İş emri belgeleri — otomatik gelir */}
          {ekler.isEmri?.length ? (
            <>
              <label
                style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 6 }}
              >
                <input
                  type="checkbox"
                  checked={ekIsEmBelgeleri}
                  onChange={(e) => setEkIsEmBelgeleri(e.target.checked)}
                  style={{ width: 15, height: 15, accentColor: 'var(--primary)' }}
                  disabled={busy}
                />
                <span style={{ fontSize: 12.5 }}>
                  İş emrine bağlı belgeler
                  <span className="text-dim"> ({ekler.isEmri.length} dosya)</span>
                </span>
              </label>
              {ekIsEmBelgeleri ? (
                <div style={{ paddingLeft: 23 }}>
                  {ekler.isEmri.map((e) => (
                    <div
                      key={`wo-${e.id}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: 11.5,
                        color: 'var(--text-dim)',
                        marginBottom: 3,
                      }}
                    >
                      <Paperclip size={11} />
                      <span className="truncate">{e.file_name}</span>
                      <span>· {kb(e.size_bytes)}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}

          {/* Yeni belge ekle */}
          <div style={{ marginTop: 9, paddingTop: 9, borderTop: '1px solid var(--border)' }}>
            <label className="btn" style={{ cursor: 'pointer', display: 'inline-flex' }}>
              {ekYuklu ? <Loader2 size={13} className="spin" /> : <Upload size={13} />}
              {ekYuklu ? 'Yükleniyor...' : 'Belge ekle'}
              <input
                type="file"
                onChange={ekYukle}
                style={{ display: 'none' }}
                accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.gif,.doc,.docx,.xls,.xlsx,.zip,.txt,.csv"
              />
            </label>
            <div className="field-hint" style={{ marginTop: 5 }}>
              Sözleşme, tutanak, ek sayfa gibi belgeler. Gönderimde fatura
              kâğıdının yanına eklenir.
            </div>
          </div>
        </div>

        <div className="row" style={{ gap: 8, marginBottom: 4 }}>
          <button
            className="btn"
            type="button"
            onClick={pdfIndir}
            disabled={busy}
            title="PDF'i indir (e-posta göndermeden)"
          >
            <FileText size={14} />
            PDF indir
          </button>
          <button
            className="btn btn-primary"
            type="submit"
            disabled={busy || !kime.trim() || (durum && !durum.aktif)}
          >
            {busy ? <Loader2 size={14} className="spin" /> : <Send size={14} />}
            {busy ? 'Gönderiliyor...' : 'Gönder'}
          </button>
        </div>
      </form>

      {/* Gönderim geçmişi */}
      {gecmis.length ? (
        <div style={{ marginTop: 20 }}>
          <div className="card-head" style={{ border: 'none', padding: 0, marginBottom: 8 }}>
            <History size={14} style={{ color: 'var(--primary)' }} />
            <h3 style={{ fontSize: 13 }}>Gönderim geçmişi</h3>
          </div>
          <div>
            {gecmis.slice(0, 8).map((g) => (
              <div key={g.id} className="list-row" style={{ padding: '7px 0' }}>
                <div className="grow">
                  <div className="title truncate" style={{ fontSize: 12.5 }}>
                    {g.recipient}
                  </div>
                  <div className="meta">
                    {dateTimeFmt(g.created_at)}
                    {g.gonderen ? ` · ${g.gonderen}` : ''}
                    {g.has_attachment ? ` · ${Math.round((g.size_bytes || 0) / 1024)} KB PDF` : ''}
                    {!g.has_attachment ? ' · eki yok' : ''}
                  </div>
                  {g.error ? (
                    <div className="meta" style={{ color: 'var(--danger)' }}>
                      {g.error}
                    </div>
                  ) : null}
                </div>
                <span className={`badge ${g.status === 'sent' ? 'success' : 'danger'}`}>
                  {g.status === 'sent' ? (
                    <>
                      <CheckCircle2 size={11} /> Gönderildi
                    </>
                  ) : (
                    'Başarısız'
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

export default InvoiceSendModal;