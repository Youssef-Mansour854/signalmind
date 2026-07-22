import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Portfolio from '@/models/Portfolio';

export async function GET(request: Request) {
  try {
    await dbConnect();
    const { searchParams } = new URL(request.url);
    const market = searchParams.get('market'); // 'US' | 'EGX'
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const skip = (page - 1) * limit;

    const filter: any = {
      portfolioType: 'USER',
      status: { $in: ['CLOSED', 'Hit TP', 'Hit SL'] }
    };

    if (market === 'US' || market === 'EGX') {
      filter.market = market;
    }

    // Retrieve all closed positions for summary calculation
    const allUserTrades = await Portfolio.find(filter).populate('signalId').sort({ closedAt: -1, closeDate: -1, updatedAt: -1 });

    let totalRealizedPnL = 0;
    let sumRoi = 0;
    let winningTrades = 0;
    let losingTrades = 0;

    allUserTrades.forEach((trade) => {
      const entry = trade.actualEntryPrice || 0;
      const exit = trade.exitPrice ?? trade.currentPrice ?? entry;
      const qty = trade.quantity || (entry > 0 ? trade.positionSize / entry : 0);
      
      const pnl = trade.finalPnL !== undefined && trade.finalPnL !== null
        ? trade.finalPnL
        : (exit - entry) * qty;

      const roi = trade.pnlPercentage !== undefined && trade.pnlPercentage !== null
        ? trade.pnlPercentage
        : (entry > 0 ? ((exit - entry) / entry) * 100 : 0);

      totalRealizedPnL += pnl;
      sumRoi += roi;

      if (pnl > 0 || trade.status === 'Hit TP') {
        winningTrades++;
      } else {
        losingTrades++;
      }
    });

    const totalTrades = allUserTrades.length;
    const avgROI = totalTrades > 0 ? Number((sumRoi / totalTrades).toFixed(2)) : 0;
    const winRate = totalTrades > 0 ? Number(((winningTrades / totalTrades) * 100).toFixed(1)) : 0;

    // Paginated list
    const total = await Portfolio.countDocuments(filter);
    const trades = await Portfolio.find(filter)
      .populate('signalId')
      .sort({ closedAt: -1, closeDate: -1, updatedAt: -1 })
      .skip(skip)
      .limit(limit);

    return NextResponse.json({
      success: true,
      data: trades,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      stats: {
        totalRealizedPnL: Number(totalRealizedPnL.toFixed(2)),
        avgROI,
        winRate,
        totalTrades,
        winningTrades,
        losingTrades
      }
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
