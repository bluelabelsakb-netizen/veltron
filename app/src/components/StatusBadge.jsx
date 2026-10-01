import { BadgeCheck, AlertCircle, Circle } from 'lucide-react';
import { statusLabel, statusTone } from '../lib/api.js';

/** Durum etiketi: noktali rozet + okunabilir metin. */
export function StatusBadge({ status, showDot = true, size }) {
  const tone = statusTone(status);
  return (
    <span className={`badge ${tone}`} style={size === 'sm' ? { fontSize: 11, padding: '1px 7px' } : undefined}>
      {showDot ? (
        tone === 'muted' ? (
          <Circle size={8} fill="currentColor" />
        ) : (
          <span className="badge-dot" />
        )
      ) : null}
      {statusLabel(status)}
    </span>
  );
}

export function PriorityBadge({ priority }) {
  if (!priority || priority === 'normal') {
    return <span className="text-dim text-sm">Normal</span>;
  }
  const tone = { low: 'muted', high: 'warning', urgent: 'danger' }[priority] || 'muted';
  return (
    <span className={`badge ${tone}`}>
      {priority === 'urgent' ? <AlertCircle size={10} /> : <BadgeCheck size={10} />}
      {statusLabel(priority)}
    </span>
  );
}

/** Sayisayil metinlerde satirlari hizalamak icin. */
export function Mono({ children, className = '' }) {
  return <span className={`mono ${className}`}>{children}</span>;
}
