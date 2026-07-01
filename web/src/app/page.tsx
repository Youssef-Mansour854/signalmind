'use client';

import React, { useState, useEffect } from 'react';

interface Trade {
  _id: string;
  symbol: string;
  market: 'US' | 'EGX';
  signalType: 'BUY' | 'SELL' | 'HOLD';
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  currentPrice: number;
  exitPrice?: number;
  exit_price?: number;
  status: 'Pending' | 'Active' | 'ACTIVE' | 'CLOSED_WIN' | 'CLOSED_LOSS' | 'Hit TP' | 'Hit SL' | 'Expired';
  activatedAt?: string;
  closedAt?: string;
  closed_at?: string;
  pnlPercentage?: number;
  explanationArabic: string;
  createdAt: string;
  updatedAt: string;
}

interface PortfolioItem {
  _id: string;
  signalId: string;
  symbol: string;
  market: 'US' | 'EGX';
  actualEntryPrice: number;
  positionSize: number;
  quantity?: number;
  status: 'ACTIVE' | 'CLOSED_WIN' | 'CLOSED_LOSS' | 'Hit TP' | 'Hit SL' | 'CLOSED';
  executedAt: string;
  currentPrice?: number;
  currentPnL?: number;
  exitPrice?: number;
  closeDate?: string;
  closedAt?: string;
  finalPnL?: number;
  closeReason?: string;
  pnlPercentage?: number;
}

interface AnalyticsData {
  timeframe: string;
  market: string;
  shadow: {
    totalClosed: number;
    winRate: number;
    avgPnl: number;
  };
  actual: {
    totalClosed: number;
    winRate: number;
    avgPnl: number;
  };
}

