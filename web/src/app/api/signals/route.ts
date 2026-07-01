import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Signal from '@/models/Signal';
import { RankingEngine } from '@/services/RankingEngine';

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

// POST /api/signals - Save new signal(s) and recalculate rankings for today
export async function POST(request: Request) {
  try {
    await dbConnect();
    const body = await request.json();
    
    if (!body) {
      return NextResponse.json({ success: false, error: 'Request body is empty' }, { status: 400 });
    }

    const signalsData = Array.isArray(body) ? body : [body];
    const createdSignals = [];

    // Create the signals
    for (const data of signalsData) {
      // Ensure default values are handled
      if (!data.currentPrice && data.indicators?.close) {
        data.currentPrice = data.indicators.close;
      }
      
      const newSignal = new Signal(data);
      
      // Calculate scores
      const engine = new RankingEngine();
      engine.scoreSignal(newSignal);

      await newSignal.save();
      createdSignals.push(newSignal);
    }

    // Recalculate ranks for all BUY signals created today
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    const todaySignals = await Signal.find({
      signalType: 'BUY',
      createdAt: { $gte: startOfToday, $lte: endOfToday }
    });

    if (todaySignals.length > 0) {
      const engine = new RankingEngine();
      const rankedSignals = engine.rankSignals(todaySignals);

      // Save ranked signals back to DB
      for (const sig of rankedSignals) {
        await Signal.updateOne(
          { _id: sig._id },
          { $set: { 'scoreMetrics.rank': sig.scoreMetrics.rank, 'scoreMetrics.totalScore': sig.scoreMetrics.totalScore } }
        );
      }
    }

    return NextResponse.json({ 
      success: true, 
      message: `Successfully processed ${createdSignals.length} signals.`,
      data: createdSignals 
    }, { status: 201 });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
