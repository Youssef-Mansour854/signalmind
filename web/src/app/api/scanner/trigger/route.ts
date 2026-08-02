import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const OPENING_WATCHLIST_SYMBOLS = 'AAPL,MSFT,TSLA,NVDA,META';
const MACRO_WATCHLIST_SYMBOLS = 'AAPL,MSFT,TSLA,NVDA,PG,HD,KO,JNJ,AMD';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const routine = body.routine === 'MACRO_SCAN' ? 'MACRO_SCAN' : 'OPENING_BELL';

    const symbols = routine === 'MACRO_SCAN' ? MACRO_WATCHLIST_SYMBOLS : OPENING_WATCHLIST_SYMBOLS;
    const trade_type = routine === 'MACRO_SCAN' ? 'SWING_MONTHLY' : 'DAY_TRADE';
    const scanName = routine === 'MACRO_SCAN' ? 'مسح الفرص الكبرى (SWING)' : 'رادار الافتتاح (DAY_TRADE)';

    const token = process.env.GH_DISPATCH_TOKEN || process.env.GITHUB_TOKEN;

    if (!token) {
      return NextResponse.json(
        {
          success: false,
          error: 'رمز الوصول (GH_DISPATCH_TOKEN) غير معرف في إعدادات Vercel. يرجى إضافة التوكن أولاً لتمكين تشغيل محرك بايثون.'
        },
        { status: 500 }
      );
    }

    const repoOwner = process.env.GITHUB_REPO_OWNER || 'Youssef-Mansour854';
    const repoName = process.env.GITHUB_REPO_NAME || 'signalmind';
    const workflowFile = 'quick_scan.yml';
    const branch = process.env.GITHUB_REF_NAME || 'main';

    const dispatchUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/actions/workflows/${workflowFile}/dispatches`;

    const res = await fetch(dispatchUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'SignalMind-Vercel-App'
      },
      body: JSON.stringify({
        ref: branch,
        inputs: {
          symbols,
          trade_type,
          market: 'US'
        }
      })
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error('[GITHUB DISPATCH ERROR]', res.status, errText);
      return NextResponse.json(
        {
          success: false,
          error: `فشل إرسال طلب التشغيل إلى GitHub Actions (رمز الحالة: ${res.status}).`
        },
        { status: res.status }
      );
    }

    return NextResponse.json({
      success: true,
      message: `🚀 تم بدء تشغيل ${scanName} على محرك بايثون الرئيسي عبر GitHub Actions! ستصل التوصيات المتوافقة شرعياً عبر Telegram وتظهر بالداشبورد فور انتهائه (خلال 1-2 دقيقة).`,
      routine,
      trade_type,
      symbols
    });

  } catch (error: any) {
    console.error('[SCANNER TRIGGER ERROR]', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return POST(request);
}
