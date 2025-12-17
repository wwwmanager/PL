
export const trackVisit = async () => {
  // Безопасное получение env, чтобы избежать ошибки "Cannot read properties of undefined"
  const env = (import.meta as any).env || {};
  const BOT_TOKEN = env.VITE_TELEGRAM_BOT_TOKEN;
  const CHAT_ID = env.VITE_TELEGRAM_CHAT_ID;
  
  if (!BOT_TOKEN || !CHAT_ID) {
    return;
  }

  const STORAGE_KEY_LAST_VISIT = 'last_visit_timestamp';
  const STORAGE_KEY_USER_ID = 'app_user_id';

  const getUserId = (): string => {
    let userId = localStorage.getItem(STORAGE_KEY_USER_ID);
    if (!userId) {
      userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem(STORAGE_KEY_USER_ID, userId);
    }
    return userId;
  };

  const now = Date.now();
  const lastVisit = localStorage.getItem(STORAGE_KEY_LAST_VISIT);
  
  // 1 час задержки (3600000 мс) для предотвращения спама при перезагрузке
  if (lastVisit && now - parseInt(lastVisit, 10) < 3600000) {
    return;
  }

  const userId = getUserId();
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown';
  const screenRes = typeof window !== 'undefined' ? `${window.screen.width}x${window.screen.height}` : 'unknown';
  
  const message = `
🚀 *New Visit*
👤 User: \`${userId}\`
📱 Device: ${userAgent}
🖥 Screen: ${screenRes}
⏰ Time: ${new Date().toLocaleString('ru-RU')}
`.trim();

  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: message,
        parse_mode: 'Markdown',
      }),
    });
    
    localStorage.setItem(STORAGE_KEY_LAST_VISIT, now.toString());
  } catch (error) {
    console.error('Tracking error:', error);
  }
};
