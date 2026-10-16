import { useStore } from '../store/useStore';
import type { WsEnvelope } from './types';

let socket: WebSocket | null = null;
let reconnectTimer: any = null;
let reconnectDelay = 1000;
const MAX_RECONNECT_DELAY = 10000;

export function connectWebSocket() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  const wsUrl = `${protocol}//${host}/ws`;

  useStore.getState().setConnStatus('connecting');

  try {
    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      reconnectDelay = 1000;
      useStore.getState().setConnStatus('connected');
      useStore.getState().fetchState();
    };

    socket.onmessage = (event) => {
      try {
        const envelope: WsEnvelope = JSON.parse(event.data);
        useStore.getState().handleWsMessage(envelope);
      } catch (err) {
        console.error('Failed to parse WebSocket message', err);
      }
    };

    socket.onclose = () => {
      useStore.getState().setConnStatus('reconnecting');
      scheduleReconnect();
    };

    socket.onerror = (err) => {
      console.warn('WebSocket error', err);
      socket?.close();
    };
  } catch (err) {
    console.error('Failed to create WebSocket', err);
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return;

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    reconnectDelay = Math.min(reconnectDelay * 1.5, MAX_RECONNECT_DELAY);
    connectWebSocket();
  }, reconnectDelay);
}

export function disconnectWebSocket() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (socket) {
    socket.close();
    socket = null;
  }
}
