import React, { useState, useEffect } from 'react';
import { Settings, Save } from 'lucide-react';
import { useSupabaseConfig } from '../hooks/useSupabaseConfig';

export default function AdminGlobalConfig() {
  const [config, updateConfig] = useSupabaseConfig();
  const [attentionInterval, setAttentionInterval] = useState('45'); // Minutes

  useEffect(() => {
    if (config?.classRatesText) {
      try {
        const parsed = JSON.parse(config.classRatesText);
        // කලින් තිබුණු classes load කරන කොටස ඉවත් කර ඇත.
        if (parsed.attentionInterval) setAttentionInterval(parsed.attentionInterval);
      } catch (e) {
        console.error("Config parse error", e);
      }
    }
  }, [config]);

  const handleSave = async () => {
    // කලින් තිබුණු classes කොටස ඉවත් කර ඇත.
    const payload = JSON.stringify({
      attentionInterval
    });
    await updateConfig({ classRatesText: payload });
    alert('System Settings Saved Globally!');
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-800/40 p-4 rounded-2xl border border-slate-700/50 flex justify-between items-center">
        <h3 className="font-bold text-white text-lg flex items-center gap-2">
          <Settings size={20} className="text-blue-500" /> Global System Settings
        </h3>
        <button onClick={handleSave} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition">
          <Save size={16} /> Save Changes
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {/* Global Settings පමණක් ඉතිරි කර ඇත */}
        <div className="bg-slate-900/60 p-6 rounded-2xl border border-slate-700">
           <h4 className="font-bold text-sky-400 mb-4">System Settings</h4>
           
           <div className="space-y-4">
              <div className="space-y-2">
                 <label className="text-sm text-slate-300 font-bold">Attention Check Interval (Minutes)</label>
                 <p className="text-[10px] text-slate-400">ලයිව් සහ පටිගත කළ වීඩියෝවලදී සිසුන්ගේ අවධානය බැලීම සඳහා Popup එක එන කාල පරතරය.</p>
                 <select 
                   value={attentionInterval}
                   onChange={(e) => setAttentionInterval(e.target.value)}
                   className="w-full lg:w-1/2 bg-slate-950 border border-slate-800 text-white rounded-lg px-4 py-2 focus:border-sky-500 focus:outline-none block"
                 >
                   <option value="5">Every 5 Minutes</option>
                   <option value="15">Every 15 Minutes</option>
                   <option value="30">Every 30 Minutes</option>
                   <option value="45">Every 45 Minutes</option>
                   <option value="60">Every 60 Minutes</option>
                 </select>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
}