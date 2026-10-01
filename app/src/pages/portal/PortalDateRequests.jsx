/**
 * MUSTERI PORTALI - TARIH TALEPLERI LISTESI
 * Müşterinin açtığı tüm talepler ve sonuçları.
 */
import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, CheckCircle2, XCircle, Hourglass } from 'lucide-react';
import { api, dateFmt, dateTimeFmt } from '../../lib/api.js';
import { useToast } from '../../components/Toast.jsx';
import { EmptyState, InlineLoading, PageHeader } from '../../components/Primitives.jsx';

const TONE = {
  beklemede: 'warning',
  onaylandi: 'success',
  reddedildi: 'danger',
};

function StatusPill({ status }) {
  const Icon =
    status === 'onaylandi' ? CheckCircle2 : status === 'reddedildi' ? XCircle : Hourglass;
  return (
    <span className={`badge ${TONE[status] || 'muted'}`}>
      <Icon size={10} />
      {status === 'beklemede' ? 'Onay bekliyor' : status === 'onaylandi' ? 'Onaylandı' : 'Reddedildi'}
    </span>
  );
}

export function PortalDateRequests() {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/portal/date-requests');
      setRows(res.data);
    } catch (err) {
      toast.fromError(err, 'Talepler yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <InlineLoading />;

  const pending = rows.filter((r) => r.approval_status === 'beklemede').length;

  return (
    <>
      <PageHeader
        title="Tarih Taleplerim"
        description={`Açtığınız termin değişikliği talepleri${
          pending ? ` · ${pending} talep onay bekliyor` : ''
        }`}
      />

      {!rows.length ? (
        <div className="card">
          <EmptyState
            icon={CalendarClock}
            title="Henüz talep yok"
            description="İşlerim ekranından bir işe tıklayıp termin değişikliği talebinde bulunabilirsiniz."
          />
        </div>
      ) : (
        <div className="card">
          <div className="list">
            {rows.map((r) => (
              <div className="list-row" key={r.id}>
                <div className="grow">
                  <div className="row-between">
                    <span className="title mono">{r.work_order_number}</span>
                    <StatusPill status={r.approval_status} />
                  </div>
                  <div className="meta">{r.work_order_subject || '—'}</div>

                  <div className="row gap-8 mt-4 wrap">
                    <span className="chip muted">
                      {dateFmt(r.current_due_date)} <strong>→</strong> {dateFmt(r.requested_due_date)}
                    </span>
                    <span className="chip muted">
                      {r.direction === 'geri' ? 'Termin sonraya' : 'Termin öne'}
                    </span>
                    <span className="chip muted">{dateTimeFmt(r.created_at)}</span>
                  </div>

                  <div className="mt-6 text-sm">{r.reason}</div>

                  {r.approval_status !== 'beklemede' ? (
                    <div className="text-sm text-dim mt-4">
                      {r.decided_at ? `${dateTimeFmt(r.decided_at)} · ` : ''}
                      {r.decision_note || (r.approval_status === 'onaylandi' ? 'Onaylandı' : 'Reddedildi')}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/** `lazy(() => import(...))` icin default export ZORUNLU. */
export default PortalDateRequests;
