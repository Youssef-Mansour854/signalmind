import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: Request) {
  // Validate Cron Authorization Secret if provided
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ success: false, message: 'Unauthorized cron request' }, { status: 401 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://signalmind-three.vercel.app';
  const timeframes = ['DAY_TRADE', 'SWING', 'MONTHLY', 'YEARLY'];

  try {
    // Execute all 4 timeframe scans in parallel using Promise.allSettled
    const results = await Promise.allSettled(
      timeframes.map((tf) =>
        fetch(`${baseUrl}/api/scanner/run?tf=${tf}&manual=true`, {
          method: 'GET',
          headers: {
            'Cache-Control': 'no-cache',
            'Content-Type': 'application/json',
            'x-manual-trigger': 'true',
            ...(process.env.CRON_SECRET ? { Authorization: `Bearer ${process.env.CRON_SECRET}` } : {})
          }
        }).then(async (res) => {
          const data = await res.json();
          return { timeframe: tf, status: res.status, data };
        })
      )
    );

    const formattedResults = results.map((r, idx) => {
      if (r.status === 'fulfilled') {
        return r.value;
      }
      return { timeframe: timeframes[idx], status: 500, error: r.reason?.message || String(r.reason) };
    });

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      executedTimeframes: timeframes.length,
      results: formattedResults
    });

  } catch (error: any) {
    console.error('[CRON ERROR]', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
