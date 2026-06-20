import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import QRCode from "react-qr-code";
import { Plus, Trash2, Power, PowerOff, Edit, Save, X } from 'lucide-react';

export default function QrGenerator() {
    const [links, setLinks] = useState<any[]>([]);
    const [title, setTitle] = useState('');
    const [url, setUrl] = useState('');
    const [editId, setEditId] = useState<string | null>(null);

    useEffect(() => {
        fetchLinks();
    }, []);

    const fetchLinks = async () => {
        const { data } = await supabase.from('qr_links').select('*').order('created_at', { ascending: false });
        setLinks(data || []);
    };

    const handleSubmit = async () => {
        if (!title || !url) return alert("කරුණාකර නම සහ ලින්ක් එක ඇතුළත් කරන්න.");

        if (editId) {
            // Update existing
            await supabase.from('qr_links').update({ title, target_url: url }).eq('id', editId);
            setEditId(null);
        } else {
            // Create new
            await supabase.from('qr_links').insert([{ title, target_url: url }]);
        }
        
        setTitle(''); setUrl('');
        fetchLinks();
    };

    const handleEdit = (link: any) => {
        setEditId(link.id);
        setTitle(link.title);
        setUrl(link.target_url);
    };

    const cancelEdit = () => {
        setEditId(null);
        setTitle('');
        setUrl('');
    };

    const toggleStatus = async (id: string, currentStatus: boolean) => {
        await supabase.from('qr_links').update({ is_active: !currentStatus }).eq('id', id);
        fetchLinks();
    };

    const handleDelete = async (id: string) => {
        if (window.confirm("මෙම QR එක සම්පූර්ණයෙන්ම මකා දැමීමට අවශ්‍යද?")) {
            await supabase.from('qr_links').delete().eq('id', id);
            fetchLinks();
        }
    };

    // වෙබ් අඩවියේ ඩොමේන් එකට අනුව Bio ලින්ක් එක හදාගන්න (උදාහරණයක් ලෙස /bio)
    const baseUrl = window.location.origin;

    return (
        <div className="lg:col-span-12 w-full space-y-6">
            <div className="bg-slate-800/40 p-4 rounded-2xl border border-slate-700/50 flex justify-between items-center">
                <h3 className="font-bold text-white text-lg flex items-center gap-2">
                    <QRCode value="icon" size={20} className="text-blue-500" /> QR Generator & Social Link Manager
                </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Form Section */}
                <div className="md:col-span-2 bg-slate-900/60 p-6 rounded-2xl border border-slate-700 space-y-4">
                    <h4 className="font-bold text-sky-400 mb-4">{editId ? 'Edit QR Code' : 'Create New QR Code'}</h4>
                    
                    <div>
                        <label className="text-sm text-slate-300 font-bold">Campaign Name (QR එකේ නම)</label>
                        <input value={title} onChange={e => setTitle(e.target.value)} className="mt-1 w-full bg-slate-950 border border-slate-800 text-white rounded-lg px-4 py-3 focus:border-sky-500 outline-none" placeholder="උදා: 2026 Batch Flyer QR" />
                    </div>
                    
                    <div>
                        <label className="text-sm text-slate-300 font-bold">Target URL (සිසුන් යා යුතු ලින්ක් එක)</label>
                        <input value={url} onChange={e => setUrl(e.target.value)} className="mt-1 w-full bg-slate-950 border border-slate-800 text-white rounded-lg px-4 py-3 focus:border-sky-500 outline-none" placeholder={`උදා: ${baseUrl}/bio`} />
                    </div>

                    <div className="flex gap-3 pt-2">
                        <button onClick={handleSubmit} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition">
                            {editId ? <><Save size={18}/> Update QR</> : <><Plus size={18}/> Generate QR</>}
                        </button>
                        {editId && (
                            <button onClick={cancelEdit} className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-3 rounded-xl font-bold transition">
                                <X size={18}/>
                            </button>
                        )}
                    </div>
                </div>

                {/* Preview Section */}
                <div className="bg-white p-6 rounded-2xl flex flex-col items-center justify-center border-4 border-slate-800">
                    <h4 className="text-slate-500 font-bold mb-4 text-sm uppercase tracking-widest">Live Preview</h4>
                    {url ? (
                        <div className="p-4 bg-white shadow-xl rounded-xl">
                            <QRCode value={url} size={180} />
                        </div>
                    ) : (
                        <div className="w-[180px] h-[180px] bg-slate-100 rounded-xl flex items-center justify-center text-slate-400 border-2 border-dashed border-slate-300">
                            No URL
                        </div>
                    )}
                    <p className="mt-4 text-xs text-slate-400 text-center">ස්කෑන් කළ විට යොමු වන ලින්ක් එකෙහි QR කේතය</p>
                </div>
            </div>

            {/* Table Section */}
            <div className="bg-slate-900/60 rounded-2xl border border-slate-700 overflow-hidden">
                <div className="overflow-x-auto p-1">
                    <table className="w-full text-left text-sm text-slate-300">
                        <thead className="bg-slate-800/50 text-slate-400">
                            <tr>
                                <th className="p-4 font-semibold">Name</th>
                                <th className="p-4 font-semibold hidden md:table-cell">Target URL</th>
                                <th className="p-4 font-semibold text-center">Status</th>
                                <th className="p-4 font-semibold text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50">
                            {links.map(link => (
                                <tr key={link.id} className="hover:bg-slate-800/20 transition">
                                    <td className="p-4 font-medium text-white">{link.title}</td>
                                    <td className="p-4 hidden md:table-cell text-slate-400 truncate max-w-[200px]">{link.target_url}</td>
                                    <td className="p-4 text-center">
                                        <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${link.is_active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                                            {link.is_active ? 'Active' : 'Disabled'}
                                        </span>
                                    </td>
                                    <td className="p-4 flex justify-end gap-2">
                                        <button onClick={() => toggleStatus(link.id, link.is_active)} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition" title={link.is_active ? "Deactivate" : "Activate"}>
                                            {link.is_active ? <PowerOff size={16} className="text-rose-400"/> : <Power size={16} className="text-emerald-400"/>}
                                        </button>
                                        <button onClick={() => handleEdit(link)} className="p-2 bg-slate-800 hover:bg-blue-900 rounded-lg transition" title="Edit">
                                            <Edit size={16} className="text-blue-400"/>
                                        </button>
                                        <button onClick={() => handleDelete(link.id)} className="p-2 bg-slate-800 hover:bg-rose-900 rounded-lg transition" title="Delete">
                                            <Trash2 size={16} className="text-rose-500"/>
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {links.length === 0 && (
                                <tr><td colSpan={4} className="p-8 text-center text-slate-500">තාමත් QR කේත කිසිවක් සාදා නොමැත.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}