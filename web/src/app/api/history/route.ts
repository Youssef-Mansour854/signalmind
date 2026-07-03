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

export async function GET() {
  try {
    await dbConnect();

    // Query signals with status in ["Hit TP", "Hit SL", "CLOSED"]
    const closedSignals = await Signal.find({
      status: { $in: ['Hit TP', 'Hit SL', 'CLOSED'] }
    });

    // Query user_portfolio with status in ["Hit TP", "Hit SL", "CLOSED"] and populate signalId
    const closedPortfolio = await Portfolio.find({
      status: { $in: ['Hit TP', 'Hit SL', 'CLOSED'] }
    }).populate('signalId');

    // Normalize signals (AI source)
    const normalizedSignals = closedSignals.map((s) => {
      const entryPrice = s.entryPrice || 0;
      const exitPrice = s.currentPrice !== undefined ? s.currentPrice : (s.status === 'Hit TP' ? s.takeProfit : (s.status === 'Hit SL' ? s.stopLoss : s.entryPrice));
      const closedAt = s.closedAt || s.updatedAt || s.createdAt;
      const openedAt = s.activatedAt || s.createdAt;

      // 1. Duration
      const holdingDuration = formatArabicDuration(new Date(openedAt), new Date(closedAt));

      // 2. Cash PnL (Net Profit/Loss)
      // AI trades: assume a fixed position size: 5000 EGP for EGX, $1000 for US
      const positionSize = s.market === 'EGX' ? 5000 : 1000;
      const pnlPercentage = s.pnlPercentage || 0;
      const cashPnL = positionSize * (pnlPercentage / 100);

      // 3. Max Excursion (Peak %)
      const maxPrice = s.maxPriceReached || 0;
      const maxPeakPercentage = (maxPrice > 0 && entryPrice > 0) ? ((maxPrice - entryPrice) / entryPrice) * 100 : pnlPercentage;

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

      // 1. Duration
      const holdingDuration = formatArabicDuration(new Date(openedAt), new Date(closedAt));

      // 2. Cash PnL (Net Profit/Loss)
      const cashPnL = p.finalPnL !== undefined ? p.finalPnL : (exitPrice - entryPrice) * (p.quantity || 0);

      // 3. Max Excursion (Peak %)
      const associatedSignal = p.signalId as any;
      const maxPrice = associatedSignal?.maxPriceReached || exitPrice;
      const maxPeakPercentage = (maxPrice > 0 && entryPrice > 0) ? ((maxPrice - entryPrice) / entryPrice) * 100 : (p.pnlPercentage || 0);

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

    // Sort by date descending (newest closures first)
    combinedHistory.sort((a, b) => {
      const dateA = new Date(a.closedAt).getTime();
      const dateB = new Date(b.closedAt).getTime();
      return dateB - dateA;
    });

    // Deduplication: ensure no duplicate closed trades for the exact same asset on the same day within a source
    const seen = new Set<string>();
    const deduplicatedHistory = [];
    for (const item of combinedHistory) {
      const dateObj = new Date(item.closedAt);
      const closedDay = dateObj.toISOString().split('T')[0]; // "YYYY-MM-DD"
      const key = `${item.source}_${item.symbol}_${closedDay}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduplicatedHistory.push(item);
      }
    }

    return NextResponse.json({ success: true, data: deduplicatedHistory });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
