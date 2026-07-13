import { NextResponse } from 'next/server';
import { getCleanedHistory } from '@/lib/historyHelper';

export async function GET() {
  try {
    const history = await getCleanedHistory();
    return NextResponse.json({ success: true, data: history });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
