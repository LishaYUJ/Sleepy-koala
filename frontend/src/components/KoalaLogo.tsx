import React from 'react';

// Share the current brand image across landing, authentication, and navigation.
export const KoalaLogo: React.FC<{ className?: string, style?: React.CSSProperties }> = ({ className, style }) => (
  <img
    src="/icons/sleepy-koala-app-icon.png?v=2"
    alt=""
    aria-hidden="true"
    className={className}
    style={{ objectFit: 'contain', flexShrink: 0, ...style }}
  />
);
