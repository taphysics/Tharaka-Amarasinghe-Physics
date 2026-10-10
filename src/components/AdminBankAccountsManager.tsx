import React, { useState, useEffect } from 'react';
import { 
  CreditCard, Plus, Trash2, Edit3, CheckCircle, X, 
  ExternalLink, QrCode, AlertCircle, Building2, Copy, Check, Eye, EyeOff
} from 'lucide-react';
import { 
  BankAccount, 
  fetchBankAccounts, 
  addBankAccount, 
  updateBankAccount, 
  deleteBankAccount 
} from '../bankAccountsService';
import { subscribeRealtimeEvents } from '../realtimeSync';
import SecurityPasswordModal from './SecurityPasswordModal';

export default function AdminBankAccountsManager() {
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BankAccount | null>(null);

  // Form Fields
  const [bankName, setBankName] = useState('');
  const [accountName, setAccountName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [branch, setBranch] = useState('');
  const [bankLogo, setBankLogo] = useState('');
  const [qrCodeUrl, setQrCodeUrl] = useState('/qr-payment.PNG');
  const [instructions, setInstructions] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadAccounts();
    const unsub = subscribeRealtimeEvents((type) => {
      if (type === 'bank_accounts_updated') {
        loadAccounts();
      }
    });
    return unsub;
  }, []);

  const loadAccounts = async () => {
    setLoading(true);
    try {
      const data = await fetchBankAccounts();
      setBankAccounts(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAddModal = () => {
    setEditingAccount(null);
    setBankName('');
    setAccountName('S K S Tharaka Amarasinghe');
    setAccountNumber('');
    setBranch('Ampara (අම්පාර)');
    setBankLogo('/Peoples-bank-logo.jpg');
    setQrCodeUrl('/qr-payment.PNG');
    setInstructions('මුදල් තැන්පත් කළ පසු රිසීට් පතේ Transaction ID / Reference අංකය ඇතුළත් කර සබ්මිට් කරන්න.');
    setIsActive(true);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (acc: BankAccount) => {
    setEditingAccount(acc);
    setBankName(acc.bank_name);
    setAccountName(acc.account_name);
    setAccountNumber(acc.account_number);
    setBranch(acc.branch);
    setBankLogo(acc.bank_logo || '');
    setQrCodeUrl(acc.qr_code_url || '/qr-payment.PNG');
    setInstructions(acc.instructions || '');
    setIsActive(acc.is_active);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bankName.trim() || !accountNumber.trim() || !accountName.trim()) {
      setStatusMessage({ type: 'error', text: 'කරුණාකර බැංකුවේ නම, ගිණුම් අංකය සහ ගිණුම් හිමියාගේ නම ඇතුළත් කරන්න.' });
      return;
    }

    setSubmitting(true);
    try {
      if (editingAccount) {
        await updateBankAccount(editingAccount.id, {
          bank_name: bankName.trim(),
          account_name: accountName.trim(),
          account_number: accountNumber.trim(),
          branch: branch.trim(),
          bank_logo: bankLogo.trim() || undefined,
          qr_code_url: qrCodeUrl.trim() || '/qr-payment.PNG',
          instructions: instructions.trim(),
          is_active: isActive
        });
        setStatusMessage({ type: 'success', text: 'බැංකු ගිණුම් විස්තර සාර්ථකව යාවත්කාලීන කරන ලදී!' });
      } else {
        await addBankAccount({
          bank_name: bankName.trim(),
          account_name: accountName.trim(),
          account_number: accountNumber.trim(),
          branch: branch.trim(),
          bank_logo: bankLogo.trim() || undefined,
          qr_code_url: qrCodeUrl.trim() || '/qr-payment.PNG',
          instructions: instructions.trim(),
          is_active: isActive
        });
        setStatusMessage({ type: 'success', text: 'නව බැංකු ගිණුම සාර්ථකව එක් කරන ලදී!' });
      }
      setIsModalOpen(false);
      await loadAccounts();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: 'දෝෂයක් සිදුවිය: ' + (err.message || '') });
    } finally {
      setSubmitting(false);
      setTimeout(() => setStatusMessage(null), 4000);
    }
  };

  const executeDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteBankAccount(deleteTarget.id);
      setStatusMessage({ type: 'success', text: `[${deleteTarget.bank_name}] බැංකු ගිණුම සාර්ථකව ඉවත් කරන ලදී.` });
      await loadAccounts();
    } catch (e: any) {
      setStatusMessage({ type: 'error', text: 'ඉවත් කිරීමේදී දෝෂයක් මතු විය.' });
    }
    setDeleteTarget(null);
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const handleToggleActive = async (acc: BankAccount) => {
    try {
      await updateBankAccount(acc.id, { is_active: !acc.is_active });
      await loadAccounts();
    } catch (e) {}
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="w-full space-y-6">
      
      {/* Top Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-600/20 border border-blue-500/30 rounded-2xl text-blue-400">
              <Building2 size={26} />
            </div>
            <div>
              <h2 className="text-xl md:text-2xl font-black text-white">
                🏦 බැංකු ගිණුම් විස්තර කළමනාකරණය (Bank Accounts Manager)
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                මෙහි සිදුකරන සියලුම වෙනස්කම් සිසුවාට පෙන්වන Payment Invoice එකේ සහ Available Classes Join Cart එකෙහි ක්ෂණිකව සජීවී වේ.
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={handleOpenAddModal}
          className="px-5 py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-extrabold text-xs uppercase tracking-wider rounded-2xl transition shadow-lg shadow-blue-900/40 flex items-center gap-2 cursor-pointer shrink-0"
        >
          <Plus size={16} /> නව බැංකු ගිණුමක් එක් කරන්න (Add Bank)
        </button>
      </div>

      {/* Status Alert */}
      {statusMessage && (
        <div className={`p-4 rounded-2xl text-xs font-bold flex items-center gap-2.5 shadow-md ${
          statusMessage.type === 'success' 
            ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300' 
            : 'bg-rose-500/15 border border-rose-500/30 text-rose-300'
        }`}>
          {statusMessage.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
          {statusMessage.text}
        </div>
      )}

      {/* Bank Accounts Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {bankAccounts.map((acc) => (
          <div
            key={acc.id}
            className={`p-6 rounded-3xl border flex flex-col justify-between gap-4 transition shadow-xl relative ${
              acc.is_active 
                ? 'bg-slate-900 border-slate-800 hover:border-slate-700' 
                : 'bg-slate-950/70 border-slate-900 opacity-60'
            }`}
          >
            {/* Top row: Bank name + logo + status badge */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  {acc.bank_logo ? (
                    <img 
                      src={acc.bank_logo} 
                      alt={acc.bank_name} 
                      className="w-8 h-8 rounded-lg object-contain bg-white p-0.5 border border-slate-800 shrink-0" 
                      onError={(e: any) => { e.target.style.display = 'none'; }}
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center font-bold text-xs shrink-0">
                      🏦
                    </div>
                  )}
                  <h3 className="text-sm font-extrabold text-white truncate" title={acc.bank_name}>
                    {acc.bank_name}
                  </h3>
                </div>

                <button
                  onClick={() => handleToggleActive(acc)}
                  className={`text-[10px] font-black px-2.5 py-1 rounded-xl uppercase border transition flex items-center gap-1 cursor-pointer ${
                    acc.is_active
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}
                  title="සක්‍රිය / අක්‍රිය කරන්න"
                >
                  {acc.is_active ? <Eye size={11} /> : <EyeOff size={11} />}
                  {acc.is_active ? 'Active' : 'Disabled'}
                </button>
              </div>

              {/* Account Number Box */}
              <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800/80 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-bold block">Account Number</span>
                  <span className="text-base font-black font-mono text-amber-300 select-all">
                    {acc.account_number}
                  </span>
                </div>
                <button
                  onClick={() => handleCopy(acc.account_number, acc.id)}
                  className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
                  title="ගිණුම් අංකය පිටපත් කරන්න"
                >
                  {copiedId === acc.id ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                </button>
              </div>

              {/* Account Holder & Branch */}
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Account Name:</span>
                  <span className="font-bold text-white text-right truncate ml-2">{acc.account_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Branch:</span>
                  <span className="font-semibold text-slate-300 text-right">{acc.branch || 'N/A'}</span>
                </div>
                {acc.instructions && (
                  <p className="text-[11px] text-slate-400 bg-slate-950/40 p-2 rounded-xl border border-slate-800/60 mt-2 leading-relaxed">
                    💡 {acc.instructions}
                  </p>
                )}
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
              <span className="text-[10px] text-slate-500 font-mono">
                {acc.qr_code_url ? '✓ LankaQR Enabled' : 'No QR'}
              </span>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => handleOpenEditModal(acc)}
                  className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition cursor-pointer"
                  title="වෙනස් කරන්න (Edit)"
                >
                  <Edit3 size={15} />
                </button>
                <button
                  onClick={() => setDeleteTarget(acc)}
                  className="p-2 bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 border border-rose-900/50 rounded-xl transition cursor-pointer"
                  title="ඉවත් කරන්න (Delete)"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {bankAccounts.length === 0 && !loading && (
        <div className="text-center py-16 bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-3">
          <Building2 size={40} className="mx-auto text-slate-600" />
          <h3 className="text-base font-bold text-slate-300">කිසිදු බැංකු ගිණුමක් හමු නොවීය</h3>
          <p className="text-xs text-slate-500">
            ඉහත "නව බැංකු ගිණුමක් එක් කරන්න" බටනය ක්ලික් කර බැංකු ගිණුම් විස්තර ඇතුළත් කරන්න.
          </p>
        </div>
      )}

      {/* Modal: Add or Edit Bank Account */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <h3 className="font-extrabold text-sm md:text-base text-white flex items-center gap-2">
                <Building2 size={18} className="text-blue-400" />
                {editingAccount ? 'බැංකු ගිණුම් විස්තර සංස්කරණය (Edit Bank)' : 'නව බැංකු ගිණුමක් එක් කරන්න (Add Bank)'}
              </h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
              {/* Presets */}
              <div>
                <label className="text-[11px] font-bold text-slate-400 block mb-1">බැංකු වර්ගය ඉක්මනින් තෝරන්න (Quick Presets):</label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { name: "People's Bank (මහජන බැංකුව)", logo: '/Peoples-bank-logo.jpg' },
                    { name: 'Commercial Bank (කොමර්ෂල් බැංකුව)', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Commercial_Bank_of_Ceylon_logo.png/320px-Commercial_Bank_of_Ceylon_logo.png' },
                    { name: 'Bank of Ceylon (BOC)', logo: 'https://upload.wikimedia.org/wikipedia/en/thumb/5/53/Bank_of_Ceylon_logo.svg/320px-Bank_of_Ceylon_logo.svg.png' },
                    { name: 'Sampath Bank', logo: 'https://upload.wikimedia.org/wikipedia/en/thumb/6/67/Sampath_Bank_logo.svg/320px-Sampath_Bank_logo.svg.png' },
                    { name: 'Hatton National Bank (HNB)', logo: '' }
                  ].map((p, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        setBankName(p.name);
                        if (p.logo) setBankLogo(p.logo);
                      }}
                      className="text-[10px] font-bold bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white px-2.5 py-1.5 rounded-xl transition cursor-pointer"
                    >
                      {p.name.split('(')[0]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1.5">බැංකුවේ නම (Bank Name) *</label>
                <input
                  type="text"
                  required
                  placeholder="උදා: People's Bank (මහජන බැංකුව)"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 text-white text-xs focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1.5">ගිණුම් අංකය (Account Number) *</label>
                  <input
                    type="text"
                    required
                    placeholder="උදා: 015200130036285"
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 text-white font-mono text-xs focus:outline-none focus:border-blue-500 font-bold text-amber-300"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1.5">ශාඛාව (Branch)</label>
                  <input
                    type="text"
                    placeholder="උදා: Ampara (අම්පාර)"
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 text-white text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1.5">ගිණුම් හිමියාගේ නම (Account Name) *</label>
                <input
                  type="text"
                  required
                  placeholder="උදා: S K S Tharaka Amarasinghe"
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 text-white text-xs focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1.5">බැංකු ලෝගෝ URL (Bank Logo Image URL)</label>
                <input
                  type="text"
                  placeholder="උදා: /Peoples-bank-logo.jpg හෝ online image link"
                  value={bankLogo}
                  onChange={(e) => setBankLogo(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 text-white text-xs focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1.5">QR Image URL (QR Code පින්තූරය)</label>
                <input
                  type="text"
                  placeholder="උදා: /qr-payment.PNG"
                  value={qrCodeUrl}
                  onChange={(e) => setQrCodeUrl(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 text-white text-xs focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1.5">අමතර උපදෙස් (Instructions for Student)</label>
                <textarea
                  rows={2}
                  placeholder="උදා: මුදල් තැන්පත් කළ පසු රිසීට් පතේ Reference අංකය ඇතුළත් කරන්න."
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-2.5 text-white text-xs focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="isActiveToggle"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-0 w-4 h-4 cursor-pointer"
                />
                <label htmlFor="isActiveToggle" className="text-xs text-slate-300 font-bold cursor-pointer">
                  සිසුන්ට පෙන්වීමට සක්‍රිය කරන්න (Is Active)
                </label>
              </div>

              <div className="pt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-2xl transition cursor-pointer"
                >
                  අවලංගු කරන්න (Cancel)
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-xs uppercase tracking-wider rounded-2xl transition shadow-lg shadow-blue-900/40 cursor-pointer disabled:opacity-50"
                >
                  {submitting ? 'සුරැකෙමින් පවතී...' : 'සුරකින්න (Save Bank)'}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

      {/* Security Password Protected Deletion Modal */}
      {deleteTarget && (
        <SecurityPasswordModal
          isOpen={true}
          onClose={() => setDeleteTarget(null)}
          onConfirm={executeDelete}
          title="බැංකු ගිණුම ඉවත් කිරීම (Delete Bank Account)"
          description="මෙම බැංකු ගිණුම දත්ත ගබඩාවෙන් ස්ථිරවම ඉවත් කිරීමට කරුණාකර පරිපාලක ආරක්ෂක මුරපදය ඇතුළත් කරන්න."
          itemSummary={`බැංකුව: ${deleteTarget.bank_name} - ${deleteTarget.account_number} (${deleteTarget.account_name})`}
          actionButtonText="බැංකු ගිණුම ඉවත් කරන්න (Delete Now)"
          isDangerous={true}
        />
      )}

    </div>
  );
}
