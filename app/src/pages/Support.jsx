/**
 * DESTEK SAYFASI
 * ================
 * Kullanıcının "bir şey ters gitti" dediği yere gittiği ekran.
 *
 * İKİ ROL:
 *   1) HERKES: sistem bilgisi (giriş ekranından da erişilebilir — giriş
 *      yapılamıyorsa da buradan bilgi alınır) + hata bildirimi bırakma
 *   2) YÖNETİCİ: hata günlüğü (kim, ne, ne zaman), günlüğü indirme/temizleme
 *
 * ⛔ GÜVENLİK
 *   - Hata günlüğü sunucuda ALREADY maskeli (şifre/JWT yok).
 *   - Burada gösterilirken de ikinci kez süzülür (istemci tarafı).
 *   - Gönderilen her metin yine maskelenir.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  LifeBuoy, AlertTriangle, Send, Download, Trash2, RefreshCw, CheckCircle2,
  Info, Bug, ChevronDown, ChevronRight, Copy, Mail, Server, Monitor, FileWarning,
} from 'lucide-react';
import { api, dateTimeFmt } from '../lib/api.js';
import { useToast } from '../components/Toast.jsx';
import { PageHeader } from '../components/Primitives.jsx';
import { ConfirmDialog } from '../components/Modal.jsx';

const KATEGORILER = [
  { deger: 'hata_bildirimi', etiket: 'Hata bildirimi', ikon: Bug },
  { deger: 'istek', etiket: 'İstek / öneri', ikon: FileWarning },
  { deger: 'soru', etiket: 'Soru', ikon: Mail },
  { deger: 'diger', etiket: 'Diğer', ikon: Info },
];

/** İstemci tarafı ikinci maske — sunucu zaten maskeliyor, savunma derinliği. */
function maskele(s) {
  return String(s ?? '')
    .replace(/eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{3,}/g, '[JWT]')
    .replace(
      /\b(sifre|parola|password|token|secret)\b\s*[:=]?\s*[^\s,;)"']+/gi,
      '$1: [GIZLI]'
    );
}

/**
 * Kullanıcının bulunduğu ekran.
 * ⛔ Electron'da adres `app://bundle/index.html#/destek` şeklinde. `pathname`
 *    her zaman `/index.html` döner — gerçek ekran HASH içinde. Hash yoksa
 *    tarayıcıda pathname kullanılır.
 */
