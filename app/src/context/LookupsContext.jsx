import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from './AuthContext.jsx';

const LookupsContext = createContext(null);

/**
 * Form acilir kutulari icin referans verileri (musteri, calisan, proje, urun).
 * Tek istekte alinir; sayfa gecislerinde yeniden kullanilir.
 */
export function LookupsProvider({ children }) {
  const { user } = useAuth();
  const [data, setData] = useState({ customers: [], employees: [], projects: [], products: [], users: [] });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/lookups');
      setData(res.data);
    } catch {
      setData({ customers: [], employees: [], projects: [], products: [], users: [] });
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

  const value = useMemo(() => {
    const customerName = (id) => {
      const c = data.customers.find((x) => x.id === Number(id));
      return c ? c.company || c.contact || `#${c.id}` : null;
    };
    const employeeName = (id) => data.employees.find((x) => x.id === Number(id))?.full_name ?? null;
    const projectName = (id) => {
      const p = data.projects.find((x) => x.id === Number(id));
      return p ? p.name : null;
    };
    const productName = (id) => data.products.find((x) => x.id === Number(id))?.name ?? null;

    return {
      ...data,
      loading,
      reload: load,
      // Form secenekleri
      customerOptions: data.customers.map((c) => ({
        value: c.id,
        label: c.company || c.contact || `#${c.id}`,
        hint: [c.city, c.contact].filter(Boolean).join(' - '),
      })),
      employeeOptions: data.employees.map((e) => ({
        value: e.id,
        label: e.full_name,
        hint: e.position,
      })),
      projectOptions: data.projects.map((p) => ({
        value: p.id,
        label: p.name,
        hint: p.code,
      })),
      productOptions: data.products.map((p) => ({
        value: p.id,
        label: p.name,
        hint: `${p.stock} ${p.unit} @ ${p.unit_price}`,
        unit: p.unit,
        unit_price: p.unit_price,
        sku: p.sku,
      })),
      // Satir uzerinde okuma
      customerName,
      employeeName,
      projectName,
      productName,
    };
  }, [data, loading, load]);

  return <LookupsContext.Provider value={value}>{children}</LookupsContext.Provider>;
}

export function useLookups() {
  const ctx = useContext(LookupsContext);
  if (!ctx) throw new Error('useLookups, LookupsProvider icinde kullanilmalidir');
  return ctx;
}
