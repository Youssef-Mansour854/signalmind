import dbConnect from '@/lib/mongodb';
import Signal from '@/models/Signal';
import Portfolio from '@/models/Portfolio';

export function formatArabicDuration(start: Date, end: Date): string {
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

export interface HistoryItem {
  _id: string;
  symbol: string;
  market: 'US' | 'EGX';
  source: 'AI' | 'Actual';
  entryPrice: number;
  exitPrice: number;
  pnlPercentage: number;
  cashPnL: number;
  maxPeakPercentage: number;
  holdingDuration: string;
  status: string;
  closedAt: string;
}

export async function getCleanedHistory(): Promise<HistoryItem[]> {
  await dbConnect();

  // Query closed signals - explicitly exclude HOLD signals
  const closedSignals = await Signal.find({
    status: { $in: ['Hit TP', 'Hit SL', 'CLOSED', 'EXPIRED', 'EXECUTED'] },
    signalType: { $ne: 'HOLD' }
  });

  // Query closed portfolio trades
  const closedPortfolio = await Portfolio.find({
    status: { $in: ['Hit TP', 'Hit SL', 'CLOSED'] }
  }).populate('signalId');

  const normalizedSignals: HistoryItem[] = [];
  for (const s of closedSignals) {
    if (s.signalType === 'HOLD') continue;

    const entryPrice = s.entryPrice || 0;
    const exitPrice = s.exitPrice ?? s.exit_price ?? s.closedPrice ?? s.closed_price ?? (s.status === 'Hit TP' ? s.takeProfit : (s.status === 'Hit SL' ? s.stopLoss : (s.status === 'EXECUTED' ? s.takeProfit : (s.closedAt ? s.currentPrice : undefined))));

    // Require valid entryPrice > 0 and definitive exitPrice > 0
    if (!entryPrice || entryPrice <= 0 || exitPrice === undefined || exitPrice === null || exitPrice <= 0) {
      continue;
    }

    const closedAt = s.closedAt || s.updatedAt || s.createdAt;
    const openedAt = s.activatedAt || s.createdAt;

    const holdingDuration = formatArabicDuration(new Date(openedAt), new Date(closedAt));
    const positionSize = s.market === 'EGX' ? 5000 : 1000;
    
    let pnlPercentage = s.pnlPercentage;
    if (pnlPercentage === undefined || pnlPercentage === null) {
      pnlPercentage = Number((((exitPrice - entryPrice) / entryPrice) * 100).toFixed(2));
    }

    const cashPnL = positionSize * (pnlPercentage / 100);
    const effectiveMax = Math.max(s.maxPriceReached || entryPrice, exitPrice || 0);
    const maxPeakPercentage = entryPrice > 0 ? ((effectiveMax - entryPrice) / entryPrice) * 100 : 0;

    normalizedSignals.push({
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
      closedAt: new Date(closedAt).toISOString()
    });
  }

  const normalizedPortfolio: HistoryItem[] = [];
  for (const p of closedPortfolio) {
    const entryPrice = p.actualEntryPrice || 0;
    const exitPrice = p.exitPrice ?? p.exit_price ?? p.closedPrice ?? p.closed_price ?? (p.closedAt || p.closeDate ? p.currentPrice : undefined);

    // Require valid entryPrice > 0 and definitive exitPrice > 0
    if (!entryPrice || entryPrice <= 0 || exitPrice === undefined || exitPrice === null || exitPrice <= 0) {
      continue;
    }

    const closedAt = p.closedAt || p.closeDate || p.updatedAt || p.executedAt;
    const openedAt = p.executedAt;

    const holdingDuration = formatArabicDuration(new Date(openedAt), new Date(closedAt));

    let pnlPercentage = p.pnlPercentage;
    if (pnlPercentage === undefined || pnlPercentage === null) {
      pnlPercentage = Number((((exitPrice - entryPrice) / entryPrice) * 100).toFixed(2));
    }

    const cashPnL = p.finalPnL !== undefined ? p.finalPnL : (exitPrice - entryPrice) * (p.quantity || 0);

    const associatedSignal = p.signalId as any;
    const maxPriceReached = p.maxPriceReached || associatedSignal?.maxPriceReached || exitPrice;
    const effectiveMax = Math.max(maxPriceReached || entryPrice, exitPrice || 0);
    const maxPeakPercentage = entryPrice > 0 ? ((effectiveMax - entryPrice) / entryPrice) * 100 : 0;

    normalizedPortfolio.push({
      _id: p._id.toString(),
      symbol: p.symbol,
      market: p.market,
      source: 'Actual',
      entryPrice,
      exitPrice,
      pnlPercentage,
      cashPnL: Number(cashPnL.toFixed(2)),
      maxPeakPercentage: Number(maxPeakPercentage.toFixed(2)),
      holdingDuration,
      status: p.status,
      closedAt: new Date(closedAt).toISOString()
    });
  }

  // Combine and sort descending by closure date
  const combinedHistory: HistoryItem[] = [...normalizedSignals, ...normalizedPortfolio];
  combinedHistory.sort((a, b) => new Date(b.closedAt).getTime() - new Date(a.closedAt).getTime());

  // Deduplicate: exact source + symbol + closedDay
  const seen = new Set<string>();
  const deduplicatedHistory: HistoryItem[] = [];
  for (const item of combinedHistory) {
    const dateObj = new Date(item.closedAt);
    const closedDay = dateObj.toISOString().split('T')[0];
    const key = `${item.source}_${item.symbol}_${closedDay}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduplicatedHistory.push(item);
    }
  }

  return deduplicatedHistory;
}
