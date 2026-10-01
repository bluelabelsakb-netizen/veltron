import { z } from 'zod';
import { createCrudRouter } from '../utils/crud.js';
import * as f from '../utils/fields.js';

const STATUS = ['todo', 'in_progress', 'review', 'done', 'cancelled'];
const PRIORITY = ['low', 'normal', 'high', 'urgent'];

const schema = z.object({
  project_id: f.id,
  title: f.requiredText(250),
  description: f.longText(),
  assignee_id: f.id,
  status: f.oneOf(STATUS, 'todo'),
  priority: f.oneOf(PRIORITY, 'normal'),
  estimated_hours: f.nonNegNum(),
  spent_hours: f.nonNegNum(),
  start_date: f.date(),
  due_date: f.date(),
  completed_at: f.dateTime(),
});

const SELECT = `
  t.*,
  p.name  AS project_name,
  p.code  AS project_code,
  e.full_name AS assignee_name,
  e.position  AS assignee_position,
  CASE
    WHEN t.status IN ('done','cancelled') THEN 0
    WHEN t.due_date IS NOT NULL AND t.due_date < date('now') THEN 1
    ELSE 0
  END AS is_overdue
`;

const FROM = `
  tasks t
  LEFT JOIN projects  p ON p.id = t.project_id
  LEFT JOIN employees e ON e.id = t.assignee_id
`;

/** Durum 'done' degilse tamamlanma tarihini temizler, 'done' ise damgalar. */
function syncCompletedAt(body) {
  if (body.status === undefined) return body;
  if (body.status === 'done') {
    if (body.completed_at === undefined) {
      body.completed_at = new Date().toISOString().slice(0, 19).replace('T', ' ');
    }
  } else {
    body.completed_at = null;
  }
  return body;
}

export default createCrudRouter({
  table: 'tasks',
  entity: 'Gorev',
  schema,
  alias: 't',
  listSelect: SELECT,
  getSelect: SELECT,
  listFrom: FROM,
  getFrom: FROM,
  search: ['title', 'description'],
  filters: {
    status: 'status',
    priority: 'priority',
    project_id: 'project_id',
    assignee_id: 'assignee_id',
  },
  dateBefore: { due_before: 'due_date' },
  dateAfter: { due_after: 'due_date' },
  numbers: { min_hours: 'estimated_hours' },
  sort: { due_date: 'due_date', createdAt: 'created_at', status: 'status', priority: 'priority' },
  defaultSort: `
    CASE WHEN t.status IN ('done','cancelled') THEN 1 ELSE 0 END ASC,
    CASE WHEN t.due_date IS NULL THEN 1 ELSE 0 END ASC,
    t.due_date ASC,
    t.id DESC
  `,
  describe: (r) => r?.title,
  beforeCreate: syncCompletedAt,
  beforeUpdate: syncCompletedAt,
});
