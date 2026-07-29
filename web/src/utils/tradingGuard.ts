import dbConnect from '@/lib/mongodb';
import EconomicNews from '@/models/EconomicNews';

export interface TradingGuardResult {
  safe: boolean;
  reason?: string;
  eventTitle?: string;
  eventTime?: string;
}

/**
 * The Trading Guard (Red Folder News Radar)
 * Checks if current time is within 30 minutes BEFORE or 30 minutes AFTER a high-impact USD economic event.
 * Returns { safe: false, reason: "BLOCKED_BY_NEWS_RADAR" } during high-volatility news windows.
 */
export async function isSafeToTrade(): Promise<TradingGuardResult> {
  try {
    await dbConnect();
    const nowMs = Date.now();
    const BUFFER_MS = 30 * 60 * 1000; // 30 minutes in milliseconds

    const windowStart = new Date(nowMs - BUFFER_MS);
    const windowEnd = new Date(nowMs + BUFFER_MS);

    // Query high-impact USD economic news events occurring in the 30min before to 30min after window
    const highImpactEvent = await EconomicNews.findOne({
      currency: 'USD',
      impact: 'HIGH',
      eventTime: { $gte: windowStart, $lte: windowEnd }
    });

    if (highImpactEvent) {
      console.warn(`[TRADING GUARD BLOCK] Trading paused due to Red Folder Event: "${highImpactEvent.title}" at ${highImpactEvent.eventTime.toISOString()}`);
      return {
        safe: false,
        reason: 'BLOCKED_BY_NEWS_RADAR',
        eventTitle: highImpactEvent.title,
        eventTime: highImpactEvent.eventTime.toISOString()
      };
    }

    return { safe: true };
  } catch (error: any) {
    console.error(`[TRADING GUARD ERROR] Failed checking economic calendar: ${error.message}`);
    // Default to safe if database query fails to prevent breaking regular execution
    return { safe: true };
  }
}
