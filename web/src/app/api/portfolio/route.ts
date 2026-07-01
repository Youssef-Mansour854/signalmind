import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Portfolio from '@/models/Portfolio';

export async function GET() {
  try {
    await dbConnect();
    const portfolio = await Portfolio.find({}).sort({ executedAt: -1 });
    return NextResponse.json({ success: true, data: portfolio });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await dbConnect();
    const body = await request.json();
    
    const { signalId, symbol, market, actualEntryPrice, positionSize } = body;
    
    if (!signalId || !symbol || !market || actualEntryPrice === undefined || positionSize === undefined) {
      return NextResponse.json({ success: false, error: 'برجاء ملء جميع الحقول المطلوبة' }, { status: 400 });
    }

    const newPortfolioItem = new Portfolio({
      signalId,
      symbol,
      market,
      actualEntryPrice: Number(actualEntryPrice),
      positionSize: Number(positionSize),
      status: 'ACTIVE',
      executedAt: new Date()
    });

    await newPortfolioItem.save();
    return NextResponse.json({ success: true, data: newPortfolioItem }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
