import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import EconomicNews from '@/models/EconomicNews';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface RawCalendarEvent {
  title?: string;
  name?: string;
  event?: string;
  country?: string;
  currency?: string;
  impact?: string;
  date?: string;
  time?: string;
  datetime?: string;
}

export async function GET(request: Request) {
  return handleSync(request);
}

export async function POST(request: Request) {
  return handleSync(request);
}

async function handleSync(request: Request) {
  try {
    await dbConnect();
    const { searchParams } = new URL(request.url);
    const force = searchParams.get('force') === 'true';

    // 1. Fetch economic calendar data from ForexFactory public JSON endpoint or fallback
    let rawEvents: RawCalendarEvent[] = [];
    try {
      const ffRes = await fetch('https://nodedata.forexfactory.com/daily-calendar/today.json', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
        },
        cache: 'no-store',
      });
      if (ffRes.ok) {
        const data = await ffRes.json();
        if (Array.isArray(data)) {
          rawEvents = data;
        }
      }
    } catch (err: any) {
      console.warn(`[News Sync Warning] Primary ForexFactory fetch failed: ${err.message}`);
    }

    // Secondary fallback: Try ForexFactory RSS / JSON weekly calendar
    if (rawEvents.length === 0) {
      try {
        const fallbackRes = await fetch('https://nodedata.forexfactory.com/daily-calendar/this-week.json', {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json',
          },
          cache: 'no-store',
        });
        if (fallbackRes.ok) {
          const data = await fallbackRes.json();
          if (Array.isArray(data)) {
            rawEvents = data;
          }
        }
      } catch (err: any) {
        console.warn(`[News Sync Warning] Fallback weekly fetch failed: ${err.message}`);
      }
    }

    // 2. Filter ONLY events where currency === 'USD' and impact === 'HIGH'
    const highImpactUsdEvents = rawEvents.filter((item) => {
      const curr = (item.currency || item.country || '').toUpperCase();
      const imp = (item.impact || '').toUpperCase();
      const isUsd = curr === 'USD' || curr === 'US';
      const isHigh = imp === 'HIGH' || imp === 'RED' || imp === '3';
      return isUsd && isHigh;
    });

    let syncedCount = 0;
    const syncedItems: any[] = [];

    // 3. Upsert events into MongoDB EconomicNews collection
    for (const item of highImpactUsdEvents) {
      const title = item.title || item.name || item.event || 'USD High Impact Event';
      const dateStr = item.datetime || item.date || item.time;
      if (!dateStr) continue;

      const eventTime = new Date(dateStr);
      if (isNaN(eventTime.getTime())) continue;

      const filter = { title, eventTime };
      const update = {
        $set: {
          title,
          currency: 'USD',
          impact: 'HIGH' as const,
          eventTime,
          isPassed: eventTime.getTime() < Date.now() - 30 * 60 * 1000,
        },
      };

      await EconomicNews.updateOne(filter, update, { upsert: true });
      syncedCount++;
      syncedItems.push({ title, currency: 'USD', impact: 'HIGH', eventTime });
    }

    // 4. Update isPassed status for existing past events
    const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000);
    await EconomicNews.updateMany(
      { eventTime: { $lt: thirtyMinsAgo }, isPassed: false },
      { $set: { isPassed: true } }
    );

    // Fetch active high-impact USD events for response overview
    const activeEvents = await EconomicNews.find({ currency: 'USD', impact: 'HIGH' })
      .sort({ eventTime: -1 })
      .limit(20);

    return NextResponse.json({
      success: true,
      message: `تمت مزامنة ${syncedCount} حدث اقتصادي أمريكي عالي التأثير بنجاح.`,
      syncedCount,
      syncedItems,
      totalHighImpactUsdInDb: activeEvents.length,
      events: activeEvents,
    });
  } catch (error: any) {
    console.error('[News Sync Error]', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
