import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { Settings2, UserX, KeyRound, Send } from 'lucide-react';

export default function AdminPasswordReset({ students }: { students: any[] }) {
  const resetRequests = students.filter(s => s.password_reset_requested);

  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');

  const handleResetPassword = async (studentId: string, whatsapp: string) => {
    if (!newPassword.trim()) {
      alert("නව මුරපදය ඇතුළත් කරන්න.");
      return;
    }

    if (window.confirm("මෙම සිසුවාට නව මුරපදය සැකසීමට අවශ්‍යද?")) {
       const { error } = await supabase.from('students').update({
          password: newPassword.trim(),
          password_reset_requested: false
       }).eq('id', studentId);

       if (error) {
         alert("මුරපදය යාවත්කාලීන කිරීමේදී ගැටළුවක් ඇති විය.");
         return;
       }
       
       // Clear form
       setSelectedStudent(null);
       setNewPassword('');

       // Construct WhatsApp notification link for the student
       const text = `ආයුබෝවන්, ඔබගේ Taraka Physics Hub ගිණුමේ මුරපදය සාර්ථකව අලුත් කරන ලදී.\n\nනව මුරපදය: ${newPassword.trim()}`;
       const encText = encodeURIComponent(text);
       let phone = whatsapp;
       if (phone.startsWith('0')) {
           phone = `94${phone.slice(1)}`; // Sri Lanka country code
       }
       const waUrl = `https://wa.me/${phone}?text=${encText}`;
       window.open(waUrl, '_blank');
    }
  };

  return (
    <div className="lg:col-span-12 bg-slate-800/40 border border-slate-700/50 rounded-3xl p-6 md:p-8 space-y-4 shadow-xl backdrop-blur-sm">
       <h3 className="text-md font-bold text-white border-b border-slate-800 pb-2 flex items-center gap-1.5 font-display font-semibold">
           <KeyRound size={16} className="text-blue-400" /> Password Reset Requests
       </h3>

       {resetRequests.length === 0 ? (
          <div className="text-center py-20 bg-slate-900/50 rounded-2xl border border-slate-800">
             <UserX size={48} className="mx-auto text-slate-700 mb-4" />
             <p className="text-slate-400 text-sm">දැනට මුරපද වෙනස් කිරීමේ ඉල්ලීම් කිසිවක් නොමැත.</p>
          </div>
       ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
             {resetRequests.map(s => (
               <div key={s.id} className="bg-slate-900/80 border border-blue-500/20 p-4 rounded-2xl space-y-3">
                  <div>
                    <h4 className="font-bold text-white text-sm">{s.username}</h4>
                    <p className="text-[10px] text-slate-400 font-mono mt-0.5">NIC: {s.nic} | WhatsApp: {s.whatsapp}</p>
                    <p className="text-[11px] text-slate-500 mt-2 line-clamp-1">{s.name}</p>
                  </div>
                  
                  {selectedStudent === s.id ? (
                    <div className="space-y-2 pt-2 border-t border-slate-800">
                       <input 
                         type="text" 
                         placeholder="New Password"
                         value={newPassword}
                         onChange={(e) => setNewPassword(e.target.value)}
                         className="w-full bg-slate-950 text-white border border-slate-700 px-3 py-1.5 rounded-lg text-xs outline-none focus:border-blue-500"
                       />
                       <div className="flex gap-2">
                         <button onClick={() => setSelectedStudent(null)} className="flex-1 bg-slate-800 text-white text-xs px-2 py-1.5 rounded-lg hover:bg-slate-700">Cancel</button>
                         <button onClick={() => handleResetPassword(s.id, s.whatsapp)} className="flex-1 bg-blue-600 text-white font-bold text-xs px-2 py-1.5 rounded-lg hover:bg-blue-500 flex items-center justify-center gap-1">Save &amp; Send <Send size={12} /></button>
                       </div>
                    </div>
                  ) : (
                    <button onClick={() => { setSelectedStudent(s.id); setNewPassword(s.nic); }} className="w-full bg-slate-800 hover:bg-slate-700 text-blue-400 text-xs font-bold py-2 rounded-lg transition border border-transparent hover:border-slate-600">
                       Process Request
                    </button>
                  )}
               </div>
             ))}
          </div>
       )}
    </div>
  );
}
