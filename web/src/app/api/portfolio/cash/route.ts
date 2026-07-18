import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Setting from '@/models/Setting';

export async function GET(request: Request) {
  try {
    await dbConnect();
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') === 'SYSTEM' ? 'SYSTEM' : 'USER';
    const key = `availableCash_${type}`;
    const doc = await Setting.findOne({ key });
    const availableCash = doc && typeof doc.value === 'number' ? doc.value : 100000;
    return NextResponse.json({ success: true, data: { availableCash, type } });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await dbConnect();
    const body = await request.json();
    const { availableCash, type } = body;

    if (availableCash === undefined || isNaN(Number(availableCash))) {
      return NextResponse.json({ success: false, error: 'مبلغ غير صالح' }, { status: 400 });
    }

    const pType = type === 'SYSTEM' ? 'SYSTEM' : 'USER';
    const key = `availableCash_${pType}`;
    const cashVal = Number(availableCash);

    const doc = await Setting.findOneAndUpdate(
      { key },
      { $set: { key, value: cashVal } },
      { new: true, upsert: true }
    );

    return NextResponse.json({ success: true, data: { availableCash: doc.value, type: pType } });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  return POST(request);
}
