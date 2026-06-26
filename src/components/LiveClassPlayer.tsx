import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

interface LiveClassPlayerProps {
  currentLiveId: string;
  studentId: string;
  studentUsername: string;
}

interface LiveSession {
  id: string;
  title: string;
  zoom_join_url: string;
  status: string;
  date: string;
  time: string;
  is_exam_active: boolean;
  active_exam_id: string | null;
}

interface ExamData {
  id: string;
  title: string;
  pdf_url: string;
  duration_minutes: number;
  total_questions: number;
  correct_answer: Record<string, number>;
}

export default function LiveClassPlayer({ currentLiveId, studentId, studentUsername }: LiveClassPlayerProps) {
  const [session, setSession] = useState<LiveSession | null>(null);
  const [exam, setExam] = useState<ExamData | null>(null);
  const [isWithinOneHour, setIsWithinOneHour] = useState(false);
  const [studentAnswers, setStudentAnswers] = useState<Record<number, number>>({});
  
  // Exam Countdown Timer States
  const [timeLeft, setTimeLeft] = useState<number>(0); 
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Score Result Modal States
  const [showResultModal, setShowResultModal] = useState(false);
  const [calculatedScore, setCalculatedScore] = useState<number>(0);
  const [totalExamQuestions, setTotalExamQuestions] = useState<number>(0);

  useEffect(() => {
    fetchSessionDetails();

    // Supabase Realtime Subscription - තත්පරයෙන් තත්පරයට වෙනස්වීම් හඳුනාගැනීම
    const channel = supabase
      .channel(`live_room_${currentLiveId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'scheduled_lives', filter: `id=eq.${currentLiveId}` },
        (payload) => {
          const updated = payload.new as LiveSession;
          setSession(updated);
          if (updated.is_exam_active && updated.active_exam_id) {
            fetchExamDetails(updated.active_exam_id);
          } else {
            setExam(null);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [currentLiveId]);

  const fetchSessionDetails = async () => {
    const { data, error } = await supabase
      .from('scheduled_lives')
      .select('id, title, zoom_join_url, status, date, time, is_exam_active, active_exam_id')
      .eq('id', currentLiveId)
      .single();

    if (!error && data) {
      setSession(data);
      checkTimeThreshold(data.date, data.time);
      if (data.is_exam_active && data.active_exam_id) {
        fetchExamDetails(data.active_exam_id);
      }
    }
  };

  const fetchExamDetails = async (examId: string) => {
    const { data, error } = await supabase
      .from('exams')
      .select('id, title, pdf_url, duration_minutes, total_questions, correct_answer')
      .eq('id', examId)
      .single();

    if (!error && data) {
      setExam(data);
      setTimeLeft(data.duration_minutes * 60);
      startCountdown();
    }
  };

  // පන්තිය ආරම්භ වීමට පැයකට පෙර කාලය පරීක්ෂා කිරීම
  const checkTimeThreshold = (classDate: string, classTime: string) => {
    try {
      const classDateTime = new Date(`${classDate}T${classTime}`);
      const now = new Date();
      const differenceInMs = classDateTime.getTime() - now.getTime();
      const oneHourInMs = 60 * 60 * 1000;
      
      // ආරම්භ වීමට පැයකට පෙර සහ පන්තිය ආරම්භ වන තෙක්
      if (differenceInMs <= oneHourInMs && differenceInMs > -oneHourInMs * 5) {
        setIsWithinOneHour(true);
      }
    } catch (e) {
      console.error('කාලය ගණනය කිරීමේ දෝෂයකි:', e);
    }
  };

  // විභාගයේ Countdown Timer එක ක්‍රියාත්මක කිරීම
  const startCountdown = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          autoSubmitExam(); // කාලය අවසන් වූ සැනින් ස්වයංක්‍රීයව Submit වීම
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleSelectAnswer = (qNum: number, option: number) => {
    setStudentAnswers((prev) => ({ ...prev, [qNum]: option }));
  };

  // විභාගය අවසන් කර ලකුණු ගණනය කර දත්ත සමුදායට යැවීම
  const submitExamHander = async () => {
    if (!exam) return;
    if (timerRef.current) clearInterval(timerRef.current);

    let score = 0;
    const answers = exam.correct_answer as Record<string, number>;

    // ලකුණු ගණනය කිරීම
    for (let q = 1; q <= exam.total_questions; q++) {
      if (studentAnswers[q] && Number(studentAnswers[q]) === Number(answers[q])) {
        score++;
      }
    }

    // දත්ත සමුදායට ප්‍රතිඵල ඇතුලත් කිරීම
    await supabase.from('exam_results').insert([
      {
        username: studentUsername,
        student_id: studentId,
        exam_id: exam.id,
        score: score,
        submitted_at: new Date().toISOString(),
        meta_data: { student_responses: studentAnswers }
      }
    ]);

    setCalculatedScore(score);
    setTotalExamQuestions(exam.total_questions);
    setShowResultModal(true);
    setExam(null); // විභාගය ඉවත් කර නැවත ප්ලේයරය පෙන්වීම
  };

  const autoSubmitExam = () => {
    submitExamHander();
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (!session) return <div className="text-white p-6 text-center">සජීවී විකාශන දත්ත පූරණය වෙමින් පවතී...</div>;

  // අවස්ථාව 01: ඇඩ්මින් පන්තිය ලයිව් කිරීමට පෙර (පැයකට පෙර සිට) Waiting වීඩියෝව පෙන්වීම
  const showWaitingVideo = session.status !== 'active' && isWithinOneHour;

  return (
    <div className="w-full bg-black min-h-screen text-white relative">
      {/* පන්තියේ ඉහල බාර් එක */}
      <div className="p-4 bg-gray-900 flex justify-between items-center border-b border-gray-800">
        <h2 className="text-lg font-bold text-cyan-400">{session.title}</h2>
        <div className="flex items-center space-x-2">
          <span className={`w-3 h-3 rounded-full ${session.status === 'active' ? 'bg-red-500 animate-pulse' : 'bg-yellow-500'}`} />
          <span className="text-sm font-semibold">{session.status === 'active' ? 'LIVE' : 'WAITING'}</span>
        </div>
      </div>

      {/* ප්‍රධාන වීඩියෝ/විභාග කලාපය */}
      <div className="w-full h-[calc(100vh-68px)] relative">
        
        {/* Waiting Video එක */}
        {showWaitingVideo && (
          <div className="absolute inset-0 bg-black flex flex-col justify-center items-center">
            <video
              src="/videos/waiting-video.mp4"
              className="w-full h-full object-cover"
              autoPlay
              loop
              muted
              playsInline
            />
            <div className="absolute bottom-10 left-10 bg-black/80 p-4 rounded-lg border border-gray-700 backdrop-blur">
              <p className="text-yellow-400 font-bold animate-pulse text-lg">පන්තිය ඉක්මනින්ම ආරම්භ වේ...</p>
              <p className="text-xs text-gray-400">ගුරුතුමා සම්බන්ධ වන තෙක් රැඳී සිටින්න.</p>
            </div>
          </div>
        )}

        {/* සක්‍රීය Zoom සජීවී පන්තිය (විභාගයක් නොමැති විට Full Screen) */}
        {session.status === 'active' && !exam && (
          <div className="w-full h-full">
            <iframe
              src={session.zoom_join_url}
              className="w-full h-full border-0"
              allow="microphone; camera; fullscreen"
            />
          </div>
        )}

        {/* අවස්ථාව 02: සජීවී පන්තිය අතරතුර විභාගයක් Push කල විට ලැබෙන Split Screen එක */}
        {session.status === 'active' && exam && (
          <div className="grid grid-cols-1 lg:grid-cols-2 h-full w-full bg-gray-950">
            
            {/* වම් පස - Google Drive Embedded PDF එක (Zoom, Navigation සහිතයි) */}
            <div className="h-full border-r border-gray-800 bg-gray-900 relative">
              <div className="absolute top-2 left-2 bg-black/70 px-3 py-1 rounded text-xs z-10 font-bold text-gray-300">
                ප්‍රශ්න පත්‍රය (PDF Viewer)
              </div>
              <iframe
                src={exam.pdf_url}
                className="w-full h-full border-0"
                allow="autoplay"
              />
            </div>

            {/* දකුණු පස - අන්තර්ක්‍රියාකාරී MCQ ෂීට් එක සහ කවුන්ටරය */}
            <div className="h-full flex flex-col bg-gray-900 overflow-y-auto p-6">
              
              {/* ටයිමරය සහ විස්තර */}
              <div className="flex justify-between items-center bg-gray-800 p-4 rounded-lg mb-6 border border-gray-700 shadow-md">
                <div>
                  <h3 className="font-bold text-emerald-400 text-lg">{exam.title}</h3>
                  <p className="text-xs text-gray-400">සියලුම ප්‍රශ්න සඳහා පිළිතුරු සපයන්න.</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-400 font-medium">ඉතිරි කාලය</p>
                  <p className={`text-2xl font-mono font-bold ${timeLeft < 60 ? 'text-red-500 animate-pulse' : 'text-yellow-400'}`}>
                    {formatTime(timeLeft)}
                  </p>
                </div>
              </div>

              {/* MCQ ගුවන් විදුලි බොත්තම් මැට්‍රික්ස් එක */}
              <div className="flex-1 space-y-4 pr-2">
                {Array.from({ length: exam.total_questions }).map((_, idx) => {
                  const qNum = idx + 1;
                  return (
                    <div key={qNum} className="p-3 bg-gray-800/50 rounded-lg border border-gray-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <span className="font-bold text-sm text-gray-300">ප්‍රශ්නය {qNum.toString().padStart(2, '0')}</span>
                      <div className="flex items-center space-x-4">
                        {[1, 2, 3, 4, 5].map((opt) => (
                          <label key={opt} className="flex items-center space-x-1 cursor-pointer group">
                            <input
                              type="radio"
                              name={`student-q-${qNum}`}
                              checked={studentAnswers[qNum] === opt}
                              onChange={() => handleSelectAnswer(qNum, opt)}
                              className="w-5 h-5 text-emerald-500 bg-gray-700 border-gray-600 focus:ring-0"
                            />
                            <span className="text-sm font-semibold group-hover:text-emerald-400">{opt}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Submit බොත්තම */}
              <button
                onClick={submitExamHander}
                className="mt-6 w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold p-3 rounded-lg shadow-lg transition transform active:scale-95"
              >
                පිළිතුරු පත්‍රය ඉදිරිපත් කරන්න (Submit Paper)
              </button>
            </div>
          </div>
        )}

        {/* පන්තිය පද්ධතිය තුල සක්‍රීය නොමැති අවස්ථාවක පෙන්වන තිරය */}
        {session.status !== 'active' && !isWithinOneHour && (
          <div className="absolute inset-0 bg-gray-950 flex flex-col justify-center items-center p-6 text-center">
            <div className="p-4 bg-gray-900 rounded-full mb-4 border border-gray-800">
              <svg className="w-12 h-12 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold mb-1">සජීවී පන්තිය තවමත් ආරම්භ කර නොමැත</h3>
            <p className="text-gray-400 text-sm max-w-sm">
              මෙම පන්තිය පැවැත්වීමට නියමිතව ඇත්තේ {session.date} දින {session.time} ටය. පන්තිය ආරම්භ වීමට පැයකට පෙර සිට සජීවී ප්‍රවේශය විවෘත වේ.
            </p>
          </div>
        )}
      </div>

      {/* විභාග ලකුණු පෙන්වන Popup Modal එක */}
      {showResultModal && (
        <div className="fixed inset-0 bg-black/90 flex justify-center items-center z-50 backdrop-blur-sm p-4">
          <div className="bg-gray-900 border border-gray-800 p-8 rounded-xl max-w-md w-full text-center shadow-2xl animate-fade-in">
            <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex justify-center items-center mx-auto mb-4 border border-emerald-500/30">
              <svg className="w-10 h-10 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-2xl font-bold text-white mb-2">විභාගය සාර්ථකව අවසන් කලා!</h3>
            <p className="text-gray-400 text-sm mb-6">ඔබ ලබාදුන් පිළිතුරු ස්වයංක්‍රීයව පද්ධතිය තුල සුරැකින ලදී.</p>
            
            <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-800 mb-6">
              <span className="text-xs text-gray-400 block uppercase tracking-wider font-semibold">ඔබේ ලකුණු ප්‍රමාණය</span>
              <span className="text-4xl font-mono font-bold text-yellow-400">{calculatedScore}</span>
              <span className="text-gray-500 text-lg"> / {totalExamQuestions}</span>
            </div>

            <button
              onClick={() => setShowResultModal(false)}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-4 rounded-lg transition"
            >
              Close & Return to Zoom
            </button>
          </div>
        </div>
      )}
    </div>
  );
}