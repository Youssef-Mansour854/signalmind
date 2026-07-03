import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Signal from '@/models/Signal';

// GET /api/signals - Retrieve signals
export async function GET(request: Request) {
  try {
    await dbConnect();
    const { searchParams } = new URL(request.url);
    const market = searchParams.get('market'); // US or EGX
    const status = searchParams.get('status'); // Active, Hit TP, Hit SL, etc.
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    const query: any = {};
    if (market) query.market = market;
    if (status) query.status = status;

    // Retrieve signals sorted by rank (ascending) and date (descending)
    const signals = await Signal.find(query)
      .sort({ createdAt: -1, 'scoreMetrics.totalScore': -1 })
      .limit(limit);

    return NextResponse.json({ success: true, count: signals.length, data: signals });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
