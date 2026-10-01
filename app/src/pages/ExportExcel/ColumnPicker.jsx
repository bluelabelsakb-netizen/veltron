/**
 * SÜTUN SEÇİCİ
 * ============
 * Excel çıktısında hangi sütunların geleceğini seçer.
 * Seçim tarayıcıda (localStorage) saklanır; kapsam başına ayrı tercih tutulur.
 *
 * KURAL: net ağırlık (kg) ve ton sütunları KİLİTLİDİR — tartım kuralı
 * Excel'de de bozulmamalıdır. Kullanıcı bunları gizleyemez.
 */
import { useEffect, useMemo, useState } from 'react';
import { Columns3, Lock, RotateCcw, Check, Eye, EyeOff, Search } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useToast } from '../../components/Toast.jsx';
import { Modal } from '../../components/Modal.jsx';

const STORE_KEY = 'veltron.exportCols';

/** Kayıtlı tercihleri okur. */
export function loadColumnPrefs() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
  } catch {
    return {};
  }
}

/** Tercihleri saklar. */
export function saveColumnPrefs(prefs) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(prefs));
  } catch {
    /* depolama kapalı olabilir, sessizce geç */
  }
}

export function ColumnPicker({ scope, period, onClose, onApply }) {
  const toast = useToast();
  const [sheets, setSheets] = useState(null);
  const [selected, setSelected] = useState({}); // { 'SayfaAdi': Set(keys) }
  const [search, setSearch] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await api.get('/export/excel/columns', { scope, period: period || '' });
        if (!alive) return;
        setSheets(res.data);

        // Kayitli tercihi uygula; yoksa hepsi secili.
        const prefs = loadColumnPrefs()[scope];
        const init = {};
        for (const s of res.data) {
          const saved = prefs?.[s.name];
          const valid = s.columns.map((c) => c.key);
          if (Array.isArray(saved)) {
            init[s.name] = new Set(saved.filter((k) => valid.includes(k)));
          } else {
            init[s.name] = new Set(valid);
          }
        }
        setSelected(init);
      } catch (err) {
        toast.fromError(err, 'Sütun listesi alınamadı');
      }
    })();
    return () => {
      alive = false;
    };
  }, [scope, period, toast]);

  const toggle = (sheet, key) => (e) => {
    setSelected((prev) => {
      const next = new Set(prev[sheet] ?? []);
      if (e.target.checked) next.add(key);
      else next.delete(key);
      return { ...prev, [sheet]: next };
    });
  };

  const allKeys = useMemo(
    () => (sheets ?? []).flatMap((s) => s.columns.map((c) => c.key)),
    [sheets]
  );
  const chosen = useMemo(
    () => Object.values(selected).reduce((n, set) => n + set.size, 0),
    [selected]
  );

  const setAll = (sheet, on) => {
    setSelected((prev) => {
      const keys = sheets.find((s) => s.name === sheet).columns.map((c) => c.key);
      // Kilitli sutunlar her zaman acik kalir.
      const locked = sheets.find((s) => s.name === sheet).columns.filter((c) => c.locked).map((c) => c.key);
      const next = on ? new Set([...keys, ...locked]) : new Set(locked);
      return { ...prev, [sheet]: next };
    });
  };

  const reset = () => {
    const init = {};
    for (const s of sheets) init[s.name] = new Set(s.columns.map((c) => c.key));
    setSelected(init);
    toast.success('Tüm sütunlar geri açıldı');
  };

  const apply = () => {
    if (!chosen) {
      toast.error('En az bir sütun seçin', 'Boş dosya oluşamaz.');
      return;
    }
    const prefs = loadColumnPrefs();
    prefs[scope] = Object.fromEntries(
      Object.entries(selected).map(([k, v]) => [k, [...v]])
    );
    saveColumnPrefs(prefs);
    onApply();
  };

  if (!sheets) {
    return (
      <Modal open onClose={onClose} title="Sütunları seç" size="lg">
        <div className="spinner lg" />
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Excel sütunlarını seç"
      subtitle={`${chosen} / ${allKeys.length} sütun seçili`}
      size="lg"
      footer={
        <>
          <button className="btn" onClick={reset} disabled={chosen === allKeys.length}>
            <RotateCcw size={13} />
            Sıfırla
          </button>
          <div className="spacer" />
          <button className="btn" onClick={onClose}>
            Vazgeç
          </button>
          <button className="btn btn-primary" onClick={apply}>
            <Check size={14} />
            Kaydet ve indir
          </button>
        </>
      }
    >
      <div className="alert info mb-14">
        <Lock size={15} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          <strong>Net ağırlık (kg)</strong> ve <strong>Net (ton)</strong> sütunları kilitlidir.
          Projenin tartım kuralı Excel'de de bozulmamalıdır: net her zaman kg'dır.
        </span>
      </div>

      <div className="field mb-14">
        <div className="row" style={{ gap: 8 }}>
          <Search size={14} className="text-dim" />
          <input
            className="input"
            placeholder="Sütun ara..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {sheets.map((s) => {
        const cols = search
          ? s.columns.filter((c) => c.title.toLocaleLowerCase('tr').includes(search.toLocaleLowerCase('tr')))
          : s.columns;
        if (!cols.length) return null;
        const cur = selected[s.name] ?? new Set();
        const selectable = s.columns.filter((c) => !c.locked).length;

        return (
          <div className="card mb-14" key={s.name}>
            <div className="card-head">
              <Columns3 size={14} style={{ color: 'var(--primary)' }} />
              <h3>{s.name}</h3>
              <span className="text-dim text-sm">
                {cur.size} / {s.columns.length}
              </span>
              <div className="spacer" />
              <button className="btn btn-sm" onClick={() => setAll(s.name, true)}>
                <Eye size={12} />
                Tümü
              </button>
              <button className="btn btn-sm" onClick={() => setAll(s.name, false)}>
                <EyeOff size={12} />
                Sadece zorunlu
              </button>
            </div>
            <div className="card-body">
              <div className="row row-wrap" style={{ gap: 7 }}>
                {cols.map((c) => {
                  const on = cur.has(c.key);
                  return (
                    <label
                      key={c.key}
                      className={`chip-select ${on ? 'on' : ''} ${c.locked ? 'locked' : ''}`}
                      title={c.locked ? c.lockedReason : c.title}
                    >
                      <input type="checkbox" checked={on} disabled={c.locked} onChange={toggle(s.name, c.key)} />
                      {c.locked ? <Lock size={10} /> : null}
                      {c.title}
                    </label>
                  );
                })}
              </div>
              {selectable === 0 ? (
                <div className="text-dim text-sm mt-6">Bu sayfanın tüm sütunları zorunludur.</div>
              ) : null}
            </div>
          </div>
        );
      })}
    </Modal>
  );
}
