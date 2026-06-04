import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Lock, CheckCircle, AlertTriangle } from 'lucide-react';

export default function ResetPassword() {
  const [status, setStatus] = useState<'loading' | 'valid' | 'invalid' | 'success'>('loading');
  const [newPassword, setNewPassword] = useState('');
  const [studentId, setStudentId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const verifyToken = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const urlToken = urlParams.get('token');

      if (!urlToken) {
        setStatus('invalid');
        return;
      }

      setToken(urlToken);

      // Token එක ඩේටාබේස් එකේ තියෙනවද සහ කල් ඉකුත් වී නැතිදැයි බැලීම
      const { data, error } = await supabase
        .from('students')
        .select('id, reset_expires')
        .eq('reset_token', urlToken)
        .maybeSingle();

      if (error || !data) {
        setStatus('invalid'); // ටෝකන් එක වැරදියි හෝ පාවිච්චි කරලා ඉවරයි
        return;
      }

      const isExpired = new Date(data.reset_expires) < new Date();
      if (isExpired) {
        setStatus('invalid'); // කල් ඉකුත් වී ඇත
      } else {
        setStudentId(data.id);
        setStatus('valid');
      }
    };

    verifyToken();
  }, []);

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentId || !newPassword || newPassword.length < 4) return;
    setStatus('loading');

    // 1. අලුත් පාස්වර්ඩ් එක සේව් කරනවා
    // 2. ඉතා වැදගත්: reset_token සහ reset_expires මකා දමනවා (එවිට ආයෙත් මේ ලින්ක් එක වැඩ කරන්නේ නෑ!)
    const { error } = await supabase
      .from('students')
      .update({ 
        password: newPassword, // ඔබේ ඩේටාබේස් එකේ පාස්වර්ඩ් සේව් වෙන column එක දෙන්න
        reset_token: null, 
        reset_expires: null 
      })
      .eq('id', studentId);

    if (error) {
      alert("Error updating password!");
      setStatus('valid');
    } else {
      setStatus('success');
    }
  };

  if (status === 'loading') return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">පරීක්ෂා කරමින් පවතී...</div>;

  if (status === 'invalid') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-red-500/30 p-8 rounded-2xl max-w-sm text-center">
          <AlertTriangle className="text-red-500 mx-auto mb-4" size={40} />
          <h2 className="text-red-400 font-bold text-lg">ලින්ක් එක කල් ඉකුත් වී ඇත!</h2>
          <p className="text-slate-400 text-sm mt-2">මෙම සබැඳිය එක් වරක් පමණක් භාවිත කළ හැක. කරුණාකර ඇඩ්මින්ගෙන් නව සබැඳියක් ඉල්ලා සිටින්න.</p>
        </div>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-emerald-500/30 p-8 rounded-2xl max-w-sm text-center">
          <CheckCircle className="text-emerald-500 mx-auto mb-4" size={40} />
          <h2 className="text-emerald-400 font-bold text-lg">සාර්ථකයි!</h2>
          <p className="text-slate-400 text-sm mt-2">ඔබගේ Password එක සාර්ථකව වෙනස් කරන ලදී. දැන් ඔබට නව Password එක භාවිතා කර ලොග් විය හැක.</p>
          <a href="/" className="mt-6 inline-block bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-xl text-sm font-bold transition">
            Login පිටුවට යන්න
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 p-8 rounded-3xl max-w-sm w-full shadow-2xl">
        <div className="text-center mb-6">
          <div className="bg-blue-500/20 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3">
            <Lock className="text-blue-400" size={28} />
          </div>
          <h2 className="text-white font-bold text-xl">නව මුරපදයක් ලබාදෙන්න</h2>
          <p className="text-slate-400 text-xs mt-1">ඔබගේ ගිණුම සඳහා අලුත් Password එකක් මෙහි ඇතුළත් කරන්න.</p>
        </div>

        <form onSubmit={handlePasswordReset} className="space-y-4">
          <div>
            <input 
              type="text" 
              placeholder="New Password" 
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 text-white px-4 py-3 rounded-xl focus:border-blue-500 outline-none transition"
              required
              minLength={4}
            />
          </div>
          <button 
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition shadow-lg shadow-blue-500/20"
          >
            Password එක Save කරන්න
          </button>
        </form>
      </div>
    </div>
  );
}