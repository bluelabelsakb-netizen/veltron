import { Router } from 'express';
import { authenticate, isOptionalAuth } from '../middleware/auth.js';

import authRoutes from './auth.js';
import customerRoutes from './customers.js';
import employeeRoutes from './employees.js';
import projectRoutes from './projects.js';
import taskRoutes from './tasks.js';
import quoteRoutes from './quotes.js';
import invoiceRoutes from './invoices.js';
import productRoutes from './products.js';
import stockRoutes from './stock.js';
import userRoutes from './users.js';
import dashboardRoutes from './dashboard.js';
import activityRoutes from './activity.js';
import lookupRoutes from './lookups.js';
import companyRoutes from './company.js';
import faturaPostaRoutes from './faturaPosta.js';
import updateRoutes from './update.js';
import supportRoutes, { bilgiUcunu, bildirUcu } from './support.js';
import ofisStoguRoutes from './ofisStogu.js';
import importEmployeeRoutes from './importEmployee.js';
import importMusteriRoutes from './importMusteri.js';
import importUrunRoutes from './importUrun.js';
import workOrderRoutes from './workOrders.js';
import subcontractorRoutes from './subcontractors.js';
import payrollRoutes from './payroll.js';
import profitRoutes from './profit.js';
import exportRoutes from './export.js';
import importRoutes from './import.js';
import attachmentRoutes from './attachments.js';
import licenseRoutes from './license.js';
import currencyRoutes from './currency.js';
import portalRoutes, { isCustomerRole } from './portal.js';
import passwordResetRoutes from './passwordReset.js';
import taxRoutes from './taxes.js';

const router = Router();

// Giris gerektirmeyen uc noktalar
router.use('/auth', authRoutes);

// Lisans OZETI herkese acik: giris ekrani ve demo seridi bunu okur.
// Hassas bilgi (lisans anahtarinin tamami) YALNIZCA /license/full ucunda,
// o da requireAdmin arkasinda. Buradaki ozet sadece "demo mu, ne kadar
// suresi kaldi" bilgisini icerir.
router.use('/license', licenseRoutes);

// SIFRE SIFIRLAMA — giris gerektirmez.
// Sadece `/request` aciktir (sifresini unutan giris yapamaz). Diger uclar
// rota icinde kendi `authenticate` + `requireAdmin` kontrolunu yapiyor.
router.use('/password-reset', passwordResetRoutes);

// DESTEK — GIRIS GEREKTIRMEZ (2 Ekim 2026)
// ⛔ Neden ayri: destek sayfasi GIRIS EKRANINDA da calismali. Kullanici
//    giremiyorsa "neden giremiyorum" diye sorup rapor birakabilmeli.
//    `/bilgi` sadece surum/isletim sistemi doner, veri sizdirmaz.
//    `/bildir` ise `isOptionalAuth` ile kimlik varsa kullaniciya baglanir,
//    yoksa user_id NULL olarak kaydeder.
//    ⛔ BUGUNKİ HATA BURADA: bu iki uc buraya yazilmadan once global
//    `authenticate` takiliyor ve 401 donuyordu. Bildirim kaydi hic olusmuyordu.
router.get('/support/bilgi', bilgiUcunu);
router.post('/support/bildir', isOptionalAuth, bildirUcu);

// Buradan sonrasi oturum ister
router.use(authenticate);

// ===================================================================
// MUSTERI PORTALI
// Musteri rolleri SADECE buraya girebilir. Asagidaki tum ic rotalar
// personel icindir. Boylece yeni bir ic modul eklendiginde musteriye
// kazara acilma riski olmaz (whitelist yaklasimi).
// ===================================================================
router.use('/portal', portalRoutes);

// Ekler (tir fotograflari): Musteri rolune ACIK, ama route kendi icinde
// sahiplik kontrolu yapar - musteri YALNIZCA kendi isinin fotograflarini
// gorur. Fotograf = tartim kaniti, gormesi gerekir.
router.use('/attachments', attachmentRoutes);

// Ikinci katman: musteri rolu hicbir ic modulu goremez.
// (Portal uclarinin kendi rol kontrolu de ayrica var.)
router.use((req, res, next) => {
  if (isCustomerRole(req.user?.role)) {
    return res.status(403).json({
      error: {
        message: 'Bu bolume erisim yetkiniz yok',
        details: 'Musteri hesaplari yalnizca musteri portalini kullanabilir.',
      },
    });
  }
  return next();
});

router.use('/dashboard', dashboardRoutes);
router.use('/customers', customerRoutes);
router.use('/employees', employeeRoutes);
router.use('/projects', projectRoutes);
router.use('/tasks', taskRoutes);
router.use('/quotes', quoteRoutes);
// ⚠️ SIRA KRİTİK: faturaPostaRoutes ÖNCE kaydedilir.
// invoices.js içinde `GET /:id` var; o rota "/gonderim-durumu" gibi sabit
// yolları da yakalar ve "id=NaN" arar -> "Fatura bulunamadi" hatası.
// Express ilk eşleşen rotayı çalıştırdığı için bizim dosyamız önce gelmeli.
router.use('/invoices', faturaPostaRoutes);
router.use('/invoices', invoiceRoutes);
// Güncelleme kontrolü — GitHub Releases'ten sürüm sorar (2 Ekim 2026).
// Sıra önemli değil: /update/check sabit yol.
router.use('/update', updateRoutes);
// Destek + hata günlüğü (2 Ekim 2026). Günlük uçları requireAdmin ile
// korunur — müşteri logları göremez.
router.use('/support', supportRoutes);
// Personel Excel iceri aktarma (2 Ekim 2026). Fatura aktarimiyla ayni akis:
// preview (kayit yazmaz) -> commit (kaydeder).
// Excel iceri aktarma: /import/{employee,customer,product}/{preview,commit,template}
// ⛔ importEmployeeRoutes ONCE gelmeli: ic catismalari onlemek icin
//    (hepsi /import altinda ayri dosyalar).
router.use('/import', importEmployeeRoutes);
router.use('/import', importMusteriRoutes);
router.use('/import', importUrunRoutes);
router.use('/products', productRoutes);
router.use('/stock', stockRoutes);
// Ofis stogu (3 Ekim 2026). Kisiye verilen koruyucu malzeme.
// ⛔ IS EMRI MALZEMESINDEN AYRI: /products'a dokunmaz, kar marjini etkilemez.
//    Kendi sayimini tutar (office_stock_movements).
router.use('/office-stock', ofisStoguRoutes);
router.use('/users', userRoutes);
router.use('/activity', activityRoutes);
router.use('/lookups', lookupRoutes);
router.use('/company', companyRoutes);
// Not: faturaPosta (PDF + e-posta) yukarıda kayıtlı. PDF gorunumu
// server/templates/fatura.html dosyasındadır — tasarım için koda dokunulmaz.
router.use('/work-orders', workOrderRoutes);
router.use('/subcontractors', subcontractorRoutes);
router.use('/payroll', payrollRoutes);
router.use('/profit', profitRoutes);
router.use('/export', exportRoutes);
router.use('/import', importRoutes);
router.use('/currency', currencyRoutes);
router.use('/taxes', taxRoutes);

export default router;
