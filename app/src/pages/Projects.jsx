import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderKanban, CheckSquare, Plus, ExternalLink, Target } from 'lucide-react';
import { ResourcePage } from '../components/ResourcePage.jsx';
import { useLookups } from '../context/LookupsContext.jsx';
import { useToast } from '../components/Toast.jsx';
import { Modal } from '../components/Modal.jsx';
import { StatusBadge, PriorityBadge } from '../components/StatusBadge.jsx';
import { FormField, useFormState } from '../components/Form.jsx';
import { api, money, number, dateFmt, dueLabel, PROJECT_STATUS_OPTIONS, PRIORITY_OPTIONS } from '../lib/api.js';
import { EmptyState } from '../components/Primitives.jsx';

export default function Projects() {
  const { customerOptions, employeeOptions } = useLookups();
  const navigate = useNavigate();
  const [detail, setDetail] = useState(null);

  return (
    <>
      <ResourcePage
        emptyIcon={FolderKanban}
        endpoint="/projects"
        title="Projeler"
        description="Proje kapsamı, bütçe, müşteri ve sorumlu takibi"
        createLabel="Yeni Proje"
        searchPlaceholder="Proje adı, kodu, açıklama ara..."
        csvName="veltron-projeler"
        onRowClick={(row) => setDetail(row)}
        fields={[
          { name: 'name', label: 'Proje adı', required: true, span: 2, placeholder: 'Örn. Akdeniz Fabrika Elektrik Modernizasyonu' },
          { name: 'customer_id', label: 'Müşteri', type: 'select', options: customerOptions },
          { name: 'manager_id', label: 'Proje sorumlusu', type: 'select', options: employeeOptions },
          { name: 'status', label: 'Durum', type: 'select', options: PROJECT_STATUS_OPTIONS, required: true, defaultValue: 'planning' },
          { name: 'priority', label: 'Öncelik', type: 'select', options: PRIORITY_OPTIONS, defaultValue: 'normal' },
          { name: 'start_date', label: 'Başlangıç', type: 'date' },
          { name: 'due_date', label: 'Bitiş (termin)', type: 'date' },
          { name: 'budget', label: 'Bütçe', type: 'money', min: 0 },
          { name: 'actual_cost', label: 'Gerçekleşen maliyet', type: 'money', min: 0 },
          { name: 'description', label: 'Kapsam / açıklama', type: 'textarea', span: 2, rows: 4 },
        ]}
        sections={[
          { title: 'Proje', fields: ['name', 'customer_id', 'manager_id', 'status', 'priority'] },
          { title: 'Planlama', fields: ['start_date', 'due_date', 'budget', 'actual_cost'] },
          { title: 'Kapsam', fields: ['description'] },
        ]}
        columns={[
          {
            key: 'name',
            header: 'Proje',
            sortKey: 'name',
            render: (r) => (
              <div>
                <div className="cell-strong">{r.name}</div>
                <div className="cell-dim">
                  <span className="mono">{r.code}</span>
                  {r.customer_name ? ` · ${r.customer_name}` : ''}
                </div>
              </div>
            ),
            csv: (r) => r.name,
          },
          {
            key: 'status',
            header: 'Durum',
            sortKey: 'status',
            width: 124,
            render: (r) => <StatusBadge status={r.status} />,
          },
          { key: 'priority', header: 'Öncelik', sortKey: 'priority', width: 96, render: (r) => <PriorityBadge priority={r.priority} /> },
          {
            key: 'manager_name',
            header: 'Sorumlu',
            width: 140,
            render: (r) => <span className="cell-muted">{r.manager_name || '-'}</span>,
          },
          {
            key: 'task_count',
            header: 'Görev',
            width: 116,
            render: (r) => {
              const pct = r.task_count ? (r.done_task_count / r.task_count) * 100 : 0;
              return (
                <div style={{ minWidth: 92 }}>
                  <div className="text-sm">
                    <strong>{r.done_task_count}</strong>
                    <span className="text-dim"> / {r.task_count}</span>
                    {r.overdue_task_count > 0 ? (
                      <span className="due-over" style={{ marginLeft: 5, fontSize: 11 }}>
                        {r.overdue_task_count} geciken
                      </span>
                    ) : null}
                  </div>
                  <div className="progress" style={{ marginTop: 4 }}>
                    <div className={`progress-fill ${pct === 100 ? 'success' : ''}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            },
            csv: (r) => `${r.done_task_count}/${r.task_count}`,
          },
          {
            key: 'due_date',
            header: 'Termin',
            sortKey: 'due_date',
            width: 122,
            render: (r) => {
              if (r.status === 'completed' || r.status === 'cancelled') {
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
            key: 'budget',
            header: 'Bütçe / Maliyet',
            align: 'right',
            sortKey: 'budget',
            width: 150,
            render: (r) => {
              const used = Number(r.budget) > 0 ? (Number(r.actual_cost) / Number(r.budget)) * 100 : 0;
              return (
                <div>
                  <div className="money">{money(r.budget)}</div>
                  <div className="text-dim" style={{ fontSize: 11 }}>
                    {money(r.actual_cost)} kullanıldı
                    {used > 100 ? <span className="due-over"> · aşıldı</span> : used > 80 ? <span className="due-soon"> · %{Math.round(used)}</span> : null}
                  </div>
                </div>
              );
            },
            csv: (r) => r.budget,
          },
        ]}
        filters={[
          { name: 'status', label: 'Tüm durumlar', options: PROJECT_STATUS_OPTIONS },
          { name: 'priority', label: 'Tüm öncelikler', options: PRIORITY_OPTIONS },
        ]}
        deleteMessage={(r) =>
          `"${r.name}" silinecek.\n\nBu projeye bağlı tüm görevler de silinir. Fatura kayıtları silinmez, proje bağlantısı boşalır.`
        }
      />

      {detail ? (
        <ProjectDetail
          projectId={detail.id}
          onClose={() => setDetail(null)}
          onOpenTasks={() => {
            setDetail(null);
            navigate('/gorevler');
          }}
        />
      ) : null}
    </>
  );
}

/** Proje detayi: bilgiler, butce, gorev listesi ve hizli gorev ekleme. */
function ProjectDetail({ projectId, onClose, onOpenTasks }) {
  const { employeeOptions } = useLookups();
  const toast = useToast();
  const [project, setProject] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, t] = await Promise.all([
        api.get(`/projects/${projectId}`),
        api.get('/tasks', { project_id: projectId, limit: 200 }),
      ]);
      setProject(p.data);
      setTasks(t.data);
    } catch (err) {
      toast.fromError(err, 'Proje yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [projectId, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleTask = async (task) => {
    const next = task.status === 'done' ? 'todo' : 'done';
    try {
      await api.put(`/tasks/${task.id}`, { status: next });
      setTasks((list) => list.map((t) => (t.id === task.id ? { ...t, status: next } : t)));
    } catch (err) {
      toast.fromError(err, 'Güncellenemedi');
    }
  };

  const budgetUsed = project && Number(project.budget) > 0 ? (Number(project.actual_cost) / Number(project.budget)) * 100 : 0;
  const doneTasks = tasks.filter((t) => t.status === 'done').length;

  return (
    <>
      <Modal
        open
        onClose={onClose}
        size="lg"
        title={project?.name || 'Proje'}
        subtitle={project ? <span className="mono">{project.code}</span> : undefined}
        footer={
          <>
            <button className="btn" onClick={onOpenTasks}>
              <ExternalLink size={14} />
              Tüm görevler
            </button>
            <div className="spacer" />
            <button className="btn" onClick={onClose}>
              Kapat
            </button>
          </>
        }
      >
        {loading || !project ? (
          <div className="loading-page">
            <div className="spinner lg" />
          </div>
        ) : (
          <>
            <div className="row row-wrap mb-14" style={{ gap: 8 }}>
              <StatusBadge status={project.status} />
              <PriorityBadge priority={project.priority} />
              {project.customer_name ? <span className="badge muted">{project.customer_name}</span> : null}
              {project.manager_name ? <span className="badge info">{project.manager_name}</span> : null}
              {project.due_date ? (
                <span
                  className={`badge ${
                    ['completed', 'cancelled'].includes(project.status)
                      ? 'muted'
                      : dueLabel(project.due_date).tone === 'over'
                        ? 'danger'
                        : dueLabel(project.due_date).tone === 'soon'
                          ? 'warning'
                          : 'muted'
                  }`}
                >
                  Termin: {dateFmt(project.due_date)}
                </span>
              ) : null}
            </div>

            <div className="grid-2 mb-14">
              <div className="card">
                <div className="card-head">
                  <h3>Bütçe</h3>
                  <Target size={15} style={{ color: 'var(--text-dim)' }} />
                </div>
                <div className="card-body">
                  <div className="stat-row">
                    <span className="label">Bütçe</span>
                    <span className="value">{money(project.budget)}</span>
                  </div>
                  <div className="stat-row">
                    <span className="label">Kullanılan</span>
                    <span className="value">{money(project.actual_cost)}</span>
                  </div>
                  <div className="stat-row">
                    <span className="label">Kalan</span>
                    <span className={`value ${budgetUsed > 100 ? 'money neg' : 'money pos'}`}>
                      {money(Number(project.budget) - Number(project.actual_cost))}
                    </span>
                  </div>
                  <div className="progress" style={{ marginTop: 10 }}>
                    <div
                      className={`progress-fill ${budgetUsed > 100 ? '' : budgetUsed > 80 ? '' : 'success'}`}
                      style={{
                        width: `${Math.min(budgetUsed, 100)}%`,
                        background: budgetUsed > 100 ? 'var(--danger)' : budgetUsed > 80 ? 'var(--warning)' : undefined,
                      }}
                    />
                  </div>
                  <div className="text-dim text-sm" style={{ marginTop: 5 }}>
                    Bütçenin %{Math.round(budgetUsed)}'i kullanıldı
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="card-head">
                  <h3>Planlama</h3>
                </div>
                <div className="card-body">
                  <div className="stat-row">
                    <span className="label">Başlangıç</span>
                    <span className="value">{dateFmt(project.start_date)}</span>
                  </div>
                  <div className="stat-row">
                    <span className="label">Bitiş</span>
                    <span className="value">{dateFmt(project.due_date)}</span>
                  </div>
                  <div className="stat-row">
                    <span className="label">Tamamlanma</span>
                    <span className="value">{project.completed_at ? dateFmt(project.completed_at) : '-'}</span>
                  </div>
                  <div className="stat-row">
                    <span className="label">Görev ilerlemesi</span>
                    <span className="value">
                      {doneTasks} / {tasks.length}
                    </span>
                  </div>
                  <div className="progress" style={{ marginTop: 10 }}>
                    <div
                      className="progress-fill success"
                      style={{ width: `${tasks.length ? (doneTasks / tasks.length) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {project.description ? (
              <div className="card mb-14">
                <div className="card-head">
                  <h3>Kapsam</h3>
                </div>
                <div className="card-body" style={{ whiteSpace: 'pre-line', fontSize: 13.5 }}>
                  {project.description}
                </div>
              </div>
            ) : null}

            <div className="card">
              <div className="card-head">
                <h3>Görevler ({tasks.length})</h3>
                <button className="btn btn-sm btn-primary" onClick={() => setAdding(true)}>
                  <Plus size={13} />
                  Görev ekle
                </button>
              </div>
              <div className="card-body">
                {tasks.length === 0 ? (
                  <EmptyState
                    compact
                    icon={CheckSquare}
                    title="Bu projede görev yok"
                    description="İlk görevi ekleyerek takibe başlayın."
                    action={
                      <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
                        <Plus size={13} />
                        Görev ekle
                      </button>
                    }
                  />
                ) : (
                  tasks.map((t) => {
                    const due = dueLabel(t.due_date);
                    const late = due.tone === 'over' && !['done', 'cancelled'].includes(t.status);
                    return (
                      <div className="list-row" key={t.id}>
                        <input
                          type="checkbox"
                          checked={t.status === 'done'}
                          onChange={() => toggleTask(t)}
                          style={{ width: 15, height: 15, accentColor: 'var(--success)', cursor: 'pointer', flexShrink: 0 }}
                          title={t.status === 'done' ? 'Görevi geri al' : 'Görevi tamamla'}
                        />
                        <div className="grow">
                          <div
                            className="title truncate"
                            style={{
                              textDecoration: t.status === 'done' ? 'line-through' : 'none',
                              color: t.status === 'done' ? 'var(--text-dim)' : undefined,
                            }}
                          >
                            {t.title}
                          </div>
                          <div className="meta">
                            {t.assignee_name || 'Atanmadı'}
                            {t.estimated_hours ? ` · ${number(t.estimated_hours)} sa tahmini` : ''}
                          </div>
                        </div>
                        {late ? <span className="due-over text-sm nowrap">{due.text}</span> : null}
                        <StatusBadge status={t.status} size="sm" />
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </>
        )}
      </Modal>

      {adding ? (
        <QuickTaskModal
          projectId={projectId}
          employeeOptions={employeeOptions}
          onClose={() => setAdding(false)}
          onCreated={() => {
            setAdding(false);
            load();
          }}
        />
      ) : null}
    </>
  );
}

function QuickTaskModal({ projectId, employeeOptions, onClose, onCreated }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const fields = [
    { name: 'title', label: 'Görev başlığı', required: true, span: 2, placeholder: 'Örn. Pano şemalarını güncelle' },
    { name: 'assignee_id', label: 'Atanan kişi', type: 'select', options: employeeOptions },
    { name: 'priority', label: 'Öncelik', type: 'select', options: PRIORITY_OPTIONS, defaultValue: 'normal' },
    { name: 'estimated_hours', label: 'Tahmini saat', type: 'number', min: 0, step: '0.5' },
    { name: 'due_date', label: 'Termin', type: 'date' },
    { name: 'description', label: 'Açıklama', type: 'textarea', span: 2, rows: 3 },
  ];

  const form = useFormState(fields, {}, (v) => ({ ...v, project_id: projectId, status: 'todo' }));

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
