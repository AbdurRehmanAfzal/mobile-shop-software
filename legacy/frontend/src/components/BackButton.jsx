/**
 * BackButton Component
 *
 * Bilingual back button with arrow icon
 * Allows users to navigate back to the previous page
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import BilingualLabel from './BilingualLabel';

const BackButton = ({
  fallbackPath = '/',  // If no history, go to home
  className = '',
}) => {
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const isRTL = i18n.language === 'ur';

  const handleBack = () => {
    // Try to go back
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      // If no history, go to fallback path (usually home)
      navigate(fallbackPath);
    }
  };

  return (
    <button
      onClick={handleBack}
      className={`
        back-button
        inline-flex items-center gap-2
        px-4 py-2
        text-gray-700 hover:text-gray-900
        hover:bg-gray-100
        rounded-lg
        transition-colors
        font-medium
        focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
        ${className}
      `}
      aria-label={isRTL ? 'واپس جائیں' : 'Go back'}
    >
      {/* Arrow Icon - rotates based on language direction */}
      <span className={`text-xl transition-transform ${isRTL ? 'transform scale-x-(-1)' : ''}`}>
        ←
      </span>

      {/* Bilingual Label */}
      <BilingualLabel
        en="Back"
        ur="واپس"
        size="sm"
        color="inherit"
      />
    </button>
  );
};

export default BackButton;
