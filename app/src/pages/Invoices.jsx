import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Receipt, Plus, Search, Trash2, Pencil, RotateCcw, X, Wallet, Banknote,
  AlertTriangle, CreditCard, FileText, TrendingUp, Trash, Printer, ArrowLeft, Send,
} from 'lucide-react';
import {
  api, money, percent, dateFmt, dateTimeFmt, dueLabel, todayIso,
  getServerUrl, getToken,
  INVOICE_STATUS_OPTIONS, PAYMENT_METHOD_OPTIONS,
} from '../lib/api.js';
import { useLookups } from '../context/LookupsContext.jsx';
import { useCompany } from '../context/CompanyContext.jsx';
import { useCurrency } from '../context/CurrencyContext.jsx';
import { useLicense } from '../context/LicenseContext.jsx';
import { useToast } from '../components/Toast.jsx';
import { Modal, ConfirmDialog } from '../components/Modal.jsx';
import { StatusBadge } from '../components/StatusBadge.jsx';
import { ItemsEditor } from '../components/ItemsEditor.jsx';
import { DocumentSheet } from '../components/DocumentSheet.jsx';
import { FormField, useFormState } from '../components/Form.jsx';
import { PageHeader, Kpi, KpiMoney, EmptyState } from '../components/Primitives.jsx';
import { MiniTable } from '../components/DataTable.jsx';
import { InvoiceSendModal } from '../components/InvoiceSendModal.jsx';

const METHOD_ICONS = { nakit: Banknote, havale: Wallet, kredi_karti: CreditCard, cek: FileText, baska: Wallet };
const METHOD_LABELS = Object.fromEntries(PAYMENT_METHOD_OPTIONS.map((o) => [o.value, o.label]));

