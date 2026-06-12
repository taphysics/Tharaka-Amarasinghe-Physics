import React, { useState, useEffect } from 'react';
import { BookOpen, Plus, Trash2, Edit2, Save, X, DollarSign, CheckCircle, XCircle, RefreshCw } from 'lucide-react';
import { supabase } from '../supabaseClient'; 

interface ClassType {
  id?: string;
  class_type: string; 
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
    fetchClassTypes();

    const classTypesChannel = supabase
      .channel('live_class_types_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'class_types_config' },
        (payload) => {
          console.log('Realtime update received:', payload);
          fetchClassTypes(); 
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(classTypesChannel);
    };
  }, []);

  const fetchClassTypes = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('class_types_config')
        .select('*')
        .order('class_type', { ascending: true });

      if (error) {
        console.error("Fetch Error:", error);
        throw error;
      }
      if (data) setClassTypes(data);
    } catch (error: any) {
      console.error("Error fetching class types:", error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!className.trim() || !monthlyFee) {
      alert("කරුණාකර පන්ති වර්ගය සහ මාසික ගාස්තුව ඇතුළත් කරන්න!");
      return;
    }

    const parsedFee = parseFloat(monthlyFee);
    if (isNaN(parsedFee)) {
      alert("කරුණාකර වලංගු මාසික ගාස්තුවක් ඇතුළත් කරන්න!");
      return;
    }

    setIsLoading(true);
    
    // Database එකේ ඇති කොලම් වල නම් වලට හරියටම ගැලපෙන Payload එක
    const payload = {
      class_name: className.trim(),
      class_type: className.trim(),
      monthly_fee: parsedFee,
      is_active: isActive
    };

    try {
      if (editingId) {
        const { error } = await supabase
          .from('class_types_config')
          .update(payload)
          .eq('id', editingId);

        if (error) throw error;
        alert('පන්ති විස්තර සජීවීව යාවත්කාලීන කරන ලදී!');
      } else {
        const { error } = await supabase
          .from('class_types_config')
          .insert([payload]);

        if (error) throw error;
        alert('නව පන්ති වර්ගය සාර්ථකව පද්ධතියට එකතු කරන ලදී!');
      }
      
      resetForm();
      await fetchClassTypes(); 
    } catch (error: any) {
      // මෙතනින් අපිට හරියටම Supabase Error එක Console එකේ බලාගන්න පුළුවන්
      console.error("Supabase Save Error Object:", error);
      alert('ක්‍රියාවලියේදී දෝෂයක් ඇතිවිය: ' + error.message + '\n(Inspect Console එක පරීක්ෂා කරන්න)');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (cls: ClassType) => {
    setEditingId(cls.id || null);
    setClassName(cls.class_type); 
    setMonthlyFee(cls.monthly_fee.toString());
    setIsActive(cls.is_active);
  };

  const handleDelete = async (id: string) => {
    if (!id) return;
    if (window.confirm("මෙම පන්ති වර්ගය මකා දැමීමට අවශ්‍යද? වෙනත් ටේබල් වල දත්ත වලට බලපා ඇත්නම් මකා දැමීමට ඉඩ නොදෙනු ඇත.")) {
      setIsLoading(true);
      try {
        const { error } = await supabase
          .from('class_types_config')
          .delete()
          .eq('id', id);

        if (error) throw error;
        await fetchClassTypes();
      } catch (error: any) {
        console.error("Delete Error:", error);
        alert('මකා දැමීමේදී දෝෂයක්: ' + error.message);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const toggleActiveStatus = async (id: string, currentStatus: boolean) => {
    if (!id) return;
    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('class_types_config')
        .update({ is_active: !currentStatus })
        .eq('id', id);

      if (error) throw error;
      await fetchClassTypes();
    } catch (error: any) {
      console.error("Toggle Status Error:", error);
      alert('තත්ත්වය වෙනස් කිරීමට නොහැකි විය: ' + error.message);
    } finally {
      setIsLoading(false);
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
      
      <div className="flex justify-between items-center mb-6 border-b border-slate-800 pb-3">
        <h3 className="text-lg md:text-xl font-bold flex items-center gap-2 text-white font-display">
          <BookOpen className="text-emerald-400" size={22} /> Class Types &amp; Fees Manager
        </h3>
        {isLoading && <RefreshCw className="animate-spin text-slate-400" size={18} />}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        <div className="lg:col-span-1 bg-slate-900/80 border border-slate-800 p-5 rounded-2xl h-fit">
          <h4 className="text-sm font-bold text-slate-300 mb-4 flex items-center gap-2">
            {editingId ? <Edit2 size={16} className="text-amber-400" /> : <Plus size={16} className="text-emerald-400" />}
            {editingId ? 'Edit Class details' : 'Add New Class Type'}
          </h4>

          <form onSubmit={handleSubmit} className="space-y-4">
            
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
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 p-2.5 rounded-xl text-xs transition cursor-pointer"
                >
                  <X size={15} />
                </button>
              )}
            </div>

          </form>
        </div>

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
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg mt-0.5 ${cls.is_active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                      <BookOpen size={16} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-200">{cls.class_type}</span>
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

                  <div className="flex items-center gap-2 self-end sm:self-center">
                    
                    <button
                      onClick={() => toggleActiveStatus(cls.id!, cls.is_active)}
                      disabled={isLoading}
                      title={cls.is_active ? "Click to Hide" : "Click to Show"}
                      className={`p-2 rounded-lg border transition-all text-xs flex items-center gap-1 cursor-pointer ${
                        cls.is_active 
                          ? 'bg-emerald-500/5 text-emerald-400 border-emerald-500/10 hover:bg-emerald-500/20' 
                          : 'bg-red-500/5 text-red-400 border-red-500/10 hover:bg-red-500/20'
                      }`}
                    >
                      {cls.is_active ? <CheckCircle size={14} /> : <XCircle size={14} />}
                      <span className="hidden md:inline">{cls.is_active ? 'Active' : 'Disabled'}</span>
                    </button>

                    <button
                      onClick={() => handleEdit(cls)}
                      disabled={isLoading}
                      className="p-2 bg-amber-500/10 text-amber-400 hover:bg-amber-500 hover:text-white border border-amber-500/10 rounded-lg transition-all text-xs flex items-center gap-1 cursor-pointer"
                    >
                      <Edit2 size={14} /> <span className="hidden md:inline">Edit</span>
                    </button>

                    <button
                      onClick={() => handleDelete(cls.id!)}
                      disabled={isLoading}
                      className="p-2 bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white border border-red-500/10 rounded-lg transition-all text-xs flex items-center gap-1 cursor-pointer"
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