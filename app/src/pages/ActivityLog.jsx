import { useCallback, useEffect, useState } from 'react';
import { History, Search, X, Plus, Pencil, Trash2, LogIn, LogOut, RotateCcw, Package, UserCog } from 'lucide-react';
import { api, dateTimeFmt, initials } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../components/Toast.jsx';
import { PageHeader, EmptyState, Kpi } from '../components/Primitives.jsx';
import { ConfirmDialog } from '../components/Modal.jsx';

const ACTION_LABELS = {
  create: 'Oluşturma',
  update: 'Güncelleme',
  delete: 'Silme',
  login: 'Giriş',
  logout: 'Çıkış',
};

const ACTION_ICONS = { create: Plus, update: Pencil, delete: Trash2, login: LogIn, logout: LogOut };
const ACTION_TONES = {
  create: 'success',
  update: 'info',
  delete: 'danger',
  login: 'primary',
  logout: 'muted',
};

export default function ActivityLog() {
  const { isAdmin } = useAuth();
  const toast = useToast();

  const [rows, setRows] = useState([]);
  const [entities, setEntities] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [entity, setEntity] = useState('all');
  const [action, setAction] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [clearing, setClearing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/activity', {
        search: search || undefined,
        entity,
        action,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        limit: 200,
      });
      setRows(res.data);
      setTotal(res.total);
      setEntities(res.entities || []);
    } catch (err) {
      toast.fromError(err, 'Aktivite yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [search, entity, action, dateFrom, dateTo, toast]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const clearOld = async () => {
    setBusy(true);
    try {
      const res = await api.del('/activity?keep_days=90');
      toast.success('Eski kayıtlar temizlendi', `${res.data.deleted} kayıt silindi (son 500 korundu).`);
      setClearing(false);
      load();
    } catch (err) {
      toast.fromError(err, 'Temizlenemedi');
    } finally {
      setBusy(false);
    }
  };

  const clearFilters = () => {
    setSearch('');
    setEntity('all');
    setAction('all');
    setDateFrom('');
    setDateTo('');
  };
  const filtersActive = search || entity !== 'all' || action !== 'all' || dateFrom || dateTo;

  const todayCount = rows.filter((r) => String(r.created_at).slice(0, 10) === new Date().toISOString().slice(0, 10)).length;

  return (
    <div className="page">
      <PageHeader
        title="Aktivite Kaydı"
        description="Sistemde yapılan tüm değişikliklerin kullanıcı bazlı izi"
        actions={
          isAdmin ? (
            <button className="btn" onClick={() => setClearing(true)}>
              <Trash2 size={14} />
              Eski kayıtları temizle
            </button>
          ) : null
        }
      />

      <div className="kpi-grid">
        <Kpi label="Listelenen kayıt" value={total} color="#3b82f6" icon={History} small />
        <Kpi label="Bugün" value={todayCount} color="#22c55e" icon={History} small />
        <Kpi label="Kayıt türü" value={entities.length} color="#a855f7" icon={Package} small />
      </div>

      <div className="card mb-14">
        <div className="row row-wrap" style={{ gap: 9 }}>
          <div className="search-box">
            <Search size={14} />
            <input
              className="input"
              placeholder="Açıklama, varlık veya kullanıcı ara..."
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

          <select className="select filter-select" value={entity} onChange={(e) => setEntity(e.target.value)}>
            <option value="all">Tüm varlıklar</option>
            {entities.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>

          <select className="select filter-select" value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="all">Tüm işlemler</option>
            {Object.entries(ACTION_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>

          <div className="row" style={{ gap: 5 }}>
            <input type="date" className="input" style={{ width: 146 }} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} title="Başlangıç" />
            <span className="text-dim">–</span>
            <input type="date" className="input" style={{ width: 146 }} value={dateTo} onChange={(e) => setDateTo(e.target.value)} title="Bitiş" />
          </div>

          {filtersActive ? (
            <button className="btn btn-ghost btn-sm" onClick={clearFilters}>
              <RotateCcw size={13} />
              Temizle
            </button>
          ) : null}
        </div>
      </div>

      <div className="card">
        <div className="card-body">
          {loading ? (
            <div className="loading-page">
              <div className="spinner lg" />
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={History}
              title="Kayıt bulunamadı"
              description={filtersActive ? 'Filtreleri değiştirmeyi deneyin.' : 'Sistemde yapılan işlemler burada listelenir.'}
            />
          ) : (
            <div className="timeline">
              {rows.map((r) => {
                const Icon = ACTION_ICONS[r.action] || History;
                return (
                  <div className="timeline-item" key={r.id}>
                    <div className="row" style={{ gap: 9, alignItems: 'flex-start' }}>
                      <span
                        className={`badge ${ACTION_TONES[r.action] || 'muted'}`}
                        style={{ flexShrink: 0, marginTop: 1 }}
                      >
                        <Icon size={10} />
                        {ACTION_LABELS[r.action] || r.action}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: 'var(--text)' }}>{r.detail || `${r.entity} — ${r.action}`}</div>
                        <div className="text-dim" style={{ fontSize: 11.5, marginTop: 2 }}>
                          {dateTimeFmt(r.created_at)}
                          {r.entity ? ` · ${r.entity}` : ''}
                          {r.entity_id ? ` #${r.entity_id}` : ''}
                        </div>
                      </div>
                      {r.user_name ? (
                        <span className="row text-dim" style={{ gap: 6, fontSize: 11.5, flexShrink: 0 }}>
                          <span className="avatar" style={{ width: 20, height: 20, fontSize: 9 }}>
                            {initials(r.user_name)}
                          </span>
                          {r.user_name}
                        </span>
                      ) : (
                        <span className="row text-dim" style={{ gap: 6, fontSize: 11.5, flexShrink: 0 }}>
                          <UserCog size={14} />
                          Sistem
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {rows.length > 0 ? (
          <div className="pagination">
            <span>
              İlk <strong style={{ color: 'var(--text)' }}>{rows.length}</strong> kayıt gösteriliyor
              {total > rows.length ? ` / ${total} toplam` : ''}
            </span>
          </div>
        ) : null}
      </div>

      <ConfirmDialog
        open={clearing}
        onClose={() => setClearing(false)}
        onConfirm={clearOld}
        busy={busy}
        title="Eski aktivite kayıtları temizlensin mi?"
        message="90 günden eski kayıtlar silinecek.\n\nHer zaman en son 500 kayıt korunur. Bu işlem geri alınamaz."
        confirmLabel="Temizle"
      />
    </div>
  );
}
