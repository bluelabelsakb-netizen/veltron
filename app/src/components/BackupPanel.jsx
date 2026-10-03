/**
 * YEDEKLEME PANELİ
 * ================
 * Ayarlar ekranında "Şimdi yedek al" + yedek listesi.
 *
 * ⛔ GERİ YÜKLEME İKİ KEZ ONAY İSTER:
 *   1) Panelde "Geri yükle" → onay kutusu açılır
 *   2) Onay kutusu işaretlenmeden düğme pasif
 *   Sunucu ayrıca gövdede `onay: true` şart arıyor; ikisi olmadan
 *   veritabanının üzerine yazılmaz.
 *
 * ⛔ SİLME DE ONAY İSTER — yedek geri dönüş yolunun son parçası.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  DatabaseBackup, Download, RotateCcw, Trash2, RefreshCw, HardDrive,
  ShieldAlert, FolderOpen, Check,
} from 'lucide-react';
import { api, dateTimeFmt, number } from '../lib/api.js';
import { useToast } from '../components/Toast.jsx';
import { ConfirmDialog } from '../components/Modal.jsx';

const bayt = (b) => (Number(b || 0) < 1024 * 1024
  ? `${Math.round((b || 0) / 1024)} KB`
  : `${(Number(b || 0) / 1024 / 1024).toFixed(1)} MB`);

export function BackupPanel() {
  const toast = useToast();
  const [bilgi, setBilgi] = useState(null);
  const [liste, setListe] = useState([]);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [aliniyor, setAliniyor] = useState(false);
  const [envDahil, setEnvDahil] = useState(false);

  const [geriYuklenecek, setGeriYuklenecek] = useState(null);
  const [onayKutusu, setOnayKutusu] = useState(false);
  const [silinecek, setSilinecek] = useState(null);
  const [calisiyor, setCalisiyor] = useState(false);

  const yukle = useCallback(async () => {
    setYukleniyor(true);
    try {
      const [b, l] = await Promise.all([
        api.get('/backup/bilgi'),
        api.get('/backup/liste'),
      ]);
      setBilgi(b.data);
      setListe(l.data || []);
    } catch (err) {
      toast.fromError(err, 'Yedek bilgisi alınamadı');
    } finally {
      setYukleniyor(false);
    }
  }, [toast]);

  useEffect(() => { yukle(); }, [yukle]);

  const yedekAl = async () => {
    setAliniyor(true);
    try {
      const r = await api.post('/backup', { envDahil });
      toast.success('Yedek alındı', r.data?.mesaj);
      yukle();
    } catch (err) {
      toast.fromError(err, 'Yedek alınamadı');
    } finally {
      setAliniyor(false);
    }
  };

  const indir = async (ad) => {
    try {
      const bridge = typeof window !== 'undefined' ? window.veltron : null;
      if (bridge?.app?.exportText) {
        // Electron'da kaydet; içerik önce kimlikli çekilir
        const token = localStorage.getItem('veltron.token');
        const taban = localStorage.getItem('veltron.serverUrl') || 'http://localhost:4000';
        const r = await fetch(`${taban}/api/backup/${encodeURIComponent(ad)}/indir`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!r.ok) throw new Error(`Sunucu ${r.status}`);
        const metin = await r.text();
        await bridge.app.exportText({ defaultName: ad, content: metin });
        toast.success('Yedek indirildi', ad);
        return;
      }
      const token = localStorage.getItem('veltron.token');
      const taban = localStorage.getItem('veltron.serverUrl') || 'http://localhost:4000';
      const a = document.createElement('a');
      a.href = `${taban}/api/backup/${encodeURIComponent(ad)}/indir`;
      window.open(a.href, '_blank', 'noopener');
    } catch (err) {
      toast.fromError(err, 'İndirilemedi');
    }
  };

  const geriYukle = async () => {
    if (!onayKutusu || !geriYuklenecek) return;
    setCalisiyor(true);
    try {
      const r = await api.post('/backup/geri-yukle', {
        ad: geriYuklenecek.ad,
        onay: true,
      });
      toast.success('Geri yüklendi', r.data?.mesaj);
      setGeriYuklenecek(null);
      setOnayKutusu(false);
      yukle();
    } catch (err) {
      toast.fromError(err, 'Geri yüklenemedi');
    } finally {
      setCalisiyor(false);
    }
  };

  const sil = async () => {
    if (!silinecek) return;
    const hedef = silinecek;
    setSilinecek(null);
    try {
      await api.del(`/backup/${encodeURIComponent(hedef.ad)}`);
      toast.success('Yedek silindi', hedef.ad);
      yukle();
    } catch (err) {
      toast.fromError(err, 'Silinemedi');
    }
  };

  const klasorAc = () => {
    const bridge = typeof window !== 'undefined' ? window.veltron : null;
    if (bridge?.app?.openDataFolder) {
      toast.info('Klasör', bilgi?.konum || 'Sunucu veri klasörü');
    }
  };

  const walUyari = bilgi && bilgi.walBayt > bilgi.dbBayt;

  return (
    <>
      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-head">
          <DatabaseBackup size={16} style={{ color: 'var(--primary)' }} />
          <h3>Yedekleme</h3>
          <span className="text-dim text-sm">
            {bilgi ? `${bilgi.adet} yedek · en fazla ${bilgi.enFazla}` : ''}
          </span>
        </div>

        <div className="card-body">
          {/* Durum */}
          {bilgi ? (
            <div className="row row-wrap" style={{ gap: 12, marginBottom: 12 }}>
              <div>
                <div className="text-dim text-sm">Veritabanı</div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{bayt(bilgi.dbBayt)}</div>
              </div>
              <div>
                <div className="text-dim text-sm">Son hareketler (WAL)</div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{bayt(bilgi.walBayt)}</div>
              </div>
              <div>
                <div className="text-dim text-sm">Son yedek</div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  {bilgi.sonYedek
                    ? dateTimeFmt(bilgi.sonYedek)
                    : <span className="text-dim">hiç alınmadı</span>}
                </div>
              </div>
            </div>
          ) : null}

          {/* ⛔ WAL büyükse "bugün yedek al" uyarısı */}
          {walUyari ? (
            <div className="alert warning" style={{ marginBottom: 12 }}>
              <ShieldAlert size={15} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>
                Son kayıtların önemli kısmı henüz ana dosyaya yazılmamış
                (<strong>{bayt(bilgi.walBayt)}</strong>). Yedek al dersen hepsi
                tek dosyaya tam olarak girer — ama bu veri şu an yalnızca
                sunucu klasöründe duruyor. Yedek almanız iyi olur.
              </span>
            </div>
          ) : null}

          {/* Butonlar */}
          <div className="row row-wrap" style={{ gap: 8, alignItems: 'center' }}>
            <button className="btn btn-primary" onClick={yedekAl} disabled={aliniyor}>
              {aliniyor
                ? <RefreshCw size={14} className="spin" />
                : <HardDrive size={14} />}
              {aliniyor ? 'Alınıyor...' : 'Şimdi Yedek Al'}
            </button>
            <button className="btn" onClick={yukle} disabled={yukleniyor}>
              <RefreshCw size={13} className={yukleniyor ? 'spin' : undefined} />
              Yenile
            </button>

            <label
              className="row"
              style={{ gap: 5, cursor: 'pointer', marginLeft: 6, fontSize: 12 }}
              title=".env dosyası giriş bilgileri ve Telegram jetonu içerir"
            >
              <input
                type="checkbox"
                checked={envDahil}
                onChange={(e) => setEnvDahil(e.target.checked)}
              />
              <span className="text-dim">Ayar dosyasını da dahil et</span>
            </label>
          </div>

          {envDahil ? (
            <div className="alert warning" style={{ marginTop: 10, marginBottom: 0 }}>
              <ShieldAlert size={15} style={{ flexShrink: 0, marginTop: 1 }} />
              <span style={{ fontSize: 12.5 }}>
                ⛔ Ayar dosyası içinde <strong>şifreler ve Telegram jetonu</strong>
                var. Yedeği USB'ye alıp başkasına verirsen o kişi bu
                bilgilere ulaşır. Sadece kendi yedeğin için kullan.
              </span>
            </div>
          ) : null}

          {/* Konum */}
          {bilgi ? (
            <div className="text-dim text-sm" style={{ marginTop: 10, lineHeight: 1.5 }}>
              <FolderOpen size={11} style={{ verticalAlign: -1, marginRight: 4 }} />
              <span className="mono">{bilgi.konum}</span>
            </div>
          ) : null}

          {/* Liste */}
          {liste.length ? (
            <div style={{ marginTop: 14, borderTop: '1px solid var(--border-subtle)' }}>
              {liste.map((y) => (
                <div
                  key={y.ad}
                  className="list-row"
                  style={{ gap: 10, flexWrap: 'wrap' }}
                >
                  <div className="grow" style={{ minWidth: 180 }}>
                    <div className="title" style={{ fontSize: 12.5 }}>
                      {y.ad.replace('veltron-yedek-', '').replace('.db', '')}
                      {y.guncel ? (
                        <span className="badge success" style={{ marginLeft: 6 }}>
                          bugün
                        </span>
                      ) : null}
                      {y.envVar ? (
                        <span className="badge muted" style={{ marginLeft: 4 }}>ayar</span>
                      ) : null}
                    </div>
                    <div className="meta">
                      {dateTimeFmt(y.tarih)} · {bayt(y.boyut)}
                    </div>
                  </div>
                  <div className="row" style={{ gap: 4 }}>
                    <button
                      className="btn btn-ghost btn-icon btn-sm"
                      title="Bilgisayara indir"
                      onClick={() => indir(y.ad)}
                    >
                      <Download size={13} />
                    </button>
                    <button
                      className="btn btn-ghost btn-icon btn-sm"
                      title="Bu yedekten geri yükle"
                      onClick={() => { setGeriYuklenecek(y); setOnayKutusu(false); }}
                    >
                      <RotateCcw size={13} />
                    </button>
                    <button
                      className="btn btn-ghost btn-icon btn-sm"
                      title="Yedeği sil"
                      onClick={() => setSilinecek(y)}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty" style={{ padding: '24px 16px' }}>
              <DatabaseBackup size={28} strokeWidth={1.4} style={{ marginBottom: 6 }} />
              <h3>Henüz yedek yok</h3>
              <p>
                “Şimdi Yedek Al” ile ilk yedeğini oluştur. Bilgisayar bozulursa
                veriler bu dosyadan geri gelir.
              </p>
            </div>
          )}

          {/* ⛔ Geri yükleme uyarısı — her zaman görünür */}
          <div className="alert info" style={{ marginTop: 12, marginBottom: 0 }}>
            <ShieldAlert size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: 12.5, lineHeight: 1.55 }}>
              Yedek, veritabanının <strong>tek dosyalık tam kopyasıdır</strong>
              (içindeki son kayıtlar dahil). Geri yükleme mevcut verilerin
              üzerine yazar — o yüzden onay ister ve önce mevcut verinin
              yeni bir yedeğini alır.
            </span>
          </div>
        </div>
      </div>

      {/* ---- Geri yükleme onayı ---- */}
      <ConfirmDialog
        open={!!geriYuklenecek}
        onClose={() => { setGeriYuklenecek(null); setOnayKutusu(false); }}
        onConfirm={geriYukle}
        busy={calisiyor}
        danger
        title="Yedek geri yüklensin mi?"
        confirmLabel="Geri Yükle"
        message={
          geriYuklenecek
            ? `${geriYuklenecek.ad}\n\n` +
              '⛔ ŞU ANKİ TÜM VERİLER SİLİNECEK ve yedekteki verilerle ' +
              'değiştirilecek.\n\nGüvence: önce mevcut verinin bir yedeği daha alınır, ' +
              'her şey tersine döndürülebilir.\n\n' +
              'Onaylamak için aşağıdaki kutuyu işaretleyin.'
            : ''
        }
      />

      {geriYuklenecek ? (
        <div
          className="alert warning"
          style={{ position: 'fixed', bottom: 18, left: '50%', transform: 'translateX(-50%)', zIndex: 500, maxWidth: 420 }}
        >
          <label className="row" style={{ gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={onayKutusu}
              onChange={(e) => setOnayKutusu(e.target.checked)}
            />
            <span style={{ fontSize: 13 }}>
              <strong>Anladım, veriler değişecek.</strong> Geri yükle.
            </span>
          </label>
        </div>
      ) : null}

      {/* ---- Silme onayı ---- */}
      <ConfirmDialog
        open={!!silinecek}
        onClose={() => setSilinecek(null)}
        onConfirm={sil}
        title="Yedek silinsin mi?"
        confirmLabel="Sil"
        message={
          silinecek
            ? `${silinecek.ad} silinecek.\n\n` +
              '⛔ Bu yedek geri dönüş yolunun son parçasıysa silmek risklidir. ' +
              'Daha önce alınmış başka bir yedek varsa onu tercih et.'
            : ''
        }
      />
    </>
  );
}

export default BackupPanel;
