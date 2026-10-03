import { z } from 'zod';
import { createCrudRouter } from '../utils/crud.js';
import * as f from '../utils/fields.js';
import { iletisimDogrula } from '../utils/iletisim.js';

const schema = z.object({
  user_id: f.id,
  full_name: f.requiredText(150),
  position: f.text(100),
  department: f.text(100),
  phone: f.text(40),
  email: f.text(120),
  // ⛔ Sütun tabloda VARDI ama şemada yoktu: gönderilen tc_no sessizce
  //    düşüyordu, doğrulama da çalışmıyordu. 3 Ekim 2026'da eklendi.
  tc_no: f.text(11),
  hire_date: f.date(),
  leave_date: f.date(),
  monthly_salary: f.nonNegNum(),
  // Mesai ucreti: bordro hesabinda kullanilir
  // (mesai_ucreti = MIN(mesai_saat, limit) x saat_ucreti x carpan)
  hourly_rate: f.nonNegNum(),
  iban: f.text(50),
  is_active: f.bool(),
  notes: f.longText(),
});

const PERFORMANCE_SELECT = `
  e.*,
  (SELECT COUNT(*) FROM tasks t WHERE t.assignee_id = e.id) AS task_count,
  (SELECT COUNT(*) FROM tasks t WHERE t.assignee_id = e.id AND t.status = 'done') AS done_task_count,
  (SELECT COUNT(*) FROM tasks t WHERE t.assignee_id = e.id AND t.status IN ('todo','in_progress','review')) AS open_task_count,
  (SELECT COUNT(*) FROM tasks t WHERE t.assignee_id = e.id AND t.status NOT IN ('done','cancelled') AND t.due_date IS NOT NULL AND t.due_date < date('now')) AS overdue_task_count,
  (SELECT COALESCE(SUM(t.spent_hours), 0) FROM tasks t WHERE t.assignee_id = e.id) AS spent_hours,
  (SELECT COALESCE(SUM(t.estimated_hours), 0) FROM tasks t WHERE t.assignee_id = e.id AND t.status = 'done') AS estimated_hours,
  (SELECT COUNT(*) FROM projects pr WHERE pr.manager_id = e.id) AS managed_project_count
`;

export default createCrudRouter({
  table: 'employees',
  entity: 'Calisan',
  schema,
  alias: 'e',
  listSelect: PERFORMANCE_SELECT,
  getSelect: PERFORMANCE_SELECT,
  listFrom: 'employees e',
  getFrom: 'employees e',
  search: ['full_name', 'position', 'department', 'phone', 'email'],
  filters: { is_active: 'is_active', department: 'department' },
  sort: { name: 'full_name', salary: 'monthly_salary', hire_date: 'hire_date', createdAt: 'created_at' },
  defaultSort: 'full_name ASC',
  beforeCreate: (body) => iletisimDogrula(body, ['phone', 'email', 'tc_no', 'iban']),
  beforeUpdate: (body) => iletisimDogrula(body, ['phone', 'email', 'tc_no', 'iban']),
  describe: (r) => r?.full_name,
  inactiveFields: ['is_active'],
});
