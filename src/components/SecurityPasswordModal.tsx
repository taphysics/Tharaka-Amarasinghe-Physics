import React, { useState } from 'react';
import { ShieldAlert, Lock, X, CheckCircle2 } from 'lucide-react';

interface SecurityPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description?: string;
  itemSummary?: string;
  actionButtonText?: string;
  isDangerous?: boolean;
  expectedPassword?: string;
}

import { verifyDeletePin } from '../staffService';

export default function SecurityPasswordModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  itemSummary,
  actionButtonText = 'තහවුරු කරන්න (Confirm)',
  isDangerous = true,
  expectedPassword
}: SecurityPasswordModalProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanInput = password.trim();

    let isValid = false;
    if (expectedPassword && expectedPassword.trim()) {
      isValid = cleanInput === expectedPassword.trim();
    } else {
      isValid = await verifyDeletePin(cleanInput);
    }

    if (!isValid) {
      setError(true);
      return;
    }

    setError(false);
    setIsSubmitting(true);
    try {
      await onConfirm();
      setPassword('');
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setPassword('');
    setError(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden relative">
        <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-rose-500 via-amber-500 to-rose-600" />
        
        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className={`p-2.5 rounded-2xl ${isDangerous ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'}`}>
              <ShieldAlert size={22} />
            </div>
            <div>
              <h3 className="font-bold text-white text-base font-display">
                {title}
              </h3>
              <p className="text-[11px] text-slate-400">
                ආරක්ෂක මුරපදය මඟින් තහවුරු කිරීම (Security Verification)
              </p>
            </div>
          </div>
          <button 
            type="button"
            onClick={handleClose} 
            className="text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-slate-800 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {description && (
            <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/60 p-3 rounded-xl border border-slate-800">
              {description}
            </p>
          )}

          {itemSummary && (
            <div className="bg-rose-500/10 border border-rose-500/20 p-3 rounded-xl text-xs text-rose-300 font-semibold flex items-center gap-2">
              <span className="text-rose-400 font-bold">ඉලක්කය:</span>
              <span className="truncate">{itemSummary}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs text-slate-300 font-bold flex items-center gap-1.5">
              <Lock size={14} className="text-amber-400" /> 
              පරිපාලක ආරක්ෂක මුරපදය ඇතුළත් කරන්න (Security Password):
            </label>
            <input
              type="password"
              autoFocus
              required
              placeholder="Enter Security Password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError(false);
              }}
              className={`w-full px-4 py-2.5 rounded-xl text-sm bg-slate-950 border ${
                error ? 'border-rose-500 text-rose-200' : 'border-slate-800 text-white'
              } focus:border-blue-500 focus:outline-none transition font-mono`}
            />
          </div>

          {error && (
            <div className="p-3 bg-rose-500/15 border border-rose-500/40 rounded-xl text-rose-400 text-xs font-bold animate-shake">
              ⚠️ ආරක්ෂක මුරපදය වැරදියි! කරුණාකර නිවැරදි මුරපදය ඇතුළත් කරන්න.
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
            >
              අවලංගු කරන්න (Cancel)
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !password}
              className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold text-white transition shadow-lg flex items-center justify-center gap-1.5 ${
                isDangerous 
                  ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-900/20' 
                  : 'bg-blue-600 hover:bg-blue-500 shadow-blue-900/20'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {isSubmitting ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <CheckCircle2 size={15} />
                  {actionButtonText}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
