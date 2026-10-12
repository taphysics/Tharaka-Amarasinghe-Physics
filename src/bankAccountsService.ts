import { supabase } from './supabaseClient';
import { emitRealtimeEvent } from './realtimeSync';

export interface BankAccount {
  id: string;
  bank_name: string;
  account_name: string;
  account_number: string;
  branch: string;
  bank_logo?: string;
  qr_code_url?: string;
  instructions?: string;
  is_active: boolean;
  display_order?: number;
  created_at?: string;
}

const STORAGE_KEY = 'physics_hub_bank_accounts';

export const DEFAULT_BANK_ACCOUNTS: BankAccount[] = [
  {
    id: 'bank_peoples_default',
    bank_name: "People's Bank (මහජන බැංකුව)",
    account_name: 'S K S Tharaka Amarasinghe',
    account_number: '015200130036285',
    branch: 'Ampara (අම්පාර)',
    bank_logo: '/Peoples-bank-logo.jpg',
    qr_code_url: '/qr-payment.png',
    instructions: 'මුදල් තැන්පත් කළ පසු රිසීට් පතේ Transaction ID / Reference අංකය ඇතුළත් කරන්න.',
    is_active: true,
    display_order: 1,
    created_at: new Date().toISOString()
  },
  {
    id: 'bank_commercial_default',
    bank_name: 'Commercial Bank (කොමර්ෂල් බැංකුව)',
    account_name: 'S K S Tharaka Amarasinghe',
    account_number: '8005012345',
    branch: 'Ampara (අම්පාර)',
    bank_logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Commercial_Bank_of_Ceylon_logo.png/320px-Commercial_Bank_of_Ceylon_logo.png',
    qr_code_url: '/qr-payment.png',
    instructions: 'Online Banking, CDM හෝ ශාඛාවෙන් තැන්පත් කළ හැක.',
    is_active: true,
    display_order: 2,
    created_at: new Date().toISOString()
  }
];

export function getLocalBankAccounts(): BankAccount[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {}
  return DEFAULT_BANK_ACCOUNTS;
}

export function saveLocalBankAccounts(accounts: BankAccount[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
  } catch (e) {}
}

export async function fetchBankAccounts(): Promise<BankAccount[]> {
  const localList = getLocalBankAccounts();
  try {
    const { data, error } = await supabase
      .from('bank_accounts')
      .select('*')
      .order('display_order', { ascending: true });

    if (!error && data && data.length > 0) {
      const formatted: BankAccount[] = data.map((b: any) => ({
        id: b.id,
        bank_name: b.bank_name || b.bank || '',
        account_name: b.account_name || b.name || '',
        account_number: b.account_number || b.account_no || '',
        branch: b.branch || '',
        bank_logo: b.bank_logo || b.logo || '/Peoples-bank-logo.jpg',
        qr_code_url: (b.qr_code_url || '/qr-payment.png').replace(/\.PNG$/i, '.png'),
        instructions: b.instructions || '',
        is_active: b.is_active !== false,
        display_order: b.display_order || 1,
        created_at: b.created_at || new Date().toISOString()
      }));

      saveLocalBankAccounts(formatted);
      return formatted;
    }
  } catch (e) {
    console.warn('Remote bank_accounts table not found or empty, using cached accounts', e);
  }
  return localList;
}

export async function addBankAccount(account: Omit<BankAccount, 'id' | 'created_at'>): Promise<BankAccount> {
  const newAccount: BankAccount = {
    ...account,
    id: `bank_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    created_at: new Date().toISOString(),
    is_active: account.is_active ?? true
  };

  const current = getLocalBankAccounts();
  const updated = [...current, newAccount];
  saveLocalBankAccounts(updated);

  try {
    await supabase.from('bank_accounts').insert([newAccount]);
  } catch (e) {
    console.warn('Failed to insert into remote bank_accounts table', e);
  }

  emitRealtimeEvent('bank_accounts_updated' as any, newAccount);
  return newAccount;
}

export async function updateBankAccount(id: string, updates: Partial<BankAccount>): Promise<boolean> {
  const current = getLocalBankAccounts();
  const updated = current.map(item => item.id === id ? { ...item, ...updates } : item);
  saveLocalBankAccounts(updated);

  try {
    await supabase.from('bank_accounts').update(updates).eq('id', id);
  } catch (e) {
    console.warn('Failed to update remote bank_accounts table', e);
  }

  emitRealtimeEvent('bank_accounts_updated' as any, { id, updates });
  return true;
}

export async function deleteBankAccount(id: string): Promise<boolean> {
  const current = getLocalBankAccounts();
  const updated = current.filter(item => item.id !== id);
  saveLocalBankAccounts(updated);

  try {
    await supabase.from('bank_accounts').delete().eq('id', id);
  } catch (e) {
    console.warn('Failed to delete from remote bank_accounts table', e);
  }

  emitRealtimeEvent('bank_accounts_updated' as any, { id, deleted: true });
  return true;
}
