import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * US Stock Market hours (Eastern Time):
 * - Pre-market: 4:00 AM - 9:30 AM ET
 * - Regular: 9:30 AM - 4:00 PM ET
 * - After-hours: 4:00 PM - 8:00 PM ET
 * - Closed: 8:00 PM - 4:00 AM ET (and weekends)
 */
export type MarketStatus = 'pre-market' | 'open' | 'after-hours' | 'closed';

export interface MarketStatusInfo {
  status: MarketStatus;
  label: string;
  labelShort: string;
}

export function getUSMarketStatus(): MarketStatusInfo {
  const now = new Date();
  
  // Get current time in ET (Eastern Time)
  const etTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = etTime.getDay(); // 0 = Sunday, 6 = Saturday
  const hours = etTime.getHours();
  const minutes = etTime.getMinutes();
  const timeInMinutes = hours * 60 + minutes;

  // Weekend = closed
  if (day === 0 || day === 6) {
    return { status: 'closed', label: 'Trh zavřen', labelShort: 'Zavřeno' };
  }

  // Pre-market: 4:00 AM - 9:30 AM ET (240 - 570 minutes)
  if (timeInMinutes >= 240 && timeInMinutes < 570) {
    return { status: 'pre-market', label: 'Pre-market', labelShort: 'Pre' };
  }

  // Regular: 9:30 AM - 4:00 PM ET (570 - 960 minutes)
  if (timeInMinutes >= 570 && timeInMinutes < 960) {
    return { status: 'open', label: 'Trh otevřen', labelShort: 'Live' };
  }

  // After-hours: 4:00 PM - 8:00 PM ET (960 - 1200 minutes)
  if (timeInMinutes >= 960 && timeInMinutes < 1200) {
    return { status: 'after-hours', label: 'After-hours', labelShort: 'AH' };
  }

  // Closed: before 4 AM or after 8 PM
  return { status: 'closed', label: 'Trh zavřen', labelShort: 'Zavřeno' };
}
