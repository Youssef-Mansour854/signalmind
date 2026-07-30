import { NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance();
import { RSI, MACD, EMA } from 'technicalindicators';
import { Groq } from 'groq-sdk';
import dbConnect from '@/lib/mongodb';
import Signal from '@/models/Signal';
import '@/models/Signal'; // Registry safety
import { fetchMarketData, StaleDataError } from '@/utils/marketFetcher';
import { checkEntryTrigger, evaluateExecutionTrigger } from '@/lib/executionEngine';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function getExpirationDate(timeframe: string, createdAt: Date): Date {
  const date = new Date(createdAt.getTime());
  const tfUpper = (timeframe || '').toUpperCase();
  if (timeframe === 'يومي' || tfUpper === 'DAY' || tfUpper === 'DAY_TRADE') {
    date.setHours(date.getHours() + 24);
  } else if (timeframe === 'أسبوعي' || tfUpper === 'WEEK' || tfUpper === 'SWING') {
    date.setDate(date.getDate() + 7);
  } else if (timeframe === 'شهري' || tfUpper === 'MONTH' || tfUpper === 'MONTHLY') {
    date.setDate(date.getDate() + 30);
  } else if (timeframe === 'استثمار سنوي' || tfUpper === 'YEAR' || tfUpper === 'YEARLY') {
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

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    // --- GLOBAL DAILY CAP CHECK (Maximum 5 signals per day across all runs) ---
    const todaySignalsCount = await Signal.countDocuments({ createdAt: { $gte: startOfToday } });
    if (todaySignalsCount >= 5) {
      return NextResponse.json({
        success: true,
        limitReached: true,
        message: "تم الوصول إلى الحد الأقصى اليومي (5 إشارات). لن يتم إجراء مسح جديد اليوم."
      });
    }

    const apiKeysString = process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || '';
    const apiKeys = apiKeysString.split(',').map((key) => key.trim()).filter(Boolean);

    if (apiKeys.length === 0) {
      return NextResponse.json({ success: false, error: 'GROQ_API_KEYS غير معرّف في خادم الويب.' }, { status: 500 });
    }

    const searchParams = new URL(request.url).searchParams;
    const urlTf = searchParams.get('tf');

    let routine: 'OPENING_BELL' | 'MACRO_SCAN' = 'OPENING_BELL';
    let reqTf = urlTf || null;
    try {
      const body = await request.clone().json();
      if (body?.routine === 'MACRO_SCAN' || body?.routine === 'OPENING_BELL') {
        routine = body.routine;
      }
      if (body?.tf) {
        reqTf = body.tf;
      }
    } catch {
      const urlRoutine = searchParams.get('routine');
      if (urlRoutine === 'MACRO_SCAN') {
        routine = 'MACRO_SCAN';
      }
    }

    if (!reqTf) {
      reqTf = routine === 'MACRO_SCAN' ? 'SWING' : 'DAY_TRADE';
    }

    // Map the requested timeframe to the standard string expected by the DB/UI
    let dbTimeframe = 'DAY_TRADE';
    const upperReqTf = (reqTf || '').toUpperCase();
    if (upperReqTf === 'SWING' || upperReqTf === 'WEEK' || reqTf === 'أسبوعي') {
      dbTimeframe = 'SWING';
    } else if (upperReqTf === 'MONTHLY' || upperReqTf === 'MONTH' || reqTf === 'شهري') {
      dbTimeframe = 'MONTHLY';
    } else if (upperReqTf === 'YEARLY' || upperReqTf === 'YEAR' || reqTf === 'استثمار سنوي') {
      dbTimeframe = 'YEARLY';
    } else if (upperReqTf === 'DAY_TRADE' || upperReqTf === 'DAY' || reqTf === 'يومي') {
      dbTimeframe = 'DAY_TRADE';
    } else {
      dbTimeframe = reqTf || 'DAY_TRADE';
    }

    const watchlist = routine === 'MACRO_SCAN' ? MACRO_WATCHLIST : OPENING_WATCHLIST;
    const isMacro = routine === 'MACRO_SCAN';

    const resultsSummary: string[] = [];
    let successCount = 0;
    const generatedSignals: any[] = [];

    // Helper chunker for watchlist
    const CHUNK_SIZE = 5;
    const CHUNK_DELAY_MS = 2000;
    const chunkArray = <T>(arr: T[], size: number): T[][] =>
      arr.length ? [arr.slice(0, size), ...chunkArray(arr.slice(size), size)] : [];

    const watchlistChunks = chunkArray(watchlist, CHUNK_SIZE);

    for (let cIdx = 0; cIdx < watchlistChunks.length; cIdx++) {
      const chunk = watchlistChunks[cIdx];
      console.log(`[SCANNER CHUNK] Processing batch ${cIdx + 1}/${watchlistChunks.length} (${chunk.length} items)...`);

      for (const item of chunk) {
        const { symbol, market } = item;
        try {
          const startOfToday = new Date();
          startOfToday.setHours(0, 0, 0, 0);

          // --- STRICT STEP 1: Deduplication Check (Prevent Spam) ---
          const existingSignalToday = await Signal.findOne({
            symbol,
            status: { $in: ['ACTIVE', 'Active', 'Pending'] },
            createdAt: { $gte: startOfToday }
          });

          if (existingSignalToday) {
            console.log(`[Deduplication] Skipped ${symbol}: Active/Pending signal already created today`);
            resultsSummary.push(`${symbol}: تم التخطي لوجود إشارة نشطة منشأة اليوم (Deduplication Guard)`);
            continue;
          }

          // Fetch market data using marketFetcher utility (with Staleness Guard and Market Router)
          const marketData = await fetchMarketData(symbol, market as 'US' | 'EGX', isMacro);
          const { latestPrice, latestRSI, latestMACD, latestEMA50, latestEMA200 } = marketData;

          // --- STRICT FILTER 1: Minimum Average Daily Volume (1,000,000) ---
          const MIN_VOLUME = 1000000;
          const volumeAvg = (marketData as any).volumeAvg || (marketData as any).volume || 0;
          if (volumeAvg > 0 && volumeAvg < MIN_VOLUME) {
            console.log(`[Noise Filter] Skipped ${symbol}: Average volume (${volumeAvg}) < ${MIN_VOLUME}`);
            resultsSummary.push(`${symbol}: تم التخطي بسبب ضعف السيولة اليومية (< 1,000,000)`);
            continue;
          }

          // --- STRICT FILTER 2: RSI Safe Range (40 - 70) ---
          if (latestRSI < 40 || latestRSI > 70) {
            console.log(`[RSI Filter] Skipped ${symbol}: RSI (${latestRSI.toFixed(1)}) outside 40-70 safe range`);
            resultsSummary.push(`${symbol}: تم التخطي لخروج مؤشر RSI عن النطاق الآمن (40-70)`);
            continue;
          }

          // --- STRICT FILTER 3: Trend Confirmation (Price >= EMA50) ---
          if (latestEMA50 > 0 && latestPrice < latestEMA50) {
            console.log(`[Trend Filter] Skipped ${symbol}: Price (${latestPrice}) below EMA50 (${latestEMA50})`);
            resultsSummary.push(`${symbol}: تم التخطي بسبب معاكسة الاتجاه (السعر أقل من EMA50)`);
            continue;
          }

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

          // Force timeframe property to match the requested dbTimeframe
          const finalTimeframe = dbTimeframe;

          const entry = Number(parsed.entryPrice) || latestPrice;
          const sl = Number(parsed.stopLoss) || latestPrice * 0.95;
          const tp = Number(parsed.takeProfit) || latestPrice * 1.1;
          const rrr = Math.abs(tp - entry) / Math.max(0.01, Math.abs(entry - sl));

          const signalType = parsed.signalType || 'BUY';
          const entryCheck = await evaluateExecutionTrigger(signalType, entry, latestPrice);
          const initialStatus = entryCheck.shouldExecute ? 'ACTIVE' : 'Pending';
          const actualEntryPrice = entryCheck.actualEntryPrice; // Real execution price saved in MongoDB

          const createdAt = new Date();
          const expiresAt = getExpirationDate(finalTimeframe, createdAt);

          // 5. Construct Signal document in-memory (database insertion happens after Top 5 capping)
          const newSignal = new Signal({
            symbol,
            market,
            signalType,
            entryPrice: entry,
            actualEntryPrice,
            stopLoss: sl,
            takeProfit: tp,
            currentPrice: latestPrice,
            status: initialStatus,
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

          console.log(`[AI SUCCESS] Evaluated candidate signal for ${symbol} with forced timeframe: ${finalTimeframe}`);

          generatedSignals.push(newSignal);
          resultsSummary.push(`${symbol}: تم تحليله بنجاح كمرشح (${finalTimeframe})`);
          successCount++;

          await delay(1000);

        } catch (err: any) {
          if (err instanceof StaleDataError) {
            console.warn(`[Guard REJECT] Skipped ${symbol} due to stale data: ${err.message}`);
            resultsSummary.push(`${symbol}: تم التخطي بسبب قدم البيانات (Stale Data Guard)`);
          } else {
            console.error(`Error scanning ${symbol}:`, err);
            resultsSummary.push(`${symbol}: خطأ (${err.message})`);
          }
        }
      }

      if (cIdx < watchlistChunks.length - 1) {
        console.log(`[RATE LIMIT GUARD] Pausing ${CHUNK_DELAY_MS}ms between chunks...`);
        await delay(CHUNK_DELAY_MS);
      }
    }

    // --- STRICT STEP 2, 3 & 4: Sort by Strength, Global Hard Cap & Database Insert ---
    generatedSignals.sort((a, b) => (b.scoreMetrics?.totalScore || 0) - (a.scoreMetrics?.totalScore || 0));

    // Calculate maximum signals allowed to insert today without exceeding global daily limit of 5
    const remainingCap = Math.max(0, 5 - todaySignalsCount);
    const topSignalsToInsert = generatedSignals.slice(0, remainingCap);

    // Overwrite the timeframe before DB insert
    const finalSignalsToInsert = topSignalsToInsert.map((signal) => {
      signal.timeframe = dbTimeframe;
      signal.expiresAt = getExpirationDate(dbTimeframe, signal.createdAt || new Date());
      return signal;
    });

    for (const signalToSave of finalSignalsToInsert) {
      await Signal.updateMany(
        { symbol: signalToSave.symbol, timeframe: signalToSave.timeframe, status: { $in: ['ACTIVE', 'Active', 'Pending'] } },
        { $set: { status: 'EXPIRED' } }
      );
      await signalToSave.save();
      console.log(`[DATABASE INSERT] Saved capped signal for ${signalToSave.symbol} with timeframe ${signalToSave.timeframe}`);
    }

    const scanTypeStr = isMacro ? 'الفرص الكبرى' : 'رادار الافتتاح';
    const responseMsg = `اكتمل مسح ${scanTypeStr} بنجاح. تم اختيـار ${topSignalsToInsert.length} إشارات جديدة.`;

    return NextResponse.json({
      success: true,
      message: responseMsg,
      routine,
      summary: resultsSummary,
      topSignals: topSignalsToInsert,
    });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
