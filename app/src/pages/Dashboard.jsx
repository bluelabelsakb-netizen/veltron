import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  FolderKanban, CheckSquare, AlertTriangle, Receipt, Wallet, TrendingUp,
  Users, Building2, Package, CalendarClock, ArrowUpRight, FileText, RefreshCw,
} from 'lucide-react';
import { api, money, moneyTam, moneyShort, number, percent, dateFmt, statusLabel, statusTone, dueLabel, initials } from '../lib/api.js';
import { guzelEksen, eksenTickleri } from '../lib/chartScale.js';
import { PageHeader, Kpi, KpiMoney, EmptyState, Loading, Tip } from '../components/Primitives.jsx';
import { StatusBadge } from '../components/StatusBadge.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const CHART_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#06b6d4', '#ef4444', '#8b5cf6', '#14b8a6'];

const tooltipStyle = {
  background: '#1a212e',
  border: '1px solid #35415a',
  borderRadius: 8,
  fontSize: 12,
  color: '#e6ecf5',
  padding: '8px 10px',
  boxShadow: '0 6px 18px rgba(0,0,0,0.45)',
};

// Recharts her satiri kendi rengiyle boyar. Koyu temada seri rengi koyu
// kalinca (pasta grafik) yazi okunmaz oluyordu. Renkleri BURADA sabitliyoruz.
// (onceki durum: "Devam Ediyor" koyu gri, sadece ": 3" okunuyordu)
const tooltipLabelStyle = {
  color: '#e6ecf5',
  fontWeight: 600,
  marginBottom: 4,
};

