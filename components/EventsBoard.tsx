import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../utils/supabase';
import { useUserRole } from '../hooks/useUserRole';
import { playClick } from '../utils/audio';
import { 
    Calendar, MapPin, Clock, Search, PlusCircle, 
    Edit2, Trash2, X, CheckCircle2, AlertCircle, Loader2, 
    ExternalLink, Shield, Info, Image as ImageIcon, Zap, Filter, UploadCloud, User
} from 'lucide-react';
import { createPortal } from 'react-dom';

export interface HubEvent {
    id: number;
    created_at: string;
    title: string;
    description: string;
    location: string;
    start_time: string; // ISO string
    deadline: string; // ISO string
    points: number;
    registration_link: string | null;
    image_url: string | null;
    status: string;
    is_manually_closed: boolean;
    is_deleted: boolean;
    deadlineDate?: Date | null;
}

interface EventModalProps {
    isOpen: boolean;
    onClose: () => void;
    onShowToast: (msg: string, type: 'success' | 'error') => void;
    editingEvent?: HubEvent | null;
    onRefresh: () => void;
}

const EventModal: React.FC<EventModalProps> = ({ isOpen, onClose, onShowToast, editingEvent, onRefresh }) => {
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        location: '',
        start_time: '',
        deadline: '',
        points: 0,
        registration_link: '',
        status: 'Đang mở'
    });
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            if (editingEvent) {
                setFormData({
                    title: editingEvent.title,
                    description: editingEvent.description,
                    location: editingEvent.location,
                    start_time: editingEvent.start_time ? new Date(editingEvent.start_time).toISOString().slice(0, 16) : '',
                    deadline: editingEvent.deadline ? new Date(editingEvent.deadline).toISOString().slice(0, 16) : '',
                    points: editingEvent.points,
                    registration_link: editingEvent.registration_link || '',
                    status: editingEvent.status
                });
                setPreviewUrl(editingEvent.image_url);
            } else {
                setFormData({
                    title: '',
                    description: '',
                    location: '',
                    start_time: '',
                    deadline: '',
                    points: 0,
                    registration_link: '',
                    status: 'Đang mở'
                });
                setPreviewUrl(null);
            }
            setImageFile(null);
        }
    }, [isOpen, editingEvent]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!supabase) return;
        setIsSubmitting(true);

        try {
            let imageUrl = editingEvent?.image_url || null;

            if (imageFile) {
                const fileExt = imageFile.name.split('.').pop();
                const fileName = `event_${Date.now()}.${fileExt}`;
                const { error: uploadError } = await supabase.storage.from('event_images').upload(fileName, imageFile);
                if (uploadError) throw uploadError;
                const { data: { publicUrl } } = supabase.storage.from('event_images').getPublicUrl(fileName);
                imageUrl = publicUrl;
            }

            const payload = {
                title: formData.title,
                description: formData.description,
                location: formData.location,
                start_time: formData.start_time ? new Date(formData.start_time).toISOString() : null,
                deadline: formData.deadline ? new Date(formData.deadline).toISOString() : null,
                points: formData.points,
                registration_link: formData.registration_link,
                status: formData.status,
                image_url: imageUrl
            };

            if (editingEvent) {
                const { error } = await supabase.from('events').update(payload).eq('id', editingEvent.id);
                if (error) throw error;
                onShowToast("Cập nhật sự kiện thành công!", 'success');
            } else {
                const { error } = await supabase.from('events').insert([payload]);
                if (error) throw error;
                onShowToast("Tạo sự kiện thành công!", 'success');
            }
            onRefresh();
            onClose();
        } catch (err: any) {
            console.error(err);
            onShowToast("Lỗi: " + err.message, 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[99999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
                <div className="p-4 bg-[#003375] text-white flex justify-between items-center rounded-t-2xl">
                    <h3 className="font-bold text-lg">{editingEvent ? 'Chỉnh sửa sự kiện' : 'Thêm sự kiện mới'}</h3>
                    <button onClick={onClose}><X size={20}/></button>
                </div>
                <form onSubmit={handleSubmit} className="p-6 overflow-y-auto custom-scrollbar space-y-4">
                    {/* Image Upload */}
                     <div className="flex justify-center mb-4">
                        <div 
                            onClick={() => fileInputRef.current?.click()}
                            className="w-full h-40 bg-gray-50 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:bg-gray-100 hover:border-blue-300 transition-all relative overflow-hidden group"
                        >
                            {previewUrl ? (
                                <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                            ) : (
                                <>
                                    <ImageIcon size={32} className="text-gray-400 mb-2"/>
                                    <p className="text-sm text-gray-500 font-medium">Ảnh bìa sự kiện (nếu có)</p>
                                </>
                            )}
                            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                    setImageFile(file);
                                    setPreviewUrl(URL.createObjectURL(file));
                                }
                            }} />
                             {previewUrl && (
                                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <span className="text-white text-sm font-bold flex items-center gap-1"><UploadCloud size={16}/> Thay đổi</span>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Tên sự kiện <span className="text-red-500">*</span></label>
                            <input type="text" required className="w-full px-3 py-2 border rounded-lg" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} />
                        </div>
                         <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Địa điểm <span className="text-red-500">*</span></label>
                            <input type="text" required className="w-full px-3 py-2 border rounded-lg" value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})} />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Thời gian bắt đầu</label>
                            <input type="datetime-local" required className="w-full px-3 py-2 border rounded-lg" value={formData.start_time} onChange={e => setFormData({...formData, start_time: e.target.value})} />
                        </div>
                         <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Hạn đăng ký (Deadline)</label>
                            <input type="datetime-local" required className="w-full px-3 py-2 border rounded-lg" value={formData.deadline} onChange={e => setFormData({...formData, deadline: e.target.value})} />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Điểm rèn luyện</label>
                            <input type="number" className="w-full px-3 py-2 border rounded-lg" value={formData.points} onChange={e => setFormData({...formData, points: parseInt(e.target.value) || 0})} />
                        </div>
                         <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Link đăng ký</label>
                            <input type="url" className="w-full px-3 py-2 border rounded-lg" placeholder="https://..." value={formData.registration_link} onChange={e => setFormData({...formData, registration_link: e.target.value})} />
                        </div>
                    </div>

                     <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Mô tả chi tiết</label>
                        <textarea rows={4} className="w-full px-3 py-2 border rounded-lg" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})}></textarea>
                    </div>

                    <button type="submit" disabled={isSubmitting} className="w-full bg-[#003375] text-white py-3 rounded-lg font-bold hover:bg-[#002855] transition-colors flex items-center justify-center gap-2">
                        {isSubmitting ? <Loader2 className="animate-spin"/> : 'Lưu sự kiện'}
                    </button>
                </form>
            </div>
        </div>,
        document.body
    );
};

