import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { CreditCard, QrCode, CheckCircle, ShieldCheck, Maximize2, X, AlertCircle } from 'lucide-react';

export default function StudentPaymentInvoice() {
  const [loading, setLoading] = useState(true);
  const [student, setStudent] = useState<any>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [ratesMap, setRatesMap] = useState<{ [key: string]: number }>({});
  const [classesWithFees, setClassesWithFees] = useState<any[]>([]);
  const [grandTotal, setGrandTotal] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<'bank' | 'qr'>('bank');
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [monthText, setMonthText] = useState('');

  const monthsMap: { [key: string]: string } = {
    '01': 'ජනවාරි', '02': 'පෙබරවාරි', '03': 'මාර්තු', '04': 'අප්‍රේල්',
    '05': 'මැයි', '06': 'ජූනි', '07': 'ජූලි', '08': 'අගෝස්තු',
    '09': 'සැප්තැම්බර්', '10': 'ඔක්තෝබර්', '11': 'නොවැම්බර්', '12': 'දෙසැම්බර්'
  };

  const parseStudentClasses = (classTypes: any): string[] => {
    if (!classTypes) return [];
    if (Array.isArray(classTypes)) return classTypes.map(c => c.trim());
    try {
      const parsed = JSON.parse(classTypes);
      if (Array.isArray(parsed)) return parsed.map((c: any) => String(c).trim());
      return [];
    } catch (e) {
      return typeof classTypes === 'string' ? classTypes.split(',').map(c => c.trim()) : [];
    }
  };

  // 1. මුලින්ම දත්ත Fetch කරගැනීම
  useEffect(() => {
    const fetchInvoiceData = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const studentId = urlParams.get('s');
      const monthKey = urlParams.get('m'); 

      if (!studentId || !monthKey) {
        setLoading(false);
        return;
      }

      const [year, monthPart] = monthKey.split('-');
      setMonthText(`${year} ${monthsMap[monthPart] || ''}`);

      // ශිෂ්‍යයාගේ තොරතුරු ලබා ගැනීම
      const { data: studentData } = await supabase
        .from('students')
        .select('id, name, nic, username, class_types')
        .eq('id', studentId)
        .single();

      // පන්ති වල මිල ගණන් (Config) ලබා ගැනීම
      const { data: configData } = await supabase
        .from('site_config')
        .select('class_rates_text')
        .eq('id', 1)
        .single();

      // FIXED: payments ටේබල් එකෙන් මෙම සිසුවාගේ අදාළ මාසයේ දැනට පවතින පේමන්ට් තත්ත්වයන් ලබා ගැනීම
      const { data: paymentsData } = await supabase
        .from('payments')
        .select('*')
        .eq('student_id', studentId)
        .eq('month', monthKey);

      if (paymentsData) setPayments(paymentsData);

      if (studentData && configData?.class_rates_text) {
        setStudent(studentData);

        const tempRatesMap: { [key: string]: number } = {};
        try {
          const parsedConfig = JSON.parse(configData.class_rates_text);
          if (parsedConfig && Array.isArray(parsedConfig.classes)) {
            parsedConfig.classes.forEach((c: any) => {
              if (c.name && c.fee !== undefined) {
                tempRatesMap[c.name.trim()] = Number(c.fee);
              }
            });
          }
        } catch (error) {
          configData.class_rates_text.split(',').forEach((item: string) => {
            const parts = item.split(':');
            if (parts.length >= 2) {
              const className = parts[0].trim();
              const classFee = parseInt(parts[1].trim());
              if (className && !isNaN(classFee)) {
                tempRatesMap[className] = classFee;
              }
            }
          });
        }
        setRatesMap(tempRatesMap);
      }
      setLoading(false);
    };

    fetchInvoiceData();
  }, []);

  // 2. FIXED & OPTIMIZED: Realtime සබඳතාවය සැකසීම (ඇඩ්මින් වෙනස් කල සැනින් බිල වෙනස් වේ)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const studentId = urlParams.get('s');
    const monthKey = urlParams.get('m');

    if (!studentId || !monthKey) return;

    // ඇඩ්මින් පැනල් එකෙන් එවන Broadcast ලයිව් සිග්නල් වලට සවන් දීම
    const channel = supabase.channel(`student_dashboard_${studentId}`);

    channel
      .on('broadcast', { event: 'payment_updated' }, (payload: any) => {
        const { monthKey: msgMonth, className, status } = payload.payload;
        if (msgMonth === monthKey) {
          setPayments(prev => {
            const recordId = `${studentId}_${monthKey}_${className}`;
            const exists = prev.find(p => p.record_id === recordId);
            if (exists) {
              return prev.map(p => p.record_id === recordId ? { ...p, status } : p);
            }
            // FIXED: class_type ලෙස නව රෙකෝඩය එකතු කිරීම
            return [...prev, { record_id: recordId, student_id: studentId, month: monthKey, class_type: className, status }];
          });
        }
      })
      .on('broadcast', { event: 'student_classes_updated' }, (payload: any) => {
        const { newClasses } = payload.payload;
        setStudent((prev: any) => prev ? { ...prev, class_types: newClasses } : prev);
      })
      .subscribe();

    // Database එකට සෘජුවම සිදුවන වෙනස්කම් (Postgres Changes) වලටද සවන් දීම (වැඩි ආරක්ෂාවට)
    const dbSubscription = supabase
      .channel('payments-invoice-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'payments',
        filter: `student_id=eq.${studentId}`
      }, (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const newRecord = payload.new;
          if (newRecord.month === monthKey) {
            setPayments(prev => {
              const exists = prev.find(p => p.record_id === newRecord.record_id);
              if (exists) {
                return prev.map(p => p.record_id === newRecord.record_id ? newRecord : p);
              }
              return [...prev, newRecord];
            });
          }
        } else if (payload.eventType === 'DELETE') {
          const oldRecord = payload.old;
          setPayments(prev => prev.filter(p => p.record_id !== oldRecord.record_id));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(dbSubscription);
    };
  }, []);

  // 3. ශිෂ්‍යයා, පේමන්ට්ස් හෝ මිල ගණන් වෙනස් වන විට බිල්පත නැවත ගණනය කිරීම
  useEffect(() => {
    if (!student || !ratesMap) return;

    const urlParams = new URLSearchParams(window.location.search);
    const rawSpecificClass = urlParams.get('c');
    const specificClass = rawSpecificClass ? decodeURIComponent(rawSpecificClass).trim() : null;

    let activeClasses: string[] = parseStudentClasses(student.class_types);
    
    if (specificClass) {
      activeClasses = activeClasses.filter(c => c === specificClass);
    }

    let total = 0;
    const calculatedClasses = activeClasses.map(cName => {
      // FIXED: class_name වෙනුවට අපේ නව class_type එකෙන් රෙකෝඩ් එක සෙවීම
      const paymentInfo = payments.find(p => p.class_type === cName);
      const status = paymentInfo?.status || 'unpaid';
      
      const originalFee = ratesMap[cName] || 0;
      let finalFee = originalFee;

      // Paid හෝ Free නම් සිසුවාගෙන් එම පන්තියට මුදල් අය නොකෙරේ (0 වේ)
      if (status === 'paid' || status === 'free') {
        finalFee = 0;
      }

      total += finalFee;
      return { name: cName, originalFee, finalFee, status };
    });

    setClassesWithFees(calculatedClasses);
    setGrandTotal(total);
  }, [student, payments, ratesMap]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 text-xs font-mono">
        බිල්පත් පද්ධතිය සක්‍රීය වෙමින් පවතී...
      </div>
    );
  }

  if (!student) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-red-500/20 p-6 rounded-2xl max-w-sm text-center">
          <div className="text-red-400 font-bold text-sm">වලංගු නොවන සබැඳියකි (Invalid Link)</div>
          <p className="text-slate-400 text-xs mt-2">මෙම බිල්පත විවෘත කිරීමට ඔබට අවසර නැත. කරුණාකර නිවැරදි ලින්ක් එක භාවිතා කරන්න.</p>
        </div>
      </div>
    );
  }

  const isAllPaid = classesWithFees.length > 0 && classesWithFees.every(c => c.status === 'paid' || c.status === 'free');

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-10 px-4 flex items-center justify-center">
      <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-6 md:p-8 space-y-6">
        
        {/* 🏛️ Header */}
        <div className="text-center space-y-1 border-b border-slate-800 pb-4">
          <h2 className="text-lg font-bold text-blue-400">පන්ති ගාස්තු නිල බිල්පත</h2>
          <p className="text-slate-400 text-xs font-medium font-mono">{monthText} මාසය සඳහා</p>
        </div>

        {/* 👤 ශිෂ්‍ය විස්තර */}
        <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800/60 space-y-2 text-xs">
          <div className="flex justify-between"><span className="text-slate-500">සිසුවාගේ นම:</span> <span className="font-bold text-white">{student.name}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">NIC අංකය:</span> <span className="font-mono text-slate-300">{student.nic || 'N/A'}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">පරිශීලක නාමය:</span> <span className="font-mono text-blue-400">@{student.username}</span></div>
        </div>

        {/* 💳 බිඳුණු විස්තර සහ මුළු එකතුව */}
        <div className="space-y-2">
          <span className="text-xs text-slate-400 font-bold block">අයදුම් කළ පන්ති සහ ගාස්තු තත්ත්වය:</span>
          <div className="bg-slate-950/40 border border-slate-800 rounded-2xl p-4 divide-y divide-slate-800/60">
            {classesWithFees.map((c, idx) => (
              <div key={idx} className="flex justify-between items-center py-2.5 text-xs">
                <div className="flex flex-col gap-0.5">
                  <span className="text-slate-300 font-medium">{c.name}</span>
                  {c.status === 'paid' && <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1"><CheckCircle size={11} className="fill-emerald-500/10"/> ගෙවා ඇත (Paid)</span>}
                  {c.status === 'free' && <span className="text-[10px] text-blue-400 font-bold flex items-center gap-1"><CheckCircle size={11} className="fill-blue-500/10"/> නොමිලේ (Free Card)</span>}
                  {c.status === 'unpaid' && <span className="text-[10px] text-red-400 font-bold flex items-center gap-1"><AlertCircle size={11} className="fill-red-500/10"/> ගෙවීමට ඇත (Unpaid)</span>}
                </div>
                <div className="text-right font-mono">
                  {c.status === 'unpaid' ? (
                    <span className="text-slate-200 font-semibold">රු. {c.originalFee}/=</span>
                  ) : (
                    <div className="flex flex-col items-end">
                      <span className="text-slate-600 line-through text-[11px]">රු. {c.originalFee}/=</span>
                      <span className="text-emerald-400 font-bold text-xs">රු. 0/=</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
            
            <div className="flex justify-between pt-3 text-sm font-bold border-t border-slate-800">
              <span className="text-slate-300">ගෙවිය යුතු මුළු මුදල:</span>
              <span className={`font-mono ${grandTotal === 0 ? 'text-emerald-400' : 'text-amber-400'}`}>රු. {grandTotal}/=</span>
            </div>
          </div>
        </div>

        {/* 🏆 සියල්ල ගෙවා ඇත්නම් පෙන්වන ලස්සන Success බැනරය */}
        {isAllPaid ? (
          <div className="bg-emerald-500/10 border border-emerald-500/20 p-5 rounded-2xl text-center space-y-2 animate-fade-in">
            <CheckCircle className="text-emerald-400 mx-auto" size={32} />
            <h4 className="text-emerald-400 font-bold text-sm">මෙම මාසය සඳහා සියලුම ගෙවීම් සම්පූර්ණයි!</h4>
            <p className="text-slate-400 text-xs">ඔබ මෙම මාසය සඳහා පන්ති ගාස්තු සාර්ථකව ගෙවා අවසන් කර ඇත. ස්තූතියි!</p>
          </div>
        ) : (
          <>
            {/* 🔄 පේමන්ට් මෙතඩ් තේරීම (ගෙවීමට ඇත්නම් පමණක් පෙන්වයි) */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setPaymentMethod('bank')}
                className={`p-3 rounded-2xl border transition-all flex flex-col items-center gap-1.5 cursor-pointer ${
                  paymentMethod === 'bank' ? 'bg-blue-600/10 border-blue-500 text-blue-400' : 'bg-slate-950 border-slate-800 text-slate-500'
                }`}
              >
                <CreditCard size={18} />
                <span className="text-xs font-bold">Bank Deposit</span>
              </button>
              <button
                onClick={() => setPaymentMethod('qr')}
                className={`p-3 rounded-2xl border transition-all flex flex-col items-center gap-1.5 cursor-pointer ${
                  paymentMethod === 'qr' ? 'bg-blue-600/10 border-blue-500 text-blue-400' : 'bg-slate-950 border-slate-800 text-slate-500'
                }`}
              >
                <QrCode size={18} />
                <span className="text-xs font-bold">QR Payment</span>
              </button>
            </div>

            {/* 🏦 Method 01: Direct Bank Transfer */}
            {paymentMethod === 'bank' && (
              <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 space-y-4 animate-fade-in">
                <div className="flex items-center justify-between border-b border-slate-800/60 pb-3">
                  <span className="text-xs text-slate-400 font-bold">බැංකු ගිණුම් විස්තර:</span>
                  <img src="/Peoples-bank-logo.jpg" alt="People's Bank" className="h-6 w-auto object-contain rounded-sm" />
                </div>
                <div className="space-y-3 text-xs font-mono">
                  <div className="bg-slate-900/50 p-2.5 rounded-xl border border-slate-800/40 flex justify-between items-center">
                    <div><span className="text-[10px] text-slate-500 block font-sans">Account Number</span><span className="text-sm font-bold text-white select-all">015200130036285</span></div>
                  </div>
                  <div className="bg-slate-900/50 p-2.5 rounded-xl border border-slate-800/40">
                    <span className="text-[10px] text-slate-500 block font-sans">Account Name</span><span className="text-white font-sans text-xs font-medium">S K S Tharaka Amarasinghe</span>
                  </div>
                  <div className="bg-slate-900/50 p-2.5 rounded-xl border border-slate-800/40">
                    <span className="text-[10px] text-slate-500 block font-sans">Bank & Branch</span><span className="text-slate-300 font-sans text-xs">People's Bank - Ampara</span>
                  </div>
                </div>
              </div>
            )}

            {/* 📱 Method 02: QR Payment */}
            {paymentMethod === 'qr' && (
              <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 text-center space-y-3 animate-fade-in">
                <span className="text-xs text-slate-400 font-bold block text-left">LankaQR හෝ ඕනෑම බැංකු ඇප් එකකින් ස්කෑන් කරන්න:</span>
                <div className="relative inline-block bg-white p-3 rounded-2xl border border-slate-800 mx-auto group">
                  <img 
                    src="/qr-payment.png" 
                    alt="QR Payment" 
                    className="w-40 h-40 object-contain cursor-zoom-in"
                    onClick={() => setIsQrModalOpen(true)}
                  />
                  <div 
                    onClick={() => setIsQrModalOpen(true)}
                    className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-[10px] transition rounded-2xl cursor-pointer"
                  >
                    <Maximize2 size={16} />
                  </div>
                </div>
                <p className="text-[10px] text-slate-500 italic">QR කේතය විශාල කර ගැනීමට ඒ මත ක්ලික් කරන්න.</p>
              </div>
            )}
          </>
        )}

        {/* 🔒 Security Footer */}
        <div className="flex items-center justify-center gap-1.5 text-[10px] text-slate-500 bg-slate-950/40 py-2 rounded-xl border border-slate-800/40">
          <ShieldCheck size={12} className="text-emerald-500" />
          <span>මෙය පද්ධතිය විසින් ස්වයංක්‍රීයව උත්පාදනය කරන ලද නිල බිල්පතකි.</span>
        </div>

      </div>

      {/* 🔍 Fullscreen QR Modal view */}
      {isQrModalOpen && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={() => setIsQrModalOpen(false)}>
          <button className="absolute top-4 right-4 text-slate-400 hover:text-white p-2" onClick={() => setIsQrModalOpen(false)}>
            <X size={24} />
          </button>
          <div className="bg-white p-4 rounded-3xl max-w-sm w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <img src="/qr-payment.png" alt="QR Large" className="w-full h-auto object-contain rounded-xl" />
            <div className="text-center text-slate-900 font-bold text-xs mt-3 font-sans">Scan & Pay</div>
          </div>
        </div>
      )}
    </div>
  );
}