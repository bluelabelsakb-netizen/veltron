/**
 * GÜNCELLEME KÖŞE GÖSTERGESİ VE BANNER (3 Ekim 2026)
 * ===================================================
 *
 * KULLANICI İSTEĞİ:
 *   "Programın kendi içine açıldığında sağına soluna bir köşeye şey
 *    koyalım böyle güncelleme olduğuna dair ibare bastığında otomatik
 *    olarak indirsin. Program açılsın, giriş yapılsın, veriler
 *    görünsün, sorun yok — işlem bitiminde kullanıcı kendi isteği ile
 *    güncellesin ama uyarı geçilsin. Kritik güncellemelerde direkt
 *    güncelleme alması gerekiyor."
 *
 * ⛔ EN ÖNEMLİ KURAL — ORTADAN KESME YOK
 *   Program açılışta ASLA kapanmaz, ASLA yeniden başlamaz. Giriş yapılır,
 *   veriler görünür, kullanıcı çalışır. Güncelleme kendi zamanında.
 *   Aksi halde kullanıcı yarım bıraktığı faturayı kaybeder.
 *   "Direkt güncelleme" şu anlama gelir: KAPATILAMAZ uyarı + hazır dosya
 *   + boşta olunca kurulum teklifi. Otomatik yeniden başlatma YOK.
 *
 * ⛔ Normal sürüm  → sağ üstte küçük rozet. Tıklayınca panel açılır.
 * ⛔ Kritik sürüm   → kırmızı, KAPATILAMAZ. Rozet sürekli yanıp söner.
 *                    Dosya arka planda iner, "Kur" düğmesi hazır olur.
 *
 * ⛔ BOŞTA ALGILAMA — kritik güncellemede kurulum teklifi
 *   2 dakika mouse/klavye hareketi yoksa "şimdi güncelle" teklif edilir.
 *   Kullanıcı çalışırken HİÇBİR ŞEY olmaz.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Download, X, RefreshCw, Sparkles, AlertTriangle, Check,
  HardDriveDownload, CircleAlert,
} from 'lucide-react';
import { api, dateFmt } from '../lib/api.js';

/** Kaç saniye hareketsizlik sonrası "boştayız" sayılır. */
const BOS_ESIK_SANIYE = 120;

/** Köşe rozetine tıklanınca panel açılıp kapanır. */
export function UpdateIndicator({ veri, acik, onAcKapa, indirme }) {
  if (!veri) return null;
  const kritik = Boolean(veri.kritik);

  return (
    <button
      onClick={onAcKapa}
      title={kritik
        ? `Kritik güncelleme: ${veri.yeni}`
        : `Güncelleme var: ${veri.yeni}`}
      aria-label="Güncelleme"
      style={{
        position: 'fixed',
        top: 62,
        right: 18,
        zIndex: 320,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 11px',
        borderRadius: 999,
        cursor: 'pointer',
        fontSize: 12,
        fontWeight: 600,
        color: '#fff',
        background: kritik ? 'var(--danger)' : 'var(--primary)',
        border: `1px solid ${kritik ? 'rgba(248,113,113,.6)' : 'var(--border-strong)'}`,
        boxShadow: 'var(--shadow-md)',
      }}
      // ⛔ Yanıp sönme CSS sınıfıyla (styles.css) — hareket duyarlılığı olan
      //    kullanıcıda animasyon kapanır ama rozet görünür kalır.
      className={kritik ? 'veltron-kritik-pulse' : undefined}
    >
      {kritik ? <AlertTriangle size={13} /> : <Sparkles size={13} />}
      {kritik ? 'KRİTİK GÜNCELLEME' : 'Güncelleme'}
      {veri.yeni ? <span className="mono">{veri.yeni}</span> : null}
      {indirme?.durum === 'indiriliyor' ? (
        <RefreshCw size={11} className="spin" />
      ) : null}
    </button>
  );
}

