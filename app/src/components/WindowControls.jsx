/**
 * PENCERE DÜĞMELERİ
 * =================
 * Çerçevesiz pencerede (main.mjs → `frame: false`) küçült / büyüt / kapat.
 *
 * ⛔ NEDEN PAYLAŞILAN BİR BİLEŞEN?
 *   Bu düğmeler `Layout.jsx` içinde yazılıydı. Ama pencere ÇERÇEVESİZ
 *   olduğu için düğmeler sadece Layout varken görünüyordu; giriş
 *   ekranında (sunucu kapalıyken açılan ekran) hiç görünmüyordu.
 *   Kullanıcı Alt+F4 dışında pencereyi kapatamıyordu.
 *
 *   Aynı kod iki yerde kopyalanırsa bir daha unutulur. Tek yer olsun.
 *
 * ⛔ `bridge` YOKSA HİÇBİR ŞEY ÇİZİLMEZ. Tarayıcıda (vite dev) veya
 *   preload yüklenememişse `window.veltron` undefined olur; o durumda
 *   düğmeler boşluk bırakmasın diye hiç render edilmez.
 */
import { useState } from 'react';
import { Minus, Square, X } from 'lucide-react';

const bridge = typeof window !== 'undefined' ? window.veltron : null;

export function WindowControls() {
  const [maximized, setMaximized] = useState(false);

  if (!bridge) return null;

  return (
    <div className="win-controls">
      <button className="win-btn" onClick={() => bridge.window.minimize()} title="Küçült" aria-label="Küçült">
        <Minus size={14} />
      </button>
      <button
        className="win-btn"
        onClick={async () => setMaximized(await bridge.window.maximize())}
        title={maximized ? 'Geri al' : 'Büyüt'}
        aria-label={maximized ? 'Geri al' : 'Büyüt'}
      >
        {/* Geri al (maksimumdayken) ikonu: iki köşeli çerçeve */}
        <Square size={12} style={maximized ? { opacity: 0.55 } : undefined} />
      </button>
      <button className="win-btn close" onClick={() => bridge.window.close()} title="Kapat" aria-label="Kapat">
        <X size={15} />
      </button>
    </div>
  );
}

export default WindowControls;
