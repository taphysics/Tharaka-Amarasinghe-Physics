import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Video, Play, Square, Edit, Eye, Plus, Users, Clock, Trash2, CheckSquare, AlertCircle, BookOpen, X, BellRing, FileText } from 'lucide-react';

export default function AdminLiveControls() {
  const [lives, setLives] = useState<any[]>([]);
  const [classConfigs, setClassConfigs] = useState<any[]>([]);
  const [exams, setExams] = useState<any[]>([]);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewersModalOpen, setViewersModalOpen] = useState(false);
  const [isExamModalOpen, setIsExamModalOpen] = useState(false);
  
  const [activeViewers, setActiveViewers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Form State for Live Class
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

  // Form State for Exam Generator
  const [examData, setExamData] = useState({
    id: '',
    title: '',
    total_questions: 50,
    answers: {} as Record<number, number>
  });

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
    const { data: configsData } = await supabase.from('class_types_config').select('*');
    const { data: examsData } = await supabase.from('exams').select('*');
    
    if (livesData) setLives(livesData);
    if (configsData) setClassConfigs(configsData);
    if (examsData) setExams(examsData);
  };

  // --- Live Class Management ---
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

  // --- Exam Generator Management ---
  const handleSaveExam = async () => {
    if (!examData.title) return alert("කරුණාකර විභාගයේ නම ඇතුළත් කරන්න.");
    
    const payload = {
      title: examData.title,
      total_questions: examData.total_questions,
      correct_answers: examData.answers, // Requires JSONB column in DB
      class_type: formData.target_classes[0] || 'General'
    };

    if (examData.id) {
      await supabase.from('exams').update(payload).eq('id', examData.id);
      alert("විභාගය සාර්ථකව යාවත්කාලීන කරන ලදී!");
    } else {
      const { data, error } = await supabase.from('exams').insert([payload]).select();
      if (!error && data) {
        setFormData(prev => ({ ...prev, active_exam_id: data[0].id }));
        alert("නව විභාගය සාර්ථකව එකතු කරන ලදී!");
      }
    }
    fetchInitialData();
    setIsExamModalOpen(false);
  };

  const openExamEditor = (examId: string) => {
    const ex = exams.find(e => e.id === examId);
    if (ex) {
      setExamData({
        id: ex.id,
        title: ex.title,
        total_questions: ex.total_questions || 50,
        answers: ex.correct_answers || {}
      });
      setIsExamModalOpen(true);
    }
  };

  const handleDeleteExam = async (examId: string) => {
    if (confirm("මෙම විභාගය මකා දැමුවහොත් සිසුන්ට පිළිතුරු සැපයීමට නොහැකි වනු ඇත. මකා දැමීමට විශ්වාසද?")) {
      await supabase.from('exams').delete().eq('id', examId);
      if (formData.active_exam_id === examId) setFormData(prev => ({ ...prev, active_exam_id: '' }));
      fetchInitialData();
    }
  };

  // --- Attention Trigger Management ---
  const handleAttentionTrigger = async (liveId: string) => {
    // පළමුව Trigger එක On කරයි
    await supabase.from('scheduled_lives').update({ attention_trigger: true }).eq('id', liveId);
    
    // තත්පර 5කට පසු නැවත Off කරයි (එවිට ඊළඟ වතාවේදී නැවත Trigger කළ හැක)
    setTimeout(async () => {
      await supabase.from('scheduled_lives').update({ attention_trigger: false }).eq('id', liveId);
    }, 5000);
    
    alert("සිසුන්ගේ අවධානය ලබාගැනීමේ පණිවිඩය සජීවී තිරයට යවන ලදී!");
  };

  const fetchLiveStudents = async (liveClassId: string) => {
    const checkTime = new Date(Date.now() - 2 * 60000).toISOString();
    const { data } = await supabase
      .from('live_attendance')
      .select('username, joined_at, last_heartbeat')
      .eq('live_class_id', liveClassId)
      .gt('last_heartbeat', checkTime);

    setActiveViewers(data || []);
    setViewersModalOpen(true);
  };

  const toggleCheckbox = (className: string) => {
    setFormData(prev => ({
      ...prev,
      target_classes: prev.target_classes.includes(className)
        ? prev.target_classes.filter(c => c !== className)
        : [...prev.target_classes, className]
    }));
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
                            {/* Attention Trigger Button */}
                            <button onClick={() => handleAttentionTrigger(live.id)} className="bg-purple-600 hover:bg-purple-500 px-2 py-1 rounded text-xs transition font-bold flex items-center gap-1" title="සියලුම සිසුන්ට Attention පණිවිඩයක් යවන්න">
                              <BellRing size={12} /> Send Alert
                            </button>
                            <button onClick={() => handleStatusChange(live.id, 'ended')} className="bg-red-600 hover:bg-red-500 px-2 py-1 rounded text-xs transition font-bold flex items-center gap-1">
                              <Square size={12} fill="currentColor"/> End Class
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

      {/* Main Creation/Editing Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-40 p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl">
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
                  <label className="block text-xs font-mono text-slate-400 uppercase mb-1">Target Month</label>
                  {/* HTML5 Month Picker - 2026-06 Format */}
                  <input required type="month" value={formData.target_month} onChange={e => setFormData({...formData, target_month: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-blue-500 transition text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-mono text-slate-400 uppercase mb-1">Pre-Class Video (Path)</label>
                  <input required type="text" value={formData.pre_class_video_path} onChange={e => setFormData({...formData, pre_class_video_path: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-blue-500 transition text-sm" />
                </div>
              </div>

              {/* Multi-Select Class Configs Checkboxes (Fixed with class_type) */}
              <div>
                <label className="block text-xs font-mono text-slate-400 uppercase mb-2">Select Target Classes (සිසුන්ට දර්ශනය වන පන්ති වර්‍ග)</label>
                <div className="grid grid-cols-2 gap-2 bg-slate-950 p-3 rounded-xl border border-slate-800 max-h-36 overflow-y-auto">
                  {classConfigs.map((cfg) => (
                    <label key={cfg.id} className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer hover:bg-slate-900 p-1 rounded">
                      <input type="checkbox" checked={formData.target_classes.includes(cfg.class_type || cfg.class_types)} onChange={() => toggleCheckbox(cfg.class_type || cfg.class_types)} className="accent-blue-500 rounded" />
                      {cfg.class_type || cfg.class_types}
                    </label>
                  ))}
                </div>
              </div>

              {/* Online Exam Attachment & Creator */}
              <div className="bg-slate-800/30 p-3 rounded-xl border border-slate-700">
                <label className="block text-xs font-mono text-emerald-400 font-bold uppercase mb-2">Attach Live Exam (පන්තිය සමඟම සක්‍රීය වන විභාගය)</label>
                <div className="flex gap-2 items-center">
                  <select value={formData.active_exam_id || ''} onChange={e => setFormData({...formData, active_exam_id: e.target.value})} className="flex-1 bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white focus:outline-none focus:border-emerald-500 transition text-sm">
                    <option value="">-- No Exam Attached --</option>
                    {exams.map(ex => (
                      <option key={ex.id} value={ex.id}>{ex.title}</option>
                    ))}
                  </select>
                  
                  {/* Create New Exam Button */}
                  <button type="button" onClick={() => { setExamData({ id: '', title: '', total_questions: 50, answers: {} }); setIsExamModalOpen(true); }} className="bg-emerald-600 hover:bg-emerald-500 text-white p-2.5 rounded-lg transition" title="නව විභාගයක් සාදන්න">
                    <FileText size={18} />
                  </button>

                  {/* Edit/Delete Exam Buttons (Visible only if an exam is selected) */}
                  {formData.active_exam_id && (
                    <>
                      <button type="button" onClick={() => openExamEditor(formData.active_exam_id)} className="bg-slate-700 hover:bg-slate-600 text-amber-400 p-2.5 rounded-lg transition" title="තෝරාගත් විභාගය සංස්කරණය">
                        <Edit size={18} />
                      </button>
                      <button type="button" onClick={() => handleDeleteExam(formData.active_exam_id)} className="bg-slate-700 hover:bg-slate-600 text-red-400 p-2.5 rounded-lg transition" title="තෝරාගත් විභාගය මකා දමන්න">
                        <Trash2 size={18} />
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                <button type="button" onClick={() => setIsModalOpen(false)} className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-xl text-sm transition">Cancel</button>
                <button type="submit" disabled={isLoading} className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2 rounded-xl text-sm font-bold transition">
                  {isLoading ? 'Connecting API...' : 'Save & Schedule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Answer Sheet Creator Modal */}
      {isExamModalOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-emerald-500/30 p-6 rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col h-[85vh]">
            <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-800">
              <h2 className="text-xl font-bold text-emerald-400 flex items-center gap-2">
                <FileText /> {examData.id ? 'Edit Live Answer Sheet' : 'Create Live Answer Sheet'}
              </h2>
              <button onClick={() => setIsExamModalOpen(false)} className="text-slate-400 hover:text-white"><X size={24}/></button>
            </div>

            <div className="flex gap-4 mb-4">
              <div className="flex-1">
                <label className="block text-xs font-mono text-slate-400 mb-1">Exam Title</label>
                <input type="text" value={examData.title} onChange={e => setExamData({...examData, title: e.target.value})} placeholder="e.g. Mechanics Weekly Test 04" className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white text-sm" />
              </div>
              <div className="w-32">
                <label className="block text-xs font-mono text-slate-400 mb-1">Total Questions</label>
                <input type="number" min="1" max="200" value={examData.total_questions} onChange={e => setExamData({...examData, total_questions: parseInt(e.target.value) || 1})} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white text-sm text-center" />
              </div>
            </div>

            {/* Answer Grid */}
            <div className="flex-1 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-700 bg-slate-950/50 p-4 rounded-xl border border-slate-800">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {Array.from({ length: examData.total_questions }).map((_, idx) => {
                  const qNum = idx + 1;
                  return (
                    <div key={idx} className={`p-2.5 rounded-lg border flex flex-col items-center transition ${examData.answers[qNum] ? 'border-emerald-500/50 bg-emerald-900/10' : 'border-slate-800 bg-slate-900'}`}>
                      <span className="text-[11px] font-bold text-slate-400 mb-2">Question {qNum}</span>
                      <div className="flex gap-1.5 w-full justify-between px-1">
                        {[1, 2, 3, 4, 5].map(ans => (
                          <label key={ans} className="flex flex-col items-center gap-1 cursor-pointer">
                            <input 
                              type="radio" 
                              name={`q_${qNum}`} 
                              checked={examData.answers[qNum] === ans} 
                              onChange={() => setExamData(prev => ({ ...prev, answers: { ...prev.answers, [qNum]: ans } }))} 
                              className="accent-emerald-500 w-3.5 h-3.5 cursor-pointer"
                            />
                            <span className="text-[9px] text-slate-500">{ans}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 mt-4 border-t border-slate-800">
              <button onClick={() => setIsExamModalOpen(false)} className="bg-slate-800 hover:bg-slate-700 text-white px-5 py-2 rounded-xl text-sm transition">Cancel</button>
              <button onClick={handleSaveExam} className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2 rounded-xl text-sm font-bold transition flex items-center gap-2">
                <CheckSquare size={16} /> Save Answer Sheet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Viewers Attendance List Modal */}
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