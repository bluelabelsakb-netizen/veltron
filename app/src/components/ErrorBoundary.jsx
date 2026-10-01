/**
 * HATA SINIRI
 * ==========
 * Bir ekranda hata olursa TUM UYGULAMA kararmak yerine sadece o alan
 * düşer ve kullanıcı ne olduğunu, nereye bildireceğini görür.
 *
 * NEDEN VAR?
 * React.lazy ile yüklenen bir bileşende "default export" unutulursa
 * (veya benzeri bir hata) ekran TAMAMEN boş/siyah kalır ve kullanıcı
 * nedenini anlamaz. Bu sınır o durumu yakalar.
 *
 * KAPSAM — ONEMLI:
 * Bu sınır `App`'in EN DISINDA olmalidir (`main.jsx`). Daha once yalnizca
 * personel dalinin icine sarilmisken, musteri portalinda olusan hata
 * yakalanamiyor ve ekran yine BOS kaliyordu. Sinir her zaman disarida
 * dursun: musteri ekrani dahil, her yer korunsun.
 */
import { Component } from 'react';
import { AlertTriangle, RefreshCw, ChevronDown, Bug } from 'lucide-react';

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hata: null, bilgiAcik: false };
  }

  static getDerivedStateFromError(hata) {
    return { hata };
  }

  componentDidCatch(hata, bilgi) {
    // Konsola yaz ki geliştirici görebilsin
    console.error('[Veltron] Arayuz hatasi:', hata, bilgi);
  }

  sifirla = () => this.setState({ hata: null, bilgiAcik: false });

  render() {
    const { hata, bilgiAcik } = this.state;
    if (!hata) return this.props.children;

    return (
      <div className="error-screen">
        <div className="error-card">
          <div className="error-icon">
            <AlertTriangle size={26} />
          </div>

          <h2>Bir ekranda sorun oluştu</h2>
          <p className="text-dim">
            Verileriniz etkilenmedi, kayıtlı. Aşağıdaki düğmeyle tekrar deneyebilirsiniz.
            Sorun devam ederse sunucuyu kapatıp yeniden başlatın.
          </p>

          <div className="row mt-14" style={{ gap: 9 }}>
            <button className="btn btn-primary" onClick={this.sifirla}>
              <RefreshCw size={14} />
              Tekrar dene
            </button>
            <button className="btn" onClick={() => this.setState({ bilgiAcik: !bilgiAcik })}>
              <Bug size={14} />
              {bilgiAcik ? 'Gizle' : 'Teknik bilgi'}
              <ChevronDown
                size={13}
                style={{ transform: bilgiAcik ? 'rotate(180deg)' : 'none', transition: '0.15s' }}
              />
            </button>
          </div>

          {bilgiAcik ? (
            <pre className="error-detail">
              {String(hata?.stack || hata?.message || hata)}
            </pre>
          ) : null}
        </div>
      </div>
    );
  }
}
