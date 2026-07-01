import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Signal from '@/models/Signal';

export async function GET() {
  try {
    await dbConnect();
    // Retrieve latest signals deduplicated by symbol
    const signals = await Signal.aggregate([
      { $sort: { symbol: 1, createdAt: -1 } },
      {
        $group: {
          _id: '$symbol',
          doc: { $first: '$$ROOT' }
        }
      },
      { $replaceRoot: { newRoot: '$doc' } },
      { $sort: { createdAt: -1 } }
    ]);
    return NextResponse.json({ success: true, data: signals });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
