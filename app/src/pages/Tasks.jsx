import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckSquare, Plus, LayoutList, Columns3, Filter, Flag } from 'lucide-react';
import { ResourcePage } from '../components/ResourcePage.jsx';
import { useLookups } from '../context/LookupsContext.jsx';
import { useToast } from '../components/Toast.jsx';
import { StatusBadge, PriorityBadge } from '../components/StatusBadge.jsx';
import { api, number, dateFmt, dueLabel, initials, TASK_STATUS_OPTIONS, PRIORITY_OPTIONS } from '../lib/api.js';
import { EmptyState, Loading } from '../components/Primitives.jsx';
import { PageHeader } from '../components/Primitives.jsx';
import { Modal } from '../components/Modal.jsx';
import { FormField, useFormState } from '../components/Form.jsx';

export default function Tasks() {
  const [view, setView] = useState('board'); // board | list

  return (
    <>
      <div className="row mb-14" style={{ marginTop: -6 }}>
        <div className="spacer" />
        <div style={{ display: 'flex', gap: 2, background: 'var(--bg-elevated)', padding: 3, borderRadius: 7, border: '1px solid var(--border)' }}>
          <button
            className={`btn btn-sm ${view === 'board' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setView('board')}
          >
            <Columns3 size={13} />
            Pano
          </button>
          <button
            className={`btn btn-sm ${view === 'list' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setView('list')}
          >
            <LayoutList size={13} />
            Liste
          </button>
        </div>
      </div>

      {view === 'board' ? <TaskBoard /> : <TaskList />}
    </>
  );
}

// =========================================================================
// LISTE GORUNUMU
// =========================================================================

function TaskList() {
  const { projectOptions, employeeOptions } = useLookups();

  return (
    <ResourcePage
      emptyIcon={CheckSquare}
      endpoint="/tasks"
      title="Görev Takibi"
      description="Projeye bağlı görevler, sorumlular, süre ve termin takibi"
      createLabel="Yeni Görev"
      searchPlaceholder="Görev başlığı veya açıklama ara..."
      csvName="veltron-gorevler"
      defaultSort={{ key: 'due_date', dir: 'asc' }}
      fields={[
        { name: 'title', label: 'Görev başlığı', required: true, span: 2 },
        { name: 'project_id', label: 'Proje', type: 'select', options: projectOptions },
        { name: 'assignee_id', label: 'Sorumlu', type: 'select', options: employeeOptions },
        { name: 'status', label: 'Durum', type: 'select', options: TASK_STATUS_OPTIONS, required: true, defaultValue: 'todo' },
        { name: 'priority', label: 'Öncelik', type: 'select', options: PRIORITY_OPTIONS, defaultValue: 'normal' },
        { name: 'estimated_hours', label: 'Tahmini saat', type: 'number', min: 0, step: '0.5' },
        { name: 'spent_hours', label: 'Harcanan saat', type: 'number', min: 0, step: '0.5' },
        { name: 'start_date', label: 'Başlangıç', type: 'date' },
        { name: 'due_date', label: 'Termin', type: 'date' },
        { name: 'description', label: 'Açıklama', type: 'textarea', span: 2, rows: 4 },
      ]}
      sections={[
        { title: 'Görev', fields: ['title', 'description'] },
        { title: 'Atama', fields: ['project_id', 'assignee_id', 'status', 'priority'] },
        { title: 'Süre ve plan', fields: ['estimated_hours', 'spent_hours', 'start_date', 'due_date'] },
      ]}
      columns={[
        {
          key: 'title',
          header: 'Görev',
          render: (r) => (
            <div>
              <div
                className="cell-strong"
                style={{
                  textDecoration: r.status === 'done' ? 'line-through' : 'none',
                  color: r.status === 'done' ? 'var(--text-dim)' : undefined,
                }}
              >
                {r.title}
              </div>
              <div className="cell-dim">{r.project_name || 'Projesiz'}</div>
            </div>
          ),
        },
        {
          key: 'status',
          header: 'Durum',
          sortKey: 'status',
          width: 122,
          render: (r) => <StatusBadge status={r.status} />,
        },
        { key: 'priority', header: 'Öncelik', sortKey: 'priority', width: 92, render: (r) => <PriorityBadge priority={r.priority} /> },
        {
          key: 'assignee_name',
          header: 'Sorumlu',
          width: 150,
          render: (r) =>
            r.assignee_name ? (
              <span className="row" style={{ gap: 7 }}>
                <span className="avatar" style={{ width: 22, height: 22, fontSize: 9.5 }}>
                  {initials(r.assignee_name)}
                </span>
                <span className="truncate">{r.assignee_name}</span>
              </span>
            ) : (
              <span className="text-dim">Atanmadı</span>
            ),
        },
        {
          key: 'due_date',
          header: 'Termin',
          sortKey: 'due_date',
          width: 118,
          render: (r) => {
            if (['done', 'cancelled'].includes(r.status)) {
              return <span className="text-dim text-sm">{dateFmt(r.due_date)}</span>;
            }
            const due = dueLabel(r.due_date);
            return (
              <span className={`${due.tone === 'over' ? 'due-over' : due.tone === 'soon' ? 'due-soon' : ''} nowrap`}>
                {due.text}
              </span>
            );
          },
          csv: (r) => r.due_date || '',
        },
        {
          key: 'hours',
          header: 'Süre',
          align: 'right',
          width: 100,
          render: (r) => (
            <span className="cell-muted nowrap">
              {number(r.spent_hours)} / {number(r.estimated_hours)} s
            </span>
          ),
          csv: (r) => `${r.spent_hours}/${r.estimated_hours}`,
        },
      ]}
      filters={[
        { name: 'status', label: 'Tüm durumlar', options: TASK_STATUS_OPTIONS },
        { name: 'priority', label: 'Tüm öncelikler', options: PRIORITY_OPTIONS },
        { name: 'assignee_id', label: 'Tüm sorumlular', options: employeeOptions },
        { name: 'project_id', label: 'Tüm projeler', options: projectOptions },
      ]}
      deleteMessage={(r) => `"${r.title}" görevi silinecek.\n\nBu işlem geri alınamaz.`}
    />
  );
}

// =========================================================================
// PANO GORUNUMU
// =========================================================================

const BOARD_COLUMNS = [
  { key: 'todo', label: 'Yapılacak', color: 'var(--text-dim)' },
  { key: 'in_progress', label: 'Devam Ediyor', color: 'var(--primary)' },
  { key: 'review', label: 'Kontrol', color: 'var(--purple)' },
  { key: 'done', label: 'Tamamlandı', color: 'var(--success)' },
  { key: 'cancelled', label: 'İptal', color: '#ef4444' },
];

function TaskBoard() {
  const { employeeOptions, projectOptions, reload } = useLookups();
  const toast = useToast();
  const navigate = useNavigate();

  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dragging, setDragging] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const [filter, setFilter] = useState({ assignee_id: '', project_id: '' });
  const [adding, setAdding] = useState(null); // hedef sütun durumu
  const [detail, setDetail] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/tasks', { limit: 500, ...filter });
      setTasks(res.data);
    } catch (err) {
      toast.fromError(err, 'Görevler yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [filter, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const byStatus = useMemo(() => {
    const groups = Object.fromEntries(BOARD_COLUMNS.map((c) => [c.key, []]));
    for (const t of tasks) {
      if (groups[t.status]) groups[t.status].push(t);
    }
    return groups;
  }, [tasks]);

  const move = async (task, status) => {
    if (task.status === status) return;
    const previous = task.status;
    setTasks((list) => list.map((t) => (t.id === task.id ? { ...t, status } : t)));
    try {
      await api.put(`/tasks/${task.id}`, { status });
      if (status === 'done') toast.success('Görev tamamlandı', task.title);
    } catch (err) {
      setTasks((list) => list.map((t) => (t.id === task.id ? { ...t, status: previous } : t)));
      toast.fromError(err, 'Durum değiştirilemedi');
    }
  };

  const onDrop = (status) => {
    if (dragging) move(dragging, status);
    setDragging(null);
    setDropTarget(null);
  };

  if (loading && !tasks.length) return <Loading label="Pano hazırlanıyor..." />;

  return (
    <>
      <PageHeader
        title="Görev Panosu"
        description="Görevleri sürükleyerek durumunu değiştirin"
        actions={
          <>
            <div className="row" style={{ gap: 7 }}>
              <Filter size={14} style={{ color: 'var(--text-dim)' }} />
              <select
                className="select filter-select"
                value={filter.assignee_id}
                onChange={(e) => setFilter((f) => ({ ...f, assignee_id: e.target.value }))}
              >
                <option value="">Tüm sorumlular</option>
                {employeeOptions.map((e) => (
                  <option key={e.value} value={e.value}>
                    {e.label}
                  </option>
                ))}
              </select>
              <select
                className="select filter-select"
                value={filter.project_id}
                onChange={(e) => setFilter((f) => ({ ...f, project_id: e.target.value }))}
              >
                <option value="">Tüm projeler</option>
                {projectOptions.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <button className="btn btn-primary" onClick={() => setAdding('todo')}>
              <Plus size={15} />
              Yeni Görev
            </button>
          </>
        }
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${BOARD_COLUMNS.length}, minmax(212px, 1fr))`,
          gap: 12,
          alignItems: 'start',
          overflowX: 'auto',
        }}
      >
        {BOARD_COLUMNS.map((col) => {
          const items = byStatus[col.key] || [];
          return (
            <div
              key={col.key}
              onDragOver={(e) => {
                e.preventDefault();
                setDropTarget(col.key);
              }}
              onDragLeave={() => setDropTarget((t) => (t === col.key ? null : t))}
              onDrop={() => onDrop(col.key)}
              style={{
                background: dropTarget === col.key ? 'var(--bg-active)' : 'var(--bg-elevated)',
                border: `1px solid ${dropTarget === col.key ? 'var(--primary)' : 'var(--border)'}`,
                borderRadius: 'var(--radius)',
                minHeight: 200,
                display: 'flex',
                flexDirection: 'column',
                transition: 'background 0.12s, border-color 0.12s',
              }}
            >
              <div
                style={{
                  padding: '10px 12px',
                  borderBottom: '1px solid var(--border-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                }}
              >
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: col.color }} />
                <span style={{ fontSize: 12.5, fontWeight: 600, flex: 1 }}>{col.label}</span>
                <span className="badge muted" style={{ fontSize: 11 }}>
                  {items.length}
                </span>
              </div>

              <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 7, maxHeight: 'calc(100vh - 240px)', overflowY: 'auto' }}>
                {items.length === 0 ? (
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ opacity: 0.5, justifyContent: 'center' }}
                    onClick={() => setAdding(col.key)}
                  >
                    <Plus size={13} />
                    Görev ekle
                  </button>
                ) : (
                  items.map((task) => {
                    const due = dueLabel(task.due_date);
                    const late = due.tone === 'over' && !['done', 'cancelled'].includes(task.status);
                    return (
                      <div
                        key={task.id}
                        draggable
                        onDragStart={() => setDragging(task)}
                        onDragEnd={() => {
                          setDragging(null);
                          setDropTarget(null);
                        }}
                        onClick={() => setDetail(task)}
                        style={{
                          background: 'var(--bg-panel)',
                          border: '1px solid var(--border)',
                          borderLeft: `3px solid ${task.priority === 'urgent' ? '#ef4444' : task.priority === 'high' ? '#f59e0b' : task.priority === 'low' ? 'var(--text-dim)' : 'var(--primary)'}`,
                          borderRadius: 'var(--radius-sm)',
                          padding: '9px 10px',
                          cursor: 'grab',
                          opacity: dragging?.id === task.id ? 0.45 : 1,
                        }}
                      >
                        <div style={{ fontSize: 12.8, fontWeight: 500, marginBottom: 5, lineHeight: 1.35 }}>
                          {task.title}
                        </div>
                        {task.project_name ? (
                          <div className="text-dim" style={{ fontSize: 11, marginBottom: 5 }}>
                            {task.project_name}
                          </div>
                        ) : null}
                        <div className="row" style={{ gap: 5, flexWrap: 'wrap' }}>
                          {task.assignee_name ? (
                            <span className="badge muted" style={{ fontSize: 10.5, padding: '1px 6px' }} title={task.assignee_name}>
                              {initials(task.assignee_name)}
                            </span>
                          ) : null}
                          {task.priority !== 'normal' ? (
                            <span
                              className={`badge ${task.priority === 'urgent' ? 'danger' : 'warning'}`}
                              style={{ fontSize: 10.5, padding: '1px 6px' }}
                            >
                              <Flag size={9} />
                              {task.priority === 'urgent' ? 'Acil' : 'Yüksek'}
                            </span>
                          ) : null}
                          {task.due_date ? (
                            <span
                              className={`badge ${late ? 'danger' : due.tone === 'soon' ? 'warning' : 'muted'}`}
                              style={{ fontSize: 10.5, padding: '1px 6px' }}
                            >
                              {late ? due.text : dateFmt(task.due_date)}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {adding ? (
        <BoardTaskModal
          initialStatus={adding}
          employeeOptions={employeeOptions}
          projectOptions={projectOptions}
          onClose={() => setAdding(null)}
          onCreated={() => {
            setAdding(null);
            load();
            reload();
          }}
        />
      ) : null}

      {detail ? (
        <TaskDetailModal
          task={detail}
          onClose={() => setDetail(null)}
          onChanged={() => {
            load();
            reload();
          }}
          onOpenProject={() => {
            setDetail(null);
            navigate('/projeler');
          }}
        />
      ) : null}
    </>
  );
}

function BoardTaskModal({ initialStatus, employeeOptions, projectOptions, onClose, onCreated }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const fields = [
    { name: 'title', label: 'Görev başlığı', required: true, span: 2, placeholder: 'Örn. Kablo metraj hesabı' },
    { name: 'project_id', label: 'Proje', type: 'select', options: projectOptions },
    { name: 'assignee_id', label: 'Sorumlu', type: 'select', options: employeeOptions },
    { name: 'priority', label: 'Öncelik', type: 'select', options: PRIORITY_OPTIONS, defaultValue: 'normal' },
    { name: 'estimated_hours', label: 'Tahmini saat', type: 'number', min: 0, step: '0.5' },
    { name: 'due_date', label: 'Termin', type: 'date' },
    { name: 'description', label: 'Açıklama', type: 'textarea', span: 2, rows: 3 },
  ];

  const form = useFormState(fields, { status: initialStatus }, (v) => v);

  const save = async () => {
    const values = form.submit();
    if (!values) return;
    setBusy(true);
    try {
      await api.post('/tasks', values);
      toast.success('Görev eklendi');
      onCreated();
    } catch (err) {
      toast.fromError(err, 'Görev eklenemedi');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Yeni görev"
      size="sm"
      footer={
        <>
          <div className="spacer" />
          <button className="btn" onClick={onClose} disabled={busy}>
            Vazgeç
          </button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>
            Ekle
          </button>
        </>
      }
    >
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
    </Modal>
  );
}

function TaskDetailModal({ task, onClose, onChanged, onOpenProject }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const setStatus = async (status) => {
    setBusy(true);
    try {
      await api.put(`/tasks/${task.id}`, { status });
      toast.success('Durum güncellendi', task.title);
      onChanged();
      onClose();
    } catch (err) {
      toast.fromError(err, 'Güncellenemedi');
    } finally {
      setBusy(false);
    }
  };

  const addHours = async () => {
    const raw = window.prompt('Harcanan saati girin (mevcut: ' + task.spent_hours + ')', String(task.spent_hours));
    if (raw === null) return;
    const value = Number(raw);
    if (Number.isNaN(value) || value < 0) {
      toast.error('Geçersiz değer', 'Pozitif bir sayı girin.');
      return;
    }
    setBusy(true);
    try {
      await api.put(`/tasks/${task.id}`, { spent_hours: value });
      toast.success('Süre güncellendi');
      onChanged();
      onClose();
    } catch (err) {
      toast.fromError(err, 'Güncellenemedi');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={task.title}
      subtitle={task.project_name}
      size="sm"
      footer={
        <>
          <button className="btn" onClick={addHours} disabled={busy}>
            Süre ekle
          </button>
          <div className="spacer" />
          <button className="btn" onClick={onClose}>
            Kapat
          </button>
        </>
      }
    >
      <div className="row row-wrap mb-14" style={{ gap: 7 }}>
        <StatusBadge status={task.status} />
        <PriorityBadge priority={task.priority} />
        {task.is_overdue ? <span className="badge danger">Gecikti</span> : null}
      </div>

      {task.description ? (
        <p style={{ fontSize: 13.5, color: 'var(--text-muted)', whiteSpace: 'pre-line', marginBottom: 14 }}>
          {task.description}
        </p>
      ) : null}

      <div className="stat-row">
        <span className="label">Sorumlu</span>
        <span className="value">{task.assignee_name || 'Atanmadı'}</span>
      </div>
      <div className="stat-row">
        <span className="label">Proje</span>
        <span className="value">
          {task.project_name ? (
            <button className="btn btn-ghost btn-sm" onClick={onOpenProject}>
              {task.project_name}
            </button>
          ) : (
            '-'
          )}
        </span>
      </div>
      <div className="stat-row">
        <span className="label">Termin</span>
        <span className="value">{dateFmt(task.due_date)}</span>
      </div>
      <div className="stat-row">
        <span className="label">Süre</span>
        <span className="value">
          {number(task.spent_hours)} / {number(task.estimated_hours)} saat
        </span>
      </div>
      {task.completed_at ? (
        <div className="stat-row">
          <span className="label">Tamamlanma</span>
          <span className="value">{dateFmt(task.completed_at)}</span>
        </div>
      ) : null}

      <div className="form-section" style={{ marginTop: 18, marginBottom: 10 }}>
        <div className="form-section-title">Durumu değiştir</div>
        <div className="row row-wrap" style={{ gap: 6 }}>
          {TASK_STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`btn btn-sm ${task.status === opt.value ? 'btn-primary' : ''}`}
              disabled={busy}
              onClick={() => setStatus(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}

export { EmptyState };
