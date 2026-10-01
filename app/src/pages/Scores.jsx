/**
 * Puanlama Ekrani
 * ===============
 * Excel'deki "Puanlar" sayfasinin web karsiligi.
 *
 * DONEM × PERSONEL × KRITER matristi. Her hucre 0-100 puan.
 * Agirlikli puan = Puan × Agirlik / 100, donem puani bunlarin toplamidir.
 *
 * KURALLAR (server/src/utils/payroll.js ile birebir, dokunma):
 *   TEK %30 · KAL %20 · ZAM %20 · MUT %15 · EKI %10 · DIS %5
 *   Puan esigi 70 · prim 250 TL/puan · limit 5000 TL
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Award, ChevronLeft, ChevronRight, Save, Settings2, Info, TrendingUp, AlertTriangle,
} from 'lucide-react';
import { api, money, number, todayIso } from '../lib/api.js';
import { useToast } from '../components/Toast.jsx';
import { PageHeader, Kpi, EmptyState, InlineLoading } from '../components/Primitives.jsx';
import { Modal } from '../components/Modal.jsx';
import { FormField, useFormState } from '../components/Form.jsx';

const currentPeriod = () => new Date().toISOString().slice(0, 7);

const EVAL_TONE = {
  'Mükemmel': 'success',
  'Çok İyi': 'success',
  'İyi': 'info',
  'Gelişmeli': 'warning',
  'Yetersiz': 'danger',
};

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
          minWidth: 150, textAlign: 'center', fontWeight: 600, fontSize: 13.5,
          padding: '7px 10px', textTransform: 'capitalize',
        }}
      >
        {label}
        {isCurrent ? (
          <span className="badge primary" style={{ marginLeft: 7, fontSize: 10 }}>aktif</span>
        ) : null}
      </div>
      <button className="btn btn-icon" onClick={() => shift(1)} title="Sonraki dönem">
        <ChevronRight size={15} />
      </button>
      <input
        type="month"
        className="input"
        style={{ width: 150, marginLeft: 6 }}
        value={period}
        onChange={(e) => e.target.value && onChange(e.target.value)}
      />
    </div>
  );
}

/** Tek bir puan hucresi: yazilabilir, kaydederken kirmiziya doner. */
function ScoreCell({ entry, onChange, disabled }) {
  const empty = entry.score === null || entry.score === undefined;
  return (
    <input
      type="number"
      className={`input score-cell ${empty ? 'empty' : ''}`}
      min="0"
      max="100"
      step="1"
      placeholder="—"
      disabled={disabled}
      value={entry.score ?? ''}
      onChange={(e) => {
        const v = e.target.value;
        onChange(v === '' ? null : Math.min(100, Math.max(0, Number(v))));
      }}
      style={{ textAlign: 'center' }}
    />
  );
}

