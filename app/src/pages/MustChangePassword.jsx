/**
 * ZORUNLU ŞİFRE DEĞİŞTİRME
 * ==========================
 * Şifre sıfırlama akışının SON ADIMI ve en kritik halkası.
 *
 * Yönetici bir talebi onaylayınca sistem geçici şifre üretir ve
 * `users.must_change_password = 1` yapar. Kullanıcı o şifreyle girince
 * sistem buraya yönlendirir.
 *
 * NEDEN ŞART?
 * Geçici şifre yöneticiye bildirimle (Telegram) gider — o kanal ele
 * geçirilebilir, ekranda görüntülenebilir. Bu ekran olmazsa geçici şifre
 * kalıcı olurdu ve "geçici" anlamını yitirirdi.
 *
 * BURADAN ÇIKIŞ YOK. Kullanıcı kapatıp açsa da aynı yere düşer:
 * bayrak `users` tablosunda durur, oturumda değil.
 */
import { useState } from 'react';
import { KeyRound, ShieldCheck, AlertTriangle, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../components/Toast.jsx';
import { api } from '../lib/api.js';

const GUC_KURALLARI = [
  { ok: (s) => s.length >= 8, metin: 'En az 8 karakter' },
  { ok: (s) => /[a-zçğıöşü]/i.test(s), metin: 'En az bir harf' },
  { ok: (s) => /[0-9]/.test(s), metin: 'En az bir rakam' },
  { ok: (s) => !/^(.)\1+$/.test(s), metin: 'Aynı karakterden oluşmaz' },
  { ok: (s) => !/^(123456|1234567|12345678|password|parola|qwerty|abc123)/i.test(s), metin: 'Yaygın şifre değil' },
];

export default function MustChangePassword() {
  const { logout } = useAuth();
  const toast = useToast();
  const [yeni, setYeni] = useState('');
  const [tekrar, setTekrar] = useState('');
  const [busy, setBusy] = useState(false);

  const gecti = GUC_KURALLARI.filter((k) => k.ok(yeni)).length;
  const uyumlu = gecti === GUC_KURALLARI.length;
  const esit = yeni.length > 0 && yeni === tekrar;

  const kaydet = async (e) => {
    e.preventDefault();
    if (!uyumlu) {
      toast.error('Şifre kurallarını karşılamıyor');
      return;
    }
    if (!esit) {
      toast.error('Şifreler aynı değil');
      return;
    }
    setBusy(true);
    try {
      // Gecici sifre ile girildi, eski sifre tekrar yazilmiyor (sunucu bunu
      // must_change_password bayragi ile dogrular).
      await api.post('/auth/change-password', { newPassword: yeni });

      // Sifre degisince token_version artar → BU oturum da kapanir.
      // Bu beklenen davranis: "Tekrar dene" yerine acikca cikis yapiyoruz ki
      // kullanici 401 hatasi gormesin. (Layout.jsx'teki normal sifre degistirme
      // ekrani da ayni sekilde logout() cagirir.)
      toast.success('Şifreniz değiştirildi', 'Yeni şifrenizle tekrar giriş yapın.');
      logout();
    } catch (err) {
      toast.error('Şifre değiştirilemedi', err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-card" style={{ maxWidth: 470 }}>
        <div className="auth-brand">
          <div className="brand-mark">V</div>
          <h1>ŞİFRE DEĞİŞTİR</h1>
          <p>Yönetici hesabınıza geçici bir şifre verdi</p>
        </div>

        <div className="alert warning" style={{ textAlign: 'left' }}>
          <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            Güvenlik için geçici şifreyle girmeye devam edemezsiniz.
            <br />
            <strong>Kendi şifrenizi belirlemeniz gerekiyor.</strong>
            <br />
            Bu ekran kapanana kadar sistemi kullanamazsınız.
          </span>
        </div>

        <form onSubmit={kaydet} className="auth-fields">
          <div className="field">
            <label className="field-label" htmlFor="mcp-yeni">
              Yeni şifreniz
            </label>
            <input
              id="mcp-yeni"
              className="input"
              type="password"
              value={yeni}
              onChange={(e) => setYeni(e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
              autoFocus
            />
            <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', display: 'grid', gap: 3 }}>
              {GUC_KURALLARI.map((k) => {
                const tamam = k.ok(yeni);
                return (
                  <li
                    key={k.metin}
                    className="text-sm"
                    style={{ color: tamam ? 'var(--success)' : 'var(--text-dim)', display: 'flex', gap: 5 }}
                  >
                    <span style={{ fontWeight: 700 }}>{tamam ? '✓' : '·'}</span>
                    {k.metin}
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="mcp-tekrar">
              Yeni şifreyi tekrar yazın
            </label>
            <input
              id="mcp-tekrar"
              className="input"
              type="password"
              value={tekrar}
              onChange={(e) => setTekrar(e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
            />
            {tekrar && !esit ? (
              <div className="text-sm" style={{ color: 'var(--danger)', marginTop: 4 }}>
                Şifreler aynı değil
              </div>
            ) : null}
          </div>

          <button className="btn btn-primary btn-block" disabled={busy || !uyumlu || !esit}>
            <ShieldCheck size={14} />
            {busy ? 'Kaydediliyor...' : 'Şifremi Değiştir'}
          </button>
        </form>

        <div className="auth-foot">
          <button type="button" onClick={logout} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <LogOut size={12} />
            Çıkış yap
          </button>
        </div>

        <p className="text-dim text-sm mt-14" style={{ textAlign: 'center', lineHeight: 1.6 }}>
          <KeyRound size={12} style={{ verticalAlign: -2 }} /> Şifrenizi değiştirdikten sonra
          diğer cihazlardaki oturumlarınız kapanacak (güvenlik için).
        </p>
      </div>
    </div>
  );
}