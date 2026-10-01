import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight, Plus, Search, RotateCcw, X, ArrowDownCircle, ArrowUpCircle,
  Scale, Trash2, Package, AlertTriangle, Wallet,
} from 'lucide-react';
import { api, money, number, dateFmt, statusLabel, statusTone, todayIso } from '../lib/api.js';
import { useLookups } from '../context/LookupsContext.jsx';
import { useToast } from '../components/Toast.jsx';
import { Modal, ConfirmDialog } from '../components/Modal.jsx';
import { FormField, useFormState } from '../components/Form.jsx';
import { PageHeader, Kpi, KpiMoney, EmptyState } from '../components/Primitives.jsx';

const TYPE_OPTIONS = [
  { value: 'in', label: 'Stok girişi' },
  { value: 'out', label: 'Stok çıkışı' },
  { value: 'adjust', label: 'Sayım düzeltme' },
];

export default function StockMovements() {
  const { productOptions, reload } = useLookups();
  const toast = useToast();

  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [adding, setAdding] = useState(false);
  const [counting, setCounting] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, s] = await Promise.all([
        api.get('/stock/movements', {
          search: search || undefined,
          type,
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
          limit: 200,
        }),
        api.get('/stock/summary'),
      ]);
      setRows(m.data);
      setSummary(s.data);
    } catch (err) {
      toast.fromError(err, 'Stok hareketleri yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [search, type, dateFrom, dateTo, toast]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const clearFilters = () => {
    setSearch('');
    setType('all');
    setDateFrom('');
    setDateTo('');
  };
  const filtersActive = search || type !== 'all' || dateFrom || dateTo;

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      const res = await api.del(`/stock/movements/${deleting.id}`);
      toast.success('Hareket silindi', `Güncel stok: ${number(res.data.new_stock)}`);
      setDeleting(null);
      load();
      reload();
    } catch (err) {
      toast.fromError(err, 'Silinemedi');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Stok Hareketleri"
        description="Malzeme giriş, çıkış ve sayım düzeltmelerinin tam izi"
        actions={
          <>
            <button className="btn" onClick={() => setCounting(true)}>
              <Scale size={15} />
              Sayım yap
            </button>
            <button className="btn btn-primary" onClick={() => setAdding(true)}>
              <Plus size={15} />
              Stok Hareketi
            </button>
          </>
        }
      />

      <div className="kpi-grid">
        <Kpi label="Ürün çeşidi" value={number(summary?.product_count)} color="#3b82f6" icon={Package} />
        <KpiMoney
          label="Stok değeri"
          value={summary?.total_value}
          color="#22c55e"
          icon={Wallet}
          small
        />
        <Kpi
          label="Kritik seviye"
          value={number(summary?.critical_count)}
          color="#f59e0b"
          icon={AlertTriangle}
          sub="Min. seviyede veya altında"
          onClick={() => {
            setType('all');
            setSearch('');
            setAdding(false);
          }}
        />
        <Kpi
          label="Tükenen ürün"
          value={number(summary?.out_of_stock_count)}
          color="#ef4444"
          icon={Package}
          small
        />
      </div>

      {summary?.critical?.length ? (
        <div className="card mb-14" style={{ borderColor: 'rgba(245,158,11,0.35)' }}>
          <div className="card-head" style={{ background: 'var(--warning-soft)' }}>
            <AlertTriangle size={15} style={{ color: '#fbbf24' }} />
            <h3>Yeniden sipariş gereken ürünler</h3>
          </div>
          <div className="card-body">
            <div className="row row-wrap" style={{ gap: 7 }}>
              {summary.critical.map((p) => (
                <span
                  key={p.id}
                  className={`badge ${Number(p.stock) <= 0 ? 'danger' : 'warning'}`}
                  title={`Min. seviye: ${p.min_stock} ${p.unit}`}
                >
                  {p.name}: {number(p.stock)} {p.unit}
                </span>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <div className="card mb-14">
        <div className="row row-wrap" style={{ gap: 9 }}>
          <div className="search-box">
            <Search size={14} />
            <input
              className="input"
              placeholder="Ürün, referans veya not ara..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search ? (
              <button
                className="btn btn-ghost btn-icon"
                style={{ position: 'absolute', right: 3, top: 3, width: 26, height: 26 }}
                onClick={() => setSearch('')}
              >
                <X size={13} />
              </button>
            ) : null}
          </div>
          <select className="select filter-select" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="all">Tüm hareketler</option>
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <div className="row" style={{ gap: 5 }}>
            <input type="date" className="input" style={{ width: 146 }} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} title="Başlangıç" />
            <span className="text-dim">–</span>
            <input type="date" className="input" style={{ width: 146 }} value={dateTo} onChange={(e) => setDateTo(e.target.value)} title="Bitiş" />
          </div>
          {filtersActive ? (
            <button className="btn btn-ghost btn-sm" onClick={clearFilters}>
              <RotateCcw size={13} />
              Temizle
            </button>
          ) : null}
        </div>
      </div>

      <div className="card">
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 108 }}>Tarih</th>
                <th style={{ width: 130 }}>Hareket</th>
                <th>Ürün</th>
                <th style={{ width: 100, textAlign: 'right' }}>Miktar</th>
                <th style={{ width: 62, textAlign: 'right' }}>Stok</th>
                <th style={{ width: 110, textAlign: 'right' }}>Tutar</th>
                <th>Referans / Not</th>
                <th style={{ width: 110 }}>Kaydeden</th>
                <th className="col-actions">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 9 }).map((__, j) => (
                      <td key={j}>
                        <div style={{ height: 11, borderRadius: 3, background: 'var(--bg-hover)', opacity: 0.5 }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={9}>
                    <EmptyState
                      icon={ArrowLeftRight}
                      title="Stok hareketi bulunamadı"
                      description={filtersActive ? 'Filtreleri değiştirmeyi deneyin.' : 'Malzeme giriş ve çıkışlarını buradan kaydedin.'}
                      action={
                        <button className="btn btn-primary" onClick={() => setAdding(true)}>
                          <Plus size={15} />
                          Stok Hareketi
                        </button>
                      }
                    />
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const isIn = r.type === 'in';
                  const isAdjust = r.type === 'adjust';
                  const signed = isIn ? r.quantity : isAdjust ? r.quantity : -r.quantity;
                  return (
                    <tr key={r.id} className="row-link" onClick={() => setDetail(r)}>
                      <td className="cell-muted nowrap">{dateFmt(r.movement_date)}</td>
                      <td>
                        <span className={`badge ${statusTone(r.type)}`}>
                          {isIn ? <ArrowDownCircle size={11} /> : isAdjust ? <Scale size={11} /> : <ArrowUpCircle size={11} />}
                          {statusLabel(r.type)}
                        </span>
                      </td>
                      <td>
                        <div className="cell-strong truncate" style={{ maxWidth: 220 }}>
                          {r.product_name}
                        </div>
                        {r.product_sku ? <div className="cell-dim mono">{r.product_sku}</div> : null}
                      </td>
                      <td className="col-num">
                        <span className={`money ${signed > 0 ? 'pos' : 'neg'}`}>
                          {signed > 0 ? '+' : ''}
                          {number(signed)} {r.unit}
                        </span>
                      </td>
                      <td className="col-num cell-muted">{r.stock !== undefined ? number(r.stock) : '-'}</td>
                      <td className="col-num money cell-muted">{money(r.total_value)}</td>
                      <td>
                        <div className="truncate" style={{ maxWidth: 200 }}>
                          {r.reference || <span className="text-dim">-</span>}
                        </div>
                        {r.note ? <div className="cell-dim truncate" style={{ maxWidth: 200 }}>{r.note}</div> : null}
                      </td>
                      <td className="cell-dim truncate">{r.user_name || '—'}</td>
                      <td className="col-actions" onClick={(e) => e.stopPropagation()}>
                        <div className="cell-actions">
                          <button className="btn btn-sm btn-icon" title="Hareketi geri al" onClick={() => setDeleting(r)}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {adding ? (
        <MovementModal
          productOptions={productOptions}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            load();
            reload();
          }}
        />
      ) : null}

      {counting ? (
        <CountModal
          productOptions={productOptions}
          onClose={() => setCounting(false)}
          onSaved={() => {
            setCounting(false);
            load();
            reload();
          }}
        />
      ) : null}

      {detail ? (
        <Modal open onClose={() => setDetail(null)} title="Stok Hareketi" size="sm" footer={
          <>
            <div className="spacer" />
            <button className="btn" onClick={() => setDetail(null)}>Kapat</button>
          </>
        }>
          <div className="stat-row"><span className="label">Ürün</span><span className="value">{detail.product_name}</span></div>
          <div className="stat-row"><span className="label">Stok kodu</span><span className="value mono">{detail.product_sku || '-'}</span></div>
          <div className="stat-row"><span className="label">Hareket</span><span className="value">{statusLabel(detail.type)}</span></div>
          <div className="stat-row"><span className="label">Miktar</span><span className="value money">{number(detail.quantity)} {detail.unit}</span></div>
          <div className="stat-row"><span className="label">Birim fiyat</span><span className="value">{money(detail.unit_price)}</span></div>
          <div className="stat-row"><span className="label">Tutar</span><span className="value money">{money(detail.total_value)}</span></div>
          <div className="stat-row"><span className="label">Tarih</span><span className="value">{dateFmt(detail.movement_date)}</span></div>
          <div className="stat-row"><span className="label">Referans</span><span className="value">{detail.reference || '-'}</span></div>
          <div className="stat-row"><span className="label">Not</span><span className="value">{detail.note || '-'}</span></div>
          <div className="stat-row"><span className="label">Kaydeden</span><span className="value">{detail.user_name || 'Sistem'}</span></div>
        </Modal>
      ) : null}

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        busy={busy}
        title="Stok hareketi geri alınsın mı?"
        message={
          deleting
            ? `${deleting.product_name} için ${number(deleting.quantity)} ${deleting.unit} ${statusLabel(deleting.type).toLowerCase()} hareketi silinecek.\n\nÜrünün güncel stoğu buna göre yeniden hesaplanır. Bu işlem geri alınamaz.`
            : ''
        }
        confirmLabel="Geri al"
      />
    </>
  );
}

