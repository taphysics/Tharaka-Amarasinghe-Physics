import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { format, differenceInSeconds, parse, addHours, isBefore, isAfter } from 'date-fns';
import { Calendar, Clock, Video, FileText, Send, CheckCircle2, AlertCircle } from 'lucide-react';

interface Student {
  id: string; // Database uuid
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
  target_classes?: string[];
  target_class_type?: string;
  target_month: string;
  status: string; // 'scheduled', 'live', 'ended'
  zoom_join_url: string;
  zoom_meeting_id: string;
  is_exam_active: boolean;
  active_exam_id?: string;
  pre_class_video_path?: string;
}

interface ExamData {
  id: string;
  title: string;
  pdf_url: string;
  duration_minutes: number;
  total_questions: number;
  correct_answer: Record<string, number>;
}

// Zoom URL Converter (Web Client)
const getEmbeddableZoomUrl = (joinUrl: string) => {
  if (!joinUrl) return '';
  try {
    const url = new URL(joinUrl);
    if (url.pathname.includes('/j/')) {
      url.pathname = url.pathname.replace('/j/', '/wc/') + '/join';
    }
    return url.toString();
  } catch (error) {
    console.error('Invalid Zoom URL', error);
    return joinUrl;
  }
};

// Google Drive PDF Preview Link Converter
const getDrivePreviewUrl = (url: string) => {
  if (!url) return '';
  if (url.includes('/view')) return url.replace('/view', '/preview');
  if (url.includes('/edit')) return url.replace('/edit', '/preview');
  return url;
};

