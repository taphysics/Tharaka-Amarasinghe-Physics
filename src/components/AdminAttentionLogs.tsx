import React, { useState } from 'react';
import { Eye, BellDot, Video } from 'lucide-react';
import { useSupabaseSync } from '../hooks/useSupabaseSync';
import { supabase } from '../supabaseClient';

export default function AdminAttentionLogs({ scheduledLives }: { scheduledLives: any[] }) {
  const [logs] = useSupabaseSync<any>('announcements', []); // Attention logs saved as announcements
  const [selectedLive, setSelectedLive] = useState<string>('');

  const attentionLogs = logs.filter(l => l.type === 'attention_log');

  const getLogsForLive = (liveId: string) => {
    return attentionLogs.filter(l => {
       try {
         const config = JSON.parse(l.content);
         return config.liveId === liveId;
       } catch { return false; }
    });
  };

  const currentLogs = getLogsForLive(selectedLive || 'live'); // Fallback to 'live' if general dashboard recording

  return (
    <div className="bg-slate-900/60 p-6 rounded-2xl border border-slate-700 mt-6 shadow-xl">
      <div className="flex justify-between items-center mb-6 border-b border-slate-800 pb-4">
         <h4 className="font-bold text-amber-400 flex items-center gap-2 text-lg">
           <Eye size={20} /> Real-time Attention Logs
         </h4>
         <div className="flex gap-2">
            <select
              value={selectedLive}
              onChange={(e) => setSelectedLive(e.target.value)}
              className="bg-slate-950 border border-slate-800 text-slate-300 rounded-lg px-3 py-1.5 focus:outline-none focus:border-amber-500 text-sm"
            >
              <option value="live">Current Live Session</option>
              {scheduledLives.map(l => (
                <option key={l.id} value={l.id}>{l.title} - {l.date}</option>
              ))}
            </select>
         </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
         {/* Attentive Students */}
         <div className="space-y-3 p-4 bg-emerald-900/10 border border-emerald-500/20 rounded-xl">
            <h5 className="font-bold text-emerald-400 border-b border-emerald-500/30 pb-2">
              Marked as Attentive <span className="text-xs bg-emerald-500 text-black px-2 rounded-full ml-2">{currentLogs.length}</span>
            </h5>
            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
               {currentLogs.map((log) => {
                 let markedAt = log.date;
                 try{ markedAt = JSON.parse(log.content).markedAt } catch(e){}
                 return (
                   <div key={log.id} className="flex justify-between items-center text-xs bg-slate-950 p-2.5 rounded border border-slate-800">
                     <span className="text-slate-300 font-bold">{log.target_user}</span>
                     <span className="text-slate-500 font-mono">{new Date(markedAt).toLocaleTimeString()}</span>
                   </div>
                 );
               })}
               {currentLogs.length === 0 && <div className="text-slate-500 text-xs italic py-4 text-center">No logs found.</div>}
            </div>
         </div>

         {/* Warning alerts instructions */}
         <div className="space-y-3 p-4 bg-red-900/10 border border-red-500/20 rounded-xl">
            <h5 className="font-bold text-red-400 border-b border-red-500/30 pb-2 flex items-center gap-1.5">
               <BellDot size={14} /> Attention Alert Broadcasting
            </h5>
            <p className="text-xs text-slate-300 mb-4 leading-relaxed">
               වීඩියෝව නරඹමින් සිටින නමුත් ඇටෙන්ශන් මාක් නොකළ සිසුන්ට වෝනින් මැසේජ් එකක් යැවීමට පහත බොත්තම භාවිතා කරන්න.
            </p>
            <button 
              onClick={async () => {
                 if(window.confirm("සජීවීව සිටින සියලුම සිසුන් වෙත Universal Warning Ping එකක් යැවීමට අවශ්‍යද?")) {
                    await supabase.from('announcements').insert([{
                      title: '⚠️ WARNING PING',
                      content: 'ඔබේ අවධානය වීඩියෝව වෙත පවතින බව තහවුරු කරන්න! (Please mark your attention!)',
                      type: 'public',
                      date: new Date().toISOString().split('T')[0]
                    }]);
                    alert("Universal Warning Ping Sent!");
                 }
              }}
              className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-3 rounded-xl shadow-lg border border-red-500 transition active:scale-95 text-sm"
            >
              Send Universal Warning Ping
            </button>
            <p className="text-[10px] text-slate-500 mt-2 text-center">
               This broadcasts a realtime signal to browsers.
            </p>
         </div>
      </div>
    </div>
  );
}
