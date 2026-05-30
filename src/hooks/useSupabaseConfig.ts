import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { toSnakeCase } from './useSupabaseSync'; // Assuming toSnakeCase is exported from useSupabaseSync

export function useSupabaseConfig() {
  const [config, setConfig] = useState<any>(null);

  useEffect(() => {
    const fetchConfig = async () => {
      const { data, error } = await supabase.from('site_config').select('*').eq('id', 1).single();
      if (!error && data) {
        setConfig(toCamelCase(data));
      }
    };
    fetchConfig();

    const channelName = `public:site_config:${Math.random()}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'site_config' }, payload => {
        if (payload.new) {
          setConfig(toCamelCase(payload.new));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const updateConfig = async (newConfigAction: any) => {
    const newConfig = typeof newConfigAction === 'function' ? newConfigAction(config) : newConfigAction;
    const snakeData = toSnakeCase(newConfig);
    const { error } = await supabase.from('site_config').upsert({ id: 1, ...snakeData });
    if (error) {
       console.error("Failed to update config", error);
    }
  };

  return [config, updateConfig] as const;
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
