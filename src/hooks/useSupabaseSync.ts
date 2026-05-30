import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

export function useSupabaseSync<T>(tableName: string, initialData: T[]) {
  const [data, setData] = useState<T[]>(initialData);

  useEffect(() => {
    // Initial fetch
    const fetchData = async () => {
      const { data: fetchedData, error } = await supabase.from(tableName).select('*');
      if (!error && fetchedData) {
        const camelData = fetchedData.map(item => toCamelCase(item));
        setData(camelData);
      }
    };
    fetchData();

    // Subscribe to changes
    const channelName = `public:${tableName}:${Math.random()}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: tableName }, payload => {
        fetchData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tableName]);

  const updateData = async (updater: T[] | ((prev: T[]) => T[])) => {
    setData(prev => {
      const newData = typeof updater === 'function' ? (updater as any)(prev) : updater;
      
      // Attempt to intelligently sync to Supabase (WARNING: This is a simplistic approach for demo)
      // Ideally you should have dedicated functions like addStudent, removeStudent
      const syncToDb = async () => {
        // Full table replacement strategy is dangerous but ensures sync for this basic hook
        // For production, diffing should be used.
        // We will just do a basic sync for additions if not using explicit RLS 
        // For now, this just updates UI, and real CRUD should be done via explicit API calls
      };
      
      return newData;
    });
  };

  return [data, updateData] as const;
}

function toCamelCase(obj: any): any {
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
