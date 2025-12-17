
export const generateId = (): string => Math.random().toString(36).substr(2, 9);

export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function simulateNetwork<T>(data: T, ms = 300): Promise<T> {
  await delay(ms);
  return data;
}
