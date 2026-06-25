/**
 * BilingualAlert Component
 * 
 * Alert/notification with bilingual messages
 * Used for success, error, warning, and info messages
 */

import React, { useEffect, useState } from 'react';

const BilingualAlert = ({
  en = '',
  ur = '',
  type = 'info', // success, error, warning, info
  icon = null,
  onClose = null,
  autoClose = true,
  duration = 5000,
  className = '',
}) => {
  const [show, setShow] = useState(true);

  useEffect(() => {
    if (autoClose) {
      const timer = setTimeout(() => {
        setShow(false);
        onClose?.();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [autoClose, duration, onClose]);

  if (!show) return null;

  // Type-specific styles
  const typeClasses = {
    success: 'bg-green-50 border-green-200 text-green-800',
    error: 'bg-red-50 border-red-200 text-red-800',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800',
  };

  // Icons
  const defaultIcons = {
    success: '✓',
    error: '✕',
    warning: '!',
    info: 'ℹ',
  };

  return (
    <div
      className={`
        bilingual-alert
        ${typeClasses[type]}
        border border-l-4
        p-4 rounded-lg
        flex items-start gap-3
        ${className}
      `}
      role="alert"
    >
      {/* Icon */}
      <div className="flex-shrink-0 text-xl font-bold">
        {icon || defaultIcons[type]}
      </div>

      {/* Content */}
      <div className="flex-1">
        {en && (
          <div className="text-sm font-medium en-text">
            {en}
          </div>
        )}
        {ur && (
          <div
            className="text-base ur-text"
            dir="rtl"
            style={{
              fontFamily: "'Noto Nastaliq Urdu', serif",
              marginTop: en ? '4px' : '0',
            }}
          >
            {ur}
          </div>
        )}
      </div>

      {/* Close Button */}
      {onClose && (
        <button
          onClick={() => {
            setShow(false);
            onClose();
          }}
          className="flex-shrink-0 text-lg font-bold opacity-70 hover:opacity-100 transition-opacity"
          aria-label="Close alert"
        >
          ×
        </button>
      )}
    </div>
  );
};

export default BilingualAlert;
