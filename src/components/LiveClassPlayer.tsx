import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import { differenceInSeconds, format, parse, isValid } from 'date-fns';

interface Student {
  id?: string;
  username: string;
  class_types?: string[] | null;
  free_months?: string[] | null;
}

interface ScheduledLive {
  id: string;
  title: string;
  date: string;
  time: string;
  class_type?: string | null;
  target_class_type?: string | null;
  target_classes?: string[] | null;
  target_month?: string | null;
  status: string;
  zoom_join_url?: string | null;
  zoom_meeting_id?: string | null;
  is_active?: boolean | null;
}

interface Payment {
  status?: string | null;
  month?: string | null;
  target_month?: string | null;
  class_type?: string | null;
  class_name?: string | null;
  username?: string | null;
  student_id?: string | null;
}

const normalize = (value: unknown): string =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

const getLiveClassType = (live: ScheduledLive): string =>
  String(live.target_class_type || live.class_type || '').trim();

const getLiveTargetClasses = (live: ScheduledLive): string[] =>
  (Array.isArray(live.target_classes) ? live.target_classes : [])
    .map(normalize)
    .filter(Boolean);

const studentHasSelectedClass = (
  student: Student,
  live: ScheduledLive,
): boolean => {
  const studentClasses = (student.class_types ?? [])
    .map(normalize)
    .filter(Boolean);

  if (studentClasses.length === 0) return false;

  const targetClasses = getLiveTargetClasses(live);
  const liveClassType = normalize(live.class_type);
  const targetClassType = normalize(live.target_class_type);

  // If the admin specified target_classes, that is the strongest targeting rule.
  if (targetClasses.length > 0) {
    return targetClasses.some((target) => studentClasses.includes(target));
  }

  // Otherwise match target_class_type, then class_type.
  if (targetClassType) return studentClasses.includes(targetClassType);
  if (liveClassType) return studentClasses.includes(liveClassType);

  return false;
};

const monthMatchesCurrent = (value: unknown, currentMonth: Date): boolean => {
  const raw = String(value ?? '').trim();
  if (!raw) return false;

  const year = format(currentMonth, 'yyyy');
  const monthNumber = format(currentMonth, 'MM');
  const monthName = format(currentMonth, 'MMMM').toLowerCase();
  const shortMonthName = format(currentMonth, 'MMM').toLowerCase();
  const normalized = raw.toLowerCase().replace(/\s+/g, ' ');

  const accepted = new Set([
    `${year}-${monthNumber}`,
    `${year}/${monthNumber}`,
    `${monthNumber}-${year}`,
    `${monthNumber}/${year}`,
    `${monthName} ${year}`,
    `${shortMonthName} ${year}`,
    `${year} ${monthName}`,
    `${year} ${shortMonthName}`,
    monthName,
    shortMonthName,
  ]);

  return accepted.has(normalized);
};

const paymentMatchesCurrentMonth = (
  payment: Payment,
  currentMonth: Date,
): boolean =>
  monthMatchesCurrent(payment.target_month, currentMonth) ||
  monthMatchesCurrent(payment.month, currentMonth);

const paymentMatchesClass = (
  payment: Payment,
  live: ScheduledLive,
): boolean => {
  const paymentClassType = normalize(payment.class_type);
  const paymentClassName = normalize(payment.class_name);

  const allowedClassNames = new Set<string>([
    normalize(live.class_type),
    normalize(live.target_class_type),
    ...getLiveTargetClasses(live),
  ]);
  allowedClassNames.delete('');

  if (allowedClassNames.size === 0) return false;

  // class_type is the authoritative payment field. class_name is accepted only
  // as a fallback because older payment rows may have stored the class there.
  if (paymentClassType && allowedClassNames.has(paymentClassType)) return true;
  if (!paymentClassType && paymentClassName && allowedClassNames.has(paymentClassName)) return true;

  return false;
};

const isPaidStatus = (status: unknown): boolean =>
  normalize(status) === 'paid';

