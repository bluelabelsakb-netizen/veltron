import { Router } from 'express';
import { query } from '../db.js';
import { wrap } from '../utils/http.js';

const router = Router();

/**
 * Form acilir kutularini doldurmak icin hafif listeler.
 * Tek istekte butun referans verileri doner; boylece her sayfa N istek atmaz.
 */
router.get(
  '/',
  wrap((_req, res) => {
    res.json({
      data: {
        customers: query(`
          SELECT id, company, contact, phone, email, city, tax_number, is_active
            FROM customers WHERE is_active = 1
           ORDER BY COALESCE(NULLIF(company, ''), contact, id)
        `),
        employees: query(`
          SELECT id, full_name, position, department, phone, is_active
            FROM employees WHERE is_active = 1
           ORDER BY full_name
        `),
        projects: query(`
          SELECT id, code, name, status, customer_id, manager_id, due_date
            FROM projects WHERE status <> 'cancelled'
           ORDER BY name
        `),
        products: query(`
          SELECT id, sku, name, unit, unit_price, stock, min_stock
            FROM product_stock WHERE is_active = 1
           ORDER BY name
        `),
        users: query('SELECT id, full_name, username, role FROM users WHERE is_active = 1 ORDER BY full_name'),
        payment_methods: [
          { value: 'nakit', label: 'Nakit' },
          { value: 'havale', label: 'Havale / EFT' },
          { value: 'kredi_karti', label: 'Kredi Kartı' },
          { value: 'cek', label: 'Çek' },
          { value: 'baska', label: 'Başka' },
        ],
      },
    });
  })
);

export default router;