export const EventsBoard: React.FC = () => {
    const { isAdmin, isCTV } = useUserRole();
    const canManage = isAdmin || isCTV;

    const [events, setEvents] = useState<HubEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    
    // Management State
    const [showModal, setShowModal] = useState(false);
    const [editingEvent, setEditingEvent] = useState<HubEvent | null>(null);
    const [notification, setNotification] = useState<{msg: string, type: 'success' | 'error'} | null>(null);

    const showToast = (msg: string, type: 'success' | 'error') => {
        setNotification({ msg, type });
        setTimeout(() => setNotification(null), 5000);
    };

    const fetchEvents = async () => {
        setLoading(true);
        if (!supabase) {
            setEvents([]);
            setLoading(false);
            return;
        }
        try {
            const { data, error } = await supabase
                .from('events')
                .select('*')
                .eq('is_deleted', false)
                .order('deadline', { ascending: true });

            if (error) throw error;
            if (data) {
                setEvents(data.map((e: any) => ({
                    ...e,
                    deadlineDate: e.deadline ? new Date(e.deadline) : null
                })));
            }
        } catch (err: any) {
            console.error(err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchEvents();
    }, []);

    const handleDelete = async (id: number) => {
        if (!window.confirm("Bạn có chắc muốn xóa sự kiện này?")) return;
        if (!supabase) return;
        const { error } = await supabase.from('events').update({ is_deleted: true }).eq('id', id);
        if (error) showToast(error.message, 'error');
        else {
            showToast("Đã xóa sự kiện", 'success');
            fetchEvents();
        }
    };

    const handleToggleClose = async (event: HubEvent) => {
        if (!supabase) return;
        const newVal = !event.is_manually_closed;
        const { error } = await supabase.from('events').update({ is_manually_closed: newVal }).eq('id', event.id);
        if (error) showToast(error.message, 'error');
        else {
            showToast(newVal ? "Đã đóng đơn đăng ký" : "Đã mở lại đơn đăng ký", 'success');
            fetchEvents();
        }
    };

    const filteredEvents = events.filter(e => 
        e.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
        e.location.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Grouping Logic
    const today = new Date();
    
    const isSameDay = (d1: Date | null, d2: Date) => {
        if (!d1) return false;
        return d1.getDate() === d2.getDate() && d1.getMonth() === d2.getMonth() && d1.getFullYear() === d2.getFullYear();
    };

    // Helper: Check if event is effectively closed (Overdue OR Manually Closed OR Status Closed)
    const isEventClosed = (evt: HubEvent) => {
        const now = new Date();
        // Check 1: Time (Current > Deadline)
        // Note: deadlineDate is set to 23:59:59 of the day, so this strictly checks if the day has passed
        const isOverdue = evt.deadlineDate ? now > evt.deadlineDate : false;
        
        // Check 2: Status or Manual Toggle
        const isStatusClosed = evt.status === 'Đã kết thúc';
        const isManuallyClosed = evt.is_manually_closed;
        
        return isOverdue || isStatusClosed || isManuallyClosed;
    };

    // 1. Split into Open vs Closed List based on strict logic
    const openEventsList = filteredEvents.filter(evt => !isEventClosed(evt));
    const closedEvents = filteredEvents.filter(evt => isEventClosed(evt));

    // 2. Sub-group Open Events (Highlight Today's Deadline vs Others)
    const deadlineTodayEvents = openEventsList.filter(evt => isSameDay(evt.deadlineDate, today));
    const activeEvents = openEventsList.filter(evt => !isSameDay(evt.deadlineDate, today));

    const NotificationToast = () => {
        if (!notification) return null;
        return createPortal(
            <div className={`fixed top-4 right-4 z-[100000] px-4 py-3 rounded-xl shadow-2xl border-l-4 flex items-center gap-3 animate-slideInRight bg-white ${notification.type === 'success' ? 'border-green-500' : 'border-red-500'}`}>
                {notification.type === 'success' ? <CheckCircle2 className="text-green-600"/> : <AlertCircle className="text-red-600"/>}
                <div><h4 className={`font-bold text-sm ${notification.type === 'success' ? 'text-green-800' : 'text-red-800'}`}>{notification.type === 'success' ? 'Thành công' : 'Thất bại'}</h4><p className="text-xs text-gray-600">{notification.msg}</p></div>
            </div>, document.body
        );
    };

    const EventCard = ({ event }: { event: HubEvent }) => {
        const isClosed = isEventClosed(event);
        const isToday = isSameDay(event.deadlineDate, today);

        return (
            <div className={`bg-white rounded-xl shadow-sm border overflow-hidden transition-all duration-300 hover:shadow-lg group flex flex-col ${isToday ? 'border-red-200 ring-2 ring-red-50' : isClosed ? 'border-gray-200 opacity-75' : 'border-blue-100'}`}>
                <div className="h-40 bg-gray-100 relative overflow-hidden">
                    {event.image_url ? (
                        <img src={event.image_url} alt={event.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-400 bg-gray-50"><ImageIcon size={32} /></div>
                    )}
                    <div className="absolute top-2 right-2 bg-white/90 backdrop-blur px-2 py-1 rounded text-xs font-bold text-[#003375] shadow-sm flex items-center gap-1">
                        <Zap size={12} className="fill-yellow-400 text-yellow-400"/> {event.points} đ
                    </div>
                    {isClosed && (
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white font-bold text-lg backdrop-blur-[1px]">Đã kết thúc</div>
                    )}
                </div>
                <div className="p-4 flex-1 flex flex-col">
                    <h3 className="font-bold text-gray-800 text-lg mb-2 line-clamp-2 group-hover:text-[#003375] transition-colors">{event.title}</h3>
                    <div className="space-y-2 text-sm text-gray-600 mb-4">
                        <div className="flex items-start gap-2"><Clock size={16} className="mt-0.5 shrink-0"/> <span>Hạn: {event.deadline ? new Date(event.deadline).toLocaleString('vi-VN') : 'N/A'}</span></div>
                        <div className="flex items-start gap-2"><MapPin size={16} className="mt-0.5 shrink-0"/> <span className="line-clamp-1">{event.location}</span></div>
                    </div>
                    
                    <div className="mt-auto flex gap-2">
                        {event.registration_link && !isClosed && (
                            <a href={event.registration_link} target="_blank" rel="noopener noreferrer" className="flex-1 bg-[#003375] text-white py-2 rounded-lg font-bold text-sm text-center hover:bg-[#002855] transition-colors flex items-center justify-center gap-1" onClick={playClick}>
                                Đăng ký <ExternalLink size={14}/>
                            </a>
                        )}
                         {canManage && (
                            <div className="flex gap-1">
                                <button onClick={() => { setEditingEvent(event); setShowModal(true); }} className="p-2 bg-gray-100 hover:bg-blue-100 text-blue-600 rounded-lg"><Edit2 size={16}/></button>
                                <button onClick={() => handleDelete(event.id)} className="p-2 bg-gray-100 hover:bg-red-100 text-red-600 rounded-lg"><Trash2 size={16}/></button>
                                <button onClick={() => handleToggleClose(event)} className={`p-2 bg-gray-100 rounded-lg ${event.is_manually_closed ? 'text-green-600 hover:bg-green-100' : 'text-orange-600 hover:bg-orange-100'}`} title={event.is_manually_closed ? "Mở lại" : "Đóng đơn"}>
                                    {event.is_manually_closed ? <CheckCircle2 size={16}/> : <X size={16}/>}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="animate-fadeIn">
            <NotificationToast />
            <EventModal 
                isOpen={showModal} 
                onClose={() => setShowModal(false)} 
                onShowToast={showToast} 
                editingEvent={editingEvent} 
                onRefresh={fetchEvents}
            />

            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-8">
                <div>
                    <h2 className="text-2xl font-bold text-[#003375] flex items-center gap-2">
                        <Calendar className="text-[#990000]"/> Bảng tin Sự kiện & ĐRL
                    </h2>
                    <p className="text-gray-500 text-sm mt-1">Cập nhật các hoạt động ngoại khóa mới nhất tại HUB</p>
                </div>
                
                <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
                    <div className="relative flex-1">
                        <input 
                            type="text" 
                            placeholder="Tìm kiếm sự kiện..." 
                            className="w-full sm:w-64 pl-10 pr-4 py-2 border rounded-xl focus:ring-2 focus:ring-[#003375] outline-none"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18}/>
                    </div>
                    {canManage && (
                        <button 
                            onClick={() => { setEditingEvent(null); setShowModal(true); }}
                            className="bg-[#990000] text-white px-4 py-2 rounded-xl font-bold hover:bg-[#7a0000] transition-all flex items-center justify-center gap-2 shadow-sm active:scale-95"
                        >
                            <PlusCircle size={18}/> Tạo sự kiện
                        </button>
                    )}
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center py-20"><Loader2 size={40} className="animate-spin text-[#003375]"/></div>
            ) : (
                <div className="space-y-8">
                    {/* DEADLINE TODAY */}
                    {deadlineTodayEvents.length > 0 && (
                        <div className="animate-slideUp">
                            <h3 className="font-bold text-red-600 mb-4 flex items-center gap-2 text-lg">
                                <Clock className="animate-pulse"/> Hạn chốt hôm nay
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {deadlineTodayEvents.map(evt => <EventCard key={evt.id} event={evt} />)}
                            </div>
                        </div>
                    )}

                    {/* UPCOMING */}
                    <div>
                        <h3 className="font-bold text-[#003375] mb-4 flex items-center gap-2 text-lg">
                            <Zap className="text-yellow-500"/> Sắp diễn ra
                        </h3>
                        {activeEvents.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {activeEvents.map(evt => <EventCard key={evt.id} event={evt} />)}
                            </div>
                        ) : (
                            <p className="text-gray-400 italic">Hiện chưa có sự kiện mới nào.</p>
                        )}
                    </div>

                    {/* CLOSED */}
                    {closedEvents.length > 0 && (
                        <div className="opacity-75 grayscale hover:grayscale-0 transition-all duration-500">
                             <div className="flex items-center gap-4 mb-4 mt-8">
                                <h3 className="font-bold text-gray-500 text-lg">Đã kết thúc</h3>
                                <div className="h-px bg-gray-200 flex-1"></div>
                             </div>
                             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {closedEvents.map(evt => <EventCard key={evt.id} event={evt} />)}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
