import { NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance();
import { scrapeEGXLivePrice } from '@/utils/marketFetcher';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const symbolsParam = searchParams.get('symbols');

    if (!symbolsParam) {
      return NextResponse.json({ success: true, prices: {} });
    }

    const symbols = symbolsParam
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);

    if (symbols.length === 0) {
      return NextResponse.json({ success: true, prices: {} });
    }

    const prices: Record<string, number> = {};

    const egxSymbols = symbols.filter((s) => s.endsWith('.CA'));
    const usSymbols = symbols.filter((s) => !s.endsWith('.CA'));

    // Fetch US live prices in parallel
    if (usSymbols.length > 0) {
      const usResults = await Promise.allSettled(
        usSymbols.map(async (sym) => {
          try {
            const q: any = await yahooFinance.quote(sym);
            if (q && typeof q.regularMarketPrice === 'number' && q.regularMarketPrice > 0) {
              return { symbol: sym, price: q.regularMarketPrice };
            }
          } catch {
            // Fallback to historical daily bar close
            const hist: any[] = await yahooFinance.historical(sym, {
              period1: Math.floor((Date.now() - 7 * 86400000) / 1000),
              interval: '1d',
            });
            if (hist && hist.length > 0) {
              const lastBar = hist[hist.length - 1];
              if (lastBar && typeof lastBar.close === 'number' && lastBar.close > 0) {
                return { symbol: sym, price: lastBar.close };
              }
            }
          }
          return null;
        })
      );

      for (const res of usResults) {
        if (res.status === 'fulfilled' && res.value) {
          prices[res.value.symbol] = res.value.price;
        }
      }
    }

    // Fetch EGX live prices
    if (egxSymbols.length > 0) {
      const egxResults = await Promise.allSettled(
        egxSymbols.map(async (sym) => {
          const scraped = await scrapeEGXLivePrice(sym);
          if (scraped && scraped > 0) {
            return { symbol: sym, price: scraped };
          }
          try {
            const hist: any[] = await yahooFinance.historical(sym, {
              period1: Math.floor((Date.now() - 7 * 86400000) / 1000),
              interval: '1d',
            });
            if (hist && hist.length > 0) {
              const lastBar = hist[hist.length - 1];
              if (lastBar && typeof lastBar.close === 'number' && lastBar.close > 0) {
                return { symbol: sym, price: lastBar.close };
              }
            }
          } catch {}
          return null;
        })
      );

      for (const res of egxResults) {
        if (res.status === 'fulfilled' && res.value) {
          prices[res.value.symbol] = res.value.price;
        }
      }
    }

    return NextResponse.json({ success: true, prices });
  } catch (error: any) {
    console.error('[Batch Price Error]', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
