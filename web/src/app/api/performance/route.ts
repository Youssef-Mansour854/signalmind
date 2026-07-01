import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Signal from '@/models/Signal';

export async function GET() {
  try {
    await dbConnect();

    // Fetch closed signals
    const closedSignals = await Signal.find({ status: { $in: ['Hit TP', 'Hit SL'] } });

    const totalClosed = closedSignals.length;
    const wins = closedSignals.filter(s => s.status === 'Hit TP');
    const losses = closedSignals.filter(s => s.status === 'Hit SL');

    const winCount = wins.length;
    const lossCount = losses.length;
    const winRate = totalClosed > 0 ? Math.round((winCount / totalClosed) * 100) : 0;

    // Calculate total and average PnL
    const totalPnl = closedSignals.reduce((acc, s) => acc + (s.pnlPercentage || 0), 0);
    const avgPnl = totalClosed > 0 ? parseFloat((totalPnl / totalClosed).toFixed(2)) : 0;

    // Segment stats by market
    const usClosed = closedSignals.filter(s => s.market === 'US');
    const egxClosed = closedSignals.filter(s => s.market === 'EGX');

    const usWins = usClosed.filter(s => s.status === 'Hit TP').length;
    const usWinRate = usClosed.length > 0 ? Math.round((usWins / usClosed.length) * 100) : 0;

    const egxWins = egxClosed.filter(s => s.status === 'Hit TP').length;
    const egxWinRate = egxClosed.length > 0 ? Math.round((egxWins / egxClosed.length) * 100) : 0;

    // Retrieve active signals count
    const activeCount = await Signal.countDocuments({ status: 'Active' });
    const pendingCount = await Signal.countDocuments({ status: 'Pending' });

    // Retrieve latest signals that hit TP/SL for table display (limit to 10)
    const recentClosed = await Signal.find({ status: { $in: ['Hit TP', 'Hit SL'] } })
      .sort({ closedAt: -1 })
      .limit(10);

    return NextResponse.json({
      success: true,
      data: {
        summary: {
          totalClosed,
          winCount,
          lossCount,
          winRate,
          avgPnl,
          activeCount,
          pendingCount,
        },
        markets: {
          US: {
            total: usClosed.length,
            winRate: usWinRate,
          },
          EGX: {
            total: egxClosed.length,
            winRate: egxWinRate,
          }
        },
        recentClosed
      }
    });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
