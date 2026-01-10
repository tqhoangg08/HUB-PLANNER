import React, { useState, useEffect } from 'react';
import { supabase } from '../utils/supabase';
import { Search, Edit2, Trash2, CheckCircle2, XCircle, Eye, EyeOff, Loader2, MapPin, Phone, User, Save, ImageOff, Filter } from 'lucide-react';
import { playClick } from '../utils/audio';
import { createPortal } from 'react-dom';

interface AdminLostFoundBoardProps {
    userRole: 'admin' | 'editor' | null;
}

interface LostFoundItem {
    id: number;
    created_at: string;
    type: 'FOUND' | 'LOST';
    title: string;
    description: string;
    location: string;
    contact_info: string;
    user_name: string;
    image_url: string | null;
    status: 'pending' | 'approved'; // Lowercase to match DB convention for consistency
}

export const AdminLostFoundBoard: React.FC<AdminLostFoundBoardProps> = ({ userRole }) => {
    const [items, setItems] = useState<LostFoundItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'pending' | 'approved'>('pending');
    const [searchTerm, setSearchTerm] = useState('');
    
    // Edit Modal State
    const [showEditModal, setShowEditModal] = useState(false);
    const [editingItem, setEditingItem] = useState<LostFoundItem | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        fetchItems();
    }, []);

    const fetchItems = async () => {
        if (!supabase) return;
        setLoading(true);
        const { data, error } = await supabase
            .from('lost_found_items')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) console.error('Error fetching items:', error);
        else {
            // Normalize status if DB has old values (e.g., 'OPEN') -> treat as 'approved' or handle migration
            // For now, assume 'OPEN' = 'approved' for legacy compatibility
            const normalizedData = data.map((item: any) => ({
                ...item,
                status: (item.status === 'OPEN' || item.status === 'approved') ? 'approved' : 'pending'
            }));
            setItems(normalizedData);
        }
        setLoading(false);
    };

    // Filter Logic
    const filteredItems = items.filter(item => {
        const matchesTab = item.status === activeTab;
        const matchesSearch = 
            item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.user_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.location.toLowerCase().includes(searchTerm.toLowerCase());
        return matchesTab && matchesSearch;
    });

    // Actions
    const handleStatusChange = async (id: number, newStatus: 'approved' | 'pending') => {
        playClick();
        if (!supabase) return;

        // DB requires specific enum or text. If legacy was 'OPEN', we might need to change DB schema or map values.
        // Assuming we update the column to accept 'approved'/'pending' OR we map 'approved' -> 'OPEN' if using old schema.
        // Let's assume we use 'approved' / 'pending' as text values.
        
        const { error } = await supabase
            .from('lost_found_items')
            .update({ status: newStatus })
            .eq('id', id);

        if (error) {
            alert("Lỗi cập nhật: " + error.message);
        } else {
            setItems(prev => prev.map(item => item.id === id ? { ...item, status: newStatus } : item));
        }
    };

    const handleDelete = async (id: number) => {
        playClick();
        if (!supabase) return;
        if (userRole !== 'admin') return; // Double check

        if (!confirm("Bạn có chắc chắn muốn xóa vĩnh viễn tin này?")) return;

        const { error } = await supabase
            .from('lost_found_items')
            .delete()
            .eq('id', id);

        if (error) {
            alert("Lỗi xóa: " + error.message);
        } else {
            setItems(prev => prev.filter(item => item.id !== id));
        }
    };

    const handleEditClick = (item: LostFoundItem) => {
        playClick();
        setEditingItem(item);
        setShowEditModal(true);
    };

    const handleSaveEdit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!supabase || !editingItem) return;
        
        setIsSubmitting(true);
        const { error } = await supabase
            .from('lost_found_items')
            .update({
                title: editingItem.title,
                description: editingItem.description,
                location: editingItem.location,
                contact_info: editingItem.contact_info,
                user_name: editingItem.user_name
            })
            .eq('id', editingItem.id);

        setIsSubmitting(false);

        if (error) {
            alert("Lỗi lưu: " + error.message);
        } else {
            setItems(prev => prev.map(i => i.id === editingItem.id ? editingItem : i));
            setShowEditModal(false);
            setEditingItem(null);
        }
    };

    // --- Modal ---
    const EditModal = () => {
        if (!editingItem) return null;
        return createPortal(
            <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-scaleIn">
                    <div className="bg-[#003375] p-4 flex justify-between items-center text-white">
                        <h3 className="font-bold text-lg flex items-center gap-2">
                            <Edit2 size={20}/> Chỉnh sửa tin
                        </h3>
                        <button onClick={() => setShowEditModal(false)} className="hover:bg-white/20 p-2 rounded-full"><XCircle size={20}/></button>
                    </div>
                    <form onSubmit={handleSaveEdit} className="p-6 space-y-4">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Tiêu đề</label>
                            <input 
                                type="text" className="w-full border p-2 rounded-lg focus:ring-2 focus:ring-[#003375] outline-none"
                                value={editingItem.title} 
                                onChange={e => setEditingItem({...editingItem, title: e.target.value})} 
                                required 
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Người đăng</label>
                                <input 
                                    type="text" className="w-full border p-2 rounded-lg focus:ring-2 focus:ring-[#003375] outline-none"
                                    value={editingItem.user_name} 
                                    onChange={e => setEditingItem({...editingItem, user_name: e.target.value})} 
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Khu vực</label>
                                <input 
                                    type="text" className="w-full border p-2 rounded-lg focus:ring-2 focus:ring-[#003375] outline-none"
                                    value={editingItem.location} 
                                    onChange={e => setEditingItem({...editingItem, location: e.target.value})} 
                                    required 
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Liên hệ</label>
                            <input 
                                type="text" className="w-full border p-2 rounded-lg focus:ring-2 focus:ring-[#003375] outline-none"
                                value={editingItem.contact_info} 
                                onChange={e => setEditingItem({...editingItem, contact_info: e.target.value})} 
                                required 
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Mô tả</label>
                            <textarea 
                                className="w-full border p-2 rounded-lg focus:ring-2 focus:ring-[#003375] outline-none" rows={3}
                                value={editingItem.description} 
                                onChange={e => setEditingItem({...editingItem, description: e.target.value})} 
                            />
                        </div>
                        <div className="pt-4 flex gap-3">
                            <button type="button" onClick={() => setShowEditModal(false)} className="flex-1 py-2 bg-gray-100 rounded-lg hover:bg-gray-200">Hủy</button>
                            <button type="submit" disabled={isSubmitting} className="flex-1 py-2 bg-[#003375] text-white rounded-lg hover:bg-[#002855] font-bold flex justify-center gap-2">
                                {isSubmitting ? <Loader2 className="animate-spin"/> : <Save size={18}/>} Lưu thay đổi
                            </button>
                        </div>
                    </form>
                </div>
            </div>,
            document.body
        );
    };

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {/* Toolbar */}
            <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row justify-between items-center gap-4 bg-gray-50">
                <div className="flex bg-white p-1 rounded-lg border border-gray-200 shadow-sm w-full sm:w-auto">
                    <button 
                        onClick={() => { playClick(); setActiveTab('pending'); }}
                        className={`flex-1 sm:flex-none px-4 py-2 rounded-md text-sm font-bold flex items-center gap-2 transition-all ${activeTab === 'pending' ? 'bg-yellow-100 text-yellow-800 shadow-sm' : 'text-gray-500 hover:bg-gray-50'}`}
                    >
                        <Loader2 size={16} className={activeTab === 'pending' ? 'animate-spin' : ''}/> Chờ duyệt
                        <span className="bg-yellow-200 text-yellow-900 px-1.5 rounded text-xs ml-1">{items.filter(i => i.status === 'pending').length}</span>
                    </button>
                    <button 
                        onClick={() => { playClick(); setActiveTab('approved'); }}
                        className={`flex-1 sm:flex-none px-4 py-2 rounded-md text-sm font-bold flex items-center gap-2 transition-all ${activeTab === 'approved' ? 'bg-green-100 text-green-800 shadow-sm' : 'text-gray-500 hover:bg-gray-50'}`}
                    >
                        <CheckCircle2 size={16}/> Đã duyệt
                        <span className="bg-green-200 text-green-900 px-1.5 rounded text-xs ml-1">{items.filter(i => i.status === 'approved').length}</span>
                    </button>
                </div>

                <div className="relative w-full sm:w-64">
                    <input 
                        type="text" 
                        placeholder="Tìm kiếm tin..." 
                        className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#003375] outline-none"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="bg-gray-100 text-gray-700 uppercase font-bold text-xs sticky top-0">
                        <tr>
                            <th className="px-4 py-3 w-16 text-center">Ảnh</th>
                            <th className="px-4 py-3 w-28">Loại</th>
                            <th className="px-4 py-3">Thông tin chi tiết</th>
                            <th className="px-4 py-3 w-40">Người đăng</th>
                            <th className="px-4 py-3 w-32">Ngày đăng</th>
                            <th className="px-4 py-3 w-32 text-center">Hành động</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {loading ? (
                            <tr><td colSpan={6} className="text-center py-10"><Loader2 className="animate-spin mx-auto text-[#003375]" size={32}/></td></tr>
                        ) : filteredItems.length === 0 ? (
                            <tr><td colSpan={6} className="text-center py-10 text-gray-500 italic">Không có tin nào trong mục này.</td></tr>
                        ) : (
                            filteredItems.map(item => (
                                <tr key={item.id} className="hover:bg-blue-50/20 transition-colors group">
                                    <td className="px-4 py-3">
                                        <div className="w-12 h-12 rounded-lg bg-gray-100 overflow-hidden border border-gray-200 flex items-center justify-center">
                                            {item.image_url ? (
                                                <img src={item.image_url} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                <ImageOff size={16} className="text-gray-400"/>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`px-2 py-1 rounded text-xs font-bold border ${item.type === 'FOUND' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                                            {item.type === 'FOUND' ? 'Nhặt được' : 'Báo mất'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 max-w-xs">
                                        <div className="font-bold text-gray-800 line-clamp-1">{item.title}</div>
                                        <div className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                                            <MapPin size={10}/> {item.location}
                                        </div>
                                        <div className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                                            <Phone size={10}/> {item.contact_info}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-600">
                                                {item.user_name.charAt(0)}
                                            </div>
                                            <span className="text-gray-700 truncate max-w-[100px]">{item.user_name}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">
                                        {new Date(item.created_at).toLocaleDateString('vi-VN')}
                                        <br/>
                                        {new Date(item.created_at).toLocaleTimeString('vi-VN', {hour: '2-digit', minute:'2-digit'})}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center justify-center gap-2">
                                            {activeTab === 'pending' ? (
                                                <button 
                                                    onClick={() => handleStatusChange(item.id, 'approved')}
                                                    className="p-1.5 bg-green-50 text-green-600 rounded hover:bg-green-100 transition-colors"
                                                    title="Duyệt tin"
                                                >
                                                    <CheckCircle2 size={18}/>
                                                </button>
                                            ) : (
                                                <button 
                                                    onClick={() => handleStatusChange(item.id, 'pending')}
                                                    className="p-1.5 bg-yellow-50 text-yellow-600 rounded hover:bg-yellow-100 transition-colors"
                                                    title="Gỡ tin (Về chờ duyệt)"
                                                >
                                                    <EyeOff size={18}/>
                                                </button>
                                            )}

                                            <button 
                                                onClick={() => handleEditClick(item)}
                                                className="p-1.5 bg-blue-50 text-blue-600 rounded hover:bg-blue-100 transition-colors"
                                                title="Sửa"
                                            >
                                                <Edit2 size={18}/>
                                            </button>

                                            {userRole === 'admin' && (
                                                <button 
                                                    onClick={() => handleDelete(item.id)}
                                                    className="p-1.5 bg-red-50 text-red-600 rounded hover:bg-red-100 transition-colors"
                                                    title="Xóa vĩnh viễn"
                                                >
                                                    <Trash2 size={18}/>
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {showEditModal && <EditModal />}
        </div>
    );
};