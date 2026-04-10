interface BrandLogoProps {
  size?: 'sm' | 'md';
  className?: string;
}

export function BrandLogo({ size = 'md', className }: BrandLogoProps) {
  const iconSize = size === 'sm' ? 18 : 24;
  const textClass = size === 'sm' ? 'text-base font-bold' : 'text-lg font-bold';

  return (
    <div className={`flex items-center gap-2 ${className ?? ''}`}>
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 32 32"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <rect width="32" height="32" rx="6" fill="#000000" />
        <polyline points="5,24 10,18 14,21 20,12 27,5" fill="none" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points="23,5 27,5 27,9" fill="none" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className={`text-foreground ${textClass}`}>DeepStock</span>
    </div>
  );
}
