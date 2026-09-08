// Small line-style icons for the KPI tiles - hand-authored (a handful of
// simple, common glyphs), not worth pulling in an icon library for.
type IconProps = { className?: string };

const shared = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export function IconTrendUp({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} {...shared}>
      <path d="M2.5 14.5l5-5.5 3.5 3 6-7" />
      <path d="M13 4.5h4v4" />
    </svg>
  );
}

export function IconBanknote({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} {...shared}>
      <rect x="2" y="5" width="16" height="10" rx="1.5" />
      <circle cx="10" cy="10" r="2.2" />
      <path d="M4.5 5v10M15.5 5v10" strokeWidth="1.2" opacity="0.6" />
    </svg>
  );
}

export function IconTrophy({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} {...shared}>
      <path d="M6 3h8v5a4 4 0 0 1-8 0V3z" />
      <path d="M6 4H3.5a2 2 0 0 0 2 3.5M14 4h2.5a2 2 0 0 1-2 3.5" />
      <path d="M10 12v3M7 17h6M8.5 15h3" />
    </svg>
  );
}

export function IconClock({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} {...shared}>
      <circle cx="10" cy="10" r="7.5" />
      <path d="M10 6v4l3 2" />
    </svg>
  );
}

export function IconDocument({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} {...shared}>
      <path d="M5 2.5h6.5L15 6v11.5H5V2.5z" />
      <path d="M11.5 2.5V6H15" />
      <path d="M7.2 10h5.6M7.2 13h5.6" strokeWidth="1.2" opacity="0.6" />
    </svg>
  );
}

export function IconUsers({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} {...shared}>
      <circle cx="7.5" cy="7" r="2.6" />
      <path d="M2.5 17c0-3 2.2-5 5-5s5 2 5 5" />
      <circle cx="14.5" cy="8" r="2" opacity="0.7" />
      <path d="M13 12.2c1.9 0.3 3.5 1.9 3.5 4.8" opacity="0.7" />
    </svg>
  );
}

export function IconEye({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} {...shared}>
      <path d="M2 10s2.8-5.5 8-5.5S18 10 18 10s-2.8 5.5-8 5.5S2 10 2 10z" />
      <circle cx="10" cy="10" r="2.2" />
    </svg>
  );
}
