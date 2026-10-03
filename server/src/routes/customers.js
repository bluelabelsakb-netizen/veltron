import { z } from 'zod';
import { createCrudRouter } from '../utils/crud.js';
import { badRequest } from '../utils/http.js';
import * as f from '../utils/fields.js';
import { telefonKontrol, vergiNoKontrol, epostaKontrol } from '../utils/iletisim.js';

/**
 * ⛔ Telefon / vergi no / e-posta — ELLE GİRERKEN DE DOĞRULANIR
 * (3 Ekim 2026)
 *
 *   Sorun: Excel aktarımı bu üç alanı kontrol ediyordu, elle müşteri
 *   formu KONTROL ETMİYORDU. "0505342022" (10 hane), "telefonum",
 *   "bozuk-eposta" kaydediliyordu. Aynı veri Excel'den gelince hata
 *   veriyordu, elle girilince geçiyordu — tutarsızdı.
 *
 *   Kullanıcı isteği: telefon "0505 342 0223" formatında olsun; boşluk
 *   bırakmadan yazanınki de buna evrilsin; eksik/fazla hata versin.
 *
 *   ⛔ Burada zod kullanılmıyor, elle kontroller: çünkü telefonu sadece
 *      "reddetmek" değil DÜZELTMEK (normalize) de gerekiyor. zod
 *      preprocess ile de yapılabilirdi ama hata mesajı kaybolurdu.
 */

/** Doğrular, düzeltir, hataları toplar. */
function iletisimDogrula(body, hatalar) {
  const t = telefonKontrol(body.phone);
  if (!t.gecerli) hatalar.push(t.hata);
  else body.phone = t.deger;

  const v = vergiNoKontrol(body.tax_number);
  if (!v.gecerli) hatalar.push(v.hata);
  else if (body.tax_number != null) body.tax_number = v.deger;

  const e = epostaKontrol(body.email);
  if (!e.gecerli) hatalar.push(e.hata);
  else if (body.email != null) body.email = e.deger;

  return body;
}

// ⛔ `superRefine` KULLANILMADI. crud.js `schema.shape` okuyor; `superRefine`
//    şemayı ZodEffects'e çevirip `.shape` erişimini kırıyordu
//    ("Cannot convert undefined or null to object" — sunucu açılmıyordu).
//    Doğrulama, crud'un zaten çağırdığı noktada yapılıyor.
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

/** Doğrular, düzeltir, hataları toplar. */
/** Kimliksiz musteri kaydi olmasin: sirket ya da kisisel irtisat adindan en az biri gerekli. */
function requireIdentity(body) {
  const company = (body.company ?? '').toString().trim();
  const contact = (body.contact ?? '').toString().trim();
  if (!company && !contact) {
    throw badRequest('Sirket adi veya kisisel irtisat adindan en az biri gerekli');
  }

  // ⛔ Telefon / vergi no / e-posta — 3 Ekim 2026.
  //    Excel aktarımı bunları kontrol ediyordu, elle giriş kontrol ETMİYORDU.
  //    Aynı veri Excel'den hata verirken elle girilince geçiyordu.
  const hatalar = [];
  iletisimDogrula(body, hatalar);
  if (hatalar.length) throw badRequest(hatalar[0]);

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
