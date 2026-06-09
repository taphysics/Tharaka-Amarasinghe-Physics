import React, { useState, useEffect } from 'react';
import { BookOpen, Plus, Trash2, Edit2, Save, X, DollarSign, CheckCircle, XCircle, RefreshCw } from 'lucide-react';
import { supabase } from '../supabaseClient'; 

interface ClassType {
  id?: string;
  class_name: string;
  monthly_fee: number;
  is_active: boolean;
}

const ClassTypesFeesManager = () => {
  const [classTypes, setClassTypes] = useState<ClassType[]>([]);
  const [className, setClassName] = useState('');
  const [monthlyFee, setMonthlyFee] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // 1. මුලින්ම තියෙන දත්ත ටික ලෝඩ් කරගැනීම
    fetchClassTypes();

    // 2. සජීවීව (Live Realtime) දත්ත අප්ඩේට් වීම සඳහා Supabase Realtime චැනල් එකක් සක්‍රීය කිරීම
    const classTypesChannel = supabase
      .channel('live_class_types_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'class_types_config' },
        (payload) => {
          console.log('Realtime update received:', payload);
          fetchClassTypes(); // ඩේටාබේස් එකේ වෙනසක් වුණු සැණින් UI එක ඔටෝ අප්ඩේට් වේ
        }
      )
      .subscribe();

    // Component එක අයින් වන විට Subscription එක ඉවත් කිරීම
    return () => {
      supabase.removeChannel(classTypesChannel);
    };
  }, []);

  // Database එකෙන් සියලුම පන්ති වර්ග ලබා ගැනීම
  const fetchClassTypes = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('class_types_config')
      .select('*')
      .order('class_name', { ascending: true });

    if (data && !error) {
      setClassTypes(data);
    } else {
      console.error("Error fetching class types:", error);
    }
    setIsLoading(false);
  };

  // නව පන්ති ඇතුළත් කිරීම සහ යාවත්කාලීන කිරීම (Insert / Update)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!className || !monthlyFee) {
      alert("කරුණාකර පන්ති වර්ගය සහ මාසික ගාස්තුව ඇතුළත් කරන්න!");
      return;
    }

    setIsLoading(true);
    const payload = {
      class_name: className.trim(),
      monthly_fee: parseFloat(monthlyFee),
      is_active: isActive
    };

    if (editingId) {
      // මිල හෝ නම එඩිට් කිරීම (මෙය වෙනස් කළ සැනින් ON UPDATE CASCADE හරහා මුළු වෙබ් අඩවියේම මෙම ක්ලාස් එක ඇති තැන් ඔටෝම අප්ඩේට් වේ!)
      const { error } = await supabase
        .from('class_types_config')
        .update(payload)
        .eq('id', editingId);

      if (!error) {
        alert('පන්ති විස්තර සහ එයට අදාළ මුළු වෙබ් අඩවියේම ඇති සියලුම දත්ත සජීවීව යාවත්කාලීන කරන ලදී!');
        resetForm();
      } else {
        alert('යාවත්කාලීන කිරීමේදී දෝෂයක්: ' + error.message);
      }
    } else {
      // අලුතින් ඇතුළත් කිරීම (මෙය ඇතුළත් කළ සැනින් රෙජිස්ට්‍රේෂන් පෝම් ආදී හැම තැනකම ඔටෝම පෙන්වයි)
      const { error } = await supabase
        .from('class_types_config')
        .insert([payload]);

      if (!error) {
        alert('නව පන්ති වර්ගය සාර්ථකව පද්ධතියට එකතු කරන ලදී!');
        resetForm();
      } else {
        alert('ඇතුළත් කිරීමේදී දෝෂයක්: ' + error.message);
      }
    }
    setIsLoading(false);
  };

  // එඩිට් මෝඩ් එකට දත්ත යැවීම
  const handleEdit = (cls: ClassType) => {
    setEditingId(cls.id || null);
    setClassName(cls.class_name);
    setMonthlyFee(cls.monthly_fee.toString());
    setIsActive(cls.is_active);
  };

  // පන්ති වර්ගයක් සම්පූර්ණයෙන්ම මකා දැමීම
  const handleDelete = async (id: string) => {
    if (window.confirm("මෙම පන්ති වර්ගය මකා දැමීමට අවශ්‍යද? මෙය වෙනත් ටේබල් වල දත්ත වලට බලපා ඇත්නම් මකා දැමීමට ඉඩ නොදෙනු ඇත.")) {
      setIsLoading(true);
      const { error } = await supabase
        .from('class_types_config')
        .delete()
        .eq('id', id);

      if (error) {
        alert('මකා දැමීමේදී දෝෂයක් (මෙම පන්තියට අදාළ සිසුන්/ගෙවීම් දැනටමත් පද්ධතියේ තිබිය හැක): ' + error.message);
      }
      setIsLoading(false);
    }
  };

  // Active / Inactive තත්ත්වය ඉක්මනින් වෙනස් කිරීම
  const toggleActiveStatus = async (id: string, currentStatus: boolean) => {
    const { error } = await supabase
      .from('class_types_config')
      .update({ is_active: !currentStatus })
      .eq('id', id);

    if (error) {
      alert('තත්ත්වය වෙනස් කිරීමට නොහැකි විය: ' + error.message);
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setClassName('');
    setMonthlyFee('');
    setIsActive(true);
  };

  return (
    <div className="lg:col-span-12 w-full bg-slate-900/40 border border-slate-800 rounded-3xl p-4 md:p-6 shadow-xl backdrop-blur-sm">
      
      {/* Header */}
      <div className="flex justify-between items-center mb-6 border-b border-slate-800 pb-3">
        <h3 className="text-lg md:text-xl font-bold flex items-center gap-2 text-white font-display">
          <BookOpen className="text-emerald-400" size={22} /> Class Types &amp; Fees Manager
        </h3>
        {isLoading && <RefreshCw className="animate-spin text-slate-400" size={18} />}
      </div>

      {/* Control Form & List Split Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Side: Form Controls */}
        <div className="lg:col-span-1 bg-slate-900/80 border border-slate-800 p-5 rounded-2xl h-fit">
          <h4 className="text-sm font-bold text-slate-300 mb-4 flex items-center gap-2">
            {editingId ? <Edit2 size={16} className="text-amber-400" /> : <Plus size={16} className="text-emerald-400" />}
            {editingId ? 'Edit Class & Cascade' : 'Add New Class Type'}
          </h4>

          <form onSubmit={handleSubmit} className="space-y-4">
            
            {/* Class Name Input */}
            <div className="flex flex-col space-y-1.5">
              <label className="text-xs text-slate-400 font-medium">Class Name (පන්ති වර්ගය)</label>
              <input 
                type="text"
                required
                placeholder="e.g. 2026 Theory / 2027 Revision"
                value={className}
                onChange={(e) => setClassName(e.target.value)}
                className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white outline-none focus:border-emerald-500 transition-all"
              />
            </div>

            {/* Fee Input */}
            <div className="flex flex-col space-y-1.5">
              <label className="text-xs text-slate-400 font-medium">Monthly Fee (මාසික පන්ති ගාස්තුව)</label>
              <div className="relative">
                <span className="absolute left-3 top-3 text-xs text-slate-500 font-bold">Rs.</span>
                <input 
                  type="number"
                  required
                  placeholder="e.g. 3000"
                  value={monthlyFee}
                  onChange={(e) => setMonthlyFee(e.target.value)}
                  className="w-full p-2.5 pl-9 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white outline-none focus:border-emerald-500 transition-all"
                />
              </div>
            </div>

            {/* Status Dropdown */}
            <div className="flex flex-col space-y-1.5">
              <label className="text-xs text-slate-400 font-medium">Registration Availability (ලියාපදිංචිය)</label>
              <select
                value={isActive ? "true" : "false"}
                onChange={(e) => setIsActive(e.target.value === "true")}
                className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white outline-none focus:border-emerald-500 transition-all"
              >
                <option value="true" className="bg-slate-900">Active (පෝම් වල පෙන්වන්න)</option>
                <option value="false" className="bg-slate-900">Inactive (තාවකාලිකව අක්‍රීයයි)</option>
              </select>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                disabled={isLoading}
                className={`flex-1 font-bold py-2.5 rounded-xl text-xs transition-all flex justify-center items-center gap-1.5 cursor-pointer text-white ${
                  editingId ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {editingId ? <Save size={14} /> : <Plus size={14} />}
                {isLoading ? 'Processing...' : editingId ? 'Save & Update All' : 'Create Class'}
              </button>

              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 p-2.5 rounded-xl text-xs transition"
                >
                  <X size={15} />
                </button>
              )}
            </div>

          </form>
        </div>

        {/* Right Side: Responsive Table/List View */}
        <div className="lg:col-span-2 space-y-3">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Configured Classes &amp; Fees (Live View)</h4>
          
          <div className="max-h-[420px] overflow-y-auto pr-2 space-y-2.5 custom-scrollbar">
            {classTypes.length === 0 ? (
              <p className="text-sm text-slate-500 italic text-center py-8">දැනට කිසිදු පන්ති වර්ගයක් පද්ධතියට ඇතුළත් කර නැත.</p>
            ) : (
              classTypes.map((cls) => (
                <div 
                  key={cls.id} 
                  className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-slate-950/50 border rounded-xl gap-4 transition-all hover:border-slate-700 ${
                    cls.is_active ? 'border-slate-800/80' : 'border-red-950/40 bg-red-950/5'
                  }`}
                >
                  {/* Left Side Info */}
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg mt-0.5 ${cls.is_active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                      <BookOpen size={16} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-200">{cls.class_name}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wide ${
                          cls.is_active ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
                        }`}>
                          {cls.is_active ? 'Active' : 'Hidden'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                        <DollarSign size={13} className="text-emerald-500" /> Monthly Fee: 
                        <span className="text-emerald-400 font-bold font-mono">Rs. {cls.monthly_fee}</span>
                      </p>
                    </div>
                  </div>

                  {/* Right Side Control Buttons */}
                  <div className="flex items-center gap-2 self-end sm:self-center">
                    
                    {/* Toggle Activation Button */}
                    <button
                      onClick={() => toggleActiveStatus(cls.id!, cls.is_active)}
                      title={cls.is_active ? "Click to Hide" : "Click to Show"}
                      className={`p-2 rounded-lg border transition-all text-xs flex items-center gap-1 ${
                        cls.is_active 
                          ? 'bg-emerald-500/5 text-emerald-400 border-emerald-500/10 hover:bg-emerald-500/20' 
                          : 'bg-red-500/5 text-red-400 border-red-500/10 hover:bg-red-500/20'
                      }`}
                    >
                      {cls.is_active ? <CheckCircle size={14} /> : <XCircle size={14} />}
                      <span className="hidden md:inline">{cls.is_active ? 'Active' : 'Disabled'}</span>
                    </button>

                    {/* Edit Button */}
                    <button
                      onClick={() => handleEdit(cls)}
                      className="p-2 bg-amber-500/10 text-amber-400 hover:bg-amber-500 hover:text-white border border-amber-500/10 rounded-lg transition-all text-xs flex items-center gap-1"
                    >
                      <Edit2 size={14} /> <span className="hidden md:inline">Edit</span>
                    </button>

                    {/* Delete Button */}
                    <button
                      onClick={() => handleDelete(cls.id!)}
                      className="p-2 bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white border border-red-500/10 rounded-lg transition-all text-xs flex items-center gap-1"
                    >
                      <Trash2 size={14} /> <span className="hidden md:inline">Delete</span>
                    </button>

                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

    </div>
  );
};

export default ClassTypesFeesManager;