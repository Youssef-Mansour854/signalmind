import { NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';
import dbConnect from '@/lib/mongodb';
import Portfolio from '@/models/Portfolio';
import Setting from '@/models/Setting';
import '@/models/Signal';
import { scrapeEGXLivePrice } from '@/utils/marketFetcher';

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
    const market = searchParams.get('market') === 'EGX' ? 'EGX' : 'US';

    const startDate = getTimeframeStartDate(timeframe);

    // 1. Fetch available cash for requested portfolio type and market
    const defaultInitialBalance = 100000;
    const cashKey = `availableCash_${type}_${market}`;
    const cashDoc = await Setting.findOne({ key: cashKey });
    const initialBalance = cashDoc && typeof cashDoc.value === 'number' ? cashDoc.value : defaultInitialBalance;
    const totalDeposits = cashDoc && typeof cashDoc.totalDeposits === 'number' && cashDoc.totalDeposits > 0 ? cashDoc.totalDeposits : initialBalance;

    // 2. Fetch active portfolio positions for type, market, and optional date range
    const activeFilter: any = { status: 'ACTIVE', portfolioType: type, market: market };
    if (startDate) {
      activeFilter.executedAt = { $gte: startDate };
    }
    const activePositions = await Portfolio.find(activeFilter).populate('signalId');

    // 3. Fetch closed positions for realized PnL within timeframe and market
    const closedFilter: any = { status: 'CLOSED', portfolioType: type, market: market };
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
        return { symbol: pos.symbol, yfSymbol, market: pos.market };
      })));

      await Promise.all(
        symbolsToFetch.map(async ({ symbol, yfSymbol, market: itemMarket }) => {
          try {
            if (itemMarket === 'EGX') {
              const liveEgxPrice = await scrapeEGXLivePrice(symbol);
              if (liveEgxPrice && typeof liveEgxPrice === 'number' && liveEgxPrice > 0) {
                symbolMap[symbol] = liveEgxPrice;
                return;
              }
            }
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

    const costBasis = totalInvestedCost;
    const unrealizedPnL = currentStocksValue - costBasis;
    // Available cash = Initial balance minus static cost basis plus realized PnL (Stays stable during tick fluctuations)
    const availableCash = initialBalance - costBasis + realizedPnL;
    // Total Equity = Available cash + current stocks value = Initial balance + realized PnL + unrealized PnL
    const totalPortfolioValue = availableCash + currentStocksValue;
    
    const totalProfitLoss = unrealizedPnL + realizedPnL - totalFees;
    const totalProfitLossPercentage = totalDeposits > 0 ? (totalProfitLoss / totalDeposits) * 100 : 0;

    let maxDailyDrawdownLimit = 5;
    let maxTotalDrawdownLimit = 10;
    let peakEquity = totalPortfolioValue;
    let dailyStartEquity = totalPortfolioValue;
    let dailyStartEquityDate = new Date().toISOString().split('T')[0];

    if (cashDoc) {
      if (cashDoc.maxDailyDrawdownLimit !== undefined) {
        maxDailyDrawdownLimit = cashDoc.maxDailyDrawdownLimit;
      } else {
        cashDoc.maxDailyDrawdownLimit = maxDailyDrawdownLimit;
      }

      if (cashDoc.maxTotalDrawdownLimit !== undefined) {
        maxTotalDrawdownLimit = cashDoc.maxTotalDrawdownLimit;
      } else {
        cashDoc.maxTotalDrawdownLimit = maxTotalDrawdownLimit;
      }

      const storedPeak = cashDoc.peakEquity;
      if (storedPeak === undefined || totalPortfolioValue > storedPeak) {
        cashDoc.peakEquity = totalPortfolioValue;
        peakEquity = totalPortfolioValue;
      } else {
        peakEquity = storedPeak;
      }

      const todayStr = new Date().toISOString().split('T')[0];
      const storedDailyStart = cashDoc.dailyStartEquity;
      const storedDailyStartDate = cashDoc.dailyStartEquityDate;

      if (storedDailyStart === undefined || storedDailyStartDate !== todayStr) {
        cashDoc.dailyStartEquity = totalPortfolioValue;
        cashDoc.dailyStartEquityDate = todayStr;
        dailyStartEquity = totalPortfolioValue;
      } else {
        dailyStartEquity = storedDailyStart;
      }

      if (cashDoc.isModified()) {
        await cashDoc.save();
      }
    }

    const dailyDrawdownAmount = Math.max(0, dailyStartEquity - totalPortfolioValue);
    const currentDailyDrawdown = dailyStartEquity > 0 ? (dailyDrawdownAmount / dailyStartEquity) * 100 : 0;

    const totalDrawdownAmount = Math.max(0, peakEquity - totalPortfolioValue);
    const currentTotalDrawdown = peakEquity > 0 ? (totalDrawdownAmount / peakEquity) * 100 : 0;

    return NextResponse.json({
      success: true,
      data: {
        portfolioType: type,
        timeframe,
        availableCash: Number(availableCash.toFixed(2)),
        totalInvestedCost: Number(currentStocksValue.toFixed(2)), // Dynamically fluctuates with live market value
        costBasis: Number(costBasis.toFixed(2)), // Static initial position cost
        currentStocksValue: Number(currentStocksValue.toFixed(2)),
        realizedPnL: Number(realizedPnL.toFixed(2)),
        unrealizedPnL: Number(unrealizedPnL.toFixed(2)),
        totalPortfolioValue: Number(totalPortfolioValue.toFixed(2)),
        totalProfitLoss: Number(totalProfitLoss.toFixed(2)),
        totalProfitLossPercentage: Number(totalProfitLossPercentage.toFixed(2)),
        activePositionsCount: activePositions.length,
        closedPositionsCount: closedPositions.length,
        positions: positionsDetail,
        maxDailyDrawdownLimit,
        maxTotalDrawdownLimit,
        currentDailyDrawdown: Number(currentDailyDrawdown.toFixed(2)),
        currentTotalDrawdown: Number(currentTotalDrawdown.toFixed(2)),
        dailyStartEquity: Number(dailyStartEquity.toFixed(2)),
        peakEquity: Number(peakEquity.toFixed(2))
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
