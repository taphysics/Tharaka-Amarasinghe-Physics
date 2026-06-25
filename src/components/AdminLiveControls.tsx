import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Video, Play, Square, Edit, Eye, Plus, Users, Clock, Trash2, BookOpen, X, AlertCircle, Activity, ListChecks } from 'lucide-react';

export default function AdminLiveControls() {
  const [lives, setLives] = useState<any[]>([]);
  const [classConfigs, setClassConfigs] = useState<any[]>([]);
  const [exams, setExams] = useState<any[]>([]);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewersModalOpen, setViewersModalOpen] = useState(false);
  const [isExamModalOpen, setIsExamModalOpen] = useState(false);
  const [activeViewers, setActiveViewers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Live Class Form State
  const [formData, setFormData] = useState({
    id: '',
    title: '',
    date: '',
    time: '',
    target_month: '',
    target_classes: [] as string[],
    active_exam_id: '',
    pre_class_video_path: '/videos/waiting-video.mp4',
    target_class_type: ''
  });

  // Exam Builder Form State
  const [examData, setExamData] = useState({
    id: '',
    title: '',
    total_questions: 50,
    duration_minutes: 120
  });
  const [examAnswers, setExamAnswers] = useState<Record<number, number>>({});

  useEffect(() => {
    fetchInitialData();
    const channel = supabase.channel('realtime-live-admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scheduled_lives' }, fetchInitialData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'exams' }, fetchInitialData)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchInitialData = async () => {
    const { data: livesData } = await supabase.from('scheduled_lives').select('*').order('created_at', { ascending: false });
    const { data: configsData } = await supabase.from('class_types_config').select('*').order('created_at', { ascending: false });
    const { data: examsData } = await supabase.from('exams').select('*').order('title', { ascending: true });
    
    if (livesData) setLives(livesData);
    if (configsData) setClassConfigs(configsData);
    if (examsData) setExams(examsData);
  };

  // ---------------- LIVES MANAGEMENT ----------------

  const handleSaveLive = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      let zoomInfo = null;

      if (!formData.id) {
        const { data: edgeData, error: edgeError } = await supabase.functions.invoke('create-zoom-meeting', {
          body: { topic: formData.title, start_time: `${formData.date}T${formData.time}:00` }
        });

        if (edgeError) throw new Error("Zoom meeting creation failed via Edge Function.");
        zoomInfo = edgeData;
      }

      const payload = {
        title: formData.title,
        date: formData.date,
        time: formData.time,
        target_month: formData.target_month,
        target_classes: formData.target_classes,
        target_class_type: formData.target_classes[0] || '', 
        active_exam_id: formData.active_exam_id || null,
        is_exam_active: !!formData.active_exam_id,
        pre_class_video_path: formData.pre_class_video_path,
        platform: 'zoom',
        ...(zoomInfo && {
          zoom_meeting_id: String(zoomInfo.id),
          zoom_start_url: zoomInfo.start_url,
          zoom_join_url: zoomInfo.join_url,
          link: zoomInfo.join_url
        })
      };

      if (formData.id) {
        await supabase.from('scheduled_lives').update(payload).eq('id', formData.id);
      } else {
        await supabase.from('scheduled_lives').insert([payload]);
      }

      setIsModalOpen(false);
      fetchInitialData();
    } catch (err: any) {
      alert(err.message || "Something went wrong!");
    } finally {
      setIsLoading(false);
    }
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    await supabase.from('scheduled_lives').update({ status: newStatus }).eq('id', id);
    fetchInitialData();
  };

  const handleDelete = async (id: string) => {
    if (confirm("මෙම සජීවී පන්තිය සම්පූර්ණයෙන්ම මකා දැමීමට අවශ්‍යද?")) {
      await supabase.from('scheduled_lives').delete().eq('id', id);
      fetchInitialData();
    }
  };

  const toggleCheckbox = (className: string) => {
    setFormData(prev => ({
      ...prev,
      target_classes: prev.target_classes.includes(className)
        ? prev.target_classes.filter(c => c !== className)
        : [...prev.target_classes, className]
    }));
  };

  const fetchLiveStudents = async (liveClassId: string) => {
    const checkTime = new Date(Date.now() - 2 * 60000).toISOString();
    const { data } = await supabase.from('live_attendance').select('username, joined_at, last_heartbeat').eq('live_class_id', liveClassId).gt('last_heartbeat', checkTime);
    setActiveViewers(data || []);
    setViewersModalOpen(true);
  };

  const triggerAttention = async (liveId: string) => {
    if(confirm("සියලුම සිසුන්ට Attention Popup එක යැවීමට අවශ්‍යද?")) {
      const expiresAt = new Date(Date.now() + 10 * 60000).toISOString(); // විනාඩි 10ක් වලංගුවේ
      await supabase.from('scheduled_lives').update({ 
        attention_trigger: true, 
        attention_expires_at: expiresAt 
      }).eq('id', liveId);
      alert("Attention Alert Sent!");
      fetchInitialData();
    }
  };

  // ---------------- EXAM MANAGEMENT ----------------

  const openExamModalForNew = () => {
    setExamData({ id: '', title: `${formData.title || 'New'} - Exam`, total_questions: 50, duration_minutes: 120 });
    setExamAnswers({});
    setIsExamModalOpen(true);
  };

  const openExamModalForEdit = () => {
    const selectedExam = exams.find(e => e.id === formData.active_exam_id);
    if(selectedExam) {
      setExamData({ id: selectedExam.id, title: selectedExam.title, total_questions: selectedExam.total_questions || 50, duration_minutes: selectedExam.duration_minutes || 120 });
      setExamAnswers(selectedExam.correct_answers || {});
      setIsExamModalOpen(true);
    }
  };

  const handleDeleteAttachedExam = async () => {
    if(confirm("මෙම විභාගය සම්පූර්ණයෙන්ම මකා දැමීමට අවශ්‍යද?")) {
      await supabase.from('exams').delete().eq('id', formData.active_exam_id);
      setFormData({...formData, active_exam_id: ''});
      fetchInitialData();
    }
  };

  const handleSaveExam = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      title: examData.title,
      total_questions: examData.total_questions,
      duration_minutes: examData.duration_minutes,
      correct_answers: examAnswers,
      class_type: formData.target_classes[0] || 'General Target'
    };

    if (examData.id) {
      await supabase.from('exams').update(payload).eq('id', examData.id);
    } else {
      const { data } = await supabase.from('exams').insert([payload]).select();
      if(data && data.length > 0) {
        setFormData({...formData, active_exam_id: data[0].id});
      }
    }
    setIsExamModalOpen(false);
    fetchInitialData();
  };


  return (
    <div className="w-full bg-slate-950 min-h-screen text-white p-4 md:p-8 font-sans">
      
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 bg-slate-900 p-6 rounded-2xl border border-slate-800">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-blue-500 flex items-center gap-2">
            <Video size={32} className="animate-pulse" /> Manage Scheduled Live Classes
          </h1>
          <p className="text-slate-400 text-sm mt-1">සූම් සජීවී පන්ති පැවැත්වීම, පෙර වීඩියෝ ධාවනය සහ විභාග එකවර පාලනය කරන ප්‍රධාන පුවරුව.</p>
        </div>
        <button 
          onClick={() => {
            setFormData({ id: '', title: '', date: '', time: '', target_month: '', target_classes: [], active_exam_id: '', pre_class_video_path: '/videos/waiting-video.mp4', target_class_type: '' });
            setIsModalOpen(true);
          }}
          className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-3 rounded-xl flex items-center gap-2 transition font-semibold shadow-lg shadow-blue-600/20"
        >
          <Plus size={20} /> Schedule Zoom Class
        </button>
      </div>

      {/* Main Grid/Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-950 text-slate-400 text-xs uppercase font-mono border-b border-slate-800">
              <tr>
                <th className="p-4">Class Details</th>
                <th className="p-4">Targeted Groups</th>
                <th className="p-4">Attached Exam</th>
                <th className="p-4">Status & Control</th>
                <th className="p-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-sm">
              {lives.map((live) => (
                <tr key={live.id} className="hover:bg-slate-900/50 transition">
                  <td className="p-4">
                    <div className="font-bold text-white text-base">{live.title}</div>
                    <div className="text-slate-400 text-xs mt-1 flex items-center gap-2">
                      <Clock size={14} className="text-blue-500" /> {live.date} @ {live.time}
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex flex-wrap gap-1 max-w-[200px]">
                      {live.target_classes?.map((c: string) => (
                        <span key={c} className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded text-[11px] border border-slate-700">{c}</span>
                      ))}
                    </div>
                  </td>
                  <td className="p-4">
                    {live.is_exam_active ? (
                      <span className="text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20 font-medium inline-flex items-center gap-1">
                        <BookOpen size={14} /> Exam Active
                      </span>
                    ) : (
                      <span className="text-slate-500">No Exam</span>
                    )}
                  </td>
                  <td className="p-4">
                    <div className="flex flex-col gap-2">
                      {live.status === 'scheduled' && <span className="text-slate-400 bg-slate-800 px-2 py-1 rounded w-fit text-xs border border-slate-700">Scheduled</span>}
                      {live.status === 'pre_class' && <span className="text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-1 rounded w-fit text-xs font-bold animate-pulse">Pre-Class Video Loop</span>}
                      {live.status === 'live' && <span className="text-red-400 bg-red-500/10 border border-red-500/30 px-2 py-1 rounded w-fit text-xs font-bold flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping"></span> Live on Platform</span>}
                      {live.status === 'ended' && <span className="text-slate-500 bg-slate-950 px-2 py-1 rounded w-fit text-xs">Ended</span>}

                      {/* Live Workflow Switcher Buttons */}
                      <div className="flex flex-wrap gap-1 mt-1">
                        {live.status === 'scheduled' && (
                          <button onClick={() => handleStatusChange(live.id, 'pre_class')} className="bg-amber-600 hover:bg-amber-500 px-2 py-1 rounded text-xs transition">
                            Start Repeat Video
                          </button>
                        )}
                        {(live.status === 'scheduled' || live.status === 'pre_class') && (
                          <a href={live.zoom_start_url} target="_blank" rel="noreferrer" onClick={() => handleStatusChange(live.id, 'live')} className="bg-blue-600 hover:bg-blue-500 px-2 py-1 rounded text-xs transition font-bold flex items-center gap-1">
                            <Play size={12} fill="currentColor"/> Start Zoom
                          </a>
                        )}
                        {live.status === 'live' && (
                          <>
                            <button onClick={() => handleStatusChange(live.id, 'ended')} className="bg-red-600 hover:bg-red-500 px-2 py-1 rounded text-xs transition font-bold flex items-center gap-1">
                              <Square size={12} fill="currentColor"/> End Class
                            </button>
                            <button onClick={() => triggerAttention(live.id)} className="bg-purple-600 hover:bg-purple-500 px-2 py-1 rounded text-xs transition font-bold flex items-center gap-1 ml-1" title="විනාඩි 10ක් පුරාවට සිසුන්ගෙන් අවධානය ලබාගන්න">
                              <Activity size={12} /> Send Attention
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="p-4 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button onClick={() => fetchLiveStudents(live.id)} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-blue-400 transition" title="සජීවීව සිටින සිසුන්">
                        <Eye size={18} />
                      </button>
                      <button onClick={() => { setFormData(live); setIsModalOpen(true); }} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-amber-400 transition" title="සංස්කරණය">
                        <Edit size={18} />
                      </button>
                      <button onClick={() => handleDelete(live.id)} className="p-2 bg-slate-800 hover:bg-red-950 text-red-400 rounded-lg transition" title="මකා දමන්න">
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* MAIN MODAL: Class creation */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl relative">
            <h2 className="text-xl font-bold text-white mb-4 border-b border-slate-800 pb-2">
              {formData.id ? 'Edit Live Session' : 'Schedule New Live Zoom Class'}
            </h2>
            <form onSubmit={handleSaveLive} className="space-y-4">
              <div>
                <label className="block text-xs font-mono text-slate-400 uppercase mb-1">Class Topic / Title</label>
                <input required type="text" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-blue-500 transition text-sm" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono text-slate-400 uppercase mb-1">Date</label>
                  <input required type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-blue-500 transition text-sm text-center" />
                </div>
                <div>
                  <label className="block text-xs font-mono text-slate-400 uppercase mb-1">Time</label>
                  <input required type="time" value={formData.time} onChange={e => setFormData({...formData, time: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-blue-500 transition text-sm text-center" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  {/* MONTH PICKER යාවත්කාලීන කර ඇත */}
                  <label className="block text-xs font-mono text-slate-400 uppercase mb-1">Target Month</label>
                  <input required type="month" value={formData.target_month} onChange={e => setFormData({...formData, target_month: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-blue-500 transition text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-mono text-slate-400 uppercase mb-1">Pre-Class Video Path</label>
                  <input required type="text" value={formData.pre_class_video_path} onChange={e => setFormData({...formData, pre_class_video_path: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-blue-500 transition text-sm" />
                </div>
              </div>

              {/* Dynamic Class Configs Checkboxes */}
              <div>
                <label className="block text-xs font-mono text-slate-400 uppercase mb-2">Select Target Classes (සිසුන්ට දර්ශනය වන පන්ති වර්‍ග)</label>
                <div className="grid grid-cols-2 gap-2 bg-slate-950 p-3 rounded-xl border border-slate-800 max-h-36 overflow-y-auto">
                  {classConfigs.map((cfg) => (
                    <label key={cfg.id} className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer hover:bg-slate-900 p-1 rounded">
                      <input type="checkbox" checked={formData.target_classes.includes(cfg.class_types)} onChange={() => toggleCheckbox(cfg.class_types)} className="accent-blue-500 rounded" />
                      {cfg.class_types}
                    </label>
                  ))}
                  {classConfigs.length === 0 && <span className="text-xs text-slate-500">No class configs found.</span>}
                </div>
              </div>

              {/* Enhanced Live Exam Attachment Selection */}
              <div className="bg-slate-800/40 border border-slate-700/50 p-4 rounded-xl space-y-3">
                <label className="block text-xs font-bold font-mono text-emerald-400 uppercase flex items-center gap-2"><ListChecks size={16}/> Attach Live Exam</label>
                
                <select value={formData.active_exam_id || ''} onChange={e => setFormData({...formData, active_exam_id: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white focus:outline-none focus:border-emerald-500 transition text-sm">
                  <option value="">-- No Exam Attached --</option>
                  {exams.map(ex => (
                    <option key={ex.id} value={ex.id}>{ex.title} [{ex.class_type}]</option>
                  ))}
                </select>
                
                {/* Exam Management Buttons inline */}
                <div className="flex gap-2 pt-1 flex-wrap">
                  <button type="button" onClick={openExamModalForNew} className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition">
                    + Create New Exam Sheet
                  </button>
                  {formData.active_exam_id && (
                    <>
                      <button type="button" onClick={openExamModalForEdit} className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition">
                        Edit Selected Exam
                      </button>
                      <button type="button" onClick={handleDeleteAttachedExam} className="bg-red-950/50 hover:bg-red-900 text-red-400 border border-red-900/50 px-3 py-1.5 rounded-lg text-xs font-bold transition">
                        Delete Exam
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800 mt-6">
                <button type="button" onClick={() => setIsModalOpen(false)} className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-xl text-sm transition">Cancel</button>
                <button type="submit" disabled={isLoading} className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2 rounded-xl text-sm font-bold transition shadow-lg shadow-blue-500/20">
                  {isLoading ? 'Processing...' : 'Save Live Schedule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EXAM BUILDER MODAL: Answer sheet generator */}
      {isExamModalOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-[60] p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-emerald-900/50 p-6 rounded-2xl w-full max-w-3xl max-h-[95vh] flex flex-col shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-800 pb-4 mb-4">
               <h2 className="text-xl font-bold text-white flex items-center gap-2"><ListChecks className="text-emerald-400"/> Answer Sheet Builder</h2>
               <button onClick={() => setIsExamModalOpen(false)} className="text-slate-400 hover:text-white"><X/></button>
            </div>
            
            <form onSubmit={handleSaveExam} className="flex flex-col flex-grow overflow-hidden">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-mono text-slate-400 uppercase mb-1">Exam Title</label>
                  <input required type="text" value={examData.title} onChange={e => setExamData({...examData, title: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:outline-none focus:border-emerald-500 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-mono text-slate-400 uppercase mb-1">Total Questions</label>
                  <input required type="number" min="1" max="200" value={examData.total_questions} onChange={e => setExamData({...examData, total_questions: parseInt(e.target.value)})} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:outline-none focus:border-emerald-500 text-sm" />
                </div>
              </div>

              {/* Answers Grid Area */}
              <div className="bg-slate-950 rounded-xl border border-slate-800 p-4 flex-grow overflow-y-auto mb-4">
                 <p className="text-xs text-emerald-400 mb-4 font-mono font-bold text-center">සෑම ප්‍රශ්නයකටම අදාළ නිවැරදි පිළිතුර (1-5) මත ක්ලික් කරන්න.</p>
                 <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {Array.from({length: examData.total_questions}).map((_, idx) => {
                      const qNum = idx + 1;
                      return (
                        <div key={qNum} className="flex items-center justify-between bg-slate-900 border border-slate-800 p-2 rounded-lg">
                           <span className="text-xs font-bold text-slate-300 w-6">{qNum}.</span>
                           <div className="flex gap-1">
                             {[1,2,3,4,5].map(opt => (
                               <button 
                                 key={opt}
                                 type="button" 
                                 onClick={() => setExamAnswers({...examAnswers, [qNum]: opt})} 
                                 className={`w-6 h-6 rounded-full text-[10px] font-bold transition-all ${examAnswers[qNum] === opt ? 'bg-emerald-500 text-white shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                               >
                                 {opt}
                               </button>
                             ))}
                           </div>
                        </div>
                      )
                    })}
                 </div>
              </div>

              <div className="flex justify-end pt-2">
                <button type="submit" className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2.5 rounded-xl text-sm font-bold transition shadow-lg shadow-emerald-600/20 w-full md:w-auto">
                  Save Exam & Attach
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Viewers Attendance Modal */}
      {viewersModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in zoom-in-95 duration-150">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl w-full max-w-md shadow-2xl relative">
            <button onClick={() => setViewersModalOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white transition"><X size={20}/></button>
            <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><Users className="text-blue-500" /> Active Users ({activeViewers.length})</h2>
            
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-2 max-h-72 overflow-y-auto divide-y divide-slate-900">
              {activeViewers.length === 0 ? (
                <div className="text-center text-slate-500 py-8 text-sm flex flex-col items-center gap-2"><AlertCircle size={24}/> දැනට මෙම පන්තියේ සජීවී සිසුන් කිසිවෙකු නොමැත.</div>
              ) : (
                activeViewers.map((user, index) => (
                  <div key={index} className="p-3 flex justify-between items-center hover:bg-slate-900/50 rounded-lg transition">
                    <span className="font-mono text-sm text-slate-200 font-bold">{user.username}</span>
                    <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full animate-pulse">LIVE WATCHING</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}