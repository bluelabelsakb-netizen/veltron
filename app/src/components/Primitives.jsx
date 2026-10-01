import { Inbox } from 'lucide-react';
import { money, moneyOkunur } from '../lib/api.js';

/** Kayit yokken gosterilen bilgilendirme. */
export function EmptyState({ icon: Icon = Inbox, title = 'Kayıt bulunamadı', description, action, compact = false }) {
  return (
    <div className="empty" style={compact ? { padding: '28px 20px' } : undefined}>
      <Icon className="empty-icon" size={compact ? 30 : 42} strokeWidth={1.4} />
      <h3>{title}</h3>
      {description ? <p>{description}</p> : null}
      {action}
    </div>
  );
}

export function Loading({ label = 'Yükleniyor...' }) {
  return (
    <div className="loading-page">
      <div className="spinner lg" />
      <div className="text-sm">{label}</div>
    </div>
  );
}

/**
 * Koyu temali ipucu (tooltip).
 *
 * NEDEN VAR: HTML'in `title` ozelligi tarayicinin kendi kutusunu cizer —
 * beyaz arka planli, kirpilan metni gosterir. Koyu temada parlak beyaz
 * kutu beliriyordu. Bunun yerine tema kendi kutusunu kullanir.
 *
 * KULLANIM: <Tip text="Tam ad"><span className="bar-label">Kisaltilmis</span></Tip>
 */
export function Tip({ text, children }) {
  if (!text) return children;
  return (
    <span className="tip">
      {children}
      <span className="tip-bubble">{text}</span>
    </span>
  );
}

/** Sayfa ici kucuk yukleme gostergesi (tabloyu degistirmeden). */
export function InlineLoading() {
  return <span className="spinner" aria-label="Yükleniyor" />;
}

/**
 * Basit KPI karti.
 * @param {{label:string, value:React.ReactNode, sub?:string, color?:string, icon?:React.Component}} props
 */
export function Kpi({ label, value, sub, color = 'var(--primary)', icon: Icon, onClick, small }) {
  const style = { '--kpi-color': color };
  if (onClick) {
    return (
      <button className="kpi" style={{ ...style, textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit' }} onClick={onClick}>
        <KpiBody {...{ label, value, sub, color, Icon, small }} />
      </button>
    );
  }
  return (
    <div className="kpi" style={style}>
      <KpiBody {...{ label, value, sub, color, Icon, small }} />
    </div>
  );
}

function KpiBody({ label, value, sub, color, Icon, small }) {
  return (
    <>
      <div className="kpi-top">
        <span className="kpi-label">{label}</span>
        {Icon ? (
          <span className="kpi-icon">
            <Icon size={16} />
          </span>
        ) : null}
      </div>
      <div className={`kpi-value ${small ? 'sm' : ''}`} style={{ color }}>
        {value}
      </div>
      {sub ? <div className="kpi-sub">{sub}</div> : null}
    </>
  );
}

/**
 * PARA GOSTEREN KPI KARTI — okunur rakam + tam rakam.
 *
 * Kullanici istegi: buyuk tutarlar "1 milyon 320 bin" seklinde okunsun.
 * ("1.320.000,00" rakamlar tek tek saymak zor.)
 *
 * IKI BASAMAK GOSTERILIR:
 *   buyuk  -> "1 milyon 320 bin ₺"   (bakista okunur)
 *   altta  -> "1.320.000,00 ₺"       (kesin rakam, kayip yok)
 *
 * "Tam rakam zaten ayniysa" (orn. 5.430,50) alt satir TEKRARLANMAZ — kart
 * tek satira düşer, gereksiz gürültü olmaz.
 *
 * Kullanim:
 *   <KpiMoney label="Toplam satış" value={s?.revenue} color="#3b82f6" icon={TrendingUp} small />
 *
 * Excel/PDF ciktisinda KULLANMA — orada kaynak deger yazilir.
 */
export function KpiMoney({
  label,
  value,
  color = 'var(--primary)',
  icon: Icon,
  sub,
  sembol = '₺',
  small,
  onClick,
}) {
  const n = Number(value || 0);
  const okunur = moneyOkunur(n, sembol);
  const tam = money(n, true, sembol);

  // Ayni metinse (kucuk rakamlar) alt satir tekrar edilmez.
  const ayni = okunur === tam;

  const alt = ayni ? sub : (
    <>
      <span style={{ opacity: 0.85 }}>{tam}</span>
      {sub ? <span> · {sub}</span> : null}
    </>
  );

  return <Kpi {...{ label, value: okunur, sub: alt, color, icon: Icon, onClick, small }} />;
}

/** Sayfa basligi + aksiyon alani. */
export function PageHeader({ title, description, actions, badge }) {
  return (
    <div className="page-head">
      <div className="page-head-text">
        <h1>
          {title} {badge}
        </h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="page-head-actions">{actions}</div> : null}
    </div>
  );
}
