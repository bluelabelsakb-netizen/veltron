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
 */
import { useCallback, useEffect, useState } from 'react';
import { Send, FileText, Loader2, CheckCircle2, AlertTriangle, History, X } from 'lucide-react';
import { api, dateTimeFmt, getServerUrl, getToken } from '../lib/api.js';
import { useToast } from '../components/Toast.jsx';
import { Modal } from './Modal.jsx';
import { Tip } from './Primitives.jsx';

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
  const [busy, setBusy] = useState(false);
  const [hata, setHata] = useState('');

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
  }, [invoice.id]);

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
      });
      toast.success(
        'Fatura gönderildi',
        `${res.data.kime} adresine ${Math.round(res.data.pdfBoyut / 1024)} KB PDF ile.`
      );
      load();
    } catch (err) {
      setHata(err.message || 'Gönderilemedi');
    } finally {
      setBusy(false);
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

        <label
          style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, cursor: 'pointer' }}
        >
          <input
            type="checkbox"
            checked={eklePdf}
            onChange={(e) => setEklePdf(e.target.checked)}
            style={{ width: 15, height: 15, accentColor: 'var(--primary)' }}
            disabled={busy}
          />
          <span style={{ fontSize: 12.5 }}>
            Faturayı PDF olarak ekle
            {!eklePdf && <span className="text-dim"> — eki olmadan gönderilecek</span>}
          </span>
        </label>

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