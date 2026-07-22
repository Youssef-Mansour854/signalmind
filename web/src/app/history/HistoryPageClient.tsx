'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';

interface SignalItem {
  _id: string;
  symbol: string;
  market: 'US' | 'EGX';
  signalType: 'BUY' | 'SELL' | 'HOLD';
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  currentPrice: number;
  status: 'ACTIVE' | 'EXPIRED' | 'EXECUTED' | 'Pending' | 'Active' | 'Hit TP' | 'Hit SL' | 'Expired' | 'SUCCESS' | 'FAILED';
  expiresAt?: string;
  exitPrice?: number;
  timeframe?: string;
  signalStrength?: 'قوية' | 'متوسطة';
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  pnlPercentage?: number;
  closeReason?: string;
  setupQuality?: 'A+' | 'B' | 'FOMO' | 'Revenge';
  initialStopLoss?: number;
  scoreMetrics?: {
    riskRewardRatio: number;
    confluenceScore: number;
    aiConfidenceScore: number;
    totalScore: number;
    rank: number;
  };
}

interface UserTradeItem {
  _id: string;
  symbol: string;
  market: 'US' | 'EGX';
  actualEntryPrice: number;
  positionSize: number;
  quantity?: number;
  currentPrice?: number;
  exitPrice?: number;
  finalPnL?: number;
  pnlPercentage?: number;
  status: 'ACTIVE' | 'OPEN' | 'Hit TP' | 'Hit SL' | 'CLOSED';
  portfolioType: 'SYSTEM' | 'USER';
  executedAt: string;
  closedAt?: string;
  closeDate?: string;
  closeReason?: string;
  setupQuality?: 'A+' | 'B' | 'FOMO' | 'Revenge';
  initialStopLoss?: number;
  signalId?: any;
}

interface SignalStatsData {
  winRate: number;
  profitFactor: string;
  avgRRR: string;
  winsCount: number;
  lossesCount: number;
  expiredCount: number;
  totalResolved: number;
  disciplineRate: number;
}

interface JournalStatsData {
  totalRealizedPnL: number;
  avgROI: number;
  winRate: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  disciplineRate: number;
}

