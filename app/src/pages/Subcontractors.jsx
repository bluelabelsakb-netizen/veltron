import { useCallback, useEffect, useMemo, useState } from 'react';
import { HardHat, Plus, Search, Trash2, Pencil, X, Wallet, Star, Receipt, TrendingUp, Building, ArrowLeftRight } from 'lucide-react';
import { api, money, number, dateFmt, todayIso } from '../lib/api.js';
import { useToast } from '../components/Toast.jsx';
import { ResourcePage } from '../components/ResourcePage.jsx';
import { Modal, ConfirmDialog } from '../components/Modal.jsx';
import { FormField, useFormState } from '../components/Form.jsx';
import { PageHeader, Kpi, KpiMoney, EmptyState } from '../components/Primitives.jsx';
import { StatusBadge } from '../components/StatusBadge.jsx';
import { DataTable, MiniTable } from '../components/DataTable.jsx';

const INV_STATUS = [
  { value: 'issued', label: 'Kesildi' },
  { value: 'partial', label: 'Kısmi Ödendi' },
  { value: 'paid', label: 'Ödendi' },
  { value: 'cancelled', label: 'İptal' },
];

const PAY_METHODS = [
  { value: 'nakit', label: 'Nakit' },
  { value: 'havale', label: 'Havale / EFT' },
  { value: 'cek', label: 'Çek' },
  { value: 'kredi_karti', label: 'Kredi Kartı' },
];

