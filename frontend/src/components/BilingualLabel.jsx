/**
 * BilingualLabel Component
 * 
 * Displays bilingual labels with English (top, small) and Urdu (bottom, large, RTL)
 * This is the core component for the non-technical shopkeeper UI
 */

import React from 'react';

const BilingualLabel = ({
  en = '',
  ur = '',
  className = '',
  size = 'md',
  align = 'center',
  color = 'text-gray-700',
  bold = false,
  onClick = null,
}) => {
  // Size configurations
  const sizeClasses = {
    sm: 'en-text-xs ur-text-sm',
    md: 'en-text-sm ur-text-base',
    lg: 'en-text-base ur-text-lg',
    xl: 'en-text-lg ur-text-2xl',
    '2xl': 'en-text-xl ur-text-4xl',
  };

  const alignClasses = {
    left: 'text-left',
    center: 'text-center',
    right: 'text-right',
  };

  const boldClass = bold ? 'font-semibold' : 'font-normal';

  return (
    <div
      className={`bilingual-label ${sizeClasses[size]} ${alignClasses[align]} ${color} ${boldClass} ${className}`}
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      {/* English Label - Small, Top */}
      {en && (
        <div className="en-label en-text block leading-tight">
          {en}
        </div>
      )}

      {/* Urdu Label - Large, Bottom, RTL */}
      {ur && (
        <div
          className="ur-label ur-text block leading-relaxed"
          dir="rtl"
          style={{
            fontFamily: "'Noto Nastaliq Urdu', serif",
            fontWeight: bold ? '600' : '400',
            marginTop: en ? '4px' : '0',
          }}
        >
          {ur}
        </div>
      )}
    </div>
  );
};

export default BilingualLabel;
