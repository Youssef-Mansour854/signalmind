import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Signal from '@/models/Signal';

// GET /api/signals - Retrieve signals
export async function GET(request: Request) {
  try {
    await dbConnect();
    const { searchParams } = new URL(request.url);
    const market = searchParams.get('market'); // US or EGX
    const status = searchParams.get('status'); // Active, Hit TP, Hit SL, Closed, etc.
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const skip = (page - 1) * limit;

    const query: any = {};
    if (market) query.market = market;
    
    if (status) {
      if (status === 'Win') {
        query.status = 'Hit TP';
      } else if (status === 'Loss') {
        query.status = 'Hit SL';
      } else if (status === 'Closed') {
        query.status = { $in: ['Hit TP', 'Hit SL', 'Expired'] };
      } else if (status === 'Active') {
        query.status = { $in: ['Active', 'Pending'] };
      } else {
        query.status = status;
      }
    }

    // Retrieve signals sorted by rank (ascending) and date (descending)
    const total = await Signal.countDocuments(query);
    const signals = await Signal.find(query)
      .sort({ createdAt: -1, 'scoreMetrics.totalScore': -1 })
      .skip(skip)
      .limit(limit);

    return NextResponse.json({ 
      success: true, 
      count: signals.length, 
      total, 
      page, 
      totalPages: Math.ceil(total / limit),
      data: signals 
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
