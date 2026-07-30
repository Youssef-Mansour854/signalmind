export async function sendTelegramSignalAlert(signals: any[], timeframe: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.warn('[TELEGRAM] Bot token or Chat ID is missing. Skipping notification.');
    return;
  }

  if (!signals || signals.length === 0) return;

  const tfLabelMap: Record<string, string> = {
    'DAY_TRADE': 'يومي ⚡',
    'SWING': 'أسبوعي 📅',
    'MONTHLY': 'شهري 🌙',
    'YEARLY': 'استثمار سنوي 🏢'
  };

  const tfLabel = tfLabelMap[timeframe] || timeframe;
  const now = new Date().toLocaleTimeString('en-US', { hour12: true, timeZone: 'Africa/Cairo' });

  let message = `🎯 <b>SignalMind Top Opportunities</b> 🚀\n`;
  message += `⏱ <b>Timeframe:</b> ${tfLabel}\n`;
  message += `🕒 <b>Time:</b> ${now} (Cairo Time)\n`;
  message += `------------------------------------\n\n`;

  signals.forEach((s, idx) => {
    const symbol = s.symbol || s.ticker || 'N/A';
    const score = s.scoreMetrics?.totalScore || s.totalScore || s.score || 'N/A';
    const signalType = s.signalType || 'BUY';
    const entry = s.actualEntryPrice || s.entryPrice || 0;
    const tp = s.takeProfit || 0;
    const sl = s.stopLoss || 0;

    message += `#${idx + 1} <b>${symbol}</b> - 🟢 ${signalType}\n`;
    message += `📊 <b>Score:</b> ${score}/100\n`;
    message += `💰 <b>Entry:</b> $${typeof entry === 'number' ? entry.toFixed(2) : entry}\n`;
    message += `🎯 <b>Target (TP):</b> $${typeof tp === 'number' ? tp.toFixed(2) : tp}\n`;
    message += `🛡 <b>Stop Loss (SL):</b> $${typeof sl === 'number' ? sl.toFixed(2) : sl}\n\n`;
  });

  message += `------------------------------------\n`;
  message += `⚠️ <i>توصيات آليّة للأغراض التعليمية وليست نصيحة مالية.</i>`;

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML'
      })
    });
    console.log('[TELEGRAM] Alert sent successfully.');
  } catch (err) {
    console.error('[TELEGRAM ERROR]', err);
  }
}
