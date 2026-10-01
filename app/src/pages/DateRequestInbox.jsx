/**
 * MUSTERI TARIH TALEPLERI (personel tarafi)
 * Müşterilerin açtığı termin değişikliği taleplerini buradan onaylar veya
 * reddedersiniz. Onaylandığında iş emrinin termini otomatik güncellenir ve
 * mevcut erteleme kayıtlarına bir satır düşer.
 */
import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, Check, X, Inbox, ArrowRight, User } from 'lucide-react';
import { api, dateFmt, dateTimeFmt } from '../lib/api.js';
import { useToast } from '../components/Toast.jsx';
import { EmptyState, InlineLoading } from '../components/Primitives.jsx';
import { Modal } from '../components/Modal.jsx';

function DecisionModal({ request, mode, onClose, onDone }) {
  const toast = useToast();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const approve = mode === 'approve';

  const submit = async () => {
    setBusy(true);
    try {
      const res = await api.post(
        `/work-orders/date-requests/${request.id}/${approve ? 'approve' : 'reject'}`,
        { note: note.trim() || undefined }
      );
      toast.success(res.message || (approve ? 'Onaylandı' : 'Reddedildi'));
      onDone();
    } catch (err) {
      toast.fromError(err, 'İşlem yapılamadı');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={approve ? 'Talebi onayla' : 'Talebi reddet'}
      subtitle={`${request.work_order_number} · ${request.customer_company || request.customer_title || ''}`}
      size="sm"
      footer={
        <>
          <div className="spacer" />
          <button className="btn" onClick={onClose} disabled={busy}>
            Vazgeç
          </button>
          <button
            className={approve ? 'btn btn-primary' : 'btn btn-danger'}
            onClick={submit}
            disabled={busy}
          >
            {busy ? 'İşleniyor...' : approve ? 'Onayla ve termini güncelle' : 'Talebi reddet'}
          </button>
        </>
      }
    >
      <div className="stat-row">
        <span className="label">Mevcut termin</span>
        <span className="value">{dateFmt(request.current_due_date)}</span>
      </div>
      <div className="stat-row">
        <span className="label">Talep edilen</span>
        <span className="value" style={{ color: approve ? 'var(--success)' : 'var(--danger)' }}>
          {dateFmt(request.requested_due_date)}
        </span>
      </div>
      <div className="stat-row">
        <span className="label">Yön</span>
        <span className="value">
          {request.direction === 'geri' ? 'Termin sonraya kalsın' : 'Termin öne çekilsin'}
        </span>
      </div>
      <div className="stat-row">
        <span className="label">Talep eden</span>
        <span className="value">
          <User size={12} style={{ verticalAlign: -1, marginRight: 4 }} />
          {request.requested_name || '—'}
        </span>
      </div>
      <div className="stat-row">
        <span className="label">İş</span>
        <span className="value">{request.work_order_subject || '—'}</span>
      </div>

      <div className="mt-14">
        <div className="label text-dim text-sm mb-4">Müşterinin gerekçesi</div>
        <div className="card">
          <div className="card-body">{request.reason}</div>
        </div>
      </div>

      <div className="field mt-14">
        <label htmlFor="dec-note">Notunuz (müşteriye iletilir)</label>
        <textarea
          id="dec-note"
          className="input"
          rows={2}
          maxLength={500}
          placeholder={approve ? 'Örn. Saha uygun, onaylandı.' : 'Örn. Kapasite yok, önerilen tarih 12.03.'}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      {approve ? (
        <div className="alert info mt-14" style={{ marginBottom: 0 }}>
          <ArrowRight size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            Onaylayınca iş emrinin termini <strong>{dateFmt(request.requested_due_date)}</strong> olacak
            ve erteleme kayıtlarına bir satır düşecek.
          </span>
        </div>
      ) : null}
    </Modal>
  );
}

export function DateRequestInbox({ onChanged }) {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(null); // { request, mode }

  const load = useCallback(async () => {
    try {
      const res = await api.get('/work-orders/date-requests/list');
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

  const pending = rows.filter((r) => r.approval_status === 'beklemede');
  const decided = rows.filter((r) => r.approval_status !== 'beklemede');

  if (loading) return <InlineLoading />;

  return (
    <>
      <div className="card">
        <div className="card-head">
          <CalendarClock size={15} style={{ color: pending.length ? 'var(--warning)' : 'var(--muted)' }} />
          <h3>Müşteri Tarih Talepleri</h3>
          {pending.length ? (
            <span className="badge warning">
              {pending.length} onay bekliyor
            </span>
          ) : null}
        </div>
        <div className="card-body">
          {!rows.length ? (
            <EmptyState
              compact
              icon={Inbox}
              title="Talepler yok"
              description="Müşteriler termin değişikliği talebi açtığında burada görünecek."
            />
          ) : (
            <>
              {pending.map((r) => (
                <div className="list-row" key={r.id}>
                  <div className="grow">
                    <div className="row-between">
                      <span className="title mono">{r.work_order_number}</span>
                      <span className="badge warning">Onay bekliyor</span>
                    </div>
                    <div className="meta">
                      {r.customer_company || r.customer_title || '—'} ·{' '}
                      {r.requested_name || 'müşteri'} · {dateTimeFmt(r.created_at)}
                    </div>
                    <div className="row gap-8 mt-4 wrap">
                      <span className="chip muted">
                        {dateFmt(r.current_due_date)} <ArrowRight size={10} />{' '}
                        <strong>{dateFmt(r.requested_due_date)}</strong>
                      </span>
                      <span className="chip muted">
                        {r.direction === 'geri' ? 'Termin sonraya' : 'Termin öne'}
                      </span>
                    </div>
                    <div className="text-sm mt-4">{r.reason}</div>
                  </div>
                  <div className="row gap-6">
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={() => setActive({ request: r, mode: 'approve' })}
                    >
                      <Check size={13} />
                      Onayla
                    </button>
                    <button
                      className="btn btn-sm"
                      onClick={() => setActive({ request: r, mode: 'reject' })}
                    >
                      <X size={13} />
                      Reddet
                    </button>
                  </div>
                </div>
              ))}

              {decided.length ? (
                <>
                  <div className="label text-dim text-sm mt-14 mb-6">İşlenmiş talepler</div>
                  {decided.slice(0, 15).map((r) => (
                    <div className="list-row" key={r.id} style={{ opacity: 0.75 }}>
                      <div className="grow">
                        <div className="row-between">
                          <span className="title mono">{r.work_order_number}</span>
                          <span
                            className={`badge ${r.approval_status === 'onaylandi' ? 'success' : 'danger'}`}
                          >
                            {r.approval_status === 'onaylandi' ? 'Onaylandı' : 'Reddedildi'}
                          </span>
                        </div>
                        <div className="meta">
                          {r.customer_company || r.customer_title || '—'} ·{' '}
                          {dateFmt(r.current_due_date)} → {dateFmt(r.requested_due_date)}
                          {r.decided_at ? ` · ${dateFmt(r.decided_at)}` : ''}
                        </div>
                        {r.decision_note ? <div className="text-sm mt-2">{r.decision_note}</div> : null}
                      </div>
                    </div>
                  ))}
                </>
              ) : null}
            </>
          )}
        </div>
      </div>

      {active ? (
        <DecisionModal
          request={active.request}
          mode={active.mode}
          onClose={() => setActive(null)}
          onDone={() => {
            setActive(null);
            load();
            onChanged?.();
          }}
        />
      ) : null}
    </>
  );
}
