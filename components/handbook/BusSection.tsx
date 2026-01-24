import React, { useState, useEffect } from 'react';
import { supabase } from '../../utils/supabase';
import { useUserRole } from '../../hooks/useUserRole';
import { Bus, Clock, Plus, Edit2, Trash2, X, Save, Loader2 } from 'lucide-react';
import { playClick } from '../../utils/audio';

interface BusRoute {
    id: number;
    route_number: string;
    route_name: string;
    operating_hours: string;
    frequency: string;
    color?: string; // Tailwind color class or hex
}

export const BusSection: React.FC = () => {
    const { isAdmin, isCTV } = useUserRole();
    const canManage = isAdmin || isCTV;

    const [routes, setRoutes] = useState<BusRoute[]>([]);
    const [loading, setLoading] = useState(true);
    
    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<BusRoute | null>(null);
    const [formData, setFormData] = useState<Partial<BusRoute>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        if (!supabase) {
            // Mock data
            setRoutes([
                { id: 1, route_number: '53', route_name: 'Lê Hồng Phong – ĐH Quốc gia', operating_hours: '5h00 – 19h30', frequency: '7–15 phút', color: 'bg-blue-600' },
                { id: 2, route_number: '104', route_name: 'Bến xe An Sương – ĐH Nông Lâm', operating_hours: '4h40 – 19h45', frequency: '4–12 phút', color: 'bg-green-600' },
            ]);
            setLoading(false);
            return;
        }

        const { data, error } = await supabase
            .from('bus_routes')
            .select('*')
            .eq('is_deleted', false)
            .order('route_number');
        
        if (!error && data) setRoutes(data);
        setLoading(false);
    };

    const handleEdit = (item: BusRoute) => {
        playClick();
        setEditingItem(item);
        setFormData(item);
        setIsModalOpen(true);
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Xóa tuyến xe buýt này?')) return;
        playClick();
        if (supabase) {
            await supabase.from('bus_routes').update({ is_deleted: true }).eq('id', id);
            fetchData();
        } else {
            setRoutes(prev => prev.filter(r => r.id !== id));
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        playClick();

        if (supabase) {
            if (editingItem) {
                await supabase.from('bus_routes').update(formData).eq('id', editingItem.id);
            } else {
                await supabase.from('bus_routes').insert([{ ...formData, is_deleted: false }]);
            }
            await fetchData();
        }

        setIsSubmitting(false);
        setIsModalOpen(false);
    };

    const colorOptions = [
        { label: 'Xanh Dương', val: 'bg-blue-600' },
        { label: 'Xanh Lá', val: 'bg-green-600' },
        { label: 'Cam', val: 'bg-orange-500' },
        { label: 'Đỏ', val: 'bg-red-600' },
        { label: 'Tím', val: 'bg-purple-600' },
    ];

    return (
        <div className="space-y-4 animate-fadeIn">
            {canManage && (
                <div className="flex justify-end mb-4">
                    <button 
                        onClick={() => { setEditingItem(null); setFormData({ color: 'bg-blue-600' }); setIsModalOpen(true); playClick(); }}
                        className="bg-[#003375] text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-[#002855] transition-all shadow-sm"
                    >
                        <Plus size={18} /> Thêm tuyến
                    </button>
                </div>
            )}

            <div className="bg-yellow-50 p-4 rounded-xl border border-yellow-200 mb-4 transition-all duration-300 hover:shadow-md cursor-default">
                <h3 className="font-bold text-yellow-800 flex items-center gap-2 mb-1">
                    <Bus size={20}/> Thông tin xe buýt hỗ trợ sinh viên
                </h3>
                <p className="text-sm text-yellow-700">Các tuyến xe buýt phổ biến đi qua cơ sở 56 Hoàng Diệu 2, Thủ Đức.</p>
            </div>

            {loading ? <div className="text-center py-10"><Loader2 className="animate-spin mx-auto text-[#003375]"/></div> : routes.map(bus => (
              <div 
                key={bus.id} 
                className="bg-white p-4 rounded-xl border border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between shadow-sm transition-all duration-300 hover:scale-[1.01] hover:shadow-lg cursor-pointer hover:border-blue-200 gap-4"
              >
                <div className="flex items-center gap-4">
                  <div className={`${bus.color || 'bg-gray-500'} text-white w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg shadow-md shrink-0`}>
                    {bus.route_number}
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-800 text-lg">{bus.route_name}</h4>
                    <p className="text-sm text-gray-500">Tần suất: {bus.frequency}</p>
                  </div>
                </div>
                
                <div className="flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto">
                    <div className="text-right">
                        <span className="block text-xs font-bold text-gray-400 uppercase">Hoạt động</span>
                        <span className="font-medium text-[#003375] flex items-center gap-1 justify-end"><Clock size={14}/> {bus.operating_hours}</span>
                    </div>
                    
                    {canManage && (
                        <div className="flex gap-2 pl-4 border-l border-gray-100">
                            <button onClick={(e) => { e.stopPropagation(); handleEdit(bus); }} className="p-2 text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100"><Edit2 size={16}/></button>
                            {isAdmin && <button onClick={(e) => { e.stopPropagation(); handleDelete(bus.id); }} className="p-2 text-red-600 bg-red-50 rounded-lg hover:bg-red-100"><Trash2 size={16}/></button>}
                        </div>
                    )}
                </div>
              </div>
            ))}

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm animate-fadeIn">
                    <div className="bg-white rounded-xl w-full max-w-md p-6 animate-scaleIn">
                        <div className="flex justify-between items-center mb-4 border-b pb-2">
                            <h3 className="text-lg font-bold text-[#003375]">{editingItem ? 'Sửa tuyến' : 'Thêm tuyến mới'}</h3>
                            <button onClick={() => setIsModalOpen(false)}><X size={24} className="text-gray-400 hover:text-gray-600" /></button>
                        </div>
                        <form onSubmit={handleSubmit} className="space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Số xe</label>
                                    <input type="text" required className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-[#003375] outline-none" value={formData.route_number || ''} onChange={e => setFormData({...formData, route_number: e.target.value})} />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Màu sắc</label>
                                    <select className="w-full border rounded-lg p-2 bg-white" value={formData.color || 'bg-blue-600'} onChange={e => setFormData({...formData, color: e.target.value})}>
                                        {colorOptions.map(c => <option key={c.val} value={c.val}>{c.label}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Tên tuyến</label>
                                <input type="text" required className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-[#003375] outline-none" value={formData.route_name || ''} onChange={e => setFormData({...formData, route_name: e.target.value})} />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Giờ chạy</label>
                                    <input type="text" className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-[#003375] outline-none" placeholder="5h00 - 19h00" value={formData.operating_hours || ''} onChange={e => setFormData({...formData, operating_hours: e.target.value})} />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Tần suất</label>
                                    <input type="text" className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-[#003375] outline-none" placeholder="10-15 phút" value={formData.frequency || ''} onChange={e => setFormData({...formData, frequency: e.target.value})} />
                                </div>
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