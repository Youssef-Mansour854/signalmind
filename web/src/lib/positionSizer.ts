// web/src/lib/positionSizer.ts

export interface PositionSizeInput {
  capital: number;           // Available Cash (e.g. $20.16 or $500)
  riskPercent: number;       // Risk % (e.g. 2%)
  entryPrice: number;        // Entry Price
  stopLossPrice: number;     // Stop Loss Price
  contractSize?: number;     // Contract size per lot (default 100)
  minVolume?: number;        // Minimum volume (default 0.01)
  volumeStep?: number;       // Volume step (default 0.01)
}

export interface PositionSizeResult {
  available: boolean;
  lotsNeeded: number;
  actualRiskAmount: number;
  actualRiskPercent: number;
  minCapitalRequired?: number;
  message: string;
  errorMessage?: string;
}

export function calculatePositionSize(input: PositionSizeInput): PositionSizeResult {
  const {
    capital,
    riskPercent = 2,
    entryPrice,
    stopLossPrice,
    contractSize = 100,
    minVolume = 0.01,
    volumeStep = 0.01,
  } = input;

  // 0. Safety Guard: Check for invalid prices or zero risk per share
  if (!entryPrice || !stopLossPrice || entryPrice <= 0 || stopLossPrice <= 0) {
    return {
      available: false,
      lotsNeeded: 0,
      actualRiskAmount: 0,
      actualRiskPercent: 0,
      message: "بيانات السعر غير صالحة لهذه الإشارة",
      errorMessage: "بيانات السعر غير صالحة لهذه الإشارة",
    };
  }

  const riskPerShare = Math.abs(entryPrice - stopLossPrice);
  if (riskPerShare <= 0.00001) {
    return {
      available: false,
      lotsNeeded: 0,
      actualRiskAmount: 0,
      actualRiskPercent: 0,
      message: "بيانات السعر غير صالحة لهذه الإشارة",
      errorMessage: "سعر الدخول يطابق وقف الخسارة (قسمة على صفر)",
    };
  }

  if (!capital || capital <= 0) {
    return {
      available: false,
      lotsNeeded: 0,
      actualRiskAmount: 0,
      actualRiskPercent: 0,
      message: "الرصيد المتاح غير كافٍ أو مساوٍ للصفر",
      errorMessage: "الرصيد المتاح غير كافٍ",
    };
  }

  // 1. Target Risk Amount
  const targetRiskAmount = capital * (riskPercent / 100);

  // 2. Shares needed & Raw lots needed
  const sharesNeeded = targetRiskAmount / riskPerShare;
  const rawLotsNeeded = sharesNeeded / contractSize;

  // 3. Floor to volumeStep (never round up)
  const steps = Math.floor((rawLotsNeeded + 1e-9) / volumeStep);
  const lotsNeeded = Math.max(0, Number((steps * volumeStep).toFixed(4)));

  // 4. Calculate min capital required for minVolume
  const minShares = minVolume * contractSize;
  const minRiskAmount = minShares * riskPerShare;
  const minCapitalRequired = Number((minRiskAmount / (riskPercent / 100)).toFixed(2));

  // 5. Availability Check
  if (lotsNeeded < minVolume) {
    return {
      available: false,
      lotsNeeded: 0,
      actualRiskAmount: 0,
      actualRiskPercent: 0,
      minCapitalRequired,
      message: `غير متاح - الرصيد الحالي غير كافٍ لفتح هذه الصفقة ضمن حدود المخاطرة المحددة (${riskPercent}%). الحد الأدنى للرصيد المطلوب: $${minCapitalRequired.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} تقريبًا.`,
    };
  }

  // 6. Calculate actual risk with floored lots
  const actualShares = lotsNeeded * contractSize;
  const actualRiskAmount = Number((actualShares * riskPerShare).toFixed(2));
  const actualRiskPercent = Number(((actualRiskAmount / capital) * 100).toFixed(2));

  return {
    available: true,
    lotsNeeded,
    actualRiskAmount,
    actualRiskPercent,
    minCapitalRequired,
    message: `حجم الصفقة المقترح: ${lotsNeeded} لوت (مخاطرة فعلية: $${actualRiskAmount.toFixed(2)})`,
  };
}
