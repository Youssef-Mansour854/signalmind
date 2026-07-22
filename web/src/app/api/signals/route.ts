import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Signal from '@/models/Signal';
import Portfolio from '@/models/Portfolio';

// GET /api/signals - Retrieve signals
export async function GET(request: Request) {
  try {
    await dbConnect();
    const { searchParams } = new URL(request.url);
    const market = searchParams.get('market'); // US or EGX
    const status = searchParams.get('status'); // Active, Hit TP, Hit SL, Closed, etc.
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const skip = (page - 1) * limit;

    // 1. Auto-expiration logic: mark any signals that have expired as 'EXPIRED'
    await Signal.updateMany(
      { status: { $in: ['ACTIVE', 'Active', 'Pending'] }, expiresAt: { $lt: new Date() } },
      { $set: { status: 'EXPIRED' } }
    );

    const query: any = {};
    if (market) query.market = market;
    
    const timeframe = searchParams.get('timeframe');
    if (timeframe) query.timeframe = timeframe;
    
    // 2. Strict status check: only return status: 'ACTIVE' by default unless querying history
    if (status === 'Closed' || status === 'Win' || status === 'Loss' || status === 'Expired' || status === 'EXPIRED' || status === 'EXECUTED') {
      if (status === 'Closed') {
        query.status = { $in: ['EXPIRED', 'EXECUTED', 'Hit TP', 'Hit SL', 'Expired'] };
      } else if (status === 'Win') {
        query.status = { $in: ['EXECUTED', 'Hit TP'] };
      } else if (status === 'Loss') {
        query.status = { $in: ['EXECUTED', 'Hit SL'] };
      } else if (status === 'Expired' || status === 'EXPIRED') {
        query.status = { $in: ['EXPIRED', 'Expired'] };
      } else {
        query.status = status;
      }
    } else {
      query.status = 'ACTIVE';
    }

    // Retrieve signals sorted by rank (ascending) and date (descending)
    const total = await Signal.countDocuments(query);
    const signals = await Signal.find(query)
      .sort({ createdAt: -1, 'scoreMetrics.totalScore': -1 })
      .skip(skip)
      .limit(limit);

    // Retrieve count of expired signals for this specific market and timeframe
    const expiredQuery: any = { status: { $in: ['EXPIRED', 'Expired'] } };
    if (market) expiredQuery.market = market;
    if (timeframe) expiredQuery.timeframe = timeframe;
    const expiredCount = await Signal.countDocuments(expiredQuery);

    // Map each signal and join with associated closed Portfolio items to subtract brokerFees and attach metadata
    const signalsWithNetPnL = await Promise.all(signals.map(async (s) => {
      const portItem = await Portfolio.findOne({ signalId: s._id, status: { $ne: 'ACTIVE' } });
      const signalObj = s.toObject();
      if (portItem) {
        signalObj.setupQuality = portItem.setupQuality;
        signalObj.initialStopLoss = portItem.initialStopLoss;
        
        const fees = portItem.brokerFees || 0;
        const entry = portItem.actualEntryPrice;
        const qty = portItem.quantity || 0;
        const size = portItem.positionSize;
        
        let sumPartials = 0;
        if (portItem.scalingHistory && portItem.scalingHistory.length > 0) {
          for (const tx of portItem.scalingHistory) {
            if (tx.type === 'PARTIAL_CLOSE' && tx.realizedPnL !== undefined) {
              sumPartials += tx.realizedPnL;
            }
          }
        }
        
        const exit = portItem.exitPrice !== undefined ? portItem.exitPrice : (portItem.currentPrice !== undefined ? portItem.currentPrice : entry);
        const grossPnL = sumPartials > 0 ? sumPartials : (exit - entry) * qty;
        const netPnL = grossPnL - fees;
        const initialSize = size > 0 ? size : 1000;
        const netPnLPct = (netPnL / initialSize) * 100;
        
        signalObj.pnlPercentage = Number(netPnLPct.toFixed(2));
        signalObj.brokerFees = fees;
        signalObj.exitPrice = exit;
        return signalObj;
      }
      return signalObj;
    }));

    return NextResponse.json({ 
      success: true, 
      count: signalsWithNetPnL.length, 
      total, 
      page, 
      totalPages: Math.ceil(total / limit),
      expiredCount,
      data: signalsWithNetPnL 
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
