// Cross-tab and in-memory Realtime Synchronization Hub for Smart Physics
export type SyncEventType = 
  | 'pending_payment_submitted'
  | 'pending_payment_deleted'
  | 'payment_approved'
  | 'payment_rejected'
  | 'payment_status_changed'
  | 'payments_updated'
  | 'recording_added'
  | 'recording_deleted'
  | 'tute_added'
  | 'tute_deleted'
  | 'student_updated'
  | 'calendar_updated'
  | 'announcement_added'
  | 'reminder_sent'
  | 'bank_accounts_updated'
  | 'class_types_updated'
  | 'banner_page_viewed'
  | 'banner_page_updated'
  | 'exam_submitted'
  | 'exam_created'
  | 'assignment_marks_updated'
  | 'staff_updated'
  | 'device_force_logout'
  | 'device_violation_updated';

interface RealtimeMessage {
  type: SyncEventType;
  payload: any;
  timestamp: number;
  senderId: string;
}

const CHANNEL_NAME = 'smart_physics_realtime_hub';
const instanceId = `client_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

let broadcastChannel: BroadcastChannel | null = null;
try {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    broadcastChannel = new BroadcastChannel(CHANNEL_NAME);
  }
} catch (e) {
  console.warn('BroadcastChannel not supported in this environment');
}

export function emitRealtimeEvent(type: SyncEventType, payload?: any) {
  const msg: RealtimeMessage = {
    type,
    payload,
    timestamp: Date.now(),
    senderId: instanceId
  };

  // 1. Post to BroadcastChannel (for other tabs / windows)
  if (broadcastChannel) {
    try {
      broadcastChannel.postMessage(msg);
    } catch (e) {
      console.warn('BroadcastChannel post error:', e);
    }
  }

  // 2. Dispatch CustomEvent on current window asynchronously to never interrupt React rendering cycles
  if (typeof window !== 'undefined') {
    setTimeout(() => {
      try {
        window.dispatchEvent(new CustomEvent('smart_physics_sync', { detail: msg }));
      } catch (e) {}
    }, 0);
    
    // 3. Update localStorage heartbeat to wake up other tabs listening on storage events
    try {
      localStorage.setItem('smart_physics_last_event', JSON.stringify(msg));
    } catch (e) {}
  }
}

export const broadcastRealtimeEvent = emitRealtimeEvent;

export function subscribeRealtimeEvents(callback: (type: SyncEventType, payload: any) => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const handleCustomEvent = (e: Event) => {
    const custom = e as CustomEvent<RealtimeMessage>;
    if (custom.detail) {
      callback(custom.detail.type, custom.detail.payload);
    }
  };

  const handleBroadcastMessage = (event: MessageEvent<RealtimeMessage>) => {
    if (event.data && event.data.senderId !== instanceId) {
      callback(event.data.type, event.data.payload);
    }
  };

  const handleStorageEvent = (e: StorageEvent) => {
    if (e.key === 'smart_physics_last_event' && e.newValue) {
      try {
        const msg = JSON.parse(e.newValue) as RealtimeMessage;
        if (msg.senderId !== instanceId) {
          callback(msg.type, msg.payload);
        }
      } catch (err) {}
    }
  };

  window.addEventListener('smart_physics_sync', handleCustomEvent);
  window.addEventListener('storage', handleStorageEvent);
  if (broadcastChannel) {
    broadcastChannel.addEventListener('message', handleBroadcastMessage);
  }

  return () => {
    window.removeEventListener('smart_physics_sync', handleCustomEvent);
    window.removeEventListener('storage', handleStorageEvent);
    if (broadcastChannel) {
      broadcastChannel.removeEventListener('message', handleBroadcastMessage);
    }
  };
}
