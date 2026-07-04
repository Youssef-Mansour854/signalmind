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

interface HistoryItem {
  _id: string;
  symbol: string;
  market: 'US' | 'EGX';
  source: 'AI' | 'Actual';
  entryPrice: number;
  exitPrice: number;
  pnlPercentage: number;
  cashPnL: number;
  maxPeakPercentage: number;
  holdingDuration: string;
  status: string;
  closedAt: string;
}

export default function Dashboard() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  
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
        await Promise.all([fetchPortfolio(), fetchAnalytics(), fetchHistory()]); // Refresh all
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

  const fetchHistory = async () => {
    try {
      const res = await fetch('/api/history');
      const json = await res.json();
      if (json.success) {
        setHistory(json.data);
      }
    } catch (err) {
      console.error('Error fetching history:', err);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    await Promise.all([fetchTrades(), fetchPortfolio(), fetchAnalytics(), fetchHistory()]);
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
  const filteredHistory = history.filter(item => item.market === marketFilter);

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
    <div className="min-h-screen bg-transparent text-neutral-100 font-sans antialiased" dir="rtl">
      {/* Header */}
      <header className="border-b border-neutral-900/50 py-5 sticky top-0 z-50 backdrop-blur-md bg-neutral-950/70">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-xl font-black tracking-tight uppercase">
              <span className="bg-gradient-to-r from-indigo-300 via-indigo-200 to-emerald-300 bg-clip-text text-transparent">
                محطة سيجنال مايند / SignalMind
              </span>
            </h1>
            <p className="text-[10px] text-indigo-400/70 mt-1 font-mono uppercase tracking-wider">
              التداول الخوارزمي الذكي والتحليل الإحصائي وإدارة المراكز
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={fetchData}
              className="px-4 py-1.5 text-xs border border-neutral-800/80 hover:border-indigo-500/50 transition-all duration-300 bg-neutral-900/60 hover:bg-indigo-950/20 text-neutral-300 hover:text-white font-bold rounded cursor-pointer"
            >
              تحديث البيانات
            </button>
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_#10b981]" />
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
          <div className="glass-card p-5 rounded-lg space-y-4 border-t-2 border-t-indigo-500/80 hover-scale">
            <div className="flex items-center justify-between text-neutral-400 text-[10px] uppercase font-bold tracking-wider font-mono">
              <span>قيمة المحفظة النشطة / Portfolio Value</span>
              <span className="text-indigo-400 text-sm">💰</span>
            </div>
            <div>
              <span className="text-[10px] text-neutral-500 block mb-1">القيمة الحالية (Current Value)</span>
              <span className="text-2xl font-black text-white font-mono tracking-wide">
                {formatPrice(totalPortfolioValue, marketFilter, '')}
              </span>
            </div>
          </div>

          {/* نسبة النجاح */}
          <div className="glass-card p-5 rounded-lg space-y-4 border-t-2 border-t-emerald-500/80 hover-scale">
            <div className="flex items-center justify-between text-neutral-400 text-[10px] uppercase font-bold tracking-wider font-mono">
              <span>نسبة النجاح / Win Rate</span>
              <span className="text-emerald-400 text-sm">🎯</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-[10px] text-neutral-500 block mb-1">الفعلي (Actual)</span>
                <span className="text-2xl font-black text-emerald-400 font-mono">
                  <span dir="ltr" className="inline-block">{analytics?.actual.winRate || 0}%</span>
                </span>
              </div>
              <div className="border-r border-neutral-900 pr-4">
                <span className="text-[10px] text-neutral-500 block mb-1">الافتراضي (AI)</span>
                <span className="text-2xl font-black text-neutral-400 font-mono">
                  <span dir="ltr" className="inline-block">{analytics?.shadow.winRate || 0}%</span>
                </span>
              </div>
            </div>
          </div>

          {/* إجمالي الصفقات */}
          <div className="glass-card p-5 rounded-lg space-y-4 border-t-2 border-t-purple-500/80 hover-scale">
            <div className="flex items-center justify-between text-neutral-400 text-[10px] uppercase font-bold tracking-wider font-mono">
              <span>إجمالي الصفقات المغلقة / Closed</span>
              <span className="text-purple-400 text-sm">📊</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-[10px] text-neutral-500 block mb-1">الفعلي (Actual)</span>
                <span className="text-2xl font-black text-white font-mono">
                  {analytics?.actual.totalClosed || 0}
                </span>
              </div>
              <div className="border-r border-neutral-900 pr-4">
                <span className="text-[10px] text-neutral-500 block mb-1">الافتراضي (AI)</span>
                <span className="text-2xl font-black text-neutral-400 font-mono">
                  {analytics?.shadow.totalClosed || 0}
                </span>
              </div>
            </div>
          </div>

          {/* متوسط العائد */}
          <div className="glass-card p-5 rounded-lg space-y-4 border-t-2 border-t-pink-500/80 hover-scale">
            <div className="flex items-center justify-between text-neutral-400 text-[10px] uppercase font-bold tracking-wider font-mono">
              <span>متوسط العائد / Avg Return</span>
              <span className="text-pink-400 text-sm">📈</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-[10px] text-neutral-500 block mb-1">الفعلي (Actual)</span>
                <span className={`text-2xl font-black font-mono ${
                  (analytics?.actual.avgPnl || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}>
                  <span dir="ltr" className="inline-block">{(analytics?.actual.avgPnl || 0) >= 0 ? '+' : ''}{analytics?.actual.avgPnl || 0}%</span>
                </span>
              </div>
              <div className="border-r border-neutral-900 pr-4">
                <span className="text-[10px] text-neutral-500 block mb-1">الافتراضي (AI)</span>
                <span className={`text-2xl font-black font-mono ${
                  (analytics?.shadow.avgPnl || 0) >= 0 ? 'text-emerald-500/80' : 'text-rose-500/80'
                }`}>
                  <span dir="ltr" className="inline-block">{(analytics?.shadow.avgPnl || 0) >= 0 ? '+' : ''}{analytics?.shadow.avgPnl || 0}%</span>
                </span>
              </div>
            </div>
          </div>
        </div>
        
        {/* Market & Timeframe Selector Bar */}
        <div className="flex flex-col md:flex-row justify-between items-center border-b border-neutral-900/50 pb-4 gap-4">
          {/* Market Selector & Sort Dropdown */}
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
            {/* Market Tabs */}
            <div className="flex gap-2 p-1 rounded-lg bg-neutral-950/60 border border-neutral-900/60 w-full sm:w-auto justify-center">
              <button
                onClick={() => setMarketFilter('EGX')}
                className={`px-6 py-1.5 text-xs font-bold transition-all duration-300 rounded-md cursor-pointer ${
                  marketFilter === 'EGX'
                    ? 'bg-indigo-600/90 text-white shadow-[0_0_15px_rgba(99,102,241,0.3)]'
                    : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/30'
                }`}
              >
                السوق المصري (EGX)
              </button>
              <button
                onClick={() => setMarketFilter('US')}
                className={`px-6 py-1.5 text-xs font-bold transition-all duration-300 rounded-md cursor-pointer ${
                  marketFilter === 'US'
                    ? 'bg-indigo-600/90 text-white shadow-[0_0_15px_rgba(99,102,241,0.3)]'
                    : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/30'
                }`}
              >
                السوق الأمريكي (US)
              </button>
            </div>

            {/* sleek dropdown for dynamic sorting */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-neutral-950 border border-neutral-900 text-neutral-300 py-1.5 px-4 text-xs rounded-md focus:outline-none focus:border-indigo-500/50 font-bold font-sans cursor-pointer w-full sm:w-auto transition-all duration-300"
            >
              <option value="latest">الأحدث (تاريخ التوصية)</option>
              <option value="rrr">الأفضل (معدل العائد/المخاطرة RRR)</option>
              <option value="profit">الأعلى عائداً متوقعاً</option>
              <option value="risk">الأكثر خطورة</option>
            </select>
          </div>

          {/* Timeframe Selector Toggle Group */}
          <div className="flex flex-wrap gap-2 p-1 rounded-lg bg-neutral-950/60 border border-neutral-900/60 w-full md:w-auto justify-center font-mono">
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
                className={`px-4 py-1.5 text-[10px] font-bold transition-all duration-300 rounded-md cursor-pointer ${
                  timeframe === tf.id
                    ? 'bg-neutral-900 text-white shadow-sm border border-neutral-800'
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
              <div className="flex items-center justify-between border-b border-neutral-900/50 pb-2">
                <h2 className="text-xs font-bold uppercase tracking-wider font-mono text-indigo-400 flex items-center gap-2">
                  <span>[ محفظتي الفعلية ]</span>
                  <span className="text-xs text-neutral-500 font-normal">({activePortfolio.length})</span>
                </h2>
              </div>

              {activePortfolio.length === 0 ? (
                <div className="py-8 text-center text-xs text-neutral-600 border border-neutral-900/60 rounded-lg bg-neutral-950/20">
                  لا توجد صفقات منفذة حالياً في محفظتك لهذا السوق.
                </div>
              ) : (
                <>
                  {/* Desktop View */}
                  <div className="hidden md:block overflow-x-auto glass-card rounded-lg">
                    <table className="w-full border-collapse text-right text-xs">
                      <thead>
                        <tr className="border-b border-neutral-900/50 bg-neutral-900/60 text-neutral-200 sticky top-0 bg-neutral-950 z-10 font-bold">
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
                      <tbody className="divide-y divide-neutral-900/40 bg-neutral-950/20">
                        {activePortfolio.map(item => {
                          const current = item.currentPrice || item.actualEntryPrice || 0;
                          const pnl = item.currentPnL !== undefined ? item.currentPnL : 0;
                          const pnlPct = item.pnlPercentage !== undefined ? item.pnlPercentage : (item.actualEntryPrice > 0 ? ((current - item.actualEntryPrice) / item.actualEntryPrice) * 100 : 0);
                          
                          return (
                            <tr key={item._id} className="hover:bg-neutral-900/40 transition-all duration-300">
                              <td className="p-4 font-bold text-white tracking-wide">{item.symbol}</td>
                              <td className="p-4 text-neutral-300 font-mono">{formatPrice(item.actualEntryPrice, item.market, item.symbol)}</td>
                              <td className="p-4 text-neutral-100 font-mono">{formatPrice(current, item.market, item.symbol)}</td>
                              <td className="p-4 text-neutral-200 font-mono">{formatPrice(item.positionSize, item.market, item.symbol)}</td>
                              <td className={`p-4 font-bold font-mono ${pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {formatPrice(pnl, item.market, item.symbol)}{' '}
                                <span dir="ltr" className="inline-block">
                                  ({pnl >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%)
                                </span>
                              </td>
                              <td className="p-4">
                                <span className="inline-block px-2.5 py-0.5 text-[9px] font-bold bg-neutral-900 text-neutral-400 border border-neutral-800 rounded uppercase font-mono">
                                  ACTIVE
                                </span>
                              </td>
                              <td className="p-4 text-left text-neutral-500 font-mono">{formatDate(item.executedAt)}</td>
                              <td className="p-4 text-center">
                                <button
                                  onClick={() => {
                                    setSelectedPortfolioItem(item);
                                    setExitPrice(current || item.actualEntryPrice);
                                    setCloseReason('Manual Close');
                                    setIsCloseModalOpen(true);
                                  }}
                                  className="px-3 py-1 text-[10px] border border-rose-900/60 hover:border-rose-600 transition-all duration-300 bg-rose-950/20 text-rose-300 hover:text-white font-bold rounded cursor-pointer"
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

                  {/* Mobile View */}
                  <div className="md:hidden space-y-4">
                    {activePortfolio.map(item => {
                      const current = item.currentPrice || item.actualEntryPrice || 0;
                      const pnl = item.currentPnL !== undefined ? item.currentPnL : 0;
                      const pnlPct = item.pnlPercentage !== undefined ? item.pnlPercentage : (item.actualEntryPrice > 0 ? ((current - item.actualEntryPrice) / item.actualEntryPrice) * 100 : 0);
                      return (
                        <div key={item._id} className={`glass-card p-4 rounded-lg space-y-3 text-right hover-scale ${pnl >= 0 ? 'glow-emerald' : 'glow-rose'}`}>
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-white tracking-wide text-sm">{item.symbol}</span>
                            <span className="inline-block px-2 py-0.5 text-[9px] font-bold bg-neutral-900 text-neutral-450 border border-neutral-850 rounded uppercase font-mono">
                              ACTIVE
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <span className="text-neutral-500 block text-[10px]">الدخول الفعلي:</span>
                              <span className="text-neutral-300 font-mono">{formatPrice(item.actualEntryPrice, item.market, item.symbol)}</span>
                            </div>
                            <div>
                              <span className="text-neutral-500 block text-[10px]">السعر الحالي:</span>
                              <span className="text-neutral-100 font-mono">{formatPrice(current, item.market, item.symbol)}</span>
                            </div>
                            <div>
                              <span className="text-neutral-500 block text-[10px]">القيمة:</span>
                              <span className="text-neutral-200 font-mono">{formatPrice(item.positionSize, item.market, item.symbol)}</span>
                            </div>
                            <div>
                              <span className="text-neutral-500 block text-[10px]">الربح/الخسارة:</span>
                              <span className={`font-bold font-mono ${pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {formatPrice(pnl, item.market, item.symbol)}{' '}
                                <span dir="ltr" className="inline-block">({pnl >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%)</span>
                              </span>
                            </div>
                          </div>
                          <div className="flex justify-between items-center pt-2 border-t border-neutral-900/50 text-[10px] text-neutral-500">
                            <span>تاريخ التنفيذ: {formatDate(item.executedAt)}</span>
                            <button
                              onClick={() => {
                                setSelectedPortfolioItem(item);
                                setExitPrice(current || item.actualEntryPrice);
                                setCloseReason('Manual Close');
                                setIsCloseModalOpen(true);
                              }}
                              className="px-3 py-1 border border-rose-900/60 hover:border-rose-600 transition-all duration-300 bg-rose-950/20 text-rose-300 hover:text-white font-bold rounded cursor-pointer text-[10px]"
                            >
                              إغلاق الصفقة
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </section>

            {/* 1. Active Positions Table */}
            <section className="space-y-4">
              <div className="flex items-center justify-between border-b border-neutral-900/50 pb-2">
                <h2 className="text-xs font-bold uppercase tracking-wider font-mono text-indigo-400 flex items-center gap-2">
                  <span>[ الصفقات النشطة ]</span>
                  <span className="text-xs text-neutral-500 font-normal">({sortedActiveTrades.length})</span>
                </h2>
              </div>

              {sortedActiveTrades.length === 0 ? (
                <div className="py-8 text-center text-xs text-neutral-600 border border-neutral-900/60 rounded-lg bg-neutral-950/20">
                  لا توجد صفقات نشطة حالياً في هذا السوق.
                </div>
              ) : (
                <>
                  {/* Desktop View */}
                  <div className="hidden md:block overflow-x-auto glass-card rounded-lg">
                    <table className="w-full border-collapse text-right text-xs">
                      <thead>
                        <tr className="border-b border-neutral-900/50 bg-neutral-900/60 text-neutral-200 sticky top-0 bg-neutral-950 z-10 font-bold">
                          <th className="p-4">السهم</th>
                          <th className="p-4">السعر الحالي</th>
                          <th className="p-4">سعر الدخول</th>
                          <th className="p-4">هدف الربح</th>
                          <th className="p-4">وقف الخسارة</th>
                          <th className="p-4" style={{ width: '45%' }}>التحليل الفني</th>
                          <th className="p-4 text-center">الإجراء</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-900/40 bg-neutral-950/20">
                        {sortedActiveTrades.map(trade => (
                          <tr key={trade._id} className="hover:bg-neutral-900/40 transition-all duration-300">
                            <td className="p-4 font-bold text-white tracking-wide">
                              <div>{trade.symbol}</div>
                              <div className="text-[10px] text-neutral-500 mt-1 font-mono">
                                عائد:{' '}
                                <span dir="ltr" className="inline-block">
                                  +{trade.expectedProfitPct.toFixed(1)}%
                                </span>{' '}
                                | RRR: {trade.rrr.toFixed(2)}
                              </div>
                              <div className="mt-1">
                                {trade.status === 'Pending' && (
                                  <span className="px-1.5 py-0.5 text-[9px] font-bold bg-amber-950/40 text-amber-400 border border-amber-900/30 rounded font-sans">
                                    Pending
                                  </span>
                                )}
                                {(trade.status === 'Active' || trade.status === 'ACTIVE') && (
                                  <span className="px-1.5 py-0.5 text-[9px] font-bold bg-emerald-950/40 text-emerald-400 border border-emerald-900/30 rounded font-sans">
                                    Active
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="p-4 text-neutral-100 font-mono">{formatPrice(trade.currentPrice, trade.market, trade.symbol)}</td>
                            <td className="p-4 text-neutral-300 font-mono">{formatPrice(trade.entryPrice, trade.market, trade.symbol)}</td>
                            <td className="p-4 text-emerald-400/90 font-mono">{formatPrice(trade.takeProfit, trade.market, trade.symbol)}</td>
                            <td className="p-4 text-rose-400/90 font-mono">{formatPrice(trade.stopLoss, trade.market, trade.symbol)}</td>
                            <td className="p-4 leading-relaxed text-neutral-300 font-light max-w-md whitespace-normal">
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
                                className="px-3 py-1 text-[10px] border border-indigo-900/60 hover:border-indigo-500/60 transition-all duration-300 bg-indigo-950/20 text-indigo-300 hover:text-white font-bold rounded cursor-pointer"
                              >
                                تنفيذ الصفقة
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile View */}
                  <div className="md:hidden space-y-4">
                    {sortedActiveTrades.map(trade => (
                      <div key={trade._id} className={`glass-card p-4 rounded-lg space-y-3 text-right hover-scale ${(trade.status === 'Active' || trade.status === 'ACTIVE') ? 'glow-emerald' : 'glow-amber'}`}>
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-bold text-white tracking-wide text-sm">{trade.symbol}</span>
                            <span className="text-[9px] text-neutral-500 mr-2 font-mono" dir="ltr">
                              +{trade.expectedProfitPct.toFixed(1)}% | R: {trade.rrr.toFixed(1)}
                            </span>
                          </div>
                          <div>
                            {trade.status === 'Pending' && (
                              <span className="px-1.5 py-0.5 text-[9px] font-bold bg-amber-950/40 text-amber-400 border border-amber-900/30 rounded font-mono font-bold">
                                معلق
                              </span>
                            )}
                            {(trade.status === 'Active' || trade.status === 'ACTIVE') && (
                              <span className="px-1.5 py-0.5 text-[9px] font-bold bg-emerald-950/40 text-emerald-400 border border-emerald-900/30 rounded font-mono font-bold">
                                نشط
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-neutral-500 block text-[10px]">السعر الحالي:</span>
                            <span className="text-neutral-100 font-mono">{formatPrice(trade.currentPrice, trade.market, trade.symbol)}</span>
                          </div>
                          <div>
                            <span className="text-neutral-500 block text-[10px]">سعر الدخول:</span>
                            <span className="text-neutral-300 font-mono">{formatPrice(trade.entryPrice, trade.market, trade.symbol)}</span>
                          </div>
                          <div>
                            <span className="text-neutral-500 block text-[10px]">هدف الربح:</span>
                            <span className="text-emerald-400/90 font-mono">{formatPrice(trade.takeProfit, trade.market, trade.symbol)}</span>
                          </div>
                          <div>
                            <span className="text-neutral-500 block text-[10px]">وقف الخسارة:</span>
                            <span className="text-rose-400/90 font-mono">{formatPrice(trade.stopLoss, trade.market, trade.symbol)}</span>
                          </div>
                        </div>
                        <div className="text-neutral-300 text-xs bg-neutral-950/40 p-2.5 rounded border border-neutral-900/60 leading-relaxed font-light">
                          {trade.explanationArabic}
                        </div>
                        <div className="pt-2 border-t border-neutral-900/50">
                          <button
                            onClick={() => {
                              setSelectedTrade(trade);
                              setActualEntryPrice(trade.entryPrice);
                              setPositionSize('');
                              setIsModalOpen(true);
                            }}
                            className="w-full py-2 border border-indigo-900/60 hover:border-indigo-500/60 transition-all duration-300 bg-indigo-950/20 text-indigo-300 hover:text-white font-bold rounded cursor-pointer text-[10px] text-center"
                          >
                            تنفيذ الصفقة
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </section>

            {/* 2. Realized Profits Table */}
            <section className="space-y-4">
              <div className="flex items-center justify-between border-b border-neutral-900/50 pb-2">
                <h2 className="text-xs font-bold uppercase tracking-wider font-mono text-indigo-400 flex items-center gap-2">
                  <span>[ الأرباح المحققة ]</span>
                  <span className="text-xs text-neutral-500 font-normal">({realizedWins.length})</span>
                </h2>
              </div>

              {realizedWins.length === 0 ? (
                <div className="py-8 text-center text-xs text-neutral-600 border border-neutral-900/60 rounded-lg bg-neutral-950/20">
                  لا توجد صفقات رابحة مغلقة في هذا السوق بعد.
                </div>
              ) : (
                <>
                  {/* Desktop View */}
                  <div className="hidden md:block overflow-x-auto glass-card rounded-lg">
                    <table className="w-full border-collapse text-right text-xs">
                      <thead>
                        <tr className="border-b border-neutral-900/50 bg-neutral-900/60 text-neutral-200 sticky top-0 bg-neutral-950 z-10 font-bold">
                          <th className="p-4">الرمز</th>
                          <th className="p-4">سعر الدخول</th>
                          <th className="p-4">سعر الخروج</th>
                          <th className="p-4">نسبة العائد (%)</th>
                          <th className="p-4 text-left">تاريخ الإغلاق</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-900/40 bg-neutral-950/20">
                        {realizedWins.map(trade => {
                          const exitPrice = trade.exitPrice || trade.exit_price || trade.currentPrice;
                          return (
                            <tr key={trade._id} className="hover:bg-neutral-900/40 transition-all duration-300">
                              <td className="p-4 font-bold text-white tracking-wide">{trade.symbol}</td>
                              <td className="p-4 text-neutral-300 font-mono">{formatPrice(trade.entryPrice, trade.market, trade.symbol)}</td>
                              <td className="p-4 text-emerald-450 font-mono">{formatPrice(exitPrice, trade.market, trade.symbol)}</td>
                              <td className="p-4 font-mono">
                                <span dir="ltr" className="inline-block px-2.5 py-0.5 text-[10px] font-bold bg-emerald-950/30 text-emerald-400 border border-emerald-900/40 rounded">
                                  +{trade.pnlPercentage || 0}%
                                </span>
                              </td>
                              <td className="p-4 text-left text-neutral-500 font-mono">{formatDate(trade.closedAt || trade.closed_at)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile View */}
                  <div className="md:hidden space-y-4">
                    {realizedWins.map(trade => {
                      const exitPrice = trade.exitPrice || trade.exit_price || trade.currentPrice;
                      return (
                        <div key={trade._id} className="glass-card p-4 rounded-lg space-y-3 text-right hover-scale glow-emerald">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-white tracking-wide text-sm">{trade.symbol}</span>
                            <span dir="ltr" className="inline-block px-2.5 py-0.5 text-[9px] font-bold bg-emerald-950/30 text-emerald-400 border border-emerald-900/40 rounded font-mono">
                              +{trade.pnlPercentage || 0}%
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <span className="text-neutral-500 block text-[10px]">سعر الدخول:</span>
                              <span className="text-neutral-300 font-mono">{formatPrice(trade.entryPrice, trade.market, trade.symbol)}</span>
                            </div>
                            <div>
                              <span className="text-neutral-500 block text-[10px]">سعر الخروج:</span>
                              <span className="text-emerald-400 font-bold font-mono">{formatPrice(exitPrice, trade.market, trade.symbol)}</span>
                            </div>
                          </div>
                          <div className="text-[10px] text-neutral-500 border-t border-neutral-900/50 pt-2 text-left font-mono">
                            تاريخ الإغلاق: {formatDate(trade.closedAt || trade.closed_at)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </section>

            {/* 3. Triggered Stops Table */}
            <section className="space-y-4">
              <div className="flex items-center justify-between border-b border-neutral-900/50 pb-2">
                <h2 className="text-xs font-bold uppercase tracking-wider font-mono text-indigo-400 flex items-center gap-2">
                  <span>[ الصفقات المغلقة على خسارة ]</span>
                  <span className="text-xs text-neutral-500 font-normal">({triggeredLosses.length})</span>
                </h2>
              </div>

              {triggeredLosses.length === 0 ? (
                <div className="py-8 text-center text-xs text-neutral-600 border border-neutral-900/60 rounded-lg bg-neutral-950/20">
                  لا توجد صفقات خاسرة مغلقة في هذا السوق بعد.
                </div>
              ) : (
                <>
                  {/* Desktop View */}
                  <div className="hidden md:block overflow-x-auto glass-card rounded-lg">
                    <table className="w-full border-collapse text-right text-xs">
                      <thead>
                        <tr className="border-b border-neutral-900/50 bg-neutral-900/60 text-neutral-200 sticky top-0 bg-neutral-950 z-10 font-bold">
                          <th className="p-4">الرمز</th>
                          <th className="p-4">سعر الدخول</th>
                          <th className="p-4">سعر الخروج</th>
                          <th className="p-4">نسبة العائد (%)</th>
                          <th className="p-4 text-left">تاريخ الإغلاق</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-900/40 bg-neutral-950/20">
                        {triggeredLosses.map(trade => {
                          const exitPrice = trade.exitPrice || trade.exit_price || trade.currentPrice;
                          return (
                            <tr key={trade._id} className="hover:bg-neutral-900/40 transition-all duration-300">
                              <td className="p-4 font-bold text-white tracking-wide">{trade.symbol}</td>
                              <td className="p-4 text-neutral-300 font-mono">{formatPrice(trade.entryPrice, trade.market, trade.symbol)}</td>
                              <td className="p-4 text-rose-400 font-mono">{formatPrice(exitPrice, trade.market, trade.symbol)}</td>
                              <td className="p-4 font-mono">
                                <span dir="ltr" className="inline-block px-2.5 py-0.5 text-[10px] font-bold bg-rose-950/30 text-rose-400 border border-rose-900/40 rounded">
                                  {trade.pnlPercentage || 0}%
                                </span>
                              </td>
                              <td className="p-4 text-left text-neutral-500 font-mono">{formatDate(trade.closedAt || trade.closed_at)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile View */}
                  <div className="md:hidden space-y-4">
                    {triggeredLosses.map(trade => {
                      const exitPrice = trade.exitPrice || trade.exit_price || trade.currentPrice;
                      return (
                        <div key={trade._id} className="glass-card p-4 rounded-lg space-y-3 text-right hover-scale glow-rose">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-white tracking-wide text-sm">{trade.symbol}</span>
                            <span dir="ltr" className="inline-block px-2.5 py-0.5 text-[9px] font-bold bg-rose-950/30 text-rose-400 border border-rose-900/40 rounded font-mono">
                              {trade.pnlPercentage || 0}%
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <span className="text-neutral-500 block text-[10px]">سعر الدخول:</span>
                              <span className="text-neutral-300 font-mono">{formatPrice(trade.entryPrice, trade.market, trade.symbol)}</span>
                            </div>
                            <div>
                              <span className="text-neutral-500 block text-[10px]">سعر الخروج:</span>
                              <span className="text-rose-400 font-bold font-mono">{formatPrice(exitPrice, trade.market, trade.symbol)}</span>
                            </div>
                          </div>
                          <div className="text-[10px] text-neutral-500 border-t border-neutral-900/50 pt-2 text-left font-mono">
                            تاريخ الإغلاق: {formatDate(trade.closedAt || trade.closed_at)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </section>

            {/* 4. Closed Trades History Table */}
            <section className="space-y-4">
              <div className="flex items-center justify-between border-b border-neutral-900/50 pb-2">
                <h2 className="text-xs font-bold uppercase tracking-wider font-mono text-indigo-400 flex items-center gap-2">
                  <span>[ سجل الصفقات المغلقة ]</span>
                  <span className="text-xs text-neutral-500 font-normal">({filteredHistory.length})</span>
                </h2>
              </div>

              {filteredHistory.length === 0 ? (
                <div className="py-8 text-center text-xs text-neutral-600 border border-neutral-900/60 rounded-lg bg-neutral-950/20">
                  لا توجد صفقات مغلقة في هذا السوق بعد.
                </div>
              ) : (
                <>
                  {/* Desktop View */}
                  <div className="hidden md:block overflow-x-auto glass-card rounded-lg">
                    <table className="w-full border-collapse text-right text-xs">
                      <thead>
                        <tr className="border-b border-neutral-900/50 bg-neutral-900/60 text-neutral-200 sticky top-0 bg-neutral-950 z-10 font-bold">
                          <th className="p-4 text-right">السهم</th>
                          <th className="p-4 text-right">المحفظة</th>
                          <th className="p-4 text-right">مدة الاحتفاظ</th>
                          <th className="p-4 text-right">سعر الدخول ➔ الإغلاق</th>
                          <th className="p-4 text-right">الربح النقدي</th>
                          <th className="p-4 text-right">العائد %</th>
                          <th className="p-4 text-right">أقصى صعود</th>
                          <th className="p-4 text-left">تاريخ الإغلاق</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-900/40 bg-neutral-950/20">
                        {filteredHistory.map(item => {
                          const pnlColor = item.pnlPercentage > 0 ? 'text-green-500' : (item.pnlPercentage < 0 ? 'text-red-500' : 'text-neutral-450');
                          const cashPnlColor = item.cashPnL > 0 ? 'text-green-500' : (item.cashPnL < 0 ? 'text-red-500' : 'text-neutral-450');
                          return (
                            <tr key={item._id} className="hover:bg-neutral-900/40 transition-all duration-300">
                              <td className="p-4 font-bold text-white tracking-wide">{item.symbol}</td>
                              <td className="p-4 text-neutral-300">
                                {item.source === 'AI' ? 'افتراضي AI' : 'فعلي Actual'}
                              </td>
                              <td className="p-4 text-neutral-400 font-mono">{item.holdingDuration}</td>
                              <td className="p-4 text-neutral-300 font-mono" dir="ltr">
                                {formatPrice(item.entryPrice, item.market, item.symbol)} ➔ {formatPrice(item.exitPrice, item.market, item.symbol)}
                              </td>
                              <td className="p-4 font-bold font-mono">
                                <span dir="ltr" className={`inline-block ${cashPnlColor}`}>
                                  {item.cashPnL > 0 ? '+' : ''}{formatPrice(item.cashPnL, item.market, item.symbol)}
                                </span>
                              </td>
                              <td className="p-4 font-bold">
                                <span dir="ltr" className={`inline-block ${pnlColor}`}>
                                  {item.pnlPercentage > 0 ? '+' : ''}{item.pnlPercentage.toFixed(2)}%
                                </span>
                              </td>
                              <td className="p-4 font-bold font-mono text-emerald-400/90">
                                <span dir="ltr" className="inline-block">
                                  +{item.maxPeakPercentage.toFixed(2)}%
                                </span>
                              </td>
                              <td className="p-4 text-left text-neutral-500 font-mono">{formatDate(item.closedAt)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile View */}
                  <div className="md:hidden space-y-4">
                    {filteredHistory.map(item => {
                      const pnlColor = item.pnlPercentage > 0 ? 'text-green-500' : (item.pnlPercentage < 0 ? 'text-red-500' : 'text-neutral-450');
                      const cashPnlColor = item.cashPnL > 0 ? 'text-green-500' : (item.cashPnL < 0 ? 'text-red-500' : 'text-neutral-450');
                      return (
                        <div key={item._id} className={`glass-card p-4 rounded-lg space-y-3 text-right hover-scale ${item.pnlPercentage > 0 ? 'glow-emerald' : 'glow-rose'}`}>
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-white tracking-wide text-sm">{item.symbol}</span>
                            <span className="text-[10px] text-neutral-450 font-mono">الاحتفاظ: {item.holdingDuration}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <span className="text-neutral-500 block text-[10px]">المحفظة:</span>
                              <span className="text-neutral-300">{item.source === 'AI' ? 'افتراضي AI' : 'فعلي Actual'}</span>
                            </div>
                            <div>
                              <span className="text-neutral-500 block text-[10px]">السعر:</span>
                              <span className="text-neutral-300 font-mono text-[10px]" dir="ltr">
                                {formatPrice(item.entryPrice, item.market, item.symbol)} ➔ {formatPrice(item.exitPrice, item.market, item.symbol)}
                              </span>
                            </div>
                            <div>
                              <span className="text-neutral-500 block text-[10px]">الربح النقدي:</span>
                              <span dir="ltr" className={`font-bold font-mono ${cashPnlColor}`}>
                                {item.cashPnL > 0 ? '+' : ''}{formatPrice(item.cashPnL, item.market, item.symbol)}
                              </span>
                            </div>
                            <div>
                              <span className="text-neutral-500 block text-[10px]">العائد %:</span>
                              <span dir="ltr" className={`font-bold ${pnlColor}`}>
                                {item.pnlPercentage > 0 ? '+' : ''}{item.pnlPercentage.toFixed(2)}%
                              </span>
                            </div>
                            <div>
                              <span className="text-neutral-500 block text-[10px]">أقصى صعود:</span>
                              <span dir="ltr" className="font-bold font-mono text-emerald-400/90">
                                +{item.maxPeakPercentage.toFixed(2)}%
                              </span>
                            </div>
                          </div>
                          <div className="text-[10px] text-neutral-500 border-t border-neutral-900/50 pt-2 text-left font-mono">
                            تاريخ الإغلاق: {formatDate(item.closedAt)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </section>
          </>
        )}
      </main>

      {/* Execute Trade Modal */}
      {isModalOpen && selectedTrade && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
          <div className="glass-card p-6 w-full max-w-md space-y-6 text-right rounded-xl border-t-2 border-t-indigo-500" dir="rtl">
            <div className="flex items-center justify-between border-b border-neutral-900/60 pb-3">
              <h3 className="text-sm font-bold uppercase tracking-wider font-mono text-white">
                تنفيذ صفقة جديدة / {selectedTrade.symbol}
              </h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-neutral-500 hover:text-neutral-300 text-xs font-mono cursor-pointer transition"
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
                  className="w-full bg-neutral-950/60 border border-neutral-900 rounded-md p-2.5 text-neutral-100 focus:outline-none focus:border-indigo-500/50 text-left font-mono transition"
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
                  className="w-full bg-neutral-950/60 border border-neutral-900 rounded-md p-2.5 text-neutral-100 focus:outline-none focus:border-indigo-500/50 text-left font-mono transition"
                  required
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button 
                  type="submit" 
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold tracking-wider rounded-md uppercase text-center transition cursor-pointer shadow-[0_0_15px_rgba(99,102,241,0.2)]"
                >
                  تأكيد التنفيذ
                </button>
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 border border-neutral-800 hover:border-neutral-700 text-neutral-400 hover:text-neutral-200 font-bold rounded-md transition cursor-pointer"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
          <div className="glass-card p-6 w-full max-w-md space-y-6 text-right rounded-xl border-t-2 border-t-rose-500" dir="rtl">
            <div className="flex items-center justify-between border-b border-neutral-900/60 pb-3">
              <h3 className="text-sm font-bold uppercase tracking-wider font-mono text-white">
                إغلاق مركز / {selectedPortfolioItem.symbol}
              </h3>
              <button 
                onClick={() => setIsCloseModalOpen(false)}
                className="text-neutral-500 hover:text-neutral-300 text-xs font-mono cursor-pointer transition"
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
                  className="w-full bg-neutral-950/60 border border-neutral-900 rounded-md p-2.5 text-neutral-100 focus:outline-none focus:border-indigo-500/50 text-left font-mono transition"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="block text-neutral-400 font-bold">سبب الإغلاق</label>
                <select
                  value={closeReason}
                  onChange={(e) => setCloseReason(e.target.value)}
                  className="w-full bg-neutral-950/60 border border-neutral-900 rounded-md p-2.5 text-neutral-100 focus:outline-none focus:border-indigo-500/50 font-mono cursor-pointer transition"
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
                  className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold tracking-wider rounded-md uppercase text-center transition cursor-pointer"
                >
                  تأكيد الإغلاق
                </button>
                <button 
                  type="button" 
                  onClick={() => setIsCloseModalOpen(false)}
                  className="px-4 py-2.5 border border-neutral-800 hover:border-neutral-700 text-neutral-400 hover:text-neutral-200 font-bold rounded-md transition cursor-pointer"
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
