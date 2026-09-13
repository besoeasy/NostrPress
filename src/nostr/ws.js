import dns from "node:dns";
try {
  dns.setDefaultResultOrder("ipv4first");
} catch {}

import WebSocket from "ws";
import { useWebSocketImplementation as usePoolWs } from "nostr-tools/pool";
import { useWebSocketImplementation as useRelayWs } from "nostr-tools/relay";

// SafeWebSocket wraps 'ws' to prevent two critical issues in Node.js:
// 1. In Node 22, the built-in undici WebSocket triggers an infinite recursion in ws.onerror
//    when any relay connection fails ("RangeError: Maximum call stack size exceeded").
// 2. In nostr-tools, when a relay connection times out, it calls ws.close() and then immediately
//    clears ws.onerror = null. The 'ws' library emits an 'error' event on nextTick when closed
//    during CONNECTING state. If ws.onerror was cleared, Node's EventEmitter throws an
//    unhandled 'error' event and crashes. Adding a permanent no-op 'error' listener prevents this.
class SafeWebSocket extends WebSocket {
  constructor(...args) {
    super(...args);
    this.on("error", () => {
      // Safe no-op fallback to absorb unhandled EventEmitter error events
    });
  }
}

usePoolWs(SafeWebSocket);
useRelayWs(SafeWebSocket);
globalThis.WebSocket = SafeWebSocket;

export { SafeWebSocket as WebSocket };
