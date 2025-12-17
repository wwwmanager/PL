// services/bus.ts
type Topic =
  | 'waybills'
  | 'employees'
  | 'vehicles'
  | 'organizations'
  | 'blanks'
  | 'stock'
  | 'settings'
  | 'audit'
  | 'policies';

type Handler = (msg: { topic: Topic; payload?: unknown; ts: number }) => void;

let channel: BroadcastChannel | null = null;
const handlers = new Set<Handler>();

function getBus() {
  if (!channel) {
    channel = new BroadcastChannel('new-waybill-db');
    channel.onmessage = (e) => {
      handlers.forEach(h => h(e.data));
    };
  }
  return channel;
}

export function broadcast(topic: Topic, payload?: unknown) {
  try {
    getBus().postMessage({ topic, payload, ts: Date.now() });
  } catch {}
}

export function subscribe(handler: Handler): () => void {
  getBus(); // ensure channel is created
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
}