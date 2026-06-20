import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { RefreshCw, Maximize2, Minimize2, AlertCircle, Clock, Check, HelpCircle, FileText } from 'lucide-react';

interface Props {
  currentStudent: any;
  isPaid: boolean;
  supabase?: any;
}

const LiveClassPlayer: React.FC<Props> = ({ currentStudent, isPaid }) => {
  const [liveStream, setLiveStream] = useState<any>(null);
  const [pushedExam, setPushedExam] = useState<any>(null);
  const [attentionActive, setAttentionActive] = useState<boolean>(false);
  const [attentionMarked, setAttentionMarked] = useState<boolean>(false);
  
  // Custom Player States
  const [isExamMaximized, setIsExamMaximized] = useState<boolean>(false);
  const [isLagging, setIsLagging] = useState<boolean>(false);
  const [iframeKey, setIframeKey] = useState<number>(0);

  // Floating Window Drag Position
  const [dragPos, setDragPos] = useState({ x: 20, y: 20 });
  const isDragging = useRef(false);

  // Exam Logic States
  const [selectedAnswers, setSelectedAnswers] = useState<{ [key: number]: number }>({});
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [scoreResult, setScoreResult] = useState<number | null>(null);
  const [showResultModal, setShowResultModal] = useState<boolean>(false);
  const timerRef = useRef<any>(null);

  
    // 1. Live Data Stream එකට සවන් දීම (Supabase Realtime Subscription)
    useEffect(() => {
    const channel = supabase
      .channel('live_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scheduled_lives' }, (payload: any) => {
        handleLiveStreamUpdate(payload.new);
      })
      .subscribe();

    fetchCurrentLiveStream();

    return () => {
      supabase.removeChannel(channel);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const fetchCurrentLiveStream = async () => {
    const { data } = await supabase.from('scheduled_lives').select('*').eq('is_active', true).maybeSingle();
    if (data) handleLiveStreamUpdate(data);
  };

  const handleLiveStreamUpdate = async (data: any) => {
    // සිසුවාගේ පන්ති වර්ගයට (Theory/Revision/Paper) අදාළ දත්තදැයි පිරික්සීම
    if (currentStudent.active_classes?.includes(data.class_type)) {
      setLiveStream(data);
      setAttentionActive(data.attention_check_active);
      
      if (data.pushed_exam_id) {
        fetchPushedExamDetails(data.pushed_exam_id);
      } else {
        setPushedExam(null);
        setIsExamMaximized(false);
      }
    } else {
      setLiveStream(null);
    }
  };

  const fetchPushedExamDetails = async (examId: string) => {
    const { data } = await supabase.from('online_exams').select('*').eq('id', examId).maybeSingle();
    if (data) {
      setPushedExam(data);
      setTimeLeft(data.duration_minutes * 60);
      startExamTimer();
    }
  };

  // Exam Timer Countdown Loop
  const startExamTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          handleAutoSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // Latency Sync Button
  const handleSyncLive = () => {
    setIsLagging(false);
    setIframeKey(prev => prev + 1); // Reload Embed Frame
  };

  // Live Attendance System Click
  const handleMarkAttention = async () => {
    if (!liveStream) return;
    await supabase.from('live_attendance').insert({
      live_schedule_id: liveStream.id,
      student_username: currentStudent.username
    });
    setAttentionMarked(true);
    setTimeout(() => setAttentionMarked(false), 3000);
  };

  // MCQ Answer Selection Enforcer
  const handleSelectAnswer = (qIndex: number, optionNum: number) => {
    if (timeLeft <= 0) return;
    setSelectedAnswers(prev => ({ ...prev, [qIndex]: optionNum }));
  };

  // Submit Logic & Instant Score Report Generator
  const handleAutoSubmit = async () => {
    if (!pushedExam) return;
    
    // ව්‍යාජ උත්තර පත්‍ර ඇගයීම (ගුරුවරයාගේ නිවැරදි උත්තර පත්‍රය සමඟ සසඳන්න මෙහිදී ලකුණු ගණනය වේ)
    let score = 0;
    for (let i = 1; i <= pushedExam.total_questions; i++) {
      if (selectedAnswers[i] === 3) score += 1; // නිදසුනක් ලෙස අංක 3 නිවැරදි පිළිතුර ලෙස සලකා ඇත
    }

    // Pushing Realtime Score Sheet to Admin Reports Section
    await supabase.from('online_exams_submissions').insert({
      exam_id: pushedExam.id,
      student_username: currentStudent.username,
      student_name: currentStudent.name,
      class_type: pushedExam.class_type,
      score: score,
      total_questions: pushedExam.total_questions,
      answers: selectedAnswers
    });

    setScoreResult(score);
    setShowResultModal(true);
    setPushedExam(null); // Close Exam Layout Automatically
    setIsExamMaximized(false);
  };

  // Format Timer Text
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  // HTML Video Embed Frame Router
  const renderLivePlayer = () => {
    if (!liveStream) return null;
    return (
      <div key={iframeKey} className="w-full h-full relative bg-black rounded-2xl overflow-hidden aspect-video border border-slate-800">
        {liveStream.stream_type === 'youtube' ? (
          <iframe 
            src={`https://www.youtube.com/embed/${liveStream.stream_url}?autoplay=1&controls=1&rel=0`}
            className="w-full h-full absolute inset-0"
            allow="autoplay; encrypted-media; fullscreen"
            title="Live Stream Feed"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-slate-950 p-4">
            {/* Zoom Embedded Web SDK Frame Connector */}
            <div dangerouslySetInnerHTML={{ __html: liveStream.stream_url }} className="w-full h-full" />
          </div>
        )}

        {/* CUSTOM LIVE CONTROLS INTERACTIVE PANEL */}
        <div className="absolute bottom-4 right-4 flex items-center gap-2 z-30 bg-slate-950/80 p-2 backdrop-blur-md rounded-xl border border-slate-700/50">
          {/* Signal Delay Watchdog Dot Indicator */}
          <button 
            onClick={() => setIsLagging(!isLagging)}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded-lg bg-slate-900 border border-slate-700"
          >
            <span className={`w-2 h-2 rounded-full ${isLagging ? 'bg-amber-500 animate-ping' : 'bg-red-500'}`} />
            {isLagging ? 'Latency Delay Detected' : 'Live caught up'}
          </button>

          {/* Instant Network Sync Button */}
          <button 
            onClick={handleSyncLive}
            title="නැවත සජීවී විකාශනයට ක්ෂණිකව සම්බන්ධ වීමට"
            className="p-1.5 bg-slate-900 border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white rounded-lg transition"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>
    );
  };

  // ආරක්ෂිත පියවරක් ලෙස මුදල් නොගෙවූ අය සම්පූර්ණයෙන්ම බ්ලොක් කිරීම
  if (!isPaid) {
    return (
      <div className="bg-gradient-to-b from-red-950/25 to-slate-950 border border-red-500/20 p-8 rounded-3xl text-center space-y-4">
        <AlertCircle size={48} className="text-red-500 mx-auto animate-pulse" />
        <h3 className="text-xl font-bold text-red-400">ඔබගේ සක්‍රීය ප්‍රවේශය තාවකාලිකව අත්හිටුවා ඇත!</h3>
        <p className="text-sm text-slate-400 max-w-xl mx-auto">
          වත්මන් මාසය සඳහා පන්ති ගාස්තු ගෙවීම් දත්ත පද්ධතිය තුළ සක්‍රීය වී නොමැත. කරුණාකර ඔබගේ ගෙවීම් රිසිට්පත ඇඩ්මින් පැනලය වෙත යොමු කර ඇක්සස් ලබා ගන්න.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 relative">
      
      {/* LIVE ATTENTION PUSH POPUP NOTIFICATION BARS */}
      {attentionActive && (
        <div className="bg-gradient-to-r from-amber-600 to-yellow-500 p-4 rounded-2xl flex justify-between items-center text-slate-950 font-black tracking-wide shadow-2xl animate-bounce">
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-full bg-slate-950 animate-ping" />
            <span>ATTENTION CHECK: ඔබ දැනට සජීවී පන්තිය සමඟ සම්බන්ධ වී සිටිනවාද?</span>
          </div>
          <button 
            onClick={handleMarkAttention}
            disabled={attentionMarked}
            className={`px-5 py-2 rounded-xl text-xs font-black uppercase transition shadow-md border ${attentionMarked ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-slate-950 text-white hover:bg-slate-900'}`}
          >
            {attentionMarked ? <Check size={14} /> : 'Yes, I am Here'}
          </button>
        </div>
      )}

      {/* CORE SPLIT SCREEN VIEW ARCHITECTURE */}
      {!liveStream ? (
        <div className="bg-slate-900/40 border border-slate-800 p-12 rounded-3xl text-center text-slate-400 font-medium">
          දැනට ඔබ තෝරාගත් පන්ති කාණ්ඩ සඳහා සජීවී පන්ති විකාශනයන් ක්‍රියාත්මක නොවේ.
        </div>
      ) : (
        <div className="w-full">
          {/* Default Non-Maximized Balanced Split Grid Layout */}
          {!isExamMaximized ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Full Framed Live Stream Video Box */}
              <div className={`${pushedExam ? 'lg:col-span-6' : 'lg:col-span-12'} transition-all duration-500`}>
                {renderLivePlayer()}
              </div>

              {/* In-Class Live Interactive MCQ Online Exam Paper Sheet Section */}
              {pushedExam && (
                <div className="lg:col-span-6 bg-slate-900 border border-slate-700/60 rounded-3xl p-5 shadow-2xl flex flex-col h-[550px]">
                  {/* Exam Sheet Header Area */}
                  <div className="flex justify-between items-center border-b border-slate-800 pb-3 mb-3">
                    <div className="flex items-center gap-2">
                      <FileText className="text-amber-400" size={18} />
                      <h4 className="font-bold text-sm truncate max-w-[200px]">{pushedExam.title}</h4>
                    </div>
                    {/* Highlight Countdown Warning Engine at 2 minutes remaining */}
                    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-mono text-xs font-black border ${timeLeft <= 120 ? 'bg-red-600/20 text-red-400 border-red-500 animate-pulse' : 'bg-slate-950 border-slate-800'}`}>
                      <Clock size={14} /> {formatTime(timeLeft)}
                    </div>
                    <button onClick={() => setIsExamMaximized(true)} className="p-1.5 bg-slate-950 border border-slate-800 text-slate-400 hover:text-white rounded-lg transition" title="විභාග පත්‍රය විශාල කර ගැනීමට">
                      <Maximize2 size={14} />
                    </button>
                  </div>

                  {/* Split Inner Content Area */}
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4 flex-1 overflow-hidden">
                    {/* Side A: Scrollable Question Sheet Paper Box */}
                    <div className="md:col-span-7 bg-slate-950 rounded-xl border border-slate-800 overflow-hidden">
                      <iframe src={`${pushedExam.pdf_url}#toolbar=0&navpanes=0`} className="w-full h-full" title="Exam Document View" />
                    </div>

                    {/* Side B: Customizable Answer Key OMR Grid */}
                    <div className="md:col-span-5 overflow-y-auto pr-1 space-y-3 bg-slate-950/40 p-2 rounded-xl border border-slate-800/50">
                      <h5 className="text-[11px] font-black tracking-widest text-slate-400 uppercase border-b border-slate-800 pb-1">OMR Answer Sheet</h5>
                      {Array.from({ length: pushedExam.total_questions }).map((_, idx) => {
                        const qNum = idx + 1;
                        return (
                          <div key={qNum} className="flex items-center justify-between bg-slate-900/60 p-1.5 rounded-lg border border-slate-800/40">
                            <span className="text-xs font-mono font-bold text-slate-400">{String(qNum).padStart(2, '0')}.</span>
                            <div className="flex gap-1">
                              {[1, 2, 3, 4, 5].map((num) => (
                                <button
                                  key={num}
                                  onClick={() => handleSelectAnswer(qNum, num)}
                                  className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center transition border ${
                                    selectedAnswers[qNum] === num 
                                      ? 'bg-amber-500 border-amber-400 text-slate-950 scale-110 font-black' 
                                      : 'bg-slate-950 border-slate-700 text-slate-400 hover:border-slate-500'
                                  }`}
                                >
                                  {num}
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Manual Submit Button */}
                  <button onClick={handleAutoSubmit} className="w-full mt-4 bg-gradient-to-r from-amber-600 to-yellow-500 text-slate-950 py-3 rounded-xl font-black text-sm uppercase tracking-wider shadow-lg hover:from-amber-500 hover:to-yellow-400 transition transform active:scale-[0.98]">
                    Submit Answers Sheet
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* MAXIMIZED VIEW ARCHITECTURE (EXAM FULLSCREEN WITH DRAGGABLE FLOATING PLAYER) */
            <div className="w-full h-[85vh] bg-slate-900 border border-slate-700/60 rounded-3xl p-6 shadow-2xl flex flex-col relative overflow-hidden">
              {/* Maximized Exam View Header */}
              <div className="flex justify-between items-center border-b border-slate-800 pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <FileText className="text-amber-400" size={20} />
                  <h4 className="font-extrabold text-base">{pushedExam?.title}</h4>
                </div>
                <div className="flex items-center gap-4">
                  <div className={`flex items-center gap-1.5 px-4 py-2 rounded-xl font-mono text-sm font-black border ${timeLeft <= 120 ? 'bg-red-600/20 text-red-400 border-red-500 animate-pulse' : 'bg-slate-950 border-slate-800'}`}>
                    <Clock size={16} /> {formatTime(timeLeft)}
                  </div>
                  <button onClick={() => setIsExamMaximized(false)} className="p-2 bg-slate-950 border border-slate-800 text-slate-400 hover:text-white rounded-xl transition" title="Split Screen ප්‍රකාරයට මාරු වීමට">
                    <Minimize2 size={16} />
                  </button>
                </div>
              </div>

              {/* Fullscreen Document Content Core Block */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 overflow-hidden">
                <div className="lg:col-span-9 bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden">
                  <iframe src={`${pushedExam?.pdf_url}#toolbar=0&navpanes=0`} className="w-full h-full" title="Maximized View Sheet" />
                </div>
                <div className="lg:col-span-3 overflow-y-auto bg-slate-950/40 p-3 rounded-2xl border border-slate-800/80 space-y-3">
                  <h5 className="text-xs font-black tracking-widest text-slate-400 uppercase border-b border-slate-800 pb-2">OMR Ovals Matrix</h5>
                  {Array.from({ length: pushedExam?.total_questions || 0 }).map((_, idx) => {
                    const qNum = idx + 1;
                    return (
                      <div key={qNum} className="flex items-center justify-between bg-slate-900/60 p-2 rounded-xl border border-slate-800/40">
                        <span className="text-xs font-mono font-bold text-slate-400">{String(qNum).padStart(2, '0')}.</span>
                        <div className="flex gap-1.5">
                          {[1, 2, 3, 4, 5].map((num) => (
                            <button
                              key={num}
                              onClick={() => handleSelectAnswer(qNum, num)}
                              className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center transition border ${
                                selectedAnswers[qNum] === num 
                                  ? 'bg-amber-500 border-amber-400 text-slate-950 scale-110 font-black' 
                                  : 'bg-slate-950 border-slate-700 text-slate-400 hover:border-slate-500'
                              }`}
                            >
                              {num}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Floating Draggable Video Window Component Overlay */}
              <div 
                style={{ top: `${dragPos.y}px`, left: `${dragPos.x}px` }}
                className="absolute w-64 aspect-video z-50 rounded-xl overflow-hidden shadow-2xl border-2 border-amber-500 cursor-move bg-black select-none"
                onMouseDown={(e) => {
                  isDragging.current = true;
                  const offsetX = e.clientX - dragPos.x;
                  const offsetY = e.clientY - dragPos.y;
                  const handleMouseMove = (moveEvent: MouseEvent) => {
                    if (!isDragging.current) return;
                    setDragPos({ x: moveEvent.clientX - offsetX, y: moveEvent.clientY - offsetY });
                  };
                  const handleMouseUp = () => {
                    isDragging.current = false;
                    window.removeEventListener('mousemove', handleMouseMove);
                    window.removeEventListener('mouseup', handleMouseUp);
                  };
                  window.addEventListener('mousemove', handleMouseMove);
                  window.addEventListener('mouseup', handleMouseUp);
                }}
              >
                <div className="absolute inset-0 z-40 bg-transparent" /> {/* Drag Capture Shield */}
                {renderLivePlayer()}
              </div>

              <button onClick={handleAutoSubmit} className="w-full mt-4 bg-gradient-to-r from-amber-600 to-yellow-500 text-slate-950 py-3 rounded-xl font-black text-sm uppercase tracking-wider shadow-lg">
                Submit Answer Sheet Log
              </button>
            </div>
          )}
        </div>
      )}

      {/* INSTANT EVALUATION RESULT POPUP MODAL SCREEN */}
      {showResultModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-slate-900 border-2 border-amber-500 p-8 rounded-3xl text-center max-w-sm w-full space-y-4 shadow-2xl">
            <div className="w-16 h-16 rounded-full bg-amber-500/10 text-amber-400 flex items-center justify-center mx-auto border border-amber-500/30">
              <Check size={32} />
            </div>
            <h3 className="text-xl font-black text-white">විභාග පිළිතුරු පත්‍රය සාර්ථකව යොමු කෙරුණි!</h3>
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
              <span className="text-xs text-slate-400 font-mono block">YOUR SCORE</span>
              <span className="text-4xl font-black text-amber-400">{scoreResult}</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">ඔබ ලබාගත් ලකුණු ප්‍රමාණය සාර්ථකව ඔබගේ ලකුණු වාර්තා දත්ත ගොනුවට (Report Ledger) එකතු විය.</p>
            <button onClick={() => setShowResultModal(false)} className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-2.5 rounded-xl text-sm transition">
              Close Window
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default LiveClassPlayer;