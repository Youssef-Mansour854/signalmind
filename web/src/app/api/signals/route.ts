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

    const query: any = {};
    if (market) query.market = market;
    
    const timeframe = searchParams.get('timeframe');
    if (timeframe) query.timeframe = timeframe;
    
    if (status) {
      if (status === 'Win') {
        query.status = 'Hit TP';
      } else if (status === 'Loss') {
        query.status = 'Hit SL';
      } else if (status === 'Closed') {
        query.status = { $in: ['Hit TP', 'Hit SL', 'Expired'] };
      } else if (status === 'Active') {
        query.status = { $in: ['Active', 'Pending'] };
      } else {
        query.status = status;
      }
    }

    // Retrieve signals sorted by rank (ascending) and date (descending)
    const total = await Signal.countDocuments(query);
    const signals = await Signal.find(query)
      .sort({ createdAt: -1, 'scoreMetrics.totalScore': -1 })
      .skip(skip)
      .limit(limit);

    // Map each signal and join with associated closed Portfolio items to subtract brokerFees
    const signalsWithNetPnL = await Promise.all(signals.map(async (s) => {
      const portItem = await Portfolio.findOne({ signalId: s._id, status: 'CLOSED' });
      if (portItem && portItem.brokerFees > 0) {
        const fees = portItem.brokerFees;
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
        
        const grossPnL = sumPartials > 0 ? sumPartials : (portItem.exitPrice! - entry) * qty;
        const netPnL = grossPnL - fees;
        const initialSize = size > 0 ? size : 1000;
        const netPnLPct = (netPnL / initialSize) * 100;
        
        const signalObj = s.toObject();
        signalObj.pnlPercentage = Number(netPnLPct.toFixed(2));
        signalObj.brokerFees = fees;
        return signalObj;
      }
      return s;
    }));

    return NextResponse.json({ 
      success: true, 
      count: signalsWithNetPnL.length, 
      total, 
      page, 
      totalPages: Math.ceil(total / limit),
      data: signalsWithNetPnL 
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
