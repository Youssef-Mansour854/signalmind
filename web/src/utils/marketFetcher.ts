import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance();
import { RSI, MACD, EMA } from 'technicalindicators';
import * as cheerio from 'cheerio';

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

/**
 * Scrapes live stock price for EGX symbols directly from Google Finance
 * Converts ticker formats like "FWRY.CA" or "FWRY" -> "FWRY:CAI"
 */
export async function scrapeEGXLivePrice(rawSymbol: string): Promise<number | null> {
  try {
    const cleanSymbol = rawSymbol.replace(/\.CA$/i, '').trim();
    const googleTicker = `${cleanSymbol}:CAI`;
    const url = `https://www.google.com/finance/quote/${encodeURIComponent(googleTicker)}`;

    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      next: { revalidate: 60 },
    });

    if (!response.ok) {
      console.warn(`[EGX Scraper] Google Finance HTTP ${response.status} for ${googleTicker}`);
      return null;
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Primary selector used by Google Finance for live security price
    const priceText = $('.YMlKec.fxKbKc').first().text().trim();
    if (priceText) {
      const cleaned = priceText.replace(/[^0-9.]/g, '');
      const price = parseFloat(cleaned);
      if (!isNaN(price) && price > 0) {
        return price;
      }
    }

    // Fallback: search for data-last-price regex pattern in HTML
    const priceMatch = html.match(/data-last-price="([0-9.]+)"/i);
    if (priceMatch && priceMatch[1]) {
      const price = parseFloat(priceMatch[1]);
      if (!isNaN(price) && price > 0) {
        return price;
      }
    }

    console.warn(`[EGX Scraper] Price selector failed for ${googleTicker}`);
    return null;
  } catch (err: any) {
    console.error(`[EGX Scraper] Error scraping ${rawSymbol}:`, err.message);
    return null;
  }
}

export async function fetchMarketData(
  symbol: string,
  market: 'US' | 'EGX',
  isMacro = false
): Promise<MarketData> {
  const isEGX = market === 'EGX';
  const cleanSymbol = symbol.replace(/\.CA$/i, '').trim();
  const yfSymbol = isEGX ? `${cleanSymbol}.CA` : symbol;

  const today = new Date();
  const daysBack = isMacro ? 365 : 180;
  const pastDate = new Date(today.getTime() - daysBack * 24 * 60 * 60 * 1000);
  const period1 = Math.floor(pastDate.getTime() / 1000);
  const period2 = Math.floor(today.getTime() / 1000);

  let historicalData: any[] = [];
  try {
    historicalData = (await yahooFinance.historical(yfSymbol, {
      period1,
      period2,
      interval: '1d',
    })) as any[];
  } catch (err: any) {
    console.warn(`[YahooFinance] Failed to fetch historical data for ${yfSymbol}: ${err.message}`);
  }

  // Filter valid bars with positive close prices
  let validBars = (historicalData || []).filter(
    (bar) => bar && typeof bar.close === 'number' && bar.close > 0 && bar.date
  );

  // If EGX: Scrape live price from Google Finance (Hybrid Approach)
  let liveScrapedPrice: number | null = null;
  if (isEGX) {
    liveScrapedPrice = await scrapeEGXLivePrice(symbol);
  }

  if (validBars.length === 0 && !liveScrapedPrice) {
    throw new Error(`لم يتم العثور على بيانات فنية أو سعر مباشر للرمز ${symbol}`);
  }

  let lastCandleDate = validBars.length > 0 ? new Date(validBars[validBars.length - 1].date) : new Date();

  // Hybrid Merging for EGX: Override/append latest candle with fresh Google Finance live tick
  if (isEGX && liveScrapedPrice !== null && liveScrapedPrice > 0) {
    if (validBars.length > 0) {
      const lastBar = validBars[validBars.length - 1];
      const barDate = new Date(lastBar.date);
      const isSameDay = barDate.toDateString() === today.toDateString();

      if (isSameDay) {
        lastBar.close = liveScrapedPrice;
      } else {
        validBars.push({
          date: today,
          close: liveScrapedPrice,
          open: liveScrapedPrice,
          high: liveScrapedPrice,
          low: liveScrapedPrice,
        });
      }
      lastCandleDate = today;
    } else {
      validBars = Array(50).fill(0).map(() => ({
        date: today,
        close: liveScrapedPrice!,
      }));
      lastCandleDate = today;
    }
  }

  if (validBars.length < 26) {
    throw new Error(`بيانات غير كافية لحساب المؤشرات للرمز ${symbol}`);
  }

  // Data Staleness Guard
  const now = new Date();
  const diffHours = (now.getTime() - lastCandleDate.getTime()) / (1000 * 60 * 60);

  const dayOfWeek = now.getDay();
  const maxAllowedHours = (dayOfWeek === 0 || dayOfWeek === 1 || dayOfWeek === 6) ? 80 : 48;

  if (diffHours > maxAllowedHours) {
    throw new StaleDataError(
      `البيانات الفنية قديمة جداً للرمز ${symbol} (آخر شمعة: ${lastCandleDate.toISOString()}, الفارق: ${diffHours.toFixed(1)} ساعة).`
    );
  }

  const closes = validBars.map((bar) => bar.close);
  const latestPrice = liveScrapedPrice ?? closes[closes.length - 1];

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
