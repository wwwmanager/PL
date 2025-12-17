

import { GoogleGenAI, Type } from '@google/genai';
import { Route, Waybill } from '../types';
import { generateId } from './mockApi';

const getEnhancedErrorMessage = (error: unknown): string => {
    if (error instanceof Error) {
        const errorMessage = error.message.toLowerCase();
        if (errorMessage.includes('api key not valid')) {
            return 'Ключ API недействителен. Пожалуйста, убедитесь, что вы правильно настроили ключ API в переменных окружения.';
        }
        if (errorMessage.includes('permission_denied') || errorMessage.includes('region not supported')) {
            return 'Функция ИИ недоступна в вашем регионе. Пожалуйста, попробуйте позже или используйте VPN.';
        }
        return `Произошла ошибка API: ${error.message}`;
    }
    return 'Произошла неизвестная ошибка при обращении к сервису ИИ.';
};

/**
 * Performs a quick check to see if the Gemini API is available and configured.
 * @returns {Promise<boolean>} - True if the API is available, false otherwise.
 */
export const checkAIAvailability = async (): Promise<boolean> => {
    // Temporarily disabled due to quota issues. This will hide AI features in the UI.
    return Promise.resolve(false);

    /*
    if (!process.env.API_KEY) {
        console.warn("AI check failed: API_KEY environment variable not set.");
        return false;
    }
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    try {
        // Use a very lightweight model and prompt for a quick, cheap check.
        await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: 'ping',
            config: {
                thinkingConfig: { thinkingBudget: 0 } 
            }
        });
        return true;
    } catch (error) {
        console.error("AI availability check failed:", error);
        return false;
    }
    */
};


export const generateRouteFromPrompt = async (prompt: string): Promise<Route[]> => {
  if (!process.env.API_KEY) {
    throw new Error("API_KEY environment variable not set.");
  }
  
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-pro",
      contents: `Based on the following user request, generate a structured list of routes. Each route must have a 'from' location, a 'to' location, and an estimated 'distanceKm' as a number.
      User request: "${prompt}"
      `,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              from: {
                type: Type.STRING,
                description: 'The starting point of the route segment.',
              },
              to: {
                type: Type.STRING,
                description: 'The ending point of the route segment.',
              },
              distanceKm: {
                type: Type.NUMBER,
                description: 'The estimated distance in kilometers for this segment.',
              },
            },
            required: ["from", "to", "distanceKm"],
          },
        },
        thinkingConfig: { thinkingBudget: 32768 },
      },
    });

    const jsonText = response.text.trim();
    const generatedRoutes = JSON.parse(jsonText);
    
    // Add temporary string IDs for UI keys
    return generatedRoutes.map((route: Omit<Route, 'id'>) => ({
        ...route,
        id: generateId(),
    }));

  } catch (error) {
    console.error("Error calling Gemini API:", error);
    throw new Error(getEnhancedErrorMessage(error));
  }
};

export const analyzeImage = async (base64Image: string, mimeType: string): Promise<string> => {
    if (!process.env.API_KEY) {
        throw new Error("API_KEY environment variable not set.");
    }
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    try {
        const imagePart = {
            inlineData: {
                data: base64Image,
                mimeType,
            },
        };
        const textPart = {
            text: "Describe what you see in this image in Russian."
        };

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: { parts: [imagePart, textPart] },
        });

        return response.text;
    } catch (error) {
        console.error("Error analyzing image with Gemini:", error);
        throw new Error(getEnhancedErrorMessage(error));
    }
};

export const summarizeWaybill = async (waybill: Partial<Waybill>): Promise<string> => {
    if (!process.env.API_KEY) {
        throw new Error("API_KEY environment variable not set.");
    }
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const prompt = `Create a brief summary in Russian for the following waybill data. Be concise and clear.
    Data: ${JSON.stringify(waybill, null, 2)}
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
        });
        return response.text;
    } catch (error) {
        console.error("Error summarizing waybill with Gemini:", error);
        throw new Error(getEnhancedErrorMessage(error));
    }
};
