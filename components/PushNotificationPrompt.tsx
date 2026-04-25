import React, { useState, useEffect } from 'react';
import { BellRing, X } from 'lucide-react';
import { supabase } from '../utils/supabase';
import { urlBase64ToUint8Array } from '../utils/pushHelper';

// ✨ KHÔNG CẦN TRUYỀN PROP NỮA
const PushNotificationPrompt = () => {
  const [showPrompt, setShowPrompt] = useState(false);
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    // 1. Tự động lấy ID người dùng từ Supabase
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setUserId(user.id);
    };
    fetchUser();

    // 2. Logic kiểm tra hiển thị popup
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return;
    if (Notification.permission !== 'default') return;

    const timer = setTimeout(() => {
      setShowPrompt(true);
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  const handleDismiss = () => {
    setShowPrompt(false);
  };

  const handleAllow = async () => {
    setIsSubscribing(true);
    try {
      const permission = await Notification.requestPermission();
      
      if (permission === 'granted') {
        const registration = await navigator.serviceWorker.ready;
        const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
        
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey)
        });

        // 3. Dùng ID tự lấy được để lưu DB
        if (userId) {
          await supabase.from('push_subscriptions').upsert({
            user_id: userId,
            subscription: subscription.toJSON()
          });
        }
        
        setShowPrompt(false);
      } else {
        handleDismiss(); 
      }
    } catch (error) {
      console.error('Lỗi khi bật thông báo:', error);
    } finally {
      setIsSubscribing(false);
    }
  };

  if (!showPrompt) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl transform transition-all animate-slideUp">
        <button 
          onClick={handleDismiss}
          className="absolute top-4 right-4 p-1 bg-gray-100 rounded-full text-gray-500 hover:bg-gray-200 transition"
        >
          <X size={20} />
        </button>
        <div className="p-6 text-center pt-10">
          <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <BellRing size={32} className="text-[#003375] animate-bounce" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">Không bỏ lỡ thông tin!</h3>
          <p className="text-sm text-gray-500 mb-6 px-2">
            Bật thông báo để nhận ngay cập nhật về lịch thi, điểm số và các sự kiện mới nhất từ HUB Planner nhé.
          </p>
          <div className="flex flex-col gap-3">
            <button 
              onClick={handleAllow}
              disabled={isSubscribing}
              className="w-full py-3.5 bg-[#003375] text-white font-bold rounded-2xl active:scale-95 transition-all flex justify-center items-center"
            >
              {isSubscribing ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : 'Bật thông báo ngay'}
            </button>
            <button 
              onClick={handleDismiss}
              className="w-full py-3.5 bg-gray-50 text-gray-600 font-bold rounded-2xl active:scale-95 transition-all"
            >
              Để sau
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PushNotificationPrompt;