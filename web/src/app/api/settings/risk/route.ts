// web/src/app/api/settings/risk/route.ts
import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Setting from '@/models/Setting';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const DEFAULT_RISK_SETTINGS = {
  riskPercent: 2,
  contractSize: 100,
  minVolume: 0.01,
  volumeStep: 0.01,
};

export async function GET() {
  try {
    await dbConnect();
    const doc = await Setting.findOne({ key: 'riskSettings' });
    const settings = doc && typeof doc.value === 'object' ? { ...DEFAULT_RISK_SETTINGS, ...doc.value } : DEFAULT_RISK_SETTINGS;

    return NextResponse.json({
      success: true,
      data: settings,
    });
  } catch (error: any) {
    console.error('Error fetching risk settings:', error);
    return NextResponse.json(
      { success: false, error: 'Internal Server Error', data: DEFAULT_RISK_SETTINGS },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    await dbConnect();
    const body = await request.json();

    const riskPercent = typeof body.riskPercent === 'number' && body.riskPercent > 0 ? body.riskPercent : DEFAULT_RISK_SETTINGS.riskPercent;
    const contractSize = typeof body.contractSize === 'number' && body.contractSize > 0 ? body.contractSize : DEFAULT_RISK_SETTINGS.contractSize;
    const minVolume = typeof body.minVolume === 'number' && body.minVolume > 0 ? body.minVolume : DEFAULT_RISK_SETTINGS.minVolume;
    const volumeStep = typeof body.volumeStep === 'number' && body.volumeStep > 0 ? body.volumeStep : DEFAULT_RISK_SETTINGS.volumeStep;

    const newSettings = {
      riskPercent,
      contractSize,
      minVolume,
      volumeStep,
    };

    const doc = await Setting.findOneAndUpdate(
      { key: 'riskSettings' },
      { key: 'riskSettings', value: newSettings },
      { upsert: true, new: true }
    );

    return NextResponse.json({
      success: true,
      data: doc.value,
    });
  } catch (error: any) {
    console.error('Error saving risk settings:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
