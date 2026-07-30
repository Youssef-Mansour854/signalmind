import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // Allow up to 5 minutes execution time for Vercel Hobby/Pro

export async function GET(request: Request) {
  // 1. Validate Cron Authorization Secret
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ success: false, message: 'Unauthorized cron request' }, { status: 401 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://signalmind-three.vercel.app';
  const timeframes = ['DAY_TRADE', 'SWING', 'MONTHLY', 'YEARLY'];
  const results = [];

  try {
    for (const tf of timeframes) {
      console.log(`[CRON] Starting automated scan for timeframe: ${tf}`);
      
      const response = await fetch(`${baseUrl}/api/scanner/run?tf=${tf}&manual=true`, {
        method: 'GET',
        headers: {
          'Cache-Control': 'no-cache',
          'Content-Type': 'application/json',
          'x-manual-trigger': 'true',
          ...(process.env.CRON_SECRET ? { Authorization: `Bearer ${process.env.CRON_SECRET}` } : {})
        }
      });

      const data = await response.json();
      results.push({ timeframe: tf, status: response.status, data });
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      executedTimeframes: timeframes.length,
      details: results
    });

  } catch (error: any) {
    console.error('[CRON ERROR]', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
