/**
 * DESTEK ÖZETİ — giriş ekranından açılan küçük pencere
 * ====================================================
 * Giriş yapılamıyorsa kullanıcı buradan sistem bilgisini görür ve sorun
 * bildirir. Oturum GEREKMEZ, bu yüzden giriş ekranından çağrılabilir.
 *
 * ⛔ API: /api/support/bilgi jetonsuz çalışır (routes/index.js'te global
 *    authenticate'ten ÖNCE kayıtlı). /api/support/bildir de oturum istemez.
 *
 * ⛔ DestekOzeti kendi fetch'ini kullanır, `api` helper'ını DEĞİL — çünkü
 *    `api` jetonu zorunlu tutuyor ve burada jeton olmayabilir.
 */
import { useCallback, useEffect, useState } from 'react';
import { Send, Copy, CheckCircle2, AlertTriangle, ChevronRight, ChevronDown } from 'lucide-react';
import { getServerUrl } from '../lib/api.js';
import { useToast } from './Toast.jsx';

/** Sık karşılaşılan sorunlar — düz Türkçe, kullanıcının kendi cümlesiyle. */
const SIK_SORUNLAR = [
  {
    soru: '"Sunucuya ulaşılamıyor" diyor',
    cevap:
      'Sunucu görevi çalışmıyor.\n' +
      'PowerShell\'i açıp şunu yazın:\n' +
      '    schtasks /Run /TN "Veltron Sunucu"\n\n' +
      '10 saniye bekleyip tekrar deneyin.',
  },
  {
    soru: 'Program açılıyor ama siyah ekran',
    cevap: 'Arayüz sunucudan yüklenir. Sunucu kapalıyken siyah ekran normaldir. Önce sunucuyu başlatın.',
  },
  {
    soru: 'Şifremi unuttum',
    cevap:
      'Giriş ekranındaki "Şifremi unuttum" bağlantısını kullanın — talep yöneticinize gider.',
  },
  {
    soru: 'Program hiç açılmıyor',
    cevap:
      'Bilgisayarı yeniden başlatın.\n' +
      'Yine açılmazsa masaüstündeki Veltron simgesine sağ tıklayıp\n' +
      '"Yönetici olarak çalıştır" seçin.',
  },
  {
    soru: 'Fatura e-posta gönderilmiyor',
    cevap:
      'PDF indirme düğmesi her zaman çalışır — dosyayı indirip kendiniz gönderebilirsiniz.\n' +
      'Otomatik gönderim için e-posta hesabı kurulmuş olmalı (Ayarlar > E-posta).',
  },
];

