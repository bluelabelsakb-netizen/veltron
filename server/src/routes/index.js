import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';

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
router.use('/invoices', invoiceRoutes);
router.use('/products', productRoutes);
router.use('/stock', stockRoutes);
router.use('/users', userRoutes);
router.use('/activity', activityRoutes);
router.use('/lookups', lookupRoutes);
router.use('/company', companyRoutes);
router.use('/work-orders', workOrderRoutes);
router.use('/subcontractors', subcontractorRoutes);
router.use('/payroll', payrollRoutes);
router.use('/profit', profitRoutes);
router.use('/export', exportRoutes);
router.use('/import', importRoutes);
router.use('/currency', currencyRoutes);
router.use('/taxes', taxRoutes);

export default router;
