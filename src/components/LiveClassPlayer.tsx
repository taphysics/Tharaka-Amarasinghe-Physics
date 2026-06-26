import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { Lock, Video, FileText, Clock, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';


interface LiveClassPlayerProps {
  studentId: string;
}

export default function LiveClassPlayer({ studentId }: LiveClassPlayerProps) {
  // State Management
  const [student, setStudent] = useState<any>(null);
  const [activeLive, setActiveLive] = useState<any>(null);
  const [activeExam, setActiveExam] = useState<any>(null);
  const [hasPaid, setHasPaid] = useState<boolean>(false);
  const [isEligible, setIsEligible] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  // Exam States
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, string>>({});
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [examSubmitted, setExamSubmitted] = useState<boolean>(false);
  const [examResult, setExamResult] = useState<any>(null);

  // Auto-submit සඳහා අගයන් තබා ගැනීමට Refs භාවිතය
  const answersRef = useRef(selectedAnswers);
  const examSubmittedRef = useRef(examSubmitted);

  useEffect(() => {
    answersRef.current = selectedAnswers;
    examSubmittedRef.current = examSubmitted;
  }, [selectedAnswers, examSubmitted]);

  // 1. සිසුවාගේ දත්ත සහ දැනට පවතින සජීවී පන්තිය ලබා ගැනීම
  useEffect(() => {
    fetchInitialData();

    // Supabase Realtime Subscription - scheduled_lives වගුවේ සිදුවන වෙනස්කම් ක්ෂණිකව ලබා ගැනීමට
    const liveChannel = supabase
      .channel('live_class_changes')
      .on(
        'postgres_changes',
        { event: '*', filter: 'is_active=eq.true', schema: 'public', table: 'scheduled_lives' },
        (payload: any) => {
          const updatedLive = payload.new;
          setActiveLive(updatedLive);
          if (updatedLive && updatedLive.is_exam_active && updatedLive.active_exam_id) {
            fetchActiveExam(updatedLive.active_exam_id);
          } else {
            setActiveExam(null);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(liveChannel);
    };
  }, []);

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      // සිසුවාගේ තොරතුරු ලබා ගැනීම
      const { data: studentData, error: sError } = await supabase
        .from('students')
        .select('*')
        .eq('id', studentId)
        .single();

      if (sError) throw sError;
      setStudent(studentData);

      // දැනට සක්‍රීය සජීවී පන්තිය ලබා ගැනීම
      const { data: liveData, error: lError } = await supabase
        .from('scheduled_lives')
        .select('*')
        .eq('is_active', true)
        .maybeSingle();

      if (lError) throw lError;
      setActiveLive(liveData);

      if (liveData) {
        // ගෙවීම් සහ පන්ති අනුකූලතාව පරීක්ෂා කිරීම
        checkEligibility(studentData, liveData);

        // එක්සෑම් එකක් සක්‍රීය නම් එය ලබා ගැනීම
        if (liveData.is_exam_active && liveData.active_exam_id) {
          await fetchActiveExam(liveData.active_exam_id);
        }
      }
    } catch (error) {
      console.error("Error fetching initial data:", error);
    } finally {
      setLoading(false);
    }
  };

  // 2. සිසුවා අදාළ මාසයට ගෙවීම් කර ඇත්ද සහ පන්තියට අනුකූලදැයි පරික්ෂා කිරීම
  const checkEligibility = (studentData: any, liveData: any) => {
    if (!studentData || !liveData) return;

    const currentMonth = liveData.target_month; 
    const isFreePlan = studentData.plan_type?.toLowerCase() === 'free';
    
    // මාසික ගෙවීම් පරීක්ෂාව (active_months හෝ free_months වල අදාළ මාසය පවතීද යන්න)
    const paidForMonth = 
      studentData.active_months?.includes(currentMonth) || 
      studentData.free_months?.includes(currentMonth) || 
      studentData.is_paid === true;

    // පන්ති වර්ගය ගැළපේදැයි පරික්ෂාව (class_types array එක තුළ target_class_type තිබේද යන්න)
    const isClassMatched = studentData.class_types?.includes(liveData.target_class_type);

    setHasPaid(isFreePlan || paidForMonth);
    setIsEligible(isClassMatched && (isFreePlan || paidForMonth));
  };

  // 3. සක්‍රීය විභාගයේ දත්ත සහ පෙර ලකුණු පුවරු පරීක්ෂාව
  const fetchActiveExam = async (examId: string) => {
    try {
      const { data: examData, error: eError } = await supabase
        .from('exams')
        .select('*')
        .eq('id', examId)
        .single();

      if (eError) throw eError;
      setActiveExam(examData);

      // සිසුවා දැනටමත් මෙම විභාගයට මුහුණ දී ඇත්දැයි පරික්ෂා කිරීම
      const { data: resultData } = await supabase
        .from('exam_results')
        .select('*')
        .eq('exam_id', examId)
        .eq('student_id', studentId)
        .maybeSingle();

      if (resultData) {
        setExamSubmitted(true);
        setExamResult({
          score: resultData.score,
          total: examData.total_questions,
        });
      } else {
        // විභාගය පෙර ලියා නැත්නම් කවුන්ට්ඩවුන් එක ආරම්භ කිරීම
        setTimeLeft(examData.duration_minutes * 60);
        setExamSubmitted(false);
        setExamResult(null);
        setSelectedAnswers({});
      }
    } catch (error) {
      console.error("Error fetching exam:", error);
    }
  };

  // 4. විභාගයේ Timer එක ක්‍රියාත්මක වීම
  useEffect(() => {
    if (!activeExam || examSubmitted || timeLeft <= 0) {
      if (timeLeft === 0 && activeExam && !examSubmitted) {
        handleExamSubmit(true); // වේලාව අවසන් වූ විට Auto-Submit වීම
      }
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, activeExam, examSubmitted]);

  // 5. පිළිතුරු පත්‍රය Submit කිරීමේ Function එක
  const handleExamSubmit = async (isAutoSubmit = false) => {
    if (examSubmittedRef.current || !activeExam || !student) return;

    const currentAnswers = answersRef.current;
    const correctAnswers = activeExam.correct_answer || {};
    let finalScore = 0;

    // ලකුණු ගණනය කිරීම
    Object.keys(correctAnswers).forEach((qNum: any) => {
      if (currentAnswers[qNum] === correctAnswers[qNum]) {
        finalScore++;
      }
    });

    try {
      // දත්ත සමුදායට (Database) ප්‍රතිඵල ඇතුළත් කිරීම
      const { error } = await supabase.from('exam_results').insert([
        {
          student_id: studentId,
          username: student.username,
          exam_id: activeExam.id,
          score: finalScore,
          submitted_at: new Date().toISOString(),
          meta_data: { answers: currentAnswers, auto_submitted: isAutoSubmit }
        }
      ]);

      if (error) throw error;

      setExamResult({
        score: finalScore,
        total: activeExam.total_questions
      });
      setExamSubmitted(true);
    } catch (error) {
      console.error("Submission error:", error);
      alert("පිළිතුරු පත්‍රය සුරැකීමේදී ගැටලුවක් මතු විය. කරුණාකර නැවත උත්සාහ කරන්න.");
    }
  };

  // කාලය Format කරන ආකාරය (MM:SS)
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-96">
        <Loader2 className="w-12 h-12 animate-spin text-blue-600 mb-2" />
        <p className="text-gray-600 font-medium">දත්ත පූරණය වෙමින් පවතී...</p>
      </div>
    );
  }

  // සක්‍රීය පන්තියක් නොමැති විට පෙන්වන UI එක
  if (!activeLive) {
    return (
      <div className="bg-yellow-50 border-l-4 border-yellow-400 p-6 rounded-lg text-center my-8">
        <Video className="w-12 h-12 text-yellow-500 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-yellow-800">දැනට සක්‍රීය සජීවී පන්ති නොමැත.</h3>
        <p className="text-yellow-700 mt-1">කරුණාකර පන්තිය ආරම්භ වන තෙක් රැඳී සිටින්න.</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-7xl mx-auto p-4">
      {/* 🛑 ගෙවීම් හෝ පන්ති අනුකූලතාවය නොමැති නම් පෙන්වන Disabled UI එක */}
      {!isEligible ? (
        <div className="w-full bg-gray-100 border-2 border-dashed border-gray-300 rounded-2xl p-12 text-center flex flex-col items-center justify-center min-h-[450px] shadow-sm">
          <div className="bg-red-100 p-4 rounded-full text-red-500 mb-4 animate-pulse">
            <Lock className="w-12 h-12" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">සජීවී පන්තිය අවහිර කර ඇත (Disabled)</h2>
          <p className="text-gray-600 max-w-md mb-6">
            මෙම සජීවී පන්තියට සම්බන්ධ වීමට නම් ඔබ අදාළ පන්තියට ලියාපදිංචි වී සහ මෙම මාසය ({activeLive.target_month}) සඳහා ගෙවීම් සම්පූර්ණ කර තිබිය යුතුය.
          </p>
          <div className="bg-white p-4 rounded-xl shadow-inner border border-gray-200 text-left w-full max-w-sm">
            <p className="text-sm font-semibold text-gray-700 mb-1">🔍 වත්මන් තත්ත්වය:</p>
            <div className="text-sm space-y-1 text-gray-600">
              <p>• පන්ති අනුකූලතාව: {student?.class_types?.includes(activeLive.target_class_type) ? "✅ ගැළපේ" : "❌ නොගැළපේ"}</p>
              <p>• මාසික ගෙවීම්: {hasPaid ? "✅ ගෙවා ඇත" : "❌ ගෙවා නැත"}</p>
            </div>
          </div>
        </div>
      ) : (
        /* ✅ සියලු සුදුසුකම් සපුරා ඇති විට පෙන්වන ප්‍රධාන UI එක */
        <div className="space-y-6">
          <div className="bg-gradient-to-r from-blue-700 to-indigo-800 text-white p-4 rounded-xl shadow-md flex justify-between items-center">
            <div>
              <span className="bg-red-500 text-xs uppercase px-2 py-1 rounded-md font-extrabold tracking-wider animate-pulse mr-2">LIVE</span>
              <h1 className="text-xl font-bold inline-block align-middle">{activeLive.title}</h1>
            </div>
            <p className="text-sm bg-white/20 px-3 py-1 rounded-full">{activeLive.target_class_type} - {activeLive.target_month}</p>
          </div>

          {/* Layout Dynamic split: විභාගය ක්‍රියාත්මක නම් දෙකට බෙදේ, නැතහොත් Full Screen පෙන්වයි */}
          <div className={`grid grid-cols-1 ${activeLive.is_exam_active && activeExam ? 'lg:grid-cols-2' : 'grid-cols-1'} gap-6 transition-all duration-500`}>
            
            {/* 🎥 වම් පස / ප්‍රධාන පස: Zoom සජීවී විකාශය (Full Native Experience) */}
            <div className="bg-black rounded-2xl overflow-hidden shadow-xl border border-gray-800 flex flex-col aspect-video min-h-[450px]">
              {activeLive.zoom_join_url ? (
                <iframe
                  src={activeLive.zoom_join_url.replace('/j/', '/wc/join/')} // Zoom Web Client Iframe එකක් ලෙස පැමිණීමට සුදුසු පරිදි සකස් කිරීම
                  allow="microphone; camera; fullscreen; speaker; display-capture"
                  className="w-full h-full border-none flex-grow"
                  title="Zoom Live Class"
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-gray-400 h-full p-6">
                  <AlertCircle className="w-12 h-12 mb-2 text-gray-500" />
                  <p>Zoom සබැඳිය (Link) සක්‍රීය වෙමින් පවතී...</p>
                </div>
              )}
            </div>

            {/* 📝 දකුණු පස: ඔන්ලයින් විභාගය (Admin සක්‍රීය කළ විට පමණක් දිස්වේ) */}
            {activeLive.is_exam_active && activeExam && (
              <div className="bg-white rounded-2xl shadow-xl border border-gray-200 flex flex-col h-[550px] lg:h-auto overflow-hidden animate-fade-in">
                
                {/* Exam Header සහ Countdown Timer */}
                <div className="bg-slate-900 text-white p-4 flex justify-between items-center border-b border-slate-700">
                  <div className="flex items-center space-x-2">
                    <FileText className="w-5 h-5 text-blue-400" />
                    <span className="font-bold text-sm lg:text-base truncate max-w-[180px] lg:max-w-[250px]">{activeExam.title}</span>
                  </div>
                  
                  {!examSubmitted && (
                    <div className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg font-mono text-lg font-bold ${timeLeft < 60 ? 'bg-red-600 animate-pulse text-white' : 'bg-slate-800 text-emerald-400'}`}>
                      <Clock className="w-5 h-5" />
                      <span>{formatTime(timeLeft)}</span>
                    </div>
                  )}
                </div>

                <div className="flex-grow grid grid-cols-1 md:grid-cols-2 overflow-y-auto">
                  {/* PDF පත්‍රිකාව */}
                  <div className="border-r border-gray-200 h-full min-h-[300px]">
                    {activeExam.pdf_url ? (
                      <iframe
                        src={`${activeExam.pdf_url}#toolbar=0`} // සිසුන්ට බාගත කිරීම (Download) අපහසු වන සේ Toolbar එක ඉවත් කිරීම
                        className="w-full h-full min-h-[350px]"
                        title="Exam Paper PDF"
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full text-gray-500">PDF එක පූරණය වෙමින් පවතී...</div>
                    )}
                  </div>

                  {/* MCQ පිළිතුරු පුවරුව (Answer Sheet) */}
                  <div className="p-4 flex flex-col justify-between bg-slate-50 overflow-y-auto h-full">
                    {!examSubmitted ? (
                      // විභාගය ලියන අවස්ථාවේ පෙනෙන UI එක
                      <>
                        <div className="space-y-4">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">පිළිතුරු සලකුණු කරන්න:</p>
                          {Array.from({ length: activeExam.total_questions || 0 }).map((_, index) => {
                            const qNum = index + 1;
                            return (
                              <div key={qNum} className="flex items-center justify-between bg-white p-2.5 rounded-xl shadow-sm border border-gray-200">
                                <span className="font-bold text-gray-700 text-sm">ප්‍රශ්නය {qNum.toString().padStart(2, '0')} :</span>
                                <div className="flex space-x-1.5">
                                  {['1', '2', '3', '4', '5'].map((option) => (
                                    <button
                                      key={option}
                                      type="button"
                                      onClick={() => setSelectedAnswers(prev => ({ ...prev, [qNum]: option }))}
                                      className={`w-7 h-7 text-xs font-bold rounded-full border transition-all ${
                                        selectedAnswers[qNum] === option
                                          ? 'bg-blue-600 text-white border-blue-600 scale-110 shadow-sm'
                                          : 'bg-gray-100 hover:bg-gray-200 text-gray-700 border-gray-300'
                                      }`}
                                    >
                                      {option}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        
                        <button
                          type="button"
                          onClick={() => {
                            if(confirm("ඔබට පිළිතුරු පත්‍රය ඉදිරිපත් කිරීමට අවශ්‍ය බව ස්ථිරද? ඉන්පසු නැවත වෙනස් කළ නොහැක.")) {
                              handleExamSubmit(false);
                            }
                          }}
                          className="w-full mt-6 bg-emerald-600 hover:bg-emerald-700 text-white py-3 px-4 rounded-xl font-bold shadow-md transition-all uppercase text-sm tracking-wide"
                        >
                          විභාගය අවසන් කරන්න (Submit Paper)
                        </button>
                      </>
                    ) : (
                      // 📊 විභාගය අවසන් වූ පසු ප්‍රතිඵල පෙන්වන මනරම් UI එක
                      <div className="flex flex-col items-center justify-center text-center p-6 my-auto bg-white rounded-2xl shadow-md border border-emerald-100 animate-scale-in">
                        <CheckCircle2 className="w-16 h-16 text-emerald-500 mb-3" />
                        <h3 className="text-xl font-bold text-gray-800">පිළිතුරු පත්‍රය භාරගන්නා ලදී!</h3>
                        <p className="text-xs text-gray-500 mt-1">මෙම විභාගය සඳහා ඔබට නැවත පිළිතුරු සැපයිය නොහැක.</p>

                        <div className="my-6 p-4 bg-slate-50 rounded-xl border border-gray-200 w-full max-w-xs">
                          <p className="text-gray-600 text-xs font-semibold uppercase">ලබාගත් සමස්ත ලකුණු තත්ත්වය</p>
                          <div className="text-4xl font-extrabold text-blue-700 my-1">
                            {examResult?.score} <span className="text-xl text-gray-400 font-normal">/ {examResult?.total}</span>
                          </div>
                          <div className="w-full bg-gray-200 h-2 rounded-full mt-3 overflow-hidden">
                            <div 
                              className="bg-emerald-500 h-full transition-all duration-1000" 
                              style={{ width: `${((examResult?.score || 0) / (examResult?.total || 1)) * 100}%` }}
                            />
                          </div>
                          <p className="text-xs font-medium text-emerald-600 mt-2">
                            නිවැරදි පිළිතුරු ප්‍රතිශතය: {Math.round(((examResult?.score || 0) / (examResult?.total || 1)) * 100)}%
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}