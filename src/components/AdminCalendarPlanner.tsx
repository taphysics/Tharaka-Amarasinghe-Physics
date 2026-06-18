import React, { useState, useEffect } from 'react';
import { CalendarDays, Plus, Trash2, AlertCircle } from 'lucide-react';
// 💡 ඔබගේ Supabase client එක import කරන ස්ථානය නිවැරදිදැයි බලන්න
import { supabase } from '../supabaseClient'; 

const AdminCalendarPlanner = () => {
  const [date, setDate] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('active');
  const [warningMessage, setWarningMessage] = useState('');
  
  const [availableClassTypes, setAvailableClassTypes] = useState<{name: string, fee: number}[]>([]);
  const [selectedClassType, setSelectedClassType] = useState<string>('');
  
  const [events, setEvents] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    fetchClassTypes();
    fetchEvents();
  }, []);

  // 1. පන්ති වර්ග සියල්ලම Database එකෙන් ලබා ගැනීම (Filter ඉවත් කර ඇත)
  const fetchClassTypes = async () => {
    const { data, error } = await supabase
      .from('class_types_config')
      .select('class_type, monthly_fee')
      .order('class_type', { ascending: true });
      
    if (data && !error) {
      setAvailableClassTypes(data.map(c => ({ name: c.class_type, fee: c.monthly_fee })));
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
      class_type: selectedClassType
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
    <div className="w-full bg-slate-900/40 border border-slate-800 rounded-2xl p-4 md:p-6 shadow-xl transition-all duration-300">
      
      {/* Heading */}
      <h3 className="text-lg md:text-xl font-bold mb-6 flex items-center gap-2 text-white border-b border-slate-800 pb-3">
        <CalendarDays className="text-blue-500" size={22} /> Class Calendar Planner Controls
      </h3>

      {/* Form Area - Responsive Grid */}
      <form onSubmit={handleAddEvent} className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mb-8 bg-slate-900/60 p-4 md:p-6 rounded-xl border border-slate-800">
        
        {/* Class Type Dropdown */}
        <div className="flex flex-col space-y-2">
          <label className="text-xs font-semibold text-slate-400">Class Type (පන්ති වර්ගය)</label>
          <select 
            value={selectedClassType}
            onChange={(e) => setSelectedClassType(e.target.value)}
            className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:border-blue-500 outline-none transition-all"
            required
          >
            <option value="" disabled>e.g. 2026 Revision / 2026 Theory</option>
            <option value="General">General (සියලුම සිසුන්ට)</option>
            {availableClassTypes.map((cls, idx) => (
              <option key={idx} value={cls.name}>{cls.name}</option>
            ))}
          </select>
        </div>

        {/* Date Input */}
        <div className="flex flex-col space-y-2">
          <label className="text-xs font-semibold text-slate-400">Class Date (අවුරුද්ද / මාසය / දිනය)</label>
          <input 
            type="date" 
            required 
            value={date} 
            onChange={e => setDate(e.target.value)} 
            className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white outline-none focus:border-blue-500 transition-all" 
          />
        </div>

        {/* Title Input */}
        <div className="flex flex-col space-y-2 md:col-span-1">
          <label className="text-xs font-semibold text-slate-400">Class Topic / Session Title (මාතෘකාව)</label>
          <input 
            type="text" 
            required 
            placeholder="e.g. Core Mechanics Unit 3" 
            value={title} 
            onChange={e => setTitle(e.target.value)} 
            className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white outline-none focus:border-blue-500 transition-all" 
          />
        </div>

        {/* Status Dropdown */}
        <div className="flex flex-col space-y-2">
          <label className="text-xs font-semibold text-slate-400">Class Date Status (තත්ත්වය)</label>
          <select 
            value={status} 
            onChange={e => setStatus(e.target.value)} 
            className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white outline-none focus:border-blue-500 transition-all"
          >
            <option value="active">Active Class (පැවැත්වේ)</option>
            <option value="cancelled">Cancelled Class (අවලංගුයි)</option>
            <option value="Makeup_Class">Makeup Class (විකල්ප පන්තියකි)</option>
          </select>
        </div>

        {/* Special Warning Message */}
        <div className="flex flex-col space-y-2 md:col-span-2">
          <label className="text-xs font-semibold text-slate-400 flex items-center gap-1">
            <AlertCircle size={14} className="text-amber-500" /> Warning/Special Message (අත්‍යවශ්‍ය නම් පමණක්)
          </label>
          <input 
            type="text" 
            placeholder="e.g. Please bring your core mechanics tute..." 
            value={warningMessage} 
            onChange={e => setWarningMessage(e.target.value)} 
            className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white outline-none focus:border-amber-500 transition-all" 
          />
        </div>

        {/* Submit Button */}
        <div className="md:col-span-2 mt-2">
          <button 
            type="submit" 
            disabled={isLoading} 
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl transition-all duration-200 flex justify-center items-center gap-2 shadow-lg shadow-blue-600/20 active:scale-[0.99]"
          >
            {isLoading ? 'Saving...' : <><Plus size={18} /> Schedule/Alert Class Date</>}
          </button>
        </div>
      </form>

      {/* Heading for list */}
      <h4 className="text-sm font-bold text-slate-400 mb-4 uppercase tracking-wider">Manage Scheduled Classes</h4>

      {/* Events List Display Area */}
      <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
        {events.length === 0 ? (
          <p className="text-sm text-slate-500 italic text-center py-4">දැනට කිසිදු පන්ති දින සැලසුමක් ඇතුළත් කර නැත.</p>
        ) : (
          events.map((ev, i) => (
            <div key={i} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-slate-950/40 border border-slate-800/80 rounded-xl gap-3 hover:border-slate-700 transition-colors">
              <div className="flex flex-col space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-bold bg-blue-950 text-blue-400 border border-blue-800/60 px-2 py-0.5 rounded uppercase">
                    {ev.class_type || 'General'}
                  </span>
                  <span className={`text-[10px] px-2 py-0.5 rounded uppercase font-extrabold ${
                    ev.status === 'active' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
                  }`}>
                    {ev.status}
                  </span>
                  <span className="text-sm font-bold text-slate-200">{ev.title}</span>
                </div>
                {ev.warning_message && (
                  <p className="text-xs text-amber-400/90 italic flex items-center gap-1">⚠️ {ev.warning_message}</p>
                )}
                <p className="text-[11px] text-slate-500 flex items-center gap-1">📅 {ev.date}</p>
              </div>
              <button 
                onClick={() => handleDelete(ev.id)} 
                className="self-end sm:self-center p-2 bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white rounded-xl transition-all duration-150 flex items-center gap-1 text-xs font-semibold"
              >
                <Trash2 size={14} /> Delete
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default AdminCalendarPlanner;