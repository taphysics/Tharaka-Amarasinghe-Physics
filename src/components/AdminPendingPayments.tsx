import React, { useState, useEffect } from 'react';
import { 
  PendingPaymentRequest, 
  fetchAllPendingPayments, 
  approvePendingPayment, 
  rejectPendingPayment,
  deletePendingPaymentRequest
} from '../pendingPaymentsService';
import { subscribeRealtimeEvents } from '../realtimeSync';
import { 
  Clock, CheckCircle, XCircle, Search, MessageSquare, Copy, 
  Check, RefreshCw, AlertTriangle, ShieldCheck, Filter, User, CreditCard, QrCode,
  Trash2
} from 'lucide-react';

export default function AdminPendingPayments() {
  const [requests, setRequests] = useState<PendingPaymentRequest[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [filterStatus, setFilterStatus] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PendingPaymentRequest | null>(null);

  const loadRequests = async () => {
    setLoading(true);
    const data = await fetchAllPendingPayments();
    setRequests(data);
    setLoading(false);
  };

  useEffect(() => {
    loadRequests();

    // Live continuous 1.5s polling from database
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      loadRequests();
    }, 1500);

    // Subscribe to realtime updates from students or other admin tabs
    const unsubscribe = subscribeRealtimeEvents((type) => {
      if (
        type === 'pending_payment_submitted' || 
        type === 'pending_payment_deleted' ||
        type === 'payment_approved' || 
        type === 'payment_rejected'
      ) {
        loadRequests();
      }
    });

    return () => {
      clearInterval(timer);
      unsubscribe();
    };
  }, []);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Custom Modal States replacing window.confirm and window.prompt
  const [approveTarget, setApproveTarget] = useState<PendingPaymentRequest | null>(null);
  const [rejectTarget, setRejectTarget] = useState<PendingPaymentRequest | null>(null);
  const [rejectReason, setRejectReason] = useState<string>('ගෙවීම් රිසීට් පතේ Transaction ID තහවුරු කරගත නොහැකි විය.');
  const [customRejectReason, setCustomRejectReason] = useState<string>('');

  const confirmApprove = async () => {
    if (!approveTarget) return;
    setProcessingId(approveTarget.id);
    try {
      await approvePendingPayment(approveTarget.id);
      await loadRequests();
      setApproveTarget(null);
    } catch (e) {
      console.error(e);
      alert('අනුමත කිරීමේදී දෝෂයක් ඇති විය.');
    } finally {
      setProcessingId(null);
    }
  };

  const confirmReject = async () => {
    if (!rejectTarget) return;
    const finalReason = customRejectReason.trim() ? customRejectReason.trim() : rejectReason;
    setProcessingId(rejectTarget.id);
    try {
      await rejectPendingPayment(rejectTarget.id, finalReason);
      await loadRequests();
      setRejectTarget(null);
      setCustomRejectReason('');
    } catch (e) {
      console.error(e);
      alert('ප්‍රතික්ෂේප කිරීමේදී දෝෂයක් ඇති විය.');
    } finally {
      setProcessingId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setProcessingId(deleteTarget.id);
    try {
      await deletePendingPaymentRequest(deleteTarget.id);
      setRequests(prev => prev.filter(r => r.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (e) {
      console.error(e);
      alert('වාර්තාව මකා දැමීමේදී දෝෂයක් ඇති විය.');
    } finally {
      setProcessingId(null);
    }
  };

  const [filterClass, setFilterClass] = useState<string>('all');

  const pendingCount = requests.filter(r => r.status === 'pending').length;
  const approvedCount = requests.filter(r => r.status === 'approved').length;
  const rejectedCount = requests.filter(r => r.status === 'rejected').length;

  const currentMonthKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  // Default to 'all' so pending requests are never hidden from admin on entry
  const [monthFilter, setMonthFilter] = useState<'current' | 'all'>('all');

  // Extract distinct class types for tabs (supporting multi-class entries)
  const distinctClassTypes = Array.from(
    new Set(
      requests.flatMap(r => (r.class_type || '').split(',').map(s => s.trim()).filter(Boolean))
    )
  ).sort();

  const STATUS_PRIORITY: Record<string, number> = {
    pending: 1,
    approved: 2,
    rejected: 3
  };

  const filteredRequests = requests
    .filter(req => {
      if (filterStatus !== 'all' && req.status !== filterStatus) return false;
      if (filterClass !== 'all') {
        const reqClasses = (req.class_type || '').split(',').map(s => s.trim().toLowerCase());
        if (!reqClasses.includes(filterClass.toLowerCase().trim())) return false;
      }
      if (monthFilter === 'current' && req.month && req.status !== 'pending') {
        const curYear = new Date().getFullYear().toString();
        const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
        const curMonthName = monthNames[new Date().getMonth()];
        const mLower = req.month.toLowerCase();
        const matchCurrent = mLower.includes(currentMonthKey) || (mLower.includes(curYear) && mLower.includes(curMonthName));
        if (!matchCurrent) return false;
      }
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchName = (req.student_name || '').toLowerCase().includes(q);
        const matchUsername = (req.username || '').toLowerCase().includes(q);
        const matchClass = (req.class_type || '').toLowerCase().includes(q);
        const matchTx = (req.transaction_id || '').toLowerCase().includes(q);
        const matchPhone = (req.whatsapp || '').includes(q);
        return matchName || matchUsername || matchClass || matchTx || matchPhone;
      }
      return true;
    })
    .sort((a, b) => {
      // User Requirement:
      // Sort strictly in order: Pending -> Approved -> Rejected
      const pA = STATUS_PRIORITY[a.status] || 99;
      const pB = STATUS_PRIORITY[b.status] || 99;
      if (pA !== pB) return pA - pB;
      return (b.created_at || '').localeCompare(a.created_at || '');
    });

  return (
    <div className="w-full space-y-6 animate-in fade-in duration-300">
      
      {/* Top Banner / Stats Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 md:p-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div>
            <h2 className="text-xl md:text-2xl font-black text-white flex items-center gap-2.5">
              <Clock className="text-amber-400" size={26} /> 
              පොරොත්තු පන්ති ගාස්තු හා අයදුම්පත් (Pending Class Enrollments)
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              සිසුන් විසින් 'Other Classes' වෙතින් ලබාගත් නව පන්ති සඳහා ඉදිරිපත් කරන ලද බැංකු සහ QR ගෙවීම් රිසීට් තහවුරු කර සක්‍රිය කරන්න.
            </p>
          </div>

          <button
            onClick={loadRequests}
            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl border border-slate-700 flex items-center gap-2 transition cursor-pointer self-start md:self-auto"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>

        {/* Counter cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-5">
          <div 
            onClick={() => setFilterStatus('pending')}
            className={`p-4 rounded-2xl border cursor-pointer transition flex items-center justify-between ${
              filterStatus === 'pending'
                ? 'bg-amber-500/15 border-amber-500 shadow-md ring-1 ring-amber-500/40' 
                : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div>
              <p className="text-xs text-amber-400 font-bold uppercase tracking-wider">තහවුරු කිරීමට ඇති (Pending)</p>
              <h3 className="text-2xl font-black text-white mt-1">{pendingCount}</h3>
            </div>
            <div className="p-3 bg-amber-500/20 text-amber-400 rounded-2xl">
              <Clock size={22} />
            </div>
          </div>

          <div 
            onClick={() => setFilterStatus('approved')}
            className={`p-4 rounded-2xl border cursor-pointer transition flex items-center justify-between ${
              filterStatus === 'approved'
                ? 'bg-emerald-500/15 border-emerald-500 shadow-md ring-1 ring-emerald-500/40' 
                : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div>
              <p className="text-xs text-emerald-400 font-bold uppercase tracking-wider">අනුමත කළ (Approved)</p>
              <h3 className="text-2xl font-black text-white mt-1">{approvedCount}</h3>
            </div>
            <div className="p-3 bg-emerald-500/20 text-emerald-400 rounded-2xl">
              <CheckCircle size={22} />
            </div>
          </div>

          <div 
            onClick={() => setFilterStatus('rejected')}
            className={`p-4 rounded-2xl border cursor-pointer transition flex items-center justify-between ${
              filterStatus === 'rejected'
                ? 'bg-rose-500/15 border-rose-500 shadow-md ring-1 ring-rose-500/40' 
                : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div>
              <p className="text-xs text-rose-400 font-bold uppercase tracking-wider">ප්‍රතික්ෂේප කළ (Rejected)</p>
              <h3 className="text-2xl font-black text-white mt-1">{rejectedCount}</h3>
            </div>
            <div className="p-3 bg-rose-500/20 text-rose-400 rounded-2xl">
              <XCircle size={22} />
            </div>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 shadow-md">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setFilterStatus('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                filterStatus === 'all' ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              සියල්ල ({requests.length})
            </button>
            <button
              onClick={() => setFilterStatus('pending')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                filterStatus === 'pending' ? 'bg-amber-600 text-white shadow-sm' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              පොරොත්තු ({pendingCount})
            </button>
            <button
              onClick={() => setFilterStatus('approved')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                filterStatus === 'approved' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              අනුමත ({approvedCount})
            </button>
            <button
              onClick={() => setFilterStatus('rejected')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                filterStatus === 'rejected' ? 'bg-rose-600 text-white shadow-sm' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              ප්‍රතික්ෂේපිත ({rejectedCount})
            </button>

            {/* Current Month vs All Months Filter */}
            <div className="h-5 w-px bg-slate-700 mx-1 hidden sm:block" />
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => setMonthFilter('current')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                  monthFilter === 'current' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                වත්මන් මාසය ({currentMonthKey})
              </button>
              <button
                type="button"
                onClick={() => setMonthFilter('all')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                  monthFilter === 'all' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                සියලු මාස
              </button>
            </div>
          </div>

          <div className="relative flex-1 max-w-md">
            <Search size={15} className="absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="සිසුවාගේ නම, ID, පන්තිය, Transaction ID සොයන්න..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 text-xs text-white pl-9 pr-4 py-2 rounded-xl focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        {/* 29-day Auto-cleanup Policy Banner */}
        <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <div className="flex items-center gap-1.5 text-slate-400">
            <ShieldCheck size={14} className="text-emerald-400" />
            <span>
              <b>ස්වයංක්‍රීය පිරිසිදු කිරීම් නීතිය:</b> අනුමත කළ සහ ප්‍රතික්ෂේප කළ අයදුම්පත් දින 29කින් පසු මෙම පොරොත්තු ලැයිස්තුවෙන් (pending_payments) ස්වයංක්‍රීයව මකා දැමේ (ශිෂ්‍ය ගිණුම්වලට හෝ ස්ථිර ගෙවීම් ඉතිහාසයට කිසිදු බලපෑමක් නොවේ).
            </span>
          </div>
          <span className="text-[10px] text-amber-400 font-mono">
            පිළිවෙල: Pending ➔ Approved ➔ Rejected
          </span>
        </div>

        {/* Category breakdown by Class Types */}
        {distinctClassTypes.length > 0 && (
          <div className="pt-2 border-t border-slate-800/80 flex items-center gap-2 overflow-x-auto pb-1">
            <span className="text-[11px] font-bold text-slate-400 shrink-0 flex items-center gap-1">
              <Filter size={12} className="text-purple-400" /> පන්ති වර්ගය අනුව:
            </span>
            <button
              onClick={() => setFilterClass('all')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap transition cursor-pointer ${
                filterClass === 'all'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              සියලුම පන්ති ({requests.length})
            </button>
            {distinctClassTypes.map(cName => {
              const countForClass = requests.filter(r => {
                const reqClasses = (r.class_type || '').split(',').map(s => s.trim().toLowerCase());
                return reqClasses.includes(cName.toLowerCase().trim()) && (filterStatus === 'all' || r.status === filterStatus);
              }).length;
              const pendingForClass = requests.filter(r => {
                const reqClasses = (r.class_type || '').split(',').map(s => s.trim().toLowerCase());
                return reqClasses.includes(cName.toLowerCase().trim()) && r.status === 'pending';
              }).length;
              return (
                <button
                  key={cName}
                  onClick={() => setFilterClass(cName)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
                    filterClass === cName
                      ? 'bg-purple-600 text-white shadow-sm'
                      : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                  }`}
                >
                  <span>{cName}</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[9px] ${pendingForClass > 0 ? 'bg-amber-500 text-black font-extrabold' : 'bg-slate-800 text-slate-300'}`}>
                    {countForClass}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Main Request Stream */}
      {filteredRequests.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-12 text-center text-slate-400 space-y-2">
          <Clock size={36} className="mx-auto text-slate-600" />
          <p className="font-bold text-sm">මෙම තත්ත්වය යටතේ කිසිදු ගෙවීම් වාර්තාවක් හමු නොවීය.</p>
          <p className="text-xs text-slate-500">සිසුන් Other Classes හෝ Payment Invoice හරහා ගෙවීම් තොරතුරු ඉදිරිපත් කළ විට ඒවා මෙහි ස්වයංක්‍රීයව දිස්වේ.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredRequests.map((req) => {
            const isPending = req.status === 'pending';
            const isApproved = req.status === 'approved';
            const isRejected = req.status === 'rejected';
            const isBusy = processingId === req.id;

            return (
              <div 
                key={req.id}
                className={`bg-slate-900 border rounded-3xl p-5 md:p-6 transition shadow-lg ${
                  isPending 
                    ? 'border-amber-500/40 bg-gradient-to-r from-slate-900 via-amber-950/10 to-slate-900' 
                    : isApproved
                    ? 'border-emerald-500/30'
                    : 'border-rose-500/30'
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                  
                  {/* Left: Student & Class info */}
                  <div className="space-y-3 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-[11px] font-black px-2.5 py-1 rounded-xl uppercase border flex items-center gap-1.5 ${
                        isPending 
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse'
                          : isApproved
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                          : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                      }`}>
                        {isPending && <Clock size={12} />}
                        {isApproved && <CheckCircle size={12} />}
                        {isRejected && <XCircle size={12} />}
                        {req.status}
                      </span>

                      {/* Render ALL classes the student paid for (Single or Multi-class) */}
                      {(req.class_type || '').split(',').map((cItem, cIdx) => {
                        const trimmed = cItem.trim();
                        if (!trimmed) return null;
                        return (
                          <span key={cIdx} className="text-[11px] font-extrabold px-2.5 py-1 rounded-xl bg-purple-500/20 text-purple-200 border border-purple-500/40 shadow-sm flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-purple-400"></span>
                            {trimmed}
                          </span>
                        );
                      })}

                      {(req.class_type || '').includes(',') && (
                        <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-lg bg-indigo-500/25 text-indigo-300 border border-indigo-500/40">
                          {(req.class_type || '').split(',').length} Classes Bundle
                        </span>
                      )}

                      <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-lg bg-slate-800 text-slate-300 border border-slate-700">
                        {req.month}
                      </span>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white font-black text-sm shrink-0 shadow-md">
                          {req.student_name.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <h4 className="text-sm md:text-base font-extrabold text-white">
                            {req.student_name}
                          </h4>
                          <p className="text-xs font-mono text-slate-400">
                            Username: <span className="text-blue-400 font-bold">@{req.username}</span>
                          </p>
                        </div>
                      </div>

                      {req.whatsapp && (
                        <a
                          href={`https://wa.me/94${req.whatsapp.replace(/[^0-9]/g, '').replace(/^0/, '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-bold flex items-center gap-1.5 w-fit transition"
                        >
                          <MessageSquare size={13} /> {req.whatsapp} (WhatsApp)
                        </a>
                      )}
                    </div>

                    {/* Transaction & Payment Method Details */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 pt-1 text-xs">
                      <div className="p-2.5 bg-slate-950/70 border border-slate-800 rounded-xl">
                        <span className="text-slate-400 text-[10px] block">ගෙවීම් ක්‍රමය (Method):</span>
                        <span className="font-bold text-white flex items-center gap-1.5 mt-0.5">
                          {req.payment_method === 'bank' ? <CreditCard size={14} className="text-blue-400" /> : <QrCode size={14} className="text-purple-400" />}
                          {req.payment_method === 'bank' ? 'Bank Deposit' : 'QR Payment'}
                        </span>
                      </div>

                      <div className="p-2.5 bg-slate-950/70 border border-slate-800 rounded-xl">
                        <span className="text-slate-400 text-[10px] block">ගෙවූ මුදල (Amount):</span>
                        <span className="font-black font-mono text-emerald-400 text-sm mt-0.5 block">
                          රු. {req.amount ? req.amount.toLocaleString() : '3,500'}/=
                        </span>
                      </div>

                      <div className="p-2.5 bg-slate-950/70 border border-slate-800 rounded-xl">
                        <span className="text-slate-400 text-[10px] block">Transaction / Slip Ref ID:</span>
                        <div className="flex items-center justify-between gap-1 mt-0.5">
                          <span className="font-mono font-bold text-amber-300 truncate" title={req.transaction_id}>
                            {req.transaction_id}
                          </span>
                          <button
                            onClick={() => handleCopy(req.transaction_id, req.id)}
                            className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition"
                            title="Copy ID"
                          >
                            {copiedId === req.id ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                          </button>
                        </div>
                      </div>
                    </div>

                    <p className="text-[10px] text-slate-500 font-mono">
                      ඉදිරිපත් කළ වේලාව: {new Date(req.created_at).toLocaleString()}
                      {req.reviewed_at && ` • සමාලෝචනය කළේ: ${new Date(req.reviewed_at).toLocaleString()}`}
                      {req.note && ` • සටහන: ${req.note}`}
                    </p>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex flex-col sm:flex-row lg:flex-col gap-2 shrink-0 justify-center">
                    {isPending ? (
                      <>
                        <button
                          disabled={isBusy}
                          onClick={() => setApproveTarget(req)}
                          className="px-5 py-3 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 disabled:opacity-50 text-white font-extrabold text-xs rounded-2xl shadow-lg shadow-emerald-950/50 flex items-center justify-center gap-2 transition cursor-pointer"
                        >
                          <CheckCircle size={16} /> 
                          {isBusy ? 'සක්‍රිය කරමින්...' : 'අනුමත කර ඇතුළත් කරන්න (Approve)'}
                        </button>

                        <button
                          disabled={isBusy}
                          onClick={() => {
                            setRejectTarget(req);
                            setCustomRejectReason('');
                          }}
                          className="px-5 py-2.5 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/40 disabled:opacity-50 font-bold text-xs rounded-2xl flex items-center justify-center gap-2 transition cursor-pointer"
                        >
                          <XCircle size={15} /> 
                          ප්‍රතික්ෂේප කරන්න (Reject)
                        </button>
                      </>
                    ) : isApproved ? (
                      <div className="flex flex-col sm:flex-row lg:flex-col gap-2">
                        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-2xl text-center text-xs font-bold flex items-center justify-center gap-1.5">
                          <CheckCircle size={15} /> ගෙවීම අනුමත කර ඇත
                        </div>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => setDeleteTarget(req)}
                          className="px-4 py-2.5 bg-slate-800/80 hover:bg-rose-950/40 text-slate-300 hover:text-rose-400 border border-slate-700 hover:border-rose-500/40 rounded-2xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
                          title="මෙම වාර්තාව ලැයිස්තුවෙන් මකා දමන්න"
                        >
                          <Trash2 size={13} className="text-rose-400" /> 
                          <span>වාර්තාව මකන්න (Delete)</span>
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col sm:flex-row lg:flex-col gap-2">
                        <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-2xl text-center text-xs font-bold flex items-center justify-center gap-1.5">
                          <XCircle size={15} /> ගෙවීම ප්‍රතික්ෂේප කර ඇත
                        </div>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => setDeleteTarget(req)}
                          className="px-4 py-2.5 bg-slate-800/80 hover:bg-rose-950/40 text-slate-300 hover:text-rose-400 border border-slate-700 hover:border-rose-500/40 rounded-2xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
                          title="මෙම වාර්තාව ලැයිස්තුවෙන් මකා දමන්න"
                        >
                          <Trash2 size={13} className="text-rose-400" /> 
                          <span>වාර්තාව මකන්න (Delete)</span>
                        </button>
                      </div>
                    )}
                  </div>

                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* APPROVE CONFIRMATION MODAL */}
      {approveTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-emerald-500/40 rounded-3xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30 shrink-0">
                <CheckCircle size={22} />
              </div>
              <div>
                <h3 className="text-base font-bold text-white font-display">පන්ති ගෙවීම අනුමත කිරීම</h3>
                <p className="text-xs text-slate-400">Approve Student Class Enrollment</p>
              </div>
            </div>

            <div className="p-4 bg-slate-950/80 rounded-2xl border border-slate-800 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">සිසුවා:</span>
                <span className="font-bold text-white">{approveTarget.student_name} ({approveTarget.username})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">පන්ති වර්ගය:</span>
                <span className="font-bold text-purple-400">{approveTarget.class_type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">මාසය:</span>
                <span className="font-bold text-slate-300">{approveTarget.month}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">ගෙවූ මුදල:</span>
                <span className="font-bold text-emerald-400">රු. {approveTarget.amount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Tx / Ref ID:</span>
                <span className="font-mono font-bold text-amber-300">{approveTarget.transaction_id}</span>
              </div>
            </div>

            <p className="text-[11px] text-slate-300 leading-relaxed bg-emerald-500/10 p-3 rounded-xl border border-emerald-500/20">
              මෙම ගෙවීම අනුමත කළ වහාම සිසුවාගේ ඩෑෂ්බෝඩ් එකෙහි අදාළ පන්තිය සක්‍රීය වන අතර, සිසුවාට සජීවීව Notification එකක්ද නිකුත් වේ.
            </p>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setApproveTarget(null)}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition"
              >
                අවලංගු කරන්න
              </button>
              <button
                type="button"
                onClick={confirmApprove}
                disabled={processingId === approveTarget.id}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold transition shadow-lg shadow-emerald-900/30 flex items-center justify-center gap-1.5"
              >
                {processingId === approveTarget.id ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <CheckCircle size={15} />
                    <span>ඔව්, අනුමත කරන්න</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REJECT MODAL WITH REASON SELECTION */}
      {rejectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-rose-500/40 rounded-3xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center border border-rose-500/30 shrink-0">
                <XCircle size={22} />
              </div>
              <div>
                <h3 className="text-base font-bold text-white font-display">ගෙවීම ප්‍රතික්ෂේප කිරීම</h3>
                <p className="text-xs text-slate-400">Reject Payment Request</p>
              </div>
            </div>

            <p className="text-xs text-slate-300">
              <b>{rejectTarget.student_name}</b> ගේ [<b>{rejectTarget.class_type}</b>] පන්ති ගෙවීම ප්‍රතික්ෂේප කිරීමට හේතුව (සිසුවාට දිස්වන පණිවිඩය):
            </p>

            <div className="space-y-2">
              {[
                'ගෙවීම් රිසීට් පතේ Transaction ID තහවුරු කරගත නොහැකි විය.',
                'බැංකු රිසීට් පත නොපැහැදිලියි. කරුණාකර පැහැදිලි රිසීට් පතක් නැවත යොමු කරන්න.',
                'ගෙවූ මුදල පන්ති ගාස්තුවට ප්‍රමාණවත් නොවේ.',
                'වෙනත් පන්තියකට අදාළ රිසීට් පතක් ඉදිරිපත් කර ඇත.'
              ].map((reason, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setRejectReason(reason);
                    setCustomRejectReason('');
                  }}
                  className={`w-full text-left p-2.5 rounded-xl text-xs transition border cursor-pointer ${
                    rejectReason === reason && !customRejectReason
                      ? 'bg-rose-500/20 border-rose-500 text-rose-200 font-bold'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  • {reason}
                </button>
              ))}

              <div className="space-y-1 pt-1">
                <label className="text-[11px] text-slate-400">වෙනත් හේතුවක් (Custom Reason):</label>
                <input
                  type="text"
                  placeholder="වෙනත් හේතුවක් ඇත්නම් මෙහි ලියන්න..."
                  value={customRejectReason}
                  onChange={(e) => setCustomRejectReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-xs bg-slate-950 border border-slate-800 text-white focus:border-rose-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setRejectTarget(null)}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition"
              >
                අවලංගු කරන්න
              </button>
              <button
                type="button"
                onClick={confirmReject}
                disabled={processingId === rejectTarget.id}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-extrabold transition shadow-lg shadow-rose-900/30 flex items-center justify-center gap-1.5"
              >
                {processingId === rejectTarget.id ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <XCircle size={15} />
                    <span>ප්‍රතික්ෂේප කරන්න</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-rose-500/40 rounded-3xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center border border-rose-500/30 shrink-0">
                <Trash2 size={22} />
              </div>
              <div>
                <h3 className="text-base font-bold text-white font-display">වාර්තාව මකා දැමීම (Delete Record)</h3>
                <p className="text-xs text-slate-400">Permanently Remove from Pending Payments Table</p>
              </div>
            </div>

            <div className="p-4 bg-slate-950/80 rounded-2xl border border-slate-800 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">සිසුවා:</span>
                <span className="font-bold text-white">{deleteTarget.student_name} ({deleteTarget.username})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">පන්ති වර්ගය:</span>
                <span className="font-bold text-purple-400">{deleteTarget.class_type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">මාසය:</span>
                <span className="font-bold text-slate-300">{deleteTarget.month}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">තත්ත්වය:</span>
                <span className={`font-bold uppercase ${deleteTarget.status === 'approved' ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {deleteTarget.status}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Tx / Ref ID:</span>
                <span className="font-mono font-bold text-amber-300">{deleteTarget.transaction_id}</span>
              </div>
            </div>

            <p className="text-[11px] text-slate-300 leading-relaxed bg-rose-500/10 p-3 rounded-xl border border-rose-500/20">
              මෙම වාර්තාව මෙම පොරොත්තු ලැයිස්තුවෙන් (pending_payments table) ස්ථිරවම මකා දැමෙනු ඇත. (සිසුවාගේ පන්ති ප්‍රවේශයට හෝ ස්ථිර ගෙවීම් ඉතිහාසයට මෙයින් බාධාවක් නොවේ).
            </p>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition cursor-pointer"
              >
                අවලංගු කරන්න
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={processingId === deleteTarget.id}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-extrabold transition shadow-lg shadow-rose-900/30 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {processingId === deleteTarget.id ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Trash2 size={15} />
                    <span>ඔව්, මකා දමන්න</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
