import { isSafeToTrade, TradingGuardResult } from '@/utils/tradingGuard';

/**
 * Signal Execution & Entry Tolerance Engine
 * Defines entry tolerance (slippage buffer) parameters and integrates Red Folder News Radar Trading Guard.
 */

export const ENTRY_TOLERANCE_PCT = 0.003; // 0.3% buffer

export interface EntryCheckResult {
  shouldExecute: boolean;
  actualEntryPrice: number;
  acceptableLimitPrice: number;
  blockReason?: string;
  guardResult?: TradingGuardResult;
}

/**
 * Checks if a pending or active signal entry condition is triggered using Entry Tolerance (0.3% slippage buffer).
 * Synchronous core calculation.
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

/**
 * Evaluates position execution by first running the Red Folder News Radar Trading Guard.
 * If news radar returns safe === false, execution is strictly BLOCKED for this cycle.
 */
export async function evaluateExecutionTrigger(
  signalType: 'BUY' | 'SELL' | string,
  signalEntryPrice: number,
  currentLivePrice: number
): Promise<EntryCheckResult> {
  // 1. Run Red Folder News Radar Trading Guard check
  const guard = await isSafeToTrade();
  if (!guard.safe) {
    console.warn(`[EXECUTION ENGINE GUARD BLOCK] Execution skipped: ${guard.reason} (${guard.eventTitle})`);
    return {
      shouldExecute: false,
      actualEntryPrice: currentLivePrice,
      acceptableLimitPrice: signalEntryPrice,
      blockReason: guard.reason,
      guardResult: guard
    };
  }

  // 2. Run Slippage Buffer / Entry Tolerance calculation if safe
  return checkEntryTrigger(signalType, signalEntryPrice, currentLivePrice);
}
