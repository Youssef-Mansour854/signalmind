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
      const isExpired = s.status === 'EXPIRED' || s.status === 'Expired';
      if (isExpired) {
        expiredCount++;
        s.pnlPercentage = 0; // Strictly zero-out ghost data for expired trades
        return; // Excluded from Win Rate, AVG RR, and Profit Factor calculations
      }

      const entryPrice = s.entryPrice || 0;
      const exitPrice = s.exitPrice !== undefined 
        ? s.exitPrice 
        : (s.status === 'SUCCESS' || s.status === 'Hit TP' ? s.takeProfit : (s.status === 'FAILED' || s.status === 'Hit SL' ? s.stopLoss : s.currentPrice));

      let pnlPct = 0;
      if (entryPrice > 0 && exitPrice > 0) {
        pnlPct = ((exitPrice - entryPrice) / entryPrice) * 100;
      } else if (s.pnlPercentage !== undefined && s.pnlPercentage !== null) {
        pnlPct = s.pnlPercentage;
      }
      s.pnlPercentage = Number(pnlPct.toFixed(2));
      const pnl = s.pnlPercentage;

      const isWin = s.status === 'SUCCESS' || s.status === 'Hit TP' || (s.status === 'EXECUTED' && pnl > 0);
      const isLoss = s.status === 'FAILED' || s.status === 'Hit SL' || (s.status === 'EXECUTED' && pnl <= 0);

      if (isWin) {
        winsCount++;
        totalWinPnl += Math.abs(pnl);
      } else if (isLoss) {
        lossesCount++;
        totalLossPnl += Math.abs(pnl);
      }

      if (s.scoreMetrics?.riskRewardRatio && s.scoreMetrics.riskRewardRatio > 0) {
        totalRRR += s.scoreMetrics.riskRewardRatio;
        rrrCount++;
      }
    });

    // Win Rate formula: (winsCount / (winsCount + lossesCount)) * 100
    const validTrades = winsCount + lossesCount;
    const winRate = validTrades > 0 ? Number(((winsCount / validTrades) * 100).toFixed(1)) : 0;
    
    // Profit Factor calculation with Infinity (∞) fix
    const totalGrossLoss = Math.abs(totalLossPnl);
    const calculatedGrossProfit = totalWinPnl;
    const pfVal = totalGrossLoss === 0 
      ? (calculatedGrossProfit > 0 ? 999 : 0) 
      : (calculatedGrossProfit / totalGrossLoss);
    const profitFactor = pfVal.toFixed(2);

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
    const rawSignals = await Signal.find(listQuery)
      .sort({ closedAt: -1, updatedAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const signals = rawSignals.map((s) => {
      const obj = s.toObject ? s.toObject() : { ...s };
      if (obj.status === 'EXPIRED' || obj.status === 'Expired') {
        obj.pnlPercentage = 0;
      } else {
        const entryPrice = obj.entryPrice || 0;
        const exitPrice = obj.exitPrice !== undefined 
          ? obj.exitPrice 
          : (obj.status === 'SUCCESS' || obj.status === 'Hit TP' ? obj.takeProfit : (obj.status === 'FAILED' || obj.status === 'Hit SL' ? obj.stopLoss : obj.currentPrice));
        if (entryPrice > 0 && exitPrice > 0) {
          obj.pnlPercentage = Number((((exitPrice - entryPrice) / entryPrice) * 100).toFixed(2));
        }
      }
      return obj;
    });

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
