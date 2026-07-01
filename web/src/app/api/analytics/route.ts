import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Signal from '@/models/Signal';
import Portfolio from '@/models/Portfolio';

export async function GET(request: Request) {
  try {
    await dbConnect();
    const { searchParams } = new URL(request.url);
    const timeframe = searchParams.get('timeframe') || 'all';
    const market = searchParams.get('market'); // US or EGX

    const now = new Date();
    let startDate = new Date(0); // default to all time

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

    // 1. Fetch closed signals (AI Shadow Performance)
    const signalsQuery: any = {
      status: { $in: ['Hit TP', 'Hit SL', 'CLOSED_WIN', 'CLOSED_LOSS'] },
      createdAt: { $gte: startDate }
    };
    if (market) {
      signalsQuery.market = market;
    }
    const closedSignals = await Signal.find(signalsQuery);

    // 2. Fetch closed portfolio trades (Actual User Performance)
    const portfolioQuery: any = {
      status: { $in: ['CLOSED_WIN', 'CLOSED_LOSS'] },
      executedAt: { $gte: startDate }
    };
    if (market) {
      portfolioQuery.market = market;
    }
    const closedPortfolio = await Portfolio.find(portfolioQuery);

    // Calculate Shadow Metrics
    const shadowTotal = closedSignals.length;
    const shadowWins = closedSignals.filter(s => s.status === 'Hit TP' || s.status === 'CLOSED_WIN').length;
    const shadowWinRate = shadowTotal > 0 ? Math.round((shadowWins / shadowTotal) * 100) : 0;
    const shadowAvgPnl = shadowTotal > 0 
      ? Number((closedSignals.reduce((acc, curr) => acc + (curr.pnlPercentage || 0), 0) / shadowTotal).toFixed(2))
      : 0;

    // Calculate Actual Metrics
    const actualTotal = closedPortfolio.length;
    const actualWins = closedPortfolio.filter(p => p.status === 'CLOSED_WIN').length;
    const actualWinRate = actualTotal > 0 ? Math.round((actualWins / actualTotal) * 100) : 0;
    const actualAvgPnl = actualTotal > 0
      ? Number((closedPortfolio.reduce((acc, curr) => acc + (curr.pnlPercentage || 0), 0) / actualTotal).toFixed(2))
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