function CriteriaModal({ criteria, totalWeight, onClose, onDone }) {
  const toast = useToast();
  const [rows, setRows] = useState(criteria);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null);

  const sum = rows.filter((c) => c.is_active).reduce((s, c) => s + Number(c.weight || 0), 0);
  const ok = Math.abs(sum - 100) < 0.01;

  const save = async (c) => {
    setBusy(true);
    try {
      await api.put(`/payroll/criteria/${c.id}`, {
        name: c.name,
        weight: c.weight,
        description: c.description,
        is_active: c.is_active,
      });
      toast.success('Kriter güncellendi');
      setEditing(null);
      onDone();
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
      title="Puan Kriterleri ve Ağırlıkları"
      subtitle="Ağırlıklar toplamı %100 olmalıdır"
      footer={
        <>
          <div className={ok ? '' : 'field-error'}>
            {ok ? 'Toplam ağırlık %100 ✓' : `Toplam ağırlık %${number(sum)} — %100 olmalı`}
          </div>
          <div className="spacer" />
          <button className="btn btn-primary" onClick={onClose}>
            Kapat
          </button>
        </>
      }
    >
      <div className="alert info mb-14">
        <Info size={15} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          Ağırlıklar Excel'deki değerlerle birebir: TEK %30, KAL %20, ZAM %20, MUT %15, EKI %10,
          DIS %5. Değiştirirseniz prim hesabı da değişir.
        </span>
      </div>

      <div className="card">
        <div className="list">
          {rows.map((c) => (
            <div className="list-row" key={c.id}>
              {editing?.id === c.id ? (
                <>
                  <div className="grow row gap-8 wrap">
                    <input
                      className="input"
                      style={{ maxWidth: 190 }}
                      value={editing.name}
                      onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    />
                    <input
                      type="number"
                      className="input"
                      style={{ maxWidth: 92 }}
                      value={editing.weight}
                      onChange={(e) => setEditing({ ...editing, weight: e.target.value })}
                    />
                    <span className="text-dim text-sm">%</span>
                  </div>
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={() => save(editing)}
                    disabled={busy}
                  >
                    Kaydet
                  </button>
                  <button className="btn btn-sm" onClick={() => setEditing(null)} disabled={busy}>
                    Vazgeç
                  </button>
                </>
              ) : (
                <>
                  <div className="grow">
                    <div className="title">
                      {c.name} <span className="badge muted mono">{c.code}</span>
                    </div>
                    <div className="meta">{c.description || '—'}</div>
                  </div>
                  <span className="money" style={{ fontWeight: 700 }}>%{number(c.weight)}</span>
                  <button
                    className="btn btn-sm"
                    onClick={() => setEditing({ ...c })}
                    disabled={busy}
                  >
                    Düzenle
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

export default function Scores() {
  const toast = useToast();
  const [period, setPeriod] = useState(currentPeriod());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState({}); // "empId:criterionId" -> score
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showCriteria, setShowCriteria] = useState(false);

  // API yaniti: { data: [...personel satirlari], criteria, total_weight, ... }
  // Diziyi `rows` adiyla tutuyoruz (asagida `data.rows` ile karistirma).
  const rows = data?.data ?? [];

  const load = useCallback(
    async (p = period) => {
      setLoading(true);
      try {
        const res = await api.get('/payroll/scores', { period: p });
        setData(res);
        setDraft({});
        setDirty(false);
      } catch (err) {
        toast.fromError(err, 'Puanlar yüklenemedi');
      } finally {
        setLoading(false);
      }
    },
    [period, toast]
  );

  useEffect(() => {
    load(period);
  }, [period]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Ekrandaki deger: once taslak varsa o, yoksa kayit. */
  const valueOf = (row, entry) => {
    const key = `${row.employee_id}:${entry.criterion_id}`;
    return key in draft ? draft[key] : entry.score;
  };

  const setCell = (row, entry, v) => {
    const key = `${row.employee_id}:${entry.criterion_id}`;
    setDraft((d) => ({ ...d, [key]: v }));
    setDirty(true);
  };

  const saveAll = async () => {
    const keys = Object.keys(draft);
    if (!keys.length) return;
    setBusy(true);
    let saved = 0;
    try {
      // Sirayla gonderiyoruz: hata olursa hangi hucrenin bozuk oldugu belli olsun.
      for (const key of keys) {
        const [empId, critId] = key.split(':').map(Number);
        const v = draft[key];
        if (v === null) {
          const rec = rows
            .find((r) => r.employee_id === empId)
            ?.entries.find((e) => e.criterion_id === critId);
          if (rec?.record_id) await api.del(`/payroll/scores/${rec.record_id}`);
          continue;
        }
        await api.post('/payroll/scores', {
          period,
          employee_id: empId,
          criterion_id: critId,
          score: v,
          evaluated_at: todayIso(),
        });
        saved += 1;
      }
      toast.success('Puanlar kaydedildi', `${saved} kayıt güncellendi`);
      await load(period);
    } catch (err) {
      toast.fromError(err, 'Kaydedilemedi');
    } finally {
      setBusy(false);
    }
  };

  const stats = useMemo(() => {
    const scored = rows.filter((r) => r.score !== null);
    const threshold = 70;
    return {
      total: rows.length,
      scored: scored.length,
      missing: rows.length - scored.length,
      aboveThreshold: scored.filter((r) => r.score >= threshold).length,
      average: scored.length
        ? Math.round((scored.reduce((s, r) => s + r.score, 0) / scored.length) * 10) / 10
        : null,
    };
  }, [rows]);

  if (loading && !data) return <InlineLoading />;
  if (!data) return <EmptyState title="Puanlama verisi yok" />;

  const criteria = data.criteria;
  const weightProblem = Math.abs(Number(data.total_weight) - 100) > 0.01;

  return (
    <>
      <PageHeader
        title="Puanlama"
        description="Dönem bazında personel performans puanları"
        actions={
          <div className="row" style={{ gap: 8 }}>
            <PeriodPicker period={period} onChange={setPeriod} />
            <button className="btn btn-icon" onClick={() => setShowCriteria(true)} title="Kriterler">
              <Settings2 size={15} />
            </button>
            {dirty ? (
              <button className="btn btn-primary" onClick={saveAll} disabled={busy}>
                <Save size={14} />
                {busy ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
            ) : null}
          </div>
        }
      />

      <div className="grid grid-4 mb-14">
        <Kpi label="Personel" value={number(stats.total)} icon={Award} small />
        <Kpi
          label="Puanlanan"
          value={`${stats.scored}/${stats.total}`}
          color="var(--success)"
          icon={TrendingUp}
          small
        />
        <Kpi
          label="Ort. puan"
          value={stats.average ?? '-'}
          color="var(--primary)"
          icon={Award}
          small
        />
        <Kpi
          label="Prim hak eden"
          value={number(stats.aboveThreshold)}
          sub="70 puan ve üzeri"
          color="#f59e0b"
          icon={Award}
          small
        />
      </div>

      {weightProblem ? (
        <div className="alert warning mb-14">
          <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            Kriter ağırlıkları toplamı <strong>%{number(data.total_weight)}</strong>, %100 olmalı.
            Maaş hesabı bu değere göre yapılır.
          </span>
        </div>
      ) : null}

      {stats.missing > 0 ? (
        <div className="alert warning mb-14">
          <Info size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            <strong>{stats.missing}</strong> personelin puanlaması eksik. Eksik kriterli personel
            prim hak etmez.
          </span>
        </div>
      ) : null}

      <div className="card">
        <div style={{ overflowX: 'auto' }}>
          <table className="score-matrix">
            <thead>
              <tr>
                <th className="sticky-col" style={{ minWidth: 190, textAlign: 'left' }}>
                  Personel
                </th>
                {criteria.map((c) => (
                  <th key={c.id} title={c.description || c.name}>
                    <div>{c.name}</div>
                    <div className="text-dim" style={{ fontWeight: 400, fontSize: 10.5 }}>
                      %{number(c.weight)}
                    </div>
                  </th>
                ))}
                <th style={{ minWidth: 92 }}>Dönem puanı</th>
                <th style={{ minWidth: 104 }}>Değerlendirme</th>
                <th style={{ minWidth: 108 }}>Hakeden prim</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const score = valueOf(row, { criterion_id: -1 });
                // Dönem puani degisse (taslak) yeniden hesapla
                const computed = (() => {
                  const active = criteria.filter((c) => c.is_active);
                  let total = 0;
                  let count = 0;
                  for (const c of active) {
                    const e = row.entries.find((x) => x.criterion_id === c.id);
                    const v = valueOf(row, e);
                    if (v !== null && v !== undefined) {
                      total += (Number(v) * Number(c.weight)) / 100;
                      count += 1;
                    }
                  }
                  return { score: count ? Math.round(total * 10) / 10 : null, count };
                })();

                const evaluation =
                  computed.score === null
                    ? '—'
                    : computed.score >= 90
                      ? 'Mükemmel'
                      : computed.score >= 80
                        ? 'Çok İyi'
                        : computed.score >= 70
                          ? 'İyi'
                          : computed.score >= 60
                            ? 'Gelişmeli'
                            : 'Yetersiz';
                const bonus =
                  computed.score === null || computed.score <= 70
                    ? 0
                    : Math.min(5000, (computed.score - 70) * 250);

                return (
                  <tr key={row.employee_id}>
                    <td className="sticky-col">
                      <div className="cell-strong">{row.full_name}</div>
                      <div className="cell-dim">{row.position || '—'}</div>
                    </td>
                    {row.entries.map((e) => (
                      <td key={e.criterion_id}>
                        <ScoreCell
                          entry={{ ...e, score: valueOf(row, e) }}
                          onChange={(v) => setCell(row, e, v)}
                          disabled={busy}
                        />
                      </td>
                    ))}
                    <td style={{ textAlign: 'center' }}>
                      <strong style={{ fontSize: 14 }}>{computed.score ?? '—'}</strong>
                      <div className="text-dim" style={{ fontSize: 10.5 }}>
                        {computed.count}/{criteria.filter((c) => c.is_active).length} kriter
                      </div>
                    </td>
                    <td>
                      {evaluation === '—' ? (
                        <span className="text-dim">—</span>
                      ) : (
                        <span className={`badge ${EVAL_TONE[evaluation] || 'muted'}`}>{evaluation}</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {bonus > 0 ? (
                        <span className="money" style={{ color: '#4ade80', fontWeight: 600 }}>
                          {money(bonus)}
                        </span>
                      ) : (
                        <span className="text-dim">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="alert info mt-14">
        <Info size={15} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          Puanı <strong>70'in üzerinde</strong> olan personele (puan − 70) × 250 ₺ prim verilir,
          en fazla <strong>5.000 ₺</strong>. 70 ve altı prim hak etmez. Hesaplanan prim
          bordroya otomatik yansır.
        </span>
      </div>

      {showCriteria ? (
        <CriteriaModal
          criteria={criteria}
          totalWeight={data.total_weight}
          onClose={() => setShowCriteria(false)}
          onDone={() => load(period)}
        />
      ) : null}
    </>
  );
}
