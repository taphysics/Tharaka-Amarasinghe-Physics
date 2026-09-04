import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import {
  Calendar,
  Clock,
  Video,
  FileText,
  Send,
  CheckCircle2,
  AlertCircle,
  CreditCard,
  LockKeyhole,
  RefreshCw,
  UserX,
} from 'lucide-react';
import { differenceInSeconds, parse, isValid } from 'date-fns';


const ZOOM_WEB_SDK_VERSION = '6.2.0';

type ZoomEmbeddedClient = {
  init: (options: Record<string, unknown>) => Promise<unknown>;
  join: (options: Record<string, string>) => Promise<unknown>;
  leaveMeeting: () => Promise<unknown>;
};

type ZoomEmbeddedSdk = {
  createClient: () => ZoomEmbeddedClient;
  destroyClient?: (client: ZoomEmbeddedClient) => void;
};

declare global {
  interface Window {
    ZoomMtgEmbedded?: ZoomEmbeddedSdk;
    __zoomEmbeddedSdkPromise?: Promise<ZoomEmbeddedSdk>;
  }
}

const loadScriptOnce = (src: string, id: string): Promise<void> => {
  const existing = document.getElementById(id) as HTMLScriptElement | null;
  if (existing) {
    if ((existing as HTMLScriptElement).dataset.loaded === 'true') {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error(`Zoom SDK script load failed: ${src}`)), { once: true });
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.id = id;
    script.src = src;
    script.async = false;
    script.onload = () => {
      script.dataset.loaded = 'true';
      resolve();
    };
    script.onerror = () => reject(new Error(`Zoom SDK script load failed: ${src}`));
    document.head.appendChild(script);
  });
};

const loadZoomEmbeddedSdk = async (): Promise<ZoomEmbeddedSdk> => {
  if (window.ZoomMtgEmbedded) return window.ZoomMtgEmbedded;
  if (window.__zoomEmbeddedSdkPromise) return window.__zoomEmbeddedSdkPromise;

  window.__zoomEmbeddedSdkPromise = (async () => {
    const base = `https://source.zoom.us/${ZOOM_WEB_SDK_VERSION}`;
    const scripts = [
      [`zoom-vendor-react-${ZOOM_WEB_SDK_VERSION}`, `${base}/lib/vendor/react.min.js`],
      [`zoom-vendor-react-dom-${ZOOM_WEB_SDK_VERSION}`, `${base}/lib/vendor/react-dom.min.js`],
      [`zoom-vendor-redux-${ZOOM_WEB_SDK_VERSION}`, `${base}/lib/vendor/redux.min.js`],
      [`zoom-vendor-redux-thunk-${ZOOM_WEB_SDK_VERSION}`, `${base}/lib/vendor/redux-thunk.min.js`],
      [`zoom-vendor-lodash-${ZOOM_WEB_SDK_VERSION}`, `${base}/lib/vendor/lodash.min.js`],
      [`zoom-embedded-${ZOOM_WEB_SDK_VERSION}`, `https://source.zoom.us/zoom-meeting-embedded-${ZOOM_WEB_SDK_VERSION}.min.js`],
    ] as const;

    for (const [id, src] of scripts) {
      await loadScriptOnce(src, id);
    }

    if (!window.ZoomMtgEmbedded) {
      throw new Error('Zoom Meeting SDK load වුවත් ZoomMtgEmbedded global එක නොලැබුණි.');
    }

    return window.ZoomMtgEmbedded;
  })();

  try {
    return await window.__zoomEmbeddedSdkPromise;
  } catch (error) {
    window.__zoomEmbeddedSdkPromise = undefined;
    throw error;
  }
};

interface Student {
  id: string;
  username: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  class_types: string[];
  free_months: string[];
  active_months?: string[];
  is_paid?: boolean;
  is_approved?: boolean;
  deactivated_months?: unknown;
}

interface ScheduledLive {
  id: string;
  title: string;
  platform?: string | null;
  link?: string | null;
  date: string;
  time: string;
  target_month: string;
  target_classes?: string[] | null;
  visibility?: string | null;
  created_at?: string;
  class_type?: string | null;
  video_url?: string | null;
  video_type?: string | null;
  is_exam_active?: boolean | null;
  active_exam_id?: string | null;
  attention_trigger?: boolean | null;
  target_class_type?: string | null;
  is_active?: boolean | null;
  zoom_meeting_id?: string | null;
  zoom_start_url?: string | null;
  zoom_join_url?: string | null;
  status: string | null;
  pre_class_video_path?: string | null;
  attention_expires_at?: string | null;
}

interface ExamData {
  id: string;
  title: string;
  class_type?: string | null;
  pdf_url: string;
  duration_minutes: number;
  total_questions: number;
  correct_answer: Record<string, number>;
  target_class_type?: string | null;
  status?: string | null;
}

interface PaymentRow {
  id: string;
  student_id: string;
  month?: string | null;
  status?: string | null;
  class_name?: string | null;
  class_type?: string | null;
  target_month?: string | null;
  enrollment_id?: string | null;
}

interface ZoomJoinCredentials {
  signature: string;
  meetingNumber: string;
  password: string;
  tk?: string;
}

interface AccessResult {
  allowed: boolean;
  reason: 'paid' | 'free' | 'not-paid' | 'absent' | 'not-enrolled' | 'deactivated';
  month: string;
  classType: string;
  message: string;
}

