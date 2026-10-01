import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from './AuthContext.jsx';

const CompanyContext = createContext(null);

/**
 * Firma profili evrak basliginda kullanildigi icin her oturumda bir kez yuklenir.
 * Yonetici degistirdiginde diger ekranlar guncellensin diye "reload" sunulur.
 */
export function CompanyProvider({ children }) {
  const { user } = useAuth();
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/company');
      setCompany(res.data);
    } catch {
      setCompany(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      setLoading(true);
      load();
    }
  }, [user, load]);

  const value = useMemo(
    () => ({
      company,
      loading,
      reload: load,
      /** Evraklarda kullanilan on eki; profil yoksa makul varsayilan. */
      prefix: (kind) => company?.[`${kind}_prefix`] || (kind === 'invoice' ? 'FTR' : kind === 'quote' ? 'TLF' : 'IEM'),
      taxRate: company?.default_tax_rate ?? 20,
      paymentTermDays: company?.payment_term_days ?? 30,
      /**
       * Ilk kurulum yapildi mi?
       * Vergi no veya adres girilmemisse kurulum sayilmaz -> sihirbaz acilir.
       */
      firstRunDone: () => !!company?.tax_number || !!company?.address,
    }),
    [company, loading, load]
  );

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
}

export function useCompany() {
  const ctx = useContext(CompanyContext);
  if (!ctx) throw new Error('useCompany, CompanyProvider icinde kullanilmalidir');
  return ctx;
}
