import { useEffect, useState, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { subscribeRealtimeEvents, emitRealtimeEvent } from '../realtimeSync';

export function useSupabaseSync<T>(tableName: string, initialData: T[]) {
  // 1. Hydrate initially from localStorage cache if available to prevent empty flashes on refresh
  const [data, setData] = useState<T[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const cacheKey = tableName === 'students' ? 'physics_hub_students' : `cached_${tableName}`;
        const cachedRaw = localStorage.getItem(cacheKey);
        if (cachedRaw) {
          const parsed = JSON.parse(cachedRaw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        }
      } catch (e) {}
    }
    return initialData;
  });

  const lastJsonRef = useRef<string>('');

  useEffect(() => {
    let isMounted = true;

    const fetchData = async () => {
      try {
        const { data: fetchedData, error } = await supabase.from(tableName).select('*');
        if (!isMounted) return;

        if (!error && fetchedData) {
          const camelData = fetchedData.map(item => toCamelCase(item));
          const serialized = JSON.stringify(camelData);

          // Only update React state if data actually changed
          if (serialized !== lastJsonRef.current) {
            lastJsonRef.current = serialized;
            setData(camelData);

            // Keep local backup cache updated
            try {
              const cacheKey = tableName === 'students' ? 'physics_hub_students' : `cached_${tableName}`;
              localStorage.setItem(cacheKey, serialized);
            } catch (e) {}
          }
        }
      } catch (err) {
        // Silently tolerate transient network pauses
      }
    };

    // Initial load
    fetchData();

    // 2. Real-time Live Polling Every 1.5 seconds so all dashboards remain live with the database
    const pollInterval = setInterval(() => {
      // Only poll when page is visible to save battery/bandwidth
      if (typeof document !== 'undefined' && document.hidden) return;
      fetchData();
    }, 1500);

    // 3. Supabase Realtime Postgres Changes Subscription
    const channelName = `realtime:${tableName}:${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: tableName }, () => {
        fetchData();
      })
      .subscribe();

    // 4. Cross-tab BroadcastChannel and CustomEvent Listener
    const unsubRealtime = subscribeRealtimeEvents(() => {
      fetchData();
    });

    // 5. Window Focus / Tab Re-activation Listener
    const handleFocus = () => {
      fetchData();
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);

    return () => {
      isMounted = false;
      clearInterval(pollInterval);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
      unsubRealtime();
      try {
        supabase.removeChannel(channel);
      } catch (e) {}
    };
  }, [tableName]);

  const updateData = async (updater: T[] | ((prev: T[]) => T[])) => {
    setData(prev => {
      const newData = typeof updater === 'function' ? (updater as any)(prev) : updater;
      try {
        const cacheKey = tableName === 'students' ? 'physics_hub_students' : `cached_${tableName}`;
        localStorage.setItem(cacheKey, JSON.stringify(newData));
      } catch (e) {}
      return newData;
    });

    // Schedule realtime notification outside React state updater
    setTimeout(() => {
      emitRealtimeEvent('student_updated');
    }, 0);
  };

  return [data, updateData] as const;
}

export function toCamelCase(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(v => toCamelCase(v));
  } else if (obj !== null && obj.constructor === Object) {
    return Object.keys(obj).reduce(
      (result, key) => ({
        ...result,
        [key.replace(/_([a-z])/g, g => g[1].toUpperCase())]: toCamelCase(obj[key]),
      }),
      {}
    );
  }
  return obj;
}

export function toSnakeCase(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(v => toSnakeCase(v));
  } else if (obj !== null && obj.constructor === Object) {
    return Object.keys(obj).reduce(
      (result, key) => ({
        ...result,
        [key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)]: toSnakeCase(obj[key]),
      }),
      {}
    );
  }
  return obj;
}
