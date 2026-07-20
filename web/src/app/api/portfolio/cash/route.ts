import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Setting from '@/models/Setting';

export async function GET(request: Request) {
  try {
    await dbConnect();
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') === 'SYSTEM' ? 'SYSTEM' : 'USER';
    const key = `availableCash_${type}`;
    let doc = await Setting.findOne({ key });
    if (!doc) {
      doc = new Setting({ key, value: 100000, totalDeposits: 100000, totalWithdrawals: 0 });
      await doc.save();
    }
    // Initialize if 0 or undefined
    if (!doc.totalDeposits || doc.totalDeposits === 0) {
      doc.totalDeposits = typeof doc.value === 'number' ? doc.value : 100000;
      await doc.save();
    }
    const availableCash = doc.value;
    const totalDeposits = doc.totalDeposits || availableCash;
    const totalWithdrawals = doc.totalWithdrawals || 0;
    const maxDailyDrawdownLimit = doc.maxDailyDrawdownLimit !== undefined ? doc.maxDailyDrawdownLimit : 5;
    const maxTotalDrawdownLimit = doc.maxTotalDrawdownLimit !== undefined ? doc.maxTotalDrawdownLimit : 10;
    return NextResponse.json({
      success: true,
      data: {
        availableCash,
        totalDeposits,
        totalWithdrawals,
        maxDailyDrawdownLimit,
        maxTotalDrawdownLimit,
        type
      }
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await dbConnect();
    const body = await request.json();
    const { action, amount, availableCash, type, maxDailyDrawdownLimit, maxTotalDrawdownLimit } = body;

    const pType = type === 'SYSTEM' ? 'SYSTEM' : 'USER';
    const key = `availableCash_${pType}`;

    // Find existing doc or create one
    let doc = await Setting.findOne({ key });
    if (!doc) {
      doc = new Setting({ key, value: 100005, totalDeposits: 100000, totalWithdrawals: 0 });
      await doc.save();
    }

    // Initialize totalDeposits to match the current cash value if it's currently 0 or undefined
    if (!doc.totalDeposits || doc.totalDeposits === 0) {
      doc.totalDeposits = typeof doc.value === 'number' ? doc.value : 100000;
    }
    if (doc.totalWithdrawals === undefined) {
      doc.totalWithdrawals = 0;
    }

    // Update drawdown limits if provided
    if (maxDailyDrawdownLimit !== undefined) {
      doc.maxDailyDrawdownLimit = Number(maxDailyDrawdownLimit);
    }
    if (maxTotalDrawdownLimit !== undefined) {
      doc.maxTotalDrawdownLimit = Number(maxTotalDrawdownLimit);
    }

    if (action === 'DEPOSIT' || action === 'WITHDRAW') {
      if (amount === undefined || isNaN(Number(amount)) || Number(amount) <= 0) {
        return NextResponse.json({ success: false, error: 'مبلغ غير صالح' }, { status: 400 });
      }
      const val = Number(amount);
      if (action === 'DEPOSIT') {
        doc.value = (typeof doc.value === 'number' ? doc.value : 100000) + val;
        doc.totalDeposits = (doc.totalDeposits || 0) + val;
        if (doc.peakEquity !== undefined) doc.peakEquity += val;
        if (doc.dailyStartEquity !== undefined) doc.dailyStartEquity += val;
      } else {
        doc.value = (typeof doc.value === 'number' ? doc.value : 100000) - val;
        doc.totalWithdrawals = (doc.totalWithdrawals || 0) + val;
        if (doc.peakEquity !== undefined) doc.peakEquity -= val;
        if (doc.dailyStartEquity !== undefined) doc.dailyStartEquity -= val;
      }
      await doc.save();
    } else if (availableCash !== undefined) {
      // Legacy support for setting cash directly
      if (isNaN(Number(availableCash))) {
        return NextResponse.json({ success: false, error: 'مبلغ غير صالح' }, { status: 400 });
      }
      const newCash = Number(availableCash);
      const diff = newCash - (typeof doc.value === 'number' ? doc.value : 100000);
      doc.value = newCash;
      if (diff > 0) {
        doc.totalDeposits = (doc.totalDeposits || 0) + diff;
        if (doc.peakEquity !== undefined) doc.peakEquity += diff;
        if (doc.dailyStartEquity !== undefined) doc.dailyStartEquity += diff;
      } else if (diff < 0) {
        doc.totalWithdrawals = (doc.totalWithdrawals || 0) + Math.abs(diff);
        if (doc.peakEquity !== undefined) doc.peakEquity += diff; // diff is negative
        if (doc.dailyStartEquity !== undefined) doc.dailyStartEquity += diff;
      }
      await doc.save();
    } else if (maxDailyDrawdownLimit !== undefined || maxTotalDrawdownLimit !== undefined) {
      await doc.save();
    } else {
      return NextResponse.json({ success: false, error: 'طلب غير مكتمل' }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      data: {
        availableCash: doc.value,
        totalDeposits: doc.totalDeposits,
        totalWithdrawals: doc.totalWithdrawals,
        maxDailyDrawdownLimit: doc.maxDailyDrawdownLimit,
        maxTotalDrawdownLimit: doc.maxTotalDrawdownLimit,
        type: pType
      }
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  return POST(request);
}
