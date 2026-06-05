import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { FileDown, Calendar, EyeOff, CheckCircle } from 'lucide-react';

interface Props {
  currentStudent: any;
  isPaid: boolean;
}

const TutsPapersManager: React.FC<Props> = ({ currentStudent, isPaid }) => {
  const [assets, setAssets] = useState<any[]>([]);
  const [downloads, setDownloads] = useState<string[]>([]);
  const [selectedYear, setSelectedYear] = useState<string>('2026');
  const [selectedMonth, setSelectedMonth] = useState<string>('06');

  useEffect(() => {
    fetchAssetsAndHistory();
  }, [selectedYear, selectedMonth]);

  const fetchAssetsAndHistory = async () => {
    const { data: assetData } = await supabase
      .from('tuts_papers')
      .select('*')
      .eq('target_year', selectedYear)
      .eq('target_month', selectedMonth);

    if (assetData) setAssets(assetData);

    const { data: downData } = await supabase
      .from('user_download_history')
      .select('tut_id')
      .eq('student_username', currentStudent.username);

    if (downData) setDownloads(downData.map(d => d.tut_id));
  };

  const handleDownloadFile = async (asset: any) => {
    if (!isPaid) return;
    
    // Mask real endpoints via pipeline trigger event
    await supabase.from('user_download_history').insert({
      student_username: currentStudent.username,
      tut_id: asset.id
    });

    setDownloads(prev => [...prev, asset.id]);
    window.open(asset.download_url, '_blank');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-4 items-center bg-slate-900/40 p-4 rounded-2xl border border-slate-800">
        <Calendar size={16} className="text-amber-500" />
        <select value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)} className="bg-slate-950 border border-slate-800 text-xs font-bold rounded-xl p-2 text-white focus:outline-none">
          <option value="2026">2026</option>
        </select>
        <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="bg-slate-950 border border-slate-800 text-xs font-bold rounded-xl p-2 text-white focus:outline-none">
          <option value="06">June</option>
          <option value="05">May</option>
        </select>
      </div>

      <div className="space-y-3">
        {assets.map((asset) => {
          const isDownloaded = downloads.includes(asset.id);
          const stateColor = isDownloaded 
            ? 'bg-slate-800 text-slate-400 border-slate-700' 
            : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';

          return (
            <div key={asset.id} className="p-4 bg-slate-900 border border-slate-800/80 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 transition hover:border-slate-700">
              <div className="flex items-center gap-3">
                <div className={`p-3 rounded-xl border ${stateColor}`}>
                  <FileDown size={20} />
                </div>
                <div>
                  <span className="text-[10px] font-mono bg-slate-950 border border-slate-800 text-amber-500 font-bold px-2 py-0.5 rounded uppercase tracking-wider">{asset.class_type}</span>
                  <h4 className="font-bold text-sm text-white mt-1.5">{asset.title}</h4>
                </div>
              </div>

              <button
                onClick={() => handleDownloadFile(asset)}
                disabled={!isPaid}
                className={`w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider shadow-md border flex items-center justify-center gap-2 transition ${
                  !isPaid 
                    ? 'bg-slate-950 border-slate-800 text-slate-600 cursor-not-allowed' 
                    : isDownloaded 
                      ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700' 
                      : 'bg-gradient-to-r from-emerald-600 to-teal-500 text-white border-emerald-500/20'
                }`}
              >
                {!isPaid ? <EyeOff size={14} /> : <FileDown size={14} />}
                {!isPaid ? 'Locked Access' : isDownloaded ? 'Download Again' : 'Get Document'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TutsPapersManager;