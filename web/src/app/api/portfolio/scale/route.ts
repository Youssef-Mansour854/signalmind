import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Portfolio from '@/models/Portfolio';
import Setting from '@/models/Setting';

export async function POST(request: Request) {
  try {
    await dbConnect();
    const body = await request.json();
    const { id, scaleAction, price, quantity, fees } = body;

    if (!id || !scaleAction || price === undefined || quantity === undefined || fees === undefined) {
      return NextResponse.json({ success: false, error: 'بيانات غير مكتملة' }, { status: 400 });
    }

    const item = await Portfolio.findById(id);
    if (!item) {
      return NextResponse.json({ success: false, error: 'الصفقة غير موجودة' }, { status: 404 });
    }

    const executePrice = Number(price);
    const execQty = Number(quantity);
    const execFees = Number(fees);

    if (isNaN(executePrice) || isNaN(execQty) || isNaN(execFees) || execQty <= 0) {
      return NextResponse.json({ success: false, error: 'قيم غير صالحة' }, { status: 400 });
    }

    const oldQty = item.quantity || 0;
    const oldEntryPrice = item.actualEntryPrice;
    const oldSize = item.positionSize;

    // Retrieve available cash settings to deduct or credit cash
    const cashKey = `availableCash_${item.portfolioType}`;
    const cashDoc = await Setting.findOne({ key: cashKey });
    let availableCash = cashDoc && typeof cashDoc.value === 'number' ? cashDoc.value : 100000;

    if (scaleAction === 'BUY_MORE') {
      const newQty = oldQty + execQty;
      const newEntryPrice = (oldEntryPrice * oldQty + executePrice * execQty) / newQty;
      const transactionCost = executePrice * execQty;

      // Update cash: deduct transaction cost and fees
      availableCash = availableCash - transactionCost - execFees;

      item.quantity = Number(newQty.toFixed(4));
      item.actualEntryPrice = Number(newEntryPrice.toFixed(4));
      item.positionSize = Number((item.positionSize + transactionCost).toFixed(4));
      item.brokerFees = (item.brokerFees || 0) + execFees;

      item.scalingHistory.push({
        type: 'BUY_MORE',
        quantity: execQty,
        price: executePrice,
        fees: execFees,
        executedAt: new Date()
      });
    } else if (scaleAction === 'PARTIAL_CLOSE') {
      if (execQty > oldQty) {
        return NextResponse.json({ success: false, error: 'الكمية المراد إغلاقها أكبر من الكمية المتاحة' }, { status: 400 });
      }

      const realizedPnL = (executePrice - oldEntryPrice) * execQty;
      const newQty = oldQty - execQty;
      const transactionCredit = executePrice * execQty;

      // Update cash: add credit and subtract fees
      availableCash = availableCash + transactionCredit - execFees;

      item.brokerFees = (item.brokerFees || 0) + execFees;

      item.scalingHistory.push({
        type: 'PARTIAL_CLOSE',
        quantity: execQty,
        price: executePrice,
        fees: execFees,
        realizedPnL: Number(realizedPnL.toFixed(4)),
        executedAt: new Date()
      });

      if (newQty <= 0.0001) {
        // Fully closed position
        let sumPartials = 0;
        for (const tx of item.scalingHistory) {
          if (tx.type === 'PARTIAL_CLOSE' && tx.realizedPnL !== undefined) {
            sumPartials += tx.realizedPnL;
          }
        }

        item.status = 'CLOSED';
        item.exitPrice = executePrice;
        item.currentPrice = executePrice;
        item.closeDate = new Date();
        item.closedAt = new Date();
        item.finalPnL = Number(sumPartials.toFixed(4));
        item.pnlPercentage = oldEntryPrice > 0 ? Number((((executePrice - oldEntryPrice) / oldEntryPrice) * 100).toFixed(2)) : 0;
        item.closeReason = 'Fully Scaled Out';
        item.quantity = 0;
        item.positionSize = 0;
      } else {
        // Partially closed remaining position
        item.quantity = Number(newQty.toFixed(4));
        item.positionSize = Number((oldSize * (newQty / oldQty)).toFixed(4));
      }
    } else {
      return NextResponse.json({ success: false, error: 'عملية غير صالحة' }, { status: 400 });
    }

    // Save available cash setting
    await Setting.findOneAndUpdate(
      { key: cashKey },
      { $set: { value: availableCash } },
      { upsert: true }
    );

    await item.save();
    return NextResponse.json({ success: true, data: item });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
