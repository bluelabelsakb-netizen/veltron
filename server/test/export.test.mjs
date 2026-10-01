/**
 * EXCEL DIŞA AKTARMA TESTLERI
 * ===========================
 * Sunucudan .xlsx dosyalarini indirip icerigini dogrular.
 *
 * Calistirma:  npm run test:export   (veya node test/export.test.mjs)
 *
 * Sunucu acik olmalidir. Yonetici sifresi .env'den okunur.
 *
 * EN ONEMLI KONTROL: "Tartim kurali" Excel'de de bozulmamali.
 *   NET (kg) = Dolu - Bos  ve  NET (ton) = NET (kg) / 1000
 */
import 'dotenv/config';
import { yoneticiGirisi } from './_yardimci.js';
import ExcelJS from 'exceljs';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const B = process.env.API_BASE || 'http://localhost:4000/api';
let pass = 0;
let fail = 0;
const failures = [];

const ok = (cond, label, extra = '') => {
  if (cond) {
    pass += 1;
    console.log(`   OK   ${label}`);
  } else {
    fail += 1;
    failures.push(label);
    console.log(`  FAIL ${label} ${extra}`);
  }
};
const section = (t) => console.log(`\n${t}`);
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

async function main() {
  console.log('============================================================');
  console.log(' EXCEL DIŞA AKTARMA TESTLERI');
  console.log('============================================================');

  const dir = mkdtempSync(path.join(tmpdir(), 'veltron-xl-'));

  // Sifre ortama gore degisebilir; _yardimci aday sirayla dener.
  const giris = await yoneticiGirisi(process.env.ADMIN_USER || 'admin');
  if (!giris) {
    console.log('\n Yonetici girisi basarisiz. Sunucu calisiyor mu? (.env ADMIN_PASSWORD)\n');
    process.exit(1);
  }
  const { token } = giris;

  /** .xlsx indirir, exceljs ile okur. */
  async function fetchBook(scope, period) {
    const qs = new URLSearchParams({ scope });
    if (period) qs.set('period', period);
    const res = await fetch(`${B}/export/excel?${qs}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return { status: res.status, book: null, res };
    const file = path.join(dir, `${scope}.xlsx`);
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    const book = new ExcelJS.Workbook();
    await book.xlsx.readFile(file);
    return { status: res.status, book, res };
  }

  /** Baslik satirindan sutun numarasi. */
  const colIndex = (ws, name) => {
    for (let c = 1; c <= ws.columnCount; c += 1) {
      if (ws.getRow(4).getCell(c).value === name) return c;
    }
    return -1;
  };

  // =================================================================
  section('1) TÜM VERİLER (çok sayfalı)');
  const all = await fetchBook('all');
  ok(all.status === 200, 'all kapsamı indirildi', `-> ${all.status}`);

  if (all.book) {
    const names = all.book.worksheets.map((w) => w.name);
    const expected = [
      'İş Emirleri',
      'Kâfiyye',
      'Teklifler',
      'Müşteriler',
      'Faturalar',
      'Kâr Raporu',
      'Çalışanlar',
      'Bordro',
      'Puanlama',
      'Genel Performans',
      'Taşeronlar',
      'Taşeron İşleri',
      'Taşeron Faturaları',
      'Taşeron Ödemeleri',
      'Ürünler',
    ];
    for (const n of expected) ok(names.includes(n), `sayfa var: ${n}`);

    const cd = all.res.headers.get('Content-Disposition') || '';
    ok(cd.includes('.xlsx'), 'Dosya adi .xlsx ile bitiyor', `-> ${cd}`);
    ok(
      (all.res.headers.get('Content-Type') || '').includes('spreadsheetml'),
      'Dogru MIME turu (application/vnd.openxml...)'
    );
  }

  // =================================================================
  section('2) TARTIM KURALI — EN KRİTİK');
  const wo = await fetchBook('work-orders');
  ok(wo.status === 200, 'İş emirleri indirildi');

  if (wo.book) {
    const ws = wo.book.getWorksheet('İş Emirleri');
    ok(!!ws, '"İş Emirleri" sayfası bulundu');

    const iBos = colIndex(ws, 'Boş Tartım (kg)');
    const iDolu = colIndex(ws, 'Dolu Tartım (kg)');
    const iKg = colIndex(ws, 'NET (kg)');
    const iTon = colIndex(ws, 'NET (ton)');

    ok(iBos > 0, 'Boş tartım sütunu var');
    ok(iDolu > 0, 'Dolu tartım sütunu var');
    ok(iKg > 0, 'NET (kg) sütunu var');
    ok(iTon > 0, 'NET (ton) sütunu var (Excel hesabi icin)');

    let checked = 0;
    let tartimHata = 0;
    let tonHata = 0;
    for (let i = 5; i <= ws.rowCount; i += 1) {
      const no = ws.getRow(i).getCell(1).value;
      if (!no) continue;
      const bos = ws.getRow(i).getCell(iBos).value;
      const dolu = ws.getRow(i).getCell(iDolu).value;
      const kg = ws.getRow(i).getCell(iKg).value;
      const ton = ws.getRow(i).getCell(iTon).value;
      if (bos === null || bos === undefined) continue;
      checked += 1;
      if (Number(dolu) - Number(bos) !== Number(kg)) {
        console.log(`       ${no}: ${dolu} - ${bos} = ${Number(dolu) - Number(bos)} ama dosyada ${kg}`);
        tartimHata += 1;
      }
      // Ton 2 ondaliga yuvarlanir (25.089 -> 25.09). Tolerans bu yuzden 0.005.
    if (ton !== null && ton !== undefined && Math.abs(Number(ton) - Number(kg) / 1000) > 0.0051) {
        tonHata += 1;
      }
    }
    ok(checked > 0, 'Tartımlı en az bir kayıt bulundu', `-> ${checked}`);
    ok(tartimHata === 0, `NET = Dolu − Boş (${checked} kayıt)`, `-> ${tartimHata} hata`);
    ok(tonHata === 0, `NET (ton) = NET (kg) ÷ 1000 (${checked} kayıt)`, `-> ${tonHata} hata`);

    // Mali alanlar ayri sutunlarda olmali
    const iTutar = colIndex(ws, 'Tutar (TL)');
    const iKar = colIndex(ws, 'Kâr (TL)');
    const iMaliyet = colIndex(ws, 'Toplam Maliyet (TL)');
    ok(iTutar > 0, 'Tutar sütunu var');
    ok(iMaliyet > 0, 'Toplam Maliyet sütunu var');
    ok(iKar > 0, 'Kâr sütunu var');

    // Para bicimi Turkce formatta olmali (satis sutunu kendi numFmt'ini tasimali)
    if (iTutar > 0) {
      const fmt = ws.getRow(5).getCell(iTutar).numFmt || '';
      ok(fmt.includes('₺'), 'Tutar sutunu Turkce para biciminde', `-> "${fmt}"`);
    }
    if (iKg > 0) {
      const kgFmt = ws.getRow(5).getCell(iKg).numFmt || '';
      ok(kgFmt.includes('#,##0'), 'NET (kg) sayisal bicimde', `-> "${kgFmt}"`);
    }
  }

  // =================================================================
  section('3) KÂR HESABI TUTARLI');
  const pr = await fetchBook('profit');
  if (pr.book) {
    const ws = pr.book.getWorksheet('Kâr Raporu');
    const iRev = colIndex(ws, 'Satış (TL)');
    const iLab = colIndex(ws, 'Kendi Ekip (TL)');
    const iSub = colIndex(ws, 'Taşeron (TL)');
    const iMat = colIndex(ws, 'Malzeme (TL)');
    const iKar = colIndex(ws, 'Kâr (TL)');
    let hata = 0;
    let n = 0;
    for (let i = 5; i <= ws.rowCount; i += 1) {
      if (!ws.getRow(i).getCell(1).value) continue;
      const g = (c) => Number(ws.getRow(i).getCell(c).value || 0);
      const beklenen = r2(g(iRev) - g(iLab) - g(iSub) - g(iMat));
      n += 1;
      if (Math.abs(g(iKar) - beklenen) > 0.02) hata += 1;
    }
    ok(n > 0, `Kâr raporunda ${n} kayıt var`);
    ok(hata === 0, 'Kâr = Satış − (Ekip + Taşeron + Malzeme)', `-> ${hata} hata`);
  }

  // =================================================================
  section('4) Puanlama SAYFASI');
  const sc = await fetchBook('scores', '2026-09');
  if (sc.book) {
    const ws = sc.book.getWorksheet('Puanlama');
    ok(!!ws, '"Puanlama" sayfası bulundu');
    const baslik = ws.getRow(4).values.filter(Boolean).join(' ');
    ok(baslik.includes('Teknik Uygulama'), 'Kriter basligi geldi');
    ok(ws.getRow(4).values.filter(Boolean).some((v) => String(v).includes('%30')), 'Agirlik yuzdesi baslikta');
    ok(colIndex(ws, 'Hakeden Prim (TL)') > 0, 'Prim sutunu var');
  }

  // =================================================================
  section('5) TAŞERON SAYFALARI (şema uyumu)');
  const sub = await fetchBook('subcontractors');
  ok(sub.status === 200, 'Taşeron sayfaları indirildi', `-> ${sub.status}`);
  if (sub.book) {
    const n = sub.book.worksheets.map((w) => w.name);
    for (const s of ['Taşeronlar', 'Taşeron İşleri', 'Taşeron Faturaları', 'Taşeron Ödemeleri']) {
      ok(n.includes(s), `sayfa var: ${s}`);
    }
  }

  // =================================================================
  section('6) DÖNEM FİLTRESİ');
  const p1 = await fetchBook('payroll', '2026-09');
  ok(p1.status === 200, 'Dönemli bordro indirildi');
  if (p1.book) {
    const ws = p1.book.getWorksheet('Bordro');
    // Logo varsa evrak başlığı 3. sütundan başlar; yoksa 1.'den.
    const t = String(ws.getCell(1, 3).value || ws.getCell(1, 1).value || '');
    ok(t.includes('2026-09'), 'Başlıkta dönem yazıyor', `-> "${t}"`);
  }
  const badPeriod = await fetch(`${B}/export/excel?scope=all&period=2026-99`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  ok(badPeriod.status === 400, 'Geçersiz dönem reddedildi (400)', `-> ${badPeriod.status}`);

  // =================================================================
  section('7) KAPSAM VE GÜVENLİK');
  const badScope = await fetch(`${B}/export/excel?scope=bilinmeyen`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  ok(badScope.status === 400, 'Bilinmeyen kapsam reddedildi (400)', `-> ${badScope.status}`);

  const noAuth = await fetch(`${B}/export/excel?scope=all`);
  ok(noAuth.status === 401, 'Yetkisiz istek reddedildi (401)', `-> ${noAuth.status}`);

  // Müşteri rolü PERSONEL DIŞA AKTARAMAMALI (mali sızıntı)
  const pLogin = await fetch(`${B}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'vuruskan', password: process.env.PORTAL_PASSWORD_PROGRESS }),
  });
  if (pLogin.ok) {
    const { token: pt } = await pLogin.json();
    const pExport = await fetch(`${B}/export/excel?scope=all`, {
      headers: { Authorization: `Bearer ${pt}` },
    });
    ok(pExport.status === 403, 'Müşteri Excel indiremiyor (403)', `-> ${pExport.status}`);
  } else {
    console.log('   --   vuruskan hesabı yok, müşteri testi atlandı');
  }

  const scopes = await fetch(`${B}/export/excel/scopes`, { headers: { Authorization: `Bearer ${token}` } });
  ok(scopes.ok, 'Kapsam listesi geldi');
  if (scopes.ok) {
    const list = (await scopes.json()).data;
    ok(list.some((s) => s.value === 'monthly'), '"monthly" kapsamı listelendi');
    ok(list.some((s) => s.value === 'quotes'), '"quotes" kapsamı listelendi');
    ok(list.some((s) => s.value === 'weighbridge'), '"weighbridge" kapsamı listelendi');
    ok(list.length >= 14, `${list.length} kapsam tanımlı`);
  }

  // =================================================================
  section('8) SÜTUN SEÇİMİ (gizleme)');
  const colList = await fetch(`${B}/export/excel/columns?scope=work-orders`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  ok(colList.ok, 'Sütun listesi geldi');
  if (colList.ok) {
    const sheets = (await colList.json()).data;
    const cols = sheets[0].columns;
    ok(cols.length > 0, `${cols.length} sütun listelendi`);
    ok(cols.every((c) => c.key && c.title), 'Her sütunun anahtarı ve başlığı var');
    ok(
      cols.every((c) => /^[a-z0-9-]+$/.test(c.key)),
      'Anahtarlar URL güvenli (a-z, 0-9, tire)'
    );

    const netKg = cols.find((c) => c.key === 'net-kg');
    const netTon = cols.find((c) => c.key === 'net-ton');
    ok(!!netKg?.locked, 'NET (kg) sütunu KİLİTLİ');
    ok(!!netTon?.locked, 'NET (ton) sütunu KİLİTLİ');
    ok(!!netKg?.lockedReason, 'Kilit nedeni açıklanmış');

    // Kilitli sutunlar gizlenmeye calisilsa bile dosyada KALMALI.
    const onlyLocked = await fetch(
      `${B}/export/excel?scope=work-orders&cols=${encodeURIComponent('net-kg')}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    ok(onlyLocked.status === 200, 'Sadece net-kg seçimi kabul edildi');
    if (onlyLocked.ok) {
      const f2 = path.join(dir, 'locked.xlsx');
      writeFileSync(f2, Buffer.from(await onlyLocked.arrayBuffer()));
      const b2 = new ExcelJS.Workbook();
      await b2.xlsx.readFile(f2);
      const ws2 = b2.getWorksheet('İş Emirleri');
      ok(colIndex(ws2, 'NET (kg)') > 0, 'İstenen net-kg dosyada VAR');
      ok(colIndex(ws2, 'Boş Tartım (kg)') === -1, 'Seçilmeyen boş tartım sütunu YOK');
    }

    // Sayfa bazli secim: baska sayfalar ETKILENMEMELI
    const perSheet = encodeURIComponent(
      JSON.stringify({ 'İş Emirleri': ['is-emri-no', 'net-kg', 'not'] })
    );
    const ps = await fetch(`${B}/export/excel?scope=all&cols=${perSheet}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    ok(ps.status === 200, 'Sayfa bazlı sütun seçimi çalışıyor', `-> ${ps.status}`);
    if (ps.ok) {
      const f3 = path.join(dir, 'persheet.xlsx');
      writeFileSync(f3, Buffer.from(await ps.arrayBuffer()));
      const b3 = new ExcelJS.Workbook();
      await b3.xlsx.readFile(f3);
      const woSheet = b3.getWorksheet('İş Emirleri');
      ok(colIndex(woSheet, 'İş Emri No') > 0, 'Seçilen sütun iş emirlerinde var');
      ok(colIndex(woSheet, 'Konu') === -1, 'Seçilmeyen sütun iş emirlerinde yok');
      // Başka sayfalarda aynı ada sahip sutun ETKILENMEMELI
      const cust = b3.getWorksheet('Müşteriler');
      if (cust) ok(colIndex(cust, 'Firma') > 0, 'Başka sayfalar etkilenmedi (Müşteriler.Firma yerinde)');
      const prod = b3.getWorksheet('Ürünler');
      if (prod) ok(colIndex(prod, 'Ürün') > 0, 'Başka sayfalar etkilenmedi (Ürünler.Ürün yerinde)');
    }

    const none = await fetch(`${B}/export/excel?scope=work-orders&cols=none`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    ok(none.status === 400, 'Hiç sütun seçilirse anlamlı hata (400)', `-> ${none.status}`);
  }

  // =================================================================
  section('9) AY SONU RAPORU');
  const monthly = await fetchBook('monthly', '2026-09');
  ok(monthly.status === 200, 'Ay sonu raporu indirildi', `-> ${monthly.status}`);
  if (monthly.book) {
    const names = monthly.book.worksheets.map((w) => w.name);
    for (const s of ['Özet', 'Müşteri Kırılımı', 'İş Emirleri', 'Teklifler', 'Kâr Raporu', 'Puanlama', 'Bordro']) {
      ok(names.includes(s), `sayfa var: ${s}`);
    }
    ok(names.length === 7, `7 sayfa (bulunan: ${names.length})`);

    const sum = monthly.book.getWorksheet('Özet');
    // Logo varsa evrak başlığı 3. sütundan başlar; yoksa 1.'den.
    const sumTitle = String(sum.getCell(1, 3).value || sum.getCell(1, 1).value || '');
    ok(sumTitle.includes('2026'), 'Başlıkta dönem yazıyor', `-> "${sumTitle}"`);
    const kalemler = [];
    for (let i = 5; i <= sum.rowCount; i += 1) {
      const k = sum.getRow(i).getCell(1).value;
      if (k) kalemler.push(String(k));
    }
    for (const beklenen of [
      'İş emri adedi',
      'Toplam satış (TL)',
      'DÖNEM KÂRI (TL)',
      'Müşterilerden alacak (TL)',
      'Taşeronlara borç (TL)',
    ]) {
      ok(kalemler.includes(beklenen), `özet kalemi: ${beklenen}`);
    }

    const kir = monthly.book.getWorksheet('Müşteri Kırılımı');
    ok(colIndex(kir, 'Net (kg)') > 0, 'Kırılımda net (kg) var');
    ok(colIndex(kir, 'Net (ton)') > 0, 'Kırılımda net (ton) var');
    ok(colIndex(kir, 'Kâr (TL)') > 0, 'Kırılımda kâr var');
  }

  // =================================================================
  section('10) LOGO VE BELGE BAŞLIĞI');
  const profRes = await fetch(`${B}/company`, { headers: { Authorization: `Bearer ${token}` } });
  const company = profRes.ok ? (await profRes.json()).data : null;
  const hasCompanyLogo = !!company?.logo;
  console.log(`       (firma logosu: ${hasCompanyLogo ? 'VAR' : 'YOK'})`);

  const withLogo = await fetch(`${B}/export/excel?scope=work-orders`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const noLogo = await fetch(`${B}/export/excel?scope=work-orders&logo=0`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  ok(withLogo.status === 200, 'Logulu indirme çalışıyor', `-> ${withLogo.status}`);
  ok(noLogo.status === 200, 'logo=0 indirmesi çalışıyor', `-> ${noLogo.status}`);

  if (withLogo.ok && noLogo.ok) {
    // Dikeyleri ONCE oku: arrayBuffer() akisi tuketir, ikinci cagri hata verir.
    const bufL = Buffer.from(await withLogo.arrayBuffer());
    const bufN = Buffer.from(await noLogo.arrayBuffer());
    const fL = path.join(dir, 'with-logo.xlsx');
    const fN = path.join(dir, 'no-logo.xlsx');
    writeFileSync(fL, bufL);
    writeFileSync(fN, bufN);

    const bL = new ExcelJS.Workbook();
    await bL.xlsx.readFile(fL);
    const bN = new ExcelJS.Workbook();
    await bN.xlsx.readFile(fN);
    const mediaL = bL.model.media?.length ?? 0;
    const mediaN = bN.model.media?.length ?? 0;
    console.log(`       (gömülü görsel: açık=${mediaL}, kapalı=${mediaN})`);

    if (hasCompanyLogo) {
      ok(mediaL > 0, 'Logo dosyaya gömüldü');
      ok(mediaN === 0, 'logo=0 ile gömülmedi');
      ok(bufL.length > bufN.length, 'Logolu dosya daha büyük');
    } else {
      ok(mediaL === 0, 'Logo yokken gömülü görsel yok (hata vermedi)');
    }

    const wsL = bL.getWorksheet('İş Emirleri');
    const title = String(wsL.getCell(1, 3).value || wsL.getCell(1, 1).value || '');
    ok(title.includes('İŞ EMİRLERİ'), 'Evrak başlığı yazıyor', `-> "${title}"`);
    if (company?.name) {
      ok(
        title.includes(company.name.split(' ')[0]),
        'Firma adı başlıkta geçiyor',
        `-> "${title}"`
      );
    }
    if (company?.logo) {
      ok(wsL.getRow(1).height >= 40, 'Baslik satiri logo icin yukseltildi', `-> ${wsL.getRow(1).height}pt`);
    } else {
      console.log('       (firma logosu yok - baslik yuksekligi atlandi)');
    }

    if (company?.phone || company?.address) {
      const line3 = String(wsL.getCell(3, 1).value || '');
      ok(line3.length > 0, 'İletişim bilgisi satırı var', `-> "${line3}"`);
      if (company.phone) ok(line3.includes(company.phone), 'Telefon yazıyor');
      if (company.tax_number) ok(line3.includes(company.tax_number), 'Vergi numarası yazıyor');
    }

    // Logo satırları eklediği için sütun başlıkları KAYMAMALI (hep 4. satır)
    ok(colIndex(wsL, 'İş Emri No') > 0, 'Sütun başlıkları yerinde (4. satır)');
    ok(wsL.getRow(5).getCell(1).value !== null, 'Veri 5. satırdan başlıyor');

    // Logolu dosyada da tartım kuralı bozulmamalı
    const iBos = colIndex(wsL, 'Boş Tartım (kg)');
    const iDolu = colIndex(wsL, 'Dolu Tartım (kg)');
    const iKg = colIndex(wsL, 'NET (kg)');
    let tartimHata = 0;
    if (iBos > 0 && iDolu > 0 && iKg > 0) {
      for (let i = 5; i <= wsL.rowCount; i += 1) {
        if (!wsL.getRow(i).getCell(1).value) continue;
        const b = wsL.getRow(i).getCell(iBos).value;
        const d = wsL.getRow(i).getCell(iDolu).value;
        const k = wsL.getRow(i).getCell(iKg).value;
        if (b === null || b === undefined) continue;
        if (Number(d) - Number(b) !== Number(k)) tartimHata += 1;
      }
    } else {
      ok(false, 'Logolu dosyada tartım sütunları bulunamadı');
    }
    ok(tartimHata === 0, 'Logolu dosyada tartım kuralı korunuyor', `-> ${tartimHata} hata`);
  }

  // =================================================================
  section('11) TEKLİFLER');
  const qt = await fetchBook('quotes');
  ok(qt.status === 200, 'Teklifler indirildi', `-> ${qt.status}`);
  if (qt.book) {
    const ws = qt.book.getWorksheet('Teklifler');
    ok(!!ws, '"Teklifler" sayfası bulundu');
    for (const c of ['Teklif No', 'Müşteri', 'Ara Toplam (TL)', 'KDV (TL)', 'Toplam (TL)']) {
      ok(colIndex(ws, c) > 0, `sütun var: ${c}`);
    }
    // KDV = (ara toplam - indirim) * oran
    const iSub = colIndex(ws, 'Ara Toplam (TL)');
    const iDisc = colIndex(ws, 'İndirim (TL)');
    const iRate = colIndex(ws, 'KDV Oranı %');
    const iTax = colIndex(ws, 'KDV (TL)');
    const iTot = colIndex(ws, 'Toplam (TL)');
    let hata = 0;
    let n = 0;
    for (let i = 5; i <= ws.rowCount; i += 1) {
      if (!ws.getRow(i).getCell(1).value) continue;
      const g = (c) => Number(ws.getRow(i).getCell(c).value || 0);
      const matrah = Math.max(g(iSub) - g(iDisc), 0);
      const beklenenTax = r2((matrah * g(iRate)) / 100);
      n += 1;
      if (Math.abs(g(iTax) - beklenenTax) > 0.02) hata += 1;
      if (Math.abs(g(iTot) - r2(matrah + beklenenTax)) > 0.02) hata += 1;
    }
    ok(n > 0, `${n} teklif kontrol edildi`);
    ok(hata === 0, 'KDV ve toplam doğru hesaplanıyor', `-> ${hata} hata`);
  }

  // =================================================================
  section('12) KÂFİYE / TARTIM DEFTERİ');
  const wbRes = await fetchBook('weighbridge');
  ok(wbRes.status === 200, 'Kâfiyye indirildi', `-> ${wbRes.status}`);
  if (wbRes.book) {
    const ws = wbRes.book.getWorksheet('Kâfiyye');
    ok(!!ws, '"Kâfiyye" sayfası bulundu');
    const iBos = colIndex(ws, 'Boş Tartım (kg)');
    const iDolu = colIndex(ws, 'Dolu Tartım (kg)');
    const iKg = colIndex(ws, 'NET (kg)');
    const iTon = colIndex(ws, 'NET (ton)');
    ok(iBos > 0 && iDolu > 0 && iKg > 0 && iTon > 0, 'Dört tartım sütunu da var');
    let tartimHata = 0;
    let tonHata = 0;
    let kontrol = 0;
    for (let i = 5; i <= ws.rowCount; i += 1) {
      if (!ws.getRow(i).getCell(1).value) continue;
      const b = ws.getRow(i).getCell(iBos).value;
      const d = ws.getRow(i).getCell(iDolu).value;
      const k = ws.getRow(i).getCell(iKg).value;
      const t = ws.getRow(i).getCell(iTon).value;
      if (b === null || b === undefined) continue;
      kontrol += 1;
      if (Number(d) - Number(b) !== Number(k)) tartimHata += 1;
      // Ton 2 ondaliga yuvarlanir; tolerans 0.005.
      if (t !== null && t !== undefined && Math.abs(Number(t) - Number(k) / 1000) > 0.0051) tonHata += 1;
    }
    ok(kontrol > 0, `${kontrol} tartımlı kayıt kontrol edildi`);
    ok(tartimHata === 0, 'NET = Dolu − Boş', `-> ${tartimHata} hata`);
    ok(tonHata === 0, 'NET (ton) = NET (kg) ÷ 1000', `-> ${tonHata} hata`);
  }

  // Kâfiyye sayfasinda da kilitli sutunlar isaretlenmis olmali
  const wbCols = await fetch(`${B}/export/excel/columns?scope=weighbridge`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (wbCols.ok) {
    const cols = (await wbCols.json()).data[0].columns;
    ok(cols.find((c) => c.key === 'net-kg')?.locked === true, 'Kâfiyyede net-kg kilitli');
    ok(cols.find((c) => c.key === 'net-ton')?.locked === true, 'Kâfiyyede net-ton kilitli');
  }

  // =================================================================
  // Gecici klasoru EN SON sil (onceki kosuda burada siliniyordu ve
  // log testi silinmis klasore yazmaya calisiyordu).
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* temizlik onemsiz */
  }

  console.log('\n============================================================');
  console.log(` Sonuc:  ${pass} gecti, ${fail} kaldi`);
  if (fail) {
    console.log('\n Basarisiz testler:');
    for (const f of failures) console.log(`   - ${f}`);
  }
  console.log('============================================================\n');
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error('\n Test hatasi:', e.message);
  process.exit(1);
});
