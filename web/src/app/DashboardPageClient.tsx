'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';

interface Signal {
  _id: string;
  symbol: string;
  market: 'US' | 'EGX';
  signalType: 'BUY' | 'SELL' | 'HOLD';
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  currentPrice: number;
  status: 'Pending' | 'Active' | 'Hit TP' | 'Hit SL' | 'Expired';
  timeframe?: string;
  signalStrength?: 'قوية' | 'متوسطة';
  createdAt: string;
  updatedAt: string;
  explanationArabic: string;
  scoreMetrics: {
    riskRewardRatio: number;
    confluenceScore: number;
    aiConfidenceScore: number;
    totalScore: number;
    rank: number;
  };
}

interface PortfolioStats {
  availableCash: number;
  totalInvestedCost: number;
  currentStocksValue: number;
  totalPortfolioValue: number;
  totalProfitLoss: number;
  totalProfitLossPercentage: number;
  activePositionsCount: number;
}

export default function DashboardPage() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [marketFilter, setMarketFilter] = useState<'EGX' | 'US'>('US');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dual Portfolio & Timeframe State
  const [portfolioType, setPortfolioType] = useState<'USER' | 'SYSTEM'>('USER');
  const [timeframe, setTimeframe] = useState<'1d' | '1w' | '3m' | '6m' | '1y' | 'all'>('all');
  const [portfolioStats, setPortfolioStats] = useState<PortfolioStats | null>(null);
  const [statsLoading, setStatsLoading] = useState<boolean>(false);
  const [isCashModalOpen, setIsCashModalOpen] = useState(false);
  const [cashInput, setCashInput] = useState<string>('');
  const [savingCash, setSavingCash] = useState(false);

  const fetchSignals = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/signals?status=Active&limit=100&market=${marketFilter}`);
      const json = await res.json();
      if (json.success) {
        setSignals(json.data);
      } else {
        setError(json.error || 'فشل في جلب البيانات');
      }
    } catch (err: any) {
      setError(err.message || 'حدث خطأ غير متوقع');
    } finally {
      setLoading(false);
    }
  };

  const fetchPortfolioStats = async (pType = portfolioType, tf = timeframe) => {
    setStatsLoading(true);
    try {
      const res = await fetch(`/api/portfolio/stats?type=${pType}&timeframe=${tf}`);
      if (!res.ok) {
        console.error("API returned an error:", res.status);
        return;
      }
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        console.error("API returned non-JSON response");
        return;
      }
      const json = await res.json();
      if (json.success && json.data) {
        setPortfolioStats(json.data);
      }
    } catch (err) {
      console.error('Failed to fetch portfolio stats:', err);
    } finally {
      setStatsLoading(false);
    }
  };

  useEffect(() => {
    fetchSignals();
    fetchPortfolioStats(portfolioType, timeframe);

    // Auto poll stats every 30 seconds
    const interval = setInterval(() => fetchPortfolioStats(portfolioType, timeframe), 30000);
    return () => clearInterval(interval);
  }, [marketFilter, portfolioType, timeframe]);

  const handleCashSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingCash(true);
    try {
      const res = await fetch('/api/portfolio/cash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ availableCash: Number(cashInput), type: portfolioType }),
      });
      const json = await res.json();
      if (json.success) {
        setIsCashModalOpen(false);
        fetchPortfolioStats(portfolioType, timeframe);
      } else {
        alert(json.error || 'فشلت عملية حفظ السيولة المتاحة');
      }
    } catch (err: any) {
      alert(err.message || 'حدث خطأ غير متوقع');
    } finally {
      setSavingCash(false);
    }
  };

  const formatPrice = (price: number, market: string, symbol: string) => {
    const formatted = price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (market === 'EGX' || symbol.endsWith('.CA')) {
      return `${formatted} ج.م`;
    }
    return `$${formatted}`;
  };

  const formatCurrency = (amount: number) => {
    const formatted = amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return marketFilter === 'EGX' ? `${formatted} ج.م` : `$${formatted}`;
  };

  const getWidgetSignals = (tf: string) => {
    return signals
      .filter((s) => s.timeframe === tf)
      .sort((a, b) => {
        // Sort "قوية" first
        if (a.signalStrength === 'قوية' && b.signalStrength !== 'قوية') return -1;
        if (a.signalStrength !== 'قوية' && b.signalStrength === 'قوية') return 1;
        return 0;
      })
      .slice(0, 3);
  };

  const renderWidget = (title: string, timeframeKey: string, viewAllPath: string, badgeIcon: string) => {
    const widgetSignals = getWidgetSignals(timeframeKey);

    return (
      <div className="border border-neutral-900 bg-neutral-950 p-6 rounded-lg flex flex-col justify-between h-[360px]">
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Widget Header */}
          <div className="flex items-center justify-between border-b border-neutral-900 pb-3 mb-4">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm shrink-0">{badgeIcon}</span>
              <h2 className="text-sm font-black tracking-tight text-white truncate">{title}</h2>
            </div>
            <span className="text-[10px] text-neutral-500 font-mono shrink-0">ACTIVE / PENDING</span>
          </div>

          {/* Widget List */}
          {loading ? (
            <div className="py-12 text-center text-xs font-mono text-neutral-500">LOADING...</div>
          ) : widgetSignals.length === 0 ? (
            <div className="py-12 text-center text-xs text-neutral-600 font-sans border border-dashed border-neutral-900 rounded">
              لا توجد إشارات نشطة حالياً.
            </div>
          ) : (
            <div className="space-y-3">
              {widgetSignals.map((signal) => {
                const isStrong = signal.signalStrength === 'قوية';
                return (
                  <div
                    key={signal._id}
                    className={`p-3 rounded border text-right transition duration-200 ${
                      isStrong
                        ? 'bg-white text-black border-white'
                        : 'bg-neutral-950 text-neutral-300 border-neutral-900 hover:border-neutral-700'
                    }`}
                  >
                    <div className="flex justify-between items-center mb-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-[9px] font-mono border rounded px-1.5 py-0.5 shrink-0 ${
                          isStrong ? 'bg-black text-white border-black' : 'bg-neutral-900 text-neutral-400 border-neutral-800'
                        }`}>
                          {signal.signalType}
                        </span>
                        <span className={`text-[10px] font-bold shrink-0 ${isStrong ? 'text-black' : 'text-neutral-400'}`}>
                          {isStrong ? '★ قوية' : '☆ متوسطة'}
                        </span>
                      </div>
                      <Link href={`/stock/${signal.symbol}`} className="font-black text-sm tracking-wide hover:underline hover:text-white truncate">
                        {signal.symbol}
                      </Link>
                    </div>

                    <div className="flex justify-between text-[10px] font-mono mt-2">
                      <div className="text-left">
                        <span className={isStrong ? 'text-neutral-700' : 'text-neutral-500'}>الهدف: </span>
                        <span className="font-bold">{formatPrice(signal.takeProfit, signal.market, signal.symbol)}</span>
                      </div>
                      <div>
                        <span className={isStrong ? 'text-neutral-700' : 'text-neutral-500'}>الدخول: </span>
                        <span className="font-bold">{formatPrice(signal.entryPrice, signal.market, signal.symbol)}</span>
                      </div>
                      <div>
                        <span className={isStrong ? 'text-neutral-700' : 'text-neutral-500'}>الحالي: </span>
                        <span className="font-bold">{formatPrice(signal.currentPrice, signal.market, signal.symbol)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* View All Button */}
        <div className="pt-3 mt-auto border-t border-neutral-900/60">
          <Link
            href={viewAllPath}
            className="w-full flex items-center justify-center p-2.5 rounded-lg border border-neutral-800 bg-neutral-900/50 hover:bg-neutral-850 hover:border-neutral-700 text-neutral-300 hover:text-white transition duration-200 text-xs md:text-sm font-bold gap-2"
          >
            <span>عرض الكل</span>
            <span className="text-sm shrink-0">&larr;</span>
          </Link>
        </div>
      </div>
    );
  };

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6 md:space-y-8 flex-1 flex flex-col justify-start max-w-7xl mx-auto w-full" dir="rtl">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-neutral-900 pb-6 gap-4">
        <div>
          <h1 className="text-xl font-black text-white uppercase tracking-tight">لوحة التحكم / Financial Terminal</h1>
          <p className="text-[10px] text-neutral-400 mt-1 font-mono uppercase tracking-wider">
            محطة تداول خوارزمية ذكية - نظرة عامة على الفرص النشطة والمدى الزمني
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Market Tab Selectors */}
          <div className="flex p-0.5 rounded bg-neutral-900 border border-neutral-800">
            <button
              onClick={() => setMarketFilter('EGX')}
              className={`px-4 py-1 text-xs font-bold transition rounded-sm ${
                marketFilter === 'EGX' ? 'bg-white text-black' : 'text-neutral-450 hover:text-white'
              }`}
            >
              EGX
            </button>
            <button
              onClick={() => setMarketFilter('US')}
              className={`px-4 py-1 text-xs font-bold transition rounded-sm ${
                marketFilter === 'US' ? 'bg-white text-black' : 'text-neutral-450 hover:text-white'
              }`}
            >
              US
            </button>
          </div>

          <button
            onClick={() => {
              fetchSignals();
              fetchPortfolioStats(portfolioType, timeframe);
            }}
            className="p-1.5 border border-neutral-800 bg-neutral-900 text-neutral-400 hover:text-white rounded transition shrink-0"
            title="تحديث البيانات"
          >
            <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.27 15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Live Portfolio Equity & Balance Banner */}
      <div className="border border-neutral-900 bg-neutral-950 p-6 rounded-lg space-y-4 text-right">
        <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-neutral-900 pb-4 gap-4">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-white animate-pulse shadow-[0_0_8px_#ffffff] shrink-0" />
            <h2 className="text-xs font-black uppercase tracking-wider text-neutral-400 font-mono">
              [ لوحة تحكم المحفظة الحية / LIVE PORTFOLIO EQUITY ]
            </h2>
          </div>

          <div className="flex items-center gap-3">
            {/* Dual Portfolio Toggle Switch */}
            <div className="flex p-0.5 rounded bg-neutral-900 border border-neutral-800">
              <button
                onClick={() => setPortfolioType('USER')}
                className={`px-3 py-1 text-xs font-bold transition rounded-sm ${
                  portfolioType === 'USER' ? 'bg-white text-black font-black' : 'text-neutral-450 hover:text-white'
                }`}
              >
                المحفظة الشخصية 👤
              </button>
              <button
                onClick={() => setPortfolioType('SYSTEM')}
                className={`px-3 py-1 text-xs font-bold transition rounded-sm ${
                  portfolioType === 'SYSTEM' ? 'bg-white text-black font-black' : 'text-neutral-450 hover:text-white'
                }`}
              >
                محفظة النظام الآلية 🤖
              </button>
            </div>

            <button
              onClick={() => fetchPortfolioStats(portfolioType, timeframe)}
              disabled={!!statsLoading}
              className="text-[10px] font-bold border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-white px-2.5 py-1 rounded transition flex items-center gap-1 cursor-pointer disabled:opacity-40 shrink-0"
              title="تحديث قيم المحفظة"
            >
              <span>مزامنة لحظية</span>
              <svg className={`h-3 w-3 shrink-0 ${statsLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.27 15" />
              </svg>
            </button>
          </div>
        </div>

        {/* Timeframe Selector Toolbar */}
        <div className="flex items-center justify-between border-b border-neutral-900/60 pb-3 gap-2 overflow-x-auto">
          <span className="text-[10px] text-neutral-500 font-mono font-bold shrink-0">الفترة الزمنية للأداء:</span>
          <div className="flex gap-1">
            {[
              { id: '1d', label: 'اليوم' },
              { id: '1w', label: 'الأسبوع' },
              { id: '3m', label: '٣ أشهر' },
              { id: '6m', label: '٦ أشهر' },
              { id: '1y', label: '١ سنة' },
              { id: 'all', label: 'الكل' },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setTimeframe(item.id as any)}
                className={`px-2.5 py-1 text-[11px] font-bold rounded transition border whitespace-nowrap cursor-pointer ${
                  timeframe === item.id
                    ? 'bg-white text-black border-white font-black'
                    : 'bg-neutral-900/40 text-neutral-400 border-neutral-800 hover:text-white hover:bg-neutral-850'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* 4 Cards with Skeleton Loading Animation */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-1">
          {/* Card 1: Total Portfolio Value */}
          <div className="border border-neutral-900 bg-neutral-900/30 p-4 rounded-lg flex flex-col justify-between space-y-2">
            <span className="text-[10px] text-neutral-500 font-mono font-bold uppercase block">
              القيمة الإجمالية للمحفظة 💰
            </span>
            {statsLoading ? (
              <div className="h-8 w-32 bg-neutral-900 animate-pulse rounded my-1" />
            ) : (
              <span className="text-xl sm:text-2xl font-black text-white block font-mono">
                {formatCurrency(portfolioStats?.totalPortfolioValue || 0)}
              </span>
            )}
            <span className="text-[9px] text-neutral-500 font-mono">
              (السيولة + الأسهم + الأرباح المحققة)
            </span>
          </div>

          {/* Card 2: Available Cash */}
          <div className="border border-neutral-900 bg-neutral-900/30 p-4 rounded-lg flex flex-col justify-between space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-neutral-500 font-mono font-bold uppercase">
                السيولة المتاحة (Cash) 💳
              </span>
              {portfolioType === 'USER' && (
                <button
                  onClick={() => {
                    setCashInput(String(portfolioStats?.availableCash || 100000));
                    setIsCashModalOpen(true);
                  }}
                  className="text-[9px] font-bold text-neutral-400 hover:text-white border border-neutral-800 bg-neutral-900 px-1.5 py-0.5 rounded transition cursor-pointer"
                >
                  [تعديل]
                </button>
              )}
            </div>
            {statsLoading ? (
              <div className="h-8 w-32 bg-neutral-900 animate-pulse rounded my-1" />
            ) : (
              <span className="text-xl sm:text-2xl font-black text-white block font-mono">
                {formatCurrency(portfolioStats?.availableCash || 0)}
              </span>
            )}
            <span className="text-[9px] text-neutral-500 font-mono">
              النقد المتاح ({portfolioType === 'USER' ? 'المحفظة الشخصية' : 'محفظة النظام'})
            </span>
          </div>

          {/* Card 3: Total Invested Cost */}
          <div className="border border-neutral-900 bg-neutral-900/30 p-4 rounded-lg flex flex-col justify-between space-y-2">
            <span className="text-[10px] text-neutral-500 font-mono font-bold uppercase block">
              رأس المال المستثمر 📉
            </span>
            {statsLoading ? (
              <div className="h-8 w-32 bg-neutral-900 animate-pulse rounded my-1" />
            ) : (
              <span className="text-xl sm:text-2xl font-black text-white block font-mono">
                {formatCurrency(portfolioStats?.totalInvestedCost || 0)}
              </span>
            )}
            <span className="text-[9px] text-neutral-500 font-mono">
              في {portfolioStats?.activePositionsCount || 0} مراكز نشطة
            </span>
          </div>

          {/* Card 4: Total PnL */}
          <div className="border border-neutral-900 bg-neutral-900/30 p-4 rounded-lg flex flex-col justify-between space-y-2">
            <span className="text-[10px] text-neutral-500 font-mono font-bold uppercase block">
              إجمالي الأرباح/الخسائر ⚡
            </span>
            {statsLoading ? (
              <div className="h-8 w-32 bg-neutral-900 animate-pulse rounded my-1" />
            ) : (
              <div className="flex items-baseline gap-2">
                <span className={`text-xl sm:text-2xl font-mono ${(portfolioStats?.totalProfitLoss || 0) >= 0 ? 'text-white font-black' : 'text-neutral-500 font-normal'}`}>
                  {(portfolioStats?.totalProfitLoss || 0) >= 0 ? '+' : ''}
                  {formatCurrency(portfolioStats?.totalProfitLoss || 0)}
                </span>
                <span className={`text-xs font-mono font-bold dir-ltr ${(portfolioStats?.totalProfitLoss || 0) >= 0 ? 'text-white' : 'text-neutral-500'}`}>
                  ({(portfolioStats?.totalProfitLoss || 0) >= 0 ? '+' : ''}
                  {portfolioStats?.totalProfitLossPercentage?.toFixed(2) || '0.00'}%)
                </span>
              </div>
            )}
            <span className="text-[9px] text-neutral-500 font-mono">
              الأداء خلال الفترة المحددة
            </span>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 border border-neutral-800 bg-neutral-950 text-neutral-400 text-xs font-mono rounded">
          خطأ: {error}
        </div>
      )}

      {/* Grid of 4 Widgets (2x2 on desktop, 1 col on mobile) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
        {renderWidget('أقوى فرص اليوم', 'يومي', '/day-trades', '⚡')}
        {renderWidget('أقوى فرص الأسبوع', 'أسبوعي', '/swing-trades', '📅')}
        {renderWidget('ترشيحات الشهر', 'شهري', '/monthly-picks', '🌙')}
        {renderWidget('أفضل استثمارات العام', 'استثمار سنوي', '/annual-investments', '🏢')}
      </div>

      {/* Edit Cash Modal */}
      {isCashModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" dir="rtl">
          <div className="bg-neutral-950 border border-neutral-900 p-6 rounded-lg w-full max-w-md space-y-6 text-right">
            <div>
              <h3 className="text-base font-black text-white">تعديل السيولة المتاحة (Available Cash)</h3>
              <p className="text-[10px] text-neutral-500 font-mono mt-1">أدخل المبلغ المستهدف المحفوظ بالسيولة النقديّة</p>
            </div>

            <form onSubmit={handleCashSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-neutral-450 block">المبلغ المتاح النقدي</label>
                <input
                  type="number"
                  step="any"
                  value={cashInput}
                  onChange={(e) => setCashInput(e.target.value)}
                  className="w-full bg-neutral-900 border border-neutral-800 text-white rounded p-2 text-xs font-mono focus:outline-none focus:border-white"
                  required
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={savingCash}
                  className="flex-1 py-2 text-xs font-bold bg-white text-black border border-white hover:bg-neutral-200 rounded transition disabled:opacity-40 cursor-pointer"
                >
                  {savingCash ? 'جاري الحفظ...' : 'حفظ'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsCashModalOpen(false)}
                  className="flex-1 py-2 text-xs font-bold border border-neutral-800 bg-neutral-900 text-neutral-450 hover:text-white rounded transition cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
