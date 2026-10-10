import React, { useState } from 'react';
import { UserPlus, CheckCircle, Copy, Check, Send, Sparkles, Shield, AlertCircle } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { SRI_LANKA_DISTRICTS } from '../data';

interface AdminManualStudentRegistrationProps {
  globalClasses?: { id: string; name: string; fee: number }[];
  onStudentRegistered?: () => void;
}

export default function AdminManualStudentRegistration({
  globalClasses = [],
  onStudentRegistered
}: AdminManualStudentRegistrationProps) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [nic, setNic] = useState('');
  const [district, setDistrict] = useState('Colombo');
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [whatsapp, setWhatsapp] = useState('');
  const [mobile, setMobile] = useState('');
  const [isFreeCard, setIsFreeCard] = useState(false);
  
  const currentMonthKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const [freeMonths, setFreeMonths] = useState(currentMonthKey);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [createdStudent, setCreatedStudent] = useState<{
    username: string;
    password: string;
    name: string;
    whatsapp: string;
    classes: string[];
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // Available classes fallback
  const availableClasses = globalClasses.length > 0 
    ? globalClasses.map(c => c.name)
    : [
        '2027 Theory', '2027 Revision', '2027 Paper Class',
        '2028 Theory', '2028 Revision', '2028 Paper Class'
      ];

  const handleClassToggle = (className: string) => {
    setSelectedClasses(prev => 
      prev.includes(className)
        ? prev.filter(c => c !== className)
        : [...prev, className]
    );
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!firstName.trim() || !lastName.trim()) {
      setErrorMsg('කරුණාකර සිසුවාගේ මුල් නම සහ වාසගම ඇතුළත් කරන්න.');
      return;
    }

    if (!nic.trim()) {
      setErrorMsg('කරුණාකර ජාතික හැඳුනුම්පත් අංකය (NIC) ඇතුළත් කරන්න.');
      return;
    }

    if (selectedClasses.length === 0) {
      setErrorMsg('කරුණාකර අවම වශයෙන් එක් පන්තියක්වත් තෝරන්න.');
      return;
    }

    if (!whatsapp.trim()) {
      setErrorMsg('කරුණාකර WhatsApp අංකය ඇතුළත් කරන්න.');
      return;
    }

    setLoading(true);

    try {
      // Formulate unique username
      const fPart = firstName.trim().substring(0, 2).toUpperCase();
      const lPart = lastName.trim().substring(0, 2).toUpperCase();
      const nicPart = nic.trim().slice(-2);
      const waPart = whatsapp.trim().replace(/\D/g, '').slice(-2);
      const baseUser = `${fPart}${lPart}${nicPart}${waPart}`;
      const finalUsername = baseUser.length >= 6 ? baseUser : `ST${Date.now().toString().slice(-6)}`;
      const finalPassword = nic.trim();
      const fullName = `${firstName.trim()} ${lastName.trim()}`;

      const activeMonthsList = isFreeCard
        ? freeMonths.split(',').map(m => m.trim()).filter(Boolean)
        : [currentMonthKey];

      const newStudentPayload = {
        username: finalUsername,
        password: finalPassword,
        name: fullName,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        nic: nic.trim(),
        district: district,
        class_types: selectedClasses,
        whatsapp: whatsapp.trim(),
        mobile: mobile.trim() || whatsapp.trim(),
        is_paid: true,
        is_approved: true, // Manual admin registration is auto-approved
        plan_type: isFreeCard ? 'free' : 'paid',
        active_months: activeMonthsList,
        free_months: isFreeCard ? activeMonthsList : [],
        joined_at: new Date().toISOString()
      };

      // 1. Try direct insert
      let { error } = await supabase.from('students').insert([newStudentPayload]);

      // 2. Safe 2-step fallback if trigger table differences occur
      if (error) {
        console.warn('Direct insert issue, trying safe fallback:', error.message);
        const { data: step1, error: step1Err } = await supabase.from('students').insert([{
          ...newStudentPayload,
          class_types: []
        }]).select();

        if (step1Err) {
          throw new Error(step1Err.message);
        }

        if (step1 && step1[0]?.id && selectedClasses.length > 0) {
          await supabase.from('students').update({
            class_types: selectedClasses
          }).eq('id', step1[0].id);
        }
      }

      setCreatedStudent({
        username: finalUsername,
        password: finalPassword,
        name: fullName,
        whatsapp: whatsapp.trim(),
        classes: selectedClasses
      });

      if (onStudentRegistered) {
        onStudentRegistered();
      }
    } catch (err: any) {
      console.error('Registration failed:', err);
      setErrorMsg('දත්ත ගබඩා කිරීමේ දෝෂයකි: ' + (err.message || 'කරුණාකර නැවත උත්සාහ කරන්න.'));
    } finally {
      setLoading(false);
    }
  };

  const handleCopyCredentials = () => {
    if (!createdStudent) return;
    const text = `Smart Physics Online Portal\n👤 Username: ${createdStudent.username}\n🔑 Password: ${createdStudent.password}\n📚 Classes: ${createdStudent.classes.join(', ')}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendWhatsApp = () => {
    if (!createdStudent) return;
    let phone = createdStudent.whatsapp.replace(/\D/g, '');
    if (phone.startsWith('0')) {
      phone = '94' + phone.substring(1);
    }
    const origin = window.location.origin;
    const msg = `ආයුබෝවන් ${createdStudent.name},\nඔබගේ Smart Physics Online ගිණුම සාර්ථකව සක්‍රිය කරන ලදී.\n\n🌐 Login Link: ${origin}\n👤 Username: ${createdStudent.username}\n🔑 Password: ${createdStudent.password}\n\nSmart Physics - තාරක අමරසිංහ`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const handleResetForm = () => {
    setFirstName('');
    setLastName('');
    setNic('');
    setSelectedClasses([]);
    setWhatsapp('');
    setMobile('');
    setIsFreeCard(false);
    setCreatedStudent(null);
    setErrorMsg('');
  };

  return (
    <div className="bg-slate-900/60 border border-slate-700/60 rounded-3xl p-5 sm:p-7 shadow-xl space-y-5">
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center font-bold">
            <UserPlus size={20} />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-bold text-white font-display">
              මැනුවල් සිසු ලියාපදිංචිය (Manual Student Registration)
            </h3>
            <p className="text-xs text-slate-400">
              පරිපාලක විසින් නව සිසුවෙකු සෘජුවම පද්ධතියට ලියාපදිංචි කර පිවිසුම් තොරතුරු ලබා දීම
            </p>
          </div>
        </div>
      </div>

      {createdStudent ? (
        <div className="p-6 rounded-2xl bg-emerald-950/30 border border-emerald-500/40 space-y-4 animate-in fade-in duration-200">
          <div className="flex items-center gap-3 text-emerald-400">
            <CheckCircle size={24} />
            <div>
              <h4 className="font-extrabold text-sm sm:text-base">ශිෂ්‍යයා සාර්ථකව ලියාපදිංචි කරන ලදී!</h4>
              <p className="text-xs text-emerald-300/80">පහත පිවිසුම් තොරතුරු සිසුවා වෙත යොමු කරන්න.</p>
            </div>
          </div>

          <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800 space-y-2 text-xs font-mono">
            <div className="flex justify-between py-1 border-b border-slate-850">
              <span className="text-slate-400">Student Name:</span>
              <span className="text-white font-bold">{createdStudent.name}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-850">
              <span className="text-slate-400">Username:</span>
              <span className="text-amber-400 font-black text-sm tracking-wide">{createdStudent.username}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-850">
              <span className="text-slate-400">Password:</span>
              <span className="text-cyan-400 font-black text-sm">{createdStudent.password}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-slate-400">Enrolled Classes:</span>
              <span className="text-blue-300 font-bold">{createdStudent.classes.join(', ')}</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <button
              onClick={handleCopyCredentials}
              className="flex-1 min-w-[160px] py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center justify-center gap-2 border border-slate-700 transition cursor-pointer"
            >
              {copied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
              {copied ? 'පිටපත් කරන ලදී!' : 'Copy Credentials'}
            </button>

            <button
              onClick={handleSendWhatsApp}
              className="flex-1 min-w-[160px] py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow transition cursor-pointer"
            >
              <Send size={16} /> WhatsApp වෙත යවන්න
            </button>

            <button
              onClick={handleResetForm}
              className="w-full sm:w-auto py-2.5 px-4 rounded-xl bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 border border-blue-500/30 font-bold text-xs transition cursor-pointer"
            >
              + තවත් සිසුවෙකු ලියාපදිංචි කරන්න
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleRegister} className="space-y-4">
          {errorMsg && (
            <div className="p-3 bg-rose-950/40 border border-rose-500/40 rounded-xl text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle size={16} />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1">
              <label className="text-xs text-slate-300 font-medium">මුල් නම (First Name) *</label>
              <input
                type="text"
                required
                placeholder="උදා: කසුන්"
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-slate-300 font-medium">වාසගම (Last Name) *</label>
              <input
                type="text"
                required
                placeholder="උදා: පෙරේරා"
                value={lastName}
                onChange={e => setLastName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1">
              <label className="text-xs text-slate-300 font-medium">ජාතික හැඳුනුම්පත / NIC *</label>
              <input
                type="text"
                required
                placeholder="උදා: 200512345678"
                value={nic}
                onChange={e => setNic(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-slate-300 font-medium">දිස්ත්‍රික්කය (District)</label>
              <select
                value={district}
                onChange={e => setDistrict(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:border-blue-500 focus:outline-none"
              >
                {SRI_LANKA_DISTRICTS.map((dst, idx) => (
                  <option key={idx} value={dst} className="bg-slate-900 text-white">{dst}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-slate-300 font-medium">පන්ති තෝරාගැනීම (Class Selection) *</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 bg-slate-950/70 p-3 rounded-2xl border border-slate-800">
              {availableClasses.map((cls, idx) => (
                <label
                  key={idx}
                  className={`flex items-center gap-2 p-2 rounded-xl text-xs font-semibold cursor-pointer border transition ${
                    selectedClasses.includes(cls)
                      ? 'bg-blue-600/20 text-blue-300 border-blue-500/50'
                      : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-white'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedClasses.includes(cls)}
                    onChange={() => handleClassToggle(cls)}
                    className="w-4 h-4 rounded text-blue-600"
                  />
                  <span>{cls}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1">
              <label className="text-xs text-slate-300 font-medium">WhatsApp අංකය *</label>
              <input
                type="tel"
                required
                placeholder="උදා: 0771234567"
                value={whatsapp}
                onChange={e => setWhatsapp(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-slate-300 font-medium">දුරකථන අංකය (Mobile)</label>
              <input
                type="tel"
                placeholder="උදා: 0712345678"
                value={mobile}
                onChange={e => setMobile(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-blue-950/20 border border-blue-500/30 space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isFreeCard}
                onChange={e => setIsFreeCard(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 cursor-pointer"
              />
              <span className="text-xs font-bold text-blue-300 flex items-center gap-1.5">
                <Sparkles size={14} className="text-amber-400" />
                නොමිලේ කාඩ්පතක් ලබා දීම (Free Card / Full Access)
              </span>
            </label>

            {isFreeCard && (
              <div className="pt-2">
                <label className="text-[11px] text-slate-400 block mb-1">
                  නොමිලේ ප්‍රවේශය ලබාදෙන මාස (කොමා මගින් වෙන් කරන්න):
                </label>
                <input
                  type="text"
                  placeholder="උදා: 2026-05, 2026-06"
                  value={freeMonths}
                  onChange={e => setFreeMonths(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl bg-slate-950 border border-blue-500/40 text-xs text-white"
                />
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-xs sm:text-sm tracking-wide shadow-lg shadow-blue-900/30 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {loading ? 'ලියාපදිංචි වෙමින් පවතී...' : 'සිසුවා පද්ධතියට ලියාපදිංචි කරන්න (Register Student)'}
          </button>
        </form>
      )}
    </div>
  );
}
