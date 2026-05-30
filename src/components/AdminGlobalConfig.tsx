import React, { useState, useEffect } from 'react';
import { Settings, Plus, Trash2, Save, Database } from 'lucide-react';
import { useSupabaseConfig } from '../hooks/useSupabaseConfig';

interface GlobalClass {
  id: string;
  name: string;
  fee: number;
}

export default function AdminGlobalConfig() {
  const [config, updateConfig] = useSupabaseConfig();
  const [classes, setClasses] = useState<GlobalClass[]>([]);
  const [newClassName, setNewClassName] = useState('');
  const [newClassFee, setNewClassFee] = useState('');
  const [attentionInterval, setAttentionInterval] = useState('45'); // Minutes

  useEffect(() => {
    if (config?.classRatesText) {
      try {
        const parsed = JSON.parse(config.classRatesText);
        if (parsed.classes && Array.isArray(parsed.classes)) setClasses(parsed.classes);
        if (parsed.attentionInterval) setAttentionInterval(parsed.attentionInterval);
      } catch (e) {
        // Fallbacks if not JSON
        setClasses([
          { id: '1', name: '2026 Theory', fee: 3500 },
          { id: '2', name: '2026 Revision', fee: 3500 },
          { id: '3', name: '2027 Theory', fee: 3000 },
          { id: '4', name: '2027 Revision', fee: 3000 },
          { id: '5', name: '2028 Theory', fee: 2500 }
        ]);
      }
    } else if (config) {
         setClasses([
          { id: '1', name: '2026 Theory', fee: 3500 },
          { id: '2', name: '2026 Revision', fee: 3500 },
          { id: '3', name: '2027 Theory', fee: 3000 },
          { id: '4', name: '2027 Revision', fee: 3000 },
          { id: '5', name: '2028 Theory', fee: 2500 }
        ]);
    }
  }, [config]);

  const handleAddClass = () => {
    if (!newClassName || !newClassFee) return;
    const newCls: GlobalClass = {
      id: Date.now().toString(),
      name: newClassName.trim(),
      fee: Number(newClassFee)
    };
    setClasses([...classes, newCls]);
    setNewClassName('');
    setNewClassFee('');
  };

  const handleDeleteClass = (id: string) => {
    setClasses(classes.filter(c => c.id !== id));
  };

  const handleSave = async () => {
    const payload = JSON.stringify({
      classes,
      attentionInterval
    });
    await updateConfig({ classRatesText: payload });
    alert('Config Saved Globally!');
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-800/40 p-4 rounded-2xl border border-slate-700/50 flex justify-between items-center">
        <h3 className="font-bold text-white text-lg flex items-center gap-2">
          <Settings size={20} className="text-blue-500" /> Global Site Config
        </h3>
        <button onClick={handleSave} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition">
          <Save size={16} /> Save Changes
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Classes Manager */}
        <div className="bg-slate-900/60 p-6 rounded-2xl border border-slate-700">
          <h4 className="font-bold text-amber-400 mb-4 flex items-center gap-2">
            Class Types & Fees Manager
          </h4>
          <p className="text-xs text-slate-400 mb-4">
             මෙම පන්ති වර්ග මුළු වෙබ් අඩවිය පුරාම (Registration etc.) භාවිතා වේ.
          </p>

          <div className="flex gap-2 mb-4">
             <input 
               type="text"
               placeholder="e.g. 2029 Theory"
               value={newClassName}
               onChange={(e) => setNewClassName(e.target.value)}
               className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
             />
             <input 
               type="number"
               placeholder="Fee (LKR)"
               value={newClassFee}
               onChange={(e) => setNewClassFee(e.target.value)}
               className="w-24 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
             />
             <button onClick={handleAddClass} className="bg-amber-600 hover:bg-amber-500 text-white px-3 rounded-lg flex items-center justify-center transition">
               <Plus size={18} />
             </button>
          </div>

          <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
            {(classes || []).map(c => (
              <div key={c.id} className="flex justify-between items-center bg-slate-800/40 p-3 rounded-xl border border-slate-700/50">
                 <div>
                   <div className="font-bold text-slate-200 text-sm">{c.name}</div>
                   <div className="text-amber-500/80 text-xs font-mono">Rs. {c.fee}.00</div>
                 </div>
                 <button onClick={() => handleDeleteClass(c.id)} className="text-red-500 hover:bg-red-500/20 p-2 rounded-lg transition">
                   <Trash2 size={16} />
                 </button>
              </div>
            ))}
            {classes.length === 0 && <div className="text-center text-slate-500 py-4 text-xs">No classes added yet.</div>}
          </div>
        </div>

        {/* Global Settings */}
        <div className="bg-slate-900/60 p-6 rounded-2xl border border-slate-700">
           <h4 className="font-bold text-sky-400 mb-4">System Settings</h4>
           
           <div className="space-y-4">
              <div className="space-y-2">
                 <label className="text-sm text-slate-300 font-bold">Attention Check Interval (Minutes)</label>
                 <p className="text-[10px] text-slate-400">ලයිව් සහ පටිගත කළ වීඩියෝවලදී සිසුන්ගේ අවධානය බැලීම සඳහා Popup එක එන කාල පරතරය.</p>
                 <select 
                   value={attentionInterval}
                   onChange={(e) => setAttentionInterval(e.target.value)}
                   className="w-full bg-slate-950 border border-slate-800 text-white rounded-lg px-4 py-2 focus:border-sky-500 focus:outline-none"
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

        {/* Missing component mounted here */}
        <div className="lg:col-span-2 hidden">
        </div>

      </div>
    </div>
  );
}
