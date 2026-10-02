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
    // ⛔ AÇILIŞTA 401 BEKLENEN BİR DURUMDUR (2 Ekim 2026).
    //    CurrencyProvider, CompanyProvider ve LookupsProvider korumalı uçları
    //    KULLANICI GİRİŞ YAPILMADAN çağırır. Bunlar 401 alınca api.js
    //    `onUnauthorized`'ı tetikler ve buraya düşerdi — sonuç: kullanıcı
    //    giriş yapmışken bile her açılışta "Oturum sonlandı / tekrar giriş yapın"
    //    uyarısı çıkıyordu.
    //
    //    `status === 'loading'` iken oturum henüz BELİRLENMEMİŞTİR. 401
    //    sadece "jeton yok" demektir, oturum düştü demek değildir.
    //    Gerçek durumu açılışın kendi adımı (`/auth/me`) belirler.
    if (status === 'loading') return;

    setToken(null);
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
    toast.error('Oturum sonlandı', 'Lütfen tekrar giriş yapın.');
  }, [toast, status]);

  /**
   * "BENİ HATIRLA" — otomatik giriş
   * ===============================
   * Program acildiginda cihazda saklanan HATIRLEMA JETONU sunucuya sorulur.
   * Gecerliyse 12 saatlik normal jeton doner, kullanici sifre yazmaz.
   *
   * ONEMLI: SIFRE SAKLANMAZ. Sadece jeton tutulur (bkz. electron/main.mjs).
   * Jeton gecersizse SUNUCUDA da iptal edilir (iptal edilmis cihazlar
   * bir daha otomatik giremez) ve giris ekrani sessizce acilir.
   */
  const autoLogin = useCallback(async () => {
    if (!bridge?.remember) return false; // tarayicida calisiyorsa olmaz
    try {
      const kayit = await bridge.remember.get();
      if (!kayit?.token) return false;

      const device = (await bridge.remember.device().catch(() => '')) || '';
      const res = await api.post('/auth/remember', { token: kayit.token, device });

      setToken(res.token);
      localStorage.setItem(TOKEN_KEY, res.token);
      setUser(res.user);
      return true;
    } catch {
      // Jeton gecersiz/suresi dolmus -> cihazda da temizle
      bridge.remember?.clear?.();
      return false;
    }
  }, []);

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

      // Oturum yok -> "Beni hatirla" ile otomatik giris dene.
      if (!cancelled) {
        const girildi = await autoLogin();
        if (!cancelled) setStatus('ready');
        if (!girildi) return;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [handleAuthLost, retryKey, autoLogin]);

  // --- eylemler ---------------------------------------------------------
  const login = useCallback(
    async (username, password, remember = false) => {
      const device = remember && bridge?.remember
        ? (await bridge.remember.device().catch(() => '')) || ''
        : '';

      const res = await api.post('/auth/login', {
        username: username.trim(),
        password,
        remember: !!remember,
        ...(device ? { device } : {}),
      });

      setToken(res.token);
      localStorage.setItem(TOKEN_KEY, res.token);
      setUser(res.user);

      // Hatirlama jetonunu cihazda sakla (SIFRE DEGIL, sadece jeton)
      if (bridge?.remember) {
        if (remember && res.remember_token) {
          await bridge.remember.set({
            token: res.remember_token,
            username: res.user?.username || username.trim(),
            device,
            expiresAt: res.remember_expires_at || null,
          });
        } else {
          // Kutuyu isaretlemeden giris = bu cihaz hatirlanmaz
          await bridge.remember.clear();
        }
      }

      return res.user;
    },
    []
  );

  /**
   * ÇIKIŞ YAP
   * ---------
   * Oturum jetonu SİLİNİR ve "beni hatırla" da SİLİNİR.
   *
   * Neden hatırlama da siliniyor: paylasilan bilgisayarda "Çıkış yap" deyip
   * cihazı başkasına devretmek isteyen kullanici, program yeniden acildiginda
   * OTOMATIK GIRMESI beklenmez. Güvenli varsayilan budur.
   *
   * Sadece cihazi unutmak (oturumu düşürmeden) icin: `forgetDevice()`.
   */
  const logout = useCallback(() => {
    setToken(null);
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
    bridge?.remember?.clear?.();
  }, []);

  /** "Bu cihazı unut" — hatırlama jetonunu hem yerel hem sunucuda iptal eder. */
  const forgetDevice = useCallback(async () => {
    if (!bridge?.remember) return;
    try {
      const kayit = await bridge.remember.get();
      if (kayit?.token) {
        // Sunucuda da iptal: bu cihaz jetonu bir daha kullanilamaz
        await api.post('/auth/remember/revoke', { token: kayit.token }).catch(() => {});
      }
    } finally {
      await bridge.remember.clear();
    }
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
      /** "Bu cihazı unut" — hatırlama jetonunu iptal eder (Ayarlar). */
      forgetDevice,
      /** Bu cihazda hatırlama var mı? (Ayarlar ekranı için) */
      rememberDevice: bridge?.remember ? bridge.remember.get() : Promise.resolve(null),
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
