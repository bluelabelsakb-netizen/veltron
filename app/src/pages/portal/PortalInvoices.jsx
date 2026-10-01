/**
 * MUSTERI PORTALI - FATURALAR
 * Yalnizca `customer_finance` rolu acabilir.
 *
 * KURAL: Is detayi, tartim, musteri notlari BURADA GORUNMEZ. Sadece mali
 * evrak: fatura kalemleri, tutarlar, odemeler.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileText, Wallet, AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { api, dateFmt, money, number } from '../../lib/api.js';
import { useToast } from '../../components/Toast.jsx';
import { EmptyState, InlineLoading, Kpi, KpiMoney, PageHeader } from '../../components/Primitives.jsx';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { Modal } from '../../components/Modal.jsx';

function InvoiceDetail({ invoice, onClose }) {
  return (
    <Modal
      open
      onClose={onClose}
      title={`Fatura ${invoice.number}`}
      subtitle={`${dateFmt(invoice.issue_date)} · ${invoice.customer_name || ''}`}
      footer={
        <>
          <div className="spacer" />
          <button className="btn btn-primary" onClick={onClose}>
            Kapat
          </button>
        </>
      }
    >
      <div className="stat-row">
        <span className="label">Ara toplam</span>
        <span className="value money">{money(invoice.subtotal)}</span>
      </div>
      {invoice.discount ? (
        <div className="stat-row">
          <span className="label">İndirim</span>
          <span className="value money neg">-{money(invoice.discount)}</span>
        </div>
      ) : null}
      <div className="stat-row">
        <span className="label">KDV (%{invoice.tax_rate})</span>
        <span className="value money">{money(invoice.tax)}</span>
      </div>
      <div className="stat-row total">
        <span className="label">Toplam</span>
        <span className="value money">{money(invoice.total)}</span>
      </div>
      <div className="stat-row">
        <span className="label">Ödenen</span>
        <span className="value money">{money(invoice.paid_amount)}</span>
      </div>
      <div className="stat-row">
        <span className="label">Kalan bakiye</span>
        <span
          className="value money"
          style={{ color: invoice.remaining > 0 ? '#f87171' : '#4ade80', fontWeight: 700 }}
        >
          {money(invoice.remaining)}
        </span>
      </div>

      <h4 style={{ margin: '18px 0 8px' }}>Fatura kalemleri</h4>
      <div className="card">
        <div className="list">
          {(invoice.items || []).map((it, i) => (
            <div className="list-row" key={i}>
              <div className="grow">
                <div className="title">{it.description}</div>
                <div className="meta">
                  {number(it.quantity)} {it.unit || ''} × {money(it.unit_price)}
                </div>
              </div>
              <span className="money">{money((it.quantity || 0) * (it.unit_price || 0))}</span>
            </div>
          ))}
        </div>
      </div>

      {(invoice.payments || []).length ? (
        <>
          <h4 style={{ margin: '18px 0 8px' }}>Ödemeler</h4>
          <div className="card">
            <div className="list">
              {invoice.payments.map((p, i) => (
                <div className="list-row" key={i}>
                  <div className="grow">
                    <div className="title">{dateFmt(p.payment_date)}</div>
                    <div className="meta">{p.method}</div>
                  </div>
                  <span className="money">{money(p.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </Modal>
  );
}

export function PortalInvoices() {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/portal/invoices');
      setRows(res.data);
    } catch (err) {
      toast.fromError(err, 'Faturalar yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const openDetail = async (id) => {
    setDetailLoading(true);
    try {
      const res = await api.get(`/portal/invoices/${id}`);
      setDetail(res.data);
    } catch (err) {
      toast.fromError(err, 'Fatura açılamadı');
    } finally {
      setDetailLoading(false);
    }
  };

  const totals = useMemo(() => {
    const total = rows.reduce((s, r) => s + Number(r.total || 0), 0);
    const paid = rows.reduce((s, r) => s + Number(r.paid_amount || 0), 0);
    const remaining = rows.reduce((s, r) => s + Number(r.remaining || 0), 0);
    return { total, paid, remaining };
  }, [rows]);

  if (loading) return <InlineLoading />;

  return (
    <>
      <PageHeader title="Faturalarım" description="Firmanıza kesilen faturalar ve bakiye durumu" />

      <div className="grid grid-3 mb-14">
        <Kpi label="Toplam fatura" value={number(rows.length)} icon={FileText} />
        <KpiMoney label="Faturalanan" value={totals.total} color="var(--primary)" icon={Wallet} />
        <KpiMoney
          label="Ödenmemiş"
          value={totals.remaining}
          color={totals.remaining > 0 ? 'var(--danger)' : 'var(--success)'}
          icon={totals.remaining > 0 ? AlertCircle : CheckCircle2}
        />
      </div>

      {!rows.length ? (
        <div className="card">
          <EmptyState
            icon={FileText}
            title="Henüz fatura yok"
            description="Firmanıza kesilen faturalar burada listelenecek."
          />
        </div>
      ) : (
        <div className="card">
          <div className="list">
            {rows.map((inv) => (
              <div
                className="list-row"
                key={inv.id}
                onClick={() => openDetail(inv.id)}
                style={{ cursor: 'pointer' }}
              >
                <div className="grow">
                  <div className="row-between">
                    <span className="title mono">{inv.number}</span>
                    <StatusBadge status={inv.status} size="sm" />
                  </div>
                  <div className="meta">
                    {dateFmt(inv.issue_date)}
                    {inv.due_date ? ` · Vade ${dateFmt(inv.due_date)}` : ''}
                  </div>
                </div>
                <div className="row gap-12">
                  <div style={{ textAlign: 'right' }}>
                    <div className="money" style={{ fontWeight: 600 }}>
                      {money(inv.total)}
                    </div>
                    {inv.remaining > 0 ? (
                      <div className="text-sm" style={{ color: '#f87171' }}>
                        {money(inv.remaining)} ödenmedi
                      </div>
                    ) : (
                      <div className="text-sm" style={{ color: '#4ade80' }}>
                        Ödendi
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="alert info mt-14">
        <Info size={15} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          Bu ekranda yalnızca <strong>faturalar</strong> gösterilir. İş emirlerinin durumu bu hesapla
          erişilemez.
        </span>
      </div>

      {detailLoading ? <InlineLoading /> : null}
      {detail ? <InvoiceDetail invoice={detail} onClose={() => setDetail(null)} /> : null}
    </>
  );
}

/** `lazy(() => import(...))` icin default export ZORUNLU. */
export default PortalInvoices;
