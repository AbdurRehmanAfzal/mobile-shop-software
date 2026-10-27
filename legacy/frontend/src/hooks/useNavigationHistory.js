/**
 * Custom Hook: useNavigationHistory
 *
 * Tracks navigation history and provides utilities for back navigation
 * Stores navigation state in localStorage for persistence
 */

import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

const NAVIGATION_HISTORY_KEY = 'mobile_shop_nav_history';
const MAX_HISTORY_ITEMS = 20;  // Limit history to prevent excessive storage

/**
 * Initialize or retrieve navigation history from localStorage
 */
const getNavigationHistory = () => {
  try {
    const stored = localStorage.getItem(NAVIGATION_HISTORY_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('Error retrieving navigation history:', error);
    return [];
  }
};

/**
 * Save navigation history to localStorage
 */
const saveNavigationHistory = (history) => {
  try {
    // Limit history size
    const trimmedHistory = history.slice(-MAX_HISTORY_ITEMS);
    localStorage.setItem(NAVIGATION_HISTORY_KEY, JSON.stringify(trimmedHistory));
  } catch (error) {
    console.error('Error saving navigation history:', error);
  }
};

/**
 * useNavigationHistory Hook
 *
 * Usage:
 * const { history, canGoBack, previousPage } = useNavigationHistory();
 */
export const useNavigationHistory = () => {
  const location = useLocation();
  const historyRef = useRef(getNavigationHistory());

  useEffect(() => {
    const currentPath = location.pathname;

    // Add current path to history if it's different from the last entry
    if (historyRef.current[historyRef.current.length - 1]?.path !== currentPath) {
      historyRef.current.push({
        path: currentPath,
        timestamp: Date.now(),
      });
      saveNavigationHistory(historyRef.current);
    }
  }, [location.pathname]);

  return {
    history: historyRef.current,
    canGoBack: historyRef.current.length > 1,
    previousPage: historyRef.current[historyRef.current.length - 2] || null,
    clearHistory: () => {
      historyRef.current = [];
      localStorage.removeItem(NAVIGATION_HISTORY_KEY);
    },
  };
};

export default useNavigationHistory;