export function DestekOzeti() {
  const toast = useToast();
  const [bilgi, setBilgi] = useState(null);
  const [baslik, setBaslik] = useState('');
  const [aciklama, setAciklama] = useState('');
  const [hataMesaji, setHataMesaji] = useState('');
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [gonderildi, setGonderildi] = useState(false);
  const [acikSoru, setAcikSoru] = useState(null);

  const yukle = useCallback(async () => {
    try {
      const r = await fetch(`${getServerUrl()}/api/support/bilgi`);
      if (r.ok) setBilgi((await r.json()).data);
    } catch {
      // Sunucuya ulaşılamıyor — zaten bu ekranın amacı o durumu göstermek
      setBilgi(null);
    }
  }, []);

  useEffect(() => {
    yukle();
  }, [yukle]);

  const gonder = async (e) => {
    e.preventDefault();
    if (baslik.trim().length < 3) {
      toast.error('Konu gerekli', 'En az 3 karakter yazın.');
      return;
    }
    setGonderiliyor(true);
    try {
      const token = localStorage.getItem('veltron.token');
      const r = await fetch(`${getServerUrl()}/api/support/bildir`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          kategori: 'hata_bildirimi',
          baslik: baslik.trim(),
          aciklama: aciklama.trim(),
          sayfa: 'giris-ekrani',
          hata_mesaj: hataMesaji.trim(),
        }),
      });
      if (!r.ok) throw new Error(`Sunucu ${r.status} — sunucu kapalı olabilir`);
      setGonderildi(true);
      setBaslik('');
      setAciklama('');
      setHataMesaji('');
      toast.success('Bildiriminiz alındı', 'Yönetici inceleyecek.');
    } catch (err) {
      toast.fromError(err, 'Gönderilemedi', 'Sunucu kapalıysa bildirim kaydedilemez.');
    } finally {
      setGonderiliyor(false);
    }
  };

  const bilgiKopyala = () => {
    if (!bilgi) return;
    navigator.clipboard
      ?.writeText(
        [
          `Uygulama : ${bilgi.uygulama.ad} ${bilgi.uygulama.surum}`,
          `Node     : ${bilgi.sunucu.node}`,
          `Sistem   : ${bilgi.sunucu.platform} (${bilgi.sunucu.mimari})`,
          `Donanım  : ${bilgi.sunucu.cekirdek} çekirdek / ${bilgi.sunucu.ramGbit} GB`,
        ].join('\n')
      )
      .then(() => toast.success('Bilgiler kopyalandı'))
      .catch(() => toast.error('Kopyalanamadı'));
  };

  return (
    <div>
      {/* ---------- Sunucu durumu ---------- */}
      {bilgi ? (
        <div className="alert success" style={{ marginBottom: 14 }}>
          <CheckCircle2 size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <strong>Sunucu çalışıyor.</strong>
            <div style={{ marginTop: 3, fontSize: 12 }}>
              {bilgi.uygulama.ad} {bilgi.uygulama.surum} · Node {bilgi.sunucu.node} ·{' '}
              {bilgi.sunucu.platform}
            </div>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={bilgiKopyala} title="Bilgileri kopyala">
            <Copy size={13} />
          </button>
        </div>
      ) : (
        <div className="alert warning" style={{ marginBottom: 14 }}>
          <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <strong>Sunucuya ulaşılamıyor.</strong>
            <div style={{ marginTop: 4, fontSize: 12.5, lineHeight: 1.6 }}>
              PowerShell'i açıp şunu yazın:
              <br />
              <code className="mono">schtasks /Run /TN "Veltron Sunucu"</code>
              <br />
              Sonra bu pencereyi kapatıp tekrar giriş yapın.
            </div>
          </div>
        </div>
      )}

      {/* ---------- Sık sorunlar ---------- */}
      <div className="field-label" style={{ marginBottom: 4 }}>
        Sık karşılaşılan sorunlar
      </div>
      <div style={{ borderTop: '1px solid var(--border-subtle)', marginBottom: 16 }}>
        {SIK_SORUNLAR.map((s, i) => (
          <div key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <button
              type="button"
              onClick={() => setAcikSoru(acikSoru === i ? null : i)}
              className="row"
              style={{
                width: '100%',
                background: 'none',
                border: 'none',
                padding: '9px 0',
                cursor: 'pointer',
                textAlign: 'left',
                color: 'var(--text)',
                fontSize: 12.5,
                gap: 6,
              }}
            >
              {acikSoru === i ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <span style={{ fontWeight: 500 }}>{s.soru}</span>
            </button>
            {acikSoru === i ? (
              <div
                style={{
                  padding: '0 0 11px 20px',
                  fontSize: 12,
                  color: 'var(--text-muted)',
                  lineHeight: 1.65,
                  whiteSpace: 'pre-line',
                }}
              >
                {s.cevap}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {/* ---------- Bildirim ---------- */}
      {gonderildi ? (
        <div className="alert success">
          <CheckCircle2 size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <strong>Bildiriminiz alındı.</strong>
            <div style={{ marginTop: 3, fontSize: 12 }}>Yönetici inceleyecek.</div>
            <button
              type="button"
              className="btn btn-sm"
              style={{ marginTop: 9 }}
              onClick={() => setGonderildi(false)}
            >
              Yeni bildirim
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={gonder}>
          <div className="field-label" style={{ marginBottom: 6 }}>
            Sorun bildir
          </div>
          <div className="field mb-14">
            <label className="field-label" htmlFor="d-bashlik">
              Konu <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <input
              id="d-bashlik"
              className="input"
              value={baslik}
              onChange={(e) => setBaslik(e.target.value)}
              placeholder="Örn: Giriş yapamıyorum"
              maxLength={150}
            />
          </div>
          <div className="field mb-14">
            <label className="field-label" htmlFor="d-aciklama">
              Açıklama
            </label>
            <textarea
              id="d-aciklama"
              className="input"
              rows={3}
              value={aciklama}
              onChange={(e) => setAciklama(e.target.value)}
              placeholder="Ne oldu? Ekran görüntüsü varsa dosyayı USB'ye kopyalayıp yazabilirsiniz."
              maxLength={4000}
            />
          </div>
          <div className="field mb-14">
            <label className="field-label" htmlFor="d-hata">
              Ekranda yazan hata mesajı
            </label>
            <input
              id="d-hata"
              className="input"
              value={hataMesaji}
              onChange={(e) => setHataMesaji(e.target.value)}
              placeholder="Yoksa boş bırakın"
              maxLength={2000}
            />
          </div>
          <div className="field-hint" style={{ marginBottom: 12, lineHeight: 1.6 }}>
            ⛔ <strong>Güvenlik:</strong> Yazdıklarınız otomatik taranır; şifre, kart
            numarası gibi bilgiler <code>[GIZLI]</code> olarak maskelenir.
          </div>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button type="submit" className="btn btn-primary" disabled={gonderiliyor}>
              <Send size={14} />
              {gonderiliyor ? 'Gönderiliyor...' : 'Gönder'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default DestekOzeti;
