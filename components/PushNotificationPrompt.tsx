import React, { useState, useEffect } from 'react';
import { BellRing, X, AlertTriangle } from 'lucide-react';
import {
  isPushNotificationSyncAvailable,
  requiresIosHomeScreenInstallForPush,
  subscribeToDeviceNotifications,
} from '../utils/pushNotifications';
import { fetchBetterAuthSession } from '../utils/privateApi';

const PushNotificationPrompt = () => {
  const [showPrompt, setShowPrompt] = useState(false);
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [subscribeError, setSubscribeError] = useState<string | null>(null);
  
  // ✨ THÊM STATE ĐỂ BẮT LỖI KHI BỊ CHẶN HOẶC TẮT
  const [deniedError, setDeniedError] = useState(false);
  const [iosInstallRequired, setIosInstallRequired] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const loadUser = async () => {
      const session = await fetchBetterAuthSession();
      if (isMounted) setUserId(session?.user?.id || null);
    };

    const refreshUser = () => {
      void loadUser().catch(() => {
        if (isMounted) setUserId(null);
      });
    };
    refreshUser();
    window.addEventListener('focus', refreshUser);

    return () => {
      isMounted = false;
      window.removeEventListener('focus', refreshUser);
    };
  }, []);

  useEffect(() => {
    if (!userId) return;

    const needsIosInstall = requiresIosHomeScreenInstallForPush();
    setIosInstallRequired(needsIosInstall);
    if (!needsIosInstall && !isPushNotificationSyncAvailable()) return;

    const permission = 'Notification' in window ? Notification.permission : 'default';
    if (!needsIosInstall && permission === 'granted') return;
    setDeniedError(!needsIosInstall && permission === 'denied');
    
    const hasDismissed = localStorage.getItem(`push_prompt_dismissed:${userId}`);
    if (hasDismissed) return;

    const timer = setTimeout(() => {
      setShowPrompt(true);
    }, 3000);

    return () => clearTimeout(timer);
  }, [userId]);

  const handleDismiss = () => {
    setShowPrompt(false);
    if (userId) localStorage.setItem(`push_prompt_dismissed:${userId}`, 'true');
  };

  const handleAllow = async () => {
    if (iosInstallRequired) {
      setSubscribeError('Trên iPhone/iPad, hãy bấm Chia sẻ → Thêm vào Màn hình chính, rồi mở HUB Planner từ biểu tượng vừa cài để bật thông báo.');
      return;
    }

    setIsSubscribing(true);
    setSubscribeError(null);
    setDeniedError(false); // Reset lỗi mỗi lần bấm thử

    try {
      const permission = await Notification.requestPermission();
      
      if (permission === 'granted') {
        await subscribeToDeviceNotifications(userId);

        setShowPrompt(false); // Thành công thì đóng popup
      } 
      else if (permission === 'denied') {
        // ✨ NẾU BẤM CHẶN: Giữ nguyên popup, hiện cảnh báo hướng dẫn
        setDeniedError(true);
      } 
      else {
        // ✨ NẾU CHỈ BẤM DẤU 'X' TRÊN TRÌNH DUYỆT: Giữ nguyên popup (Không đóng)
        // Không làm gì cả để họ có thể bấm lại nút "Cài đặt & Nhận thông báo"
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Lỗi không xác định.';
      setSubscribeError(`Chưa lưu được thiết bị nhận thông báo. ${message}`);
      console.error('Lỗi khi bật thông báo:', error);
    } finally {
      setIsSubscribing(false);
    }
  };

  if (!showPrompt) return null;

  return (
    <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/40 p-4 animate-fadeIn">
      <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl transform transition-all animate-slideUp relative">
        
        {/* Nút X nhỏ xíu trên góc để tắt (Không còn nút Để sau) */}
        <button 
          onClick={handleDismiss}
          className="absolute top-4 right-4 p-1.5 bg-gray-100 rounded-full text-gray-500 hover:bg-gray-200 transition z-10"
        >
          <X size={18} />
        </button>

        <div className="p-6 text-center pt-10">
          {deniedError ? (
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle size={32} className="text-red-500 animate-pulse" />
            </div>
          ) : (
            <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <BellRing size={32} className="text-[#003375] animate-bounce" />
            </div>
          )}
          
          <h3 className="text-xl font-bold text-gray-900 mb-2">
            {iosInstallRequired ? 'Cài HUB Planner để nhận thông báo' : deniedError ? 'Bạn đã chặn thông báo' : 'Thông báo hệ thống'}
          </h3>
          
          <p className="text-sm text-gray-500 mb-6 px-2">
            {iosInstallRequired ? (
              <span className="text-[#003375] font-medium">
                Trên iPhone/iPad, Web Push chỉ hoạt động khi HUB Planner được thêm vào Màn hình chính. Bấm Chia sẻ → Thêm vào Màn hình chính, rồi mở app từ biểu tượng vừa cài.
              </span>
            ) : deniedError ? (
              <span className="text-red-500 font-medium">
                Vui lòng bấm vào <b className="text-gray-800">Biểu tượng 🔒 (Ổ khóa)</b> trên thanh địa chỉ URL của trình duyệt để cho phép nhận thông báo nhé!
              </span>
            ) : (
              'Bật thông báo để nhận cập nhật về tin trường, sự kiện, tìm đồ thất lạc và thông báo hệ thống từ HUB Planner nhé.'
            )}
          </p>

          {subscribeError && (
            <p className="text-xs text-red-500 font-semibold mb-4 px-2 leading-relaxed">
              {subscribeError}
            </p>
          )}

          <div className="flex flex-col gap-3">
            <button 
              onClick={handleAllow}
              disabled={isSubscribing || deniedError}
              className={`w-full py-3.5 text-white font-bold rounded-2xl transition-all flex justify-center items-center shadow-lg ${
                deniedError
                  ? 'bg-gray-400 cursor-not-allowed shadow-none' 
                  : 'bg-[#003375] active:scale-95 shadow-blue-900/20'
              }`}
            >
              {isSubscribing ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                iosInstallRequired ? 'Xem hướng dẫn cài đặt' : deniedError ? 'Đang đợi bạn mở quyền...' : 'Bật thông báo'
              )}
            </button>
            {/* ĐÃ XÓA HOÀN TOÀN NÚT "ĐỂ SAU" Ở ĐÂY */}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PushNotificationPrompt;
