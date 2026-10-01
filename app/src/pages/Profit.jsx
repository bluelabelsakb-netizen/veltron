import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  TrendingUp, TrendingDown, Briefcase, Wallet, PiggyBank, Percent,
  RotateCcw, AlertTriangle, Crown, Award, ArrowUpRight, Info, FileText, HardHat,
  SlidersHorizontal,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts';
import { api, money, moneyKart, moneyShort, number, percent, dateFmt, toCsv } from '../lib/api.js';
import { guzelEksen, guzelAdim, eksenTickleri } from '../lib/chartScale.js';
import { useToast } from '../components/Toast.jsx';
import { PageHeader, Kpi, KpiMoney, EmptyState, Tip } from '../components/Primitives.jsx';
import { DataTable } from '../components/DataTable.jsx';

const CHART_COLORS = ['#3b82f6', '#22c55e', '#a855f7', '#f59e0b', '#06b6d4', '#ef4444', '#8b5cf6', '#14b8a6'];
const tooltipStyle = {
  background: '#1a212e', border: '1px solid #35415a', borderRadius: 8, fontSize: 12, color: '#e6ecf5',
};

export default function Profit() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [customers, setCustomers] = useState([]);

  useEffect(() => {
    api.get('/customers?limit=300')
      .then((r) => setCustomers(r.data))
      .catch(() => setCustomers([]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/profit', {
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        customer_id: customerId || undefined,
      });
      setData(res.data);
    } catch (err) {
      toast.fromError(err, 'Rapor yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, customerId, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const s = data?.summary;
  const hasFilter = dateFrom || dateTo || customerId;

  const exportCsv = () => {
    const rows = data?.work_orders || [];
    const csv = toCsv(
      [
        { key: 'number', header: 'İş Emri No' },
        { key: 'work_date', header: 'Tarih' },
        { key: 'customer_name', header: 'Müşteri' },
        { key: 'net_weight', header: 'Net (ton)' },
        { key: 'revenue', header: 'Satış (TL)' },
        { key: 'cost', header: 'Taşeron (TL)' },
        { key: 'profit', header: 'Kâr (TL)' },
        { key: 'margin', header: 'Marj (%)' },
      ],
      rows
    );
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `veltron-kar-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV indirildi', `${rows.length} iş emri dışa aktarıldı.`);
  };

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.by_month.map((m) => ({
      ...m,
      kar: m.profit,
    }));
  }, [data]);

  /**
   * Eksen veriden hesaplanir (reaktif). Kullanici isterse elle sabitler.
   * Ayar localStorage'da tutulur ki sayfa yenilense de kaybolmaz.
   */
  const [eksenSabit, setEksenSabit] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('veltron.karEkseni') || 'null');
    } catch {
      return null;
    }
  });
  const [eksenGoster, setEksenGoster] = useState(false);
  const [eksenGirdi, setEksenGirdi] = useState({ min: 0, max: 1 });

  const hesaplananEksen = useMemo(
    () =>
      guzelEksen(chartData.map((d) => ({ toplam: d.revenue, maliyet: d.cost, kar: d.kar, veri: d })), {
        tikSayisi: 5,
      }),
    [chartData]
  );

  const aktifEksen = useMemo(() => {
    if (!eksenSabit?.max) return hesaplananEksen;
    const min = Number(eksenSabit.min ?? 0);
    const max = Number(eksenSabit.max);
    return {
      min,
      max,
      adim: guzelAdim((max - min) / 4 || 1),
      negatif: min < 0,
      elle: true,
    };
  }, [eksenSabit, hesaplananEksen]);

  const tickler = useMemo(() => eksenTickleri(aktifEksen), [aktifEksen]);

  const eksenKaydet = (min, max) => {
    const kayit = { min: Number(min) || 0, max: Number(max) || 0 };
    if (kayit.max <= kayit.min) return;
    setEksenSabit(kayit);
    try {
      localStorage.setItem('veltron.karEkseni', JSON.stringify(kayit));
    } catch {
      /* depolama kapalı olabilir */
    }
  };

  const eksenSifirla = () => {
    setEksenSabit(null);
    try {
      localStorage.removeItem('veltron.karEkseni');
    } catch {
      /* yoksay */
    }
  };

  return (
    <>
      <PageHeader
        title="Kâr Raporu"
        description="İş emri satışlarından taşeron maliyeti düşülerek"
        actions={
          <button className="btn" onClick={load} disabled={loading}>
            <RotateCcw size={14} className={loading ? 'spin' : undefined} />
            Yenile
          </button>
        }
      />

      {/* Filtreler */}
      <div className="card mb-14">
        <div className="row row-wrap" style={{ gap: 9 }}>
          <span className="text-dim text-sm" style={{ marginRight: 2 }}>
            Tarih aralığı:
          </span>
          <input
            type="date"
            className="input"
            style={{ width: 152 }}
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
          <span className="text-dim">–</span>
          <input
            type="date"
            className="input"
            style={{ width: 152 }}
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
          <select
            className="select filter-select"
            style={{ minWidth: 190 }}
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
          >
            <option value="">Tüm müşteriler</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.company || c.contact || `#${c.id}`}
              </option>
            ))}
          </select>
          {hasFilter ? (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setDateFrom('');
                setDateTo('');
                setCustomerId('');
              }}
            >
              <RotateCcw size={13} />
              Filtreleri temizle
            </button>
          ) : null}
        </div>
      </div>

      {/* Ana göstergeler */}
      <div className="kpi-grid">
        <KpiMoney label="Toplam satış" value={s?.revenue} color="#3b82f6" icon={TrendingUp} small />
        <KpiMoney
          label="Taşeron maliyeti"
          value={s?.cost}
          color="#ef4444"
          icon={HardHat}
          sub={`${s?.with_subcontractor || 0} işte taşeron`}
          small
        />
        <KpiMoney
          label="Kâr"
          value={s?.profit}
          color={s?.profit >= 0 ? '#22c55e' : '#ef4444'}
          icon={Award}
          sub={`${s?.delivered_count || 0} iş teslim edildi`}
          small
        />
        <Kpi label="Marj" value={percent(s?.margin)} color="#a855f7" icon={Percent} sub="kâr / satış" small />
        <Kpi
          label="İş emri"
          value={number(s?.work_order_count)}
          color="#06b6d4"
          icon={Briefcase}
          sub={`ort. ${moneyKart(s?.avg_profit)} kâr`}
          small
        />
        <Kpi label="Toplam net" value={`${number(s?.net_weight)} ton`} color="#f59e0b" icon={PiggyBank} small />
      </div>

      {/* Önemli uyarı */}
      <div className="alert info mb-14">
        <Info size={16} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          <strong>Bu rakam gerçek net kâr değildir.</strong> İş emri satışından yalnızca
          <strong> taşeron maliyeti</strong> düşülür. Kendi personel emeğiniz, malzeme alımı,
          araç gideri ve genel giderler hesaba katılmaz — yani <em>katkı marjıdır</em>.
          Tam maliyet takibi için <em>Malzeme</em> ve <em>Stok Hareketleri</em> ekranlarındaki
          giderlerin de iş emrine bağlanması gerekir.
        </span>
      </div>

      {!loading && !s?.work_order_count ? (
        <div className="card">
          <EmptyState
            icon={Briefcase}
            title={hasFilter ? 'Bu filtrede iş emri yok' : 'Henüz iş emri yok'}
            description={
              hasFilter
                ? 'Tarih aralığını genişletin veya farklı bir müşteri seçin.'
                : 'İş emri eklediğinizde kâr raporu burada görünecek.'
            }
          />
        </div>
      ) : (
        <>
          {/* Aylık grafik + tahsilat uyarısı */}
          <div className="grid-2-1 mb-14">
            <div className="card">
              <div className="card-head">
                <h3>Aylık Kâr</h3>
                <span className="text-dim text-sm">satış − taşeron</span>
                <div className="spacer" />
                <button
                  className="btn btn-sm"
                  onClick={() => {
                    setEksenGoster((v) => !v);
                    setEksenGirdi({ min: aktifEksen.min, max: aktifEksen.max });
                  }}
                  title="Eksen sınırlarını elle ayarla"
                >
                  <SlidersHorizontal size={13} />
                  Eksen
                </button>
              </div>
              <div className="card-body">
                {eksenGoster ? (
                  <div className="eksen-ayar mb-14">
                    <label className="eksen-alan">
                      Alt sınır
                      <input
                        type="number"
                        className="input"
                        value={eksenGirdi.min}
                        onChange={(e) => setEksenGirdi((g) => ({ ...g, min: e.target.value }))}
                      />
                    </label>
                    <label className="eksen-alan">
                      Üst sınır
                      <input
                        type="number"
                        className="input"
                        value={eksenGirdi.max}
                        onChange={(e) => setEksenGirdi((g) => ({ ...g, max: e.target.value }))}
                      />
                    </label>
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={() => eksenKaydet(eksenGirdi.min, eksenGirdi.max)}
                    >
                      Uygula
                    </button>
                    <button
                      className="btn btn-sm"
                      onClick={() => {
                        eksenSifirla();
                        setEksenGirdi({ min: hesaplananEksen.min, max: hesaplananEksen.max });
                      }}
                      disabled={!eksenSabit?.max}
                    >
                      <RotateCcw size={12} />
                      Veriye göre
                    </button>
                    <div className="spacer" />
                    <span className="text-dim text-sm">
                      {eksenSabit?.max
                        ? `Elle sabitlendi (${number(aktifEksen.min)} … ${number(aktifEksen.max)})`
                        : 'Şu an veriye göre otomatik ayarlanıyor'}
                    </span>
                  </div>
                ) : null}
                <div className="chart-box" style={{ height: 240 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 6, right: 8, left: -8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#263041" vertical={false} />
                      <XAxis dataKey="label" tick={{ fill: '#6b788d', fontSize: 11 }} axisLine={false} tickLine={false} />
                      {/*
                        Eksen veriden hesaplanir (reaktif): negatif kâr varsa
                        alt sınır 0'ın ALTINA iner, böylece çubuklar
                        çerçeveyi AŞMAZ. Recharts varsayılanı ([0,'auto'])
                        negatif çubukları kırpıyordu.
                      */}
                      <YAxis
                        domain={[aktifEksen.min, aktifEksen.max]}
                        ticks={tickler}
                        allowDecimals={false}
                        tick={{ fill: '#6b788d', fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => moneyShort(v)}
                      />
                      {aktifEksen.negatif ? (
                        <ReferenceLine y={0} stroke="#5a6270" strokeWidth={1.5} />
                      ) : null}
                      <Tooltip
                        contentStyle={tooltipStyle}
                        formatter={(v, n) => [money(v), n === 'revenue' ? 'Satış' : n === 'cost' ? 'Taşeron' : 'Kâr']}
                      />
                      <Bar dataKey="revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={44} />
                      <Bar dataKey="cost" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={20} />
                      <Bar dataKey="kar" fill="#22c55e" radius={[4, 4, 0, 0]} maxBarSize={20} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="chart-legend">
                  <span className="key"><span className="swatch" style={{ background: '#3b82f6' }} /> Satış</span>
                  <span className="key"><span className="swatch" style={{ background: '#ef4444' }} /> Taşeron maliyeti</span>
                  <span className="key"><span className="swatch" style={{ background: '#22c55e' }} /> Kâr</span>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-head">
                <AlertTriangle
                  size={15}
                  style={{ color: data?.collection.uninvoiced_count ? '#f59e0b' : 'var(--text-dim)' }}
                />
                <h3>Tahsil Edilemeyen</h3>
              </div>
              <div className="card-body">
                {data?.collection.uninvoiced_count ? (
                  <>
                    <div className="stat-row">
                      <span className="label">Teslim ama faturası yok</span>
                      <span className="value money" style={{ color: '#fbbf24' }}>
                        {money(data.collection.uninvoiced_amount)}
                      </span>
                    </div>
                    <div className="stat-row">
                      <span className="label">İş emri sayısı</span>
                      <span className="value">{data.collection.uninvoiced_count}</span>
                    </div>
                    <div style={{ marginTop: 12 }}>
                      {data.collection.uninvoiced.map((r) => (
                        <div className="list-row" key={r.id}>
                          <div className="grow">
                            <div className="title mono">{r.number}</div>
                            <div className="meta">
                              {r.customer_name} · {dateFmt(r.work_date)}
                            </div>
                          </div>
                          <span className="money" style={{ color: '#fbbf24' }}>
                            {money(r.revenue)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <EmptyState compact title="Hesap kapatılmamış iş yok" description="Teslim edilen tüm işlerin faturası kesilmiş." />
                )}
              </div>
            </div>
          </div>

          <div className="grid-2 mb-14">
            {/* Müşteri kırılımı */}
            <div className="card">
              <div className="card-head">
                <h3>Müşteri Bazında</h3>
              </div>
              <div className="card-body">
                {!data?.by_customer?.length ? (
                  <EmptyState compact title="Veri yok" />
                ) : (
                  data.by_customer.map((c, i) => {
                    const max = Math.max(...data.by_customer.map((x) => x.revenue), 1);
                    return (
                      <div className="bar-row" key={c.id}>
                        <Tip text={c.name}>
                          <span className="bar-label">{c.name}</span>
                        </Tip>
                        <span className="bar-track">
                          <span
                            className="bar-fill"
                            style={{
                              width: `${(c.revenue / max) * 100}%`,
                              background: CHART_COLORS[i % CHART_COLORS.length],
                            }}
                          />
                        </span>
                        <span className="bar-value" style={{ width: 112 }}>
                          {moneyShort(c.profit)}
                        </span>
                        <span className="text-dim text-sm" style={{ width: 52, textAlign: 'right' }}>
                          {percent(c.margin)}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Taşeron kırılımı */}
            <div className="card">
              <div className="card-head">
                <HardHat size={15} style={{ color: 'var(--warning)' }} />
                <h3>Taşeron Maliyetleri</h3>
              </div>
              <div className="card-body">
                {!data?.by_subcontractor?.length ? (
                  <EmptyState compact title="Taşeron maliyeti yok" description="İş emirlerine taşeron atadıkça burada görünür." />
                ) : (
                  <>
                    {data.by_subcontractor.map((t, i) => {
                      const max = Math.max(...data.by_subcontractor.map((x) => x.cost), 1);
                      return (
                        <div className="bar-row" key={t.id}>
                          <Tip text={t.name}>
                            <span className="bar-label">{t.name}</span>
                          </Tip>
                          <span className="bar-track">
                            <span
                              className="bar-fill"
                              style={{ width: `${(t.cost / max) * 100}%`, background: '#f59e0b' }}
                            />
                          </span>
                          <span className="bar-value" style={{ width: 112 }}>
                            {moneyShort(t.cost)}
                          </span>
                          <span className="text-dim text-sm" style={{ width: 52, textAlign: 'right' }}>
                            {percent(t.share)}
                          </span>
                        </div>
                      );
                    })}
                    <div className="stat-row total" style={{ marginTop: 10 }}>
                      <span className="label">Toplam taşeron maliyeti</span>
                      <span className="value money neg">−{money(data.by_subcontractor.reduce((x, t) => x + t.cost, 0))}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Aylık tablo */}
          {data?.by_month?.length > 1 ? (
            <div className="card mb-14">
              <div className="card-head">
                <h3>Aylık Karşılaştırma</h3>
              </div>
              <div className="table-scroll">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Dönem</th>
                      <th style={{ width: 76, textAlign: 'right' }}>İş</th>
                      <th style={{ width: 128, textAlign: 'right' }}>Satış</th>
                      <th style={{ width: 128, textAlign: 'right' }}>Taşeron</th>
                      <th style={{ width: 128, textAlign: 'right' }}>Kâr</th>
                      <th style={{ width: 88, textAlign: 'right' }}>Marj</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.by_month.map((m) => (
                      <tr key={m.month}>
                        <td className="cell-strong" style={{ textTransform: 'capitalize' }}>
                          {m.label}
                        </td>
                        <td className="col-num cell-muted">{m.count}</td>
                        <td className="col-num money">{money(m.revenue)}</td>
                        <td className="col-num money neg">−{money(m.cost)}</td>
                        <td className="col-num">
                          <span className={`money ${m.profit >= 0 ? 'pos' : 'neg'}`}>{money(m.profit)}</span>
                        </td>
                        <td className="col-num">
                          <span className={`badge ${m.margin >= 50 ? 'success' : m.margin >= 20 ? 'warning' : 'danger'}`}>
                            {percent(m.margin)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {/* İş emri listesi */}
          <DataTable
            columns={[
              {
                key: 'number',
                header: 'İş Emri',
                render: (r) => (
                  <div>
                    <div className="cell-strong mono">{r.number}</div>
                    <div className="cell-dim truncate" style={{ maxWidth: 200 }}>
                      {r.subject || '—'}
                    </div>
                  </div>
                ),
              },
              { key: 'customer_name', header: 'Müşteri' },
              { key: 'work_date', header: 'Tarih', width: 104, render: (r) => dateFmt(r.work_date) },
              {
                key: 'net_weight',
                header: 'Net',
                align: 'right',
                width: 106,
                render: (r) => <span className="cell-muted">{number(r.net_weight)} {r.unit}</span>,
              },
              { key: 'revenue', header: 'Satış', align: 'right', width: 118, render: (r) => <span className="money">{money(r.revenue)}</span> },
              {
                key: 'cost',
                header: 'Taşeron',
                align: 'right',
                width: 108,
                render: (r) =>
                  r.cost > 0 ? <span className="money neg">−{money(r.cost)}</span> : <span className="text-dim">—</span>,
              },
              {
                key: 'profit',
                header: 'Kâr',
                align: 'right',
                width: 122,
                render: (r) => (
                  <span className={`money ${r.profit >= 0 ? 'pos' : 'neg'}`} style={{ fontWeight: 700 }}>
                    {money(r.profit)}
                  </span>
                ),
              },
              {
                key: 'margin',
                header: 'Marj',
                align: 'right',
                width: 88,
                render: (r) => (
                  <span className={`badge ${r.margin >= 50 ? 'success' : r.margin >= 20 ? 'warning' : 'danger'}`}>
                    {percent(r.margin)}
                  </span>
                ),
              },
              {
                key: 'status',
                header: 'Durum',
                width: 112,
                render: (r) => (
                  <span className={`badge ${r.status === 'teslim_edildi' ? 'success' : r.status === 'ertelendi' ? 'danger' : 'info'}`}>
                    {r.status === 'teslim_edildi' ? 'Teslim' : r.status === 'hazirlaniyor' ? 'Hazırlanıyor' : r.status === 'ertelendi' ? 'Ertelendi' : 'Alındı'}
                  </span>
                ),
              },
            ]}
            rows={data?.work_orders || []}
            loading={loading}
            emptyTitle="Veri yok"
            onExport={exportCsv}
          />
        </>
      )}
    </>
  );
}