/*
 * SECURITY:
 * The Zoom Meeting SDK signature MUST be generated server-side.
 * Never put the Zoom Client Secret in this React file.
 *
 * Expected endpoint:
 * POST /api/zoom/join-credentials
 *
 * Request:
 * {
 *   liveId,
 *   studentId,
 *   username,
 *   joinUrl,
 *   meetingNumber,
 *   targetMonth,
 *   classType
 * }
 *
 * Response:
 * {
 *   signature,
 *   meetingNumber,
 *   password,
 *   tk?
 * }
 *
 * The server MUST independently re-check the student's eligibility
 * before returning the signature.
 */
const ZOOM_JOIN_CREDENTIALS_ENDPOINT = '/api/zoom/join-credentials';

const normalize = (value: unknown): string =>
  String(value ?? '').trim().toLowerCase();

const unique = (values: string[]): string[] =>
  Array.from(new Set(values.filter(Boolean)));

const getCurrentMonth = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

const monthAliases = (month: string): string[] => {
  const [year, monthNumber] = month.split('-');
  const monthIndex = Number(monthNumber) - 1;

  if (!year || Number.isNaN(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    return [normalize(month)];
  }

  const date = new Date(Number(year), monthIndex, 1);
  const monthName = date.toLocaleString('en-US', { month: 'long' });
  const shortMonthName = date.toLocaleString('en-US', { month: 'short' });

  return unique([
    month,
    `${year}-${monthNumber}`,
    `${year}-${Number(monthNumber)}`,
    `${year}/${monthNumber}`,
    `${year}/${Number(monthNumber)}`,
    `${year} ${monthName}`,
    `${year} ${shortMonthName}`,
    `${monthName} ${year}`,
    `${shortMonthName} ${year}`,
    `${monthNumber}/${year}`,
    `${Number(monthNumber)}/${year}`,
  ].map(normalize));
};

const containsMonth = (values: unknown, month: string): boolean => {
  if (!Array.isArray(values)) return false;

  const aliases = new Set(monthAliases(month));
  return values.some((value) => aliases.has(normalize(value)));
};

const statusIsPaid = (status: unknown): boolean =>
  ['paid', 'success', 'successful', 'completed', 'approved', 'active'].includes(
    normalize(status),
  );

const statusIsAbsent = (status: unknown): boolean =>
  [
    'absent',
    'absence',
    'unpaid',
    'pending',
    'failed',
    'cancelled',
    'canceled',
    'rejected',
  ].includes(normalize(status));

/*
 * The exact JSON shape of students.deactivated_months was not supplied.
 * This supports common shapes without assuming one undocumented schema:
 *   ["2026-09"]
 *   { "2026-09": true }
 *   { "2026-09": "deactivated" }
 *   { "months": ["2026-09"] }
 */
const isMonthDeactivated = (value: unknown, month: string): boolean => {
  if (!value) return false;

  const aliases = new Set(monthAliases(month));

  const check = (input: unknown): boolean => {
    if (Array.isArray(input)) {
      return input.some((item) => {
        if (typeof item === 'string') {
          return aliases.has(normalize(item));
        }

        if (item && typeof item === 'object') {
          const record = item as Record<string, unknown>;

          return (
            aliases.has(normalize(record.month)) ||
            aliases.has(normalize(record.target_month)) ||
            aliases.has(normalize(record.date))
          );
        }

        return false;
      });
    }

    if (typeof input === 'object' && input !== null) {
      const record = input as Record<string, unknown>;

      for (const alias of aliases) {
        const matchingKey = Object.keys(record).find(
          (key) => normalize(key) === alias,
        );

        if (!matchingKey) continue;

        const state = record[matchingKey];

        if (
          state === true ||
          state === 1 ||
          normalize(state) === 'true' ||
          ['deactivated', 'inactive', 'blocked', 'disabled'].includes(
            normalize(state),
          )
        ) {
          return true;
        }
      }

      for (const key of ['months', 'deactivated_months', 'disabled_months']) {
        if (check(record[key])) return true;
      }

      for (const nested of Object.values(record)) {
        if (Array.isArray(nested) && check(nested)) return true;
      }
    }

    if (typeof input === 'string') {
      const trimmed = input.trim();

      if (!trimmed) return false;

      try {
        return check(JSON.parse(trimmed));
      } catch {
        return aliases.has(normalize(trimmed));
      }
    }

    return false;
  };

  return check(value);
};

const getClassType = (live: ScheduledLive): string =>
  String(live.target_class_type || live.class_type || '').trim();

const liveMatchesStudent = (
  live: ScheduledLive,
  student: Student,
): boolean => {
  const studentClasses = (student.class_types || [])
    .map(normalize)
    .filter(Boolean);

  const targetClasses = (live.target_classes || [])
    .map(normalize)
    .filter(Boolean);

  const targetClassType = normalize(live.target_class_type);
  const classType = normalize(live.class_type);

  if (targetClasses.length > 0) {
    return targetClasses.some((target) => studentClasses.includes(target));
  }

  if (targetClassType) {
    return studentClasses.includes(targetClassType);
  }

  if (classType) {
    return studentClasses.includes(classType);
  }

  return false;
};

const parseLiveDateTime = (live: ScheduledLive): Date => {
  const parsed = parse(
    `${live.date} ${live.time}`,
    'yyyy-MM-dd HH:mm',
    new Date(),
  );

  return isValid(parsed) ? parsed : new Date(NaN);
};

const extractMeetingNumber = (live: ScheduledLive): string => {
  if (live.zoom_meeting_id) {
    return String(live.zoom_meeting_id).replace(/\D/g, '');
  }

  const joinUrl = live.zoom_join_url || live.link || '';

  try {
    const url = new URL(joinUrl);

    const pathMatch = url.pathname.match(/\/(?:j|w)\/(\d{7,})/i);

    if (pathMatch?.[1]) return pathMatch[1];

    const queryCandidates = [
      url.searchParams.get('meeting'),
      url.searchParams.get('meetingNumber'),
      url.searchParams.get('mn'),
    ];

    const candidate = queryCandidates.find(
      (item) => item && /\d{7,}/.test(item),
    );

    return candidate ? candidate.replace(/\D/g, '') : '';
  } catch {
    const match = joinUrl.match(/(?:\/j\/|\/w\/)(\d{7,})/i);
    return match?.[1] || '';
  }
};

const getStudentDisplayName = (student: Student): string =>
  student.name?.trim() ||
  [student.first_name, student.last_name].filter(Boolean).join(' ').trim() ||
  student.username;

const getDrivePreviewUrl = (url: string): string => {
  if (!url) return '';

  if (url.includes('/view')) return url.replace('/view', '/preview');
  if (url.includes('/edit')) return url.replace('/edit', '/preview');

  return url;
};

const LiveClassPlayer = ({ currentUser }: { currentUser?: Student | null }) => {
  const studentId = currentUser?.id ?? '';

  const zoomRootRef = useRef<HTMLDivElement | null>(null);
  const zoomClientRef = useRef<any>(null);
  const joiningLiveIdRef = useRef<string | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [upcomingClasses, setUpcomingClasses] = useState<ScheduledLive[]>([]);
  const [futureClasses, setFutureClasses] = useState<ScheduledLive[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [accessByLiveId, setAccessByLiveId] = useState<
    Record<string, AccessResult>
  >({});
  const [paymentRows, setPaymentRows] = useState<PaymentRow[]>([]);

  const [activeExam, setActiveExam] = useState<ExamData | null>(null);
  const [examAnswers, setExamAnswers] = useState<Record<number, number>>({});
  const [examTimeLeft, setExamTimeLeft] = useState(0);
  const [isExamSubmitted, setIsExamSubmitted] = useState(false);
  const [examResult, setExamResult] = useState<{
    score: number;
    total: number;
  } | null>(null);
  const [showResultModal, setShowResultModal] = useState(false);

  const currentMonth = useMemo(() => getCurrentMonth(), [currentTime]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  const loadPaymentRows = useCallback(async () => {
    const { data, error } = await supabase
      .from('payments')
      .select(
        'id,student_id,month,status,class_name,class_type,target_month,enrollment_id',
      )
      .eq('student_id', studentId);

    if (error) {
      console.error('Payment lookup failed:', error);
      setPaymentRows([]);
      return;
    }

    setPaymentRows((data || []) as PaymentRow[]);
  }, [studentId]);

  const calculateAccess = useCallback(
    (live: ScheduledLive): AccessResult => {
      const month =
        String(live.target_month || currentMonth).trim() || currentMonth;

      const classType = getClassType(live);

      if (!currentUser) {
        return {
          allowed: false,
          reason: 'not-enrolled',
          month,
          classType,
          message: 'ශිෂ්‍ය ගිණුම් තොරතුරු තවමත් load වෙමින් පවතී.',
        };
      }

      const studentClasses = (currentUser.class_types || []).map(normalize);

      const selectedClass =
        Boolean(classType) &&
        studentClasses.includes(normalize(classType));

      const selectedThroughTargetClasses =
        Array.isArray(live.target_classes) &&
        live.target_classes.length > 0 &&
        live.target_classes.some((item) =>
          studentClasses.includes(normalize(item)),
        );

      if (!selectedClass && !selectedThroughTargetClasses) {
        return {
          allowed: false,
          reason: 'not-enrolled',
          month,
          classType,
          message: `මෙම ${month} මාසයේ ${
            classType || 'මෙම'
          } පන්තිය සඳහා ඔබ ලියාපදිංචි වී නොමැත.`,
        };
      }

      if (isMonthDeactivated(currentUser.deactivated_months, month)) {
        return {
          allowed: false,
          reason: 'deactivated',
          month,
          classType,
          message: `${month} මාසය සඳහා ඔබගේ ගිණුමේ පන්ති ප්‍රවේශය අක්‍රිය කර ඇත.`,
        };
      }

      const aliases = new Set(monthAliases(month));

      const matchingPayments = paymentRows.filter((payment) => {
        const paymentMonths = [payment.month, payment.target_month]
          .filter(Boolean)
          .map(normalize);

        const monthMatches = paymentMonths.some((item) =>
          aliases.has(item),
        );

        if (!monthMatches) return false;

        const paymentClass = normalize(
          payment.class_type || payment.class_name,
        );

        if (!paymentClass) return true;

        return (
          paymentClass === normalize(classType) ||
          normalize(classType) === '' ||
          (live.target_classes || [])
            .map(normalize)
            .includes(paymentClass)
        );
      });

      const paid = matchingPayments.some((payment) =>
        statusIsPaid(payment.status),
      );

      const explicitlyAbsent = matchingPayments.some((payment) =>
        statusIsAbsent(payment.status),
      );

      const free =
        containsMonth(currentUser.free_months, month) &&
        !explicitlyAbsent;

      /*
       * active_months is treated as the student's paid/active month list,
       * because that is how the supplied schema represents monthly access.
       */
      const activeMonth =
        containsMonth(currentUser.active_months, month) &&
        !explicitlyAbsent;

      if (paid || free || activeMonth) {
        return {
          allowed: true,
          reason: paid ? 'paid' : 'free',
          month,
          classType,
          message: '',
        };
      }

      if (explicitlyAbsent) {
        return {
          allowed: false,
          reason: 'absent',
          month,
          classType,
          message: `ඔබ ${month} මාසයේ ${
            classType || 'මෙම'
          } පන්තිය සඳහා ගෙවීම්/පැමිණීම සම්පූර්ණ කර නොමැත. කරුණාකර මුදල් ගෙවා පන්තියට සම්බන්ධ වන්න.`,
        };
      }

      return {
        allowed: false,
        reason: 'not-paid',
        month,
        classType,
        message: `ඔබ ${month} මාසයේ ${
          classType || 'මෙම'
        } පන්තිය සඳහා මුදල් ගෙවා නොමැත. කරුණාකර මුදල් ගෙවා පන්තියට සම්බන්ධ වන්න.`,
      };
    },
    [currentMonth, currentUser, paymentRows],
  );

  const fetchClassesData = useCallback(async () => {
    try {
      setErrorMessage('');

      const { data: allLives, error } = await supabase
        .from('scheduled_lives')
        .select('*')
        .eq('is_active', true)
        .in('status', ['scheduled', 'live'])
        .order('date', { ascending: true })
        .order('time', { ascending: true });

      if (error) throw error;

      const currentMonthAliases = new Set(monthAliases(currentMonth));

      if (!currentUser) {
        setUpcomingClasses([]);
        setFutureClasses([]);
        setAccessByLiveId({});
        return;
      }

      const studentLives = ((allLives || []) as ScheduledLive[]).filter(
        (live) => {
          const liveMonth = normalize(live.target_month);

          /*
           * Only show live classes assigned to the current calendar month.
           */
          if (!liveMonth || !currentMonthAliases.has(liveMonth)) {
            return false;
          }

          return liveMatchesStudent(live, currentUser);
        },
      );

      const now = new Date();
      const upcoming: ScheduledLive[] = [];
      const future: ScheduledLive[] = [];

      for (const live of studentLives) {
        const classDateTime = parseLiveDateTime(live);

        if (!isValid(classDateTime)) continue;

        if (live.status === 'live') {
          upcoming.push(live);
          continue;
        }

        const diff = differenceInSeconds(classDateTime, now);

        if (diff >= 0 && diff <= 24 * 60 * 60) {
          upcoming.push(live);
        } else if (diff > 24 * 60 * 60) {
          future.push(live);
        }
      }

      upcoming.sort((a, b) => {
        if (a.status === 'live' && b.status !== 'live') return -1;
        if (a.status !== 'live' && b.status === 'live') return 1;

        return (
          parseLiveDateTime(a).getTime() -
          parseLiveDateTime(b).getTime()
        );
      });

      future.sort(
        (a, b) =>
          parseLiveDateTime(a).getTime() -
          parseLiveDateTime(b).getTime(),
      );

      const access: Record<string, AccessResult> = {};

      for (const live of studentLives) {
        access[live.id] = calculateAccess(live);
      }

      setUpcomingClasses(upcoming);
      setFutureClasses(future);
      setAccessByLiveId(access);
    } catch (error) {
      console.error('Error fetching scheduled lives:', error);
      setErrorMessage('පන්ති දත්ත ලබා ගැනීමේදී දෝෂයක් ඇති විය.');
    } finally {
      setIsLoading(false);
    }
  }, [calculateAccess, currentMonth, currentUser]);

  useEffect(() => {
    if (!studentId) {
      setIsLoading(false);
      setPaymentRows([]);
      setUpcomingClasses([]);
      setFutureClasses([]);
      setAccessByLiveId({});
      return;
    }

    let mounted = true;

    const load = async () => {
      setIsLoading(true);

      await loadPaymentRows();

      if (mounted) {
        await fetchClassesData();
      }
    };

    void load();

    const channel = supabase
      .channel(`live-class-updates-${studentId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'scheduled_lives',
        },
        () => {
          void fetchClassesData();
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'payments',
          filter: `student_id=eq.${studentId}`,
        },
        () => {
          void loadPaymentRows();
          void fetchClassesData();
        },
      )
      .subscribe();

    return () => {
      mounted = false;
      void supabase.removeChannel(channel);
    };
  }, [studentId, fetchClassesData, loadPaymentRows]);

  /*
   * Recalculate access whenever payment data changes.
   */
  useEffect(() => {
    const access: Record<string, AccessResult> = {};

    [...upcomingClasses, ...futureClasses].forEach((live) => {
      access[live.id] = calculateAccess(live);
    });

    setAccessByLiveId(access);
  }, [calculateAccess, futureClasses, upcomingClasses]);

  const currentClosestClass = upcomingClasses[0];

  const leaveZoomMeeting = useCallback(async () => {
    try {
      if (zoomClientRef.current) {
        await zoomClientRef.current.leaveMeeting();
      }
    } catch (error) {
      console.warn('Zoom leaveMeeting warning:', error);
    } finally {
      joiningLiveIdRef.current = null;

      if (zoomRootRef.current) {
        zoomRootRef.current.innerHTML = '';
      }

      try {
        const zoomSdk = window.ZoomMtgEmbedded;
        if (zoomSdk?.destroyClient && zoomClientRef.current) {
          zoomSdk.destroyClient(zoomClientRef.current as ZoomEmbeddedClient);
        }
      } catch (error) {
        console.warn('Zoom destroyClient warning:', error);
      }

      zoomClientRef.current = null;
    }
  }, []);

  const joinZoomMeeting = useCallback(
    async (live: ScheduledLive, access: AccessResult) => {
      try {
        if (!access.allowed) return;
        if (!currentUser || !studentId) {
          throw new Error('ශිෂ්‍ය ගිණුම් තොරතුරු තවමත් load වෙමින් පවතී.');
        }

      if (!live.zoom_join_url && !live.link) {
        throw new Error(
          'මෙම පන්තිය සඳහා Zoom join URL එකක් සකසා නොමැත.',
        );
      }

      if (joiningLiveIdRef.current === live.id) return;

      const meetingNumberFromDatabase = extractMeetingNumber(live);

      if (!meetingNumberFromDatabase) {
        throw new Error(
          'Zoom Meeting ID එක හඳුනාගත නොහැක. scheduled_lives.zoom_meeting_id හෝ zoom_join_url පරීක්ෂා කරන්න.',
        );
      }

      if (!zoomRootRef.current) {
        throw new Error('Zoom player container එක සූදානම් කර නොමැත.');
      }

      joiningLiveIdRef.current = live.id;

      await leaveZoomMeeting();

      if (!zoomRootRef.current) {
        throw new Error('Zoom player container එක සූදානම් කර නොමැත.');
      }

      const response = await fetch(
        ZOOM_JOIN_CREDENTIALS_ENDPOINT,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            liveId: live.id,
            studentId: currentUser.id,
            username: currentUser.username,
            joinUrl: live.zoom_join_url || live.link || '',
            meetingNumber: meetingNumberFromDatabase,
            targetMonth: access.month,
            classType: access.classType,
          }),
        },
      );

      let payload: any = null;

      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      if (!response.ok) {
        throw new Error(
          payload?.message ||
            'Zoom authorization server එකෙන් access ලබාගත නොහැකි විය.',
        );
      }

      const credentials = payload as ZoomJoinCredentials;

      if (!credentials.signature) {
        throw new Error(
          'Zoom SDK signature එක server එකෙන් ලැබී නොමැත.',
        );
      }

      if (!credentials.meetingNumber) {
        throw new Error(
          'Zoom Meeting Number එක server response එකේ නොමැත.',
        );
      }

      const zoomSdk = await loadZoomEmbeddedSdk();
      zoomClientRef.current = zoomSdk.createClient();

      await zoomClientRef.current.init({
        zoomAppRoot: zoomRootRef.current,
        language: 'en-US',
        patchJsMedia: true,
        leaveOnPageUnload: true,
      });

      const joinArgs: Record<string, string> = {
        signature: credentials.signature,
        meetingNumber: String(credentials.meetingNumber),
        password: credentials.password || '',
        userName: getStudentDisplayName(currentUser),
      };

      if (credentials.tk) {
        joinArgs.tk = credentials.tk;
      }

      await zoomClientRef.current.join(joinArgs);

      joiningLiveIdRef.current = null;
    } catch (error: any) {
      console.error('Zoom join failed:', error);

      joiningLiveIdRef.current = null;

      throw new Error(
        error?.message ||
          'Zoom පන්තියට සම්බන්ධ වීමට නොහැකි විය. කරුණාකර නැවත උත්සාහ කරන්න.',
      );
    }
  }, [currentUser, leaveZoomMeeting]);

  const activeClass = currentClosestClass;
  const activeAccess = activeClass
    ? accessByLiveId[activeClass.id]
    : undefined;

  const classDateTime = activeClass
    ? parseLiveDateTime(activeClass)
    : new Date(NaN);

  const diffSeconds =
    activeClass && isValid(classDateTime)
      ? differenceInSeconds(classDateTime, currentTime)
      : 0;

  const isWithinOneHour =
    diffSeconds > 0 && diffSeconds <= 60 * 60;

  const isWithinTenMinutes =
    diffSeconds > 0 && diffSeconds <= 10 * 60;

  const isLive = activeClass?.status === 'live';

  /*
   * Automatic Zoom join:
   * When admin changes scheduled_lives.status -> "live",
   * realtime refreshes the class and this effect joins automatically.
   *
   * We do not request Zoom credentials if the student is not eligible.
   */
  useEffect(() => {
    if (!activeClass || !isLive || !activeAccess?.allowed) return;

    let cancelled = false;

    const startJoin = async () => {
      try {
        setErrorMessage('');

        if (!cancelled) {
          await joinZoomMeeting(activeClass, activeAccess);
        }
      } catch (error: any) {
        if (!cancelled) {
          setErrorMessage(
            error?.message ||
              'Zoom පන්තියට සම්බන්ධ වීමට නොහැකි විය.',
          );
        }
      }
    };

    void startJoin();

    return () => {
      cancelled = true;
    };
  }, [activeAccess, activeClass, isLive, joinZoomMeeting]);

  useEffect(() => {
    return () => {
      void leaveZoomMeeting();
    };
  }, [leaveZoomMeeting]);

  /*
   * Exam logic
   */
  useEffect(() => {
    if (!studentId) {
      setActiveExam(null);
      setExamAnswers({});
      setExamTimeLeft(0);
      return;
    }

    let cancelled = false;

    const fetchExamDetails = async (examId: string) => {
      const { data: previousSubmission, error: previousError } =
        await supabase
          .from('exam_results')
          .select('id,score,submitted_at')
          .eq('exam_id', examId)
          .eq('student_id', currentUser.id)
          .maybeSingle();

      if (previousError) {
        console.error(
          'Previous exam result lookup failed:',
          previousError,
        );
      }

      if (previousSubmission) {
        if (!cancelled) {
          setIsExamSubmitted(true);
          setActiveExam(null);
        }
        return;
      }

      const { data: examInfo, error } = await supabase
        .from('exams')
        .select('*')
        .eq('id', examId)
        .maybeSingle();

      if (error) {
        console.error('Exam lookup failed:', error);
        return;
      }

      if (examInfo && !cancelled) {
        setActiveExam(examInfo as ExamData);
        setExamTimeLeft(
          Number(examInfo.duration_minutes || 0) * 60,
        );
        setIsExamSubmitted(false);
        setExamAnswers({});
      }
    };

    if (
      activeClass?.is_exam_active &&
      activeClass.active_exam_id &&
      activeAccess?.allowed
    ) {
      void fetchExamDetails(activeClass.active_exam_id);
    } else {
      setActiveExam(null);
      setExamAnswers({});
      setExamTimeLeft(0);
    }

    return () => {
      cancelled = true;
    };
  }, [
    activeAccess?.allowed,
    activeClass?.active_exam_id,
    activeClass?.is_exam_active,
    studentId,
  ]);

  useEffect(() => {
    if (
      !activeExam ||
      examTimeLeft <= 0 ||
      isExamSubmitted ||
      showResultModal
    ) {
      return;
    }

    const timer = window.setInterval(() => {
      setExamTimeLeft((previous) => {
        if (previous <= 1) {
          window.clearInterval(timer);
          void handleSubmitExam(true);
          return 0;
        }

        return previous - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [
    activeExam,
    examTimeLeft,
    isExamSubmitted,
    showResultModal,
  ]);

  const handleAnswerSelect = (
    questionNumber: number,
    answerIndex: number,
  ) => {
    setExamAnswers((previous) => ({
      ...previous,
      [questionNumber]: answerIndex,
    }));
  };

  const handleSubmitExam = async (isAutoSubmit = false) => {
    if (!activeExam || isExamSubmitted || !currentUser || !studentId) return;

    if (
      !isAutoSubmit &&
      !window.confirm(
        'පිළිතුරු පත්‍රය ලබා දීමට ඔබට විශ්වාසද? (Are you sure you want to submit?)',
      )
    ) {
      return;
    }

    let score = 0;
    const correctAnswers = activeExam.correct_answer || {};

    for (
      let i = 1;
      i <= activeExam.total_questions;
      i += 1
    ) {
      if (
        examAnswers[i] &&
        correctAnswers[String(i)] &&
        examAnswers[i] === correctAnswers[String(i)]
      ) {
        score += 1;
      }
    }

    try {
      const { error } = await supabase
        .from('exam_results')
        .insert([
          {
            username: currentUser.username,
            student_id: currentUser.id,
            exam_id: activeExam.id,
            score,
            meta_data: examAnswers,
            submitted_at: new Date().toISOString(),
          },
        ]);

      if (error) throw error;

      setExamResult({
        score,
        total: activeExam.total_questions,
      });

      setShowResultModal(true);
      setIsExamSubmitted(true);
      setActiveExam(null);
    } catch (error) {
      console.error('Exam submission failed:', error);
      window.alert(
        'පද්ධතියේ දෝෂයක්. නැවත උත්සාහ කරන්න.',
      );
    }
  };

  const formatTimeLeft = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;

    return `${h > 0 ? `${h}h ` : ''}${m
      .toString()
      .padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`;
  };

  const retryCurrentClass = async () => {
    if (!activeClass || !activeAccess?.allowed) return;

    setErrorMessage('');

    try {
      await joinZoomMeeting(activeClass, activeAccess);
    } catch (error: any) {
      setErrorMessage(
        error?.message ||
          'Zoom පන්තියට සම්බන්ධ වීමට නොහැකි විය.',
      );
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="flex items-center gap-3 text-gray-300">
          <RefreshCw
            className="animate-spin text-blue-500"
            size={20}
          />
          දත්ත පූරණය වෙමින් පවතී...
        </div>
      </div>
    );
  }

  /*
   * No class within the next 24 hours.
   */
  if (!activeClass) {
    return (
      <div className="min-h-screen bg-black text-white p-6 md:p-10 font-sans">
        <h2 className="text-2xl font-bold text-gray-300 mb-8 flex items-center gap-3">
          <Calendar className="text-blue-500" />
          ඉදිරි පන්ති කාලසටහන (Upcoming Schedule)
        </h2>

        {futureClasses.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {futureClasses.map((cls) => {
              const access = accessByLiveId[cls.id];

              return (
                <div
                  key={cls.id}
                  className="bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-lg"
                >
                  <div className="flex justify-between gap-3 items-start">
                    <span className="bg-blue-500/10 text-blue-400 text-xs px-3 py-1 rounded-full font-bold uppercase">
                      {getClassType(cls) || 'Class'}
                    </span>

                    {!access?.allowed && (
                      <LockKeyhole
                        size={17}
                        className="text-red-400"
                      />
                    )}
                  </div>

                  <h3 className="text-xl font-bold mt-4 mb-2">
                    {cls.title}
                  </h3>

                  <div className="flex items-center text-gray-400 text-sm gap-2 mt-2">
                    <Calendar size={16} />
                    {cls.date}
                  </div>

                  <div className="flex items-center text-gray-400 text-sm gap-2 mt-2">
                    <Clock size={16} />
                    {cls.time}
                  </div>

                  {!access?.allowed && (
                    <div className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm">
                      {access?.message}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-20 bg-gray-900 border border-gray-800 rounded-2xl">
            <h3 className="text-xl text-gray-500">
              ඉදිරි දින කිහිපය සඳහා පන්ති කාලසටහන් කර නොමැත.
            </h3>
          </div>
        )}
      </div>
    );
  }

  /*
   * Class exists but student is not eligible.
   * No Zoom SDK is initialized and no Zoom signature is requested.
   */
  if (!activeAccess) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center p-5">
        <div className="max-w-xl w-full bg-gray-900 border border-red-500/20 rounded-3xl p-7 md:p-10 shadow-2xl">
          <div className="text-gray-300">ප්‍රවේශ තොරතුරු පූරණය වෙමින් පවතී...</div>
        </div>
      </div>
    );
  }

  if (!activeAccess.allowed) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center p-5">
        <div className="max-w-xl w-full bg-gray-900 border border-red-500/20 rounded-3xl p-7 md:p-10 shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center mb-6">
            {activeAccess.reason === 'absent' ? (
              <UserX size={30} />
            ) : (
              <LockKeyhole size={30} />
            )}
          </div>

          <h1 className="text-2xl md:text-3xl font-black mb-3">
            සජීවි පන්තියට ප්‍රවේශය නොමැත
          </h1>

          <p className="text-gray-300 leading-7">
            {activeAccess.message}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-7">
            <div className="bg-black/40 border border-gray-800 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">
                වර්තමාන මාසය
              </p>
              <p className="font-bold text-white">
                {activeAccess.month}
              </p>
            </div>

            <div className="bg-black/40 border border-gray-800 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">
                පන්ති වර්ගය
              </p>
              <p className="font-bold text-white">
                {activeAccess.classType || '—'}
              </p>
            </div>
          </div>

          <div className="mt-7 bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-amber-300 text-sm flex gap-3">
            <CreditCard size={19} className="shrink-0 mt-0.5" />
            <span>
              කරුණාකර අදාළ මාසයට ගෙවීම සම්පූර්ණ කර පන්තියට
              සම්බන්ධ වන්න.
            </span>
          </div>
        </div>
      </div>
    );
  }

  /*
   * More than one hour before the class.
   */
  if (!isLive && !isWithinOneHour) {
    return (
      <div className="min-h-screen bg-black text-white p-6 md:p-10 font-sans">
        <h2 className="text-2xl font-bold text-gray-300 mb-8 flex items-center gap-3">
          <Clock className="text-amber-500" />
          පැය 24ක් ඇතුළත පැවැත්වෙන පන්ති
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {upcomingClasses.map((cls, index) => {
            const clsTime = parseLiveDateTime(cls);

            const secDiff = isValid(clsTime)
              ? differenceInSeconds(clsTime, currentTime)
              : 0;

            const hrs = Math.max(
              0,
              Math.floor(secDiff / 3600),
            );

            const mins = Math.max(
              0,
              Math.floor((secDiff % 3600) / 60),
            );

            const access = accessByLiveId[cls.id];

            return (
              <div
                key={cls.id}
                className="bg-gray-900 border border-gray-800 rounded-2xl p-6 relative overflow-hidden"
              >
                {index === 0 && (
                  <div className="absolute top-0 left-0 w-full h-1 bg-amber-500" />
                )}

                <span className="bg-gray-800 text-gray-300 text-xs px-3 py-1 rounded-full font-bold uppercase">
                  {getClassType(cls) || 'Class'}
                </span>

                <h3 className="text-xl font-bold mt-4 mb-2">
                  {cls.title}
                </h3>

                <p className="text-gray-400 text-sm mb-4">
                  දිනය: {cls.date} | වේලාව: {cls.time}
                </p>

                <div className="bg-black/50 p-3 rounded-xl border border-gray-800 text-center">
                  <p className="text-xs text-gray-500 mb-1">
                    පන්තිය ආරම්භ වීමට තව
                  </p>

                  <p className="text-xl font-mono text-amber-400 font-bold">
                    {hrs} පැය {mins} විනාඩි
                  </p>
                </div>

                {!access?.allowed && (
                  <div className="mt-4 text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                    {access?.message}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  /*
   * Within one hour but not yet live.
   */
  if (!isLive && isWithinOneHour) {
    const countdownM = Math.max(
      0,
      Math.floor(diffSeconds / 60),
    );

    const countdownS = Math.max(0, diffSeconds % 60);

    return (
      <div className="w-full min-h-screen bg-black text-white flex flex-col p-4 md:p-8">
        <div className="flex flex-col items-center justify-center flex-1 relative rounded-2xl overflow-hidden bg-gray-950 min-h-[75vh] border border-gray-800 shadow-2xl">
          {isWithinTenMinutes && (
            <video
              autoPlay
              loop
              muted
              playsInline
              className="absolute inset-0 w-full h-full object-cover opacity-40 z-0 pointer-events-none"
              src={
                activeClass.pre_class_video_path ||
                '/videos/waiting-video.mp4'
              }
            />
          )}

          <div className="relative z-10 flex flex-col items-center p-8 bg-black/60 rounded-3xl backdrop-blur-md border border-white/10 max-w-lg w-full mx-4 shadow-2xl">
            <span className="text-xs font-bold uppercase tracking-widest bg-blue-500/20 text-blue-400 px-4 py-1.5 rounded-full mb-4 border border-blue-500/30">
              {getClassType(activeClass)} - {activeClass.title}
            </span>

            <h2 className="text-lg md:text-xl text-gray-300 text-center mb-6 font-medium">
              පන්තිය ආරම්භ වීමට තව...
            </h2>

            <div className="text-7xl md:text-8xl font-mono font-black text-white tracking-widest">
              {String(countdownM).padStart(2, '0')}:
              {String(countdownS).padStart(2, '0')}
            </div>

            <p className="mt-8 text-green-400 animate-pulse text-sm font-bold bg-green-500/10 px-5 py-3 rounded-xl border border-green-500/20 flex items-center gap-2">
              <Clock size={18} />
              ගුරුතුමා විසින් පන්තිය සක්‍රීය කරන තුරු මඳක්
              රැඳී සිටින්න...
            </p>

            {isWithinTenMinutes && (
              <p className="mt-6 text-amber-400/80 text-xs font-medium text-center">
                කරුණාකර පන්තිය සඳහා අවශ්‍ය පොත්පත් සහ ද්‍රව්‍ය
                සූදානම් කරගන්න.
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  /*
   * LIVE CLASS
   *
   * Official Zoom Meeting SDK Component View is used here instead
   * of trying to iframe zoom_join_url directly.
   */
  if (isLive) {
    const isExamPushed = Boolean(activeExam);

    return (
      <div className="w-full min-h-screen h-screen bg-black text-white flex flex-col overflow-hidden">
        <div className="bg-gray-950 px-4 py-2 flex justify-between items-center border-b border-gray-800 shrink-0">
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-600" />
            </span>

            <div>
              <span className="font-bold text-sm text-gray-200">
                {activeClass.title}
              </span>

              <span className="text-xs text-gray-500 ml-2">
                {getClassType(activeClass)}
              </span>

              {isExamPushed && (
                <span className="text-amber-400 ml-2 text-xs font-bold">
                  | Live Exam Active
                </span>
              )}
            </div>
          </div>
        </div>

        {errorMessage && (
          <div className="shrink-0 bg-red-950/80 border-b border-red-500/20 px-4 py-3">
            <div className="max-w-5xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2 text-red-200 text-sm">
                <AlertCircle
                  size={18}
                  className="shrink-0 mt-0.5"
                />
                <span>{errorMessage}</span>
              </div>

              <button
                type="button"
                onClick={retryCurrentClass}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-bold"
              >
                <RefreshCw size={15} />
                නැවත සම්බන්ධ වන්න
              </button>
            </div>
          </div>
        )}

        <div
          className={`flex-1 min-h-0 w-full ${
            isExamPushed
              ? 'flex flex-col lg:flex-row'
              : 'flex'
          }`}
        >
          <div
            className={
              isExamPushed
                ? 'h-[48vh] lg:h-full lg:w-[55%] flex flex-col border-b lg:border-b-0 lg:border-r border-gray-800 bg-black'
                : 'w-full h-full bg-black'
            }
          >
            <div
              ref={zoomRootRef}
              id="meetingSDKElement"
              className="w-full h-full min-h-0 bg-black"
            />
          </div>

          {isExamPushed && (
            <div className="h-[52vh] lg:h-full lg:w-[45%] bg-gray-950 flex flex-col min-h-0">
              <div className="bg-gray-900 p-3 flex justify-between items-center border-b border-gray-800 shadow-md z-10 shrink-0">
                <div className="text-xs text-gray-400 font-bold uppercase">
                  Answer Sheet
                </div>

                <div
                  className={`font-mono font-bold text-sm px-3 py-1 rounded border ${
                    examTimeLeft < 300
                      ? 'bg-red-500/10 text-red-500 border-red-500/30 animate-pulse'
                      : 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                  }`}
                >
                  Time: {formatTimeLeft(examTimeLeft)}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                <div className="grid grid-cols-1 gap-2">
                  {Array.from(
                    {
                      length: activeExam?.total_questions ?? 0,
                    },
                    (_, i) => i + 1,
                  ).map((questionNumber) => (
                    <div
                      key={questionNumber}
                      className="flex items-center justify-between bg-gray-900 p-2 rounded-lg border border-gray-800"
                    >
                      <span className="text-gray-400 font-mono w-6 text-sm">
                        {questionNumber}.
                      </span>

                      <div className="flex gap-2">
                        {[1, 2, 3, 4, 5].map((option) => (
                          <button
                            key={option}
                            type="button"
                            onClick={() =>
                              handleAnswerSelect(
                                questionNumber,
                                option,
                              )
                            }
                            className={`w-8 h-8 rounded-full text-xs font-bold transition flex items-center justify-center border ${
                              examAnswers[questionNumber] ===
                              option
                                ? 'bg-blue-600 border-blue-500 text-white'
                                : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'
                            }`}
                          >
                            {option}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-4 bg-gray-900 border-t border-gray-800 shrink-0">
                <button
                  type="button"
                  onClick={() => void handleSubmitExam(false)}
                  className="w-full bg-amber-600 hover:bg-amber-500 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition"
                >
                  <Send size={18} />
                  Submit Answers Now
                </button>
              </div>
            </div>
          )}
        </div>

        {showResultModal && examResult && (
          <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-gray-900 border border-green-500/30 p-8 rounded-3xl max-w-md w-full text-center shadow-2xl">
              <div className="w-20 h-20 bg-green-500/20 text-green-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle2 size={40} />
              </div>

              <h2 className="text-3xl font-bold text-white mb-2">
                Submitted Successfully!
              </h2>

              <p className="text-gray-400 mb-8">
                ඔබගේ පිළිතුරු පත්‍රය සාර්ථකව යොමු කරන ලදී.
              </p>

              <div className="bg-gray-950 rounded-2xl p-6 border border-gray-800 mb-8">
                <p className="text-sm text-gray-500 font-bold uppercase mb-2">
                  ඔබ ලබාගත් ලකුණු ප්‍රමාණය
                </p>

                <div className="text-6xl font-black text-amber-500 flex items-baseline justify-center gap-2">
                  {examResult.score}
                  <span className="text-2xl text-gray-600">
                    / {examResult.total}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowResultModal(false)}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-xl transition"
              >
                Close & Return to Full Screen Video
              </button>
            </div>
          </div>
        )}

        {/*
         * Keep imports from the existing file available if the project
         * tree performs strict icon bundling checks.
         */}
        <span className="hidden">
          <Video />
          <FileText />
        </span>
      </div>
    );
  }

  return null;
};

export default LiveClassPlayer;
