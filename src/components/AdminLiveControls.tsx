import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Video, Play, Square, Edit, Plus, Clock, Trash2, CheckSquare, FileText, RefreshCw, Send, EyeOff, Calendar, ListOrdered } from 'lucide-react';

export default function AdminLiveControls() {
  const [lives, setLives] = useState<any[]>([]);
  const [classConfigs, setClassConfigs] = useState<any[]>([]);
  const [exams, setExams] = useState<any[]>([]);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [examModalOpen, setExamModalOpen] = useState(false);
  const [currentLiveId, setCurrentLiveId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  // Live Class Form State
  const [formData, setFormData] = useState({
    id: '',
    title: '',
    date: '',
    time: '',
    target_month: '', 
    target_class_type: '',
    active_exam_id: '',
    pre_class_video_path: '/videos/waiting-video.mp4',
    status: 'scheduled'
  });

  // Exam Form State (Hours, Minutes, Seconds ආදානය සඳහා වෙනම උප-ස්ටේට්ස් ඇත)
  const [examDuration, setExamDuration] = useState({ hours: 1, minutes: 30, seconds: 0 });
  const [examData, setExamData] = useState({
    id: '',
    title: '',
    class_type: '',
    pdf_url: '',
    total_questions: 20,
    correct_answer: {} as Record<string, string>,
    status: 'pending' 
  });

  useEffect(() => {
    fetchInitialData();
    
    // Supabase Realtime සක්‍රීය කිරීම - තත්පරයෙන් තත්පරයට Sync වීම සඳහා
    const channel = supabase.channel('realtime-admin-live-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scheduled_lives' }, () => { fetchInitialData(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'exams' }, () => { fetchInitialData(); })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchInitialData = async () => {
    try {
      const { data: livesData } = await supabase.from('scheduled_lives').select('*').order('created_at', { ascending: false });
      if (livesData) setLives(livesData);

      const { data: configsData } = await supabase.from('class_types_config').select('*');
      if (configsData) setClassConfigs(configsData);

      const { data: examsData } = await supabase.from('exams').select('*').order('created_at', { ascending: false });
      if (examsData) setExams(examsData);
    } catch (err) { 
      console.error("Error loading data:", err); 
    }
  };

  // 01. සූම් පන්තිය සුරැකීම සහ කැළැන්ඩරය යාවත්කාලීන කිරීම
  const handleSaveLive = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      let zoomInfo = null;
      // අලුත් පන්තියක් නම් පමණක් සූම් මීටින් එකක් ක්‍රියේට් කිරීම (Edge Function එකක් මඟින්)
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
        target_class_type: formData.target_class_type,
        class_type: formData.target_class_type,
        active_exam_id: formData.active_exam_id || null,
        is_exam_active: !!formData.active_exam_id,
        pre_class_video_path: formData.pre_class_video_path,
        platform: 'zoom',
        status: formData.status || 'scheduled',
        is_active: true,
        ...(zoomInfo && {
          zoom_meeting_id: String(zoomInfo.id),
          zoom_start_url: zoomInfo.start_url,
          zoom_join_url: zoomInfo.join_url,
          link: zoomInfo.join_url
        })
      };

      let liveId = formData.id;

      if (formData.id) {
        // පවතින ක්ලාස් එකක් Update කිරීම
        await supabase.from('scheduled_lives').update(payload).eq('id', formData.id);
      } {
        // අලුත් ක්ලාස් එකක් Insert කිරීම
        const { data: newLive, error: insErr } = await supabase.from('scheduled_lives').insert([payload]).select().single();
        if (!insErr && newLive) liveId = newLive.id;
      }

      // 📅 සිසුවාගේ Calendar Page එක සඳහා calender_events ටේබල් එක යාවත්කාලීන කිරීම
      const calendarPayload = {
        date: formData.date,
        title: formData.title,
        description: `${formData.target_class_type} - Live Zoom Class`,
        status: 'active',
        class_type: formData.target_class_type,
        target_class_type: formData.target_class_type,
        start_time: formData.time
      };

      if (formData.id) {
        await supabase.from('calender_events').update(calendarPayload).eq('title', formData.title).eq('date', formData.date);
      } else {
        await supabase.from('calender_events').insert([calendarPayload]);
      }

      setIsModalOpen(false);
      await fetchInitialData();
    } catch (err: any) {
      alert(err.message || "Error saving session.");
    } finally {
      setIsLoading(false);
    }
  };

  // ක්ලාස් එකක් සහ එක්සෑම් එකක් ක්ෂණිකව එකිනෙකට සම්බන්ධ කිරීම (Quick Link)
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
    if (confirm("මෙම සජීවී පන්තිය මකා දැමීමට අවශ්‍යද?")) {
      await supabase.from('scheduled_lives').delete().eq('id', id);
      await fetchInitialData();
    }
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    await supabase.from('scheduled_lives').update({ status: newStatus }).eq('id', id);
    await fetchInitialData();
  };

  // MCQ Answer එක වෙනස් කිරීමේදී ප්‍රධාන ස්ටේට් එක අප්ඩේට් කිරීම
  const handleAnswerChange = (questionNum: number, value: string) => {
    setExamData(prev => ({
      ...prev,
      correct_answer: {
        ...prev.correct_answer,
        [questionNum]: value
      }
    }));
  };

  // 02. ඔන්ලයින් එක්සෑම් එකක් නිර්මාණය කිරීම සහ සුරැකීම
  const handleSaveExam = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    // පැය, විනාඩි, තත්පර සියල්ලම දත්තගබඩාවේ duration_minutes (int4) සඳහා මිනිත්තු බවට පරිවර්තනය කිරීම
    const totalMinutes = (examDuration.hours * 60) + examDuration.minutes + Math.round(examDuration.seconds / 60);

    try {
      const payload = {
        title: examData.title,
        class_type: examData.class_type || formData.target_class_type || 'Theory',
        target_class_type: examData.class_type || formData.target_class_type || 'Theory',
        pdf_url: examData.pdf_url,
        total_questions: Number(examData.total_questions),
        duration_minutes: totalMinutes,
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

      // මෙම එක්සෑම් එක යම් කිසි ලයිව් ක්ලාස් එකක සිට සෑදුවේ නම් එය එසැණින් සම්බන්ධ කිරීම
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
      alert("ප්‍රශ්න පත්‍රය සහ නිවැරදි පිළිතුරු පත්‍රය සාර්ථකව යාවත්කාලීන කරන ලදී!");
      await fetchInitialData();
    } catch (error: any) {
      alert("Exam Save Error: " + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  // විභාගය සිසුන්ගේ තිරය මතට Push කිරීම හෝ ඉවත් කිරීම
  const handlePushExamToStudents = async (liveId: string, examId: string, currentPushState: boolean) => {
    const nextState = !currentPushState;
    try {
      await supabase.from('scheduled_lives').update({ is_exam_active: nextState, active_exam_id: examId }).eq('id', liveId);
      await supabase.from('exams').update({ status: nextState ? 'active' : 'pending' }).eq('id', examId);
      alert(nextState ? "🚀 විභාගය සිසුන්ගේ Screen එකට සාර්ථකව Push කරන ලදී!" : "🛑 විභාගය සිසුන්ගේ තිරයෙන් ඉවත් කරන ලදී.");
      await fetchInitialData();
    } catch (err) {
      alert("Push operation failed.");
    }
  };

  return (
    <div className="w-full bg-slate-950 min-h-screen text-white p-4 md:p-8 font-sans">
      
      {/* Upper Control Banner */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 bg-slate-900 p-6 rounded-2xl border border-slate-800">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-blue-500 flex items-center gap-2">
            <Video size={32} className="animate-pulse" /> Live Administration Dashboard
          </h1>
          <p className="text-slate-400 text-sm mt-1">සූම් පන්ති සහ ඔන්ලයින් ප්‍රශ්න පත්‍ර (Push MCQ Paper) එකවර පාලනය කරන ප්‍රධාන පාලන පැනලය.</p>
        </div>
        <button 
          onClick={() => {
            setFormData({ id: '', title: '', date: '', time: '', target_month: '', target_class_type: '', active_exam_id: '', pre_class_video_path: '/videos/waiting-video.mp4', status: 'scheduled' });
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
                <th className="p-4">Target Class Type</th>
                <th className="p-4">Online MCQ Exam & Push Controls</th>
                <th className="p-4">Stream Control Engine</th>
                <th className="p-4 text-center">Actions</th>
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
                    <span className="bg-blue-950 text-blue-300 px-3 py-1 rounded-full text-xs font-bold border border-blue-800/50">
                      {live.target_class_type || 'General'}
                    </span>
                  </td>
                  
                  {/* LIVE EXAM PANEL */}
                  <td className="p-4">
                    {attachedExam ? (
                      <div className="flex flex-col gap-2 bg-slate-950 p-3 rounded-xl border border-slate-800 max-w-xs">
                        <div className="font-bold text-slate-200 text-xs flex justify-between items-center">
                          <span className="truncate pr-1 text-amber-500">{attachedExam.title}</span>
                          {isExamPushedLive ? (
                             <span className="text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider animate-pulse border border-emerald-500/20">Pushed Live</span>
                          ) : (
                             <span className="text-slate-500 text-[10px]">Hidden</span>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-1 mt-1">
                          <button
                            onClick={() => handlePushExamToStudents(live.id, attachedExam.id, !!isExamPushedLive)}
                            className={`text-[11px] px-2.5 py-1 rounded font-bold transition flex items-center gap-1 ${isExamPushedLive ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-emerald-600 text-white hover:bg-emerald-500'}`}
                          >
                            {isExamPushedLive ? <EyeOff size={12}/> : <Send size={12}/>}
                            {isExamPushedLive ? 'Hide Exam' : 'Push Exam Live'}
                          </button>

                          <button 
                            onClick={() => {
                              setCurrentLiveId(live.id);
                              const durationTotal = attachedExam.duration_minutes || 90;
                              const h = Math.floor(durationTotal / 60);
                              const m = durationTotal % 60;
                              setExamDuration({ hours: h, minutes: m, seconds: 0 });
                              setExamData({
                                id: attachedExam.id,
                                title: attachedExam.title,
                                class_type: attachedExam.class_type,
                                pdf_url: attachedExam.pdf_url || '',
                                total_questions: attachedExam.total_questions || 20,
                                correct_answer: attachedExam.correct_answer || {},
                                status: attachedExam.status
                              });
                              setExamModalOpen(true);
                            }}
                            className="text-[11px] bg-slate-800 hover:bg-slate-700 text-amber-400 px-2 py-1 rounded flex items-center gap-1 transition"
                          >
                            <Edit size={12}/> Edit Answers / Time
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1.5 max-w-[200px]">
                        <span className="text-slate-500 text-xs italic">No Exam Attached</span>
                        <select
                          onChange={(e) => handleQuickLinkExam(live.id, e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded text-xs p-1 text-slate-300 focus:outline-none focus:border-amber-500 cursor-pointer"
                        >
                          <option value="">-- Link Existing Exam --</option>
                          {exams.map(ex => (
                            <option key={ex.id} value={ex.id}>{ex.title}</option>
                          ))}
                        </select>

                        <button
                          type="button"
                          onClick={() => {
                            setCurrentLiveId(live.id);
                            setExamDuration({ hours: 1, minutes: 30, seconds: 0 });
                            setExamData({ 
                              id: '', 
                              title: `${live.title} - MCQ Paper`, 
                              class_type: live.target_class_type || '', 
                              pdf_url: '', 
                              total_questions: 20, 
                              correct_answer: {}, 
                              status: 'pending' 
                            });
                            setExamModalOpen(true);
                          }}
                          className="bg-amber-600/20 hover:bg-amber-600/30 text-amber-400 border border-amber-500/30 px-2 py-1 rounded text-[11px] font-bold transition flex items-center justify-center gap-1 mt-0.5"
                        >
                          <Plus size={12}/> Create & Link New Exam
                        </button>
                      </div>
                    )}
                  </td>
                  
                  {/* STREAM CONTROL ENGINE */}
                  <td className="p-4">
                    <div className="flex flex-col gap-1.5">
                      {live.status === 'scheduled' && <span className="text-slate-400 bg-slate-800 px-2 py-0.5 rounded w-fit text-xs border border-slate-700">Scheduled (Waiting Loop ready)</span>}
                      {live.status === 'pre_class' && <span className="text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded w-fit text-xs font-bold animate-pulse">Pre-Video Playing</span>}
                      {live.status === 'live' && <span className="text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded w-fit text-xs font-bold flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping"></span> ZOOM LIVE</span>}
                      {live.status === 'ended' && <span className="text-slate-500 bg-slate-950 px-2 py-0.5 rounded w-fit text-xs">Ended</span>}

                      <div className="flex gap-1 mt-0.5">
                        {live.status === 'scheduled' && (
                          <button onClick={() => handleStatusChange(live.id, 'pre_class')} className="bg-amber-600 hover:bg-amber-500 text-[11px] text-black font-bold px-2 py-0.5 rounded transition">
                            Trigger Video Loop
                          </button>
                        )}
                        {(live.status === 'scheduled' || live.status === 'pre_class') && (
                          <a href={live.zoom_start_url} target="_blank" rel="noreferrer" onClick={() => handleStatusChange(live.id, 'live')} className="bg-blue-600 hover:bg-blue-500 text-[11px] px-2 py-0.5 rounded font-bold flex items-center text-white">
                            <Play size={10} className="mr-0.5"/> Start Zoom Meet
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
                    <div className="flex gap-2 justify-center">
                      <button onClick={() => { setFormData(live); setCurrentLiveId(live.id); setIsModalOpen(true); }} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-amber-400 transition">
                        <Edit size={16} />
                      </button>
                      <button onClick={() => handleDelete(live.id)} className="p-2 bg-slate-800 hover:bg-red-950 text-red-400 rounded-lg transition">
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

      {/* --- 01. ZOOM CLASS SCHEDULING / EDIT MODAL --- */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[50] p-4">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl relative">
            <button onClick={() => setIsModalOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white transition">&times;</button>
            <h2 className="text-xl font-bold text-white mb-4 border-b border-slate-800 pb-2 flex items-center gap-2">
              <Calendar size={22} className="text-blue-500" /> {formData.id ? 'Edit Live Session Settings' : 'Schedule New Live Zoom Class'}
            </h2>
            <form onSubmit={handleSaveLive} className="space-y-4">
              <div>
                <label className="block text-xs font-mono text-slate-400 uppercase mb-1">Class Topic / Title</label>
                <input required type="text" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-blue-500 text-sm" placeholder="E.g., 2026 Pure Maths Theory" />
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
                  <label className="block text-xs font-mono text-emerald-400 uppercase mb-1">Target Year & Month</label>
                  <input required type="month" value={formData.target_month} onChange={e => setFormData({...formData, target_month: e.target.value})} className="w-full bg-slate-950 border border-emerald-800 rounded-xl p-3 text-white text-center text-sm font-bold" />
                </div>
                <div>
                  <label className="block text-xs font-mono text-slate-400 uppercase mb-1">Pre-Class Waiting Video (System Path)</label>
                  <input required type="text" value={formData.pre_class_video_path} onChange={e => setFormData({...formData, pre_class_video_path: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white text-sm font-mono text-slate-400" />
                </div>
              </div>

              {/* DYNAMIC RETRIEVAL FROM class_types_config */}
              <div>
                <label className="block text-xs font-mono text-slate-400 uppercase mb-2">Select Target Class Type (පන්ති වර්ගය)</label>
                <select
                  required
                  value={formData.target_class_type}
                  onChange={e => setFormData({...formData, target_class_type: e.target.value})}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white text-sm focus:outline-none focus:border-blue-500"
                >
                  <option value="">-- තෝරන්න (Select Class Type) --</option>
                  {classConfigs.map((cfg) => (
                    <option key={cfg.id} value={cfg.class_types}>{cfg.class_types}</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800 mt-6">
                <button type="button" onClick={() => setIsModalOpen(false)} className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-xl text-sm transition">Cancel</button>
                <button type="submit" disabled={isLoading} className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-xl text-sm font-bold transition flex items-center gap-2">
                  {isLoading ? <RefreshCw className="animate-spin" size={16}/> : <CheckSquare size={16}/>} 
                  {formData.id ? 'Save Changes & Update Calendar' : 'Schedule & Broadcast Live'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- 02. EXAM ANSWER SHEET CREATION / MODAL --- */}
      {examModalOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-slate-900 border border-amber-500/30 p-6 rounded-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto shadow-2xl relative">
            <button onClick={() => { setExamModalOpen(false); setCurrentLiveId(''); }} className="absolute top-4 right-4 text-slate-400 hover:text-white text-xl transition">&times;</button>
            
            <h2 className="text-xl font-bold text-amber-400 mb-4 border-b border-slate-800 pb-2 flex items-center gap-2">
              <FileText size={22} /> Online MCQ Exam Architecture Panel
            </h2>

            <form onSubmit={handleSaveExam} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono text-slate-400 uppercase mb-1">Exam Paper Title</label>
                  <input required type="text" value={examData.title} onChange={e => setExamData({...examData, title: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white text-sm focus:outline-none focus:border-amber-500" placeholder="E.g., MCQ Paper 01" />
                </div>
                <div>
                  <label className="block text-xs font-mono text-slate-400 uppercase mb-1">Paper Google Drive Link (PDF URL)</label>
                  <input required type="url" value={examData.pdf_url} onChange={e => setExamData({...examData, pdf_url: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white text-sm font-mono focus:outline-none focus:border-amber-500" placeholder="https://drive.google.com/file/d/..." />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono text-slate-400 uppercase mb-1">Class Type Mapping</label>
                  <select
                    required
                    value={examData.class_type}
                    onChange={e => setExamData({...examData, class_type: e.target.value})}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white text-sm focus:outline-none focus:border-amber-500"
                  >
                    <option value="">-- Select Class Type --</option>
                    {classConfigs.map((cfg) => (
                      <option key={cfg.id} value={cfg.class_types}>{cfg.class_types}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-mono text-amber-500 uppercase mb-1">Number of Questions (ප්‍රශ්න සංඛ්‍යාව)</label>
                  <input required type="number" min="1" max="100" value={examData.total_questions} onChange={e => setExamData({...examData, total_questions: Number(e.target.value)})} className="w-full bg-slate-950 border border-amber-500/20 rounded-xl p-3 text-white text-sm font-bold focus:outline-none focus:border-amber-500" />
                </div>
              </div>

              {/* DURATION SELECTION (HOURS, MINUTES, SECONDS) */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <label className="block text-xs font-bold text-slate-300 uppercase mb-2 flex items-center gap-1">
                  Time Allocation Matrix (කාලය වෙන් කිරීම)
                </label>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Hours</label>
                    <input type="number" min="0" value={examDuration.hours} onChange={e => setExamDuration({...examDuration, hours: Number(e.target.value)})} className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-center font-mono text-white" />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Minutes</label>
                    <input type="number" min="0" max="59" value={examDuration.minutes} onChange={e => setExamDuration({...examDuration, minutes: Number(e.target.value)})} className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-center font-mono text-white" />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Seconds</label>
                    <input type="number" min="0" max="59" value={examDuration.seconds} onChange={e => setExamDuration({...examDuration, seconds: Number(e.target.value)})} className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-center font-mono text-white" />
                  </div>
                </div>
              </div>

              {/* DYNAMIC MCQ KEY MATRIX (5 OPTIONS PER QUESTION) */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <label className="block text-xs font-bold text-amber-400 uppercase mb-3 flex items-center gap-1">
                  <ListOrdered size={14}/> Mark Correct Answers (නිවැරදි පිළිතුරු ඇතුළත් කිරීමේ පුවරුව)
                </label>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[220px] overflow-y-auto pr-2">
                  {Array.from({ length: examData.total_questions || 0 }).map((_, i) => {
                    const qNum = i + 1;
                    return (
                      <div key={qNum} className="flex items-center justify-between bg-slate-900/60 p-2 rounded-xl border border-slate-800/80">
                        <span className="font-bold font-mono text-xs text-slate-400">Q-{qNum.toString().padStart(2, '0')} :</span>
                        <div className="flex gap-1">
                          {['1', '2', '3', '4', '5'].map((opt) => (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => handleAnswerChange(qNum, opt)}
                              className={`w-7 h-7 rounded-full font-mono text-xs font-bold border transition-all ${
                                String(examData.correct_answer[qNum]) === opt
                                  ? 'bg-amber-500 text-slate-950 border-amber-500 scale-110 shadow-md'
                                  : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800'
                              }`}
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800 mt-6">
                <button type="button" onClick={() => { setExamModalOpen(false); setCurrentLiveId(''); }} className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-xl text-sm transition">Cancel</button>
                <button type="submit" disabled={isLoading} className="bg-amber-600 hover:bg-amber-500 text-slate-950 px-6 py-2 rounded-xl text-sm font-extrabold transition flex items-center gap-2">
                  {isLoading ? <RefreshCw className="animate-spin" size={16}/> : <CheckSquare size={16}/>} 
                  {examData.id ? 'Save & Sync Answers' : 'Compile & Link Answer Sheet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}