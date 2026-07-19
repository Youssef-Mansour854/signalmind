import { NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';
import dbConnect from '@/lib/mongodb';
import Portfolio from '@/models/Portfolio';
import Setting from '@/models/Setting';
import '@/models/Signal';

const yahooFinance = new YahooFinance();

const getTimeframeStartDate = (tf: string): Date | null => {
  const now = new Date();
  if (tf === '1d') return new Date(now.getTime() - 24 * 60 * 60 * 1000);
  if (tf === '1w') return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  if (tf === '3m') return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  if (tf === '6m') return new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
  if (tf === '1y') return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
  return null; // 'all'
};

export async function GET(request: Request) {
  try {
    await dbConnect();
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') === 'SYSTEM' ? 'SYSTEM' : 'USER';
    const timeframe = searchParams.get('timeframe') || 'all';

    const startDate = getTimeframeStartDate(timeframe);

    // 1. Fetch available cash for requested portfolio type
    const cashKey = `availableCash_${type}`;
    const cashDoc = await Setting.findOne({ key: cashKey });
    const availableCash = cashDoc && typeof cashDoc.value === 'number' ? cashDoc.value : 100000;
    const totalDeposits = cashDoc && typeof cashDoc.totalDeposits === 'number' && cashDoc.totalDeposits > 0 ? cashDoc.totalDeposits : availableCash;

    // 2. Fetch active portfolio positions for type and optional date range
    const activeFilter: any = { status: 'ACTIVE', portfolioType: type };
    if (startDate) {
      activeFilter.executedAt = { $gte: startDate };
    }
    const activePositions = await Portfolio.find(activeFilter).populate('signalId');
 
    if (!activePositions || activePositions.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          portfolioType: type,
          timeframe,
          availableCash,
          totalInvestedCost: 0,
          currentStocksValue: 0,
          realizedPnL: 0,
          unrealizedPnL: 0,
          totalPortfolioValue: availableCash || 0,
          totalProfitLoss: 0,
          totalProfitLossPercentage: 0,
          activePositionsCount: 0,
          closedPositionsCount: 0,
          positions: []
        }
      });
    }

    // 3. Fetch closed positions for realized PnL within timeframe
    const closedFilter: any = { status: 'CLOSED', portfolioType: type };
    if (startDate) {
      closedFilter.closedAt = { $gte: startDate };
    }
    const closedPositions = await Portfolio.find(closedFilter);

    let realizedPnL = 0;
    for (const cp of closedPositions) {
      realizedPnL += (cp.finalPnL !== undefined ? cp.finalPnL : 0);
    }

    // 4. Get unique symbols and fetch live prices via yahoo-finance2
    const symbolMap: Record<string, number> = {};

    if (activePositions.length > 0) {
      const symbolsToFetch = Array.from(new Set(activePositions.map((pos) => {
        let yfSymbol = pos.symbol;
        if (pos.market === 'EGX' && !yfSymbol.endsWith('.CA')) {
          yfSymbol = `${yfSymbol}.CA`;
        }
        return { symbol: pos.symbol, yfSymbol };
      })));

      await Promise.all(
        symbolsToFetch.map(async ({ symbol, yfSymbol }) => {
          try {
            const q = await yahooFinance.quote(yfSymbol) as any;
            const price = q?.regularMarketPrice || q?.postMarketPrice || q?.close;
            if (price && typeof price === 'number') {
              symbolMap[symbol] = price;
            }
          } catch (err) {
            console.warn(`[WARNING] Failed live price fetch for ${yfSymbol}:`, err);
          }
        })
      );
    }

    // 5. Compute metrics
    let totalInvestedCost = 0;
    let currentStocksValue = 0;

    const positionsDetail = activePositions.map((pos) => {
      const entry = pos.actualEntryPrice;
      const size = pos.positionSize;
      const qty = pos.quantity || (entry > 0 ? size / entry : 0);
      const livePrice = symbolMap[pos.symbol] || pos.currentPrice || entry;
      const itemValue = livePrice * qty;
      const itemPnL = itemValue - size;
      const itemPnLPct = size > 0 ? (itemPnL / size) * 100 : 0;

      totalInvestedCost += size;
      currentStocksValue += itemValue;

      return {
        _id: pos._id,
        symbol: pos.symbol,
        market: pos.market,
        actualEntryPrice: entry,
        positionSize: size,
        quantity: qty,
        livePrice,
        itemValue,
        itemPnL,
        itemPnLPct,
      };
    });

    let totalFees = 0;
    for (const pos of activePositions) {
      totalFees += (pos.brokerFees || 0);
    }
    for (const cp of closedPositions) {
      totalFees += (cp.brokerFees || 0);
    }

    const unrealizedPnL = currentStocksValue - totalInvestedCost;
    const totalProfitLoss = unrealizedPnL + realizedPnL - totalFees;
    const totalPortfolioValue = availableCash + currentStocksValue + realizedPnL;
    
    // Net ROI % = ((realizedPnL - totalFees) / totalDeposits) * 100
    const netRealizedPnL = realizedPnL - totalFees;
    const totalProfitLossPercentage = totalDeposits > 0 ? (netRealizedPnL / totalDeposits) * 100 : 0;

    return NextResponse.json({
      success: true,
      data: {
        portfolioType: type,
        timeframe,
        availableCash,
        totalInvestedCost: Number(totalInvestedCost.toFixed(2)),
        currentStocksValue: Number(currentStocksValue.toFixed(2)),
        realizedPnL: Number(realizedPnL.toFixed(2)),
        unrealizedPnL: Number(unrealizedPnL.toFixed(2)),
        totalPortfolioValue: Number(totalPortfolioValue.toFixed(2)),
        totalProfitLoss: Number(totalProfitLoss.toFixed(2)),
        totalProfitLossPercentage: Number(totalProfitLossPercentage.toFixed(2)),
        activePositionsCount: activePositions.length,
        closedPositionsCount: closedPositions.length,
        positions: positionsDetail,
      },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Error fetching portfolio stats:", error);
    return NextResponse.json({
      success: false,
      error: "Internal Server Error",
      data: {
        totalPortfolioValue: 100000,
        availableCash: 100000,
        totalInvestedCost: 0,
        totalProfitLoss: 0,
        totalProfitLossPercentage: 0,
        activePositionsCount: 0,
        closedPositionsCount: 0,
        positions: []
      }
    }, { status: 500 });
  }
}