const tooltipItemStyle = { color: '#cfd9e8' };

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/dashboard');
      setData(res.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Panel grafiginin ekseni veriden hesaplanir (reaktif).
   * Recharts varsayilani olsaydi negatif degerlerde cubuklar cerceveyi asardi.
   */
  const panelEksen = useMemo(() => {
    const seri = data?.series?.finance ?? [];
    return guzelEksen(
      seri.map((d) => ({ faturalanan: d.invoiced, tahsilat: d.paid, veri: d })),
      { tikSayisi: 5 }
    );
  }, [data]);

  const panelTickler = useMemo(() => eksenTickleri(panelEksen), [panelEksen]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !data) return <Loading label="Panel hazırlanıyor..." />;

  if (error && !data) {
    return (
      <div className="page">
        <EmptyState
          icon={AlertTriangle}
          title="Panel yüklenemedi"
          description={error}
          action={
            <button className="btn btn-primary" onClick={load}>
              <RefreshCw size={14} />
              Tekrar dene
            </button>
          }
        />
      </div>
    );
  }

  const k = data.kpi;
  const overdueRatio = k.open_tasks > 0 ? (k.overdue_tasks / k.open_tasks) * 100 : 0;

  // Recharts bazi eksen etiketlerinde tickFormatter'i atlayabiliyor;
  // bu yuzden etiketler veriye onceden yazilir.
  const tasksDist = data.distributions.tasks.map((r) => ({ ...r, label: statusLabel(r.key) }));
  const projectsDist = data.distributions.projects.map((r) => ({ ...r, label: statusLabel(r.key) }));

  return (
    <div className="page">
      <PageHeader
        title={`Merhaba, ${(user?.full_name || '').split(' ')[0] || 'Veltron'}`}
        description={new Date().toLocaleDateString('tr-TR', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })}
        actions={
          <button className="btn" onClick={load} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'spin' : undefined} />
            Yenile
          </button>
        }
      />

      {/* ---------------- Ozet kartlari (en ust) ---------------- */}
      <div className="kpi-grid">
        <Kpi label="Aktif müşteri" value={number(k.active_customers)} color="#06b6d4" icon={Building2} small />
        <Kpi label="Aktif çalışan" value={number(k.active_employees)} color="#22c55e" icon={Users} small />
        <Kpi label="7 gün içinde teslim" value={number(k.due_soon_tasks)} color="#f59e0b" icon={CalendarClock} small />
        <Kpi
          label="Fatura durumu"
          value={data.distributions.invoices.length}
          color="#3b82f6"
          icon={Receipt}
          sub={data.distributions.invoices.map((i) => `${statusLabel(i.key)}: ${i.value}`).join(' · ')}
          small
        />
        <Kpi
          label="Bekleyen teklif"
          value={number(k.pending_quotes)}
          color="#8b5cf6"
          icon={FileText}
          sub="Müşteri yanıtı bekliyor"
          onClick={() => navigate('/teklifler')}
          small
        />
        <Kpi
          label="Kritik stok"
          value={number(k.critical_stock)}
          color={k.critical_stock > 0 ? '#ef4444' : '#22c55e'}
          icon={Package}
          sub={k.critical_stock > 0 ? 'Min. seviyede veya altında' : 'Stoklar yeterli'}
          onClick={() => navigate('/urunler')}
          small
        />
      </div>

      {/* ---------------- Sayisal gostergeler ---------------- */}
      <div className="kpi-grid">
        <Kpi
          label="Aktif proje"
          value={number(k.active_projects)}
          color="#3b82f6"
          icon={FolderKanban}
          sub={`${number(k.completed_projects)} tamamlandı`}
          onClick={() => navigate('/projeler')}
        />
        <Kpi
          label="Açık görev"
          value={number(k.open_tasks)}
          color="#a855f7"
          icon={CheckSquare}
          sub={`${number(k.my_open_tasks)} tanesi size ait`}
          onClick={() => navigate('/gorevler')}
        />
        <Kpi
          label="Geciken görev"
          value={number(k.overdue_tasks)}
          color="#ef4444"
          icon={AlertTriangle}
          sub={k.open_tasks ? `Açık görevlerin ${percent(overdueRatio, 0)}'i` : 'Gecikme yok'}
          onClick={() => navigate('/gorevler')}
        />
        <Kpi
          label="Bu ay faturalanan"
          value={moneyTam(k.invoiced_month)}
          color="#06b6d4"
          icon={Receipt}
          sub={`Toplam ${money(k.invoiced_total)}`}
          onClick={() => navigate('/faturalar')}
        />
        <Kpi
          label="Bu ay tahsilat"
          value={moneyTam(k.paid_month)}
          color="#22c55e"
          icon={Wallet}
          sub={`Toplam ${money(k.paid_total)}`}
          onClick={() => navigate('/faturalar')}
        />
        <KpiMoney
          label="Alacak"
          value={k.outstanding}
          color={k.outstanding > 0 ? '#f59e0b' : '#22c55e'}
          icon={TrendingUp}
          sub={k.outstanding > 0 ? 'Tahsilat bekleyen' : 'Borç yok'}
          onClick={() => navigate('/faturalar')}
        />
      </div>

      {/* ---------------- Grafigler ---------------- */}
      <div className="grid-2-1 mb-14">
        <div className="card">
          <div className="card-head">
            <h3>Faturalama ve Tahsilat</h3>
            <span className="text-dim text-sm">Son 12 ay</span>
          </div>
          <div className="card-body">
            <div className="chart-box">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.series.finance} margin={{ top: 6, right: 8, left: -14, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gInv" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.32} />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="gPaid" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22c55e" stopOpacity={0.32} />
                      <stop offset="100%" stopColor="#22c55e" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#263041" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: '#6b788d', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis
                    domain={[panelEksen.min, panelEksen.max]}
                    ticks={panelTickler}
                    allowDecimals={false}
                    tick={{ fill: '#6b788d', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => moneyShort(v)}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelStyle={tooltipLabelStyle}
                    itemStyle={tooltipItemStyle}
                    formatter={(v, n) => [money(v), n === 'invoiced' ? 'Faturalanan' : 'Tahsilat']}
                    labelFormatter={(l, p) => p?.[0]?.payload?.month ?? l}
                  />
                  <Area
                    type="monotone"
                    dataKey="invoiced"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    fill="url(#gInv)"
                  />
                  <Area type="monotone" dataKey="paid" stroke="#22c55e" strokeWidth={2} fill="url(#gPaid)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="chart-legend">
              <span className="key">
                <span className="swatch" style={{ background: '#3b82f6' }} /> Faturalanan
              </span>
              <span className="key">
                <span className="swatch" style={{ background: '#22c55e' }} /> Tahsilat
              </span>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h3>Proje Durumu</h3>
          </div>
          <div className="card-body">
            {data.distributions.projects.length === 0 ? (
              <EmptyState compact title="Proje yok" description="İlk projenizi ekleyerek başlayın." />
            ) : (
              <>
                <div className="chart-box" style={{ height: 168 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={projectsDist}
                        dataKey="value"
                        nameKey="label"
                        innerRadius={44}
                        outerRadius={68}
                        paddingAngle={2}
                      >
                        {projectsDist.map((row, i) => (
                          <Cell key={i} fill={toneColor(statusTone(row.key))} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={tooltipStyle}
                        labelStyle={tooltipLabelStyle}
                        itemStyle={tooltipItemStyle}
                        formatter={(v, n) => [`${number(v)} proje`, n]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ marginTop: 6 }}>
                  {projectsDist.map((row) => (
                    <div className="bar-row" key={row.key}>
                      <span className="bar-label">{row.label}</span>
                      <span className="bar-track">
                        <span
                          className="bar-fill"
                          style={{
                            width: `${total(projectsDist) ? (row.value / total(projectsDist)) * 100 : 0}%`,
                            background: toneColor(statusTone(row.key)),
                          }}
                        />
                      </span>
                      <span className="bar-value">{row.value}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="grid-3 mb-14">
        {/* Gorev durumu */}
        <div className="card">
          <div className="card-head">
            <h3>Görev Durumu</h3>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/gorevler')}>
              Tümü <ArrowUpRight size={13} />
            </button>
          </div>
          <div className="card-body">
            {data.distributions.tasks.length === 0 ? (
              <EmptyState compact title="Görev yok" />
            ) : (
              <>
                <div className="chart-box" style={{ height: 150 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={tasksDist} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
                      <XAxis dataKey="label" tick={{ fill: '#6b788d', fontSize: 10 }} axisLine={false} tickLine={false} interval={0} angle={-12} textAnchor="end" height={42} />
                      <YAxis tick={{ fill: '#6b788d', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        labelStyle={tooltipLabelStyle}
                        itemStyle={tooltipItemStyle}
                        cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                        formatter={(v, n) => [number(v), 'Görev']}
                      />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                        {tasksDist.map((row, i) => (
                          <Cell key={i} fill={toneColor(statusTone(row.key))} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="row row-wrap" style={{ gap: 6, marginTop: 8 }}>
                  {tasksDist.map((row) => (
                    <span key={row.key} className={`badge ${statusTone(row.key)}`}>
                      {row.label}: {row.value}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* En cok yuklenen calisanlar */}
        <div className="card">
          <div className="card-head">
            <h3>Çalışan Yükü</h3>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/calisanlar')}>
              Tümü <ArrowUpRight size={13} />
            </button>
          </div>
          <div className="card-body">
            {data.workload.length === 0 ? (
              <EmptyState compact title="Aktif çalışan yok" />
            ) : (
              data.workload.map((w) => (
                <div className="list-row" key={w.id}>
                  <div className="avatar" style={{ width: 26, height: 26, fontSize: 10.5 }}>
                    {initials(w.full_name)}
                  </div>
                  <div className="grow">
                    <div className="title truncate">{w.full_name}</div>
                    <div className="meta">
                      {w.position || '—'} · {number(w.spent_hours)} / {number(w.estimated_hours)} saat
                    </div>
                  </div>
                  <span className={`badge ${w.open_tasks > 5 ? 'warning' : 'muted'}`}>{w.open_tasks} görev</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* En cok gelir getiren musteriler */}
        <div className="card">
          <div className="card-head">
            <h3>En Çok Kazandıran Müşteriler</h3>
          </div>
          <div className="card-body">
            {data.top_customers.length === 0 ? (
              <EmptyState compact title="Henüz fatura yok" />
            ) : (
              data.top_customers.map((c) => (
                <div className="bar-row" key={c.id}>
                  <Tip text={c.label}>
                    <span className="bar-label">{c.label}</span>
                  </Tip>
                  <span className="bar-track">
                    <span
                      className="bar-fill"
                      style={{
                        width: `${data.top_customers[0].value ? (c.value / data.top_customers[0].value) * 100 : 0}%`,
                        background: CHART_COLORS[data.top_customers.indexOf(c) % CHART_COLORS.length],
                      }}
                    />
                  </span>
                  <span className="bar-value">{moneyShort(c.value)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="grid-2">
        {/* Yaklasan terminler */}
        <div className="card">
          <div className="card-head">
            <h3>Yaklaşan Terminler</h3>
            <span className="text-dim text-sm">En yakın 8 görev</span>
          </div>
          <div className="card-body">
            {data.upcoming_tasks.length === 0 ? (
              <EmptyState compact title="Yaklaşan görev yok" description="Tüm görevler tamamlanmış görünüyor." />
            ) : (
              data.upcoming_tasks.map((t) => {
                const due = dueLabel(t.due_date);
                return (
                  <div
                    className="list-row"
                    key={t.id}
                    onClick={() => navigate('/gorevler')}
                    style={{ cursor: 'pointer' }}
                  >
                    <CalendarClock
                      size={15}
                      style={{
                        flexShrink: 0,
                        color: due.tone === 'over' ? '#ef4444' : due.tone === 'soon' ? '#f59e0b' : '#6b788d',
                      }}
                    />
                    <div className="grow">
                      <div className="title truncate">{t.title}</div>
                      <div className="meta truncate">
                        {t.project_name || 'Projesiz'}
                        {t.assignee_name ? ` · ${t.assignee_name}` : ''}
                      </div>
                    </div>
                    <span className={`${due.tone === 'over' ? 'due-over' : due.tone === 'soon' ? 'due-soon' : 'text-dim'} text-sm nowrap`}>
                      {due.text}
                    </span>
                    <StatusBadge status={t.status} size="sm" />
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Son aktiviteler */}
        <div className="card">
          <div className="card-head">
            <h3>Son Hareketler</h3>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/aktivite')}>
              Tümü <ArrowUpRight size={13} />
            </button>
          </div>
          <div className="card-body">
            {data.activity.length === 0 ? (
              <EmptyState compact title="Aktivite yok" />
            ) : (
              <div className="timeline">
                {data.activity.map((a) => (
                  <div className="timeline-item" key={a.id}>
                    <div style={{ color: 'var(--text)' }}>{a.detail || `${a.entity} ${a.action}`}</div>
                    <div className="meta text-dim" style={{ fontSize: 11.5 }}>
                      {a.user_name || 'Sistem'} · {relativeTime(a.created_at)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const total = (rows) => rows.reduce((s, r) => s + Number(r.value || 0), 0);

function toneColor(tone) {
  return {
    success: '#22c55e',
    warning: '#f59e0b',
    danger: '#ef4444',
    info: '#06b6d4',
    primary: '#3b82f6',
    purple: '#a855f7',
  }[tone] || '#6b788d';
}

function relativeTime(value) {
  if (!value) return '';
  const then = new Date(String(value).replace(' ', 'T') + (String(value).includes('Z') ? '' : 'Z'));
  const diff = Date.now() - then.getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'az önce';
  if (mins < 60) return `${mins} dk önce`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} saat önce`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} gün önce`;
  return dateFmt(value);
}
