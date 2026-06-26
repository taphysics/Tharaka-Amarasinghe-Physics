import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Video, Play, Square, Edit, Eye, Plus, Users, Clock, Trash2, CheckSquare, AlertCircle, BookOpen, X, FileText, BellRing, Target, RefreshCw, Send, EyeOff, Link2 } from 'lucide-react';

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
    target_month: '', 
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
    status: 'pending' 
  });

  useEffect(() => {
    fetchInitialData();
    
    // Supabase Realtime Engine සක්‍රීය කිරීම
    const channel = supabase.channel('realtime-admin-live-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scheduled_lives' }, () => { fetchInitialData(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'exams' }, () => { fetchInitialData(); })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // වගු එකිනෙකට ස්වාධීනව ලෝඩ් කිරීම
  const fetchInitialData = async () => {
    try {
      const { data: livesData, error: e1 } = await supabase.from('scheduled_lives').select('*').order('created_at', { ascending: false });
      if (!e1 && livesData) setLives(livesData);
    } catch (err) { console.error("Error loading lives:", err); }

    try {
      const { data: configsData, error: e2 } = await supabase.from('class_types_config').select('*');
      if (!e2 && configsData) setClassConfigs(configsData);
    } catch (err) { console.error("Error loading configs:", err); }

    try {
      const { data: examsData, error: e3 } = await supabase.from('exams').select('*').order('created_at', { ascending: false });
      if (!e3 && examsData) setExams(examsData);
    } catch (err) { console.error("Error loading exams:", err); }
  };

  const handleSaveLive = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      let zoomInfo = null;
      if (!formData.id) {
        const { data: edgeData, error: edgeError } = await supabase.functions.invoke('create-zoom-meeting', {
          body: { topic: formData.title, start_time: `${formData.date}T${formData.time}:00` }
        });
        if (!edgeError) zoomInfo = edgeData;
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
      await fetchInitialData();
    } catch (err: any) {
      alert(err.message || "Error saving session.");
    } finally {
      setIsLoading(false);
    }
  };

  // ඩෑෂ්බෝඩ් එකෙන්ම කෙලින්ම Exam එකක් Link කිරීමට ඇති පහසුකම
  const handleQuickLinkExam = async (liveId: string, examId: string) => {
    setIsLoading(true);
    try {
      const { error } = await supabase.from('scheduled_lives')
        .update({ active_exam_id: examId || null, is_exam_active: false })
        .eq('id', liveId);
        
      if (error) throw error;
      await fetchInitialData();
    } catch (err: any) {
      alert("Error linking exam: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("මෙම පන්තිය මකා දැමීමට අවශ්‍යද?")) {
      await supabase.from('scheduled_lives').delete().eq('id', id);
      await fetchInitialData();
    }
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    await supabase.from('scheduled_lives').update({ status: newStatus }).eq('id', id);
    await fetchInitialData();
  };

  const toggleCheckbox = (className: string) => {
    setFormData(prev => ({
      ...prev,
      target_classes: prev.target_classes.includes(className)
        ? prev.target_classes.filter(c => c !== className)
        : [...prev.target_classes, className]
    }));
  };

  // Exam සුරැකීමේදී සැනෙකින් ලැයිස්තුවට එකතු වීම සහ Live Class එකට Link වීම සකස් කිරීම
  const handleSaveExam = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const payload = {
        title: examData.title,
        class_type: examData.class_type || formData.target_classes[0] || 'Theory',
        pdf_url: examData.pdf_url,
        total_questions: examData.total_questions,
        correct_answer: examData.correct_answer,
        status: examData.status || 'pending'
      };

      let targetExamId = examData.id;

      if (examData.id) {
        const { error } = await supabase.from('exams').update(payload).eq('id', examData.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('exams').insert([payload]).select().single();
        if (error) throw error;
        if (data) targetExamId = data.id;
      }

      // යම් හෙයකින් මෙම Exam එක සෑදුවේ කිසියම් සජීවී පන්තියක සිට කෙලින්ම නම්, එය එම මොහොතේම දත්තගබඩාව තුළද Link කිරීම
      const activeLiveId = currentLiveId || formData.id;
      if (targetExamId && activeLiveId) {
        await supabase.from('scheduled_lives')
          .update({ active_exam_id: targetExamId, is_exam_active: false })
          .eq('id', activeLiveId);
      }

      if (!examData.id && targetExamId) {
        setFormData(prev => ({ ...prev, active_exam_id: targetExamId }));
      }

      setExamModalOpen(false);
      setCurrentLiveId(''); 
      alert("පිළිතුරු පත්‍රය සාර්ථකව දත්තගබඩාවට සහ පාලන පැනලයට යාවත්කාලීන කරන ලදී!");
      
      // දත්ත වහාම Refresh කිරීම
      await fetchInitialData();
    } catch (error: any) {
      alert("Exam Save Error: " + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePushExamToStudents = async (liveId: string, examId: string, currentPushState: boolean) => {
    const nextState = !currentPushState;
    try {
      await supabase.from('scheduled_lives').update({ is_exam_active: nextState, active_exam_id: examId }).eq('id', liveId);
      await supabase.from('exams').update({ status: nextState ? 'active' : 'pending' }).eq('id', examId);
      alert(nextState ? "🚀 විභාගය සිසුන්ගේ Screen එකට Push කරන ලදී!" : "🛑 විභාගය සිසුන්ගේ තිරයෙන් ඉවත් කරන ලදී.");
      await fetchInitialData();
    } catch (err) {
      alert("Push operation failed.");
    }
  };

  const triggerAttention = async (liveId: string) => {
    const expiresAt = new Date(Date.now() + 10 * 60000).toISOString(); 
    await supabase.from('scheduled_lives').update({ attention_trigger: true, attention_expires_at: expiresAt }).eq('id', liveId);
    alert("Attention alert dispatched!");
  };

  return (
    <div className="w-full bg-slate-950 min-h-screen text-white p-4 md:p-8 font-sans">
      
      {/* Upper Control Banner */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 bg-slate-900 p-6 rounded-2xl border border-slate-800">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-blue-500 flex items-center gap-2">
            <Video size={32} className="animate-pulse" /> Live Administration Dashboard
          </h1>
          <p className="text-slate-400 text-sm mt-1">සූම් පන්ති, ප්‍රශ්න පත්‍ර (Push Paper) සහ සිසුන්ගේ Attention එකවර පාලනය කරන ප්‍රධාන පැනලය.</p>
        </div>
        <button 
          onClick={() => {
            setFormData({ id: '', title: '', date: '', time: '', target_month: '', target_classes: [], active_exam_id: '', pre_class_video_path: '/videos/waiting-video.mp4', target_class_type: '' });
            setCurrentLiveId('');
            setIsModalOpen(true);
          }}
          className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-3 rounded-xl flex items-center gap-2 transition font-semibold shadow-lg"
        >
          <Plus size={20} /> Schedule New Live Class
        </button>
      </div>

      {/* Main Table Interface */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-950 text-slate-400 text-xs uppercase font-mono border-b border-slate-800">
              <tr>
                <th className="p-4">Class Information</th>
                <th className="p-4">Target Groups</th>
                <th className="p-4">Live Exam Panel & Push Controls</th>
                <th className="p-4">Stream Engine</th>
                <th className="p-4 text-center">Core Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-sm">
              {lives.map((live) => {
                const attachedExam = exams.find(e => e.id === live.active_exam_id);
                const isExamPushedLive = live.is_exam_active;

                return (
                <tr key={live.id} className="hover:bg-slate-900/50 transition">
                  <td className="p-4">
                    <div className="font-bold text-white text-base">{live.title}</div>
                    <div className="text-slate-400 text-xs mt-1 flex items-center gap-2">
                      <Clock size={14} className="text-blue-500" /> {live.date} @ {live.time}
                    </div>
                    <div className="mt-2 text-[11px] font-mono text-emerald-400 border border-emerald-500/20 bg-emerald-500/5 w-fit px-2 py-0.5 rounded">
                      Target Month: {live.target_month || 'Not Configured'}
                    </div>
                  </td>

                  <td className="p-4">
                    <div className="flex flex-wrap gap-1 max-w-[180px]">
                      {live.target_classes && live.target_classes.length > 0 ? (
                        live.target_classes.map((c: string) => (
                          <span key={c} className="bg-slate-950 text-slate-300 px-2 py-0.5 rounded text-[10px] border border-slate-800">{c}</span>
                        ))
                      ) : (
                        <span className="text-slate-600 text-xs">—</span>
                      )}
                    </div>
                  </td>
                  
                  {/* LIVE EXAM & PUSH BOX */}
                  <td className="p-4">
                    {attachedExam ? (
                      <div className="flex flex-col gap-2 bg-slate-950 p-3 rounded-xl border border-slate-800 max-w-xs">
                        <div className="font-bold text-slate-200 text-xs flex justify-between items-center">
                          <span className="truncate pr-1 text-amber-500">{attachedExam.title}</span>
                          {isExamPushedLive ? (
                             <span className="text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider animate-pulse border border-emerald-500/20">Pushed</span>
                          ) : (
                             <span className="text-slate-500 text-[10px]">Pending</span>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-1 mt-1">
                          <button
                            onClick={() => handlePushExamToStudents(live.id, attachedExam.id, !!isExamPushedLive)}
                            className={`text-[11px] px-2.5 py-1 rounded font-bold transition flex items-center gap-1 ${isExamPushedLive ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-emerald-600 text-white hover:bg-emerald-500'}`}
                          >
                            {isExamPushedLive ? <EyeOff size={12}/> : <Send size={12}/>}
                            {isExamPushedLive ? 'Retract Paper' : 'Push Paper Live'}
                          </button>

                          <button 
                            onClick={() => {
                              setCurrentLiveId(live.id);
                              setExamData({
                                id: attachedExam.id,
                                title: attachedExam.title,
                                class_type: attachedExam.class_type,
                                pdf_url: attachedExam.pdf_url || '',
                                total_questions: attachedExam.total_questions || 50,
                                correct_answer: attachedExam.correct_answer || {},
                                status: attachedExam.status
                              });
                              setExamModalOpen(true);
                            }}
                            className="text-[11px] bg-slate-800 hover:bg-slate-700 text-amber-400 px-2 py-1 rounded flex items-center gap-1 transition"
                          >
                            <Edit size={12}/> Edit Answers
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1.5 max-w-[200px]">
                        <span className="text-slate-500 text-xs italic">No Answer Sheet Linked</span>
                        
                        <select
                          onChange={(e) => handleQuickLinkExam(live.id, e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded text-xs p-1 text-slate-300 focus:outline-none focus:border-amber-500 cursor-pointer"
                        >
                          <option value="">-- Quick Link Exam --</option>
                          {exams.map(ex => (
                            <option key={ex.id} value={ex.id}>{ex.title}</option>
                          ))}
                        </select>

                        {/* කෙලින්ම පේළියෙන්ම අලුත් Exam එකක් සාදා Link කිරීමේ පහසුකම */}
                        <button
                          type="button"
                          onClick={() => {
                            setCurrentLiveId(live.id);
                            setExamData({ 
                              id: '', 
                              title: `${live.title} - MCQ Paper`, 
                              class_type: live.target_classes?.[0] || 'Theory', 
                              pdf_url: '', 
                              total_questions: 50, 
                              correct_answer: {}, 
                              status: 'pending' 
                            });
                            setExamModalOpen(true);
                          }}
                          className="bg-amber-600/20 hover:bg-amber-600/30 text-amber-400 border border-amber-500/30 px-2 py-1 rounded text-[11px] font-bold transition flex items-center justify-center gap-1 mt-0.5"
                        >
                          <Plus size={12}/> Create & Link New
                        </button>
                      </div>
                    )}
                  </td>
                  
                  {/* STREAM CONTROL ENGINE */}
                  <td className="p-4">
                    <div className="flex flex-col gap-1.5">
                      {live.status === 'scheduled' && <span className="text-slate-400 bg-slate-800 px-2 py-0.5 rounded w-fit text-xs border border-slate-700">Scheduled</span>}
                      {live.status === 'pre_class' && <span className="text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded w-fit text-xs font-bold animate-pulse">Pre-Video Loop</span>}
                      {live.status === 'live' && <span className="text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded w-fit text-xs font-bold flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping"></span> ZOOM LIVE</span>}
                      {live.status === 'ended' && <span className="text-slate-500 bg-slate-950 px-2 py-0.5 rounded w-fit text-xs">Ended</span>}

                      <div className="flex gap-1 mt-0.5">
                        {live.status === 'scheduled' && (
                          <button onClick={() => handleStatusChange(live.id, 'pre_class')} className="bg-amber-600 hover:bg-amber-500 text-[11px] px-2 py-0.5 rounded transition">
                            Start Video
                          </button>
                        )}
                        {(live.status === 'scheduled' || live.status === 'pre_class') && (
                          <a href={live.zoom_start_url} target="_blank" rel="noreferrer" onClick={() => handleStatusChange(live.id, 'live')} className="bg-blue-600 hover:bg-blue-500 text-[11px] px-2 py-0.5 rounded font-bold flex items-center text-white">
                            <Play size={10} className="mr-0.5"/> Start Zoom
                          </a>
                        )}
                        {live.status === 'live' && (
                          <button onClick={() => handleStatusChange(live.id, 'ended')} className="bg-red-600 hover:bg-red-500 text-[11px] px-2 py-0.5 rounded font-bold flex items-center">
                            <Square size={10} className="mr-0.5"/> End Class
                          </button>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* ACTION CONTROLS */}
                  <td className="p-4 text-center">
                    <div className="flex flex-col gap-2 items-center">
                      <button 
                        onClick={() => triggerAttention(live.id)} 
                        disabled={live.status !== 'live'}
                        className={`px-3 py-1 rounded text-xs font-bold flex items-center gap-1 transition ${live.status === 'live' ? 'bg-indigo-600 hover:bg-indigo-500 text-white' : 'bg-slate-800 text-slate-600 cursor-not-allowed'}`}
                      >
                        <BellRing size={13} /> Trigger Attention
                      </button>
                      <div className="flex gap-1.5">
                        <button onClick={() => { setFormData(live); setCurrentLiveId(live.id); setIsModalOpen(true); }} className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded text-amber-400 transition">
                          <Edit size={14} />
                        </button>
                        <button onClick={() => handleDelete(live.id)} className="p-1.5 bg-slate-800 hover:bg-red-950 text-red-400 rounded transition">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
      </div>

      {/* --- LIVE CLASS SCHEDULING / EDIT MODAL --- */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[50] p-4">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl relative">
            <button onClick={() => setIsModalOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white transition"><X size={20}/></button>
            <h2 className="text-xl font-bold text-white mb-4 border-b border-slate-800 pb-2">
              {formData.id ? 'Edit Live Session Settings' : 'Schedule New Live Zoom Class'}
            </h2>
            <form onSubmit={handleSaveLive} className="space-y-4">
              <div>
                <label className="block text-xs font-mono text-slate-400 uppercase mb-1">Class Topic / Title</label>
                <input required type="text" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-blue-500 text-sm" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono text-slate-400 uppercase mb-1">Date</label>
                  <input required type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white text-center text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-mono text-slate-400 uppercase mb-1">Time</label>
                  <input required type="time" value={formData.time} onChange={e => setFormData({...formData, time: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white text-center text-sm" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono text-emerald-400 uppercase mb-1">Target Month</label>
                  <input required type="month" value={formData.target_month} onChange={e => setFormData({...formData, target_month: e.target.value})} className="w-full bg-slate-950 border border-emerald-800 rounded-xl p-3 text-white text-center text-sm font-bold" />
                </div>
                <div>
                  <label className="block text-xs font-mono text-slate-400 uppercase mb-1">Pre-Class Video (Path)</label>
                  <input required type="text" value={formData.pre_class_video_path} onChange={e => setFormData({...formData, pre_class_video_path: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white text-sm" />
                </div>
              </div>

              {/* RETRIEVED FROM class_type COLUMN */}
              <div>
                <label className="block text-xs font-mono text-slate-400 uppercase mb-2">Select Target Classes (සිසුන්ට දර්ශනය වන පන්ති වර්‍ග)</label>
                <div className="grid grid-cols-2 gap-2 bg-slate-950 p-3 rounded-xl border border-slate-800 max-h-36 overflow-y-auto">
                  {classConfigs.map((cfg) => {
                    const cName = cfg.class_type || '';
                    if (!cName) return null;
                    return (
                      <label key={cfg.id} className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer hover:bg-slate-900 p-2 rounded border border-transparent hover:border-slate-800 transition">
                        <input type="checkbox" checked={formData.target_classes.includes(cName)} onChange={() => toggleCheckbox(cName)} className="accent-blue-500 w-4 h-4 rounded" />
                        {cName}
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* ATTACH LIVE EXAM SECTION */}
              <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl">
                <label className="block text-xs font-bold text-amber-500 uppercase mb-2 flex items-center gap-1">
                  <FileText size={14}/> Attach Live Exam (Answer Sheet & Paper)
                </label>
                <div className="flex gap-2">
                  <select 
                    value={formData.active_exam_id || ''} 
                    onChange={e => setFormData({...formData, active_exam_id: e.target.value})} 
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:border-amber-500 text-sm"
                  >
                    <option value="">-- No Exam Attached --</option>
                    {exams.map(ex => (
                      <option key={ex.id} value={ex.id}>{ex.title} ({ex.total_questions} Qs)</option>
                    ))}
                  </select>
                  <button 
                    type="button"
                    onClick={() => {
                      setCurrentLiveId(formData.id || '');
                      setExamData({ id: '', title: `${formData.title || 'Live'} - MCQ Paper`, class_type: formData.target_classes[0] || 'Theory', pdf_url: '', total_questions: 50, correct_answer: {}, status: 'pending' });
                      setExamModalOpen(true);
                    }} 
                    className="bg-amber-600 hover:bg-amber-500 text-black px-4 py-2 rounded-lg text-sm font-extrabold transition flex items-center gap-1 shrink-0"
                  >
                    <Plus size={16}/> Create New
                  </button>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800 mt-6">
                <button type="button" onClick={() => setIsModalOpen(false)} className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-xl text-sm transition">Cancel</button>
                <button type="submit" disabled={isLoading} className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-xl text-sm font-bold transition flex items-center gap-2">
                  {isLoading ? <RefreshCw className="animate-spin" size={16}/> : <CheckSquare size={16}/>} 
                  {formData.id ? 'Save Configuration' : 'Schedule Session'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- EXAM ANSWER SHEET CREATION / MODAL --- */}
      {examModalOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-slate-900 border border-amber-500/20 p-6 rounded-2xl w-full max-w-4xl max-h-[95vh] overflow-hidden flex flex-col shadow-2xl relative">
            <button onClick={() => { setExamModalOpen(false); setCurrentLiveId(''); }} className="absolute top-4 right-4 text-slate-400 hover:text-white transition"><X size={20}/></button>
            <h2 className="text-xl font-bold text-amber-500 mb-4 border-b border-slate-800 pb-2 flex items-center gap-2">
              <FileText /> Dynamic Live MCQ Answer Sheet Wizard
            </h2>
            
            <form onSubmit={handleSaveExam} className="flex flex-col flex-1 overflow-hidden">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4 shrink-0">
                <div className="md:col-span-2">
                  <label className="block text-xs font-mono text-slate-400 mb-1">Exam / Answer Sheet Name</label>
                  <input required type="text" value={examData.title} onChange={e => setExamData({...examData, title: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-mono text-slate-400 mb-1">Total Questions (1 - 200)</label>
                  <input required type="number" min="1" max="200" value={examData.total_questions} onChange={e => setExamData({...examData, total_questions: parseInt(e.target.value) || 0})} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white text-sm text-center font-bold" />
                </div>
                <div className="md:col-span-3">
                  <label className="block text-xs font-mono text-slate-400 mb-1">Google Drive Embed URL</label>
                  <input type="url" value={examData.pdf_url} onChange={e => setExamData({...examData, pdf_url: e.target.value})} placeholder="https://drive.google.com/file/d/.../view" className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white text-sm" />
                </div>
              </div>

              {/* Answer Key Grid */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex-1 overflow-y-auto">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {Array.from({ length: Math.min(examData.total_questions, 200) }).map((_, i) => {
                    const qNum = i + 1;
                    const selectedAns = examData.correct_answer[qNum.toString()];
                    return (
                      <div key={qNum} className="flex items-center justify-between bg-slate-900 p-2 rounded-lg border border-slate-800/80">
                        <span className="text-slate-400 font-mono font-bold text-xs w-6">{qNum}.</span>
                        <div className="flex gap-1">
                          {[1, 2, 3, 4, 5].map(btnIndex => (
                            <button
                              key={btnIndex}
                              type="button"
                              onClick={() => setExamData(prev => ({
                                ...prev,
                                correct_answer: { ...prev.correct_answer, [qNum.toString()]: btnIndex }
                              }))}
                              className={`w-6 h-6 rounded-full text-xs font-bold transition-all ${selectedAns === btnIndex ? 'bg-amber-500 text-black scale-110 shadow-md' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                            >
                              {btnIndex}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800 shrink-0 mt-4">
                <button type="button" onClick={() => { setExamModalOpen(false); setCurrentLiveId(''); }} className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-sm transition">Cancel</button>
                <button type="submit" disabled={isLoading} className="bg-amber-600 hover:bg-amber-500 text-black px-6 py-2 rounded-lg text-sm font-extrabold transition">
                  {isLoading ? 'Saving Changes...' : 'Save & Compile Sheet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}