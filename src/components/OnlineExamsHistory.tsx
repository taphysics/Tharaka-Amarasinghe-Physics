import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { Award, Calendar, CheckCircle2 } from 'lucide-react';

interface Props {
  currentStudent: any;
}

const OnlineExamsHistory: React.FC<Props> = ({ currentStudent }) => {
  const [records, setRecords] = useState<any[]>([]);

  useEffect(() => {
    fetchGradesLedger();
  }, [currentStudent]);

  const fetchGradesLedger = async () => {
    const { data } = await supabase
      .from('online_exams_submissions')
      .select(`
        id, score, total_questions, submitted_at, class_type,
        online_exams ( title, target_year, target_month )
      `)
      .eq('student_username', currentStudent.username)
      .order('submitted_at', { ascending: false });

    if (data) setRecords(data);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
        <Award className="text-amber-400" size={20} />
        <h3 className="font-extrabold text-base text-white">ඔබගේ විභාග ලකුණු පත්‍රිකා වාර්තා ලේඛනය</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {records.map((rec) => {
          const dateObj = new Date(rec.submitted_at);
          const formattedDate = `${dateObj.getFullYear()}/${dateObj.getMonth() + 1}/${dateObj.getDate()}`;
          const percentage = ((rec.score / rec.total_questions) * 100).toFixed(0);

          return (
            <div key={rec.id} className="p-5 bg-slate-900 border border-slate-800/80 rounded-2xl flex justify-between items-center shadow-lg transition hover:border-slate-700">
              <div className="space-y-2 max-w-[70%]">
                <div className="flex flex-wrap gap-1.5 items-center">
                  <span className="px-2 py-0.5 bg-slate-950 border border-slate-800 text-[9px] font-mono text-amber-400 font-bold rounded uppercase tracking-wider">{rec.class_type}</span>
                  <span className="text-[10px] font-mono text-slate-400 flex items-center gap-1">
                    <Calendar size={12} /> {rec.online_exams?.target_year}-{rec.online_exams?.target_month} ({formattedDate})
                  </span>
                </div>
                <h4 className="font-bold text-sm text-white truncate leading-snug" title={rec.online_exams?.title}>
                  {rec.online_exams?.title}
                </h4>
              </div>

              {/* Score Badge Display Ring */}
              <div className="text-right bg-slate-950 p-3 rounded-xl border border-slate-800 min-w-[80px]">
                <span className="text-[10px] font-mono text-slate-400 block uppercase tracking-wider">Marks</span>
                <span className="text-lg font-black text-emerald-400">{rec.score}</span>
                <span className="text-xs text-slate-500 font-bold font-mono">/{rec.total_questions}</span>
                <span className="text-[10px] font-mono text-slate-400 block mt-0.5 bg-slate-900 px-1 rounded font-bold text-center border border-slate-800">{percentage}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default OnlineExamsHistory;