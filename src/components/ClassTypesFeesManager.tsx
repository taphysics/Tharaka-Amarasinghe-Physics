import React, { useState, useEffect } from 'react';
import { BookOpen, Plus, Trash2, Edit2, Save, X, DollarSign, CheckCircle, XCircle, RefreshCw, Link, ShieldAlert, AlertTriangle, Lock } from 'lucide-react';
import { supabase } from '../supabaseClient'; 
import SecurityPasswordModal from './SecurityPasswordModal';
import { emitRealtimeEvent } from '../realtimeSync';

export type ClassStatus = 'active' | 'disabled' | 'expired';

export interface ClassMetadata {
  status: ClassStatus;
  is_limited: boolean;
}

interface ClassType {
  id?: string;
  class_type: string; 
  monthly_fee: number;
  is_active: boolean;
  whatsapp_link?: string;
  status?: ClassStatus;
  is_limited?: boolean;
}

// Helpers to extract & save class metadata
export function getClassMetadataMap(): Record<string, ClassMetadata> {
  try {
    const raw = localStorage.getItem('physics_hub_class_metadata');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveClassMetadataMap(map: Record<string, ClassMetadata>) {
  try {
    localStorage.setItem('physics_hub_class_metadata', JSON.stringify(map));
  } catch {}
}

export function parseClassLinkAndMeta(link?: string | null): { cleanLink: string; status: ClassStatus; is_limited: boolean } {
  let cleanLink = (link || '').trim();
  let status: ClassStatus = 'active';
  let is_limited = false;

  if (cleanLink.includes('#meta=')) {
    const [urlPart, metaPart] = cleanLink.split('#meta=');
    cleanLink = urlPart.trim();
    try {
      const parsed = JSON.parse(decodeURIComponent(metaPart));
      if (parsed.status === 'disabled' || parsed.status === 'expired' || parsed.status === 'active') {
        status = parsed.status;
      }
      if (typeof parsed.is_limited === 'boolean') {
        is_limited = parsed.is_limited;
      }
    } catch {
      try {
        const parsed = JSON.parse(metaPart);
        if (parsed.status) status = parsed.status;
        if (typeof parsed.is_limited === 'boolean') is_limited = parsed.is_limited;
      } catch {}
    }
  }

  return { cleanLink, status, is_limited };
}

const ClassTypesFeesManager = () => {
  const [classTypes, setClassTypes] = useState<ClassType[]>([]);
  const [className, setClassName] = useState('');
  const [monthlyFee, setMonthlyFee] = useState('');
  const [whatsappLink, setWhatsappLink] = useState('');
  const [classStatus, setClassStatus] = useState<ClassStatus>('active');
  const [isLimited, setIsLimited] = useState<boolean>(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ClassType | null>(null);

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
      if (data) {
        const metaMap = getClassMetadataMap();
        const enriched = data.map((cls: any) => {
          const { cleanLink, status: linkStatus, is_limited: linkLimited } = parseClassLinkAndMeta(cls.whatsapp_link);
          const localMeta = metaMap[cls.class_type];
          
          let resolvedStatus: ClassStatus = localMeta?.status || linkStatus;
          if (!resolvedStatus) {
            resolvedStatus = cls.is_active ? 'active' : 'disabled';
          }
          const resolvedLimited = typeof localMeta?.is_limited === 'boolean' ? localMeta.is_limited : linkLimited;

          return {
            ...cls,
            whatsapp_link: cleanLink,
            status: resolvedStatus,
            is_limited: resolvedLimited
          };
        });
        setClassTypes(enriched);
      }
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

    const trimmedClassName = className.trim();
    const metaObj = { status: classStatus, is_limited: isLimited };
    
    // Save to local metadata map
    const metaMap = getClassMetadataMap();
    metaMap[trimmedClassName] = metaObj;
    saveClassMetadataMap(metaMap);

    // Encode metadata inside whatsapp_link hash so it survives across browsers
    const rawLink = whatsappLink.trim();
    const encodedMeta = `#meta=${encodeURIComponent(JSON.stringify(metaObj))}`;
    const compositeLink = rawLink ? `${rawLink}${encodedMeta}` : encodedMeta;

    const payload = {
      class_type: trimmedClassName,
      monthly_fee: parsedFee,
      is_active: classStatus === 'active',
      whatsapp_link: compositeLink
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
      
      emitRealtimeEvent('class_types_updated', { classType: trimmedClassName });
      resetForm();
      await fetchClassTypes(); 
    } catch (error: any) {
      console.error("Supabase Save Error Object:", error);
      alert('ක්‍රියාවලියේදී දෝෂයක් ඇතිවිය: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (cls: ClassType) => {
    setEditingId(cls.id || null);
    setClassName(cls.class_type); 
    setMonthlyFee(cls.monthly_fee.toString());
    setClassStatus(cls.status || (cls.is_active ? 'active' : 'disabled'));
    setIsLimited(cls.is_limited || false);
    setWhatsappLink(cls.whatsapp_link || '');
  };

  const executeDelete = async () => {
    if (!deleteTarget?.id || !deleteTarget.class_type) return;
    const targetClass = deleteTarget.class_type;
    setIsLoading(true);

    try {
      // 1. Cascade remove from all students
      try {
        const { data: studentsList } = await supabase.from('students').select('id, class_types, classTypes');
        if (studentsList) {
          for (const s of studentsList) {
            let classes: string[] = [];
            if (Array.isArray(s.class_types)) classes = [...s.class_types];
            else if (typeof s.class_types === 'string') {
              try { classes = JSON.parse(s.class_types); } catch { classes = [s.class_types]; }
            }
            if (classes.includes(targetClass)) {
              const updated = classes.filter(c => c !== targetClass);
              await supabase.from('students').update({ class_types: updated }).eq('id', s.id);
            }
          }
        }
      } catch (err) {
        console.warn('Cascade remove from students error:', err);
      }

      // 2. Cascade delete from class_resources (tutes, papers, videos)
      try {
        await supabase.from('class_resources').delete().eq('class_type', targetClass);
      } catch (e) {}

      // 3. Cascade delete from recordings
      try {
        await supabase.from('recordings').delete().eq('class_type', targetClass);
      } catch (e) {}

      // 4. Cascade delete from scheduled_lives
      try {
        await supabase.from('scheduled_lives').delete().eq('class_type', targetClass);
      } catch (e) {}

      // 5. Cascade delete from exams & online_exams
      try {
        await supabase.from('exams').delete().eq('class_type', targetClass);
        await supabase.from('online_exams').delete().eq('class_type', targetClass);
      } catch (e) {}

      // 6. Cascade delete from exam_results
      try {
        await supabase.from('exam_results').delete().eq('class_type', targetClass);
      } catch (e) {}

      // 7. Cascade remove from staff_members assigned_classes
      try {
        const { data: staffList } = await supabase.from('staff_members').select('id, assigned_classes');
        if (staffList) {
          for (const st of staffList) {
            if (Array.isArray(st.assigned_classes) && st.assigned_classes.includes(targetClass)) {
              await supabase.from('staff_members').update({
                assigned_classes: st.assigned_classes.filter((c: string) => c !== targetClass)
              }).eq('id', st.id);
            }
          }
        }
      } catch (e) {}

      // 8. Cascade delete from class_finance_settings
      try {
        await supabase.from('class_finance_settings').delete().eq('class_type', targetClass);
      } catch (e) {}

      // 9. Cascade delete from payments & pending_payments
      try {
        await supabase.from('payments').delete().or(`class_type.eq.${targetClass},class_name.eq.${targetClass}`);
        await supabase.from('pending_payments').delete().eq('class_type', targetClass);
      } catch (e) {}

      // 10. Finally delete from class_types_config
      const { error } = await supabase
        .from('class_types_config')
        .delete()
        .eq('id', deleteTarget.id);

      if (error) throw error;

      // Clean local metadata
      const metaMap = getClassMetadataMap();
      delete metaMap[targetClass];
      saveClassMetadataMap(metaMap);

      emitRealtimeEvent('class_types_updated', { classType: targetClass });
      await fetchClassTypes();
      setDeleteTarget(null);
      alert(`[${targetClass}] පන්ති වර්ගය සහ ඊට අදාළ සියලුම සටහන් (Recordings, Tuts, Exams, Payments) සාර්ථකව පද්ධතියෙන්ම ඉවත් කරන ලදී!`);
    } catch (error: any) {
      console.error("Delete Error:", error);
      alert('මකා දැමීමේදී දෝෂයක්: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const updateClassStatus = async (cls: ClassType, newStatus: ClassStatus) => {
    if (!cls.id) return;
    setIsLoading(true);
    try {
      const metaMap = getClassMetadataMap();
      metaMap[cls.class_type] = {
        status: newStatus,
        is_limited: cls.is_limited || false
      };
      saveClassMetadataMap(metaMap);

      const metaObj = { status: newStatus, is_limited: cls.is_limited || false };
      const rawLink = cls.whatsapp_link || '';
      const encodedMeta = `#meta=${encodeURIComponent(JSON.stringify(metaObj))}`;
      const compositeLink = rawLink ? `${rawLink}${encodedMeta}` : encodedMeta;

      const { error } = await supabase
        .from('class_types_config')
        .update({
          is_active: newStatus === 'active',
          whatsapp_link: compositeLink
        })
        .eq('id', cls.id);

      if (error) throw error;
      emitRealtimeEvent('class_types_updated', { classType: cls.class_type });
      await fetchClassTypes();
    } catch (error: any) {
      console.error("Status Update Error:", error);
      alert('තත්ත්වය වෙනස් කිරීමට නොහැකි විය: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleLimitMode = async (cls: ClassType) => {
    if (!cls.id) return;
    setIsLoading(true);
    try {
      const newLimited = !cls.is_limited;
      const currentStatus = cls.status || (cls.is_active ? 'active' : 'disabled');
      const metaMap = getClassMetadataMap();
      metaMap[cls.class_type] = {
        status: currentStatus,
        is_limited: newLimited
      };
      saveClassMetadataMap(metaMap);

      const metaObj = { status: currentStatus, is_limited: newLimited };
      const rawLink = cls.whatsapp_link || '';
      const encodedMeta = `#meta=${encodeURIComponent(JSON.stringify(metaObj))}`;
      const compositeLink = rawLink ? `${rawLink}${encodedMeta}` : encodedMeta;

      const { error } = await supabase
        .from('class_types_config')
        .update({
          whatsapp_link: compositeLink
        })
        .eq('id', cls.id);

      if (error) throw error;
      emitRealtimeEvent('class_types_updated', { classType: cls.class_type });
      await fetchClassTypes();
    } catch (error: any) {
      console.error("Limit Mode Error:", error);
      alert('Limit Mode වෙනස් කිරීමට නොහැකි විය: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setClassName('');
    setMonthlyFee('');
    setWhatsappLink('');
    setClassStatus('active');
    setIsLimited(false);
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

            {/* WhatsApp Group Link එකතු කිරීම සඳහා නව Input ක්ෂේත්‍රය */}
            <div className="flex flex-col space-y-1.5">
              <label className="text-xs text-slate-400 font-medium">WhatsApp Group Link (වැට්ස්ඇප් සමූහ ලින්ක් එක)</label>
              <div className="relative">
                <input 
                  type="url"
                  placeholder="e.g. https://chat.whatsapp.com/..."
                  value={whatsappLink}
                  onChange={(e) => setWhatsappLink(e.target.value)}
                  className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white outline-none focus:border-emerald-500 transition-all text-xs"
                />
              </div>
            </div>

            <div className="flex flex-col space-y-1.5">
              <label className="text-xs text-slate-400 font-medium">Class Status (පන්ති තත්ත්වය)</label>
              <select
                value={classStatus}
                onChange={(e) => setClassStatus(e.target.value as ClassStatus)}
                className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white outline-none focus:border-emerald-500 transition-all"
              >
                <option value="active" className="bg-slate-900">Active (සක්‍රියයි - ලියාපදිංචි පෝම් වල පෙන්වන්න)</option>
                <option value="disabled" className="bg-slate-900">Disabled (තාවකාලිකව ඩිසේබල් - පෝම් වලින් සඟවන්න)</option>
                <option value="expired" className="bg-slate-900">Expired (එක්ස්පයර් - නව සිසුන්ට සඟවන්න, පැරණි සිසුන්ට ඇත)</option>
              </select>
            </div>

            {/* Limit Mode Toggle */}
            <div className="p-3 bg-purple-950/20 border border-purple-800/40 rounded-xl space-y-2">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input 
                  type="checkbox"
                  checked={isLimited}
                  onChange={(e) => setIsLimited(e.target.checked)}
                  className="mt-0.5 rounded text-purple-600 focus:ring-purple-500 bg-slate-950 border-slate-700"
                />
                <div>
                  <span className="text-xs font-bold text-purple-300 block flex items-center gap-1.5">
                    <Lock size={13} className="text-purple-400" /> Limit Mode (ලිමිට් මාදිලිය)
                  </span>
                  <span className="text-[11px] text-slate-400 block leading-tight mt-0.5">
                    මෙම පන්තියේ ලියාපදිංචි සිසුන්ගේ Dashboard එකේ "වෙනත් පන්ති (Other Classes)" සෙක්ෂන් එක සම්පූර්ණයෙන්ම සඟවයි.
                  </span>
                </div>
              </label>
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
              classTypes.map((cls) => {
                const effectiveStatus = cls.status || (cls.is_active ? 'active' : 'disabled');

                return (
                  <div 
                    key={cls.id} 
                    className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-slate-950/50 border rounded-xl gap-4 transition-all hover:border-slate-700 ${
                      effectiveStatus === 'active' ? 'border-slate-800/80' : effectiveStatus === 'expired' ? 'border-amber-950/50 bg-amber-950/5' : 'border-red-950/40 bg-red-950/5'
                    }`}
                  >
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className={`p-2 rounded-lg mt-0.5 ${
                        effectiveStatus === 'active' ? 'bg-emerald-500/10 text-emerald-400' :
                        effectiveStatus === 'expired' ? 'bg-amber-500/10 text-amber-400' :
                        'bg-red-500/10 text-red-400'
                      }`}>
                        <BookOpen size={16} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm text-slate-200">{cls.class_type}</span>
                          
                          {/* Status Badge */}
                          <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wide border ${
                            effectiveStatus === 'active' 
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                              : effectiveStatus === 'expired'
                              ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                              : 'bg-red-500/10 text-red-400 border-red-500/20'
                          }`}>
                            {effectiveStatus === 'active' ? 'Active' : effectiveStatus === 'expired' ? 'Expired' : 'Disabled'}
                          </span>

                          {/* Limit Mode Badge */}
                          {cls.is_limited && (
                            <span className="text-[10px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wide bg-purple-500/15 text-purple-300 border border-purple-500/30 flex items-center gap-1">
                              <Lock size={10} /> Limited
                            </span>
                          )}
                        </div>
                        
                        <div className="flex flex-col space-y-1 mt-1">
                          <p className="text-xs text-slate-400 flex items-center gap-1">
                            <DollarSign size={13} className="text-emerald-500" /> Monthly Fee: 
                            <span className="text-emerald-400 font-bold font-mono">Rs. {cls.monthly_fee}</span>
                          </p>
                          
                          {cls.whatsapp_link && (
                            <p className="text-xs text-slate-400 flex items-center gap-1 min-w-0">
                              <Link size={13} className="text-teal-400 flex-shrink-0" /> WhatsApp: 
                              <a 
                                href={cls.whatsapp_link} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="text-teal-400 hover:underline truncate text-[11px]"
                                title={cls.whatsapp_link}
                              >
                                {cls.whatsapp_link}
                              </a>
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center flex-shrink-0 flex-wrap">
                      
                      {/* Status Dropdown Quick Selector */}
                      <select
                        value={effectiveStatus}
                        onChange={(e) => updateClassStatus(cls, e.target.value as ClassStatus)}
                        disabled={isLoading}
                        className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg px-2 py-1.5 outline-none font-bold"
                        title="Change Status"
                      >
                        <option value="active">Active</option>
                        <option value="disabled">Disabled</option>
                        <option value="expired">Expired</option>
                      </select>

                      {/* Limit Mode Toggle Button */}
                      <button
                        onClick={() => toggleLimitMode(cls)}
                        disabled={isLoading}
                        title={cls.is_limited ? "Limit Mode සක්‍රියයි (Click to Disable)" : "Limit Mode අක්‍රීයයි (Click to Enable)"}
                        className={`p-1.5 rounded-lg border text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                          cls.is_limited
                            ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                            : 'bg-slate-900 text-slate-500 border-slate-800 hover:text-slate-300'
                        }`}
                      >
                        <Lock size={13} />
                        <span className="text-[10px] hidden md:inline">Limit</span>
                      </button>

                      <button
                        onClick={() => handleEdit(cls)}
                        disabled={isLoading}
                        className="p-2 bg-amber-500/10 text-amber-400 hover:bg-amber-500 hover:text-white border border-amber-500/10 rounded-lg transition-all text-xs flex items-center gap-1 cursor-pointer"
                      >
                        <Edit2 size={14} /> <span className="hidden md:inline">Edit</span>
                      </button>

                      <button
                        onClick={() => setDeleteTarget(cls)}
                        disabled={isLoading}
                        className="p-2 bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white border border-red-500/10 rounded-lg transition-all text-xs flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 size={14} /> <span className="hidden md:inline">Delete</span>
                      </button>

                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>

      {/* Security Password Protected Class Type Deletion Modal */}
      {deleteTarget && (
        <SecurityPasswordModal
          isOpen={true}
          onClose={() => setDeleteTarget(null)}
          onConfirm={executeDelete}
          title="පන්ති වර්ගය ඉවත් කිරීම (Delete Class Type)"
          description="මෙම පන්ති වර්ගය දත්ත ගබඩාවෙන් ස්ථිරවම මකා දැමීමට කරුණාකර පරිපාලක ආරක්ෂක මුරපදය ඇතුළත් කරන්න."
          itemSummary={deleteTarget ? `${deleteTarget.class_type} (මාසික ගාස්තුව: රු. ${deleteTarget.monthly_fee})` : ''}
          actionButtonText="ස්ථිරවම මකා දමන්න (Delete Now)"
          isDangerous={true}
        />
      )}

    </div>
  );
};

export default ClassTypesFeesManager;