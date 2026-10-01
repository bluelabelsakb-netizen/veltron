/**
 * EXCEL'E AKTAR
 * ============
 * Tum veriyi tek dosyada, cok sayfali (multi-sheet), bicimlendirilmis
 * .xlsx olarak indirir.
 *
 * - "Ay Sonu Raporu": her ay kapanisinda tek pakete ihtiyac duyulan hazir kapsam
 * - Sutun secici: hangi sutunlarin gelecegini sen belirle (kayitli kalir)
 * - Donem filtresi: tek bir ayin verisini indir
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FileSpreadsheet, Download, Loader2, Check, AlertTriangle, Info,
  FolderOpen, CalendarRange, Columns3, Trash2, Image as ImageIcon, Scale,
} from 'lucide-react';
import { api, getServerUrl, getToken, todayIso } from '../lib/api.js';
import { useToast } from '../components/Toast.jsx';
import { PageHeader } from '../components/Primitives.jsx';
import { ConfirmDialog } from '../components/Modal.jsx';
import { ColumnPicker, loadColumnPrefs, saveColumnPrefs } from './ExportExcel/ColumnPicker.jsx';

const SCOPES = [
  { value: 'monthly', label: 'Ay Sonu Raporu', desc: '7 sayfa: Özet (KPI), Müşteri Kırılımı, İşler, Teklifler, Kâr, Puanlama, Bordro', icon: CalendarRange, period: true, featured: true },
  { value: 'all', label: 'Tüm Veriler', desc: '15 sayfa: her şey tek dosyada', icon: FolderOpen },
  { value: 'work-orders', label: 'İş Emirleri', desc: 'Tartım (kg/ton), tutar, maliyet kırılımı, kâr', icon: FileSpreadsheet },
  { value: 'weighbridge', label: 'Kâfiyye / Tartım', desc: 'Tartım defteri: boş/dolu/net, araç ve taşeron', icon: Scale, period: true },
  { value: 'quotes', label: 'Teklifler', desc: 'Teklif no, müşteri, geçerlilik, tutar, KDV', icon: FileSpreadsheet, period: true },
  { value: 'profit', label: 'Kâr Raporu', desc: 'Satış, maliyet ve kâr dökümü', icon: FileSpreadsheet },
  { value: 'invoices', label: 'Faturalar', desc: 'Kalemler, KDV, tahsilat, kalan bakiye', icon: FileSpreadsheet },
  { value: 'customers', label: 'Müşteriler', desc: 'Kartlar ve toplam hacimleri', icon: FileSpreadsheet },
  { value: 'subcontractors', label: 'Taşeronlar', desc: '4 sayfa: taşeronlar, iş atamaları, faturalar, ödemeler', icon: FileSpreadsheet },
  { value: 'products', label: 'Ürünler ve Stok', desc: 'Stok miktarları ve stok değeri', icon: FileSpreadsheet },
  { value: 'employees', label: 'Çalışanlar', desc: 'Personel, maaş ve saat ücretleri', icon: FileSpreadsheet },
  { value: 'scores', label: 'Puanlama', desc: 'Dönem × personel × kriter matrisi', icon: FileSpreadsheet, period: true },
  { value: 'scoreboard', label: 'Genel Performans', desc: 'Tüm dönemlerin sıralaması', icon: FileSpreadsheet },
  { value: 'payroll', label: 'Bordro', desc: 'Brüt, prim, vergi, SGK, net', icon: FileSpreadsheet, period: true },
];

const currentPeriod = () => todayIso().slice(0, 7);
const LOGO_KEY = 'veltron.exportLogo';

const shiftMonth = (period, n) => {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const monthLabel = (p) => {
  const [y, m] = p.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });
};

export default function ExportExcel() {
  const toast = useToast();
  const [busy, setBusy] = useState(null);
  const [done, setDone] = useState(null);
  const [period, setPeriod] = useState(currentPeriod());
  const [pickerFor, setPickerFor] = useState(null);
  const [confirmReset, setConfirmReset] = useState(false);
  // null = dönem filtresi kapalı (tüm kayıtlar)
  const [periodOn, setPeriodOn] = useState({});
  // Logo: varsayılan açık. Firma Profili'nde logo yoksa otomatik kapanır.
  const [withLogo, setWithLogo] = useState(() => {
    try {
      return localStorage.getItem(LOGO_KEY) !== '0';
    } catch {
      return true;
    }
  });
  const [brand, setBrand] = useState(null);

  const prefs = useMemo(() => loadColumnPrefs(), []);

  // Firma profilini (logo + kisi iletisim) bir kez oku.
  useEffect(() => {
    api
      .get('/company')
      .then((r) => setBrand(r.data))
      .catch(() => setBrand(null));
  }, []);

  const toggleLogo = (on) => {
    setWithLogo(on);
    try {
      localStorage.setItem(LOGO_KEY, on ? '1' : '0');
    } catch {
      /* depolama kapalı olabilir */
    }
  };

  const hasLogo = !!brand?.logo;

  /**
   * Kayıtlı sütun tercihini sayfa bazlı JSON haritası olarak gönderir.
   * Düz liste gönderilirse aynı adlı sütunlar (örn. "Not") tüm sayfalarda
   * birlikte gizlenir — bu istediğimiz davranış değil.
   */
  const colsParam = useCallback(
    (scope) => {
      const saved = prefs[scope];
      if (!saved) return null;
      const hasAny = Object.values(saved).some((v) => Array.isArray(v) && v.length);
      if (!hasAny) return null;
      return JSON.stringify(saved);
    },
    [prefs]
  );

  const download = useCallback(
    async (scope, { withCols = true } = {}) => {
      setBusy(scope);
      setDone(null);
      try {
        const usp = new URLSearchParams({ scope });
        if (periodOn[scope]) usp.set('period', period);
        if (!withLogo) usp.set('logo', '0');
        if (withCols) {
          const c = colsParam(scope);
          if (c) usp.set('cols', c);
        }
        const url = `${getServerUrl()}/api/export/excel?${usp}`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${getToken()}` } });
        if (!res.ok) {
          let msg = `Sunucu ${res.status} döndü`;
          try {
            const j = await res.json();
            msg = j.error?.message || j.error || msg;
          } catch {
            /* JSON değil */
          }
          throw new Error(msg);
        }

        const blob = await res.blob();
        const cd = res.headers.get('Content-Disposition') || '';
        const m = /filename="?([^"]+)"?/.exec(cd);
        const name = m ? m[1] : `Veltron_${scope}.xlsx`;

        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);

        setDone(scope);
        setTimeout(() => setDone(null), 4000);
        const hidden = res.headers.get('X-Hidden-Columns');
        toast.success(
          'Excel dosyası indirildi',
          hidden && hidden !== '0' ? `${name} · ${hidden} sütun gizlendi` : name
        );
      } catch (err) {
        toast.fromError(err, 'İndirilemedi');
      } finally {
        setBusy(null);
      }
    },
    [period, periodOn, colsParam, withLogo, toast]
  );

  const hasCustomCols = (scope) => Array.isArray(prefs[scope]);

  const resetPrefs = () => {
    saveColumnPrefs({});
    toast.success('Sütun tercihleri sıfırlandı', 'Artık tüm sütunlar geliyor.');
    setConfirmReset(false);
  };

  return (
    <>
      <PageHeader
        title="Excel'e Aktar"
        description="Verilerinizi gerçek Excel dosyası (.xlsx) olarak indirin"
      />

      {/* ---------- AY SONU RAPORU ---------- */}
      <div className="card mb-14" style={{ borderColor: 'var(--primary)' }}>
        <div className="card-head" style={{ background: 'var(--primary-soft)' }}>
          <CalendarRange size={16} style={{ color: '#60a5fa' }} />
          <h3>Ay Sonu Raporu</h3>
          <span className="badge primary">En çok kullanılan</span>
        </div>
        <div className="card-body">
          <div className="text-sm text-dim mb-14">
            Her ay kapanışında tek bakışta her şey: satış, maliyet, kâr, alacak/borç, bordro, puanlama
            ve müşteri kırılımı. 6 sayfa tek dosyada.
          </div>

          <div className="row row-wrap mb-14" style={{ gap: 10 }}>
            <button
              className="btn btn-icon"
              onClick={() => setPeriod(shiftMonth(period, -1))}
              title="Önceki ay"
            >
              ‹
            </button>
            <input
              type="month"
              className="input"
              style={{ width: 170 }}
              value={period}
              onChange={(e) => e.target.value && setPeriod(e.target.value)}
            />
            <button
              className="btn btn-icon"
              onClick={() => setPeriod(shiftMonth(period, 1))}
              title="Sonraki ay"
            >
              ›
            </button>
            <strong style={{ textTransform: 'capitalize', fontSize: 14 }}>{monthLabel(period)}</strong>
            <div className="spacer" />
            <button className="btn btn-sm" onClick={() => setPickerFor('monthly')}>
              <Columns3 size={13} />
              Sütunlar
            </button>
            <button
              className="btn btn-primary"
              onClick={() => download('monthly')}
              disabled={busy !== null}
            >
              {busy === 'monthly' ? (
                <>
                  <Loader2 size={14} className="spin" />
                  Hazırlanıyor...
                </>
              ) : done === 'monthly' ? (
                <>
                  <Check size={14} />
                  İndirildi
                </>
              ) : (
                <>
                  <Download size={14} />
                  Raporu İndir
                </>
              )}
            </button>
          </div>

          <div className="row row-wrap text-sm text-dim" style={{ gap: 14 }}>
            <span>
              <strong style={{ color: 'var(--text)' }}>Sayfalar:</strong> Özet · Müşteri Kırılımı ·
              İş Emirleri · Teklifler · Kâr Raporu · Puanlama · Bordro
            </span>
          </div>
        </div>
      </div>

      {/* ---------- DİĞER KAPSAMLAR ---------- */}
      <div className="toolbar mb-14">
        <div>
          <h3 style={{ fontSize: 15 }}>Diğer kapsamlar</h3>
          <div className="text-dim text-sm">Tek bir modülü veya tüm veriyi indirin</div>
        </div>
        <div className="spacer" />
        <button className="btn btn-sm" onClick={() => setConfirmReset(true)} disabled={!Object.keys(prefs).length}>
          <Trash2 size={13} />
          Sütun tercihlerini sıfırla
        </button>
      </div>

      <div className="grid grid-2 mb-14">
        {SCOPES.filter((s) => s.value !== 'monthly').map((s) => {
          const Icon = s.icon || FileSpreadsheet;
          const isBusy = busy === s.value;
          const isDone = done === s.value;
          const custom = hasCustomCols(s.value);
          return (
            <div className="card" key={s.value}>
              <div className="card-body">
                <div className="row" style={{ gap: 11, alignItems: 'flex-start' }}>
                  <div
                    style={{
                      width: 34, height: 34, borderRadius: 8, flexShrink: 0,
                      display: 'grid', placeItems: 'center',
                      background: 'var(--primary-soft)', color: '#60a5fa',
                    }}
                  >
                    <Icon size={17} />
                  </div>
                  <div className="grow">
                    <div className="row" style={{ gap: 7 }}>
                      <strong style={{ fontSize: 14 }}>{s.label}</strong>
                      {custom ? <span className="badge warning">Özel sütunlar</span> : null}
                    </div>
                    <div className="text-dim text-sm mt-4">{s.desc}</div>
                  </div>
                </div>

                {s.period ? (
                  <label className="row mt-14" style={{ gap: 7, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={!!periodOn[s.value]}
                      onChange={(e) =>
                        setPeriodOn((p) => ({ ...p, [s.value]: e.target.checked }))
                      }
                    />
                    <span className="text-sm">
                      Sadece bir döneme göre indir
                      {periodOn[s.value] ? (
                        <strong style={{ textTransform: 'capitalize' }}> · {monthLabel(period)}</strong>
                      ) : null}
                    </span>
                  </label>
                ) : null}

                <div className="row mt-14" style={{ gap: 8 }}>
                  <button
                    className="btn btn-sm grow"
                    onClick={() => setPickerFor(s.value)}
                    title="Hangi sütunlar gelsin?"
                  >
                    <Columns3 size={13} />
                    Sütunlar
                  </button>
                  <button
                    className="btn btn-primary grow"
                    onClick={() => download(s.value)}
                    disabled={busy !== null}
                  >
                    {isBusy ? (
                      <Loader2 size={14} className="spin" />
                    ) : isDone ? (
                      <Check size={14} />
                    ) : (
                      <Download size={14} />
                    )}
                    {isBusy ? 'Hazırlanıyor' : isDone ? 'İndirildi' : 'İndir'}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="card mb-14">
        <div className="card-head">
          <ImageIcon size={15} style={{ color: 'var(--primary)' }} />
          <h3>Belge başlığı</h3>
        </div>
        <div className="card-body">
          <div className="row row-wrap" style={{ gap: 14 }}>
            <label className="row" style={{ gap: 8, cursor: hasLogo ? 'pointer' : 'not-allowed' }}>
              <input
                type="checkbox"
                checked={withLogo}
                disabled={!hasLogo}
                onChange={(e) => toggleLogo(e.target.checked)}
              />
              <span>
                Logolu belge başlığı
                {hasLogo ? (
                  <span className="text-dim text-sm"> · {brand?.name}</span>
                ) : (
                  <span className="text-dim text-sm"> · Firma Profili'nde logo yok</span>
                )}
              </span>
            </label>

            {hasLogo ? (
              <div className="row" style={{ gap: 10 }}>
                <div
                  style={{
                    height: 40, padding: '4px 8px', borderRadius: 6,
                    border: '1px solid var(--border)', background: '#fff',
                    display: 'grid', placeItems: 'center',
                  }}
                >
                  <img
                    src={brand.logo}
                    alt="Firma logosu"
                    style={{ maxHeight: 32, maxWidth: 150, objectFit: 'contain' }}
                  />
                </div>
                <a className="btn btn-sm" href="/firma">
                  Değiştir
                </a>
              </div>
            ) : (
              <a className="btn btn-sm" href="/firma">
                <ImageIcon size={13} />
                Firma Profili'nden logo yükle
              </a>
            )}
          </div>

          {hasLogo ? (
            <div className="text-dim text-sm mt-14">
              Logo, dosyadaki <strong>her sayfanın</strong> sol üstünde görünür; yanında evrak
              başlığı, altında adres / telefon / vergi numarası yazılır. Görsel oranı bozulmaz.
            </div>
          ) : null}
        </div>
      </div>

      <div className="alert info mb-14">
        <Info size={15} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          İndirilen dosya <strong>gerçek Excel dosyasıdır</strong> — çok sayfalı, para/ağırlık
          biçimli, üstte filtre çubuğu var. Sütun seçimin kaydedilir; bir sonraki indirmeden aynı
          düzen gelir.
        </span>
      </div>

      <div className="alert warning">
        <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          <strong>Tartım kuralı Excel'de de korunur:</strong> Net ağırlık her zaman
          <strong> kg</strong> yazılır. Excel'de hesap yapabilmeniz için ayrıca{' '}
          <strong>NET (ton)</strong> sütunu eklenir (kg ÷ 1000). Bu iki sütun gizlenemez — projenin
          en kritik kuralıdır.
        </span>
      </div>

      {pickerFor ? (
        <ColumnPicker
          scope={pickerFor}
          period={periodOn[pickerFor] ? period : null}
          onClose={() => setPickerFor(null)}
          onApply={() => {
            const sc = pickerFor;
            setPickerFor(null);
            download(sc);
          }}
        />
      ) : null}

      {confirmReset ? (
        <ConfirmDialog
          open
          title="Sütun tercihlerini sıfırla"
          message="Tüm kapsamlar için kayıtlı sütun seçimleri silinecek ve bundan sonra tüm sütunlar indirilecek. Bu işlem geri alınamaz."
          confirmLabel="Sıfırla"
          danger
          onConfirm={resetPrefs}
          onCancel={() => setConfirmReset(false)}
        />
      ) : null}
    </>
  );
}
