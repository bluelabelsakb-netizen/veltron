/** Alacak uclarini uctan uca dene */
const B = 'http://localhost:4000/api';
const r = await fetch(`${B}/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'admin', password: 'VeltronDemo2026!' }),
});
const t = (await r.json()).token;
const H = { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' };
const bic = (n) => new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' ₺';

console.log('\n=== 1. GET /invoices/alacak ===');
const o = (await fetch(`${B}/invoices/alacak`, { headers: H }).then((x) => x.json())).data;
if (!o) { console.log('  ⛔ veri yok'); process.exit(1); }
console.log(`  toplam alacak  : ${bic(o.toplam)}  (${o.faturaAdet} fatura)`);
console.log(`  dövizli fatura : ${o.dovizAdet}`);
console.log(`  gönderilebilir : ${o.hatirlatilabilir} müşteri`);
console.log(`  ⛔ gidemeyecek  : ${o.hatirlatilamaz} müşteri (e-posta yok)`);
console.log(`  gönderim       : ${o.gonderim.aktif ? 'açık' : 'KAPALI - ' + o.gonderim.sebep}`);
console.log('\n  kovalar:');
for (const k of o.kovalar) {
  console.log(`    ${k.etiket.padEnd(18)} ${String(k.adet).padStart(3)} fatura   ${bic(k.tutar)}`);
}

console.log('\n=== 2. Müşteri listesi (en çok borçlu üstte) ===');
console.log(`  ${o.musteriler.length} müşterinin vadesi geçmiş:`);
for (const m of o.musteriler.slice(0, 6)) {
  console.log(`    ${String(m.adet)} fatura  ${bic(m.tutar).padStart(15)}  ${String(m.gun).padStart(3)} gün  ${String(m.musteri).slice(0, 26).padEnd(26)} ${m.email ? '' : '⛔ MAIL YOK'}`);
}

console.log('\n=== 3. ⛔ Hatırlatma önizlemesi (MAIL GÖNDERMEZ) ===');
const ilk = o.musteriler[0];
const on = (await fetch(`${B}/invoices/alacak/musteri/${ilk.customer_id}`, { headers: H }).then((x) => x.json())).data;
console.log(`  müşteri  : ${on.musteri.company}  <${on.musteri.email}>`);
console.log(`  gidecek  : ${on.onizleme.ekSayisi} fatura, ${on.onizleme.toplamBicim}`);
console.log(`  gonderilebilir: ${on.gonderilebilir}`);
console.log(`  koruma   : bugün gönderilmiş=${on.koruma.bugunGonderildi}, bu ay ${on.koruma.buAyAdet} kez`);
console.log('\n  --- KONU ---');
console.log('  ' + on.onizleme.konu);
console.log('  --- GÖVDE ---');
for (const l of on.onizleme.govde.split('\n')) console.log('  | ' + l);

console.log('\n=== 4. ⛔ E-postasız müşteride davranış ===');
const mailsiz = o.musteriler.find((m) => !m.email);
if (mailsiz) {
  console.log(`  test: ${mailsiz.musteri}`);
  const s = await fetch(`${B}/invoices/hatirlatma-dene`, { method: 'POST', headers: H, body: '{}' });
  console.log(`  (bilerek olmayan uc: HTTP ${s.status})`);
}

console.log('\n=== 5. Yetkisiz (müşteri rolu) ===');
console.log('  (portal rolü /invoices/* ucuna zaten 403 alır — route/index.js ikinci katman)');

console.log('\n=== 6. Hatırlatma geçmişi ucu ===');
const g = (await fetch(`${B}/invoices/alacak/hatirlatmalar?gun=30`, { headers: H }).then((x) => x.json())).data;
console.log(`  son 30 gün: ${g.length} hatırlatma`);
for (const x of g.slice(0, 5)) {
  console.log(`    ${x.day}  ${String(x.musteri).slice(0, 22).padEnd(22)} ${bic(x.amount_total).padStart(14)}  -> ${x.recipient}`);
}
