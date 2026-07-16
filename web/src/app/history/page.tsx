'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

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
  signalStrength?: string;
  createdAt: string;
  updatedAt: string;
  pnlPercentage?: number;
  scoreMetrics: {
    riskRewardRatio: number;
    confluenceScore: number;
    aiConfidenceScore: number;
    totalScore: number;
    rank: number;
  };
}

export default function HistoryPage() {
  const pathname = usePathname();
  const [signals, setSignals] = useState<Signal[]>([]);
  const [marketFilter, setMarketFilter] = useState<'EGX' | 'US'>('US');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  
  // Pagination State
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalRecords, setTotalRecords] = useState<number>(0);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSignals = async () => {
    setLoading(true);
    setError(null);
    try {
      const url = `/api/signals?market=${marketFilter}&status=${statusFilter}&page=${page}&limit=50`;
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
    fetchSignals();
  }, [marketFilter, statusFilter, page]);

  // Reset page to 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [marketFilter, statusFilter]);

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

  const getTimeframeBadge = (timeframe?: string) => {
    if (!timeframe) return null;
    
    let styles = "border-neutral-750 bg-neutral-900 text-neutral-350";
    let weight = "font-medium";
    
    if (timeframe === "يومي") {
      styles = "border-neutral-800 bg-neutral-950 text-neutral-450";
      weight = "font-normal";
    } else if (timeframe === "أسبوعي") {
      styles = "border-neutral-700 bg-neutral-900/85 text-neutral-300";
      weight = "font-medium";
    } else if (timeframe === "شهري") {
      styles = "border-neutral-600 bg-neutral-800 text-neutral-200";
      weight = "font-bold";
    } else if (timeframe === "استثمار سنوي") {
      styles = "border-neutral-500 bg-neutral-700 text-white";
      weight = "font-black tracking-wide";
    }
    
    return (
      <span className={`inline-block px-1.5 py-0.5 text-[9px] border rounded uppercase font-mono ${styles} ${weight}`}>
        {timeframe}
      </span>
    );
  };

  const getSignalStrengthBadge = (strength?: string) => {
    if (!strength) return null;
    if (strength === "قوية") {
      return (
        <span className="bg-white text-black font-bold border border-white px-2 py-0.5 rounded flex items-center gap-1 text-[9px]">
          <span>★</span>
          <span>{strength}</span>
        </span>
      );
    } else {
      return (
        <span className="bg-transparent border border-neutral-600 text-neutral-300 font-medium px-2 py-0.5 rounded flex items-center gap-1 text-[9px]">
          <span>☆</span>
          <span>{strength}</span>
        </span>
      );
    }
  };

  const getStatusBadge = (status: string, pnl?: number) => {
    let styles = "border-neutral-800 bg-neutral-950 text-neutral-400";
    
    if (status === 'Hit TP') {
      styles = "border-neutral-400 bg-neutral-850 text-neutral-100 font-bold";
    } else if (status === 'Hit SL' || status === 'Expired') {
      styles = "border-neutral-850 bg-neutral-950/60 text-neutral-500 font-light";
    } else if (status === 'Active' || status === 'Pending') {
      styles = "border-neutral-700 bg-neutral-900/40 text-neutral-300 font-medium";
    }
    
    return (
      <span className={`inline-block px-2 py-0.5 text-[10px] border rounded font-mono ${styles}`}>
        {status} {pnl !== undefined && pnl !== 0 ? `(${pnl >= 0 ? '+' : ''}${pnl.toFixed(1)}%)` : ''}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-transparent text-neutral-100 font-sans antialiased" dir="rtl">
      {/* Header */}
      <header className="border-b border-neutral-900/50 py-5 sticky top-0 z-50 backdrop-blur-md bg-neutral-950/70">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex flex-col md:flex-row md:items-center gap-6">
            <div>
              <h1 className="text-xl font-black tracking-tight uppercase">
                <span className="bg-white text-transparent bg-clip-text">
                  محطة سيجنال مايند / SignalMind
                </span>
              </h1>
              <p className="text-[10px] text-neutral-400 mt-1 font-mono uppercase tracking-wider">
                التداول الخوارزمي الذكي والتحليل الإحصائي وإدارة المراكز
              </p>
            </div>

            {/* Sleek monochrome navigation links */}
            <nav className="flex items-center gap-4 text-xs font-bold font-sans">
              <Link 
                href="/" 
                className={`transition-colors duration-250 py-1.5 px-3 rounded-md ${pathname === '/' ? 'text-black bg-white font-bold border border-white' : 'text-neutral-450 hover:text-neutral-250'}`}
              >
                الرئيسية
              </Link>
              <Link 
                href="/history" 
                className={`transition-colors duration-250 py-1.5 px-3 rounded-md ${pathname === '/history' ? 'text-black bg-white font-bold border border-white' : 'text-neutral-450 hover:text-neutral-250'}`}
              >
                سجل التوصيات
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <span className="h-2.5 w-2.5 rounded-full bg-white animate-pulse shadow-[0_0_10px_#ffffff]" />
            <span className="text-[10px] text-neutral-400 font-mono uppercase tracking-wider">
              متصل بالشبكة
            </span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-6 py-10 space-y-8">
        
        {/* Title & Filter Bar */}
        <div className="flex flex-col md:flex-row justify-between items-center border-b border-neutral-900/50 pb-4 gap-4">
          <div>
            <h2 className="text-lg font-black tracking-tight text-white font-sans">سجل التوصيات التاريخي</h2>
            <p className="text-[10px] text-neutral-500 font-mono mt-1">
              إجمالي السجلات: {totalRecords} | صفحة {page} من {totalPages}
            </p>
          </div>

          {/* Market & Status Filters */}
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
            {/* Market Tabs */}
            <div className="flex gap-1.5 p-1 rounded-lg bg-neutral-950 border border-neutral-900 font-sans">
              <button
                onClick={() => setMarketFilter('EGX')}
                className={`px-4 py-1.5 text-xs font-bold transition-all duration-200 rounded cursor-pointer ${
                  marketFilter === 'EGX'
                    ? 'bg-white text-black font-bold'
                    : 'text-neutral-400 hover:text-neutral-250'
                }`}
              >
                EGX
              </button>
              <button
                onClick={() => setMarketFilter('US')}
                className={`px-4 py-1.5 text-xs font-bold transition-all duration-200 rounded cursor-pointer ${
                  marketFilter === 'US'
                    ? 'bg-white text-black font-bold'
                    : 'text-neutral-400 hover:text-neutral-250'
                }`}
              >
                US
              </button>
            </div>

            {/* Status Dropdown Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-neutral-950 border border-neutral-900 text-neutral-300 py-1.5 px-4 text-xs rounded-md focus:outline-none focus:border-white font-bold font-sans cursor-pointer transition-all duration-200"
            >
              <option value="All">جميع الحالات (All)</option>
              <option value="Active">النشطة والمعلقة (Active)</option>
              <option value="Closed">المغلقة بالكامل (Closed)</option>
              <option value="Win">رابحة فقط (Wins)</option>
              <option value="Loss">خاسرة فقط (Losses)</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="py-20 text-center font-mono text-xs text-neutral-500">
            جاري تحميل السجلات التاريخية من قاعدة البيانات...
          </div>
        ) : error ? (
          <div className="p-4 border border-neutral-800 bg-neutral-950 text-neutral-400 text-xs font-mono rounded">
            خطأ: {error}
          </div>
        ) : signals.length === 0 ? (
          <div className="py-20 text-center text-xs text-neutral-600 border border-neutral-900 rounded-lg bg-neutral-950/20">
            لا توجد إشارات تطابق خيارات التصفية المحددة.
          </div>
        ) : (
          <>
            {/* Desktop View Table */}
            <div className="hidden md:block overflow-x-auto glass-card rounded-lg border border-neutral-900">
              <table className="w-full border-collapse text-right text-xs">
                <thead>
                  <tr className="border-b border-neutral-900/50 bg-neutral-900/60 text-neutral-200 sticky top-0 bg-neutral-950 z-10 font-bold font-sans">
                    <th className="p-4">السهم والمدى وقوة الإشارة</th>
                    <th className="p-4">سعر الدخول</th>
                    <th className="p-4">السعر الحالي / الإغلاق</th>
                    <th className="p-4">الهدف / وقف الخسارة</th>
                    <th className="p-4 text-center">التقييم</th>
                    <th className="p-4 text-center">الحالة والعائد</th>
                    <th className="p-4 text-left">تاريخ التوصية</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-900/40 bg-neutral-950/20">
                  {signals.map(trade => {
                    return (
                      <tr key={trade._id} className="hover:bg-neutral-900/20 transition-all duration-200">
                        <td className="p-4 font-bold text-white tracking-wide">
                          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                            <span className="text-base">{trade.symbol}</span>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {getTimeframeBadge(trade.timeframe)}
                              {getSignalStrengthBadge(trade.signalStrength)}
                            </div>
                          </div>
                          <div className="text-[10px] text-neutral-500 mt-1 font-mono uppercase">
                            نوع: {trade.signalType} | RRR: {trade.scoreMetrics.riskRewardRatio?.toFixed(2)}
                          </div>
                        </td>
                        <td className="p-4 text-neutral-300 font-mono">{formatPrice(trade.entryPrice, trade.market, trade.symbol)}</td>
                        <td className="p-4 font-mono font-bold text-neutral-100">
                          {formatPrice(trade.currentPrice, trade.market, trade.symbol)}
                        </td>
                        <td className="p-4 font-mono">
                          <div className="text-white font-bold">{formatPrice(trade.takeProfit, trade.market, trade.symbol)}</div>
                          <div className="text-neutral-450 mt-1">{formatPrice(trade.stopLoss, trade.market, trade.symbol)}</div>
                        </td>
                        <td className="p-4 text-center font-mono">
                          <span className="inline-block px-2 py-0.5 text-[10px] bg-neutral-900 border border-neutral-850 rounded">
                            {trade.scoreMetrics.totalScore}
                          </span>
                        </td>
                        <td className="p-4 text-center">
                          {getStatusBadge(trade.status, trade.pnlPercentage)}
                        </td>
                        <td className="p-4 text-left text-neutral-500 font-mono">{formatDate(trade.createdAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile View Card Grid */}
            <div className="md:hidden space-y-4">
              {signals.map(trade => (
                <div key={trade._id} className="glass-card p-4 rounded-lg space-y-3 text-right border border-neutral-900 hover:bg-neutral-900/20 transition duration-200">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                      <span className="font-bold text-white tracking-wide text-sm">{trade.symbol}</span>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {getTimeframeBadge(trade.timeframe)}
                        {getSignalStrengthBadge(trade.signalStrength)}
                      </div>
                    </div>
                    {getStatusBadge(trade.status, trade.pnlPercentage)}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-neutral-500 block text-[10px]">سعر الدخول:</span>
                      <span className="text-neutral-300 font-mono">{formatPrice(trade.entryPrice, trade.market, trade.symbol)}</span>
                    </div>
                    <div>
                      <span className="text-neutral-500 block text-[10px]">السعر الحالي/الإغلاق:</span>
                      <span className="text-neutral-100 font-mono">{formatPrice(trade.currentPrice, trade.market, trade.symbol)}</span>
                    </div>
                    <div>
                      <span className="text-neutral-500 block text-[10px]">الهدف (TP):</span>
                      <span className="text-white font-bold font-mono">{formatPrice(trade.takeProfit, trade.market, trade.symbol)}</span>
                    </div>
                    <div>
                      <span className="text-neutral-500 block text-[10px]">وقف الخسارة (SL):</span>
                      <span className="text-neutral-450 font-mono">{formatPrice(trade.stopLoss, trade.market, trade.symbol)}</span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-neutral-900/50 text-[10px] text-neutral-500 font-mono">
                    <span>نقاط التقييم: {trade.scoreMetrics.totalScore}</span>
                    <span>التاريخ: {formatDate(trade.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex justify-center items-center gap-4 pt-4 font-mono text-xs">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-4 py-2 border border-neutral-850 hover:border-neutral-700 bg-neutral-950 text-neutral-300 hover:text-white rounded disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition"
                >
                  السابق
                </button>
                <span className="text-neutral-400">
                  الصفحة {page} من {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-4 py-2 border border-neutral-850 hover:border-neutral-700 bg-neutral-950 text-neutral-300 hover:text-white rounded disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition"
                >
                  التالي
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
