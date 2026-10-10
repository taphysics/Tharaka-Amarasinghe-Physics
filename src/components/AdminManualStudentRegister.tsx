import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { UserPlus, Check, Copy, CheckCircle2, AlertCircle, RefreshCw, Send, Phone } from 'lucide-react';

const SRI_LANKA_DISTRICTS = [
  'Colombo', 'Gampaha', 'Kalutara', 'Kandy', 'Matale', 'Nuwara Eliya',
  'Galle', 'Matara', 'Hambantota', 'Jaffna', 'Kilinochchi', 'Mannar',
  'Vavuniya', 'Mullaitivu', 'Batticaloa', 'Ampara', 'Trincomalee',
  'Kurunegala', 'Puttalam', 'Anuradhapura', 'Polonnaruwa', 'Badulla',
  'Monaragala', 'Ratnapura', 'Kegalle'
];

interface AdminManualStudentRegisterProps {
  onStudentRegistered?: (student: any) => void;
  availableClasses?: string[];
}

export default function AdminManualStudentRegister({ 
  onStudentRegistered,
  availableClasses = []
}: AdminManualStudentRegisterProps) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [nic, setNic] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [district, setDistrict] = useState('Colombo');
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [whatsapp, setWhatsapp] = useState('');
  const [mobile, setMobile] = useState('');
  const [isFreeToggle, setIsFreeToggle] = useState(false);
  const [freeMonths, setFreeMonths] = useState('');
  const [initialPaymentStatus, setInitialPaymentStatus] = useState<'paid' | 'free' | 'unpaid'>('paid');

  const normalizeClass = (item: any): string => {
    if (typeof item === 'string') return item;
    if (item && typeof item === 'object') return item.name || item.class_type || '';
    return String(item || '');
  };

  const [classList, setClassList] = useState<string[]>(() => {
    return (availableClasses || []).map(c => typeof c === 'string' ? c : (c as any)?.name || (c as any)?.class_type || '').filter(Boolean);
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successStudent, setSuccessStudent] = useState<any | null>(null);
  const [copiedField, setCopiedField] = useState<'user' | 'pass' | 'all' | null>(null);

  // Always load classes dynamically from database table class_types_config
  useEffect(() => {
    async function loadClasses() {
      try {
        const { data } = await supabase
          .from('class_types_config')
          .select('class_type')
          .eq('is_active', true)
          .order('class_type', { ascending: true });
        if (data && data.length > 0) {
          const names = Array.from(new Set(data.map((d: any) => d.class_type).filter(Boolean)));
          setClassList(names);
          return;
        }
      } catch (e) {
        console.warn('Error loading class_types_config:', e);
      }
      if (availableClasses && availableClasses.length > 0) {
        const normalized = availableClasses.map(c => typeof c === 'string' ? c : (c as any)?.name || (c as any)?.class_type || '').filter(Boolean);
        setClassList(Array.from(new Set(normalized)));
      } else {
        setClassList(['2026 Theory', '2026 Revision', '2027 Theory', '2027 Revision', '2027 Paper Class']);
      }
    }
    loadClasses();

    const channel = supabase
      .channel('manual_register_classes_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'class_types_config' }, () => {
        loadClasses();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [availableClasses]);

  // Auto-generate username & password when firstName or NIC changes
  const handleFirstNameChange = (val: string) => {
    setFirstName(val);
    autoSuggestCredentials(val, nic);
  };

  const handleNicChange = (val: string) => {
    setNic(val);
    autoSuggestCredentials(firstName, val);
  };

  const autoSuggestCredentials = (fName: string, idNum: string) => {
    const cleanName = fName.trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
    const cleanNic = idNum.trim();
    const nicTail = cleanNic.slice(-4);
    if (cleanName && nicTail) {
      setUsername(`${cleanName}${nicTail}`);
    } else if (cleanNic) {
      setUsername(`ST${cleanNic.slice(-4)}`);
    }
    if (cleanNic && !password) {
      setPassword(cleanNic);
    }
  };

  const toggleClass = (className: string) => {
    setSelectedClasses(prev => 
      prev.includes(className) ? prev.filter(c => c !== className) : [...prev, className]
    );
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    
    if (!firstName.trim()) {
      setErrorMessage('කරුණාකර ශිෂ්‍යයාගේ මුල් නම (First Name) ඇතුළත් කරන්න.');
      return;
    }
    if (!nic.trim()) {
      setErrorMessage('කරුණාකර ශිෂ්‍යයාගේ NIC අංකය ඇතුළත් කරන්න.');
      return;
    }
    if (selectedClasses.length === 0) {
      setErrorMessage('කරුණාකර අවම වශයෙන් එක් පන්තියක්වත් තෝරන්න.');
      return;
    }

    const finalUsername = (username.trim() || `ST${nic.trim().slice(-4)}`).toUpperCase();
    const finalPassword = password.trim() || nic.trim();
    const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

    setIsSubmitting(true);
    try {
      // 1. Check if username or NIC already exists
      const { data: existingUser } = await supabase
        .from('students')
        .select('id, username')
        .or(`username.eq.${finalUsername},nic.eq.${nic.trim()}`)
        .maybeSingle();

      if (existingUser) {
        setErrorMessage(`මෙම Username (${finalUsername}) හෝ NIC අංකය සහිත ශිෂ්‍යයෙකු දැනටමත් පද්ධතියේ ලියාපදිංචි වී ඇත.`);
        setIsSubmitting(false);
        return;
      }

      const freeMonthsArray = freeMonths
        ? freeMonths.split(',').map(m => m.trim()).filter(Boolean)
        : [currentMonth];

      const newStudentPayload = {
        username: finalUsername,
        password: finalPassword,
        name: `${firstName.trim()} ${lastName.trim()}`.trim(),
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        nic: nic.trim(),
        class_types: selectedClasses,
        district: district,
        whatsapp: whatsapp.trim() || mobile.trim(),
        WhatsApp: whatsapp.trim() || mobile.trim(),
        mobile: mobile.trim() || whatsapp.trim(),
        is_approved: true,
        plan_type: isFreeToggle || initialPaymentStatus === 'free' ? 'free' : 'paid',
        is_paid: initialPaymentStatus === 'paid',
        free_months: isFreeToggle || initialPaymentStatus === 'free' ? freeMonthsArray : [],
        active_months: initialPaymentStatus === 'paid' ? [currentMonth] : [],
        joined_at: new Date().toISOString()
      };

      const { data: insertedStudent, error: insertError } = await supabase
        .from('students')
        .insert([newStudentPayload])
        .select()
        .single();

      if (insertError) {
        throw insertError;
      }

      // 2. Insert initial payment record if marked Paid
      if (initialPaymentStatus === 'paid' && insertedStudent) {
        for (const cls of selectedClasses) {
          await supabase.from('payments').insert([{
            student_id: insertedStudent.id,
            username: finalUsername,
            month: currentMonth,
            target_month: currentMonth,
            class_type: cls,
            class_name: cls,
            status: 'paid',
            created_at: new Date().toISOString()
          }]);
        }
      }

      setSuccessStudent({
        ...insertedStudent,
        plainPassword: finalPassword
      });

      if (onStudentRegistered) {
        onStudentRegistered(insertedStudent);
      }

      // Reset form fields
      setFirstName('');
      setLastName('');
      setNic('');
      setUsername('');
      setPassword('');
      setWhatsapp('');
      setMobile('');
      setSelectedClasses([]);
      setIsFreeToggle(false);
      setFreeMonths('');

    } catch (err: any) {
      console.error('Registration error:', err);
      setErrorMessage('ශිෂ්‍යයා ලියාපදිංචි කිරීමේදී දෝෂයක් සිදුවිය: ' + (err.message || 'Unknown error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyToClipboard = (text: string, type: 'user' | 'pass' | 'all') => {
    navigator.clipboard.writeText(text);
    setCopiedField(type);
    setTimeout(() => setCopiedField(null), 2000);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 shadow-xl space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded-2xl">
            <UserPlus size={22} />
          </div>
          <div>
            <h2 className="text-lg md:text-xl font-bold text-white flex items-center gap-2">
              ශිෂ්‍ය ලියාපදිංචිය (Manual Student Registration)
            </h2>
            <p className="text-xs text-slate-400">
              ඇඩ්මින් විසින් සෘජුවම ශිෂ්‍ය ගිණුම් පද්ධතියට ඇතුළත් කිරීමේ නිල පෝරමය
            </p>
          </div>
        </div>
      </div>

      {/* Success Notification Modal / Box */}
      {successStudent && (
        <div className="p-5 bg-gradient-to-r from-emerald-950/60 via-slate-900 to-slate-900 border-2 border-emerald-500/70 rounded-3xl shadow-xl space-y-3 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 text-emerald-400 font-bold text-sm">
              <CheckCircle2 size={20} />
              <span>ශිෂ්‍යයා සාර්ථකව පද්ධතියට ලියාපදිංචි කරන ලදී!</span>
            </div>
            <button
              onClick={() => setSuccessStudent(null)}
              className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded bg-slate-800"
            >
              ✕ ඉවත් කරන්න
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-slate-950/80 rounded-2xl border border-slate-800 font-mono text-xs">
            <div className="flex items-center justify-between p-2 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-slate-400">Username:</span>
              <div className="flex items-center gap-2">
                <span className="text-blue-400 font-bold">{successStudent.username}</span>
                <button
                  onClick={() => copyToClipboard(successStudent.username, 'user')}
                  className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                  title="Copy Username"
                >
                  {copiedField === 'user' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between p-2 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-slate-400">Password:</span>
              <div className="flex items-center gap-2">
                <span className="text-emerald-400 font-bold">{successStudent.plainPassword}</span>
                <button
                  onClick={() => copyToClipboard(successStudent.plainPassword, 'pass')}
                  className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                  title="Copy Password"
                >
                  {copiedField === 'pass' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              onClick={() => {
                const message = `ආයුබෝවන් ${successStudent.name},\nඔබ Smart Physics පද්ධතියට සාර්ථකව ලියාපදිංචි කරන ලදී.\n\n🌐 Login: ${window.location.origin}\n👤 Username: ${successStudent.username}\n🔑 Password: ${successStudent.plainPassword}\n\nකරුණාකර පද්ධතියට පිවිස සජීවී පන්ති සහ රෙකෝඩින් ලබාගන්න.`;
                copyToClipboard(message, 'all');
              }}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
            >
              {copiedField === 'all' ? <Check size={14} /> : <Copy size={14} />}
              <span>WhatsApp Message එක පිටපත් කරන්න</span>
            </button>

            {successStudent.whatsapp && (
              <a
                href={`https://wa.me/${successStudent.whatsapp.startsWith('0') ? '94' + successStudent.whatsapp.slice(1) : successStudent.whatsapp}?text=${encodeURIComponent(
                  `ආයුබෝවන් ${successStudent.name},\nඔබ Smart Physics පද්ධතියට සාර්ථකව ලියාපදිංචි කරන ලදී.\n\n🌐 Login: ${window.location.origin}\n👤 Username: ${successStudent.username}\n🔑 Password: ${successStudent.plainPassword}\n\nකරුණාකර පද්ධතියට පිවිසෙන්න.`
                )}`}
                target="_blank"
                rel="noreferrer"
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
              >
                <Send size={14} />
                <span>WhatsApp මගින් එවන්න</span>
              </a>
            )}
          </div>
        </div>
      )}

      {/* Error Message */}
      {errorMessage && (
        <div className="p-4 bg-rose-950/40 border border-rose-500/50 rounded-2xl flex items-center gap-3 text-rose-300 text-xs">
          <AlertCircle size={18} className="shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleRegister} className="space-y-4">
        
        {/* Row 1: First Name & Last Name */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300">
              මුල් නම (First Name) <span className="text-rose-500">*</span>
            </label>
            <input 
              type="text" 
              required
              placeholder="e.g. Kasun"
              value={firstName}
              onChange={(e) => handleFirstNameChange(e.target.value)}
              className="w-full bg-slate-950 text-white border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300">
              වාසගම (Last Name)
            </label>
            <input 
              type="text" 
              placeholder="e.g. Perera"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="w-full bg-slate-950 text-white border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        {/* Row 2: NIC & District */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300">
              ජාතික හැඳුනුම්පත් අංකය (NIC) <span className="text-rose-500">*</span>
            </label>
            <input 
              type="text" 
              required
              placeholder="e.g. 20031245678 or 991234567V"
              value={nic}
              onChange={(e) => handleNicChange(e.target.value)}
              className="w-full bg-slate-950 text-white border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-blue-500 font-mono"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300">
              දිස්ත්‍රික්කය (District)
            </label>
            <select
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
              className="w-full bg-slate-950 text-white border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-blue-500"
            >
              {SRI_LANKA_DISTRICTS.map((dst) => (
                <option key={`district-opt-${dst}`} value={dst} className="bg-slate-900 text-white">
                  {dst}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Row 3: Auto-suggested / Custom Username & Password */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-slate-950/60 rounded-2xl border border-slate-800/80">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-blue-400">
                පරිශීලක නාමය (Username)
              </label>
              <span className="text-[10px] text-slate-500 font-mono">Auto/Custom</span>
            </div>
            <input 
              type="text" 
              required
              placeholder="e.g. KASU5678"
              value={username}
              onChange={(e) => setUsername(e.target.value.toUpperCase())}
              className="w-full bg-slate-900 text-blue-300 font-mono font-bold border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-blue-400"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-emerald-400">
                මුරපදය (Password)
              </label>
              <span className="text-[10px] text-slate-500 font-mono">Default NIC</span>
            </div>
            <input 
              type="text" 
              required
              placeholder="e.g. 20031245678"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-slate-900 text-emerald-300 font-mono font-bold border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-emerald-400"
            />
          </div>
        </div>

        {/* Row 4: Class Types Selection (Checkboxes) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-300">
              පන්ති තෝරාගැනීම (Class Types) <span className="text-rose-500">*</span>
            </label>
            <span className="text-[11px] text-slate-400">
              තෝරාගත් පන්ති: {selectedClasses.length}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 bg-slate-950 rounded-2xl border border-slate-800">
            {Array.from(new Set(classList.map(c => typeof c === 'string' ? c : (c as any)?.name || (c as any)?.class_type || '').filter(Boolean))).map((cls, idx) => {
              const isSelected = selectedClasses.includes(cls);
              return (
                <button
                  type="button"
                  key={`reg-class-btn-${idx}-${cls}`}
                  onClick={() => toggleClass(cls)}
                  className={`p-2.5 rounded-xl border text-xs font-bold text-left transition flex items-center justify-between gap-1.5 cursor-pointer ${
                    isSelected
                      ? 'bg-blue-600/20 text-blue-300 border-blue-500/50 shadow-sm'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-200'
                  }`}
                >
                  <span className="truncate">{cls}</span>
                  {isSelected && <Check size={14} className="text-blue-400 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Row 5: WhatsApp & Mobile */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300">
              WhatsApp අංකය
            </label>
            <input 
              type="text" 
              placeholder="e.g. 0771234567"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              className="w-full bg-slate-950 text-white border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-blue-500 font-mono"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300">
              දුරකථන අංකය (Mobile)
            </label>
            <input 
              type="text" 
              placeholder="e.g. 0771234567"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              className="w-full bg-slate-950 text-white border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-blue-500 font-mono"
            />
          </div>
        </div>

        {/* Row 6: Initial Payment Status & Free Card Toggle */}
        <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-xs font-bold text-white block">
                වත්මන් මාසයේ ගෙවීම් තත්වය (Initial Status)
              </span>
              <span className="text-[11px] text-slate-400">
                ලියාපදිංචි වන මොහොතේම පන්තිය සක්‍රිය කරන ආකාරය
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => { setInitialPaymentStatus('paid'); setIsFreeToggle(false); }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                  initialPaymentStatus === 'paid' && !isFreeToggle
                    ? 'bg-emerald-600 text-white border-emerald-500'
                    : 'bg-slate-900 text-slate-400 border-slate-800'
                }`}
              >
                🟢 Paid (ගෙවා ඇත)
              </button>

              <button
                type="button"
                onClick={() => { setInitialPaymentStatus('free'); setIsFreeToggle(true); }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                  isFreeToggle || initialPaymentStatus === 'free'
                    ? 'bg-blue-600 text-white border-blue-500'
                    : 'bg-slate-900 text-slate-400 border-slate-800'
                }`}
              >
                🔵 Free Card
              </button>

              <button
                type="button"
                onClick={() => { setInitialPaymentStatus('unpaid'); setIsFreeToggle(false); }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                  initialPaymentStatus === 'unpaid' && !isFreeToggle
                    ? 'bg-rose-600 text-white border-rose-500'
                    : 'bg-slate-900 text-slate-400 border-slate-800'
                }`}
              >
                🔴 Unpaid
              </button>
            </div>
          </div>

          {/* Free Card Months Option */}
          {(isFreeToggle || initialPaymentStatus === 'free') && (
            <div className="pt-2 border-t border-slate-800 space-y-1.5">
              <label className="text-[11px] font-bold text-blue-300">
                නොමිලේ ලබා දෙන මාස (Free Access Months - කොමා මගින් වෙන් කරන්න):
              </label>
              <input
                type="text"
                placeholder="e.g. 2026-05, 2026-06, 2026-07 (හිස්ව තැබුවහොත් වත්මන් මාසය ලබා දේ)"
                value={freeMonths}
                onChange={(e) => setFreeMonths(e.target.value)}
                className="w-full bg-slate-900 text-blue-300 border border-blue-500/40 rounded-xl px-3 py-2 text-xs focus:outline-none"
              />
            </div>
          )}
        </div>

        {/* Submit Button */}
        <div className="pt-2">
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-extrabold py-3.5 rounded-2xl text-sm transition shadow-lg shadow-blue-900/30 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
          >
            {isSubmitting ? (
              <span key="submitting-state" className="flex items-center gap-2">
                <RefreshCw size={18} className="animate-spin" />
                <span>ශිෂ්‍යයා ලියාපදිංචි වෙමින් පවතී...</span>
              </span>
            ) : (
              <span key="idle-state" className="flex items-center gap-2">
                <UserPlus size={18} />
                <span>ශිෂ්‍යයා පද්ධතියට ලියාපදිංචි කරන්න (Register Student)</span>
              </span>
            )}
          </button>
        </div>

      </form>
    </div>
  );
}
