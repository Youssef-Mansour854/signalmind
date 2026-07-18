import React from 'react';
import dbConnect from '@/lib/mongodb';
import Signal from '@/models/Signal';
import Portfolio from '@/models/Portfolio';
import StockTerminal from '@/components/StockTerminal';
import '@/models/Signal'; // Registry safety

interface PageProps {
  params: Promise<{ symbol: string }>;
}

export default async function StockDetailsPage({ params }: PageProps) {
  const { symbol } = await params;
  
  await dbConnect();
  
  // Fetch latest signal for the symbol
  const signalDoc = await Signal.findOne({ symbol }).sort({ createdAt: -1 });
  
  // Fetch active portfolio item for the symbol
  const portfolioDoc = await Portfolio.findOne({ symbol, status: 'ACTIVE' }).populate('signalId');

  // Convert mongoose documents to plain objects to avoid serialization warnings
  const signal = signalDoc ? JSON.parse(JSON.stringify(signalDoc)) : null;
  const portfolioItem = portfolioDoc ? JSON.parse(JSON.stringify(portfolioDoc)) : null;

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6 md:space-y-8 flex-1 flex flex-col justify-start max-w-7xl mx-auto w-full" dir="rtl">
      {/* Title Bar */}
      <div className="flex items-center justify-between border-b border-neutral-900 pb-4">
        <div>
          <h1 className="text-xl font-black text-white uppercase tracking-tight">تحليل السهم / Stock Cockpit</h1>
          <p className="text-[10px] text-neutral-400 mt-1 font-mono uppercase tracking-wider">
            رسم بياني حي، قوة الإشارة، والتحليل الفني المعزز بالذكاء الاصطناعي
          </p>
        </div>
      </div>

      {!signal ? (
        <div className="py-20 text-center text-xs text-neutral-600 border border-neutral-900 border-dashed rounded">
          لا توجد إشارات أو بيانات متوفرة لهذا الرمز حالياً.
        </div>
      ) : (
        <StockTerminal signal={signal} initialPortfolioItem={portfolioItem} />
      )}
    </div>
  );
}
