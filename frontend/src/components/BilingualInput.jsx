/**
 * BilingualInput Component
 * 
 * Input field with bilingual label (English + Urdu)
 */

import React from 'react';
import BilingualLabel from './BilingualLabel';

const BilingualInput = ({
  en = '',
  ur = '',
  placeholder = '',
  value = '',
  onChange = () => {},
  type = 'text',
  disabled = false,
  error = null,
  required = false,
  icon = null,
  className = '',
  ...props
}) => {
  return (
    <div className="bilingual-input-group w-full">
      {(en || ur) && (
        <BilingualLabel
          en={en}
          ur={ur}
          size="md"
          className="mb-2"
          bold={true}
        />
      )}

      <div className="relative">
        {icon && (
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
            {icon}
          </div>
        )}

        <input
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 ${icon ? 'pl-10' : ''} ${className}`}
          {...props}
        />
      </div>

      {error && (
        <div className="text-red-600 text-sm mt-2" style={{ fontFamily: "'Noto Nastaliq Urdu', serif" }}>
          {error}
        </div>
      )}

      {required && !error && (
        <div className="text-gray-500 text-xs mt-1">* {en ? 'Required' : 'ضروری'}</div>
      )}
    </div>
  );
};

export default BilingualInput;
