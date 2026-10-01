import { z } from 'zod';
import { createCrudRouter } from '../utils/crud.js';
import { nextNumber } from '../db.js';
import * as f from '../utils/fields.js';

const STATUS = ['planning', 'active', 'on_hold', 'completed', 'cancelled'];
const PRIORITY = ['low', 'normal', 'high', 'urgent'];

const schema = z.object({
  code: f.text(40),
  name: f.requiredText(200),
  customer_id: f.id,
  manager_id: f.id,
  description: f.longText(),
  status: f.oneOf(STATUS, 'planning'),
  priority: f.oneOf(PRIORITY, 'normal'),
  start_date: f.date(),
  due_date: f.date(),
  budget: f.nonNegNum(),
  actual_cost: f.nonNegNum(),
  completed_at: f.dateTime(),
  created_by: f.id,
});

const SELECT = `
  p.*,
  c.company  AS customer_name,
  c.contact  AS customer_contact,
  c.city     AS customer_city,
  e.full_name AS manager_name,
  (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS task_count,
  (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = 'done') AS done_task_count,
  (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status NOT IN ('done','cancelled') AND t.due_date < date('now')) AS overdue_task_count
`;

const FROM = `
  projects p
  LEFT JOIN customers c ON c.id = p.customer_id
  LEFT JOIN employees e ON e.id = p.manager_id
`;

export default createCrudRouter({
  table: 'projects',
  entity: 'Proje',
  schema,
  alias: 'p',
  listSelect: SELECT,
  getSelect: SELECT,
  listFrom: FROM,
  getFrom: FROM,
  search: ['name', 'code', 'description'],
  filters: { status: 'status', priority: 'priority', customer_id: 'customer_id', manager_id: 'manager_id' },
  dateBefore: { due_before: 'due_date' },
  dateAfter: { due_after: 'due_date' },
  sort: { name: 'name', due_date: 'due_date', budget: 'budget', priority: 'priority', createdAt: 'created_at' },
  defaultSort: 'created_at DESC',
  describe: (r) => (r?.code ? `${r.code} - ${r.name}` : r?.name),
  beforeCreate: (body) => ({ ...body, code: body.code || nextNumber('PRJ') }),
  beforeUpdate: (body) => {
    if (body.status && body.status !== 'completed' && body.status !== 'cancelled') {
      body.completed_at = null;
    }
    if (body.status === 'completed' && body.completed_at === undefined) {
      body.completed_at = new Date().toISOString().slice(0, 19).replace('T', ' ');
    }
    return body;
  },
});
