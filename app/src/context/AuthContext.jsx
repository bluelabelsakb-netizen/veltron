import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, configure, getServerUrl, setToken } from '../lib/api.js';
import { useToast } from '../components/Toast.jsx';

const AuthContext = createContext(null);

const TOKEN_KEY = 'veltron.token';
const SERVER_KEY = 'veltron.serverUrl';

/** Electron disinda (tarayicida) acilirsa calisir; masaustunde null doner. */
const bridge = typeof window !== 'undefined' ? window.veltron : null;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [serverUrl, setServerUrl] = useState(getServerUrl());
  const [status, setStatus] = useState('loading'); // loading | ready | no-server | server-offline
  const [retryKey, setRetryKey] = useState(0);
  const toast = useToast();

  /** Oturum düstüğünde uygulamayi giris ekranina al. */
  const handleAuthLost = useCallback(() => {
    setToken(null);
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
    toast.error('Oturum sonlandı', 'Lütfen tekrar giriş yapın.');
  }, [toast]);

  // --- Uygulama acilisi: sunucu adresini ve varsa jetonu yukle -----------
  useEffect(() => {
    let cancelled = false;

    (async () => {
      let url = localStorage.getItem(SERVER_KEY);
      if (bridge) {
        const cfg = await bridge.config.get().catch(() => null);
        if (cfg?.serverUrl) url = cfg.serverUrl;
      }

      // varsayilan cozumleme sirasi:
      //   1) kayitli adres (Electron ayari / localStorage)
      //   2) HTTP(S) ile acildiysa -> SAYFANIN KENDI ADRESI
      //   3) Electron file:// ise -> localhost:4000
      //
      // ADIM 2 ONEMLI: Demo bir tUnnel veya VPS adresinden acilir
      // (https://xxx.trycloudflare.com). Eski kod hep localhost:4000'e
      // baglanmaya calisiyordu; tarayici kendi localhost'unu gosterdigi
      // icin "Sunucuya ulasilamiyor" diyordu. Demo adresinden giren
      // KIMSE giremiyordu. (Bu hata yapildi, duzeltildi.)
      if (!url) {
        const sayfaAdresi = globalThis.location?.origin;
        const httpMi = /^https?:$/.test(globalThis.location?.protocol || '');
        url = httpMi && sayfaAdresi ? sayfaAdresi : 'http://localhost:4000';
      }

      configure({ url, onAuthLost: handleAuthLost });
      if (!cancelled) setServerUrl(getServerUrl());

      // Once sunucu ayakta mi?
      try {
        const health = await api.get('/health', undefined);
        if (!health?.status) throw new Error('gecersiz yanit');
      } catch {
        if (!cancelled) setStatus(url === 'http://localhost:4000' ? 'no-server' : 'server-offline');
        return;
      }

      const stored = localStorage.getItem(TOKEN_KEY);
      if (stored) {
        setToken(stored);
        try {
          const me = await api.get('/auth/me');
          if (!cancelled) {
            setUser(me.data);
            setStatus('ready');
            return;
          }
        } catch {
          setToken(null);
          localStorage.removeItem(TOKEN_KEY);
        }
      }
      if (!cancelled) setStatus('ready');
    })();

    return () => {
      cancelled = true;
    };
  }, [handleAuthLost, retryKey]);

  // --- eylemler ---------------------------------------------------------
  const login = useCallback(
    async (username, password) => {
      const res = await api.post('/auth/login', { username: username.trim(), password });
      setToken(res.token);
      localStorage.setItem(TOKEN_KEY, res.token);
      setUser(res.user);
      return res.user;
    },
    []
  );

  const logout = useCallback(() => {
    setToken(null);
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
  }, []);

  /** Sunucu adresini degistirir ve yeni adrese baglanmayi dener. */
  const connectTo = useCallback(
    async (url) => {
      const clean = url.trim().replace(/\/+$/, '');

      let result;
      if (bridge) {
        result = await bridge.config.setServer(clean);
        if (!result?.ok) throw new Error(result?.error || 'Sunucuya ulasilamadi');
      }

      configure({ url: clean, onAuthLost: handleAuthLost });
      localStorage.setItem(SERVER_KEY, getServerUrl());
      setServerUrl(getServerUrl());

      // Yeni sunucuda ayni hesapla giris yapilmis olabilir.
      const stored = localStorage.getItem(TOKEN_KEY);
      if (stored) {
        setToken(stored);
        try {
          const me = await api.get('/auth/me');
          setUser(me.data);
          setStatus('ready');
          return;
        } catch {
          setToken(null);
          localStorage.removeItem(TOKEN_KEY);
        }
      }
      setUser(null);
      setStatus('ready');
    },
    [handleAuthLost]
  );

  const value = useMemo(
    () => ({
      user,
      serverUrl: getServerUrl(),
      status,
      isAdmin: user?.role === 'admin',
      /** Musteri rolde mi? (musteri portali acilir, ic moduller gosterilmez) */
      isCustomer: user?.role === 'customer_progress' || user?.role === 'customer_finance',
      /** Musteri rolu: 'progress' = is takip, 'finance' = mali */
      portal: user?.role === 'customer_progress' ? 'progress' : user?.role === 'customer_finance' ? 'finance' : null,
      login,
      logout,
      connectTo,
      /** Sunucu yeniden acildiginda "Tekrar dene" ile baglanmak icin. */
      retry: () => setRetryKey((k) => k + 1),
      /** Guncel kullaniciyi tazeler (profil/rol degisikligi sonrasi). */
      refreshUser: async () => {
        try {
          const me = await api.get('/auth/me');
          setUser(me.data);
          return me.data;
        } catch {
          return null;
        }
      },
    }),
    [user, serverUrl, status, login, logout, connectTo]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth, AuthProvider icinde kullanilmalidir');
  return ctx;
}
