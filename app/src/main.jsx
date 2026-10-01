import React from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { LookupsProvider } from './context/LookupsContext.jsx';
import { CompanyProvider } from './context/CompanyContext.jsx';
import { LicenseProvider } from './context/LicenseContext.jsx';
import { CurrencyProvider } from './context/CurrencyContext.jsx';
import { ToastProvider } from './components/Toast.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {/* EN DIS SARICI: her ekran — musteri portali dahil — hata sinirinda.
        Buraya sarilmazsa bir ekranda hata olunca tum uygulama BOS kalir. */}
    <ErrorBoundary>
      <ToastProvider>
        {/* HashRouter: Electron dosya protokolunde de calisir (kayitli rota gerekmez). */}
        <HashRouter>
          <AuthProvider>
            {/* Demo seridi en ustte gorunsun diye en dista sarildi. */}
            <LicenseProvider>
              <CompanyProvider>
                <CurrencyProvider>
                  <LookupsProvider>
                    <App />
                  </LookupsProvider>
                </CurrencyProvider>
              </CompanyProvider>
            </LicenseProvider>
          </AuthProvider>
        </HashRouter>
      </ToastProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
