import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { 
  Video, Play, Square, Edit, Eye, Plus, Users, Clock, Trash2, 
  CheckSquare, AlertCircle, BookOpen, X, Award, Radio, Activity,
  Save, EyeOff, RefreshCw
} from 'lucide-react';

export default function AdminLiveControls() {
  const [lives, setLives] = useState<any[]>([]);
  const [classConfigs, setClassConfigs] = useState<any[]>([]);
  const [exams, setExams] = useState<any[]>([]);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewersModalOpen, setViewersModalOpen] = useState(false);
  const [examModalOpen, setExamModalOpen] = useState(false);
  
  const [activeViewers, setActiveViewers] = useState<any[]>([]);
  const [attentionResponses, setAttentionResponses] = useState<any[]>([]);
  const [selectedLiveId, setSelectedLiveId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Live Form State
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

  // Exam Form State (Inline MCQ Sheet Creator)
  const [examFormData, setExamFormData] = useState({
    id: '',
    title: '',
    class_type: '',
    pdf_url: '',
    duration_minutes: 30,
    total_questions: 20,
    correct_answers: {} as Record<number, number>,
    status: 'pending'
  });

  useEffect(() => {
    fetchInitialData();
    
    // Realtime Sync - Ensures instant updates across Admin and Student views
    const channel = supabase.channel('realtime-live-admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scheduled_lives' }, () => fetchInitialData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'exams' }, () => fetchInitialData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attention_responses' }, () => {
        if (selectedLiveId) fetchAttentionData(selectedLiveId);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedLiveId]);

  const fetchInitialData = async () => {
    const { data: livesData } = await supabase.from('scheduled_lives').select('*').order('created_at', { ascending: false });
    const { data: configsData } = await supabase.from('class_types_config').select('*');
    const { data: examsData } = await supabase.from('exams').select('*').order('created_at', { ascending: false });
    
    if (livesData) setLives(livesData);
    if (configsData) setClassConfigs(configsData);
    if (examsData) setExams(examsData);
  };

  const fetchAttentionData = async (liveClassId: string) => {
    const { data: responses } = await supabase
      .from('attention_responses')
      .select('*')
      .eq('live_class_id', liveClassId);
    
    if (responses) setAttentionResponses(responses);
  };

  // --- ZOOM LIVE WORKFLOWS ---
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
        target_class_type: formData.target_class_type || formData.target_classes[0] || '', 
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
      alert(err.message || "Error saving live session");
    } finally {
      setIsLoading(false);
    }
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    await supabase.from('scheduled_lives').update({ status: newStatus }).eq('id', id);
    fetchInitialData();
  };

  const handleDeleteLive = async (id: string) => {
    if (confirm("මෙම සජීවී පන්තිය සම්පූර්ණයෙන්ම මකා දැමීමට අවශ්‍යද?")) {
      await supabase.from('scheduled_lives').delete().eq('id', id);
      fetchInitialData();
    }
  };

  // --- LIVE MCQ EXAM OPERATIONS ---
  const openExamModal = (examId = '') => {
    if (examId) {
      const existing = exams.find(e => e.id === examId);
      if (existing) {
        setExamFormData({
          id: existing.id,
          title: existing.title,
          class_type: existing.class_type || '',
          pdf_url: existing.pdf_url || '',
          duration_minutes: existing.duration_minutes || 30,
          total_questions: existing.total_questions || 20,
          correct_answers: existing.correct_answer || {},
          status: existing.status || 'pending'
        });
      }
    } else {
      setExamFormData({
        id: '',
        title: '',
        class_type: formData.target_class_type || '',
        pdf_url: '',
        duration_minutes: 30,
        total_questions: 20,
        correct_answers: {},
        status: 'pending'
      });
    }
    setExamModalOpen(true);
  };

  const handleSaveExam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!examFormData.title) return alert('කරුණාකර විභාගයට නමක් ඇතුලත් කරන්න.');

    const payload = {
      title: examFormData.title,
      class_type: examFormData.class_type,
      target_class_type: examFormData.class_type,
      pdf_url: examFormData.pdf_url,
      duration_minutes: Number(examFormData.duration_minutes),
      total_questions: Number(examFormData.total_questions),
      correct_answer: examFormData.correct_answers,
      status: examFormData.status
    };

    if (examFormData.id) {
      // Immediate Update
      await supabase.from('exams').update(payload).eq('id', examFormData.id);
    } else {
      // Create new Exam Sheet
      const { data } = await supabase.from('exams').insert([payload]).select();
      if (data && data[0]) {
        setFormData(prev => ({ ...prev, active_exam_id: data[0].id }));
      }
    }
    setExamModalOpen(false);
    fetchInitialData();
  };

  const handleLiveExamStatusToggle = async (liveId: string, examId: string, currentStatus: string) => {
    let nextStatus = 'pending';
    if (currentStatus === 'pending') nextStatus = 'active';
    else if (currentStatus === 'active') nextStatus = 'completed';
    else nextStatus = 'pending';

    await supabase.from('exams').update({ status: nextStatus }).eq('id', examId);
    await supabase.from('scheduled_lives').update({ is_exam_active: nextStatus === 'active' }).eq('id', liveId);
    fetchInitialData();
  };

  // --- ATTENTION MARKING MODULE ---
  const triggerAttentionAlert = async (liveId: string) => {
    const expiresAt = new Date(Date.now() + 10 * 60000).toISOString(); // 10 Minutes Expiry Window
    
    // Clear previous feedback responses
    await supabase.from('attention_responses').delete().eq('live_class_id', liveId);
    
    // Trigger Live Push State
    await supabase.from('scheduled_lives').update({
      attention_trigger: true,
      attention_expires_at: expiresAt
    }).eq('id', liveId);

    alert("සියලුම සිසුන්ගේ තිර මතට Attention Check Message එක සාර්ථකව යවන ලදී!");
    fetchInitialData();
  };

  const fetchLiveStudentsAndAttention = async (liveClassId: string) => {
    setSelectedLiveId(liveClassId);
    
    // Heartbeat mechanism for live concurrent viewers check
    const checkTime = new Date(Date.now() - 2 * 60000).toISOString();
    const { data: attendance } = await supabase
      .from('student_progress') // Assuming status holds live session metadata or using custom progress states
      .select('username')
      .eq('status', 'watching'); 

    // Getting unique usernames
    const uniqueViewers = Array.from(new Set((attendance || []).map(a => a.username)));
    
    // Fetch students profile names mapping
    if (uniqueViewers.length > 0) {
      const { data: studentsProfile } = await supabase.from('students').select('username, name').in('username', uniqueViewers);
      setActiveViewers(studentsProfile || uniqueViewers.map(u => ({ username: u, name: 'සජීවී ශිෂ්‍යයා' })));
    } else {
      setActiveViewers([]);
    }

    await fetchAttentionData(liveClassId);
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
      
      {/* Top Controller Banner */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 bg-slate-900 p-6 rounded-2xl border border-slate-800">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-blue-500 flex items-center gap-2">
            <Video size={32} className="animate-pulse" /> Advanced Live Class & Exam Console
          </h1>
          <p className="text-slate-400 text-sm mt-1">සජීවී සූම් පන්ති, ප්‍රශ්න පත්‍ර ඇමුණුම් සහ ක්ෂණික ශිෂ්‍ය අවධානය පිරික්සුම් මධ්‍යස්ථානය.</p>
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

      {/* Main Core Dashboard Grid */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-950 text-slate-400 text-xs uppercase font-mono border-b border-slate-800">
              <tr>
                <th className="p-4">Class Session Details</th>
                <th className="p-4">Target Audience</th>
                <th className="p-4">Attached Live Exam Module</th>
                <th className="p-4">Stream Status</th>
                <th className="p-4 text-center">Interactive Telemetry & Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-sm">
              {lives.map((live) => {
                const attachedExam = exams.find(e => e.id === live.active_exam_id);
                return (
                  <tr key={live.id} className="hover:bg-slate-900/50 transition">
                    <td className="p-4">
                      <div className="font-bold text-white text-base">{live.title}</div>
                      <div className="text-slate-400 text-xs mt-1 flex items-center gap-2">
                        <Clock size={14} className="text-blue-500" /> {live.date} @ {live.time} 
                        <span className="text-blue-400 bg-blue-950/80 px-2 py-0.5 rounded text-[10px] uppercase font-mono">{live.target_month}</span>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className="bg-slate-950 border border-slate-800 px-3 py-1 rounded text-xs text-amber-400 font-semibold">{live.target_class_type || 'General'}</span>
                    </td>
                    <td className="p-4">
                      {attachedExam ? (
                        <div className="flex flex-col gap-1.5">
                          <span className="text-emerald-400 font-medium flex items-center gap-1 bg-emerald-950/40 p-2 rounded-lg border border-emerald-900/50">
                            <BookOpen size={14} /> {attachedExam.title} 
                            <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800">Status: {attachedExam.status}</span>
                          </span>
                          <div className="flex gap-1">
                            <button 
                              onClick={() => handleLiveExamStatusToggle(live.id, attachedExam.id, attachedExam.status)}
                              className={`px-2 py-1 rounded text-xs font-bold transition ${
                                attachedExam.status === 'pending' ? 'bg-emerald-600 text-white' : 
                                attachedExam.status === 'active' ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-400'
                              }`}
                            >
                              {attachedExam.status === 'pending' && 'Activate Exam Now'}
                              {attachedExam.status === 'active' && 'Pause / Stop Exam'}
                              {attachedExam.status === 'completed' && 'Exam Ended'}
                            </button>
                            <button onClick={() => openExamModal(attachedExam.id)} className="p-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded" title="Edit Online Answer Sheet">
                              <Edit size={14} />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-600 italic">No Exam Attached</span>
                      )}
                    </td>
                    <td className="p-4">
                      <div className="flex flex-col gap-2">
                        {live.status === 'scheduled' && <span className="text-slate-400 bg-slate-800 px-2 py-1 rounded w-fit text-xs border border-slate-700">Scheduled</span>}
                        {live.status === 'pre_class' && <span className="text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-1 rounded w-fit text-xs font-bold animate-pulse">Waiting Video Playing</span>}
                        {live.status === 'live' && <span className="text-red-400 bg-red-500/10 border border-red-500/30 px-2 py-1 rounded w-fit text-xs font-bold flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping"></span> Live Broadcast</span>}
                        {live.status === 'ended' && <span className="text-slate-500 bg-slate-950 px-2 py-1 rounded w-fit text-xs">Concluded</span>}

                        <div className="flex gap-1 mt-1">
                          {live.status === 'scheduled' && (
                            <button onClick={() => handleStatusChange(live.id, 'pre_class')} className="bg-amber-600 hover:bg-amber-500 px-2 py-1 rounded text-xs transition">
                              Pre-Loop Video
                            </button>
                          )}
                          {(live.status === 'scheduled' || live.status === 'pre_class') && (
                            <a href={live.zoom_start_url} target="_blank" rel="noreferrer" onClick={() => handleStatusChange(live.id, 'live')} className="bg-blue-600 hover:bg-blue-500 px-2 py-1 rounded text-xs font-bold flex items-center gap-1 transition">
                              <Play size={12} fill="currentColor"/> Go Live Zoom
                            </a>
                          )}
                          {live.status === 'live' && (
                            <button onClick={() => handleStatusChange(live.id, 'ended')} className="bg-red-600 hover:bg-red-500 px-2 py-1 rounded text-xs font-bold flex items-center gap-1 transition">
                              <Square size={12} fill="currentColor"/> Terminate Stream
                            </button>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="p-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button 
                          onClick={() => triggerAttentionAlert(live.id)} 
                          className={`p-2 rounded-lg text-white font-semibold flex items-center gap-1 text-xs transition ${live.attention_trigger ? 'bg-red-700 animate-bounce' : 'bg-rose-600 hover:bg-rose-500'}`}
                          title="සියලුම සිසුන්ට Attention Popup එකක් යවන්න"
                        >
                          <Radio size={16} /> Attention Prompt
                        </button>
                        <button onClick={() => fetchLiveStudentsAndAttention(live.id)} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-cyan-400 transition" title="ශිෂ්‍ය පැමිණීම සහ අවධානය විමර්ශනය">
                          <Eye size={18} />
                        </button>
                        <button onClick={() => { setFormData(live); setIsModalOpen(true); }} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-amber-400 transition" title="සංස්කරණය">
                          <Edit size={18} />
                        </button>
                        <button onClick={() => handleDeleteLive(live.id)} className="p-2 bg-slate-800 hover:bg-red-950 text-red-400 rounded-lg transition" title="මකා දැමීම">
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 1. MAIN LIVE BROADCAST WIZARD MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl w-full max-w-xl max-h-[95vh] overflow-y-auto shadow-2xl">
            <div className="flex justify-between items-center mb-4 border-b border-slate-800 pb-2">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Video className="text-blue-500" /> {formData.id ? 'Modify Live Broadcast Session' : 'Schedule New Live Zoom Class'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white"><X size={20}/></button>
            </div>
            
            <form onSubmit={handleSaveLive} className="space-y-4">
              <div>
                <label className="block text-xs font-mono text-slate-400 uppercase mb-1">Class Topic / Title</label>
                <input required type="text" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:border-blue-500 focus:outline-none text-sm" placeholder="Physics Theory Live..." />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono text-slate-400 uppercase mb-1">Date</label>
                  <input required type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:border-blue-500 focus:outline-none text-sm text-center" />
                </div>
                <div>
                  <label className="block text-xs font-mono text-slate-400 uppercase mb-1">Time</label>
                  <input required type="time" value={formData.time} onChange={e => setFormData({...formData, time: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:border-blue-500 focus:outline-none text-sm text-center" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono text-slate-400 uppercase mb-1">Target Month (කැලැන්ඩරයෙන් තෝරන්න)</label>
                  <input 
                    required 
                    type="month" 
                    value={formData.target_month} 
                    onChange={e => setFormData({...formData, target_month: e.target.value})} 
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:border-blue-500 focus:outline-none text-sm font-mono text-center" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono text-slate-400 uppercase mb-1">Primary Category Type</label>
                  <select 
                    required
                    value={formData.target_class_type} 
                    onChange={e => setFormData({...formData, target_class_type: e.target.value})}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:border-blue-500 focus:outline-none text-sm"
                  >
                    <option value="">-- Select Main Class Type --</option>
                    {classConfigs.map(c => (
                      <option key={c.id} value={c.class_types}>{c.class_types}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono text-slate-400 uppercase mb-2">Select Accessible Sub-Classes (සිසුන්ට දර්ශනය වන පන්ති වර්‍ග)</label>
                <div className="grid grid-cols-2 gap-2 bg-slate-950 p-3 rounded-xl border border-slate-800 max-h-32 overflow-y-auto">
                  {classConfigs.map((cfg) => (
                    <label key={cfg.id} className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer hover:bg-slate-900 p-1 rounded">
                      <input type="checkbox" checked={formData.target_classes.includes(cfg.class_types)} onChange={() => toggleCheckbox(cfg.class_types)} className="accent-blue-500 rounded" />
                      {cfg.class_types}
                    </label>
                  ))}
                </div>
              </div>

              {/* LIVE INTEGRATED EXAM ATTACHMENT PORTAL */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
                <div className="flex justify-between items-center">
                  <label className="block text-xs font-mono text-slate-400 uppercase">Attach Online Live MCQ Exam</label>
                  <button 
                    type="button" 
                    onClick={() => openExamModal(formData.active_exam_id)}
                    className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-2.5 py-1 rounded font-bold flex items-center gap-1 transition"
                  >
                    <Plus size={12} /> {formData.active_exam_id ? 'Edit Attached Answer Sheet' : 'Create New Live Answer Sheet'}
                  </button>
                </div>
                <select 
                  value={formData.active_exam_id || ''} 
                  onChange={e => setFormData({...formData, active_exam_id: e.target.value})} 
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-white focus:border-blue-500 focus:outline-none text-sm"
                >
                  <option value="">-- No Exam Attached --</option>
                  {exams.map(ex => (
                    <option key={ex.id} value={ex.id}>{ex.title} [{ex.class_type || 'General'}] ({ex.status})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-mono text-slate-400 uppercase mb-1">Pre-Class Waiting Screen Loop Video Path</label>
                <input required type="text" value={formData.pre_class_video_path} onChange={e => setFormData({...formData, pre_class_video_path: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:border-blue-500 focus:outline-none text-sm" />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                <button type="button" onClick={() => setIsModalOpen(false)} className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-xl text-sm transition">Cancel</button>
                <button type="submit" disabled={isLoading} className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2 rounded-xl text-sm font-bold transition shadow-md shadow-blue-600/10">
                  {isLoading ? 'Synchronizing Live API...' : formData.id ? 'Update Live Event' : 'Deploy Live & Generate Zoom Link'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. DYNAMIC LIVE MCQ ANSWER SHEET CREATOR MODAL */}
      {examModalOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-55 p-4">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex justify-between items-center mb-4 border-b border-slate-800 pb-2">
              <h2 className="text-lg font-bold text-emerald-400 flex items-center gap-2">
                <CheckSquare /> {examFormData.id ? 'Modify Realtime MCQ Answer Sheet' : 'Construct Live Student Answer Sheet Matrix'}
              </h2>
              <button onClick={() => setExamModalOpen(false)} className="text-slate-400 hover:text-white"><X size={20}/></button>
            </div>

            <form onSubmit={handleSaveExam} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono text-slate-400 uppercase mb-1">Exam Title / Paper Name</label>
                  <input required type="text" value={examFormData.title} onChange={e => setExamFormData({...examFormData, title: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white text-sm focus:border-emerald-500 focus:outline-none" placeholder="Term Test MCQ 01" />
                </div>
                <div>
                  <label className="block text-xs font-mono text-slate-400 uppercase mb-1">Paper Class Type Config</label>
                  <select required value={examFormData.class_type} onChange={e => setExamFormData({...examFormData, class_type: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white text-sm focus:border-emerald-500 focus:outline-none">
                    <option value="">-- Choose Type --</option>
                    {classConfigs.map(c => <option key={c.id} value={c.class_types}>{c.class_types}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-mono text-slate-400 uppercase mb-1">Paper Link (Google Drive / Image URL)</label>
                  <input type="text" value={examFormData.pdf_url} onChange={e => setExamFormData({...examFormData, pdf_url: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white text-sm focus:border-emerald-500 focus:outline-none" placeholder="https://drive.google.com/file/d/..." />
                </div>
                <div>
                  <label className="block text-xs font-mono text-slate-400 uppercase mb-1">Total Question Count</label>
                  <input type="number" min="1" max="200" value={examFormData.total_questions} onChange={e => setExamFormData({...examFormData, total_questions: Math.min(200, parseInt(e.target.value) || 0)})} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white text-sm text-center focus:border-emerald-500 focus:outline-none" />
                </div>
              </div>

              {/* DYNAMIC ANSWER GRID BUILDER (1 - 200 MCQ GRID) */}
              <div>
                <label className="block text-xs font-mono text-slate-400 uppercase mb-2 text-emerald-500">Correct Answers Key Template (පිළිතුරු පත්‍රයේ නිවැරදි පිළිතුරු ලකුණු කරන්න)</label>
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 max-h-64 overflow-y-auto space-y-3">
                  {Array.from({ length: examFormData.total_questions }).map((_, i) => {
                    const qNum = i + 1;
                    return (
                      <div key={qNum} className="flex items-center justify-between bg-slate-900/60 p-2 rounded-lg border border-slate-800/40 hover:border-slate-700/60 transition">
                        <span className="font-mono text-xs font-bold text-slate-400 w-12">Q. {String(qNum).padStart(2, '0')}</span>
                        <div className="flex gap-2">
                          {[1, 2, 3, 4, 5].map((ans) => (
                            <button
                              type="button"
                              key={ans}
                              onClick={() => setExamFormData({
                                ...examFormData,
                                correct_answers: { ...examFormData.correct_answers, [qNum]: ans }
                              })}
                              className={`w-7 h-7 rounded-full text-xs font-mono font-bold border transition ${
                                examFormData.correct_answers[qNum] === ans
                                  ? 'bg-emerald-500 border-emerald-400 text-slate-950 shadow-md shadow-emerald-500/20 scale-110'
                                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-600'
                              }`}
                            >
                              {ans}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-between items-center pt-4 border-t border-slate-800">
                <span className="text-xs text-amber-500 flex items-center gap-1 font-mono"><AlertCircle size={14}/> ක්ෂණිකව සුරැකේ. සිසුන්ට සජීවීව යාවත්කාලීන වේ.</span>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setExamModalOpen(false)} className="bg-slate-800 text-white px-4 py-2 rounded-xl text-sm">Cancel</button>
                  <button type="submit" className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold px-5 py-2 rounded-xl text-sm flex items-center gap-1 transition shadow-lg shadow-emerald-600/10">
                    <Save size={16}/> Compile Sheet Matrix
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. ATTENDANCE RADAR & ATTENTION METRICS AUDIT MODAL */}
      {viewersModalOpen && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl w-full max-w-2xl shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button onClick={() => setViewersModalOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white transition"><X size={20}/></button>
            
            <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              <Activity className="text-blue-500 animate-pulse" /> Live Telemetry Analytics Desk
            </h2>
            
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-center">
                <div className="text-2xl font-extrabold text-cyan-400 font-mono">{activeViewers.length}</div>
                <div className="text-xs font-mono text-slate-400 uppercase mt-1">Concurrently Streaming</div>
              </div>
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-center">
                <div className="text-2xl font-extrabold text-emerald-400 font-mono">
                  {attentionResponses.filter(r => r.is_attentive).length}
                </div>
                <div className="text-xs font-mono text-slate-400 uppercase mt-1">Verified Attentive Feedbacks</div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-bold text-slate-300 border-b border-slate-800 pb-1">Attention Monitoring Metrics Ledger</h3>
              <div className="grid grid-cols-2 gap-4">
                
                {/* COLUMN A: RESPONDED STUDENTS */}
                <div className="space-y-2">
                  <div className="text-xs font-mono text-emerald-400 bg-emerald-950/20 p-2 rounded border border-emerald-900/50 font-bold flex items-center gap-1">
                    ✓ Responded (අවධානය යොමු කළ සිසුන්)
                  </div>
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-2 max-h-56 overflow-y-auto divide-y divide-slate-900 font-mono text-xs">
                    {attentionResponses.length === 0 ? (
                      <div className="p-3 text-slate-600 italic text-center">No logs generated yet.</div>
                    ) : (
                      attentionResponses.map((res, i) => (
                        <div key={i} className="p-2 flex flex-col hover:bg-slate-900 transition">
                          <span className="text-slate-200 font-bold">{res.student_name || 'Anonymous Student'}</span>
                          <span className="text-slate-500 text-[10px]">@{res.username}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* COLUMN B: PENDING AUDIENCE */}
                <div className="space-y-2">
                  <div className="text-xs font-mono text-rose-400 bg-rose-950/20 p-2 rounded border border-rose-900/50 font-bold flex items-center gap-1">
                    ⚠ Unresponsive / Absent (ප්‍රතිචාර නොදුන් සිසුන්)
                  </div>
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-2 max-h-56 overflow-y-auto divide-y divide-slate-900 font-mono text-xs">
                    {activeViewers.filter(v => !attentionResponses.some(r => r.username === v.username)).length === 0 ? (
                      <div className="p-3 text-slate-600 italic text-center">Perfect attention compliance or zero viewers.</div>
                    ) : (
                      activeViewers
                        .filter(v => !attentionResponses.some(r => r.username === v.username))
                        .map((v, i) => (
                          <div key={i} className="p-2 flex flex-col hover:bg-slate-900 transition">
                            <span className="text-rose-400 font-bold">{v.name || 'Student View'}</span>
                            <span className="text-slate-500 text-[10px]">@{v.username}</span>
                          </div>
                        ))
                    )}
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}