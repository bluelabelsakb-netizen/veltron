import { Suspense, lazy, useState, useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import { useCompany } from './context/CompanyContext.jsx';
import { Layout } from './components/Layout.jsx';
import UpdateBanner, { useUpdateCheck } from './components/UpdateBanner.jsx';
import { Login } from './pages/Login.jsx';
import MustChangePassword from './pages/MustChangePassword.jsx';
import { Loading } from './components/Primitives.jsx';
// Hata siniri `main.jsx` icinde en dista sarili (tum ekranlar icin).

// Agir sayfalar (grafik icerenler) ayrica yuklenir.
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const Customers = lazy(() => import('./pages/Customers.jsx'));
const Employees = lazy(() => import('./pages/Employees.jsx'));
const Projects = lazy(() => import('./pages/Projects.jsx'));
const Tasks = lazy(() => import('./pages/Tasks.jsx'));
const WorkOrders = lazy(() => import('./pages/WorkOrders.jsx'));
const Subcontractors = lazy(() => import('./pages/Subcontractors.jsx'));
const Payroll = lazy(() => import('./pages/Payroll.jsx'));
const Scores = lazy(() => import('./pages/Scores.jsx'));
const ExportExcel = lazy(() => import('./pages/ExportExcel.jsx'));
const Profit = lazy(() => import('./pages/Profit.jsx'));
const Quotes = lazy(() => import('./pages/Quotes.jsx'));
const Invoices = lazy(() => import('./pages/Invoices.jsx'));
const Products = lazy(() => import('./pages/Products.jsx'));
const StockMovements = lazy(() => import('./pages/StockMovements.jsx'));
const Users = lazy(() => import('./pages/Users.jsx'));
const ActivityLog = lazy(() => import('./pages/ActivityLog.jsx'));
const Settings = lazy(() => import('./pages/Settings.jsx'));
const CompanyProfile = lazy(() => import('./pages/CompanyProfile.jsx'));
const FirstRunWizard = lazy(() => import('./pages/FirstRunWizard.jsx'));
const InvoiceImport = lazy(() => import('./pages/InvoiceImport.jsx'));
const Support = lazy(() => import('./pages/Support.jsx'));
const EmployeeImport = lazy(() => import('./pages/EmployeeImport.jsx'));
const CustomerImport = lazy(() => import('./pages/CustomerImport.jsx'));
const ProductImport = lazy(() => import('./pages/ProductImport.jsx'));
const ExchangeRates = lazy(() => import('./pages/ExchangeRates.jsx'));
const PasswordRequests = lazy(() => import('./pages/PasswordRequests.jsx'));
const Taxes = lazy(() => import('./pages/Taxes.jsx'));

// Musteri portali (personel arayuzunden tamamen ayri)
const PortalLayout = lazy(() => import('./pages/portal/PortalLayout.jsx'));
const PortalJobs = lazy(() => import('./pages/portal/PortalJobs.jsx'));
const PortalDateRequests = lazy(() => import('./pages/portal/PortalDateRequests.jsx'));
const PortalInvoices = lazy(() => import('./pages/portal/PortalInvoices.jsx'));

/** Musteri rolu: yalnizca portal ekranlarina erisir. */
function CustomerPortal() {
  const { portal } = useAuth();
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/portal" element={<PortalLayout />}>
          {portal === 'finance' ? (
            <Route index element={<PortalInvoices />} />
          ) : (
            <>
              <Route index element={<PortalJobs />} />
              <Route path="talepler" element={<PortalDateRequests />} />
            </>
          )}
          <Route path="*" element={<Navigate to="/portal" replace />} />
        </Route>
        <Route path="*" element={<Navigate to="/portal" replace />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  const { user, status, isAdmin, isCustomer } = useAuth();
  const { company, loading: companyLoading, reload: reloadCompany, firstRunDone } = useCompany();
  const [sihirbazBasladi, setSihirbazBasladi] = useState(false);
  const [sihirbazKapandi, setSihirbazKapandi] = useState(false);

  // Güncelleme kontrolü — yalnızca giriş yapılmış, şirket içi kullanıcılarda.
  // Müşteri portalinde ve giriş ekranında gösterilmez.
  const guncelleme = useUpdateCheck(!!user && !isCustomer && status === 'ready');

  // Ilk kurulum: firma profili bos ise sihirbaz acilir.
  const profilBos = !!user && !isCustomer && !companyLoading && !firstRunDone?.();

  // ONEMLI: Sihirbaz bir kez acildiysa KAPANMAZ. Aksi halde 1. adimda
  // (firma bilgisi) profil dolunca firstRunDone() true olur, sihirbaz
  // kendini kapatir ve kullanici logo + sifre adimlarini hic goremez.
  useEffect(() => {
    if (profilBos) setSihirbazBasladi(true);
  }, [profilBos]);

  const sihirbazAcik = profilBos || (sihirbazBasladi && !sihirbazKapandi);

  if (status === 'loading') {
    return (
      <div className="auth-screen">
        <div className="stack" style={{ alignItems: 'center' }}>
          <div className="spinner lg" />
          <div className="text-dim text-sm">Veltron başlatılıyor...</div>
        </div>
      </div>
    );
  }

  if (status === 'no-server' || status === 'server-offline') {
    return <Login serverDown />;
  }

  if (!user) return <Login />;

  // Musteri rolu -> tamamen farkli arayuz (personel modullerine erisemez).
  if (isCustomer) return <CustomerPortal />;

  // Geçici şifre ile giriş yapıldı -> şifre değiştirmeden sisteme giremez.
  // BAYRAK SUNUCUDA `users.must_change_password` SÜTUNUNDA durur; oturum
  // kapansa bile buraya tekrar düşer. Sifre sıfırlama akışının son adımı.
  if (user?.must_change_password) {
    return <MustChangePassword />;
  }

  // NOT: Hata siniri artik burada degil, `main.jsx` icinde EN DISARIDA.
  // Burada sarmalayinca musteri portalinda olusan hata yakalanmiyor ve
  // ekran bos kaliyordu.
  return (
    <>
      {sihirbazAcik ? (
        <FirstRunWizard
          company={company}
          reload={reloadCompany}
          onDone={() => setSihirbazKapandi(true)}
        />
      ) : null}
      <Suspense fallback={<Loading />}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />

          <Route path="/is-emirleri" element={<WorkOrders />} />
          <Route path="/taseronlar" element={<Subcontractors />} />
          <Route path="/maas" element={<Payroll />} />
          <Route path="/puanlama" element={<Scores />} />
          <Route path="/excel" element={<ExportExcel />} />
          <Route path="/gorevler" element={<Tasks />} />
          <Route path="/projeler" element={<Projects />} />
          <Route path="/musteriler" element={<Customers />} />
          <Route path="/teklifler" element={<Quotes />} />
          <Route path="/faturalar" element={<Invoices />} />
          <Route path="/fatura-aktar" element={<InvoiceImport />} />
          <Route path="/calisan-aktar" element={<EmployeeImport />} />
          <Route path="/musteri-aktar" element={<CustomerImport />} />
          <Route path="/urun-aktar" element={<ProductImport />} />
          <Route path="/kar" element={<Profit />} />
          <Route path="/calisanlar" element={<Employees />} />
          <Route path="/urunler" element={<Products />} />
          <Route path="/stok-hareketleri" element={<StockMovements />} />

          <Route
            path="/kullanicilar"
            element={isAdmin ? <Users /> : <Navigate to="/" replace />}
          />
          <Route path="/aktivite" element={<ActivityLog />} />
          <Route path="/firma" element={<CompanyProfile />} />
          <Route path="/ayarlar" element={<Settings />} />
          <Route path="/destek" element={<Support />} />
          <Route path="/doviz" element={<ExchangeRates />} />
          <Route path="/sifre-talepleri" element={<PasswordRequests />} />
          <Route path="/vergiler" element={<Taxes />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      </Suspense>

      {/* Güncelleme bildirimi (2 Ekim 2026) — açılıştan hemen sonra sorar.
          Kullanıcı "Eski sürümden devam et" derse hiçbir şey olmaz. */}
      <UpdateBanner
        visible={guncelleme.visible}
        veri={guncelleme.veri}
        indiriliyor={guncelleme.indiriliyor}
        indir={guncelleme.indir}
        onKapat={guncelleme.kapat}
      />
    </>
  );
}
