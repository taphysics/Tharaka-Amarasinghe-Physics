import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

export function useGlobalConfig() {
  const [globalClasses, setGlobalClasses] = useState<string[]>([]);
  const [classFees, setClassFees] = useState<{ [key: string]: string }>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchConfig = async () => {
      const { data, error } = await supabase.from('site_config').select('class_rates_text').eq('id', 1).maybeSingle();
      if (!error && data?.class_rates_text) {
        const feesMap: { [key: string]: string } = {};
        const classes = data.class_rates_text.split(',').map((item: string) => {
          const parts = item.split(':');
          const className = parts[0].trim();
          const fee = parts[1] ? parts[1].trim() : '0';
          feesMap[className] = fee;
          return className;
        });
        setGlobalClasses(classes);
        setClassFees(feesMap);
      }
      setLoading(false);
    };

    fetchConfig();

    // ඕනෑම තැනක ග්ලෝබල් කන්ෆිග් එක වෙනස් වූ සැනින් Realtime update වීම
    const subscription = supabase
      .channel('global_config_channel')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'site_config' }, () => {
        fetchConfig();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, []);

  return { globalClasses, classFees, loading };
}