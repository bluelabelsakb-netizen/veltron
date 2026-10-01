import { useEffect, useState } from 'react';
import {
  Server, RefreshCw, Save, Info, FolderOpen, Shield, Database, Monitor,
  MonitorSmartphone, Send, AlertTriangle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../components/Toast.jsx';
import { api, dateFmt, dateTimeFmt, getServerUrl, getToken } from '../lib/api.js';
import { PageHeader, Kpi } from '../components/Primitives.jsx';
import { FormField, useFormState } from '../components/Form.jsx';

const bridge = typeof window !== 'undefined' ? window.veltron : null;

export default function Settings() {
  const { user, serverUrl, connectTo, logout, forgetDevice } = useAuth();
  const toast = useToast();

  const [url, setUrl] = useState(serverUrl);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [health, setHealth] = useState(null);
  const [appInfo, setAppInfo] = useState(null);
  // "Beni hatirla" durumu (1 Ekim 2026)
  const [remembered, setRemembered] = useState(null);
  const [unutuyor, setUnutuyor] = useState(false);

  // Fatura gorunumu + gonderim (1 Ekim 2026)
  const [markaRenk, setMarkaRenk] = useState('#1E3A8A');
  const [markaKaydediyor, setMarkaKaydediyor] = useState(false);
  const [gonderim, setGonderim] = useState(null);
  const [testKime, setTestKime] = useState('');
  const [testGonderiliyor, setTestGonderiliyor] = useState(false);
  const [onizlemeYapiyor, setOnizlemeYapiyor] = useState(false);

  useEffect(() => {
    if (bridge?.app?.info) bridge.app.info().then(setAppInfo).catch(() => {});
    if (bridge?.remember?.get) bridge.remember.get().then(setRemembered).catch(() => {});
  }, []);

  // Gonderim durumu + mevcut marka rengini cek
  useEffect(() => {
    let iptal = false;
    (async () => {
      try {
        const [d, c] = await Promise.all([
          api.get('/invoices/gonderim-durumu').catch(() => null),
          api.get('/company').catch(() => null),
        ]);
        if (iptal) return;
        if (d?.data) setGonderim(d.data);
        const profil = c?.data;
        if (profil?.marka_color) setMarkaRenk(profil.marka_color);
        if (profil?.email) setTestKime((x) => x || profil.email);
      } catch { /* ayarlar kapaliysa sorun degil */ }
    })();
    return () => { iptal = true; };
  }, []);

  const markaRenkKaydet = async () => {
    setMarkaKaydediyor(true);
    try {
      // company PATCH/PUT hangisi? Once kontrol et -> PUT kullanilir
      const mevcut = await api.get('/company');
      await api.put('/company', { ...mevcut.data, marka_color: markaRenk });
      toast.success('Fatura marka rengi kaydedildi', markaRenk);
    } catch (err) {
      toast.fromError(err, 'Kaydedilemedi');
    } finally {
      setMarkaKaydediyor(false);
    }
  };

  const faturaOnizle = async () => {
    setOnizlemeYapiyor(true);
    try {
      // Ilk faturayi bul ve PDF indir
      const liste = await api.get('/invoices', { limit: 1 });
      const f = liste?.data?.[0];
      if (!f) {
        toast.error('Fatura yok', 'Önizleme için önce bir fatura kesin.');
        return;
      }
      const r = await fetch(`${getServerUrl()}/api/invoices/${f.id}/pdf?indir=1`, {
        headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
      });
      if (!r.ok) throw new Error(`Sunucu ${r.status} döndü`);
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `Fatura-onizleme-${f.number}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Önizleme indirildi', 'Masaüstünde açıp bakabilirsiniz.');
    } catch (err) {
      toast.fromError(err, 'Önizleme oluşturulamadı');
    } finally {
      setOnizlemeYapiyor(false);
    }
  };

  const testGonder = async () => {
    setTestGonderiliyor(true);
    try {
      await api.post('/invoices/test-posta', { kime: testKime.trim() });
      toast.success('Test e-postası gönderildi', testKime);
      const d = await api.get('/invoices/gonderim-durumu');
      setGonderim(d.data);
    } catch (err) {
      toast.fromError(err, 'Test gönderilemedi');
    } finally {
      setTestGonderiliyor(false);
    }
  };

  const cihazıUnut = async () => {
    setUnutuyor(true);
    try {
      await forgetDevice();
      setRemembered(null);
      toast.success('Bu bilgisayar unutuldu', 'Bir sonraki açılışta şifre istenecek.');
    } catch (err) {
      toast.fromError(err, 'Silinemedi');
    } finally {
      setUnutuyor(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setHealth(null);
    try {
      const res = await fetch(`${url.trim().replace(/\/+$/, '')}/api/health`, { method: 'GET' });
      if (!res.ok) throw new Error(`Sunucu ${res.status} döndü`);
      const data = await res.json();
      setHealth({ ok: true, ...data });
    } catch (err) {
      setHealth({ ok: false, error: err.message });
    } finally {
      setTesting(false);
    }
  };

  const saveServer = async () => {
    setBusy(true);
    try {
      await connectTo(url);
      toast.success('Sunucu adresi kaydedildi', url.trim().replace(/\/+$/, ''));
      setHealth(null);
    } catch (err) {
      toast.fromError(err, 'Bağlantı kurulamadı');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <PageHeader
        title="Ayarlar"
        description="Sunucu bağlantısı, hesap bilgileri ve uygulama bilgileri"
      />

      <div className="grid-2">
        {/* ---- Sunucu baglantisi ---- */}
        <div className="card">
          <div className="card-head">
            <Server size={16} style={{ color: 'var(--primary)' }} />
            <h3>Sunucu Bağlantısı</h3>
          </div>
          <div className="card-body">
            <div className="field mb-14">
              <label className="field-label" htmlFor="server-url">
                Sunucu adresi
              </label>
              <input
                id="server-url"
                className="input"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="http://192.168.1.100:4000"
                spellCheck={false}
              />
              <div className="field-hint">
                Aynı bilgisayarda: <span className="mono">http://localhost:4000</span> · Ofis ağından:{' '}
                <span className="mono">http://192.168.x.x:4000</span>
              </div>
            </div>

            <div className="row" style={{ gap: 8 }}>
              <button className="btn" onClick={testConnection} disabled={testing}>
                <RefreshCw size={14} className={testing ? 'spin' : undefined} />
                {testing ? 'Test ediliyor...' : 'Bağlantıyı test et'}
              </button>
              <button
                className="btn btn-primary"
                onClick={saveServer}
                disabled={busy || url.trim() === serverUrl}
              >
                <Save size={14} />
                {busy ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
            </div>

            {health ? (
              <div className={`alert ${health.ok ? 'success' : 'warning'}`} style={{ marginTop: 14, marginBottom: 0 }}>
                {health.ok ? (
                  <>
                    <strong>Bağlantı başarılı.</strong> Sunucu yanıt verdi ({health.service}, {new Date(health.time).toLocaleTimeString('tr-TR')}).
                  </>
                ) : (
                  <>
                    <strong>Bağlantı kurulamadı.</strong> {health.error}
                  </>
                )}
              </div>
            ) : null}
          </div>
        </div>

        {/* ---- Hesap ---- */}
        <div className="card">
          <div className="card-head">
            <Shield size={16} style={{ color: 'var(--purple)' }} />
            <h3>Hesap Bilgileri</h3>
          </div>
          <div className="card-body">
            <div className="stat-row">
              <span className="label">Ad soyad</span>
              <span className="value">{user?.full_name}</span>
            </div>
            <div className="stat-row">
              <span className="label">Kullanıcı adı</span>
              <span className="value mono">{user?.username}</span>
            </div>
            <div className="stat-row">
              <span className="label">E-posta</span>
              <span className="value">{user?.email || '-'}</span>
            </div>
            <div className="stat-row">
              <span className="label">Yetki</span>
              <span className="value">
                <span className={`badge ${user?.role === 'admin' ? 'purple' : 'info'}`}>
                  {user?.role === 'admin' ? 'Yönetici' : 'Kullanıcı'}
                </span>
              </span>
            </div>

            <div className="alert info" style={{ marginTop: 14, marginBottom: 0 }}>
              Şifrenizi değiştirmek için sağ üstteki kullanıcı menüsünden "Şifre değiştir" seçeneğini kullanın.
            </div>

            {/* ---- "Beni hatırla" durumu (1 Ekim 2026) ---- */}
            {remembered ? (
              <div
                className="alert success"
                style={{ marginTop: 14, marginBottom: 0, display: 'flex', gap: 8, alignItems: 'center' }}
              >
                <div style={{ flex: 1 }}>
                  <strong>Bu bilgisayar hatırlanmış.</strong>{' '}
                  <span className="text-dim">
                    {remembered.username && <span className="mono">{remembered.username}</span>}
                    {remembered.device && <> · {remembered.device}</>}
                    {remembered.expiresAt && (
                      <> · {dateFmt(remembered.expiresAt)} tarihine kadar</>
                    )}
                  </span>
                </div>
                <button
                  className="btn btn-sm"
                  onClick={cihazıUnut}
                  disabled={unutuyor}
                  title="Hatırlama jetonunu bu bilgisayardan siler"
                >
                  <MonitorSmartphone size={13} />
                  {unutuyor ? 'Siliniyor...' : 'Bu cihazı unut'}
                </button>
              </div>
            ) : (
              <div className="field-hint" style={{ marginTop: 14 }}>
                Bu bilgisayar hatırlanmamış. Giriş ekranındaki "Beni hatırla" kutusunu
                işaretlerseniz 30 gün otomatik giriş yapılır (şifren kaydedilmez).
              </div>
            )}

            <button className="btn btn-block" style={{ marginTop: 14 }} onClick={logout}>
              Çıkış yap
            </button>
          </div>
        </div>
      </div>

      {/* ---- Fatura Görünümü + E-posta Gönderimi (1 Ekim 2026) ---- */}
      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-head">
          <Send size={16} style={{ color: 'var(--success)' }} />
          <h3>Fatura Görünümü ve E-posta Gönderimi</h3>
        </div>
        <div className="card-body">
          <div className="grid-2" style={{ gap: 20 }}>
            {/* Sol: marka rengi */}
            <div>
              <div className="field">
                <label className="field-label" htmlFor="marka-renk">
                  Fatura marka rengi
                </label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    id="marka-renk"
                    type="color"
                    value={markaRenk}
                    onChange={(e) => setMarkaRenk(e.target.value)}
                    style={{
                      width: 52, height: 34, padding: 2, borderRadius: 6,
                      border: '1px solid var(--border)', background: 'var(--bg-input)', cursor: 'pointer',
                    }}
                  />
                  <input
                    className="input mono"
                    value={markaRenk}
                    onChange={(e) => setMarkaRenk(e.target.value)}
                    placeholder="#1E3A8A"
                    style={{ maxWidth: 130 }}
                  />
                  <button
                    className="btn btn-sm"
                    onClick={markaRenkKaydet}
                    disabled={markaKaydediyor}
                  >
                    {markaKaydediyor ? 'Kaydediliyor...' : 'Kaydet'}
                  </button>
                </div>
                <div className="field-hint">
                  Fatura kâğıdında başlık, tablo başlığı ve toplam çizgisi bu rengi kullanır.
                  Yerleşim <span className="mono">server/templates/fatura.html</span> dosyasındadır —
                  tasarımı kod bilmeden değiştirebilirsiniz.
                </div>
              </div>

              <button className="btn" onClick={faturaOnizle} disabled={onizlemeYapiyor}>
                {onizlemeYapiyor ? 'Hazırlanıyor...' : 'Fatura önizleme indir (PDF)'}
              </button>
            </div>

            {/* Sağ: gönderim durumu */}
            <div>
              <div className="field-label" style={{ marginBottom: 8 }}>E-posta gönderimi</div>

              {gonderim === null ? (
                <div className="field-hint">Yükleniyor...</div>
              ) : gonderim.aktif ? (
                <>
                  <div
                    className="alert success"
                    style={{ marginBottom: 12 }}
                  >
                    <strong>Hazır.</strong> Bugün {gonderim.gonderilenBugun} fatura gönderildi,
                    kalan kota <strong>{gonderim.kalan}</strong> / {gonderim.kota}.
                  </div>
                  <div className="field">
                    <label className="field-label" htmlFor="test-kime">Test gönderimi</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        id="test-kime"
                        className="input"
                        type="email"
                        value={testKime}
                        onChange={(e) => setTestKime(e.target.value)}
                        placeholder="kendi adresiniz"
                        spellCheck={false}
                      />
                      <button
                        className="btn"
                        onClick={testGonder}
                        disabled={!testKime.trim() || testGonderiliyor}
                      >
                        {testGonderiliyor ? 'Gönderiliyor...' : 'Test Et'}
                      </button>
                    </div>
                    <div className="field-hint">
                      Kendinize bir test e-postası gönderir. Fatura gönderimi de aynı hesaptan yapılır
                      (Ayarlar &gt; Firma Profili &gt; e-posta alanı).
                    </div>
                  </div>
                </>
              ) : (
                <div className="alert warning">
                  <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                  <div>
                    <strong>Kapalı.</strong>
                    <div style={{ marginTop: 2 }}>{gonderim.sebep}</div>
                    <div style={{ marginTop: 6 }}>
                      PDF indirme çalışıyor; sadece e-posta gönderimi kapalı.
                      Adresi Firma Profili'ne yazın, yetki bilgisi
                      <span className="mono"> server/.env</span> dosyasına girer.
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ---- Uygulama bilgisi ---- */}
      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-head">
          <Info size={16} style={{ color: 'var(--info)' }} />
          <h3>Uygulama Bilgileri</h3>
        </div>
        <div className="card-body">
          <div className="grid-3">
            <div>
              <div className="text-dim text-sm mb-8">
                <Monitor size={12} style={{ verticalAlign: -2, marginRight: 5 }} />
                Uygulama
              </div>
              <div className="stat-row">
                <span className="label">Sürüm</span>
                <span className="value">{appInfo?.version || '1.0.0'}</span>
              </div>
              <div className="stat-row">
                <span className="label">Platform</span>
                <span className="value">{appInfo?.platform || '—'}</span>
              </div>
              <div className="stat-row">
                <span className="label">Electron</span>
                <span className="value mono">{appInfo?.electron || '—'}</span>
              </div>
            </div>

            <div>
              <div className="text-dim text-sm mb-8">
                <Database size={12} style={{ verticalAlign: -2, marginRight: 5 }} />
                Veri
              </div>
              <div className="stat-row">
                <span className="label">Sunucu</span>
                <span className="value mono text-sm">{serverUrl}</span>
              </div>
              <div className="stat-row">
                <span className="label">Motor</span>
                <span className="value">SQLite (WAL)</span>
              </div>
              <div className="stat-row">
                <span className="label">Oturum</span>
                <span className="value">12 saat</span>
              </div>
            </div>

            <div>
              <div className="text-dim text-sm mb-8">
                <FolderOpen size={12} style={{ verticalAlign: -2, marginRight: 5 }} />
                Dosyalar
              </div>
              <div className="stat-row">
                <span className="label">Ayarlar</span>
                <span className="value mono text-sm">%APPDATA%/veltron</span>
              </div>
              <div className="stat-row">
                <span className="label">Veritabanı</span>
                <span className="value mono text-sm">sunucuda</span>
              </div>
              <div className="stat-row">
                <span className="label">Yedekleme</span>
                <span className="value">Sunucu klasörü</span>
              </div>
            </div>
          </div>

          {bridge?.app?.openDataFolder ? (
            <button
              className="btn btn-sm"
              style={{ marginTop: 14 }}
              onClick={() => bridge.app.openDataFolder()}
            >
              <FolderOpen size={13} />
              Belgeler klasörünü aç
            </button>
          ) : null}
        </div>
      </div>

      <div className="alert warning" style={{ marginTop: 14, marginBottom: 0 }}>
        <strong>Yedekleme:</strong> Tüm veriler şirket sunucusundaki{' '}
        <span className="mono">server/data/veltron.db</span> dosyasında tutulur. Bu dosyayı düzenli olarak
        kopyalayıp güvenli bir yerde saklayın. Veritabanı bozulursa dosyayı geri yükleyerek tüm kayıtları
        kurtarabilirsiniz.
      </div>
    </div>
  );
}
