import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Signal from '@/models/Signal';
import Portfolio from '@/models/Portfolio';

export async function GET() {
  try {
    await dbConnect();

    // Query signals with status in ["Hit TP", "Hit SL", "CLOSED"]
    const closedSignals = await Signal.find({
      status: { $in: ['Hit TP', 'Hit SL', 'CLOSED'] }
    });

    // Query user_portfolio with status in ["Hit TP", "Hit SL", "CLOSED"]
    const closedPortfolio = await Portfolio.find({
      status: { $in: ['Hit TP', 'Hit SL', 'CLOSED'] }
    });

    // Normalize signals (AI source)
    const normalizedSignals = closedSignals.map((s) => {
      const entryPrice = s.entryPrice || 0;
      const exitPrice = s.currentPrice !== undefined ? s.currentPrice : (s.status === 'Hit TP' ? s.takeProfit : (s.status === 'Hit SL' ? s.stopLoss : s.entryPrice));
      const closedAt = s.closedAt || s.updatedAt || s.createdAt;
      
      return {
        _id: s._id.toString(),
        symbol: s.symbol,
        market: s.market,
        source: 'AI',
        entryPrice,
        exitPrice,
        pnlPercentage: s.pnlPercentage || 0,
        status: s.status,
        closedAt
      };
    });

    // Normalize portfolio (Actual source)
    const normalizedPortfolio = closedPortfolio.map((p) => {
      const entryPrice = p.actualEntryPrice || 0;
      const exitPrice = p.exitPrice !== undefined ? p.exitPrice : (p.currentPrice !== undefined ? p.currentPrice : entryPrice);
      const closedAt = p.closedAt || p.updatedAt || p.executedAt;

      return {
        _id: p._id.toString(),
        symbol: p.symbol,
        market: p.market,
        source: 'Actual',
        entryPrice,
        exitPrice,
        pnlPercentage: p.pnlPercentage || 0,
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

    return NextResponse.json({ success: true, data: combinedHistory });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
