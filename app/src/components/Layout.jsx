import { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, CheckSquare, FolderKanban, Users, Building2, FileText,
  Receipt, Package, ArrowLeftRight, Shield, History, Settings, LogOut,
  Minus, Square, X, ChevronDown, KeyRound, User as UserIcon, Wifi, WifiOff,
  Building, ClipboardList, HardHat, Wallet, TrendingUp, Award, FileSpreadsheet, Upload, CircleDollarSign, Calculator,
  UserPlus, LifeBuoy,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { initials } from '../lib/api.js';
import { Modal } from './Modal.jsx';
import { FormField, useFormState } from './Form.jsx';
import { api } from '../lib/api.js';
import { useToast } from './Toast.jsx';

const bridge = typeof window !== 'undefined' ? window.veltron : null;

const NAV_GROUPS = [
  {
    title: null,
    items: [{ to: '/', label: 'Panel', icon: LayoutDashboard, end: true }],
  },
  {
    title: 'İş Takibi',
    items: [
      { to: '/is-emirleri', label: 'İş Emirleri', icon: ClipboardList, countKey: 'open_work_orders' },
      { to: '/gorevler', label: 'Görevler', icon: CheckSquare, countKey: 'open_tasks' },
      { to: '/projeler', label: 'Projeler', icon: FolderKanban, countKey: 'active_projects' },
    ],
  },
  {
    title: 'Ticaret',
    items: [
      { to: '/musteriler', label: 'Müşteriler', icon: Building2 },
      { to: '/teklifler', label: 'Teklifler', icon: FileText, countKey: 'pending_quotes' },
      { to: '/faturalar', label: 'Faturalar', icon: Receipt, countKey: 'overdue_invoices' },
      { to: '/fatura-aktar', label: 'Fatura İçe Aktar', icon: Upload },
      { to: '/calisan-aktar', label: 'Çalışan İçe Aktar', icon: UserPlus },
      { to: '/kar', label: 'Kâr Raporu', icon: TrendingUp },
    ],
  },
  {
    title: 'Kaynaklar',
    items: [
      { to: '/calisanlar', label: 'Çalışanlar', icon: Users },
      { to: '/puanlama', label: 'Puanlama', icon: Award },
      { to: '/maas', label: 'Maaş / Bordro', icon: Wallet },
      { to: '/taseronlar', label: 'Taşeronlar', icon: HardHat, countKey: 'open_subcontractor_jobs' },
      { to: '/urunler', label: 'Ürünler', icon: Package, countKey: 'critical_stock', alert: true },
      { to: '/stok-hareketleri', label: 'Stok Hareketleri', icon: ArrowLeftRight },
    ],
  },
  {
    title: 'Yönetim',
    items: [
      { to: '/firma', label: 'Firma Profili', icon: Building },
      { to: '/excel', label: 'Excel’e Aktar', icon: FileSpreadsheet },
      { to: '/doviz', label: 'Döviz Kurları', icon: TrendingUp },
      { to: '/vergiler', label: 'Vergiler', icon: Calculator },
      { to: '/kullanicilar', label: 'Kullanıcılar', icon: Shield, adminOnly: true },
      { to: '/sifre-talepleri', label: 'Şifre Talepleri', icon: KeyRound, adminOnly: true, badgeKey: 'sifreTalepleri' },
      { to: '/aktivite', label: 'Aktivite', icon: History },
      { to: '/ayarlar', label: 'Ayarlar', icon: Settings },
      { to: '/destek', label: 'Destek', icon: LifeBuoy },
    ],
  },
];

const TITLES = {
  '/': 'Genel Bakış',
  '/is-emirleri': 'İş Emirleri',
  '/taseronlar': 'Taşeronlar',
  '/gorevler': 'Görev Takibi',
  '/projeler': 'Projeler',
  '/musteriler': 'Müşteriler',
  '/teklifler': 'Teklifler',
  '/faturalar': 'Faturalar & Tahsilat',
  '/fatura-aktar': 'Fatura İçe Aktarma',
  '/calisan-aktar': 'Çalışan İçe Aktarma',
  '/kar': 'Kâr Raporu',
  '/calisanlar': 'Çalışanlar',
  '/maas': 'Maaş / Bordro',
  '/excel': 'Excel’e Aktar',
  '/urunler': 'Ürün & Malzeme',
  '/stok-hareketleri': 'Stok Hareketleri',
  '/kullanicilar': 'Kullanıcı Yönetimi',
  '/aktivite': 'Aktivite Kaydı',
  '/firma': 'Firma Profili',
  '/ayarlar': 'Ayarlar',
  '/destek': 'Destek',
  '/doviz': 'Döviz Kurları',
  '/vergiler': 'Vergiler',
  '/sifre-talepleri': 'Şifre Talepleri',
};

export function Layout() {
  const { user, logout, isAdmin, serverUrl } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();

  const [counts, setCounts] = useState({});
  const [menuOpen, setMenuOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [online, setOnline] = useState(true);
  const [maximized, setMaximized] = useState(false);

  // Kenar cubugu sayaclarini getir.
  // NOT: Her sayfa gecisinde degil, yalnizca acilista ve 5 dakikada bir
  // yenilenir. Sayfa gecisinde cekmek gereksiz yuk getirirdi.
  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        const [d, o, wo, sub] = await Promise.all([
          api.get('/dashboard'),
          api.get('/invoices', { overdue: 'true', limit: 1 }),
          api.get('/work-orders/summary'),
          api.get('/subcontractors/summary'),
        ]);
        if (!alive) return;
        setCounts({
          ...(d.data.kpi || {}),
          overdue_invoices: o.total,
          open_work_orders: wo.data.open_count,
          open_subcontractor_jobs: sub.data.open_jobs,
        });
        setOnline(true);
      } catch {
        if (alive) setOnline(false);
      }
    };

    load();
    const t = setInterval(load, 300000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  // Bekleyen sifre talebi sayisi (menude kirmizi rozet).
  // Sadece yoneticiye; musteri rolune 403 doner, sessizce yoksayilir.
  const [sifreTalepleri, setSifreTalepleri] = useState(0);
  useEffect(() => {
    if (!isAdmin) {
      setSifreTalepleri(0);
      return undefined;
    }
    let alive = true;
    const yukle = async () => {
      try {
        const r = await api.get('/password-reset/pending');
        if (alive) setSifreTalepleri((r.data || []).length);
      } catch {
        /* sunucu kapaliysa rozet gosterilmez */
      }
    };
    yukle();
    const t = setInterval(yukle, 60000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [isAdmin, location.pathname]);

  const title = TITLES[location.pathname] || 'Veltron';

  /**
   * ÜST ÇUBUKTA SAYFA ADI GÖSTERİLSİN Mİ?  (2 Ekim 2026)
   * =================================================
   * Varsayılan: KAPALI. Sayfa adı üç kere yazılıyordu (sol menü, üst
   * çubuk, sayfa içi başlık) ve üst çubuk yüzünden başlık yapışık duruyordu.
   *
   * ⛔ Bu ayar KALICI GERİ ALMA DÜĞMESİYLE geldi: Ayarlar > Görünüm >
   *   "Üst çubukta sayfa adı" — aç/kapat. Kullanıcı beğenmezse tek tıkla
   *   eski hâline döner, kod değişikliği gerekmez.
   *
   * localStorage'da tutulur (bilgisayara özel, sunucuya gitmez).
   */
  const [ustCubukBaslik, setUstCubukBaslik] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('veltron.ustCubukBaslik') === '1';
  });

  // Ayarlar'da kutu değiştirilince sayfayı yenilemeden uygulansın.
  useEffect(() => {
    const dinle = () =>
      setUstCubukBaslik(localStorage.getItem('veltron.ustCubukBaslik') === '1');
    window.addEventListener('veltron:gorunum', dinle);
    window.addEventListener('storage', dinle);
    return () => {
      window.removeEventListener('veltron:gorunum', dinle);
      window.removeEventListener('storage', dinle);
    };
  }, []);

  const visibleGroups = useMemo(
    () =>
      NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => !i.adminOnly || isAdmin) })).filter(
        (g) => g.items.length
      ),
    [isAdmin]
  );

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">V</div>
          <div className="brand-text">
            <span className="brand-name">VELTRON</span>
            <span className="brand-sub">İş Takip</span>
          </div>
        </div>

        <nav className="nav">
          {visibleGroups.map((group, gi) => (
            <div className="nav-group" key={gi}>
              {group.title ? <div className="nav-group-title">{group.title}</div> : null}
              {group.items.map((item) => {
                const Icon = item.icon;
                const count = item.alt ? counts.overdue_invoices : counts[item.countKey];
                // Sifre talepleri panelden gelmez; ayri sayilir (bekleyen talep).
                const rozet = item.badgeKey === 'sifreTalepleri' ? sifreTalepleri : count;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                    title={item.label}
                  >
                    <Icon size={16} style={{ flexShrink: 0 }} />
                    <span>{item.label}</span>
                    {rozet > 0 ? (
                      <span className={`badge-count ${item.alert || item.badgeKey ? 'alert' : ''}`}>
                        {rozet > 99 ? '99+' : rozet}
                      </span>
                    ) : null}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="conn-status" title={`Sunucu: ${serverUrl}`} style={{ width: '100%' }}>
            {online ? <Wifi size={12} /> : <WifiOff size={12} />}
            <span className="truncate" style={{ flex: 1 }}>
              {serverUrl.replace(/^https?:\/\//, '')}
            </span>
            <span className={`conn-dot ${online ? '' : 'offline'}`} />
          </div>
        </div>
      </aside>

      <header className="header">
        {/* ⛔ 2 Ekim 2026 — başlık üst çubuktan kaldırıldı: sayfa adı üç kere
            yazılıyordu (sol menü + üst çubuk + sayfa içi başlık) ve başlık
            üstüne yapışık duruyordu.
            ⛔ Ayarlar > Görünüm > "Üst çubukta sayfa adı" ile geri
            açılabilir — kullanıcı beğenmezse tek tıkla eski hâline döner. */}
        {ustCubukBaslik ? <div className="header-title">{title}</div> : null}

        <div className="header-spacer" />

        <div style={{ position: 'relative' }}>
          <div className="user-chip" onClick={() => setMenuOpen((v) => !v)}>
            <div className="avatar">{initials(user?.full_name)}</div>
            <div className="user-chip-text">
              <div className="user-chip-name">{user?.full_name}</div>
              <div className="user-chip-role">{isAdmin ? 'Yönetici' : 'Kullanıcı'}</div>
            </div>
            <ChevronDown size={13} style={{ color: 'var(--text-dim)' }} />
          </div>

          {menuOpen ? (
            <>
              <div
                style={{ position: 'fixed', inset: 0, zIndex: 40 }}
                onClick={() => setMenuOpen(false)}
              />
              <div
                style={{
                  position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 50,
                  background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)',
                  borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-lg)', minWidth: 208, padding: 5,
                }}
              >
                <div
                  style={{
                    padding: '9px 11px', borderBottom: '1px solid var(--border-subtle)', marginBottom: 4,
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{user?.full_name}</div>
                  <div className="text-dim text-sm">{user?.username}</div>
                  {user?.email ? <div className="text-dim text-sm">{user.email}</div> : null}
                </div>
                <button
                  className="btn btn-ghost btn-sm btn-block"
                  style={{ justifyContent: 'flex-start' }}
                  onClick={() => {
                    setMenuOpen(false);
                    setPwOpen(true);
                  }}
                >
                  <KeyRound size={14} />
                  Şifre değiştir
                </button>
                <button
                  className="btn btn-ghost btn-sm btn-block"
                  style={{ justifyContent: 'flex-start' }}
                  onClick={() => {
                    setMenuOpen(false);
                    navigate('/ayarlar');
                  }}
                >
                  <UserIcon size={14} />
                  Ayarlar
                </button>
                <button
                  className="btn btn-ghost btn-sm btn-block"
                  style={{ justifyContent: 'flex-start', color: '#f87171' }}
                  onClick={() => {
                    setMenuOpen(false);
                    logout();
                  }}
                >
                  <LogOut size={14} />
                  Çıkış yap
                </button>
              </div>
            </>
          ) : null}
        </div>

        {bridge ? (
          <div className="win-controls">
            <button className="win-btn" onClick={() => bridge.window.minimize()} title="Küçült">
              <Minus size={14} />
            </button>
            <button
              className="win-btn"
              onClick={async () => setMaximized(await bridge.window.maximize())}
              title={maximized ? 'Geri al' : 'Büyüt'}
            >
              <Square size={12} />
            </button>
            <button className="win-btn close" onClick={() => bridge.window.close()} title="Kapat">
              <X size={15} />
            </button>
          </div>
        ) : null}
      </header>

      <main className="main">
        {/* ⛔ 2 Ekim 2026 — iç boşluk BURAYA taşındı.
            Sorun: `.page` sarmalayıcısını yalnızca 5 sayfa kullanıyordu
            (Dashboard, Settings, CompanyProfile, ActivityLog + 1). Geri kalan
            23 sayfa (Görevler, İş Emirleri, Müşteriler...) iç boşluğu hiç
            almıyordu -> başlık sol kenara YAPIŞIK duruyordu.
            Boşluğu sayfaya değil ÇERÇEVEYE koyunca her sayfa kendiliğinden
            aynı nefes payını alır; sarmalayıcı eklemek gerekmez. */}
        <div className="main-inner">
          <Outlet />
        </div>
      </main>

      <ChangePasswordModal open={pwOpen} onClose={() => setPwOpen(false)} onDone={() => logout()} toast={toast} />
    </div>
  );
}

function ChangePasswordModal({ open, onClose, onDone, toast }) {
  const fields = useMemo(
    () => [
      { name: 'currentPassword', label: 'Mevcut şifre', type: 'password', required: true, span: 2 },
      { name: 'newPassword', label: 'Yeni şifre', type: 'password', required: true, span: 2, hint: 'En az 6 karakter' },
      { name: 'repeatPassword', label: 'Yeni şifre (tekrar)', type: 'password', required: true, span: 2 },
    ],
    []
  );

  const [busy, setBusy] = useState(false);
  const form = useFormState(fields, {}, (v) => {
    if (v.newPassword !== v.repeatPassword) {
      return { ...v, repeatPassword: null };
    }
    return v;
  });

  const submit = async () => {
    const values = form.submit();
    if (!values) return;
    if (values.newPassword !== values.repeatPassword) {
      form.setErrors({ repeatPassword: 'Şifreler aynı değil' });
      return;
    }
    setBusy(true);
    try {
      await api.post('/auth/change-password', {
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      toast.success('Şifreniz güncellendi', 'Yeni şifrenizle tekrar giriş yapın.');
      form.reset({});
      onClose();
      onDone();
    } catch (err) {
      toast.fromError(err, 'Şifre değiştirilemedi');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Şifre değiştir"
      size="sm"
      footer={
        <>
          <div className="spacer" />
          <button className="btn" onClick={onClose} disabled={busy}>
            Vazgeç
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>
            {busy ? 'Kaydediliyor...' : 'Değiştir'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        {fields.map((f) => (
          <FormField
            key={f.name}
            field={f}
            value={form.values[f.name]}
            error={form.errors[f.name]}
            onChange={(v) => form.setValue(f.name, v)}
            disabled={busy}
          />
        ))}
      </div>
    </Modal>
  );
}
