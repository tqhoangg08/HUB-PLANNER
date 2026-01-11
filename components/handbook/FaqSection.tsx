import React, { useState, useEffect } from 'react';
import { supabase } from '../../utils/supabase';
import { useUserRole } from '../../hooks/useUserRole';
import { HelpCircle, Plus, Edit2, Trash2, X, Save, Loader2 } from 'lucide-react';
import { playClick } from '../../utils/audio';

interface FAQ {
    id: number;
    category: string; // Mapped from 'group_name'
    question: string;
    answer: string;
}

export const FaqSection: React.FC = () => {
    const { isAdmin, isCTV } = useUserRole();
    const canManage = isAdmin || isCTV;

    const [faqs, setFaqs] = useState<FAQ[]>([]);
    const [loading, setLoading] = useState(true);

    // Modal
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<FAQ | null>(null);
    const [formData, setFormData] = useState<Partial<FAQ>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        if (!supabase) {
            setFaqs([
                { id: 1, category: 'Nhóm 1: Demo', question: 'Câu hỏi mẫu?', answer: 'Trả lời mẫu.' }
            ]);
            setLoading(false);
            return;
        }

        const { data, error } = await supabase
            .from('faqs')
            .select('*')
            .eq('is_deleted', false)
            .order('category')
            .order('id');
        
        if (!error && data) setFaqs(data);
        setLoading(false);
    };

    // Grouping
    const groupedFaqs = faqs.reduce((acc, faq) => {
        if (!acc[faq.category]) acc[faq.category] = [];
        acc[faq.category].push(faq);
        return acc;
    }, {} as Record<string, FAQ[]>);

    // CRUD
    const handleEdit = (item: FAQ) => {
        playClick();
        setEditingItem(item);
        setFormData(item);
        setIsModalOpen(true);
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Xóa câu hỏi này?')) return;
        playClick();
        if (supabase) {
            await supabase.from('faqs').update({ is_deleted: true }).eq('id', id);
            fetchData();
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        playClick();

        if (supabase) {
            if (editingItem) {
                await supabase.from('faqs').update(formData).eq('id', editingItem.id);
            } else {
                await supabase.from('faqs').insert([{ ...formData, is_deleted: false }]);
            }
            await fetchData();
        }

        setIsSubmitting(false);
        setIsModalOpen(false);
    };

    return (
        <div className="space-y-6 animate-fadeIn">
            <div className="bg-gradient-to-r from-[#003375] to-blue-600 p-4 rounded-xl shadow-lg mb-6 text-white flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="bg-white/20 p-2 rounded-full">
                        <HelpCircle size={24} className="text-yellow-300"/>
                    </div>
                    <div>
                        <h3 className="font-bold text-lg">Câu hỏi thường gặp (FAQs)</h3>
                        <p className="text-blue-100 text-sm">Giải đáp nhanh các thắc mắc về tính năng và bảo mật.</p>
                    </div>
                </div>
                {canManage && (
                    <button 
                        onClick={() => { setEditingItem(null); setFormData({ category: 'Chung' }); setIsModalOpen(true); playClick(); }}
                        className="bg-white text-[#003375] px-3 py-2 rounded-lg font-bold flex items-center gap-1 hover:bg-gray-100 active:scale-95 shadow-sm text-sm"
                    >
                        <Plus size={16} /> Thêm câu hỏi
                    </button>
                )}
            </div>

            {loading ? <div className="text-center py-10"><Loader2 className="animate-spin mx-auto text-[#003375]"/></div> : (
                Object.entries(groupedFaqs).map(([group, items], idx) => (
                    <div key={idx} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                        <div className="bg-gray-50 px-4 py-3 text-[#003375] font-bold text-sm uppercase tracking-wide border-b border-gray-200">
                            {group}
                        </div>
                        <div className="divide-y divide-gray-100">
                            {items.map((item) => (
                                <div key={item.id} className="p-4 hover:bg-blue-50/30 transition-colors group relative">
                                    <h4 className="font-bold text-gray-800 mb-2 flex gap-2 pr-16">
                                        <span className="text-[#990000] font-black shrink-0">Q:</span>
                                        <span className="text-gray-900">{item.question}</span>
                                    </h4>
                                    <p className="text-gray-600 text-sm leading-relaxed ml-6 pl-2 border-l-2 border-blue-100">
                                        <span className="font-bold text-[#003375] mr-1">A:</span>
                                        {item.answer}
                                    </p>

                                    {canManage && (
                                        <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => handleEdit(item)} className="text-blue-400 hover:text-blue-600 p-1 bg-white rounded border hover:border-blue-300"><Edit2 size={14}/></button>
                                            {isAdmin && <button onClick={() => handleDelete(item.id)} className="text-red-400 hover:text-red-600 p-1 bg-white rounded border hover:border-red-300"><Trash2 size={14}/></button>}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                ))
            )}

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm animate-fadeIn">
                    <div className="bg-white rounded-xl w-full max-w-md p-6 animate-scaleIn">
                        <div className="flex justify-between items-center mb-4 border-b pb-2">
                            <h3 className="text-lg font-bold text-[#003375]">{editingItem ? 'Sửa câu hỏi' : 'Thêm câu hỏi'}</h3>
                            <button onClick={() => setIsModalOpen(false)}><X size={24} className="text-gray-400 hover:text-gray-600" /></button>
                        </div>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Nhóm câu hỏi</label>
                                <input type="text" className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-[#003375] outline-none" placeholder="VD: Về học bổng" value={formData.category || ''} onChange={e => setFormData({...formData, category: e.target.value})} />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Câu hỏi</label>
                                <textarea rows={2} required className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-[#003375] outline-none" value={formData.question || ''} onChange={e => setFormData({...formData, question: e.target.value})} />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Trả lời</label>
                                <textarea rows={4} required className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-[#003375] outline-none" value={formData.answer || ''} onChange={e => setFormData({...formData, answer: e.target.value})} />
                            </div>
                            <button type="submit" disabled={isSubmitting} className="w-full bg-[#003375] text-white font-bold py-3 rounded-xl hover:bg-[#002855] transition-all flex items-center justify-center gap-2">
                                {isSubmitting ? <Loader2 className="animate-spin"/> : <Save size={18} />} Lưu
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
