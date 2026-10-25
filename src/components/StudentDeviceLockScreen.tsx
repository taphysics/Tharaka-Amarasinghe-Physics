import React, { useState, useEffect } from 'react';
import { 
  ShieldAlert, 
  Lock, 
  Phone, 
  MessageCircle, 
  Clock, 
  AlertTriangle, 
  LogOut, 
  Smartphone,
  CheckCircle2,
  RefreshCw
} from 'lucide-react';
import { VIOLATION_LADDER, autoUnlockExpiredStudent } from '../deviceSecurityService';

interface StudentDeviceLockScreenProps {
  currentStudent: any;
  remainingMs: number;
  strikeCount: number;
  blockedUntil?: string;
  onLogout: () => void;
  onAutoUnlock?: () => void;
}

export default function StudentDeviceLockScreen({
  currentStudent,
  remainingMs: initialRemainingMs,
  strikeCount,
  blockedUntil,
  onLogout,
  onAutoUnlock
}: StudentDeviceLockScreenProps) {
  const [timeLeft, setTimeLeft] = useState<number>(initialRemainingMs);
  const [isUnlocking, setIsUnlocking] = useState<boolean>(false);

  const isPermanent = blockedUntil === 'permanent';

  useEffect(() => {
    setTimeLeft(initialRemainingMs);

    if (isPermanent) return;

    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1000) {
          clearInterval(interval);
          setTimeout(() => {
            handleAutoUnlock();
          }, 0);
          return 0;
        }
        return prev - 1000;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [initialRemainingMs, isPermanent]);

  const handleAutoUnlock = async () => {
    setIsUnlocking(true);
    try {
      await autoUnlockExpiredStudent(
        currentStudent?.username || '',
        currentStudent?.id
      );
    } catch (e) {
      console.warn('Auto-unlock execution error:', e);
    }
    setTimeout(() => {
      if (onAutoUnlock) {
        onAutoUnlock();
      } else {
        window.location.reload();
      }
    }, 1500);
  };

  // Calculate detailed days, hours, minutes, seconds
  const totalSecs = Math.max(0, Math.floor(timeLeft / 1000));
  const days = Math.floor(totalSecs / 86400);
  const hours = Math.floor((totalSecs % 86400) / 3600);
  const minutes = Math.floor((totalSecs % 3600) / 60);
  const seconds = totalSecs % 60;

  const strikeLadderInfo = VIOLATION_LADDER[Math.min(Math.max(1, strikeCount), VIOLATION_LADDER.length) - 1];

  return (
    <div className="min-h-[85vh] flex items-center justify-center p-4 md:p-8 animate-fade-in font-sans">
      <div className="w-full max-w-2xl bg-white dark:bg-slate-900 border-2 border-rose-500/40 rounded-3xl p-6 sm:p-10 shadow-2xl relative overflow-hidden space-y-6 text-center">
        
        {/* Glow backdrop effect */}
        <div className="absolute -top-24 -left-24 w-64 h-64 bg-rose-500/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-64 h-64 bg-amber-500/15 rounded-full blur-3xl pointer-events-none" />

        {/* Lock Shield Animated Icon */}
        <div className="relative mx-auto w-24 h-24 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full bg-rose-500/20 animate-ping opacity-75" />
          <div className="relative w-20 h-20 rounded-3xl bg-gradient-to-tr from-rose-600 to-amber-600 flex items-center justify-center text-white shadow-xl shadow-rose-950/40 transform transition hover:scale-105">
            <Lock size={40} className="animate-pulse" />
          </div>
          <span className="absolute -bottom-1 -right-1 p-1.5 rounded-full bg-slate-950 border-2 border-rose-500 text-rose-400">
            <ShieldAlert size={16} />
          </span>
        </div>

        {/* Heading */}
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs font-black tracking-wider uppercase">
            <AlertTriangle size={13} />
            <span>ගිණුම තාවකාලිකව අත්හිටුවා ඇත (Access Suspended)</span>
          </div>

          <h2 className="text-xl sm:text-3xl font-extrabold text-slate-900 dark:text-white leading-tight">
            ඔබගේ ගිණුමට ප්‍රවේශ වීම සීමා කර ඇත
          </h2>

          <p className="text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-300 max-w-lg mx-auto">
            {strikeCount <= 1 ? (
              <>ඔබගේ ගිණුමට වෙනත් ඩිවයිස් එකකින් පිවිසීම හේතුවෙන් ඔබගේ ගිණුම තාවකාලිකව අත්හිටුවා ඇත.</>
            ) : (
              <>
                ඔබ <strong className="text-rose-600 dark:text-rose-400 font-bold">{strikeCount} වන වරටත්</strong> වෙනත් පාර්ශවයක් සමග ඔබගේ ගිණුම් ප්‍රවේශ තොරතුරු බෙදාගෙන ඇති බව හෝ ඩිවයිස් කිහිපයකින් එකවර ලොග් වීමට උත්සාහ කර ඇති බව පද්ධතියෙන් හදුනාගෙන ඇත.
              </>
            )}
          </p>
        </div>

        {/* Violation Strike & Countdown Box */}
        <div className="bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800 text-xs">
            <span className="font-bold text-slate-500 dark:text-slate-400">
              ශිෂ්‍ය ID: <strong className="text-blue-600 dark:text-blue-400 font-mono">@{currentStudent?.username}</strong>
            </span>
            <span className="px-2.5 py-1 rounded-xl bg-amber-500/20 text-amber-700 dark:text-amber-300 font-black border border-amber-500/30 font-mono">
              නීති උල්ලංඝනය: {strikeCount} වන අවස්ථාව (Strike {strikeCount})
            </span>
          </div>

          {/* Animated Countdown Timer */}
          <div className="py-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-2">
              අන්බ්ලොක් වීමට ඉතිරි කාලය (Time Remaining Until Auto-Unlock):
            </span>

            {isPermanent ? (
              <div className="font-mono text-xl sm:text-2xl font-black text-rose-600 dark:text-rose-400 bg-rose-500/10 border border-rose-500/25 py-3.5 px-6 rounded-2xl inline-block shadow-inner">
                සදාකාලික තහනමකි (Permanent Block)
              </div>
            ) : isUnlocking || timeLeft <= 0 ? (
              <div className="bg-emerald-500/15 border border-emerald-500/30 rounded-2xl p-4 text-emerald-600 dark:text-emerald-400 font-bold text-sm flex items-center justify-center gap-2 animate-pulse">
                <RefreshCw size={18} className="animate-spin" />
                <span>කාලය අවසන් විය! ඔබගේ ගිණුම ස්වයංක්‍රීයව විවෘත (Unlocked) වෙමින් පවතී...</span>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2 sm:gap-3 flex-wrap">
                {/* Days Box */}
                {days > 0 && (
                  <div className="bg-rose-500/10 border border-rose-500/25 px-3 py-2 rounded-2xl min-w-[70px]">
                    <div className="font-mono text-2xl sm:text-3xl font-black text-rose-600 dark:text-rose-400">
                      {String(days).padStart(2, '0')}
                    </div>
                    <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                      දින (Days)
                    </div>
                  </div>
                )}

                {/* Hours Box */}
                <div className="bg-rose-500/10 border border-rose-500/25 px-3 py-2 rounded-2xl min-w-[70px]">
                  <div className="font-mono text-2xl sm:text-3xl font-black text-rose-600 dark:text-rose-400">
                    {String(hours).padStart(2, '0')}
                  </div>
                  <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                    පැය (Hours)
                  </div>
                </div>

                <span className="font-mono font-black text-rose-400 text-xl self-center pb-2">:</span>

                {/* Minutes Box */}
                <div className="bg-rose-500/10 border border-rose-500/25 px-3 py-2 rounded-2xl min-w-[70px]">
                  <div className="font-mono text-2xl sm:text-3xl font-black text-rose-600 dark:text-rose-400">
                    {String(minutes).padStart(2, '0')}
                  </div>
                  <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                    මිනිත්තු (Mins)
                  </div>
                </div>

                <span className="font-mono font-black text-rose-400 text-xl self-center pb-2">:</span>

                {/* Seconds Box */}
                <div className="bg-rose-500/10 border border-rose-500/25 px-3 py-2 rounded-2xl min-w-[70px]">
                  <div className="font-mono text-2xl sm:text-3xl font-black text-rose-600 dark:text-rose-400">
                    {String(seconds).padStart(2, '0')}
                  </div>
                  <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                    තත්පර (Secs)
                  </div>
                </div>
              </div>
            )}

            {!isPermanent && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 font-medium">
                ඉහත කාල සීමාව 0 වූ වහාම පද්ධතිය විසින් ඔබගේ ඩෑෂ්බෝඩ් එක ස්වයංක්‍රීයව අන්බ්ලොක් කරනු ලැබේ.
              </p>
            )}
          </div>

          {/* Progressive Ladder Preview */}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400">
            <span>
              <b>පද්ධති විනය නීතිය:</b> 1 වන වර: පැය 2 | 2 වන වර: පැය 6 | 3 වන වර: පැය 24 | 4 වන වර: දින 3 | 5 වන වර: සතියයි | 6 වන වර: සති 2 | 7 වන වර: මාසයයි / ස්ථිර තහනම.
            </span>
          </div>
        </div>

        {/* Emergency Admin Contact Section */}
        <div className="space-y-3 pt-2">
          <p className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 leading-relaxed">
            හදිසි අවශ්‍යතාවයකදී හෝ ගිණුම යළි සක්‍රිය කරගැනීම සඳහා පහත කොළ පැහැති බොත්තම ඔබා ප්‍රධාන ඇඩ්මින්වරයා අමතන්න:
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            {/* Direct Phone Call Button (Vibrant Green) */}
            <a
              href="tel:0779630100"
              style={{ backgroundColor: '#059669' }}
              className="w-full sm:w-auto px-6 py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm sm:text-base rounded-2xl shadow-xl border-2 border-emerald-400 flex items-center justify-center gap-3 transition transform hover:scale-102 active:scale-98 cursor-pointer ring-2 ring-emerald-500/40"
            >
              <Phone size={20} className="text-white animate-bounce shrink-0" />
              <span className="text-white font-extrabold drop-shadow">ඇඩ්මින් අමතන්න (0779630100)</span>
            </a>

            {/* WhatsApp Support Button (Vibrant Green Outline/Fill) */}
            <a
              href={`https://wa.me/94779630100?text=${encodeURIComponent(
                `ගරු ඇඩ්මින්තුමනි, මගේ ගිණුම (${currentStudent?.username}) ඩිවයිස් සීමා නීතිය නිසා බ්ලොක් වී ඇත. කරුණාකර එය පරීක්ෂා කර සහාය වන්න.`
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ backgroundColor: '#047857' }}
              className="w-full sm:w-auto px-6 py-4 bg-emerald-700 hover:bg-emerald-600 text-white font-extrabold text-sm sm:text-base rounded-2xl border-2 border-emerald-400/60 shadow-lg flex items-center justify-center gap-3 transition cursor-pointer"
            >
              <MessageCircle size={20} className="text-emerald-200 shrink-0" />
              <span className="text-white font-bold drop-shadow">WhatsApp පණිවිඩයක් එවන්න</span>
            </a>
          </div>
        </div>

        {/* Logout Button */}
        <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
          <button
            onClick={onLogout}
            className="text-xs text-rose-500 hover:text-rose-600 dark:hover:text-rose-400 font-bold flex items-center justify-center gap-1.5 mx-auto transition cursor-pointer"
          >
            <LogOut size={14} />
            <span>ගිණුමෙන් ඉවත් වී මුල් පිටුවට යන්න (Logout)</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * 5-Second Animated Auto-Logout Modal on Old Device
 */
export function ConcurrentLogoutModal({
  isOpen,
  countdown,
  message
}: {
  isOpen: boolean;
  countdown: number;
  message?: string;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in">
      <div className="max-w-md w-full bg-white dark:bg-slate-900 border-2 border-rose-500 rounded-3xl p-6 sm:p-8 text-center space-y-5 shadow-2xl relative animate-scale-up">
        
        {/* Animated Warning Icon */}
        <div className="w-16 h-16 rounded-2xl bg-rose-500/20 text-rose-500 border border-rose-500/40 flex items-center justify-center mx-auto">
          <Smartphone size={32} className="animate-bounce" />
        </div>

        <div className="space-y-2">
          <h3 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white">
            ⚠️ අනතුරු ඇඟවීමයි!
          </h3>
          <p className="text-xs sm:text-sm font-semibold text-rose-600 dark:text-rose-400 leading-relaxed">
            {message || 'වෙනත් පුද්ගලයෙකු ඔබගේ ගිණුමට ලොග් වී ඇති හෙයින් ඔබගේ ගිණුමෙන් ලොග් අවුට්වනු ඇත.'}
          </p>
        </div>

        {/* Big Countdown Circle */}
        <div className="py-2">
          <div className="w-20 h-20 rounded-full border-4 border-rose-500 flex items-center justify-center mx-auto text-3xl font-black font-mono text-rose-600 dark:text-rose-400 animate-pulse bg-rose-500/10">
            {countdown}
          </div>
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400 mt-2 block">
            තත්පර {countdown}කින් ස්වයංක්‍රීයව ලොග් අවුට් වේ...
          </span>
        </div>
      </div>
    </div>
  );
}
