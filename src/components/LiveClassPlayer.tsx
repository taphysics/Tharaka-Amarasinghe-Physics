import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { format, differenceInSeconds, parse, addHours, isAfter, isBefore } from 'date-fns';
import { Clock, Calendar as CalendarIcon, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

interface Student {
  id: string;
  username: string;
  class_types: string[];
  free_months: string[];
}

interface ScheduledLive {
  id: string;
  title: string;
  date: string;
  time: string;
  class_type: string;
  target_class_type?: string;
  target_classes?: string[];
  target_month: string;
  status: string; 
  zoom_join_url: string;
  zoom_meeting_id: string;
  is_exam_active: boolean;
  active_exam_id: string;
}

interface ExamDetails {
  id: string;
  title: string;
  pdf_url: string;
  duration_minutes: number;
  total_questions: number;
  correct_answer: Record<string, number>;
}

// Google Drive link එක iframe එකක් තුළ පෙන්විය හැකි (preview) ලින්ක් එකක් බවට හැරවීම
const getEmbeddablePdfUrl = (url: string) => {
  if (!url) return '';
  return url.replace(/\/view.*$/, '/preview');
};

const getEmbeddableZoomUrl = (joinUrl: string) => {
  if (!joinUrl) return '';
  try {
    const url = new URL(joinUrl);
    if (url.pathname.includes('/j/')) {
      url.pathname = url.pathname.replace('/j/', '/wc/') + '/join';
    }
    return url.toString();
  } catch (error) {
    return joinUrl;
  }
};

const LiveClassPlayer = ({ currentUser }: { currentUser: Student }) => {
  const [currentLive, setCurrentLive] = useState<ScheduledLive | null>(null);
  const [upcomingClasses, setUpcomingClasses] = useState<ScheduledLive[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  
  // Countdown States
  const [countdown, setCountdown] = useState<{ h: number; m: number; s: number } | null>(null);
  const [isWithinOneHour, setIsWithinOneHour] = useState<boolean>(false);
  const [isWithinTenMins, setIsWithinTenMins] = useState<boolean>(false);

  // Exam States
  const [examDetails, setExamDetails] = useState<ExamDetails | null>(null);
  const [isExamPanelOpen, setIsExamPanelOpen] = useState<boolean>(false);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({});
  const [examTimeLeft, setExamTimeLeft] = useState<number>(0);
  const [examResult, setExamResult] = useState<{ score: number; total: number } | null>(null);
  const [hasSubmittedExam, setHasSubmittedExam] = useState<boolean>(false);

  useEffect(() => {
    fetchClassData();
    
    // Realtime Listener
    const subscription = supabase
      .channel('live-class-updates')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'scheduled_lives' }, async (payload) => {
          const updatedClass = payload.new as ScheduledLive;
          
          // පවතින පන්තියේ වෙනසක් වූ විට
          if (currentLive && updatedClass.id === currentLive.id) {
            setCurrentLive(updatedClass);
            
            if (updatedClass.status === 'ended') {
              setIsExamPanelOpen(false);
              fetchClassData(); // නැවත මුල සිට load කිරීම
            }

            // Exam Push කළ විට
            if (updatedClass.is_exam_active && updatedClass.active_exam_id && !hasSubmittedExam) {
              await fetchExamDetails(updatedClass.active_exam_id);
            } else if (!updatedClass.is_exam_active) {
              setIsExamPanelOpen(false);
            }
          } else {
             // වෙනත් පන්තියක් live වුවහොත් (Refresh data)
             fetchClassData();
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(subscription); };
  }, [currentUser, currentLive?.id, hasSubmittedExam]);

  const fetchClassData = async () => {
    setIsLoading(true);
    try {
      const now = new Date();
      const in24Hours = addHours(now, 24);
      
      const userClasses = currentUser.class_types || [];

      // 1. පවතින සජීවී හෝ ඉදිරි පැය 24 ඇතුළත ඇති පන්ති ලබා ගැනීම
      const { data: livesData } = await supabase
        .from('scheduled_lives')
        .select('*')
        .in('status', ['scheduled', 'live'])
        .order('date', { ascending: true })
        .order('time', { ascending: true });

      if (livesData) {
        // සිසුවාගේ පන්ති වලට අදාළ දත්ත පමණක් පෙරීම
        const relevantLives = livesData.filter(live => {
           const matchesClass = userClasses.includes(live.target_class_type) || 
                               (live.target_classes && live.target_classes.some((c: string) => userClasses.includes(c)));
           return matchesClass;
        });

        // දැනට Live පවතින එකක් ඇත්නම් එය currentLive ලෙස ගනී
        const activeLive = relevantLives.find(l => l.status === 'live');
        
        if (activeLive) {
          setCurrentLive(activeLive);
          if (activeLive.is_exam_active && !hasSubmittedExam) {
             fetchExamDetails(activeLive.active_exam_id);
          }
        } else {
          // Live නැත්නම්, ඉදිරි පැය 24 ඇතුළත ඇති පන්ති සොයන්න
          const upcoming = relevantLives.filter(live => {
            const liveDateTime = parse(`${live.date} ${live.time}`, 'yyyy-MM-dd HH:mm', new Date());
            return isAfter(liveDateTime, now) && isBefore(liveDateTime, in24Hours);
          });

          if (upcoming.length > 0) {
            setCurrentLive(upcoming[0]); // ලඟම ඇති පන්තිය countdown එකට
            setUpcomingClasses(upcoming.slice(1)); // ඉතිරි ඒවා ලැයිස්තුවට
          } else {
            setCurrentLive(null);
            fetchCalendarEvents(userClasses); // පැය 24ක් ඇතුලත පන්ති නැත්නම් කැලැන්ඩරය
          }
        }
      }
    } catch (error) {
      console.error('Error fetching classes:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchCalendarEvents = async (userClasses: string[]) => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const { data } = await supabase
      .from('calendar_events')
      .select('*')
      .gt('date', today)
      .order('date', { ascending: true })
      .limit(5);

    if (data) {
       const relevantEvents = data.filter(ev => userClasses.includes(ev.class_type) || userClasses.includes(ev.target_class_type));
       setCalendarEvents(relevantEvents);
    }
  };

  const fetchExamDetails = async (examId: string) => {
    // සිසුවා කලින් උත්තර දීලද බලන්න
    const { data: prevResult } = await supabase
      .from('exam_results')
      .select('*')
      .eq('exam_id', examId)
      .eq('student_id', currentUser.id)
      .single();

    if (prevResult) {
      setHasSubmittedExam(true);
      return;
    }

    const { data: exam } = await supabase.from('exams').select('*').eq('id', examId).single();
    if (exam) {
      setExamDetails(exam);
      setExamTimeLeft(exam.duration_minutes * 60); // තත්පර වලින්
      setSelectedAnswers({});
      setIsExamPanelOpen(true);
    }
  };

  // Class Countdown Timer Logic
  useEffect(() => {
    if (!currentLive || currentLive.status !== 'scheduled') return;

    const interval = setInterval(() => {
      const classDateTime = parse(`${currentLive.date} ${currentLive.time}`, 'yyyy-MM-dd HH:mm', new Date());
      const now = new Date();
      const diffSeconds = differenceInSeconds(classDateTime, now);

      if (diffSeconds > 0) {
        if (diffSeconds <= 3600) { // පැයක් ඇතුළත
          setIsWithinOneHour(true);
          setIsWithinTenMins(diffSeconds <= 600); // විනාඩි 10ක් ඇතුළත
          setCountdown({
            h: Math.floor(diffSeconds / 3600),
            m: Math.floor((diffSeconds % 3600) / 60),
            s: diffSeconds % 60,
          });
        } else {
          setIsWithinOneHour(false);
          setIsWithinTenMins(false);
        }
      } else {
        setCountdown({ h: 0, m: 0, s: 0 });
        setIsWithinTenMins(true); // පන්තිය පටන් ගන්නා තුරු video එක පෙන්වීමට
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [currentLive]);

  // Exam Countdown Timer Logic
  useEffect(() => {
    if (!isExamPanelOpen || examTimeLeft <= 0) return;

    const timer = setInterval(() => {
      setExamTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          handleExamSubmit(); // කාලය අවසන් වූ පසු ස්වයංක්‍රීයව submit වීම
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isExamPanelOpen, examTimeLeft]);

  const handleAnswerSelect = (qNum: number, ans: number) => {
    setSelectedAnswers(prev => ({ ...prev, [qNum]: ans }));
  };

  const handleExamSubmit = async () => {
    if (!examDetails || !currentLive) return;
    
    // ලකුණු ගණනය කිරීම (නොදුන් පිළිතුරු වැරදි ලෙස සලකයි)
    let score = 0;
    const totalQuestions = examDetails.total_questions;
    const correctAnswers = examDetails.correct_answer;

    for (let i = 1; i <= totalQuestions; i++) {
      if (selectedAnswers[i] && selectedAnswers[i] === correctAnswers[i]) {
        score += 1;
      }
    }

    try {
      // Database එකට සබ්මිට් කිරීම
      await supabase.from('exam_results').insert([{
        username: currentUser.username,
        student_id: currentUser.id,
        exam_id: examDetails.id,
        score: score,
        meta_data: { total: totalQuestions, answers: selectedAnswers }
      }]);

      setExamResult({ score, total: totalQuestions });
      setHasSubmittedExam(true);
    } catch (error) {
      console.error("Exam submit error", error);
    }
  };

  const closeExamResult = () => {
    setExamResult(null);
    setIsExamPanelOpen(false); // ප්ලේයර් එක Full Screen වීමට මෙය false කළ යුතුය
  };


  if (isLoading) {
    return <div className="flex justify-center items-center h-screen bg-black text-white font-semibold">දත්ත පූරණය වෙමින් පවතී...</div>;
  }

  // 1. පන්ති කිසිවක් නොමැති අවස්ථාව (කාලසටහන පෙන්වීම)
  if (!currentLive && calendarEvents.length > 0) {
    return (
      <div className="min-h-screen bg-black text-white p-6 flex flex-col items-center">
        <div className="w-full max-w-3xl bg-gray-900 border border-gray-800 rounded-2xl p-8 shadow-xl mt-10">
          <h2 className="text-2xl font-bold text-gray-300 mb-2 text-center flex items-center justify-center gap-2">
            <CalendarIcon /> ඉදිරි පන්ති කාලසටහන
          </h2>
          <p className="text-gray-500 text-sm text-center mb-8">ඉදිරි පැය 24 තුළ ඔබට සජීවී පන්ති නොමැත.</p>
          
          <div className="space-y-4">
            {calendarEvents.map((ev, idx) => (
              <div key={idx} className="flex justify-between items-center bg-gray-950 p-4 rounded-xl border border-gray-800">
                <div>
                  <span className="text-xs font-bold text-blue-400 bg-blue-500/10 px-2 py-1 rounded">{ev.class_type || ev.target_class_type}</span>
                  <h3 className="text-lg font-bold text-white mt-2">{ev.title}</h3>
                </div>
                <div className="text-right">
                  <p className="text-gray-300 font-medium">{ev.date}</p>
                  <p className="text-gray-500 text-sm">{ev.start_time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  } else if (!currentLive) {
    return (
      <div className="flex justify-center items-center h-screen bg-black text-gray-500">
        ඉදිරි දින සඳහා පන්ති කාලසටහන ළඟදීම යාවත්කාලීන කරනු ඇත.
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-black text-white flex flex-col p-2 md:p-6 font-sans">
      
      {/* 2. SCHEDULED තත්ත්වය (පන්තිය ආරම්භයට පෙර) */}
      {currentLive.status === 'scheduled' && (
        <div className="flex flex-col flex-1 max-w-5xl mx-auto w-full gap-6">
          
          {/* Main Countdown Area */}
          <div className="relative flex-1 rounded-2xl overflow-hidden bg-gray-900 border border-gray-800 shadow-2xl flex flex-col items-center justify-center min-h-[60vh]">
            
            {/* අවසන් විනාඩි 10 දී Video එක ප්ලේ වීම */}
            {isWithinTenMins && (
              <video autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-cover opacity-50 pointer-events-none z-0">
                <source src="/videos/waiting-video.mp4" type="video/mp4" />
              </video>
            )}

            <div className="relative z-10 flex flex-col items-center p-8 bg-black/60 backdrop-blur-md rounded-2xl border border-white/10 mx-4 text-center">
              <span className="text-xs font-bold uppercase tracking-widest bg-blue-500/20 text-blue-400 px-3 py-1 rounded-full mb-3">
                {currentLive.class_type || currentLive.target_class_type}
              </span>
              <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">{currentLive.title}</h1>
              
              {isWithinOneHour ? (
                <>
                  <h2 className="text-gray-300 mt-4 mb-2 font-medium">පන්තිය ආරම්භ වීමට තව...</h2>
                  <div className="text-6xl md:text-7xl font-mono font-black text-white tracking-wider drop-shadow-[0_0_15px_rgba(255,255,255,0.4)]">
                    {countdown ? `${String(countdown.m).padStart(2, '0')}:${String(countdown.s).padStart(2, '0')}` : "00:00"}
                  </div>
                  {(countdown?.m === 0 && countdown?.s === 0) || !countdown ? (
                     <p className="mt-6 text-green-400 animate-pulse text-sm font-medium bg-green-500/10 px-4 py-2 rounded-lg border border-green-500/20">
                       ගුරුතුමා විසින් පන්තිය සක්‍රීය කරන තුරු මඳක් රැඳී සිටින්න...
                     </p>
                  ) : null}
                </>
              ) : (
                <div className="mt-6 p-4 bg-gray-950 rounded-xl border border-gray-800">
                  <p className="text-gray-400">පන්තිය ආරම්භ වන වේලාව</p>
                  <p className="text-xl font-bold text-yellow-400 mt-1">{currentLive.date} @ {currentLive.time}</p>
                </div>
              )}
            </div>
          </div>

          {/* ඉදිරි පැය 24 ඇතුලත ඇති අනෙකුත් පන්ති */}
          {upcomingClasses.length > 0 && (
            <div className="bg-gray-900 p-6 rounded-2xl border border-gray-800">
              <h3 className="text-lg font-bold text-gray-300 mb-4 flex items-center gap-2"><Clock size={20}/> අද දින ඉදිරි පන්ති</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {upcomingClasses.map(uc => (
                  <div key={uc.id} className="bg-gray-950 p-4 rounded-xl border border-gray-800">
                    <span className="text-[10px] font-bold text-gray-400 bg-gray-800 px-2 py-0.5 rounded">{uc.class_type || uc.target_class_type}</span>
                    <h4 className="text-white font-medium mt-2">{uc.title}</h4>
                    <p className="text-blue-400 text-sm mt-1">{uc.time}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. LIVE තත්ත්වය (ඇඩ්මින් Zoom ස්ටාට් කල පසු) */}
      {currentLive.status === 'live' && (
        <div className={`flex-1 flex ${isExamPanelOpen ? 'flex-col lg:flex-row gap-4' : 'flex-col'} w-full transition-all duration-500`}>
          
          {/* Zoom Player Section (Full screen or Left Side if Exam is open) */}
          <div className={`flex flex-col bg-gray-900 rounded-2xl overflow-hidden border border-green-500/30 shadow-2xl transition-all ${isExamPanelOpen ? 'w-full lg:w-[35%] h-[50vh] lg:h-[calc(100vh-3rem)]' : 'w-full flex-1'}`}>
            <div className="bg-green-950/40 text-green-400 px-3 py-2 flex justify-between items-center text-xs md:text-sm border-b border-green-500/20 font-medium">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
                </span>
                LIVE: {currentLive.title}
              </div>
            </div>
            <div className="w-full flex-1 bg-black relative">
              <iframe 
                src={getEmbeddableZoomUrl(currentLive.zoom_join_url)} 
                allow="camera; microphone; fullscreen; display-capture; autoplay"
                className="absolute inset-0 w-full h-full border-0"
                title="Live Zoom Class"
              />
            </div>

            {/* OMR Answer Sheet below Zoom (Only if Exam is Active) */}
            {isExamPanelOpen && examDetails && (
              <div className="h-1/2 flex flex-col bg-gray-950 border-t border-gray-800">
                <div className="p-3 bg-amber-500/10 border-b border-amber-500/20 flex justify-between items-center">
                   <div className="font-bold text-amber-500 text-sm flex items-center gap-2">
                      <Clock size={16}/> 
                      {Math.floor(examTimeLeft / 60)}:{String(examTimeLeft % 60).padStart(2, '0')}
                   </div>
                   <button onClick={handleExamSubmit} className="bg-amber-600 hover:bg-amber-500 text-white text-xs px-4 py-1.5 rounded font-bold transition">
                     Submit Early
                   </button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                  <h3 className="text-gray-400 text-xs uppercase mb-3 font-bold tracking-wider">Answer Sheet (පිළිතුරු පත්‍රය)</h3>
                  <div className="grid grid-cols-1 gap-2">
                    {Array.from({ length: examDetails.total_questions }, (_, i) => i + 1).map(qNum => (
                      <div key={qNum} className="flex items-center gap-3 bg-gray-900 p-2 rounded-lg border border-gray-800">
                        <span className="w-6 text-right text-gray-500 font-mono text-sm">{qNum}.</span>
                        <div className="flex gap-2 flex-1 justify-between px-2">
                          {[1, 2, 3, 4, 5].map(opt => (
                            <button
                              key={opt}
                              onClick={() => handleAnswerSelect(qNum, opt)}
                              className={`w-8 h-8 rounded-full text-xs font-bold transition-all ${
                                selectedAnswers[qNum] === opt 
                                  ? 'bg-blue-600 text-white shadow-[0_0_10px_rgba(37,99,235,0.5)] border-2 border-blue-400' 
                                  : 'bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700'
                              }`}
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
          </div>

          {/* Exam PDF Viewer Area (Right Side) */}
          {isExamPanelOpen && examDetails && (
             <div className="w-full lg:w-[65%] h-[60vh] lg:h-[calc(100vh-3rem)] bg-gray-900 rounded-2xl border border-gray-800 flex flex-col overflow-hidden shadow-2xl">
               <div className="bg-gray-950 p-3 flex justify-between items-center border-b border-gray-800">
                 <h3 className="text-white font-bold text-sm md:text-base truncate pr-4">{examDetails.title}</h3>
                 <span className="text-xs bg-gray-800 text-gray-300 px-3 py-1 rounded-full whitespace-nowrap">PDF Viewer</span>
               </div>
               <div className="flex-1 w-full bg-white relative">
                  <iframe 
                    src={getEmbeddablePdfUrl(examDetails.pdf_url)}
                    className="absolute inset-0 w-full h-full border-0"
                    title="Exam Paper"
                    allow="autoplay"
                  />
               </div>
             </div>
          )}
        </div>
      )}

      {/* 4. RESULT MODAL (සබ්මිට් කළ පසු ලකුණු පෙන්වීම) */}
      {examResult && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl transform scale-100 animate-in zoom-in-95 duration-300">
            <CheckCircle size={60} className="text-green-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-white mb-2">Exam Submitted!</h2>
            <p className="text-gray-400 mb-6">ඔබගේ පිළිතුරු සාර්ථකව භාර දෙන ලදී.</p>
            
            <div className="bg-gray-950 rounded-xl p-6 border border-gray-800 mb-6">
              <p className="text-sm text-gray-500 uppercase tracking-wider mb-2">ඔබගේ ලකුණු</p>
              <div className="text-5xl font-black text-amber-500 font-mono">
                {examResult.score} <span className="text-2xl text-gray-600">/ {examResult.total}</span>
              </div>
            </div>

            <button 
              onClick={closeExamResult}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition"
            >
              Close & Return to Class
            </button>
          </div>
        </div>
      )}

    </div>
  );
};

export default LiveClassPlayer;