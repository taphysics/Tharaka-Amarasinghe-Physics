import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Radio, Users, Send, BellRing, Trophy, FilePlus } from 'lucide-react';

const AdminLiveControls: React.FC = () => {
  const [liveSessions, setLiveSessions] = useState<any[]>([]);
  const [pushedExams, setPushedExams] = useState<any[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<string>('');
  const [examReports, setExamReports] = useState<any[]>([]);
  const [attendanceList, setAttendanceList] = useState<any[]>([]);

  // Push Exam Configurations Forms States
  const [newExamTitle, setNewExamTitle] = useState('');
  const [pdfUrl, setPdfUrl] = useState('');
  const [duration, setDuration] = useState('20');
  const [totalQuestions, setTotalQuestions] = useState('25');
  const [classCat, setClassCat] = useState('Theory');

  useEffect(() => {
    fetchAdminData();
    // Realtime Exam Submissions Listening for Admin View
    const subChannel = supabase
      .channel('admin_reports')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'online_exams_submissions' }, (p) => {
        setExamReports(prev => [p.new, ...prev]);
      })
      .subscribe();

    return () => { supabase.removeChannel(subChannel); };
  }, []);

  const fetchAdminData = async () => {
    const { data: lives } = await supabase.from('live_schedules').select('*');
    if (lives) setLiveSessions(lives);

    const { data: exms } = await supabase.from('online_exams').select('*').order('created_at', { ascending: false });
    if (exms) setPushedExams(exms);
  };

  // Create New Exam Document Sheet Meta Entry
  const handleCreateExamSheet = async () => {
    if (!newExamTitle || !pdfUrl) return alert('කරුණාකර සියලු විස්තර පුරවන්න!');
    await supabase.from('online_exams').insert({
      title: newExamTitle,
      pdf_url: pdfUrl,
      class_type: classCat,
      duration_minutes: parseInt(duration),
      total_questions: parseInt(totalQuestions),
      target_year: '2026',
      target_month: '06'
    });
    alert('විභාග ප්‍රශ්න පත්‍රය සාර්ථකව පද්ධතියට එක් විය!');
    fetchAdminData();
  };

  // Push Exam Sheet to Active Students Live Video Frames Screen
  const handlePushExamToLive = async (sessionId: string) => {
    if (!selectedExamId) return alert('කරුණාකර මුලින්ම පත්‍රයක් තෝරාගන්න!');
    await supabase.from('live_schedules').update({ pushed_exam_id: selectedExamId }).eq('id', sessionId);
    alert('විභාගය සිසුන්ගේ තිරය මතට Push කරන ලදී!');
  };

  // Toggle Attention Check Prompt Trigger Switcher Box Engine
  const handleTriggerAttentionAlert = async (sessionId: string, currentState: boolean) => {
    await supabase.from('live_schedules').update({ attention_check_active: !currentState }).eq('id', sessionId);
    if (!currentState) {
      // Clear old logs to populate new analytics fresh
      await supabase.from('live_attendance').delete().eq('live_schedule_id', sessionId);
    }
    fetchAdminData();
  };

  return (
    <div className="bg-slate-950 min-h-screen text-white p-6 space-y-8 font-sans">
      <div className="border-b border-slate-800 pb-4">
        <h2 className="text-xl font-black text-amber-400 flex items-center gap-2"><Radio className="animate-pulse" /> LIVE STREAM ENGINE COMMAND CENTER</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Side Console: Active Channels Controller Units */}
        <div className="lg:col-span-7 space-y-6">
          {liveSessions.map(session => (
            <div key={session.id} className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
              <div className="flex justify-between items-center">
                <span className="px-3 py-1 bg-slate-950 border border-slate-800 text-xs font-mono font-bold text-amber-400 rounded-lg">{session.class_type} Channel</span>
                <span className={`w-3 h-3 rounded-full ${session.is_active ? 'bg-red-500 animate-ping' : 'bg-slate-700'}`} />
              </div>
              <h3 className="font-bold text-base">{session.title}</h3>

              {/* Push Core Tools Actions Cluster */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div className="space-y-1.5">
                  <select value={selectedExamId} onChange={e => setSelectedExamId(e.target.value)} className="w-full bg-slate-950 border border-slate-800 p-2 rounded-xl text-xs text-white">
                    <option value="">-- Select Exam Sheet --</option>
                    {pushedExams.filter(e => e.class_type === session.class_type).map(e => (
                      <option key={e.id} value={e.id}>{e.title}</option>
                    ))}
                  </select>
                  <button onClick={() => handlePushExamToLive(session.id)} className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-black p-2 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow">
                    <Send size={14} /> Push Exam to Screen
                  </button>
                </div>

                <div className="flex items-end">
                  <button 
                    onClick={() => handleTriggerAttentionAlert(session.id, session.attention_check_active)}
                    className={`w-full font-black p-4 rounded-xl text-xs flex items-center justify-center gap-1.5 border transition ${session.attention_check_active ? 'bg-red-600 border-red-500 text-white animate-pulse' : 'bg-slate-950 border-slate-800 text-slate-300'}`}
                  >
                    <BellRing size={16} />
                    {session.attention_check_active ? 'Stop Attention Prompt' : 'Push Attention Request'}
                  </button>
                </div>
              </div>
            </div>
          ))}

          {/* Exam Configuration Meta Creator Block */}
          <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
            <h3 className="font-extrabold text-sm text-slate-300 flex items-center gap-2"><FilePlus size={16} /> PRE-LOAD MULTI-DURATION MCQ EXAM PAPERS</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <input type="text" placeholder="Exam Title" value={newExamTitle} onChange={e => setNewExamTitle(e.target.value)} className="bg-slate-950 border border-slate-800 p-2.5 rounded-xl text-xs text-white" />
              <input type="text" placeholder="Direct PDF Url (Supabase Bucket Link)" value={pdfUrl} onChange={e => setPdfUrl(e.target.value)} className="bg-slate-950 border border-slate-800 p-2.5 rounded-xl text-xs text-white" />
              <select value={duration} onChange={e => setDuration(e.target.value)} className="bg-slate-950 border border-slate-800 p-2.5 rounded-xl text-xs text-white">
                <option value="10">10 Minutes Duration</option>
                <option value="20">20 Minutes Duration</option>
                <option value="45">45 Minutes Duration</option>
                <option value="60">1 Hour Duration</option>
                <option value="120">2 Hours Duration</option>
              </select>
              <input type="number" placeholder="Question Count" value={totalQuestions} onChange={e => setTotalQuestions(e.target.value)} className="bg-slate-950 border border-slate-800 p-2.5 rounded-xl text-xs text-white" />
            </div>
            <button onClick={handleCreateExamSheet} className="w-full bg-slate-950 hover:bg-slate-800 border border-slate-700 text-white font-bold py-2 rounded-xl text-xs">
              Save Exam Template to Database
            </button>
          </div>
        </div>

        {/* Right Side Board: Live Realtime Grades Submissions Monitor Terminal */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col h-[650px]">
          <h3 className="font-black text-sm border-b border-slate-800 pb-3 flex items-center gap-2 text-emerald-400"><Trophy size={16} /> LIVE ONLINE EXAM REPORT LEDGER</h3>
          <div className="flex-1 overflow-y-auto space-y-2 mt-3 pr-1">
            {examReports.map((report, i) => (
              <div key={i} className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex justify-between items-center animate-fade-in">
                <div>
                  <h5 className="font-bold text-xs text-white">{report.student_name}</h5>
                  <span className="text-[10px] text-slate-400 font-mono">User: {report.student_username} | Cat: {report.class_type}</span>
                </div>
                <div className="px-3 py-1 bg-slate-900 rounded-lg border border-slate-800 text-right">
                  <span className="text-xs font-black text-emerald-400">{report.score}</span>
                  <span className="text-[10px] text-slate-500 font-bold">/{report.total_questions}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminLiveControls;