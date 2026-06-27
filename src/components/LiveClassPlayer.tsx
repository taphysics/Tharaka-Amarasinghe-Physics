import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';

interface LiveClassPlayerProps {
  classId: string;       // scheduled_lives table ID
  username: string;      // Current logged in student username
  studentId: string;     // Student ID
  classType: string;     // Current class type context
}

export default function LiveClassPlayer({ classId, username, studentId, classType }: LiveClassPlayerProps) {
  // Authentication & Validation States
  const [student, setStudent] = useState<any>(null);
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  // Live Session & Config States
  const [liveSession, setLiveSession] = useState<any>(null);
  const [calendarEvents, setCalendarEvents] = useState<any[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [showWaitingVideo, setShowWaitingVideo] = useState(false);
  const [countdownText, setCountdownText] = useState('');
  
  // Exam States
  const [examDetails, setExamDetails] = useState<any>(null);
  const [answers, setAnswers] = useState<{ [key: string]: number }>({});
  const [examTimeLeft, setExamTimeLeft] = useState<number | null>(null);
  const [examSubmitted, setExamSubmitted] = useState(false);
  const [showConfirmSubmit, setShowConfirmSubmit] = useState(false);
  const [scorePopup, setScorePopup] = useState<{ show: boolean; score: number; total: number }>({ show: false, score: 0, total: 0 });

  // PDF Viewer Zoom/Pan States
  const [pdfZoom, setPdfZoom] = useState<number>(1);
  const [pdfPan, setPdfPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });

  const currentYearMonth = new Date().toISOString().substring(0, 7); // e.g. "2026-06"

  // 1. Fetch Student Data & Verify Payment Access
  useEffect(() => {
    const verifyStudentAccess = async () => {
      try {
        const { data: studentData, error: studentError } = await supabase
          .from('students')
          .select('*')
          .eq('id', studentId)
          .single();

        if (studentError || !studentData) {
          setHasAccess(false);
          setLoading(false);
          return;
        }

        setStudent(studentData);

        // පන්තිය තෝරාගෙන ඇත්දැයි බැලීම
        const isEnrolled = studentData.class_types?.includes(classType);
        
        // ගෙවීම් හෝ නොමිලේ ලබා දී ඇති මාස පරීක්ෂාව
        const isPaidMonth = studentData.active_months?.includes(currentYearMonth) && studentData.is_paid;
        const isFreeMonth = studentData.free_months?.includes(currentYearMonth);

        if (isEnrolled && (isPaidMonth || isFreeMonth)) {
          setHasAccess(true);
        } else {
          setHasAccess(false);
        }
      } catch (err) {
        console.error(err);
        setHasAccess(false);
      } finally {
        setLoading(false);
      }
    };

    verifyStudentAccess();
  }, [studentId, classType, currentYearMonth]);

  // 2. Fetch Live Session, Calendar events & Realtime Subscriptions
  useEffect(() => {
    if (!hasAccess) return;

    const fetchInitialData = async () => {
      // Fetch Live Session
      const { data: liveData } = await supabase
        .from('scheduled_lives')
        .select('*')
        .eq('id', classId)
        .single();
      if (liveData) setLiveSession(liveData);

      // Fetch Calendar Events for this Class Type
      const { data: eventsData } = await supabase
        .from('calender_events')
        .select('*')
        .eq('class_type', classType);
      if (eventsData) setCalendarEvents(eventsData);
    };

    fetchInitialData();

    // Listen for live session status changes (Live, Exam Push etc.)
    const sessionSubscription = supabase
      .channel('live-session-channel')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'scheduled_lives', filter: `id=eq.${classId}` },
        (payload) => {
          setLiveSession(payload.new);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(sessionSubscription);
    };
  }, [classId, hasAccess, classType]);

  // 3. Countdown Timer & Pre-Class Video Switcher Logic
  useEffect(() => {
    if (!liveSession || liveSession.status !== 'scheduled') {
      setShowWaitingVideo(false);
      return;
    }

    const interval = setInterval(() => {
      const classDateTime = new Date(`${liveSession.date}T${liveSession.time}`);
      const now = new Date();
      const diffMs = classDateTime.getTime() - now.getTime();

      if (diffMs <= 0) {
        // කාලය පැමිණි විට ස්වයංක්‍රීයව වීඩියෝව ඉවත් වී සූම් එකට මාරු වීමට සූදානම් වේ
        setShowWaitingVideo(false);
        setCountdownText('');
        clearInterval(interval);
        return;
      }

      const diffHours = diffMs / (1000 * 60 * 60);

      if (diffHours <= 1) {
        // අවසාන පැය තුළ කැලැන්ඩරය ඉවත් වී වෙයිටින් වීඩියෝව ප්ලේ වේ
        setShowWaitingVideo(true);
        setCountdownText('');
      } else if (diffHours <= 24) {
        // පැය 24කට පෙර සිට Countdown එක පෙන්වයි
        setShowWaitingVideo(false);
        const hours = Math.floor(diffHours);
        const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        const secs = Math.floor((diffMs % (1000 * 60)) / 1000);
        setCountdownText(`${liveSession.class_type} පන්තිය ආරම්භ වීමට තවත්: ${hours} පැය, ${mins} මිනිත්තු, ${secs} තත්පර`);
      } else {
        setShowWaitingVideo(false);
        setCountdownText('');
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [liveSession]);

  // 4. Admin Exam Push Realtime Fetching
  useEffect(() => {
    if (liveSession?.is_exam_active && liveSession?.active_exam_id && !examSubmitted) {
      const fetchExamDetails = async () => {
        const { data } = await supabase
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
      fetchExamDetails();
    } else if (!liveSession?.is_exam_active) {
      // ඇඩ්මින් එක්සෑම් එක ක්ලෝස් කලහොත්
      setExamDetails(null);
    }
  }, [liveSession?.is_exam_active, liveSession?.active_exam_id, examSubmitted]);

  // 5. Exam Duration Countdown & Auto-Submit
  useEffect(() => {
    if (examTimeLeft === null || examSubmitted || !examDetails) return;

    if (examTimeLeft <= 0) {
      handleFinalSubmit(true); // Auto Submit
      return;
    }

    const timer = setInterval(() => {
      setExamTimeLeft((prev) => (prev !== null ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [examTimeLeft, examSubmitted, examDetails]);

  // Helper Utilities
  const getEmbedUrl = (url: string) => {
    if (!url) return '';
    return url.includes('/view') ? url.replace(/\/view.*$/, '/preview') : url;
  };

  const formatExamTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleAnswerSelect = (questionNo: number, optionNo: number) => {
    setAnswers({ ...answers, [questionNo.toString()]: optionNo });
  };

  // 6. Secondary Confirmed Exam Submission & Evaluation
  const handleFinalSubmit = async (isAuto = false) => {
    if (!examDetails || examSubmitted) return;
    setShowConfirmSubmit(false);
    setExamSubmitted(true);

    let correctCount = 0;
    const correctAnswers = examDetails.correct_answer || {}; // JSONB Object

    // ප්‍රශ්න පත්‍රයේ නිවැරදි පිළිතුරු සැසඳීම
    for (let i = 1; i <= examDetails.total_questions; i++) {
      const studentAns = answers[i.toString()];
      const correctAns = correctAnswers[i.toString()];
      if (studentAns !== undefined && studentAns === Number(correctAns)) {
        correctCount++;
      }
    }

    // Save to Supabase DB
    await supabase.from('exam_results').insert({
      username: username,
      exam_id: examDetails.id,
      student_id: studentId,
      score: correctCount,
      submitted_at: new Date().toISOString(),
      meta_data: { student_answers: answers, auto_submitted: isAuto }
    });

    // Exam Layout එක ඉවත් කර, සූම් එක ෆුල්ස්ක්‍රීන් කර ලකුණු පොපප් එක පෙන්වීම
    setExamDetails(null);
    setScorePopup({ show: true, score: correctCount, total: examDetails.total_questions });
  };

  // PDF Touch Zoom/Pan Helpers
  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    dragStart.current = { x: e.clientX - pdfPan.x, y: e.clientY - pdfPan.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current || pdfZoom === 1) return;
    setPdfPan({
      x: e.clientX - dragStart.current.x,
      y: e.clientY - dragStart.current.y
    });
  };

  const handleMouseUp = () => { isDragging.current = false; };

  const handleWheelZoom = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 0.1 : -0.1;
    setPdfZoom((prev) => Math.min(Math.max(prev + zoomFactor, 1), 3));
  };

  if (loading) {
    return <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center font-sans">පද්ධතිය සක්‍රීය වෙමින් පවතී...</div>;
  }

  // මුදල් නොගෙවූ හෝ අවසර නොමැති සිසුන් සදහා UI එක
  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-6 font-sans">
        <div className="bg-gray-900 border border-red-600/40 p-8 rounded-2xl max-w-md w-full text-center shadow-2xl">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-red-500 mb-2">ප්‍රවේශය අවහිර කර ඇත</h2>
          <p className="text-gray-400 mb-6">මෙම සජීවී පන්තියට සහභාගී වීමට ඔබට අවසර නැත. කරුණාකර වත්මන් මාසය සඳහා ගෙවීම් සිදුකර සම්බන්ධ වන්න.</p>
          <button className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold py-3 rounded-xl transition duration-200">
            දැන්ම මුදල් ගෙවන්න
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col font-sans select-none antialiased">
      {/* Top Banner / Navigation */}
      <div className="bg-gray-900/90 border-b border-gray-800 px-6 py-4 flex justify-between items-center backdrop-blur shadow-sm">
        <div className="flex items-center gap-3">
          <span className="w-3 h-3 rounded-full bg-green-500 animate-pulse"></span>
          <h1 className="text-lg font-bold tracking-wide text-white">Live Classes Panel</h1>
        </div>
        <div className="text-sm text-gray-400 bg-gray-800 px-4 py-1.5 rounded-full border border-gray-700">
          සිසුවා: <span className="text-white font-semibold">{username}</span>
        </div>
      </div>

      {/* Main Framework Viewport */}
      <div className="flex-grow p-4 flex flex-col lg:flex-row gap-4 h-[calc(100vh-73px)] overflow-hidden">
        
        {/* --- LEFT SIDE: EXAM MODULE (SPLIT SCREEN PUSHED BY ADMIN) --- */}
        {liveSession?.is_exam_active && !examSubmitted && examDetails && (
          <div className="w-full lg:w-3/5 flex flex-col gap-4 h-1/2 lg:h-full order-2 lg:order-1 animate-fade-in">
            
            {/* Exam Header Status & Timer */}
            <div className="bg-gradient-to-r from-blue-900/90 to-indigo-900/90 p-4 rounded-xl flex justify-between items-center border border-blue-700/30 shadow-lg">
              <div>
                <span className="bg-red-500 text-white text-xs px-2.5 py-1 rounded-md font-bold uppercase tracking-wider animate-pulse mr-2">Live Exam</span>
                <h2 className="text-base font-bold text-white inline-block mt-1 lg:mt-0">{examDetails.title}</h2>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xl font-mono text-yellow-400 font-black bg-black/40 px-3 py-1 rounded-lg border border-yellow-500/30">
                  ⏱ {examTimeLeft !== null ? formatExamTime(examTimeLeft) : '00:00'}
                </span>
                <button 
                  onClick={() => setShowConfirmSubmit(true)}
                  className="bg-red-600 hover:bg-red-700 text-white px-5 py-2 rounded-lg font-bold text-sm transition shadow-md"
                >
                  Submit Paper
                </button>
              </div>
            </div>

            {/* Smart PDF Document Window with Custom Zoom Control and Navigation Hooks */}
            <div className="flex-grow bg-gray-900 rounded-xl overflow-hidden border border-gray-800 relative shadow-inner">
              <div className="absolute top-3 right-3 z-10 flex gap-1.5 bg-black/70 p-1.5 rounded-lg border border-gray-700">
                <button onClick={() => setPdfZoom(prev => Math.min(prev + 0.2, 3))} className="bg-gray-800 text-white w-8 h-8 rounded font-bold hover:bg-gray-700">+</button>
                <button onClick={() => { setPdfZoom(1); setPdfPan({x:0, y:0}); }} className="bg-gray-800 text-xs text-gray-300 px-2 rounded hover:bg-gray-700">Reset</button>
                <button onClick={() => setPdfZoom(prev => Math.max(prev - 0.2, 1))} className="bg-gray-800 text-white w-8 h-8 rounded font-bold hover:bg-gray-700">-</button>
              </div>
              
              <div 
                className="w-full h-full cursor-grab active:cursor-grabbing overflow-hidden"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onWheel={handleWheelZoom}
              >
                <iframe 
                  src={getEmbedUrl(examDetails.pdf_url)} 
                  style={{ transform: `scale(${pdfZoom}) translate(${pdfPan.x / pdfZoom}px, ${pdfPan.y / pdfZoom}px)`, transformOrigin: 'center center' }}
                  className="w-full h-full border-0 transition-transform duration-70 ease-out"
                  title="Exam Paper Viewer"
                ></iframe>
              </div>
            </div>

            {/* OMR Interactive Answer Matrix */}
            <div className="bg-gray-900 p-4 rounded-xl h-2/5 overflow-y-auto border border-gray-800 shadow-md">
              <h3 className="mb-3 font-bold text-sm text-gray-300 tracking-wide uppercase border-b border-gray-800 pb-2">පිළිතුරු පත්‍රය (Mark Sheet)</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {Array.from({ length: examDetails.total_questions }, (_, i) => i + 1).map((q) => (
                  <div key={q} className="flex items-center justify-between bg-gray-800/60 px-3 py-2 rounded-lg border border-gray-700/50">
                    <span className="w-6 text-sm font-black text-gray-400">{q.toString().padStart(2, '0')}.</span>
                    <div className="flex gap-1.5">
                      {[1, 2, 3, 4, 5].map((opt) => (
                        <button
                          key={opt}
                          onClick={() => handleAnswerSelect(q, opt)}
                          className={`w-7 h-7 rounded-full border text-xs font-black transition-all duration-150
                            ${answers[q.toString()] === opt 
                              ? 'bg-blue-600 border-blue-500 text-white shadow-md shadow-blue-600/30 transform scale-105' 
                              : 'border-gray-600 text-gray-400 hover:border-gray-400 hover:text-white'}`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* --- RIGHT SIDE: VIDEO / ZOOM PLAYER & CALENDAR ROUTER CONTAINER --- */}
        <div className={`${liveSession?.is_exam_active && !examSubmitted ? 'w-full lg:w-2/5' : 'w-full'} h-1/2 lg:h-full bg-gray-900 rounded-xl overflow-hidden relative border border-gray-800 shadow-2xl flex flex-col order-1 lg:order-2 transition-all duration-300`}>
          
          {/* 24 Hour Countdown Header Ticker */}
          {countdownText && (
            <div className="bg-amber-500/10 border-b border-amber-500/20 text-amber-400 px-4 py-2 text-center text-xs font-bold tracking-wide animate-pulse">
              {countdownText}
            </div>
          )}

          {/* Core Player Interface Logic Router */}
          <div className="flex-grow w-full h-full relative bg-black">
            {liveSession?.status === 'live' && liveSession?.zoom_join_url ? (
              /* ACTIVE LIVE CLASS: ZOOM INJECTION INTEGRATION */
              <iframe 
                src={liveSession.zoom_join_url} 
                className="w-full h-full border-0"
                allow="camera; microphone; fullscreen; speaker; display-capture"
                title="Zoom Live Engine"
              ></iframe>
            ) : liveSession?.status === 'scheduled' && showWaitingVideo ? (
              /* PRE-CLASS LIVE STREAM VIDEO TIMEOUT */
              <video 
                src={liveSession.pre_class_video_path || "/videos/waiting-video.mp4"} 
                autoPlay 
                loop 
                muted 
                playsInline
                className="w-full h-full object-cover"
              />
            ) : (
              /* STANDBY RETRO CALENDAR SYSTEM VIEW */
              <div className="w-full h-full p-6 bg-gray-950 flex flex-col overflow-y-auto">
                <div className="mb-4">
                  <h2 className="text-base font-bold text-white tracking-wide uppercase">මාසික පන්ති දින දර්ශනය ({currentYearMonth})</h2>
                  <p className="text-xs text-gray-500 mt-0.5">පන්ති පවත්වන දින දර්ශනයෙන් පරීක්ෂා කර පන්තිය තෝරන්න.</p>
                </div>

                {/* Grid Calendar Layout */}
                <div className="grid grid-cols-7 gap-2 bg-gray-900 p-4 rounded-xl border border-gray-800">
                  {['සැප්', 'ඉරිදා', 'සඳුදා', 'අඟහ', 'බදාදා', 'බ්‍රහස්', 'සිකු'].map((d, i) => (
                    <div key={i} className="text-center text-xs font-bold text-gray-500 py-1">{d}</div>
                  ))}
                  {Array.from({ length: 30 }, (_, i) => {
                    const dayNo = i + 1;
                    const dateStr = `${currentYearMonth}-${dayNo.toString().padStart(2, '0')}`;
                    
                    // මෙම දිනයට අදාල Calendar Event එකක් තිබේදැයි සෙවීම
                    const matchEvent = calendarEvents.find(e => e.date === dateStr);
                    const isExpired = matchEvent && new Date(dateStr) < new Date(new Date().setHours(0,0,0,0));

                    return (
                      <button
                        key={i}
                        disabled={!matchEvent}
                        onClick={() => setSelectedEvent(matchEvent)}
                        className={`aspect-square p-1 rounded-lg border flex flex-col justify-between text-left transition-all relative
                          ${matchEvent 
                            ? isExpired 
                              ? 'bg-gray-800/40 border-gray-700 text-gray-500 cursor-pointer hover:bg-gray-800' 
                              : 'bg-blue-600/10 border-blue-500/40 text-blue-400 font-bold cursor-pointer hover:bg-blue-600/20' 
                            : 'bg-gray-900/20 border-transparent text-gray-600 cursor-not-allowed'}`}
                      >
                        <span className="text-xs">{dayNo}</span>
                        {matchEvent && (
                          <span className={`text-[9px] px-1 py-0.5 rounded truncate max-w-full block font-normal text-center uppercase tracking-tight
                            ${isExpired ? 'bg-gray-700 text-gray-400' : 'bg-blue-500 text-white'}`}>
                            {matchEvent.class_type}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Selected Calendar Event Highlight Details Card */}
                {selectedEvent ? (
                  <div className="mt-4 bg-gray-900 p-4 rounded-xl border border-gray-800 animate-fade-in relative">
                    <span className={`absolute top-4 right-4 text-xs font-bold px-2 py-0.5 rounded ${new Date(selectedEvent.date) < new Date(new Date().setHours(0,0,0,0)) ? 'bg-gray-800 text-gray-500' : 'bg-green-500/10 text-green-400'}`}>
                      {new Date(selectedEvent.date) < new Date(new Date().setHours(0,0,0,0)) ? 'EXPIRED' : 'UPCOMING'}
                    </span>
                    <h4 className="text-sm font-bold text-white">{selectedEvent.title}</h4>
                    <p className="text-xs text-gray-400 mt-1">{selectedEvent.description || 'පන්ති විස්තර ලබා දී නොමැත.'}</p>
                    <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-gray-800 text-xs text-gray-400">
                      <div>පන්ති වර්ගය: <span className="text-white font-medium">{selectedEvent.class_type}</span></div>
                      <div>වේලාව: <span className="text-white font-medium">{selectedEvent.start_time || 'N/A'}</span></div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 bg-gray-900/40 border border-dashed border-gray-800 rounded-xl p-6 text-center text-xs text-gray-500">
                    කැලැන්ඩරයේ පන්ති ඇති දිනයක් තෝරා විස්තර බලන්න.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* --- POPUP 1: SECONDARY SUBMIT CONFIRMATION INTERCEPTOR --- */}
      {showConfirmSubmit && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-fade-in">
          <div className="bg-gray-900 border border-gray-800 p-6 rounded-2xl max-w-sm w-full shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-2">පිළිතුරු පත්‍රය සබ්මිට් කරන්නද?</h3>
            <p className="text-sm text-gray-400 mb-6">ඔබ සියලුම ප්‍රශ්න සඳහා නිවැරදිව පිළිතුරු සපයා අවසන් නම් පමණක් "සන්නිවේදනය කරන්න" යන්න තෝරන්න.</p>
            <div className="flex gap-3">
              <button 
                onClick={() => setShowConfirmSubmit(false)}
                className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold py-2.5 rounded-xl text-sm transition"
              >
                පසුපසට
              </button>
              <button 
                onClick={() => handleFinalSubmit(false)}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-xl text-sm transition shadow-lg shadow-blue-600/20"
              >
                ඔව්, සබ්මිට් කරන්න
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- POPUP 2: INSTANT EVALUATED SCORE RESULT BOARD --- */}
      {scorePopup.show && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-fade-in">
          <div className="bg-white text-gray-900 p-6 rounded-2xl max-w-xs w-full text-center shadow-2xl border border-gray-200 transform scale-100 transition-transform">
            <div className="w-14 h-14 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-2xl mx-auto mb-3">✓</div>
            <h3 className="text-xl font-black text-gray-900 mb-1">විභාගය අවසන්!</h3>
            <p className="text-xs text-gray-500 mb-4">ඔබගේ පිළිතුරු සාර්ථකව පද්ධතියට ලැබුණි.</p>
            
            <div className="bg-gray-550/40 py-3 px-4 rounded-xl mb-5 inline-block border border-gray-100">
              <div className="text-xs text-gray-400 uppercase tracking-wider font-bold">ලබාගත් ලකුණු</div>
              <div className="text-4xl font-black text-blue-600 mt-1">
                {scorePopup.score} <span className="text-lg text-gray-400 font-normal">/ {scorePopup.total}</span>
              </div>
            </div>

            <button 
              onClick={() => setScorePopup({ ...scorePopup, show: false })}
              className="w-full bg-gray-900 hover:bg-black text-white font-bold py-3 rounded-xl text-sm transition shadow-md"
            >
              ක්ලෝස් කර නැවත පන්තියට යන්න
            </button>
          </div>
        </div>
      )}
    </div>
  );
}