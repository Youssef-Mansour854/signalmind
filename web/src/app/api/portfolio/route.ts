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

    const entry = Number(actualEntryPrice);
    const size = Number(positionSize);
    const quantity = entry > 0 ? size / entry : 0;

    const newPortfolioItem = new Portfolio({
      signalId,
      symbol,
      market,
      actualEntryPrice: entry,
      positionSize: size,
      quantity: Number(quantity.toFixed(4)),
      currentPrice: entry, // Initial currentPrice is entryPrice
      currentPnL: 0,
      status: 'ACTIVE',
      executedAt: new Date()
    });

    await newPortfolioItem.save();
    return NextResponse.json({ success: true, data: newPortfolioItem }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await dbConnect();
    const body = await request.json();
    const { id, exitPrice, closeReason } = body;

    if (!id || exitPrice === undefined || !closeReason) {
      return NextResponse.json({ success: false, error: 'بيانات غير مكتملة' }, { status: 400 });
    }

    const item = await Portfolio.findById(id);
    if (!item) {
      return NextResponse.json({ success: false, error: 'الصفقة غير موجودة' }, { status: 404 });
    }

    const entryPrice = item.actualEntryPrice;
    const positionSize = item.positionSize;
    const quantity = item.quantity || (entryPrice > 0 ? positionSize / entryPrice : 0);
    
    const exit = Number(exitPrice);
    const finalPnL = (exit - entryPrice) * quantity;
    const pnlPercentage = entryPrice > 0 ? ((exit - entryPrice) / entryPrice) * 100 : 0;

    item.status = 'CLOSED';
    item.exitPrice = exit;
    item.currentPrice = exit; // Set current price to exit price
    item.closeDate = new Date();
    item.closedAt = new Date();
    item.finalPnL = Number(finalPnL.toFixed(4));
    item.pnlPercentage = Number(pnlPercentage.toFixed(2));
    item.closeReason = closeReason;

    await item.save();
    return NextResponse.json({ success: true, data: item });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
