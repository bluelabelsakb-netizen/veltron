/**
 * GÜNCELLEME BİLDİRİMİ (2 Ekim 2026)
 * =====================================
 * Program açıldığında "daha yeni sürüm var mı?" diye sorar.
 *
 * ⛔ DİNDİRME YOK. Kullanıcının tercihi:
 *    - "Yeni sürümü indir"  → kurulum sayfası tarayıcıda açılır
 *    - "Eski sürümden devam et" → hiçbir şey olmaz, program çalışır
 *
 * ⛔ İNTERNET YOKSA SESSİZ: sunucu hata döner, bildirim açılmaz. Açılış
 *    hiçbir koşulda engellenmez.
 */
import { useEffect, useRef, useState } from 'react';
import { Download, X, RefreshCw, Sparkles } from 'lucide-react';
import { api, dateFmt } from '../lib/api.js';

export function UpdateBanner({ visible, veri, onKapat, indiriliyor, indir }) {
  if (!visible || !veri) return null;

  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        right: 18,
        bottom: 18,
        zIndex: 300,
        width: 372,
        maxWidth: 'calc(100vw - 36px)',
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-strong)',
        borderRadius: 'var(--radius)',
        boxShadow: 'var(--shadow-lg)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '13px 15px',
          background: 'linear-gradient(135deg, var(--primary), var(--purple))',
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          color: '#fff',
        }}
      >
        <Sparkles size={17} style={{ flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700 }}>Yeni sürüm hazır</div>
          <div style={{ fontSize: 11.5, opacity: 0.92 }}>
            {veri.yeni} sürümü yayımlandı (şu anki: {veri.mevcut})
          </div>
        </div>
        <button
          className="btn btn-ghost btn-icon"
          onClick={onKapat}
          aria-label="Kapat"
          style={{ color: '#fff', width: 26, height: 26 }}
        >
          <X size={14} />
        </button>
      </div>

      <div style={{ padding: '13px 15px' }}>
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
              maxHeight: 96,
              overflowY: 'auto',
              whiteSpace: 'pre-wrap',
              color: 'var(--text-muted)',
              lineHeight: 1.5,
            }}
          >
            {veri.notlar}
          </div>
        ) : null}

        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn-primary" onClick={indir} disabled={indiriliyor}>
            {indiriliyor ? <RefreshCw size={14} className="spin" /> : <Download size={14} />}
            {indiriliyor ? 'Açılıyor...' : 'Yeni sürümü indir'}
          </button>
          <button className="btn" onClick={onKapat} disabled={indiriliyor}>
            Eski sürümden devam et
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Açılışta bir kez sürüm kontrolü yapar.
 * @returns {{visible, veri, kapat, indir, indiriliyor, kontrolEt}}
 */
export function useUpdateCheck(aktif = true) {
  const [veri, setVeri] = useState(null);
  const [visible, setVisible] = useState(false);
  const [indiriliyor, setIndiriliyor] = useState(false);
  const soruldu = useRef(false);

  useEffect(() => {
    if (!aktif || soruldu.current) return;
    soruldu.current = true;

    (async () => {
      try {
        const res = await api.get('/update/check');
        const d = res.data;
        // yalnızca gerçekten yeni sürüm varsa göster
        if (d?.sonuc === 'guncelleme-var') {
          setVeri(d);
          setVisible(true);
        }
      } catch {
        /* sunucu kapalı / internet yok — sessiz geç */
      }
    })();
  }, [aktif]);

  const indir = async () => {
    if (!veri?.indirmeAdresi) return;
    setIndiriliyor(true);
    try {
      const bridge = typeof window !== 'undefined' ? window.veltron : null;
      if (bridge?.app?.openExternal) {
        await bridge.app.openExternal(veri.indirmeAdresi);
      } else {
        window.open(veri.indirmeAdresi, '_blank', 'noopener');
      }
      setVisible(false);
    } catch {
      window.open(veri.indirmeAdresi, '_blank', 'noopener');
    } finally {
      setIndiriliyor(false);
    }
  };

  return {
    visible,
    veri,
    indiriliyor,
    indir,
    kapat: () => setVisible(false),
    /** Ayarlar > Güncelleme için elle kontrol */
    kontrolEt: async () => {
      try {
        const res = await api.get('/update/check');
        const d = res.data;
        setVeri(d);
        if (d?.sonuc === 'guncelleme-var') setVisible(true);
        return d;
      } catch (e) {
        return { sonuc: 'hata', mesaj: e.message };
      }
    },
  };
}

export default UpdateBanner;