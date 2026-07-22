import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Signal from '@/models/Signal';

export async function GET(request: Request) {
  try {
    await dbConnect();
    const { searchParams } = new URL(request.url);
    const market = searchParams.get('market'); // 'US' | 'EGX'
    const subStatus = searchParams.get('status'); // 'all' | 'wins' | 'losses' | 'expired'
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const skip = (page - 1) * limit;

    // 1. Auto-expiration check
    await Signal.updateMany(
      { status: { $in: ['ACTIVE', 'Active', 'Pending'] }, expiresAt: { $lt: new Date() } },
      { $set: { status: 'EXPIRED' } }
    );

    // Base query for resolved signals only
    const resolvedStatuses = ['SUCCESS', 'FAILED', 'EXPIRED', 'Hit TP', 'Hit SL', 'Expired', 'EXECUTED'];
    const baseQuery: any = {
      status: { $in: resolvedStatuses },
      signalType: { $ne: 'HOLD' }
    };
    if (market === 'US' || market === 'EGX') {
      baseQuery.market = market;
    }

    // Retrieve stats across all resolved signals for this market
    const allResolvedSignals = await Signal.find(baseQuery);

    let winsCount = 0;
    let lossesCount = 0;
    let expiredCount = 0;
    let totalWinPnl = 0;
    let totalLossPnl = 0;
    let totalRRR = 0;
    let rrrCount = 0;

    allResolvedSignals.forEach((s) => {
      const pnl = s.pnlPercentage || 0;
      const isWin = s.status === 'SUCCESS' || s.status === 'Hit TP' || (s.status === 'EXECUTED' && pnl > 0);
      const isLoss = s.status === 'FAILED' || s.status === 'Hit SL' || (s.status === 'EXECUTED' && pnl <= 0);
      const isExpired = s.status === 'EXPIRED' || s.status === 'Expired';

      if (isWin) {
        winsCount++;
        totalWinPnl += Math.abs(pnl);
      } else if (isLoss) {
        lossesCount++;
        totalLossPnl += Math.abs(pnl);
      } else if (isExpired) {
        expiredCount++;
      }

      if (!isExpired && s.scoreMetrics?.riskRewardRatio && s.scoreMetrics.riskRewardRatio > 0) {
        totalRRR += s.scoreMetrics.riskRewardRatio;
        rrrCount++;
      }
    });

    const validTrades = winsCount + lossesCount;
    const winRate = validTrades > 0 ? Number(((winsCount / validTrades) * 100).toFixed(1)) : 0;
    
    let profitFactor = '0.00';
    if (totalLossPnl > 0) {
      profitFactor = (totalWinPnl / totalLossPnl).toFixed(2);
    } else if (totalWinPnl > 0) {
      profitFactor = '∞';
    }

    const avgRRR = rrrCount > 0 ? (totalRRR / rrrCount).toFixed(2) : '0.00';

    // 2. Filter specific tab data query
    const listQuery: any = { ...baseQuery };
    if (subStatus === 'wins' || subStatus === 'SUCCESS') {
      listQuery.$or = [
        { status: { $in: ['SUCCESS', 'Hit TP'] } },
        { status: 'EXECUTED', pnlPercentage: { $gt: 0 } }
      ];
    } else if (subStatus === 'losses' || subStatus === 'FAILED') {
      listQuery.$or = [
        { status: { $in: ['FAILED', 'Hit SL'] } },
        { status: 'EXECUTED', pnlPercentage: { $lte: 0 } }
      ];
    } else if (subStatus === 'expired' || subStatus === 'EXPIRED') {
      listQuery.status = { $in: ['EXPIRED', 'Expired'] };
    }

    const total = await Signal.countDocuments(listQuery);
    const signals = await Signal.find(listQuery)
      .sort({ closedAt: -1, updatedAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit);

    return NextResponse.json({
      success: true,
      data: signals,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      stats: {
        winRate,
        winsCount,
        lossesCount,
        expiredCount,
        totalResolved: allResolvedSignals.length,
        profitFactor,
        avgRRR
      }
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
