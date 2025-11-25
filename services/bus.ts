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
  const msg = { topic, payload, ts: Date.now() };
  try {
    getBus().postMessage(msg);
  } catch {}

  // FIX: BroadcastChannel does not fire events in the tab that sent the message.
  // We must manually trigger local handlers to update the UI in the current tab immediately.
  handlers.forEach(h => h(msg));
}

export function subscribe(handler: Handler): () => void {
  getBus(); // ensure channel is created
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
}