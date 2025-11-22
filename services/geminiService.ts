import { Route, Waybill } from "../types";
import { generateId } from "./mockApi";
import { GoogleGenerativeAI } from "@google/generative-ai";

// FIX: Safely access environment variables.
const getApiKey = (): string | undefined => {
  try {
     // @ts-ignore
     if (typeof process !== 'undefined' && process.env?.API_KEY) {
       // @ts-ignore
       return process.env.API_KEY;
     }
  } catch {}
  try {
    return (import.meta as any).env?.VITE_GEMINI_API_KEY;
  } catch {}
  return undefined;
}

const API_KEY = getApiKey();

// Инициализируем клиент, только если ключ предоставлен
const genAI = API_KEY ? new GoogleGenerativeAI(API_KEY) : null;

const SIMULATED_DELAY = 600; // мс

// 1. Проверка доступности ИИ
// Возвращаем true, если клиент инициализирован
export const checkAIAvailability = async (): Promise<boolean> => {
  return !!genAI;
};

// 2. Генерация маршрутов из запроса
export const generateRouteFromPrompt = async (
  prompt: string
): Promise<Route[]> => {
  if (!genAI) {
    throw new Error("AI API ключ не найден. Проверьте VITE_GEMINI_API_KEY в .env файле.");
  }

  try {
    // Используем модель flash для скорости и экономии
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    
    const systemPrompt = `
      Ты помощник логиста. Твоя задача - преобразовать текстовое описание маршрута в структурированный JSON.
      Текущая дата: ${new Date().toLocaleDateString()}.
      
      Описание маршрута: "${prompt}"
      
      Верни строго валидный JSON массив объектов Route. Не используй markdown блоки (как \`\`\`json).
      Формат объекта:
      {
        "from": "string (адрес отправления)",
        "to": "string (адрес назначения)",
        "distanceKm": number (оцени расстояние, если не указано)
      }
    `;

    const result = await model.generateContent(systemPrompt);
    const response = await result.response;
    const text = response.text();
    
    // Очистка от markdown, если модель всё же его добавила
    const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
    
    const parsed = JSON.parse(jsonStr);
    
    if (!Array.isArray(parsed)) {
      throw new Error("Ответ AI не является массивом");
    }

    return parsed.map((r: any) => ({
        id: generateId(),
        from: r.from || 'Неизвестно',
        to: r.to || 'Неизвестно',
        distanceKm: Number(r.distanceKm) || 0,
        isCityDriving: false,
        isWarming: false
    }));

  } catch (error) {
    console.error("Gemini Error:", error);
    throw new Error("Ошибка генерации маршрута через AI. Проверьте консоль или попробуйте позже.");
  }
};

// 3. Анализ изображения
export const analyzeImage = async (
  base64Image: string,
  mimeType: string
): Promise<string> => {
  if (!genAI) return "AI недоступен";
  // Заглушка пока не реализована UI часть для отправки изображений в промпт
  await new Promise(resolve => setTimeout(resolve, SIMULATED_DELAY));
  return "Анализ изображений: Данная опция в разработке";
};

// 4. Краткое резюме по путевому листу
export const summarizeWaybill = async (
  waybill: Partial<Waybill>
): Promise<string> => {
  if (!genAI) return "AI недоступен";
  await new Promise(resolve => setTimeout(resolve, SIMULATED_DELAY));
  return "Резюме: Данная опция в разработке";
};