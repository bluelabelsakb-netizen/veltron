/**
 * Ornek firma profilini dogru karakter kodlamasiyla yazar.
 * PowerShell yerine Node kullanilir; boylece Turkce karakterler bozulmaz.
 * Kullanim: node server/src/scripts/seed-company.js
 */
import { get, run, migrate } from '../db.js';
import { loadProfile } from '../routes/company.js';

migrate();

const profile = {
  name: 'Veltron Elektrik San. ve Tic. Ltd. Şti.',
  short_name: 'VELTRON',
  tagline: 'Endüstriyel Elektrik ve Otomasyon Çözümleri',
  tax_office: 'Ostim Vergi Dairesi',
  tax_number: '1234567890',
  address: 'Ostim Organize Sanayi Bölgesi, 1234. Cadde No: 56',
  city: 'Ankara',
  phone: '0312 123 45 67',
  email: 'info@veltron.com.tr',
  website: 'www.veltron.com.tr',
  bank_name: 'Ziraat Bankası Ostim Şubesi',
  iban: 'TR33 0001 0025 6789 0123 4567 89',
  default_tax_rate: 20,
  payment_term_days: 45,
  invoice_prefix: 'FTR',
  quote_prefix: 'TLF',
  work_order_prefix: 'IEM',
  default_notes: 'Fiyatlarımıza KDV dahil değildir. Ödeme: 45 gün vadeli.',
  invoice_footer: 'İyi çalışmalar dileriz. Teşekkür ederiz.',
};

loadProfile();

const cols = Object.keys(profile);
run(
  `UPDATE company_profile SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = 1`,
  cols.map((c) => profile[c])
);

const row = get('SELECT * FROM company_profile WHERE id = 1');
console.log('Firma profili guncellendi:\n');
for (const [key, value] of Object.entries(row)) {
  if (key === 'logo' || key === 'id' || value === null) continue;
  console.log(`  ${key.padEnd(20)} ${value}`);
}
