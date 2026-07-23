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
  status: 'ACTIVE' | 'EXPIRED' | 'EXECUTED' | 'Pending' | 'Active' | 'Hit TP' | 'Hit SL' | 'Expired';
  expiresAt?: string;
  exitPrice?: number;
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
  investedCapital?: number;
  totalInvestedCost: number;
  costBasis?: number;
  currentPositionValue?: number;
  currentStocksValue: number;
  totalPortfolioValue: number;
  totalPnL?: number;
  realizedPnL?: number;
  unrealizedPnL?: number;
  totalProfitLoss: number;
  totalProfitLossPercentage: number;
  activePositionsCount: number;
  maxDailyDrawdownLimit: number;
  maxTotalDrawdownLimit: number;
  currentDailyDrawdown: number;
  currentTotalDrawdown: number;
  dailyStartEquity: number;
  peakEquity: number;
  positions?: Array<{
    _id: string;
    symbol: string;
    market: string;
    actualEntryPrice: number;
    positionSize: number;
    quantity: number;
    currentPrice?: number;
    livePrice?: number;
    itemValue?: number;
    itemPnL?: number;
    itemPnLPct?: number;
  }>;
}

export default function DashboardPage() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [marketFilter, setMarketFilter] = useState<'EGX' | 'US'>('US');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Shared Live Price State Dictionary
  const [livePrices, setLivePrices] = useState<Record<string, number>>({});

  const onLivePriceUpdate = (symbol: string, price: number) => {
    if (!symbol || typeof price !== 'number' || price <= 0) return;
    setLivePrices((prev) => (prev[symbol] === price ? prev : { ...prev, [symbol]: price }));
  };

  // Dual Portfolio & Timeframe State
  const [portfolioType, setPortfolioType] = useState<'USER' | 'SYSTEM'>('USER');
  const [timeframe, setTimeframe] = useState<'1d' | '1w' | '3m' | '6m' | '1y' | 'all'>('all');
  const [portfolioStats, setPortfolioStats] = useState<PortfolioStats | null>(null);
  const [statsLoading, setStatsLoading] = useState<boolean>(false);
  const [isCashModalOpen, setIsCashModalOpen] = useState(false);
  const [cashInput, setCashInput] = useState<string>('');
  const [cashAction, setCashAction] = useState<'DEPOSIT' | 'WITHDRAW'>('DEPOSIT');
  const [savingCash, setSavingCash] = useState(false);

  const [accountMode, setAccountMode] = useState<'PERSONAL' | 'FUNDED'>('PERSONAL');

  useEffect(() => {
    const saved = localStorage.getItem('accountMode');
    if (saved === 'PERSONAL' || saved === 'FUNDED') {
      setAccountMode(saved);
    }
  }, []);

  const handleAccountModeChange = (mode: 'PERSONAL' | 'FUNDED') => {
    setAccountMode(mode);
    localStorage.setItem('accountMode', mode);
    // Trigger custom event to notify other components (e.g. StockTerminal, HistoryPageClient) on the same page
    window.dispatchEvent(new Event('accountModeChanged'));
  };

  const [isScanning, setIsScanning] = useState(false);
  const [activeRoutine, setActiveRoutine] = useState<'OPENING_BELL' | 'MACRO_SCAN' | null>(null);
  const [scannerResult, setScannerResult] = useState<string | null>(null);

  const handleRunScanner = async (routine: 'OPENING_BELL' | 'MACRO_SCAN' = 'OPENING_BELL', isAuto = false) => {
    setIsScanning(true);
    setActiveRoutine(routine);
    setScannerResult(null);
    try {
      const res = await fetch('/api/scanner/run?manual=true', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-manual-trigger': 'true'
        },
        body: JSON.stringify({ routine })
      });
      const json = await res.json();
      if (json.success) {
        setScannerResult(isAuto ? `⚡ تم المسح الآلي اللحظي فور افتتاح السوق الأمريكية (09:30 AM NY): ${json.message}` : json.message);
        // Refresh data
        fetchSignals();
        fetchPortfolioStats(portfolioType, timeframe);
      } else {
        if (!isAuto) alert(json.error || 'فشلت عملية تشغيل رادار السوق');
      }
    } catch (err: any) {
      if (!isAuto) alert(err.message || 'حدث خطأ غير متوقع أثناء تشغيل الرادار');
    } finally {
      setIsScanning(false);
      setActiveRoutine(null);
    }
  };

  const showDrawdownAlerts = accountMode === 'FUNDED';
  const dailyNear = showDrawdownAlerts && !!(portfolioStats && portfolioStats.currentDailyDrawdown >= portfolioStats.maxDailyDrawdownLimit * 0.8);
  const dailyHit = showDrawdownAlerts && !!(portfolioStats && portfolioStats.currentDailyDrawdown >= portfolioStats.maxDailyDrawdownLimit);
  const totalNear = showDrawdownAlerts && !!(portfolioStats && portfolioStats.currentTotalDrawdown >= portfolioStats.maxTotalDrawdownLimit * 0.8);
  const totalHit = showDrawdownAlerts && !!(portfolioStats && portfolioStats.currentTotalDrawdown >= portfolioStats.maxTotalDrawdownLimit);

  let accentColorClass = 'bg-white';
  let accentTextClass = 'text-white';
  let accentBorderClass = 'border-neutral-900';
  let pulseShadowClass = 'shadow-[0_0_8px_#ffffff]';

  if (showDrawdownAlerts) {
    if (dailyHit || totalHit) {
      accentColorClass = 'bg-red-500';
      accentTextClass = 'text-red-500';
      accentBorderClass = 'border-red-900/60';
      pulseShadowClass = 'shadow-[0_0_8px_#ef4444]';
    } else if (dailyNear || totalNear) {
      accentColorClass = 'bg-yellow-500';
      accentTextClass = 'text-yellow-500';
      accentBorderClass = 'border-yellow-900/60';
      pulseShadowClass = 'shadow-[0_0_8px_#f59e0b]';
    }
  }

  const fetchSignals = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/signals?status=Active&limit=100&market=${marketFilter}`);
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setSignals(json.data);
        const map: Record<string, number> = {};
        json.data.forEach((s: Signal) => {
          if (s.symbol && typeof s.currentPrice === 'number' && s.currentPrice > 0) {
            map[s.symbol] = s.currentPrice;
          }
        });
        setLivePrices((prev) => ({ ...prev, ...map }));
      } else {
        setError(json.error || 'فشل في جلب البيانات');
      }
    } catch (err: any) {
      setError(err.message || 'حدث خطأ غير متوقع');
    } finally {
      setLoading(false);
    }
  };

  const fetchPortfolioStats = async (pType = portfolioType, tf = timeframe, mFilter = marketFilter) => {
    setStatsLoading(true);
    try {
      const timestamp = Date.now();
      const res = await fetch(`/api/portfolio/stats?type=${pType}&timeframe=${tf}&market=${mFilter}&t=${timestamp}`, {
        method: 'GET',
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
      if (!res.ok) {
        console.error("API returned an error:", res.status);
        return;
      }
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        console.error("API returned non-JSON response");
        return;
      }
      const data = await res.json();
      console.log("🔥 NUCLEAR TEST - API PAYLOAD:", data);
      const statsPayload = data.data || data;
      setPortfolioStats(statsPayload);

      if (statsPayload && Array.isArray(statsPayload.positions)) {
        const statsMap: Record<string, number> = {};
        statsPayload.positions.forEach((pos: any) => {
          const price = pos.livePrice || pos.currentPrice;
          if (pos.symbol && typeof price === 'number' && price > 0) {
            statsMap[pos.symbol] = price;
          }
        });
        setLivePrices((prev) => ({ ...prev, ...statsMap }));
      }
    } catch (err) {
      console.error('Failed to fetch portfolio stats:', err);
    } finally {
      setStatsLoading(false);
    }
  };

  useEffect(() => {
    fetchSignals();
    fetchPortfolioStats(portfolioType, timeframe, marketFilter);

    // Auto poll stats every 30 seconds
    const interval = setInterval(() => fetchPortfolioStats(portfolioType, timeframe, marketFilter), 30000);
    return () => clearInterval(interval);
  }, [marketFilter, portfolioType, timeframe]);

  // US Market Open Precision Trigger (09:30:00 AM NY Time)
  useEffect(() => {
    const calculateMsUntilMarketOpen = (): number | null => {
      const now = new Date();
      const nyDateStr = now.toLocaleDateString('en-US', { timeZone: 'America/New_York' });
      const nyTimeStr = now.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour12: false });
      
      const nyDateObj = new Date(`${nyDateStr} ${nyTimeStr}`);
      const dayOfWeek = nyDateObj.getDay(); // 0 = Sun, 1 = Mon, ..., 5 = Fri, 6 = Sat

      // Only run on weekdays (Monday - Friday)
      if (dayOfWeek === 0 || dayOfWeek === 6) return null;

      // Target 09:30:00 AM today in NY
      const targetNYObj = new Date(`${nyDateStr} 09:30:00`);
      const diffMs = targetNYObj.getTime() - nyDateObj.getTime();

      // If current NY time is before 09:30:00 AM today
      if (diffMs > 0) {
        return diffMs;
      }
      return null;
    };

    const msRemaining = calculateMsUntilMarketOpen();
    if (msRemaining !== null && msRemaining > 0) {
      console.log(`[AUTO-PILOT] Scheduled market open scanner in ${(msRemaining / 1000).toFixed(1)} seconds.`);
      const timer = setTimeout(() => {
        handleRunScanner('OPENING_BELL', true);
      }, msRemaining);

      return () => clearTimeout(timer);
    }
  }, []);

  const handleCashSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingCash(true);
    try {
      const res = await fetch('/api/portfolio/cash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: cashAction,
          amount: Number(cashInput),
          type: portfolioType,
          market: marketFilter
        }),
      });
      const json = await res.json();
      if (json.success) {
        setIsCashModalOpen(false);
        setCashInput('');
        fetchPortfolioStats(portfolioType, timeframe);
      } else {
        alert(json.error || 'فشلت عملية إيداع/سحب السيولة');
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

  // Client-Side Recalculation for Live Accuracy
  const accurateCash = portfolioStats?.availableCash || 0;

  const { liveInvestedCapital, liveTotalEquity, liveTotalPnL, liveTotalPnLPercentage } = React.useMemo(() => {
    if (!portfolioStats) {
      return {
        liveInvestedCapital: 0,
        liveTotalEquity: 0,
        liveTotalPnL: 0,
        liveTotalPnLPercentage: 0,
      };
    }

    const positions = portfolioStats.positions || [];
    if (positions.length > 0) {
      let calcInvested = 0;
      let calcFloatingPnL = 0;

      positions.forEach((pos) => {
        const qty = pos.quantity || 0;
        const entry = pos.actualEntryPrice || 0;
        // FORCE use of the shared livePrices dictionary, fallback to pos.livePrice -> pos.currentPrice -> entry
        const currentLive = livePrices[pos.symbol] || pos.livePrice || pos.currentPrice || entry;

        calcInvested += (currentLive * qty);
        calcFloatingPnL += ((currentLive - entry) * qty);
      });

      const realized = portfolioStats.realizedPnL || 0;
      const finalLiveTotalPnL = calcFloatingPnL + realized;

      // Starting balance is current equity minus total PnL
      const currentEquity = accurateCash + calcInvested;
      const startingBalance = currentEquity - finalLiveTotalPnL;
      const calculatedPct = startingBalance > 0 ? (finalLiveTotalPnL / startingBalance) * 100 : 0;

      return {
        liveInvestedCapital: calcInvested,
        liveTotalEquity: currentEquity,
        liveTotalPnL: finalLiveTotalPnL,
        liveTotalPnLPercentage: calculatedPct,
      };
    }

    return {
      liveInvestedCapital: portfolioStats.investedCapital || 0,
      liveTotalEquity: portfolioStats.totalPortfolioValue || 0,
      liveTotalPnL: portfolioStats.totalPnL || 0,
      liveTotalPnLPercentage: portfolioStats.totalProfitLossPercentage || 0,
    };
  }, [portfolioStats, accurateCash, livePrices]);

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

        <div className="flex flex-wrap items-center gap-3">
          {/* Opening Bell Scanner Button */}
          <button
            onClick={() => handleRunScanner('OPENING_BELL', false)}
            disabled={isScanning}
            className="px-3 py-1.5 text-xs font-bold bg-neutral-900 hover:bg-neutral-850 text-white border border-neutral-800 rounded transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 font-sans"
          >
            {isScanning && activeRoutine === 'OPENING_BELL' ? (
              <>
                <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span>مسح الافتتاح...</span>
              </>
            ) : (
              <span>⚡ رادار الافتتاح</span>
            )}
          </button>

          {/* Macro Scan Button */}
          <button
            onClick={() => handleRunScanner('MACRO_SCAN', false)}
            disabled={isScanning}
            className="px-3 py-1.5 text-xs font-bold bg-white text-black hover:bg-neutral-200 border border-white rounded transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 font-sans"
          >
            {isScanning && activeRoutine === 'MACRO_SCAN' ? (
              <>
                <svg className="animate-spin h-3.5 w-3.5 text-black" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span>تحليل الفرص الكبرى...</span>
              </>
            ) : (
              <span>🏛️ مسح الفرص الكبرى</span>
            )}
          </button>

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

      {scannerResult && (
        <div className="p-4 bg-emerald-950/40 border border-emerald-500/60 rounded-lg text-emerald-400 text-xs font-sans flex items-center justify-between transition-all">
          <span>{scannerResult}</span>
          <button
            onClick={() => setScannerResult(null)}
            className="text-emerald-400 hover:text-white font-bold ml-2 font-mono"
          >
            [X]
          </button>
        </div>
      )}

      {/* Live Portfolio Equity & Balance Banner */}
      <div className={`border bg-neutral-950 p-6 rounded-lg space-y-4 text-right transition duration-300 ${accentBorderClass}`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-neutral-900 pb-4 gap-4">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full animate-pulse shrink-0 ${accentColorClass} ${pulseShadowClass}`} />
            <h2 className="text-xs font-black uppercase tracking-wider text-neutral-400 font-mono">
              [ لوحة تحكم المحفظة الحية / LIVE PORTFOLIO EQUITY ]
            </h2>
          </div>

          <div className="flex items-center gap-3 flex-wrap md:flex-nowrap">
            {/* Account Mode Toggle Switch */}
            <div className="flex p-0.5 rounded bg-neutral-900 border border-neutral-800">
              <button
                onClick={() => handleAccountModeChange('PERSONAL')}
                className={`px-3 py-1 text-xs font-bold transition rounded-sm ${
                  accountMode === 'PERSONAL' ? 'bg-white text-black font-black' : 'text-neutral-450 hover:text-white'
                }`}
              >
                حساب شخصي 👤
              </button>
              <button
                onClick={() => handleAccountModeChange('FUNDED')}
                className={`px-3 py-1 text-xs font-bold transition rounded-sm ${
                  accountMode === 'FUNDED' ? 'bg-white text-black font-black' : 'text-neutral-450 hover:text-white'
                }`}
              >
                حساب ممول 🏆
              </button>
            </div>

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

        {/* Drawdown Gauges */}
        {accountMode === 'FUNDED' && portfolioStats && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-b border-neutral-900 pb-4">
            {/* Daily Drawdown Gauge */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="font-mono text-neutral-400">
                  {portfolioStats.currentDailyDrawdown?.toFixed(2)}% / {portfolioStats.maxDailyDrawdownLimit?.toFixed(2)}%
                </span>
                <span className="font-bold text-white">
                  التراجع اليومي (Daily Drawdown) ⏱️
                </span>
              </div>
              <div className="w-full h-3 bg-neutral-900 border border-neutral-800 rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-300 ${
                    portfolioStats.currentDailyDrawdown >= portfolioStats.maxDailyDrawdownLimit
                      ? 'bg-red-500'
                      : portfolioStats.currentDailyDrawdown >= portfolioStats.maxDailyDrawdownLimit * 0.8
                      ? 'bg-yellow-500'
                      : 'bg-white'
                  }`}
                  style={{ width: `${Math.min(100, (portfolioStats.currentDailyDrawdown / (portfolioStats.maxDailyDrawdownLimit || 5)) * 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] font-mono text-neutral-500">
                <span>الحد الأقصى: {portfolioStats.maxDailyDrawdownLimit}%</span>
                <span>بداية اليوم: {formatCurrency(portfolioStats.dailyStartEquity || 0)}</span>
              </div>
            </div>

            {/* Max Drawdown Gauge */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="font-mono text-neutral-400">
                  {portfolioStats.currentTotalDrawdown?.toFixed(2)}% / {portfolioStats.maxTotalDrawdownLimit?.toFixed(2)}%
                </span>
                <span className="font-bold text-white">
                  التراجع الكلي (Max Drawdown) 🛡️
                </span>
              </div>
              <div className="w-full h-3 bg-neutral-900 border border-neutral-800 rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-300 ${
                    portfolioStats.currentTotalDrawdown >= portfolioStats.maxTotalDrawdownLimit
                      ? 'bg-red-500'
                      : portfolioStats.currentTotalDrawdown >= portfolioStats.maxTotalDrawdownLimit * 0.8
                      ? 'bg-yellow-500'
                      : 'bg-white'
                  }`}
                  style={{ width: `${Math.min(100, (portfolioStats.currentTotalDrawdown / (portfolioStats.maxTotalDrawdownLimit || 10)) * 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] font-mono text-neutral-500">
                <span>الحد الأقصى: {portfolioStats.maxTotalDrawdownLimit}%</span>
                <span>أعلى قمة للمحفظة: {formatCurrency(portfolioStats.peakEquity || 0)}</span>
              </div>
            </div>
          </div>
        )}

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
              <span className={`text-xl sm:text-2xl font-black block font-mono ${accentTextClass}`}>
                {formatCurrency(liveTotalEquity)}
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
              {portfolioType === 'USER' && accountMode === 'PERSONAL' && (
                <button
                  onClick={() => {
                    setCashInput('');
                    setCashAction('DEPOSIT');
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
                {formatCurrency(accurateCash)}
              </span>
            )}
            <span className="text-[9px] text-neutral-500 font-mono">
              النقد المتاح ({portfolioType === 'USER' ? 'المحفظة الشخصية' : 'محفظة النظام'})
            </span>
          </div>

          {/* Card 3: Total Invested Cost / Daily Start Equity */}
          {accountMode === 'PERSONAL' ? (
            <div className="border border-neutral-900 bg-neutral-900/30 p-4 rounded-lg flex flex-col justify-between space-y-2">
              <span className="text-[10px] text-neutral-500 font-mono font-bold uppercase block">
                رأس المال المستثمر 📉
              </span>
              {statsLoading ? (
                <div className="h-8 w-32 bg-neutral-900 animate-pulse rounded my-1" />
              ) : (
                <span className="text-xl sm:text-2xl font-black text-white block font-mono">
                  {formatCurrency(liveInvestedCapital)}
                </span>
              )}
              <span className="text-[9px] text-neutral-500 font-mono">
                في {portfolioStats?.activePositionsCount || 0} مراكز نشطة
              </span>
            </div>
          ) : (
            <div className="border border-neutral-900 bg-neutral-900/30 p-4 rounded-lg flex flex-col justify-between space-y-2">
              <span className="text-[10px] text-neutral-500 font-mono font-bold uppercase block">
                رأس مال بداية اليوم ⏱️
              </span>
              {statsLoading ? (
                <div className="h-8 w-32 bg-neutral-900 animate-pulse rounded my-1" />
              ) : (
                <span className="text-xl sm:text-2xl font-black text-white block font-mono">
                  {formatCurrency(portfolioStats?.dailyStartEquity || 0)}
                </span>
              )}
              <span className="text-[9px] text-neutral-500 font-mono">
                (المستهدَف لإعادة التعيين اليومي)
              </span>
            </div>
          )}

          {/* Card 4: Total PnL / Trailing Peak */}
          {accountMode === 'PERSONAL' ? (
            <div className="border border-neutral-900 bg-neutral-900/30 p-4 rounded-lg flex flex-col justify-between space-y-2">
              <span className="text-[10px] text-neutral-500 font-mono font-bold uppercase block">
                إجمالي الأرباح/الخسائر ⚡
              </span>
              {statsLoading ? (
                <div className="h-8 w-32 bg-neutral-900 animate-pulse rounded my-1" />
              ) : (
                <div className="flex items-baseline gap-2">
                  <span className={`text-xl sm:text-2xl font-mono ${liveTotalPnL >= 0 ? 'text-white font-black' : 'text-neutral-500 font-normal'}`}>
                    {liveTotalPnL >= 0 ? '+' : ''}
                    {formatCurrency(liveTotalPnL)}
                  </span>
                  <span className={`text-xs font-mono font-bold dir-ltr ${liveTotalPnL >= 0 ? 'text-white' : 'text-neutral-500'}`}>
                    ({liveTotalPnLPercentage >= 0 ? '+' : ''}
                    {liveTotalPnLPercentage.toFixed(2)}%)
                  </span>
                </div>
              )}
              <span className="text-[9px] text-neutral-500 font-mono">
                الأداء خلال الفترة المحددة
              </span>
            </div>
          ) : (
            <div className="border border-neutral-900 bg-neutral-900/30 p-4 rounded-lg flex flex-col justify-between space-y-2">
              <span className="text-[10px] text-neutral-500 font-mono font-bold uppercase block">
                أعلى قيمة مسجلة للمحفظة 🛡️
              </span>
              {statsLoading ? (
                <div className="h-8 w-32 bg-neutral-900 animate-pulse rounded my-1" />
              ) : (
                <span className="text-xl sm:text-2xl font-black text-white block font-mono">
                  {formatCurrency(portfolioStats?.peakEquity || 0)}
                </span>
              )}
            </div>
          )}
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
              <h3 className="text-base font-black text-white">إيداع / سحب السيولة (Deposit / Withdraw Cash)</h3>
              <p className="text-[10px] text-neutral-500 font-mono mt-1">تعديل السيولة الحالية عن طريق الإيداع أو السحب</p>
            </div>

            <form onSubmit={handleCashSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-neutral-450 block">نوع العملية</label>
                <select
                  value={cashAction}
                  onChange={(e) => setCashAction(e.target.value as 'DEPOSIT' | 'WITHDRAW')}
                  className="w-full bg-neutral-900 border border-neutral-800 text-white rounded p-2 text-xs focus:outline-none focus:border-white cursor-pointer"
                >
                  <option value="DEPOSIT">إيداع رأس مال (+) / Deposit</option>
                  <option value="WITHDRAW">سحب رأس مال (-) / Withdraw</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-neutral-450 block">مبلغ العملية</label>
                <input
                  type="number"
                  step="any"
                  value={cashInput}
                  onChange={(e) => setCashInput(e.target.value)}
                  className="w-full bg-neutral-900 border border-neutral-800 text-white rounded p-2 text-xs font-mono focus:outline-none focus:border-white"
                  placeholder="أدخل المبلغ..."
                  required
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={savingCash}
                  className="flex-1 py-2 text-xs font-bold bg-white text-black border border-white hover:bg-neutral-200 rounded transition disabled:opacity-40 cursor-pointer"
                >
                  {savingCash ? 'جاري الحفظ...' : 'تأكيد العملية'}
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
