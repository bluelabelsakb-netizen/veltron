import { useState, useEffect, useCallback, useMemo } from 'react';
import { ClipboardList, Plus, Search, Trash2, Pencil, RotateCcw, X, Scale, Receipt, AlertTriangle, TrendingUp, HardHat, Ban, Users, Package, Info } from 'lucide-react';
import { api, money, number, percent, dateFmt, todayIso, weightDisplay } from '../lib/api.js';
import { useLookups } from '../context/LookupsContext.jsx';
import { useToast } from '../components/Toast.jsx';
import { Modal, ConfirmDialog } from '../components/Modal.jsx';
import { FormField, useFormState } from '../components/Form.jsx';
import { DateRequestInbox } from './DateRequestInbox.jsx';
import { Attachments } from '../components/Attachments.jsx';
import { QuickWeigh } from '../components/QuickWeigh.jsx';
import { PageHeader, Kpi, KpiMoney, EmptyState } from '../components/Primitives.jsx';
import { StatusBadge } from '../components/StatusBadge.jsx';
import { DataTable } from '../components/DataTable.jsx';

const STATUS_OPTIONS = [
  { value: 'alindi', label: 'Alındı' },
  { value: 'hazirlaniyor', label: 'Hazırlanıyor' },
  { value: 'teslim_edildi', label: 'Teslim Edildi' },
  { value: 'ertelendi', label: 'Ertelendi' },
  { value: 'iptal', label: 'İptal' },
];

const DEFER_REASONS = [
  { value: 'musteri_talebi', label: 'Müşteri talebi' },
  { value: 'malzeme_yok', label: 'Malzeme yok' },
  { value: 'kapasite', label: 'Kapasite yetersiz' },
  { value: 'hava', label: 'Hava koşulları' },
  { value: 'taseron_gecikmesi', label: 'Taşeron gecikmesi' },
  { value: 'diger', label: 'Diğer' },
];

const DEFER_STATUS = [
  { value: 'beklemede', label: 'Beklemede' },
  { value: 'onaylandi', label: 'Onaylandı' },
  { value: 'reddedildi', label: 'Reddedildi' },
];

const reasonLabel = (r) => DEFER_REASONS.find((x) => x.value === r)?.label || r;

