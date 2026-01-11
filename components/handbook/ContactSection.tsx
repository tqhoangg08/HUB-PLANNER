import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../utils/supabase';
import { useUserRole } from '../../hooks/useUserRole';
import { Search, Phone, Mail, MapPin, Plus, Edit2, Trash2, X, Save, UploadCloud, Loader2, Copy, Check } from 'lucide-react';
import { playClick } from '../../utils/audio';

interface Department {
    id: number;
    name: string;
    email: string;
    phone: string;
    address: string;
    image_url?: string;
    category?: string; // 'PhongBan', 'Khoa', 'TrungTam'...
}

export const ContactSection: React.FC = () => {
    const { isAdmin, isCTV } = useUserRole();
    const canManage = isAdmin || isCTV;

    const [items, setItems] = useState<Department[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [copiedId, setCopiedId] = useState<string | null>(null);

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<Department | null>(null);
    const [formData, setFormData] = useState<Partial<Department>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        if (!supabase) {
            // Mock data for demo
            setItems([
                { id: 1, name: 'Phòng Đào tạo (Demo)', email: 'pdt@hub.edu.vn', phone: '028.38.212.430', address: '56 Hoàng Diệu 2' },
                { id: 2, name: 'Khoa Công nghệ thông tin (Demo)', email: 'bit@hub.edu.vn', phone: '028.38.971.631', address: 'Tầng 2 - Khu B' },
            ]);
            setLoading(false);
            return;
        }

        const { data, error } = await supabase
            .from('departments')
            .select('*')
            .eq('is_deleted', false)
            .order('name');
        
        if (!error && data) setItems(data);
        setLoading(false);
    };

    const copyToClipboard = (text: string, id: string) => {
        playClick();
        navigator.clipboard.writeText(text);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    // --- CRUD Operations ---
    const handleEdit = (item: Department) => {
        playClick();
        setEditingItem(item);
        setFormData(item);
        setIsModalOpen(true);
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Bạn có chắc chắn muốn xóa đơn vị này?')) return;
        playClick();
        
        if (supabase) {
            await supabase.from('departments').update({ is_deleted: true }).eq('id', id);
            fetchData();
        } else {
            setItems(prev => prev.filter(i => i.id !== id));
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        playClick();

        if (supabase) {
            if (editingItem) {
                await supabase.from('departments').update(formData).eq('id', editingItem.id);
            } else {
                await supabase.from('departments').insert([{ ...formData, is_deleted: false }]);
            }
            await fetchData();
        } else {
            alert("Chế độ Demo: Không lưu vào database.");
        }

        setIsSubmitting(false);
        setIsModalOpen(false);
    };

    const filteredItems = items.filter(c => 
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        c.email.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="animate-fadeIn">
            <div className="flex justify-between items-center mb-4">
                <div className="relative flex-1 mr-4">
                    <input
                        type="text"
                        placeholder="Tìm khoa, phòng ban..."
                        className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 focus:border-[#003375] focus:ring-2 focus:ring-blue-100 transition-all outline-none"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                </div>
                {canManage && (
                    <button 
                        onClick={() => { setEditingItem(null); setFormData({}); setIsModalOpen(true); playClick(); }}
                        className="bg-[#003375] text-white px-4 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-[#002855] transition-all shadow-md active:scale-95 whitespace-nowrap"
                    >
                        <Plus size={20} /> Thêm
                    </button>
                )}
            </div>

            {loading ? (
                <div className="flex justify-center py-10"><Loader2 className="animate-spin text-[#003375]" /></div>
            ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                    {filteredItems.map((c) => (
                        <div 
                            key={c.id} 
                            className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm transition-all duration-300 hover:scale-[1.02] hover:shadow-lg group relative hover:border-blue-200 flex flex-col justify-between"
                        >
                            <div className="cursor-pointer" onClick={() => copyToClipboard(c.email, `email-${c.id}`)}>
                                <div className="flex justify-between items-start">
                                    <h3 className="font-bold text-[#003375] mb-2 text-lg">{c.name}</h3>
                                    <div className="text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity">
                                        {copiedId === `email-${c.id}` ? <Check size={16} className="text-green-600"/> : <Copy size={16}/>}
                                    </div>
                                </div>
                                <div className="space-y-1 text-sm text-gray-600">
                                    <div className="flex items-center gap-2"><Mail size={14} className="text-gray-400 shrink-0"/> {c.email}</div>
                                    <div className="flex items-center gap-2"><Phone size={14} className="text-gray-400 shrink-0"/> {c.phone}</div>
                                    <div className="flex items-center gap-2"><MapPin size={14} className="text-gray-400 shrink-0"/> {c.address}</div>
                                </div>
                            </div>

                            {canManage && (
                                <div className="mt-4 pt-3 border-t border-gray-100 flex justify-end gap-2">
                                    <button onClick={() => handleEdit(c)} className="p-2 text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"><Edit2 size={16}/></button>
                                    {isAdmin && <button onClick={() => handleDelete(c.id)} className="p-2 text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"><Trash2 size={16}/></button>}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm animate-fadeIn">
                    <div className="bg-white rounded-xl w-full max-w-md p-6 animate-scaleIn">
                        <div className="flex justify-between items-center mb-4 border-b pb-2">
                            <h3 className="text-lg font-bold text-[#003375]">{editingItem ? 'Sửa đơn vị' : 'Thêm đơn vị mới'}</h3>
                            <button onClick={() => setIsModalOpen(false)}><X size={24} className="text-gray-400 hover:text-gray-600" /></button>
                        </div>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Tên đơn vị</label>
                                <input type="text" required className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-[#003375] outline-none" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Email</label>
                                <input type="text" className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-[#003375] outline-none" value={formData.email || ''} onChange={e => setFormData({...formData, email: e.target.value})} />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Số điện thoại</label>
                                <input type="text" className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-[#003375] outline-none" value={formData.phone || ''} onChange={e => setFormData({...formData, phone: e.target.value})} />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Địa chỉ / Vị trí</label>
                                <input type="text" className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-[#003375] outline-none" value={formData.address || ''} onChange={e => setFormData({...formData, address: e.target.value})} />
                            </div>
                            <button type="submit" disabled={isSubmitting} className="w-full bg-[#003375] text-white font-bold py-3 rounded-xl hover:bg-[#002855] transition-all flex items-center justify-center gap-2">
                                {isSubmitting ? <Loader2 className="animate-spin"/> : <Save size={18} />} Lưu thông tin
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};