import { NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance();
import { RSI, MACD, EMA } from 'technicalindicators';
import { Groq } from 'groq-sdk';
import dbConnect from '@/lib/mongodb';
import Signal from '@/models/Signal';
import '@/models/Signal'; // Registry safety

function getExpirationDate(timeframe: string, createdAt: Date): Date {
  const date = new Date(createdAt.getTime());
  if (timeframe === 'يومي' || timeframe === 'DAY') {
    date.setHours(date.getHours() + 24);
  } else if (timeframe === 'أسبوعي' || timeframe === 'WEEK') {
    date.setDate(date.getDate() + 7);
  } else if (timeframe === 'شهري' || timeframe === 'MONTH') {
    date.setDate(date.getDate() + 30);
  } else if (timeframe === 'استثمار سنوي' || timeframe === 'YEAR') {
    date.setDate(date.getDate() + 365);
  } else {
    date.setHours(date.getHours() + 24);
  }
  return date;
}

const OPENING_WATCHLIST = [
  { symbol: 'AAPL', market: 'US' },
  { symbol: 'MSFT', market: 'US' },
  { symbol: 'TSLA', market: 'US' },
  { symbol: 'NVDA', market: 'US' },
  { symbol: 'META', market: 'US' }
];

const MACRO_WATCHLIST = [
  { symbol: 'AAPL', market: 'US' },
  { symbol: 'MSFT', market: 'US' },
  { symbol: 'TSLA', market: 'US' },
  { symbol: 'NVDA', market: 'US' },
  { symbol: 'SPY', market: 'US' },
  { symbol: 'QQQ', market: 'US' },
  { symbol: 'KO', market: 'US' },
  { symbol: 'JNJ', market: 'US' },
  { symbol: 'AMD', market: 'US' }
];

// Helper delay to avoid rate limiting
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isNYMarketOpenTime(date: Date = new Date()): boolean {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  let hour = 0;
  let minute = 0;
  for (const part of parts) {
    if (part.type === 'hour') hour = parseInt(part.value, 10);
    if (part.type === 'minute') minute = parseInt(part.value, 10);
  }
  // Allow window 9:30 AM to 9:35 AM (in case cron triggers slightly after 9:30)
  return hour === 9 && minute >= 30 && minute <= 35;
}

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    const isManualTrigger = request.headers.get('x-manual-trigger') === 'true' || new URL(request.url).searchParams.get('manual') === 'true';

    // Verify CRON_SECRET if provided in environment variables and call is not manual
    if (process.env.CRON_SECRET && !isManualTrigger) {
      if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ success: false, error: 'Unauthorized cron request.' }, { status: 401 });
      }
    }

    // Time-guard check for automated Vercel Cron calls (ensure 09:30 AM NY time)
    if (!isManualTrigger) {
      if (!isNYMarketOpenTime()) {
        return NextResponse.json({
          success: true,
          skipped: true,
          message: 'تم تخطي المسح التلقائي لأن الوقت الحالي ليس نافذة افتتاح سوق نيويورك (09:30 صباحاً).'
        });
      }
    }

    await dbConnect();

    const apiKeysString = process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || '';
    const apiKeys = apiKeysString.split(',').map((key) => key.trim()).filter(Boolean);

    if (apiKeys.length === 0) {
      return NextResponse.json({ success: false, error: 'GROQ_API_KEYS غير معرّف في خادم الويب.' }, { status: 500 });
    }

    let routine: 'OPENING_BELL' | 'MACRO_SCAN' = 'OPENING_BELL';
    try {
      const body = await request.clone().json();
      if (body?.routine === 'MACRO_SCAN' || body?.routine === 'OPENING_BELL') {
        routine = body.routine;
      }
    } catch {
      const urlRoutine = new URL(request.url).searchParams.get('routine');
      if (urlRoutine === 'MACRO_SCAN') {
        routine = 'MACRO_SCAN';
      }
    }

    const watchlist = routine === 'MACRO_SCAN' ? MACRO_WATCHLIST : OPENING_WATCHLIST;
    const isMacro = routine === 'MACRO_SCAN';

    const resultsSummary: string[] = [];
    let successCount = 0;

    for (const item of watchlist) {
      const { symbol, market } = item;
      try {
        // 1. Fetch Yahoo Finance historical data (last 6 months)
        let yfSymbol = symbol;
        if (market === 'EGX' && !symbol.endsWith('.CA')) {
          yfSymbol = `${symbol}.CA`;
        }

        const today = new Date();
        const daysBack = isMacro ? 365 : 180;
        const pastDate = new Date(today.getTime() - daysBack * 24 * 60 * 60 * 1000);
        const period1 = Math.floor(pastDate.getTime() / 1000);
        const period2 = Math.floor(today.getTime() / 1000);

        const historicalData = (await yahooFinance.historical(yfSymbol, {
          period1,
          period2,
          interval: '1d',
        })) as any[];

        if (!historicalData || historicalData.length === 0) {
          resultsSummary.push(`${symbol}: لم يتم العثور على بيانات فنية`);
          continue;
        }

        const closes = historicalData
          .map((bar) => bar.close)
          .filter((c): c is number => typeof c === 'number' && c > 0);

        if (closes.length < 26) {
          resultsSummary.push(`${symbol}: بيانات غير كافية لحساب المؤشرات`);
          continue;
        }

        const latestPrice = closes[closes.length - 1];

        // 2. Compute Technical Indicators
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

        const ema50Values = closes.length >= 50 ? EMA.calculate({ values: closes, period: 50 }) : [];
        const latestEMA50 = ema50Values.length > 0 ? ema50Values[ema50Values.length - 1] : latestPrice;

        const ema200Values = closes.length >= 200 ? EMA.calculate({ values: closes, period: 200 }) : [];
        const latestEMA200 = ema200Values.length > 0 ? ema200Values[ema200Values.length - 1] : latestPrice;

        // 3. Setup prompt based on routine
        let prompt = '';
        if (isMacro) {
          prompt = `أنت خبير استراتيجيات الاستثمار الكلي والتحليل الفني الهيكلي للمدى البعيد.
قم بتحليل الاتجاه الهيكلي لسهم/صندوق ${symbol} (سوق: ${market}) بناءً على البيانات الفنية التاريخية (لمدة سنة كاملة):
- السعر الحالي: ${latestPrice.toFixed(2)}
- مؤشر RSI (14): ${latestRSI.toFixed(2)}
- مؤشر MACD Line: ${latestMACD.MACD?.toFixed(4) || '0.00'}
- المتوسط المتحرك الأسّي 50 يوماً (EMA 50): ${latestEMA50.toFixed(2)}
- المتوسط المتحرك الأسّي 200 يوماً (EMA 200): ${latestEMA200.toFixed(2)}

تعليمات تحليلية صارمة للمدى البعيد (MACRO SCAN):
1. قم بتجاهل الضوضاء والتقلبات اللحظية بالكامل.
2. ركز بدقة على الهيكل العام للسوق (Market Structure)، التجميع والقيعان الرئيسية، وتقاطعات ومستويات EMA 50 و EMA 200.
3. يجب أن تختار الإطار الزمني حصرياً من بين 3 خيارات فقط: "أسبوعي" (WEEK)، "شهري" (MONTH)، أو "استثمار سنوي" (YEAR).
4. يمنع منعاً باتاً اختيار "يومي" (DAY).

يجب أن تقوم بالرد بصيغة JSON فقط دون أي نصوص أو تعليقات خارج الـ JSON.
يجب أن تحتوي صيغة الـ JSON على الحقول التالية بدقة:
{
  "signalType": "BUY" | "SELL" | "HOLD",
  "entryPrice": number (سعر الدخول المقترح بناءً على مناطق الدعم والتجميع الهيكلية),
  "stopLoss": number (سعر وقف الخسارة المقترح بدقة),
  "takeProfit": number (سعر الهدف الاستثماري المقترح لجني الأرباح),
  "aiConfidence": "High" | "Medium" | "Low",
  "aiRisk": "High" | "Medium" | "Low",
  "timeframe": "أسبوعي" | "شهري" | "استثمار سنوي",
  "signalStrength": "قوية" | "متوسطة",
  "explanationArabic": "تحليل فني هيكلي استثماري دقيق باللغة العربية يشرح سبب اتخاذ هذا القرار والتوجه الكلي للرمز بناء على EMA 50/200 والمؤشرات المذكورة."
}`;
        } else {
          prompt = `أنت خبير في التحليل الفني لأسواق المال ومستشار تداول خوارزمي.
قم بتحليل البيانات الفنية الحالية لسهم ${symbol} (سوق: ${market}) واكتب توصية تداول دقيقة باللغة العربية بناءً على المعطيات التالية:
- السعر الحالي: ${latestPrice.toFixed(2)}
- مؤشر القوة النسبية RSI (14): ${latestRSI.toFixed(2)}
- مؤشر MACD Line: ${latestMACD.MACD?.toFixed(4) || '0.00'}
- مؤشر MACD Signal: ${latestMACD.signal?.toFixed(4) || '0.00'}
- مؤشر MACD Histogram: ${latestMACD.histogram?.toFixed(4) || '0.00'}

هام جداً:
يجب عليك تحديد أفضل إطار زمني (timeframe) مناسب تماماً للفرصة الفنية الحالية لهذا السهم:
- إذا كان هناك زخم سريع ملائم ليومي أو يومين فقط، اختر "يومي" (DAY).
- إذا كان هناك نمط انعكاسي أو كسر مقاومة على المدى الأسبوعي، اختر "أسبوعي" (WEEK).
- إذا كان السهم يؤسس لقاع تجميعي قوي يناسب المدى المتوسط، اختر "شهري" (MONTH).
- إذا كان السهم مناسباً جداً للاستثمار طويل المدى وصمام أمان للمحفظة الاستثمارية السنوية، اختر "استثمار سنوي" (YEAR).

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
  "explanationArabic": "تحليل فني مختصر ومقنع باللغة العربية يشرح سبب اتخاذ هذا القرار الفني بالاعتماد على المؤشرات المذكورة (RSI, MACD) ومستويات الدعم والمقاومة، وسبب اختيار هذا الإطار الزمني بالذات."
}`;
        }

        // 4. Query AI using rotated keys
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
              break;
            }
          } catch (err: any) {
            console.warn(`[WARNING] Groq key at index ${i} failed for bulk scan of ${symbol}: ${err.message}`);
            lastError = err;
          }
        }

        if (!content) {
          resultsSummary.push(`${symbol}: فشل الاتصال بالذكاء الاصطناعي`);
          continue;
        }

        const parsed = JSON.parse(content);

        // Normalize timeframe
        let finalTimeframe = parsed.timeframe || (isMacro ? 'أسبوعي' : 'يومي');
        if (finalTimeframe === 'DAY' || finalTimeframe === 'day') {
          finalTimeframe = isMacro ? 'أسبوعي' : 'يومي';
        }
        if (finalTimeframe === 'WEEK' || finalTimeframe === 'week') finalTimeframe = 'أسبوعي';
        if (finalTimeframe === 'MONTH' || finalTimeframe === 'month') finalTimeframe = 'شهري';
        if (finalTimeframe === 'YEAR' || finalTimeframe === 'year') finalTimeframe = 'استثمار سنوي';

        const entry = Number(parsed.entryPrice) || latestPrice;
        const sl = Number(parsed.stopLoss) || latestPrice * 0.95;
        const tp = Number(parsed.takeProfit) || latestPrice * 1.1;
        const rrr = Math.abs(tp - entry) / Math.max(0.01, Math.abs(entry - sl));

        // Deduplication: Before inserting a new signal for a specific symbol and timeframe,
        // find any existing 'ACTIVE'/'Active'/'Pending' signals for that same symbol/timeframe and update status to 'EXPIRED'
        await Signal.updateMany(
          { symbol, timeframe: finalTimeframe, status: { $in: ['ACTIVE', 'Active', 'Pending'] } },
          { $set: { status: 'EXPIRED' } }
        );

        const createdAt = new Date();
        const expiresAt = getExpirationDate(finalTimeframe, createdAt);

        // 5. Save Signal to MongoDB (Insert new document)
        const newSignal = new Signal({
          symbol,
          market,
          signalType: parsed.signalType || 'HOLD',
          entryPrice: entry,
          stopLoss: sl,
          takeProfit: tp,
          currentPrice: latestPrice,
          status: 'ACTIVE',
          expiresAt,
          aiConfidence: parsed.aiConfidence || 'Medium',
          aiRisk: parsed.aiRisk || 'Medium',
          timeframe: finalTimeframe,
          signalStrength: parsed.signalStrength || 'متوسطة',
          explanationArabic: parsed.explanationArabic || 'تم تحديث المسح الفني التلقائي.',
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
          createdAt,
          updatedAt: createdAt,
        });

        await newSignal.save();

        resultsSummary.push(`${symbol}: تم التحديث بنجاح كـ (${finalTimeframe})`);
        successCount++;

        // Small delay to prevent hitting API limits
        await delay(1000);

      } catch (err: any) {
        console.error(`Error scanning ${symbol}:`, err);
        resultsSummary.push(`${symbol}: خطأ (${err.message})`);
      }
    }

    return NextResponse.json({
      success: true,
      message: `اكتمل مسح ${isMacro ? 'الفرص الاستثمارية الكبرى (MACRO SCAN)' : 'رادار الافتتاح (OPENING BELL)'} بنجاح. تم توليد وتحديث ${successCount} إشارات من أصل ${watchlist.length}.`,
      routine,
      summary: resultsSummary
    });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
