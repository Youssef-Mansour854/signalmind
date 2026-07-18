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

export default function DashboardPage() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [marketFilter, setMarketFilter] = useState<'EGX' | 'US'>('US');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    fetchSignals();
  }, [marketFilter]);

  const formatPrice = (price: number, market: string, symbol: string) => {
    const formatted = price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (market === 'EGX' || symbol.endsWith('.CA')) {
      return `${formatted} ج.م`;
    }
    return `$${formatted}`;
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
        <div>
          {/* Widget Header */}
          <div className="flex items-center justify-between border-b border-neutral-900 pb-3 mb-4">
            <div className="flex items-center gap-2">
              <span className="text-sm">{badgeIcon}</span>
              <h2 className="text-sm font-black tracking-tight text-white">{title}</h2>
            </div>
            <span className="text-[10px] text-neutral-500 font-mono">ACTIVE / PENDING</span>
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
                        <span className={`text-[9px] font-mono border rounded px-1.5 py-0.5 ${
                          isStrong ? 'bg-black text-white border-black' : 'bg-neutral-900 text-neutral-400 border-neutral-800'
                        }`}>
                          {signal.signalType}
                        </span>
                        <span className={`text-[10px] font-bold ${isStrong ? 'text-black' : 'text-neutral-400'}`}>
                          {isStrong ? '★ قوية' : '☆ متوسطة'}
                        </span>
                      </div>
                      <Link href={`/stock/${signal.symbol}`} className="font-black text-sm tracking-wide hover:underline hover:text-white">
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
        <div className="pt-4 border-t border-neutral-900 mt-2">
          <Link
            href={viewAllPath}
            className="w-full py-2 text-xs font-bold border border-neutral-900 bg-neutral-950 hover:bg-neutral-900 text-neutral-300 hover:text-white transition duration-200 rounded flex items-center justify-center gap-2"
          >
            <span>عرض الكل</span>
            <span className="text-sm">&larr;</span>
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
            onClick={fetchSignals}
            className="p-1.5 border border-neutral-800 bg-neutral-900 text-neutral-400 hover:text-white rounded transition"
            title="تحديث البيانات"
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

      {/* Grid of 4 Widgets (2x2 on desktop, 1 col on mobile) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
        {renderWidget('أقوى فرص اليوم', 'يومي', '/day-trades', '⚡')}
        {renderWidget('أقوى فرص الأسبوع', 'أسبوعي', '/swing-trades', '📅')}
        {renderWidget('ترشيحات الشهر', 'شهري', '/monthly-picks', '🌙')}
        {renderWidget('أفضل استثمارات العام', 'استثمار سنوي', '/annual-investments', '🏢')}
      </div>
    </div>
  );
}
