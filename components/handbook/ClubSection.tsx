import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../utils/supabase';
import { useUserRole } from '../../hooks/useUserRole';
import { Users, ExternalLink, Mail, Plus, Edit2, Trash2, X, Save, UploadCloud, Loader2, Check } from 'lucide-react';
import { playClick } from '../../utils/audio';

interface Club {
    id: number;
    name: string;
    type: string; // 'Học thuật', 'Kỹ năng', ...
    link: string;
    email: string;
    manager: string;
    logo_url?: string;
}

export const ClubSection: React.FC = () => {
    const { isAdmin, isCTV } = useUserRole();
    const canManage = isAdmin || isCTV;

    const [clubs, setClubs] = useState<Club[]>([]);
    const [loading, setLoading] = useState(true);
    const [copiedId, setCopiedId] = useState<string | null>(null);

    // Modal
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<Club | null>(null);
    const [formData, setFormData] = useState<Partial<Club>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    // Image Upload
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [imageFile, setImageFile] = useState<File | null>(null);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        if (!supabase) {
            setClubs([{ id: 1, name: 'CLB Guitar (Demo)', type: 'Sở thích & Văn thể', link: '', email: 'guitar@hub.edu.vn', manager: 'Hội SV' }]);
            setLoading(false);
            return;
        }

        const { data, error } = await supabase
            .from('clubs')
            .select('*')
            .eq('is_deleted', false)
            .order('type', { ascending: true })
            .order('name', { ascending: true });
        
        if (!error && data) setClubs(data);
        setLoading(false);
    };

    // --- Grouping Logic ---
    const groupedClubs = clubs.reduce((acc, club) => {
        const type = club.type || 'Khác';
        if (!acc[type]) acc[type] = [];
        acc[type].push(club);
        return acc;
    }, {} as Record<string, Club[]>);

    const copyToClipboard = (text: string, id: string) => {
        playClick();
        navigator.clipboard.writeText(text);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    // --- CRUD ---
    const handleEdit = (item: Club) => {
        playClick();
        setEditingItem(item);
        setFormData(item);
        setPreviewUrl(item.logo_url || null);
        setImageFile(null);
        setIsModalOpen(true);
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Xóa CLB này?')) return;
        playClick();
        if (supabase) {
            await supabase.from('clubs').update({ is_deleted: true }).eq('id', id);
            fetchData();
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setImageFile(file);
            setPreviewUrl(URL.createObjectURL(file));
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        playClick();

        if (supabase) {
            let logoUrl = formData.logo_url;

            if (imageFile) {
                const fileName = `club_${Date.now()}_${imageFile.name}`;
                const { error: uploadError } = await supabase.storage
                    .from('content-images')
                    .upload(fileName, imageFile);
                
                if (!uploadError) {
                    const { data } = supabase.storage.from('content-images').getPublicUrl(fileName);
                    logoUrl = data.publicUrl;
                }
            }

            const payload = { ...formData, logo_url: logoUrl, is_deleted: false };

            if (editingItem) {
                await supabase.from('clubs').update(payload).eq('id', editingItem.id);
            } else {
                await supabase.from('clubs').insert([payload]);
            }
            await fetchData();
        }

        setIsSubmitting(false);
        setIsModalOpen(false);
    };

    return (
        <div className="space-y-6 animate-fadeIn">
            {canManage && (
                <div className="flex justify-end mb-4">
                    <button 
                        onClick={() => { setEditingItem(null); setFormData({ type: 'Học thuật' }); setPreviewUrl(null); setIsModalOpen(true); playClick(); }}
                        className="bg-[#003375] text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-[#002855] transition-all shadow-sm"
                    >
                        <Plus size={18} /> Thêm CLB
                    </button>
                </div>
            )}

            <div className="bg-blue-50 p-4 rounded-xl border border-blue-200 mb-4 transition-all duration-300 hover:shadow-md cursor-default">
                <h3 className="font-bold text-[#003375] flex items-center gap-2 mb-1">
                    <Users size={20}/> Hoạt động Đoàn - Hội
                </h3>
                <p className="text-sm text-blue-800">
                    HUB có nhiều CLB/Đội/Nhóm. Tham gia để rèn luyện kỹ năng và cộng điểm rèn luyện!
                </p>
            </div>

            {loading ? <div className="text-center py-10"><Loader2 className="animate-spin mx-auto text-[#003375]"/></div> : (
                <div className="grid gap-4 sm:grid-cols-2">
                    {Object.entries(groupedClubs).map(([type, list]) => (
                        <div key={type} className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm transition-all duration-300 hover:shadow-lg hover:border-blue-200">
                            <h4 className="font-bold text-[#990000] border-b pb-2 mb-3 uppercase text-sm tracking-wider">{type}</h4>
                            <ul className="space-y-2">
                                {list.map((item) => {
                                    let badgeColor = "bg-gray-100 text-gray-600";
                                    if (item.manager === 'Đoàn trường') badgeColor = "bg-blue-100 text-blue-800";
                                    else if (item.manager === 'Hội SV') badgeColor = "bg-orange-100 text-orange-800";
                                    else if (item.manager?.includes('Đoàn khoa')) badgeColor = "bg-purple-100 text-purple-800";

                                    return (
                                        <li key={item.id} className="group/item border-b border-gray-100 last:border-0 pb-2 mb-2 last:mb-0 last:pb-0">
                                            <div className="flex justify-between items-start">
                                                <div className="flex items-center gap-2">
                                                    {item.logo_url && <img src={item.logo_url} alt="logo" className="w-6 h-6 rounded-full object-cover border border-gray-100" />}
                                                    <span className="text-sm font-semibold text-gray-800 group-hover/item:text-[#003375] transition-colors">{item.name}</span>
                                                </div>
                                                
                                                <div className="flex gap-2">
                                                    {item.link && (
                                                        <a href={item.link} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-blue-500" onClick={playClick}>
                                                            <ExternalLink size={14} />
                                                        </a>
                                                    )}
                                                    {canManage && (
                                                        <>
                                                            <button onClick={() => handleEdit(item)} className="text-blue-400 hover:text-blue-600"><Edit2 size={12}/></button>
                                                            {isAdmin && <button onClick={() => handleDelete(item.id)} className="text-red-400 hover:text-red-600"><Trash2 size={12}/></button>}
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                            
                                            <div className="flex flex-wrap items-center gap-2 mt-1 ml-8">
                                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border border-transparent ${badgeColor}`}>
                                                    {item.manager}
                                                </span>
                                                {item.email && (
                                                    <button 
                                                        className="text-[11px] text-gray-500 hover:text-[#003375] flex items-center gap-1 hover:bg-gray-50 px-1 rounded transition-colors"
                                                        onClick={() => copyToClipboard(item.email, `club-${item.id}`)}
                                                        title="Sao chép Email"
                                                    >
                                                        <Mail size={10} /> {item.email}
                                                        {copiedId === `club-${item.id}` && <Check size={10} className="text-green-600"/>}
                                                    </button>
                                                )}
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    ))}
                </div>
            )}

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm animate-fadeIn">
                    <div className="bg-white rounded-xl w-full max-w-md p-6 animate-scaleIn flex flex-col max-h-[90vh]">
                        <div className="flex justify-between items-center mb-4 border-b pb-2">
                            <h3 className="text-lg font-bold text-[#003375]">{editingItem ? 'Sửa CLB' : 'Thêm CLB'}</h3>
                            <button onClick={() => setIsModalOpen(false)}><X size={24} className="text-gray-400 hover:text-gray-600" /></button>
                        </div>
                        <form onSubmit={handleSubmit} className="space-y-3 overflow-y-auto custom-scrollbar">
                            <div className="flex justify-center mb-2">
                                <div 
                                    onClick={() => fileInputRef.current?.click()}
                                    className="w-20 h-20 rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center cursor-pointer hover:border-[#003375] overflow-hidden relative"
                                >
                                    {previewUrl ? (
                                        <img src={previewUrl} className="w-full h-full object-cover" alt="Logo" />
                                    ) : (
                                        <UploadCloud className="text-gray-400"/>
                                    )}
                                    <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Tên CLB/Đội/Nhóm</label>
                                <input type="text" required className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-[#003375] outline-none" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} />
                            </div>
                            
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Phân loại</label>
                                    <select className="w-full border rounded-lg p-2 bg-white" value={formData.type || 'Học thuật'} onChange={e => setFormData({...formData, type: e.target.value})}>
                                        <option value="Học thuật">Học thuật</option>
                                        <option value="Kỹ năng">Kỹ năng</option>
                                        <option value="Sở thích & Văn thể">Sở thích & Văn thể</option>
                                        <option value="Tình nguyện">Tình nguyện</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Đơn vị quản lý</label>
                                    <input type="text" placeholder="VD: Hội SV" className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-[#003375] outline-none" value={formData.manager || ''} onChange={e => setFormData({...formData, manager: e.target.value})} />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Email liên hệ</label>
                                <input type="text" className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-[#003375] outline-none" value={formData.email || ''} onChange={e => setFormData({...formData, email: e.target.value})} />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Link Fanpage (Facebook)</label>
                                <input type="text" className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-[#003375] outline-none" value={formData.link || ''} onChange={e => setFormData({...formData, link: e.target.value})} />
                            </div>

                            <button type="submit" disabled={isSubmitting} className="w-full bg-[#003375] text-white font-bold py-3 rounded-xl hover:bg-[#002855] transition-all flex items-center justify-center gap-2 mt-2">
                                {isSubmitting ? <Loader2 className="animate-spin"/> : <Save size={18} />} Lưu thông tin
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};