const LiveClassPlayer = ({ currentUser }: { currentUser: Student }) => {
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [upcomingClasses, setUpcomingClasses] = useState<ScheduledLive[]>([]);
  const [futureClasses, setFutureClasses] = useState<ScheduledLive[]>([]);
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  
  // Exam States
  const [activeExam, setActiveExam] = useState<ExamData | null>(null);
  const [examAnswers, setExamAnswers] = useState<Record<number, number>>({});
  const [examTimeLeft, setExamTimeLeft] = useState<number>(0);
  const [isExamSubmitted, setIsExamSubmitted] = useState<boolean>(false);
  const [examResult, setExamResult] = useState<{ score: number; total: number } | null>(null);
  const [showResultModal, setShowResultModal] = useState<boolean>(false);

  // Time Tracker (Tick every second)
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    fetchClassesData();

    // Supabase Realtime Listener (ඇඩ්මින් Status හෝ Exam Push කරනවිට අලුත් වීම)
    const subscription = supabase
      .channel('live-class-updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'scheduled_lives' },
        () => fetchClassesData()
      )
      .subscribe();

    return () => { supabase.removeChannel(subscription); };
  }, [currentUser]);

  const fetchClassesData = async () => {
    try {
      const { data: allLives, error } = await supabase
        .from('scheduled_lives')
        .select('*')
        .in('status', ['scheduled', 'live'])
        .order('date', { ascending: true })
        .order('time', { ascending: true });

      if (error) throw error;

      // Filter classes applicable to the current student
      const studentClasses = allLives.filter((c: ScheduledLive) => 
        (c.target_classes && c.target_classes.some(tc => currentUser.class_types.includes(tc))) || 
        currentUser.class_types.includes(c.class_type || '') ||
        currentUser.class_types.includes(c.target_class_type || '')
      );

      const now = new Date();
      const next24h = addHours(now, 24);
      
      const upcoming: ScheduledLive[] = [];
      const future: ScheduledLive[] = [];

      studentClasses.forEach(c => {
        const classDateStr = `${c.date} ${c.time}`;
        const classDateTime = parse(classDateStr, 'yyyy-MM-dd HH:mm', new Date());
        
        if (c.status === 'live') {
          upcoming.unshift(c); // Live ones always go first
        } else if (isBefore(classDateTime, next24h)) {
          upcoming.push(c);
        } else {
          future.push(c);
        }
      });

      setUpcomingClasses(upcoming);
      setFutureClasses(future);
    } catch (err) {
      console.error("Error fetching classes:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Exam Logic Effect
  const currentClosestClass = upcomingClasses[0]; // The active or soonest class

  useEffect(() => {
    const fetchExamDetails = async (examId: string) => {
      // Check if student already submitted this exam
      const { data: previousSubmission } = await supabase
        .from('exam_results')
        .select('*')
        .eq('exam_id', examId)
        .eq('student_id', currentUser.id)
        .maybeSingle();

      if (previousSubmission) {
        setIsExamSubmitted(true);
        return;
      }

      const { data: examInfo } = await supabase.from('exams').select('*').eq('id', examId).single();
      if (examInfo) {
        setActiveExam(examInfo);
        setExamTimeLeft(examInfo.duration_minutes * 60);
        setIsExamSubmitted(false);
        setExamAnswers({});
      }
    };

    if (currentClosestClass?.is_exam_active && currentClosestClass?.active_exam_id) {
      if (!isExamSubmitted) {
         fetchExamDetails(currentClosestClass.active_exam_id);
      }
    } else {
      setActiveExam(null);
    }
  }, [currentClosestClass?.is_exam_active, currentClosestClass?.active_exam_id]);

  // Exam Countdown Timer
  useEffect(() => {
    let examTimer: NodeJS.Timeout;
    if (activeExam && examTimeLeft > 0 && !isExamSubmitted && !showResultModal) {
      examTimer = setInterval(() => {
        setExamTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(examTimer);
            handleSubmitExam(true); // Auto-submit when time is up
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(examTimer);
  }, [activeExam, examTimeLeft, isExamSubmitted, showResultModal]);

  const handleAnswerSelect = (questionNum: number, answerIndex: number) => {
    setExamAnswers(prev => ({ ...prev, [questionNum]: answerIndex }));
  };

  const handleSubmitExam = async (isAutoSubmit = false) => {
    if (!activeExam) return;
    
    if (!isAutoSubmit && !confirm("පිළිතුරු පත්‍රය ලබා දීමට ඔබට විශ්වාසද? (Are you sure you want to submit?)")) {
      return;
    }

    let score = 0;
    const correctAnswers = activeExam.correct_answer;
    
    for (let i = 1; i <= activeExam.total_questions; i++) {
      if (examAnswers[i] && correctAnswers[i] && examAnswers[i] === correctAnswers[i]) {
        score++;
      }
    }

    try {
      await supabase.from('exam_results').insert([{
        username: currentUser.username,
        student_id: currentUser.id,
        exam_id: activeExam.id,
        score: score,
        meta_data: examAnswers,
        submitted_at: new Date().toISOString()
      }]);

      setExamResult({ score, total: activeExam.total_questions });
      setShowResultModal(true);
      setIsExamSubmitted(true);
      setActiveExam(null); // Clear exam to revert layout
    } catch (error) {
      console.error("Exam submission failed:", error);
      alert("පද්ධතියේ දෝෂයක්. නැවත උත්සාහ කරන්න.");
    }
  };

  const formatTimeLeft = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h > 0 ? `${h}h ` : ''}${m.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`;
  };

  if (isLoading) {
    return <div className="flex justify-center items-center h-screen bg-black text-white">දත්ත පූරණය වෙමින් පවතී...</div>;
  }

  // SCENARIO 1: No upcoming classes within 24h -> Show Future Classes (Calendar)
  if (upcomingClasses.length === 0) {
    return (
      <div className="min-h-screen bg-black text-white p-6 md:p-10 font-sans">
        <h2 className="text-2xl font-bold text-gray-300 mb-8 flex items-center gap-3">
          <Calendar className="text-blue-500" /> ඉදිරි පන්ති කාලසටහන (Upcoming Schedule)
        </h2>
        
        {futureClasses.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {futureClasses.map(cls => (
              <div key={cls.id} className="bg-gray-900 border border-gray-800 rounded-2xl p-6 hover:border-blue-500/30 transition shadow-lg">
                <span className="bg-blue-500/10 text-blue-400 text-xs px-3 py-1 rounded-full font-bold uppercase tracking-wider">{cls.target_class_type || cls.class_type}</span>
                <h3 className="text-xl font-bold mt-4 mb-2">{cls.title}</h3>
                <div className="flex items-center text-gray-400 text-sm gap-2 mt-2">
                  <Calendar size={16} /> {cls.date}
                </div>
                <div className="flex items-center text-gray-400 text-sm gap-2 mt-2">
                  <Clock size={16} /> {cls.time}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-20 bg-gray-900 border border-gray-800 rounded-2xl">
            <h3 className="text-xl text-gray-500">ඉදිරි දින කිහිපය සඳහා පන්ති කාලසටහන් කර නොමැත.</h3>
          </div>
        )}
      </div>
    );
  }

  // Main Logic for Classes within 24 hours
  const activeClass = upcomingClasses[0];
  const classDateTime = parse(`${activeClass.date} ${activeClass.time}`, 'yyyy-MM-dd HH:mm', new Date());
  const diffSeconds = differenceInSeconds(classDateTime, currentTime);
  const isWithinOneHour = diffSeconds > 0 && diffSeconds <= 3600;
  const isWithinTenMins = diffSeconds > 0 && diffSeconds <= 600;
  const isLive = activeClass.status === 'live';

  // SCENARIO 2: Pre-Class Dashboard (> 1 hour away)
  if (!isLive && !isWithinOneHour) {
    return (
      <div className="min-h-screen bg-black text-white p-6 md:p-10 font-sans">
        <h2 className="text-2xl font-bold text-gray-300 mb-8 flex items-center gap-3">
          <Clock className="text-amber-500" /> පැය 24ක් ඇතුළත පැවැත්වෙන පන්ති
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {upcomingClasses.map((cls, idx) => {
            const clsTime = parse(`${cls.date} ${cls.time}`, 'yyyy-MM-dd HH:mm', new Date());
            const secDiff = differenceInSeconds(clsTime, currentTime);
            const hrs = Math.floor(secDiff / 3600);
            const mins = Math.floor((secDiff % 3600) / 60);

            return (
              <div key={cls.id} className="bg-gray-900 border border-gray-800 rounded-2xl p-6 relative overflow-hidden group">
                {idx === 0 && <div className="absolute top-0 left-0 w-full h-1 bg-amber-500"></div>}
                <span className="bg-gray-800 text-gray-300 text-xs px-3 py-1 rounded-full font-bold uppercase">{cls.target_class_type || cls.class_type}</span>
                <h3 className="text-xl font-bold mt-4 mb-2">{cls.title}</h3>
                <p className="text-gray-400 text-sm mb-4">දිනය: {cls.date} | වේලාව: {cls.time}</p>
                <div className="bg-black/50 p-3 rounded-xl border border-gray-800 text-center">
                  <p className="text-xs text-gray-500 mb-1">පන්තිය ආරම්භ වීමට තව</p>
                  <p className="text-xl font-mono text-amber-400 font-bold">{hrs} පැය {mins} විනාඩි</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // SCENARIO 3: Immersive Countdown (<= 1 hour away)
  if (!isLive && isWithinOneHour) {
    const countdownM = Math.floor(diffSeconds / 60);
    const countdownS = diffSeconds % 60;

    return (
      <div className="w-full min-h-screen bg-black text-white flex flex-col p-4 md:p-8">
        <div className="flex flex-col items-center justify-center flex-1 relative rounded-2xl overflow-hidden bg-gray-950 min-h-[75vh] border border-gray-800 shadow-2xl">
          
          {/* Background Video triggers at 10 minutes (600s) */}
          {isWithinTenMins && (
            <video 
              autoPlay loop muted playsInline
              className="absolute inset-0 w-full h-full object-cover opacity-40 z-0 pointer-events-none"
              src={activeClass.pre_class_video_path || "/videos/waiting-video.mp4"}
            />
          )}

          {/* Countdown UI */}
          <div className="relative z-10 flex flex-col items-center p-8 bg-black/60 rounded-3xl backdrop-blur-md border border-white/10 max-w-lg w-full mx-4 shadow-2xl">
            <span className="text-xs font-bold uppercase tracking-widest bg-blue-500/20 text-blue-400 px-4 py-1.5 rounded-full mb-4 border border-blue-500/30">
              {activeClass.target_class_type || activeClass.class_type} - {activeClass.title}
            </span>
            <h2 className="text-lg md:text-xl text-gray-300 text-center mb-6 font-medium">
              පන්තිය ආරම්භ වීමට තව...
            </h2>
            
            <div className="text-7xl md:text-8xl font-mono font-black text-white tracking-widest drop-shadow-[0_0_20px_rgba(255,255,255,0.4)]">
              {String(countdownM).padStart(2, '0')}:{String(countdownS).padStart(2, '0')}
            </div>
            
            {diffSeconds <= 0 && (
              <p className="mt-8 text-green-400 animate-pulse text-sm font-bold bg-green-500/10 px-5 py-3 rounded-xl border border-green-500/20 flex items-center gap-2">
                <Clock size={18} /> ගුරුතුමා විසින් පන්තිය සක්‍රීය කරන තුරු මඳක් රැඳී සිටින්න...
              </p>
            )}
            {isWithinTenMins && diffSeconds > 0 && (
              <p className="mt-6 text-amber-400/80 text-xs font-medium text-center">
                කරුණාකර පන්තිය සඳහා අවශ්‍ය පොත්පත් සහ ද්‍රව්‍ය සූදානම් කරගන්න.
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // SCENARIO 4: LIVE CLASS (Zoom and/or Exam View)
  if (isLive) {
    const isExamPushed = !!activeExam;

    return (
      <div className="w-full h-screen max-h-screen bg-black text-white flex flex-col overflow-hidden">
        
        {/* Header Bar */}
        <div className="bg-gray-950 px-4 py-2 flex justify-between items-center border-b border-gray-800 shrink-0">
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-600"></span>
            </span>
            <span className="font-bold text-sm text-gray-200">
              {activeClass.title} {isExamPushed && <span className="text-amber-400 ml-2">| Live Exam Active</span>}
            </span>
          </div>
        </div>

        {/* Content Area */}
        <div className={`flex-1 w-full ${isExamPushed ? 'flex flex-col lg:flex-row' : 'flex'}`}>
          
          {/* Zoom Player Area */}
          <div className={`${isExamPushed ? 'h-[30vh] lg:h-full lg:w-[35%] flex flex-col border-b lg:border-b-0 lg:border-r border-gray-800 bg-gray-900' : 'w-full h-full'}`}>
            <iframe 
              src={getEmbeddableZoomUrl(activeClass.zoom_join_url)} 
              allow="camera; microphone; fullscreen; display-capture; autoplay"
              sandbox="allow-forms allow-scripts allow-same-origin"
              className="w-full h-full border-0 bg-white"
              title="Zoom Classroom"
            />

            {/* Answer Sheet Area (Only visible when Exam is Active) */}
            {isExamPushed && (
              <div className="flex-1 flex flex-col bg-gray-950 overflow-hidden">
                {/* Timer Header */}
                <div className="bg-gray-900 p-3 flex justify-between items-center border-b border-gray-800 shadow-md z-10 shrink-0">
                  <div className="text-xs text-gray-400 font-bold uppercase">Answer Sheet</div>
                  <div className={`font-mono font-bold text-sm px-3 py-1 rounded border ${examTimeLeft < 300 ? 'bg-red-500/10 text-red-500 border-red-500/30 animate-pulse' : 'bg-blue-500/10 text-blue-400 border-blue-500/30'}`}>
                    Time: {formatTimeLeft(examTimeLeft)}
                  </div>
                </div>

                {/* OMR Grid */}
                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                  <div className="grid grid-cols-1 gap-2">
                    {Array.from({ length: activeExam.total_questions }, (_, i) => i + 1).map(qNum => (
                      <div key={qNum} className="flex items-center justify-between bg-gray-900 p-2 rounded-lg border border-gray-800 hover:border-gray-700 transition">
                        <span className="text-gray-400 font-mono w-6 text-sm">{qNum}.</span>
                        <div className="flex gap-2">
                          {[1, 2, 3, 4, 5].map(opt => (
                            <button
                              key={opt}
                              onClick={() => handleAnswerSelect(qNum, opt)}
                              className={`w-8 h-8 rounded-full text-xs font-bold transition flex items-center justify-center border ${
                                examAnswers[qNum] === opt 
                                ? 'bg-blue-600 border-blue-500 text-white shadow-[0_0_10px_rgba(37,99,235,0.5)]' 
                                : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'
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

                {/* Submit Button */}
                <div className="p-4 bg-gray-900 border-t border-gray-800 shrink-0">
                  <button 
                    onClick={() => handleSubmitExam(false)}
                    className="w-full bg-amber-600 hover:bg-amber-500 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition"
                  >
                    <Send size={18} /> Submit Answers Now
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* PDF Viewer Area (Only visible when Exam is Active) */}
          {isExamPushed && (
            <div className="h-[70vh] lg:h-full lg:w-[65%] bg-gray-900 relative">
              <div className="absolute top-0 left-0 w-full p-2 bg-gradient-to-b from-black/80 to-transparent pointer-events-none z-10 flex justify-between">
                <span className="text-xs text-white/70 bg-black/50 px-2 py-1 rounded backdrop-blur font-mono">Exam Document Viewer</span>
              </div>
              <iframe 
                src={getDrivePreviewUrl(activeExam.pdf_url)} 
                className="w-full h-full border-0 bg-gray-800"
                allow="fullscreen"
                title="Exam PDF"
              />
            </div>
          )}
        </div>

        {/* Exam Result Modal */}
        {showResultModal && examResult && (
          <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-gray-900 border border-green-500/30 p-8 rounded-3xl max-w-md w-full text-center shadow-2xl">
              <div className="w-20 h-20 bg-green-500/20 text-green-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle2 size={40} />
              </div>
              <h2 className="text-3xl font-bold text-white mb-2">Submitted Successfully!</h2>
              <p className="text-gray-400 mb-8">ඔබගේ පිළිතුරු පත්‍රය සාර්ථකව යොමු කරන ලදී.</p>
              
              <div className="bg-gray-950 rounded-2xl p-6 border border-gray-800 mb-8">
                <p className="text-sm text-gray-500 font-bold uppercase mb-2">ඔබ ලබාගත් ලකුණු ප්‍රමාණය</p>
                <div className="text-6xl font-black text-amber-500 flex items-baseline justify-center gap-2">
                  {examResult.score} <span className="text-2xl text-gray-600">/ {examResult.total}</span>
                </div>
              </div>

              <button 
                onClick={() => setShowResultModal(false)}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-xl transition"
              >
                Close & Return to Full Screen Video
              </button>
            </div>
          </div>
        )}

      </div>
    );
  }

  return null;
};

export default LiveClassPlayer;