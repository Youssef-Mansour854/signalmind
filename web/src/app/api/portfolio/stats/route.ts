import { NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';
import dbConnect from '@/lib/mongodb';
import Portfolio from '@/models/Portfolio';
import Setting from '@/models/Setting';
import '@/models/Signal';

const yahooFinance = new YahooFinance();

export async function GET() {
  try {
    await dbConnect();

    // 1. Fetch available cash
    const cashDoc = await Setting.findOne({ key: 'availableCash' });
    const availableCash = cashDoc && typeof cashDoc.value === 'number' ? cashDoc.value : 100000;

    // 2. Fetch active portfolio positions
    const activePositions = await Portfolio.find({ status: 'ACTIVE' }).populate('signalId');

    // 3. Get unique symbols and fetch live prices via yahoo-finance2
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

    // 4. Compute metrics
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

    const totalPortfolioValue = availableCash + currentStocksValue;
    const totalProfitLoss = currentStocksValue - totalInvestedCost;
    const totalProfitLossPercentage = totalInvestedCost > 0 ? (totalProfitLoss / totalInvestedCost) * 100 : 0;

    return NextResponse.json({
      success: true,
      data: {
        availableCash,
        totalInvestedCost: Number(totalInvestedCost.toFixed(2)),
        currentStocksValue: Number(currentStocksValue.toFixed(2)),
        totalPortfolioValue: Number(totalPortfolioValue.toFixed(2)),
        totalProfitLoss: Number(totalProfitLoss.toFixed(2)),
        totalProfitLossPercentage: Number(totalProfitLossPercentage.toFixed(2)),
        activePositionsCount: activePositions.length,
        positions: positionsDetail,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
