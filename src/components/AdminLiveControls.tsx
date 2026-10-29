import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { emitRealtimeEvent } from '../realtimeSync';
import { Video, Play, Square, Edit, Plus, Clock, Trash2, FileText, Send, EyeOff, MessageCircle, Eye, UserCheck, RotateCcw } from 'lucide-react';
import SecurityPasswordModal from './SecurityPasswordModal';

interface AdminLiveControlsProps {
  currentStaff?: any;
}

export default function AdminLiveControls({ currentStaff }: AdminLiveControlsProps = {}) {
  const isLecturer = currentStaff?.role === 'lecturer';

  const canLecturerEdit = (createdAt?: string) => {
    if (!isLecturer) return true; // Super admin, admin, manager have full permanent access
    if (!createdAt) return false;
    const diffMs = Date.now() - new Date(createdAt).getTime();
    return diffMs <= 60 * 60 * 1000; // 1 hour window
  };

  const getLecturerRemainingMinutes = (createdAt?: string) => {
    if (!createdAt) return 0;
    const diffMs = 60 * 60 * 1000 - (Date.now() - new Date(createdAt).getTime());
    return Math.max(0, Math.floor(diffMs / 60000));
  };

  const [lives, setLives] = useState<any[]>([]);
  const [classConfigs, setClassConfigs] = useState<any[]>([]);
  const [exams, setExams] = useState<any[]>([]);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [examModalOpen, setExamModalOpen] = useState(false);
  const [currentLiveId, setCurrentLiveId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingZoom, setIsGeneratingZoom] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);

  // Attendance State
  const [attendanceList, setAttendanceList] = useState<any[]>([]);
  const [attendanceModalOpen, setAttendanceModalOpen] = useState(false);
  const [attendanceLiveTitle, setAttendanceLiveTitle] = useState('');

  // Exam Status Modal State (Completed vs Uncompleted Students)
  const [examStatusModalOpen, setExamStatusModalOpen] = useState(false);
  const [selectedLiveForStatus, setSelectedLiveForStatus] = useState<any | null>(null);
  const [selectedExamForStatus, setSelectedExamForStatus] = useState<any | null>(null);
  const [completedExamStudents, setCompletedExamStudents] = useState<any[]>([]);
  const [uncompletedExamStudents, setUncompletedExamStudents] = useState<any[]>([]);
  const [loadingExamStatus, setLoadingExamStatus] = useState(false);
  const [examStatusTab, setExamStatusTab] = useState<'uncompleted' | 'completed'>('uncompleted');
  const [examStatusSearch, setExamStatusSearch] = useState('');

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
    target_class_type: '',
    zoom_join_url: '',
    zoom_start_url: '',
    link: ''
  });

  // Exam Form State
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
    
    // Supabase Realtime Subscription
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

      const { data: examsData } = await supabase.from('exams').select('*');
      if (examsData) setExams(examsData);
    } catch (err) { 
      console.error("Error fetching data", err); 
    }
  };

  // 1. WhatsApp Group / Student Notification Logic
  const handleWhatsAppNotify = (live: any) => {
    if (live.status === 'ended') return;

    const mainClassType = live.target_class_type || live.target_classes?.[0] || 'Theory';
    const config = classConfigs.find(cfg => cfg.class_types === mainClassType || cfg.class_type === mainClassType);
    const whatsappGroupUrl = config?.whatsapp_link || config?.whatsapp_url;

    const message = `🚨 *සජීවී පන්ති දැනුම්දීම (Live Class Alert)* 🚨\n\n` +
                    `📚 *පන්ති වර්ගය:* ${mainClassType}\n` +
                    `📝 *මාතෘකාව:* ${live.title}\n` +
                    `📅 *දිනය:* ${live.date}\n` +
                    `⏰ *වේලාව:* ${live.time}\n\n` +
                    `⚠️ පන්තිය ආරම්භ වීමට පෙර වෙබ් අඩවියට පිවිස සූදානම් වී සිටින්න.\n\n` +
                    `🌐 *වෙබ්සයිට් එක:* ${window.location.origin}\n`;

    navigator.clipboard.writeText(message).catch(err => console.error("Clipboard error", err));

    if (whatsappGroupUrl) {
      window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`, '_blank');
    } else {
      window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`, '_blank');
    }
  };

  // 2. WhatsApp TEACHER HOST LINK Notification Logic (New Feature)
  const handleTeacherWhatsAppNotify = (live: any) => {
    const teacherPhone = "94701244587"; // 0701244587 in international format
    const mainClassType = live.target_class_type || live.target_classes?.[0] || 'Theory';
    
    const message = `👨‍🏫 *Teacher Zoom Host Link* 👨‍🏫\n\n` +
                    `📚 *Class:* ${mainClassType} - ${live.title}\n` +
                    `📅 *Date:* ${live.date} | ⏰ *Time:* ${live.time}\n\n` +
                    `🔗 *Start / Host Link (Click to Start Zoom):*\n${live.zoom_start_url}\n\n` +
                    `⚠️ කරුණාකර පන්තිය ආරම්භ කිරීමට ඉහත ලින්ක් එක භාවිතා කරන්න.`;

    const finalUrl = `https://api.whatsapp.com/send?phone=${teacherPhone}&text=${encodeURIComponent(message)}`;
    window.open(finalUrl, '_blank');
  };

  const handleRegenerateZoom = async () => {
    if (!formData.title || !formData.date || !formData.time) {
      alert("කරුණාකර පළමුව පන්තියේ මාතෘකාව, දිනය සහ වේලාව ඇතුළත් කරන්න.");
      return;
    }
    setIsGeneratingZoom(true);
    try {
      const { data: edgeData, error: edgeError } = await supabase.functions.invoke('create-zoom-meeting', {
        body: { topic: formData.title, start_time: `${formData.date}T${formData.time}:00` }
      });
      if (edgeError || !edgeData) {
        throw new Error(edgeError?.message || 'Zoom API එක මඟින් රැස්වීම නිර්මාණය කළ නොහැකි විය.');
      }
      setFormData(prev => ({
        ...prev,
        zoom_join_url: edgeData.join_url,
        zoom_start_url: edgeData.start_url,
        link: edgeData.join_url
      }));
      alert("⚡ Zoom Meeting එක සාර්ථකව ජනනය කරන ලදී!\nMeeting ID: " + edgeData.id);
    } catch (err: any) {
      alert("Zoom දෝෂයක්: " + err.message);
    } finally {
      setIsGeneratingZoom(false);
    }
  };

  const handleSaveLive = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      let zoomInfo = null;
      // Auto-invoke Zoom API if creating new session or if links are missing
      if (!formData.id || (!formData.zoom_start_url && !formData.zoom_join_url)) {
        try {
          const { data: edgeData, error: edgeError } = await supabase.functions.invoke('create-zoom-meeting', {
            body: { topic: formData.title, start_time: `${formData.date}T${formData.time}:00` }
          });
          if (edgeError) {
            console.error("Zoom API invocation warning:", edgeError);
          } else if (edgeData) {
            zoomInfo = edgeData;
          }
        } catch (zErr) {
          console.error("Zoom invocation failed:", zErr);
        }
      }

      const mainClassType = formData.target_classes[0] || 'Theory';

      const zoomJoin = ((zoomInfo ? zoomInfo.join_url : '') || formData.zoom_join_url || formData.link || '').trim();
      const zoomStart = ((zoomInfo ? zoomInfo.start_url : '') || formData.zoom_start_url || '').trim();
      const zoomMeetingId = zoomInfo?.id ? String(zoomInfo.id) : ((formData as any).zoom_meeting_id || undefined);

      const payload: any = {
        title: formData.title,
        date: formData.date,
        time: formData.time,
        target_month: formData.target_month,
        target_classes: formData.target_classes,
        target_class_type: mainClassType, 
        // A brand-new scheduled class should NEVER inherit an exam from prior sessions or forms!
        active_exam_id: formData.id ? (formData.active_exam_id || null) : null,
        is_exam_active: formData.id ? !!formData.active_exam_id : false,
        pre_class_video_path: formData.pre_class_video_path,
        platform: 'zoom',
        status: formData.id ? undefined : 'scheduled', // ensure new lives are scheduled
        zoom_start_url: zoomStart || undefined, // HOST link for Admin/Teacher
        zoom_join_url: zoomJoin || undefined,   // JOIN link for Students
        link: zoomJoin || undefined,
        ...(zoomMeetingId && {
          zoom_meeting_id: zoomMeetingId,
        })
      };

      if (formData.id) {
        const { data: oldLive } = await supabase.from('scheduled_lives').select('*').eq('id', formData.id).single();
        await supabase.from('scheduled_lives').update(payload).eq('id', formData.id);
        
        if (oldLive) {
          await supabase.from('calendar_events')
            .update({
              date: formData.date,
              title: formData.title,
              description: `Zoom Live Class - ${mainClassType}`,
              target_class_type: mainClassType,
              class_type: mainClassType,
              start_time: formData.time
            })
            .eq('title', oldLive.title)
            .eq('date', oldLive.date);
        }
      } else {
        await supabase.from('scheduled_lives').insert([payload]);
        await supabase.from('calendar_events').insert([{
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

  const handleAnswerChange = (qNum: number, ans: number) => {
    setExamData(prev => ({
      ...prev,
      correct_answer: { ...prev.correct_answer, [qNum]: ans }
    }));
  };

  const handleSaveExam = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    const totalMinutes = (examData.durationHours * 60) + examData.durationMinutes + Math.round(examData.durationSeconds / 60);
    const cleanTitle = (examData.title || '').trim();
    const generatedExamCode = 'EXAM_' + cleanTitle.toUpperCase().replace(/[^A-Z0-9]/g, '_').slice(0, 32);

    try {
      const payload = {
        title: cleanTitle,
        exam_code: generatedExamCode,
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

      // Strictly attach to the live session where the exam was created
      const activeLiveId = currentLiveId;
      if (targetExamId && activeLiveId) {
        await supabase.from('scheduled_lives')
          .update({ active_exam_id: targetExamId, is_exam_active: false })
          .eq('id', activeLiveId);
      }

      setExamModalOpen(false);
      setCurrentLiveId(''); 
      alert("Paper & Answers සාර්ථකව සේව් කරන ලදී! Exam Code: " + generatedExamCode);
      await fetchInitialData();
    } catch (error: any) {
      alert("Exam Save Error: " + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePushExamToStudents = async (
    liveId: string, 
    examId: string, 
    action: 'push_initial' | 'retract' | 'repush_pending' | 'repush_all'
  ) => {
    try {
      const nowIso = new Date().toISOString();
      const updatePayload: any = {};
      
      if (action === 'retract') {
        updatePayload.is_exam_active = false;
        await supabase.from('scheduled_lives').update(updatePayload).eq('id', liveId);
        await supabase.from('exams').update({ status: 'pending' }).eq('id', examId);
        try { await supabase.from('ubt_exams').update({ status: 'ended' }).eq('id', examId); } catch (e) {}
        emitRealtimeEvent('ubt_exam_updated', { id: examId, status: 'ended' });
        alert("විභාගය PUSH කිරීම අත්හිටුවන ලදී.");
      } else if (action === 'repush_pending') {
        updatePayload.is_exam_active = true;
        updatePayload.active_exam_id = examId;
        updatePayload.exam_push_mode = 'pending_only';
        updatePayload.exam_push_timestamp = nowIso;
        await supabase.from('scheduled_lives').update(updatePayload).eq('id', liveId);
        await supabase.from('exams').update({ status: 'active', exam_push_timestamp: nowIso }).eq('id', examId);
        try { await supabase.from('ubt_exams').update({ status: 'active', exam_push_timestamp: nowIso }).eq('id', examId); } catch (e) {}
        emitRealtimeEvent('ubt_exam_updated', { id: examId, status: 'active' });
        emitRealtimeEvent('exam_created', { id: examId });
        alert("විභාගය තවමත් නොකළ සිසුන්ට පමණක් සාර්ථකව Re-Push කරන ලදී!");
      } else if (action === 'repush_all') {
        updatePayload.is_exam_active = true;
        updatePayload.active_exam_id = examId;
        updatePayload.exam_push_mode = 'allow_retake';
        updatePayload.exam_retake_timestamp = nowIso;
        updatePayload.exam_push_timestamp = nowIso;
        await supabase.from('scheduled_lives').update(updatePayload).eq('id', liveId);
        await supabase.from('exams').update({ status: 'active', exam_push_timestamp: nowIso, exam_retake_timestamp: nowIso, exam_push_mode: 'allow_retake' }).eq('id', examId);
        try { await supabase.from('ubt_exams').update({ status: 'active', exam_push_timestamp: nowIso, exam_retake_timestamp: nowIso, exam_push_mode: 'allow_retake' }).eq('id', examId); } catch (e) {}
        try { await supabase.from('exam_results').delete().eq('exam_id', examId); } catch (e) {}
        emitRealtimeEvent('ubt_exam_updated', { id: examId, status: 'active', allowRetake: true });
        emitRealtimeEvent('exam_created', { id: examId });
        alert("විභාගය දැනටමත් කළ සිසුන්ටද නැවත කිරීමට අවසර ලැබෙන පරිදි සියලු දෙනාටම Re-Push කරන ලදී!");
      } else {
        updatePayload.is_exam_active = true;
        updatePayload.active_exam_id = examId;
        updatePayload.exam_push_mode = 'pending_only';
        updatePayload.exam_push_timestamp = nowIso;
        await supabase.from('scheduled_lives').update(updatePayload).eq('id', liveId);
        await supabase.from('exams').update({ status: 'active', exam_push_timestamp: nowIso }).eq('id', examId);
        try { await supabase.from('ubt_exams').update({ status: 'active', exam_push_timestamp: nowIso }).eq('id', examId); } catch (e) {}
        emitRealtimeEvent('ubt_exam_updated', { id: examId, status: 'active' });
        emitRealtimeEvent('exam_created', { id: examId });
        alert("විභාගය සිසුන්ට සජීවීව සාර්ථකව Push කරන ලදී!");
      }

      emitRealtimeEvent('live_exam_updated', { liveId, examId, action, timestamp: nowIso });
      emitRealtimeEvent('exam_pushed', { liveId, examId, action, timestamp: nowIso });

      try {
        const liveChannel = supabase.channel('live_class_push_events');
        liveChannel.send({
          type: 'broadcast',
          event: 'exam_pushed',
          payload: { liveId, examId, action, timestamp: nowIso }
        });
      } catch (e) {}

      await fetchInitialData();

      if (selectedLiveForStatus && selectedExamForStatus) {
        handleOpenExamStatus(selectedLiveForStatus, selectedExamForStatus);
      }
    } catch (err: any) {
      alert("Push operation failed: " + (err?.message || ""));
    }
  };

  const handleOpenExamStatus = async (live: any, exam: any) => {
    setSelectedLiveForStatus(live);
    setSelectedExamForStatus(exam);
    setExamStatusModalOpen(true);
    setLoadingExamStatus(true);
    setExamStatusTab('uncompleted');
    setExamStatusSearch('');

    try {
      const { data: allStudents } = await supabase.from('students').select('*');
      const targetClasses = (live.target_classes || [live.target_class_type]).filter(Boolean).map((c: string) => c.toLowerCase().trim());

      const enrolledStudents = (allStudents || []).filter((s: any) => {
        const studentClasses = (s.class_types || []).map((c: string) => String(c).toLowerCase().trim());
        if (targetClasses.length === 0) return true;
        return targetClasses.some(tc => studentClasses.some(sc => sc.includes(tc) || tc.includes(sc)));
      });

      const { data: results } = await supabase.from('exam_results').select('*').eq('exam_id', exam.id);

      const completedMap = new Map<string, any>();
      (results || []).forEach((r: any) => {
        const u = (r.username || '').toLowerCase().trim();
        const sid = r.student_id ? String(r.student_id) : '';
        if (u) completedMap.set(u, r);
        if (sid) completedMap.set(sid, r);
      });

      const completed: any[] = [];
      const uncompleted: any[] = [];

      enrolledStudents.forEach((st: any) => {
        const u = (st.username || '').toLowerCase().trim();
        const sid = String(st.id || '');
        const res = completedMap.get(u) || completedMap.get(sid);
        if (res) {
          completed.push({
            student: st,
            result: res,
            score: res.score,
            percentage: res.meta_data?.percentage ?? (exam.total_questions ? Math.round((res.score / exam.total_questions) * 100) : 0),
            submitted_at: res.submitted_at
          });
        } else {
          uncompleted.push({
            student: st,
            status: 'නොකළ (Pending)'
          });
        }
      });

      (results || []).forEach((r: any) => {
        const u = (r.username || '').toLowerCase().trim();
        const alreadyInCompleted = completed.some(c => (c.student.username || '').toLowerCase().trim() === u);
        if (!alreadyInCompleted) {
          completed.push({
            student: { username: r.username, name: r.username, mobile: '' },
            result: r,
            score: r.score,
            percentage: r.meta_data?.percentage ?? 0,
            submitted_at: r.submitted_at
          });
        }
      });

      setCompletedExamStudents(completed);
      setUncompletedExamStudents(uncompleted);
    } catch (err) {
      console.error('Error fetching exam status:', err);
    } finally {
      setLoadingExamStatus(false);
    }
  };

  // Status Change Logic - Pushes Zoom Join Link to Student Dashboard automatically
  const handleStatusChange = async (id: string, newStatus: string) => {
    await supabase.from('scheduled_lives').update({ status: newStatus }).eq('id', id);
    
    const liveObj = lives.find(l => l.id === id);
    if (liveObj) {
      await supabase.from('calendar_events')
        .update({ status: newStatus })
        .eq('title', liveObj.title)
        .eq('date', liveObj.date);
    }
    
    emitRealtimeEvent('calendar_updated', { liveId: id, status: newStatus });
    await fetchInitialData();
  };

  const [actionToast, setActionToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const executeDeleteLive = async () => {
    if (!deleteTarget) return;
    if (isLecturer && !canLecturerEdit(deleteTarget.created_at)) {
      setActionToast({
        message: 'පැය 1 ඉක්මවා ඇති බැවින් මෙම සූම් පන්තිය මකා දැමිය හැක්කේ ප්‍රධාන පරිපාලක (Super Admin / Admin / Manager) මඟින් පමණි.',
        type: 'error'
      });
      setDeleteTarget(null);
      return;
    }
    setIsLoading(true);
    const targetId = deleteTarget.id;
    const examId = deleteTarget.active_exam_id;
    const targetTitle = deleteTarget.title;
    const targetDate = deleteTarget.date;

    try {
      // 1. Unlink exam from scheduled_lives row first (prevents foreign key conflict)
      if (examId) {
        try {
          await supabase.from('scheduled_lives').update({ active_exam_id: null }).eq('id', targetId);
        } catch (e) {
          console.warn('Unlink exam note:', e);
        }
      }

      // 2. Delete the scheduled_lives row
      const { error: liveDeleteError } = await supabase.from('scheduled_lives').delete().eq('id', targetId);
      if (liveDeleteError) {
        console.error('Scheduled live delete error:', liveDeleteError);
        throw liveDeleteError;
      }

      // 3. Clean up matching calendar_events row
      if (targetTitle && targetDate) {
        try {
          await supabase.from('calendar_events')
            .delete()
            .eq('title', targetTitle)
            .eq('date', targetDate);
        } catch (calErr) {
          console.warn('Calendar event cleanup note:', calErr);
        }
      }

      // 4. Clean up attached exam and results if applicable
      if (examId) {
        try {
          await supabase.from('exam_results').delete().eq('exam_id', examId);
          await supabase.from('exams').delete().eq('id', examId);
        } catch (exErr) {
          console.warn('Exam cleanup note:', exErr);
        }
      }

      // 5. Update local state immediately for instant feedback
      setLives(prev => prev.filter(l => l.id !== targetId));
      setDeleteTarget(null);
      setActionToast({ message: 'සජීවී පන්තිය සාර්ථකව මකා දමන ලදී (Live schedule deleted successfully)', type: 'success' });
      await fetchInitialData();
    } catch (err: any) {
      console.error('Failed to delete live class:', err);
      setActionToast({ message: 'සජීවී පන්තිය මකා දැමීම අසාර්ථක විය: ' + (err.message || 'Database error'), type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleFetchAttendance = async (live: any) => {
    setAttendanceLiveTitle(live.title);
    setAttendanceList([]);
    setAttendanceModalOpen(true);
    
    if (!live.active_exam_id) return;

    try {
      const { data, error } = await supabase
        .from('exam_results')
        .select('username, submitted_at, score')
        .eq('exam_id', live.active_exam_id)
        .order('submitted_at', { ascending: true });
        
      if (data) setAttendanceList(data);
    } catch (err) {
      console.error("Error fetching attendance:", err);
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
            const initialClasses = (isLecturer && currentStaff?.assigned_classes && currentStaff.assigned_classes.length > 0)
              ? currentStaff.assigned_classes
              : [];
            setFormData({ 
              id: '', 
              title: '', 
              date: '', 
              time: '', 
              target_month: '', 
              target_classes: initialClasses, 
              active_exam_id: '', 
              pre_class_video_path: '/videos/waiting-video.mp4', 
              target_class_type: initialClasses[0] || '',
              zoom_join_url: '',
              zoom_start_url: '',
              link: ''
            });
            setCurrentLiveId('');
            setIsModalOpen(true);
          }}
          className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-3 rounded-xl flex items-center gap-2 font-semibold shadow-lg transition"
        >
          <Plus size={20} /> Schedule New Live Class
        </button>
      </div>

      {/* Action Toast Alert Banner */}
      {actionToast && (
        <div className={`mb-6 p-4 rounded-2xl border flex items-center justify-between text-xs font-bold transition-all shadow-lg ${
          actionToast.type === 'success' 
            ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300' 
            : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
        }`}>
          <span>{actionToast.message}</span>
          <button 
            onClick={() => setActionToast(null)} 
            className="p-1 hover:bg-white/10 rounded-lg transition ml-3 text-slate-300 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

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
              {lives
                .filter(live => {
                  if (!isLecturer) return true;
                  const assigned = currentStaff?.assigned_classes || [];
                  if (!assigned || assigned.length === 0) return true;
                  const targetArr = live.target_classes || [];
                  const mainTarget = live.target_class_type;
                  return assigned.some((c: string) => targetArr.includes(c) || mainTarget === c);
                })
                .map((live) => {
                // STRICT ISOLATION: An exam belongs to this live session ONLY if live.active_exam_id matches!
                // Never fallback to class_type search which caused old exams to auto-bleed into other classes!
                const attachedExam = live.active_exam_id ? exams.find(e => e.id === live.active_exam_id) : undefined; 

                const isExamPushedLive = live.is_exam_active;
                const isClassEnded = live.status === 'ended';

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
                  
                  {/* LIVE EXAM PANEL COLUMN */}
                  <td className="p-4">
                    {attachedExam ? (
                      <div className="flex flex-col gap-2 bg-slate-950 p-3 rounded-xl border border-slate-800 max-w-xs">
                        <div className="font-bold text-slate-200 text-xs flex justify-between items-center gap-2">
                          <span className="truncate text-amber-500 font-medium">{attachedExam.title}</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded shrink-0 ${isExamPushedLive ? 'text-emerald-400 bg-emerald-400/10 border border-emerald-500/20 animate-pulse' : 'text-slate-500 bg-slate-900'}`}>
                            {isExamPushedLive ? 'PUSHED' : 'PENDING'}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {isExamPushedLive ? (
                            <>
                              <button
                                disabled={isClassEnded}
                                onClick={() => handlePushExamToStudents(live.id, attachedExam!.id, 'retract')}
                                className={`text-[11px] px-2 py-1 rounded font-bold transition flex items-center gap-1 ${isClassEnded ? 'bg-slate-900 text-slate-600 cursor-not-allowed border border-slate-800' : 'bg-red-500 hover:bg-red-600 text-white'}`}
                                title="විභාගය අත්හිටුවන්න (Retract)"
                              >
                                <EyeOff size={12}/> Retract
                              </button>
                              
                              <button
                                disabled={isClassEnded}
                                onClick={() => handlePushExamToStudents(live.id, attachedExam!.id, 'repush_pending')}
                                className={`text-[11px] px-2 py-1 rounded font-bold transition flex items-center gap-1 ${isClassEnded ? 'bg-slate-900 text-slate-600 cursor-not-allowed border border-slate-800' : 'bg-amber-600 hover:bg-amber-500 text-white'}`}
                                title="විභාගය තවමත් නොකළ සිසුන්ට පමණක් නැවත Push කරන්න"
                              >
                                <RotateCcw size={12}/> Re-push (නොකළ අයට)
                              </button>

                              <button
                                disabled={isClassEnded}
                                onClick={() => handlePushExamToStudents(live.id, attachedExam!.id, 'repush_all')}
                                className={`text-[11px] px-2 py-1 rounded font-bold transition flex items-center gap-1 ${isClassEnded ? 'bg-slate-900 text-slate-600 cursor-not-allowed border border-slate-800' : 'bg-purple-600 hover:bg-purple-500 text-white'}`}
                                title="විභාගය කළ සිසුන්ටද නැවත කිරීමට අවසර ලැබෙන පරිදි සියලු දෙනාටම Re-push කරන්න"
                              >
                                <Send size={12}/> Re-push (සියලු අයට / Retake)
                              </button>
                            </>
                          ) : (
                            <button
                              disabled={isClassEnded}
                              onClick={() => handlePushExamToStudents(live.id, attachedExam!.id, 'push_initial')}
                              className={`text-[11px] px-2.5 py-1 rounded font-bold transition flex items-center gap-1 ${isClassEnded ? 'bg-slate-900 text-slate-600 cursor-not-allowed border border-slate-800' : 'bg-emerald-600 hover:bg-emerald-500 text-white'}`}
                            >
                              <Send size={12}/> Push Paper Live
                            </button>
                          )}
                          
                          {isLecturer && !canLecturerEdit(attachedExam?.created_at || live.created_at) ? (
                            <span 
                              className="text-[10px] text-slate-500 italic py-1 px-1.5 bg-slate-900 border border-slate-800 rounded"
                              title="පැය 1 ඉක්මවා ඇති බැවින් සංස්කරණය කළ හැක්කේ සුපර් ඇඩ්මින් / ඇඩ්මින් / මැනේජර් මඟින් පමණි."
                            >
                              🔒 Locked (&gt;1h)
                            </span>
                          ) : (
                            <button 
                              disabled={isClassEnded}
                              onClick={() => {
                                setCurrentLiveId(live.id);
                                setExamData({
                                  id: attachedExam!.id,
                                  title: attachedExam!.title,
                                  class_type: attachedExam!.class_type,
                                  pdf_url: attachedExam!.pdf_url || '',
                                  total_questions: attachedExam!.total_questions || 50,
                                  durationHours: Math.floor(attachedExam!.duration_minutes / 60) || 0,
                                  durationMinutes: attachedExam!.duration_minutes % 60 || 0,
                                  durationSeconds: 0,
                                  correct_answer: attachedExam!.correct_answer || {},
                                  status: attachedExam!.status
                                });
                                setExamModalOpen(true);
                              }}
                              className={`text-[11px] px-2 py-1 rounded flex items-center gap-1 border ${isClassEnded ? 'bg-slate-900 text-slate-600 border-slate-800 cursor-not-allowed' : 'bg-slate-800 hover:bg-slate-700 text-amber-400 border-slate-700'}`}
                            >
                              <Edit size={12}/> Edit Exam
                            </button>
                          )}

                          {/* Student Exam Status Button */}
                          <button
                            type="button"
                            onClick={() => handleOpenExamStatus(live, attachedExam)}
                            className="text-[11px] px-2.5 py-1 rounded bg-blue-600/30 hover:bg-blue-600/50 text-blue-300 border border-blue-500/40 font-bold flex items-center gap-1 transition cursor-pointer"
                            title="විභාගය කළ සහ නොකළ සිසුන්ගේ ලැයිස්තුව බලන්න"
                          >
                            <UserCheck size={12} /> සිසුන්ගේ තත්ත්වය (Status)
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        disabled={isClassEnded}
                        onClick={() => {
                          setCurrentLiveId(live.id);
                          setExamData({ 
                            id: '', 
                            title: `${live.title} - Exam`, 
                            class_type: live.target_class_type || live.target_classes?.[0] || 'Theory', 
                            pdf_url: '', 
                            total_questions: 50,
                            durationHours: 1, durationMinutes: 30, durationSeconds: 0, 
                            correct_answer: {}, 
                            status: 'pending' 
                          });
                          setExamModalOpen(true);
                        }}
                        className={`px-3 py-1.5 rounded text-xs font-bold transition flex items-center gap-1 border ${isClassEnded ? 'bg-slate-900 text-slate-600 border-slate-800 cursor-not-allowed' : 'bg-amber-600/20 hover:bg-amber-600/30 text-amber-400 border-amber-500/30'}`}
                      >
                        <Plus size={12}/> Create & Attach Exam
                      </button>
                    )}
                  </td>
                  
                  {/* ZOOM STREAM CONTROL & WHATSAPP ALERT */}
                  <td className="p-4">
                    <div className="flex flex-col gap-1.5">
                      {live.status === 'scheduled' && <span className="text-slate-400 bg-slate-800 px-2 py-0.5 rounded w-fit text-xs border border-slate-700">Scheduled</span>}
                      {live.status === 'live' && <span className="text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded w-fit text-xs font-bold flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping"></span> ZOOM LIVE</span>}
                      {isClassEnded && <span className="text-slate-500 bg-slate-950 px-2 py-0.5 rounded w-fit text-xs border border-slate-900">Ended</span>}

                      <div className="flex flex-col gap-1 mt-0.5">
                        
                        {/* TEACHER HOST LINK BUTTON */}
                        <button 
                          disabled={isClassEnded}
                          onClick={() => handleTeacherWhatsAppNotify(live)}
                          className={`text-[11px] px-3 py-1.5 rounded font-bold flex items-center justify-center gap-1 transition shadow-md ${isClassEnded ? 'bg-slate-900 text-slate-600 cursor-not-allowed border border-slate-800' : 'bg-indigo-600 hover:bg-indigo-500 text-white'}`}
                        >
                          <UserCheck size={12}/> Send Host Link to Teacher
                        </button>

                        {/* START/END ZOOM BUTTON - Starts Zoom with Host Link and Pushes to Students */}
                        {live.status === 'scheduled' && (
                          <a href={live.zoom_start_url} target="_blank" rel="noreferrer" onClick={() => handleStatusChange(live.id, 'live')} className="bg-blue-600 hover:bg-blue-500 text-[11px] px-3 py-1.5 rounded font-bold flex items-center justify-center text-white text-center transition">
                            <Play size={12} className="mr-1"/> Start Zoom & Push to Students
                          </a>
                        )}
                        {live.status === 'live' && (
                          <button onClick={() => handleStatusChange(live.id, 'ended')} className="bg-red-600 hover:bg-red-500 text-[11px] px-3 py-1.5 rounded font-bold flex items-center justify-center text-white transition">
                            <Square size={12} className="mr-1"/> End Class
                          </button>
                        )}

                        {/* STUDENT WHATSAPP ALERT BUTTON */}
                        <button 
                          disabled={isClassEnded}
                          onClick={() => handleWhatsAppNotify(live)}
                          className={`text-[11px] px-3 py-1.5 rounded font-bold flex items-center justify-center gap-1 transition shadow-md ${isClassEnded ? 'bg-slate-900 text-slate-600 cursor-not-allowed border border-slate-800' : 'bg-emerald-600 hover:bg-emerald-500 text-white'}`}
                        >
                          <MessageCircle size={12}/> Send Students Alert
                        </button>
                      </div>
                    </div>
                  </td>

                  {/* ACTION CONTROLS */}
                  <td className="p-4 text-center">
                    <div className="flex justify-center items-center gap-2">
                      {isLecturer && !canLecturerEdit(live.created_at) ? (
                        <span 
                          className="text-[10px] bg-slate-900 border border-slate-800 text-slate-500 px-2 py-1 rounded inline-block"
                          title="පැය 1 ඉක්මවා ඇති බැවින් සංස්කරණය/මැකීම කළ හැක්කේ ප්‍රධාන පරිපාලක (Super Admin / Admin / Manager) මඟින් පමණි."
                        >
                          🔒 අගුළුලා ඇත (&gt;1h)
                        </span>
                      ) : (
                        <>
                          <button 
                            disabled={isClassEnded}
                            onClick={() => { 
                              setFormData({
                                id: live.id,
                                title: live.title || '',
                                date: live.date || '',
                                time: live.time || '',
                                target_month: live.target_month || '',
                                target_classes: live.target_classes || [],
                                active_exam_id: live.active_exam_id || '',
                                pre_class_video_path: live.pre_class_video_path || '/videos/waiting-video.mp4',
                                target_class_type: live.target_class_type || '',
                                zoom_join_url: live.zoom_join_url || live.link || '',
                                zoom_start_url: live.zoom_start_url || '',
                                link: live.zoom_join_url || live.link || ''
                              }); 
                              setCurrentLiveId(live.id); 
                              setIsModalOpen(true); 
                            }} 
                            className={`p-2 rounded border transition ${isClassEnded ? 'bg-slate-900 text-slate-600 border-slate-800 cursor-not-allowed' : 'bg-slate-800 hover:bg-slate-700 text-amber-400 border-slate-700'}`}
                            title={isClassEnded ? "පන්තිය අවසන් බැවින් සංස්කරණය කළ නොහැක" : isLecturer ? `Edit Class (${getLecturerRemainingMinutes(live.created_at)} mins left)` : "Edit Class"}
                          >
                            <Edit size={16} />
                          </button>
                          
                          <button 
                            onClick={() => setDeleteTarget(live)} 
                            className="p-2 bg-slate-800 hover:bg-rose-950 text-rose-400 hover:text-rose-200 rounded border border-slate-700 hover:border-rose-700 transition cursor-pointer" 
                            title={isLecturer ? `Delete Class (${getLecturerRemainingMinutes(live.created_at)} mins left)` : "Delete Class"}
                          >
                            <Trash2 size={16} />
                          </button>
                        </>
                      )}

                      {isClassEnded && (
                        <button 
                          onClick={() => handleFetchAttendance(live)} 
                          className="p-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 rounded border border-blue-500/30 transition flex items-center justify-center"
                          title="View Attendance List"
                        >
                          <Eye size={16} />
                        </button>
                      )}
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

              <div>
                <label className="block text-xs font-mono text-emerald-400 uppercase mb-1">Target Month</label>
                <input required type="month" value={formData.target_month} onChange={e => setFormData({...formData, target_month: e.target.value})} className="w-full bg-slate-950 border border-emerald-800 rounded-xl p-3 text-white text-sm font-bold" />
              </div>

              <div>
                <label className="block text-xs font-mono text-slate-400 uppercase mb-2">
                  Select Target Classes (අනිවාර්යයි)
                  {isLecturer && (
                    <span className="text-indigo-400 text-[10px] ml-2 font-sans font-bold">
                      (ඔබ ලියාපදිංචි වී ඇති පන්ති පමණි)
                    </span>
                  )}
                </label>
                <div className="grid grid-cols-2 gap-2 bg-slate-950 p-3 rounded-xl border border-slate-800 max-h-36 overflow-y-auto">
                  {classConfigs
                    .filter((cfg) => {
                      if (!isLecturer) return true;
                      const assigned = currentStaff?.assigned_classes || [];
                      if (assigned.length === 0) return false;
                      const actualClassType = cfg.class_types || cfg.class_type;
                      return actualClassType && assigned.some(
                        (ac: string) => ac.trim().toLowerCase() === actualClassType.trim().toLowerCase()
                      );
                    })
                    .map((cfg) => {
                      const actualClassType = cfg.class_types || cfg.class_type;
                      if (!actualClassType) return null; 
                      return (
                        <label key={cfg.id} className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer hover:text-white transition">
                          <input 
                            type="checkbox" 
                            checked={formData.target_classes.includes(actualClassType)} 
                            onChange={() => toggleCheckbox(actualClassType)} 
                            className="accent-blue-500 w-4 h-4 rounded" 
                          />
                          {actualClassType}
                        </label>
                      );
                    })}
                </div>
              </div>

              {/* Zoom Meeting Links (Auto-generated in background, optional advanced edit) */}
              {formData.id && (formData.zoom_start_url || formData.zoom_join_url) && (
                <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-bold text-blue-400">Zoom Meeting Details</span>
                    <button
                      type="button"
                      disabled={isGeneratingZoom}
                      onClick={handleRegenerateZoom}
                      className="px-2.5 py-1 bg-blue-600/30 hover:bg-blue-600/50 text-blue-200 border border-blue-500/40 rounded-lg text-xs flex items-center gap-1 transition font-sans cursor-pointer"
                    >
                      <RotateCcw size={11} className={isGeneratingZoom ? "animate-spin" : ""} />
                      {isGeneratingZoom ? "Generating..." : "🔄 Re-generate Zoom"}
                    </button>
                  </div>
                  <div className="flex flex-col gap-1 text-[11px] font-mono">
                    <div className="text-emerald-400 flex items-center justify-between">
                      <span>Student Join Link:</span>
                      <span className="text-slate-400 text-[10px] truncate max-w-xs">{formData.zoom_join_url || formData.link}</span>
                    </div>
                    <div className="text-amber-400 flex items-center justify-between">
                      <span>Teacher Host Link:</span>
                      <span className="text-slate-400 text-[10px] truncate max-w-xs">{formData.zoom_start_url}</span>
                    </div>
                  </div>
                </div>
              )}

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

      {/* --- EXAM CREATION & EDIT MODAL --- */}
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
                <input 
                  type="number" 
                  min="1" 
                  max="100" 
                  value={examData.total_questions} 
                  onChange={e => setExamData({...examData, total_questions: Number(e.target.value)})} 
                  className="w-32 bg-slate-950 border border-slate-800 rounded p-3 text-white text-sm" 
                />
              </div>

              <div className="bg-slate-950 p-4 border border-slate-800 rounded-xl">
                <label className="block text-sm font-bold text-slate-300 mb-3">Answer Key (නිවැරදි පිළිතුරු)</label>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 max-h-64 overflow-y-auto p-2">
                  {Array.from({ length: examData.total_questions }, (_, i) => i + 1).map(qNum => (
                    <div key={qNum} className="flex items-center gap-2 bg-slate-900 p-2 rounded border border-slate-700">
                      <span className="text-slate-400 font-mono w-6 text-right">{qNum}.</span>
                      <select
                        value={examData.correct_answer[qNum] || ''}
                        onChange={(e) => handleAnswerChange(qNum, Number(e.target.value))}
                        className="bg-slate-950 border border-slate-800 text-white rounded p-1 w-full text-sm"
                        required
                      >
                        <option value="" disabled>-</option>
                        {[1, 2, 3, 4, 5].map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 mt-6 border-t border-slate-800">
                <button type="button" onClick={() => setExamModalOpen(false)} className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-xl text-sm transition">Cancel</button>
                <button type="submit" disabled={isLoading} className="bg-amber-600 hover:bg-amber-500 text-white px-6 py-2 rounded-xl text-sm font-bold transition">
                  {examData.id ? 'Update Exam' : 'Save & Attach Exam'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- ATTENDANCE MODAL --- */}
      {attendanceModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl relative">
            <div className="flex justify-between items-center mb-4 border-b border-slate-800 pb-3">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Eye className="text-blue-500" /> Exam Results & Attendance
              </h2>
              <button onClick={() => setAttendanceModalOpen(false)} className="text-slate-400 hover:text-white transition">
                &times; Close
              </button>
            </div>
            
            <p className="text-slate-300 text-sm mb-4">Class: <span className="font-bold text-emerald-400">{attendanceLiveTitle}</span></p>

            <div className="overflow-y-auto flex-1 bg-slate-950 rounded-xl border border-slate-800">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-900 text-slate-400 text-xs uppercase font-mono sticky top-0 border-b border-slate-800">
                  <tr>
                    <th className="p-4">Student Name (Username)</th>
                    <th className="p-4">Submitted Time</th>
                    <th className="p-4">Score / Marks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-sm">
                  {attendanceList.length > 0 ? (
                    attendanceList.map((record, index) => (
                      <tr key={index} className="hover:bg-slate-900/50 transition">
                        <td className="p-4 font-medium text-slate-200">{record.username}</td>
                        <td className="p-4 text-slate-400">{new Date(record.submitted_at).toLocaleString()}</td>
                        <td className="p-4 font-bold text-emerald-400">{record.score}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3} className="p-8 text-center text-slate-500">
                        No students have submitted the exam for this session yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-4 mt-4 border-t border-slate-800">
              <button onClick={() => setAttendanceModalOpen(false)} className="bg-slate-800 hover:bg-slate-700 text-white px-5 py-2 rounded-xl text-sm transition">
                Close List
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dedicated Confirmation Modal for Deleting Live Schedule */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-750 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden relative">
            <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-rose-500 via-amber-500 to-rose-600" />
            
            {/* Modal Header */}
            <div className="flex justify-between items-center p-5 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-2xl bg-rose-500/20 text-rose-400 border border-rose-500/30">
                  <Trash2 size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">
                    සජීවී පන්තිය මකා දැමීම
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Delete Scheduled Live Class
                  </p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setDeleteTarget(null)} 
                className="text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-slate-800 transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4">
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-2">
                <div className="text-sm font-bold text-white flex items-center gap-2">
                  <Video size={16} className="text-rose-400 shrink-0" />
                  <span className="truncate">{deleteTarget.title || 'Live Class'}</span>
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-slate-400 pt-1 border-t border-slate-800/80 font-mono">
                  <span>📅 දිනය: <strong className="text-slate-200">{deleteTarget.date || '-'}</strong></span>
                  <span>⏰ වේලාව: <strong className="text-slate-200">{deleteTarget.time || '-'}</strong></span>
                  <span>📚 <strong className="text-blue-300">{deleteTarget.target_class_type || deleteTarget.target_classes?.[0] || 'Class'}</strong></span>
                </div>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed bg-rose-500/10 border border-rose-500/20 p-3 rounded-xl">
                ⚠️ මෙම සජීවී පන්තිය, ඊට අදාළ දින දර්ශන සටහන් (Calendar Events) සහ විභාග තොරතුරු දත්ත ගබඩාවෙන් ස්ථිරවම මකා දැමෙනු ඇත.
              </p>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  disabled={isLoading}
                  className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition cursor-pointer"
                >
                  අවලංගු කරන්න (Cancel)
                </button>
                <button
                  type="button"
                  onClick={executeDeleteLive}
                  disabled={isLoading}
                  className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 transition shadow-lg shadow-rose-900/30 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isLoading ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <Trash2 size={14} />
                      <span>මකා දමන්න (Delete)</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- LIVE EXAM STUDENT COMPLETION STATUS MODAL (Completed vs Pending) --- */}
      {examStatusModalOpen && selectedExamForStatus && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-[70] p-3 sm:p-6 animate-in fade-in duration-200">
          <div className="bg-slate-900 border-2 border-slate-700 rounded-3xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
            
            {/* Header */}
            <div className="p-5 sm:p-6 bg-slate-950 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-500/20 text-blue-400 border border-blue-500/30">
                    Live Exam Real-time Analytics
                  </span>
                  <span className="text-xs text-slate-400 font-mono">
                    {selectedLiveForStatus?.target_class_type || selectedLiveForStatus?.target_classes?.[0] || 'Class'}
                  </span>
                </div>
                <h3 className="text-lg sm:text-xl font-black text-white flex items-center gap-2">
                  <FileText className="text-amber-400 shrink-0" size={20} />
                  <span>{selectedExamForStatus.title}</span>
                </h3>
              </div>

              <button
                type="button"
                onClick={() => setExamStatusModalOpen(false)}
                className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Quick Action Re-Push Bar */}
            <div className="p-4 bg-slate-850 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handlePushExamToStudents(selectedLiveForStatus.id, selectedExamForStatus.id, 'repush_pending')}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-amber-600 hover:bg-amber-500 border border-amber-400/40 shadow-md flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
                  title="විභාගය තවමත් නොකළ සිසුන්ට පමණක් නැවත Push කරන්න"
                >
                  <RotateCcw size={14} />
                  <span>නොකළ අයට නැවත Push කරන්න (Re-Push to Pending)</span>
                </button>

                <button
                  type="button"
                  onClick={() => handlePushExamToStudents(selectedLiveForStatus.id, selectedExamForStatus.id, 'repush_all')}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-purple-600 hover:bg-purple-500 border border-purple-400/40 shadow-md flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
                  title="විභාගය කළ සිසුන්ටද නැවත කිරීමට අවසර ලැබෙන පරිදි සියලු දෙනාටම Re-push කරන්න"
                >
                  <Send size={14} />
                  <span>සැමටම Re-Push කරන්න (Allow Retake for All)</span>
                </button>
              </div>

              {/* Refresh data */}
              <button
                type="button"
                onClick={() => handleOpenExamStatus(selectedLiveForStatus, selectedExamForStatus)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw size={13} className={loadingExamStatus ? 'animate-spin' : ''} />
                <span>Refresh</span>
              </button>
            </div>

            {/* Search and Tabs Header */}
            <div className="p-4 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setExamStatusTab('uncompleted')}
                  className={`px-4 py-2 rounded-xl text-xs font-black transition flex items-center gap-2 cursor-pointer ${
                    examStatusTab === 'uncompleted'
                      ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  <Clock size={14} />
                  <span>විභාගය නොකළ සිසුන් ({uncompletedExamStudents.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setExamStatusTab('completed')}
                  className={`px-4 py-2 rounded-xl text-xs font-black transition flex items-center gap-2 cursor-pointer ${
                    examStatusTab === 'completed'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  <UserCheck size={14} />
                  <span>විභාගය කළ සිසුන් ({completedExamStudents.length})</span>
                </button>
              </div>

              <input
                type="text"
                placeholder="සිසුවාගේ නම හෝ Username සොයන්න..."
                value={examStatusSearch}
                onChange={(e) => setExamStatusSearch(e.target.value)}
                className="bg-slate-950 text-white px-3 py-1.5 rounded-xl border border-slate-800 text-xs focus:outline-none focus:border-blue-500 w-full sm:w-60"
              />
            </div>

            {/* List Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {loadingExamStatus ? (
                <div className="p-12 text-center text-slate-400 text-xs">
                  <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  දත්ත පූරණය වෙමින් පවතී...
                </div>
              ) : examStatusTab === 'uncompleted' ? (
                // TAB 1: UNCOMPLETED / PENDING STUDENTS
                uncompletedExamStudents.length === 0 ? (
                  <div className="p-12 text-center text-emerald-400 bg-emerald-950/20 border border-emerald-800/40 rounded-2xl text-xs font-bold">
                    🎉 සියලුම සිසුන් මෙම විභාගය සම්පූර්ණ කර ඇත! (All enrolled students have completed this exam)
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-2xl border border-slate-800">
                    <table className="w-full text-left text-xs text-slate-300">
                      <thead className="bg-slate-950 text-slate-400 text-[11px] uppercase font-bold border-b border-slate-800">
                        <tr>
                          <th className="p-3">#</th>
                          <th className="p-3">සිසුවාගේ නම (Student)</th>
                          <th className="p-3">Username</th>
                          <th className="p-3">පන්ති (Class)</th>
                          <th className="p-3">දුරකථන / WhatsApp</th>
                          <th className="p-3 text-center">තත්ත්වය (Status)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800 bg-slate-900/60 font-medium">
                        {uncompletedExamStudents
                          .filter(item => {
                            if (!examStatusSearch) return true;
                            const q = examStatusSearch.toLowerCase();
                            const name = (item.student.name || `${item.student.firstName || ''} ${item.student.lastName || ''}`).toLowerCase();
                            const user = (item.student.username || '').toLowerCase();
                            return name.includes(q) || user.includes(q);
                          })
                          .map((item, idx) => (
                            <tr key={item.student.id || idx} className="hover:bg-slate-800/40 transition">
                              <td className="p-3 text-slate-500 font-mono">{idx + 1}</td>
                              <td className="p-3 font-bold text-white">
                                {item.student.name || `${item.student.firstName || ''} ${item.student.lastName || ''}`.trim() || item.student.username}
                              </td>
                              <td className="p-3 font-mono text-amber-400">{item.student.username}</td>
                              <td className="p-3 text-slate-400">
                                {Array.isArray(item.student.class_types) ? item.student.class_types.join(', ') : item.student.class_types || '-'}
                              </td>
                              <td className="p-3 font-mono text-slate-400">
                                {item.student.whatsapp || item.student.WhatsApp || item.student.mobile || '-'}
                              </td>
                              <td className="p-3 text-center">
                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                                  තවමත් කර නොමැත (Pending)
                                </span>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )
              ) : (
                // TAB 2: COMPLETED STUDENTS
                completedExamStudents.length === 0 ? (
                  <div className="p-12 text-center text-slate-400 bg-slate-950 border border-slate-800 rounded-2xl text-xs">
                    තවමත් කිසිදු සිසුවෙක් මෙම විභාගය Submit කර නොමැත.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-2xl border border-slate-800">
                    <table className="w-full text-left text-xs text-slate-300">
                      <thead className="bg-slate-950 text-slate-400 text-[11px] uppercase font-bold border-b border-slate-800">
                        <tr>
                          <th className="p-3">#</th>
                          <th className="p-3">සිසුවාගේ නම (Student)</th>
                          <th className="p-3">Username</th>
                          <th className="p-3 text-center">ලකුණු (Score)</th>
                          <th className="p-3 text-center">ප්‍රතිශතය (%)</th>
                          <th className="p-3">දිනය සහ වේලාව</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800 bg-slate-900/60 font-medium">
                        {completedExamStudents
                          .filter(item => {
                            if (!examStatusSearch) return true;
                            const q = examStatusSearch.toLowerCase();
                            const name = (item.student.name || `${item.student.firstName || ''} ${item.student.lastName || ''}`).toLowerCase();
                            const user = (item.student.username || '').toLowerCase();
                            return name.includes(q) || user.includes(q);
                          })
                          .map((item, idx) => (
                            <tr key={item.student.id || idx} className="hover:bg-slate-800/40 transition">
                              <td className="p-3 text-slate-500 font-mono">{idx + 1}</td>
                              <td className="p-3 font-bold text-white">
                                {item.student.name || `${item.student.firstName || ''} ${item.student.lastName || ''}`.trim() || item.student.username}
                              </td>
                              <td className="p-3 font-mono text-blue-400">{item.student.username}</td>
                              <td className="p-3 text-center font-bold text-white font-mono">
                                <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700">
                                  {item.score} / {selectedExamForStatus.total_questions || 50}
                                </span>
                              </td>
                              <td className="p-3 text-center font-black font-mono">
                                <span className={`px-2 py-0.5 rounded text-[11px] ${
                                  item.percentage >= 75 ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                                  item.percentage >= 50 ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                                  'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                }`}>
                                  {item.percentage}%
                                </span>
                              </td>
                              <td className="p-3 font-mono text-slate-400 text-[11px]">
                                {item.submitted_at ? new Date(item.submitted_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : '-'}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )
              )}
            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-950 border-t border-slate-800 text-right">
              <button
                type="button"
                onClick={() => setExamStatusModalOpen(false)}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition cursor-pointer"
              >
                වසන්න (Close)
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}