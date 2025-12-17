import { createClient } from '@supabase/supabase-js';

// Safe access to environment variables
const env = (import.meta as any).env || {};
const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseKey = env.VITE_SUPABASE_ANON_KEY;

const supabase = (supabaseUrl && supabaseKey) 
  ? createClient(supabaseUrl, supabaseKey) 
  : null;

export const logConnectionToSupabase = async () => {
    if (!supabase) return;

    // 1. Защита от спама (1 час)
    const lastLog = localStorage.getItem('last_supabase_log');
    const now = Date.now();
    if (lastLog && (now - Number(lastLog) < 3600000)) return;

    let userId = localStorage.getItem('app_user_id');
    if (!userId) {
        userId = crypto.randomUUID();
        localStorage.setItem('app_user_id', userId);
    }

    // 2. СБОР ДАННЫХ (Умный алгоритм)
    let ip = 'unknown';
    let location = 'unknown';
    let provider = '';

    try {
        // --- ПОПЫТКА №1: ipwhois.app (Отлично работает с РФ) ---
        // Используем этот сервис как основной. Он дает город, страну и провайдера.
        const response = await fetch('https://ipwhois.app/json/');
        
        if (response.ok) {
            const data = await response.json();
            
            if (data.success) {
                ip = data.ip;
                // Собираем строку: "Yekaterinburg, Russia (Rostelecom)"
                location = `${data.city || ''}, ${data.country || ''}`;
                provider = data.isp || ''; // Провайдер интернета
            } else {
                throw new Error('IPWhois failed');
            }
        } else {
            throw new Error('Network error');
        }

    } catch (e) {
        console.warn('Primary IP check failed, trying backup...', e);
        
        // --- ПОПЫТКА №2: geojs.io (Запасной вариант, очень надежный) ---
        try {
            const res2 = await fetch('https://get.geojs.io/v1/ip/geo.json');
            const data2 = await res2.json();
            ip = data2.ip;
            location = `${data2.city}, ${data2.country}`;
            provider = data2.organization_name || '';
        } catch (e2) {
            console.error('All IP services failed');
        }
    }

    // Формируем красивую строку локации с провайдером
    const fullLocation = provider ? `${location} (${provider})` : location;
    
    const screenInfo = `${window.screen.width}x${window.screen.height}`;
    const referrer = document.referrer || 'direct';

    // 3. ОТПРАВКА В СУПАБЕЙЗ
    try {
        await supabase.from('access_logs').insert({
            user_uuid: userId,
            device_info: navigator.userAgent,
            app_version: '1.0.0',
            ip: ip,
            location: fullLocation, // Запишем сюда "City, Country (Provider)"
            screen: screenInfo,
            referrer: referrer
        });
        localStorage.setItem('last_supabase_log', now.toString());
    } catch (e) {
        console.error('Supabase error', e);
    }
};
