'use client';

import React, { useState, useEffect, useRef } from 'react';
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

interface StockTerminalProps {
  signal: Signal;
  initialPortfolioItem: PortfolioItem | null;
}

export default function StockTerminal({ signal: initialSignal, initialPortfolioItem }: StockTerminalProps) {
  const [signal, setSignal] = useState<Signal>(initialSignal);
  const [portfolioItem, setPortfolioItem] = useState<PortfolioItem | null>(initialPortfolioItem);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Execute Modal State
  const [isExecModalOpen, setIsExecModalOpen] = useState(false);
  const [actualEntryPrice, setActualEntryPrice] = useState<number>(signal.entryPrice);
  const [positionSize, setPositionSize] = useState<string>('');

  // Close Modal State
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
  const [exitPrice, setExitPrice] = useState<number>(signal.currentPrice);
  const [closeReason, setCloseReason] = useState<string>('Manual Close');

  // Scale Modal State
  const [isScaleModalOpen, setIsScaleModalOpen] = useState(false);
  const [scaleAction, setScaleAction] = useState<'BUY_MORE' | 'PARTIAL_CLOSE'>('BUY_MORE');
  const [scalePrice, setScalePrice] = useState<number>(signal.currentPrice);
  const [scaleQty, setScaleQty] = useState<string>('');
  const [scaleFees, setScaleFees] = useState<string>('0');

  useEffect(() => {
    // TradingView Widget Injection
    let tvSymbol = signal.symbol;
    if (signal.market === 'EGX') {
      const cleanSymbol = signal.symbol.replace('.CA', '');
      tvSymbol = `EGX:${cleanSymbol}`;
    }

    const scriptId = 'tradingview-widget-script';
    let script = document.getElementById(scriptId) as HTMLScriptElement;

    const initWidget = () => {
      if (typeof window !== 'undefined' && (window as any).TradingView) {
        new (window as any).TradingView.widget({
          autosize: true,
          symbol: tvSymbol,
          interval: 'D',
          timezone: 'Etc/UTC',
          theme: 'dark',
          style: '1',
          locale: 'ar',
          toolbar_bg: '#050609',
          enable_publishing: false,
          hide_side_toolbar: false,
          allow_symbol_change: false,
          container_id: containerRef.current?.id,
        });
      }
    };

    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      script.src = 'https://s3.tradingview.com/tv.js';
      script.type = 'text/javascript';
      script.async = true;
      script.onload = initWidget;
      document.head.appendChild(script);
    } else {
      // Script already loaded, directly initialize
      initWidget();
    }

    return () => {
      // Component unmounted clean up
    };
  }, [signal.symbol, signal.market]);

  const handleLiveScan = async () => {
    setIsAnalyzing(true);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: signal.symbol,
          market: signal.market,
        }),
      });

      const json = await res.json();
      if (json.success && json.data) {
        setSignal(json.data);
        setActualEntryPrice(json.data.entryPrice);
        setExitPrice(json.data.currentPrice);
      } else {
        alert(json.error || 'فشلت عملية تحديث التحليل اللحظي');
      }
    } catch (err: any) {
      alert(err.message || 'حدث خطأ غير متوقع أثناء التحليل');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleExecuteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/portfolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signalId: signal._id,
          symbol: signal.symbol,
          market: signal.market,
          actualEntryPrice,
          positionSize: Number(positionSize),
        }),
      });

      const json = await res.json();
      if (json.success) {
        setIsExecModalOpen(false);
        setPortfolioItem(json.data);
      } else {
        alert(json.error || 'فشلت عملية التنفيذ');
      }
    } catch (err: any) {
      alert(err.message || 'حدث خطأ غير متوقع');
    }
  };

  const handleCloseSubmit = async (e: React.FormEvent) => {
    if (!portfolioItem) return;
    e.preventDefault();
    try {
      const res = await fetch('/api/portfolio', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: portfolioItem._id,
          exitPrice,
          closeReason,
        }),
      });

      const json = await res.json();
      if (json.success) {
        setIsCloseModalOpen(false);
        setPortfolioItem(null); // Clear active item
      } else {
        alert(json.error || 'فشل إغلاق الصفقة');
      }
    } catch (err: any) {
      alert(err.message || 'حدث خطأ غير متوقع');
    }
  };

  const handleScaleSubmit = async (e: React.FormEvent) => {
    if (!portfolioItem) return;
    e.preventDefault();
    try {
      const res = await fetch('/api/portfolio/scale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: portfolioItem._id,
          scaleAction,
          price: scalePrice,
          quantity: Number(scaleQty),
          fees: Number(scaleFees),
        }),
      });

      const json = await res.json();
      if (json.success) {
        setIsScaleModalOpen(false);
        setScaleQty('');
        setScaleFees('0');
        if (json.data.status === 'CLOSED') {
          setPortfolioItem(null);
        } else {
          setPortfolioItem(json.data);
        }
      } else {
        alert(json.error || 'فشلت عملية تعديل الكمية');
      }
    } catch (err: any) {
      alert(err.message || 'حدث خطأ غير متوقع');
    }
  };

  const formatPrice = (price: number) => {
    const formatted = price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (signal.market === 'EGX' || signal.symbol.endsWith('.CA')) {
      return `${formatted} ج.م`;
    }
    return `$${formatted}`;
  };

  const pnlPct = portfolioItem
    ? portfolioItem.pnlPercentage !== undefined
      ? portfolioItem.pnlPercentage
      : portfolioItem.actualEntryPrice > 0
      ? ((signal.currentPrice - portfolioItem.actualEntryPrice) / portfolioItem.actualEntryPrice) * 100
      : 0
    : 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full items-start">
      {/* Chart Column */}
      <div className="w-full lg:col-span-2 space-y-4">
        <div className="w-full border border-neutral-900 bg-neutral-950 rounded-lg overflow-hidden h-[380px] sm:h-[450px] md:h-[550px]">
          <div id={`tv-chart-${signal.symbol}`} ref={containerRef} className="w-full h-full" />
        </div>
      </div>

      {/* Details & Actions Panel Column */}
      <div className="w-full space-y-6">
        {/* Signal Meta Info Card */}
        <div className="border border-neutral-900 bg-neutral-950 p-6 rounded-lg space-y-4 text-right">
          <div className="border-b border-neutral-900 pb-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] text-neutral-500 font-mono">SIGNAL METRICS</span>
            </div>

            {/* Segmented Signal Gauge Bar */}
            <div className="flex w-full items-center">
              {['بيع قوي', 'بيع', 'انتظار', 'شراء', 'شراء قوي'].map((label, idx) => {
                const activeIdx = signal.signalType === 'BUY'
                  ? (signal.signalStrength === 'قوية' ? 4 : 3)
                  : signal.signalType === 'SELL'
                  ? (signal.signalStrength === 'قوية' ? 0 : 1)
                  : 2;
                const isActive = activeIdx === idx;
                const isFirst = idx === 0;
                const isLast = idx === 4;

                return (
                  <div
                    key={label}
                    className={`flex-1 py-1 text-center text-xs md:text-sm transition-all duration-150 ${
                      isFirst ? 'rounded-s-md' : ''
                    } ${isLast ? 'rounded-e-md' : ''} ${
                      isActive
                        ? 'bg-white text-black font-bold py-1 text-center text-xs md:text-sm'
                        : 'text-neutral-600 border-y border-e border-neutral-800 py-1 text-center text-xs md:text-sm'
                    } ${isFirst && !isActive ? 'border-s border-neutral-800' : ''}`}
                  >
                    {label}
                  </div>
                );
              })}
            </div>

            {/* Timeframe Display */}
            <div className="text-center text-neutral-400 text-xs tracking-widest mt-2 uppercase font-mono">
              مدى التوصية: {signal.timeframe || 'غير محدد'}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-xs font-mono">
            <div>
              <span className="text-neutral-500 block">سعر الدخول المقترح:</span>
              <span className="text-white font-bold text-sm">{formatPrice(signal.entryPrice)}</span>
            </div>
            <div>
              <span className="text-neutral-500 block">السعر الحالي:</span>
              <span className="text-white font-bold text-sm">{formatPrice(signal.currentPrice)}</span>
            </div>
            <div>
              <span className="text-neutral-500 block">هدف جني الأرباح (TP):</span>
              <span className="text-white font-bold text-sm">{formatPrice(signal.takeProfit)}</span>
            </div>
            <div>
              <span className="text-neutral-500 block">وقف الخسارة (SL):</span>
              <span className="text-white font-bold text-sm">{formatPrice(signal.stopLoss)}</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 border-t border-neutral-900 pt-4 text-center text-[10px] font-mono">
            <div>
              <span className="text-neutral-500 block">معدل RRR:</span>
              <span className="text-white font-bold">{signal.scoreMetrics.riskRewardRatio.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-neutral-500 block">التقييم الكلي:</span>
              <span className="text-white font-bold">{signal.scoreMetrics.totalScore}</span>
            </div>
            <div>
              <span className="text-neutral-500 block">الاتجاه:</span>
              <span className="text-white font-bold">{signal.signalType}</span>
            </div>
          </div>
        </div>

        {/* AI Analysis Panel */}
        <div className="border border-neutral-900 bg-neutral-950 p-6 rounded-lg space-y-4 text-right">
          <div className="flex items-center justify-between border-b border-neutral-900 pb-2 gap-4">
            <h3 className="text-xs font-black uppercase text-neutral-400 font-mono tracking-wider">[ التحليل الفني بالذكاء الاصطناعي ]</h3>
            <button
              onClick={handleLiveScan}
              disabled={isAnalyzing}
              className="text-[9px] font-bold bg-white text-black hover:bg-neutral-200 px-2 py-1 rounded transition duration-200 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1"
            >
              {isAnalyzing ? (
                <>
                  <span className="h-1.5 w-1.5 rounded-full bg-black animate-ping" />
                  <span>جاري التحليل...</span>
                </>
              ) : (
                <>
                  <span>تحديث التحليل اللحظي ⚡</span>
                </>
              )}
            </button>
          </div>
          <p className="text-xs leading-relaxed text-neutral-300 font-light font-sans whitespace-pre-wrap">
            {signal.explanationArabic}
          </p>
        </div>

        {/* Portfolio Position panel */}
        <div className="border border-neutral-900 bg-neutral-950 p-6 rounded-lg space-y-4 text-right">
          {portfolioItem ? (
            <div className="space-y-4">
              <div className="border-b border-neutral-900 pb-2">
                <span className="inline-block px-1.5 py-0.5 text-[9px] border border-neutral-700 bg-neutral-900 text-neutral-300 rounded uppercase font-mono font-medium">
                  ACTIVE POSITION / مركز مفتوح
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                <div>
                  <span className="text-neutral-500 block">الدخول الفعلي:</span>
                  <span className="text-white font-bold">{formatPrice(portfolioItem.actualEntryPrice)}</span>
                </div>
                <div>
                  <span className="text-neutral-500 block">الكمية الحالية:</span>
                  <span className="text-white font-bold">{portfolioItem.quantity || 0}</span>
                </div>
                <div>
                  <span className="text-neutral-500 block">رسوم التداول:</span>
                  <span className="text-white font-bold">{formatPrice(portfolioItem.brokerFees || 0)}</span>
                </div>
                <div>
                  <span className="text-neutral-500 block">الأرباح/الخسائر:</span>
                  <span className={`font-bold ${pnlPct >= 0 ? 'text-white font-black' : 'text-neutral-500 font-normal'}`}>
                    {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%
                  </span>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setScalePrice(signal.currentPrice);
                    setScaleAction('BUY_MORE');
                    setScaleQty('');
                    setScaleFees('0');
                    setIsScaleModalOpen(true);
                  }}
                  className="flex-1 py-2 text-xs font-bold border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 text-neutral-350 hover:text-white transition rounded cursor-pointer"
                >
                  تعديل الكمية
                </button>
                <button
                  onClick={() => {
                    setExitPrice(signal.currentPrice);
                    setCloseReason('Manual Close');
                    setIsCloseModalOpen(true);
                  }}
                  className="flex-1 py-2 text-xs font-bold border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 text-neutral-350 hover:text-white transition rounded cursor-pointer"
                >
                  إغلاق الصفقة
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-neutral-600 font-sans">
                لا يوجد مركز مفتوح لهذا السهم حالياً في محفظتك.
              </p>
              <button
                onClick={() => {
                  setActualEntryPrice(signal.entryPrice);
                  setPositionSize('');
                  setIsExecModalOpen(true);
                }}
                className="w-full py-2 text-xs font-bold bg-white text-black hover:bg-neutral-200 transition rounded cursor-pointer"
              >
                تنفيذ الصفقة
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Execute Trade Modal */}
      {isExecModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" dir="rtl">
          <div className="bg-neutral-950 border border-neutral-900 p-6 rounded-lg w-full max-w-md space-y-6 text-right">
            <div>
              <h3 className="text-base font-black text-white">تنفيذ صفقة جديدة / Execute Position</h3>
              <p className="text-[10px] text-neutral-500 font-mono mt-1">سهم: {signal.symbol}</p>
            </div>

            <form onSubmit={handleExecuteSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-neutral-450 block">سعر الدخول الفعلي</label>
                <input
                  type="number"
                  step="any"
                  value={actualEntryPrice}
                  onChange={(e) => setActualEntryPrice(Number(e.target.value))}
                  className="w-full bg-neutral-900 border border-neutral-800 text-white rounded p-2 text-xs font-mono focus:outline-none focus:border-white"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-neutral-450 block">حجم المركز (القيمة المستثمرة)</label>
                <input
                  type="number"
                  placeholder={signal.market === 'EGX' ? 'القيمة بالجنيه المصري' : 'القيمة بالدولار'}
                  value={positionSize}
                  onChange={(e) => setPositionSize(e.target.value)}
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
      {isCloseModalOpen && portfolioItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" dir="rtl">
          <div className="bg-neutral-950 border border-neutral-900 p-6 rounded-lg w-full max-w-md space-y-6 text-right">
            <div>
              <h3 className="text-base font-black text-white">إغلاق الصفقة / Close Position</h3>
              <p className="text-[10px] text-neutral-500 font-mono mt-1">سهم: {signal.symbol}</p>
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
                  className="flex-1 py-2 text-xs font-bold bg-white text-black border border-white hover:bg-neutral-200 rounded transition"
                >
                  إغلاق الصفقة
                </button>
                <button
                  type="button"
                  onClick={() => setIsCloseModalOpen(false)}
                  className="flex-1 py-2 text-xs font-bold border border-neutral-800 bg-neutral-900 text-neutral-450 hover:text-white rounded transition"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Scale Position Modal */}
      {isScaleModalOpen && portfolioItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" dir="rtl">
          <div className="bg-neutral-950 border border-neutral-900 p-6 rounded-lg w-full max-w-md space-y-6 text-right">
            <div>
              <h3 className="text-base font-black text-white">تعديل كمية الصفقة / Scale Position</h3>
              <p className="text-[10px] text-neutral-500 font-mono mt-1">سهم: {signal.symbol} | الكمية الحالية: {portfolioItem.quantity || 0}</p>
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
                              const calcQty = (portfolioItem.quantity || 0) * preset;
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
