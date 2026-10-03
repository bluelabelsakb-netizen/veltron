-- =========================================================
-- Veltron Is Takip Sistemi - Veritabani semasi
-- =========================================================

-- ---------------------------------------------------------------------
-- IS EMRI
-- Musteriden gelen numarayla acilir (VM2026-0017 gibi) veya sistem
-- tarafindan uretilir. Tartim: tirin bos ve dolu hali tartilir,
-- fark o isin net kilogramsidir. Fatura ile 1:1 iliskilidir.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS work_orders (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  number          TEXT    NOT NULL UNIQUE,      -- VM2026-0017
  number_source   TEXT    NOT NULL DEFAULT 'customer',  -- customer | system
  parent_id       INTEGER REFERENCES work_orders(id) ON DELETE CASCADE, -- alt emir
  customer_id     INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  work_date       TEXT,                          -- is tarihi
  due_date        TEXT,                          -- termin
  subject         TEXT,                          -- konu / kisa tanim
  description     TEXT,

  status          TEXT    NOT NULL DEFAULT 'alindi',
        -- alindi | hazirlaniyor | teslim_edildi | ertelendi | iptal

  -- Tartim (kg). net_kg her zaman fark olarak hesaplanir.
  tare_weight     REAL,                          -- bos tartim
  gross_weight    REAL,                          -- dolu tartim
  net_weight      REAL,                          -- otomatik: gross - tare
  weight_note     TEXT,                          -- hangi arac / olcu alet notu

  unit            TEXT    NOT NULL DEFAULT 'Ton', -- kg basina fiyat birimi
  unit_price      REAL    NOT NULL DEFAULT 0,     -- birim fiyat (TL/Ton)
  amount          REAL    NOT NULL DEFAULT 0,     -- otomatik: net x fiyat
  quantity_done   REAL    NOT NULL DEFAULT 0,     -- teslim edilen miktar

  invoice_id      INTEGER,                       -- fatura kesildiginde baglanir
  notes           TEXT,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT
);

