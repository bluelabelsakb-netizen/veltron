/**
 * PARA BİRİMLERİNİ KURAR
 * ========================
 * TRY, USD, EUR, GBP, CHF... kayıtlarını ekler.
 * Varsayılan para birimi TRY'dir. Kur kaydı YAPILMAZ — kur günlük
 * girilir; sistem uydurma kur uydurmaz.
 *
 * Kullanim:  node src/scripts/seed-currency.js
 */
import { run, get, query, migrate } from '../db.js';

// Tablolar yoksa olustur (betik dogrudan calistirilabilsin diye).
migrate();

const PARA_BIRIMLERI = [
  // code, ad, sembol, ondalik, sira
  ['TRY', 'Türk Lirası', '₺', 2, 0],
  ['USD', 'Amerikan Doları', '$', 2, 1],
  ['EUR', 'Euro', '€', 2, 2],
  ['GBP', 'İngiliz Sterlini', '£', 2, 3],
  ['CHF', 'İsviçre Frangı', 'CHF', 2, 4],
  ['JPY', 'Japon Yeni', '¥', 0, 5], // ondalıksız birim örneği
  ['RUB', 'Rus Rublesi', '₽', 2, 6],
  ['AED', 'BAE Dirhemi', 'AED', 2, 7],
  ['SAR', 'Suudi Riyali', 'SAR', 2, 8],
  ['CNY', 'Çin Yuanı', '¥', 2, 9],
  ['CAD', 'Kanada Doları', 'CAD', 2, 10],
  ['AUD', 'Avustralya Doları', 'AUD', 2, 11],
];

let eklendi = 0;
for (const [code, name, symbol, decimals, order] of PARA_BIRIMLERI) {
  const varMi = get('SELECT code FROM currencies WHERE code = ?', [code]);
  if (varMi) continue;
  run(
    'INSERT INTO currencies (code, name, symbol, decimals, is_active, sort_order) VALUES (?,?,?,?,1,?)',
    [code, name, symbol, decimals, order]
  );
  eklendi += 1;
}

// Ana para birimi (firma profili bos ise varsayilan)
const profil = get('SELECT base_currency FROM company_profile WHERE id = 1');
if (profil && !profil.base_currency) {
  run("UPDATE company_profile SET base_currency = 'TRY' WHERE id = 1");
}

console.log('');
console.log(`  Para birimi eklendi : ${eklendi}`);
console.log(`  Toplam              : ${query('SELECT COUNT(*) n FROM currencies')[0].n}`);
console.log('');
console.log('  KUR GİRİLMEDİ. Uydurma kur kullanmak yanlış tutar üretir.');
console.log('  Girin:  Ayarlar → Döviz Kurları  (ör. 1 USD = 40,25 TL)');
console.log('');
console.log('  Not: Kurları günlük girmen gerekmez. Ayda birkaç kez yeterli;');
console.log('  belge tarihine en yakın kur geçerli sayılır.');
console.log('');
