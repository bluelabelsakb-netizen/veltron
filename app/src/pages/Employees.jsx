import { Users, TrendingUp, Clock } from 'lucide-react';
import { ResourcePage } from '../components/ResourcePage.jsx';
import { money, number, dateFmt, initials } from '../lib/api.js';

export default function Employees() {
  return (
    <ResourcePage
      emptyIcon={Users}
      endpoint="/employees"
      title="Çalışanlar"
      description="Personel bilgileri, görev yükü ve harcanan süreler"
      createLabel="Yeni Çalışan"
      searchPlaceholder="Ad, görev, departman, telefon ara..."
      defaultSort={{ key: 'name', dir: 'asc' }}
      csvName="veltron-calisanlar"
      fields={[
        { name: 'full_name', label: 'Ad soyad', required: true, placeholder: 'Örn. Mehmet Yılmaz' },
        { name: 'position', label: 'Görev', placeholder: 'Örn. Elektrik Mühendisi' },
        { name: 'department', label: 'Departman' },
        { name: 'phone', label: 'Telefon', type: 'tel' },
        { name: 'email', label: 'E-posta', type: 'email' },
        { name: 'hire_date', label: 'İşe giriş tarihi', type: 'date' },
        { name: 'leave_date', label: 'Ayrılış tarihi', type: 'date' },
        { name: 'monthly_salary', label: 'Aylık brüt maaş', type: 'money', min: 0 },
        {
          name: 'hourly_rate',
          label: 'Saat ücreti',
          type: 'money',
          min: 0,
          hint: 'Mesai hesabı için (Maaş/Bordro ekranı)',
        },
        { name: 'iban', label: 'IBAN' },
        { name: 'notes', label: 'Notlar', type: 'textarea', span: 2, rows: 3 },
        { name: 'is_active', label: 'Aktif çalışan', type: 'checkbox', defaultValue: 1 },
      ]}
      sections={[
        { title: 'Kimlik', fields: ['full_name', 'position', 'department', 'phone', 'email'] },
        { title: 'İş bilgileri', fields: ['hire_date', 'leave_date', 'monthly_salary', 'hourly_rate', 'iban'] },
        { title: 'Diğer', fields: ['notes', 'is_active'] },
      ]}
      columns={[
        {
          key: 'full_name',
          header: 'Çalışan',
          sortKey: 'name',
          render: (r) => (
            <div className="row" style={{ gap: 9 }}>
              <div className="avatar" style={{ width: 28, height: 28, fontSize: 11 }}>
                {initials(r.full_name)}
              </div>
              <div style={{ minWidth: 0 }}>
                <div className="cell-strong truncate">{r.full_name}</div>
                <div className="cell-dim truncate">{r.position || '—'}</div>
              </div>
            </div>
          ),
        },
        { key: 'department', header: 'Departman', render: (r) => r.department || '-' },
        { key: 'phone', header: 'Telefon', render: (r) => <span className="cell-muted">{r.phone || '-'}</span> },
        {
          key: 'task_count',
          header: 'Görev',
          align: 'right',
          width: 130,
          render: (r) => (
            <div style={{ minWidth: 108 }}>
              <div className="text-sm">
                <strong>{number(r.done_task_count)}</strong>
                <span className="text-dim"> / {number(r.task_count)}</span>
                {r.overdue_task_count > 0 ? (
                  <span className="due-over" style={{ marginLeft: 5, fontSize: 11 }}>
                    {r.overdue_task_count} geciken
                  </span>
                ) : null}
              </div>
              <div className="progress" style={{ marginTop: 4 }}>
                <div
                  className={`progress-fill ${r.open_task_count === 0 ? 'success' : ''}`}
                  style={{ width: `${r.task_count ? (r.done_task_count / r.task_count) * 100 : 0}%` }}
                />
              </div>
            </div>
          ),
          csv: (r) => `${r.done_task_count}/${r.task_count}`,
        },
        {
          key: 'spent_hours',
          header: 'Süre',
          align: 'right',
          width: 112,
          render: (r) => (
            <span className="cell-muted nowrap" title="Harcanan / tahmini saat">
              <Clock size={10} style={{ verticalAlign: -1, marginRight: 3 }} />
              {number(r.spent_hours)} / {number(r.estimated_hours)} s
            </span>
          ),
          csv: (r) => `${r.spent_hours}/${r.estimated_hours}`,
        },
        {
          key: 'managed_project_count',
          header: 'Proje',
          align: 'right',
          width: 74,
          render: (r) => <span className="cell-muted">{number(r.managed_project_count)}</span>,
        },
        {
          key: 'monthly_salary',
          header: 'Maaş',
          align: 'right',
          sortKey: 'salary',
          width: 110,
          render: (r) => <span className="money">{money(r.monthly_salary)}</span>,
        },
        {
          key: 'hire_date',
          header: 'İşe giriş',
          sortKey: 'hire_date',
          width: 104,
          render: (r) => <span className="cell-dim">{r.hire_date ? dateFmt(r.hire_date) : '-'}</span>,
        },
        {
          key: 'is_active',
          header: 'Durum',
          width: 82,
          render: (r) => (
            <span className={`badge ${r.is_active ? 'success' : 'muted'}`}>{r.is_active ? 'Aktif' : 'Pasif'}</span>
          ),
          csv: (r) => (r.is_active ? 'Aktif' : 'Pasif'),
        },
      ]}
      filters={[{ name: 'is_active', label: 'Tüm durumlar', options: [
        { value: 'true', label: 'Sadece aktifler' },
        { value: 'false', label: 'Sadece pasifler' },
      ] }]}
      deleteMessage={(r) =>
        `"${r.full_name}" pasifleştirilecek.\n\nÇalışan geçmiş görev kayıtlarıyla bağlantılı olduğu için silinmez; yeni görev atamada listelenmez.`
      }
    />
  );
}
