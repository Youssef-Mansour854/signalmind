/**
 * Signal Execution & Entry Tolerance Engine
 * Defines entry tolerance (slippage buffer) parameters and checks execution triggers for BUY and SELL limit orders.
 */

export const ENTRY_TOLERANCE_PCT = 0.003; // 0.3% buffer

export interface EntryCheckResult {
  shouldExecute: boolean;
  actualEntryPrice: number;
  acceptableLimitPrice: number;
}

/**
 * Checks if a pending or active signal entry condition is triggered using Entry Tolerance (0.3% slippage buffer).
 * 
 * @param signalType 'BUY' or 'SELL'
 * @param signalEntryPrice Target entry limit price
 * @param currentLivePrice Real-time market price
 * @returns EntryCheckResult with execution status and real execution price
 */
export function checkEntryTrigger(
  signalType: 'BUY' | 'SELL' | string,
  signalEntryPrice: number,
  currentLivePrice: number
): EntryCheckResult {
  if (signalType === 'BUY') {
    const acceptableEntryMax = signalEntryPrice * (1 + ENTRY_TOLERANCE_PCT);
    const shouldExecute = currentLivePrice <= acceptableEntryMax;
    return {
      shouldExecute,
      actualEntryPrice: currentLivePrice, // Real execution price saved in MongoDB, NOT original signalEntryPrice
      acceptableLimitPrice: Number(acceptableEntryMax.toFixed(4))
    };
  } else if (signalType === 'SELL') {
    const acceptableEntryMin = signalEntryPrice * (1 - ENTRY_TOLERANCE_PCT);
    const shouldExecute = currentLivePrice >= acceptableEntryMin;
    return {
      shouldExecute,
      actualEntryPrice: currentLivePrice, // Real execution price
      acceptableLimitPrice: Number(acceptableEntryMin.toFixed(4))
    };
  }

  return {
    shouldExecute: false,
    actualEntryPrice: currentLivePrice,
    acceptableLimitPrice: signalEntryPrice
  };
}
