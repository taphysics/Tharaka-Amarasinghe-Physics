import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { 
  CreditCard, QrCode, CheckCircle, ShieldCheck, Maximize2, X, AlertCircle, 
  Copy, Check, Send, Sparkles 
} from 'lucide-react';
import { BankAccount, fetchBankAccounts } from '../bankAccountsService';
import { submitClassJoinPayment } from '../pendingPaymentsService';
import { subscribeRealtimeEvents } from '../realtimeSync';

export default function StudentPaymentInvoice() {
  const [loading, setLoading] = useState(true);
  const [dataFetched, setDataFetched] = useState(false);
  const [student, setStudent] = useState<any>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [ratesMap, setRatesMap] = useState<{ [key: string]: number }>({});
  const [classesWithFees, setClassesWithFees] = useState<any[]>([]);
  const [grandTotal, setGrandTotal] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<'bank' | 'qr'>('bank');
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [monthText, setMonthText] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // Bank accounts from Admin Manager
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [copiedBankId, setCopiedBankId] = useState<string | null>(null);

  // Payment Receipt / Transaction ID submission
  const [transactionId, setTransactionId] = useState('');
  const [submittingReceipt, setSubmittingReceipt] = useState(false);
  const [receiptSuccess, setReceiptSuccess] = useState<string | null>(null);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [hasPendingReceipt, setHasPendingReceipt] = useState(false);

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

  // 1. Initial Data Fetching (ක්ෂණිකව සියලුම දත්ත එකවර ලබා ගැනීම)
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

      try {
        // Promise.all භාවිතයෙන් තත්පරයෙන් සියලුම දත්ත එකවර අදිනවා
        const [studentRes, ratesRes, paymentsRes, authRes] = await Promise.all([
          supabase.from('students').select('id, name, nic, username, class_types').eq('id', studentId).single(),
          supabase.from('class_types_config').select('*'), // Error එක මඟහරවා ගැනීමට select('*') භාවිතය
          supabase.from('payments').select('id, record_id, student_id, month, class_type, amount, status').eq('student_id', studentId).eq('month', monthKey),
          supabase.auth.getSession()
        ]);

        if (studentRes.data) setStudent(studentRes.data);
        if (paymentsRes.data) setPayments(paymentsRes.data);
        setIsLoggedIn(!!authRes.data?.session);

        // රු.0 එන ගැටලුව විසඳීම සඳහා වඩාත් නිවැරදි Map කිරීමක්
        if (ratesRes.data) {
          const tempRatesMap: { [key: string]: number } = {};
          ratesRes.data.forEach((c: any) => {
            if (c.class_type) {
              // amount, fee, monthly_fee ඕනෑම Column නමකට සහය දක්වයි
              const feeAmount = c.amount ?? c.monthly_fee ?? c.fee ?? c.price ?? 0;
              // Class name එක Simple අකුරුවලට හරවා ගබඩා කරයි (Miss match වීම වැළැක්වීමට)
              tempRatesMap[c.class_type.trim().toLowerCase()] = Number(feeAmount);
            }
          });
          setRatesMap(tempRatesMap);
        }

        setDataFetched(true); // දත්ත ගෙන අවසන් බව තහවුරු කිරීම

        // Fetch dynamic bank accounts from bankAccountsService
        const accounts = await fetchBankAccounts();
        setBankAccounts(accounts.filter(b => b.is_active));

        // Check if student already has a pending payment request
        try {
          const { data: pendData } = await supabase
            .from('pending_payments')
            .select('*')
            .eq('student_id', studentId)
            .eq('month', monthKey)
            .eq('status', 'pending');
          if (pendData && pendData.length > 0) {
            setHasPendingReceipt(true);
          }
        } catch (e) {}

      } catch (err) {
        console.error("Error loading invoice components:", err);
        setLoading(false);
      }
    };

    fetchInvoiceData();

    // Subscribe to bank account updates in real time
    const unsubBank = subscribeRealtimeEvents((type) => {
      if (type === 'bank_accounts_updated') {
        fetchBankAccounts().then(b => setBankAccounts(b.filter(acc => acc.is_active)));
      }
    });

    return unsubBank;
  }, []);

  // 2. REALTIME UPDATES: ඩේටාබේස් එකේ සිදුවන වෙනස්කම් ලයිව් අප්ඩේට් වීම
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const studentId = urlParams.get('s');
    const monthKey = urlParams.get('m');

    if (!studentId || !monthKey) return;

    const channel = supabase.channel(`student_dashboard_${studentId}`);
    channel
      .on('broadcast', { event: 'payment_updated' }, (payload: any) => {
        const { monthKey: msgMonth, className, status, amount } = payload.payload;
        if (msgMonth === monthKey) {
          setPayments(prev => {
            const recordId = `${studentId}_${monthKey}_${className}`;
            const exists = prev.find(p => p.class_type === className);
            if (exists) {
              return prev.map(p => p.class_type === className ? { ...p, status, amount: amount ?? p.amount } : p);
            }
            return [...prev, { record_id: recordId, student_id: studentId, month: monthKey, class_type: className, status, amount }];
          });
        }
      })
      .on('broadcast', { event: 'student_classes_updated' }, (payload: any) => {
        setStudent((prev: any) => prev ? { ...prev, class_types: payload.payload.newClasses } : prev);
      })
      .subscribe();

    const dbPaymentsSub = supabase
      .channel('realtime-payments-invoice-channel')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'payments',
        filter: `student_id=eq.${studentId}`
      }, (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const newRec = payload.new;
          if (newRec.month === monthKey) {
            setPayments(prev => {
              const exists = prev.find(p => p.class_type === newRec.class_type);
              if (exists) {
                return prev.map(p => p.class_type === newRec.class_type ? newRec : p);
              }
              return [...prev, newRec];
            });
          }
        } else if (payload.eventType === 'DELETE') {
          setPayments(prev => prev.filter(p => p.class_type !== payload.old.class_type));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(dbPaymentsSub);
    };
  }, []);

  // 3. 💳 මුදල් ගණනය කිරීමේ කොටස (Calculation Logic - Runs instantly after fetch)
  useEffect(() => {
    if (!dataFetched) return;
    if (!student) {
      setLoading(false);
      return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const rawSpecificClass = urlParams.get('c');
    const specificClass = rawSpecificClass ? decodeURIComponent(rawSpecificClass).trim() : null;

    let activeClasses: string[] = parseStudentClasses(student.class_types);
    if (specificClass) {
      activeClasses = activeClasses.filter(c => c === specificClass);
    }

    let total = 0;
    const calculatedClasses = activeClasses.map(cName => {
      const paymentInfo = payments.find(p => p.class_type === cName);
      const status = paymentInfo?.status || 'unpaid';
      
      // ✅ මෙතනදීත් Class Name එක Lowercase කරලා බලනවා නිවැරදිම ගාන ගන්න
      const configFee = ratesMap[cName.trim().toLowerCase()];
      const originalFee = configFee !== undefined ? configFee : (paymentInfo?.amount ? Number(paymentInfo.amount) : 0);
      
      let finalFee = originalFee;
      if (status === 'paid' || status === 'free') {
        finalFee = 0; 
      }

      total += finalFee;
      return { name: cName, originalFee, finalFee, status };
    });

    setClassesWithFees(calculatedClasses);
    setGrandTotal(total);
    setLoading(false); // ගණනය කර අවසන් වූ පසු පමණක් Loading ඉවත් කරයි
  }, [dataFetched, student, payments, ratesMap]);

  // Copy Bank Account Number
  const handleCopyBank = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedBankId(id);
    setTimeout(() => setCopiedBankId(null), 2000);
  };

  // Submit Payment Receipt / Transaction ID
  const handleSubmitReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transactionId.trim()) {
      setReceiptError('කරුණාකර රිසීට් පතේ Transaction ID එක ඇතුළත් කරන්න.');
      return;
    }
    if (!student) return;

    setSubmittingReceipt(true);
    setReceiptError(null);
    setReceiptSuccess(null);

    try {
      const urlParams = new URLSearchParams(window.location.search);
      const rawSpecificClass = urlParams.get('c');
      const specificClass = rawSpecificClass ? decodeURIComponent(rawSpecificClass).trim() : null;

      // Extract all class types being paid for (all unpaid classes if bundle, or specific class)
      let targetClassType = specificClass;
      if (!targetClassType) {
        const unpaidClasses = classesWithFees.filter(c => c.status === 'unpaid').map(c => c.name.trim());
        if (unpaidClasses.length > 0) {
          targetClassType = unpaidClasses.join(', ');
        } else {
          targetClassType = classesWithFees.map(c => c.name.trim()).join(', ') || 'Class Session';
        }
      }

      await submitClassJoinPayment({
        student,
        classType: targetClassType,
        amount: grandTotal,
        paymentMethod,
        transactionId: transactionId.trim(),
        month: urlParams.get('m') || undefined
      });

      setReceiptSuccess('ඔබගේ ගෙවීම් තොරතුරු සාර්ථකව යොමු කරන ලදී! ඇඩ්මින් විසින් අනුමත කළ විගස පන්තිය සක්‍රිය වේ.');
      setHasPendingReceipt(true);
      setTransactionId('');
    } catch (err: any) {
      setReceiptError('ගෙවීම් තොරතුරු යොමු කිරීමේදී දෝෂයක් මතු විය: ' + (err.message || ''));
    } finally {
      setSubmittingReceipt(false);
    }
  };

  // Navigation Function
  const handleNavigation = () => {
    if (isLoggedIn) {
      window.location.href = '/dashboard';
    } else {
      window.location.href = '/';
    }
  };

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

  // සියලුම ගෙවීම් අවසන් කර ඇත්දැයි බැලීම
  const isAllPaid = classesWithFees.length > 0 && classesWithFees.every(c => c.status === 'paid' || c.status === 'free');

  // ✅ 4. සම්පූර්ණයෙන්ම මුදල් ගෙවා ඇත්නම් පෙන්වන වෙනමම පිටුව (Full Page Success View)
  if (isAllPaid) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-emerald-500/30 p-8 rounded-3xl shadow-2xl max-w-md w-full text-center space-y-5 animate-fade-in">
          <div className="bg-emerald-500/10 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-2">
            <CheckCircle className="text-emerald-400" size={40} />
          </div>
          <h2 className="text-2xl text-emerald-400 font-bold">සාර්ථකයි!</h2>
          <p className="text-slate-300 text-sm leading-relaxed">
            ඔබ <b>{monthText}</b> මාසය සඳහා සියලුම පන්ති ගාස්තු සාර්ථකව ගෙවා අවසන් කර ඇත. ඔබට තවදුරටත් ගෙවීම් කිරීමට කිසිවක් නොමැත.
          </p>
          <button 
            onClick={handleNavigation}
            className="w-full mt-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3.5 px-4 rounded-xl transition duration-200 shadow-lg shadow-emerald-500/20"
          >
            {isLoggedIn ? 'Dashboard එකට යන්න' : 'Home Page එකට යන්න'}
          </button>
        </div>
      </div>
    );
  }

  // ගෙවා නොමැතිනම් පමණක් බිල්පත පෙන්වයි
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-10 px-4 flex items-center justify-center">
      <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-6 md:p-8 space-y-6">
        
        {/* Header */}
        <div className="text-center space-y-1 border-b border-slate-800 pb-4">
          <h2 className="text-lg font-bold text-blue-400">පන්ති ගාස්තු නිල බිල්පත</h2>
          <p className="text-slate-400 text-xs font-medium font-mono">{monthText} මාසය සඳහා</p>
        </div>

        {/* Student Details */}
        <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800/60 space-y-2 text-xs">
          <div className="flex justify-between"><span className="text-slate-500">සිසුවාගේ නම:</span> <span className="font-bold text-white">{student.name}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">NIC අංකය:</span> <span className="font-mono text-slate-300">{student.nic || 'N/A'}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">පරිශීලක නාමය:</span> <span className="font-mono text-blue-400">@{student.username}</span></div>
        </div>

        {/* Bill breakdown */}
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

        {/* Payment Method Selector */}
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

        {/* Bank Details */}
        {paymentMethod === 'bank' && (
          <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800/60 pb-3">
              <span className="text-xs text-slate-300 font-bold flex items-center gap-1.5">
                <CreditCard size={14} className="text-blue-400" /> බැංකු ගිණුම් විස්තර ({bankAccounts.length > 0 ? bankAccounts.length : 1}):
              </span>
              <span className="text-[10px] text-slate-500 font-mono">Official Accounts</span>
            </div>

            <div className="space-y-4">
              {(bankAccounts.length > 0 ? bankAccounts : [
                {
                  id: 'default_peoples',
                  bank_name: "People's Bank (මහජන බැංකුව)",
                  account_name: 'S K S Tharaka Amarasinghe',
                  account_number: '015200130036285',
                  branch: 'Ampara (අම්පාර)',
                  bank_logo: '/Peoples-bank-logo.jpg',
                  instructions: 'Online Banking හෝ CDM මඟින් තැන්පත් කළ හැක.'
                }
              ]).map((acc: any) => (
                <div key={acc.id} className="p-3.5 bg-slate-900/60 rounded-xl border border-slate-800/70 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-white flex items-center gap-2">
                      {acc.bank_name}
                    </span>
                    {acc.bank_logo && (
                      <img src={acc.bank_logo} alt={acc.bank_name} className="h-5 w-auto object-contain rounded" />
                    )}
                  </div>

                  <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800/60 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-slate-500 block">Account Number</span>
                      <span className="text-sm font-bold font-mono text-emerald-400 select-all tracking-wider">
                        {acc.account_number}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopyBank(acc.account_number, acc.id)}
                      className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-bold rounded-lg border border-slate-700 flex items-center gap-1 transition cursor-pointer"
                    >
                      {copiedBankId === acc.id ? (
                        <>
                          <Check size={12} className="text-emerald-400" /> Copied!
                        </>
                      ) : (
                        <>
                          <Copy size={12} /> Copy අංකය
                        </>
                      )}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <span className="text-slate-500 block text-[10px]">Account Name:</span>
                      <span className="text-slate-200 font-medium">{acc.account_name}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Branch:</span>
                      <span className="text-slate-300">{acc.branch}</span>
                    </div>
                  </div>

                  {acc.instructions && (
                    <p className="text-[10px] text-slate-400 bg-slate-950/40 p-2 rounded border border-slate-900">
                      ℹ️ {acc.instructions}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* QR Payment */}
        {paymentMethod === 'qr' && (
          <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 text-center space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800/60 pb-2">
              <span className="text-xs text-slate-300 font-bold">LankaQR හෝ ඕනෑම බැංකු ඇප් එකකින් ස්කෑන් කරන්න:</span>
              <span className="text-[10px] text-emerald-400 font-mono font-bold">Instant Pay</span>
            </div>
            <div className="relative inline-block bg-white p-3 rounded-2xl border border-slate-800 mx-auto group">
              <img 
                src="/qr-payment.png" 
                onError={(e) => {
                  const target = e.currentTarget as HTMLImageElement;
                  if (!target.src.endsWith('/qr-payment.PNG')) {
                    target.src = '/qr-payment.PNG';
                  }
                }}
                alt="QR Payment" 
                className="w-44 h-44 object-contain cursor-zoom-in"
                onClick={() => setIsQrModalOpen(true)}
              />
              <div 
                onClick={() => setIsQrModalOpen(true)}
                className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-[10px] transition rounded-2xl cursor-pointer"
              >
                <Maximize2 size={16} />
              </div>
            </div>
            <p className="text-[11px] text-slate-400">
              iPay, People's Wave, BOC, Commercial Q+ හෝ ඕනෑම LankaQR සහය දක්වන බැංකු ඇප් එකකින් ස්කෑන් කරන්න.
            </p>
          </div>
        )}

        {/* Receipt / Transaction ID Submission Form */}
        <div className="bg-slate-950 p-5 rounded-2xl border border-blue-500/30 space-y-3.5 shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
            <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
              <Sparkles size={14} className="text-amber-400" />
              මුදල් ගෙවූ රිසීට් පත තහවුරු කිරීම (Receipt Submission)
            </h4>
            <span className="text-[10px] font-mono text-blue-400 font-bold">Step 2</span>
          </div>

          {hasPendingReceipt && (
            <div className="p-3 bg-amber-500/15 border border-amber-500/30 rounded-xl space-y-1">
              <div className="flex items-center gap-1.5 text-amber-400 font-bold text-xs">
                <AlertCircle size={14} /> ⏳ ගෙවීම් තොරතුරු ඇඩ්මින් වෙත යොමු කර ඇත!
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                ඔබ විසින් ඉදිරිපත් කළ රිසීට් පත ඇඩ්මින් විසින් අනුමත කළ වහාම මෙම බිල්පත සහ පන්තිය ස්වයංක්‍රීයව සක්‍රිය වේ.
              </p>
            </div>
          )}

          {receiptSuccess && (
            <div className="p-3 bg-emerald-500/15 border border-emerald-500/30 rounded-xl text-emerald-400 text-xs font-bold flex items-center gap-2">
              <CheckCircle size={15} /> {receiptSuccess}
            </div>
          )}

          {receiptError && (
            <div className="p-3 bg-rose-500/15 border border-rose-500/30 rounded-xl text-rose-400 text-xs font-bold flex items-center gap-2">
              <AlertCircle size={15} /> {receiptError}
            </div>
          )}

          <form onSubmit={handleSubmitReceipt} className="space-y-3">
            <div>
              <label className="text-[11px] font-bold text-slate-300 block mb-1">
                රිසීට් පත්‍රයේ Transaction ID / Invoice අංකය *
              </label>
              <input
                type="text"
                value={transactionId}
                onChange={(e) => setTransactionId(e.target.value)}
                placeholder="උදා: TXN-94817294 / REF-12345"
                className="w-full bg-slate-900 border border-slate-700 text-white text-xs px-3.5 py-2.5 rounded-xl font-mono focus:outline-none focus:border-blue-500 placeholder:text-slate-600"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">
                ඔබ බැංකුවට හෝ online transfer මඟින් මුදල් ගෙවූ රිසීට් පතේ ඇති Reference / Transaction අංකය මෙහි ඇතුළත් කරන්න.
              </span>
            </div>

            <button
              type="submit"
              disabled={submittingReceipt || !transactionId.trim()}
              className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-lg shadow-blue-900/30 transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <Send size={14} className={submittingReceipt ? 'animate-spin' : ''} />
              {submittingReceipt ? 'යොමු වෙමින් පවතී...' : 'Submit Payment - ඔබගේ මුදල් ගෙවූ ලදුපතේ ස්ක්‍රීන්ශොට් එකක් වට්ස් ඇප් කිරීමට කාරුණික වන්න. 0779630100'}
            </button>
          </form>
        </div>

        {/* Security Footer */}
        <div className="flex items-center justify-center gap-1.5 text-[10px] text-slate-500 bg-slate-950/40 py-2 rounded-xl border border-slate-800/40">
          <ShieldCheck size={12} className="text-emerald-500" />
          <span>මෙය පද්ධතිය විසින් ස්වයංක්‍රීයව උත්පාදනය කරන ලද නිල බිල්පතකි.</span>
        </div>

      </div>

      {/* QR Modal */}
      {isQrModalOpen && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4" onClick={() => setIsQrModalOpen(false)}>
          <button className="absolute top-4 right-4 text-slate-400 hover:text-white p-2" onClick={() => setIsQrModalOpen(false)}>
            <X size={24} />
          </button>
          <div className="bg-white p-4 rounded-3xl max-w-sm w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <img 
              src="/qr-payment.png" 
              onError={(e) => {
                const target = e.currentTarget as HTMLImageElement;
                if (!target.src.endsWith('/qr-payment.PNG')) {
                  target.src = '/qr-payment.PNG';
                }
              }}
              alt="QR Large" 
              className="w-full h-auto object-contain rounded-xl" 
            />
          </div>
        </div>
      )}
    </div>
  );
}