export default function Subcontractors() {
  const [view, setView] = useState('cards'); // cards | billing
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/subcontractors/summary');
      setSummary(res.data);
    } catch (err) {
      toast.fromError(err, 'Özet yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  return (
    <>
      <div className="row mb-14" style={{ marginTop: -6 }}>
        <div className="spacer" />
        <div style={{ display: 'flex', gap: 2, background: 'var(--bg-elevated)', padding: 3, borderRadius: 7, border: '1px solid var(--border)' }}>
          <button className={`btn btn-sm ${view === 'cards' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setView('cards')}>
            <HardHat size={13} />
            Taşeronlar
          </button>
          <button className={`btn btn-sm ${view === 'billing' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setView('billing')}>
            <Receipt size={13} />
            Fatura & Ödeme
          </button>
        </div>
      </div>

      <div className="kpi-grid">
        <Kpi label="Aktif taşeron" value={number(summary?.active_count)} color="#3b82f6" icon={HardHat} small />
        <Kpi label="Açık iş" value={number(summary?.open_jobs)} color="#f59e0b" icon={ArrowLeftRight} small />
        <KpiMoney label="Toplam maliyet" value={summary?.total_cost} color="#ef4444" icon={TrendingUp} small />
        <KpiMoney label="Faturalanan" value={summary?.total_invoiced} color="#8b5cf6" icon={Receipt} small />
        <KpiMoney label="Ödenen" value={summary?.total_paid} color="#22c55e" icon={Wallet} small />
        <KpiMoney
          label="Açık bakiye"
          value={summary?.open_balance}
          color={summary?.open_balance > 0 ? '#f59e0b' : '#22c55e'}
          icon={Wallet}
          sub="Taşerona ödenecek"
          small
        />
      </div>

      {view === 'cards' ? <SubcontractorCards onChanged={load} /> : <SubcontractorBilling onChanged={load} />}
    </>
  );
}

// =========================================================================
// TASERON KARTLARI
// =========================================================================

function SubcontractorCards({ onChanged }) {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [specialties, setSpecialties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [specialty, setSpecialty] = useState('all');
  const [editing, setEditing] = useState(null);
  const [detail, setDetail] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/subcontractors', { search: search || undefined, specialty, limit: 200 });
      setRows(res.data);
      setSpecialties(res.specialties || []);
    } catch (err) {
      toast.fromError(err, 'Taşeronlar yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [search, specialty, toast]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      const res = await api.del(`/subcontractors/${deleting.id}`);
      toast.success(res.data?.archived ? 'Taşeron pasifleştirildi' : 'Taşeron silindi');
      setDeleting(null);
      load();
      onChanged();
    } catch (err) {
      toast.fromError(err, 'Silinemedi');
    } finally {
      setBusy(false);
    }
  };

  const fields = [
    { name: 'name', label: 'Firma adı', required: true, span: 2 },
    { name: 'contact', label: 'Yetkili' },
    { name: 'phone', label: 'Telefon', type: 'tel' },
    { name: 'email', label: 'E-posta', type: 'email' },
    { name: 'tax_number', label: 'VKN / TC kimlik' },
    { name: 'specialty', label: 'Uzmanlık', placeholder: 'Örn. Taşıma, İskele, Elektrik' },
    { name: 'city', label: 'İl' },
    { name: 'default_rate', label: 'Anlaşmalı birim fiyat', type: 'money', min: 0 },
    { name: 'rate_unit', label: 'Fiyat birimi', type: 'select', options: [
      { value: 'Ton', label: 'Ton' }, { value: 'Kg', label: 'Kg' }, { value: 'Adet', label: 'Adet' }, { value: 'Gün', label: 'Gün' }, { value: 'Saat', label: 'Saat' },
    ], defaultValue: 'Ton' },
    { name: 'rating', label: 'Performans puanı (1-5)', type: 'number', min: 1, max: 5 },
    { name: 'address', label: 'Adres', type: 'textarea', span: 2, rows: 2 },
    { name: 'notes', label: 'Notlar', type: 'textarea', span: 2, rows: 2 },
    { name: 'is_active', label: 'Aktif taşeron', type: 'checkbox', defaultValue: 1 },
  ];

  return (
    <>
      <PageHeader
        title="Taşeronlar"
        description="Alt yüklenici kartları, iş geçmişi ve bakiye"
        actions={
          <button className="btn btn-primary" onClick={() => setEditing('new')}>
            <Plus size={15} />
            Yeni Taşeron
          </button>
        }
      />

      <div className="card mb-14">
        <div className="row row-wrap" style={{ gap: 9 }}>
          <div className="search-box">
            <Search size={14} />
            <input className="input" placeholder="Firma, yetkili, uzmanlık ara..." value={search} onChange={(e) => setSearch(e.target.value)} />
            {search ? <button className="btn btn-ghost btn-icon" style={{ position: 'absolute', right: 3, top: 3, width: 26, height: 26 }} onClick={() => setSearch('')}><X size={13} /></button> : null}
          </div>
          <select className="select filter-select" value={specialty} onChange={(e) => setSpecialty(e.target.value)}>
            <option value="all">Tüm uzmanlıklar</option>
            {specialties.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <Loading />
      ) : rows.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={HardHat}
            title="Taşeron bulunamadı"
            description="Dışarıya verdiğiniz işleri taşeronlara atamak ve maliyetlerini takip etmek için taşeron ekleyin."
            action={<button className="btn btn-primary" onClick={() => setEditing('new')}><Plus size={15} /> Yeni Taşeron</button>}
          />
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
          {rows.map((s) => (
            <div key={s.id} className="card" style={{ cursor: 'pointer' }} onClick={() => setDetail(s)}>
              <div className="card-body">
                <div className="row" style={{ gap: 11, marginBottom: 10 }}>
                  <div className="avatar" style={{ width: 36, height: 36, fontSize: 13 }}>{s.name.slice(0, 2).toUpperCase()}</div>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="cell-strong truncate">{s.name}</div>
                    <div className="cell-dim truncate">{s.specialty || '—'}{s.city ? ` · ${s.city}` : ''}</div>
                  </div>
                  {!s.is_active ? <span className="badge muted">Pasif</span> : null}
                </div>

                {s.rating ? (
                  <div className="row" style={{ gap: 2, marginBottom: 10 }}>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} size={12} fill={i < s.rating ? '#f59e0b' : 'none'} color={i < s.rating ? '#f59e0b' : 'var(--border-strong)'} />
                    ))}
                  </div>
                ) : null}

                <div className="row" style={{ fontSize: 12, gap: 14 }}>
                  <span className="text-dim">{s.job_count} iş</span>
                  {s.default_rate ? <span className="text-dim">{money(s.default_rate)} / {s.rate_unit}</span> : null}
                </div>

                <div className="stat-row" style={{ marginTop: 6 }}>
                  <span className="label">Toplam maliyet</span>
                  <span className="value money">{money(s.job_cost)}</span>
                </div>
                {s.open_balance > 0 ? (
                  <div className="stat-row">
                    <span className="label" style={{ color: 'var(--warning)' }}>Ödenecek</span>
                    <span className="value money neg">{money(s.open_balance)}</span>
                  </div>
                ) : null}
              </div>
              <div className="pagination" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                <span className="text-dim text-sm">{s.contact || '—'}{s.phone ? ` · ${s.phone}` : ''}</span>
                <div className="spacer" />
                <div className="row" style={{ gap: 4 }} onClick={(e) => e.stopPropagation()}>
                  <button className="btn btn-sm btn-icon" title="Düzenle" onClick={() => setEditing(s)}><Pencil size={13} /></button>
                  <button className="btn btn-sm btn-icon" title="Sil" onClick={() => setDeleting(s)}><Trash2 size={13} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing ? (
        <SubForm
          sub={editing === 'new' ? null : editing}
          fields={fields}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); onChanged(); }}
        />
      ) : null}

      {detail ? <SubDetail subId={detail.id} onClose={() => setDetail(null)} onEdit={(s) => { setDetail(null); setEditing(s); }} /> : null}

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        busy={busy}
        title="Taşeron silinsin mi?"
        message={deleting ? `"${deleting.name}" taşeronu silinecek.\n\nİş geçmişi varsa kayıt silinmez, pasifleştirilir.` : ''}
      />
    </>
  );
}

