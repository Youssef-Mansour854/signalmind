import { NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance();
import { RSI, MACD } from 'technicalindicators';
import { Groq } from 'groq-sdk';
import dbConnect from '@/lib/mongodb';
import Signal from '@/models/Signal';
import '@/models/Signal'; // Registry safety

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { symbol, market } = body;

    if (!symbol || !market) {
      return NextResponse.json({ success: false, error: 'برجاء تزويد الرمز والسوق المطلوبة.' }, { status: 400 });
    }

    // 1. Map symbols for Yahoo Finance
    let yfSymbol = symbol;
    if (market === 'EGX') {
      if (!symbol.endsWith('.CA')) {
        yfSymbol = `${symbol}.CA`;
      }
    }

    // 2. Fetch daily historical data (last 6 months)
    const today = new Date();
    const sixMonthsAgo = new Date(today.getTime() - 180 * 24 * 60 * 60 * 1000);
    const period1 = Math.floor(sixMonthsAgo.getTime() / 1000);
    const period2 = Math.floor(today.getTime() / 1000);

    const result = (await yahooFinance.historical(yfSymbol, {
      period1,
      period2,
      interval: '1d',
    })) as any[];

    if (!result || result.length === 0) {
      return NextResponse.json({ success: false, error: `لم يتم العثور على بيانات تاريخية للسهم ${symbol}` }, { status: 404 });
    }

    // Filter valid close prices
    const closes = result
      .map((bar) => bar.close)
      .filter((c): c is number => typeof c === 'number' && c > 0);

    if (closes.length < 26) {
      return NextResponse.json({
        success: false,
        error: `البيانات التاريخية غير كافية لحساب المؤشرات الفنية (مطلوب على الأقل 26 إغلاق، وجد ${closes.length})`,
      }, { status: 400 });
    }

    const latestPrice = closes[closes.length - 1];

    // 3. Technical Indicators Calculation
    const rsiValues = RSI.calculate({ values: closes, period: 14 });
    const latestRSI = rsiValues[rsiValues.length - 1] ?? 50;

    const macdValues = MACD.calculate({
      values: closes,
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      SimpleMAOscillator: false,
      SimpleMASignal: false,
    });
    const latestMACD = macdValues[macdValues.length - 1] || { MACD: 0, signal: 0, histogram: 0 };

    // 4. Groq SDK AI Call with multi-key rotation fallback
    const apiKeysString = process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || '';
    const apiKeys = apiKeysString.split(',').map((key) => key.trim()).filter(Boolean);

    if (apiKeys.length === 0) {
      return NextResponse.json({ success: false, error: 'GROQ_API_KEYS أو GROQ_API_KEY غير معرّف في خادم الويب.' }, { status: 500 });
    }

    const prompt = `أنت خبير في التحليل الفني لأسواق المال ومستشار تداول خوارزمي. 
قم بتحليل البيانات الفنية الحالية لسهم ${symbol} (سوق: ${market}) واكتب توصية تداول دقيقة باللغة العربية بناءً على المعطيات التالية:
- السعر الحالي: ${latestPrice.toFixed(2)}
- مؤشر القوة النسبية RSI (14): ${latestRSI.toFixed(2)}
- مؤشر MACD Line: ${latestMACD.MACD?.toFixed(4) || '0.00'}
- مؤشر MACD Signal: ${latestMACD.signal?.toFixed(4) || '0.00'}
- مؤشر MACD Histogram: ${latestMACD.histogram?.toFixed(4) || '0.00'}

يجب أن تقوم بالرد بصيغة JSON فقط دون أي نصوص أو تعليقات خارج الـ JSON. 
يجب أن تحتوي صيغة الـ JSON على الحقول التالية بدقة:
{
  "signalType": "BUY" | "SELL" | "HOLD",
  "entryPrice": number (سعر الدخول المقترح بناء على التحليل الفني ومستويات الدعم والمقاومة القريبة),
  "stopLoss": number (سعر وقف الخسارة المقترح بدقة),
  "takeProfit": number (سعر الهدف المقترح لجني الأرباح بدقة),
  "aiConfidence": "High" | "Medium" | "Low",
  "aiRisk": "High" | "Medium" | "Low",
  "timeframe": "يومي" | "أسبوعي" | "شهري" | "استثمار سنوي",
  "signalStrength": "قوية" | "متوسطة",
  "explanationArabic": "تحليل فني مختصر ومقنع باللغة العربية يشرح سبب اتخاذ هذا القرار الفني بالاعتماد على المؤشرات المذكورة (RSI, MACD) ومستويات الدعم والمقاومة"
}`;

    let content = '';
    let lastError: any = null;

    for (let i = 0; i < apiKeys.length; i++) {
      const currentKey = apiKeys[i];
      try {
        const groq = new Groq({ apiKey: currentKey });
        const chatCompletion = await groq.chat.completions.create({
          messages: [
            { role: 'system', content: 'You must output strictly JSON format. Do not enclose output in markdown blocks like ```json ... ```. Just return the raw JSON string.' },
            { role: 'user', content: prompt },
          ],
          model: 'llama-3.3-70b-versatile',
          response_format: { type: 'json_object' },
        });

        const resContent = chatCompletion.choices[0]?.message?.content;
        if (resContent) {
          content = resContent;
          break; // Succeeded, exit loop!
        }
      } catch (err: any) {
        console.warn(`[WARNING] Groq key at index ${i} failed or rate limited. Error: ${err.message}`);
        lastError = err;
      }
    }

    if (!content) {
      const errorMsg = lastError ? lastError.message : 'جميع مفاتيح Groq API تم استهلاكها أو فشلت.';
      return NextResponse.json({ success: false, error: `فشل التحليل بالذكاء الاصطناعي: ${errorMsg}` }, { status: 500 });
    }

    const parsed = JSON.parse(content);

    // 5. Connect to MongoDB and Update the Signal document
    await dbConnect();

    const entry = Number(parsed.entryPrice) || latestPrice;
    const sl = Number(parsed.stopLoss) || latestPrice * 0.95;
    const tp = Number(parsed.takeProfit) || latestPrice * 1.1;
    const rrr = Math.abs(tp - entry) / Math.max(0.01, Math.abs(entry - sl));

    const updatedSignal = await Signal.findOneAndUpdate(
      { symbol },
      {
        $set: {
          symbol,
          market,
          signalType: parsed.signalType || 'HOLD',
          entryPrice: entry,
          stopLoss: sl,
          takeProfit: tp,
          currentPrice: latestPrice,
          status: 'Active', // Reset to Active upon live update
          aiConfidence: parsed.aiConfidence || 'Medium',
          aiRisk: parsed.aiRisk || 'Medium',
          timeframe: parsed.timeframe || 'يومي',
          signalStrength: parsed.signalStrength || 'متوسطة',
          explanationArabic: parsed.explanationArabic || 'تم تحديث التحليل الفني بنجاح.',
          indicators: {
            close: latestPrice,
            rsi: latestRSI,
            macdLine: latestMACD.MACD || 0,
            macdSignal: latestMACD.signal || 0,
          },
          scoreMetrics: {
            riskRewardRatio: Number(rrr.toFixed(2)),
            confluenceScore: 75,
            aiConfidenceScore: parsed.aiConfidence === 'High' ? 90 : parsed.aiConfidence === 'Medium' ? 70 : 50,
            totalScore: 75,
            rank: 999,
          },
          updatedAt: new Date(),
        },
      },
      { new: true, upsert: true }
    );

    return NextResponse.json({ success: true, data: updatedSignal });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
