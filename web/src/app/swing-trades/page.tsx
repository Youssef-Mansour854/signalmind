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

interface PortfolioItem {
  _id: string;
  signalId: Signal | string;
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
  pnlPercentage?: number;
  closeReason?: string;
  brokerFees?: number;
}

export default function SwingTradesPage() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([]);
  const [marketFilter, setMarketFilter] = useState<'EGX' | 'US'>('US');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expiredCount, setExpiredCount] = useState<number>(0);

  // Execute Modal State
  const [isExecModalOpen, setIsExecModalOpen] = useState(false);
  const [selectedSignal, setSelectedSignal] = useState<Signal | null>(null);
  const [actualEntryPrice, setActualEntryPrice] = useState<number>(0);
  const [positionSize, setPositionSize] = useState<string>('');
  const [execQuantity, setExecQuantity] = useState<string>('');

  const handleValueChange = (val: string) => {
    setPositionSize(val);
    const numVal = parseFloat(val);
    const numPrice = typeof actualEntryPrice === 'number' ? actualEntryPrice : parseFloat(String(actualEntryPrice));
    if (numVal > 0 && numPrice > 0) {
      setExecQuantity((numVal / numPrice).toFixed(4));
    } else {
      setExecQuantity('');
    }
  };

  const handleQuantityChange = (val: string) => {
    setExecQuantity(val);
    const numQty = parseFloat(val);
    const numPrice = typeof actualEntryPrice === 'number' ? actualEntryPrice : parseFloat(String(actualEntryPrice));
    if (numQty > 0 && numPrice > 0) {
      setPositionSize((numQty * numPrice).toFixed(2));
    } else {
      setPositionSize('');
    }
  };

  const handlePriceChange = (priceVal: number) => {
    setActualEntryPrice(priceVal);
    const numPrice = priceVal;
    const numValue = parseFloat(positionSize);
    if (numPrice > 0 && numValue > 0) {
      setExecQuantity((numValue / numPrice).toFixed(4));
    }
  };

  // Close Modal State
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
  const [selectedPortfolioItem, setSelectedPortfolioItem] = useState<PortfolioItem | null>(null);
  const [exitPrice, setExitPrice] = useState<number>(0);
  const [closeReason, setCloseReason] = useState<string>('Manual Close');

  // Scale Modal State
  const [isScaleModalOpen, setIsScaleModalOpen] = useState(false);
  const [scaleAction, setScaleAction] = useState<'BUY_MORE' | 'PARTIAL_CLOSE'>('BUY_MORE');
  const [scalePrice, setScalePrice] = useState<number>(0);
  const [scaleQty, setScaleQty] = useState<string>('');
  const [scaleFees, setScaleFees] = useState<string>('0');

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [signalsRes, portfolioRes] = await Promise.all([
        fetch(`/api/signals?status=Active&limit=100&market=${marketFilter}&timeframe=${encodeURIComponent('أسبوعي')}`),
        fetch(`/api/portfolio`)
      ]);
      
      const signalsJson = await signalsRes.json();
      const portfolioJson = await portfolioRes.json();

      if (signalsJson.success && portfolioJson.success) {
        setSignals(signalsJson.data);
        setExpiredCount(signalsJson.expiredCount || 0);
        setPortfolio(portfolioJson.data);
      } else {
        setError(signalsJson.error || portfolioJson.error || 'فشل في تحميل البيانات');
      }
    } catch (err: any) {
      setError(err.message || 'حدث خطأ غير متوقع');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [marketFilter]);

  const handleExecuteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSignal) return;

    try {
      const res = await fetch('/api/portfolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signalId: selectedSignal._id,
          symbol: selectedSignal.symbol,
          market: selectedSignal.market,
          actualEntryPrice,
          positionSize: Number(positionSize),
          quantity: execQuantity ? Number(execQuantity) : undefined
        })
      });

      const json = await res.json();
      if (json.success) {
        setIsExecModalOpen(false);
        fetchData();
      } else {
        alert(json.error || 'فشلت عملية التنفيذ');
      }
    } catch (err: any) {
      alert(err.message || 'حدث خطأ غير متوقع');
    }
  };

  const handleCloseSubmit = async (e: React.FormEvent) => {
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
        fetchData();
      } else {
        alert(json.error || 'فشل إغلاق الصفقة');
      }
    } catch (err: any) {
      alert(err.message || 'حدث خطأ غير متوقع');
    }
  };

  const handleScaleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPortfolioItem) return;

    try {
      const res = await fetch('/api/portfolio/scale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedPortfolioItem._id,
          scaleAction,
          price: scalePrice,
          quantity: Number(scaleQty),
          fees: Number(scaleFees)
        })
      });

      const json = await res.json();
      if (json.success) {
        setIsScaleModalOpen(false);
        setScaleQty('');
        setScaleFees('0');
        fetchData();
      } else {
        alert(json.error || 'فشلت عملية تعديل الكمية');
      }
    } catch (err: any) {
      alert(err.message || 'حدث خطأ غير متوقع');
    }
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

  // Filter portfolio active trades that correspond to the weekly timeframe
  const activePortfolio = portfolio.filter(
    (item) =>
      item.status === 'ACTIVE' &&
      item.market === marketFilter &&
      typeof item.signalId === 'object' &&
      item.signalId?.timeframe === 'أسبوعي'
  );

  // Sort weekly signals so that "قوية" comes first
  const sortedSignals = [...signals].sort((a, b) => {
    if (a.signalStrength === 'قوية' && b.signalStrength !== 'قوية') return -1;
    if (a.signalStrength !== 'قوية' && b.signalStrength === 'قوية') return 1;
    return 0;
  });

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6 md:space-y-8 flex-1 flex flex-col justify-start max-w-7xl mx-auto w-full" dir="rtl">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-neutral-900 pb-6 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">📅</span>
            <h1 className="text-xl font-black text-white uppercase tracking-tight">فرص أسبوعية / Swing Trades</h1>
          </div>
          <p className="text-[10px] text-neutral-400 mt-1 font-mono uppercase tracking-wider">
            عرض وتداول الإشارات متوسطة المدى النشطة هذا الأسبوع
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
            onClick={fetchData}
            className="p-1.5 border border-neutral-800 bg-neutral-900 text-neutral-400 hover:text-white rounded transition"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.27 15" />
            </svg>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 border border-neutral-800 bg-neutral-950 text-neutral-400 text-xs font-mono rounded">
          خطأ: {error}
        </div>
      )}

      {/* Active Portfolio Positions for Swing-Trades */}
      <section className="space-y-4">
        <h2 className="text-xs font-black uppercase tracking-wider font-mono text-neutral-400 flex items-center gap-2">
          <span>[ الصفقات المفتوحة الأسبوعية / ACTIVE POSITIONS ]</span>
          <span className="text-xs text-neutral-600 font-normal">({activePortfolio.length})</span>
        </h2>

        {activePortfolio.length === 0 ? (
          <div className="py-8 text-center text-xs text-neutral-600 border border-neutral-900/60 rounded bg-neutral-950/20">
            لا توجد صفقات منفذة حالياً لهذا المدى.
          </div>
        ) : (
          <div className="w-full overflow-x-auto rounded-lg border border-neutral-800 bg-neutral-950/20">
            <table className="w-full min-w-[650px] border-collapse text-right text-xs">
              <thead>
                <tr className="border-b border-neutral-900 bg-neutral-900/40 text-neutral-300 font-bold font-sans">
                  <th className="p-4">الرمز</th>
                  <th className="p-4">سعر الدخول الفعلي</th>
                  <th className="p-4">الكمية</th>
                  <th className="p-4">السعر الحالي</th>
                  <th className="p-4">القيمة المستثمرة</th>
                  <th className="p-4">الرسوم</th>
                  <th className="p-4">الربح/الخسارة</th>
                  <th className="p-4">التاريخ</th>
                  <th className="p-4 text-center">الإجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-900/40">
                {activePortfolio.map((item) => {
                  const current = item.currentPrice || item.actualEntryPrice || 0;
                  const pnl = item.currentPnL !== undefined ? item.currentPnL : 0;
                  const pnlPct =
                    item.pnlPercentage !== undefined
                      ? item.pnlPercentage
                      : item.actualEntryPrice > 0
                      ? ((current - item.actualEntryPrice) / item.actualEntryPrice) * 100
                      : 0;

                  return (
                    <tr key={item._id} className="hover:bg-neutral-900/20 transition duration-200">
                      <td className="p-4 font-bold text-white tracking-wide">
                        <Link href={`/stock/${item.symbol}`} className="hover:underline hover:text-white">
                          {item.symbol}
                        </Link>
                      </td>
                      <td className="p-4 text-neutral-350 font-mono">
                        {formatPrice(item.actualEntryPrice, item.market, item.symbol)}
                      </td>
                      <td className="p-4 text-neutral-350 font-mono">
                        {item.quantity || 0}
                      </td>
                      <td className="p-4 text-neutral-100 font-mono">
                        {formatPrice(current, item.market, item.symbol)}
                      </td>
                      <td className="p-4 text-neutral-200 font-mono">
                        {formatPrice(item.positionSize, item.market, item.symbol)}
                      </td>
                      <td className="p-4 text-neutral-350 font-mono">
                        {formatPrice(item.brokerFees || 0, item.market, item.symbol)}
                      </td>
                      <td className={`p-4 font-bold font-mono ${pnl >= 0 ? 'text-white' : 'text-neutral-500'}`}>
                        {formatPrice(pnl, item.market, item.symbol)}{' '}
                        <span dir="ltr" className="inline-block">
                          ({pnl >= 0 ? '+' : ''}
                          {pnlPct.toFixed(2)}%)
                        </span>
                      </td>
                      <td className="p-4 text-neutral-500 font-mono">{formatDate(item.executedAt)}</td>
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => {
                              setSelectedPortfolioItem(item);
                              setScalePrice(current || item.actualEntryPrice);
                              setScaleAction('BUY_MORE');
                              setScaleQty('');
                              setScaleFees('0');
                              setIsScaleModalOpen(true);
                            }}
                            className="px-2.5 py-1.5 text-[10px] border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-white font-bold rounded cursor-pointer transition"
                          >
                            تعديل الكمية
                          </button>
                          <button
                            onClick={() => {
                              setSelectedPortfolioItem(item);
                              setExitPrice(current || item.actualEntryPrice);
                              setCloseReason('Manual Close');
                              setIsCloseModalOpen(true);
                            }}
                            className="px-2.5 py-1.5 text-[10px] border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 text-neutral-350 hover:text-white font-bold rounded cursor-pointer transition"
                          >
                            إغلاق الصفقة
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Signals List for Swing-Trades */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h2 className="text-xs font-black uppercase tracking-wider font-mono text-neutral-400 flex items-center gap-2">
            <span>[ إشارات الفرص الأسبوعية النشطة / SIGNALS ]</span>
            <span className="text-xs text-neutral-600 font-normal">({sortedSignals.length})</span>
          </h2>
          {expiredCount > 0 && (
            <div className="text-[10px] text-neutral-500 font-mono">
              [ تم إخفاء {expiredCount} إشارة منتهية الصلاحية تلقائياً ]
            </div>
          )}
        </div>

        {sortedSignals.length === 0 ? (
          <div className="py-8 text-center text-xs text-neutral-600 border border-neutral-900/60 rounded bg-neutral-950/20">
            لا توجد إشارات أسبوعية نشطة حالياً.
          </div>
        ) : (
          <div className="w-full overflow-x-auto rounded-lg border border-neutral-800 bg-neutral-950/20">
            <table className="w-full min-w-[750px] border-collapse text-right text-xs">
              <thead>
                <tr className="border-b border-neutral-900 bg-neutral-900/40 text-neutral-300 font-bold font-sans">
                  <th className="p-4">السهم والقوة</th>
                  <th className="p-4">النوع</th>
                  <th className="p-4">الدخول المقترح</th>
                  <th className="p-4">الهدف</th>
                  <th className="p-4">وقف الخسارة</th>
                  <th className="p-4">السعر الحالي</th>
                  <th className="p-4" style={{ width: '35%' }}>التحليل الفني</th>
                  <th className="p-4 text-center">الإجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-900/40">
                {sortedSignals.map((signal) => {
                  const isStrong = signal.signalStrength === 'قوية';

                  return (
                    <tr
                      key={signal._id}
                      className={`transition duration-200 ${
                        isStrong
                          ? 'bg-white text-black font-semibold'
                          : 'hover:bg-neutral-900/20 text-neutral-300'
                      }`}
                    >
                      <td className="p-4 font-bold tracking-wide">
                        <div className="flex flex-col">
                          <Link href={`/stock/${signal.symbol}`} className={`hover:underline font-bold text-sm ${isStrong ? 'text-black hover:text-neutral-800' : 'text-white'}`}>
                            {signal.symbol}
                          </Link>
                          <span className={`text-[9px] mt-0.5 ${isStrong ? 'text-neutral-700' : 'text-neutral-500'}`}>
                            {isStrong ? '★ إشارة قوية' : '☆ إشارة متوسطة'}
                          </span>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className={`px-1.5 py-0.5 text-[9px] font-mono border rounded ${
                          isStrong ? 'bg-black text-white border-black' : 'bg-neutral-900 border-neutral-800 text-neutral-400'
                        }`}>
                          {signal.signalType}
                        </span>
                      </td>
                      <td className="p-4 font-mono">
                        {formatPrice(signal.entryPrice, signal.market, signal.symbol)}
                      </td>
                      <td className="p-4 font-mono font-bold">
                        {formatPrice(signal.takeProfit, signal.market, signal.symbol)}
                      </td>
                      <td className={`p-4 font-mono ${isStrong ? 'text-neutral-800' : 'text-neutral-500'}`}>
                        {formatPrice(signal.stopLoss, signal.market, signal.symbol)}
                      </td>
                      <td className="p-4 font-mono font-bold">
                        {formatPrice(signal.currentPrice, signal.market, signal.symbol)}
                      </td>
                      <td className={`p-4 leading-relaxed font-light ${isStrong ? 'text-neutral-800 font-medium' : 'text-neutral-400'}`}>
                        {signal.explanationArabic}
                      </td>
                      <td className="p-4 text-center">
                        <button
                          onClick={() => {
                            setSelectedSignal(signal);
                            setActualEntryPrice(signal.entryPrice);
                            setPositionSize('');
                            setExecQuantity('');
                            setIsExecModalOpen(true);
                          }}
                          className={`px-3 py-1.5 text-[10px] font-bold rounded cursor-pointer transition ${
                            isStrong
                              ? 'bg-black hover:bg-neutral-900 text-white border border-black'
                              : 'border border-neutral-800 bg-neutral-900 hover:bg-neutral-850 text-neutral-350 hover:text-white'
                          }`}
                        >
                          تنفيذ الصفقة
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

      {/* Execute Trade Modal */}
      {isExecModalOpen && selectedSignal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" dir="rtl">
          <div className="bg-neutral-950 border border-neutral-900 p-6 rounded-lg w-full max-w-md space-y-6 text-right">
            <div>
              <h3 className="text-base font-black text-white">تنفيذ صفقة جديدة / Execute Position</h3>
              <p className="text-[10px] text-neutral-500 font-mono mt-1">سهم: {selectedSignal.symbol}</p>
            </div>

            <form onSubmit={handleExecuteSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-neutral-450 block">سعر الدخول الفعلي</label>
                <input
                  type="number"
                  step="any"
                  value={actualEntryPrice}
                  onChange={(e) => handlePriceChange(Number(e.target.value))}
                  className="w-full bg-neutral-900 border border-neutral-800 text-white rounded p-2 text-xs font-mono focus:outline-none focus:border-white"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-neutral-450 block">الكمية (عدد الأسهم)</label>
                <input
                  type="number"
                  step="any"
                  placeholder="أدخل عدد الأسهم..."
                  value={execQuantity}
                  onChange={(e) => handleQuantityChange(e.target.value)}
                  className="w-full bg-neutral-900 border border-neutral-800 text-white rounded p-2 text-xs font-mono focus:outline-none focus:border-white"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-neutral-450 block">حجم المركز (القيمة المستثمرة)</label>
                <input
                  type="number"
                  step="any"
                  placeholder={selectedSignal.market === 'EGX' ? 'القيمة بالجنيه المصري' : 'القيمة بالدولار'}
                  value={positionSize}
                  onChange={(e) => handleValueChange(e.target.value)}
                  className="w-full bg-neutral-900 border border-neutral-800 text-white rounded p-2 text-xs font-mono focus:outline-none focus:border-white"
                  required
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  className="flex-1 py-2 text-xs font-bold bg-white text-black border border-white hover:bg-neutral-200 rounded transition"
                >
                  تأكيد التنفيذ
                </button>
                <button
                  type="button"
                  onClick={() => setIsExecModalOpen(false)}
                  className="flex-1 py-2 text-xs font-bold border border-neutral-800 bg-neutral-900 text-neutral-450 hover:text-white rounded transition"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Close Position Modal */}
      {isCloseModalOpen && selectedPortfolioItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" dir="rtl">
          <div className="bg-neutral-950 border border-neutral-900 p-6 rounded-lg w-full max-w-md space-y-6 text-right">
            <div>
              <h3 className="text-base font-black text-white">إغلاق الصفقة / Close Position</h3>
              <p className="text-[10px] text-neutral-500 font-mono mt-1">سهم: {selectedPortfolioItem.symbol}</p>
            </div>

            <form onSubmit={handleCloseSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-neutral-450 block">سعر الخروج الفعلي</label>
                <input
                  type="number"
                  step="any"
                  value={exitPrice}
                  onChange={(e) => setExitPrice(Number(e.target.value))}
                  className="w-full bg-neutral-900 border border-neutral-800 text-white rounded p-2 text-xs font-mono focus:outline-none focus:border-white"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-neutral-450 block">سبب الإغلاق</label>
                <select
                  value={closeReason}
                  onChange={(e) => setCloseReason(e.target.value)}
                  className="w-full bg-neutral-900 border border-neutral-800 text-white rounded p-2 text-xs focus:outline-none focus:border-white cursor-pointer"
                >
                  <option value="Manual Close">إغلاق يدوي (Manual Close)</option>
                  <option value="Hit TP">تحقيق الهدف الثاني (Hit TP)</option>
                  <option value="Hit SL">ضرب وقف الخسارة (Hit SL)</option>
                  <option value="Time Exit">خروج زمني (Time Exit)</option>
                </select>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  className="flex-1 py-2 text-xs font-bold bg-white text-black border border-white hover:bg-neutral-200 rounded transition cursor-pointer"
                >
                  إغلاق الصفقة
                </button>
                <button
                  type="button"
                  onClick={() => setIsCloseModalOpen(false)}
                  className="flex-1 py-2 text-xs font-bold border border-neutral-800 bg-neutral-900 text-neutral-450 hover:text-white rounded transition cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Scale Position Modal */}
      {isScaleModalOpen && selectedPortfolioItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" dir="rtl">
          <div className="bg-neutral-950 border border-neutral-900 p-6 rounded-lg w-full max-w-md space-y-6 text-right">
            <div>
              <h3 className="text-base font-black text-white">تعديل كمية الصفقة / Scale Position</h3>
              <p className="text-[10px] text-neutral-500 font-mono mt-1">سهم: {selectedPortfolioItem.symbol} | الكمية الحالية: {selectedPortfolioItem.quantity || 0}</p>
            </div>

            <form onSubmit={handleScaleSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-neutral-450 block">نوع الحركة</label>
                <select
                  value={scaleAction}
                  onChange={(e) => {
                    setScaleAction(e.target.value as 'BUY_MORE' | 'PARTIAL_CLOSE');
                    setScaleQty('');
                  }}
                  className="w-full bg-neutral-900 border border-neutral-800 text-white rounded p-2 text-xs focus:outline-none focus:border-white cursor-pointer"
                >
                  <option value="BUY_MORE">شراء إضافي (Scale In / Buy More)</option>
                  <option value="PARTIAL_CLOSE">إغلاق جزئي (Scale Out / Partial Close)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-neutral-450 block">سعر التنفيذ</label>
                <input
                  type="number"
                  step="any"
                  value={scalePrice}
                  onChange={(e) => setScalePrice(Number(e.target.value))}
                  className="w-full bg-neutral-900 border border-neutral-800 text-white rounded p-2 text-xs font-mono focus:outline-none focus:border-white"
                  required
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] uppercase font-bold text-neutral-450 block">الكمية</label>
                  {scaleAction === 'PARTIAL_CLOSE' && (
                    <div className="flex gap-1.5">
                      {[0.25, 0.5, 0.75, 1.0].map((preset) => {
                        const label = preset === 1.0 ? 'كل الصفقة' : `${preset * 100}%`;
                        return (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => {
                              const calcQty = (selectedPortfolioItem.quantity || 0) * preset;
                              setScaleQty(String(Number(calcQty.toFixed(4))));
                            }}
                            className="text-[9px] bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white px-1.5 py-0.5 rounded cursor-pointer transition"
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                <input
                  type="number"
                  step="any"
                  value={scaleQty}
                  onChange={(e) => setScaleQty(e.target.value)}
                  placeholder="أدخل الكمية بالأسهم..."
                  className="w-full bg-neutral-900 border border-neutral-800 text-white rounded p-2 text-xs font-mono focus:outline-none focus:border-white"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-neutral-450 block">الرسوم (Fees)</label>
                <input
                  type="number"
                  step="any"
                  value={scaleFees}
                  onChange={(e) => setScaleFees(e.target.value)}
                  className="w-full bg-neutral-900 border border-neutral-800 text-white rounded p-2 text-xs font-mono focus:outline-none focus:border-white"
                  required
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  className="flex-1 py-2 text-xs font-bold bg-white text-black border border-white hover:bg-neutral-200 rounded transition cursor-pointer"
                >
                  تأكيد التعديل
                </button>
                <button
                  type="button"
                  onClick={() => setIsScaleModalOpen(false)}
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
