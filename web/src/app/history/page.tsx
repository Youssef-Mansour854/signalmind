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
  closedAt?: string;
  pnlPercentage?: number;
  closeReason?: string;
  scoreMetrics: {
    riskRewardRatio: number;
    confluenceScore: number;
    aiConfidenceScore: number;
    totalScore: number;
    rank: number;
  };
}

interface StatsData {
  winRate: number;
  profitFactor: string;
  avgRRR: string;
  winsCount: number;
  lossesCount: number;
}

export default function HistoryPage() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [marketFilter, setMarketFilter] = useState<'EGX' | 'US'>('US');
  const [activeTab, setActiveTab] = useState<string>('all'); // all, wins, losses, expired
  
  // Pagination State
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalRecords, setTotalRecords] = useState<number>(0);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Performance Banner Stats State
  const [stats, setStats] = useState<StatsData>({
    winRate: 0,
    profitFactor: '0.00',
    avgRRR: '0.00',
    winsCount: 0,
    lossesCount: 0,
  });

  const getStatusQueryVal = (tab: string) => {
    if (tab === 'wins') return 'Win';
    if (tab === 'losses') return 'Loss';
    if (tab === 'expired') return 'Expired';
    return 'Closed'; // all
  };

  const fetchStats = async () => {
    try {
      const res = await fetch(`/api/signals?status=Closed&limit=1000&market=${marketFilter}`);
      const json = await res.json();
      if (json.success) {
        const closed = json.data || [];
        const wins = closed.filter((s: any) => s.status === 'Hit TP');
        const losses = closed.filter((s: any) => s.status === 'Hit SL');
        
        const totalWins = wins.length;
        const totalLosses = losses.length;
        const totalValids = totalWins + totalLosses;
        
        const winRate = totalValids > 0 ? Math.round((totalWins / totalValids) * 100) : 0;
        
        const totalWinPnl = wins.reduce((acc: number, s: any) => acc + (s.pnlPercentage || 0), 0);
        const totalLossPnl = losses.reduce((acc: number, s: any) => acc + Math.abs(s.pnlPercentage || 0), 0);
        
        let profitFactor = '0.00';
        if (totalLossPnl > 0) {
          profitFactor = (totalWinPnl / totalLossPnl).toFixed(2);
        } else if (totalWinPnl > 0) {
          profitFactor = '∞';
        }
        
        const rrrSignals = closed.filter((s: any) => s.status !== 'Expired' && s.scoreMetrics?.riskRewardRatio > 0);
        const avgRRR = rrrSignals.length > 0 
          ? (rrrSignals.reduce((acc: number, s: any) => acc + (s.scoreMetrics.riskRewardRatio || 0), 0) / rrrSignals.length).toFixed(2)
          : '0.00';
          
        setStats({
          winRate,
          profitFactor,
          avgRRR,
          winsCount: totalWins,
          lossesCount: totalLosses
        });
      }
    } catch (err) {
      console.error('Error fetching stats:', err);
    }
  };

  const fetchSignals = async () => {
    setLoading(true);
    setError(null);
    try {
      const statusVal = getStatusQueryVal(activeTab);
      const url = `/api/signals?market=${marketFilter}&status=${statusVal}&page=${page}&limit=50`;
      const res = await fetch(url);
      const json = await res.json();
      
      if (json.success) {
        setSignals(json.data);
        setTotalPages(json.totalPages || 1);
        setTotalRecords(json.total || 0);
      } else {
        setError(json.error || 'فشل في جلب سجل التوصيات');
      }
    } catch (err: any) {
      setError(err.message || 'حدث خطأ غير متوقع');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [marketFilter]);

  useEffect(() => {
    fetchSignals();
  }, [marketFilter, activeTab, page]);

  const handleMarketChange = (market: 'US' | 'EGX') => {
    setMarketFilter(market);
    setPage(1);
  };

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setPage(1);
  };

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

  const getExitPrice = (signal: Signal) => {
    return signal.status === 'Hit TP'
      ? signal.takeProfit
      : signal.status === 'Hit SL'
      ? signal.stopLoss
      : signal.currentPrice;
  };

  const formatCloseReason = (reason?: string, status?: string) => {
    const activeReason = reason || (status === 'Hit TP' ? 'TP Hit' : status === 'Hit SL' ? 'SL Hit' : status === 'Expired' ? 'Expired' : '');
    if (!activeReason) return 'غير محدد';
    const mapping: Record<string, string> = {
      'TP Hit': 'ضرب الهدف (TP)',
      'TP Hit (BE)': 'تأمين التعادل (BE)',
      'SL Hit': 'وقف الخسارة (SL)',
      'Expired': 'منتهية الصلاحية',
      'Manual Close': 'إغلاق يدوي'
    };
    return mapping[activeReason] || activeReason;
  };

  const formatArabicDuration = (startStr: string, endStr?: string) => {
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
    } else {
      return (
        <span className="bg-transparent border border-neutral-700 text-neutral-400 px-2 py-0.5 rounded text-[9px]">
          ☆ متوسطة
        </span>
      );
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-8 flex-1 flex flex-col justify-start max-w-7xl mx-auto w-full" dir="rtl">
      {/* Title Bar */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-neutral-900 pb-4 gap-4">
        <div>
          <h1 className="text-xl font-black tracking-tight text-white uppercase">السجل الشامل / Comprehensive Ledger</h1>
          <p className="text-[10px] text-neutral-400 mt-1 font-mono uppercase tracking-wider">
            عرض وتحليل العمليات التاريخية وإحصائيات كفاءة النظام
          </p>
        </div>

        {/* Market Selector */}
        <div className="flex p-0.5 rounded bg-neutral-900 border border-neutral-800 self-end md:self-auto">
          <button
            onClick={() => handleMarketChange('EGX')}
            className={`px-4 py-1 text-xs font-bold transition rounded-sm ${
              marketFilter === 'EGX' ? 'bg-white text-black' : 'text-neutral-450 hover:text-white'
            }`}
          >
            EGX
          </button>
          <button
            onClick={() => handleMarketChange('US')}
            className={`px-4 py-1 text-xs font-bold transition rounded-sm ${
              marketFilter === 'US' ? 'bg-white text-black' : 'text-neutral-450 hover:text-white'
            }`}
          >
            US
          </button>
        </div>
      </div>

      {/* Top Performance Banner */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Win Rate */}
        <div className="border border-neutral-900 bg-neutral-950 p-4 rounded-lg flex flex-col justify-between">
          <span className="text-[9px] text-neutral-500 font-mono font-bold tracking-wider uppercase block">WIN RATE / نسبة النجاح</span>
          <span className="text-2xl font-black text-white mt-2 block font-mono">{stats.winRate}%</span>
        </div>

        {/* Profit Factor */}
        <div className="border border-neutral-900 bg-neutral-950 p-4 rounded-lg flex flex-col justify-between">
          <span className="text-[9px] text-neutral-500 font-mono font-bold tracking-wider uppercase block">PROFIT FACTOR / معامل الربح</span>
          <span className="text-2xl font-black text-white mt-2 block font-mono">{stats.profitFactor}</span>
        </div>

        {/* Achieved RRR */}
        <div className="border border-neutral-900 bg-neutral-950 p-4 rounded-lg flex flex-col justify-between">
          <span className="text-[9px] text-neutral-500 font-mono font-bold tracking-wider uppercase block">AVG RRR / متوسط العائد للمخاطرة</span>
          <span className="text-2xl font-black text-white mt-2 block font-mono">{stats.avgRRR}</span>
        </div>

        {/* Win / Loss Count */}
        <div className="border border-neutral-900 bg-neutral-950 p-4 rounded-lg flex flex-col justify-between">
          <span className="text-[9px] text-neutral-500 font-mono font-bold tracking-wider uppercase block">WINS vs LOSSES / صفقات رابحة ضد خاسرة</span>
          <span className="text-2xl font-black text-white mt-2 block font-mono">
            {stats.winsCount} <span className="text-xs text-neutral-500 font-normal">Win</span> / {stats.lossesCount} <span className="text-xs text-neutral-500 font-normal">Loss</span>
          </span>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex border-b border-neutral-900 gap-1 overflow-x-auto">
        {[
          { id: 'all', label: 'الكل' },
          { id: 'wins', label: 'التوصيات الناجحة' },
          { id: 'losses', label: 'التوصيات الفاشلة' },
          { id: 'expired', label: 'الملغاة / المنتهية' }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={`px-6 py-2.5 text-xs font-bold transition border-b-2 whitespace-nowrap ${
              activeTab === tab.id
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

      {/* Data Grid / Tables */}
      {loading ? (
        <div className="py-20 text-center font-mono text-xs text-neutral-500">
          LOADING LEDGER DATA...
        </div>
      ) : signals.length === 0 ? (
        <div className="py-20 text-center text-xs text-neutral-600 border border-neutral-900 border-dashed rounded bg-neutral-950/20">
          لا توجد سجلات مطابقة حالياً.
        </div>
      ) : (
        <>
          {/* Desktop Data Table */}
          <div className="hidden md:block overflow-x-auto border border-neutral-900 rounded bg-neutral-950/20">
            <table className="w-full border-collapse text-right text-xs">
              <thead>
                <tr className="border-b border-neutral-900 bg-neutral-900/40 text-neutral-300 font-bold font-sans">
                  <th className="p-4">السهم والقوة والمدى</th>
                  <th className="p-4">سعر التنفيذ (دخول &larr; خروج)</th>
                  <th className="p-4">النتيجة (PnL)</th>
                  <th className="p-4">سبب الإغلاق</th>
                  <th className="p-4">مدة الصفقة</th>
                  <th className="p-4 text-left">تاريخ التوصية</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-900/40">
                {signals.map((trade) => {
                  const isStrong = trade.signalStrength === 'قوية';
                  const exitPrice = getExitPrice(trade);
                  const pnl = trade.pnlPercentage !== undefined ? trade.pnlPercentage : 0;
                  const isWin = pnl > 0 || trade.status === 'Hit TP';

                  return (
                    <tr
                      key={trade._id}
                      className={`transition duration-200 ${
                        isStrong
                          ? 'bg-white text-black font-semibold'
                          : 'hover:bg-neutral-900/20 text-neutral-350'
                      }`}
                    >
                      {/* Symbol & Badges */}
                      <td className="p-4 font-bold tracking-wide">
                        <div className="flex items-center gap-2">
                          <Link href={`/stock/${trade.symbol}`} className={`text-base font-black hover:underline ${isStrong ? 'text-black hover:text-neutral-800' : 'text-white hover:text-neutral-200'}`}>
                            {trade.symbol}
                          </Link>
                          {getTimeframeBadge(trade.timeframe)}
                          {getSignalStrengthBadge(trade.signalStrength)}
                        </div>
                      </td>

                      {/* Price Execution */}
                      <td className="p-4 font-mono">
                        {formatPrice(trade.entryPrice, trade.market, trade.symbol)}{' '}
                        <span className={isStrong ? 'text-neutral-600' : 'text-neutral-500'}>&rarr;</span>{' '}
                        {formatPrice(exitPrice, trade.market, trade.symbol)}
                      </td>

                      {/* Net Outcome PnL */}
                      <td className={`p-4 font-mono font-bold text-sm ${
                        isWin ? 'text-white font-black' : 'text-neutral-500 font-normal'
                      }`}>
                        {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}%
                      </td>

                      {/* Close Reason */}
                      <td className="p-4 font-sans text-xs">
                        {formatCloseReason(trade.closeReason, trade.status)}
                      </td>

                      {/* Trade Duration */}
                      <td className="p-4 font-sans text-xs">
                        {formatArabicDuration(trade.createdAt, trade.closedAt || trade.updatedAt)}
                      </td>

                      {/* Date */}
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
              const isWin = pnl > 0 || trade.status === 'Hit TP';

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
                    <Link href={`/stock/${trade.symbol}`} className={`font-black text-sm hover:underline ${isStrong ? 'text-black hover:text-neutral-800' : 'text-white hover:text-neutral-205'}`}>
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
                      <span className={`font-bold ${isWin ? 'text-white font-black' : 'text-neutral-500 font-normal'}`}>
                        {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}%
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
                    <span>معدل التقييم: {trade.scoreMetrics.totalScore}</span>
                    <span>التاريخ: {formatDate(trade.createdAt)}</span>
                  </div>
                </div>
              );
            })}
          </div>

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
        </>
      )}
    </div>
  );
}
