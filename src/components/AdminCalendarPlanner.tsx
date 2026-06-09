import React, { useState, useEffect } from 'react';
import { CalendarDays, Plus, Trash2, AlertCircle } from 'lucide-react';
// 💡 ඔබගේ Supabase client එක import කරන තැනට අදාළව පහත path එක වෙනස් කරගන්න
import { supabase } from '../supabaseClient'; 

const AdminCalendarPlanner = () => {
  const [date, setDate] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('active');
  const [warningMessage, setWarningMessage] = useState('');
  
  // 💡 අලුත් States
  const [availableClassTypes, setAvailableClassTypes] = useState<{name: string, fee: number}[]>([]);
  const [selectedClassType, setSelectedClassType] = useState<string>('');
  
  const [events, setEvents] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    fetchClassTypes();
    fetchEvents();
  }, []);

  // 1. පන්ති වර්ග Database එකෙන් ලබා ගැනීම
  const fetchClassTypes = async () => {
    const { data, error } = await supabase
      .from('class_types_config')
      .select('class_name, monthly_fee')
      .eq('is_active', true);
      
    if (data && !error) {
      setAvailableClassTypes(data.map(c => ({ name: c.class_name, fee: c.monthly_fee })));
    } else {
      console.error("Error fetching class types:", error);
    }
  };

  // පවතින ඉවෙන්ට් ලබා ගැනීම
  const fetchEvents = async () => {
    const { data, error } = await supabase
      .from('calendar_events')
      .select('*')
      .order('date', { ascending: false })
      .limit(20);
    if (data) setEvents(data);
  };

  // 2. අලුත් Event එක Database එකට Save කිරීම
  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClassType) {
      alert("කරුණාකර පන්ති වර්ගයක් තෝරන්න!");
      return;
    }
    
    setIsLoading(true);
    const newEvent = {
      date,
      title,
      description,
      status,
      warning_message: warningMessage,
      class_type: selectedClassType // 💡 අලුත් තීරුවට දත්ත යැවීම
    };

    const { error } = await supabase.from('calendar_events').insert([newEvent]);

    if (!error) {
      alert('Event එක සාර්ථකව එකතු කරන ලදී!');
      setDate(''); setTitle(''); setDescription(''); setWarningMessage(''); setSelectedClassType('');
      fetchEvents();
    } else {
      alert('Error adding event: ' + error.message);
    }
    setIsLoading(false);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("මෙම ඉවෙන්ට් එක මකා දැමීමට අවශ්‍යද?")) {
      await supabase.from('calendar_events').delete().eq('id', id);
      fetchEvents();
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 shadow-2xl max-w-4xl mx-auto">
      <h3 className="text-xl font-bold mb-6 flex items-center gap-2 text-white border-b border-slate-800 pb-3">
        <CalendarDays className="text-purple-400" /> Class Calendar Planner Controls
      </h3>

      <form onSubmit={handleAddEvent} className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8 bg-slate-800/40 p-5 rounded-2xl border border-slate-700/60">
        
        <div className="flex flex-col space-y-2">
          <label className="text-xs text-slate-400">Date (දිනය)</label>
          <input type="date" required value={date} onChange={e => setDate(e.target.value)} className="p-2.5 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white outline-none focus:border-purple-500" />
        </div>

        {/* 💡 අලුතින් එකතු කළ Class Type Dropdown එක */}
        <div className="flex flex-col space-y-2">
          <label className="text-xs text-slate-400">Class Type (පන්ති වර්ගය)</label>
          <select 
            value={selectedClassType}
            onChange={(e) => setSelectedClassType(e.target.value)}
            className="p-2.5 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white focus:border-purple-500 outline-none"
            required
          >
            <option value="" disabled>පන්ති වර්ගය තෝරන්න...</option>
            <option value="General">General (සියලුම සිසුන්ට)</option>
            {availableClassTypes.map((cls, idx) => (
              <option key={idx} value={cls.name}>{cls.name}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col space-y-2">
          <label className="text-xs text-slate-400">Event Title (මාතෘකාව)</label>
          <input type="text" required placeholder="e.g. Special Revision Class" value={title} onChange={e => setTitle(e.target.value)} className="p-2.5 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white outline-none focus:border-purple-500" />
        </div>

        <div className="flex flex-col space-y-2">
          <label className="text-xs text-slate-400">Status (තත්ත්වය)</label>
          <select value={status} onChange={e => setStatus(e.target.value)} className="p-2.5 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white outline-none focus:border-purple-500">
            <option value="active">Active (පැවැත්වේ)</option>
            <option value="cancelled">Cancelled (අවලංගුයි)</option>
            <option value="Makeup_Class">Makeup Class (විකල්ප පන්තියකි)</option>
          </select>
        </div>

        <div className="flex flex-col space-y-2 md:col-span-2">
          <label className="text-xs text-slate-400 flex items-center gap-1"><AlertCircle size={14}/> Warning/Special Message (අත්‍යවශ්‍ය නම් පමණක්)</label>
          <input type="text" placeholder="e.g. Please bring your past paper book..." value={warningMessage} onChange={e => setWarningMessage(e.target.value)} className="p-2.5 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white outline-none focus:border-orange-500" />
        </div>

        <div className="md:col-span-2 mt-2">
          <button type="submit" disabled={isLoading} className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 rounded-xl transition flex justify-center items-center gap-2">
            {isLoading ? 'Saving...' : <><Plus size={18} /> Add to Calendar</>}
          </button>
        </div>
      </form>

      {/* මෑතකදී දාපු Events ටික පෙන්වීම */}
      <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
        {events.map((ev, i) => (
          <div key={i} className="flex items-center justify-between p-3 bg-slate-950/50 border border-slate-800 rounded-xl">
            <div>
              <span className="text-[10px] bg-slate-800 text-blue-400 px-2 py-0.5 rounded border border-slate-700 mr-2">{ev.class_type || 'General'}</span>
              <span className={`text-[10px] px-2 py-0.5 rounded uppercase font-bold mr-2 ${ev.status === 'active' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>{ev.status}</span>
              <span className="text-sm font-bold text-white">{ev.title}</span>
              <p className="text-xs text-slate-400 mt-1">📅 {ev.date}</p>
            </div>
            <button onClick={() => handleDelete(ev.id)} className="p-2 bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white rounded-lg transition">
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminCalendarPlanner;