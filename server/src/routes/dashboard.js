import { Router } from 'express';
import { get, query } from '../db.js';
import { wrap } from '../utils/http.js';

const router = Router();

const n = (v) => Math.round(Number(v || 0) * 100) / 100;
const today = () => new Date().toISOString().slice(0, 10);

/** Son N ayin "YYYY-MM" anahtarlarini kronolojik sirayla dondurur. */
function monthKeys(months = 12) {
  const keys = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
}

// GET /api/dashboard
router.get(
  '/',
  wrap((req, res) => {
    const monthStart = today().slice(0, 7) + '-01';
    const userId = req.user?.id ?? null;

    // --- Sayaçlar ---------------------------------------------------
    const counts = get(`
      SELECT
        (SELECT COUNT(*) FROM projects WHERE status IN ('planning','active','on_hold')) AS active_projects,
        (SELECT COUNT(*) FROM projects WHERE status = 'completed') AS completed_projects,
        (SELECT COUNT(*) FROM tasks  WHERE status IN ('todo','in_progress','review')) AS open_tasks,
        (SELECT COUNT(*) FROM tasks  WHERE status = 'done') AS done_tasks,
        (SELECT COUNT(*) FROM tasks  WHERE status NOT IN ('done','cancelled') AND due_date IS NOT NULL AND due_date < date('now')) AS overdue_tasks,
        (SELECT COUNT(*) FROM tasks  WHERE status NOT IN ('done','cancelled') AND due_date IS NOT NULL AND due_date BETWEEN date('now') AND date('now','+7 day')) AS due_soon_tasks,
        (SELECT COUNT(*) FROM employees WHERE is_active = 1) AS active_employees,
        (SELECT COUNT(*) FROM customers WHERE is_active = 1) AS active_customers,
        (SELECT COUNT(*) FROM product_stock WHERE is_active = 1 AND stock <= min_stock) AS critical_stock,
        (SELECT COUNT(*) FROM quotes WHERE status = 'sent') AS pending_quotes
    `);

    // --- finans -----------------------------------------------------
    const invoiced = get(`
      SELECT COALESCE(SUM((sub - discount) * (1 + tax_rate / 100.0)), 0) AS total
        FROM (SELECT i.discount, i.tax_rate,
                     (SELECT COALESCE(SUM(ii.quantity * ii.unit_price), 0) FROM invoice_items ii WHERE ii.invoice_id = i.id) AS sub
                FROM invoices i WHERE i.status <> 'cancelled') t
    `);
    const invoicedMonth = get(`
      SELECT COALESCE(SUM((sub - discount) * (1 + tax_rate / 100.0)), 0) AS total
        FROM (SELECT i.discount, i.tax_rate, i.issue_date,
                     (SELECT COALESCE(SUM(ii.quantity * ii.unit_price), 0) FROM invoice_items ii WHERE ii.invoice_id = i.id) AS sub
                FROM invoices i WHERE i.status <> 'cancelled' AND i.issue_date >= ?) t
    `, [monthStart]);

    const payments = get(`
      SELECT COALESCE(SUM(amount), 0) AS total,
             COALESCE(SUM(CASE WHEN payment_date >= ? THEN amount ELSE 0 END), 0) AS month_total
        FROM payments
    `, [monthStart]);

    const outstanding = n(Number(invoiced?.total || 0) - Number(payments?.total || 0));

    // --- dagilimlar --------------------------------------------------
    const projectsByStatus = query(`SELECT status AS key, COUNT(*) AS value FROM projects GROUP BY status`);
    const tasksByStatus = query(`SELECT status AS key, COUNT(*) AS value FROM tasks GROUP BY status`);
    const invoicesByStatus = query(`SELECT status AS key, COUNT(*) AS value FROM invoices GROUP BY status`);
    const invoicesByProject = query(`
      SELECT COALESCE(p.name, 'Projesiz') AS label,
             ROUND(COALESCE(SUM((sub - i.discount) * (1 + i.tax_rate / 100.0)), 0), 2) AS value
        FROM invoices i
        LEFT JOIN projects p ON p.id = i.project_id
        LEFT JOIN (SELECT invoice_id, COALESCE(SUM(quantity * unit_price), 0) AS sub FROM invoice_items GROUP BY invoice_id) ii
               ON ii.invoice_id = i.id
       WHERE i.status <> 'cancelled'
       GROUP BY i.project_id
       ORDER BY value DESC LIMIT 6
    `);

    // --- zaman serisi ------------------------------------------------
    const finance = query(`
      SELECT strftime('%Y-%m', i.issue_date) AS month,
             COALESCE(SUM((COALESCE(ii.sub, 0) - i.discount) * (1 + i.tax_rate / 100.0)), 0) AS invoiced
        FROM invoices i
        LEFT JOIN (SELECT invoice_id, COALESCE(SUM(quantity * unit_price), 0) AS sub FROM invoice_items GROUP BY invoice_id) ii
               ON ii.invoice_id = i.id
       WHERE i.issue_date IS NOT NULL AND i.status <> 'cancelled'
         AND i.issue_date >= date('now', 'start of month', '-11 month')
       GROUP BY month
    `);
    const paidSeries = query(`
      SELECT strftime('%Y-%m', payment_date) AS month, COALESCE(SUM(amount), 0) AS paid
        FROM payments
       WHERE payment_date >= date('now', 'start of month', '-11 month')
       GROUP BY month
    `);
    const quoteSeries = query(`
      SELECT strftime('%Y-%m', issue_date) AS month, COUNT(*) AS quotes
        FROM quotes
       WHERE issue_date IS NOT NULL AND issue_date >= date('now', 'start of month', '-11 month')
       GROUP BY month
    `);
    // Uc seriyi ayni ay anahtarlarinda birlestir (bos aylar da gorunur).
    const financeSeries = monthKeys(12).map((month) => ({
      month,
      label: new Date(`${month}-01T00:00:00`).toLocaleDateString('tr-TR', { month: 'short' }),
      invoiced: Number(finance.find((r) => r.month === month)?.invoiced || 0),
      paid: Number(paidSeries.find((r) => r.month === month)?.paid || 0),
      quotes: Number(quoteSeries.find((r) => r.month === month)?.quotes || 0),
    }));

    // --- siralamalar / listeler --------------------------------------
    const upcoming = query(`
      SELECT t.id, t.title, t.due_date, t.status, t.priority,
             p.name AS project_name, e.full_name AS assignee_name,
             CAST(julianday(t.due_date) - julianday(date('now')) AS INTEGER) AS days_left
        FROM tasks t
        LEFT JOIN projects  p ON p.id = t.project_id
        LEFT JOIN employees e ON e.id = t.assignee_id
       WHERE t.status NOT IN ('done','cancelled') AND t.due_date IS NOT NULL
       ORDER BY t.due_date ASC LIMIT 8
    `);

    const workload = query(`
      SELECT e.id, e.full_name, e.position,
             COUNT(t.id) AS open_tasks,
             COALESCE(SUM(t.estimated_hours), 0) AS estimated_hours,
             COALESCE(SUM(t.spent_hours), 0) AS spent_hours
        FROM employees e
        LEFT JOIN tasks t ON t.assignee_id = e.id AND t.status NOT IN ('done','cancelled')
       WHERE e.is_active = 1
       GROUP BY e.id
       ORDER BY open_tasks DESC, e.full_name ASC
       LIMIT 8
    `);

    const topCustomers = query(`
      SELECT c.id, COALESCE(NULLIF(c.company, ''), c.contact, 'Musteri #' || c.id) AS label,
             ROUND(COALESCE(SUM((COALESCE(ii.sub, 0) - i.discount) * (1 + i.tax_rate / 100.0)), 0), 2) AS value,
             COUNT(i.id) AS invoice_count
        FROM invoices i
        JOIN customers c ON c.id = i.customer_id
        LEFT JOIN (SELECT invoice_id, COALESCE(SUM(quantity * unit_price), 0) AS sub FROM invoice_items GROUP BY invoice_id) ii
               ON ii.invoice_id = i.id
       WHERE i.status <> 'cancelled'
       GROUP BY c.id
       ORDER BY value DESC LIMIT 6
    `);

    const activity = query(`
      SELECT a.id, a.action, a.entity, a.entity_id, a.detail, a.created_at, u.full_name AS user_name
        FROM activity_log a
        LEFT JOIN users u ON u.id = a.user_id
       ORDER BY a.id DESC LIMIT 12
    `);

    const myTasks = query(`
      SELECT t.id, t.title, t.due_date, t.status, t.priority, p.name AS project_name
        FROM tasks t
        LEFT JOIN projects p ON p.id = t.project_id
       WHERE t.assignee_id IN (SELECT id FROM employees WHERE user_id = ?) AND t.status NOT IN ('done','cancelled')
       ORDER BY (t.due_date IS NULL), t.due_date ASC LIMIT 6
    `, [userId]).length;

    res.json({
      data: {
        kpi: {
          active_projects: Number(counts?.active_projects || 0),
          completed_projects: Number(counts?.completed_projects || 0),
          open_tasks: Number(counts?.open_tasks || 0),
          done_tasks: Number(counts?.done_tasks || 0),
          overdue_tasks: Number(counts?.overdue_tasks || 0),
          due_soon_tasks: Number(counts?.due_soon_tasks || 0),
          active_employees: Number(counts?.active_employees || 0),
          active_customers: Number(counts?.active_customers || 0),
          critical_stock: Number(counts?.critical_stock || 0),
          pending_quotes: Number(counts?.pending_quotes || 0),
          my_open_tasks: myTasks,
          invoiced_total: n(invoiced?.total),
          invoiced_month: n(invoicedMonth?.total),
          paid_total: n(payments?.total),
          paid_month: n(payments?.month_total),
          outstanding,
        },
        distributions: {
          projects: projectsByStatus,
          tasks: tasksByStatus,
          invoices: invoicesByStatus,
          invoices_by_project: invoicesByProject,
        },
        series: { finance: financeSeries },
        upcoming_tasks: upcoming,
        workload,
        top_customers: topCustomers,
        activity,
      },
    });
  })
);

export default router;
