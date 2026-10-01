import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Wallet, Users, TrendingUp, Receipt, PiggyBank, Clock, Settings2, Check,
  X, ChevronLeft, ChevronRight, Award, Info, Printer, Lock,
} from 'lucide-react';
import { api, money, number, dateFmt, todayIso } from '../lib/api.js';
import { useToast } from '../components/Toast.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { PageHeader, Kpi, KpiMoney, EmptyState } from '../components/Primitives.jsx';
import { Modal, ConfirmDialog } from '../components/Modal.jsx';
import { FormField, useFormState } from '../components/Form.jsx';
import { StatusBadge } from '../components/StatusBadge.jsx';
import { DataTable } from '../components/DataTable.jsx';

const currentPeriod = () => new Date().toISOString().slice(0, 7);

/** Dönem seçici: ← 2026-09 → */
function PeriodPicker({ period, onChange }) {
  const shift = (n) => {
    const [y, m] = period.split('-').map(Number);
    const d = new Date(y, m - 1 + n, 1);
    onChange(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };
  const [y, m] = period.split('-');
  const label = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('tr-TR', {
    month: 'long',
    year: 'numeric',
  });
  const isCurrent = period === currentPeriod();

  return (
    <div className="row" style={{ gap: 4 }}>
      <button className="btn btn-icon" onClick={() => shift(-1)} title="Önceki dönem">
        <ChevronLeft size={15} />
      </button>
      <div
        style={{
          minWidth: 148, textAlign: 'center', fontWeight: 600, fontSize: 13.5,
          padding: '7px 10px', textTransform: 'capitalize',
        }}
      >
        {label}
        {isCurrent ? <span className="badge primary" style={{ marginLeft: 7, fontSize: 10 }}>aktif</span> : null}
      </div>
      <button className="btn btn-icon" onClick={() => shift(1)} title="Sonraki dönem">
        <ChevronRight size={15} />
      </button>
      <input
        type="month"
        className="input"
        style={{ width: 148, marginLeft: 6 }}
        value={period}
        onChange={(e) => e.target.value && onChange(e.target.value)}
      />
    </div>
  );
}

export default function Payroll() {
  const toast = useToast();
  const { isAdmin } = useAuth();

  const [period, setPeriod] = useState(currentPeriod());
  const [data, setData] = useState(null);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [detail, setDetail] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [paying, setPaying] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rec, set] = await Promise.all([
        api.get('/payroll/records', { period }),
        api.get('/payroll/settings'),
      ]);
      setData(rec);
      setSettings(set.data);
    } catch (err) {
      toast.fromError(err, 'Bordro yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [period, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const markPaid = async (row) => {
    try {
      await api.patch(`/payroll/records/${row.id}/status`, {
        status: 'odendi',
        payment_date: todayIso(),
      });
      toast.success('Ödendi olarak işaretlendi', row.full_name);
      load();
    } catch (err) {
      toast.fromError(err, 'Güncellenemedi');
    }
  };

  const summary = data?.summary;

  return (
    <>
      <PageHeader
        title="Maaş / Bordro"
        description="Brüt, puan primi, mesai, kesinti ve net ödeme"
        actions={
          <>
            <PeriodPicker period={period} onChange={setPeriod} />
            <button className="btn" onClick={() => setShowSettings(true)} title="Hesaplama kuralları">
              <Settings2 size={14} />
              Kurallar
            </button>
          </>
        }
      />

      {settings ? (
        <div className="row row-wrap mb-14" style={{ gap: 7 }}>
          <span className="badge muted">
            Puan eşiği: <strong>{settings.score_threshold}</strong>
          </span>
          <span className="badge muted">
            Prim: <strong>{money(settings.bonus_multiplier, false)}</strong>/puan, en fazla{' '}
            <strong>{money(settings.bonus_cap, false)}</strong>
          </span>
          <span className="badge muted">
            Vergi <strong>%{settings.tax_rate}</strong> · SGK <strong>%{settings.sgk_rate}</strong>
          </span>
          <span className="badge muted">
            Mesai: en fazla <strong>{settings.overtime_cap} sa</strong> ×{' '}
            <strong>{settings.overtime_multiplier}</strong>
          </span>
          <span className="badge muted">
            Avans tavanı: brüt maaşın <strong>%{settings.advance_cap_rate}</strong>'i
          </span>
        </div>
      ) : null}

      <div className="kpi-grid">
        <Kpi label="Personel" value={number(summary?.count)} color="#3b82f6" icon={Users} small />
        <KpiMoney label="Brüt toplam" value={summary?.gross_total} color="#06b6d4" icon={Receipt} small />
        <KpiMoney label="Puan primi" value={summary?.score_bonus} color="#a855f7" icon={Award} small />
        <KpiMoney label="Mesai ücreti" value={summary?.overtime_pay} color="#f59e0b" icon={Clock} small />
        <KpiMoney label="Vergi + SGK" value={(summary?.tax || 0) + (summary?.sgk || 0)} color="#ef4444" icon={PiggyBank} small />
        <KpiMoney
          label="Net ödenecek"
          value={summary?.net}
          color="#22c55e"
          icon={Wallet}
          sub={`${summary?.paid_count || 0} / ${summary?.count || 0} ödendi`}
          small
        />
      </div>

      <div className="card">
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Personel</th>
                <th style={{ width: 92 }}>Dönem puanı</th>
                <th style={{ width: 104, textAlign: 'right' }}>Brüt maaş</th>
                <th style={{ width: 96, textAlign: 'right' }}>Puan primi</th>
                <th style={{ width: 84, textAlign: 'right' }}>Mesai</th>
                <th style={{ width: 112, textAlign: 'right' }}>Brüt toplam</th>
                <th style={{ width: 118, textAlign: 'right' }}>Vergi + SGK</th>
                <th style={{ width: 116, textAlign: 'right' }}>NET</th>
                <th style={{ width: 92 }}>Durum</th>
                <th className="col-actions">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 10 }).map((__, j) => (
                      <td key={j}>
                        <div style={{ height: 11, borderRadius: 3, background: 'var(--bg-hover)', opacity: 0.5 }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : !data?.data?.length ? (
                <tr>
                  <td colSpan={10}>
                    <EmptyState
                      icon={Users}
                      title="Aktif personel yok"
                      description="Çalışanlar sayfasından en az bir aktif personel ekleyin."
                    />
                  </td>
                </tr>
              ) : (
                data.data.map((r) => (
                  <tr key={r.employee_id} className="row-link" onClick={() => setDetail(r)}>
                    <td>
                      <div className="cell-strong">{r.full_name}</div>
                      <div className="cell-dim">{r.position || r.department || '—'}</div>
                    </td>
                    <td>
                      {r.period_score === null ? (
                        <span className="text-dim text-sm">puanlanmadı</span>
                      ) : (
                        <div>
                          <strong>{r.period_score}</strong>
                          <div className="text-dim" style={{ fontSize: 10.5 }}>
                            {r.evaluation}
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="col-num cell-muted">{money(r.gross_salary)}</td>
                    <td className="col-num">
                      {r.score_bonus > 0 ? (
                        <span className="money pos">{money(r.score_bonus)}</span>
                      ) : (
                        <span className="text-dim">—</span>
                      )}
                    </td>
                    <td className="col-num cell-muted">
                      {r.overtime_hours > 0 ? (
                        <span title={`${r.overtime_hours} saat`}>{money(r.overtime_pay)}</span>
                      ) : (
                        <span className="text-dim">—</span>
                      )}
                    </td>
                    <td className="col-num money">{money(r.gross_total)}</td>
                    <td className="col-num cell-dim">
                      −{money((r.tax || 0) + (r.sgk || 0))}
                    </td>
                    <td className="col-num">
                      <span className="money pos" style={{ fontSize: 14 }}>
                        {money(r.net)}
                      </span>
                    </td>
                    <td>
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="col-actions" onClick={(e) => e.stopPropagation()}>
                      <div className="cell-actions">
                        <button
                          className="btn btn-sm btn-icon"
                          title="Hesap girdilerini düzenle"
                          onClick={() => setEditing(r)}
                        >
                          <Settings2 size={14} />
                        </button>
                        {r.status !== 'odendi' ? (
                          <button
                            className="btn btn-sm btn-icon"
                            title="Ödendi işaretle"
                            onClick={() => markPaid(r)}
                          >
                            <Check size={14} />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {summary && !loading ? (
          <div className="pagination" style={{ gap: 18, flexWrap: 'wrap' }}>
            <span className="row" style={{ gap: 6 }}>
              <span className="text-dim">TOPLAM</span>
              <strong className="money">{money(summary.gross_total)}</strong>
            </span>
            <span className="row" style={{ gap: 6 }}>
              <span className="text-dim">Kesinti</span>
              <strong className="money neg">
                −{money((summary.tax || 0) + (summary.sgk || 0))}
              </strong>
            </span>
            <span className="row" style={{ gap: 6 }}>
              <span className="text-dim">NET</span>
              <strong className="money pos" style={{ fontSize: 14 }}>
                {money(summary.net)}
              </strong>
            </span>
            <div className="spacer" />
            <span className="text-dim">
              {summary.paid_count} / {summary.count} kişiye ödendi
            </span>
          </div>
        ) : null}
      </div>

      {detail ? <PayrollDetail row={detail} onClose={() => setDetail(null)} onEdit={(r) => { setDetail(null); setEditing(r); }} /> : null}

      {editing ? (
        <PayrollForm
          row={editing}
          period={period}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      ) : null}

      {paying ? <PayModal row={paying} onClose={() => setPaying(null)} onDone={() => { setPaying(null); load(); }} /> : null}

      {showSettings ? <PayrollSettings onClose={() => setShowSettings(false)} onSaved={() => { setShowSettings(false); load(); }} canEdit={isAdmin} /> : null}
    </>
  );
}

// =========================================================================
// HESAP GIRDIleri
// =========================================================================

function PayrollForm({ row, period, onClose, onSaved }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const fields = useMemo(
    () => [
      { name: 'overtime_hours', label: 'Mesai saati', type: 'number', min: 0, step: '0.5', hint: 'Sınır uygulanır' },
      { name: 'extra_payment', label: 'Ek ödeme', type: 'money', min: 0 },
      { name: 'advance', label: 'Avans', type: 'money', min: 0, hint: `Tavan: ${money(row.advance_limit)}` },
      { name: 'other_deduction', label: 'Diğer kesinti', type: 'money', min: 0 },
      { name: 'notes', label: 'Not', type: 'textarea', span: 2, rows: 2 },
    ],
    [row.advance_limit]
  );

  const form = useFormState(fields, {
    overtime_hours: row.overtime_hours ?? 0,
    extra_payment: row.extra_payment ?? 0,
    advance: row.advance ?? 0,
    other_deduction: row.other_deduction ?? 0,
    notes: row.notes ?? '',
  });

  // Canlı önizleme
  const preview = useMemo(() => {
    const g = Number(row.gross_salary) + Number(row.score_bonus);
    const extra = Number(form.values.extra_payment) || 0;
    const ot =
      Math.min(Number(form.values.overtime_hours) || 0, 120) * (Number(row.hourly_rate) || 0) * 0.4;
    const gross = g + extra + ot;
    return { gross, net: gross * 0.71 - (Number(form.values.advance) || 0) - (Number(form.values.other_deduction) || 0) };
  }, [form.values, row.gross_salary, row.score_bonus, row.hourly_rate]);

  const save = async () => {
    const v = form.submit();
    if (!v) return;
    setBusy(true);
    try {
      await api.post('/payroll/records', { ...v, period, employee_id: row.employee_id });
      toast.success('Bordro kaydedildi', row.full_name);
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
      size="sm"
      title="Bordro girdileri"
      subtitle={`${row.full_name} · ${period}`}
      footer={
        <>
          <div className="spacer" />
          <button className="btn" onClick={onClose} disabled={busy}>
            Vazgeç
          </button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? 'Hesaplanıyor...' : 'Hesapla ve Kaydet'}
          </button>
        </>
      }
    >
      <div className="alert info" style={{ marginBottom: 14 }}>
        <Info size={15} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          Brüt maaş <strong>{money(row.gross_salary)}</strong>
          {row.score_bonus > 0 ? (
            <>
              {' '}+ puan primi <strong>{money(row.score_bonus)}</strong>
            </>
          ) : (
            <> · puan primi yok</>
          )}
          {row.hourly_rate > 0 ? (
            <>
              {' '}| saat ücreti <strong>{money(row.hourly_rate)}</strong>
            </>
          ) : (
            <>
              {' '}| <span className="due-soon">saat ücreti tanımlı değil, mesai hesaplanmaz</span>
            </>
          )}
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

      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-body" style={{ padding: 12 }}>
          <div className="stat-row">
            <span className="label">Brüt toplam (tahmini)</span>
            <span className="value money">{money(preview.gross)}</span>
          </div>
          <div className="stat-row">
            <span className="label">Net (tahmini)</span>
            <span className="value money pos">{money(preview.net)}</span>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// =========================================================================
// DETAY
// =========================================================================

function PayrollDetail({ row, onClose, onEdit }) {
  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={row.full_name}
      subtitle={`${row.position || ''} ${row.department ? '· ' + row.department : ''}`}
      footer={
        <>
          <button className="btn" onClick={() => onEdit(row)}>
            <Settings2 size={14} />
            Girdileri düzenle
          </button>
          <div className="spacer" />
          <button className="btn" onClick={onClose}>
            Kapat
          </button>
        </>
      }
    >
      <div className="row row-wrap mb-14" style={{ gap: 7 }}>
        <StatusBadge status={row.status} />
        {row.period_score !== null ? (
          <>
            <span className="badge primary">Dönem puanı: {row.period_score}</span>
            <span className="badge muted">{row.evaluation}</span>
          </>
        ) : (
          <span className="badge warning">Bu dönem için puanlama yapılmamış</span>
        )}
        {row.missing > 0 ? (
          <span className="badge warning">{row.missing} kriter eksik</span>
        ) : null}
        {row.payment_date ? (
          <span className="badge muted">Ödendi: {dateFmt(row.payment_date)}</span>
        ) : null}
      </div>

      <div className="card mb-14">
        <div className="card-head">
          <TrendingUp size={15} style={{ color: 'var(--success)' }} />
          <h3>Hesap dökümü</h3>
        </div>
        <div className="card-body">
          <div className="stat-row">
            <span className="label">Aylık brüt maaş</span>
            <span className="value money">{money(row.gross_salary)}</span>
          </div>
          <div className="stat-row">
            <span className="label">
              Puan primi
              {row.period_score !== null ? ` (${row.period_score} puan)` : ' (puan yok)'}
            </span>
            <span className="value money pos">{money(row.score_bonus)}</span>
          </div>
          {row.extra_payment > 0 ? (
            <div className="stat-row">
              <span className="label">Ek ödeme</span>
              <span className="value money pos">{money(row.extra_payment)}</span>
            </div>
          ) : null}
          {row.overtime_hours > 0 ? (
            <div className="stat-row">
              <span className="label">
                Mesai ({number(row.overtime_hours)} saat × {money(row.hourly_rate)} × 0,4)
              </span>
              <span className="value money pos">{money(row.overtime_pay)}</span>
            </div>
          ) : null}
          <div className="stat-row" style={{ borderTop: '1px solid var(--border)', marginTop: 4, paddingTop: 9 }}>
            <span className="label">
              <strong>Brüt toplam</strong>
            </span>
            <span className="value money">
              <strong>{money(row.gross_total)}</strong>
            </span>
          </div>
          <div className="stat-row">
            <span className="label">Gelir vergisi</span>
            <span className="value money neg">−{money(row.tax)}</span>
          </div>
          <div className="stat-row">
            <span className="label">SGK işçi payı</span>
            <span className="value money neg">−{money(row.sgk)}</span>
          </div>
          {row.advance > 0 ? (
            <div className="stat-row">
              <span className="label">
                Avans <span className="text-dim">(tavan {money(row.advance_limit)})</span>
              </span>
              <span className="value money neg">−{money(row.advance)}</span>
            </div>
          ) : null}
          {row.other_deduction > 0 ? (
            <div className="stat-row">
              <span className="label">Diğer kesinti</span>
              <span className="value money neg">−{money(row.other_deduction)}</span>
            </div>
          ) : null}
          <div className="stat-row total">
            <span className="label">NET ÖDENECEK</span>
            <span className="value money pos">{money(row.net)}</span>
          </div>
        </div>
      </div>

      {row.notes ? (
        <div className="alert info" style={{ marginBottom: 0 }}>
          {row.notes}
        </div>
      ) : null}
    </Modal>
  );
}

function PayModal({ row, onClose, onDone }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [payDate, setPayDate] = useState(todayIso());

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Ödendi işaretle"
      subtitle={`${row.full_name} · ${money(row.net)}`}
      footer={
        <>
          <div className="spacer" />
          <button className="btn" onClick={onClose} disabled={busy}>
            Vazgeç
          </button>
          <button
            className="btn btn-primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api.patch(`/payroll/records/${row.id}/status`, { status: 'odendi', payment_date: payDate });
                toast.success('Ödendi olarak işaretlendi', row.full_name);
                onDone();
              } catch (err) {
                toast.fromError(err, 'Güncellenemedi');
              } finally {
                setBusy(false);
              }
            }}
          >
            <Check size={14} />
            {busy ? 'Kaydediliyor...' : 'Ödendi olarak işaretle'}
          </button>
        </>
      }
    >
      <div className="field">
        <label className="field-label" htmlFor="pay-date">
          Ödeme tarihi
        </label>
        <input
          id="pay-date"
          type="date"
          className="input"
          value={payDate}
          onChange={(e) => setPayDate(e.target.value)}
        />
      </div>
    </Modal>
  );
}

// =========================================================================
// HESAPLAMA KURALLARI
// =========================================================================

function PayrollSettings({ onClose, onSaved, canEdit }) {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/payroll/settings').then((r) => setData(r.data)).catch(() => {});
  }, []);

  const fields = useMemo(
    () => [
      { name: 'score_threshold', label: 'Puan eşiği', type: 'number', min: 0, max: 100, step: '1', hint: 'Bu puanın altında prim verilmez' },
      { name: 'bonus_multiplier', label: 'Prim çarpanı (₺/puan)', type: 'money', min: 0 },
      { name: 'bonus_cap', label: 'Prim üst limiti (₺)', type: 'money', min: 0 },
      { name: 'tax_rate', label: 'Vergi oranı %', type: 'number', min: 0, max: 100, step: '0.1' },
      { name: 'sgk_rate', label: 'SGK oranı %', type: 'number', min: 0, max: 100, step: '0.1' },
      { name: 'overtime_cap', label: 'Mesai saat limiti / ay', type: 'number', min: 0, step: '1' },
      { name: 'overtime_multiplier', label: 'Mesai saat çarpanı', type: 'number', min: 0, step: '0.05' },
      { name: 'advance_cap_rate', label: 'Avans tavanı %', type: 'number', min: 0, max: 100, step: '1', hint: 'Brüt maaşın bu yüzdesi kadar' },
      { name: 'safety_factor', label: 'Emniyet katsayısı (stok)', type: 'number', min: 1, max: 5, step: '0.1', hint: 'Min. stok × katsayı = kritik eşik' },
    ],
    []
  );

  const form = useFormState(fields, data || {});

  const save = async () => {
    const v = form.submit();
    if (!v) return;
    setBusy(true);
    try {
      await api.put('/payroll/settings', v);
      toast.success('Kurallar kaydedildi', 'Bordro hesapları bu değerlere göre yeniden hesaplanır.');
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
      title="Hesaplama kuralları"
      subtitle="Bordro ve prim hesaplarında kullanılan değerler"
      footer={
        <>
          <div className="spacer" />
          <button className="btn" onClick={onClose} disabled={busy}>
            Kapat
          </button>
          {canEdit ? (
            <button className="btn btn-primary" onClick={save} disabled={busy || !data}>
              {busy ? 'Kaydediliyor...' : 'Kaydet'}
            </button>
          ) : null}
        </>
      }
    >
      {!canEdit ? (
        <div className="alert warning">
          <Lock size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>Bu ayarları yalnızca yönetici değiştirebilir.</span>
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
            disabled={busy || !canEdit}
          />
        ))}
      </div>
    </Modal>
  );
}