export function UpdatePanel({
  veri, acik, onKapat, indirme, indirmeBaslat, indirmeIptal,
  kur, kuruluyor, bosTespit, bosSayac,
}) {
  if (!acik || !veri) return null;

  const kritik = Boolean(veri.kritik);
  const hazir = indirme?.durum === 'hazir';
  const indiriliyor = indirme?.durum === 'indiriliyor';

  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        top: 100,
        right: 18,
        zIndex: 320,
        width: 392,
        maxWidth: 'calc(100vw - 36px)',
        background: 'var(--bg-elevated)',
        border: `1px solid ${kritik ? 'rgba(248,113,113,.45)' : 'var(--border-strong)'}`,
        borderRadius: 'var(--radius)',
        boxShadow: 'var(--shadow-lg)',
        overflow: 'hidden',
      }}
    >
      {/* Başlık */}
      <div
        style={{
          padding: '13px 15px',
          background: kritik
            ? 'linear-gradient(135deg, #b91c1c, #dc2626)'
            : 'linear-gradient(135deg, var(--primary), var(--purple))',
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          color: '#fff',
        }}
      >
        {kritik ? <AlertTriangle size={17} style={{ flexShrink: 0 }} /> : <Sparkles size={17} style={{ flexShrink: 0 }} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700 }}>
            {kritik ? 'Kritik güncelleme' : 'Yeni sürüm hazır'}
          </div>
          <div style={{ fontSize: 11.5, opacity: 0.94 }}>
            {veri.yeni} sürümü yayımlandı (şu anki: {veri.mevcut})
          </div>
        </div>
        {/* ⛔ KRİTİKTE KAPATMA DÜĞMESİ YOK — kullanıcı isteği */}
        {!kritik ? (
          <button
            className="btn btn-ghost btn-icon"
            onClick={onKapat}
            aria-label="Kapat"
            style={{ color: '#fff', width: 26, height: 26 }}
          >
            <X size={14} />
          </button>
        ) : null}
      </div>

      <div style={{ padding: '13px 15px' }}>
        {kritik ? (
          <div className="alert danger" style={{ marginBottom: 12 }}>
            <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <strong>Bu güncelleme kritik.</strong>
              <div style={{ marginTop: 3, fontSize: 12.5, lineHeight: 1.55 }}>
                {veri.kritikSebep
                  ? veri.kritikSebep
                  : 'Güvenlik veya veri bütünlüğüyle ilgili düzeltme içeriyor.'}
              </div>
              <div style={{ marginTop: 5, fontSize: 12.5, lineHeight: 1.55 }}>
                ⛔ Uyarı kapatılamaz. <strong>Programın kapanmaz</strong> — işini
                rahat bitir, sonra <strong>Kur</strong> de. Verilerin kaybolmaz.
              </div>
            </div>
          </div>
        ) : (
          <div className="alert info" style={{ marginBottom: 12 }}>
            <Sparkles size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontSize: 12.5, lineHeight: 1.55 }}>
              ⛔ Acil değil. İşini yarıda kesmeden istediğin zaman
              güncelleyebilirsin — verilerin yerinde kalır.
            </div>
          </div>
        )}

        {veri.tarih ? (
          <div className="text-dim text-sm" style={{ marginBottom: veri.notlar ? 9 : 12 }}>
            Yayım tarihi: {dateFmt(veri.tarih)}
          </div>
        ) : null}

        {veri.notlar ? (
          <div
            className="text-sm"
            style={{
              marginBottom: 12,
              maxHeight: 92,
              overflowY: 'auto',
              whiteSpace: 'pre-wrap',
              color: 'var(--text-muted)',
              lineHeight: 1.5,
            }}
          >
            {veri.notlar}
          </div>
        ) : null}

        {/* ⛔ İNDİRME DURUMU — kritik sürümlerde kendiliğinden iner */}
        {indirme && indirme.durum !== 'bos' ? (
          <div className="mb-12">
            {indirme.durum === 'indiriliyor' ? (
              <>
                <div className="row" style={{ gap: 7, marginBottom: 5 }}>
                  <RefreshCw size={13} className="spin" />
                  <span className="text-sm">
                    Kurulum dosyası indiriliyor · %{indirme.ilerleme || 0}
                  </span>
                </div>
                <div
                  style={{
                    height: 5,
                    background: 'var(--bg-input)',
                    borderRadius: 999,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${indirme.ilerleme || 0}%`,
                      height: '100%',
                      background: 'var(--primary)',
                      transition: 'width .4s ease',
                    }}
                  />
                </div>
                <div className="text-dim text-sm" style={{ marginTop: 5 }}>
                  Arka planda iniyor — programı kullanmaya devam edebilirsin.
                </div>
              </>
            ) : null}

            {indirme.durum === 'hazir' ? (
              <div className="alert success" style={{ marginBottom: 0 }}>
                <Check size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>
                  Kurulum dosyası indirildi
                  {indirme.boyutBayt
                    ? ` (${Math.round(indirme.boyutBayt / 1024 / 1024)} MB)`
                    : ''}
                  . <strong>Ne zaman istersen o zaman kur.</strong>
                </span>
              </div>
            ) : null}

            {indirme.durum === 'hata' ? (
              <div className="alert warning" style={{ marginBottom: 0 }}>
                <CircleAlert size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>{indirme.hata}</span>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* ⛔ BOŞTA ALGILAMA — kritik güncellemede "şimdi güncelle" teklifi */}
        {kritik && bosTespit && bosSayac > 0 ? (
          <div className="alert success" style={{ marginBottom: 12 }}>
            <Check size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              ⏱️ <strong>{bosSayac} saniye</strong>dir işlem yapmıyorsun. Şimdi
              güncelleyebilirsin.
            </span>
          </div>
        ) : null}

        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {/* ⛔ Kurulum YOLU — dosya hazırsa programı kapatıp kurar */}
          {hazir ? (
            <button
              className="btn btn-primary"
              onClick={kur}
              disabled={kuruluyor}
              title="Program kapanacak, veriler yerinde kalır"
            >
              {kuruluyor
                ? <RefreshCw size={14} className="spin" />
                : <HardDriveDownload size={14} />}
              {kuruluyor ? 'Kuruluyor...' : 'Şimdi güncelle'}
            </button>
          ) : indiriliyor ? (
            <button className="btn" disabled>
              <RefreshCw size={14} className="spin" />
              İndiriliyor...
            </button>
          ) : (
            <button className="btn btn-primary" onClick={indirmeBaslat}>
              <Download size={14} />
              Kurulumu indir
            </button>
          )}

          {!hazir && !indiriliyor ? (
            <button className="btn btn-ghost" onClick={onKapat} title="Tarayıcıda aç">
              Tarayıcıda aç
            </button>
          ) : null}

          {indiriliyor && !kritik ? (
            <button className="btn btn-ghost" onClick={indirmeIptal}>
              İndirmeyi iptal et
            </button>
          ) : null}

          {/* ⛔ Normal sürümde "sonra" var — kritikte YOK */}
          {!kritik && !indiriliyor ? (
            <button className="btn" onClick={onKapat}>
              Sonra
            </button>
          ) : null}
        </div>

        {!hazir && veri.indirmeAdresi ? (
          <div className="text-dim text-sm" style={{ marginTop: 9, lineHeight: 1.5 }}>
            İndirme yapamazsan{' '}
            <button className="btn btn-ghost btn-sm" onClick={() => indir(true)}>
              GitHub sayfasından indir
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ================================================================ HOOK
/**
 * Güncelleme kontrolü + indirme yönetimi.
 *
 * ⛔ Otomatik indirme KURALI: normal sürümde indirme KULLANICIYA BAĞLI
 *    (düğmeye basınca). Kritik sürümde dosya kendiliğinden iner — ama
 *    indirmek programı YAVAŞLATMAZ, sadece disk ve ağ kullanır.
 *    Kurulum yine de kullanıcının kararıyla.
 */
export function useUpdateCheck(aktif = true) {
  const [veri, setVeri] = useState(null);
  const [acik, setAcik] = useState(false);
  const [indirme, setIndirme] = useState(null);
  const [kuruluyor, setKuruluyor] = useState(false);
  const [bosTespit, setBosTespit] = useState(false);
  const [bosSayac, setBosSayac] = useState(0);
  const soruldu = useRef(false);
  const sonHareket = useRef(Date.now());

  // ---- Kontrol
  const kontrolEt = useCallback(async () => {
    try {
      const res = await api.get('/update/check');
      const d = res.data;
      setVeri(d?.sonuc === 'guncelleme-var' ? d : null);
      // İndirme durumunu da tazele (geçen açılışta inmiş olabilir)
      const i = await api.get('/update/indirme').catch(() => null);
      if (i?.data) setIndirme(i.data);
      return d;
    } catch {
      return null;
    }
  }, []);

  // ---- Açılışta bir kez sor
  useEffect(() => {
    if (!aktif || soruldu.current) return undefined;
    soruldu.current = true;
    kontrolEt().then((d) => {
      // ⛔ Panel AÇILMAZ — sadece köşe rozeti belirir. Kullanıcı
      //    "işim var" diyordu; açılışta modal sıçraması istemiyoruz.
      if (d?.sonuc === 'guncelleme-var' && d.kritik) {
        setAcik(true); // kritikte görünür ol — gizlenirse unutulur
      }
    });
    return undefined;
  }, [aktif, kontrolEt]);

  // ---- ⛔ KRİTİKTE KENDİLİĞİNDEN İNDİR
  useEffect(() => {
    if (!veri?.kritik || veri.sonuc !== 'guncelleme-var') return;
    if (!veri.paketAdresi) return;
    if (indirme?.durum === 'indiriliyor' || indirme?.durum === 'hazir') return;
    api.post('/update/indir').then((r) => setIndirme(r.data)).catch(() => {});
  }, [veri, indirme]);

  // ---- İndirme ilerlemesini izle
  useEffect(() => {
    if (indirme?.durum !== 'indiriliyor') return undefined;
    const t = setInterval(() => {
      api.get('/update/indirme')
        .then((r) => {
          setIndirme(r.data);
          if (r.data?.durum !== 'indiriliyor') clearInterval(t);
        })
        .catch(() => {});
    }, 1200);
    return () => clearInterval(t);
  }, [indirme?.durum, indirme?.surum]);

  // ---- ⛔ BOŞTA ALGILAMA (yalnız kritik sürümde anlamlı)
  useEffect(() => {
    if (!veri?.kritik) { setBosTespit(false); return undefined; }

    const hareket = () => { sonHareket.current = Date.now(); setBosTespit(false); };
    const tikla = () => hareket();
    window.addEventListener('mousemove', hareket, { passive: true });
    window.addEventListener('mousedown', hareket, { passive: true });
    window.addEventListener('keydown', tikla, { passive: true });
    window.addEventListener('wheel', hareket, { passive: true });

    const sayac = setInterval(() => {
      const gecen = Math.floor((Date.now() - sonHareket.current) / 1000);
      setBosSayac(gecen);
      setBosTespit(gecen >= BOS_ESIK_SANIYE);
    }, 1000);

    return () => {
      window.removeEventListener('mousemove', hareket);
      window.removeEventListener('mousedown', hareket);
      window.removeEventListener('keydown', tikla);
      window.removeEventListener('wheel', hareket);
      clearInterval(sayac);
    };
  }, [veri?.kritik]);

  // ---- Eylemler
  const indir = useCallback(async (tarayiciya = false) => {
    if (tarayiciya && veri?.indirmeAdresi) {
      const bridge = typeof window !== 'undefined' ? window.veltron : null;
      if (bridge?.app?.openExternal) {
        await bridge.app.openExternal(veri.indirmeAdresi);
      } else {
        window.open(veri.indirmeAdresi, '_blank', 'noopener');
      }
      return;
    }
    try {
      const r = await api.post('/update/indir');
      setIndirme(r.data);
    } catch { /* sunucu kapalı */ }
  }, [veri]);

  const indirmeIptal = useCallback(async () => {
    try {
      const r = await api.post('/update/indirme/iptal');
      setIndirme(r.data);
    } catch { /* sunucu kapalı */ }
  }, []);

  /**
   * Kurulumu başlat. ⛔ Yalnızca dosya HAZIRSA ve kullanıcı İSTEDİYSE.
   * Program kapanır — veri diskte olduğu için kaybolmaz.
   */
  const kur = useCallback(async () => {
    setKuruluyor(true);
    try {
      const d = await api.get('/update/kurulum-dosyasi');
      const bridge = typeof window !== 'undefined' ? window.veltron : null;
      if (!bridge?.app?.guncelleKur) {
        setKuruluyor(false);
        return { ok: false, error: 'Bu program sürümünde kurulum başlatılamıyor.' };
      }
      const sonuc = await bridge.app.guncelleKur(d.data.dosya);
      // Program kapanıyorsa buraya dönülmez
      return sonuc;
    } catch (hata) {
      setKuruluyor(false);
      return { ok: false, error: hata.message };
    }
  }, []);

  return {
    veri, acik, setAcik, indirme, indirmeDurum: indirme,
    kuruluyor, bosTespit, bosSayac,
    kontrolEt, indir, indirmeIptal, kur,
  };
}

export default UpdatePanel;
