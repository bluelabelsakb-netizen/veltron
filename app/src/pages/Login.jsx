import { useState } from 'react';
import { Server, LogIn, AlertCircle, Eye, EyeOff, RefreshCw, KeyRound, MonitorSmartphone } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../components/Toast.jsx';
import { PasswordResetModal } from './PasswordResetModal.jsx';
import { Modal } from '../components/Modal.jsx';
import { DestekOzeti } from '../components/DestekOzeti.jsx';

/**
 * Giris ekrani. Sunucu kapaliysa once adres sorulur.
 *
 * "Sifremi unuttum" baglantisi sifre sifirlama TALEBI acar.
 * DIKKAT: Kullanici yeni sifreyi KENDISI SECMEZ — talep yoneticiye gider,
 * yonetici onaylayinca sistem gecici sifre uretir ve kullanici ilk giriste
 * degistirmeye zorlanir. Boylece `admin` adini bilen bir yabanci sistemi
 * ele geciremez.
 *
 * @param {{serverDown?: boolean}} props
 */
export function Login({ serverDown = false }) {
  const { login, connectTo, serverUrl, retry } = useAuth();
  const toast = useToast();

  const [mode, setMode] = useState(serverDown ? 'server' : 'login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [url, setUrl] = useState(serverUrl || 'http://localhost:4000');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // "Beni hatirla" (1 Ekim 2026). SIFRE SAKLANMAZ — sadece 30 gunluk
  // hatirlama jetonu cihazda tutulur, program her acildiginda onunla
  // otomatik giris yapar. Iptal etmek icin: Ayarlar > "Bu cihazi unut"
  // veya kutuyu isaretlemeden giris yapmak.
  const [remember, setRemember] = useState(true);
  // Sifre sifirlama talebi (yalnizca normal giris modunda).
  const [sifremiUnuttum, setSifremiUnuttum] = useState(false);
  // Giris yapilamiyorsa destek penceresi (2 Ekim 2026)
  const [destekAcik, setDestekAcik] = useState(false);

  /** Sunucu kapaliyken "Tekrar dene": ayarları değiştirmeden yeniden bağlanmayı dener. */
  const doRetry = () => {
    setError('');
    retry();
  };

  const doLogin = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Kullanıcı adı ve şifre gerekli.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await login(username, password, remember);
    } catch (err) {
      setError(err.message || 'Giriş başarısız.');
    } finally {
      setBusy(false);
    }
  };

  const doConnect = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await connectTo(url);
      setMode('login');
      toast.success('Sunucuya bağlanıldı', url.trim().replace(/\/+$/, ''));
    } catch (err) {
      setError(err.message || 'Sunucuya ulaşılamadı.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          <img className="brand-mark" src="./veltron-ikon.png" alt="" />
          <h1>VELTRON</h1>
          <p>İş Takip ve Yönetim Sistemi</p>
        </div>

        {error ? (
          <div className="alert">
            <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            <span style={{ whiteSpace: 'pre-line' }}>{error}</span>
          </div>
        ) : null}

        {mode === 'server' ? (
          <form onSubmit={doConnect} className="auth-fields">
            <div className="alert warning" style={{ marginBottom: 0 }}>
              <Server size={15} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>
                Sunucuya ulaşılamıyor. Şirket sunucusunun adresini girin. Aynı ağdaki bilgisayarlar için
                <span className="mono"> http://192.168.x.x:4000 </span>
                biçiminde yazılır.
              </span>
            </div>

            <div className="field">
              <label className="field-label" htmlFor="server-url">
                Sunucu adresi
              </label>
              <input
                id="server-url"
                className="input"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="http://192.168.1.100:4000"
                autoFocus
                spellCheck={false}
              />
            </div>

            <button className="btn btn-primary btn-block" disabled={busy}>
              <RefreshCw size={14} className={busy ? 'spin' : undefined} />
              {busy ? 'Bağlanılıyor...' : 'Bağlan'}
            </button>

            <button type="button" className="btn btn-block" onClick={doRetry} disabled={busy}>
              <RefreshCw size={14} />
              Tekrar dene
            </button>

            <div
              className="field-hint"
              style={{ textAlign: 'center', lineHeight: 1.6, marginTop: 4 }}
            >
              Sunucuyu kendiniz mi başlatacaksınız? Proje klasöründe
              <br />
              <span className="kbd">Sunucuyu-Kur.bat</span> çift tıklayın (bir kez, yönetici olarak).
              <br />
              Bu sayfayı <span className="kbd">http://localhost:4000</span> adresinde açtıysanız ve
              sunucu kapalıysa siyah ekran görürsünüz — arayüz de sunucudan yüklenir.
            </div>

            <button
              type="button"
              className="btn btn-ghost btn-sm btn-block"
              onClick={() => {
                setError('');
                setMode('login');
              }}
            >
              Geri dön
            </button>
          </form>
        ) : (
          <form onSubmit={doLogin} className="auth-fields">
            <div className="field">
              <label className="field-label" htmlFor="username">
                Kullanıcı adı
              </label>
              <input
                id="username"
                className="input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                autoComplete="username"
                autoFocus
                spellCheck={false}
              />
            </div>

            <div className="field">
              <label className="field-label" htmlFor="password">
                Şifre
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  id="password"
                  className="input"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  style={{ paddingRight: 38 }}
                />
                <button
                  type="button"
                  className="btn btn-ghost btn-icon"
                  style={{ position: 'absolute', right: 3, top: 3, width: 28, height: 28 }}
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            {/* "Beni hatirla" — sifre DEGIL, sadece jeton saklanir. */}
            <label
              className="auth-remember"
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
                marginTop: -4,
                marginBottom: 12,
                cursor: 'pointer',
                userSelect: 'none',
              }}
            >
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                style={{ width: 15, height: 15, marginTop: 1, accentColor: 'var(--primary)', cursor: 'pointer' }}
              />
              <span style={{ fontSize: 12.5, lineHeight: 1.45 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <MonitorSmartphone size={12} />
                  Beni hatırla
                </span>
                <span className="text-dim" style={{ display: 'block', marginTop: 2 }}>
                  Bu bilgisayarda 30 gün boyunca otomatik giriş. Şifren kaydedilmez.
                </span>
              </span>
            </label>

            <button className="btn btn-primary btn-block" disabled={busy}>
              <LogIn size={14} />
              {busy ? 'Giriş yapılıyor...' : 'Giriş yap'}
            </button>

            <div className="auth-foot">
              <button
                type="button"
                onClick={() => setSifremiUnuttum(true)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
              >
                <KeyRound size={12} />
                Şifremi unuttum
              </button>

              <span
                className="text-dim"
                style={{ display: 'block', marginTop: 10, marginBottom: 6 }}
              >
                Bağlı: <span className="mono">{serverUrl}</span>
              </span>
              <button type="button" onClick={() => { setError(''); setMode('server'); }}>
                Sunucu adresini değiştir
              </button>

              {/* Giris yapilamiyorsa buradan da bilgi alinabilsin (2 Ekim 2026) */}
              <button
                type="button"
                onClick={() => {
                  setError('');
                  setSifremiUnuttum(false);
                  setDestekAcik(true);
                }}
                style={{ marginTop: 8, display: 'block' }}
              >
                Giriş yapamıyorum — destek
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Giris ekranindan acilan destek penceresi — oturum gerekmez */}
      {destekAcik ? (
        <Modal open onClose={() => setDestekAcik(false)} title="Destek" size="lg">
          <DestekOzeti />
        </Modal>
      ) : null}

      {/* Sifre sifirlama talebi — giris ekranindan acilir. */}
      {sifremiUnuttum ? (
        <PasswordResetModal
          open
          initialUsername={username.trim()}
          onClose={() => setSifremiUnuttum(false)}
        />
      ) : null}
    </div>
  );
}