function MovementModal({ productOptions, onClose, onSaved }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [type, setType] = useState('out');

  const fields = useMemo(
    () => [
      { name: 'product_id', label: 'Ürün', type: 'select', options: productOptions, required: true, span: 2 },
      { name: 'type', label: 'Hareket tipi', type: 'select', options: TYPE_OPTIONS, required: true, defaultValue: 'out' },
      { name: 'quantity', label: 'Miktar', type: 'number', required: true, min: 0.01, step: '0.01' },
      { name: 'unit_price', label: 'Birim fiyat (₺)', type: 'money', min: 0 },
      { name: 'movement_date', label: 'Tarih', type: 'date', required: true, defaultValue: todayIso() },
      { name: 'reference', label: 'Referans (irsaliye, PO no...)' },
      { name: 'note', label: 'Not', type: 'textarea', span: 2, rows: 2 },
    ],
    [productOptions]
  );

  const form = useFormState(fields, {}, (v) => ({ ...v, quantity: Math.abs(Number(v.quantity) || 0) }));

  const save = async () => {
    const values = form.submit();
    if (!values) return;
    setBusy(true);
    try {
      const res = await api.post('/stock/movements', { ...values, type });
      toast.success(
        'Stok hareketi kaydedildi',
        `Yeni stok: ${number(res.data.new_stock)}`
      );
      onSaved();
    } catch (err) {
      toast.fromError(err, 'Kaydedilemedi');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Yeni stok hareketi"
      size="sm"
      footer={
        <>
          <div className="spacer" />
          <button className="btn" onClick={onClose} disabled={busy}>
            Vazgeç
          </button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        {fields.map((f) =>
          f.name === 'type' ? (
            <div className="field span-full" key={f.name}>
              <label className="field-label">Hareket tipi</label>
              <div className="row" style={{ gap: 6 }}>
                {TYPE_OPTIONS.map((o) => {
                  const Icon = o.value === 'in' ? ArrowDownCircle : o.value === 'out' ? ArrowUpCircle : Scale;
                  return (
                    <button
                      key={o.value}
                      type="button"
                      className={`btn btn-sm ${type === o.value ? 'btn-primary' : ''}`}
                      onClick={() => setType(o.value)}
                    >
                      <Icon size={13} />
                      {o.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <FormField
              key={f.name}
              field={f}
              value={form.values[f.name]}
              error={form.errors[f.name]}
              onChange={(v) => form.setValue(f.name, v)}
              disabled={busy}
            />
          )
        )}
      </div>
    </Modal>
  );
}

function CountModal({ productOptions, onClose, onSaved }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState(null);

  const fields = [
    { name: 'product_id', label: 'Ürün', type: 'select', options: productOptions, required: true, span: 2 },
    { name: 'counted', label: 'Sayılan miktar', type: 'number', required: true, min: 0, step: '0.01' },
    { name: 'note', label: 'Not', type: 'textarea', span: 2, rows: 2, placeholder: 'Örn. Depo 3 rafı sayıldı' },
  ];

  const form = useFormState(fields, {});

  // Urun secilince mevcut stogu goster.
  const selected = productOptions.find((p) => String(p.value) === String(form.values.product_id));
  useEffect(() => {
    setCurrent(selected ? Number(selected.stock) : null);
  }, [selected]);

  const save = async () => {
    const values = form.submit();
    if (!values) return;
    setBusy(true);
    try {
      const res = await api.post('/stock/set-stock', values);
      toast.success(
        'Sayım kaydedildi',
        res.data.unchanged
          ? 'Stok değişmedi, düzeltme yapılmadı.'
          : `${number(res.data.previous_stock)} → ${number(res.data.new_stock)}`
      );
      onSaved();
    } catch (err) {
      toast.fromError(err, 'Kaydedilemedi');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Stok sayımı"
      subtitle="Sayılan miktarı girin; fark otomatik düzeltme olarak kaydedilir"
      size="sm"
      footer={
        <>
          <div className="spacer" />
          <button className="btn" onClick={onClose} disabled={busy}>
            Vazgeç
          </button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? 'Kaydediliyor...' : 'Sayımı kaydet'}
          </button>
        </>
      }
    >
      {current !== null ? (
        <div className="alert info" style={{ marginBottom: 14 }}>
          Sistemdeki mevcut stok: <strong>{number(current)} {selected?.unit}</strong>
        </div>
      ) : null}
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
