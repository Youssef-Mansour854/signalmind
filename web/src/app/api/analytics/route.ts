import { NextResponse } from 'next/server';
import { getCleanedHistory } from '@/lib/historyHelper';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const timeframe = searchParams.get('timeframe') || 'all';
    const market = searchParams.get('market'); // US, EGX, or ALL

    const now = new Date();
    let startDate = new Date(0);

    if (timeframe === 'weekly') {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (timeframe === 'monthly') {
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    } else if (timeframe === 'quarterly') {
      startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    } else if (timeframe === 'semiannual') {
      startDate = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
    } else if (timeframe === 'yearly') {
      startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    }

    const deduplicatedHistory = await getCleanedHistory();

    // Filter by market if specified
    let filteredHistory = deduplicatedHistory;
    if (market && market !== 'ALL') {
      filteredHistory = filteredHistory.filter(item => item.market === market);
    }

    // Filter by timeframe
    if (timeframe !== 'all') {
      filteredHistory = filteredHistory.filter(item => {
        const closedDate = new Date(item.closedAt);
        return closedDate.getTime() >= startDate.getTime();
      });
    }

    // Calculate Shadow (AI) Metrics from deduplicated, filtered dataset of explicitly closed trades
    const shadowTrades = filteredHistory.filter(item => item.source === 'AI');
    const shadowTotal = shadowTrades.length;
    const shadowWins = shadowTrades.filter(item => item.pnlPercentage > 0 || item.status === 'Hit TP' || item.status === 'CLOSED_WIN').length;
    const shadowWinRate = shadowTotal > 0 ? Math.round((shadowWins / shadowTotal) * 100) : 0;
    const shadowAvgPnl = shadowTotal > 0 
      ? Number((shadowTrades.reduce((acc, curr) => acc + curr.pnlPercentage, 0) / shadowTotal).toFixed(2))
      : 0;

    // Calculate Actual Metrics from deduplicated, filtered dataset of explicitly closed trades
    const actualTrades = filteredHistory.filter(item => item.source === 'Actual');
    const actualTotal = actualTrades.length;
    const actualWins = actualTrades.filter(item => item.pnlPercentage > 0 || item.status === 'Hit TP' || item.status === 'CLOSED_WIN').length;
    const actualWinRate = actualTotal > 0 ? Math.round((actualWins / actualTotal) * 100) : 0;
    const actualAvgPnl = actualTotal > 0
      ? Number((actualTrades.reduce((acc, curr) => acc + curr.pnlPercentage, 0) / actualTotal).toFixed(2))
      : 0;

    return NextResponse.json({
      success: true,
      data: {
        timeframe,
        market: market || 'ALL',
        shadow: {
          totalClosed: shadowTotal,
          winRate: shadowWinRate,
          avgPnl: shadowAvgPnl
        },
        actual: {
          totalClosed: actualTotal,
          winRate: actualWinRate,
          avgPnl: actualAvgPnl
        }
      }
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
