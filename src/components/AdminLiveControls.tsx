import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Video, Play, Square, Edit, Plus, Clock, Trash2, CheckSquare, FileText, Send, EyeOff } from 'lucide-react';

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
    target_classes: [] as string[],
    active_exam_id: '',
    pre_class_video_path: '/videos/waiting-video.mp4',
    target_class_type: ''
  });

  // Exam Form State (Duration added as Hours, Mins, Secs)
  const [examData, setExamData] = useState({
    id: '',
    title: '',
    class_type: '',
    pdf_url: '',
    total_questions: 50,
    durationHours: 1,
    durationMinutes: 30,
    durationSeconds: 0,
    correct_answer: {} as Record<string, number>,
    status: 'pending' 
  });

  useEffect(() => {
    fetchInitialData();
    
    // Supabase Realtime - Changes will instantly reflect
    const channel = supabase.channel('realtime-admin-dashboard')
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
    } catch (err) { console.error("Error fetching data", err); }
  };

  const handleSaveLive = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      let zoomInfo = null;
      if (!formData.id) {
        // Zoom API Edge Function (ඔබගේ තිබෙන ආකාරයටම)
        const { data: edgeData, error: edgeError } = await supabase.functions.invoke('create-zoom-meeting', {
          body: { topic: formData.title, start_time: `${formData.date}T${formData.time}:00` }
        });
        if (!edgeError) zoomInfo = edgeData;
      }

      const mainClassType = formData.target_classes[0] || 'Theory';

      const payload = {
        title: formData.title,
        date: formData.date,
        time: formData.time,
        target_month: formData.target_month,
        target_classes: formData.target_classes,
        target_class_type: mainClassType, 
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
        // අලුතින් පන්තියක් සෑදීමේදී එය scheduled_lives වලට සහ calender_events වලට එකතු කිරීම
        await supabase.from('scheduled_lives').insert([payload]);
        
        await supabase.from('calender_events').insert([{
          date: formData.date,
          title: formData.title,
          description: `Zoom Live Class - ${mainClassType}`,
          status: 'scheduled',
          target_class_type: mainClassType,
          class_type: mainClassType,
          start_time: formData.time
        }]);
      }

      setIsModalOpen(false);
      await fetchInitialData();
    } catch (err: any) {
      alert(err.message || "Error saving session.");
    } finally {
      setIsLoading(false);
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

  // Exam Answer Sheet Logic
  const handleAnswerChange = (qNum: number, ans: number) => {
    setExamData(prev => ({
      ...prev,
      correct_answer: { ...prev.correct_answer, [qNum]: ans }
    }));
  };

  const handleSaveExam = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    // DB එකේ int4 (duration_minutes) තිබෙන බැවින් සියලු කාලයන් මිනිත්තු වලට පරිවර්තනය කිරීම
    const totalMinutes = (examData.durationHours * 60) + examData.durationMinutes + Math.round(examData.durationSeconds / 60);

    try {
      const payload = {
        title: examData.title,
        class_type: examData.class_type || formData.target_classes[0] || 'Theory',
        target_class_type: examData.class_type || formData.target_classes[0] || 'Theory',
        pdf_url: examData.pdf_url,
        total_questions: examData.total_questions,
        duration_minutes: totalMinutes,
        correct_answer: examData.correct_answer,
        status: examData.status || 'pending'
      };

      let targetExamId = examData.id;

      if (examData.id) {
        await supabase.from('exams').update(payload).eq('id', examData.id);
      } else {
        const { data } = await supabase.from('exams').insert([payload]).select().single();
        if (data) targetExamId = data.id;
      }

      // Exam එක Live class එකට Link කිරීම
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
      alert("Paper & Answers සාර්ථකව සේව් කරන ලදී!");
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
      await fetchInitialData();
    } catch (err) {
      alert("Push operation failed.");
    }
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    await supabase.from('scheduled_lives').update({ status: newStatus }).eq('id', id);
    await fetchInitialData();
  };

  const handleDelete = async (id: string) => {
    if (confirm("මෙම පන්තිය මකා දැමීමට අවශ්‍යද?")) {
      await supabase.from('scheduled_lives').delete().eq('id', id);
      await fetchInitialData();
    }
  };

  return (
    <div className="w-full bg-slate-950 min-h-screen text-white p-4 md:p-8 font-sans">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 bg-slate-900 p-6 rounded-2xl border border-slate-800">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-blue-500 flex items-center gap-2">
            <Video size={32} className="animate-pulse" /> Live Administration Dashboard
          </h1>
          <p className="text-slate-400 text-sm mt-1">සූම් පන්ති සහ ප්‍රශ්න පත්‍ර කළමනාකරණය.</p>
        </div>
        <button 
          onClick={() => {
            setFormData({ id: '', title: '', date: '', time: '', target_month: '', target_classes: [], active_exam_id: '', pre_class_video_path: '/videos/waiting-video.mp4', target_class_type: '' });
            setCurrentLiveId('');
            setIsModalOpen(true);
          }}
          className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-3 rounded-xl flex items-center gap-2 font-semibold shadow-lg"
        >
          <Plus size={20} /> Schedule New Live Class
        </button>
      </div>

      {/* Main Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-950 text-slate-400 text-xs uppercase font-mono border-b border-slate-800">
              <tr>
                <th className="p-4">Class Information</th>
                <th className="p-4">Target Groups</th>
                <th className="p-4">Live Exam Panel</th>
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
                      Target Month: {live.target_month || 'N/A'}
                    </div>
                  </td>

                  <td className="p-4">
                    <div className="flex flex-wrap gap-1 max-w-[180px]">
                      {live.target_classes?.map((c: string) => (
                        <span key={c} className="bg-slate-950 text-slate-300 px-2 py-0.5 rounded text-[10px] border border-slate-800">{c}</span>
                      ))}
                    </div>
                  </td>
                  
                  {/* EXAM CONTROL COLUMN */}
                  <td className="p-4">
                    {attachedExam ? (
                      <div className="flex flex-col gap-2 bg-slate-950 p-3 rounded-xl border border-slate-800 max-w-xs">
                        <div className="font-bold text-slate-200 text-xs flex justify-between items-center">
                          <span className="truncate pr-1 text-amber-500">{attachedExam.title}</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded ${isExamPushedLive ? 'text-emerald-400 bg-emerald-400/10 border border-emerald-500/20 animate-pulse' : 'text-slate-500'}`}>
                            {isExamPushedLive ? 'PUSHED' : 'PENDING'}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1">
                          <button
                            onClick={() => handlePushExamToStudents(live.id, attachedExam.id, !!isExamPushedLive)}
                            className={`text-[11px] px-2.5 py-1 rounded font-bold transition flex items-center gap-1 ${isExamPushedLive ? 'bg-red-500 hover:bg-red-600' : 'bg-emerald-600 hover:bg-emerald-500'}`}
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
                                durationHours: Math.floor(attachedExam.duration_minutes / 60) || 0,
                                durationMinutes: attachedExam.duration_minutes % 60 || 0,
                                durationSeconds: 0,
                                correct_answer: attachedExam.correct_answer || {},
                                status: attachedExam.status
                              });
                              setExamModalOpen(true);
                            }}
                            className="text-[11px] bg-slate-800 hover:bg-slate-700 text-amber-400 px-2 py-1 rounded flex items-center gap-1"
                          >
                            <Edit size={12}/> Edit Exam
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setCurrentLiveId(live.id);
                          setExamData({ 
                            id: '', 
                            title: `${live.title} - Exam`, 
                            class_type: live.target_classes?.[0] || 'Theory', 
                            pdf_url: '', 
                            total_questions: 10,
                            durationHours: 1, durationMinutes: 30, durationSeconds: 0, 
                            correct_answer: {}, 
                            status: 'pending' 
                          });
                          setExamModalOpen(true);
                        }}
                        className="bg-amber-600/20 hover:bg-amber-600/30 text-amber-400 border border-amber-500/30 px-3 py-1.5 rounded text-xs font-bold transition flex items-center gap-1"
                      >
                        <Plus size={12}/> Create & Attach Exam
                      </button>
                    )}
                  </td>
                  
                  {/* ZOOM STREAM CONTROL */}
                  <td className="p-4">
                    <div className="flex flex-col gap-1.5">
                      {live.status === 'scheduled' && <span className="text-slate-400 bg-slate-800 px-2 py-0.5 rounded w-fit text-xs border border-slate-700">Scheduled</span>}
                      {live.status === 'live' && <span className="text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded w-fit text-xs font-bold flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping"></span> ZOOM LIVE</span>}
                      {live.status === 'ended' && <span className="text-slate-500 bg-slate-950 px-2 py-0.5 rounded w-fit text-xs">Ended</span>}

                      <div className="flex gap-1 mt-0.5">
                        {live.status === 'scheduled' && (
                          <a href={live.zoom_start_url} target="_blank" rel="noreferrer" onClick={() => handleStatusChange(live.id, 'live')} className="bg-blue-600 hover:bg-blue-500 text-[11px] px-3 py-1.5 rounded font-bold flex items-center text-white">
                            <Play size={12} className="mr-1"/> Start Zoom 
                          </a>
                        )}
                        {live.status === 'live' && (
                          <button onClick={() => handleStatusChange(live.id, 'ended')} className="bg-red-600 hover:bg-red-500 text-[11px] px-3 py-1.5 rounded font-bold flex items-center text-white">
                            <Square size={12} className="mr-1"/> End Class
                          </button>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* ACTION CONTROLS */}
                  <td className="p-4 text-center">
                    <div className="flex justify-center gap-2">
                      <button onClick={() => { setFormData(live); setCurrentLiveId(live.id); setIsModalOpen(true); }} className="p-2 bg-slate-800 hover:bg-slate-700 rounded text-amber-400">
                        <Edit size={16} />
                      </button>
                      <button onClick={() => handleDelete(live.id)} className="p-2 bg-slate-800 hover:bg-red-950 text-red-400 rounded">
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
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[50] p-4">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl w-full max-w-2xl shadow-2xl relative">
            <h2 className="text-xl font-bold text-white mb-4 border-b border-slate-800 pb-2">
              {formData.id ? 'Edit Live Session' : 'Schedule New Live Zoom Class'}
            </h2>
            <form onSubmit={handleSaveLive} className="space-y-4">
              <div>
                <label className="block text-xs font-mono text-slate-400 uppercase mb-1">Class Topic</label>
                <input required type="text" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-blue-500 text-sm" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono text-slate-400 uppercase mb-1">Date</label>
                  <input required type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-mono text-slate-400 uppercase mb-1">Time</label>
                  <input required type="time" value={formData.time} onChange={e => setFormData({...formData, time: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white text-sm" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono text-emerald-400 uppercase mb-1">Target Month</label>
                  <input required type="month" value={formData.target_month} onChange={e => setFormData({...formData, target_month: e.target.value})} className="w-full bg-slate-950 border border-emerald-800 rounded-xl p-3 text-white text-sm font-bold" />
                </div>
                <div>
                  <label className="block text-xs font-mono text-slate-400 uppercase mb-1">Waiting Video Path</label>
                  <input required type="text" value={formData.pre_class_video_path} onChange={e => setFormData({...formData, pre_class_video_path: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white text-sm" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono text-slate-400 uppercase mb-2">Select Target Classes (අනිවාර්යයි)</label>
                <div className="grid grid-cols-2 gap-2 bg-slate-950 p-3 rounded-xl border border-slate-800 max-h-36 overflow-y-auto">
                  {classConfigs.map((cfg) => {
                    if (!cfg.class_types) return null; // Using correct DB column name
                    return (
                      <label key={cfg.id} className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                        <input type="checkbox" checked={formData.target_classes.includes(cfg.class_types)} onChange={() => toggleCheckbox(cfg.class_types)} className="accent-blue-500 w-4 h-4 rounded" />
                        {cfg.class_types}
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 mt-6">
                <button type="button" onClick={() => setIsModalOpen(false)} className="bg-slate-800 text-white px-4 py-2 rounded-xl text-sm">Cancel</button>
                <button type="submit" disabled={isLoading} className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-xl text-sm font-bold">
                  {formData.id ? 'Update Class' : 'Schedule Session'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- EXAM CREATION MODAL --- */}
      {examModalOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-slate-900 border border-amber-500/20 p-6 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <h2 className="text-xl font-bold text-white mb-6 border-b border-slate-800 pb-2 flex items-center gap-2">
              <FileText className="text-amber-500" /> Create / Edit Online Exam
            </h2>
            
            <form onSubmit={handleSaveExam} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-400 uppercase mb-1">Exam Title</label>
                  <input required type="text" value={examData.title} onChange={e => setExamData({...examData, title: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded p-3 text-white text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 uppercase mb-1">Google Drive PDF URL</label>
                  <input required type="url" value={examData.pdf_url} onChange={e => setExamData({...examData, pdf_url: e.target.value})} placeholder="https://drive.google.com/file/d/..." className="w-full bg-slate-950 border border-slate-800 rounded p-3 text-white text-sm" />
                </div>
              </div>

              {/* DURATION SELECTION */}
              <div className="bg-slate-950 p-4 border border-slate-800 rounded-xl">
                <label className="block text-sm font-bold text-slate-300 mb-3">Exam Duration (කාලය තෝරන්න)</label>
                <div className="flex gap-4">
                  <div className="flex flex-col">
                    <label className="text-xs text-slate-500 mb-1">Hours</label>
                    <input type="number" min="0" value={examData.durationHours} onChange={e => setExamData({...examData, durationHours: Number(e.target.value)})} className="w-20 bg-slate-900 border border-slate-700 rounded p-2 text-white text-center" />
                  </div>
                  <div className="flex flex-col">
                    <label className="text-xs text-slate-500 mb-1">Minutes</label>
                    <input type="number" min="0" max="59" value={examData.durationMinutes} onChange={e => setExamData({...examData, durationMinutes: Number(e.target.value)})} className="w-20 bg-slate-900 border border-slate-700 rounded p-2 text-white text-center" />
                  </div>
                  <div className="flex flex-col">
                    <label className="text-xs text-slate-500 mb-1">Seconds</label>
                    <input type="number" min="0" max="59" value={examData.durationSeconds} onChange={e => setExamData({...examData, durationSeconds: Number(e.target.value)})} className="w-20 bg-slate-900 border border-slate-700 rounded p-2 text-white text-center" />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-300 mb-2">Total Questions Count</label>
                <input type="number" min="1" max="100" value={examData.total_questions} onChange={e => setExamData({...examData, total_questions: Number(e.target.value)})} className="w-32 bg-slate-950 border border-slate-800 rounded p-2 text-white text-center" />
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <label className="block text-sm font-bold text-amber-500 mb-4">Mark Correct Answers (1-5)</label>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {Array.from({ length: examData.total_questions }, (_, i) => i + 1).map((qNum) => (
                    <div key={qNum} className="flex items-center gap-2 bg-slate-900 p-2 border border-slate-700 rounded">
                      <span className="font-bold text-slate-400 w-6">{qNum}.</span>
                      <select 
                        required
                        value={examData.correct_answer[qNum] || ''} 
                        onChange={(e) => handleAnswerChange(qNum, Number(e.target.value))}
                        className="bg-slate-800 text-white p-1 rounded w-full border-none focus:ring-1 focus:ring-amber-500"
                      >
                        <option value="" disabled>-</option>
                        {[1, 2, 3, 4, 5].map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800 mt-6">
                <button type="button" onClick={() => setExamModalOpen(false)} className="bg-slate-800 text-white px-4 py-2 rounded-xl text-sm">Cancel</button>
                <button type="submit" disabled={isLoading} className="bg-amber-600 hover:bg-amber-500 text-black font-bold px-6 py-2 rounded-xl text-sm flex items-center gap-2">
                  <CheckSquare size={16}/> Save Exam Paper
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}