import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Portfolio from '@/models/Portfolio';
import Signal from '@/models/Signal';

export async function GET(request: Request) {
  try {
    await dbConnect();
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const filter: any = {};
    if (type === 'USER' || type === 'SYSTEM') {
      filter.portfolioType = type;
    }

    const portfolio = await Portfolio.find(filter)
      .populate('signalId')
      .sort({ executedAt: -1 });
    return NextResponse.json({ success: true, data: portfolio });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await dbConnect();
    const body = await request.json();
    
    const { signalId, symbol, market, actualEntryPrice, positionSize, portfolioType, setupQuality, initialStopLoss, quantity } = body;
    
    if (!signalId || !symbol || !market || actualEntryPrice === undefined || positionSize === undefined) {
      return NextResponse.json({ success: false, error: 'برجاء ملء جميع الحقول المطلوبة' }, { status: 400 });
    }

    const entry = Number(actualEntryPrice);
    const size = Number(positionSize);
    const quantityCalc = entry > 0 ? size / entry : 0;
    const finalQty = quantity !== undefined ? Number(quantity) : quantityCalc;
    const pType = portfolioType === 'SYSTEM' ? 'SYSTEM' : 'USER';

    const newPortfolioItem = new Portfolio({
      signalId,
      symbol,
      market,
      actualEntryPrice: entry,
      positionSize: size,
      quantity: Number(finalQty.toFixed(4)),
      currentPrice: entry, // Initial currentPrice is entryPrice
      currentPnL: 0,
      status: 'ACTIVE',
      portfolioType: pType,
      executedAt: new Date(),
      setupQuality: setupQuality || 'A+',
      initialStopLoss: initialStopLoss !== undefined ? Number(initialStopLoss) : undefined
    });

    await newPortfolioItem.save();

    // Update associated signal's status to EXECUTED
    await Signal.findByIdAndUpdate(signalId, { $set: { status: 'EXECUTED' } });

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
