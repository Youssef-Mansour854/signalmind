import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Signal from '@/models/Signal';
import Portfolio from '@/models/Portfolio';

function formatArabicDuration(start: Date, end: Date): string {
  const diffMs = end.getTime() - start.getTime();
  if (diffMs <= 0) return 'أقل من ساعة';
  
  const totalHours = Math.floor(diffMs / (1000 * 60 * 60));
  if (totalHours < 24) {
    if (totalHours === 0) return 'أقل من ساعة';
    if (totalHours === 1) return 'ساعة واحدة';
    if (totalHours === 2) return 'ساعتان';
    if (totalHours >= 3 && totalHours <= 10) return `${totalHours} ساعات`;
    return `${totalHours} ساعة`;
  }
  
  const totalDays = Math.floor(totalHours / 24);
  if (totalDays === 1) return 'يوم واحد';
  if (totalDays === 2) return 'يومان';
  if (totalDays >= 3 && totalDays <= 10) return `${totalDays} أيام`;
  return `${totalDays} يوم`;
}

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
    const closedSignals = await Signal.find({
      status: { $in: ['Hit TP', 'Hit SL', 'CLOSED'] }
    });

    // 2. Fetch closed portfolio trades (Actual User Performance)
    const closedPortfolio = await Portfolio.find({
      status: { $in: ['Hit TP', 'Hit SL', 'CLOSED'] }
    }).populate('signalId');

    // Normalize signals (AI source)
    const normalizedSignals = closedSignals.map((s) => {
      const entryPrice = s.entryPrice || 0;
      const exitPrice = s.currentPrice !== undefined ? s.currentPrice : (s.status === 'Hit TP' ? s.takeProfit : (s.status === 'Hit SL' ? s.stopLoss : s.entryPrice));
      const closedAt = s.closedAt || s.updatedAt || s.createdAt;
      const openedAt = s.activatedAt || s.createdAt;

      // Duration
      const holdingDuration = formatArabicDuration(new Date(openedAt), new Date(closedAt));

      // Cash PnL
      const positionSize = s.market === 'EGX' ? 5000 : 1000;
      const pnlPercentage = s.pnlPercentage || 0;
      const cashPnL = positionSize * (pnlPercentage / 100);

      // Max Excursion
      const effectiveMax = Math.max(s.maxPriceReached || entryPrice, exitPrice || 0);
      const maxPeakPercentage = entryPrice > 0 ? ((effectiveMax - entryPrice) / entryPrice) * 100 : 0;

      return {
        _id: s._id.toString(),
        symbol: s.symbol,
        market: s.market,
        source: 'AI',
        entryPrice,
        exitPrice,
        pnlPercentage,
        cashPnL: Number(cashPnL.toFixed(2)),
        maxPeakPercentage: Number(maxPeakPercentage.toFixed(2)),
        holdingDuration,
        status: s.status,
        closedAt
      };
    });

    // Normalize portfolio (Actual source)
    const normalizedPortfolio = closedPortfolio.map((p) => {
      const entryPrice = p.actualEntryPrice || 0;
      const exitPrice = p.exitPrice !== undefined ? p.exitPrice : (p.currentPrice !== undefined ? p.currentPrice : entryPrice);
      const closedAt = p.closedAt || p.updatedAt || p.executedAt;
      const openedAt = p.executedAt;

      // Duration
      const holdingDuration = formatArabicDuration(new Date(openedAt), new Date(closedAt));

      // Cash PnL
      const cashPnL = p.finalPnL !== undefined ? p.finalPnL : (exitPrice - entryPrice) * (p.quantity || 0);

      // Max Excursion
      const associatedSignal = p.signalId as any;
      const maxPriceReached = p.maxPriceReached || associatedSignal?.maxPriceReached || exitPrice;
      const effectiveMax = Math.max(maxPriceReached || entryPrice, exitPrice || 0);
      const maxPeakPercentage = entryPrice > 0 ? ((effectiveMax - entryPrice) / entryPrice) * 100 : 0;

      return {
        _id: p._id.toString(),
        symbol: p.symbol,
        market: p.market,
        source: 'Actual',
        entryPrice,
        exitPrice,
        pnlPercentage: p.pnlPercentage || 0,
        cashPnL: Number(cashPnL.toFixed(2)),
        maxPeakPercentage: Number(maxPeakPercentage.toFixed(2)),
        holdingDuration,
        status: p.status,
        closedAt
      };
    });

    // Combine both arrays
    const combinedHistory = [...normalizedSignals, ...normalizedPortfolio];

    // Sort by date descending
    combinedHistory.sort((a, b) => {
      const dateA = new Date(a.closedAt).getTime();
      const dateB = new Date(b.closedAt).getTime();
      return dateB - dateA;
    });

    // Deduplication
    const seen = new Set<string>();
    const deduplicatedHistory = [];
    for (const item of combinedHistory) {
      const dateObj = new Date(item.closedAt);
      const closedDay = dateObj.toISOString().split('T')[0];
      const key = `${item.source}_${item.symbol}_${closedDay}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduplicatedHistory.push(item);
      }
    }

    // Filter by market if specified
    let filteredHistory = deduplicatedHistory;
    if (market) {
      filteredHistory = filteredHistory.filter(item => item.market === market);
    }

    // Filter by timeframe
    if (timeframe !== 'all') {
      filteredHistory = filteredHistory.filter(item => {
        const closedDate = new Date(item.closedAt);
        return closedDate.getTime() >= startDate.getTime();
      });
    }

    // Calculate Shadow (AI) Metrics from the deduplicated, filtered dataset
    const shadowTrades = filteredHistory.filter(item => item.source === 'AI');
    const shadowTotal = shadowTrades.length;
    const shadowWins = shadowTrades.filter(item => item.pnlPercentage > 0 || item.status === 'Hit TP' || item.status === 'CLOSED_WIN').length;
    const shadowWinRate = shadowTotal > 0 ? Math.round((shadowWins / shadowTotal) * 100) : 0;
    const shadowAvgPnl = shadowTotal > 0 
      ? Number((shadowTrades.reduce((acc, curr) => acc + curr.pnlPercentage, 0) / shadowTotal).toFixed(2))
      : 0;

    // Calculate Actual Metrics from the deduplicated, filtered dataset
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
