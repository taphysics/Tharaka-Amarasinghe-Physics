import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Search, X, Plus, MessageCircle, Bell, CheckCircle } from 'lucide-react';

export default function PaymentManager() {
  const [students, setStudents] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [allClasses, setAllClasses] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedYear, setSelectedYear] = useState('2026');
  
  // Modal States
  const [activeModal, setActiveModal] = useState<{ student: any, month: string } | null>(null);
  const [showClassDropdown, setShowClassDropdown] = useState<string | null>(null);

  const months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
  const monthsNames = ['ජනවාරි', 'පෙබරවාරි', 'මාර්තු', 'අප්‍රේල්', 'මැයි', 'ජූනි', 'ජූලි', 'අගෝස්තු', 'සැප්තැම්බර්', 'ඔක්තෝබර්', 'නොවැම්බර්', 'දෙසැම්බර්'];

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    // 1. සිසුන්ගේ දත්ත
    const { data: stdData } = await supabase.from('students').select('*').order('name');
    if (stdData) setStudents(stdData);

    // 2. ගෙවීම් දත්ත
    const { data: payData } = await supabase.from('payments').select('*');
    if (payData) setPayments(payData);

    // 3. පවතින සියලුම පන්ති වර්ග (Site Config එකෙන් හෝ වෙනම) ලබා ගැනීම
    const { data: config } = await supabase.from('site_config').select('class_rates_text').eq('id', 1).single();
    if (config?.class_rates_text) {
      const classes = config.class_rates_text.split(',').map((c: string) => c.split(':')[0].trim()).filter(Boolean);
      setAllClasses(classes);
    }
  };

  // 🔄 ගෙවීම් යාවත්කාලීන කිරීම (Update Payment Status)
  const handlePaymentStatusChange = async (studentId: string, monthKey: string, className: string, status: string) => {
    const recordId = `${studentId}_${monthKey}_${className}`;
    
    // UI එක එසැණින් Update කිරීම (Optimistic Update)
    setPayments(prev => {
      const exists = prev.find(p => p.record_id === recordId);
      if (exists) return prev.map(p => p.record_id === recordId ? { ...p, status } : p);
      return [...prev, { record_id: recordId, student_id: studentId, month: monthKey, class_name: className, status }];
    });

    // Database එක Update කිරීම
    await supabase.from('payments').upsert({
      record_id: recordId,
      student_id: studentId,
      month: monthKey,
      class_name: className,
      status: status
    }, { onConflict: 'record_id' });
  };

  // ➕ පන්ති එකතු කිරීම සහ ඉවත් කිරීම
  const updateStudentClasses = async (studentId: string, newClasses: string[]) => {
    setStudents(prev => prev.map(s => s.id === studentId ? { ...s, class_types: newClasses } : s));
    await supabase.from('students').update({ class_types: newClasses }).eq('id', studentId);
  };

  // 🎨 බොත්තම් වල වර්ණ සෑදීම (Fractional Gradients)
  const getMonthButtonStyle = (student: any, monthKey: string) => {
    const studentClasses = student.class_types || [];
    if (studentClasses.length === 0) return { backgroundColor: '#1e293b' }; // No classes

    const colors = studentClasses.map((cName: string) => {
      const recordId = `${student.id}_${monthKey}_${cName}`;
      const payment = payments.find(p => p.record_id === recordId);
      const status = payment ? payment.status : 'unpaid';
      
      if (status === 'paid') return '#10b981'; // Green
      if (status === 'free') return '#3b82f6'; // Blue
      return '#ef4444'; // Red
    });

    if (colors.length === 1) return { backgroundColor: colors[0] };

    // පන්ති කිහිපයක් ඇත්නම් Gradient එකක් සෑදීම
    const percentage = 100 / colors.length;
    const gradientStops = colors.map((col: string, i: number) => `${col} ${i * percentage}%, ${col} ${(i + 1) * percentage}%`).join(', ');
    return { background: `linear-gradient(to right, ${gradientStops})` };
  };

  // 📱 WhatsApp මැසේජ් යැවීම
  const sendWhatsApp = (student: any, monthKey: string, specificClass: string | null = null) => {
    const baseUrl = window.location.origin; // e.g., https://tharaka-amarasinghe-physics.vercel.app
    const monthName = monthsNames[parseInt(monthKey.split('-')[1]) - 1];
    
    let link = `${baseUrl}/invoice?s=${student.id}&m=${monthKey}`;
    let message = `ආයුබෝවන් ${student.name},\n\nඔබගේ ${monthName} මාසය සඳහා පන්ති ගාස්තු ගෙවීම් බිල්පත පහත ලින්ක් එකෙන් ලබා ගන්න:\n`;

    if (specificClass) {
      link += `&c=${encodeURIComponent(specificClass)}`;
      message = `ආයුබෝවන් ${student.name},\n\nඔබගේ ${monthName} මාසයේ [${specificClass}] පන්තිය සඳහා ගාස්තු ගෙවීම් බිල්පත පහත ලින්ක් එකෙන් ලබා ගන්න:\n`;
    }

    message += `\n🔗 Link: ${link}\n\nස්තූතියි!`;
    const whatsappUrl = `https://wa.me/94${student.whatsapp?.substring(1)}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  };

  const filteredStudents = students.filter(s => 
    s.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    s.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.nic?.includes(searchTerm)
  );

  return (
    <div className="p-4 md:p-8 space-y-6">
      
      {/* Search Bar */}
      <div className="flex gap-4 items-center bg-slate-900 p-4 rounded-2xl border border-slate-800">
        <Search className="text-slate-500" />
        <input 
          type="text" 
          placeholder="නම, Username හෝ NIC..." 
          className="bg-transparent text-white outline-none w-full"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Student List */}
      <div className="space-y-4">
        {filteredStudents.map(student => (
          <div key={student.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col xl:flex-row gap-6">
            
            {/* Student Info Area */}
            <div className="xl:w-1/3 space-y-3">
              <div>
                <h3 className="text-white font-bold text-lg">{student.name}</h3>
                <div className="flex gap-3 text-xs font-mono mt-1">
                  <span className="text-blue-400">@{student.username}</span>
                  <span className="text-slate-500">NIC: {student.nic}</span>
                </div>
              </div>

              {/* Class Tags Management */}
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 relative">
                <span className="text-xs text-slate-500 block mb-2">ලියාපදිංචි පන්ති:</span>
                <div className="flex flex-wrap gap-2">
                  {(student.class_types || []).map((cls: string) => (
                    <span key={cls} className="bg-slate-800 text-slate-300 text-[11px] px-2 py-1 rounded-md flex items-center gap-1 border border-slate-700">
                      {cls}
                      <button onClick={() => updateStudentClasses(student.id, student.class_types.filter((c:string) => c !== cls))} className="hover:text-red-400"><X size={12}/></button>
                    </span>
                  ))}
                  
                  {/* Add Class Button */}
                  <button 
                    onClick={() => setShowClassDropdown(showClassDropdown === student.id ? null : student.id)}
                    className="bg-blue-600/20 text-blue-400 text-[11px] px-2 py-1 rounded-md flex items-center gap-1 hover:bg-blue-600/40 border border-blue-500/30"
                  >
                    <Plus size={12}/> ඇතුලත් කරන්න
                  </button>
                </div>

                {/* Dropdown for new classes */}
                {showClassDropdown === student.id && (
                  <div className="absolute top-full left-0 mt-2 w-full bg-slate-800 border border-slate-700 rounded-xl shadow-2xl z-10 p-2 flex flex-col gap-1">
                    {allClasses.filter(c => !(student.class_types || []).includes(c)).length === 0 ? (
                      <span className="text-xs text-slate-400 p-2">සියලුම පන්ති තෝරා ඇත.</span>
                    ) : (
                      allClasses.filter(c => !(student.class_types || []).includes(c)).map(c => (
                        <button 
                          key={c}
                          onClick={() => {
                            updateStudentClasses(student.id, [...(student.class_types || []), c]);
                            setShowClassDropdown(null);
                          }}
                          className="text-left text-xs text-slate-200 hover:bg-slate-700 p-2 rounded-lg"
                        >
                          + {c}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Months Grid */}
            <div className="xl:w-2/3 grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {months.map((m, idx) => {
                const monthKey = `${selectedYear}-${m}`;
                return (
                  <button
                    key={m}
                    onClick={() => setActiveModal({ student, month: monthKey })}
                    style={getMonthButtonStyle(student, monthKey)}
                    className="h-10 rounded-xl text-xs font-bold text-white shadow-lg transition-transform hover:scale-105 active:scale-95 flex items-center justify-center opacity-90 hover:opacity-100"
                  >
                    {monthsNames[idx]}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* 🎛️ Payment Control Modal */}
      {activeModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setActiveModal(null)}>
          <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-md p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6 border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-white font-bold text-lg">{activeModal.student.name}</h3>
                <p className="text-slate-400 text-xs">{activeModal.month} මාසයේ ගෙවීම් පාලනය</p>
              </div>
              <button onClick={() => setActiveModal(null)} className="text-slate-500 hover:text-white"><X /></button>
            </div>

            <div className="space-y-5 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
              {(activeModal.student.class_types || []).map((className: string) => {
                const recordId = `${activeModal.student.id}_${activeModal.month}_${className}`;
                const status = payments.find(p => p.record_id === recordId)?.status || 'unpaid';

                return (
                  <div key={className} className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-bold text-slate-200">{className}</span>
                    </div>
                    
                    {/* Status Buttons */}
                    <div className="grid grid-cols-3 gap-2">
                      <button onClick={() => handlePaymentStatusChange(activeModal.student.id, activeModal.month, className, 'paid')} className={`py-1.5 rounded-lg text-xs font-bold transition-all ${status === 'paid' ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>Paid</button>
                      <button onClick={() => handlePaymentStatusChange(activeModal.student.id, activeModal.month, className, 'free')} className={`py-1.5 rounded-lg text-xs font-bold transition-all ${status === 'free' ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>Free</button>
                      <button onClick={() => handlePaymentStatusChange(activeModal.student.id, activeModal.month, className, 'unpaid')} className={`py-1.5 rounded-lg text-xs font-bold transition-all ${status === 'unpaid' ? 'bg-red-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>Unpaid</button>
                    </div>

                    {/* Individual WhatsApp Button */}
                    <button onClick={() => sendWhatsApp(activeModal.student, activeModal.month, className)} className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg flex items-center justify-center gap-2 border border-slate-700">
                      <MessageCircle size={14} className="text-green-400"/> මෙම පන්තියට පමණක් බිල්පත යවන්න
                    </button>
                  </div>
                );
              })}

              {/* Global Buttons (Only visible if enrolled in more than 1 class) */}
              {(activeModal.student.class_types || []).length > 1 && (
                <div className="mt-6 pt-4 border-t border-slate-800 space-y-2">
                  <span className="text-xs text-slate-500 mb-2 block text-center">සියලුම පන්ති සඳහා පොදු ක්‍රියාමාර්ග</span>
                  <button onClick={() => sendWhatsApp(activeModal.student, activeModal.month, null)} className="w-full py-2.5 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 font-bold text-xs rounded-xl flex items-center justify-center gap-2 border border-blue-500/30">
                    <Bell size={16} /> සියලුම පන්ති වල එකතුව සහිතව බිල්පත යවන්න
                  </button>
                </div>
              )}
              
              {(activeModal.student.class_types || []).length === 0 && (
                <div className="text-center py-6 text-slate-500 text-xs">
                  මෙම සිසුවා කිසිදු පන්තියක් සඳහා ලියාපදිංචි වී නොමැත.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}