export default function WorkOrders() {
  const { customerOptions } = useLookups();
  const toast = useToast();

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [uninvoicedOnly, setUninvoicedOnly] = useState(false);
  const [page, setPage] = useState({ limit: 50, offset: 0 });
  const [editing, setEditing] = useState(null);
  const [detail, setDetail] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/work-orders', {
        search: search || undefined,
        status,
        uninvoiced: uninvoicedOnly ? 'true' : undefined,
        limit: page.limit,
        offset: page.offset,
      });
      setRows(res.data);
      setTotal(res.total);
      setSummary(res.summary);
    } catch (err) {
      toast.fromError(err, 'İş emirleri yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [search, status, uninvoicedOnly, page.limit, page.offset, toast]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await api.del(`/work-orders/${deleting.id}`);
      toast.success('İş emri silindi');
      setDeleting(null);
      load();
    } catch (err) {
      toast.fromError(err, 'Silinemedi');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="İş Emirleri"
        description="Tartım kaydı, net kilogram ve faturalanabilir iş birimi"
        actions={
          <button className="btn btn-primary" onClick={() => setEditing('new')}>
            <Plus size={15} />
            Yeni İş Emri
          </button>
        }
      />

      <div className="kpi-grid">
        <Kpi label="İş emri sayısı" value={number(total)} color="#3b82f6" icon={ClipboardList} small />
        <Kpi label="Toplam net" value={`${number(summary?.net_weight)} kg`} color="#06b6d4" icon={Scale} small />
        <KpiMoney label="Toplam satış" value={summary?.amount} color="#22c55e" icon={TrendingUp} small />
        <KpiMoney
          label="Kendi ekip maliyeti"
          value={summary?.labor_cost}
          color="#8b5cf6"
          icon={Users}
          small
        />
        <KpiMoney label="Taşeron maliyeti" value={summary?.sub_cost} color="#f59e0b" icon={HardHat} small />
        <KpiMoney
          label="Kâr"
          value={summary?.margin}
          color={summary?.margin >= 0 ? '#22c55e' : '#ef4444'}
          icon={TrendingUp}
          sub={summary?.amount > 0 ? `${percent((summary.margin / summary.amount) * 100, 0)} marj` : '-'}
          small
        />
        <KpiMoney
          label="Faturalanmamış"
          value={summary?.uninvoiced}
          color={summary?.uninvoiced > 0 ? '#ef4444' : '#6b788d'}
          icon={AlertTriangle}
          sub="Teslim oldu, faturası yok"
          onClick={() => setUninvoicedOnly(true)}
          small
        />
      </div>

      <div className="mb-14">
        <DateRequestInbox onChanged={load} />
      </div>

      <div className="card mb-14">
        <div className="row row-wrap" style={{ gap: 9 }}>
          <div className="search-box">
            <Search size={14} />
            <input
              className="input"
              placeholder="İş emri no, konu, müşteri ara..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search ? (
              <button className="btn btn-ghost btn-icon" style={{ position: 'absolute', right: 3, top: 3, width: 26, height: 26 }} onClick={() => setSearch('')}>
                <X size={13} />
              </button>
            ) : null}
          </div>
          <select className="select filter-select" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">Tüm durumlar</option>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button className={`btn btn-sm ${uninvoicedOnly ? 'btn-danger' : ''}`} onClick={() => setUninvoicedOnly((v) => !v)}>
            <AlertTriangle size={13} />
            Faturalanmamışlar
          </button>
          {(status !== 'all' || search || uninvoicedOnly) ? (
            <button className="btn btn-ghost btn-sm" onClick={() => { setStatus('all'); setSearch(''); setUninvoicedOnly(false); }}>
              <RotateCcw size={13} />
              Temizle
            </button>
          ) : null}
        </div>
      </div>

      <DataTable
        columns={[
          {
            key: 'number',
            header: 'İş Emri',
            sortKey: 'number',
            render: (r) => (
              <div>
                <div className="cell-strong mono">{r.number}</div>
                {r.subject ? <div className="cell-dim truncate" style={{ maxWidth: 220 }}>{r.subject}</div> : null}
              </div>
            ),
          },
          {
            key: 'customer_name',
            header: 'Müşteri',
            render: (r) => <span className="truncate" style={{ maxWidth: 160 }}>{r.customer_name}</span>,
          },
          { key: 'status', header: 'Durum', sortKey: 'status', width: 118, render: (r) => <StatusBadge status={r.status} /> },
          { key: 'work_date', header: 'Tarih', sortKey: 'date', width: 96, render: (r) => <span className="cell-dim">{dateFmt(r.work_date)}</span> },
          {
            key: 'net_weight',
            header: 'Net Ağırlık',
            sortKey: 'net',
            align: 'right',
            width: 130,
            render: (r) => (
              <span className={`money ${Number(r.net_weight) > 0 ? '' : 'text-dim'}`}>
                {weightDisplay(r.net_weight, r.unit)}
              </span>
            ),
            csv: (r) => r.net_weight,
          },
          {
            key: 'amount',
            header: 'Satış',
            sortKey: 'amount',
            align: 'right',
            width: 106,
            render: (r) => <span className="money">{money(r.amount)}</span>,
          },
          {
            key: 'labor_cost',
            header: 'Bizim Ekip',
            align: 'right',
            width: 104,
            render: (r) =>
              r.labor_cost > 0 ? (
                <span className="money neg">−{money(r.labor_cost)}</span>
              ) : (
                <span className="text-dim">—</span>
              ),
          },
          {
            key: 'subcontractor_cost',
            header: 'Taşeron',
            align: 'right',
            width: 104,
            render: (r) =>
              r.subcontractor_cost > 0 ? (
                <span className="money neg">−{money(r.subcontractor_cost)}</span>
              ) : (
                <span className="text-dim">—</span>
              ),
          },
          {
            key: 'margin',
            header: 'Kâr',
            align: 'right',
            width: 108,
            render: (r) => (
              <div>
                <div className={`money ${r.margin >= 0 ? 'pos' : 'neg'}`} style={{ fontWeight: 700 }}>
                  {money(r.margin)}
                </div>
                {r.amount > 0 ? (
                  <div className="text-dim" style={{ fontSize: 10.5 }}>
                    %{Math.round((r.margin / r.amount) * 100)} marj
                  </div>
                ) : null}
              </div>
            ),
            csv: (r) => r.margin,
          },
          {
            key: 'invoice_number',
            header: 'Fatura',
            width: 120,
            render: (r) =>
              r.invoice_number ? (
                <span className="mono text-dim">{r.invoice_number}</span>
              ) : r.status === 'teslim_edildi' ? (
                <span className="badge warning">Kesilmedi</span>
              ) : (
                <span className="text-dim">-</span>
              ),
          },
        ]}
        rows={rows}
        loading={loading}
        pagination={{ total, limit: page.limit, offset: page.offset, onChange: setPage }}
        onRowClick={(r) => setDetail(r)}
        emptyIcon={ClipboardList}
        emptyTitle="İş emri bulunamadı"
        emptyDescription="Tartım girilen her iş emri, faturanın dayanağı olur."
        rowActions={(row) => (
          <>
            {row.status === 'teslim_edildi' && !row.invoice_id ? (
              <button className="btn btn-sm btn-icon" title="Fatura kes" onClick={() => setDetail(row)}>
                <Receipt size={14} />
              </button>
            ) : null}
            <button className="btn btn-sm btn-icon" title="Düzenle" onClick={() => setEditing(row)}>
              <Pencil size={14} />
            </button>
            {!row.invoice_id ? (
              <button className="btn btn-sm btn-icon" title="Sil" onClick={() => setDeleting(row)}>
                <Trash2 size={14} />
              </button>
            ) : null}
          </>
        )}
      />

      {editing ? (
        <WorkOrderForm
          workOrder={editing === 'new' ? null : editing}
          customerOptions={customerOptions}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      ) : null}

      {detail ? (
        <WorkOrderDetail
          workOrderId={detail.id}
          onClose={() => setDetail(null)}
          onEdit={(w) => { setDetail(null); setEditing(w); }}
          onChanged={load}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        busy={busy}
        title="İş emri silinsin mi?"
        message={deleting ? `${deleting.number} numaralı iş emri ve tartım kaydı kalıcı olarak silinecek.\n\nBu işlem geri alınamaz.` : ''}
      />
    </>
  );
}

