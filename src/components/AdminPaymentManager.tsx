import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { Bell, MessageSquare, Check, X, AlertTriangle } from 'lucide-react';

export default function AdminPaymentManager() {
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<any[]>([]);
  const [availableClasses, setAvailableClasses] = useState<string[]>([]);
  const [paymentRecords, setPaymentRecords] = useState<any>({}); // Sync records by studentId_month
  const [activePopup, setActivePopup] = useState<{ studentId: string; monthId: string } | null>(null);
  
  const popupRef = useRef<HTMLDivElement>(null);
  const currentYear = "2026";

  const months = [
    { id: '01', name: 'ජනවාරි' }, { id: '02', name: 'පෙබරවාරි' }, { id: '03', name: 'මාර්තු' },
    { id: '04', name: 'අප්‍රේල්' }, { id: '05', name: 'මැයි' }, { id: '06', name: 'ජූනි' },
    { id: '07', name: 'ජූලි' }, { id: '08', name: 'අගෝස්තු' }, { id: '09', name: 'සැප්තැම්බර්' },
    { id: '10', name: 'ඔක්තෝබර්' }, { id: '11', name: 'නොවැම්බර්' }, { id: '12', name: 'දෙසැම්බර්' }
  ];

  useEffect(() => {
    fetchInitialData();

    // Click outside to close implementation
    function handleClickOutside(event: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
        setActivePopup(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Students
      const { data: studentData } = await supabase
        .from('students')
        .select('id, name, nic, username, class_types, whatsapp');
      
      // 2. Fetch Config and Parse JSON Safely
      const { data: configData } = await supabase
        .from('site_config')
        .select('class_rates_text')
        .eq('id', 1)
        .single();

      // 3. Fetch all 2026 payment records to map state
      const { data: payData } = await supabase
        .from('payments')
        .select('*');

      if (configData?.class_rates_text) {
        try {
          // JSON එකක් නම් parse කරයි, නැතහොත් කොමා වලින් වෙන් කර ඇත්නම් ඒ අනුව සකසයි
          if (configData.class_rates_text.trim().startsWith('{') || configData.class_rates_text.trim().startsWith('[')) {
            const parsed = JSON.parse(configData.class_rates_text);
            const classes = parsed.classes?.map((c: any) => c.name) || Object.keys(parsed);
            setAvailableClasses(classes);
          } else {
            const classes = configData.class_rates_text.split(',').map((item: string) => item.split(':')[0].trim());
            setAvailableClasses(classes);
          }
        } catch (e) {
          console.error("Error parsing class_rates_text JSON:", e);
        }
      }

      if (studentData) setStudents(studentData);
      
      // Map payment rows into a fast lookup dictionary: mapping `studentId_month`
      const lookup: any = {};
      payData?.forEach(row => {
        lookup[`${row.student_id}_${row.month}`] = row;
      });
      setPaymentRecords(lookup);

    } catch (error) {
      console.error(error);
    }
    setLoading(false);
  };

  // Update payment status dynamically
  const updatePaymentStatus = async (studentId: string, monthId: string, newStatus: 'paid' | 'free' | 'unpaid') => {
    const monthKey = `${currentYear}-${monthId}`;
    const lookupKey = `${studentId}_${monthKey}`;
    const currentRecord = paymentRecords[lookupKey] || {};

    const updatedRow = {
      student_id: studentId,
      month: monthKey,
      status: newStatus,
      reminder_sent: currentRecord.reminder_sent || false,
      whatsapp_count: currentRecord.whatsapp_count || 0
    };

    const { error } = await supabase
      .from('payments')
      .upsert(updatedRow, { onConflict: 'student_id,month' });

    if (!error) {
      setPaymentRecords({ ...paymentRecords, [lookupKey]: updatedRow });
    }
  };

  // Push Payment Reminder
  const pushReminder = async (studentId: string, monthId: string) => {
    const monthKey = `${currentYear}-${monthId}`;
    const lookupKey = `${studentId}_${monthKey}`;
    const currentRecord = paymentRecords[lookupKey] || { status: 'unpaid', whatsapp_count: 0 };

    const updatedRow = {
      ...currentRecord,
      student_id: studentId,
      month: monthKey,
      reminder_sent: true
    };

    const { error } = await supabase
      .from('payments')
      .upsert(updatedRow, { onConflict: 'student_id,month' });

    if (!error) {
      setPaymentRecords({ ...paymentRecords, [lookupKey]: updatedRow });
    }
  };

  // Increment WhatsApp Pushed Counter
  const pushWhatsAppMessage = async (studentId: string, monthId: string, whatsappNum: string) => {
    const monthKey = `${currentYear}-${monthId}`;
    const lookupKey = `${studentId}_${monthKey}`;
    const currentRecord = paymentRecords[lookupKey] || { status: 'unpaid', reminder_sent: false, whatsapp_count: 0 };

    const updatedRow = {
      ...currentRecord,
      student_id: studentId,
      month: monthKey,
      whatsapp_count: (currentRecord.whatsapp_count || 0) + 1
    };

    // Open WhatsApp API Link with Invoice parameters
    const invoiceLink = `${window.location.origin}/invoice?s=${studentId}&m=${monthKey}`;
    const textMessage = `හෙලෝ, ඔබගේ ${currentYear} ${months.find(m => m.id === monthId)?.name} මාසය සඳහා පන්ති ගාස්තු ගෙවීමට පහත ලින්ක් එක භාවිතා කරන්න: ${invoiceLink}`;
    window.open(`https://wa.me/${whatsappNum}?text=${encodeURIComponent(textMessage)}`, '_blank');

    const { error } = await supabase
      .from('payments')
      .upsert(updatedRow, { onConflict: 'student_id,month' });

    if (!error) {
      setPaymentRecords({ ...paymentRecords, [lookupKey]: updatedRow });
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-xs font-mono text-slate-400">දත්ත පද්ධති යාවත්කාලීන වෙමින් පවතී...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 relative">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-xl font-bold text-blue-400">මාසික පන්ති කාඩ්පත් සහ ගෙවීම් පාලනය ({currentYear})</h1>
          <p className="text-xs text-slate-500">සිසුන්ගේ මාසික දත්ත සහ පන්ති ගාස්තු කළමනාකරණය මෙතැනින් සිදු කරන්න.</p>
        </div>

        <div className="space-y-4">
          {students.map((student) => (
            <div key={student.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 grid grid-cols-1 md:grid-cols-3 gap-6 items-center relative">
              
              {/* 👤 Student Summary */}
              <div className="space-y-2">
                <div>
                  <h3 className="font-bold text-white text-sm">{student.name}</h3>
                  <div className="flex gap-2 mt-1">
                    <span className="text-[10px] bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-md font-mono">@{student.username}</span>
                    <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-md font-mono">NIC: {student.nic || 'N/A'}</span>
                  </div>
                </div>

                {/* Registered Classes Badges */}
                <div className="space-y-1">
                  <span className="text-[10px] text-slate-500 block font-bold">ලියාපදිංචි පන්ති වර්ග:</span>
                  <div className="flex flex-wrap gap-1">
                    {student.class_types && student.class_types.length > 0 ? (
                      student.class_types.map((c: string, idx: number) => (
                        <span key={idx} className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-medium">
                          {c}
                        </span>
                      ))
                    ) : (
                      <span className="text-[10px] text-amber-500 flex items-center gap-1">
                        <AlertTriangle size={12} /> පන්ති කිසිවක් ඇතුළත් කර නැත.
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* 📅 Months Grid */}
              <div className="md:col-span-2 space-y-2">
                <span className="text-[10px] text-slate-500 block font-bold">මාසික ගෙවීම් තත්ත්වය (ක්ලික් කරන්න):</span>
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
                  {months.map((m) => {
                    const mKey = `${student.id}_${currentYear}-${m.id}`;
                    const record = paymentRecords[mKey];
                    const status = record?.status || 'unpaid';
                    
                    let bgClass = "bg-slate-950 border-slate-800 text-slate-400";
                    if (status === 'paid') bgClass = "bg-emerald-600/20 border-emerald-500 text-emerald-400 font-bold";
                    if (status === 'free') bgClass = "bg-blue-600/20 border-blue-500 text-blue-400 font-bold";
                    
                    const isSelected = activePopup?.studentId === student.id && activePopup?.monthId === m.id;

                    return (
                      <div key={m.id} className="relative">
                        <button
                          onClick={() => setActivePopup({ studentId: student.id, monthId: m.id })}
                          className={`w-full text-center py-2 text-[11px] rounded-xl border transition-all cursor-pointer hover:scale-105 ${bgClass} ${isSelected ? 'ring-2 ring-blue-500' : ''}`}
                        >
                          {m.name}
                        </button>

                        {/* 🔘 Local Action Popup View */}
                        {isSelected && (
                          <div 
                            ref={popupRef}
                            className="absolute top-11 left-1/2 -translate-x-1/2 md:translate-x-0 md:left-auto md:right-0 bg-slate-900 border border-slate-700 p-4 rounded-2xl shadow-2xl z-40 w-56 space-y-3 animate-fade-in text-xs"
                          >
                            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                              <span className="font-bold text-white text-[11px]">{m.name} කළමනාකරණය</span>
                              <button onClick={() => setActivePopup(null)} className="text-slate-500 hover:text-white"><X size={14} /></button>
                            </div>

                            {/* Status Selectors */}
                            <div className="space-y-1">
                              <span className="text-[10px] text-slate-500 block">තත්ත්වය වෙනස් කරන්න:</span>
                              <div className="grid grid-cols-3 gap-1">
                                <button onClick={() => updatePaymentStatus(student.id, m.id, 'paid')} className={`py-1 rounded text-[10px] font-bold ${status === 'paid' ? 'bg-emerald-600 text-white' : 'bg-slate-950 text-slate-400'}`}>Paid</button>
                                <button onClick={() => updatePaymentStatus(student.id, m.id, 'free')} className={`py-1 rounded text-[10px] font-bold ${status === 'free' ? 'bg-blue-600 text-white' : 'bg-slate-950 text-slate-400'}`}>Free</button>
                                <button onClick={() => updatePaymentStatus(student.id, m.id, 'unpaid')} className={`py-1 rounded text-[10px] font-bold ${status === 'unpaid' ? 'bg-red-600/20 text-red-400 border border-red-500/30' : 'bg-slate-950 text-slate-400'}`}>Unpaid</button>
                              </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="space-y-1.5 pt-1">
                              <button 
                                onClick={() => pushReminder(student.id, m.id)}
                                disabled={record?.reminder_sent}
                                className={`w-full py-1.5 px-2 rounded-lg flex items-center justify-center gap-1.5 font-medium transition ${
                                  record?.reminder_sent 
                                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/50' 
                                    : 'bg-amber-600/10 hover:bg-amber-600/20 text-amber-400 border border-amber-500/20 cursor-pointer'
                                }`}
                              >
                                <Bell size={12} />
                                <span>{record?.reminder_sent ? 'Reminder Pushed' : 'Push Reminder'}</span>
                              </button>

                              <button 
                                onClick={() => pushWhatsAppMessage(student.id, m.id, student.whatsapp)}
                                className="w-full py-1.5 px-2 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-400 border border-emerald-500/20 rounded-lg flex items-center justify-center gap-1.5 font-medium cursor-pointer"
                              >
                                <MessageSquare size={12} />
                                <span>WhatsApp Message</span>
                                <span className="ml-auto bg-emerald-500 text-slate-950 text-[9px] font-bold px-1.5 py-0.2 rounded-full">
                                  {record?.whatsapp_count || 0}
                                </span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          ))}
        </div>
      </div>
    </div>
  );
}