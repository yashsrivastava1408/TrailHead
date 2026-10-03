import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Loader2, XCircle } from 'lucide-react';

const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Counts up to `value` once on mount, and eases to new values after that. */
export function CountUp({ value, suffix = '', duration = 900 }) {
  const [shown, setShown] = useState(prefersReducedMotion() ? value : 0);
  const from = useRef(0);

  useEffect(() => {
    if (typeof value !== 'number') return undefined;
    if (prefersReducedMotion()) { setShown(value); return undefined; }
    const start = performance.now();
    const origin = from.current;
    let frame;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      setShown(Math.round(origin + (value - origin) * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
      else from.current = value;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);

  return <>{typeof value === 'number' ? shown : value}{suffix}</>;
}

export const Card = ({ className = '', children, ...rest }) => (
  <section className={`card ${className}`} {...rest}>{children}</section>
);

export const Stat = ({ icon: Icon, label, value, suffix = '', hint, index = 0 }) => (
  <div className="card stat lift reveal" style={{ '--i': index }}>
    <div className="label">{Icon && <Icon size={16} />} {label}</div>
    <div className="value"><CountUp value={value} suffix={suffix} /></div>
    {hint && <div className="hint">{hint}</div>}
  </div>
);

export const Bar = ({ value, tone = '' }) => (
  <div className={`bar ${tone}`} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
    <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
  </div>
);

/** Circular progress with the number in the middle. */
export function Ring({ value, size = 64, stroke = 6 }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.max(0, Math.min(100, value)) / 100);
  return (
    <div className="ring-wrap" style={{ width: size, height: size }} role="img" aria-label={`${value} percent`}>
      <svg width={size} height={size}>
        <defs>
          <linearGradient id="ring-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--accent)" />
            <stop offset="100%" stopColor="var(--accent-2)" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        <circle className="ring-fg" cx={size / 2} cy={size / 2} r={r} fill="none" stroke="url(#ring-grad)" strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset} style={{ '--circ': circ }} />
      </svg>
      <span className="ring-value"><CountUp value={value} suffix="%" /></span>
    </div>
  );
}

export const Chip = ({ tone = '', children }) => <span className={`chip ${tone}`}>{children}</span>;

export const Banner = ({ tone = 'warn', title, children }) => (
  <div className={`banner ${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
    {tone === 'error' ? <XCircle size={18} color="var(--red)" /> : <AlertTriangle size={18} color="var(--amber)" />}
    <div>
      {title && <strong>{title}</strong>}
      <div className="small" style={{ marginTop: 2 }}>{children}</div>
    </div>
  </div>
);

export const Spinner = ({ label }) => (
  <span className="row small" style={{ color: 'var(--accent)', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: '10px' }}>
    <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--accent)', boxShadow: '0 0 12px 2px var(--accent)', animation: 'pulse 1.5s ease-in-out infinite' }} />
    {label}
  </span>
);

/** Placeholder block shown while content loads. */
export const Skeleton = ({ height = 20, width = '100%', style }) => (
  <div className="skeleton" style={{ height, width, ...style }} aria-hidden="true" />
);

export const PageHead = ({ step, title, subtitle, children }) => (
  <header className="page-head">
    <div>
      {step && <span className="eyebrow-text">{step}</span>}
      <h1>{title}</h1>
      {subtitle && <p>{subtitle}</p>}
    </div>
    {children}
  </header>
);

export const Empty = ({ title, text, children }) => (
  <Card className="empty">
    <h2>{title}</h2>
    <p>{text}</p>
    {children}
  </Card>
);