export default function Dashboard() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  
  const [marketFilter, setMarketFilter] = useState<'EGX' | 'US'>('EGX');
  const [timeframe, setTimeframe] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('latest');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null);
  const [actualEntryPrice, setActualEntryPrice] = useState<number>(0);
  const [positionSize, setPositionSize] = useState<string>('');

  // Close Trade Modal State
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
  const [selectedPortfolioItem, setSelectedPortfolioItem] = useState<PortfolioItem | null>(null);
  const [exitPrice, setExitPrice] = useState<number>(0);
  const [closeReason, setCloseReason] = useState<string>('Manual Close');

  const handleCloseTradeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPortfolioItem) return;

    try {
      const res = await fetch('/api/portfolio', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedPortfolioItem._id,
          exitPrice,
          closeReason
        })
      });

      const json = await res.json();
      if (json.success) {
        setIsCloseModalOpen(false);
        await Promise.all([fetchPortfolio(), fetchAnalytics()]); // Refresh both
      } else {
        alert(json.error || 'فشلت عملية إغلاق الصفقة');
      }
    } catch (err: any) {
      alert(err.message || 'حدث خطأ غير متوقع');
    }
  };

  const fetchTrades = async () => {
    try {
      const res = await fetch('/api/trades');
      const json = await res.json();
      if (json.success) {
        setTrades(json.data);
      } else {
        setError(json.error || 'فشل في جلب البيانات');
      }
    } catch (err: any) {
      setError(err.message || 'حدث خطأ غير متوقع');
    }
  };

  const fetchPortfolio = async () => {
    try {
      const res = await fetch('/api/portfolio');
      const json = await res.json();
      if (json.success) {
        setPortfolio(json.data);
      }
    } catch (err) {
      console.error('Error fetching portfolio:', err);
    }
  };

  const fetchAnalytics = async () => {
    try {
      const res = await fetch(`/api/analytics?timeframe=${timeframe}&market=${marketFilter}`);
      const json = await res.json();
      if (json.success) {
        setAnalytics(json.data);
      }
    } catch (err) {
      console.error('Error fetching analytics:', err);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    await Promise.all([fetchTrades(), fetchPortfolio(), fetchAnalytics()]);
    setLoading(false);
  };

  // Run on mount
  useEffect(() => {
    fetchData();
  }, []);

  // Update analytics dynamically when timeframe or market filter changes
  useEffect(() => {
    fetchAnalytics();
  }, [timeframe, marketFilter]);

  const handleExecuteTradeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTrade) return;

    try {
      const res = await fetch('/api/portfolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signalId: selectedTrade._id,
          symbol: selectedTrade.symbol,
          market: selectedTrade.market,
          actualEntryPrice,
          positionSize: Number(positionSize)
        })
      });

      const json = await res.json();
      if (json.success) {
        setIsModalOpen(false);
        await Promise.all([fetchPortfolio(), fetchAnalytics()]); // Refresh both
      } else {
        alert(json.error || 'فشلت عملية التنفيذ');
      }
    } catch (err: any) {
      alert(err.message || 'حدث خطأ غير متوقع');
    }
  };

  const calculateMetrics = (trade: Trade) => {
    const entry = trade.entryPrice || 0;
    const tp = trade.takeProfit || 0;
    const sl = trade.stopLoss || 0;

    const expectedProfitPct = entry > 0 ? ((tp - entry) / entry) * 100 : 0;
    const riskPct = entry > 0 ? ((entry - sl) / entry) * 100 : 0;
    
    const diffSl = entry - sl;
    const rrr = diffSl > 0 ? (tp - entry) / diffSl : 0;

    return {
      expectedProfitPct,
      riskPct,
      rrr
    };
  };

  // Filter lists based on the selected market tab and status compatibility checks
  const rawActiveTrades = trades.filter(t => (t.status === 'ACTIVE' || t.status === 'Active' || t.status === 'Pending') && t.market === marketFilter);
  const realizedWins = trades.filter(t => (t.status === 'CLOSED_WIN' || t.status === 'Hit TP') && t.market === marketFilter);
  const triggeredLosses = trades.filter(t => (t.status === 'CLOSED_LOSS' || t.status === 'Hit SL') && t.market === marketFilter);
  const activePortfolio = portfolio.filter(p => p.status === 'ACTIVE' && p.market === marketFilter);

  const totalPortfolioValue = activePortfolio.reduce((sum, item) => {
    const current = item.currentPrice || item.actualEntryPrice || 0;
    const qty = item.quantity || (item.actualEntryPrice > 0 ? item.positionSize / item.actualEntryPrice : 0);
    return sum + (current * qty);
  }, 0);

  // Map and calculate mathematical metrics for active positions
  const activeTradesWithMetrics = rawActiveTrades.map(trade => {
    const metrics = calculateMetrics(trade);
    return {
      ...trade,
      ...metrics
    };
  });

  // Client-side dynamic sorting of active positions
  const sortedActiveTrades = [...activeTradesWithMetrics].sort((a, b) => {
    if (sortBy === 'rrr') {
      return b.rrr - a.rrr;
    }
    if (sortBy === 'profit') {
      return b.expectedProfitPct - a.expectedProfitPct;
    }
    if (sortBy === 'risk') {
      return b.riskPct - a.riskPct;
    }
    // Default: latest (createdAt descending)
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'غير محدد';
    return new Date(dateStr).toLocaleDateString('ar-EG', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatPrice = (price: number, market: string, symbol: string) => {
    const formatted = price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (market === 'EGX' || symbol.endsWith('.CA')) {
      return `${formatted} ج.م`;
    }
    return `$${formatted}`;
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans antialiased" dir="rtl">
      {/* Header */}
      <header className="border-b border-neutral-900 py-6 bg-neutral-950">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white uppercase font-mono">
              محطة سيجنال مايند / SignalMind
            </h1>
            <p className="text-xs text-neutral-500 mt-1 font-mono">
              التداول الخوارزمي الذكي والتحليل الإحصائي وإدارة المراكز
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={fetchData}
              className="px-4 py-1.5 text-xs border border-neutral-800 hover:border-neutral-600 transition bg-neutral-900/40 text-neutral-300 font-mono rounded"
            >
              تحديث البيانات
            </button>
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] text-neutral-400 font-mono uppercase tracking-wider">
              متصل بالشبكة
            </span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-6 py-10 space-y-10">

        {/* بطاقات الأداء (Premium Stat Cards) */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 font-sans">
          {/* إجمالي قيمة المحفظة النشطة */}
          <div className="border border-neutral-900 bg-neutral-950/40 p-5 rounded space-y-4">
            <div className="flex items-center justify-between text-neutral-500 text-[10px] uppercase font-bold tracking-wider font-mono">
              <span>قيمة المحفظة النشطة / Portfolio Value</span>
              <span>💰</span>
            </div>
            <div>
              <span className="text-[10px] text-neutral-500 block">القيمة الحالية (Current Value)</span>
              <span className="text-xl font-bold text-white font-mono">
                {formatPrice(totalPortfolioValue, marketFilter, '')}
              </span>
            </div>
          </div>

          {/* نسبة النجاح */}
          <div className="border border-neutral-900 bg-neutral-950/40 p-5 rounded space-y-4">
            <div className="flex items-center justify-between text-neutral-500 text-[10px] uppercase font-bold tracking-wider font-mono">
              <span>نسبة النجاح / Win Rate</span>
              <span>🎯</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-[10px] text-neutral-500 block">الفعلي (Actual)</span>
                <span className="text-xl font-bold text-white font-mono">
                  {analytics?.actual.winRate || 0}%
                </span>
              </div>
              <div className="border-r border-neutral-900 pr-4">
                <span className="text-[10px] text-neutral-500 block">الافتراضي (AI)</span>
                <span className="text-xl font-bold text-neutral-400 font-mono">
                  {analytics?.shadow.winRate || 0}%
                </span>
              </div>
            </div>
          </div>

          {/* إجمالي الصفقات */}
          <div className="border border-neutral-900 bg-neutral-950/40 p-5 rounded space-y-4">
            <div className="flex items-center justify-between text-neutral-500 text-[10px] uppercase font-bold tracking-wider font-mono">
              <span>إجمالي الصفقات المغلقة / Closed</span>
              <span>📊</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-[10px] text-neutral-500 block">الفعلي (Actual)</span>
                <span className="text-xl font-bold text-white font-mono">
                  {analytics?.actual.totalClosed || 0}
                </span>
              </div>
              <div className="border-r border-neutral-900 pr-4">
                <span className="text-[10px] text-neutral-500 block">الافتراضي (AI)</span>
                <span className="text-xl font-bold text-neutral-400 font-mono">
                  {analytics?.shadow.totalClosed || 0}
                </span>
              </div>
            </div>
          </div>

          {/* متوسط العائد */}
          <div className="border border-neutral-900 bg-neutral-950/40 p-5 rounded space-y-4">
            <div className="flex items-center justify-between text-neutral-500 text-[10px] uppercase font-bold tracking-wider font-mono">
              <span>متوسط العائد / Avg Return</span>
              <span>📈</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-[10px] text-neutral-500 block">الفعلي (Actual)</span>
                <span className={`text-xl font-bold font-mono ${
                  (analytics?.actual.avgPnl || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}>
                  {(analytics?.actual.avgPnl || 0) >= 0 ? '+' : ''}{analytics?.actual.avgPnl || 0}%
                </span>
              </div>
              <div className="border-r border-neutral-900 pr-4">
                <span className="text-[10px] text-neutral-500 block">الافتراضي (AI)</span>
                <span className={`text-xl font-bold font-mono ${
                  (analytics?.shadow.avgPnl || 0) >= 0 ? 'text-emerald-500/80' : 'text-rose-500/80'
                }`}>
                  {(analytics?.shadow.avgPnl || 0) >= 0 ? '+' : ''}{analytics?.shadow.avgPnl || 0}%
                </span>
              </div>
            </div>
          </div>
        </div>
        
        {/* Market & Timeframe Selector Bar */}
        <div className="flex flex-col md:flex-row justify-between items-center border-b border-neutral-900 pb-4 gap-4">
          {/* Market Selector & Sort Dropdown */}
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
            {/* Market Tabs */}
            <div className="flex gap-2 p-1 rounded bg-neutral-900/50 border border-neutral-900 w-full sm:w-auto justify-center">
              <button
                onClick={() => setMarketFilter('EGX')}
                className={`px-6 py-1.5 text-xs font-bold transition rounded cursor-pointer ${
                  marketFilter === 'EGX'
                    ? 'bg-neutral-800 text-white shadow-sm'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                السوق المصري (EGX)
              </button>
              <button
                onClick={() => setMarketFilter('US')}
                className={`px-6 py-1.5 text-xs font-bold transition rounded cursor-pointer ${
                  marketFilter === 'US'
                    ? 'bg-neutral-800 text-white shadow-sm'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                السوق الأمريكي (US)
              </button>
            </div>

            {/* sleek dropdown for dynamic sorting */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-neutral-900 border border-neutral-850 text-neutral-300 py-1.5 px-4 text-xs rounded focus:outline-none focus:border-neutral-600 font-bold font-sans cursor-pointer w-full sm:w-auto"
            >
              <option value="latest">الأحدث (تاريخ التوصية)</option>
              <option value="rrr">الأفضل (معدل العائد/المخاطرة RRR)</option>
              <option value="profit">الأعلى عائداً متوقعاً</option>
              <option value="risk">الأكثر خطورة</option>
            </select>
          </div>

          {/* Timeframe Selector Toggle Group */}
          <div className="flex flex-wrap gap-2 p-1 rounded bg-neutral-900/50 border border-neutral-900 w-full md:w-auto justify-center font-mono">
            {[
              { id: 'weekly', label: 'أسبوعي' },
              { id: 'monthly', label: 'شهري' },
              { id: 'quarterly', label: 'ربع سنوي' },
              { id: 'semiannual', label: 'نصف سنوي' },
              { id: 'yearly', label: 'سنوي' },
              { id: 'all', label: 'الكل' }
            ].map(tf => (
              <button
                key={tf.id}
                onClick={() => setTimeframe(tf.id)}
                className={`px-4 py-1.5 text-[10px] font-bold transition rounded cursor-pointer ${
                  timeframe === tf.id
                    ? 'bg-neutral-800 text-white'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>
        </div>

        {loading && (
          <div className="py-20 text-center font-mono text-xs text-neutral-500">
            جاري تحميل سجلات التداول من قاعدة البيانات...
          </div>
        )}

        {error && (
          <div className="p-4 border border-neutral-800 bg-neutral-900/50 text-neutral-400 text-xs font-mono rounded">
            خطأ: {error}
          </div>
        )}

        {!loading && !error && (
          <>
            {/* User Portfolio Section */}
            <section className="space-y-4">
              <div className="flex items-center justify-between border-b border-neutral-900 pb-2">
                <h2 className="text-xs font-bold uppercase tracking-wider font-mono text-neutral-300 flex items-center gap-2">
                  <span>[ محفظتي الفعلية ]</span>
                  <span className="text-xs text-neutral-500 font-normal">({activePortfolio.length})</span>
                </h2>
              </div>

              {activePortfolio.length === 0 ? (
                <div className="py-8 text-center text-xs text-neutral-600 border border-neutral-900 rounded bg-neutral-900/10">
                  لا توجد صفقات منفذة حالياً في محفظتك لهذا السوق.
                </div>
              ) : (
                <div className="overflow-x-auto border border-neutral-900 rounded">
                  <table className="w-full border-collapse text-right text-xs">
                    <thead>
                      <tr className="border-b border-neutral-900 bg-neutral-900/60 text-neutral-200 sticky top-0 bg-neutral-950 z-10 font-bold">
                        <th className="p-4">الرمز</th>
                        <th className="p-4">سعر الدخول الفعلي</th>
                        <th className="p-4">السعر الحالي</th>
                        <th className="p-4">القيمة المستثمرة</th>
                        <th className="p-4">الربح/الخسارة</th>
                        <th className="p-4">الحالة</th>
                        <th className="p-4 text-left">تاريخ التنفيذ</th>
                        <th className="p-4 text-center">الإجراء</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-900 bg-neutral-950/20">
                      {activePortfolio.map(item => {
                        const current = item.currentPrice || item.actualEntryPrice || 0;
                        const pnl = item.currentPnL !== undefined ? item.currentPnL : 0;
                        const pnlPct = item.pnlPercentage !== undefined ? item.pnlPercentage : (item.actualEntryPrice > 0 ? ((current - item.actualEntryPrice) / item.actualEntryPrice) * 100 : 0);
                        
                        return (
                          <tr key={item._id} className="hover:bg-neutral-900/20 transition">
                            <td className="p-4 font-bold text-white tracking-wide">{item.symbol}</td>
                            <td className="p-4 text-neutral-300">{formatPrice(item.actualEntryPrice, item.market, item.symbol)}</td>
                            <td className="p-4 text-neutral-100">{formatPrice(current, item.market, item.symbol)}</td>
                            <td className="p-4 text-neutral-200">{formatPrice(item.positionSize, item.market, item.symbol)}</td>
                            <td className={`p-4 font-bold ${pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {formatPrice(pnl, item.market, item.symbol)} ({pnl >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%)
                            </td>
                            <td className="p-4">
                              <span className="inline-block px-2 py-0.5 text-[10px] font-bold bg-neutral-900 text-neutral-400 border border-neutral-800 rounded uppercase">
                                مفتوح / ACTIVE
                              </span>
                            </td>
                            <td className="p-4 text-left text-neutral-500">{formatDate(item.executedAt)}</td>
                            <td className="p-4 text-center">
                              <button
                                onClick={() => {
                                  setSelectedPortfolioItem(item);
                                  setExitPrice(current || item.actualEntryPrice);
                                  setCloseReason('Manual Close');
                                  setIsCloseModalOpen(true);
                                }}
                                className="px-3 py-1 text-[10px] border border-rose-900/60 hover:border-rose-600 transition bg-rose-950/20 text-rose-300 font-bold rounded cursor-pointer"
                              >
                                إغلاق الصفقة
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* 1. Active Positions Table */}
            <section className="space-y-4">
              <div className="flex items-center justify-between border-b border-neutral-900 pb-2">
                <h2 className="text-xs font-bold uppercase tracking-wider font-mono text-neutral-300 flex items-center gap-2">
                  <span>[ الصفقات النشطة ]</span>
                  <span className="text-xs text-neutral-500 font-normal">({sortedActiveTrades.length})</span>
                </h2>
              </div>

              {sortedActiveTrades.length === 0 ? (
                <div className="py-8 text-center text-xs text-neutral-600 border border-neutral-900 rounded bg-neutral-900/10">
                  لا توجد صفقات نشطة حالياً في هذا السوق.
                </div>
              ) : (
                <div className="overflow-x-auto border border-neutral-900 rounded">
                  <table className="w-full border-collapse text-right text-xs">
                    <thead>
                      <tr className="border-b border-neutral-900 bg-neutral-900/60 text-neutral-200 sticky top-0 bg-neutral-950 z-10 font-bold">
                        <th className="p-4">السهم</th>
                        <th className="p-4">السعر الحالي</th>
                        <th className="p-4">سعر الدخول</th>
                        <th className="p-4">هدف الربح</th>
                        <th className="p-4">وقف الخسارة</th>
                        <th className="p-4" style={{ width: '45%' }}>التحليل الفني</th>
                        <th className="p-4 text-center">الإجراء</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-900 bg-neutral-950/20">
                      {sortedActiveTrades.map(trade => (
                        <tr key={trade._id} className="hover:bg-neutral-900/20 transition">
                          <td className="p-4 font-bold text-white tracking-wide">
                            <div>{trade.symbol}</div>
                            <div className="text-[10px] text-neutral-500 mt-1 font-mono">
                              عائد: +{trade.expectedProfitPct.toFixed(1)}% | RRR: {trade.rrr.toFixed(2)}
                            </div>
                            <div className="mt-1">
                              {trade.status === 'Pending' && (
                                <span className="px-1.5 py-0.5 text-[9px] font-bold bg-amber-950/40 text-amber-400 border border-amber-900/30 rounded font-sans">
                                  معلق / Pending
                                </span>
                              )}
                              {(trade.status === 'Active' || trade.status === 'ACTIVE') && (
                                <span className="px-1.5 py-0.5 text-[9px] font-bold bg-emerald-950/40 text-emerald-400 border border-emerald-900/30 rounded font-sans">
                                  نشط / Active
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="p-4 text-neutral-100">{formatPrice(trade.currentPrice, trade.market, trade.symbol)}</td>
                          <td className="p-4 text-neutral-300">{formatPrice(trade.entryPrice, trade.market, trade.symbol)}</td>
                          <td className="p-4 text-emerald-400/90">{formatPrice(trade.takeProfit, trade.market, trade.symbol)}</td>
                          <td className="p-4 text-rose-400/90">{formatPrice(trade.stopLoss, trade.market, trade.symbol)}</td>
                          <td className="p-4 leading-relaxed text-neutral-300 font-light">
                            {trade.explanationArabic}
                          </td>
                          <td className="p-4 text-center">
                            <button
                              onClick={() => {
                                setSelectedTrade(trade);
                                setActualEntryPrice(trade.entryPrice);
                                setPositionSize('');
                                setIsModalOpen(true);
                              }}
                              className="px-3 py-1 text-[10px] border border-neutral-800 hover:border-neutral-600 transition bg-neutral-900 text-neutral-200 font-bold rounded cursor-pointer"
                            >
                              تنفيذ الصفقة
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* 2. Realized Profits Table */}
            <section className="space-y-4">
              <div className="flex items-center justify-between border-b border-neutral-900 pb-2">
                <h2 className="text-xs font-bold uppercase tracking-wider font-mono text-neutral-300 flex items-center gap-2">
                  <span>[ الأرباح المحققة ]</span>
                  <span className="text-xs text-neutral-500 font-normal">({realizedWins.length})</span>
                </h2>
              </div>

              {realizedWins.length === 0 ? (
                <div className="py-8 text-center text-xs text-neutral-600 border border-neutral-900 rounded bg-neutral-900/10">
                  لا توجد صفقات رابحة مغلقة في هذا السوق بعد.
                </div>
              ) : (
                <div className="overflow-x-auto border border-neutral-900 rounded">
                  <table className="w-full border-collapse text-right text-xs">
                    <thead>
                      <tr className="border-b border-neutral-900 bg-neutral-900/60 text-neutral-200 sticky top-0 bg-neutral-950 z-10 font-bold">
                        <th className="p-4">الرمز</th>
                        <th className="p-4">سعر الدخول</th>
                        <th className="p-4">سعر الخروج</th>
                        <th className="p-4">نسبة العائد (%)</th>
                        <th className="p-4 text-left">تاريخ الإغلاق</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-900 bg-neutral-950/20">
                      {realizedWins.map(trade => {
                        const exitPrice = trade.exitPrice || trade.exit_price || trade.currentPrice;
                        return (
                          <tr key={trade._id} className="hover:bg-neutral-900/20 transition">
                            <td className="p-4 font-bold text-white tracking-wide">{trade.symbol}</td>
                            <td className="p-4 text-neutral-400">{formatPrice(trade.entryPrice, trade.market, trade.symbol)}</td>
                            <td className="p-4 text-emerald-400 font-bold">{formatPrice(exitPrice, trade.market, trade.symbol)}</td>
                            <td className="p-4">
                              <span className="inline-block px-2.5 py-0.5 text-[10px] font-bold bg-emerald-950/30 text-emerald-400 border border-emerald-900/40 rounded">
                                +{trade.pnlPercentage || 0}%
                              </span>
                            </td>
                            <td className="p-4 text-left text-neutral-500">{formatDate(trade.closedAt || trade.closed_at)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* 3. Triggered Stops Table */}
            <section className="space-y-4">
              <div className="flex items-center justify-between border-b border-neutral-900 pb-2">
                <h2 className="text-xs font-bold uppercase tracking-wider font-mono text-neutral-300 flex items-center gap-2">
                  <span>[ الصفقات المغلقة على خسارة ]</span>
                  <span className="text-xs text-neutral-500 font-normal">({triggeredLosses.length})</span>
                </h2>
              </div>

              {triggeredLosses.length === 0 ? (
                <div className="py-8 text-center text-xs text-neutral-600 border border-neutral-900 rounded bg-neutral-900/10">
                  لا توجد صفقات خاسرة مغلقة في هذا السوق بعد.
                </div>
              ) : (
                <div className="overflow-x-auto border border-neutral-900 rounded">
                  <table className="w-full border-collapse text-right text-xs">
                    <thead>
                      <tr className="border-b border-neutral-900 bg-neutral-900/60 text-neutral-200 sticky top-0 bg-neutral-950 z-10 font-bold">
                        <th className="p-4">الرمز</th>
                        <th className="p-4">سعر الدخول</th>
                        <th className="p-4">سعر الخروج</th>
                        <th className="p-4">نسبة العائد (%)</th>
                        <th className="p-4 text-left">تاريخ الإغلاق</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-900 bg-neutral-950/20">
                      {triggeredLosses.map(trade => {
                        const exitPrice = trade.exitPrice || trade.exit_price || trade.currentPrice;
                        return (
                          <tr key={trade._id} className="hover:bg-neutral-900/20 transition">
                            <td className="p-4 font-bold text-white tracking-wide">{trade.symbol}</td>
                            <td className="p-4 text-neutral-400">{formatPrice(trade.entryPrice, trade.market, trade.symbol)}</td>
                            <td className="p-4 text-rose-400 font-bold">{formatPrice(exitPrice, trade.market, trade.symbol)}</td>
                            <td className="p-4">
                              <span className="inline-block px-2.5 py-0.5 text-[10px] font-bold bg-rose-950/30 text-rose-400 border border-rose-900/40 rounded">
                                {trade.pnlPercentage || 0}%
                              </span>
                            </td>
                            <td className="p-4 text-left text-neutral-500">{formatDate(trade.closedAt || trade.closed_at)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </main>

      {/* Execute Trade Modal */}
      {isModalOpen && selectedTrade && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-neutral-950 border border-neutral-900 rounded p-6 w-full max-w-md space-y-6 text-right" dir="rtl">
            <div className="flex items-center justify-between border-b border-neutral-900 pb-3">
              <h3 className="text-sm font-bold uppercase tracking-wider font-mono text-white">
                تنفيذ صفقة جديدة / {selectedTrade.symbol}
              </h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-neutral-500 hover:text-neutral-300 text-xs font-mono cursor-pointer"
              >
                [إغلاق]
              </button>
            </div>

            <form onSubmit={handleExecuteTradeSubmit} className="space-y-4 text-xs font-mono">
              <div className="space-y-1">
                <label className="block text-neutral-400 font-bold">سعر الدخول الفعلي ({selectedTrade.market === 'EGX' ? 'ج.م' : '$'})</label>
                <input 
                  type="number" 
                  step="0.01" 
                  value={actualEntryPrice} 
                  onChange={(e) => setActualEntryPrice(Number(e.target.value))}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded p-2.5 text-neutral-100 focus:outline-none focus:border-neutral-600 text-left font-mono"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="block text-neutral-400 font-bold">قيمة الاستثمار ({selectedTrade.market === 'EGX' ? 'ج.م' : '$'})</label>
                <input 
                  type="number" 
                  step="0.01" 
                  placeholder="مثال: 5000" 
                  value={positionSize} 
                  onChange={(e) => setPositionSize(e.target.value)}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded p-2.5 text-neutral-100 focus:outline-none focus:border-neutral-600 text-left font-mono"
                  required
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button 
                  type="submit" 
                  className="flex-1 py-2.5 bg-neutral-100 hover:bg-white text-neutral-950 font-bold tracking-wider rounded uppercase text-center transition cursor-pointer"
                >
                  تأكيد التنفيذ
                </button>
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 border border-neutral-800 hover:border-neutral-600 text-neutral-400 hover:text-neutral-200 font-bold rounded transition cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Close Trade Modal */}
      {isCloseModalOpen && selectedPortfolioItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-neutral-950 border border-neutral-900 rounded p-6 w-full max-w-md space-y-6 text-right" dir="rtl">
            <div className="flex items-center justify-between border-b border-neutral-900 pb-3">
              <h3 className="text-sm font-bold uppercase tracking-wider font-mono text-white">
                إغلاق مركز / {selectedPortfolioItem.symbol}
              </h3>
              <button 
                onClick={() => setIsCloseModalOpen(false)}
                className="text-neutral-500 hover:text-neutral-300 text-xs font-mono cursor-pointer"
              >
                [إغلاق]
              </button>
            </div>

            <form onSubmit={handleCloseTradeSubmit} className="space-y-4 text-xs font-mono">
              <div className="space-y-1">
                <label className="block text-neutral-400 font-bold">سعر الخروج ({selectedPortfolioItem.market === 'EGX' ? 'ج.م' : '$'})</label>
                <input 
                  type="number" 
                  step="0.01" 
                  value={exitPrice} 
                  onChange={(e) => setExitPrice(Number(e.target.value))}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded p-2.5 text-neutral-100 focus:outline-none focus:border-neutral-600 text-left font-mono"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="block text-neutral-400 font-bold">سبب الإغلاق</label>
                <select
                  value={closeReason}
                  onChange={(e) => setCloseReason(e.target.value)}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded p-2.5 text-neutral-100 focus:outline-none focus:border-neutral-600 font-mono cursor-pointer"
                  required
                >
                  <option value="Manual Close">إغلاق يدوي / Manual Close</option>
                  <option value="TP Hit">ضرب الهدف / TP Hit</option>
                  <option value="SL Hit">ضرب وقف الخسارة / SL Hit</option>
                </select>
              </div>

              <div className="flex gap-3 pt-2">
                <button 
                  type="submit" 
                  className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold tracking-wider rounded uppercase text-center transition cursor-pointer"
                >
                  تأكيد الإغلاق
                </button>
                <button 
                  type="button" 
                  onClick={() => setIsCloseModalOpen(false)}
                  className="px-4 py-2.5 border border-neutral-800 hover:border-neutral-600 text-neutral-400 hover:text-neutral-200 font-bold rounded transition cursor-pointer"
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