export default function Invoices() {
  const { customerOptions, projectOptions, productOptions, reload } = useLookups();
  const toast = useToast();

  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [editing, setEditing] = useState(null);
  const [detail, setDetail] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/invoices', {
        search: search || undefined,
        status,
        overdue: overdueOnly ? 'true' : undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        limit: 200,
      });
      setRows(res.data);
      setSummary(res.summary);
    } catch (err) {
      toast.fromError(err, 'Faturalar yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [search, status, overdueOnly, dateFrom, dateTo, toast]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const filtersActive = status !== 'all' || overdueOnly || search || dateFrom || dateTo;
  const clearFilters = () => {
    setStatus('all');
    setOverdueOnly(false);
    setSearch('');
    setDateFrom('');
    setDateTo('');
  };

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await api.del(`/invoices/${deleting.id}`);
      toast.success('Fatura silindi');
      setDeleting(null);
      load();
    } catch (err) {
      toast.fromError(err, 'Silinemedi');
    } finally {
      setBusy(false);
    }
  };

  // Vadesi gecmis sayimi: durum "Kısmi Tahsilat" oldugu icin status alanina
  // bakmak yetmez; vade + kalan bakiye birlikte degerlendirilir.
  const overdueRows = rows.filter(
    (r) => !['paid', 'cancelled', 'draft'].includes(r.status) && dueLabel(r.due_date).tone === 'over'
  );

  return (
    <>
      <PageHeader
        title="Faturalar ve Tahsilat"
        description="Fatura kesme, kısmi tahsilat ve alacak takibi"
        actions={
          <button className="btn btn-primary" onClick={() => setEditing('new')}>
            <Plus size={15} />
            Yeni Fatura
          </button>
        }
      />

      <div className="kpi-grid">
        <KpiMoney
          label="Listelenen (net)"
          value={summary?.invoiced}
          color="#3b82f6"
          icon={Receipt}
          sub={`${summary?.count ?? 0} fatura`}
        />
        <KpiMoney
          label="Tahsil edilen"
          value={summary?.paid}
          color="#22c55e"
          icon={Wallet}
          sub={summary?.invoiced > 0 ? `${percent((summary.paid / summary.invoiced) * 100, 0)} tahsilat` : '-'}
        />
        <KpiMoney
          label="Alacak"
          value={summary?.outstanding}
          color={summary?.outstanding > 0 ? '#f59e0b' : '#22c55e'}
          icon={TrendingUp}
          sub={summary?.outstanding > 0 ? 'Tahsilat bekliyor' : 'Borç yok'}
        />
        <Kpi
          label="Vadesi geçen"
          value={overdueRows.length}
          color="#ef4444"
          icon={AlertTriangle}
          sub={money(overdueRows.reduce((s, r) => s + Number(r.remaining || 0), 0))}
          onClick={() => setOverdueOnly(true)}
          small
        />
      </div>

      <div className="card mb-14">
        <div className="row row-wrap" style={{ gap: 9 }}>
          <div className="search-box">
            <Search size={14} />
            <input
              className="input"
              placeholder="Fatura no, müşteri veya not ara..."
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

          <select className="select filter-select" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">Tüm durumlar</option>
            {INVOICE_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          <button
            className={`btn btn-sm ${overdueOnly ? 'btn-danger' : ''}`}
            onClick={() => setOverdueOnly((v) => !v)}
          >
            <AlertTriangle size={13} />
            Vadesi geçenler
          </button>

          <div className="row" style={{ gap: 5 }}>
            <input
              type="date"
              className="input"
              style={{ width: 146 }}
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              title="Başlangıç tarihi"
            />
            <span className="text-dim">–</span>
            <input
              type="date"
              className="input"
              style={{ width: 146 }}
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              title="Bitiş tarihi"
            />
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
                <th>Fatura</th>
                <th>Müşteri / Proje</th>
                <th style={{ width: 122 }}>Durum</th>
                <th style={{ width: 104 }}>Kesim</th>
                <th style={{ width: 116 }}>Vade</th>
                <th style={{ width: 120, textAlign: 'right' }}>Tutar</th>
                <th style={{ width: 120, textAlign: 'right' }}>Kalan</th>
                <th className="col-actions">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 8 }).map((__, j) => (
                      <td key={j}>
                        <div style={{ height: 11, borderRadius: 3, background: 'var(--bg-hover)', opacity: 0.5 }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <EmptyState
                      icon={Receipt}
                      title="Fatura bulunamadı"
                      description={filtersActive ? 'Filtreleri değiştirmeyi deneyin.' : 'Kabul edilen teklifleri faturaya dönüştürebilir veya doğrudan fatura kesebilirsiniz.'}
                      action={
                        <button className="btn btn-primary" onClick={() => setEditing('new')}>
                          <Plus size={15} />
                          Yeni Fatura
                        </button>
                      }
                    />
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const due = dueLabel(r.due_date);
                  const late = r.status === 'overdue' || (r.status === 'issued' && due.tone === 'over');
                  return (
                    <tr key={r.id} className="row-link" onClick={() => setDetail(r)}>
                      <td>
                        <div className="cell-strong mono">{r.number}</div>
                        <div className="cell-dim">{r.item_count} kalem</div>
                      </td>
                      <td>
                        <div className="truncate" style={{ maxWidth: 210 }}>
                          {r.customer_name || '-'}
                        </div>
                        {r.project_name ? (
                          <div className="cell-dim truncate" style={{ maxWidth: 210 }}>
                            {r.project_name}
                          </div>
                        ) : null}
                      </td>
                      <td>
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="cell-muted nowrap">{dateFmt(r.issue_date)}</td>
                      <td className="nowrap">
                        {['paid', 'cancelled', 'draft'].includes(r.status) ? (
                          <span className="cell-dim">{dateFmt(r.due_date)}</span>
                        ) : (
                          <span className={late ? 'due-over' : due.tone === 'soon' ? 'due-soon' : ''}>
                            {late ? due.text : dateFmt(r.due_date)}
                          </span>
                        )}
                      </td>
                      <td className="col-num money">{money(r.total)}</td>
                      <td className="col-num money">
                        {Number(r.remaining) > 0 ? (
                          <span className={late ? 'neg' : ''}>{money(r.remaining)}</span>
                        ) : (
                          <span className="pos">-</span>
                        )}
                      </td>
                      <td className="col-actions" onClick={(e) => e.stopPropagation()}>
                        <div className="cell-actions">
                          <button className="btn btn-sm btn-icon" title="Düzenle" onClick={() => setEditing(r)}>
                            <Pencil size={14} />
                          </button>
                          <button className="btn btn-sm btn-icon" title="Sil" onClick={() => setDeleting(r)}>
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

      {editing ? (
        <InvoiceForm
          invoice={editing === 'new' ? null : editing}
          customerOptions={customerOptions}
          projectOptions={projectOptions}
          productOptions={productOptions}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
            reload();
          }}
        />
      ) : null}

      {detail ? (
        <InvoiceDetail
          invoiceId={detail.id}
          productOptions={productOptions}
          onClose={() => setDetail(null)}
          onEdit={(inv) => {
            setDetail(null);
            setEditing(inv);
          }}
          onChanged={() => {
            load();
            reload();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        busy={busy}
        title="Fatura silinsin mi?"
        message={
          deleting
            ? `${deleting.number} numaralı fatura ve tüm kalemleri kalıcı olarak silinecek.\n\nBu işlem geri alınamaz.`
            : ''
        }
      />
    </>
  );
}

// =========================================================================
// FATURA FORMU
// =========================================================================

function InvoiceForm({ invoice, customerOptions, projectOptions, productOptions, onClose, onSaved }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState(
    invoice?.items?.length
      ? invoice.items.map((i) => ({
          product_id: i.product_id,
          description: i.description,
          quantity: i.quantity,
          unit: i.unit,
          unit_price: i.unit_price,
        }))
      : [{ product_id: null, description: '', quantity: 1, unit: 'Adet', unit_price: 0 }]
  );
  const [discount, setDiscount] = useState(invoice?.discount ?? 0);
  // Vergi orani: fatura kendi oranini tasir; YOKSA firma profilindeki
  // varsayilandan gelir. Onceki kod `?? 20` yaziyordu — profil degisse bile
  // her fatura %20 kesiliyordu. (Bu hata yapildi, duzeltildi.)
  const { taxRate: varsayilanVergi } = useCompany();
  const [taxRate, setTaxRate] = useState(
    invoice?.tax_rate ?? varsayilanVergi ?? 20
  );
  const { options: paraOptions } = useCurrency();

  const fields = useMemo(
    () => [
      { name: 'number', label: 'Fatura no', placeholder: 'Boş bırakılırsa otomatik üretilir' },
      { name: 'status', label: 'Durum', type: 'select', options: INVOICE_STATUS_OPTIONS, defaultValue: 'issued' },
      { name: 'customer_id', label: 'Müşteri', type: 'select', options: customerOptions, required: true },
      { name: 'project_id', label: 'İlgili proje', type: 'select', options: projectOptions },
      { name: 'issue_date', label: 'Fatura tarihi', type: 'date', defaultValue: todayIso() },
      { name: 'due_date', label: 'Vade tarihi', type: 'date' },
      {
        name: 'currency',
        label: 'Para birimi',
        type: 'select',
        options: paraOptions,
        defaultValue: 'TRY',
        hint: 'Tutar bu birimde saklanır, TL karşılığı kurdan hesaplanır',
      },
      {
        name: 'exchange_rate',
        label: 'Kur (1 birim = ? TL)',
        type: 'number',
        min: 0,
        step: '0.0001',
        defaultValue: 1,
        hint: 'Boş bırakılırsa o tarihe ait son kayıtlı kur kullanılır',
      },
      { name: 'notes', label: 'Notlar', type: 'textarea', span: 2, rows: 2 },
    ],
    [customerOptions, projectOptions, paraOptions]
  );

  const initial = useMemo(() => {
    const base = { issue_date: todayIso(), status: 'issued' };
    if (invoice) {
      for (const f of fields) {
        if (f.name in invoice) base[f.name] = invoice[f.name] ?? '';
      }
    }
    return base;
  }, [invoice, fields]);

  const form = useFormState(fields, initial);

  const save = async () => {
    const values = form.submit();
    if (!values) return;

    const cleanItems = items
      .filter((i) => i.description.trim())
      .map((i) => ({
        product_id: i.product_id || null,
        description: i.description.trim(),
        quantity: Number(i.quantity) || 1,
        unit: i.unit || 'Adet',
        unit_price: Number(i.unit_price) || 0,
      }));

    if (!cleanItems.length) {
      toast.error('Kalem eksik', 'En az bir açıklamalı kalem ekleyin.');
      return;
    }

    setBusy(true);
    try {
      const payload = { ...values, discount: Number(discount) || 0, tax_rate: Number(taxRate) || 0, items: cleanItems };
      if (invoice) await api.put(`/invoices/${invoice.id}`, payload);
      else await api.post('/invoices', payload);
      toast.success(invoice ? 'Fatura güncellendi' : 'Fatura kesildi');
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
      size="xl"
      title={invoice ? 'Fatura düzenle' : 'Yeni fatura'}
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
      <div className="form-section">
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
      </div>

      <div className="form-section" style={{ marginBottom: 0 }}>
        <div className="form-section-title">Kalemler</div>
        <ItemsEditor
          items={items}
          onChange={setItems}
          productOptions={productOptions}
          discount={discount}
          taxRate={taxRate}
          onDiscountChange={setDiscount}
          onTaxRateChange={setTaxRate}
        />
      </div>
    </Modal>
  );
}

// =========================================================================
// FATURA DETAYI + TAHSILAT
// =========================================================================

function InvoiceDetail({ invoiceId, productOptions, onClose, onEdit, onChanged }) {
  const toast = useToast();
  const { company, taxRate, paymentTermDays } = useCompany();
  const { bilgi: lisans } = useLicense();
  const demo = !!lisans?.demo;
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [printMode, setPrintMode] = useState(false);
  const [sending, setSending] = useState(false);

  /** PDF'i indir (e-posta gondermeden). */
  const pdfIndir = useCallback(async () => {
    try {
      // PDF icin fetch: api.raw JSON'a cevirmeye calisir ve bozulur
      const r = await fetch(`${getServerUrl()}/api/invoices/${invoiceId}/pdf?indir=1`, {
        headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
      });
      if (!r.ok) {
        const veri = await r.json().catch(() => null);
        throw new Error(veri?.error || `Sunucu ${r.status} döndü`);
      }
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `Fatura-${invoice?.number || invoiceId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('PDF indirildi');
    } catch (err) {
      toast.fromError(err, 'PDF oluşturulamadı');
    }
  }, [invoiceId, invoice?.number, toast]);

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/invoices/${invoiceId}`);
      setInvoice(res.data);
    } catch (err) {
      toast.fromError(err, 'Fatura yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [invoiceId, toast]);

  useEffect(() => {
    load();
  }, [load]);

  // Belge degistiginde yazdirma modundan cikilir (aksi halde yeni belgede
  // yazdirma onizlemesinde kalir).
  useEffect(() => {
    setPrintMode(false);
  }, [invoiceId]);

  const remaining = Number(invoice?.remaining ?? 0);
  const canPay = invoice && !['cancelled', 'draft', 'paid'].includes(invoice.status) && remaining > 0;

  return (
    <>
      <Modal
        open
        onClose={onClose}
        size={printMode ? 'xl' : 'lg'}
        title={printMode ? undefined : invoice?.number || 'Fatura'}
        subtitle={printMode ? undefined : invoice?.customer_name}
        footer={
          printMode ? null : (
            <>
              <button className="btn" onClick={() => onEdit(invoice)}>
                <Pencil size={14} />
                Düzenle
              </button>
              {canPay ? (
                <button className="btn btn-primary" onClick={() => setPaying(true)}>
                  <Wallet size={14} />
                  Tahsilat al
                </button>
              ) : null}
              <div className="spacer" />
              <button className="btn" onClick={pdfIndir} title="PDF olarak indir">
                <FileText size={14} />
                PDF
              </button>
              <button
                className="btn"
                onClick={() => setSending(true)}
                title="E-posta ile gönder"
              >
                <Send size={14} />
                Gönder
              </button>
              <button className="btn" onClick={() => setPrintMode(true)}>
                <Printer size={14} />
                Yazdır
              </button>
              <button className="btn" onClick={onClose}>
                Kapat
              </button>
            </>
          )
        }
      >
        {loading || !invoice ? (
          <div className="loading-page">
            <div className="spinner lg" />
          </div>
        ) : printMode ? (
          <div className="stack">
            <div className="row doc-no-print">
              <span className="text-dim text-sm">
                Yazdırma önizlemesi — çıktıda yalnızca evrak basılır.
              </span>
              <div className="spacer" />
              <button className="btn btn-sm" onClick={() => setPrintMode(false)}>
                <ArrowLeft size={13} />
                Geri dön
              </button>
              <button className="btn btn-sm btn-primary" onClick={() => window.print()}>
                <Printer size={13} />
                Yazdır / PDF olarak kaydet
              </button>
            </div>
            <DocumentSheet kind="invoice" doc={invoice} company={company} demo={demo} />
          </div>
        ) : (
          <>
            <div className="row row-wrap mb-14" style={{ gap: 7 }}>
              <StatusBadge status={invoice.status} />
              <span className="badge muted">Kesim: {dateFmt(invoice.issue_date)}</span>
              {invoice.due_date ? <span className="badge info">Vade: {dateFmt(invoice.due_date)}</span> : null}
              {invoice.project_name ? <span className="badge purple">{invoice.project_name}</span> : null}
            </div>

            <div className="grid-2-1 mb-14">
              <div className="form-section" style={{ marginBottom: 0 }}>
                <div className="form-section-title">Kalemler</div>
                <ItemsEditor
                  items={invoice.items}
                  onChange={() => {}}
                  productOptions={productOptions}
                  readOnly
                  discount={invoice.discount}
                  taxRate={invoice.tax_rate}
                />
              </div>

              <div className="card">
                <div className="card-head">
                  <h3>Tahsilat</h3>
                </div>
                <div className="card-body">
                  <div className="stat-row">
                    <span className="label">Fatura tutarı</span>
                    <span className="value">{money(invoice.total)}</span>
                  </div>
                  <div className="stat-row">
                    <span className="label">Tahsil edilen</span>
                    <span className="value money pos">{money(invoice.paid_amount)}</span>
                  </div>
                  <div className="stat-row total">
                    <span className="label">Kalan</span>
                    <span className={`value money ${remaining > 0 ? 'neg' : 'pos'}`}>{money(remaining)}</span>
                  </div>

                  {remaining > 0 ? (
                    <div className="progress" style={{ marginTop: 12 }}>
                      <div
                        className="progress-fill success"
                        style={{ width: `${invoice.total > 0 ? Math.min((invoice.paid_amount / invoice.total) * 100, 100) : 0}%` }}
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-head">
                <h3>Ödeme Kayıtları ({invoice.payments?.length || 0})</h3>
              </div>
              <div className="card-body">
                {invoice.payments?.length ? (
                  <MiniTable
                    rows={invoice.payments}
                    columns={[
                      {
                        key: 'payment_date',
                        header: 'Tarih',
                        render: (p) => (
                          <span className="row" style={{ gap: 6 }}>
                            {(() => {
                              const Icon = METHOD_ICONS[p.method] || Wallet;
                              return <Icon size={13} style={{ color: 'var(--text-dim)' }} />;
                            })()}
                            {dateFmt(p.payment_date)}
                          </span>
                        ),
                      },
                      { key: 'method', header: 'Yöntem', render: (p) => METHOD_LABELS[p.method] || p.method || '-' },
                      { key: 'amount', header: 'Tutar', align: 'right', render: (p) => <span className="money pos">{money(p.amount)}</span> },
                      { key: 'user_name', header: 'Kaydeden', render: (p) => <span className="cell-dim">{p.user_name || '—'}</span> },
                      { key: 'note', header: 'Not', render: (p) => <span className="cell-dim">{p.note || '-'}</span> },
                      {
                        key: 'id',
                        header: '',
                        align: 'right',
                        render: (p) => (
                          <button
                            className="btn btn-sm btn-icon"
                            title="Tahsilatı geri al"
                            onClick={async () => {
                              try {
                                await api.del(`/invoices/${invoice.id}/payments/${p.id}`);
                                toast.success('Tahsilat kaydı silindi');
                                load();
                                onChanged();
                              } catch (err) {
                                toast.fromError(err, 'Silinemedi');
                              }
                            }}
                          >
                            <Trash size={13} />
                          </button>
                        ),
                      },
                    ]}
                  />
                ) : (
                  <EmptyState compact icon={Wallet} title="Tahsilat kaydı yok" />
                )}
              </div>
            </div>

            {invoice.notes ? (
              <div className="alert info" style={{ marginTop: 14, marginBottom: 0 }}>
                {invoice.notes}
              </div>
            ) : null}
          </>
        )}
      </Modal>

      {paying && invoice ? (
        <PaymentModal
          invoice={invoice}
          onClose={() => setPaying(false)}
          onDone={() => {
            setPaying(false);
            load();
            onChanged();
          }}
        />
      ) : null}

      {sending && invoice ? (
        <InvoiceSendModal invoice={invoice} onClose={() => setSending(false)} />
      ) : null}
    </>
  );
}

function PaymentModal({ invoice, onClose, onDone }) {
  const toast = useToast();
  const remaining = Number(invoice.remaining ?? 0);

  const fields = [
    { name: 'amount', label: 'Tutar (₺)', type: 'money', required: true, min: 0, step: '0.01' },
    { name: 'method', label: 'Ödeme yöntemi', type: 'select', options: PAYMENT_METHOD_OPTIONS, required: true, defaultValue: 'havale' },
    { name: 'payment_date', label: 'Tarih', type: 'date', required: true, defaultValue: todayIso() },
    { name: 'reference', label: 'Dekont / referans no' },
    { name: 'note', label: 'Açıklama', type: 'textarea', span: 2, rows: 2 },
  ];

  const form = useFormState(fields, { amount: remaining.toFixed(2) });
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const values = form.submit();
    if (!values) return;
    setBusy(true);
    try {
      await api.post(`/invoices/${invoice.id}/payments`, values);
      toast.success('Tahsilat kaydedildi', `${money(values.amount)} tahsil edildi.`);
      onDone();
    } catch (err) {
      toast.fromError(err, 'Tahsilat kaydedilemedi');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Tahsilat al"
      subtitle={`${invoice.number} · Kalan ${money(remaining)}`}
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
      <div className="alert info" style={{ marginBottom: 14 }}>
        Kalan tutar: <strong>{money(remaining)}</strong>. Tutarı değiştirerek kısmi tahsilat girebilirsiniz.
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
    </Modal>
  );
}

export { dateTimeFmt };
