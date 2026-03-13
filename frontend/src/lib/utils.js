import { clsx } from "clsx";
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// Philippine timezone formatting utilities
const PH_LOCALE = 'en-PH';
const PH_TIMEZONE = 'Asia/Manila';

/**
 * Format date to Philippine locale (date only)
 * @param {string|Date} date - Date to format
 * @returns {string} Formatted date string
 */
export function formatPHDate(date) {
  if (!date) return '-';
  try {
    return new Date(date).toLocaleDateString(PH_LOCALE, { timeZone: PH_TIMEZONE });
  } catch {
    return new Date(date).toLocaleDateString(PH_LOCALE);
  }
}

/**
 * Format date to Philippine locale (date and time)
 * @param {string|Date} date - Date to format
 * @returns {string} Formatted date-time string
 */
export function formatPHDateTime(date) {
  if (!date) return '-';
  try {
    return new Date(date).toLocaleString(PH_LOCALE, { timeZone: PH_TIMEZONE });
  } catch {
    return new Date(date).toLocaleString(PH_LOCALE);
  }
}

/**
 * Format date to Philippine locale (time only)
 * @param {string|Date} date - Date to format
 * @param {object} options - Additional options for time formatting
 * @returns {string} Formatted time string
 */
export function formatPHTime(date, options = { hour: '2-digit', minute: '2-digit' }) {
  if (!date) return '-';
  try {
    return new Date(date).toLocaleTimeString(PH_LOCALE, { timeZone: PH_TIMEZONE, ...options });
  } catch {
    return new Date(date).toLocaleTimeString(PH_LOCALE, options);
  }
}