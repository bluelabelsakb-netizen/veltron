import { z } from 'zod';
import { createCrudRouter } from '../utils/crud.js';
import { badRequest } from '../utils/http.js';
import * as f from '../utils/fields.js';

const schema = z.object({
  title: f.oneOf(['Bayi', 'Sahis'], 'Sahis'),
  company: f.text(200),
  tax_number: f.text(20),
  tax_office: f.text(100),
  contact: f.text(120),
  phone: f.text(40),
  email: f.text(120),
  city: f.text(80),
  address: f.text(400),
  notes: f.longText(),
  is_active: f.bool(),
});

/** Kimliksiz musteri kaydi olmasin: sirket ya da kisisel irtisat adindan en az biri gerekli. */
function requireIdentity(body) {
  const company = (body.company ?? '').toString().trim();
  const contact = (body.contact ?? '').toString().trim();
  if (!company && !contact) {
    throw badRequest('Sirket adi veya kisisel irtisat adindan en az biri gerekli');
  }
  return body;
}

export default createCrudRouter({
  table: 'customers',
  entity: 'Musteri',
  schema,
  search: ['company', 'contact', 'phone', 'email', 'tax_number', 'city'],
  filters: { title: 'title', city: 'city', is_active: 'is_active' },
  sort: { company: 'company', city: 'city', createdAt: 'created_at' },
  defaultSort: 'company ASC, id DESC',
  describe: (r) => r?.company || r?.contact || `Musteri #${r?.id}`,
  beforeCreate: requireIdentity,
  beforeUpdate: (body, existing) => {
    requireIdentity({ ...existing, ...body });
    return body;
  },
  inactiveFields: ['is_active'],
});
