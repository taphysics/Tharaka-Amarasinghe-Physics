import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { UserCheck, Trash2, Send, CheckCircle, Search, Clock, Save, Lock, AlertTriangle, KeyRound, Copy, Check } from 'lucide-react'; // KeyRound, Copy, Check අලුතින් එක් කරන ලදී

// --- නව කොටස: Password Reset Button Component ---
// මෙය එක් එක් සිසුවා සඳහා වෙන් වෙන්ව ක්‍රියා කරයි
function PasswordResetSection({ studentId, studentPhone }: { studentId: string, studentPhone: string }) {
  const [resetLink, setResetLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  const generateResetLink = async () => {
    setLoading(true);
    const token = crypto.randomUUID(); 
    const expires = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(); 

    const { error } = await supabase
      .from('students')
      .update({ reset_token: token, reset_expires: expires })
      .eq('id', studentId);

    if (!error) {
      const link = `${window.location.origin}/reset-password?token=${token}`;
      setResetLink(link);
    } else {
      alert("Error generating link!");
    }
    setLoading(false);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(resetLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // WhatsApp අංකය නිවැරදි ෆෝමැට් එකට හැරවීම
  let formattedPhone = studentPhone ? studentPhone.toString().trim() : '';
  if (formattedPhone.startsWith('0')) {
    formattedPhone = '94' + formattedPhone.substring(1);
  }

  return (
    <div className="mt-2 pt-2 border-t border-slate-800/50">
      {!resetLink ? (
        <button 
          onClick={generateResetLink}
          disabled={loading}
          className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-bold bg-blue-900/30 text-blue-400 hover:bg-blue-800/50 border border-blue-500/20 transition-all w-full"
        >
          <KeyRound size={12} />
          {loading ? 'Generating...' : 'Password Reset ලින්ක් එක සාදන්න'}
        </button>
      ) : (
        <div className="space-y-2 bg-slate-950/50 p-2 rounded-lg border border-slate-800">
          <input 
            type="text" 
            readOnly 
            value={resetLink} 
            className="w-full bg-slate-900 text-slate-400 text-[9px] p-1.5 rounded border border-slate-700 outline-none"
          />
          <div className="flex gap-2">
            <button onClick={copyToClipboard} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white text-[10px] p-1.5 rounded flex items-center justify-center gap-1 transition">
              {copied ? <Check size={10} /> : <Copy size={10} />} {copied ? 'Copied' : 'Copy'}
            </button>
            <a 
              href={`https://wa.me/${formattedPhone}?text=ඔබගේ Password එක මාරු කිරීම සඳහා මෙම ලින්ක් එක මත ක්ලික් කරන්න (මෙය එක් වරක් පමණක් ක්‍රියා කරයි): ${resetLink}`}
              target="_blank"
              rel="noreferrer"
              className="flex-1 bg-[#25D366] hover:bg-[#1DA851] text-white text-[10px] p-1.5 rounded flex items-center justify-center gap-1 transition"
            >
              <Send size={10} /> Send WA
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
// ------------------------------------------------

export default function AdminRegistryTable({ students, setStudents }: { students: any[], setStudents: any }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPending, setSelectedPending] = useState<string[]>([]);
  const [selectedActive, setSelectedActive] = useState<string[]>([]);
  const [reminderUserIds, setReminderUserIds] = useState('');
  const [reminderFees, setReminderFees] = useState('');
  const [reminderTotal, setReminderTotal] = useState('');
  const [reminderMonth, setReminderMonth] = useState('May');

  const [localSentIds, setLocalSentIds] = useState<string[]>([]);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'N/A';
    const fixedStr = dateStr.includes(' ') && !dateStr.includes('T') ? dateStr.replace(' ', 'T') : dateStr;
    const d = new Date(fixedStr);
    return isNaN(d.getTime()) ? 'Invalid Date' : d.toLocaleString();
  };

  const filteredStudents = students.filter(s =>
    s.nic?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.whatsapp?.includes(searchTerm) ||
    s.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.username?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const pendingStudents = filteredStudents.filter(s => !s.is_approved && !s.isApproved);
  const activeStudents = filteredStudents.filter(s => s.is_approved || s.isApproved);

  const handleActivate = async (idsToActivate: string[]) => {
    if (!idsToActivate || idsToActivate.length === 0) return;
    if (!confirm(`මෙම සිසුන් ${idsToActivate.length} දෙනාගේ ගිණුම් සක්‍රීය (Activate) කිරීමට අවශ්‍යද?`)) return;

    try {
      const successfulUpdates: any[] = []; 

      for (const id of idsToActivate) {
        const student = students.find(s => s.id === id);
        if (!student) continue;

        const safeName = student.name || 'Student';
        const nameParts = safeName.split(' ');
        const firstChar = (nameParts[0] || 'S').charAt(0).toUpperCase();
        const lastChar = (nameParts[nameParts.length - 1] || 'T').charAt(0).toUpperCase();

        const randomNum = Math.floor(1000 + Math.random() * 9000);
        const username = `${firstChar}${lastChar}${randomNum}`;
        const password = student.nic || student.whatsapp || username; 

        const { error } = await supabase
          .from('students')
          .update({
            is_approved: true,
            is_paid: true,
            username: username,
            password: password
          })
          .eq('id', id);

        if (error) {
          console.error(`Error activating student ${id}:`, error.message);
          alert(`සිසුවා (ID: ${id}) සක්‍රීය කිරීමේදී දෝෂයක්: ` + error.message);
        } else {
          successfulUpdates.push({ id, username, password });
        }
      }

      setStudents((prev: any) => 
        prev.map((student: any) => {
          const updatedInfo = successfulUpdates.find(u => u.id === student.id);
          if (updatedInfo) {
            return { 
              ...student, 
              is_approved: true, 
              is_paid: true, 
              username: updatedInfo.username, 
              password: updatedInfo.password 
            };
          }
          return student;
        })
      );

      setSelectedPending([]); 
      if (successfulUpdates.length > 0) {
         alert(`සාර්ථකව සිසුන් ${successfulUpdates.length}ක් ඇක්ටිව් කරන ලදී!`);
      }

    } catch (err) {
      console.error("Activation crashed:", err);
      alert("පද්ධතියේ දෝෂයක් මතු විය. කරුණාකර නැවත උත්සාහ කරන්න.");
    }
  };

  const handleSendWhatsApp = async (student: any) => {
    const message = `ආයුබෝවන් ${student.name},\n\nඔබගේ PHYSICS ONLINE HUB ගිණුම සාර්ථකව Active කර ඇත.\n\nවෙබ් අඩවියට ලොග් වීම සඳහා පහත තොරතුරු භාවිතා කරන්න:\n\n- Website: https://tharaka-amarasinghe-physics.vercel.app\n- Username: ${student.username}\n- Password: ${student.password}\n\nස්තූතියි!`;

    let formattedPhone = student.whatsapp ? student.whatsapp.toString().trim() : '';
    if (formattedPhone.startsWith('0')) {
      formattedPhone = '94' + formattedPhone.substring(1);
    }

    if (!formattedPhone) {
      alert('මෙම සිසුවාට WhatsApp අංකයක් ඇතුලත් කර නැත!');
      return;
    }

    setLocalSentIds(prev => [...prev, student.id]);

    const { error } = await supabase
      .from('students')
      .update({ credentials_sent: true })
      .eq('id', student.id);

    if (error) {
      console.error('Database update error:', error.message);
    }

    const whatsappUrl = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  };

  const handleDeletePending = async (ids: string[]) => {
    if (!ids || ids.length === 0) return;
    if (!confirm(`මෙම පෙන්ඩින් දත්ත ${ids.length}ක් මැකීමට අවශ්‍යද?`)) return;
    for (const id of ids) {
      await supabase.from('students').delete().eq('id', id);
    }
    setStudents((prev: any) => prev.filter((s: any) => !ids.includes(s.id)));
    setSelectedPending([]);
  };

  const handleDeleteActive = async (ids: string[]) => {
    if (!ids || ids.length === 0) return;
    const pass = prompt('ඇඩ්මින් මුරපදය ඇතුලත් කරන්න (Admin Password Required):');
    if (pass !== 'admin123') { alert('මුරපදය වැරදියි!'); return; }
    if (!confirm(`මෙම ක්‍රියාකාරී ගිණුම් ${ids.length}ක් මැකීමට අවශ්‍යද?`)) return;
    
    for (const id of ids) {
      await supabase.from('students').delete().eq('id', id);
    }
    setStudents((prev: any) => prev.filter((s: any) => !ids.includes(s.id)));
    setSelectedActive([]);
  };

  const toggleSelectAll = (isPending: boolean) => {
    if (isPending) {
      setSelectedPending(prev => prev.length === pendingStudents.length ? [] : pendingStudents.map(s => s.id));
    } else {
      setSelectedActive(prev => prev.length === activeStudents.length ? [] : activeStudents.map(s => s.id));
    }
  };

  const toggleSelection = (id: string, isPending: boolean) => {
    if (isPending) {
      setSelectedPending(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    } else {
      setSelectedActive(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-800/40 border border-slate-700/50 rounded-3xl p-4 md:p-6 shadow-xl backdrop-blur-sm">
        <label htmlFor="searchStudent" className="text-xs text-slate-400 font-bold mb-2 block flex items-center gap-2">
          <Search size={14}/> NIC හෝ WhatsApp අංකයෙන් සොයන්න
        </label>
        <input
          id="searchStudent"
          name="searchStudent"
          type="text"
          placeholder="e.g. 200...V or 071..."
          className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          aria-label="Search students by NIC or WhatsApp"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Pending Box */}
        <div className="bg-amber-900/10 border border-amber-800/30 rounded-3xl p-4 md:p-6 shadow-xl backdrop-blur-sm flex flex-col h-[500px]">
          <div className="border-b border-amber-800/50 pb-3 flex justify-between items-center shrink-0">
            <h3 className="text-md font-bold text-white flex items-center gap-1.5 font-display">
              <Clock size={16} className="text-amber-400" /> Pending Registrations ({pendingStudents.length})
            </h3>
            <div className="flex gap-2">
              <button onClick={() => toggleSelectAll(true)} className="text-[10px] text-slate-400 hover:text-white px-2 cursor-pointer border border-slate-700 rounded-md">All</button>
              {selectedPending.length > 0 && (
                <>
                  <button onClick={() => handleActivate(selectedPending)} className="text-[10px] bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-2 py-1 rounded-md cursor-pointer transition">Activate</button>
                  <button onClick={() => handleDeletePending(selectedPending)} className="text-[10px] bg-red-600 hover:bg-red-500 text-white font-bold px-2 py-1 rounded-md cursor-pointer transition"><Trash2 size={12}/></button>
                </>
              )}
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto pr-2 space-y-3 mt-3 scrollbar-thin scrollbar-thumb-slate-700">
            {pendingStudents.map(st => (
              <div key={st.id} className="bg-slate-950/40 p-3 flex gap-3 border border-slate-800/50 rounded-xl">
                 <div className="mt-1 flex items-start">
                   <label htmlFor={`pending-${st.id}`} className="sr-only">Select {st.name} for activation</label>
                   <input 
                     type="checkbox" 
                     id={`pending-${st.id}`} 
                     name={`pending-${st.id}`} 
                     checked={selectedPending.includes(st.id)} 
                     onChange={() => toggleSelection(st.id, true)} 
                     className="cursor-pointer mt-0.5" 
                     aria-label={`Select pending student ${st.name}`}
                   />
                 </div>
                 <div className="flex-1 space-y-1">
                    <div className="font-bold text-amber-100 text-sm">{st.name}</div>
                    <div className="text-[10px] text-slate-400 flex flex-wrap gap-x-3 gap-y-1">
                      <span><b className="text-slate-300">NIC:</b> {st.nic}</span>
                      <span><b className="text-slate-300">WA:</b> {st.whatsapp}</span>
                      <span><b className="text-slate-300">Mobile:</b> {st.mobile}</span>
                      <span><b className="text-slate-300">Class:</b> {st.class_types?.join(', ')}</span>
                    </div>
                 </div>
              </div>
            ))}
            {pendingStudents.length === 0 && <div className="text-xs text-slate-500 text-center py-10">No pending requests</div>}
          </div>
        </div>

        {/* Active Box */}
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-3xl p-4 md:p-6 shadow-xl backdrop-blur-sm flex flex-col h-[500px]">
          <div className="border-b border-slate-800 pb-3 flex justify-between items-center shrink-0">
            <h3 className="text-md font-bold text-white flex items-center gap-1.5 font-display">
              <UserCheck size={16} className="text-emerald-400" /> Active Students ({activeStudents.length})
            </h3>
            <div className="flex gap-2">
              <button onClick={() => toggleSelectAll(false)} className="text-[10px] text-slate-400 hover:text-white px-2 cursor-pointer border border-slate-700 rounded-md">All</button>
              {selectedActive.length > 0 && (
                <button onClick={() => handleDeleteActive(selectedActive)} className="text-[10px] bg-red-600 hover:bg-red-500 text-white font-bold px-2 py-1 rounded-md cursor-pointer transition flex items-center gap-1"><Lock size={12}/> Delete</button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto pr-2 space-y-3 mt-3 scrollbar-thin scrollbar-thumb-slate-700">
            {activeStudents.map(st => {
              const isAlreadySent = st.credentials_sent === true || localSentIds.includes(st.id);

              return (
                <div key={st.id} className="bg-slate-900/60 p-3 flex flex-col border border-slate-800/80 rounded-xl group hover:border-emerald-500/30 transition">
                   <div className="flex gap-3">
                     <div className="mt-1 flex items-start">
                       <label htmlFor={`active-${st.id}`} className="sr-only">Select {st.name} for management</label>
                       <input 
                         type="checkbox" 
                         id={`active-${st.id}`} 
                         name={`active-${st.id}`} 
                         checked={selectedActive.includes(st.id)} 
                         onChange={() => toggleSelection(st.id, false)} 
                         className="cursor-pointer mt-0.5" 
                         aria-label={`Select active student ${st.name}`}
                       />
                     </div>
                     <div className="flex-1 space-y-1">
                        <div className="flex justify-between items-start">
                          <div className="font-bold text-emerald-100 text-sm flex items-center gap-2">
                            {st.name} <span className="bg-slate-950 text-blue-400 px-2 py-0.5 rounded text-[10px] border border-blue-500/20">{st.username}</span>
                          </div>
                          <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${st.isPaid || st.is_paid ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-500'}`}>
                            {st.isPaid || st.is_paid ? 'PAID' : 'UNPAID'}
                          </span>
                        </div>
                        <div className="text-[9px] text-slate-400 flex flex-wrap gap-x-3 gap-y-1 mt-1 font-mono">
                          <span><b className="text-slate-300">PW:</b> {st.password}</span>
                          <span><b className="text-slate-300">NIC:</b> {st.nic}</span>
                          <span><b className="text-slate-300">WA:</b> {st.whatsapp}</span>
                        </div>
                     </div>
                   </div>

                   {/* WhatsApp Button කොටස */}
                   <div className="mt-3 pt-2 border-t border-slate-800/50 flex justify-end">
                      <button
                        onClick={() => handleSendWhatsApp(st)}
                        disabled={isAlreadySent}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-bold transition-all ${
                          isAlreadySent 
                            ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/50' 
                            : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                        }`}
                      >
                        <Send size={12} />
                        {isAlreadySent ? 'Credentials Sent ✓' : 'Send Credentials via WA'}
                      </button>
                   </div>

                   {/* --- නව කොටස: Password Reset Section එක මෙතනට ඇතුලත් කර ඇත --- */}
                   <PasswordResetSection studentId={st.id} studentPhone={st.whatsapp} />

                </div>
              );
            })}
            {activeStudents.length === 0 && <div className="text-xs text-slate-500 text-center py-10">No active students found</div>}
          </div>
        </div>
      </div>

      {/* Reminder Box කොටස (වෙනස් කර නැත) */}
      <div className="bg-slate-800/40 border border-slate-700/50 rounded-3xl p-4 md:p-6 shadow-xl backdrop-blur-sm mt-6 flex flex-col xl:flex-row gap-6">
        <div className="flex-1 bg-slate-900/40 border border-slate-800 p-4 rounded-2xl flex flex-col gap-3">
          <h3 className="text-sm font-bold text-white flex items-center gap-1.5"><Send size={14} className="text-blue-400" /> Send WhatsApp Reminder</h3>
          
          <div>
            <label htmlFor="reminderUserIds" className="text-[11px] text-slate-400 font-bold mb-1 block">Student User IDs</label>
            <input
              id="reminderUserIds"
              name="reminderUserIds"
              type="text"
              placeholder="User IDs (e.g. NUAM2507, SAMA1234)"
              value={reminderUserIds}
              onChange={(e) => setReminderUserIds(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition"
              aria-label="Enter Student User IDs"
            />
          </div>

          <div>
            <label htmlFor="reminderFees" className="text-[11px] text-slate-400 font-bold mb-1 block">Class Fee Breakdown</label>
            <input
              id="reminderFees"
              name="reminderFees"
              type="text"
              placeholder="Class Fee (e.g. Physics 2026: 2500)"
              value={reminderFees}
              onChange={(e) => setReminderFees(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition"
              aria-label="Enter Class Fee Breakdown"
            />
          </div>

          <div>
            <label htmlFor="reminderTotal" className="text-[11px] text-slate-400 font-bold mb-1 block">Total Amount Due</label>
            <input
              id="reminderTotal"
              name="reminderTotal"
              type="number"
              placeholder="Total Amount (e.g. 4500)"
              value={reminderTotal}
              onChange={(e) => setReminderTotal(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition"
              aria-label="Enter Total Amount Due"
            />
          </div>

          <div>
            <label htmlFor="reminderMonth" className="text-[11px] text-slate-400 font-bold mb-1 block">Select Month</label>
            <select
              id="reminderMonth"
              name="reminderMonth"
              value={reminderMonth}
              onChange={(e) => setReminderMonth(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-blue-500 transition"
              aria-label="Select the payment month"
            >
              {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          <button onClick={() => {
            if(!reminderUserIds) return;
            alert(`Message Ready to Send!`);
          }} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 rounded-xl transition mt-2 text-xs">
            Generate & Send Notifications
          </button>
        </div>
      </div>
    </div>
  );
}