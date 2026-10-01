/**
 * MUSTERI PORTALI - TARIH DEGISIKLIK TALEBI
 * Müşteri, bir iş emrinin TERMININI (due_date) ileri/geri almak icin talep acar.
 * Onay yetkisi MUSTERIDE YOKTUR; talep personele gider.
 */
import { useMemo, useState } from 'react';
import { CalendarClock, ArrowRight, Info } from 'lucide-react';
import { api, dateFmt, todayIso } from '../../lib/api.js';
import { useToast } from '../../components/Toast.jsx';
import { Modal } from '../../components/Modal.jsx';

export function DateRequestModal({ job, onClose, onDone }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [newDate, setNewDate] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState({});

  // Yön, mevcut termine göre otomatik hesaplanır; kullanıcı isterse elle de değiştirebilir.
  const autoDirection = useMemo(() => {
    if (!newDate || !job.due_date) return 'ileri';
    return newDate > job.due_date ? 'geri' : 'ileri';
  }, [newDate, job.due_date]);

  const [direction, setDirection] = useState(null);
  const effectiveDirection = direction ?? autoDirection;

  const submit = async () => {
    const next = {};
    if (!newDate) next.date = 'Yeni termin seçin';
    else if (newDate === job.due_date) next.date = 'Yeni termin mevcut terminle aynı olamaz';
    if (reason.trim().length < 10) next.reason = 'Sebebi biraz daha açıklayın (en az 10 karakter)';
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    try {
      const res = await api.post('/portal/date-requests', {
        work_order_id: job.id,
        requested_due_date: newDate,
        direction: effectiveDirection,
        reason: reason.trim(),
      });
      toast.success('Talebiniz iletildi', res.message || 'Onaylandığında termin güncellenecek.');
      onDone();
    } catch (err) {
      toast.fromError(err, 'Talep gönderilemedi');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Termin değişikliği talebi"
      subtitle={`${job.number} · Mevcut termin ${dateFmt(job.due_date)}`}
      size="sm"
      footer={
        <>
          <div className="spacer" />
          <button className="btn" onClick={onClose} disabled={busy}>
            Vazgeç
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>
            {busy ? 'Gönderiliyor...' : 'Talebi gönder'}
          </button>
        </>
      }
    >
      <div className="alert info mb-14">
        <Info size={15} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          Talebiniz iletilir, <strong>onaydan sonra</strong> termin değişir. Herhangi bir tarih
          değişikliği yapılmaz.
        </span>
      </div>

      <div className="form-grid">
        <div className="field span-2">
          <label>Mevcut termin</label>
          <div className="input readonly" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CalendarClock size={14} className="text-dim" />
            {dateFmt(job.due_date)}
          </div>
        </div>

        <div className="field span-2">
          <label htmlFor="dr-date">Yeni termin *</label>
          <input
            id="dr-date"
            type="date"
            className="input"
            min={todayIso()}
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
          />
          {errors.date ? <span className="field-error">{errors.date}</span> : null}
        </div>

        <div className="field span-2">
          <label>Yön</label>
          <div className="seg">
            <button
              type="button"
              className={`seg-item ${effectiveDirection === 'ileri' ? 'on' : ''}`}
              onClick={() => setDirection('ileri')}
            >
              Öne çekilsin
            </button>
            <button
              type="button"
              className={`seg-item ${effectiveDirection === 'geri' ? 'on' : ''}`}
              onClick={() => setDirection('geri')}
            >
              Sonraya kalsın
            </button>
          </div>
          <span className="field-hint">Yeni tarihe göre otomatik seçilir, isterseniz değiştirebilirsiniz.</span>
        </div>

        <div className="field span-2">
          <label htmlFor="dr-reason">Sebep *</label>
          <textarea
            id="dr-reason"
            className="input"
            rows={3}
            maxLength={500}
            placeholder="Örn. Saha çalışması ertelendi, araç arızası çıktı..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          {errors.reason ? <span className="field-error">{errors.reason}</span> : null}
        </div>
      </div>

      {newDate && newDate !== job.due_date ? (
        <div className="alert mt-14" style={{ marginBottom: 0 }}>
          <ArrowRight size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            {dateFmt(job.due_date)} <strong>→</strong> {dateFmt(newDate)}
          </span>
        </div>
      ) : null}
    </Modal>
  );
}

/** `lazy(() => import(...))` icin default export ZORUNLU. */
export default DateRequestModal;
