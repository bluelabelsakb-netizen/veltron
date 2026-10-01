/**
 * MUSTERI PORTALI DUZENI
 * Personel arayuzunden tamamen ayridir: farkli menu, farkli renk, sadelik.
 * Musteri rolu olmayanlar bu duzeni hic kullanamaz.
 */
import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Package, CalendarClock, FileText, LogOut, Server, KeyRound } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { getServerUrl } from '../../lib/api.js';
import { ChangePasswordModal } from './ChangePasswordModal.jsx';

const MENU = {
  progress: [
    { to: '/portal', label: 'İşlerim', icon: Package, end: true },
    { to: '/portal/talepler', label: 'Tarih Taleplerim', icon: CalendarClock },
  ],
  finance: [{ to: '/portal', label: 'Faturalarım', icon: FileText, end: true }],
};

export function PortalLayout() {
  const { user, portal, logout, serverUrl } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);

  const items = MENU[portal] || MENU.progress;
  const title = portal === 'finance' ? 'Mali Portal' : 'İş Takip Portalı';

  const doLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <div className="portal-shell">
      <header className="portal-top">
        <div className="portal-brand">
          <div className="portal-logo">V</div>
          <div>
            <strong>{title}</strong>
            <span className="text-dim text-sm">{user?.full_name}</span>
          </div>
        </div>

        <nav className={`portal-nav ${open ? 'open' : ''}`}>
          {items.map((m) => (
            <NavLink
              key={m.to}
              to={m.to}
              end={m.end}
              onClick={() => setOpen(false)}
              className={({ isActive }) => `portal-nav-item ${isActive ? 'on' : ''}`}
            >
              <m.icon size={15} />
              {m.label}
            </NavLink>
          ))}
        </nav>

        <div className="portal-actions">
          <span className="text-dim text-sm hide-sm" title="Bağlı olunan sunucu">
            <Server size={12} style={{ verticalAlign: -2, marginRight: 4 }} />
            {String(serverUrl || getServerUrl()).replace(/^https?:\/\//, '')}
          </span>
          <button className="btn btn-sm" onClick={() => setPwOpen(true)} title="Şifre değiştir">
            <KeyRound size={13} />
            Şifre
          </button>
          <button className="btn btn-sm" onClick={doLogout}>
            <LogOut size={13} />
            Çıkış
          </button>
        </div>
      </header>

      <main className="portal-main">
        <Outlet />
      </main>

      <footer className="portal-foot">
        Bu portalda yalnızca size ait bilgiler gösterilir. Fiyat ve maliyet bilgileri bu ekranlarda
        yer almaz.
      </footer>

      {pwOpen ? <ChangePasswordModal onClose={() => setPwOpen(false)} /> : null}
    </div>
  );
}

/**
 * `App.jsx` bu dosyayi `lazy(() => import(...))` ile yukler.
 * React.lazy DEFAULT export ZORUNLU ister; named export verilirse
 * ekran BOS kalir (React hatayi bile duzgun gosteremez).
 * Bu satir olmadan musteri portali hic acilmaz.
 */
export default PortalLayout;