function SubForm({ sub, fields, onClose, onSaved }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const initial = useMemo(() => {
    const base = { rate_unit: 'Ton', is_active: 1 };
    if (sub) for (const f of fields) if (f.name in sub) base[f.name] = sub[f.name] ?? '';
    return base;
  }, [sub, fields]);
  const form = useFormState(fields, initial);

  const save = async () => {
    const v = form.submit();
    if (!v) return;
    setBusy(true);
    try {
      if (sub) await api.put(`/subcontractors/${sub.id}`, v);
      else await api.post('/subcontractors', v);
      toast.success(sub ? 'Taşeron güncellendi' : 'Taşeron eklendi');
      onSaved();
    } catch (err) {
      toast.fromError(err, 'Kaydedilemedi');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open onClose={onClose} size="md" title={sub ? 'Taşeron düzenle' : 'Yeni taşeron'}
      footer={<><div className="spacer" /><button className="btn" onClick={onClose} disabled={busy}>Vazgeç</button><button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Kaydediliyor...' : 'Kaydet'}</button></>}
    >
      <div className="form-grid">
        {fields.map((f) => (
          <FormField key={f.name} field={f} value={form.values[f.name]} error={form.errors[f.name]} onChange={(v) => form.setValue(f.name, v)} disabled={busy} />
        ))}
      </div>
    </Modal>
  );
}

function SubDetail({ subId, onClose, onEdit }) {
  const [sub, setSub] = useState(null);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/subcontractors/${subId}`);
      setSub(res.data);
    } catch (err) {
      toast.fromError(err, 'Yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [subId, toast]);

  useEffect(() => { load(); }, [load]);

  return (
    <Modal
      open onClose={onClose} size="lg" title={sub?.name || 'Taşeron'}
      footer={<><button className="btn" onClick={() => onEdit(sub)}><Pencil size={14} /> Düzenle</button><div className="spacer" /><button className="btn" onClick={onClose}>Kapat</button></>}
    >
      {loading || !sub ? (
        <div className="loading-page"><div className="spinner lg" /></div>
      ) : (
        <>
          <div className="grid-3 mb-14">
            <div className="card"><div className="card-body">
              <div className="stat-row"><span className="label">İş sayısı</span><span className="value">{number(sub.job_count)}</span></div>
              <div className="stat-row"><span className="label">Teslim alınan</span><span className="value">{number(sub.delivered_count)}</span></div>
            </div></div>
            <div className="card"><div className="card-body">
              <div className="stat-row"><span className="label">Toplam maliyet</span><span className="value money">{money(sub.job_cost)}</span></div>
              <div className="stat-row"><span className="label">Anlaşmalı birim</span><span className="value">{sub.default_rate ? `${money(sub.default_rate)}/${sub.rate_unit}` : '-'}</span></div>
            </div></div>
            <div className="card"><div className="card-body">
              <div className="stat-row"><span className="label">Faturalanan</span><span className="value money">{money(sub.invoiced)}</span></div>
              <div className="stat-row total"><span className="label">Açık bakiye</span><span className="value money neg">{money(sub.open_balance)}</span></div>
            </div></div>
          </div>

          <div className="card mb-14">
            <div className="card-head"><h3>İş Geçmişi</h3></div>
            <div className="card-body">
              {!sub.jobs?.length ? <EmptyState compact title="İş kaydı yok" /> : (
                sub.jobs.map((j) => (
                  <div className="list-row" key={j.id}>
                    <div className="grow">
                      <div className="title mono">{j.work_order_number || '—'}</div>
                      <div className="meta">{j.work_order_subject || ''}{j.assigned_date ? ` · ${dateFmt(j.assigned_date)}` : ''}</div>
                    </div>
                    {j.quantity ? <span className="text-dim text-sm nowrap">{number(j.quantity)} {j.quantity_unit || ''}</span> : null}
                    <span className="money">{money(j.cost)}</span>
                    <StatusBadge status={j.status} size="sm" />
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-head"><h3>Faturalar</h3></div>
            <div className="card-body">
              {!sub.invoices?.length ? <EmptyState compact title="Fatura yok" /> : (
                <MiniTable
                  rows={sub.invoices}
                  columns={[
                    { key: 'invoice_no', header: 'Fatura No', render: (i) => <span className="mono">{i.invoice_no}</span> },
                    { key: 'invoice_date', header: 'Tarih', render: (i) => dateFmt(i.invoice_date) },
                    { key: 'amount', header: 'Tutar', align: 'right', render: (i) => <span className="money">{money(i.amount)}</span> },
                    { key: 'paid_amount', header: 'Ödenen', align: 'right', render: (i) => <span className="money pos">{money(i.paid_amount)}</span> },
                    { key: 'status', header: 'Durum', render: (i) => <StatusBadge status={i.status} size="sm" /> },
                  ]}
                />
              )}
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}

// =========================================================================
// TASERON FATURALARI + ODEMELER
// =========================================================================

function SubcontractorBilling({ onChanged }) {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [subs, setSubs] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('all');
  const [editing, setEditing] = useState(null);
  const [paying, setPaying] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/subcontractors/invoices/list', { status });
      setRows(res.data);
      setSummary(res.summary);
    } catch (err) {
      toast.fromError(err, 'Faturalar yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [status, toast]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    Promise.all([
      api.get('/subcontractors', { is_active: 'true', limit: 300 }),
      api.get('/work-orders', { limit: 300 }),
    ])
      .then(([s, w]) => { setSubs(s.data); setOrders(w.data); })
      .catch(() => {});
  }, []);

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await api.del(`/subcontractors/invoices/${deleting.id}`);
      toast.success('Fatura silindi');
      setDeleting(null);
      load();
      onChanged();
    } catch (err) {
      toast.fromError(err, 'Silinemedi');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Taşeron Faturaları"
        description="Taşeronların Veltron'a kestiği faturalar ve yapılan ödemeler"
        actions={
          <button className="btn btn-primary" onClick={() => setEditing('new')}>
            <Plus size={15} />
            Fatura Gir
          </button>
        }
      />

      {summary ? (
        <div className="row row-wrap mb-14" style={{ gap: 10 }}>
          <span className="badge muted">Faturalanan: <strong>{money(summary.invoiced)}</strong></span>
          <span className="badge success">Ödenen: <strong>{money(summary.paid)}</strong></span>
          <span className="badge warning">Açık bakiye: <strong>{money(summary.open)}</strong></span>
        </div>
      ) : null}

      <div className="card mb-14">
        <div className="row">
          <select className="select filter-select" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">Tüm durumlar</option>
            {INV_STATUS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      <DataTable
        columns={[
          { key: 'invoice_no', header: 'Fatura', render: (r) => <span className="mono cell-strong">{r.invoice_no}</span> },
          { key: 'subcontractor_name', header: 'Taşeron' },
          { key: 'work_order_number', header: 'İş emri', render: (r) => <span className="mono text-dim">{r.work_order_number || '-'}</span> },
          { key: 'invoice_date', header: 'Tarih', width: 100, render: (r) => dateFmt(r.invoice_date) },
          { key: 'amount', header: 'Tutar', align: 'right', width: 110, render: (r) => <span className="money">{money(r.amount)}</span> },
          { key: 'paid_amount', header: 'Ödenen', align: 'right', width: 110, render: (r) => <span className="money pos">{money(r.paid_amount)}</span> },
          {
            key: 'remaining',
            header: 'Kalan',
            align: 'right',
            width: 110,
            render: (r) => {
              const rem = Number(r.amount) - Number(r.paid_amount);
              return rem > 0 ? <span className="money neg">{money(rem)}</span> : <span className="text-dim">-</span>;
            },
            csv: (r) => Number(r.amount) - Number(r.paid_amount),
          },
          { key: 'status', header: 'Durum', width: 112, render: (r) => <StatusBadge status={r.status} /> },
        ]}
        rows={rows}
        loading={loading}
        emptyIcon={Receipt}
        emptyTitle="Taşeron faturası yok"
        emptyDescription="Taşeron bana fatura kestiğinde buradan girin; ödeme yaptıkça kalan bakiye düşer."
        rowActions={(row) => (
          <>
            {Number(row.paid_amount) < Number(row.amount) ? (
              <button className="btn btn-sm btn-icon" title="Ödeme yap" onClick={() => setPaying(row)}>
                <Wallet size={14} />
              </button>
            ) : null}
            <button className="btn btn-sm btn-icon" title="Düzenle" onClick={() => setEditing(row)}>
              <Pencil size={14} />
            </button>
            {!row.paid_amount ? (
              <button className="btn btn-sm btn-icon" title="Sil" onClick={() => setDeleting(row)}>
                <Trash2 size={14} />
              </button>
            ) : null}
          </>
        )}
      />

      {editing ? (
        <SubInvoiceForm
          invoice={editing === 'new' ? null : editing}
          subs={subs}
          orders={orders}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); onChanged(); }}
        />
      ) : null}

      {paying ? (
        <SubPaymentModal
          invoice={paying}
          onClose={() => setPaying(null)}
          onDone={() => { setPaying(null); load(); onChanged(); }}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        busy={busy}
        title="Taşeron faturası silinsin mi?"
        message={deleting ? `${deleting.invoice_no} numaralı fatura silinecek.\n\nÖdemesi olan fatura silinemez.` : ''}
      />
    </>
  );
}

function SubInvoiceForm({ invoice, subs, orders, onClose, onSaved }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const fields = [
    { name: 'subcontractor_id', label: 'Taşeron', type: 'select', required: true, options: subs.map((s) => ({ value: s.id, label: s.name })) },
    { name: 'work_order_id', label: 'İlgili iş emri', type: 'select', options: orders.map((o) => ({ value: o.id, label: o.number, hint: o.subject })) },
    { name: 'invoice_no', label: 'Fatura no', required: true },
    { name: 'invoice_date', label: 'Fatura tarihi', type: 'date', required: true, defaultValue: todayIso() },
    { name: 'due_date', label: 'Vade', type: 'date' },
    { name: 'amount', label: 'Tutar (₺)', type: 'money', required: true, min: 0 },
    { name: 'note', label: 'Not', type: 'textarea', span: 2, rows: 2 },
  ];
  const initial = useMemo(() => {
    const base = { invoice_date: todayIso() };
    if (invoice) for (const f of fields) if (f.name in invoice) base[f.name] = invoice[f.name] ?? '';
    return base;
  }, [invoice, fields]);
  const form = useFormState(fields, initial);

  const save = async () => {
    const v = form.submit();
    if (!v) return;
    setBusy(true);
    try {
      if (invoice) {
        // Fatura duzenleme: mevcut odemeleri korumak icin once silip yeniden olusturmak
        // yerine durum ve tutari guncelle
        await api.put(`/subcontractors/invoices/${invoice.id}`, v);
      } else {
        await api.post('/subcontractors/invoices', v);
      }
      toast.success(invoice ? 'Fatura güncellendi' : 'Fatura girildi');
      onSaved();
    } catch (err) {
      toast.fromError(err, 'Kaydedilemedi');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open onClose={onClose} title={invoice ? 'Taşeron faturası düzenle' : 'Taşeron faturası gir'} size="md"
      footer={<><div className="spacer" /><button className="btn" onClick={onClose} disabled={busy}>Vazgeç</button><button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Kaydediliyor...' : 'Kaydet'}</button></>}
    >
      <div className="form-grid">
        {fields.map((f) => (
          <FormField key={f.name} field={f} value={form.values[f.name]} error={form.errors[f.name]} onChange={(v) => form.setValue(f.name, v)} disabled={busy} />
        ))}
      </div>
    </Modal>
  );
}

function SubPaymentModal({ invoice, onClose, onDone }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const remaining = Number(invoice.amount) - Number(invoice.paid_amount);
  const fields = [
    { name: 'amount', label: 'Ödeme tutarı (₺)', type: 'money', required: true, min: 0 },
    { name: 'method', label: 'Yöntem', type: 'select', options: PAY_METHODS, defaultValue: 'havale' },
    { name: 'payment_date', label: 'Tarih', type: 'date', required: true, defaultValue: todayIso() },
    { name: 'reference', label: 'Dekont no' },
    { name: 'note', label: 'Not', type: 'textarea', span: 2, rows: 2 },
  ];
  const form = useFormState(fields, { amount: remaining.toFixed(2) });

  const save = async () => {
    const v = form.submit();
    if (!v) return;
    setBusy(true);
    try {
      await api.post(`/subcontractors/invoices/${invoice.id}/payments`, v);
      toast.success('Ödeme kaydedildi', money(v.amount));
      onDone();
    } catch (err) {
      toast.fromError(err, 'Ödeme kaydedilemedi');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open onClose={onClose} title="Taşerona ödeme yap" subtitle={`${invoice.subcontractor_name} · ${invoice.invoice_no} · kalan ${money(remaining)}`} size="sm"
      footer={<><div className="spacer" /><button className="btn" onClick={onClose} disabled={busy}>Vazgeç</button><button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Kaydediliyor...' : 'Ödemeyi kaydet'}</button></>}
    >
      <div className="form-grid">
        {fields.map((f) => (
          <FormField key={f.name} field={f} value={form.values[f.name]} error={form.errors[f.name]} onChange={(v) => form.setValue(f.name, v)} disabled={busy} />
        ))}
      </div>
    </Modal>
  );
}

function Loading() {
  return <div className="loading-page"><div className="spinner lg" /></div>;
}