-- ---------------------------------------------------------------------
-- TASERON
-- Veltron'un icindeki alt yukleniciler. Musteri degildir; kendi
-- faturalarini keser, odemeyi Veltron yapar.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subcontractors (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  name              TEXT    NOT NULL,
  contact           TEXT,
  phone             TEXT,
  email             TEXT,
  tax_number        TEXT,
  specialty         TEXT,        -- uzmanlik alani (elektrik, tasima, iskele...)
  address           TEXT,
  city              TEXT,
  default_rate      REAL,        -- anlasmali birim fiyat
  rate_unit         TEXT    NOT NULL DEFAULT 'Ton',
  rating            INTEGER,     -- 1-5 performans puani
  notes             TEXT,
  is_active         INTEGER NOT NULL DEFAULT 1,
  created_at        TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------
-- DOVIZ (coklu para birimi)
-- ---------------------------------------------------------------------
-- Tutarlar KAYIT para biriminde saklanir; kura ile TL karsiligi hesaplanir.
-- Boylece kur sonradan degisse bile gecmise donuk fatura tutarlari BOZULMAZ.
-- Muhasebe icin zorunludur: fatura kesildigi andaki kur esastir.

CREATE TABLE IF NOT EXISTS currencies (
  code        TEXT PRIMARY KEY,              -- TRY | USD | EUR | GBP
  name        TEXT NOT NULL,                -- Turkce ad
  symbol      TEXT NOT NULL,                -- $, EUR, GBP
  decimals    INTEGER NOT NULL DEFAULT 2,   -- JPY gibi 0 ondalikli birimler
  is_active   INTEGER NOT NULL DEFAULT 1,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

-- Tarih bazli kurlar. (currency, tarih) tekillestirilir.
CREATE TABLE IF NOT EXISTS exchange_rates (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  currency_code TEXT    NOT NULL REFERENCES currencies(code) ON DELETE CASCADE,
  rate_to_try    REAL   NOT NULL,           -- 1 birim = kac TL
  rate_date     TEXT    NOT NULL,
  note          TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (currency_code, rate_date)
);

CREATE INDEX IF NOT EXISTS idx_fx_code_date ON exchange_rates(currency_code, rate_date DESC);

-- TIR FOTOGRAFLARI ve IS EMLERI
-- Tartim kaniti: "tir burada bosaliyordu" tartismasini foto
-- sonlandirir. Ayrica sozlesme, fis, irsaliye gibi ekler de tutulur.
--
-- ONEMLI: Dosyalarin KENDISI diskte tutulur, veritabaninda sadece
-- yol bilgisi vardir. Dizin: server/data/uploads/YYYY-AA/
-- LISANS ve DEMO MODU
-- Tek satir (id = 1). Satis gosterimi icin DEMO modunda baslar.
--
--   is_demo = 1  -> ornek veri, kisitli yazma, DEMO damgasi
--   is_demo = 0  -> gercek kullanim (lisans anahtari girilmis olmali)
CREATE TABLE IF NOT EXISTS license (
  id              INTEGER PRIMARY KEY CHECK (id = 1),
  is_demo         INTEGER NOT NULL DEFAULT 1,
  license_key     TEXT UNIQUE,                 -- uretilen/verilen anahtar
  customer_name   TEXT,                        -- lisans alan sirket
  demo_started_at TEXT,
  demo_expires_at TEXT,                        -- demo bitis
  demo_max_records INTEGER NOT NULL DEFAULT 500,
  activated_at    TEXT,
  updated_at      TEXT
);

CREATE TABLE IF NOT EXISTS work_order_attachments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  work_order_id INTEGER NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  kind          TEXT    NOT NULL DEFAULT 'photo',
        -- photo (tir/kantar) | document (sozlesme, fis, irsaliye) | imza
  file_name     TEXT    NOT NULL,          -- kullanicinin gordugu ad
  stored_name   TEXT    NOT NULL,          -- diskteki gercek ad (UUID)
  relative_path TEXT    NOT NULL,          -- uploads/2026-09/xxx.jpg
  mime_type     TEXT    NOT NULL DEFAULT 'application/octet-stream',
  size_bytes    INTEGER NOT NULL DEFAULT 0,
  caption       TEXT,                      -- kisayol: "bos tartim"
  taken_at      TEXT,                      -- cekim/olcum ani
  uploaded_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_woattach_wo   ON work_order_attachments(work_order_id);
CREATE INDEX IF NOT EXISTS idx_woattach_kind ON work_order_attachments(work_order_id, kind);

-- Is emri icin satin alinan malzeme (YALNIZCA disaridan alinanlarda).
-- Müsterinin tedarikçisinden gelen malzemede bu tablo BOS birakilir:
-- maliyet zaten satis fiyatinin icindedir.
CREATE TABLE IF NOT EXISTS work_order_materials (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  work_order_id INTEGER NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  product_id    INTEGER REFERENCES products(id) ON DELETE SET NULL,
  description   TEXT    NOT NULL,           -- serbest satir da yazilabilir
  quantity      REAL    NOT NULL DEFAULT 0,
  unit          TEXT,                       -- Kg, Ton, Adet, Rulo...
  unit_price    REAL    NOT NULL DEFAULT 0,
  cost          REAL    NOT NULL DEFAULT 0,-- otomatik: miktar x birim fiyat
  deduct_stock  INTEGER NOT NULL DEFAULT 0,-- 1 ise stoktan dusulur
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Is emrinin bir kismi kendi iscimizle, kalan kismi taseronla yapilir.
-- Isin bir kismi kendi iscimizle, kalan kismi taseronla yapilir.
-- Maliyet: employee.hourly_rate x hours
CREATE TABLE IF NOT EXISTS work_order_labor (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  work_order_id INTEGER NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  employee_id   INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  weight        REAL    NOT NULL DEFAULT 0,   -- bu kisinin yaptigi kg
  hours         REAL    NOT NULL DEFAULT 0,   -- harcadigi saat
  cost          REAL    NOT NULL DEFAULT 0,   -- otomatik: saat ucreti x saat
  note          TEXT,
  work_date     TEXT,                          -- calisma tarihi
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT,
  UNIQUE (work_order_id, employee_id)
);

-- Bir is emrine baglanan taseron isi
CREATE TABLE IF NOT EXISTS subcontractor_jobs (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  work_order_id     INTEGER NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  subcontractor_id  INTEGER NOT NULL REFERENCES subcontractors(id) ON DELETE RESTRICT,
  assigned_date     TEXT,
  due_date          TEXT,
  status            TEXT    NOT NULL DEFAULT 'gonderildi',
        -- gonderildi | kabul | calisiyor | teslim_alindi | red
  quantity          REAL,           -- yaptigi is miktari
  quantity_unit     TEXT,
  cost              REAL    NOT NULL DEFAULT 0,  -- taserona odenen tutar
  note              TEXT,
  created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT
);

-- Taseronun Veltron'a kestigi fatura ve odemeler
CREATE TABLE IF NOT EXISTS subcontractor_invoices (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  subcontractor_id  INTEGER NOT NULL REFERENCES subcontractors(id) ON DELETE CASCADE,
  work_order_id     INTEGER REFERENCES work_orders(id) ON DELETE SET NULL,
  invoice_no        TEXT    NOT NULL,
  invoice_date      TEXT    NOT NULL,
  due_date          TEXT,
  amount            REAL    NOT NULL,
  paid_amount       REAL    NOT NULL DEFAULT 0,
  status            TEXT    NOT NULL DEFAULT 'issued',  -- draft|issued|paid|cancelled
  note              TEXT,
  created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT
);

-- Taseron faturalarina yapilan odemeler
CREATE TABLE IF NOT EXISTS subcontractor_payments (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id        INTEGER NOT NULL REFERENCES subcontractor_invoices(id) ON DELETE CASCADE,
  amount            REAL    NOT NULL,
  payment_date      TEXT    NOT NULL,
  method            TEXT,
  reference         TEXT,
  note              TEXT,
  created_at        TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Erteleme gecmisi: durum alani degil, kayit. Raporlar buradan cikar.
CREATE TABLE IF NOT EXISTS deferrals (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  work_order_id     INTEGER NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  previous_due_date TEXT,
  new_due_date      TEXT,
  reason            TEXT,        -- musteri_talebi | malzeme_yok | kapasite | hava | diger
  requested_by      TEXT,        -- kim talep etti
  approval_status   TEXT    NOT NULL DEFAULT 'beklemede', -- beklemede|onaylandi|reddedildi
  note              TEXT,
  created_at        TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Kendi firmamizin profili (evrak basligi, varsayilan KDV/vade).
-- Tek satirdir (id = 1).
-- ---------------------------------------------------------------------
-- PUNANLAMA VE MAAS
-- Excel'deki (arsiv) puanlama ve bordro kurallarinin web karsiligi.
-- Kurallar: server/src/docs/PUAN-MAAS-KURALLARI.md
-- ---------------------------------------------------------------------

-- Puanlama kriterleri ve agirliklari (ayarlanabilir, toplam 100 olmali)
CREATE TABLE IF NOT EXISTS score_criteria (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT    NOT NULL UNIQUE,      -- TEK | KAL | ZAM | MUT | EKI | DIS
  name        TEXT    NOT NULL,
  weight      REAL    NOT NULL DEFAULT 0,   -- agirlik yuzde
  description TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   INTEGER NOT NULL DEFAULT 1
);

-- Puan kayitlari: donem x personel x kriter (puan 0-100)
CREATE TABLE IF NOT EXISTS scores (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  period       TEXT    NOT NULL,                       -- YYYY-MM
  employee_id  INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  criterion_id INTEGER NOT NULL REFERENCES score_criteria(id) ON DELETE CASCADE,
  score        REAL    NOT NULL,                       -- 0-100
  reason       TEXT,                                   -- gerekce / not
  evaluator_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  evaluated_at TEXT,                                   -- degerlendirme tarihi
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT,
  UNIQUE (period, employee_id, criterion_id)
);

-- Bordro: donem x personel
CREATE TABLE IF NOT EXISTS payroll (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  period          TEXT    NOT NULL,                    -- YYYY-MM
  employee_id     INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  -- girdiler
  overtime_hours  REAL    NOT NULL DEFAULT 0,          -- mesai saati
  extra_payment   REAL    NOT NULL DEFAULT 0,          -- ek odeme
  advance         REAL    NOT NULL DEFAULT 0,          -- avans
  other_deduction REAL    NOT NULL DEFAULT 0,          -- diger kesinti
  payment_date    TEXT,                                 -- odeme tarihi
  -- hesaplananlar (ayarlardan turer, elle girilmez)
  period_score    REAL,                                 -- donem puani
  score_bonus     REAL    NOT NULL DEFAULT 0,          -- puan primi
  overtime_pay    REAL    NOT NULL DEFAULT 0,          -- mesai ucreti
  gross_salary    REAL    NOT NULL DEFAULT 0,          -- aylik brut
  gross_total     REAL    NOT NULL DEFAULT 0,          -- brut toplam
  tax             REAL    NOT NULL DEFAULT 0,
  sgk             REAL    NOT NULL DEFAULT 0,
  net             REAL    NOT NULL DEFAULT 0,          -- net odenecek
  status          TEXT    NOT NULL DEFAULT 'bekliyor', -- bekliyor | odendi
  notes           TEXT,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT,
  UNIQUE (period, employee_id)
);

-- Hesaplama ayarlari (tek satir, id = 1)
CREATE TABLE IF NOT EXISTS payroll_settings (
  id                  INTEGER PRIMARY KEY CHECK (id = 1),
  score_threshold     REAL    NOT NULL DEFAULT 70,   -- puan esigi
  bonus_multiplier    REAL    NOT NULL DEFAULT 250,  -- prim carpani (TL/puan)
  bonus_cap           REAL    NOT NULL DEFAULT 5000, -- prim ust limiti
  tax_rate            REAL    NOT NULL DEFAULT 15,   -- vergi %
  sgk_rate            REAL    NOT NULL DEFAULT 14,   -- sgk %
  overtime_cap        REAL    NOT NULL DEFAULT 120,  -- mesai saat limiti/ay
  overtime_multiplier REAL    NOT NULL DEFAULT 0.4, -- mesai saat carpani
  advance_cap_rate    REAL    NOT NULL DEFAULT 30,   -- avans tavani %
  safety_factor       REAL    NOT NULL DEFAULT 1.5, -- emniyet katsayisi (stok)
  updated_at          TEXT
);

CREATE TABLE IF NOT EXISTS company_profile (
  id                INTEGER PRIMARY KEY CHECK (id = 1),
  name              TEXT    NOT NULL,
  short_name        TEXT,
  logo              TEXT,                             -- base64 data URL
  tagline           TEXT,
  tax_office        TEXT,
  tax_number        TEXT,
  address           TEXT,
  city              TEXT,
  phone             TEXT,
  email             TEXT,
  website           TEXT,
  bank_name         TEXT,
  iban              TEXT,
  default_tax_rate  REAL    NOT NULL DEFAULT 20,
  -- Vergi rejimi ve beyanneme donemi. KODDA SABIT DEGIL, ayarlardan gelir;
  -- boylece hem SIRKET (Limited/A.S.) hem SAHIS isletmesine uyar.
  tax_regime        TEXT    NOT NULL DEFAULT 'sirket',   -- sirket | sahis
  tax_period        TEXT    NOT NULL DEFAULT 'ceyreklik', -- ceyreklik | aylik | yillik
  payment_term_days INTEGER NOT NULL DEFAULT 30,
  invoice_prefix    TEXT    NOT NULL DEFAULT 'FTR',
  quote_prefix      TEXT    NOT NULL DEFAULT 'TLF',
  work_order_prefix TEXT    NOT NULL DEFAULT 'IEM',
  default_notes     TEXT,
  invoice_footer    TEXT,
  -- Fatura kâğıdı görünümü (1 Ekim 2026)
  -- marka_color : vurgu rengi (#rrggbb). Bos = varsayılan lacivert.
  -- invoice_layout : kullanılacak şablon dosyası (fatura.html vb.)
  -- YERLEŞİM fatura.html dosyasındadır; tasarım değişikliği kod yazmadan yapılır.
  marka_color       TEXT,
  invoice_layout    TEXT    NOT NULL DEFAULT 'fatura.html',
  updated_at        TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  full_name     TEXT    NOT NULL,
  email         TEXT,
  -- Jeton iptali: parola degisince veya cikis yapilinca artar.
  -- Eski jetonlar "tv" degeri eski oldugu icin gecersiz sayilir.
  token_version INTEGER NOT NULL DEFAULT 1,
  role          TEXT    NOT NULL DEFAULT 'user',
        -- admin          = tam yetki
        -- user           = personel
        -- customer_progress = musteri: SADECE is ilerleme durumu + tarih talebi
        -- customer_finance  = musteri: SADECE faturalar / mali kismi
  customer_id   INTEGER REFERENCES customers(id) ON DELETE SET NULL,
        -- Musteri rollerinin gormesi gereken musteri kaydi.
        -- NULL ise portal bos liste doner (veri sizintisi olmaz).
  is_active     INTEGER NOT NULL DEFAULT 1,
  last_login_at TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- VERGI BEYANNAMELERI
-- =====================
-- Her beyanneme donemi icin muhasebecinin RESMI beyan tutari.
--
-- ⛔ ONEMLI GUVENLIK KURAMI:
--   Beyan tutarini MUHASEBECI girer. Sistem KESMEZ, sadece:
--     - faturalardan TOPLANAN KDV'i hesaplar (satis tarafi)
--     - beyan edilen tutarla KARSILASTIRIR ve farki gosterir
--   Neden? Beyan edilen vergi ile hesaplanan her zaman tutmaz; istisnalar,
--   gecen donem duzeltmeleri ve kismi oranlar sistemde YOKTUR. Sistem
--   "kesiyor" dense ve muhasebeci farkli bir tutar beyan ederse, veri
--   YANLIS kalir ve kimse nedenini bilmez.
--
--   Sag tiklanabilir: alis faturanin KDV'si de indirilir.
--   Once tablo YOKTUR; eklenene kadar bu satir gecerlidir.
CREATE TABLE IF NOT EXISTS tax_periods (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  period_key       TEXT    NOT NULL UNIQUE,      -- 2026-c3 | 2026-09 | 2026
  period_type      TEXT    NOT NULL,             -- ceyreklik | aylik | yillik
  period_label     TEXT    NOT NULL,             -- "3. ceyrek 2026"
  start_date       TEXT    NOT NULL,
  end_date         TEXT    NOT NULL,
  tax_kind         TEXT    NOT NULL DEFAULT 'kdv', -- kdv | muhtasar | sgk | gecici | diger
  tax_name         TEXT,                          -- serbest ad ("Muhtasar + Prim Hizmet")
  declared_amount  REAL    NOT NULL DEFAULT 0,    -- MUHASEBCININ BEYAN ETTIGI TUTAR
  paid_amount      REAL    NOT NULL DEFAULT 0,    -- gercekte odenen
  due_date         TEXT,                          -- son odeme gunu
  payment_date     TEXT,                          -- ne zaman odedi
  status           TEXT    NOT NULL DEFAULT 'bekliyor',
                     -- bekliyor | odendi | gecikti
  note             TEXT,                          -- FARKIN GEREKCESI (istisna, duzeltme...)
  created_by       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT
);

-- SIFRE SIFIRLAMA TALEBI
-- =====================
-- Giris ekranindaki "Sifremi unuttum" formundan gelir.
--
-- ONEMLI GUVENLIK KURAMI:
-- Talebi gonderen KISI yeni sifreyi KENDISI SECMEZ. Aksi halde `admin`
-- kullanici adini bilen herkes sistemi ele gechirirdi.
-- Akis: talep -> yonetici onayi -> sistem gecici sifre uretir ->
-- kullanici ilk girisde DEGISTIRMEYE ZORLANIR (users.must_change_password).
CREATE TABLE IF NOT EXISTS password_reset_requests (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT    NOT NULL,           -- kimin sifresi (kullanici adi)
  user_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  contact       TEXT,                       -- telefon / e-posta (istege bagli)
  note          TEXT,                       -- kullanici yazarsa
  ip_address    TEXT,
  status        TEXT    NOT NULL DEFAULT 'pending',
                 -- pending    = yonetici bekliyor
                 -- approved   = gecici sifre uretildi
                 -- rejected   = yonetici reddetti
                 -- fulfilled  = kullanici gecici sifreyle girip degistirdi
  temp_password TEXT,                       -- SADECE onay aninda yazilir
  handled_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  handled_at    TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- "BENI HATIRLA" CIHAZLARI (1 Ekim 2026)
-- ==========================================
-- Giris ekraninda "Beni hatirla" secilince sunucu 30 gunlik bir HATIRLEME
-- jetonu uretir. SIFRE HICBIR YERE YAZILMAZ - sadece bu jeton saklanir.
--
-- Jetontan iki katmanli koruma:
--   1) Bu tablo: iptal edilebilir ("Bu cihazi unut"), sure kontrolu
--   2) JWT icindeki tv = token_version: sifre degisince hepsi olur
--
-- Yalnizca TEK bir cihaz satirini tutariz: her yeni "hatirla" ayni
-- kullanici icin eskisini gecersiz kilar. Boylece kullanici "3. bilgisayar"
-- yaparsa 1. bilgisayardaki hatirlama calismaz, karisiklik olmaz.
CREATE TABLE IF NOT EXISTS remember_tokens (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  jti         TEXT    NOT NULL UNIQUE,        -- jetonun benzersiz kimligi
  device_name TEXT,                           -- orn. "KURT-BILGISAYAR"
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  expires_at  TEXT    NOT NULL,              -- 30 gun sonra
  last_used_at TEXT,                          -- son otomatik giris
  revoked_at  TEXT                           -- "Bu cihazi unut" -> dolu
);

CREATE INDEX IF NOT EXISTS idx_remember_user ON remember_tokens(user_id);

-- GONDERILEN FATURA E-POSTALARI (1 Ekim 2026)
-- ==============================================
-- "Faturayi e-posta ile gonder" tikildiginde buraya yazilir.
-- GONDERIM GECMISI: kim, ne zaman, hangi faturayi, basarili mi.
-- Fatura silinse bile kayit kalir (invoice_id NULL olur) — denetim izi.
--
-- ⛔ GOVDE VE EKLER BURAYA YAZILMAZ (belge gizliligi + yer tasarrufu).
-- Sadece kim/konu/durum/hata bilgisi tutulur.
CREATE TABLE IF NOT EXISTS invoice_emails (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id      INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
  invoice_number  TEXT,                           -- kopya: fatura silinse de kalir
  recipient       TEXT    NOT NULL,               -- kime gonderildi
  recipient_name  TEXT,
  subject         TEXT    NOT NULL,
  status          TEXT    NOT NULL DEFAULT 'sent', -- sent | failed
  error           TEXT,                           -- hata mesaji (basarisizsa)
  size_bytes      INTEGER,                        -- PDF boyutu
  has_attachment  INTEGER NOT NULL DEFAULT 1,
  user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL, -- gonderen
  created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Gunluk kota takibi icin: bugun gonderilenleri hizli sayabilmek
CREATE INDEX IF NOT EXISTS idx_invoice_emails_created ON invoice_emails(created_at);
CREATE INDEX IF NOT EXISTS idx_invoice_emails_invoice ON invoice_emails(invoice_id);

-- Musterilerin islerinin durum degisikligi. Portalde "ilerleme" olarak gosterilir.
-- Mali bilgi (fiyat, tutar, maliyet) BURAYA YAZILMAZ.
CREATE TABLE IF NOT EXISTS work_order_status_history (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  work_order_id INTEGER NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  status        TEXT    NOT NULL,
  note          TEXT,
  changed_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  changed_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Musterinin TERMIN (due_date) degisikligi icin talep.
-- Yalnizca musteri olusturur, yoneticinin onayi olmadan is emrine dokunulmaz.
CREATE TABLE IF NOT EXISTS work_order_date_requests (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  work_order_id  INTEGER NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  customer_id    INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  requested_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  requested_name TEXT,                        -- isteyen kisi (kullanici silinse de kalsin)
  direction      TEXT    NOT NULL DEFAULT 'ileri',
        -- ileri = terminu one cek (erken teslim)
        -- geri  = terminu sonraya cek (geciktirme)
  current_due_date TEXT,                      -- talep anindaki termin (degisiklik tespiti icin)
  requested_due_date TEXT NOT NULL,           -- istenen yeni termin
  reason         TEXT    NOT NULL,
  approval_status TEXT   NOT NULL DEFAULT 'beklemede',
        -- beklemede | onaylandi | reddedildi
  decided_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  decided_at     TEXT,
  decision_note  TEXT,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS customers (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT    NOT NULL,                          -- Bayi | Sahis
  company    TEXT,
  tax_number TEXT,
  tax_office TEXT,
  contact    TEXT,
  phone      TEXT,
  email      TEXT,
  city       TEXT,
  address    TEXT,
  notes      TEXT,
  is_active  INTEGER NOT NULL DEFAULT 1,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS employees (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  full_name       TEXT    NOT NULL,
  tc_no           TEXT,                             -- TC kimlik no (Excel aktarimi tekillestirir)
  position        TEXT,
  phone           TEXT,
  email           TEXT,
  department      TEXT,
  hire_date       TEXT,
  leave_date      TEXT,
  monthly_salary  REAL    NOT NULL DEFAULT 0,           -- aylik brut
  hourly_rate     REAL    NOT NULL DEFAULT 0,           -- saat ucreti (mesai hesabi icin)
  is_active       INTEGER NOT NULL DEFAULT 1,
  notes           TEXT,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS projects (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  code         TEXT,
  name         TEXT    NOT NULL,
  customer_id  INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  manager_id   INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  description  TEXT,
  status       TEXT    NOT NULL DEFAULT 'planning',    -- planning|active|on_hold|completed|cancelled
  priority     TEXT    NOT NULL DEFAULT 'normal',      -- low|normal|high|urgent
  start_date   TEXT,
  due_date     TEXT,
  budget       REAL    NOT NULL DEFAULT 0,
  actual_cost  REAL    NOT NULL DEFAULT 0,
  created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id      INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  title           TEXT    NOT NULL,
  description     TEXT,
  assignee_id     INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  status          TEXT    NOT NULL DEFAULT 'todo',     -- todo|in_progress|review|done|cancelled
  priority        TEXT    NOT NULL DEFAULT 'normal',   -- low|normal|high|urgent
  estimated_hours REAL    NOT NULL DEFAULT 0,
  spent_hours     REAL    NOT NULL DEFAULT 0,
  start_date      TEXT,
  due_date        TEXT,
  completed_at    TEXT,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS quotes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  number      TEXT    NOT NULL UNIQUE,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  project_id  INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  title       TEXT,
  status      TEXT    NOT NULL DEFAULT 'draft',        -- draft|sent|accepted|rejected|expired
  issue_date  TEXT,
  valid_until TEXT,
  discount    REAL    NOT NULL DEFAULT 0,              -- tutar cinsinden
  tax_rate    REAL    NOT NULL DEFAULT 20,             -- yuzde
  notes       TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS quote_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_id    INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  product_id  INTEGER REFERENCES products(id) ON DELETE SET NULL,
  description TEXT    NOT NULL,
  quantity    REAL    NOT NULL DEFAULT 1,
  unit        TEXT,
  unit_price  REAL    NOT NULL DEFAULT 0,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS invoices (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  number       TEXT    NOT NULL UNIQUE,
  customer_id  INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  -- Bu faturaya hangi is emri oldu? Otomatik TASLAK olusturmada ve
  -- "is emrinden fatura kes" akisinda dolar. Taslaklar da baglanir ki
  -- ayni is icin ikinci taslak olusmasin.
  work_order_id INTEGER REFERENCES work_orders(id) ON DELETE SET NULL,
  project_id   INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  quote_id     INTEGER REFERENCES quotes(id) ON DELETE SET NULL,
  status       TEXT    NOT NULL DEFAULT 'draft',       -- draft|issued|partial|paid|overdue|cancelled
  issue_date   TEXT,
  due_date     TEXT,
  discount     REAL    NOT NULL DEFAULT 0,
  tax_rate     REAL    NOT NULL DEFAULT 20,
  paid_amount  REAL    NOT NULL DEFAULT 0,
  notes        TEXT,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id  INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  product_id  INTEGER REFERENCES products(id) ON DELETE SET NULL,
  description TEXT    NOT NULL,
  quantity    REAL    NOT NULL DEFAULT 1,
  unit        TEXT,
  unit_price  REAL    NOT NULL DEFAULT 0,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS payments (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id   INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount       REAL    NOT NULL,
  method       TEXT,                                  -- nakit|havale|kredi_karti|cek|baska
  payment_date TEXT    NOT NULL,
  reference    TEXT,
  note         TEXT,
  user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  sku        TEXT    UNIQUE,
  name       TEXT    NOT NULL,
  category   TEXT,
  unit       TEXT    NOT NULL DEFAULT 'Adet',
  min_stock  REAL    NOT NULL DEFAULT 0,
  unit_price REAL    NOT NULL DEFAULT 0,
  location   TEXT,
  notes      TEXT,
  is_active  INTEGER NOT NULL DEFAULT 1,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id    INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  type          TEXT    NOT NULL,                      -- in|out|adjust
  quantity      REAL    NOT NULL,                      -- in/out: pozitif, adjust: isaretli fark
  unit_price    REAL    NOT NULL DEFAULT 0,
  reference     TEXT,
  movement_date TEXT    NOT NULL,
  note          TEXT,
  user_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS activity_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action     TEXT    NOT NULL,                         -- create|update|delete|login|logout
  entity     TEXT,
  entity_id  INTEGER,
  detail     TEXT,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS counters (
  name  TEXT    PRIMARY KEY,
  value INTEGER NOT NULL DEFAULT 0
);

-- ===============================================================
-- OFIS STOGU (3 Ekim 2026)
-- ---------------------------------------------------------------
-- Kullanici karari: is emri malzemelerinden TAMAMEN AYRI bir liste.
-- Gerekce: kaynakci eldiveni, is gozlugu, bant, marker gibi malzemeler
--   - is emrine DUSMEZ, kati maliyeti ETKILEMEZ
--   - KISIYE verilir (zimmet gibi), istenilen zaman degil, VERILME
--     zamani ve kac gunde bir yenilenebilecegi takip edilir
-- Ayri tablo + ayri hareket tablosu kullanildi; `products` tablosuna
-- karismaz, kar marjini etkilemez.
-- ===============================================================

-- Ofis / koruyucu malzeme tanimi
CREATE TABLE IF NOT EXISTS office_items (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  sku             TEXT    UNIQUE,
  name            TEXT    NOT NULL,
  category        TEXT,                             -- Eldiven | Gozluk | Is Guvenligi | Kirtasiye
  unit            TEXT    NOT NULL DEFAULT 'Adet',
  -- ⛔ ASIL KURAL: bu malzeme kac gunde bir yeniden verilebilir.
  --    0 = kisit yok (her istediginde verilebilir).
  --    Eldiven 7, gozluk 365, bant 30 gibi.
  re_request_days INTEGER NOT NULL DEFAULT 0,
  min_stock       REAL    NOT NULL DEFAULT 0,       -- kritik stok uyarisi
  unit_price      REAL    NOT NULL DEFAULT 0,
  location        TEXT,                             -- dolap / raf
  notes           TEXT,
  is_active       INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Ofis stogu hareketleri (ayri sayim — is emri stogu DEGILDIR)
CREATE TABLE IF NOT EXISTS office_stock_movements (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id        INTEGER NOT NULL REFERENCES office_items(id) ON DELETE CASCADE,
  type           TEXT    NOT NULL,                   -- in|out|adjust
  quantity       REAL    NOT NULL,
  movement_date  TEXT    NOT NULL,
  -- ⛔ Hareketin kaynagi. "out" hareketi kullanici elle yaptiysa
  --    'manual'; bir calisana verildiyse 'assignment' + assignment_id.
  --    Boylece "stok neden azaldi" sorusu her zaman cevaplanabilir.
  source         TEXT    NOT NULL DEFAULT 'manual',
  assignment_id  INTEGER REFERENCES office_assignments(id) ON DELETE SET NULL,
  note           TEXT,
  user_id        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ⛔ KISIYE VERILEN MALZEME ("zimmet")
CREATE TABLE IF NOT EXISTS office_assignments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id       INTEGER NOT NULL REFERENCES office_items(id) ON DELETE CASCADE,
  employee_id   INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  quantity      REAL    NOT NULL DEFAULT 1,
  given_at      TEXT    NOT NULL,                    -- VERIS TARIHI
  -- ⛔ GERI ALINDIGINDA dolulur. NULL = hala kisisinda.
  returned_at   TEXT,
  returned_note TEXT,
  note          TEXT,
  user_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------
-- Ofis stogu ozeti gorunumu
-- ---------------------------------------------------------------
DROP VIEW IF EXISTS office_item_stock;
CREATE VIEW office_item_stock AS
SELECT i.id, i.sku, i.name, i.category, i.unit, i.re_request_days,
       i.min_stock, i.unit_price, i.location, i.notes, i.is_active, i.created_at,
       COALESCE(SUM(
         CASE m.type
           WHEN 'in'  THEN  m.quantity
           WHEN 'out' THEN -m.quantity
           ELSE            m.quantity
         END
       ), 0) AS stock,
       -- ⛔ KACISADA KISIYE VERILMIS MIKTAR (geri alinmayanlar).
       --    "Kimde ne var" sorusunun tek kaynagi: hareketler DEGIL,
       --    veris kayitlari.
       COALESCE((
         SELECT SUM(a.quantity)
           FROM office_assignments a
          WHERE a.item_id = i.id
            AND a.returned_at IS NULL
       ), 0) AS issued_out,
       COALESCE((
         SELECT COUNT(*)
           FROM office_assignments a
          WHERE a.item_id = i.id
            AND a.returned_at IS NULL
       ), 0) AS person_count
  FROM office_items i
  LEFT JOIN office_stock_movements m ON m.item_id = i.id
 GROUP BY i.id;

-- ---------------------------------------------------------------
-- Stok ozeti gorunumu
-- ---------------------------------------------------------------
DROP VIEW IF EXISTS product_stock;
CREATE VIEW product_stock AS
SELECT p.id, p.sku, p.name, p.category, p.unit, p.min_stock, p.unit_price,
       p.location, p.notes, p.is_active, p.created_at,
       COALESCE(SUM(
         CASE m.type
           WHEN 'in'  THEN  m.quantity
           WHEN 'out' THEN -m.quantity
           ELSE            m.quantity
         END
       ), 0) AS stock,
       CASE
         WHEN COALESCE(SUM(
           CASE m.type
             WHEN 'in'  THEN  m.quantity
             WHEN 'out' THEN -m.quantity
             ELSE            m.quantity
           END
         ), 0) <= 0 THEN 1 ELSE 0
       END AS is_out_of_stock
FROM products p
LEFT JOIN stock_movements m ON m.product_id = p.id
GROUP BY p.id;

-- ---------------------------------------------------------------
-- Indeksler
-- ---------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_tasks_project     ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee    ON tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status      ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due         ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_projects_customer ON projects(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status   ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_quotes_customer   ON quotes(customer_id);
CREATE INDEX IF NOT EXISTS idx_movements_product  ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_payments_invoice   ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_activity_created   ON activity_log(created_at DESC);

-- Is emri
CREATE INDEX IF NOT EXISTS idx_wo_number     ON work_orders(number);
CREATE INDEX IF NOT EXISTS idx_wo_customer   ON work_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_wo_status     ON work_orders(status);
CREATE INDEX IF NOT EXISTS idx_wo_date       ON work_orders(work_date DESC);
CREATE INDEX IF NOT EXISTS idx_wo_parent     ON work_orders(parent_id);
CREATE INDEX IF NOT EXISTS idx_wo_uninvoiced ON work_orders(invoice_id, status);
CREATE INDEX IF NOT EXISTS idx_labor_wo      ON work_order_labor(work_order_id);
CREATE INDEX IF NOT EXISTS idx_labor_emp     ON work_order_labor(employee_id);
CREATE INDEX IF NOT EXISTS idx_womat_wo      ON work_order_materials(work_order_id);
CREATE INDEX IF NOT EXISTS idx_womat_prod    ON work_order_materials(product_id);
-- Ofis stogu (3 Ekim 2026)
CREATE INDEX IF NOT EXISTS idx_offmov_item    ON office_stock_movements(item_id);
CREATE INDEX IF NOT EXISTS idx_offmov_date    ON office_stock_movements(movement_date DESC);
CREATE INDEX IF NOT EXISTS idx_offmov_assign  ON office_stock_movements(assignment_id);
-- ⛔ "Kimde ne var" ekranı hep `returned_at IS NULL` filtresiyle çalışır;
--    kısmi indeks bunu ucuzlaştırır (kısmi indeks SQLite'ta desteklenir).
CREATE INDEX IF NOT EXISTS idx_offasg_item    ON office_assignments(item_id);
CREATE INDEX IF NOT EXISTS idx_offasg_emp     ON office_assignments(employee_id);
CREATE INDEX IF NOT EXISTS idx_offasg_given   ON office_assignments(given_at DESC);
CREATE INDEX IF NOT EXISTS idx_offasg_open    ON office_assignments(employee_id, item_id)
  WHERE returned_at IS NULL;
-- NOT: Bu iki index bilerek schema.sql'de YOK. `users.customer_id` sonradan
-- ensureColumn() ile eklendigi icin, sema calistiginda henuz olmayabilir.
-- Index'ler db.js -> migrate() icinde, sutun eklendikten SONRA kurulur.
-- (Bunu schema.sql'de kurmak "no such column" hatasi verir.)

-- Taseron
CREATE INDEX IF NOT EXISTS idx_sub_name       ON subcontractors(name);
CREATE INDEX IF NOT EXISTS idx_subjob_wo      ON subcontractor_jobs(work_order_id);
CREATE INDEX IF NOT EXISTS idx_subjob_sub     ON subcontractor_jobs(subcontractor_id);
CREATE INDEX IF NOT EXISTS idx_subinv_sub     ON subcontractor_invoices(subcontractor_id);
CREATE INDEX IF NOT EXISTS idx_subinv_status  ON subcontractor_invoices(status);
CREATE INDEX IF NOT EXISTS idx_subpay_inv     ON subcontractor_payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_deferral_wo    ON deferrals(work_order_id);
CREATE INDEX IF NOT EXISTS idx_deferral_date  ON deferrals(created_at DESC);

-- Puanlama / maas
CREATE INDEX IF NOT EXISTS idx_scores_period     ON scores(period);
CREATE INDEX IF NOT EXISTS idx_scores_employee  ON scores(employee_id);
CREATE INDEX IF NOT EXISTS idx_scores_criterion ON scores(criterion_id);
CREATE INDEX IF NOT EXISTS idx_payroll_period   ON payroll(period);
CREATE INDEX IF NOT EXISTS idx_payroll_employee ON payroll(employee_id);
CREATE INDEX IF NOT EXISTS idx_payroll_status   ON payroll(status);

-- ---------------------------------------------------------------
-- Is emri ozeti gorunumu: net kg, tutar ve taseron maliyeti
-- ---------------------------------------------------------------
DROP VIEW IF EXISTS work_order_summary;
CREATE VIEW work_order_summary AS
SELECT
  w.*,
  -- Müşteri silinince (ON DELETE SET NULL) ad null kalmasin diye CASE ile guvenli metin
  COALESCE(
    NULLIF(c.company, ''),
    NULLIF(c.contact, ''),
    CASE
      WHEN w.customer_id IS NULL THEN 'Musteri atanmedi'
      ELSE 'Musteri #' || w.customer_id
    END
  ) AS customer_name,
  (SELECT COUNT(*) FROM work_orders ch WHERE ch.parent_id = w.id) AS child_count,
  (SELECT COALESCE(SUM(sj.cost), 0) FROM subcontractor_jobs sj WHERE sj.work_order_id = w.id) AS subcontractor_cost,
  (SELECT COUNT(*) FROM subcontractor_jobs sj WHERE sj.work_order_id = w.id) AS subcontractor_count,
  -- Kendi ekibimiz (is emrinin bir kismini biz yapuyoruz)
  (SELECT COALESCE(SUM(l.hours), 0)  FROM work_order_labor l WHERE l.work_order_id = w.id) AS labor_hours,
  (SELECT COALESCE(SUM(l.weight), 0) FROM work_order_labor l WHERE l.work_order_id = w.id) AS labor_weight,
  (SELECT COALESCE(SUM(l.cost), 0)   FROM work_order_labor l WHERE l.work_order_id = w.id) AS labor_cost,
  (SELECT COUNT(*) FROM work_order_labor l WHERE l.work_order_id = w.id) AS labor_count,
  -- Taseron tarafi (kalan kisim, kg ve tutar)
  (SELECT COALESCE(SUM(sj.quantity), 0) FROM subcontractor_jobs sj
    WHERE sj.work_order_id = w.id AND sj.status <> 'red') AS subcontractor_weight,
  -- Disaridan alinan malzeme (bos ise maliyet 0)
  (SELECT COALESCE(SUM(m.cost), 0) FROM work_order_materials m WHERE m.work_order_id = w.id) AS material_cost,
  (SELECT COUNT(*) FROM work_order_materials m WHERE m.work_order_id = w.id) AS material_count,
  i.number AS invoice_number,
  i.status AS invoice_status
FROM work_orders w
LEFT JOIN customers c ON c.id = w.customer_id
LEFT JOIN invoices  i ON i.id = w.invoice_id;
