import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient'; // ඔබගේ supabase client path එකට වෙනස් කරගන්න

interface LiveClassPlayerProps {
  classId: string; // ප්‍රදර්ශනය කළ යුතු scheduled_lives table එකේ id එක
  username: string; // දැනට ලොග් වී සිටින සිසුවාගේ username එක
  studentId: string; // සිසුවාගේ id එක
}

export default function LiveClassPlayer({ classId, username, studentId }: LiveClassPlayerProps) {
  const [liveSession, setLiveSession] = useState<any>(null);
  const [examDetails, setExamDetails] = useState<any>(null);
  
  // Video & Zoom State
  const [showWaitingVideo, setShowWaitingVideo] = useState(false);
  
  // Exam State
  const [answers, setAnswers] = useState<{ [key: number]: number }>({});
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [examSubmitted, setExamSubmitted] = useState(false);
  
  // Result State
  const [scorePopup, setScorePopup] = useState<{ show: boolean; score: number; total: number }>({ show: false, score: 0, total: 0 });

  // 1. Initial Data Fetch & Realtime Subscription
  useEffect(() => {
    const fetchClassData = async () => {
      const { data, error } = await supabase
        .from('scheduled_lives')
        .select('*')
        .eq('id', classId)
        .single();

      if (data) setLiveSession(data);
    };

    fetchClassData();

    // Realtime listener for status and exam updates from admin
    const subscription = supabase
      .channel('live-class-updates')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'scheduled_lives', filter: `id=eq.${classId}` },
        (payload) => {
          setLiveSession(payload.new);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [classId]);

  // 2. Waiting Video Logic
  useEffect(() => {
    if (!liveSession) return;

    if (liveSession.status === 'scheduled') {
      const classDateTime = new Date(`${liveSession.date}T${liveSession.time}`);
      const currentTime = new Date();
      const timeDiff = classDateTime.getTime() - currentTime.getTime();
      const oneHourInMs = 60 * 60 * 1000;

      // පැයකට පෙර සිට waiting video එක පෙන්වන්න
      if (timeDiff <= oneHourInMs && timeDiff > 0) {
        setShowWaitingVideo(true);
      } else {
        setShowWaitingVideo(false);
      }
    } else {
      setShowWaitingVideo(false);
    }
  }, [liveSession]);

  // 3. Exam Logic & Realtime Fetching
  useEffect(() => {
    const fetchExam = async () => {
      if (liveSession?.is_exam_active && liveSession?.active_exam_id && !examSubmitted) {
        const { data, error } = await supabase
          .from('exams')
          .select('*')
          .eq('id', liveSession.active_exam_id)
          .single();

        if (data) {
          setExamDetails(data);
          if (timeLeft === null) {
            setTimeLeft(data.duration_minutes * 60);
          }
        }
      }
    };
    fetchExam();
  }, [liveSession?.is_exam_active, liveSession?.active_exam_id, examSubmitted]);

  // 4. Timer Logic & Auto Submit
  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0 || examSubmitted) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev !== null && prev <= 1) {
          clearInterval(timer);
          submitExam(); // කාලය අවසන් වූ පසු ස්වයංක්‍රීයව submit වීම
          return 0;
        }
        return prev ? prev - 1 : 0;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, examSubmitted]);

  // Helper: Format Google Drive Link to Embed Mode
  const getEmbedUrl = (url: string) => {
    if (!url) return '';
    return url.replace(/\/view.*$/, '/preview');
  };

  // Helper: Format Time
  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Select Answer
  const handleAnswerSelect = (questionNo: number, optionNo: number) => {
    setAnswers({ ...answers, [questionNo]: optionNo });
  };

  // Submit Exam Logic
  const submitExam = async () => {
    if (!examDetails || examSubmitted) return;
    setExamSubmitted(true);

    let correctCount = 0;
    const correctAnswers = examDetails.correct_answer; // jsonb

    // ලකුණු ගණනය කිරීම
    for (let i = 1; i <= examDetails.total_questions; i++) {
      if (answers[i] === correctAnswers[i.toString()]) {
        correctCount++;
      }
    }

    // Database එකට සේව් කිරීම
    await supabase.from('exam_results').insert({
      username: username,
      exam_id: examDetails.id,
      student_id: studentId,
      score: correctCount,
      submitted_at: new Date().toISOString(),
      meta_data: { student_answers: answers }
    });

    setScorePopup({ show: true, score: correctCount, total: examDetails.total_questions });
  };

  if (!liveSession) return <div className="p-10 text-center text-white">Loading...</div>;

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      
      {/* Top Bar - Session Title */}
      <div className="bg-gray-800 p-4 text-xl font-bold shadow-md">
        {liveSession.title}
      </div>

      <div className="flex-grow p-4 flex gap-4 w-full h-[calc(100vh-80px)]">
        
        {/* --- EXAM SECTION (Left Side) --- */}
        {liveSession.is_exam_active && !examSubmitted && examDetails && (
          <div className="w-2/3 flex flex-col gap-4 h-full">
            
            {/* Timer and Action Bar */}
            <div className="bg-blue-900 p-4 rounded-lg flex justify-between items-center shadow-lg">
              <h2 className="text-xl font-bold">Online Exam: {examDetails.title}</h2>
              <div className="flex items-center gap-4">
                <span className="text-2xl font-mono text-yellow-400 font-bold">
                  ⏱ {timeLeft !== null ? formatTime(timeLeft) : '00:00:00'}
                </span>
                <button 
                  onClick={submitExam}
                  className="bg-red-600 hover:bg-red-700 px-6 py-2 rounded font-bold transition"
                >
                  Submit Paper
                </button>
              </div>
            </div>

            {/* PDF Embed (Google Drive) */}
            <div className="flex-grow bg-gray-800 rounded-lg overflow-hidden border border-gray-700">
              <iframe 
                src={getEmbedUrl(examDetails.pdf_url)} 
                className="w-full h-full"
                allow="autoplay"
                title="Exam Paper"
              ></iframe>
            </div>

            {/* OMR Answer Sheet */}
            <div className="bg-gray-800 p-4 rounded-lg h-1/3 overflow-y-auto border border-gray-700">
              <h3 className="mb-4 font-bold text-lg border-b border-gray-600 pb-2">Mark Your Answers</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {Array.from({ length: examDetails.total_questions }, (_, i) => i + 1).map((q) => (
                  <div key={q} className="flex items-center gap-3 bg-gray-700 p-2 rounded">
                    <span className="w-8 text-center font-bold">{q}.</span>
                    {[1, 2, 3, 4, 5].map((opt) => (
                      <button
                        key={opt}
                        onClick={() => handleAnswerSelect(q, opt)}
                        className={`w-8 h-8 rounded-full border-2 flex items-center justify-center font-bold transition-all
                          ${answers[q] === opt ? 'bg-blue-500 border-blue-500 text-white' : 'border-gray-400 hover:border-blue-400'}`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* --- ZOOM PLAYER / WAITING VIDEO SECTION (Right Side or Full Screen) --- */}
        <div className={`${liveSession.is_exam_active && !examSubmitted ? 'w-1/3' : 'w-full'} h-full bg-black rounded-lg overflow-hidden relative shadow-2xl transition-all duration-300`}>
          
          {liveSession.status === 'scheduled' && showWaitingVideo ? (
            <video 
              src="/videos/waiting-video.mp4" 
              autoPlay 
              loop 
              muted // Unmute if browser policies allow autoplay with sound
              className="w-full h-full object-cover"
            />
          ) : liveSession.status === 'scheduled' ? (
            <div className="flex items-center justify-center h-full flex-col">
              <h2 className="text-3xl font-bold mb-2">Class Scheduled</h2>
              <p className="text-gray-400">Date: {liveSession.date} | Time: {liveSession.time}</p>
            </div>
          ) : liveSession.status === 'live' && liveSession.zoom_join_url ? (
            <iframe 
              src={liveSession.zoom_join_url} 
              className="w-full h-full border-0"
              allow="camera; microphone; fullscreen"
            ></iframe>
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-xl text-gray-500">Session Completed or Unavailable</p>
            </div>
          )}

        </div>
      </div>

      {/* --- SCORE POPUP --- */}
      {scorePopup.show && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-white text-black p-8 rounded-xl shadow-2xl max-w-sm w-full text-center transform transition-all scale-100">
            <h2 className="text-3xl font-extrabold text-green-600 mb-4">Exam Completed!</h2>
            <p className="text-lg text-gray-600 mb-6">Your results have been submitted successfully.</p>
            <div className="text-5xl font-black text-blue-600 mb-8">
              {scorePopup.score} <span className="text-2xl text-gray-400">/ {scorePopup.total}</span>
            </div>
            <button 
              onClick={() => setScorePopup({ ...scorePopup, show: false })}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition"
            >
              Close & Return to Class
            </button>
          </div>
        </div>
      )}
      
    </div>
  );
}