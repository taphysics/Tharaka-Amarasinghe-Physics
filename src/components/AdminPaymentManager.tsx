import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { Bell, MessageSquare, X, Search, Calendar } from 'lucide-react';

export default function AdminPaymentManager() {
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [paymentRecords, setPaymentRecords] = useState<any>({}); 
  const [activePopup, setActivePopup] = useState<{ studentId: string; monthId: string } | null>(null);
  
  const popupRef = useRef<HTMLDivElement>(null);
  const years = ["2025", "2026", "2027", "2028", "2029", "2030"];

  const months = [
    { id: '01', name: 'ජනවාරි' }, { id: '02', name: 'පෙබරවාරි' }, { id: '03', name: 'මාර්තු' },
    { id: '04', name: 'අප්‍රේල්' }, { id: '05', name: 'මැයි' }, { id: '06', name: 'ජූනි' },
    { id: '07', name: 'ජූලි' }, { id: '08', name: 'අගෝස්තු' }, { id: '09', name: 'සැප්තැම්බර්' },
    { id: '10', name: 'ඔක්තෝබර්' }, { id: '11', name: 'නොවැම්බර්' }, { id: '12', name: 'දෙසැම්බර්' }
  ];

  useEffect(() => {
    fetchInitialData();
    function handleClickOutside(event: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
        setActivePopup(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [selectedYear]);

  const fetchInitialData = async () => {
    setLoading(true);
    const { data: studentData } = await supabase.from('students').select('*');
    const { data: payData } = await supabase.from('payments').select('*').like('month', `${selectedYear}-%`);

    if (studentData) setStudents(studentData);
    
    const lookup: any = {};
    payData?.forEach(row => {
      lookup[row.record_id] = row;
    });
    setPaymentRecords(lookup);
    setLoading(false);
  };

  const updateClassStatus = async (studentId: string, monthId: string, className: string, status: string) => {
    const monthKey = `${selectedYear}-${monthId}`;
    const recordId = `${studentId}_${monthKey}_${className}`;
    const currentRecord = paymentRecords[recordId] || {};

    const updatedRow = {
      record_id: recordId,
      student_id: studentId,
      month: monthKey,
      class_name: className,
      status: status,
      reminder_sent: currentRecord.reminder_sent || false,
      whatsapp_count: currentRecord.whatsapp_count || 0
    };

    const { error } = await supabase.from('payments').upsert(updatedRow, { onConflict: 'record_id' });
    if (!error) setPaymentRecords({ ...paymentRecords, [recordId]: updatedRow });
  };

  const sendWhatsApp = async (studentId: string, monthId: string, className: string | null, whatsappNum: string) => {
    const monthKey = `${selectedYear}-${monthId}`;
    let message = '';
    let invoiceLink = `${window.location.origin}/invoice?s=${studentId}&m=${monthKey}`;

    if (className) {
      // Single Class Message
      const recordId = `${studentId}_${monthKey}_${className}`;
      invoiceLink += `&c=${encodeURIComponent(className)}`;
      message = `හෙලෝ, ඔබගේ ${selectedYear} ${months.find(m=>m.id===monthId)?.name} මාසයට අදාළ '${className}' පන්තියේ ගාස්තු ගෙවීමට පහත ලින්ක් එක භාවිතා කරන්න: ${invoiceLink}`;
      updateActionStats(recordId, studentId, monthKey, className);
    } else {
      // Combined Message
      message = `හෙලෝ, ඔබගේ ${selectedYear} ${months.find(m=>m.id===monthId)?.name} මාසය සඳහා පන්ති ගාස්තු (නොගෙවූ සියලුම පන්ති සඳහා) ගෙවීමට පහත ලින්ක් එක භාවිතා කරන්න: ${invoiceLink}`;
      // Update stats for all unpaid classes
      const student = students.find(s => s.id === studentId);
      student?.class_types?.forEach((cName: string) => {
        const rId = `${studentId}_${monthKey}_${cName}`;
        if (!paymentRecords[rId] || paymentRecords[rId].status !== 'paid' && paymentRecords[rId].status !== 'free') {
          updateActionStats(rId, studentId, monthKey, cName);
        }
      });
    }

    window.open(`https://wa.me/${whatsappNum}?text=${encodeURIComponent(message)}`, '_blank');
  };

  const updateActionStats = async (recordId: string, studentId: string, monthKey: string, className: string) => {
    const currentRecord = paymentRecords[recordId] || { status: 'unpaid', reminder_sent: false, whatsapp_count: 0 };
    const updatedRow = {
      record_id: recordId, student_id: studentId, month: monthKey, class_name: className,
      status: currentRecord.status, reminder_sent: true, whatsapp_count: (currentRecord.whatsapp_count || 0) + 1
    };
    await supabase.from('payments').upsert(updatedRow, { onConflict: 'record_id' });
    setPaymentRecords((prev: any) => ({ ...prev, [recordId]: updatedRow }));
  };

  // Filtering Students
  const filteredStudents = students.filter(s => 
    (s.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
     s.username?.toLowerCase().includes(searchQuery.toLowerCase()) || 
     s.nic?.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header & Controls */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900 p-4 rounded-2xl border border-slate-800">
          <div>
            <h1 className="text-xl font-bold text-blue-400">ගෙවීම් කළමනාකරණය</h1>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 text-slate-500" size={16} />
              <input 
                type="text" 
                placeholder="නම, Username හෝ NIC..." 
                className="pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs w-full sm:w-64 focus:border-blue-500 outline-none"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="relative">
              <Calendar className="absolute left-3 top-2.5 text-slate-500" size={16} />
              <select 
                className="pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs outline-none cursor-pointer"
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
              >
                {years.map(y => <option key={y} value={y}>{y} වර්ෂය</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Student List */}
        <div className="space-y-4">
          {filteredStudents.map((student) => (
            <div key={student.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 grid grid-cols-1 md:grid-cols-3 gap-6 relative">
              <div className="space-y-2">
                <h3 className="font-bold text-white text-sm">{student.name}</h3>
                <div className="flex gap-2"><span className="text-[10px] text-blue-400">@{student.username}</span></div>
                <div className="text-[10px] text-slate-500 mt-2">පන්ති: {student.class_types?.join(', ') || 'නැත'}</div>
              </div>

              {/* Months Grid */}
              <div className="md:col-span-2 grid grid-cols-4 sm:grid-cols-6 gap-1.5">
                {months.map((m) => {
                  const isSelected = activePopup?.studentId === student.id && activePopup?.monthId === m.id;
                  
                  // මාසයේ මුළු තත්ත්වය පරීක්ෂා කිරීම (සියලු පන්ති ගෙවා ඇත්දැයි බැලීමට)
                  let allPaid = true;
                  let anyFree = false;
                  if (student.class_types && student.class_types.length > 0) {
                    student.class_types.forEach((c: string) => {
                      const status = paymentRecords[`${student.id}_${selectedYear}-${m.id}_${c}`]?.status || 'unpaid';
                      if (status !== 'paid' && status !== 'free') allPaid = false;
                      if (status === 'free') anyFree = true;
                    });
                  } else { allPaid = false; }

                  let btnColor = "bg-slate-950 text-slate-400";
                  if (allPaid && student.class_types?.length > 0) btnColor = anyFree ? "bg-blue-600/20 text-blue-400" : "bg-emerald-600/20 text-emerald-400";

                  return (
                    <div key={m.id} className="relative">
                      <button
                        onClick={() => setActivePopup({ studentId: student.id, monthId: m.id })}
                        className={`w-full text-center py-2 text-[11px] rounded-xl border border-slate-800 transition-all ${btnColor} ${isSelected ? 'ring-2 ring-blue-500' : ''}`}
                      >
                        {m.name}
                      </button>

                      {/* Popover */}
                      {isSelected && (
                        <div ref={popupRef} className="absolute top-11 right-0 bg-slate-900 border border-slate-700 p-4 rounded-2xl shadow-2xl z-40 w-72 space-y-4 text-xs">
                          <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                            <span className="font-bold text-white">{m.name} ගෙවීම් පාලනය</span>
                            <button onClick={() => setActivePopup(null)} className="text-slate-500"><X size={14} /></button>
                          </div>

                          <div className="space-y-3 max-h-48 overflow-y-auto pr-1">
                            {student.class_types?.map((cName: string) => {
                              const rId = `${student.id}_${selectedYear}-${m.id}_${cName}`;
                              const record = paymentRecords[rId] || {};
                              const status = record.status || 'unpaid';

                              return (
                                <div key={cName} className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 space-y-2">
                                  <div className="font-bold text-[11px] text-blue-300">{cName}</div>
                                  <div className="flex gap-1">
                                    <button onClick={() => updateClassStatus(student.id, m.id, cName, 'paid')} className={`flex-1 py-1 rounded text-[10px] ${status === 'paid' ? 'bg-emerald-600 text-white' : 'bg-slate-900 text-slate-400'}`}>Paid</button>
                                    <button onClick={() => updateClassStatus(student.id, m.id, cName, 'free')} className={`flex-1 py-1 rounded text-[10px] ${status === 'free' ? 'bg-blue-600 text-white' : 'bg-slate-900 text-slate-400'}`}>Free</button>
                                    <button onClick={() => updateClassStatus(student.id, m.id, cName, 'unpaid')} className={`flex-1 py-1 rounded text-[10px] ${status === 'unpaid' ? 'bg-red-600/20 text-red-400' : 'bg-slate-900 text-slate-400'}`}>Unpaid</button>
                                  </div>
                                  
                                  {status === 'unpaid' && (
                                    <button 
                                      onClick={() => sendWhatsApp(student.id, m.id, cName, student.whatsapp)}
                                      className="w-full mt-1 py-1 bg-amber-600/10 text-amber-400 border border-amber-500/20 rounded flex justify-center items-center gap-1"
                                    >
                                      <MessageSquare size={10} /> Send Reminder ({record.whatsapp_count || 0})
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>

                          {/* Global Action for Unpaid Classes */}
                          <div className="pt-2 border-t border-slate-800">
                            <button 
                              onClick={() => sendWhatsApp(student.id, m.id, null, student.whatsapp)}
                              className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg flex items-center justify-center gap-2"
                            >
                              <Bell size={12} /> නොගෙවූ සියල්ලට පොදු පණිවිඩයක්
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}