import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Setting from '@/models/Setting';

export async function GET() {
  try {
    await dbConnect();
    const doc = await Setting.findOne({ key: 'availableCash' });
    const availableCash = doc && typeof doc.value === 'number' ? doc.value : 100000;
    return NextResponse.json({ success: true, data: { availableCash } });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await dbConnect();
    const body = await request.json();
    const { availableCash } = body;

    if (availableCash === undefined || isNaN(Number(availableCash))) {
      return NextResponse.json({ success: false, error: 'مبلغ غير صالح' }, { status: 400 });
    }

    const cashVal = Number(availableCash);

    const doc = await Setting.findOneAndUpdate(
      { key: 'availableCash' },
      { $set: { key: 'availableCash', value: cashVal } },
      { new: true, upsert: true }
    );

    return NextResponse.json({ success: true, data: { availableCash: doc.value } });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  return POST(request);
}
