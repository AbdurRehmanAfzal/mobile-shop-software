/**
 * BilingualButton Component
 * 
 * Button with bilingual labels (English + Urdu)
 * Big, clear, easy for non-technical users
 */

import React from 'react';
import BilingualLabel from './BilingualLabel';

const BilingualButton = ({
  en = 'Button',
  ur = 'بٹن',
  onClick = () => {},
  variant = 'primary',
  size = 'lg',
  disabled = false,
  icon = null,
  className = '',
  fullWidth = false,
  loading = false,
}) => {
  // Variant styles
  const variantClasses = {
    primary: 'bg-blue-600 hover:bg-blue-700 text-white',
    secondary: 'bg-gray-300 hover:bg-gray-400 text-gray-900',
    success: 'bg-green-600 hover:bg-green-700 text-white',
    danger: 'bg-red-600 hover:bg-red-700 text-white',
    warning: 'bg-yellow-500 hover:bg-yellow-600 text-white',
  };

  // Size styles
  const sizeClasses = {
    sm: 'px-3 py-2 rounded-md',
    md: 'px-4 py-3 rounded-lg',
    lg: 'px-6 py-4 rounded-lg',
    xl: 'px-8 py-5 rounded-xl',
  };

  const widthClass = fullWidth ? 'w-full' : '';
  const disabledClass = disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer transition-colors';

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`
        bilingual-button
        ${variantClasses[variant]}
        ${sizeClasses[size]}
        ${widthClass}
        ${disabledClass}
        flex items-center justify-center gap-3
        font-medium
        focus:outline-none focus:ring-2 focus:ring-offset-2
        ${className}
      `}
    >
      {loading ? (
        <svg
          className="animate-spin h-5 w-5"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      ) : icon ? (
        <span className="text-xl">{icon}</span>
      ) : null}

      <BilingualLabel
        en={en}
        ur={ur}
        size={size === 'xl' ? '2xl' : size === 'lg' ? 'lg' : 'md'}
        color="inherit"
        bold={true}
      />
    </button>
  );
};

export default BilingualButton;
