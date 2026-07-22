import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance();
import { RSI, MACD, EMA } from 'technicalindicators';

export class StaleDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StaleDataError';
  }
}

export interface MarketData {
  latestPrice: number;
  closes: number[];
  latestRSI: number;
  latestMACD: { MACD?: number; signal?: number; histogram?: number };
  latestEMA50: number;
  latestEMA200: number;
  lastCandleDate: Date;
}

export async function fetchMarketData(
  symbol: string,
  market: 'US' | 'EGX',
  isMacro = false
): Promise<MarketData> {
  if (market === 'EGX') {
    // TODO: Implement EGX Scraper
    const mockDate = new Date();
    return {
      latestPrice: 50.0,
      closes: Array(50).fill(50),
      latestRSI: 50,
      latestMACD: { MACD: 0, signal: 0, histogram: 0 },
      latestEMA50: 50.0,
      latestEMA200: 50.0,
      lastCandleDate: mockDate,
    };
  }

  // Market === 'US'
  const yfSymbol = symbol;

  const today = new Date();
  const daysBack = isMacro ? 365 : 180;
  const pastDate = new Date(today.getTime() - daysBack * 24 * 60 * 60 * 1000);
  const period1 = Math.floor(pastDate.getTime() / 1000);
  const period2 = Math.floor(today.getTime() / 1000);

  const historicalData = (await yahooFinance.historical(yfSymbol, {
    period1,
    period2,
    interval: '1d',
  })) as any[];

  if (!historicalData || historicalData.length === 0) {
    throw new Error(`لم يتم العثور على بيانات فنية للرمز ${symbol}`);
  }

  // Filter valid bars with positive close prices
  const validBars = historicalData.filter(
    (bar) => bar && typeof bar.close === 'number' && bar.close > 0 && bar.date
  );

  if (validBars.length < 26) {
    throw new Error(`بيانات غير كافية لحساب المؤشرات للرمز ${symbol}`);
  }

  // Data Staleness Guard
  const latestBar = validBars[validBars.length - 1];
  const lastCandleDate = new Date(latestBar.date);
  const now = new Date();
  const diffHours = (now.getTime() - lastCandleDate.getTime()) / (1000 * 60 * 60);

  // Accounting for weekends/holidays (Sunday, Monday, Saturday allow up to 80h; weekdays 48h)
  const dayOfWeek = now.getDay();
  const maxAllowedHours = (dayOfWeek === 0 || dayOfWeek === 1 || dayOfWeek === 6) ? 80 : 48;

  if (diffHours > maxAllowedHours) {
    throw new StaleDataError(
      `البيانات الفنية قديمة جداً للرمز ${symbol} (آخر شمعة: ${lastCandleDate.toISOString()}, الفارق: ${diffHours.toFixed(1)} ساعة).`
    );
  }

  const closes = validBars.map((bar) => bar.close);
  const latestPrice = closes[closes.length - 1];

  // Technical Indicators
  const rsiValues = RSI.calculate({ values: closes, period: 14 });
  const latestRSI = rsiValues[rsiValues.length - 1] ?? 50;

  const macdValues = MACD.calculate({
    values: closes,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  });
  const latestMACD = macdValues[macdValues.length - 1] || { MACD: 0, signal: 0, histogram: 0 };

  const ema50Values = closes.length >= 50 ? EMA.calculate({ values: closes, period: 50 }) : [];
  const latestEMA50 = ema50Values.length > 0 ? ema50Values[ema50Values.length - 1] : latestPrice;

  const ema200Values = closes.length >= 200 ? EMA.calculate({ values: closes, period: 200 }) : [];
  const latestEMA200 = ema200Values.length > 0 ? ema200Values[ema200Values.length - 1] : latestPrice;

  return {
    latestPrice,
    closes,
    latestRSI,
    latestMACD,
    latestEMA50,
    latestEMA200,
    lastCandleDate,
  };
}
