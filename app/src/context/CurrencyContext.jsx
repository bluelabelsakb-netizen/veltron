/**
 * PARA BİRİMİ HOOK
 * =================
 * Para birimlerini ve güncel kurları sunucudan çeker; formlarda
 * seçim yapmayı ve kur uyarısı göstermeyi sağlar.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';

const CurrencyContext = createContext(null);

export function CurrencyProvider({ children }) {
  const [liste, setListe] = useState([]);
  const [kurlar, setKurlar] = useState({});
  const [ana, setAna] = useState('TRY');
  const [hazir, setHazir] = useState(false);

  const yukle = useCallback(async () => {
    try {
      const [b, r] = await Promise.all([
        api.get('/currency/currencies'),
        api.get('/currency/rates', { days: 45 }),
      ]);
      setListe(b.data || []);
      setAna(b.base || 'TRY');
      const harita = {};
      for (const k of r?.data?.bugun || []) harita[k.code] = k.rate;
      setKurlar(harita);
    } catch {
      /* sunucu kapali olabilir; form yine de calisir */
    } finally {
      setHazir(true);
    }
  }, []);

  useEffect(() => {
    yukle();
  }, [yukle]);

  const deger = useMemo(() => {
    const options = liste.map((c) => ({
      value: c.code,
      label: `${c.code} — ${c.name}`,
    }));
    return {
      options,
      liste,
      ana,
      kurlar,
      hazir,
      yenile: yukle,
      /** Kur yoksa uyarı metni döner. */
      uyari: (kod, tarih) => {
        if (!kod || kod === 'TRY') return null;
        if (kurlar[kod] > 0) return null;
        return `${kod} için kur girilmemiş. Ayarlar → Döviz Kurları ekranından girin.`;
      },
      /** 1 birim = kaç TL (kur yoksa 0). */
      kur: (kod) => (kod === 'TRY' ? 1 : kurlar[kod] || 0),
    };
  }, [liste, kurlar, ana, hazir, yukle]);

  return <CurrencyContext.Provider value={deger}>{children}</CurrencyContext.Provider>;
}

export function useCurrency() {
  return (
    useContext(CurrencyContext) || {
      options: [{ value: 'TRY', label: 'TRY — Türk Lirası' }],
      liste: [],
      ana: 'TRY',
      kurlar: {},
      hazir: false,
      yenile: () => {},
      uyari: () => null,
      kur: () => 1,
    }
  );
}
