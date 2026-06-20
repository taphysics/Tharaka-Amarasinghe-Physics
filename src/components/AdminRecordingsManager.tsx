import React, { useState, useEffect } from 'react';

import { supabase } from '../supabaseClient';

import { Video, Plus, Trash2, CheckCircle, AlertCircle, Youtube } from 'lucide-react';



interface Recording {

  id: string;

  title: string;

  youtube_id: string;

  year: string;

  month: string;

  class_type: string;

  thumbnail_url: string;

}



export default function AdminRecordingsManager() {

  const [classes, setClasses] = useState<any[]>([]);

  const [recordings, setRecordings] = useState<Recording[]>([]);

 

  // Form States

  const [title, setTitle] = useState('');

  const [youtubeLink, setYoutubeLink] = useState('');

  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);

  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());

  const [selectedMonth, setSelectedMonth] = useState(new Date().toLocaleString('default', { month: 'long' }));

 

  const [loading, setLoading] = useState(false);

  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);



  const years = ['2023', '2024', '2025', '2026', '2027', '2028'];

  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];



  useEffect(() => {

    fetchClasses();

    fetchRecordings();

  }, []);



  // class_types_config එකෙන් Active පන්ති වර්ග ලබාගැනීම

  const fetchClasses = async () => {

    // සටහන: Column එකේ නම නිවැරදිව හඳුනාගැනීමට මෙහිදී select('*') බාවිතා කර ඇත

    const { data, error } = await supabase

      .from('class_types_config')

      .select('*')

      .eq('is_active', true);

   

    if (error) {

      // මෙතනින් ඔබට Console එක බලා නිවැරදිම දෝෂය හඳුනාගත හැක (e.g. Column name mismatch)

      console.error("Supabase Full Error Details:", {

        message: error.message,

        details: error.details,

        hint: error.hint,

        code: error.code

      });

      return;

    }

   

    if (data) {

      setClasses(data);

    }

  };



  // දැනට දමා ඇති රෙකෝඩින්ස් ලබාගැනීම

  const fetchRecordings = async () => {

    const { data, error } = await supabase

      .from('recordings')

      .select('*')

      .order('created_at', { ascending: false });

     

    if (data) setRecordings(data as Recording[]);

    if (error) console.error("Error fetching recordings:", error);

  };



  const extractYouTubeID = (url: string) => {

    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;

    const match = url.match(regExp);

    return (match && match[2].length === 11) ? match[2] : null;

  };



  const handleClassToggle = (className: string) => {

    setSelectedClasses(prev =>

      prev.includes(className) ? prev.filter(c => c !== className) : [...prev, className]

    );

  };



  const handleSubmit = async (e: React.FormEvent) => {

    e.preventDefault();

    setMessage(null);



    const ytId = extractYouTubeID(youtubeLink);

    if (!ytId) {

      setMessage({ type: 'error', text: 'නිවැරදි YouTube Link එකක් ලබාදෙන්න.' });

      return;

    }



    if (selectedClasses.length === 0) {

      setMessage({ type: 'error', text: 'අවම වශයෙන් එක් පන්ති වර්ගයක් හෝ තෝරන්න.' });

      return;

    }



    setLoading(true);

    const thumbnailUrl = `https://img.youtube.com/vi/${ytId}/maxresdefault.jpg`;



    try {

      const recordsToInsert = selectedClasses.map(classType => ({

        title: title,

        youtube_id: ytId,

        year: selectedYear,

        month: selectedMonth,

        class_type: classType,

        thumbnail_url: thumbnailUrl

      }));



      const { error } = await supabase.from('recordings').insert(recordsToInsert);



      if (error) throw error;



      setMessage({ type: 'success', text: 'වීඩියෝව සාර්ථකව පද්ධතියට ඇතුලත් කරන ලදී!' });

     

      setTitle('');

      setYoutubeLink('');

      setSelectedClasses([]);

      fetchRecordings();



    } catch (error: any) {

      setMessage({ type: 'error', text: error.message || 'වීඩියෝව ඇතුලත් කිරීමේදී දෝෂයක් මතු විය.' });

    } finally {

      setLoading(false);

    }

  };



  const handleDelete = async (id: string) => {

    if (!window.confirm('මෙම වීඩියෝව පද්ධතියෙන් ඉවත් කිරීමට අවශ්‍ය බව විශ්වාසද?')) return;

   

    const { error } = await supabase.from('recordings').delete().eq('id', id);

    if (error) {

      alert('දෝෂයක් මතු විය: ' + error.message);

    } else {

      fetchRecordings();

    }

  };



  return (

    // මුළු පිටුවේම පළල හරියාකාරව ගැනීමට w-full සහ flex-1 පාවිච්චි කර ඇත

    <div className="lg:col-span-12 w-full min-h-screen bg-slate-900 flex-1 p-4 md:p-8 text-slate-200">
    <div className="max-w-7xl mx-auto space-y-8">

       

        {/* Header */}

        <div className="flex items-center gap-3 border-b border-slate-800 pb-4">

          <Video className="w-8 h-8 text-blue-500" />

          <h1 className="text-2xl font-bold text-white">Recordings Manager</h1>

        </div>



        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 w-full">

         

          {/* Add New Recording Form */}

          <div className="lg:col-span-1 bg-slate-950 p-6 rounded-2xl border border-slate-800 shadow-xl h-fit">

            <h2 className="text-lg font-semibold text-emerald-400 mb-6 flex items-center gap-2">

              <Plus size={20} /> නව වීඩියෝවක් එක් කරන්න

            </h2>



            {message && (

              <div className={`p-4 mb-6 rounded-xl flex items-start gap-3 ${message.type === 'error' ? 'bg-red-900/30 border border-red-800 text-red-300' : 'bg-emerald-900/30 border border-emerald-800 text-emerald-300'}`}>

                {message.type === 'error' ? <AlertCircle className="w-5 h-5 shrink-0" /> : <CheckCircle className="w-5 h-5 shrink-0" />}

                <p className="text-sm">{message.text}</p>

              </div>

            )}



            <form onSubmit={handleSubmit} className="space-y-5">

             

              {/* Title */}

              <div>

                <label className="block text-sm font-medium text-slate-400 mb-1">පාඩමේ මාතෘකාව (Keyword)</label>

                <input

                  type="text"

                  required

                  value={title}

                  onChange={(e) => setTitle(e.target.value)}

                  placeholder="උදා: ධාරා විද්‍යාව - Part 01"

                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"

                />

              </div>



              {/* YouTube Link */}

              <div>

                <label className="block text-sm font-medium text-slate-400 mb-1">YouTube Link එක</label>

                <div className="relative">

                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">

                    <Youtube className="h-5 w-5 text-slate-500" />

                  </div>

                  <input

                    type="url"

                    required

                    value={youtubeLink}

                    onChange={(e) => setYoutubeLink(e.target.value)}

                    placeholder="https://www.youtube.com/watch?v=..."

                    className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-10 pr-4 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"

                  />

                </div>

              </div>



              {/* Year & Month Selection */}

              <div className="grid grid-cols-2 gap-4">

                <div>

                  <label className="block text-sm font-medium text-slate-400 mb-1">අවුරුද්ද</label>

                  <select

                    value={selectedYear}

                    onChange={(e) => setSelectedYear(e.target.value)}

                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white outline-none"

                  >

                    {years.map(y => <option key={y} value={y}>{y}</option>)}

                  </select>

                </div>

                <div>

                  <label className="block text-sm font-medium text-slate-400 mb-1">මාසය</label>

                  <select

                    value={selectedMonth}

                    onChange={(e) => setSelectedMonth(e.target.value)}

                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white outline-none"

                  >

                    {months.map(m => <option key={m} value={m}>{m}</option>)}

                  </select>

                </div>

              </div>



              {/* Class Types Selection */}

              <div>

                <label className="block text-sm font-medium text-slate-400 mb-2">අදාල පන්ති වර්ග තෝරන්න</label>

                <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">

                  {classes.length === 0 ? (

                    <p className="text-xs text-amber-400 italic">පන්ති වර්ග කිසිවක් හමු නොවීය. (Supabase එක පරීක්ෂා කරන්න)</p>

                  ) : (

                    classes.map((cls, idx) => {

                      // මෙතැනදී ඔබේ Table එකේ Column නම class_types ද class_type ද යන්න ස්වයංක්‍රීයව තෝරාගනී

                      const classTypeName = cls.class_types || cls.class_type || '';

                      return (

                        <label key={idx} className="flex items-center gap-3 p-3 rounded-lg border border-slate-800 bg-slate-900/50 hover:bg-slate-800 cursor-pointer transition">

                          <input

                            type="checkbox"

                            checked={selectedClasses.includes(classTypeName)}

                            onChange={() => handleClassToggle(classTypeName)}

                            className="w-4 h-4 text-blue-500 rounded border-slate-600 bg-slate-700 focus:ring-blue-500"

                          />

                          <span className="text-sm">{classTypeName}</span>

                        </label>

                      );

                    })

                  )}

                </div>

              </div>



              <button

                type="submit"

                disabled={loading}

                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-xl transition flex items-center justify-center gap-2"

              >

                {loading ? 'වීඩියෝව එක් කරමින් පවතී...' : 'වීඩියෝව පද්ධතියට එක් කරන්න'}

              </button>

            </form>

          </div>



          {/* Existing Recordings List */}

          <div className="lg:col-span-2 bg-slate-950 p-6 rounded-2xl border border-slate-800 shadow-xl">

            <h2 className="text-lg font-semibold text-blue-400 mb-6">දැනට පද්ධතියේ ඇති වීඩියෝ</h2>

           

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[650px] overflow-y-auto pr-2 custom-scrollbar">

              {recordings.length === 0 ? (

                <div className="col-span-2 text-center py-10 text-slate-500">

                  තවමත් වීඩියෝ කිසිවක් එක් කර නොමැත.

                </div>

              ) : (

                recordings.map((rec) => (

                  <div key={rec.id} className="bg-slate-900 rounded-xl overflow-hidden border border-slate-800 flex flex-col">

                    <div className="relative aspect-video">

                      <img

                        src={rec.thumbnail_url || `https://img.youtube.com/vi/${rec.youtube_id}/mqdefault.jpg`}

                        alt={rec.title}

                        className="w-full h-full object-cover"

                      />

                      <div className="absolute top-2 right-2 bg-black/80 px-2 py-1 rounded text-xs text-emerald-400 font-bold border border-slate-700">

                        {rec.class_type}

                      </div>

                    </div>

                    <div className="p-4 flex-1 flex flex-col justify-between">

                      <div>

                        <h3 className="text-sm font-semibold text-white line-clamp-2">{rec.title}</h3>

                        <p className="text-xs text-slate-400 mt-1">{rec.year} - {rec.month}</p>

                      </div>

                      <button

                        onClick={() => handleDelete(rec.id)}

                        className="mt-4 flex items-center justify-center gap-2 w-full py-2 bg-red-950/30 hover:bg-red-900/50 text-red-400 hover:text-red-300 rounded-lg transition text-sm border border-red-900/50"

                      >

                        <Trash2 size={16} /> ඉවත් කරන්න

                      </button>

                    </div>

                  </div>

                ))

              )}

            </div>

          </div>



        </div>

      </div>

    </div>

  );

}