// Converts a normal Zoom join URL into the Zoom Web Client URL used by the iframe.
const getEmbeddableZoomUrl = (joinUrl: string, username: string): string => {
  if (!joinUrl) return '';

  try {
    const url = new URL(joinUrl);

    if (url.pathname.includes('/j/')) {
      url.pathname = url.pathname.replace('/j/', '/wc/') + '/join';
    }

    if (username) {
      try {
        const encodedName = btoa(unescape(encodeURIComponent(username)));
        url.searchParams.set('un', encodedName);
      } catch {
        // If the browser cannot encode the username, keep the URL usable.
      }
    }

    return url.toString();
  } catch (error) {
    console.error('Invalid Zoom URL:', error);
    return joinUrl;
  }
};

const parseLiveDateTime = (live: ScheduledLive): Date => {
  const parsed = parse(
    `${live.date} ${live.time}`,
    'yyyy-MM-dd HH:mm',
    new Date(),
  );
  return isValid(parsed) ? parsed : new Date(NaN);
};

const LiveClassPlayer = ({ currentUser }: { currentUser?: Student | null }) => {
  const [currentLive, setCurrentLive] = useState<ScheduledLive | null>(null);
  const [nextLive, setNextLive] = useState<ScheduledLive | null>(null);
  const [hasAccess, setHasAccess] = useState(false);
  const [accessChecked, setAccessChecked] = useState(false);
  const [accessReason, setAccessReason] = useState<'unselected' | 'unpaid' | 'error'>('unpaid');
  const [isLoading, setIsLoading] = useState(true);
  const [countdown, setCountdown] = useState<{ m: number; s: number } | null>(null);
  const [isWithinOneHour, setIsWithinOneHour] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const playerContainerRef = useRef<HTMLDivElement>(null);

  const currentMonthDate = useMemo(() => new Date(), []);
  const currentMonth = format(currentMonthDate, 'yyyy-MM');
  const currentYear = format(currentMonthDate, 'yyyy');
  const currentMonthName = format(currentMonthDate, 'MMMM');

  const checkStudentAccess = useCallback(
    async (liveClass: ScheduledLive): Promise<boolean> => {
      if (!currentUser?.username) {
        setHasAccess(false);
        setAccessReason('error');
        setAccessChecked(true);
        return false;
      }

      // Rule 1: the student MUST have selected/enrolled in this live class type.
      if (!studentHasSelectedClass(currentUser, liveClass)) {
        setHasAccess(false);
        setAccessReason('unselected');
        setAccessChecked(true);
        return false;
      }

      // Rule 2: free access is valid only for the current month.
      const freeAccess = (currentUser.free_months ?? []).some((month) =>
        monthMatchesCurrent(month, currentMonthDate),
      );

      if (freeAccess) {
        setHasAccess(true);
        setAccessReason('unpaid');
        setAccessChecked(true);
        return true;
      }

      // Rule 3: paid access must be for THIS student, THIS current month,
      // and THIS live class type. We query both possible student identifiers.
      let paymentQuery = supabase
        .from('payments')
        .select(
          'status, month, target_month, class_type, class_name, username, student_id',
        )
        .eq('status', 'paid');

      if (currentUser.id) {
        paymentQuery = paymentQuery.or(
          `username.eq.${currentUser.username},student_id.eq.${currentUser.id}`,
        );
      } else {
        paymentQuery = paymentQuery.eq('username', currentUser.username);
      }

      const { data: payments, error } = await paymentQuery;

      if (error) {
        console.error('Payment verification failed:', error);
        setHasAccess(false);
        setAccessReason('error');
        setAccessChecked(true);
        return false;
      }

      const validPaidPayment = ((payments ?? []) as Payment[]).some(
        (payment) =>
          isPaidStatus(payment.status) &&
          paymentMatchesCurrentMonth(payment, currentMonthDate) &&
          paymentMatchesClass(payment, liveClass),
      );

      setHasAccess(validPaidPayment);
      setAccessReason(validPaidPayment ? 'unpaid' : 'unpaid');
      setAccessChecked(true);
      return validPaidPayment;
    },
    [currentMonthDate, currentUser],
  );

  const fetchNextClass = useCallback(async () => {
    if (!currentUser) {
      setNextLive(null);
      return;
    }

    const today = format(new Date(), 'yyyy-MM-dd');

    const { data, error } = await supabase
      .from('scheduled_lives')
      .select('*')
      .gt('date', today)
      .eq('status', 'scheduled')
      .order('date', { ascending: true })
      .order('time', { ascending: true });

    if (error) {
      console.error('Error fetching next class:', error);
      setNextLive(null);
      return;
    }

    const matchingNext = ((data ?? []) as ScheduledLive[]).find((live) =>
      studentHasSelectedClass(currentUser, live),
    );

    setNextLive(matchingNext ?? null);
  }, [currentUser]);

  const fetchClassData = useCallback(async () => {
    if (!currentUser?.username) {
      setCurrentLive(null);
      setNextLive(null);
      setHasAccess(false);
      setAccessChecked(false);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setLoadError(null);
    setAccessChecked(false);

    try {
      const today = new Date();
      const todayString = format(today, 'yyyy-MM-dd');
      const targetMonth = format(today, 'yyyy-MM');

      // Get ALL today's classes first. Do not use limit(1), because the first
      // class may belong to another class type and must not block this student.
      const { data: liveRows, error: liveError } = await supabase
        .from('scheduled_lives')
        .select('*')
        .eq('date', todayString)
        .eq('target_month', targetMonth)
        .in('status', ['scheduled', 'live'])
        .order('time', { ascending: true });

      if (liveError) throw liveError;

      const matchingClasses = ((liveRows ?? []) as ScheduledLive[]).filter(
        (live) => studentHasSelectedClass(currentUser, live),
      );

      const activeClasses = matchingClasses.filter(
        (live) => live.is_active !== false,
      );

      // Prefer a currently-live class. If none is live, show the earliest
      // scheduled class for this student's selected class type.
      const liveNow = activeClasses.find((live) => live.status === 'live');
      const scheduled = activeClasses.find((live) => live.status === 'scheduled');
      const selectedLive = liveNow ?? scheduled ?? null;

      setCurrentLive(selectedLive);

      if (selectedLive) {
        await checkStudentAccess(selectedLive);
      } else {
        setHasAccess(false);
        setAccessChecked(true);
        await fetchNextClass();
      }
    } catch (error) {
      console.error('Error fetching live class data:', error);
      setLoadError('සජීවි පන්ති දත්ත ලබාගැනීමේදී දෝෂයක් ඇතිවිය. කරුණාකර නැවත උත්සාහ කරන්න.');
      setCurrentLive(null);
      setHasAccess(false);
      setAccessChecked(true);
    } finally {
      setIsLoading(false);
    }
  }, [checkStudentAccess, currentUser, fetchNextClass]);

  useEffect(() => {
    void fetchClassData();
  }, [fetchClassData]);

  // Re-check immediately whenever the admin changes the scheduled live.
  useEffect(() => {
    const channel = supabase
      .channel(`live-class-player-${currentUser?.username ?? 'guest'}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'scheduled_lives' },
        () => {
          void fetchClassData();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'payments' },
        () => {
          // A payment can be approved while the student is waiting on this page.
          void fetchClassData();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [currentUser?.username, fetchClassData]);

  // Fullscreen state.
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Countdown to the scheduled class start.
  useEffect(() => {
    if (!currentLive || currentLive.status !== 'scheduled') {
      setCountdown(null);
      setIsWithinOneHour(false);
      return;
    }

    const updateCountdown = () => {
      const classDateTime = parseLiveDateTime(currentLive);
      const now = new Date();

      if (!isValid(classDateTime)) {
        setCountdown(null);
        setIsWithinOneHour(false);
        return;
      }

      const diffSeconds = differenceInSeconds(classDateTime, now);

      if (diffSeconds > 0 && diffSeconds <= 3600) {
        setIsWithinOneHour(true);
        setCountdown({
          m: Math.floor(diffSeconds / 60),
          s: diffSeconds % 60,
        });
      } else if (diffSeconds <= 0) {
        setIsWithinOneHour(true);
        setCountdown({ m: 0, s: 0 });
      } else {
        setIsWithinOneHour(false);
        setCountdown(null);
      }
    };

    updateCountdown();
    const interval = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(interval);
  }, [currentLive]);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      playerContainerRef.current?.requestFullscreen().catch((error: unknown) => {
        console.error('Fullscreen error:', error);
      });
    } else {
      void document.exitFullscreen();
    }
  }, []);

  if (isLoading || !accessChecked) {
    return (
      <div className="flex justify-center items-center min-h-[70vh] bg-black text-white font-semibold p-6">
        දත්ත පූරණය වෙමින් පවතී...
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] bg-black text-white p-6 text-center">
        <div className="max-w-xl p-8 bg-gray-900 border border-red-500/30 rounded-2xl">
          <h2 className="text-2xl font-bold text-red-400 mb-4">දත්ත ලබාගත නොහැක</h2>
          <p className="text-gray-300 mb-6">{loadError}</p>
          <button
            type="button"
            onClick={() => void fetchClassData()}
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold"
          >
            නැවත උත්සාහ කරන්න
          </button>
        </div>
      </div>
    );
  }

  // No class for this student's selected class type today.
  if (!currentLive) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] bg-black text-white p-6">
        <div className="w-full max-w-md bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center shadow-xl">
          <h2 className="text-2xl font-bold text-gray-300 mb-6">
            අද දින ඔබ තෝරාගෙන ඇති පන්ති සඳහා සජීවි පන්තියක් නොමැත
          </h2>

          {nextLive ? (
            <div className="bg-gray-950 p-6 rounded-xl border border-blue-500/20">
              <span className="text-xs font-bold uppercase tracking-wider bg-blue-500/10 text-blue-400 px-3 py-1 rounded-full">
                මීළඟ පන්තිය
              </span>
              <h3 className="text-xl text-white font-bold mt-4 mb-2">
                {getLiveClassType(nextLive) || nextLive.title}
              </h3>
              <p className="text-gray-400 text-sm">
                දිනය: <span className="text-gray-200 font-medium">{nextLive.date}</span>
              </p>
              <p className="text-gray-400 text-sm mt-1">
                ආරම්භ වන වේලාව: <span className="text-gray-200 font-medium">{nextLive.time}</span>
              </p>
            </div>
          ) : (
            <p className="text-gray-500 text-sm">
              ඉදිරි පන්ති කාලසටහන ළඟදීම යාවත්කාලීන කරනු ඇත.
            </p>
          )}
        </div>
      </div>
    );
  }

  // The class exists, but access is denied. IMPORTANT: this check happens
  // before the Zoom iframe is rendered, so unpaid/unselected students cannot
  // enter the live class.
  if (!hasAccess) {
    const classType = getLiveClassType(currentLive) || 'අදාළ පන්ති වර්ගය';

    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] bg-black text-white p-6 text-center">
        <div className="max-w-2xl w-full p-8 md:p-10 bg-gray-900/80 border border-red-500/30 rounded-2xl shadow-2xl">
          <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
            <span className="text-3xl">🔒</span>
          </div>

          <h2 className="text-2xl md:text-3xl font-extrabold text-red-400 mb-5">
            සජීවි පන්තියට ප්‍රවේශය නොමැත
          </h2>

          {accessReason === 'unselected' ? (
            <p className="text-base md:text-lg text-gray-300 leading-8">
              ඔබ <span className="text-blue-400 font-bold">{classType}</span> පන්තිය තෝරාගෙන නොමැත.
              එම පන්තියට සහභාගී වීමට පළමුව එම පන්ති වර්ගය සඳහා ලියාපදිංචි වන්න.
            </p>
          ) : accessReason === 'error' ? (
            <p className="text-base md:text-lg text-gray-300 leading-8">
              ඔබගේ ගෙවීම් තත්ත්වය තහවුරු කිරීමට නොහැකි විය. කරුණාකර ටික වේලාවකින් නැවත උත්සාහ කරන්න.
            </p>
          ) : (
            <p className="text-base md:text-lg text-gray-300 leading-8">
              ඔබ <span className="text-yellow-400 font-bold">{currentMonthName} {currentYear}</span> මාසය සඳහා
              <span className="text-blue-400 font-bold"> {classType}</span> සජීවි පන්තියට මුදල් ගෙවා නොමැත
              හෝ ඔබට එම මාසය සඳහා Free Access ලබාදී නොමැත.
              <br />
              කරුණාකර <span className="text-green-400 font-bold">{currentMonthName} {currentYear}</span> මාසය සඳහා
              ගෙවීම සම්පූර්ණ කර <span className="text-blue-400 font-bold">{classType}</span> පන්තියට සම්බන්ධ වන්න.
            </p>
          )}

          <div className="grid grid-cols-2 gap-3 mt-7 text-left">
            <div className="bg-black/40 border border-gray-800 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">වත්මන් මාසය</p>
              <p className="font-bold text-white">{currentMonthName} {currentYear}</p>
            </div>
            <div className="bg-black/40 border border-gray-800 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">පන්ති වර්ගය</p>
              <p className="font-bold text-white">{classType}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-black text-white flex flex-col p-4 md:p-8">
      {currentLive.status === 'scheduled' && (
        <div className="flex flex-col items-center justify-center flex-1 relative rounded-2xl overflow-hidden bg-gray-900 min-h-[65vh] border border-gray-800 shadow-2xl">
          {isWithinOneHour ? (
            <>
              <video
                autoPlay
                loop
                muted
                playsInline
                className="absolute inset-0 w-full h-full object-cover opacity-30 pointer-events-none"
              >
                <source src="/videos/waiting-video.mp4" type="video/mp4" />
              </video>

              <div className="relative z-10 flex flex-col items-center p-8 bg-black/70 rounded-2xl backdrop-blur-md border border-white/5 max-w-md w-full mx-4">
                <span className="text-xs font-bold uppercase tracking-widest bg-blue-500/20 text-blue-400 px-3 py-1 rounded-full mb-3">
                  {getLiveClassType(currentLive)}
                </span>
                <h2 className="text-lg md:text-xl text-gray-300 text-center mb-6 font-medium">
                  පන්තිය ආරම්භ වීමට තව...
                </h2>
                <div className="text-6xl md:text-7xl font-mono font-black text-white tracking-wider">
                  {countdown
                    ? `${String(countdown.m).padStart(2, '0')}:${String(countdown.s).padStart(2, '0')}`
                    : '00:00'}
                </div>
                {countdown?.m === 0 && countdown?.s === 0 && (
                  <p className="mt-6 text-green-400 animate-pulse text-sm font-medium bg-green-500/10 px-4 py-2 rounded-lg border border-green-500/20 text-center">
                    ගුරුතුමා විසින් පන්තිය සක්‍රීය කරන තුරු මඳක් රැඳී සිටින්න...
                  </p>
                )}
              </div>
            </>
          ) : (
            <div className="z-10 text-center p-6">
              <span className="text-xs font-bold uppercase tracking-widest bg-gray-800 text-gray-400 px-3 py-1 rounded-full mb-3 inline-block">
                {getLiveClassType(currentLive)}
              </span>
              <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">
                {currentLive.title}
              </h1>
              <p className="text-gray-400">
                මෙම පන්තිය අද දින <span className="text-yellow-400 font-medium">{currentLive.time}</span> ට ආරම්භ වීමට නියමිතයි.
              </p>
            </div>
          )}
        </div>
      )}

      {currentLive.status === 'live' && (
        <div
          ref={playerContainerRef}
          className={`flex-1 flex flex-col rounded-2xl overflow-hidden bg-gray-900 border border-green-500/20 shadow-2xl relative ${isFullscreen ? 'h-screen w-screen rounded-none border-none' : ''}`}
        >
          {!isFullscreen && (
            <div className="bg-green-950/40 text-green-400 px-4 py-3 flex justify-between items-center font-semibold border-b border-green-500/10 text-sm md:text-base">
              <div className="flex items-center gap-3">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
                </span>
                සජීවී විකාශය ක්‍රියාත්මකයි: {getLiveClassType(currentLive)}
              </div>

              <button
                type="button"
                onClick={toggleFullscreen}
                className="hidden md:flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg transition-colors text-xs"
              >
                Full Screen
              </button>
            </div>
          )}

          <div className="w-full flex-1 min-h-[75vh] bg-black relative">
            <iframe
              src={getEmbeddableZoomUrl(currentLive.zoom_join_url || '', currentUser?.username || '')}
              allow="camera; microphone; fullscreen; display-capture; autoplay"
              sandbox="allow-forms allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
              className={`absolute inset-0 w-full h-full border-0 ${isFullscreen ? '' : 'rounded-b-2xl'} bg-black`}
              title="Zoom Web Client"
            />

            <button
              type="button"
              onClick={toggleFullscreen}
              className="absolute bottom-6 right-6 z-50 bg-black/70 hover:bg-black text-white px-4 py-2 rounded-full border border-gray-600 shadow-xl transition-all flex items-center gap-2 backdrop-blur-md"
            >
              <span className="text-sm">{isFullscreen ? 'Exit Full Screen' : 'Full Screen'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default LiveClassPlayer;
