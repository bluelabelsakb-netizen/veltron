/**
 * MUSTERI PORTALI - IS TAKIP
 * =========================
 * VurusKAN ve benzeri musterilerin gordugu ekran.
 *
 * KURAL: Bu ekranda MALI BILGI YOK. Fiyat, tutar, agirlik, maliyet bilgisi
 * sunucudan gelmez bile; ekranda gosterilmez. (Guvenlik testleri bunu dogrular.)
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, ChevronRight, Clock, Hourglass, Package, Info } from 'lucide-react';
import { api, dateFmt, dueLabel, number } from '../../lib/api.js';
import { useToast } from '../../components/Toast.jsx';
import { EmptyState, InlineLoading, Kpi, PageHeader } from '../../components/Primitives.jsx';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { DateRequestModal } from './DateRequestModal.jsx';

const FILTERS = [
  { key: 'all', label: 'Tümü' },
  { key: 'open', label: 'Devam edenler' },
  { key: 'done', label: 'Teslim edilenler' },
];

export function PortalJobs() {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [requestFor, setRequestFor] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/portal/jobs');
      setRows(res.data);
    } catch (err) {
      toast.fromError(err, 'İşler yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('tr');
    return rows.filter((r) => {
      if (filter === 'open' && (r.status === 'teslim_edildi' || r.status === 'iptal')) return false;
      if (filter === 'done' && r.status !== 'teslim_edildi') return false;
      if (!term) return true;
      return (
        r.number?.toLocaleLowerCase('tr').includes(term) ||
        r.subject?.toLocaleLowerCase('tr').includes(term)
      );
    });
  }, [rows, filter, search]);

  const stats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return {
      total: rows.length,
      running: rows.filter((r) => r.status !== 'teslim_edildi' && r.status !== 'iptal').length,
      overdue: rows.filter((r) => r.is_overdue).length,
      done: rows.filter((r) => r.status === 'teslim_edildi').length,
      today,
    };
  }, [rows]);

  if (loading) return <InlineLoading />;

  return (
    <>
      <PageHeader title="İşlerim" description="Firmaya ait iş emirlerinin güncel durumu" />

      <div className="grid grid-4 mb-14">
        <Kpi label="Toplam iş" value={number(stats.total)} icon={Package} />
        <Kpi label="Devam eden" value={number(stats.running)} color="var(--primary)" icon={Hourglass} />
        <Kpi
          label="Termini geçen"
          value={number(stats.overdue)}
          color={stats.overdue ? 'var(--danger)' : undefined}
          icon={Clock}
        />
        <Kpi label="Teslim edilen" value={number(stats.done)} color="var(--success)" icon={CalendarClock} />
      </div>

      <div className="toolbar mb-14">
        <div className="seg">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              className={`seg-item ${filter === f.key ? 'on' : ''}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          className="input"
          placeholder="İş no veya konu ara..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 280 }}
        />
      </div>

      {!filtered.length ? (
        <div className="card">
          <EmptyState
            icon={Package}
            title={rows.length ? 'Eşleşen iş yok' : 'Henüz iş emri yok'}
            description={
              rows.length
                ? 'Filtreyi değiştirip tekrar deneyin.'
                : 'Firmanıza ait iş emirleri burada listelenecek.'
            }
          />
        </div>
      ) : (
        <div className="card">
          <div className="list">
            {filtered.map((job) => {
              const due = dueLabel(job.due_date);
              const canRequest =
                job.due_date && job.status !== 'teslim_edildi' && job.status !== 'iptal';
              return (
                <div className="list-row" key={job.id}>
                  <div className="grow">
                    <div className="row-between">
                      <span className="title mono">{job.number}</span>
                      <StatusBadge status={job.status} size="sm" />
                    </div>
                    <div className="meta">{job.subject || '—'}</div>
                    <div className="row gap-8 mt-4 wrap">
                      {job.due_date ? (
                        <span className={`chip ${due.tone === 'over' ? 'danger' : due.tone === 'soon' ? 'warning' : 'muted'}`}>
                          <CalendarClock size={11} />
                          Termin {dateFmt(job.due_date)} · {due.text}
                        </span>
                      ) : (
                        <span className="chip muted">Termin belirlenmedi</span>
                      )}
                      {job.is_overdue ? <span className="chip danger">Termin geçti</span> : null}
                    </div>
                  </div>
                  {canRequest ? (
                    <button
                      className="btn btn-sm"
                      title="Termin değişikliği talep et"
                      onClick={() => setRequestFor(job)}
                    >
                      Tarih talebi
                    </button>
                  ) : null}
                  <ChevronRight size={15} className="text-dim" />
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="alert info mt-14">
        <Info size={15} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          Bu ekranda yalnızca işlerin <strong>durumu ve tarihleri</strong> gösterilir. Fiyat ve fatura
          bilgileri bu hesapla erişilemez.
        </span>
      </div>

      {requestFor ? (
        <DateRequestModal
          job={requestFor}
          onClose={() => setRequestFor(null)}
          onDone={() => {
            setRequestFor(null);
            load();
          }}
        />
      ) : null}
    </>
  );
}

/** `lazy(() => import(...))` icin default export ZORUNLU. */
export default PortalJobs;
