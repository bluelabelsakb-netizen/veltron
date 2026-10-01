import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText, Plus, Search, Trash2, Receipt, Pencil, RotateCcw, X, Send, CheckCircle2, XCircle,
  Printer, ArrowLeft,
} from 'lucide-react';
import { api, money, dateFmt, statusLabel, statusTone, QUOTE_STATUS_OPTIONS } from '../lib/api.js';
import { useLookups } from '../context/LookupsContext.jsx';
import { useCompany } from '../context/CompanyContext.jsx';
import { useLicense } from '../context/LicenseContext.jsx';
import { useToast } from '../components/Toast.jsx';
import { Modal, ConfirmDialog } from '../components/Modal.jsx';
import { StatusBadge } from '../components/StatusBadge.jsx';
import { ItemsEditor } from '../components/ItemsEditor.jsx';
import { DocumentSheet } from '../components/DocumentSheet.jsx';
import { FormField, useFormState } from '../components/Form.jsx';
import { PageHeader, Kpi, KpiMoney, EmptyState } from '../components/Primitives.jsx';
import { todayIso } from '../lib/api.js';

export default function Quotes() {
  const { customerOptions, projectOptions, productOptions, reload } = useLookups();
  const toast = useToast();
  const navigate = useNavigate();

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [editing, setEditing] = useState(null);
  const [detail, setDetail] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/quotes', { search: search || undefined, status, limit: 200 });
      setRows(res.data);
      setTotal(res.total);
    } catch (err) {
      toast.fromError(err, 'Teklifler yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [search, status, toast]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const stats = useMemo(() => {
    const byStatus = { draft: 0, sent: 0, accepted: 0, rejected: 0, expired: 0 };
    let acceptedValue = 0;
    let pendingValue = 0;
    for (const r of rows) {
      byStatus[r.status] = (byStatus[r.status] || 0) + 1;
      if (r.status === 'accepted') acceptedValue += Number(r.total || 0);
      if (r.status === 'sent') pendingValue += Number(r.total || 0);
    }
    return { byStatus, acceptedValue, pendingValue };
  }, [rows]);

  const changeStatus = async (quote, next) => {
    try {
      await api.patch(`/quotes/${quote.id}/status`, { status: next });
      toast.success('Teklif durumu güncellendi', `${quote.number} → ${statusLabel(next)}`);
      load();
    } catch (err) {
      toast.fromError(err, 'Güncellenemedi');
    }
  };

  const convert = async (quote) => {
    setBusy(true);
    try {
      const res = await api.post(`/quotes/${quote.id}/convert-to-invoice`);
      toast.success('Faturaya dönüştürüldü', `${res.data.number} numaralı fatura oluşturuldu.`);
      setDetail(null);
      navigate('/faturalar');
    } catch (err) {
      toast.fromError(err, 'Dönüştürülemedi');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await api.del(`/quotes/${deleting.id}`);
      toast.success('Teklif silindi');
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
        title="Teklifler"
        description="Fiyat teklifleri, onay durumu ve faturaya dönüştürme"
        actions={
          <button className="btn btn-primary" onClick={() => setEditing('new')}>
            <Plus size={15} />
            Yeni Teklif
          </button>
        }
      />

      <div className="kpi-grid">
        <Kpi label="Teklif sayısı" value={total} color="#3b82f6" icon={FileText} />
        <Kpi label="Gönderilmiş" value={stats.byStatus.sent} color="#06b6d4" icon={Send} small />
        <Kpi label="Kabul edilen" value={stats.byStatus.accepted} color="#22c55e" icon={CheckCircle2} sub={money(stats.acceptedValue)} small />
        <KpiMoney label="Bekleyen tutar" value={stats.pendingValue} color="#f59e0b" icon={ClockIcon} sub="Müşteri yanıtı bekliyor" small />
        <Kpi label="Reddedilen" value={stats.byStatus.rejected} color="#ef4444" icon={XCircle} small />
      </div>

      <div className="card mb-14">
        <div className="row row-wrap" style={{ gap: 9 }}>
          <div className="search-box">
            <Search size={14} />
            <input
              className="input"
              placeholder="Teklif no, başlık veya müşteri ara..."
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
            {QUOTE_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {status !== 'all' || search ? (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setStatus('all');
                setSearch('');
              }}
            >
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
                <th>Teklif</th>
                <th>Müşteri</th>
                <th style={{ width: 124 }}>Durum</th>
                <th style={{ width: 106 }}>Tarih</th>
                <th style={{ width: 96 }}>Geçerlilik</th>
                <th style={{ width: 128, textAlign: 'right' }}>Tutar</th>
                <th style={{ width: 62, textAlign: 'right' }}>Kalem</th>
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
                      icon={FileText}
                      title="Teklif bulunamadı"
                      description={search || status !== 'all' ? 'Filtreleri değiştirmeyi deneyin.' : 'Müşterilerinize fiyat teklifi oluşturmak için ilk teklifi ekleyin.'}
                      action={
                        <button className="btn btn-primary" onClick={() => setEditing('new')}>
                          <Plus size={15} />
                          Yeni Teklif
                        </button>
                      }
                    />
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="row-link" onClick={() => setDetail(r)}>
                    <td>
                      <div className="cell-strong mono">{r.number}</div>
                      <div className="cell-dim truncate" style={{ maxWidth: 240 }}>
                        {r.title || '—'}
                      </div>
                    </td>
                    <td>
                      <div className="truncate" style={{ maxWidth: 190 }}>
                        {r.customer_name || '-'}
                      </div>
                      {r.project_name ? <div className="cell-dim truncate" style={{ maxWidth: 190 }}>{r.project_name}</div> : null}
                    </td>
                    <td>
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="cell-muted nowrap">{dateFmt(r.issue_date)}</td>
                    <td className="cell-dim nowrap">{dateFmt(r.valid_until)}</td>
                    <td className="col-num money">{money(r.total)}</td>
                    <td className="col-num cell-dim">{r.item_count}</td>
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
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ---- Teklif formu ---- */}
      {editing ? (
        <QuoteForm
          quote={editing === 'new' ? null : editing}
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

      {/* ---- Teklif detayi ---- */}
      {detail ? (
        <QuoteDetail
          quoteId={detail.id}
          onClose={() => setDetail(null)}
          onEdit={(q) => {
            setDetail(null);
            setEditing(q);
          }}
          onStatusChange={changeStatus}
          onConvert={convert}
          busy={busy}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        busy={busy}
        title="Teklif silinsin mi?"
        message={deleting ? `${deleting.number} numaralı teklif ve tüm kalemleri kalıcı olarak silinecek.\n\nBu işlem geri alınamaz.` : ''}
      />
    </>
  );
}

function ClockIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

// =========================================================================
// TEKLIF FORMU
// =========================================================================

function QuoteForm({ quote, customerOptions, projectOptions, productOptions, onClose, onSaved }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState(
    quote?.items?.length
      ? quote.items.map((i) => ({
          product_id: i.product_id,
          description: i.description,
          quantity: i.quantity,
          unit: i.unit,
          unit_price: i.unit_price,
        }))
      : [{ product_id: null, description: '', quantity: 1, unit: 'Adet', unit_price: 0 }]
  );
  const [discount, setDiscount] = useState(quote?.discount ?? 0);
  // Ortam vergi oranindan gelsin — `?? 20` sabiti yanlislikti.
  const { taxRate: varsayilanVergi } = useCompany();
  const [taxRate, setTaxRate] = useState(quote?.tax_rate ?? varsayilanVergi ?? 20);

  const fields = useMemo(
    () => [
      { name: 'number', label: 'Teklif no', placeholder: 'Boş bırakılırsa otomatik üretilir' },
      { name: 'title', label: 'Teklif konusu', placeholder: 'Örn. Pano yenileme' },
      { name: 'customer_id', label: 'Müşteri', type: 'select', options: customerOptions, required: true },
      { name: 'project_id', label: 'İlgili proje', type: 'select', options: projectOptions },
      { name: 'status', label: 'Durum', type: 'select', options: QUOTE_STATUS_OPTIONS, defaultValue: 'draft' },
      { name: 'issue_date', label: 'Teklif tarihi', type: 'date', defaultValue: todayIso() },
      { name: 'valid_until', label: 'Geçerlilik', type: 'date' },
      { name: 'notes', label: 'Notlar', type: 'textarea', span: 2, rows: 2 },
    ],
    [customerOptions, projectOptions]
  );

  const initial = useMemo(() => {
    const base = {
      issue_date: todayIso(),
      status: 'draft',
      discount: 0,
      // Sabit 20 degil, firma profilindeki varsayilandan gelsin.
      tax_rate: varsayilanVergi ?? 20,
    };
    if (quote) {
      for (const f of fields) {
        if (f.name in quote) base[f.name] = quote[f.name] ?? '';
      }
    }
    return base;
  }, [quote, fields]);

  const form = useFormState(fields, initial);

  const save = async () => {
    const values = form.submit();
    if (!values) return;

    if (!items.length || items.every((i) => !i.description.trim())) {
      toast.error('Kalem eksik', 'En az bir açıklamalı kalem ekleyin.');
      return;
    }
    const cleanItems = items
      .filter((i) => i.description.trim())
      .map((i) => ({
        product_id: i.product_id || null,
        description: i.description.trim(),
        quantity: Number(i.quantity) || 1,
        unit: i.unit || 'Adet',
        unit_price: Number(i.unit_price) || 0,
      }));

    setBusy(true);
    try {
      const payload = { ...values, discount: Number(discount) || 0, tax_rate: Number(taxRate) || 0, items: cleanItems };
      if (quote) await api.put(`/quotes/${quote.id}`, payload);
      else await api.post('/quotes', payload);
      toast.success(quote ? 'Teklif güncellendi' : 'Teklif oluşturuldu');
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
      title={quote ? 'Teklif düzenle' : 'Yeni teklif'}
      subtitle={quote ? <span className="mono">{quote.number}</span> : 'Kalemleri ekleyerek fiyatlandırın'}
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
// TEKLIF DETAYI
// =========================================================================

function QuoteDetail({ quoteId, onClose, onEdit, onStatusChange, onConvert, busy }) {
  // Kalem satirlari salt okunur gosterilir; urun kodlari icin referans gerekir.
  const { productOptions } = useLookups();
  const { company } = useCompany();
  const { bilgi: lisans } = useLicense();
  const demo = !!lisans?.demo;
  const [quote, setQuote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [printMode, setPrintMode] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await api.get(`/quotes/${quoteId}`);
        if (alive) setQuote(res.data);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [quoteId]);

  // Belge degistiginde yazdirma modundan cikilir.
  useEffect(() => {
    setPrintMode(false);
  }, [quoteId]);

  // Taslak teklif faturaya donusturulemez (sunucu da ayrica engeller).
  // Daha once donusturulmus teklifler icin sunucu 409 doner.
  const convertible = quote && quote.status !== 'draft';

  return (
    <Modal
      open
      onClose={onClose}
      size={printMode ? 'xl' : 'lg'}
      title={printMode ? undefined : quote?.number || 'Teklif'}
      subtitle={printMode ? undefined : quote?.title}
      footer={
        printMode ? null : (
          <>
            <button className="btn" onClick={() => onEdit(quote)}>
              <Pencil size={14} />
              Düzenle
            </button>
            {convertible ? (
              <button className="btn btn-primary" onClick={() => onConvert(quote)} disabled={busy}>
                <Receipt size={14} />
                Faturaya dönüştür
              </button>
            ) : null}
            <div className="spacer" />
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
      {loading || !quote ? (
        <div className="loading-page">
          <div className="spinner lg" />
        </div>
      ) : printMode ? (
        <div className="stack">
          <div className="row doc-no-print">
            <span className="text-dim text-sm">Yazdırma önizlemesi — çıktıda yalnızca evrak basılır.</span>
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
          <DocumentSheet kind="quote" doc={quote} company={company} demo={demo} />
        </div>
      ) : (
        <>
          <div className="row row-wrap mb-14" style={{ gap: 7 }}>
            <StatusBadge status={quote.status} />
            <span className="badge muted">Teklif tarihi: {dateFmt(quote.issue_date)}</span>
            {quote.valid_until ? <span className="badge info">Geçerlilik: {dateFmt(quote.valid_until)}</span> : null}
            {quote.project_name ? <span className="badge purple">{quote.project_name}</span> : null}
          </div>

          <div className="card mb-14">
            <div className="card-head">
              <h3>Müşteri</h3>
            </div>
            <div className="card-body">
              <div className="grid-2">
                <div>
                  <div className="stat-row">
                    <span className="label">Ünvan</span>
                    <span className="value">{quote.customer_name || '-'}</span>
                  </div>
                  <div className="stat-row">
                    <span className="label">Yetkili</span>
                    <span className="value">{quote.customer_contact || '-'}</span>
                  </div>
                </div>
                <div>
                  <div className="stat-row">
                    <span className="label">Şehir</span>
                    <span className="value">{quote.customer_city || '-'}</span>
                  </div>
                  <div className="stat-row">
                    <span className="label">Proje</span>
                    <span className="value">{quote.project_name || '-'}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="form-section">
            <div className="form-section-title">Kalemler</div>
            <ItemsEditor
              items={quote.items}
              onChange={() => {}}
              productOptions={productOptions}
              readOnly
              discount={quote.discount}
              taxRate={quote.tax_rate}
            />
          </div>

          {quote.notes ? (
            <div className="alert info" style={{ marginTop: 14, marginBottom: 0 }}>
              {quote.notes}
            </div>
          ) : null}

          <div className="form-section" style={{ marginTop: 18, marginBottom: 10 }}>
            <div className="form-section-title">Durumu değiştir</div>
            <div className="row row-wrap" style={{ gap: 6 }}>
              {QUOTE_STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  className={`btn btn-sm ${quote.status === opt.value ? 'btn-primary' : ''}`}
                  onClick={() => onStatusChange(quote, opt.value)}
                  disabled={quote.status === opt.value}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}
