import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Video, Play, Square, Edit, Eye, Plus, Users, Clock, Trash2, CheckSquare, AlertCircle, BookOpen, X, FileText, BellRing, Target, RefreshCw } from 'lucide-react';

export default function AdminLiveControls() {
  const [lives, setLives] = useState<any[]>([]);
  const [classConfigs, setClassConfigs] = useState<any[]>([]);
  const [exams, setExams] = useState<any[]>([]);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewersModalOpen, setViewersModalOpen] = useState(false);
  const [examModalOpen, setExamModalOpen] = useState(false);
  const [attentionModalOpen, setAttentionModalOpen] = useState(false);
  
  const [activeViewers, setActiveViewers] = useState<any[]>([]);
  const [attentionData, setAttentionData] = useState<{ marked: any[], unmarked: any[] }>({ marked: [], unmarked: [] });
  const [currentLiveId, setCurrentLiveId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  // Live Class Form State
  const [formData, setFormData] = useState({
    id: '',
    title: '',
    date: '',
    time: '',
    target_month: '', // Format: YYYY-MM
    target_classes: [] as string[],
    active_exam_id: '',
    pre_class_video_path: '/videos/waiting-video.mp4',
    target_class_type: ''
  });

  // Exam Form State
  const [examData, setExamData] = useState({
    id: '',
    title: '',
    class_type: '',
    pdf_url: '',
    total_questions: 50,
    correct_answer: {} as Record<string, number>,
    status: 'pending' // pending, active, completed
  });

  useEffect(() => {
    fetchInitialData();
    
    // Realtime Listeners for instant updates
    const channel = supabase.channel('realtime-admin-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scheduled_lives' }, fetchInitialData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'exams' }, fetchInitialData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attention_responses' }, () => {
        if (currentLiveId && attentionModalOpen) fetchAttentionData(currentLiveId);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [currentLiveId, attentionModalOpen]);

  const fetchInitialData = async () => {
    const { data: livesData } = await supabase.from('scheduled_lives').select('*').order('created_at', { ascending: false });
    const { data: configsData } = await supabase.from('class_types_config').select('*');
    const { data: examsData } = await supabase.from('exams').select('*').order('title', { ascending: true });
    
    if (livesData) setLives(livesData);
    if (configsData) setClassConfigs(configsData);
    if (examsData) setExams(examsData);
  };

  // --- Live Class Actions ---
  const handleSaveLive = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      let zoomInfo = null;
      if (!formData.id) {
        const { data: edgeData, error: edgeError } = await supabase.functions.invoke('create-zoom-meeting', {
          body: { topic: formData.title, start_time: `${formData.date}T${formData.time}:00` }
        });
        if (edgeError) throw new Error("Zoom meeting creation failed.");
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
      alert(err.message || "Failed to save live class.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("මෙම සජීවී පන්තිය සම්පූර්ණයෙන්ම මකා දැමීමට අවශ්‍යද?")) {
      await supabase.from('scheduled_lives').delete().eq('id', id);
      fetchInitialData();
    }
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    await supabase.from('scheduled_lives').update({ status: newStatus }).eq('id', id);
  };

  const toggleCheckbox = (className: string) => {
    setFormData(prev => ({
      ...prev,
      target_classes: prev.target_classes.includes(className)
        ? prev.target_classes.filter(c => c !== className)
        : [...prev.target_classes, className]
    }));
  };

  // --- Exam Actions ---
  const handleSaveExam = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const payload = {
        title: examData.title,
        class_type: examData.class_type,
        pdf_url: examData.pdf_url,
        total_questions: examData.total_questions,
        correct_answer: examData.correct_answer,
        status: examData.status
      };

      let newExamId = examData.id;

      if (examData.id) {
        await supabase.from('exams').update(payload).eq('id', examData.id);
      } else {
        const { data } = await supabase.from('exams').insert([payload]).select().single();
        if (data) newExamId = data.id;
      }

      setExamModalOpen(false);
      fetchInitialData();
      
      // Select the newly created exam in the live form
      if (newExamId) {
         setFormData(prev => ({ ...prev, active_exam_id: newExamId }));
      }
    } catch (error) {
      console.error(error);
      alert("Error saving exam");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCorrectAnswerChange = (qIndex: number, ansNum: number) => {
    setExamData(prev => ({
      ...prev,
      correct_answer: {
        ...prev.correct_answer,
        [qIndex.toString()]: ansNum
      }
    }));
  };

  const toggleExamStatus = async (examId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'pending' ? 'active' : 'pending';
    await supabase.from('exams').update({ status: newStatus }).eq('id', examId);
  };

  // --- Attention Tracker ---
  const triggerAttention = async (liveId: string) => {
    const expiresAt = new Date(Date.now() + 10 * 60000).toISOString(); // 10 minutes from now
    
    // Clear previous responses for this live session
    await supabase.from('attention_responses').delete().eq('live_id', liveId);
    
    // Send trigger
    await supabase.from('scheduled_lives')
      .update({ attention_trigger: true, attention_expires_at: expiresAt })
      .eq('id', liveId);
      
    // Auto reset in UI after 10 mins (though DB timestamp prevents students from seeing it after)
    setTimeout(async () => {
      await supabase.from('scheduled_lives').update({ attention_trigger: false }).eq('id', liveId);
    }, 10 * 60000);

    alert("Attention Pop-up sent to all active viewers! It will expire in 10 minutes.");
  };

  const fetchAttentionData = async (liveId: string) => {
    setCurrentLiveId(liveId);
    
    // 1. Get Live Viewers (Students actively in the session)
    const checkTime = new Date(Date.now() - 3 * 60000).toISOString();
    const { data: attendance } = await supabase.from('live_attendance').select('username').eq('live_class_id', liveId).gt('last_heartbeat', checkTime);
    
    // 2. Get Attention Responses
    const { data: responses } = await supabase.from('attention_responses').select('username').eq('live_id', liveId);
    
    const allActiveUsernames = (attendance || []).map(a => a.username);
    const respondedUsernames = (responses || []).map(r => r.username);
    
    const marked = respondedUsernames;
    const unmarked = allActiveUsernames.filter(u => !respondedUsernames.includes(u));

    setAttentionData({ marked, unmarked });
    setAttentionModalOpen(true);
  };

  return (
    <div className="w-full bg-slate-950 min-h-screen text-white p-4 md:p-8 font-sans">
      
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 bg-slate-900 p-6 rounded-2xl border border-slate-800">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-blue-500 flex items-center gap-2">
            <Video size={32} className="animate-pulse" /> Manage Scheduled Live Classes
          </h1>
          <p className="text-slate-400 text-sm mt-1">සූම් පන්ති, Exam ආන්සර් ශීට් සහ සිසුන්ගේ අවධානය (Attention) පාලනය කිරීමේ පුවරුව.</p>
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
                <th className="p-4">Class Details & Target Month</th>
                <th className="p-4">Live Exam / Answer Sheet</th>
                <th className="p-4">Live Stream Controls</th>
                <th className="p-4 text-center">Attention & Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-sm">
              {lives.map((live) => {
                const attachedExam = exams.find(e => e.id === live.active_exam_id);
                const isAttentionActive = live.attention_trigger && new Date(live.attention_expires_at) > new Date();

                return (
                <tr key={live.id} className="hover:bg-slate-900/50 transition">
                  <td className="p-4">
                    <div className="font-bold text-white text-base">{live.title}</div>
                    <div className="text-slate-400 text-xs mt-1 flex items-center gap-2">
                      <Clock size={14} className="text-blue-500" /> {live.date} @ {live.time}
                    </div>
                    <div className="mt-2 text-xs text-amber-500 border border-amber-500/20 bg-amber-500/10 w-fit px-2 py-0.5 rounded">
                      Month: {live.target_month || 'N/A'}
                    </div>
                  </td>
                  
                  {/* Live Exam Section */}
                  <td className="p-4">
                    {attachedExam ? (
                      <div className="flex flex-col gap-2 bg-slate-950 p-3 rounded-lg border border-slate-800">
                        <div className="font-bold text-blue-400 text-xs flex justify-between">
                          <span>{attachedExam.title} ({attachedExam.total_questions} Qs)</span>
                          {attachedExam.status === 'active' ? (
                             <span className="text-emerald-400 flex items-center gap-1 animate-pulse"><Target size={12}/> Live</span>
                          ) : (
                             <span className="text-slate-500">Pending</span>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <button 
                            onClick={() => toggleExamStatus(attachedExam.id, attachedExam.status)} 
                            className={`text-[10px] px-2 py-1 rounded font-bold transition ${attachedExam.status === 'active' ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' : 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'}`}
                          >
                            {attachedExam.status === 'active' ? 'Stop Exam' : 'Start Exam'}
                          </button>
                          <button 
                            onClick={() => { setExamData(attachedExam); setExamModalOpen(true); }}
                            className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded flex items-center gap-1 transition"
                          >
                            <Edit size={10}/> Edit Answers
                          </button>
                        </div>
                      </div>
                    ) : (
                      <span className="text-slate-500 text-xs bg-slate-950 px-2 py-1 rounded border border-slate-800">No Exam Attached</span>
                    )}
                  </td>
                  
                  {/* Status Controls */}
                  <td className="p-4">
                    <div className="flex flex-col gap-2">
                      {live.status === 'scheduled' && <span className="text-slate-400 bg-slate-800 px-2 py-1 rounded w-fit text-xs border border-slate-700">Scheduled</span>}
                      {live.status === 'pre_class' && <span className="text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-1 rounded w-fit text-xs font-bold animate-pulse">Pre-Class Video Loop</span>}
                      {live.status === 'live' && <span className="text-red-400 bg-red-500/10 border border-red-500/30 px-2 py-1 rounded w-fit text-xs font-bold flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping"></span> Live on Zoom</span>}
                      {live.status === 'ended' && <span className="text-slate-500 bg-slate-950 px-2 py-1 rounded w-fit text-xs border border-slate-800">Ended</span>}

                      <div className="flex gap-1 mt-1">
                        {live.status === 'scheduled' && (
                          <button onClick={() => handleStatusChange(live.id, 'pre_class')} className="bg-amber-600 hover:bg-amber-500 px-2 py-1 rounded text-xs transition">
                            Start Video
                          </button>
                        )}
                        {(live.status === 'scheduled' || live.status === 'pre_class') && (
                          <a href={live.zoom_start_url} target="_blank" rel="noreferrer" onClick={() => handleStatusChange(live.id, 'live')} className="bg-blue-600 hover:bg-blue-500 px-2 py-1 rounded text-xs transition font-bold flex items-center gap-1 text-white">
                            <Play size={12} fill="currentColor"/> Start Zoom
                          </a>
                        )}
                        {live.status === 'live' && (
                          <button onClick={() => handleStatusChange(live.id, 'ended')} className="bg-red-600 hover:bg-red-500 px-2 py-1 rounded text-xs transition font-bold flex items-center gap-1">
                            <Square size={12} fill="currentColor"/> End Class
                          </button>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Actions & Attention */}
                  <td className="p-4 text-center">
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <button 
                        onClick={() => triggerAttention(live.id)} 
                        disabled={live.status !== 'live'}
                        className={`px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1 transition ${isAttentionActive ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse' : live.status === 'live' ? 'bg-indigo-600 hover:bg-indigo-500 text-white' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}
                        title="Send Attention Pop-up to all students"
                      >
                        <BellRing size={14} /> {isAttentionActive ? 'Attention Active' : 'Mark Attention'}
                      </button>
                      <button onClick={() => fetchAttentionData(live.id)} className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-300 transition" title="View Attention Stats">
                        <Users size={16} />
                      </button>
                    </div>
                    <div className="flex items-center justify-center gap-2 border-t border-slate-800 pt-2">
                      <button onClick={() => { setFormData(live); setIsModalOpen(true); }} className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded text-amber-400 transition" title="Edit Class">
                        <Edit size={16} />
                      </button>
                      <button onClick={() => handleDelete(live.id)} className="p-1.5 bg-slate-800 hover:bg-red-950 text-red-400 rounded transition" title="Delete">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
      </div>

      {/* --- LIVE CLASS SCHEDULING MODAL --- */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[50] p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl relative">
            <button onClick={() => setIsModalOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white transition"><X size={20}/></button>
            <h2 className="text-xl font-bold text-white mb-4 border-b border-slate-800 pb-2">
              {formData.id ? 'Edit Live Session' : 'Schedule New Live Zoom Class'}
            </h2>
            <form onSubmit={handleSaveLive} className="space-y-4">
              <div>
                <label className="block text-xs font-mono text-slate-400 uppercase mb-1">Class Topic / Title</label>
                <input required type="text" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-blue-500 transition text-sm" placeholder="e.g. 2026 Theory Paper Class" />
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
                  <label className="block text-xs font-mono text-slate-400 uppercase mb-1 text-emerald-400">Target Month (Calendar Picker)</label>
                  {/* Native month picker outputs YYYY-MM which is perfect for database filtering */}
                  <input required type="month" value={formData.target_month} onChange={e => setFormData({...formData, target_month: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-emerald-500 transition text-sm text-center" />
                </div>
                <div>
                  <label className="block text-xs font-mono text-slate-400 uppercase mb-1">Pre-Class Video (Path)</label>
                  <input required type="text" value={formData.pre_class_video_path} onChange={e => setFormData({...formData, pre_class_video_path: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-blue-500 transition text-sm" />
                </div>
              </div>

              {/* Real DB Class Types Configuration */}
              <div>
                <label className="block text-xs font-mono text-slate-400 uppercase mb-2">Select Target Classes (සිසුන්ට දර්ශනය වන පන්ති වර්‍ග)</label>
                <div className="grid grid-cols-2 gap-2 bg-slate-950 p-3 rounded-xl border border-slate-800 max-h-36 overflow-y-auto">
                  {classConfigs.map((cfg) => (
                    <label key={cfg.id} className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer hover:bg-slate-900 p-2 rounded border border-transparent hover:border-slate-800 transition">
                      <input type="checkbox" checked={formData.target_classes.includes(cfg.class_types)} onChange={() => toggleCheckbox(cfg.class_types)} className="accent-blue-500 w-4 h-4 rounded" />
                      {cfg.class_types}
                    </label>
                  ))}
                  {classConfigs.length === 0 && <div className="text-slate-500 text-xs col-span-2">No class types found in class_types_config table.</div>}
                </div>
              </div>

              {/* Live Exam Attachment Box */}
              <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl">
                <label className="block text-xs font-bold text-amber-400 uppercase mb-3 flex items-center gap-2">
                  <FileText size={16}/> Attach Live Exam (Answer Sheet & Paper)
                </label>
                <div className="flex gap-2">
                  <select value={formData.active_exam_id || ''} onChange={e => setFormData({...formData, active_exam_id: e.target.value})} className="flex-1 bg-slate-900 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:border-amber-500 transition text-sm">
                    <option value="">-- No Exam Attached --</option>
                    {exams.map(ex => (
                      <option key={ex.id} value={ex.id}>{ex.title} ({ex.total_questions} Qs)</option>
                    ))}
                  </select>
                  <button 
                    type="button"
                    onClick={() => {
                      setExamData({ id: '', title: `${formData.title} - Exam`, class_type: formData.target_classes[0] || '', pdf_url: '', total_questions: 50, correct_answer: {}, status: 'pending' });
                      setExamModalOpen(true);
                    }} 
                    className="bg-amber-600 hover:bg-amber-500 text-white px-4 py-2 rounded-lg text-sm font-bold transition flex items-center gap-1 shadow-lg shadow-amber-600/20"
                  >
                    <Plus size={16}/> Create New
                  </button>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800 mt-6">
                <button type="button" onClick={() => setIsModalOpen(false)} className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-xl text-sm transition">Cancel</button>
                <button type="submit" disabled={isLoading} className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-xl text-sm font-bold transition flex items-center gap-2">
                  {isLoading ? <RefreshCw className="animate-spin" size={16}/> : <CheckSquare size={16}/>} 
                  {formData.id ? 'Save Changes' : 'Schedule Live'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- EXAM / ANSWER SHEET CREATION MODAL --- */}
      {examModalOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-[60] p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-amber-500/30 p-6 rounded-2xl w-full max-w-4xl max-h-[95vh] overflow-hidden flex flex-col shadow-2xl relative shadow-amber-500/10">
            <button onClick={() => setExamModalOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white transition"><X size={20}/></button>
            <h2 className="text-2xl font-extrabold text-amber-500 mb-4 border-b border-slate-800 pb-2 flex items-center gap-2">
              <FileText /> {examData.id ? 'Edit Live Answer Sheet' : 'Create Live Answer Sheet'}
            </h2>
            
            <form onSubmit={handleSaveExam} className="flex flex-col flex-1 overflow-hidden">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 shrink-0">
                <div>
                  <label className="block text-xs font-mono text-slate-400 mb-1">Exam Title</label>
                  <input required type="text" value={examData.title} onChange={e => setExamData({...examData, title: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white focus:outline-none focus:border-amber-500 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-mono text-slate-400 mb-1">Google Drive Paper Link (PDF/JPG View Link)</label>
                  <input type="url" value={examData.pdf_url} onChange={e => setExamData({...examData, pdf_url: e.target.value})} placeholder="https://drive.google.com/..." className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white focus:outline-none focus:border-amber-500 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-mono text-slate-400 mb-1">Total Questions (1 to 200)</label>
                  <input required type="number" min="1" max="200" value={examData.total_questions} onChange={e => setExamData({...examData, total_questions: parseInt(e.target.value) || 0})} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white focus:outline-none focus:border-amber-500 text-sm font-bold text-center" />
                </div>
              </div>

              {/* Dynamic Answer Sheet Grid */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex-1 overflow-y-auto mt-2">
                <div className="text-xs text-slate-500 mb-4 font-mono text-center bg-slate-900 py-2 rounded">
                  Select the Correct Answer for Auto-Marking. Changes made here while exam is 'Active' will update for students instantly!
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {Array.from({ length: Math.min(examData.total_questions, 200) }).map((_, i) => {
                    const qNum = i + 1;
                    const currentCorrect = examData.correct_answer[qNum.toString()];
                    return (
                      <div key={qNum} className="flex items-center gap-3 bg-slate-900 p-2 rounded-lg border border-slate-800 hover:border-amber-500/50 transition">
                        <span className="text-white font-bold w-6 text-right text-sm">{qNum}.</span>
                        <div className="flex gap-1.5">
                          {[1, 2, 3, 4, 5].map(ansNum => (
                            <button
                              key={ansNum}
                              type="button"
                              onClick={() => handleCorrectAnswerChange(qNum, ansNum)}
                              className={`w-6 h-6 rounded-full text-xs font-bold transition-all ${currentCorrect === ansNum ? 'bg-amber-500 text-black scale-110 shadow-lg shadow-amber-500/50' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                            >
                              {ansNum}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800 shrink-0 mt-4">
                <button type="button" onClick={() => setExamModalOpen(false)} className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-sm transition">Cancel</button>
                <button type="submit" disabled={isLoading} className="bg-amber-600 hover:bg-amber-500 text-black px-6 py-2 rounded-lg text-sm font-extrabold transition">
                  {isLoading ? 'Saving...' : 'Save Answer Sheet to Database'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- ATTENTION MARKING RESULTS MODAL --- */}
      {attentionModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[70] p-4 animate-in zoom-in-95 duration-150">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl w-full max-w-2xl shadow-2xl relative">
            <button onClick={() => setAttentionModalOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white transition"><X size={20}/></button>
            <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2 border-b border-slate-800 pb-2">
              <Target className="text-indigo-500" /> Attention Report
            </h2>
            
            <div className="grid grid-cols-2 gap-6">
              {/* Marked Students */}
              <div className="bg-slate-950 border border-emerald-500/20 rounded-xl overflow-hidden flex flex-col h-80">
                <div className="bg-emerald-500/10 text-emerald-400 p-3 font-bold text-sm text-center border-b border-emerald-500/20">
                  Marked Attention ({attentionData.marked.length})
                </div>
                <div className="p-2 overflow-y-auto flex-1 divide-y divide-slate-800/50">
                  {attentionData.marked.length === 0 ? <p className="text-slate-500 text-xs text-center mt-4">No data yet</p> : null}
                  {attentionData.marked.map((u, i) => (
                    <div key={i} className="text-sm font-mono text-slate-300 p-2 hover:bg-slate-900 transition flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div> {u}
                    </div>
                  ))}
                </div>
              </div>

              {/* Unmarked Students */}
              <div className="bg-slate-950 border border-red-500/20 rounded-xl overflow-hidden flex flex-col h-80">
                <div className="bg-red-500/10 text-red-400 p-3 font-bold text-sm text-center border-b border-red-500/20">
                  Ignored / Not Marked ({attentionData.unmarked.length})
                </div>
                <div className="p-2 overflow-y-auto flex-1 divide-y divide-slate-800/50">
                  {attentionData.unmarked.length === 0 ? <p className="text-slate-500 text-xs text-center mt-4">All clear!</p> : null}
                  {attentionData.unmarked.map((u, i) => (
                    <div key={i} className="text-sm font-mono text-slate-400 p-2 hover:bg-slate-900 transition flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-red-500/50 rounded-full"></div> {u}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}