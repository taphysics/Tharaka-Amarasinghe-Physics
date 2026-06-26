import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

// Supabase Client එක Initialize කිරීම (ඔබගේ පරිසර විචල්‍යයන්ට අනුව වෙනස් කරගන්න)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

interface ClassTypeConfig {
  id: string;
  class_types: string;
}

interface ScheduledLive {
  id: string;
  title: string;
  date: string;
  time: string;
  class_type: string;
  status: string;
  is_exam_active: boolean;
}

export default function AdminLiveControls() {
  // Class States
  const [classTypes, setClassTypes] = useState<ClassTypeConfig[]>([]);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [targetMonth, setTargetMonth] = useState('');
  const [selectedClassType, setSelectedClassType] = useState('');
  const [zoomJoinUrl, setZoomJoinUrl] = useState('');
  const [scheduledClasses, setScheduledClasses] = useState<ScheduledLive[]>([]);
  const [activeLiveId, setActiveLiveId] = useState<string | null>(null);

  // Exam States
  const [examTitle, setExamTitle] = useState('');
  const [pdfUrl, setPdfUrl] = useState('');
  const [totalQuestions, setTotalQuestions] = useState<number>(10);
  const [durationHours, setDurationHours] = useState<number>(0);
  const [durationMinutes, setDurationMinutes] = useState<number>(30);
  const [durationSeconds, setDurationSeconds] = useState<number>(0);
  const [correctAnswers, setCorrectAnswers] = useState<Record<number, number>>({});

  useEffect(() => {
    fetchClassTypes();
    fetchScheduledLives();
  }, []);

  const fetchClassTypes = async () => {
    const { data, error } = await supabase
      .from('class_types_config')
      .select('id, class_types')
      .eq('is_active', true);
    if (!error && data) setClassTypes(data);
  };

  const fetchScheduledLives = async () => {
    const { data, error } = await supabase
      .from('scheduled_lives')
      .select('id, title, date, time, class_type, status, is_exam_active')
      .order('created_at', { ascending: false });
    if (!error && data) {
      setScheduledClasses(data);
      const active = data.find((c) => c.status === 'active');
      if (active) setActiveLiveId(active.id);
    }
  };

  // 01. නිවැරැදි සූම් පන්තියක් සහ Calendar Event එකක් නිර්මාණය කිරීම
  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !date || !time || !selectedClassType) {
      alert('කරුණාකර සියලුම විස්තර ඇතුලත් කරන්න.');
      return;
    }

    // scheduled_lives වගුවට දත්ත ඇතුලත් කිරීම
    const { data: liveData, error: liveError } = await supabase
      .from('scheduled_lives')
      .insert([
        {
          title,
          date,
          time,
          target_month: targetMonth,
          class_type: selectedClassType,
          target_class_type: selectedClassType,
          zoom_join_url: zoomJoinUrl,
          status: 'pending',
          is_exam_active: false,
          pre_class_video_path: '/videos/waiting-video.mp4',
          is_active: true,
          platform: 'zoom'
        }
      ])
      .select();

    if (liveError) {
      alert('පන්තිය නිර්මාණය කිරීම අසාර්ථකයි: ' + liveError.message);
      return;
    }

    // calender_events වගුවට දත්ත ඇතුලත් කර සිසුන්ගේ දින දර්ශන යාවත්කාලීන කිරීම
    const { error: calError } = await supabase.from('calender_events').insert([
      {
        title: title,
        date: date,
        start_time: time,
        class_type: selectedClassType,
        target_class_type: selectedClassType,
        status: 'scheduled',
        description: `${selectedClassType} සජීවී පන්තිය`
      }
    ]);

    if (!calError) {
      alert('සූම් පන්තිය සහ දින දර්ශන සටහන සාර්ථකව නිර්මාණය කර පබ්ලිෂ් කරන ලදී!');
      setTitle('');
      setDate('');
      setTime('');
      setZoomJoinUrl('');
      fetchScheduledLives();
    }
  };

  // පන්තිය සජීවීව ආරම්භ කිරීම හෝ අවසන් කිරීම
  const toggleLiveStatus = async (id: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'active' ? 'completed' : 'active';
    const { error } = await supabase
      .from('scheduled_lives')
      .update({ status: nextStatus })
      .eq('id', id);

    if (!error) {
      if (nextStatus === 'active') setActiveLiveId(id);
      else if (activeLiveId === id) setActiveLiveId(null);
      fetchScheduledLives();
    }
  };

  // 02. ඔන්ලයින් එක්සෑම් එකක් නිර්මාණය කර සජීවීව Push කිරීම
  const handleCreateAndPushExam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeLiveId) {
      alert('ප්‍රශ්න පත්‍රයක් ඇටෑච් කිරීමට ප්‍රථම පන්තියක් සජීවීව (Active) පවතී පැවතිය යුතුය.');
      return;
    }

    const totalDurationMinutes = durationHours * 60 + durationMinutes + durationSeconds / 60;
    const selectedClassObj = scheduledClasses.find((c) => c.id === activeLiveId);

    // 1. Exams වගුවට ඇතුලත් කිරීම
    const { data: examData, error: examError } = await supabase
      .from('exams')
      .insert([
        {
          title: examTitle,
          class_type: selectedClassObj?.class_type || '',
          target_class_type: selectedClassObj?.class_type || '',
          pdf_url: pdfUrl,
          duration_minutes: Math.ceil(totalDurationMinutes),
          total_questions: totalQuestions,
          correct_answer: correctAnswers,
          status: 'active'
        }
      ])
      .select();

    if (examError || !examData) {
      alert('ප්‍රශ්න පත්‍රය සෑදීම අසාර්ථකයි: ' + examError?.message);
      return;
    }

    const createdExamId = examData[0].id;

    // 2. දැනට ධාවනය වන සජීවී පන්තියට විභාගය Push කිරීම (Realtime Sync)
    const { error: liveUpdateError } = await supabase
      .from('scheduled_lives')
      .update({
        is_exam_active: true,
        active_exam_id: createdExamId
      })
      .eq('id', activeLiveId);

    if (!liveUpdateError) {
      alert('ප්‍රශ්න පත්‍රය සාර්ථකව නිර්මාණය කර සිසුන්ගේ පරිගණක වෙත ක්ෂණිකව Push කරන ලදී!');
      setExamTitle('');
      setPdfUrl('');
      setCorrectAnswers({});
      fetchScheduledLives();
    }
  };

  const handleAnswerChange = (qNum: number, ans: number) => {
    setCorrectAnswers((prev) => ({ ...prev, [qNum]: ans }));
  };

  return (
    <div className="p-6 bg-gray-900 text-white min-h-screen">
      <h1 className="text-3xl font-bold mb-8 text-center border-b pb-4 border-gray-700">
        Admin Live & Exam Control Panel
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* 01. සූම් පන්ති සාදන කොටස */}
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
          <h2 className="text-xl font-semibold mb-4 text-cyan-400">01. නව සූම් පන්තියක් උපලේඛනගත කිරීම</h2>
          <form onSubmit={handleCreateClass} className="space-y-4">
            <div>
              <label className="block mb-1 text-sm">පන්තියේ මාතෘකාව (Title)</label>
              <input
                type="text"
                className="w-full p-2 rounded bg-gray-700 border border-gray-600 text-white"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="उदा: 2026 Theory Live"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block mb-1 text-sm">දිනය</label>
                <input
                  type="date"
                  className="w-full p-2 rounded bg-gray-700 border border-gray-600 text-white"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div>
                <label className="block mb-1 text-sm">ආරම්භක වේලාව</label>
                <input
                  type="time"
                  className="w-full p-2 rounded bg-gray-700 border border-gray-600 text-white"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block mb-1 text-sm">ඉලක්කගත මාසය</label>
                <input
                  type="text"
                  className="w-full p-2 rounded bg-gray-700 border border-gray-600 text-white"
                  value={targetMonth}
                  onChange={(e) => setTargetMonth(e.target.value)}
                  placeholder="उदा: June"
                />
              </div>
              <div>
                <label className="block mb-1 text-sm">පන්ති වර්ගය (Class Type)</label>
                <select
                  className="w-full p-2 rounded bg-gray-700 border border-gray-600 text-white"
                  value={selectedClassType}
                  onChange={(e) => setSelectedClassType(e.target.value)}
                >
                  <option value="">තෝරන්න...</option>
                  {classTypes.map((t) => (
                    <option key={t.id} value={t.class_types}>
                      {t.class_types}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block mb-1 text-sm">Zoom Join URL (සිසුවා සම්බන්ධ වන ලින්ක් එක)</label>
              <input
                type="url"
                className="w-full p-2 rounded bg-gray-700 border border-gray-600 text-white"
                value={zoomJoinUrl}
                onChange={(e) => setZoomJoinUrl(e.target.value)}
                placeholder="https://zoom.us/j/..."
              />
            </div>

            <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 p-2 rounded font-bold transition">
              පන්තිය පද්ධතියට එක් කරන්න
            </button>
          </form>
        </div>

        {/* 02. ඔන්ලයින් විභාග Push කරන කොටස */}
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
          <h2 className="text-xl font-semibold mb-4 text-emerald-400">02. සජීවී විභාගයක් සාදා Push කිරීම</h2>
          <form onSubmit={handleCreateAndPushExam} className="space-y-4">
            <div>
              <label className="block mb-1 text-sm">විභාගයේ සක්‍රීය සජීවී පන්තිය</label>
              <select
                className="w-full p-2 rounded bg-gray-700 border border-gray-600 text-white font-bold"
                value={activeLiveId || ''}
                onChange={(e) => setActiveLiveId(e.target.value || null)}
              >
                <option value="">සක්‍රීය පන්තියක් තෝරන්න...</option>
                {scheduledClasses
                  .filter((c) => c.status === 'active')
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title} ({c.class_type})
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="block mb-1 text-sm">විභාගයේ නම/මාතෘකාව</label>
              <input
                type="text"
                className="w-full p-2 rounded bg-gray-700 border border-gray-600 text-white"
                value={examTitle}
                onChange={(e) => setExamTitle(e.target.value)}
                placeholder="उदा: MCQ Paper 01"
              />
            </div>

            <div>
              <label className="block mb-1 text-sm">Google Drive PDF Embed/Preview Link</label>
              <input
                type="url"
                className="w-full p-2 rounded bg-gray-700 border border-gray-600 text-white"
                value={pdfUrl}
                onChange={(e) => setPdfUrl(e.target.value)}
                placeholder="https://drive.google.com/file/d/.../preview"
              />
            </div>

            <div className="grid grid-cols-4 gap-2">
              <div>
                <label className="block mb-1 text-xs">ප්‍රශ්න ගණන</label>
                <input
                  type="number"
                  className="w-full p-2 rounded bg-gray-700 border border-gray-600 text-white"
                  value={totalQuestions}
                  onChange={(e) => setTotalQuestions(Number(e.target.value))}
                />
              </div>
              <div>
                <label className="block mb-1 text-xs">කාලය (පැය)</label>
                <input
                  type="number"
                  className="w-full p-2 rounded bg-gray-700 border border-gray-600 text-white"
                  value={durationHours}
                  onChange={(e) => setDurationHours(Number(e.target.value))}
                />
              </div>
              <div>
                <label className="block mb-1 text-xs">විනාඩි</label>
                <input
                  type="number"
                  className="w-full p-2 rounded bg-gray-700 border border-gray-600 text-white"
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value))}
                />
              </div>
              <div>
                <label className="block mb-1 text-xs">තත්පර</label>
                <input
                  type="number"
                  className="w-full p-2 rounded bg-gray-700 border border-gray-600 text-white"
                  value={durationSeconds}
                  onChange={(e) => setDurationSeconds(Number(e.target.value))}
                />
              </div>
            </div>

            {/* MCQ Answer Marker Matrix */}
            <div className="bg-gray-900 p-3 rounded border border-gray-700 max-h-48 overflow-y-auto">
              <p className="text-xs text-gray-400 mb-2">පිළිතුරු පත්‍රය ලකුණු කරන්න (ප්‍රශ්න 1-{totalQuestions}):</p>
              {Array.from({ length: totalQuestions }).map((_, index) => {
                const qNum = index + 1;
                return (
                  <div key={qNum} className="flex items-center space-x-3 mb-2 text-sm">
                    <span className="w-8 font-bold text-gray-400">Q{qNum}.</span>
                    {[1, 2, 3, 4, 5].map((opt) => (
                      <label key={opt} className="flex items-center space-x-1 cursor-pointer">
                        <input
                          type="radio"
                          name={`q-${qNum}`}
                          checked={correctAnswers[qNum] === opt}
                          onChange={() => handleAnswerChange(qNum, opt)}
                          className="text-emerald-500 focus:ring-0"
                        />
                        <span>{opt}</span>
                      </label>
                    ))}
                  </div>
                );
              })}
            </div>

            <button
              type="submit"
              disabled={!activeLiveId}
              className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-600 disabled:cursor-not-allowed p-2 rounded font-bold transition"
            >
              විභාගය සාදා සජීවීව සිසුන්ට Push කරන්න
            </button>
          </form>
        </div>
      </div>

      {/* දැනට පවතින පන්ති ලැයිස්තුව සහ පාලනය */}
      <div className="mt-8 bg-gray-800 p-6 rounded-lg shadow-lg">
        <h2 className="text-xl font-semibold mb-4 text-purple-400">පන්ති කළමනාකරණය (Live Room Monitor)</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-700 text-gray-400 text-sm">
                <th className="p-2">පන්තිය</th>
                <th className="p-2">දිනය & වේලාව</th>
                <th className="p-2">කාණ්ඩය</th>
                <th className="p-2">තත්ත්වය</th>
                <th className="p-2">ක්‍රියාමාර්ග</th>
              </tr>
            </thead>
            <tbody>
              {scheduledClasses.map((c) => (
                <tr key={c.id} className="border-b border-gray-700 hover:bg-gray-750">
                  <td className="p-2 font-medium">{c.title}</td>
                  <td className="p-2 text-sm">
                    {c.date} | {c.time}
                  </td>
                  <td className="p-2 text-sm">{c.class_type}</td>
                  <td className="p-2">
                    <span
                      className={`px-2 py-1 rounded text-xs font-bold ${
                        c.status === 'active'
                          ? 'bg-green-500/20 text-green-400'
                          : c.status === 'completed'
                          ? 'bg-gray-500/20 text-gray-400'
                          : 'bg-yellow-500/20 text-yellow-400'
                      }`}
                    >
                      {c.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="p-2">
                    <button
                      onClick={() => toggleLiveStatus(c.id, c.status)}
                      className={`text-xs px-3 py-1 rounded font-bold transition ${
                        c.status === 'active' ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'
                      }`}
                    >
                      {c.status === 'active' ? 'End Class' : 'Start Live'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}