export default function HistoryPage() {
  // Main Tab: 'signals' = سجل أداء الرادار, 'journal' = دفتر الصفقات الشخصية
  const [mainTab, setMainTab] = useState<'signals' | 'journal'>('signals');
  
  const [marketFilter, setMarketFilter] = useState<'EGX' | 'US'>('US');
  const [accountMode, setAccountMode] = useState<'PERSONAL' | 'FUNDED'>('PERSONAL');

  // Signal History State
  const [signalSubTab, setSignalSubTab] = useState<'all' | 'wins' | 'losses' | 'expired'>('all');
  const [signals, setSignals] = useState<SignalItem[]>([]);
  const [signalStats, setSignalStats] = useState<SignalStatsData>({
    winRate: 0,
    profitFactor: '0.00',
    avgRRR: '0.00',
    winsCount: 0,
    lossesCount: 0,
    expiredCount: 0,
    totalResolved: 0,
    disciplineRate: 100,
  });

  // User Journal State
  const [journalTrades, setJournalTrades] = useState<UserTradeItem[]>([]);
  const [journalStats, setJournalStats] = useState<JournalStatsData>({
    totalRealizedPnL: 0,
    avgROI: 0,
    winRate: 0,
    totalTrades: 0,
    winningTrades: 0,
    losingTrades: 0,
    disciplineRate: 100,
  });

  // Pagination State
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const syncMode = () => {
      const saved = localStorage.getItem('accountMode');
      if (saved === 'PERSONAL' || saved === 'FUNDED') {
        setAccountMode(saved);
      }
    };
    syncMode();
    window.addEventListener('accountModeChanged', syncMode);
    return () => window.removeEventListener('accountModeChanged', syncMode);
  }, []);

  const handleAccountModeChange = (mode: 'PERSONAL' | 'FUNDED') => {
    setAccountMode(mode);
    localStorage.setItem('accountMode', mode);
    window.dispatchEvent(new Event('accountModeChanged'));
  };

  const handleMarketChange = (market: 'US' | 'EGX') => {
    setMarketFilter(market);
    setPage(1);
  };

  const handleMainTabChange = (tab: 'signals' | 'journal') => {
    setMainTab(tab);
    setPage(1);
  };

  // Fetch Signals History
  const fetchSignalsHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const url = `/api/history/signals?market=${marketFilter}&status=${signalSubTab}&page=${page}&limit=50`;
      const res = await fetch(url);
      const json = await res.json();
      
      if (json.success) {
        setSignals(json.data || []);
        setTotalPages(json.totalPages || 1);
        
        if (json.stats) {
          // Calculate Discipline Rate if needed
          const evaluated = (json.data || []).filter((s: any) => s.setupQuality !== undefined);
          const disciplined = evaluated.filter((s: any) => s.setupQuality === 'A+' || s.setupQuality === 'B');
          const disciplineRate = evaluated.length > 0
            ? Math.round((disciplined.length / evaluated.length) * 100)
            : 100;

          setSignalStats({
            winRate: json.stats.winRate || 0,
            profitFactor: json.stats.profitFactor || '0.00',
            avgRRR: json.stats.avgRRR || '0.00',
            winsCount: json.stats.winsCount || 0,
            lossesCount: json.stats.lossesCount || 0,
            expiredCount: json.stats.expiredCount || 0,
            totalResolved: json.stats.totalResolved || 0,
            disciplineRate
          });
        }
      } else {
        setError(json.error || 'فشل في جلب سجل التوصيات');
      }
    } catch (err: any) {
      setError(err.message || 'حدث خطأ غير متوقع');
    } finally {
      setLoading(false);
    }
  };

  // Fetch User Trading Journal
  const fetchUserJournal = async () => {
    setLoading(true);
    setError(null);
    try {
      const url = `/api/history/journal?market=${marketFilter}&page=${page}&limit=50`;
      const res = await fetch(url);
      const json = await res.json();

      if (json.success) {
        setJournalTrades(json.data || []);
        setTotalPages(json.totalPages || 1);

        if (json.stats) {
          const evaluated = (json.data || []).filter((t: any) => t.setupQuality !== undefined);
          const disciplined = evaluated.filter((t: any) => t.setupQuality === 'A+' || t.setupQuality === 'B');
          const disciplineRate = evaluated.length > 0
            ? Math.round((disciplined.length / evaluated.length) * 100)
            : 100;

          setJournalStats({
            totalRealizedPnL: json.stats.totalRealizedPnL || 0,
            avgROI: json.stats.avgROI || 0,
            winRate: json.stats.winRate || 0,
            totalTrades: json.stats.totalTrades || 0,
            winningTrades: json.stats.winningTrades || 0,
            losingTrades: json.stats.losingTrades || 0,
            disciplineRate
          });
        }
      } else {
        setError(json.error || 'فشل في جلب دفتر الصفقات الشخصية');
      }
    } catch (err: any) {
      setError(err.message || 'حدث خطأ غير متوقع');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (mainTab === 'signals') {
      fetchSignalsHistory();
    } else {
      fetchUserJournal();
    }
  }, [mainTab, marketFilter, signalSubTab, page]);

  const formatPrice = (price: number, market: string, symbol: string) => {
    const formatted = price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (market === 'EGX' || symbol.endsWith('.CA')) {
      return `${formatted} ج.م`;
    }
    return `$${formatted}`;
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'غير محدد';
    return new Date(dateStr).toLocaleDateString('ar-EG', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatArabicDuration = (startStr?: string, endStr?: string) => {
    if (!startStr) return 'غير محدد';
    const start = new Date(startStr);
    const end = endStr ? new Date(endStr) : new Date();
    const diffMs = end.getTime() - start.getTime();
    if (diffMs <= 0) return 'أقل من ساعة';
    
    const totalHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (totalHours < 24) {
      if (totalHours === 0) return 'أقل من ساعة';
      if (totalHours === 1) return 'ساعة واحدة';
      if (totalHours === 2) return 'ساعتان';
      if (totalHours >= 3 && totalHours <= 10) return `${totalHours} ساعات`;
      return `${totalHours} ساعة`;
    }
    
    const totalDays = Math.floor(totalHours / 24);
    if (totalDays === 1) return 'يوم واحد';
    if (totalDays === 2) return 'يومان';
    if (totalDays >= 3 && totalDays <= 10) return `${totalDays} أيام`;
    return `${totalDays} يوم`;
  };

  const getExitPrice = (signal: SignalItem) => {
    return signal.exitPrice !== undefined
      ? signal.exitPrice
      : signal.status === 'Hit TP' || signal.status === 'SUCCESS'
      ? signal.takeProfit
      : signal.status === 'Hit SL' || signal.status === 'FAILED'
      ? signal.stopLoss
      : signal.currentPrice;
  };

  const formatCloseReason = (reason?: string, status?: string) => {
    const activeReason = reason || (status === 'Hit TP' || status === 'SUCCESS' ? 'TP Hit' : status === 'Hit SL' || status === 'FAILED' ? 'SL Hit' : status === 'Expired' || status === 'EXPIRED' ? 'Expired' : status === 'EXECUTED' ? 'Executed' : '');
    if (!activeReason) return 'غير محدد';
    const mapping: Record<string, string> = {
      'TP Hit': 'ضرب الهدف (TP)',
      'TP Hit (BE)': 'تأمين التعادل (BE)',
      'SL Hit': 'وقف الخسارة (SL)',
      'Expired': 'منتهية الصلاحية',
      'Executed': 'تم التنفيذ',
      'Manual Close': 'إغلاق يدوي'
    };
    return mapping[activeReason] || activeReason;
  };

  const getSignalStatusBadge = (status: string, pnl?: number) => {
    const isWin = status === 'SUCCESS' || status === 'Hit TP' || (status === 'EXECUTED' && (pnl || 0) > 0);
    const isLoss = status === 'FAILED' || status === 'Hit SL' || (status === 'EXECUTED' && (pnl || 0) <= 0);
    const isExpired = status === 'EXPIRED' || status === 'Expired';

    if (isWin) {
      return (
        <span className="bg-emerald-950/60 border border-emerald-500 text-emerald-400 font-bold px-2 py-0.5 rounded text-[10px] inline-flex items-center gap-1">
          ✓ ناجحة
        </span>
      );
    } else if (isLoss) {
      return (
        <span className="bg-red-950/60 border border-red-500 text-red-400 font-bold px-2 py-0.5 rounded text-[9px] inline-flex items-center gap-1">
          ✗ فاشلة
        </span>
      );
    } else if (isExpired) {
      return (
        <span className="bg-neutral-900 border border-neutral-700 text-neutral-400 px-2 py-0.5 rounded text-[9px] inline-flex items-center gap-1">
          ⏱ منتهية
        </span>
      );
    }
    return (
      <span className="bg-neutral-900 border border-neutral-800 text-neutral-400 px-2 py-0.5 rounded text-[9px]">
        {status}
      </span>
    );
  };

  const getTimeframeBadge = (timeframe?: string) => {
    if (!timeframe) return null;
    return (
      <span className="inline-block px-1.5 py-0.5 text-[9px] border border-neutral-800 bg-neutral-900 text-neutral-400 rounded uppercase font-mono font-medium">
        {timeframe}
      </span>
    );
  };

  const getSignalStrengthBadge = (strength?: string) => {
    if (!strength) return null;
    if (strength === 'قوية') {
      return (
        <span className="bg-white text-black font-bold border border-white px-2 py-0.5 rounded text-[9px]">
          ★ قوية
        </span>
      );
    }
    return (
      <span className="bg-transparent border border-neutral-700 text-neutral-400 px-2 py-0.5 rounded text-[9px]">
        ☆ متوسطة
      </span>
    );
  };

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6 md:space-y-8 flex-1 flex flex-col justify-start max-w-7xl mx-auto w-full" dir="rtl">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-neutral-900 pb-4 gap-4">
        <div>
          <h1 className="text-xl font-black tracking-tight text-white uppercase">السجل الشامل / Comprehensive Ledger</h1>
          <p className="text-[10px] text-neutral-400 mt-1 font-mono uppercase tracking-wider">
            سجل أداء التوصيات الذكية والصفقات الشخصية
          </p>
        </div>

        {/* Top Selectors: Account Mode & Market */}
        <div className="flex items-center gap-3 self-end md:self-auto flex-wrap md:flex-nowrap">
          {/* Account Mode Toggle Switch */}
          <div className="flex p-0.5 rounded bg-neutral-900 border border-neutral-800">
            <button
              onClick={() => handleAccountModeChange('PERSONAL')}
              className={`px-3 py-1 text-xs font-bold transition rounded-sm ${
                accountMode === 'PERSONAL' ? 'bg-white text-black font-black' : 'text-neutral-400 hover:text-white'
              }`}
            >
              حساب شخصي 👤
            </button>
            <button
              onClick={() => handleAccountModeChange('FUNDED')}
              className={`px-3 py-1 text-xs font-bold transition rounded-sm ${
                accountMode === 'FUNDED' ? 'bg-white text-black font-black' : 'text-neutral-400 hover:text-white'
              }`}
            >
              حساب ممول 🏆
            </button>
          </div>

          {/* Market Selector Switch */}
          <div className="flex p-0.5 rounded bg-neutral-900 border border-neutral-800">
            <button
              onClick={() => handleMarketChange('EGX')}
              className={`px-4 py-1 text-xs font-bold transition rounded-sm ${
                marketFilter === 'EGX' ? 'bg-white text-black font-black' : 'text-neutral-400 hover:text-white'
              }`}
            >
              EGX
            </button>
            <button
              onClick={() => handleMarketChange('US')}
              className={`px-4 py-1 text-xs font-bold transition rounded-sm ${
                marketFilter === 'US' ? 'bg-white text-black font-black' : 'text-neutral-400 hover:text-white'
              }`}
            >
              US
            </button>
          </div>
        </div>
      </div>

      {/* Primary Tab Switcher */}
      <div className="grid grid-cols-2 gap-2 p-1 bg-neutral-950 border border-neutral-900 rounded-lg">
        <button
          onClick={() => handleMainTabChange('signals')}
          className={`py-3 px-4 text-xs sm:text-sm font-black transition rounded-md flex items-center justify-center gap-2 ${
            mainTab === 'signals'
              ? 'bg-neutral-900 text-white border border-neutral-700 shadow'
              : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/40'
          }`}
        >
          <span>📊</span>
          <span>سجل أداء الرادار (Platform Signals)</span>
        </button>

        <button
          onClick={() => handleMainTabChange('journal')}
          className={`py-3 px-4 text-xs sm:text-sm font-black transition rounded-md flex items-center justify-center gap-2 ${
            mainTab === 'journal'
              ? 'bg-neutral-900 text-white border border-neutral-700 shadow'
              : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/40'
          }`}
        >
          <span>📓</span>
          <span>دفتر الصفقات الشخصية (User Journal)</span>
        </button>
      </div>

      {/* Main Tab 1: Platform Signals History */}
      {mainTab === 'signals' && (
        <div className="space-y-6">
          {/* Performance Stats Banner */}
          <div className={`grid gap-4 ${accountMode === 'FUNDED' ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5' : 'grid-cols-2 lg:grid-cols-4'}`}>
            <div className="border border-neutral-900 bg-neutral-950 p-4 rounded-lg flex flex-col justify-between">
              <span className="text-[9px] text-neutral-500 font-mono font-bold tracking-wider uppercase block">WIN RATE / نسبة النجاح</span>
              <span className="text-2xl font-black text-emerald-400 mt-2 block font-mono">{signalStats.winRate}%</span>
            </div>

            <div className="border border-neutral-900 bg-neutral-950 p-4 rounded-lg flex flex-col justify-between">
              <span className="text-[9px] text-neutral-500 font-mono font-bold tracking-wider uppercase block">PROFIT FACTOR / معامل الربح</span>
              <span className="text-2xl font-black text-white mt-2 block font-mono">{signalStats.profitFactor}</span>
            </div>

            <div className="border border-neutral-900 bg-neutral-950 p-4 rounded-lg flex flex-col justify-between">
              <span className="text-[9px] text-neutral-500 font-mono font-bold tracking-wider uppercase block">AVG RRR / متوسط العائد للمخاطرة</span>
              <span className="text-2xl font-black text-white mt-2 block font-mono">{signalStats.avgRRR}</span>
            </div>

            <div className="border border-neutral-900 bg-neutral-950 p-4 rounded-lg flex flex-col justify-between">
              <span className="text-[9px] text-neutral-500 font-mono font-bold tracking-wider uppercase block">STATS / الإحصائيات الشاملة</span>
              <span className="text-xl font-black text-white mt-2 block font-mono">
                <span className="text-emerald-400">{signalStats.winsCount} W</span> / <span className="text-red-400">{signalStats.lossesCount} L</span> / <span className="text-neutral-400">{signalStats.expiredCount} Exp</span>
              </span>
            </div>

            {accountMode === 'FUNDED' && (
              <div className="border border-neutral-900 bg-neutral-950 p-4 rounded-lg flex flex-col justify-between">
                <span className="text-[9px] text-neutral-500 font-mono font-bold tracking-wider uppercase block">DISCIPLINE RATE / نسبة الانضباط 🎯</span>
                <span className={`text-2xl font-black mt-2 block font-mono ${signalStats.disciplineRate >= 80 ? 'text-emerald-400' : signalStats.disciplineRate >= 50 ? 'text-yellow-500' : 'text-red-500'}`}>{signalStats.disciplineRate}%</span>
              </div>
            )}
          </div>

          {/* Sub-Tab Filter for AI Signals */}
          <div className="flex border-b border-neutral-900 gap-1 overflow-x-auto">
            {[
              { id: 'all', label: 'الكل' },
              { id: 'wins', label: '🟢 ناجحة' },
              { id: 'losses', label: '🔴 فاشلة' },
              { id: 'expired', label: '⚪ منتهية الصلاحية' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => { setSignalSubTab(tab.id as any); setPage(1); }}
                className={`px-6 py-2.5 text-xs font-bold transition border-b-2 whitespace-nowrap ${
                  signalSubTab === tab.id
                    ? 'border-white text-white font-black'
                    : 'border-transparent text-neutral-500 hover:text-neutral-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {error && (
            <div className="p-4 border border-neutral-800 bg-neutral-950 text-neutral-400 text-xs font-mono rounded">
              خطأ: {error}
            </div>
          )}

          {/* Data Table / Cards */}
          {loading ? (
            <div className="py-20 text-center font-mono text-xs text-neutral-500">
              LOADING PLATFORM SIGNALS DATA...
            </div>
          ) : signals.length === 0 ? (
            <div className="py-20 text-center text-xs text-neutral-600 border border-neutral-900 border-dashed rounded bg-neutral-950/20">
              لا توجد توصيات مطابقة للمعيار المحدد حالياً.
            </div>
          ) : (
            <>
              {/* Desktop Table View */}
              <div className="hidden md:block w-full overflow-x-auto rounded-lg border border-neutral-800 bg-neutral-950/20">
                <table className="w-full min-w-[750px] border-collapse text-right text-xs">
                  <thead>
                    <tr className="border-b border-neutral-900 bg-neutral-900/40 text-neutral-300 font-bold font-sans">
                      <th className="p-4">السهم والقوة والمدى</th>
                      <th className="p-4">أسعار التنفيذ (دخول &larr; خروج)</th>
                      <th className="p-4">النتيجة (PnL)</th>
                      <th className="p-4">الحالة</th>
                      {accountMode === 'FUNDED' && <th className="p-4">جودة الإعداد</th>}
                      <th className="p-4">سبب الإغلاق</th>
                      <th className="p-4">مدة التوصية</th>
                      <th className="p-4 text-left">التاريخ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-900/40">
                    {signals.map((trade) => {
                      const isStrong = trade.signalStrength === 'قوية';
                      const exitPrice = getExitPrice(trade);
                      const pnl = trade.pnlPercentage !== undefined ? trade.pnlPercentage : 0;
                      const isWin = trade.status === 'SUCCESS' || trade.status === 'Hit TP' || (trade.status === 'EXECUTED' && pnl > 0);

                      return (
                        <tr
                          key={trade._id}
                          className={`transition duration-200 ${
                            isStrong
                              ? 'bg-white text-black font-semibold'
                              : 'hover:bg-neutral-900/20 text-neutral-350'
                          }`}
                        >
                          <td className="p-4 font-bold tracking-wide">
                            <div className="flex items-center gap-2">
                              <Link href={`/stock/${trade.symbol}`} className={`text-base font-black hover:underline ${isStrong ? 'text-black hover:text-neutral-800' : 'text-white hover:text-neutral-200'}`}>
                                {trade.symbol}
                              </Link>
                              {getTimeframeBadge(trade.timeframe)}
                              {getSignalStrengthBadge(trade.signalStrength)}
                            </div>
                          </td>

                          <td className="p-4 font-mono">
                            {formatPrice(trade.entryPrice, trade.market, trade.symbol)}{' '}
                            <span className={isStrong ? 'text-neutral-600' : 'text-neutral-500'}>&rarr;</span>{' '}
                            {formatPrice(exitPrice, trade.market, trade.symbol)}
                          </td>

                          <td className={`p-4 font-mono font-bold text-sm ${
                            isWin ? 'text-emerald-400 font-black' : pnl < 0 ? 'text-red-400 font-normal' : 'text-neutral-400 font-normal'
                          }`}>
                            {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}%
                          </td>

                          <td className="p-4">
                            {getSignalStatusBadge(trade.status, trade.pnlPercentage)}
                          </td>

                          {accountMode === 'FUNDED' && (
                            <td className="p-4 font-sans text-xs">
                              {trade.setupQuality ? (
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                  trade.setupQuality === 'A+'
                                    ? 'bg-emerald-950/40 border-emerald-500 text-emerald-400'
                                    : trade.setupQuality === 'B'
                                    ? 'bg-blue-950/40 border-blue-500 text-blue-400'
                                    : trade.setupQuality === 'FOMO'
                                    ? 'bg-yellow-950/40 border-yellow-500 text-yellow-500'
                                    : 'bg-red-950/40 border-red-500 text-red-500'
                                }`}>
                                  {trade.setupQuality}
                                </span>
                              ) : (
                                <span className="text-neutral-600 font-mono">-</span>
                              )}
                            </td>
                          )}

                          <td className="p-4 font-sans text-xs">
                            {formatCloseReason(trade.closeReason, trade.status)}
                          </td>

                          <td className="p-4 font-sans text-xs">
                            {formatArabicDuration(trade.createdAt, trade.closedAt || trade.updatedAt)}
                          </td>

                          <td className={`p-4 text-left font-mono ${isStrong ? 'text-neutral-700' : 'text-neutral-500'}`}>
                            {formatDate(trade.createdAt)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile View Card Grid */}
              <div className="md:hidden space-y-4">
                {signals.map((trade) => {
                  const isStrong = trade.signalStrength === 'قوية';
                  const exitPrice = getExitPrice(trade);
                  const pnl = trade.pnlPercentage !== undefined ? trade.pnlPercentage : 0;
                  const isWin = trade.status === 'SUCCESS' || trade.status === 'Hit TP' || (trade.status === 'EXECUTED' && pnl > 0);

                  return (
                    <div
                      key={trade._id}
                      className={`p-4 rounded-lg space-y-3 text-right border transition duration-200 ${
                        isStrong
                          ? 'bg-white text-black border-white'
                          : 'bg-neutral-950 text-neutral-350 border-neutral-900 hover:bg-neutral-900/20'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <Link href={`/stock/${trade.symbol}`} className={`font-black text-sm hover:underline ${isStrong ? 'text-black hover:text-neutral-800' : 'text-white hover:text-neutral-200'}`}>
                          {trade.symbol}
                        </Link>
                        <div className="flex items-center gap-1">
                          {getTimeframeBadge(trade.timeframe)}
                          {getSignalStrengthBadge(trade.signalStrength)}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                        <div>
                          <span className={`block text-[9px] uppercase ${isStrong ? 'text-neutral-700' : 'text-neutral-500'}`}>
                            الدخول &larr; الخروج:
                          </span>
                          <span>
                            {formatPrice(trade.entryPrice, trade.market, trade.symbol)} &rarr; {formatPrice(exitPrice, trade.market, trade.symbol)}
                          </span>
                        </div>

                        <div>
                          <span className={`block text-[9px] uppercase ${isStrong ? 'text-neutral-700' : 'text-neutral-500'}`}>
                            العائد (PnL):
                          </span>
                          <span className={`font-bold ${isWin ? 'text-emerald-400 font-black' : pnl < 0 ? 'text-red-400 font-normal' : 'text-neutral-400 font-normal'}`}>
                            {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}%
                          </span>
                        </div>

                        <div>
                          <span className={`block text-[9px] uppercase ${isStrong ? 'text-neutral-700' : 'text-neutral-500'}`}>
                            الحالة:
                          </span>
                          <span>
                            {getSignalStatusBadge(trade.status, trade.pnlPercentage)}
                          </span>
                        </div>

                        <div>
                          <span className={`block text-[9px] uppercase ${isStrong ? 'text-neutral-700' : 'text-neutral-500'}`}>
                            سبب الإغلاق:
                          </span>
                          <span className="font-sans">
                            {formatCloseReason(trade.closeReason, trade.status)}
                          </span>
                        </div>

                        <div>
                          <span className={`block text-[9px] uppercase ${isStrong ? 'text-neutral-700' : 'text-neutral-500'}`}>
                            مدة الصفقة:
                          </span>
                          <span className="font-sans">
                            {formatArabicDuration(trade.createdAt, trade.closedAt || trade.updatedAt)}
                          </span>
                        </div>
                      </div>

                      <div className={`flex justify-between items-center pt-2 border-t text-[10px] font-mono ${
                        isStrong ? 'text-neutral-750 border-neutral-200' : 'text-neutral-500 border-neutral-900/50'
                      }`}>
                        <span>معدل التقييم: {trade.scoreMetrics?.totalScore || 0}</span>
                        <span>التاريخ: {formatDate(trade.createdAt)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* Main Tab 2: User Trading Journal */}
      {mainTab === 'journal' && (
        <div className="space-y-6">
          {/* User Journal Banner */}
          <div className={`grid gap-4 ${accountMode === 'FUNDED' ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5' : 'grid-cols-2 lg:grid-cols-4'}`}>
            <div className="border border-neutral-900 bg-neutral-950 p-4 rounded-lg flex flex-col justify-between">
              <span className="text-[9px] text-neutral-500 font-mono font-bold tracking-wider uppercase block">REALIZED P&L / صافي الربح المحقق</span>
              <span className={`text-2xl font-black mt-2 block font-mono ${journalStats.totalRealizedPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {journalStats.totalRealizedPnL >= 0 ? '+' : ''}{formatPrice(journalStats.totalRealizedPnL, marketFilter, marketFilter === 'EGX' ? '.CA' : '')}
              </span>
            </div>

            <div className="border border-neutral-900 bg-neutral-950 p-4 rounded-lg flex flex-col justify-between">
              <span className="text-[9px] text-neutral-500 font-mono font-bold tracking-wider uppercase block">AVG ROI / متوسط العائد على الاستثمار</span>
              <span className={`text-2xl font-black mt-2 block font-mono ${journalStats.avgROI >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {journalStats.avgROI >= 0 ? '+' : ''}{journalStats.avgROI.toFixed(2)}%
              </span>
            </div>

            <div className="border border-neutral-900 bg-neutral-950 p-4 rounded-lg flex flex-col justify-between">
              <span className="text-[9px] text-neutral-500 font-mono font-bold tracking-wider uppercase block">JOURNAL WIN RATE / نسبة نجاح الصفقات</span>
              <span className="text-2xl font-black text-white mt-2 block font-mono">{journalStats.winRate}%</span>
            </div>

            <div className="border border-neutral-900 bg-neutral-950 p-4 rounded-lg flex flex-col justify-between">
              <span className="text-[9px] text-neutral-500 font-mono font-bold tracking-wider uppercase block">EXECUTED POSITIONS / الصفقات المغلقة</span>
              <span className="text-xl font-black text-white mt-2 block font-mono">
                {journalStats.totalTrades} <span className="text-xs text-neutral-500 font-normal">صفقة</span> ({journalStats.winningTrades} <span className="text-xs text-emerald-500 font-normal">ربح</span> / {journalStats.losingTrades} <span className="text-xs text-red-500 font-normal">خسارة</span>)
              </span>
            </div>

            {accountMode === 'FUNDED' && (
              <div className="border border-neutral-900 bg-neutral-950 p-4 rounded-lg flex flex-col justify-between">
                <span className="text-[9px] text-neutral-500 font-mono font-bold tracking-wider uppercase block">DISCIPLINE RATE / نسبة الانضباط 🎯</span>
                <span className={`text-2xl font-black mt-2 block font-mono ${journalStats.disciplineRate >= 80 ? 'text-emerald-400' : journalStats.disciplineRate >= 50 ? 'text-yellow-500' : 'text-red-500'}`}>{journalStats.disciplineRate}%</span>
              </div>
            )}
          </div>

          {error && (
            <div className="p-4 border border-neutral-800 bg-neutral-950 text-neutral-400 text-xs font-mono rounded">
              خطأ: {error}
            </div>
          )}

          {/* User Trades Table */}
          {loading ? (
            <div className="py-20 text-center font-mono text-xs text-neutral-500">
              LOADING USER TRADING JOURNAL...
            </div>
          ) : journalTrades.length === 0 ? (
            <div className="py-20 text-center text-xs text-neutral-600 border border-neutral-900 border-dashed rounded bg-neutral-950/20">
              لا توجد صفقات منفذة من قبلك في السجل حالياً.
            </div>
          ) : (
            <>
              {/* Desktop Table View */}
              <div className="hidden md:block w-full overflow-x-auto rounded-lg border border-neutral-800 bg-neutral-950/20">
                <table className="w-full min-w-[750px] border-collapse text-right text-xs">
                  <thead>
                    <tr className="border-b border-neutral-900 bg-neutral-900/40 text-neutral-300 font-bold font-sans">
                      <th className="p-4">السهم والحجم (Quantity)</th>
                      <th className="p-4">أسعار التنفيذ (دخول &larr; خروج)</th>
                      <th className="p-4">الربح/الخسارة الصافية (PnL)</th>
                      <th className="p-4">العائد على الاستثمار (ROI %)</th>
                      {accountMode === 'FUNDED' && <th className="p-4">جودة الإعداد</th>}
                      <th className="p-4">سبب الإغلاق</th>
                      <th className="p-4">مدة الصفقة</th>
                      <th className="p-4 text-left">تاريخ الإغلاق</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-900/40">
                    {journalTrades.map((trade) => {
                      const entry = trade.actualEntryPrice || 0;
                      const exit = trade.exitPrice ?? trade.currentPrice ?? entry;
                      const qty = trade.quantity || (entry > 0 ? trade.positionSize / entry : 0);
                      
                      const pnl = trade.finalPnL !== undefined && trade.finalPnL !== null
                        ? trade.finalPnL
                        : (exit - entry) * qty;

                      const roi = trade.pnlPercentage !== undefined && trade.pnlPercentage !== null
                        ? trade.pnlPercentage
                        : (entry > 0 ? ((exit - entry) / entry) * 100 : 0);

                      const isWin = pnl > 0 || trade.status === 'Hit TP';

                      return (
                        <tr
                          key={trade._id}
                          className="hover:bg-neutral-900/20 text-neutral-300 transition duration-200"
                        >
                          <td className="p-4 font-bold tracking-wide">
                            <div className="flex flex-col">
                              <Link href={`/stock/${trade.symbol}`} className="text-base font-black text-white hover:underline">
                                {trade.symbol}
                              </Link>
                              <span className="text-[10px] text-neutral-400 font-mono">
                                الكمية: {qty.toLocaleString('en-US', { maximumFractionDigits: 2 })} سهم | الحجم: {formatPrice(trade.positionSize, trade.market, trade.symbol)}
                              </span>
                            </div>
                          </td>

                          <td className="p-4 font-mono">
                            {formatPrice(entry, trade.market, trade.symbol)}{' '}
                            <span className="text-neutral-500">&rarr;</span>{' '}
                            {formatPrice(exit, trade.market, trade.symbol)}
                          </td>

                          <td className={`p-4 font-mono font-bold text-sm ${isWin ? 'text-emerald-400 font-black' : 'text-red-400 font-normal'}`}>
                            {pnl >= 0 ? '+' : ''}{formatPrice(pnl, trade.market, trade.symbol)}
                          </td>

                          <td className={`p-4 font-mono font-bold text-sm ${roi >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {roi >= 0 ? '+' : ''}{roi.toFixed(2)}%
                          </td>

                          {accountMode === 'FUNDED' && (
                            <td className="p-4 font-sans text-xs">
                              {trade.setupQuality ? (
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                  trade.setupQuality === 'A+'
                                    ? 'bg-emerald-950/40 border-emerald-500 text-emerald-400'
                                    : trade.setupQuality === 'B'
                                    ? 'bg-blue-950/40 border-blue-500 text-blue-400'
                                    : trade.setupQuality === 'FOMO'
                                    ? 'bg-yellow-950/40 border-yellow-500 text-yellow-500'
                                    : 'bg-red-950/40 border-red-500 text-red-500'
                                }`}>
                                  {trade.setupQuality}
                                </span>
                              ) : (
                                <span className="text-neutral-600 font-mono">-</span>
                              )}
                            </td>
                          )}

                          <td className="p-4 font-sans text-xs">
                            {formatCloseReason(trade.closeReason, trade.status)}
                          </td>

                          <td className="p-4 font-sans text-xs">
                            {formatArabicDuration(trade.executedAt, trade.closedAt || trade.closeDate)}
                          </td>

                          <td className="p-4 text-left font-mono text-neutral-500">
                            {formatDate(trade.closedAt || trade.closeDate || trade.executedAt)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile View Card Grid */}
              <div className="md:hidden space-y-4">
                {journalTrades.map((trade) => {
                  const entry = trade.actualEntryPrice || 0;
                  const exit = trade.exitPrice ?? trade.currentPrice ?? entry;
                  const qty = trade.quantity || (entry > 0 ? trade.positionSize / entry : 0);
                  
                  const pnl = trade.finalPnL !== undefined && trade.finalPnL !== null
                    ? trade.finalPnL
                    : (exit - entry) * qty;

                  const roi = trade.pnlPercentage !== undefined && trade.pnlPercentage !== null
                    ? trade.pnlPercentage
                    : (entry > 0 ? ((exit - entry) / entry) * 100 : 0);

                  const isWin = pnl > 0 || trade.status === 'Hit TP';

                  return (
                    <div
                      key={trade._id}
                      className="p-4 rounded-lg space-y-3 text-right border border-neutral-900 bg-neutral-950 text-neutral-350 hover:bg-neutral-900/20 transition duration-200"
                    >
                      <div className="flex items-center justify-between">
                        <Link href={`/stock/${trade.symbol}`} className="font-black text-base text-white hover:underline">
                          {trade.symbol}
                        </Link>
                        <span className="text-xs font-mono text-neutral-400">
                          {qty.toLocaleString('en-US', { maximumFractionDigits: 2 })} سهم
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                        <div>
                          <span className="block text-[9px] uppercase text-neutral-500">
                            الدخول &larr; الخروج:
                          </span>
                          <span>
                            {formatPrice(entry, trade.market, trade.symbol)} &rarr; {formatPrice(exit, trade.market, trade.symbol)}
                          </span>
                        </div>

                        <div>
                          <span className="block text-[9px] uppercase text-neutral-500">
                            الربح الصافي (PnL):
                          </span>
                          <span className={`font-bold ${isWin ? 'text-emerald-400 font-black' : 'text-red-400 font-normal'}`}>
                            {pnl >= 0 ? '+' : ''}{formatPrice(pnl, trade.market, trade.symbol)}
                          </span>
                        </div>

                        <div>
                          <span className="block text-[9px] uppercase text-neutral-500">
                            العائد (ROI %):
                          </span>
                          <span className={`font-bold ${roi >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {roi >= 0 ? '+' : ''}{roi.toFixed(2)}%
                          </span>
                        </div>

                        <div>
                          <span className="block text-[9px] uppercase text-neutral-500">
                            سبب الإغلاق:
                          </span>
                          <span className="font-sans">
                            {formatCloseReason(trade.closeReason, trade.status)}
                          </span>
                        </div>

                        <div>
                          <span className="block text-[9px] uppercase text-neutral-500">
                            مدة الاحتفاظ:
                          </span>
                          <span className="font-sans">
                            {formatArabicDuration(trade.executedAt, trade.closedAt || trade.closeDate)}
                          </span>
                        </div>
                      </div>

                      <div className="flex justify-between items-center pt-2 border-t border-neutral-900/50 text-[10px] font-mono text-neutral-500">
                        <span>حجم الصفقة: {formatPrice(trade.positionSize, trade.market, trade.symbol)}</span>
                        <span>تاريخ الإغلاق: {formatDate(trade.closedAt || trade.closeDate || trade.executedAt)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-4 pt-4 font-mono text-xs">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-4 py-2 border border-neutral-850 hover:border-neutral-700 bg-neutral-950 text-neutral-300 hover:text-white rounded disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition"
          >
            السابق
          </button>
          <span className="text-neutral-400">
            الصفحة {page} من {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-4 py-2 border border-neutral-850 hover:border-neutral-700 bg-neutral-950 text-neutral-300 hover:text-white rounded disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition"
          >
            التالي
          </button>
        </div>
      )}
    </div>
  );
}
