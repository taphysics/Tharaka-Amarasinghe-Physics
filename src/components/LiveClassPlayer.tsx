import React, { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import { Video, Calendar as CalendarIcon, CheckCircle, Clock, AlertCircle } from 'lucide-react';

interface LiveClassPlayerProps {
  username: string;   
  studentId: string;  
}

export default function LiveClassPlayer({ username, studentId }: LiveClassPlayerProps) {
  // Core System States
  const [liveSession, setLiveSession] = useState<any>(null);
  const [paymentStatus, setPaymentStatus] = useState<'loading' | 'paid' | 'free' | 'unpaid'>('loading');
  const [calendarEvents, setCalendarEvents] = useState<any[]>([]);
  const [selectedDateEvents, setSelectedDateEvents] = useState<any[] | null>(null);
  
  // Realtime Active Media States
  const [timeToStart, setTimeToStart] = useState<number>(0); 
  const [showWaitingVideo, setShowWaitingVideo] = useState(false);
  const [isWithin24Hours, setIsWithin24Hours] = useState(false);
  
  // Exam Engine States
  const [examDetails, setExamDetails] = useState<any>(null);
  const [answers, setAnswers] = useState<{ [key: string]: number }>({});
  const [examTimeLeft, setExamTimeLeft] = useState<number | null>(null);
  const [examSubmitted, setExamSubmitted] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [scorePopup, setScorePopup] = useState<{ show: boolean; score: number; total: number }>({ show: false, score: 0, total: 0 });

  // PDF Interaction States
  const [pdfZoom, setPdfZoom] = useState<number>(1);
  const [pdfPan, setPdfPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStart = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Calendar
  const [currentCalendarDate, setCurrentCalendarDate] = useState<Date>(new Date());

  // --- 1. Robust Data Fetching & Sync ---
  const fetchCoreData = async () => {
    if (!username) return;

    try {
      // 1. Fetch Student Data Safely
      const { data: studentData, error: studentError } = await supabase
        .from('students')
        .select('*')
        .eq('username', username)
        .single();

      if (studentError || !studentData) {
        console.error("Student fetch failed:", studentError);
        return;
      }

      // Collect all possible class identifiers to prevent mismatch bypass
      let enrolledClasses: string[] = studentData.class_types || [];
      if (enrolledClasses.length === 0) {
        if (studentData.class) enrolledClasses.push(studentData.class);
        if (studentData.course) enrolledClasses.push(studentData.course);
      }

      const matchClasses = enrolledClasses.length > 0 ? enrolledClasses : ['default'];

      // 2. Fetch Calendar Events
      const { data: events } = await supabase
        .from('calendar_events')
        .select('*')
        .in('class_type', matchClasses);

      // 3. Fetch All Scheduled Live Classes to Merge into the Calendar View
      const { data: allLives } = await supabase
        .from('scheduled_lives')
        .select('*')
        .in('class_type', matchClasses);
      
      // Combine calendar items so newly created admin classes show up dynamically
      let combinedEvents: any[] = [];
      if (events) combinedEvents.push(...events);
      if (allLives) {
        const mappedLives = allLives.map(live => ({
          id: live.id,
          date: live.date,
          title: live.title || `${live.class_type} - සජීවී පන්තිය`,
          description: live.description || 'සූම් ඔස්සේ පැවැත්වෙන සජීවී පන්තිය',
          start_time: live.time,
          class_type: live.class_type,
          is_live_session: true,
          status: live.status
        }));
        
        // Remove duplicates based on date and title (if admin generated both)
        mappedLives.forEach(ml => {
           const exists = combinedEvents.some(ce => ce.date === ml.date && ce.title === ml.title);
           if (!exists) combinedEvents.push(ml);
        });
      }
      setCalendarEvents(combinedEvents);

      // 4. Fetch Next Active Live Class
      const { data: activeLive } = await supabase
        .from('scheduled_lives')
        .select('*')
        .in('class_type', matchClasses)
        .neq('status', 'ended')
        .order('date', { ascending: true })
        .order('time', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (activeLive) {
        setLiveSession(activeLive);
        await validatePayment(activeLive.class_type, activeLive.target_month, studentData);
      } else {
        setLiveSession(null);
        setPaymentStatus('loading');
      }

    } catch (err) {
      console.error("Critical error in data fetch:", err);
    }
  };

  useEffect(() => {
    fetchCoreData();

    // Set up Realtime Triggers to auto-refresh everything when Admin updates DB
    const channels = supabase.channel('custom-all-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scheduled_lives' }, fetchCoreData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_events' }, fetchCoreData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments', filter: `username=eq.${username}` }, fetchCoreData)
      .subscribe();

    return () => { supabase.removeChannel(channels); };
  }, [username]);

  // --- 2. Payment Gateway Validation ---
  const validatePayment = async (classType: string, targetMonth: string, studentData: any) => {
    if (studentData.plan_type === 'free' || studentData.is_paid === true) {
      setPaymentStatus('paid');
      return;
    }

    const { data } = await supabase
      .from('payments')
      .select('status')
      .eq('username', username)
      .eq('class_type', classType)
      .eq('month', targetMonth)
      .maybeSingle();

    if (data && (data.status === 'paid' || data.status === 'free')) {
      setPaymentStatus(data.status);
    } else {
      setPaymentStatus('unpaid');
    }
  };

  // --- 3. Robust Live Clock & Waiting Video Engine ---
  useEffect(() => {
    if (!liveSession || liveSession.status === 'completed' || liveSession.status === 'ended') {
      setShowWaitingVideo(false);
      return;
    }

    const calculateTime = () => {
      try {
        const timeStr = liveSession.time.length === 5 ? `${liveSession.time}:00` : liveSession.time;
        
        // Safe Cross-Browser Date Parsing (Prevents Safari/Mobile NaN bugs)
        const [year, month, day] = liveSession.date.split('-').map(Number);
        const [hour, minute, second] = timeStr.split(':').map(Number);
        const classDateTime = new Date(year, month - 1, day, hour, minute, second || 0);
        
        const now = new Date();
        const diffSec = Math.floor((classDateTime.getTime() - now.getTime()) / 1000);
        
        setTimeToStart(diffSec);
        setIsWithin24Hours(diffSec <= 86400 && diffSec > -86400);

        // Core Player Trigger Logic
        if (liveSession.status === 'live') {
          setShowWaitingVideo(false);
        } else if (diffSec <= 900 && diffSec > -28800) { 
          // Show waiting video inside last 15 mins OR if class time has arrived but admin hasn't clicked live yet
          setShowWaitingVideo(true);
        } else {
          setShowWaitingVideo(false);
        }
      } catch (e) {
        console.error("Time calculation error:", e);
      }
    };

    calculateTime(); // Execute immediately on load to prevent 1s component flash
    const interval = setInterval(calculateTime, 1000);

    return () => clearInterval(interval);
  }, [liveSession]);

  // --- 4. Exam Split-Screen Engine ---
  useEffect(() => {
    if (liveSession?.is_exam_active && liveSession?.active_exam_id && !examSubmitted) {
      const fetchActiveExam = async () => {
        const { data } = await supabase.from('exams').select('*').eq('id', liveSession.active_exam_id).single();
        if (data && data.status === 'active') {
          setExamDetails(data);
          if (examTimeLeft === null) setExamTimeLeft(data.duration_minutes * 60);
        }
      };
      fetchActiveExam();
    } else if (!liveSession?.is_exam_active) {
      setExamDetails(null);
    }
  }, [liveSession?.is_exam_active, liveSession?.active_exam_id, examSubmitted]);

  useEffect(() => {
    if (examTimeLeft === null || examTimeLeft <= 0 || examSubmitted) return;
    const examTimer = setInterval(() => {
      setExamTimeLeft((prev) => {
        if (prev !== null && prev <= 1) {
          clearInterval(examTimer);
          executeExamScoringSubmission(true);
          return 0;
        }
        return prev ? prev - 1 : 0;
      });
    }, 1000);
    return () => clearInterval(examTimer);
  }, [examTimeLeft, examSubmitted]);

  const selectOMRAnswer = (qNo: number, optionIdx: number) => {
    setAnswers((prev) => ({ ...prev, [qNo.toString()]: optionIdx }));
  };

  const executeExamScoringSubmission = async (isForcedAutoSubmit = false) => {
    if (!examDetails || examSubmitted) return;
    setShowConfirmModal(false);
    setExamSubmitted(true);

    let rawScore = 0;
    const modelAnswers = examDetails.correct_answer || {};

    for (let i = 1; i <= examDetails.total_questions; i++) {
      const qKey = i.toString();
      if (answers[qKey] !== undefined && Number(answers[qKey]) === Number(modelAnswers[qKey])) {
        rawScore++;
      }
    }

    try {
      await supabase.from('exam_results').insert({
        username: username,
        exam_id: examDetails.id,
        student_id: studentId,
        score: rawScore,
        submitted_at: new Date().toISOString(),
        meta_data: { student_selected_answers: answers, auto_submitted: isForcedAutoSubmit }
      });
    } catch (err) { console.error("Database save failed:", err); }

    setScorePopup({ show: true, score: rawScore, total: examDetails.total_questions });
  };

  // --- Utility Functions ---
  const formatCountdown = (totalSeconds: number) => {
    if (totalSeconds <= 0) return '00:00:00';
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const formatLocalYYYYMMDD = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const getDaysInMonth = (date: Date) => {
    const y = date.getFullYear(); const m = date.getMonth();
    return new Array(new Date(y, m + 1, 0).getDate()).fill(null).map((_, i) => new Date(y, m, i + 1));
  };
  const monthDays = useMemo(() => getDaysInMonth(currentCalendarDate), [currentCalendarDate]);

  const getEmbedUrl = (url: string) => url ? url.replace(/\/view.*$/, '/preview') : '';

  // Converts standard Zoom link into an iframe-embeddable Zoom Webclient format
  const formatZoomUrl = (url: string) => {
    if (!url) return "";
    try {
      if (url.includes('/wc/join/') || url.includes('/wc/')) return url;
      
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/');
      const jIndex = pathParts.indexOf('j');
      
      let meetingId = '';
      if (jIndex !== -1 && pathParts[jIndex + 1]) {
        meetingId = pathParts[jIndex + 1];
      } else {
        meetingId = pathParts[pathParts.length - 1];
      }
      
      const pwd = urlObj.searchParams.get('pwd') || '';
      if (meetingId) {
        return `https://zoom.us/wc/join/${meetingId}?pwd=${pwd}&prefer=1`;
      }
      return url;
    } catch (e) { 
      return url; 
    }
  };

  // --- Display Rules Matrix ---
  const activeHasAccess = paymentStatus === 'paid' || paymentStatus === 'free';
  const isWithin1Hour = timeToStart > 0 && timeToStart <= 3600;
  
  const showPaymentWarning = !activeHasAccess && liveSession && liveSession.status !== 'ended' && isWithin24Hours;
  // Panel opens if student has access AND (class is live, within 1hr countdown, or waiting video is active)
  const showActivePlayerPanel = activeHasAccess && liveSession && (isWithin1Hour || liveSession.status === 'live' || showWaitingVideo);
  const showCalendarView = !showActivePlayerPanel;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans antialiased overflow-x-hidden">
      
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between shadow-lg sticky top-0 z-40">
        <div className="flex items-center space-x-3">
          {liveSession?.status === 'live' ? (
             <div className="h-3 w-3 rounded-full bg-red-500 animate-pulse" />
          ) : (
             <div className="h-3 w-3 rounded-full bg-indigo-500 animate-pulse" />
          )}
          <h1 className="text-lg font-bold text-slate-200">
            {liveSession && !showCalendarView ? liveSession.title : 'සජීවී පන්ති සහ කාලසටහන (Live Classes)'}
          </h1>
        </div>
      </header>

      {showPaymentWarning && (
        <div className="bg-gradient-to-r from-red-600 to-amber-600 px-6 py-4 text-center text-sm font-bold tracking-wide shadow-2xl flex flex-col sm:flex-row items-center justify-center space-y-2 sm:space-y-0 sm:space-x-3 text-white border-b-4 border-red-800 animate-in slide-in-from-top">
          <AlertCircle className="w-6 h-6 animate-bounce" />
          <span>සජීවී පන්තියට සහභාගී වීමට කරුණාකර මෙම මාසයට අදාළ ගෙවීම් සම්පූර්ණ කරන්න! ගෙවූ සැණින් පන්තිය විවෘත වේ.</span>
        </div>
      )}

      <main className="flex-grow p-4 md:p-6 flex flex-col gap-6 max-w-[1600px] w-full mx-auto relative">
        
        {/* ========================================================================================= */}
        {/* CALENDAR VIEW */}
        {/* ========================================================================================= */}
        {showCalendarView && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start animate-fade-in relative">
            
            {showPaymentWarning && <div className="absolute inset-0 bg-slate-950/20 backdrop-blur-[1px] z-10 pointer-events-none rounded-2xl" />}

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl lg:col-span-2 relative z-0">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
                <h2 className="text-xl font-bold text-slate-200 tracking-tight flex items-center gap-2">
                  <CalendarIcon className="text-indigo-500" /> {currentCalendarDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
                </h2>
                <div className="flex space-x-2">
                  <button onClick={() => setCurrentCalendarDate(new Date(currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1)))} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition border border-slate-800">←</button>
                  <button onClick={() => setCurrentCalendarDate(new Date())} className="px-4 py-1 text-xs font-bold hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition border border-slate-800">අද දින</button>
                  <button onClick={() => setCurrentCalendarDate(new Date(currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1)))} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition border border-slate-800">→</button>
                </div>
              </div>

              <div className="grid grid-cols-7 gap-2 mb-2 text-center text-xs font-bold uppercase tracking-wider text-slate-500">
                <div>සඳුදා</div><div>අඟහ</div><div>බදා</div><div>බ්‍රහස්</div><div>සිකු</div><div>සෙන</div><div>ඉරිදා</div>
              </div>

              <div className="grid grid-cols-7 gap-2">
                {monthDays.map((day, idx) => {
                  const dayString = formatLocalYYYYMMDD(day);
                  const dayEvents = calendarEvents.filter(e => e.date === dayString);
                  const hasEvent = dayEvents.length > 0;
                  
                  const isPast = dayEvents.some(e => {
                     const evDateTime = new Date(`${e.date}T${e.start_time || '23:59:00'}`);
                     return evDateTime < new Date() || e.status === 'ended';
                  });

                  return (
                    <button
                      key={idx}
                      onClick={() => hasEvent && setSelectedDateEvents(dayEvents)}
                      disabled={!hasEvent}
                      className={`min-h-[90px] p-2 rounded-xl flex flex-col justify-between items-start transition-all border text-left group relative ${
                        hasEvent 
                          ? isPast 
                            ? 'bg-slate-900/60 border-slate-800/50 text-slate-500 opacity-60 hover:opacity-100'
                            : 'bg-indigo-950/40 border-indigo-500/50 hover:bg-indigo-900 shadow-[0_0_15px_rgba(99,102,241,0.1)] text-slate-100 hover:scale-[1.02] z-10'
                          : 'bg-slate-900/10 border-transparent text-slate-600 cursor-not-allowed'
                      }`}
                    >
                      <span className="font-mono text-sm font-black">{day.getDate()}</span>
                      {hasEvent && (
                        <div className="w-full mt-2 space-y-1">
                          {dayEvents.map((ev, eIdx) => (
                            <span key={eIdx} className={`block text-[10px] px-1.5 py-0.5 rounded border font-bold truncate w-full ${
                              isPast ? 'bg-slate-800 text-slate-400 border-slate-700' : 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                            }`}>
                              {ev.class_type}
                            </span>
                          ))}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-6 relative z-0">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl min-h-[300px]">
                <h3 className="text-md font-bold text-slate-300 mb-4 border-b border-slate-800 pb-3 flex items-center gap-2">
                  <Video size={18} className="text-indigo-400"/> පන්ති තොරතුරු
                </h3>
                
                {selectedDateEvents ? (
                  <div className="space-y-4">
                    {selectedDateEvents.map((evt, idx) => {
                      const evDateTime = new Date(`${evt.date}T${evt.start_time || '23:59:00'}`);
                      const isPast = evDateTime < new Date() || evt.status === 'ended';
                      return (
                        <div key={idx} className="bg-slate-950 p-5 rounded-xl border border-slate-800 shadow-inner">
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-xs font-mono font-bold text-slate-400 bg-slate-900 px-2 py-1 rounded">{evt.date}</span>
                            <span className={`text-[10px] px-2.5 py-1 rounded-full font-bold uppercase tracking-wider ${
                              isPast ? 'bg-slate-800 text-slate-500' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 animate-pulse'
                            }`}>
                              {isPast ? 'අවසන් වී ඇත' : 'ඉදිරියට පැවැත්වේ'}
                            </span>
                          </div>
                          <h4 className="text-sm font-black text-slate-100 mb-1">{evt.title}</h4>
                          <p className="text-[11px] text-slate-500 leading-relaxed mb-4">{evt.description}</p>
                          <div className="flex gap-4 text-xs font-bold pt-3 border-t border-slate-800/80 text-slate-300">
                            <div className="flex items-center gap-1"><Clock size={14} className="text-indigo-400"/> {evt.start_time}</div>
                            <div className="text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded">{evt.class_type}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center py-12 text-slate-500 opacity-60">
                    <CalendarIcon size={48} className="mb-4" />
                    <p className="text-xs">විස්තර බැලීමට කැලැන්ඩරයෙන් දිනයක් තෝරන්න.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================================= */}
        {/* ACTIVE PLAYER ENGINE */}
        {/* ========================================================================================= */}
        {showActivePlayerPanel && (
          <div className={`w-full flex flex-col ${examDetails && !examSubmitted ? 'lg:flex-row' : 'flex-col'} gap-6 items-stretch animate-in zoom-in-95 duration-500`}>
            
            {examDetails && !examSubmitted && (
              <div className="w-full lg:w-3/5 flex flex-col gap-4 bg-slate-900 border border-slate-800 p-4 md:p-5 rounded-2xl shadow-[0_0_40px_rgba(0,0,0,0.5)] order-2 lg:order-1">
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <span className="text-[10px] bg-red-500 text-white px-2 py-0.5 rounded font-bold uppercase tracking-wider animate-pulse mb-1 inline-block shadow-[0_0_10px_rgba(239,68,68,0.5)]">
                      විභාගය ක්‍රියාත්මකයි
                    </span>
                    <h2 className="text-sm font-bold text-slate-200 truncate">{examDetails.title}</h2>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="bg-slate-900 px-4 py-2 rounded-lg border border-slate-800 text-center shadow-inner">
                      <span className="block text-[8px] text-slate-500 uppercase font-bold">ඉතිරි කාලය</span>
                      <span className="text-lg font-mono font-black text-amber-400">
                        {examTimeLeft !== null ? formatCountdown(examTimeLeft) : '00:00:00'}
                      </span>
                    </div>
                    <button onClick={() => setShowConfirmModal(true)} className="bg-red-600 hover:bg-red-700 px-5 py-2.5 rounded-lg font-bold text-xs shadow-lg text-white transition active:scale-95">
                      සබ්මිට් කරන්න
                    </button>
                  </div>
                </div>

                <div className="flex-grow flex flex-col bg-slate-950 border border-slate-800 rounded-xl overflow-hidden min-h-[400px] relative">
                  <div className="absolute top-3 right-3 z-30 bg-slate-900/90 backdrop-blur-md border border-slate-700 p-1.5 rounded-xl flex space-x-1 shadow-xl">
                    <button onClick={() => setPdfZoom((z) => Math.min(z + 0.25, 3))} className="p-2 hover:bg-slate-800 text-white rounded text-xs font-bold">+</button>
                    <button onClick={() => setPdfZoom((z) => Math.max(z - 0.25, 0.75))} className="p-2 hover:bg-slate-800 text-white rounded text-xs font-bold">-</button>
                    <button onClick={() => { setPdfZoom(1); setPdfPan({ x: 0, y: 0 }); }} className="p-2 hover:bg-slate-800 text-slate-300 rounded text-[10px] font-bold">Reset</button>
                  </div>
                  <div 
                    className="w-full h-full overflow-hidden relative cursor-grab active:cursor-grabbing bg-slate-800/50 flex items-center justify-center"
                    onWheel={(e) => { e.preventDefault(); e.deltaY < 0 ? setPdfZoom((z) => Math.min(z + 0.25, 3)) : setPdfZoom((z) => Math.max(z - 0.25, 0.75)); }}
                    onMouseDown={(e) => { setIsDragging(true); dragStart.current = { x: e.clientX - pdfPan.x, y: e.clientY - pdfPan.y }; }}
                    onMouseMove={(e) => { if (isDragging) setPdfPan({ x: e.clientX - dragStart.current.x, y: e.clientY - dragStart.current.y }); }}
                    onMouseUp={() => setIsDragging(false)}
                    onMouseLeave={() => setIsDragging(false)}
                  >
                    <div className="w-full h-full transition-transform duration-75 origin-center" style={{ transform: `scale(${pdfZoom}) translate(${pdfPan.x / pdfZoom}px, ${pdfPan.y / pdfZoom}px)`, pointerEvents: isDragging ? 'none' : 'auto' }}>
                      <iframe src={getEmbedUrl(examDetails.pdf_url)} className="w-full h-full border-0 rounded-xl" title="PDF Exam Paper" />
                    </div>
                  </div>
                </div>

                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 max-h-[220px] overflow-y-auto">
                  <h3 className="text-xs font-bold text-slate-400 mb-3 border-b border-slate-800 pb-2">
                    පිළිතුරු පත්‍රය <span className="text-indigo-400 ml-2">({Object.keys(answers).length} / {examDetails.total_questions})</span>
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                    {Array.from({ length: examDetails.total_questions }, (_, i) => i + 1).map((qNum) => {
                      const qKey = qNum.toString();
                      return (
                        <div key={qNum} className="flex items-center justify-between bg-slate-900/80 p-2 rounded-xl border border-slate-800">
                          <span className="font-mono text-xs font-bold text-slate-400 w-8 text-center">{qNum}.</span>
                          <div className="flex space-x-1">
                            {[1, 2, 3, 4, 5].map((optIdx) => (
                              <button key={optIdx} onClick={() => selectOMRAnswer(qNum, optIdx)} className={`w-8 h-8 rounded-lg text-xs font-bold transition-all border flex items-center justify-center ${answers[qKey] === optIdx ? 'bg-indigo-600 border-indigo-500 text-white shadow-md scale-110' : 'bg-slate-950 border-slate-700 text-slate-400 hover:border-slate-500'}`}>
                                {optIdx}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            <div className={`${examDetails && !examSubmitted ? 'w-full lg:w-2/5 h-[40vh] lg:h-auto min-h-[400px]' : 'w-full h-[75vh] min-h-[600px]'} bg-black border border-slate-800 rounded-2xl overflow-hidden relative shadow-[0_0_50px_rgba(0,0,0,0.8)] order-1 lg:order-2 flex flex-col items-center justify-center`}>
              
              {/* 1 Hour Countdown Screen */}
              {!showWaitingVideo && liveSession?.status !== 'live' && timeToStart > 900 && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]">
                  <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800 p-8 rounded-3xl text-center shadow-2xl animate-fade-in scale-100">
                    <Video size={48} className="text-indigo-500 mx-auto mb-4 animate-bounce" />
                    <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-2">පන්තිය ආරම්භ වීමට ඉතිරි කාලය</h2>
                    <h1 className="text-2xl font-black text-white mb-6 bg-indigo-600/20 px-4 py-2 rounded-lg border border-indigo-500/30 inline-block">{liveSession.class_type}</h1>
                    <div className="font-mono text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400 tracking-wider drop-shadow-lg">
                      {formatCountdown(timeToStart)}
                    </div>
                  </div>
                </div>
              )}

              {/* 15 Minute Waiting Video Screen */}
              {showWaitingVideo && (
                <div className="absolute inset-0 w-full h-full z-10 bg-black">
                  <video src="/videos/waiting-video.mp4" autoPlay loop muted playsInline className="w-full h-full object-cover" />
                  <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 bg-black/60 backdrop-blur-md px-6 py-2 rounded-full border border-white/10 flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    <span className="font-mono font-bold text-white tracking-widest">
                      {timeToStart > 0 ? formatCountdown(timeToStart) : "ඇඩ්මින් පන්තිය ආරම්භ කරන තෙක් රැඳී සිටින්න..."}
                    </span>
                  </div>
                </div>
              )}

              {/* Embedded Iframe Live Zoom Web Client Screen */}
              {!showWaitingVideo && liveSession?.status === 'live' && liveSession.zoom_join_url && (
                <iframe
                  src={formatZoomUrl(liveSession.zoom_join_url)}
                  className="w-full h-full border-0 absolute inset-0 z-20"
                  allow="camera; microphone; fullscreen; display-capture"
                  title="Zoom Live Video Web App"
                />
              )}
            </div>
          </div>
        )}
      </main>

      {/* MODALS */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl text-center">
             <div className="h-12 w-12 rounded-full bg-amber-500/10 text-amber-500 mx-auto flex items-center justify-center mb-4">
                <CheckCircle size={24} />
             </div>
             <h3 className="text-lg font-bold text-slate-200 mb-2">පිළිතුරු සබ්මිට් කරන්නද?</h3>
             <p className="text-xs text-slate-400 mb-6 leading-relaxed">ඔබ ලබාදී ඇති පිළිතුරු සබ්මිට් කළ පසු නැවත වෙනස් කළ නොහැක.</p>
             <div className="flex gap-3">
               <button onClick={() => setShowConfirmModal(false)} className="flex-1 bg-slate-800 text-white font-bold py-3 rounded-xl text-xs transition">නැත, ආපසු යන්න</button>
               <button onClick={() => executeExamScoringSubmission(false)} className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-xl text-xs transition shadow-lg shadow-red-900/50">ඔව්, සබ්මිට් කරන්න</button>
             </div>
          </div>
        </div>
      )}

      {scorePopup.show && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-4 z-50 animate-in zoom-in duration-300">
          <div className="bg-slate-900 border border-emerald-500/30 rounded-3xl max-w-sm w-full p-8 text-center shadow-[0_0_50px_rgba(16,185,129,0.2)] relative overflow-hidden">
            <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-emerald-400 to-teal-400"></div>
            <div className="h-16 w-16 bg-emerald-500/10 text-emerald-400 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-emerald-500/20">
              <CheckCircle size={32} />
            </div>
            <h2 className="text-xl font-black text-slate-100 mb-1">විභාගය සාර්ථකයි!</h2>
            <div className="inline-block bg-slate-950 border border-slate-800 rounded-2xl px-8 py-4 shadow-inner mb-8 mt-4">
              <div className="text-5xl font-black text-emerald-400 font-mono tracking-tight">
                {scorePopup.score} <span className="text-xl text-slate-500 font-normal">/ {scorePopup.total}</span>
              </div>
              <span className="text-[9px] text-slate-500 font-bold uppercase block mt-1">නිවැරදි පිළිතුරු</span>
            </div>
            <button onClick={() => setScorePopup({ ...scorePopup, show: false })} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3.5 rounded-xl text-xs tracking-wide shadow-lg hover:shadow-emerald-900/50 transition active:scale-95">
              ලකුණු පත්‍රය වසා පන්තියට යන්න
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