function bulunulanEkran() {
  const hash = window.location.hash.replace(/^#/, '');
  if (hash) return hash;
  return window.location.pathname === '/' ? '/' : window.location.pathname;
}

/** ⛔ Baytı KB'ye yuvarlamak küçük günlüklerde "0 KB" gösteriyordu. */
function boyutGoster(bayt) {
  const n = Number(bayt) || 0;
  if (n < 1024) return `${n} bayt`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1).replace('.0', '')} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default function Support() {
  const toast = useToast();
  const [bilgi, setBilgi] = useState(null);
  const [ozet, setOzet] = useState(null);
  const [hatalar, setHatalar] = useState([]);
  const [bildirimler, setBildirimler] = useState([]);
  const [acikHata, setAcikHata] = useState(null);

  const [kategori, setKategori] = useState('hata_bildirimi');
  const [baslik, setBaslik] = useState('');
  const [aciklama, setAciklama] = useState('');
  const [hataMesaji, setHataMesaji] = useState('');
  const [sayfaAdi, setSayfaAdi] = useState('');
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [temizOnayi, setTemizOnayi] = useState(false);
  const [temizleniyor, setTemizleniyor] = useState(false);

  const yukle = useCallback(async () => {
    setYukleniyor(true);
    try {
      // /bilgi jetonsuz da çalışır — giriş ekranından da erişilebilir
      const b = await api.get('/support/bilgi').catch(() => null);
      if (b?.data) setBilgi(b.data);

      const [o, h, bl] = await Promise.all([
        api.get('/support/hata-ozet').catch(() => null),
        api.get('/support/hatalar', { limit: 100 }).catch(() => null),
        api.get('/support/bildirimler').catch(() => null),
      ]);
      if (o?.data) setOzet(o.data);
      if (h?.data) setHatalar(h.data);
      if (bl?.data) setBildirimler(bl.data);
    } finally {
      setYukleniyor(false);
    }
  }, []);

  useEffect(() => {
    yukle();
  }, [yukle]);

  const gonder = async (e) => {
    e.preventDefault();
    if (baslik.trim().length < 3) {
      toast.error('Başlık gerekli', 'En az 3 karakter yazın.');
      return;
    }
    setGonderiliyor(true);
    try {
      const res = await api.post('/support/bildir', {
        kategori,
        baslik: baslik.trim(),
        aciklama: aciklama.trim(),
        sayfa: bulunulanEkran(),
        hata_mesaj: hataMesaji.trim(),
      });
      toast.success('Bildirim gönderildi', res.data?.mesaj);
      setBaslik('');
      setAciklama('');
      setHataMesaji('');
      yukle();
    } catch (err) {
      toast.fromError(err, 'Gönderilemedi');
    } finally {
      setGonderiliyor(false);
    }
  };

  /**
   * Hata günlüğünü dosyaya kaydet.
   *
   * ⛔ openExternal KULLANILMAZDI: günlük ucu `requireAdmin` arkasında,
   *    harici tarayıcı jeton gönderemez → hep 401 alırdı. Doğru yol:
   *    kimlikli fetch ile içeriği al, Electron'un "farklı kaydet" penceresine yaz.
   */
  const gunlukIndir = async () => {
    try {
      const metin = await api.text('/support/hata-indir');

      const bridge = window.veltron;
      if (bridge?.app?.exportText) {
        const sonuc = await bridge.app.exportText({
          defaultName: 'veltron-hata-gunlugu.txt',
          content: metin,
        });
        if (sonuc?.ok) toast.success('Günlük kaydedildi', sonuc.filePath);
        return;
      }

      // Tarayıcıda (Electron dışı) çalışıyorsa normal indirme
      const blob = new Blob([metin], { type: 'text/plain;charset=utf-8' });
      const bag = document.createElement('a');
      bag.href = URL.createObjectURL(blob);
      bag.download = 'veltron-hata-gunlugu.txt';
      bag.click();
      URL.revokeObjectURL(bag.href);
      toast.success('Günlük indirildi');
    } catch (err) {
      toast.fromError(err, 'Günlük alınamadı');
    }
  };

  const gunlukTemizle = async () => {
    if (!temizOnayi) return;
    setTemizOnayi(false);
    setTemizleniyor(true);
    try {
      await api.del('/support/hatalar');
      setHatalar([]);
      setOzet(null);
      toast.success('Hata günlüğü temizlendi');
      yukle();
    } catch (err) {
      toast.fromError(err, 'Temizlenemedi');
    } finally {
      setTemizleniyor(false);
    }
  };

  const bildirimDurum = async (id, durum) => {
    try {
      await api.patch(`/support/bildirimler/${id}`, { durum });
      yukle();
    } catch (err) {
      toast.fromError(err, 'Güncellenemedi');
    }
  };

  const acikBildirim = () => bildirimler.filter((b) => b.durum !== 'kapali').length;

  return (
    <div className="page">
      <PageHeader
        title="Destek"
        description="Sorun bildirin, sistem bilgilerini görün, hata günlüğünü inceleyin"
        actions={
          <button className="btn" onClick={yukle} disabled={yukleniyor}>
            <RefreshCw size={14} className={yukleniyor ? 'spin' : undefined} />
            Yenile
          </button>
        }
      />

      {/* ============ SİSTEM BİLGİSİ (herkese açık) ============ */}
      {bilgi ? (
        <div className="card mb-14">
          <div className="card-head">
            <Server size={16} style={{ color: 'var(--primary)' }} />
            <h3>Sistem Bilgileri</h3>
          </div>
          <div className="card-body">
            <div className="grid-2" style={{ gap: 20 }}>
              <div>
                <div className="stat-row">
                  <span className="label">Uygulama</span>
                  <span className="value">
                    {bilgi.uygulama.ad} · sürüm {bilgi.uygulama.surum}
                  </span>
                </div>
                <div className="stat-row">
                  <span className="label">Sunucu</span>
                  <span className="value">sürüm {bilgi.sunucu.surum}</span>
                </div>
                <div className="stat-row">
                  <span className="label">Veritabanı</span>
                  <span className="value">{bilgi.veritabani.tur}</span>
                </div>
              </div>
              <div>
                <div className="stat-row">
                  <span className="label">Node.js</span>
                  <span className="value mono">{bilgi.sunucu.node}</span>
                </div>
                <div className="stat-row">
                  <span className="label">İşletim sistemi</span>
                  <span className="value">
                    {bilgi.sunucu.platform} · {bilgi.sunucu.mimari}
                  </span>
                </div>
                <div className="stat-row">
                  <span className="label">Donanım</span>
                  <span className="value">
                    {bilgi.sunucu.cekirdek} çekirdek · {bilgi.sunucu.ramGbit} GB RAM
                  </span>
                </div>
              </div>
            </div>

            <div className="alert info" style={{ marginTop: 14, marginBottom: 0 }}>
              <Copy size={15} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>
                Destek talebinde bu bilgileri paylaşın — sorunu çok hızlı çözerler.
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ marginLeft: 8 }}
                  onClick={() => {
                    const metin = [
                      `Uygulama: ${bilgi.uygulama.ad} ${bilgi.uygulama.surum}`,
                      `Node: ${bilgi.sunucu.node}`,
                      `Sistem: ${bilgi.sunucu.platform} (${bilgi.sunucu.mimari})`,
                      `CPU/RAM: ${bilgi.sunucu.cekirdek} çekirdek / ${bilgi.sunucu.ramGbit} GB`,
                      `Sunucu çalışma süresi: ${bilgi.sunucu.calismaDakika} dk`,
                    ].join('\n');
                    navigator.clipboard?.writeText(metin);
                    toast.success('Bilgiler kopyalandı');
                  }}
                >
                  Kopyala
                </button>
              </span>
            </div>
          </div>
        </div>
      ) : null}

      {/* ============ BİLDİRİM GÖNDER ============ */}
      <div className="card mb-14">
        <div className="card-head">
          <LifeBuoy size={16} style={{ color: 'var(--success)' }} />
          <h3>Sorun Bildir</h3>
        </div>
        <div className="card-body">
          <form onSubmit={gonder}>
            <div className="row row-wrap" style={{ gap: 8, marginBottom: 14 }}>
              {KATEGORILER.map((k) => {
                const Ikon = k.ikon;
                const secili = kategori === k.deger;
                return (
                  <button
                    key={k.deger}
                    type="button"
                    className={`btn btn-sm ${secili ? 'btn-primary' : ''}`}
                    onClick={() => setKategori(k.deger)}
                  >
                    <Ikon size={13} />
                    {k.etiket}
                  </button>
                );
              })}
            </div>

            <div className="field mb-14">
              <label className="field-label" htmlFor="baslik">
                Konu <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <input
                id="baslik"
                className="input"
                value={baslik}
                onChange={(e) => setBaslik(e.target.value)}
                placeholder="Örn: Fatura kaydederken hata veriyor"
                maxLength={150}
              />
            </div>

            <div className="field mb-14">
              <label className="field-label" htmlFor="aciklama">
                Açıklama
              </label>
              <textarea
                id="aciklama"
                className="input"
                rows={4}
                value={aciklama}
                onChange={(e) => setAciklama(e.target.value)}
                placeholder="Ne yapmaya çalıştınız? Ne oldu? Ekran görüntüsü varsa yazabilirsiniz."
                maxLength={4000}
              />
            </div>

            <div className="grid-2" style={{ gap: 14 }}>
              <div className="field">
                <label className="field-label" htmlFor="sayfa">
                  Hangi ekranda oldunuz?
                </label>
                <input
                  id="sayfa"
                  className="input mono"
                  value={sayfaAdi}
                  onChange={(e) => setSayfaAdi(e.target.value)}
                  placeholder={sayfaAdi.trim() ? sayfaAdi : bulunulanEkran()}
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="hata-mesaj">
                  Ekranda yazan hata mesajı
                </label>
                <input
                  id="hata-mesaj"
                  className="input"
                  value={hataMesaji}
                  onChange={(e) => setHataMesaji(e.target.value)}
                  placeholder="Kopyalayabildiyseniz yapıştırın"
                />
              </div>
            </div>

            <div
              className="field-hint"
              style={{ marginTop: 10, marginBottom: 12, lineHeight: 1.6 }}
            >
              ⛔ <strong>Güvenlik:</strong> Yazdıklarınız otomatik olarak taranır. Şifre,
              kart numarası gibi bilgiler yazarsanız gönderilmez, <code>[GIZLI]</code> olarak
              maskelenir.
            </div>

            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn btn-primary" type="submit" disabled={gonderiliyor}>
                <Send size={14} />
                {gonderiliyor ? 'Gönderiliyor...' : 'Bildirimi Gönder'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* ============ HATA GÜNLÜĞÜ (yönetici) ============ */}
      {ozet ? (
        <>
          <div className="card mb-14">
            <div className="card-head">
              <AlertTriangle size={16} style={{ color: 'var(--warning)' }} />
              <h3>Hata Günlüğü</h3>
              <span className="text-dim text-sm">
                {ozet.toplam} kayıt · bugün {ozet.bugun}
              </span>
            </div>
            <div className="card-body">
              {ozet.toplam === 0 ? (
                <div className="empty" style={{ padding: '28px 20px' }}>
                  <CheckCircle2 size={30} strokeWidth={1.4} style={{ marginBottom: 8 }} />
                  <h3>Temiz — hata yok</h3>
                  <p>
                    {ozet.dosyaVar
                      ? 'Günlük dosyası var ama 30 günlük kayıt bulunmuyor.'
                      : 'Henüz hata kaydı oluşmadı. Dosya: server/data/hata-gunlugu.log'}
                  </p>
                </div>
              ) : (
                <>
                  {ozet.enSik?.length ? (
                    <div className="row row-wrap" style={{ gap: 6, marginBottom: 14 }}>
                      <span className="text-dim text-sm" style={{ marginRight: 4 }}>
                        Sık geçenler:
                      </span>
                      {ozet.enSik.map((e) => (
                        <span key={e.kod} className="badge warning">
                          {e.kod} · {e.adet}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  <div className="row" style={{ gap: 8, marginBottom: 12 }}>
                    <button className="btn btn-sm" onClick={gunlukIndir}>
                      <Download size={13} />
                      Günlüğü İndir
                    </button>
                    <button className="btn btn-sm" onClick={() => setTemizOnayi(true)}>
                      <Trash2 size={13} />
                      Günlüğü Temizle
                    </button>
                    <span className="text-dim text-sm" style={{ marginLeft: 'auto' }}>
                      {hatalar.length} kayıt gösteriliyor · dosya {boyutGoster(ozet.boyutBayt)}
                      {acikBildirim() > 0 ? ` · ${acikBildirim()} açık bildirim` : ''}
                    </span>
                  </div>

                  <div className="text-dim text-sm" style={{ lineHeight: 1.6, marginBottom: 12 }}>
                    ⛔ Güvenlik: Günlükte şifre, jeton ve kimlik bilgisi bulunmaz — yazılmadan
                    önce maskelenir. Dosyayı destek ekibine gönderebilirsiniz.
                  </div>

                  <div style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    {hatalar.slice(0, 40).map((h) => (
                      <div key={h.zaman + h.mesaj} className="list-row" style={{ alignItems: 'flex-start' }}>
                        <button
                          className="btn btn-ghost btn-icon btn-sm"
                          onClick={() => setAcikHata(acikHata === h ? null : h)}
                          aria-label="Aç"
                        >
                          {acikHata === h ? (
                            <ChevronDown size={14} />
                          ) : (
                            <ChevronRight size={14} />
                          )}
                        </button>
                        <div className="grow">
                          <div className="title truncate" style={{ fontSize: 12.5 }}>
                            <span className="badge danger" style={{ marginRight: 6 }}>
                              {h.kod}
                            </span>
                            {maskele(h.mesaj)}
                          </div>
                          <div className="meta">
                            {dateTimeFmt(h.zaman)}
                            {h.istek ? ` · ${h.istek}` : ''}
                            {h.kullanici ? ` · ${h.kullanici}` : ''}
                          </div>

                          {acikHata === h ? (
                            <div
                              style={{
                                marginTop: 8,
                                padding: '9px 11px',
                                background: 'var(--bg-input)',
                                borderRadius: 'var(--radius-sm)',
                                border: '1px solid var(--border-subtle)',
                              }}
                            >
                              <div className="field-label" style={{ marginBottom: 5 }}>
                                Yığın izi
                              </div>
                              <pre
                                className="mono"
                                style={{
                                  margin: 0,
                                  fontSize: 11,
                                  lineHeight: 1.5,
                                  whiteSpace: 'pre-wrap',
                                  wordBreak: 'break-all',
                                  color: 'var(--text-muted)',
                                }}
                              >
                                {(h.yigin || []).join('\n') || '(yok)'}
                              </pre>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* ============ BİLDİRİMLER (yönetici) ============ */}
          {bildirimler.length ? (
            <div className="card">
              <div className="card-head">
                <Mail size={16} style={{ color: 'var(--primary)' }} />
                <h3>Kullanıcı Bildirimleri</h3>
                <span className="text-dim text-sm">{bildirimler.length} kayıt</span>
              </div>
              <div className="card-body">
                {bildirimler.map((b) => (
                  <div key={b.id} className="list-row" style={{ alignItems: 'flex-start' }}>
                    <div className="grow">
                      <div className="title" style={{ fontSize: 12.5 }}>
                        <span
                          className={`badge ${b.kategori === 'hata_bildirimi' ? 'danger' : 'info'}`}
                          style={{ marginRight: 6 }}
                        >
                          {KATEGORILER.find((k) => k.deger === b.kategori)?.etiket || b.kategori}
                        </span>
                        {b.baslik}
                      </div>
                      <div className="meta">
                        {dateTimeFmt(b.created_at)}
                        {b.kullanici ? ` · ${b.kullanici}` : ''}
                        {b.sayfa ? ` · ${b.sayfa}` : ''}
                      </div>
                      {b.aciklama ? (
                        <div style={{ fontSize: 12, marginTop: 4, color: 'var(--text-muted)', whiteSpace: 'pre-line' }}>
                          {maskele(b.aciklama)}
                        </div>
                      ) : null}
                      {b.hata_mesaj ? (
                        <div
                          className="mono"
                          style={{ fontSize: 11, marginTop: 4, color: 'var(--danger)' }}
                        >
                          {maskele(b.hata_mesaj)}
                        </div>
                      ) : null}
                    </div>
                    <button
                      className={`btn btn-sm ${b.durum === 'acik' ? '' : 'btn-ghost'}`}
                      onClick={() => bildirimDurum(b.id, b.durum === 'acik' ? 'kapali' : 'acik')}
                    >
                      {b.durum === 'acik' ? 'Kapat' : 'Aç'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {/* ============ SSS ============ */}
      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-head">
          <Monitor size={16} style={{ color: 'var(--info)' }} />
          <h3>Sık Karşılaşılan Sorunlar</h3>
        </div>
        <div className="card-body">
          <Soru
            soru="Program açılıyor ama 'Sunucuya ulaşılamıyor' diyor"
            cevap="Sunucu çalışmıyor. PowerShell'i açıp şunu yazın: schtasks /Run /TN &quot;Veltron Sunucu&quot;. Hâlâ açılmazsa bilgisayar yeniden başlatılmalı."
          />
          <Soru
            soru="Siyah ekran çıkıyor"
            cevap="Arayüz sunucudan yüklenir, sunucu kapalıyken siyah ekran normaldir. Önce sunucuyu başlatın."
          />
          <Soru
            soru="Faturalarım / müşterilerim kayboldu"
            cevap="Veriler veltron.db dosyasındadır. Ayarlar &gt; Uygulama Bilgileri bölümünde yol görünür. Yedek almayı unutmayın."
          />
          <Soru
            soru="Fatura e-posta gönderilmiyor"
            cevap="E-posta gönderimi Gmail kurulumu gerektirir. Bu durumda PDF indirip kendiniz gönderebilirsiniz — PDF düğmesi her zaman çalışır."
          />
          <Soru
            soru="Kurulumdan sonra 'Yönetici' şifresi değişmiyor"
            cevap="Ayarlar &gt; Hesap Bilgileri bölümünden şifre değiştirin. Eski şifre admin / VeltronDemo2026!"
          />
        </div>
      </div>

      {/* ============ GÜNLÜK SİLME ONAYI ============ */}
      <ConfirmDialog
        open={temizOnayi}
        onClose={() => setTemizOnayi(false)}
        onConfirm={gunlukTemizle}
        title="Hata günlüğü silinsin mi?"
        message={
          `Tüm hata günlüğü (${ozet?.toplam ?? 0} kayıt) kalıcı olarak silinecek.\n\n`
          + 'Bu işlem geri alınamaz. Bir sorunu incelemeniz gerekiyorsa önce '
          + '"Günlüğü İndir" ile dışa aktarın.'
        }
        confirmLabel="Günlüğü Sil"
        busy={temizleniyor}
      />
    </div>
  );
}

function Soru({ soru, cevap }) {
  const [acik, setAcik] = useState(false);
  return (
    <div style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      <button
        className="row"
        onClick={() => setAcik(!acik)}
        style={{
          width: '100%',
          background: 'none',
          border: 'none',
          padding: '11px 0',
          cursor: 'pointer',
          gap: 8,
          textAlign: 'left',
          color: 'var(--text)',
        }}
      >
        {acik ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        <span style={{ fontSize: 13, fontWeight: 500 }}>{soru}</span>
      </button>
      {acik ? (
        <div
          style={{
            padding: '0 0 12px 23px',
            fontSize: 12.5,
            lineHeight: 1.65,
            color: 'var(--text-muted)',
            whiteSpace: 'pre-line',
          }}
        >
          {cevap}
        </div>
      ) : null}
    </div>
  );
}