// =========================================================================
// IS EMRI FORMU
// =========================================================================

function WorkOrderForm({ workOrder, customerOptions, onClose, onSaved }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const fields = [
    { name: 'number', label: 'İş emri no', required: true, placeholder: 'VM2026-0017 (boş bırakılırsa sistem üretir)' },
    { name: 'customer_id', label: 'Müşteri', type: 'select', options: customerOptions, required: true },
    { name: 'subject', label: 'Konu', placeholder: 'Örn. Çakıl 0-2 teslimati' },
    { name: 'work_date', label: 'İş tarihi', type: 'date', defaultValue: todayIso() },
    { name: 'due_date', label: 'Termin', type: 'date' },
    { name: 'status', label: 'Durum', type: 'select', options: STATUS_OPTIONS, defaultValue: 'alindi' },
    { name: 'tare_weight', label: 'Boş tartım (kg)', type: 'number', min: 0, step: '0.001', hint: 'Tır boşken tartım' },
    { name: 'gross_weight', label: 'Dolu tartım (kg)', type: 'number', min: 0, step: '0.001', hint: 'Yüklüyken tartım' },
    { name: 'weight_note', label: 'Araç / ölçü notu', placeholder: 'Örn. 34 ABC 1234' },
    { name: 'unit', label: 'Fiyat birimi', type: 'select', options: [
      { value: 'Ton', label: 'Ton (₺/ton)' },
      { value: 'Kg', label: 'Kg (₺/kg)' },
    ], defaultValue: 'Ton' },
    { name: 'unit_price', label: 'Birim fiyat (₺)', type: 'money', min: 0 },
    { name: 'quantity_done', label: 'Teslim edilen miktar', type: 'number', min: 0, step: '0.001' },
    { name: 'description', label: 'Açıklama', type: 'textarea', span: 2, rows: 2 },
    { name: 'notes', label: 'Notlar', type: 'textarea', span: 2, rows: 2 },
  ];

  const initial = useMemo(() => {
    const base = { work_date: todayIso(), status: 'alindi', unit: 'Ton' };
    if (workOrder) for (const f of fields) if (f.name in workOrder) base[f.name] = workOrder[f.name] ?? '';
    return base;
  }, [workOrder, fields]);

  const form = useFormState(fields, initial);

  // Net agirlik ve tutar canli hesaplanir (sadece onizleme; sunucu da hesaplar)
  const net = (() => {
    const t = Number(form.values.tare_weight);
    const g = Number(form.values.gross_weight);
    if (!t && !g) return null;
    if (form.values.tare_weight === '' || form.values.gross_weight === '') return null;
    return g - t;
  })();
  const amount = net !== null ? (net / (form.values.unit === 'Kg' ? 1 : 1000)) * (Number(form.values.unit_price) || 0) : null;

  const save = async () => {
    const values = form.submit();
    if (!values) return;
    if (values.gross_weight !== null && values.tare_weight !== null && Number(values.gross_weight) < Number(values.tare_weight)) {
      form.setErrors({ gross_weight: 'Dolu tartım, boş tartımdan küçük olamaz' });
      return;
    }
    setBusy(true);
    try {
      if (workOrder) await api.put(`/work-orders/${workOrder.id}`, values);
      else await api.post('/work-orders', values);
      toast.success(workOrder ? 'İş emri güncellendi' : 'İş emri oluşturuldu');
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
      size="lg"
      title={workOrder ? 'İş emri düzenle' : 'Yeni iş emri'}
      subtitle={workOrder ? workOrder.number : 'Tartım girin; net kilogram otomatik hesaplanır'}
      footer={
        <>
          <div className="spacer" />
          <button className="btn" onClick={onClose} disabled={busy}>Vazgeç</button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </>
      }
    >
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

      {net !== null ? (
        <div className="alert info" style={{ marginTop: 16, marginBottom: 0 }}>
          <Scale size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            Net: <strong>{number(net)} kg</strong>
            {amount !== null && form.values.unit_price ? (
              <>
                {' · '}Tutar: <strong>{money(amount)}</strong>
                {' '}({number(net / (form.values.unit === 'Kg' ? 1 : 1000))} {form.values.unit} ×{' '}
                {money(form.values.unit_price, false)})
              </>
            ) : null}
          </span>
        </div>
      ) : null}
    </Modal>
  );
}

// =========================================================================
// IS EMRI DETAYI
// =========================================================================

function WorkOrderDetail({ workOrderId, onClose, onEdit, onChanged }) {
  const toast = useToast();
  const { reload: reloadLookups } = useLookups();
  const [wo, setWo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [subModal, setSubModal] = useState(null); // 'assign' | 'defer' | 'invoice'
  const [subs, setSubs] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loadingSubs, setLoadingSubs] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/work-orders/${workOrderId}`);
      setWo(res.data);
    } catch (err) {
      toast.fromError(err, 'İş emri yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [workOrderId, toast]);

  useEffect(() => { load(); }, [load]);

  const openSubs = useCallback(async () => {
    setLoadingSubs(true);
    try {
      const res = await api.get('/subcontractors', { is_active: 'true', limit: 300 });
      setSubs(res.data);
    } catch {
      setSubs([]);
    } finally {
      setLoadingSubs(false);
    }
  }, []);

  useEffect(() => { if (subModal === 'assign') openSubs(); }, [subModal, openSubs]);

  useEffect(() => {
    if (subModal !== 'labor' || employees.length) return;
    api.get('/employees', { is_active: 'true', limit: 300 })
      .then((r) => setEmployees(r.data))
      .catch(() => setEmployees([]));
  }, [subModal, employees.length]);

  const createInvoice = async () => {
    setBusy(true);
    try {
      const res = await api.post(`/work-orders/${workOrderId}/invoice`, { tax_rate: 20 });
      toast.success('Fatura kesildi', `${res.data.number} oluşturuldu.`);
      setSubModal(null);
      load();
      onChanged();
    } catch (err) {
      toast.fromError(err, 'Fatura kesilemedi');
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (next) => {
    try {
      await api.patch(`/work-orders/${workOrderId}/status`, { status: next });
      toast.success('Durum güncellendi');
      load();
      onChanged();
    } catch (err) {
      toast.fromError(err, 'Güncellenemedi');
    }
  };

  return (
    <>
      <Modal
        open
        onClose={onClose}
        size="lg"
        title={wo?.number || 'İş emri'}
        subtitle={wo?.subject}
        footer={
          <>
            <button className="btn" onClick={() => onEdit(wo)} disabled={!wo}>
              <Pencil size={14} />
              Düzenle
            </button>
            <div className="spacer" />
            {wo?.status === 'teslim_edildi' && !wo?.invoice_id ? (
              <button className="btn btn-primary" onClick={() => setSubModal('invoice')}>
                <Receipt size={14} />
                Fatura kes
              </button>
            ) : null}
            <button className="btn" onClick={onClose}>Kapat</button>
          </>
        }
      >
        {loading || !wo ? (
          <div className="loading-page"><div className="spinner lg" /></div>
        ) : (
          <>
            <div className="row row-wrap mb-14" style={{ gap: 7 }}>
              <StatusBadge status={wo.status} />
              <span className="badge muted">{dateFmt(wo.work_date)}</span>
              {wo.invoice_number ? (
                <span className="badge success">Fatura: {wo.invoice_number}</span>
              ) : wo.status === 'teslim_edildi' ? (
                <span className="badge warning">Fatura kesilmemiş</span>
              ) : null}
            </div>

            <div className="grid-2 mb-14">
              <div className="card">
                <div className="card-head"><Scale size={15} style={{ color: 'var(--info)' }} /><h3>Tartım</h3></div>
                <div className="card-body">
                  <div className="stat-row"><span className="label">Boş tartım</span><span className="value">{wo.tare_weight ? `${number(wo.tare_weight)} kg` : '-'}</span></div>
                  <div className="stat-row"><span className="label">Dolu tartım</span><span className="value">{wo.gross_weight ? `${number(wo.gross_weight)} kg` : '-'}</span></div>
                  <div className="stat-row total"><span className="label">NET</span><span className="value money">{number(wo.net_weight)} kg</span></div>
                  {wo.weight_note ? <div className="text-dim text-sm" style={{ marginTop: 8 }}>{wo.weight_note}</div> : null}
                </div>
              </div>

              <div className="card">
                <div className="card-head"><TrendingUp size={15} style={{ color: 'var(--success)' }} /><h3>Kâr</h3></div>
                <div className="card-body">
                  <div className="stat-row"><span className="label">Satış</span><span className="value money">{money(wo.amount)}</span></div>
                  {wo.labor_cost > 0 ? (
                    <div className="stat-row"><span className="label">Kendi ekibimiz ({wo.labor_hours} saat)</span><span className="value money neg">{`-${money(wo.labor_cost)}`}</span></div>
                  ) : null}
                  <div className="stat-row"><span className="label">Taşeron maliyeti</span><span className="value money neg">{wo.subcontractor_cost > 0 ? `-${money(wo.subcontractor_cost)}` : '-'}</span></div>
                  {wo.material_cost > 0 ? (
                    <div className="stat-row"><span className="label">Malzeme (dışarıdan alınan)</span><span className="value money neg">{`-${money(wo.material_cost)}`}</span></div>
                  ) : null}
                  <div className="stat-row total"><span className="label">Kâr</span><span className="value money" style={{ color: wo.margin >= 0 ? '#4ade80' : '#f87171' }}>{money(wo.margin)}</span></div>
                </div>
              </div>
            </div>

            <QuickWeigh workOrder={wo} onTartimGirildi={load} />

            <Attachments workOrderId={wo.id} onChanged={load} />

            <div className="card mb-14">
              <div className="card-head">
                <Package size={15} style={{ color: 'var(--info)' }} />
                <h3>Alınan Malzeme ({wo.material_cost > 0 ? money(wo.material_cost) : 'yok'})</h3>
                <button className="btn btn-sm" onClick={() => setSubModal('material')}>
                  <Plus size={13} />
                  Malzeme ekle
                </button>
              </div>
              <div className="card-body">
                {!wo.materials?.length ? (
                  <EmptyState
                    compact
                    icon={Package}
                    title="Malzeme girilmemiş"
                    description="Malzemeyi müşterinin tedarikçisinden alıyorsanız boş bırakın — maliyet zaten satış fiyatının içindedir. Yalnızca dışarıdan satın aldığınız malzemeleri girin."
                  />
                ) : (
                  <>
                    {wo.materials.map((m) => (
                      <div className="list-row" key={m.id}>
                        <div className="grow">
                          <div className="title">{m.description}</div>
                          <div className="meta">
                            {m.sku ? `${m.sku} · ` : ''}
                            {number(m.quantity)} {m.unit || ''} × {money(m.unit_price)}
                            {m.deduct_stock ? ' · stoktan düşüldü' : ''}
                          </div>
                        </div>
                        <span className="money cell-muted">{money(m.cost)}</span>
                        <button
                          className="btn btn-sm btn-icon"
                          title="Malzemeyi kaldır"
                          onClick={async () => {
                            try {
                              await api.del(`/work-orders/materials/${m.id}`);
                              toast.success('Malzeme kaldırıldı');
                              load();
                              onChanged();
                            } catch (err) {
                              toast.fromError(err, 'Silinemedi');
                            }
                          }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                    <div className="stat-row total" style={{ marginTop: 8 }}>
                      <span className="label">Malzeme maliyeti</span>
                      <span className="value money neg">−{money(wo.material_cost)}</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="card mb-14">
              <div className="card-head">
                <Users size={15} style={{ color: 'var(--primary)' }} />
                <h3>İşi Kim Yaptı ({wo.labor?.length || 0} kişi)</h3>
                <button className="btn btn-sm" onClick={() => setSubModal('labor')}>
                  <Plus size={13} />
                  Ekip ekle
                </button>
              </div>
              <div className="card-body">
                {wo.net_weight ? (
                  <div style={{ marginBottom: 14 }}>
                    <div className="row" style={{ justifyContent: 'space-between', marginBottom: 5 }}>
                      <span className="text-sm text-dim">
                        Toplam net:{' '}
                        <strong style={{ color: 'var(--text)' }}>{weightDisplay(wo.net_weight, wo.unit)}</strong>
                      </span>
                      {wo.unassigned_weight > 0 ? (
                        <span className="badge warning">{weightDisplay(wo.unassigned_weight, wo.unit)} atanmadı</span>
                      ) : (
                        <span className="badge success">Tamamı atandı</span>
                      )}
                    </div>
                    <div
                      style={{
                        display: 'flex', height: 26, borderRadius: 6, overflow: 'hidden',
                        background: 'var(--bg-input)', border: '1px solid var(--border)',
                      }}
                    >
                      {wo.own_share_pct > 0 ? (
                        <div
                          title={`Bizim ekibimiz: %${wo.own_share_pct}`}
                          style={{
                            width: `${wo.own_share_pct}%`, background: '#3b82f6',
                            display: 'grid', placeItems: 'center', color: '#fff',
                            fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden',
                          }}
                        >
                          %{wo.own_share_pct}
                        </div>
                      ) : null}
                      {wo.sub_share_pct > 0 ? (
                        <div
                          title={`Taşeron: %${wo.sub_share_pct}`}
                          style={{
                            width: `${wo.sub_share_pct}%`, background: '#f59e0b',
                            display: 'grid', placeItems: 'center', color: '#1a1207',
                            fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden',
                          }}
                        >
                          %{wo.sub_share_pct}
                        </div>
                      ) : null}
                    </div>
                    <div className="chart-legend" style={{ marginTop: 7 }}>
                      <span className="key">
                        <span className="swatch" style={{ background: '#3b82f6' }} /> Bizim ekibimiz:{' '}
                        {weightDisplay(wo.own_weight, wo.unit)} · {wo.labor_hours} saat · {money(wo.labor_cost)}
                      </span>
                      <span className="key">
                        <span className="swatch" style={{ background: '#f59e0b' }} /> Taşeron:{' '}
                        {weightDisplay(wo.sub_weight, wo.unit)} · {money(wo.subcontractor_cost)}
                      </span>
                    </div>
                    {wo.over_assigned ? (
                      <div className="alert warning" style={{ marginTop: 10, marginBottom: 0 }}>
                        Toplam ağırlık net miktarı aşıyor. Kendi ekibiniz ve taşeron kg değerlerini kontrol edin.
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {!wo.labor?.length ? (
                  <EmptyState
                    compact
                    icon={Users}
                    title="Kendi ekibiniz atanmamış"
                    description="Bu işi hangi çalışanlarınız yaptı, kaç saat sürdü? Girin; maliyet otomatik hesaplanır."
                  />
                ) : (
                  wo.labor.map((l) => (
                    <div className="list-row" key={l.id}>
                      <div className="grow">
                        <div className="title">{l.full_name}</div>
                        <div className="meta">
                          {l.position || '—'}
                          {l.hourly_rate ? ` · ${money(l.hourly_rate)}/sa` : ' · saat ücreti tanımlı değil'}
                          {l.work_date ? ` · ${dateFmt(l.work_date)}` : ''}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm">
                          {l.hours} saat{Number(l.weight) > 0 ? ` · ${number(l.weight)} kg` : ''}
                        </div>
                        <div className={`money text-sm ${l.cost > 0 ? '' : 'text-dim'}`}>{money(l.cost)}</div>
                      </div>
                      <button
                        className="btn btn-sm btn-icon"
                        title="Ekipten çıkar"
                        onClick={async () => {
                          try {
                            await api.del(`/work-orders/labor/${l.id}`);
                            toast.success('Ekipten çıkarıldı', l.full_name);
                            load();
                            onChanged();
                          } catch (err) {
                            toast.fromError(err, 'Silinemedi');
                          }
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="card mb-14">
              <div className="card-head">
                <HardHat size={15} style={{ color: 'var(--warning)' }} />
                <h3>Taşeronlar ({wo.subcontractor_jobs?.length || 0})</h3>
                <button className="btn btn-sm" onClick={() => setSubModal('assign')}>
                  <Plus size={13} />
                  Taşeron ata
                </button>
              </div>
              <div className="card-body">
                {!wo.subcontractor_jobs?.length ? (
                  <EmptyState compact icon={HardHat} title="Taşeron atanmamış" description="İşin bir kısmını taşerona verirseniz burada görünür." />
                ) : (
                  wo.subcontractor_jobs.map((j) => (
                    <div className="list-row" key={j.id}>
                      <div className="grow">
                        <div className="title">{j.subcontractor_name}</div>
                        <div className="meta">
                          {j.quantity ? `${number(j.quantity)} ${j.quantity_unit || ''} · ` : ''}
                          {j.assigned_date ? dateFmt(j.assigned_date) : ''}
                        </div>
                      </div>
                      <span className="money cell-muted">{money(j.cost)}</span>
                      <StatusBadge status={j.status === 'teslim_alindi' ? 'done' : j.status === 'calisiyor' ? 'in_progress' : 'todo'} size="sm" />
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="card mb-14">
              <div className="card-head">
                <Ban size={15} style={{ color: 'var(--danger)' }} />
                <h3>Erteleme Geçmişi ({wo.deferrals?.length || 0})</h3>
                <button className="btn btn-sm" onClick={() => setSubModal('defer')}>
                  <Plus size={13} />
                  Erteleme ekle
                </button>
              </div>
              <div className="card-body">
                {!wo.deferrals?.length ? (
                  <EmptyState compact title="Erteleme yok" />
                ) : (
                  wo.deferrals.map((d) => (
                    <div className="list-row" key={d.id}>
                      <div className="grow">
                        <div className="title">{reasonLabel(d.reason)}</div>
                        <div className="meta">
                          {d.previous_due_date ? `${dateFmt(d.previous_due_date)} → ` : ''}
                          {d.new_due_date ? dateFmt(d.new_due_date) : '-'}
                          {d.requested_by ? ` · ${d.requested_by}` : ''}
                        </div>
                      </div>
                      <span className={`badge ${d.approval_status === 'onaylandi' ? 'success' : d.approval_status === 'reddedildi' ? 'danger' : 'warning'}`}>
                        {DEFER_STATUS.find((x) => x.value === d.approval_status)?.label}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="card">
              <div className="card-head"><h3>Durum</h3></div>
              <div className="card-body">
                <div className="row row-wrap" style={{ gap: 6 }}>
                  {STATUS_OPTIONS.map((o) => (
                    <button key={o.value} className={`btn btn-sm ${wo.status === o.value ? 'btn-primary' : ''}`} onClick={() => setStatus(o.value)} disabled={wo.status === o.value}>
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </Modal>

      {subModal === 'material' && wo ? (
        <MaterialModal
          workOrder={wo}
          onClose={() => setSubModal(null)}
          onDone={() => {
            setSubModal(null);
            load();
            onChanged();
          }}
        />
      ) : null}

      {subModal === 'labor' && wo ? (
        <LaborModal
          workOrder={wo}
          employees={employees}
          onClose={() => setSubModal(null)}
          onDone={() => {
            setSubModal(null);
            load();
            onChanged();
          }}
        />
      ) : null}

      {subModal === 'assign' && wo ? (
        <AssignSubcontractorModal
          workOrder={wo}
          subs={subs}
          loading={loadingSubs}
          onClose={() => setSubModal(null)}
          onDone={() => { setSubModal(null); load(); onChanged(); reloadLookups(); }}
        />
      ) : null}

      {subModal === 'defer' && wo ? (
        <DeferModal workOrder={wo} onClose={() => setSubModal(null)} onDone={() => { setSubModal(null); load(); onChanged(); }} />
      ) : null}

      {subModal === 'invoice' && wo ? (
        <Modal
          open
          onClose={() => setSubModal(null)}
          title="Bu iş emri için fatura kes"
          size="sm"
          footer={
            <>
              <div className="spacer" />
              <button className="btn" onClick={() => setSubModal(null)} disabled={busy}>Vazgeç</button>
              <button className="btn btn-primary" onClick={createInvoice} disabled={busy}>
                {busy ? 'Kesiliyor...' : 'Faturayı kes'}
              </button>
            </>
          }
        >
          <div className="stat-row"><span className="label">İş emri</span><span className="value mono">{wo.number}</span></div>
          <div className="stat-row"><span className="label">Net miktar</span><span className="value">{number(wo.net_weight)} kg</span></div>
          <div className="stat-row"><span className="label">Birim fiyat</span><span className="value">{money(wo.unit_price)} / {wo.unit}</span></div>
          <div className="stat-row total"><span className="label">Fatura tutarı (KDV hariç)</span><span className="value money">{money(wo.amount)}</span></div>
          <div className="alert info" style={{ marginTop: 14, marginBottom: 0 }}>
            Fatura otomatik olarak bu müşteriye, bu net miktar ve fiyatla kesilir. Faturalar ekranından tahsilat kaydı girebilirsiniz.
          </div>
        </Modal>
      ) : null}
    </>
  );
}

function MaterialModal({ workOrder, onClose, onDone }) {
  const toast = useToast();
  const [products, setProducts] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/products', { is_active: 'true', limit: 300 })
      .then((r) => setProducts(r.data))
      .catch(() => setProducts([]));
  }, []);

  const fields = [
    {
      name: 'product_id',
      label: 'Ürün (stoktan seçin)',
      type: 'select',
      span: 2,
      options: products.map((p) => ({
        value: p.id,
        label: p.name,
        hint: `${p.sku || ''} · stok ${p.stock} ${p.unit} · ${money(p.unit_price)}`,
      })),
      hint: 'Seçersen ad, birim ve fiyat otomatik dolar.',
    },
    { name: 'description', label: 'Açıklama', span: 2, placeholder: 'Ürün seçmezseniz elle yazın' },
    { name: 'quantity', label: 'Miktar', type: 'number', min: 0, step: '0.01', required: true },
    { name: 'unit', label: 'Birim', defaultValue: workOrder.unit === 'Ton' ? 'Kg' : workOrder.unit },
    { name: 'unit_price', label: 'Birim alış fiyatı (₺)', type: 'money', min: 0 },
    { name: 'deduct_stock', label: 'Stoktan düş', type: 'checkbox', defaultValue: 1 },
  ];

  const form = useFormState(fields, {});
  const sec = products.find((p) => String(p.id) === String(form.values.product_id));
  const birimFiyat = Number(sec?.unit_price ?? form.values.unit_price ?? 0);
  const cost = Number(form.values.quantity || 0) * birimFiyat;

  const save = async () => {
    const v = form.submit();
    if (!v) return;
    if (!v.product_id && !String(v.description || '').trim()) {
      form.setErrors({ description: 'Ürün seçin ya da açıklama yazın' });
      return;
    }
    setBusy(true);
    try {
      await api.post('/work-orders/materials', {
        ...v,
        work_order_id: workOrder.id,
        unit_price: v.unit_price ?? sec?.unit_price ?? 0,
      });
      toast.success('Malzeme eklendi', sec ? `${sec.name} · ${money(cost)}` : '');
      onDone();
    } catch (err) {
      toast.fromError(err, 'Eklenemedi');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Alınan malzeme ekle"
      subtitle={workOrder.number}
      size="sm"
      footer={
        <>
          <div className="spacer" />
          <button className="btn" onClick={onClose} disabled={busy}>
            Vazgeç
          </button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? 'Kaydediliyor...' : 'Ekle'}
          </button>
        </>
      }
    >
      <div className="alert info" style={{ marginBottom: 14 }}>
        <Info size={15} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          Bu bölüm yalnızca <strong>dışarıdan satın aldığınız</strong> malzemeler içindir. Malzemeyi
          müşterinin tedarikçisinden alıyorsanız hiçbir şey girmeyin.
        </span>
      </div>

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

      {form.values.product_id ? (
        <div className="alert info" style={{ marginTop: 14, marginBottom: 0 }}>
          {sec?.name}: {form.values.quantity || 0} {form.values.unit || sec?.unit} × {money(birimFiyat)} ={' '}
          <strong>{money(cost)}</strong>
          {sec ? ` · mevcut stok ${sec.stock} ${sec.unit}` : ''}
        </div>
      ) : null}
    </Modal>
  );
}

function LaborModal({ workOrder, employees, onClose, onDone }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const fields = [
    {
      name: 'employee_id',
      label: 'Çalışan',
      type: 'select',
      required: true,
      span: 2,
      options: employees.map((e) => ({
        value: e.id,
        label: e.full_name,
        hint: e.hourly_rate ? `${money(e.hourly_rate)}/sa` : 'saat ücreti yok',
      })),
    },
    {
      name: 'hours',
      label: 'Çalışılan saat',
      type: 'number',
      min: 0,
      step: '0.5',
      required: true,
      hint: 'Maliyet = saat × saat ücreti',
    },
    {
      name: 'weight',
      label: 'Yaptığı miktar (kg)',
      type: 'number',
      min: 0,
      step: '1',
      hint: 'İşin bu kişiye düşen kısmı',
    },
    { name: 'work_date', label: 'Çalışma tarihi', type: 'date', defaultValue: todayIso() },
    { name: 'note', label: 'Not', type: 'textarea', span: 2, rows: 2 },
  ];

  const form = useFormState(fields, {});
  const sec = employees.find((e) => String(e.id) === String(form.values.employee_id));
  const cost = Number(sec?.hourly_rate || 0) * Number(form.values.hours || 0);

  const save = async () => {
    const v = form.submit();
    if (!v) return;
    setBusy(true);
    try {
      const res = await api.post('/work-orders/labor', { ...v, work_order_id: workOrder.id });
      if (res.warning) toast.warning('Dikkat', res.warning);
      else toast.success('Ekip eklendi', sec?.full_name || '');
      onDone();
    } catch (err) {
      toast.fromError(err, 'Eklenemedi');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Kendi ekibimden ekle"
      subtitle={`${workOrder.number} · net ${weightDisplay(workOrder.net_weight, workOrder.unit)}`}
      size="sm"
      footer={
        <>
          <div className="spacer" />
          <button className="btn" onClick={onClose} disabled={busy}>
            Vazgeç
          </button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? 'Kaydediliyor...' : 'Ekle'}
          </button>
        </>
      }
    >
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

      {sec ? (
        <div className="alert info" style={{ marginTop: 14, marginBottom: 0 }}>
          {sec.hourly_rate ? (
            <>
              {sec.full_name}: {money(sec.hourly_rate)}/sa × {form.values.hours || 0} saat ={' '}
              <strong>{money(cost)}</strong> maliyet
            </>
          ) : (
            <>
              <strong>{sec.full_name}</strong> için saat ücreti tanımlı değil — maliyet 0 hesaplanır.
              Çalışanlar ekranından saat ücreti girin.
            </>
          )}
        </div>
      ) : null}
    </Modal>
  );
}

function AssignSubcontractorModal({ workOrder, subs, loading, onClose, onDone }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const fields = [
    { name: 'subcontractor_id', label: 'Taşeron', type: 'select', required: true, span: 2, options: subs.map((s) => ({ value: s.id, label: s.name, hint: s.specialty })) },
    { name: 'assigned_date', label: 'Veriliş tarihi', type: 'date', defaultValue: todayIso() },
    { name: 'due_date', label: 'Teslim termin', type: 'date' },
    { name: 'quantity', label: 'Yaptığı miktar', type: 'number', min: 0, step: '0.001' },
    { name: 'quantity_unit', label: 'Birim', defaultValue: workOrder.unit || 'Ton' },
    { name: 'cost', label: 'Maliyet (₺)', type: 'money', min: 0 },
    { name: 'note', label: 'Not', type: 'textarea', span: 2, rows: 2 },
  ];
  const form = useFormState(fields, {});

  const save = async () => {
    const v = form.submit();
    if (!v) return;
    setBusy(true);
    try {
      await api.post('/subcontractors/jobs', { ...v, work_order_id: workOrder.id, status: 'gonderildi' });
      toast.success('Taşeron atandı');
      onDone();
    } catch (err) {
      toast.fromError(err, 'Atanamadı');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open onClose={onClose} title="Taşeron ata" subtitle={workOrder.number} size="sm"
      footer={<><div className="spacer" /><button className="btn" onClick={onClose} disabled={busy}>Vazgeç</button><button className="btn btn-primary" onClick={save} disabled={busy}>Ata</button></>}
    >
      {loading ? <div className="loading-page" style={{ padding: 20 }}><div className="spinner" /></div> : null}
      <div className="form-grid">
        {fields.map((f) => (
          <FormField key={f.name} field={f} value={form.values[f.name]} error={form.errors[f.name]} onChange={(v) => form.setValue(f.name, v)} disabled={busy} />
        ))}
      </div>
    </Modal>
  );
}

function DeferModal({ workOrder, onClose, onDone }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const fields = [
    { name: 'new_due_date', label: 'Yeni termin', type: 'date', required: true },
    { name: 'reason', label: 'Sebep', type: 'select', options: DEFER_REASONS, required: true, defaultValue: 'musteri_talebi' },
    { name: 'requested_by', label: 'Talep eden', placeholder: 'Örn. VuruşKAN' },
    { name: 'approval_status', label: 'Onay durumu', type: 'select', options: DEFER_STATUS, defaultValue: 'onaylandi' },
    { name: 'note', label: 'Not', type: 'textarea', span: 2, rows: 2 },
  ];
  const form = useFormState(fields, { new_due_date: workOrder.due_date || '' });

  const save = async () => {
    const v = form.submit();
    if (!v) return;
    setBusy(true);
    try {
      await api.post('/subcontractors/deferrals', { ...v, work_order_id: workOrder.id });
      toast.success('Erteleme kaydedildi');
      onDone();
    } catch (err) {
      toast.fromError(err, 'Kaydedilemedi');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open onClose={onClose} title="Erteleme ekle" subtitle={`${workOrder.number} · mevcut termin: ${dateFmt(workOrder.due_date)}`} size="sm"
      footer={<><div className="spacer" /><button className="btn" onClick={onClose} disabled={busy}>Vazgeç</button><button className="btn btn-primary" onClick={save} disabled={busy}>Kaydet</button></>}
    >
      <div className="form-grid">
        {fields.map((f) => (
          <FormField key={f.name} field={f} value={form.values[f.name]} error={form.errors[f.name]} onChange={(v) => form.setValue(f.name, v)} disabled={busy} />
        ))}
      </div>
    </Modal>
  );
}
