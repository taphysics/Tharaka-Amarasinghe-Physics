import React, { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '../supabaseClient';

interface LiveClassPlayerProps {
  classId?: string;   // දැන් මෙය Optional වේ (පන්තියක් නොමැති විට undefined පැමිණීමට ඉඩ ඇත)
  username: string;   // Current student's username
  studentId: string;  // Current student's ID
}

export default function LiveClassPlayer({ classId, username, studentId }: LiveClassPlayerProps) {
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
  const [scorePopup, setScorePopup] = useState<{ show: boolean; score: number; total: number }>({
    show: false,
    score: 0,
    total: 0,
  });

  // PDF Interaction Viewport States
  const [pdfZoom, setPdfZoom] = useState<number>(1);
  const [pdfPan, setPdfPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStart = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const pdfContainerRef = useRef<HTMLDivElement>(null);

  // Calendar Utility Navigation
  const [currentCalendarDate, setCurrentCalendarDate] = useState<Date>(new Date());

  // 1. Fetch Initial Data (Independent Calendar & Safe Live Session Loading)
  useEffect(() => {
    const initStudentDashboard = async () => {
      // (A) සජීවී පන්තියක් තිබුණත් නැතත්, සිසුවාගේ පන්ති වර්ගයට අදාළ කැලැන්ඩරය ලබා ගැනීම
      if (username) {
        try {
          const { data: studentData } = await supabase
            .from('students')
            .select('class_types')
            .eq('username', username)
            .single();

          if (studentData?.class_types && studentData.class_types.length > 0) {
            const { data: events } = await supabase
              .from('calender_events') // ඔබගේ Database Schema එකෙහි ඇති නිවැරදි නම
              .select('*')
              .in('class_type', studentData.class_types);
            
            if (events) setCalendarEvents(events);
          }
        } catch (e) {
          console.error("Error fetching calendar data:", e);
        }
      }

      // (B) සජීවී පන්තියක් (classId) ඇත්නම් පමණක් එය Fetch කිරීම (400 Error එක මගහැරීම)
      if (classId && classId !== 'undefined' && classId !== 'null') {
        try {
          const { data, error } = await supabase
            .from('scheduled_lives')
            .select('*')
            .eq('id', classId)
            .single();
            
          if (data) {
            setLiveSession(data);
            checkPaymentEligibility(data.class_type, data.target_month);
          }
        } catch (e) {
          console.error("Error fetching live session:", e);
        }
      } else {
        setLiveSession(null);
      }
    };

    initStudentDashboard();

    // සජීවී පන්තියක් ඇත්නම් පමණක් Realtime Channel එක සක්‍රීය කිරීම
    let sessionSubscription: any;
    if (classId && classId !== 'undefined' && classId !== 'null') {
      sessionSubscription = supabase
        .channel(`live-session-${classId}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'scheduled_lives', filter: `id=eq.${classId}` },
          (payload) => {
            setLiveSession(payload.new);
            if (payload.new) {
              checkPaymentEligibility(payload.new.class_type, payload.new.target_month);
            }
          }
        )
        .subscribe();
    }

    return () => {
      if (sessionSubscription) supabase.removeChannel(sessionSubscription);
    };
  }, [classId, username]);

  // 2. Dynamic Gateway Validation Engine (ගෙවීම් පරීක්ෂාව)
  const checkPaymentEligibility = async (classType: string, targetMonth: string) => {
    const { data, error } = await supabase
      .from('payments')
      .select('status')
      .eq('username', username)
      .eq('class_type', classType)
      .eq('month', targetMonth)
      .maybeSingle();

    if (data) {
      if (data.status === 'paid') setPaymentStatus('paid');
      else if (data.status === 'free') setPaymentStatus('free');
      else setPaymentStatus('unpaid');
    } else {
      setPaymentStatus('unpaid');
    }
  };

  // 3. Realtime Gateway Verification Listener
  useEffect(() => {
    if (!liveSession) return;
    const paymentSubscription = supabase
      .channel('realtime-payments-channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'payments', filter: `username=eq.${username}` },
        () => {
          checkPaymentEligibility(liveSession.class_type, liveSession.target_month);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(paymentSubscription);
    };
  }, [liveSession, username]);

  // 4. Live Clock & Dynamic Pre-Class Timeline Watcher (Waiting Video / Countdown)
  useEffect(() => {
    if (!liveSession || liveSession.status === 'completed') return;

    const interval = setInterval(() => {
      const classDateTime = new Date(`${liveSession.date}T${liveSession.time}`);
      const now = new Date();
      const diffMs = classDateTime.getTime() - now.getTime();
      const diffSec = Math.floor(diffMs / 1000);

      setTimeToStart(diffSec);

      if (diffSec <= 86400 && diffSec > 0) {
        setIsWithin24Hours(true);
      } else {
        setIsWithin24Hours(false);
      }

      // හරියටම අවසාන පැයේදී Waiting Video එක පෙන්වීම
      if (diffSec <= 3600 && diffSec > 0 && liveSession.status === 'scheduled') {
        setShowWaitingVideo(true);
      } else {
        setShowWaitingVideo(false);
      }

      if (diffSec <= 0 && liveSession.status === 'scheduled') {
        setShowWaitingVideo(false);
        setIsWithin24Hours(false);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [liveSession]);

  // 5. Exam Realtime Interceptor & State Synchronization
  useEffect(() => {
    if (liveSession?.is_exam_active && liveSession?.active_exam_id && !examSubmitted) {
      const fetchActiveExam = async () => {
        const { data, error } = await supabase
          .from('exams')
          .select('*')
          .eq('id', liveSession.active_exam_id)
          .single();

        if (data && data.status === 'active') {
          setExamDetails(data);
          if (examTimeLeft === null) {
            setExamTimeLeft(data.duration_minutes * 60);
          }
        }
      };
      fetchActiveExam();
    } else if (!liveSession?.is_exam_active) {
      setExamDetails(null);
      setExamTimeLeft(null);
    }
  }, [liveSession?.is_exam_active, liveSession?.active_exam_id, examSubmitted]);

  // 6. Exam Countdown Timer Engine with Autonomous Safe Fallback Submit
  useEffect(() => {
    if (examTimeLeft === null || examTimeLeft <= 0 || examSubmitted) return;

    const examTimer = setInterval(() => {
      setExamTimeLeft((prev) => {
        if (prev !== null && prev <= 1) {
          clearInterval(examTimer);
          executeExamScoringSubmission(true); // කාලය අවසන් වූ විට ස්වයංක්‍රීයව Submit වීම
          return 0;
        }
        return prev ? prev - 1 : 0;
      });
    }, 1000);

    return () => clearInterval(examTimer);
  }, [examTimeLeft, examSubmitted]);

  // Helper Utility: Parse Target Dates to Verify Highlight Availability
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    return new Array(new Date(year, month + 1, 0).getDate()).fill(null).map((_, i) => new Date(year, month, i + 1));
  };

  const monthDays = useMemo(() => getDaysInMonth(currentCalendarDate), [currentCalendarDate]);

  // Format Helper Tasks
  const formatCountdown = (totalSeconds: number) => {
    if (totalSeconds <= 0) return '00:00:00';
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const getEmbedUrl = (url: string) => {
    if (!url) return '';
    return url.replace(/\/view.*$/, '/preview');
  };

  // OMR Input Handler
  const selectOMRAnswer = (qNo: number, optionIdx: number) => {
    setAnswers((prev) => ({ ...prev, [qNo.toString()]: optionIdx }));
  };

  // Verification & Secure Submission Protocol
  const handleManualSubmitTrigger = () => {
    setShowConfirmModal(true);
  };

  const executeExamScoringSubmission = async (isForcedAutoSubmit = false) => {
    if (!examDetails || examSubmitted) return;
    setShowConfirmModal(false);
    setExamSubmitted(true);

    let rawScore = 0;
    const modelAnswers = examDetails.correct_answer || {};

    // ලකුණු ගණනය කිරීම (Scoring System)
    for (let i = 1; i <= examDetails.total_questions; i++) {
      const qKey = i.toString();
      if (answers[qKey] !== undefined && Number(answers[qKey]) === Number(modelAnswers[qKey])) {
        rawScore++;
      }
    }

    // Database එකට ලකුණු යාවත්කාලීන කිරීම
    try {
      await supabase.from('exam_results').insert({
        username: username,
        exam_id: examDetails.id,
        student_id: studentId,
        score: rawScore,
        submitted_at: new Date().toISOString(),
        meta_data: { student_selected_answers: answers, auto_submitted: isForcedAutoSubmit }
      });
    } catch (err) {
      console.error("Failed persisting metrics to database layers:", err);
    }

    // ලකුණු පොපප් එක පෙන්වීම
    setScorePopup({
      show: true,
      score: rawScore,
      total: examDetails.total_questions
    });
  };

  // Interactive PDF Viewport Zoom & Drag Navigation Controls Matrix
  const applyPdfZoomIn = () => setPdfZoom((z) => Math.min(z + 0.25, 3));
  const applyPdfZoomOut = () => setPdfZoom((z) => Math.max(z - 0.25, 0.75));
  const resetPdfViewSettings = () => {
    setPdfZoom(1);
    setPdfPan({ x: 0, y: 0 });
  };

  const handlePdfWheelZoomEvent = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.deltaY < 0) applyPdfZoomIn();
    else applyPdfZoomOut();
  };

  const handlePdfDragStart = (e: React.MouseEvent) => {
    setIsDragging(true);
    dragStart.current = { x: e.clientX - pdfPan.x, y: e.clientY - pdfPan.y };
  };

  const handlePdfDragMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPdfPan({
      x: e.clientX - dragStart.current.x,
      y: e.clientY - dragStart.current.y
    });
  };

  const handlePdfDragEnd = () => setIsDragging(false);

  // Dynamic Content Render Decider Matrix
  const activeHasAccess = paymentStatus === 'paid' || paymentStatus === 'free';
  const showLockOverlayAlert = !activeHasAccess && isWithin24Hours && liveSession?.status !== 'completed';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans antialiased selection:bg-indigo-500 selection:text-white">
      
      {/* Top Application Header Bar */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex flex-wrap items-center justify-between shadow-xl sticky top-0 z-40">
        <div className="flex items-center space-x-3">
          <div className="h-3 w-3 rounded-full bg-indigo-500 animate-pulse" />
          <h1 className="text-lg font-bold tracking-tight text-slate-200">
            {liveSession ? liveSession.title : 'සජීවී පන්ති පැනලය (Live Classes)'}
          </h1>
        </div>
        {liveSession && (
          <div className="text-xs bg-slate-800 text-slate-400 px-3 py-1.5 rounded-md font-mono border border-slate-700/60">
            පන්ති මාදිලිය: <span className="text-indigo-400 font-semibold">{liveSession.class_type}</span>
          </div>
        )}
      </header>

      {/* Gateway Restricted Paywall Warning Top Notification Bar */}
      {showLockOverlayAlert && (
        <div className="bg-gradient-to-r from-amber-600 to-red-600 px-6 py-4 text-center text-sm font-semibold tracking-wide shadow-inner flex items-center justify-center space-x-2 animate-fade-in text-white">
          <svg className="w-5 h-5 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>පන්තියට සම්බන්ධ වීමට කරුණාකර මෙම මාසයට අදාළ ගෙවීම් සම්පූර්ණ කරන්න! (ගෙවීම් තහවුරු වූ වහාම මෙම තිරය ස්වයංක්‍රීයව යාවත්කාලීන වේ)</span>
        </div>
      )}

      {/* Main Structural Viewport Body */}
      <main className="flex-grow p-4 md:p-6 flex flex-col gap-6 max-w-[1600px] w-full mx-auto">
        
        {/* VIEW ENGINE MATRIX: IF COMPLETED OR NOT ACTIVE OR ACCESS RESTRICTED -> RENDER SYSTEM CALENDAR */}
        {(liveSession?.status === 'completed' || liveSession?.status === 'scheduled' || !activeHasAccess || !liveSession) && !showWaitingVideo ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            
            {/* Interactive Grid Calendar Structure */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl lg:col-span-2">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-slate-200 tracking-tight">
                  {currentCalendarDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
                </h2>
                <div className="flex space-x-2">
                  <button 
                    onClick={() => setCurrentCalendarDate(new Date(currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1)))}
                    className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition border border-slate-800"
                  >
                    ←
                  </button>
                  <button 
                    onClick={() => setCurrentCalendarDate(new Date())}
                    className="px-3 py-1 text-xs hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition border border-slate-800"
                  >
                    අද දින
                  </button>
                  <button 
                    onClick={() => setCurrentCalendarDate(new Date(currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1)))}
                    className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition border border-slate-800"
                  >
                    →
                  </button>
                </div>
              </div>

              {/* Day Titles Header Row */}
              <div className="grid grid-cols-7 gap-2 mb-2 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">
                <div>සඳුදා</div><div>අඟහ</div><div>බදාදා</div><div>බ්‍රහස්</div><div>සිකු</div><div>සෙන</div><div>ඉරිදා</div>
              </div>

              {/* Interactive Month Days View Renderer Layout */}
              <div className="grid grid-cols-7 gap-2">
                {monthDays.map((day, idx) => {
                  const dayString = day.toISOString().split('T')[0];
                  // Filter events mapped explicitly to this targeted tracking date calendar slot
                  const dayEvents = calendarEvents.filter(e => e.date === dayString);
                  const hasLiveEvent = dayEvents.length > 0;
                  const isPastEvent = day < new Date(new Date().setHours(0,0,0,0));

                  return (
                    <button
                      key={idx}
                      onClick={() => hasLiveEvent && setSelectedDateEvents(dayEvents)}
                      disabled={!hasLiveEvent}
                      className={`min-h-[85px] p-2 rounded-xl flex flex-col justify-between items-start transition-all border text-left group relative ${
                        hasLiveEvent 
                          ? isPastEvent 
                            ? 'bg-slate-900/40 border-slate-800/80 text-slate-500 opacity-60 hover:opacity-100' 
                            : 'bg-indigo-950/40 border-indigo-500/40 hover:border-indigo-500 hover:bg-indigo-950 text-slate-100 shadow-lg'
                          : 'bg-slate-900/10 border-transparent text-slate-600 cursor-not-allowed'
                      }`}
                    >
                      <span className="font-mono text-xs font-bold">{day.getDate()}</span>
                      
                      {hasLiveEvent && (
                        <div className="w-full mt-2 space-y-1">
                          {dayEvents.map((ev, eIdx) => (
                            <div key={eIdx} className="w-full">
                              <span className={`block text-[10px] px-1.5 py-0.5 rounded-md font-medium truncate max-w-full ${
                                isPastEvent ? 'bg-slate-800 text-slate-400' : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                              }`}>
                                {ev.class_type || 'Live Class'}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Structural Meta Display Side-Panel Element View */}
            <div className="space-y-6">
              {/* High Intensity Countdown Section Overlay Clock */}
              {isWithin24Hours && activeHasAccess && liveSession?.status === 'scheduled' && (
                <div className="bg-gradient-to-br from-indigo-900 to-slate-900 border border-indigo-500/30 rounded-2xl p-6 shadow-2xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
                    <svg className="w-24 h-24 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h3 className="text-xs uppercase font-bold tracking-widest text-indigo-400 mb-1">සජීවී පන්තිය ළඟදීම ආරම්භ වේ</h3>
                  <div className="text-sm font-semibold text-slate-200 mb-4 truncate">{liveSession.class_type}</div>
                  <div className="font-mono text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-pink-400 tracking-wider">
                    {formatCountdown(timeToStart)}
                  </div>
                  <p className="text-xs text-slate-400 mt-2">නියමිත වේලාවට සජීවී විකාශය ස්වයංක්‍රීයව මෙහි ක්‍රියාත්මක වේ.</p>
                </div>
              )}

              {/* Selected Highlight History Details Card Container */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
                <h3 className="text-md font-bold text-slate-300 mb-4 border-b border-slate-800 pb-2">පන්ති විස්තර තොරතුරු</h3>
                {selectedDateEvents ? (
                  <div className="space-y-4">
                    {selectedDateEvents.map((evt, idx) => {
                      const isPast = new Date(`${evt.date}`) < new Date(new Date().setHours(0,0,0,0));
                      return (
                        <div key={idx} className="bg-slate-950 p-4 rounded-xl border border-slate-800/80 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-slate-400 font-mono">{evt.date}</span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                              isPast ? 'bg-slate-800 text-slate-400' : 'bg-emerald-500/20 text-emerald-400'
                            }`}>
                              {isPast ? 'අවසන් වූ පන්තියක්' : 'සැලසුම් කර ඇත'}
                            </span>
                          </div>
                          <h4 className="text-sm font-bold text-slate-200">{evt.title || 'පන්ති සැසිය'}</h4>
                          <p className="text-xs text-slate-400 leading-relaxed">{evt.description || 'විස්තර ලබා දී නොමැත.'}</p>
                          <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-1 text-slate-400">
                            <div>🕒 වේලාව: <span className="text-slate-200">{evt.start_time || 'N/A'}</span></div>
                            <div>📚 වර්ගය: <span className="text-indigo-400 font-bold">{evt.class_type}</span></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8 text-slate-500 text-xs">
                    කැලැන්ඩරයේ සජීවී පන්තියක් ඇති දිනයක් තෝරා එහි විස්තර මෙතැනින් නරඹන්න.
                  </div>
                )}
              </div>
            </div>

          </div>
        ) : (
          
          /* ACTIVE INTERACTIVE LIVE VIEWPORT ENGINE MODAL STRATIFICATION */
          activeHasAccess && liveSession && (
            <div className={`w-full flex flex-col ${examDetails && !examSubmitted ? 'lg:flex-row' : 'flex-col'} gap-6 items-stretch`}>
              
              {/* --- REALTIME EXAM SPLIT COMPONENT INTERVENTION INTERFACE PANEL --- */}
              {examDetails && !examSubmitted && (
                <div className="w-full lg:w-3/5 flex flex-col gap-4 bg-slate-900 border border-slate-800 p-4 md:p-5 rounded-2xl shadow-2xl order-2 lg:order-1 animate-slide-in">
                  
                  {/* Exam Tracker Navigation Header */}
                  <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-lg">
                    <div>
                      <span className="text-[10px] bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-md font-bold uppercase tracking-wider block w-max mb-1">
                        විභාගය ක්‍රියාත්මකයි
                      </span>
                      <h2 className="text-sm md:text-base font-bold text-slate-200 truncate max-w-[280px] md:max-w-md">
                        {examDetails.title}
                      </h2>
                    </div>
                    <div className="flex items-center space-x-3">
                      <div className="bg-slate-900 px-4 py-2 rounded-xl border border-slate-800 text-center">
                        <span className="block text-[9px] text-slate-500 uppercase font-mono">ඉතිරි කාලය</span>
                        <span className="text-base md:text-lg font-mono font-black tracking-widest text-amber-400">
                          {examTimeLeft !== null ? formatCountdown(examTimeLeft) : '00:00:00'}
                        </span>
                      </div>
                      <button
                        onClick={handleManualSubmitTrigger}
                        className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 px-5 py-2.5 rounded-xl font-bold text-xs tracking-wide shadow-lg hover:shadow-red-900/30 transition transform active:scale-95 text-white"
                      >
                        පිළිතුරු පත්‍රය ඉදිරිපත් කරන්න
                      </button>
                    </div>
                  </div>

                  {/* PDF Document Container Engine Viewport Control Architecture */}
                  <div className="flex-grow flex flex-col bg-slate-950 border border-slate-800 rounded-xl overflow-hidden min-h-[380px] lg:min-h-[480px] relative">
                    {/* Viewport Floating Interactive Utility Option Toolbar Menu */}
                    <div className="absolute top-3 right-3 z-30 bg-slate-900/90 backdrop-blur-md border border-slate-800 p-1.5 rounded-xl flex items-center space-x-1 shadow-2xl">
                      <button onClick={applyPdfZoomIn} className="p-2 hover:bg-slate-800 text-slate-300 rounded-lg text-xs font-bold transition" title="Zoom In">+</button>
                      <button onClick={applyPdfZoomOut} className="p-2 hover:bg-slate-800 text-slate-300 rounded-lg text-xs font-bold transition" title="Zoom Out">-</button>
                      <button onClick={resetPdfViewSettings} className="p-2 hover:bg-slate-800 text-slate-400 rounded-lg text-[10px] font-semibold transition" title="Reset View">Reset</button>
                    </div>

                    {/* Draggable Transform Controlled Map Canvas Architecture */}
                    <div 
                      ref={pdfContainerRef}
                      className="w-full h-full overflow-hidden relative cursor-grab active:cursor-grabbing bg-slate-900 flex items-center justify-center"
                      onWheel={handlePdfWheelZoomEvent}
                      onMouseDown={handlePdfDragStart}
                      onMouseMove={handlePdfDragMove}
                      onMouseUp={handlePdfDragEnd}
                      onMouseLeave={handlePdfDragEnd}
                    >
                      <div
                        className="w-full h-full transition-transform duration-75 ease-out origin-center"
                        style={{
                          transform: `scale(${pdfZoom}) translate(${pdfPan.x / pdfZoom}px, ${pdfPan.y / pdfZoom}px)`,
                          pointerEvents: isDragging ? 'none' : 'auto'
                        }}
                      >
                        <iframe
                          src={getEmbedUrl(examDetails.pdf_url)}
                          className="w-full h-full border-0 rounded-xl"
                          title="Exam Evaluation Document Viewport"
                          allow="autoplay"
                        />
                      </div>
                    </div>

                    {/* Explicit Manual Origin Independent Pagination Utility Indicator Panel */}
                    <div className="bg-slate-900 border-t border-slate-800 px-4 py-2.5 flex items-center justify-between text-xs text-slate-400">
                      <span>💡 පිටු මාරු කිරීමට PDF එක ඇතුළත ඇති Navigation භාවිතා කරන්න</span>
                      <div className="flex space-x-1">
                        <span className="px-2.5 py-1 bg-slate-950 border border-slate-800 rounded-md font-mono text-[10px]">Zoom: {Math.floor(pdfZoom * 100)}%</span>
                      </div>
                    </div>
                  </div>

                  {/* Complete OMR Answer Sheet Form Sheet Grid Layout */}
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 max-h-[180px] md:max-h-[220px] overflow-y-auto shadow-inner">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center space-x-2 border-b border-slate-800 pb-2">
                      <span>📝 පිළිතුරු සලකුණු කිරීමේ පත්‍රය</span>
                      <span className="text-[10px] text-indigo-400 font-mono normal-case">({Object.keys(answers).length} / {examDetails.total_questions} සම්පූර්ණයි)</span>
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                      {Array.from({ length: examDetails.total_questions }, (_, i) => i + 1).map((qNum) => {
                        const qKey = qNum.toString();
                        return (
                          <div key={qNum} className="flex items-center justify-between bg-slate-900/60 p-2 rounded-xl border border-slate-800/50">
                            <span className="font-mono text-xs font-bold text-slate-400 w-6 text-center">{qNum}.</span>
                            <div className="flex items-center space-x-1.5">
                              {[1, 2, 3, 4, 5].map((optIdx) => {
                                const isSelected = answers[qKey] === optIdx;
                                return (
                                  <button
                                    key={optIdx}
                                    onClick={() => selectOMRAnswer(qNum, optIdx)}
                                    className={`w-7 h-7 rounded-lg text-xs font-mono font-bold transition-all border flex items-center justify-center ${
                                      isSelected
                                        ? 'bg-indigo-600 border-indigo-500 text-white shadow-md shadow-indigo-900/40 scale-105'
                                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                                    }`}
                                  >
                                    {optIdx}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* --- ZOOM STREAM PLAYER & WAITING HIGH ACCURACY CONTAINER FRAMEWORK --- */}
              <div className={`${examDetails && !examSubmitted ? 'w-full lg:w-2/5 h-[30vh] lg:h-auto min-h-[260px] lg:min-h-[680px]' : 'w-full h-[75vh] min-h-[500px]'} bg-black border border-slate-800 rounded-2xl overflow-hidden relative shadow-2xl order-1 lg:order-2 transition-all duration-300`}>
                
                {liveSession?.status === 'scheduled' && showWaitingVideo ? (
                  <video
                    src="/videos/waiting-video.mp4"
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="w-full h-full object-cover"
                  />
                ) : liveSession?.status === 'live' && liveSession.zoom_join_url ? (
                  <iframe
                    src={liveSession.zoom_join_url}
                    className="w-full h-full border-0"
                    allow="camera; microphone; fullscreen; display-capture; clipboard-write"
                    title="Zoom Native Core Application Viewport Bridge"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-slate-950 p-6 text-center">
                    <div className="p-4 bg-slate-900 rounded-full border border-slate-800 mb-4 animate-pulse">
                      <svg className="w-8 h-8 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <h3 className="text-sm font-bold text-slate-300">සජීවී විකාශනය දැනට අක්‍රියයි</h3>
                    <p className="text-xs text-slate-500 max-w-xs mt-1 leading-relaxed">පන්තිය ආරම්භ වන තුරු හෝ ඊළඟ ප්‍රකාශිත කාලසටහන පැමිණෙන තෙක් රැඳී සිටින්න.</p>
                  </div>
                )}
              </div>

            </div>
          )
        )}
      </main>

      {/* --- FORM SUBMISSION SAFETY DIALOGUE CONFIRMATION MODAL OVERLAY --- */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 transform scale-100 transition-all">
            <div className="h-10 w-10 rounded-full bg-red-500/10 text-red-400 flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <h3 className="text-md font-bold text-slate-200">පිළිතුරු පත්‍රය ඉදිරිපත් කිරීමට තහවුරු කරන්න</h3>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                ඔබ සියලු ප්‍රශ්න සඳහා නිවැරදිව පිළිතුරු සපයා අවසන් බව සහතිකද? මෙම ක්‍රියාවලිය ආපසු හැරවිය නොහැක.
              </p>
            </div>
            <div className="flex space-x-3 pt-2">
              <button
                onClick={() => executeExamScoringSubmission(false)}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 rounded-xl text-xs transition shadow-lg shadow-red-900/20"
              >
                ඔව්, සබ්මිට් කරන්න
              </button>
              <button
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-2.5 rounded-xl text-xs transition border border-slate-700/50"
              >
                නැත, ආපසු යන්න
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- INSTANT VERIFICATION SCORING ENGINE MODAL ANNOUNCEMENT POPUP OVERLAY --- */}
      {scorePopup.show && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-sm w-full p-8 text-center shadow-2xl relative overflow-hidden transform scale-100 transition-all">
            <div className="absolute -top-12 -left-12 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl" />
            <div className="absolute -bottom-12 -right-12 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl" />
            
            <div className="h-16 w-16 bg-emerald-500/10 text-emerald-400 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-emerald-500/20 shadow-inner">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            
            <h2 className="text-xl font-black tracking-tight text-slate-200 mb-1">විභාගය සාර්ථකව අවසන් කරන ලදී!</h2>
            <p className="text-xs text-slate-400 max-w-xs mx-auto mb-6 leading-relaxed">ඔබ ලබාදුන් පිළිතුරු විශ්ලේෂණය කර ලබාගත් ලකුණු ප්‍රමාණය පහත පරිදි වේ.</p>
            
            <div className="inline-block bg-slate-950 border border-slate-800/80 rounded-2xl px-8 py-5 shadow-inner mb-8">
              <div className="text-4xl font-black text-indigo-400 font-mono tracking-tight">
                {scorePopup.score} <span className="text-lg text-slate-600 font-normal">/ {scorePopup.total}</span>
              </div>
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mt-1">නිවැරදි පිළිතුරු සංඛ්‍යාව</span>
            </div>

            <button
              onClick={() => setScorePopup({ ...scorePopup, show: false })}
              className="w-full bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white font-bold py-3 rounded-xl text-xs tracking-wide shadow-lg hover:shadow-indigo-900/30 transition transform active:scale-95"
            >
              ලකුණු පත්‍රය වසා පන්තියට යන්න
            </button>
          </div>
        </div>
      )}

    </div>
  );
}