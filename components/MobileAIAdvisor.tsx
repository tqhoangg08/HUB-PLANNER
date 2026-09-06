import React, { useState, useRef, useEffect, useMemo } from 'react';
import { MessageSquare, Sparkles, X, Send, Loader2, ThumbsUp, ThumbsDown, Lock, History, Plus, MessageCircle, MoreVertical, Pin, PinOff, Edit3, Trash2, Check, ArrowLeft, BarChart2, Zap } from 'lucide-react'; 
import { Link } from 'react-router-dom';
import { UserData } from '../types';
import { calculateCumulativeStats, getDegreeClassification, calculateSubjectAverage } from '../utils/calculations';
import { playClick } from '../utils/audio';
import { showConfirm } from '../utils/appNotifications';
import DOMPurify from 'dompurify';
import { createPortal } from 'react-dom';
import { usePlatform } from '../hooks/usePlatform';
import {
  getAiAdvisorSession,
  listAiAdvisorSessions,
  sendAiAdvisorMessage,
  updateAiAdvisorSession,
} from '../utils/aiAdvisorApi';
import { sanitizeAIReply } from '../utils/aiSafety';
import { setRuntimeStyleRule } from '../utils/runtimeStyles';
import { CONSENT_POLICIES, recordPolicyConsent } from '../utils/policyConsent';
import { AIDocumentSources, type AIDocumentSource } from './AIDocumentSources';

interface AIAdvisorProps {
  data: UserData;
  userId?: string;
}

interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    logId?: number; 
    rating?: 'up' | 'down' | null; 
    isHistory?: boolean; 
    documentSources?: AIDocumentSource[];
    documentSearchUnavailable?: boolean;
}

interface ChatSessionLog {
    id: number;
    user_message?: string;
    bot_reply?: string;
    created_at: string;
    is_helpful: boolean | null;
    title?: string | null;
    is_deleted?: boolean;
    is_pinned?: boolean;
    document_sources?: AIDocumentSource[];
    document_search_unavailable?: boolean;
}

export const MobileAIAdvisor: React.FC<AIAdvisorProps> = ({ data, userId }) => {
  const platform = usePlatform();
  const isIOS = platform === 'ios';
  const [isOpen, setIsOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false); 
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingSessionId, setLoadingSessionId] = useState<number | null>(null);
  const [hasAIConsent, setHasAIConsent] = useState(false);
  
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [savedSessions, setSavedSessions] = useState<ChatSessionLog[]>([]); 
  
  const [activeDropdown, setActiveDropdown] = useState<number | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  const [customPrompt, setCustomPrompt] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const aiConsentStorageKey = userId ? `hub_ai_third_party_consent_${userId}` : 'hub_ai_third_party_consent_guest';

  useEffect(() => {
      if (!userId) {
          setHasAIConsent(false);
          return;
      }
      setHasAIConsent(localStorage.getItem(aiConsentStorageKey) === 'accepted');
  }, [aiConsentStorageKey, userId]);

  const acceptAIConsent = () => {
      playClick();
      localStorage.setItem(aiConsentStorageKey, 'accepted');
      setHasAIConsent(true);
      recordPolicyConsent(CONSENT_POLICIES.ai, 'ai_usage');
  };

  const [showBubble, setShowBubble] = useState(false);
  const [bubbleDismissed, setBubbleDismissed] = useState(false);

  useEffect(() => {
      if (bubbleDismissed || isOpen) {
          setShowBubble(false);
          return;
      }
      const initialTimeout = setTimeout(() => setShowBubble(true), 2000);
      const interval = setInterval(() => {
          setShowBubble(true);
          setTimeout(() => setShowBubble(false), 5000);
      }, 15000); // 15 giây hiện lại 1 lần nếu chưa tắt

      return () => { clearTimeout(initialTimeout); clearInterval(interval); };
  }, [bubbleDismissed, isOpen]);

  // --- DRAGGABLE FLOATING BUTTON STATE ---
  const getDockedX = () => window.innerWidth - (isIOS ? 82 : 70);
  const [pos, setPos] = useState({ x: getDockedX(), y: window.innerHeight - (isIOS ? 190 : 150) });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({ startX: 0, startY: 0, initX: 0, initY: 0 });

  useEffect(() => {
    const handleResize = () => {
        setPos(prev => {
            const newX = prev.x > window.innerWidth / 2 ? getDockedX() : 10;
            const newY = Math.min(Math.max(10, prev.y), window.innerHeight - 80);
            return { x: newX, y: newY };
        });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const onDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDragging(false); 
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    dragRef.current = { startX: clientX, startY: clientY, initX: pos.x, initY: pos.y };
  };

  const onDragMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (dragRef.current.startX === 0) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    const dx = clientX - dragRef.current.startX;
    const dy = clientY - dragRef.current.startY;
    
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
        setIsDragging(true);
        if (isOpen) setIsOpen(false); // Chỉ đóng khung chat khi ngón tay thực sự kéo đi
    }

    if (isDragging) {
        setPos({
            x: Math.min(Math.max(0, dragRef.current.initX + dx), window.innerWidth - 60),
            y: Math.min(Math.max(0, dragRef.current.initY + dy), window.innerHeight - 60)
        });
    }
  };

  const onDragEnd = () => {
    if (isDragging) {
        const snapX = pos.x > window.innerWidth / 2 ? getDockedX() : 10;
        setPos(p => ({ ...p, x: snapX }));
    }
    dragRef.current = { startX: 0, startY: 0, initX: 0, initY: 0 };
    setTimeout(() => setIsDragging(false), 50); 
  };

  // ============================================

  useEffect(() => {
      const handleClickOutside = () => setActiveDropdown(null);
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  useEffect(() => {
      const fetchHistorySessions = async () => {
          if (isOpen && userId) {
              setLoadingHistory(true);
              try {
                  const logs = await listAiAdvisorSessions();
                  if (logs) {
                    setSavedSessions(logs);
                  }
              } catch (err) {
                  console.error("Lỗi kéo lịch sử chat:", err);
              } finally {
                  setLoadingHistory(false);
              }
          }
      };
      fetchHistorySessions();
  }, [isOpen, userId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [chatHistory, loading]);

  const getStudentContext = () => {
      const stats = calculateCumulativeStats(data.semesters);
      const degree = getDegreeClassification(stats.rawGPA4);
      const failedSubjects = data.semesters.flatMap(sem => sem.subjects)
        .filter(s => {
            const avg = calculateSubjectAverage(s);
            return avg !== null && avg < 4.0 && !s.isNonGPA;
        }).map(s => s.name);

      return `
[NGỮ CẢNH SINH VIÊN ĐANG CHAT]
- Tên: ${data.studentName || "Sinh viên"} | Khóa: ${data.cohort || "Chưa rõ"}
- Ngành: ${data.majorName || "Chưa cập nhật"}
- GPA: ${stats.gpa4.toFixed(2)} (${degree})
- Môn nợ: ${failedSubjects.length > 0 ? failedSubjects.join(', ') : 'Không có'}
- Mục tiêu GPA: ${data.targetGPA || 3.2}`;
  };

  const handleAdvice = async (isFirstTime = false, presetQuestion = "") => {
    const questionToAsk = presetQuestion || customPrompt;
    if (!questionToAsk.trim() && !isFirstTime) return;
    if (!hasAIConsent) return;

    playClick();
    
    if (!isFirstTime) {
        setChatHistory(prev => [...prev, { role: "user", content: questionToAsk }]);
        setCustomPrompt(""); 
    }

    setLoading(true);

    try {
      const studentContext = getStudentContext();
      const cleanHistoryForAI = chatHistory.map(msg => ({ role: msg.role, content: msg.content }));
      const resData = await sendAiAdvisorMessage({
            question: questionToAsk,
            history: cleanHistoryForAI,
            context: studentContext,
      });
      const botReply = sanitizeAIReply(resData.reply || "Xin lỗi, mình không có câu trả lời.");
      const returnedLogId = resData.logId || Date.now(); 

      setChatHistory(prev => [...prev, { role: "assistant", content: botReply, logId: returnedLogId, documentSources: resData.documentSources || [], documentSearchUnavailable: Boolean(resData.documentSearchUnavailable) }]);

      const newSessionLog: ChatSessionLog = {
          id: returnedLogId,
          user_message: questionToAsk,
          bot_reply: botReply,
          created_at: new Date().toISOString(),
          is_helpful: null,
          is_pinned: false,
          is_deleted: false,
          document_sources: resData.documentSources || [],
          document_search_unavailable: Boolean(resData.documentSearchUnavailable)
      };
      setSavedSessions(prev => [newSessionLog, ...prev]);

    } catch (error: any) {
      console.error(error);
      setChatHistory(prev => [...prev, { role: "assistant", content: error.message || "Có lỗi xảy ra." }]);
    } finally {
      setLoading(false);
    }
  };

  const handleRate = async (index: number, isHelpful: boolean) => {
      const msg = chatHistory[index];
      playClick();

      const newHistory = [...chatHistory];
      newHistory[index].rating = isHelpful ? 'up' : 'down';
      setChatHistory(newHistory);

      if (msg.logId) {
        try {
            await updateAiAdvisorSession(msg.logId, { is_helpful: isHelpful });
            setSavedSessions(prev => prev.map(s => s.id === msg.logId ? { ...s, is_helpful: isHelpful } : s));
        } catch (err) {}
      }
  };

  const clearHistory = () => {
      playClick();
      setChatHistory([]);
      setShowHistory(false);
  }

  const getSessionLabel = (session: ChatSessionLog) => (
      session.title
      || session.user_message
      || `Cuộc trò chuyện ${new Date(session.created_at).toLocaleDateString('vi-VN')}`
  );

  const loadPastSession = async (session: ChatSessionLog) => {
      playClick();
      setLoadingSessionId(session.id);

      try {
          let fullSession = session;
          const hasFullContent = typeof session.user_message === 'string' && typeof session.bot_reply === 'string';

          if (!hasFullContent) {
              const data = await getAiAdvisorSession(session.id);
              if (!data) throw new Error('Không tìm thấy cuộc trò chuyện này.');

              fullSession = {
                  ...session,
                  ...data,
                  bot_reply: sanitizeAIReply(data.bot_reply || ''),
              };
              setSavedSessions(prev => prev.map(item => item.id === session.id ? fullSession : item));
          }

      setChatHistory([
          { role: 'user', content: fullSession.user_message || '', isHistory: true },
          {
              role: 'assistant',
              content: sanitizeAIReply(fullSession.bot_reply || ''),
              logId: fullSession.id,
              rating: fullSession.is_helpful === true ? 'up' : (fullSession.is_helpful === false ? 'down' : null),
              isHistory: true,
              documentSources: fullSession.document_sources || [],
              documentSearchUnavailable: Boolean(fullSession.document_search_unavailable)
          }
      ]);
      setShowHistory(false);
      } catch (err) {
          console.error("Lỗi tải chi tiết lịch sử chat:", err);
      } finally {
          setLoadingSessionId(null);
      }
  };

  const togglePin = async (session: ChatSessionLog) => {
      playClick();
      const newPinStatus = !session.is_pinned;
      setSavedSessions(prev => prev.map(s => s.id === session.id ? { ...s, is_pinned: newPinStatus } : s));
      setActiveDropdown(null);
      await updateAiAdvisorSession(session.id, { is_pinned: newPinStatus });
  };

  const deleteSession = async (id: number) => {
      playClick();
      if(!await showConfirm("Xóa cuộc trò chuyện này khỏi danh sách?")) return;
      setSavedSessions(prev => prev.map(s => s.id === id ? { ...s, is_deleted: true } : s));
      setActiveDropdown(null);
      if (chatHistory.length > 0 && chatHistory.some(m => m.logId === id)) setChatHistory([]);
      await updateAiAdvisorSession(id, { is_deleted: true });
  };

  const startRename = (session: ChatSessionLog) => {
      playClick();
      setEditingSessionId(session.id);
      setEditingTitle(getSessionLabel(session));
      setActiveDropdown(null);
  };

  const saveRename = async (id: number) => {
      playClick();
      const finalTitle = editingTitle.trim();
      setSavedSessions(prev => prev.map(s => s.id === id ? { ...s, title: finalTitle } : s));
      setEditingSessionId(null);
      if (finalTitle) await updateAiAdvisorSession(id, { title: finalTitle });
  };

  const sortedSessions = useMemo(() => {
      return savedSessions
          .filter(s => !s.is_deleted)
          .sort((a, b) => {
              if (a.is_pinned && !b.is_pinned) return -1;
              if (!a.is_pinned && b.is_pinned) return 1;
              return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
          });
  }, [savedSessions]);

  const isTopHalf = pos.y < window.innerHeight / 2;
  const bubbleOnRight = pos.x > window.innerWidth / 2;

  useEffect(() => {
      setRuntimeStyleRule('mobile-ai-bubble-position', '.mobile-ai-bubble-position', {
          top: `${pos.y - 10}px`,
          left: bubbleOnRight ? 'auto' : `${pos.x + 70}px`,
          right: bubbleOnRight ? `${window.innerWidth - pos.x + 10}px` : 'auto',
      });
      setRuntimeStyleRule('mobile-ai-drag-position', '.mobile-ai-drag-surface', {
          left: `${pos.x}px`,
          top: `${pos.y}px`,
      });
      setRuntimeStyleRule('mobile-ai-tail-position', '.mobile-ai-tail', {
          left: `${Math.max(20, Math.min(window.innerWidth - 36, pos.x + 20))}px`,
          top: isTopHalf ? `${pos.y + 60}px` : 'auto',
          bottom: isTopHalf ? 'auto' : `${window.innerHeight - pos.y - 4}px`,
      });
      setRuntimeStyleRule('mobile-ai-chat-panel-origin', '.mobile-ai-chat-panel', {
          'transform-origin': `${pos.x + 28}px ${isTopHalf ? '-10px' : 'calc(100% + 10px)'}`,
      });
  }, [bubbleOnRight, isTopHalf, pos.x, pos.y]);

  return (
    <>
      {/* Tèn ten bubble đi kèm với icon */}
      {!isOpen && showBubble && !bubbleDismissed && createPortal(
          <div 
              className="mobile-ai-bubble-position fixed z-[99999] animate-popOut pointer-events-auto"
          >
              <div className="mobile-ai-bubble relative w-56 bg-white text-gray-800 text-[11px] font-medium p-3 rounded-2xl shadow-xl border border-blue-100">
                  <button 
                      onClick={(e) => { e.stopPropagation(); playClick(); setBubbleDismissed(true); setShowBubble(false); }} 
                      className="absolute -top-2 -right-2 bg-gray-100 hover:bg-gray-200 text-gray-500 rounded-full p-1 shadow-sm transition-colors"
                  >
                      <X size={12}/>
                  </button>
                  <p>✨ Tèn ten! Trợ lý AI HUB Planner đã sẵn sàng hỗ trợ bạn học tập rồi nè! Thử ngay nha 💖</p>
                  
                  {/* Mũi tên chỉ vào icon */}
                  <div 
                      className={`absolute top-4 w-3 h-3 bg-white transform rotate-45 border-blue-100 ${
                          pos.x > window.innerWidth / 2 ? '-right-1.5 border-t border-r' : '-left-1.5 border-b border-l'
                      }`}
                  ></div>
              </div>
          </div>, document.body
      )}

      {/* DRAGGABLE CHAT BUBBLE ICON */}
      <div
        className="mobile-ai-advisor mobile-ai-drag-surface"
        onMouseDown={onDragStart}
        onMouseMove={onDragMove}
        onMouseUp={onDragEnd}
        onMouseLeave={onDragEnd}
        onTouchStart={onDragStart}
        onTouchMove={onDragMove}
        onTouchEnd={onDragEnd}
      >
        <button
            onClick={() => { 
                if (!isDragging) { 
                    playClick(); 
                    if (!isOpen) {
                        // Ép tọa độ về góc dưới phải trước khi mở khung chat
                        setPos({
                            x: window.innerWidth - 70,
                            y: window.innerHeight - (isIOS ? 190 : 150)
                        });
                    }
                    setIsOpen(!isOpen); 
                    setShowHistory(false); 
                } 
            }}
            className={`mobile-ai-button w-14 h-14 bg-[#003375] hover:bg-[#002855] text-white rounded-full shadow-[0_4px_20px_rgba(0,51,117,0.3)] flex items-center justify-center border-2 border-white transition-transform ${isDragging ? 'scale-90 cursor-grabbing' : 'cursor-grab hover:scale-105 active:scale-95 animate-float'} ${isOpen ? 'scale-90 bg-[#002855]' : ''}`}
        >
            {isOpen ? <X size={24} /> : <Sparkles size={24} className="text-yellow-300" />}
            
            {!isOpen && chatHistory.length === 0 && (
                <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 border-2 border-white rounded-full animate-pulse"></div>
            )}
        </button>
      </div>

      {/* Chat window popup từ icon */}
      {isOpen && createPortal(
        <div className="mobile-ai-overlay">
          {/* Backdrop tối nhẹ */}
<div 
  className="mobile-ai-backdrop animate-fadeIn"
  onClick={() => setIsOpen(false)}
/>

          {/* Mũi tên tail kết nối icon và khung chat */}
          <div 
            className="mobile-ai-tail absolute w-4 h-4 bg-white shadow-xl pointer-events-auto animate-popOut"
          />

          {/* KHUNG CHAT */}
          <div 
            className="mobile-ai-chat-panel bg-[#F8FAFC] shadow-2xl rounded-2xl flex flex-col overflow-hidden pointer-events-auto animate-popOut" 
            onClick={e => e.stopPropagation()}
          >
            {/* HEADER CHAT */}
            <div className="px-5 py-3 border-b border-gray-100 flex justify-between items-center bg-white shrink-0 relative z-10 shadow-sm">
              <div className="flex items-center gap-2.5">
                  <Sparkles size={20} className="text-yellow-400" />
                  <h3 className="font-extrabold text-[17px] text-[#003375]">
                      Trợ lý AI HUB
                  </h3>
              </div>
              <div className="flex items-center gap-2">
                  {userId && (
                      <button onClick={() => { playClick(); setShowHistory(true); }} className="p-2 text-gray-500 hover:bg-gray-100 rounded-full transition-colors active:scale-95" title="Lịch sử">
                          <History size={20} />
                      </button>
                  )}
              </div>
            </div>

            {/* Khung lịch sử chat trượt */}
            <div className={`absolute inset-0 top-14 bg-white z-20 flex flex-col transition-transform duration-300 ${showHistory ? 'translate-y-0' : 'translate-y-full'}`}>
                <div className="px-5 pt-3 pb-3 border-b border-gray-100 flex justify-between items-center bg-white shrink-0">
                    <button onClick={() => { playClick(); setShowHistory(false); }} className="p-2 -ml-2 bg-transparent text-gray-500 active:scale-95 transition-colors flex items-center gap-1">
                        <ArrowLeft size={20} /> <span className="font-bold text-sm">Quay lại</span>
                    </button>
                    <button onClick={clearHistory} className="px-3 py-1.5 bg-blue-50 text-[#003375] font-bold text-xs rounded-lg active:scale-95 flex items-center gap-1">
                        <Plus size={14}/> Tạo mới
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-1.5 pb-safe">
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-2 py-2">Gần đây</div>
                    {loadingHistory ? (
                        <div className="p-4 text-center text-xs text-gray-500 flex justify-center"><Loader2 size={16} className="animate-spin"/></div>
                    ) : sortedSessions.length === 0 ? (
                        <div className="p-8 text-center text-xs text-gray-400 flex flex-col items-center gap-2">
                            <MessageSquare size={32} className="text-gray-200" />
                            Bạn chưa có lịch sử trò chuyện nào.
                        </div>
                    ) : (
                        sortedSessions.map(session => (
                            <div key={session.id} className="relative group flex items-center justify-between w-full bg-white border border-gray-100 rounded-xl shadow-sm hover:border-blue-200 transition-colors overflow-visible">
                                {editingSessionId === session.id ? (
                                    <div className="flex-1 flex items-center px-3 py-2 gap-2 bg-white rounded-xl">
                                        <input 
                                            autoFocus type="text" value={editingTitle} onChange={(e) => setEditingTitle(e.target.value)}
                                            onKeyDown={(e) => { if (e.key === 'Enter') saveRename(session.id); else if (e.key === 'Escape') setEditingSessionId(null); }}
                                            className="flex-1 text-sm bg-gray-50 border border-blue-300 rounded px-2 py-1 outline-none font-medium text-[#003375]"
                                        />
                                        <button onClick={() => saveRename(session.id)} className="p-1.5 text-green-600 bg-green-50 rounded-md"><Check size={16}/></button>
                                        <button onClick={() => setEditingSessionId(null)} className="p-1.5 text-gray-500 bg-gray-100 rounded-md"><X size={16}/></button>
                                    </div>
                                ) : (
                                    <>
                                        <button 
                                            onClick={() => loadPastSession(session)} 
                                            className={`flex-1 text-left px-4 py-3.5 text-sm flex items-start gap-2.5 truncate rounded-l-xl transition-colors ${chatHistory.length > 0 && chatHistory[1]?.logId === session.id ? 'bg-blue-50 text-[#003375]' : 'text-gray-700'}`}
                                        >
                                            {loadingSessionId === session.id ? <Loader2 size={16} className="shrink-0 mt-0.5 animate-spin text-[#003375]" /> : session.is_pinned ? <Pin size={16} className="shrink-0 mt-0.5 text-[#003375] fill-[#003375]/20" /> : <MessageCircle size={16} className="shrink-0 mt-0.5 text-gray-400" />}
                                            <span className="truncate flex-1 font-semibold leading-snug">{getSessionLabel(session)}</span>
                                        </button>
                                        
                                        <button onClick={(e) => { e.stopPropagation(); setActiveDropdown(activeDropdown === session.id ? null : session.id); }} className="p-3 text-gray-400 hover:text-[#003375] active:bg-gray-50 rounded-r-xl">
                                            <MoreVertical size={16}/>
                                        </button>

                                        {activeDropdown === session.id && (
                                            <div className="absolute right-8 top-8 w-40 bg-white border border-gray-200 shadow-xl rounded-xl overflow-hidden z-[100] py-1 text-sm font-medium">
                                                <button onClick={(e) => { e.stopPropagation(); togglePin(session); }} className="w-full text-left px-4 py-3 active:bg-gray-50 flex items-center gap-2 text-gray-700">
                                                    {session.is_pinned ? <><PinOff size={16}/> Bỏ ghim</> : <><Pin size={16}/> Ghim</>}
                                                </button>
                                                <button onClick={(e) => { e.stopPropagation(); startRename(session); }} className="w-full text-left px-4 py-3 active:bg-gray-50 flex items-center gap-2 text-gray-700">
                                                    <Edit3 size={16}/> Đổi tên
                                                </button>
                                                <button onClick={(e) => { e.stopPropagation(); deleteSession(session.id); }} className="w-full text-left px-4 py-3 active:bg-red-50 flex items-center gap-2 text-red-600 border-t border-gray-100">
                                                    <Trash2 size={16}/> Xóa
                                                </button>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Hiển thị yêu cầu đăng nhập nếu chưa có user */}
            {!userId ? (
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center bg-[#F8FAFC] z-0">
                    <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm mb-4 border border-gray-200">
                        <Lock size={28} className="text-[#003375]" />
                    </div>
                    <h3 className="text-[17px] font-extrabold text-gray-900 mb-2">Yêu cầu đăng nhập</h3>
                    <p className="text-sm text-gray-500 mb-8 leading-relaxed px-4 max-w-sm">
                        Trợ lý AI cần biết bạn là ai để có thể đọc bảng điểm và tư vấn chính xác lộ trình cá nhân của bạn.
                    </p>
                    <Link to="/login" onClick={() => { playClick(); setIsOpen(false); }} className="bg-[#003375] text-white px-8 py-3.5 rounded-xl font-bold shadow-md hover:bg-[#002855] transition-colors flex items-center justify-center min-w-[200px] active:scale-95">
                        Đăng nhập ngay
                    </Link>
                </div>
            ) : (
                <div className="flex-1 flex flex-col min-w-0 bg-[#F3F4F6] relative z-0 overflow-hidden">
                   {/* Bong bóng chat nội dung */}
<div 
    className="mobile-ai-message-scroll flex-1 overflow-y-auto custom-scrollbar px-3 py-5 space-y-4 min-h-0" 
    ref={scrollRef}
>
                        
                        {!hasAIConsent ? (
                        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 mx-1 text-left shadow-sm">
                            <div className="flex items-start gap-3">
                                <Sparkles size={20} className="text-[#003375] shrink-0 mt-0.5" />
                                <div className="space-y-3">
                                    <div>
                                        <p className="font-extrabold text-[#003375] text-sm">Đồng ý xử lý dữ liệu cho trợ lý AI</p>
                                        <p className="text-xs text-gray-700 mt-1 leading-relaxed">
                                            Để AI tư vấn, HUB Planner sẽ gửi câu hỏi, lịch sử hội thoại cần thiết và ngữ cảnh học tập
                                            như GPA, ngành, khóa, môn cần lưu ý tới dịch vụ AI bên thứ ba như Google Gemini hoặc Groq.
                                            Hệ thống không gửi mật khẩu, OTP hoặc thông tin đăng nhập.
                                        </p>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={acceptAIConsent}
                                            className="px-4 py-2 bg-[#003375] text-white rounded-lg text-xs font-bold active:scale-95"
                                        >
                                            Tôi đồng ý
                                        </button>
                                        <Link to="/privacy" onClick={() => setIsOpen(false)} className="text-xs font-semibold text-[#003375] underline">
                                            Xem Chính sách bảo mật
                                        </Link>
                                    </div>
                                </div>
                            </div>
                        </div>
                        ) : chatHistory.length === 0 && !loading ? (
                        <div className="flex flex-col items-center animate-message mt-6 mb-10 px-2 text-center">
                            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm mb-3 text-[#003375]">
                                <Sparkles size={32} />
                            </div>
                            <p className="font-extrabold text-gray-900 text-lg mb-1">HUB AI Planner</p>
                            <p className="text-sm text-gray-500 mb-6 max-w-[260px]">Sẵn sàng hỗ trợ lộ trình và giải đáp thắc mắc học vụ.</p>
                            
                            <div className="flex flex-col w-full gap-2 px-2 max-w-sm">
                                <button disabled={!hasAIConsent} onClick={() => handleAdvice(false, "Đánh giá tổng quan kết quả học tập của mình")} className="text-[13px] bg-white border border-gray-200 py-3 px-4 rounded-full active:bg-blue-50 active:text-[#003375] font-semibold text-gray-600 shadow-sm transition-all text-center disabled:opacity-50 disabled:cursor-not-allowed">
                                    Đánh giá bảng điểm hiện tại
                                </button>
                                <button disabled={!hasAIConsent} onClick={() => handleAdvice(false, "Mục tiêu GPA của mình có khả thi không?")} className="text-[13px] bg-white border border-gray-200 py-3 px-4 rounded-full active:bg-blue-50 active:text-[#003375] font-semibold text-gray-600 shadow-sm transition-all text-center disabled:opacity-50 disabled:cursor-not-allowed">
                                    Mục tiêu GPA có khả thi?
                                </button>
                            </div>
                        </div>
                        ) : (
                        <>
                            {chatHistory.some(m => m.isHistory) && (
                                <div className="flex items-center justify-center my-4 opacity-60">
                                    <div className="h-px bg-gray-300 flex-1 max-w-[60px]"></div>
                                    <span className="text-[10px] uppercase font-bold text-gray-500 px-3 flex items-center gap-1.5"><History size={12}/> Đang xem lịch sử cũ</span>
                                    <div className="h-px bg-gray-300 flex-1 max-w-[60px]"></div>
                                </div>
                            )}

                            {chatHistory.map((msg, idx) => (
                            <div key={idx} className={`flex flex-col w-full ${msg.role === 'user' ? 'items-end pl-12' : 'items-start pr-10'} ${!msg.isHistory ? 'animate-message' : ''}`}>
                                <div className={`px-4 py-2.5 text-[15px] leading-relaxed shadow-sm relative ${
                                    msg.role === 'user' 
                                        ? 'bg-[#003375] text-white rounded-2xl rounded-tr-sm' 
                                        : 'bg-white text-gray-800 rounded-2xl rounded-tl-sm border border-gray-100'
                                }`}>
                                {msg.role === 'assistant' ? (
                                    <><div className="prose prose-sm max-w-none prose-p:leading-relaxed break-words" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(msg.content.replace(/\n/g, '<br />').replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')) }} /><AIDocumentSources sources={msg.documentSources} unavailable={msg.documentSearchUnavailable} /></>
                                ) : ( <p className="break-words">{msg.content}</p> )}
                                </div>
                                
                                {msg.role === 'assistant' && (
                                    <div className="mt-1 ml-1 flex flex-wrap items-center gap-2">
                                        <div className="flex gap-2">
                                            <button onClick={() => handleRate(idx, true)} className={`p-1.5 rounded-full active:bg-gray-200 transition ${msg.rating === 'up' ? 'text-green-600 bg-green-50' : 'text-gray-400'}`}>
                                                <ThumbsUp size={14} className={msg.rating === 'up' ? 'fill-current' : ''} />
                                            </button>
                                            <button onClick={() => handleRate(idx, false)} className={`p-1.5 rounded-full active:bg-gray-200 transition ${msg.rating === 'down' ? 'text-red-600 bg-red-50' : 'text-gray-400'}`}>
                                                <ThumbsDown size={14} className={msg.rating === 'down' ? 'fill-current' : ''} />
                                            </button>
                                        </div>
                                        {userId && (
                                            <Link
                                                to="/support/new"
                                                onClick={() => { playClick(); setIsOpen(false); }}
                                                className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-[11px] font-bold text-[#003375]"
                                            >
                                                Chưa hài lòng? Tạo ticket admin hỗ trợ trực tiếp
                                            </Link>
                                        )}
                                    </div>
                                )}
                            </div>
                            ))}
                        </>
                        )}
                        
                        {loading && (
                            <div className="flex justify-start animate-message pr-10">
                                <div className="bg-white border border-gray-100 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1.5 shadow-sm">
                                    <div className="w-2 h-2 bg-gray-400 rounded-full typing-dot"></div>
                                    <div className="w-2 h-2 bg-gray-400 rounded-full typing-dot"></div>
                                    <div className="w-2 h-2 bg-gray-400 rounded-full typing-dot"></div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Khung nhập chat */}
                    <div className="px-3 pt-3 pb-safe bg-white border-t border-gray-100 shadow-[0_-5px_10px_rgba(0,0,0,0.02)] z-10 shrink-0">
                        <form onSubmit={(e) => { e.preventDefault(); handleAdvice(); }} className="flex items-end gap-2 pb-2">
                            <textarea
                                rows={1}
                                placeholder="Hỏi AI tại đây..."
                                className="flex-1 border border-gray-200 rounded-2xl pl-4 pr-3 py-3 min-h-[44px] max-h-24 focus:border-[#003375] focus:outline-none bg-gray-50 text-[15px] resize-none custom-scrollbar transition-all"
                                value={customPrompt} 
                                onChange={(e) => setCustomPrompt(e.target.value)} 
                                disabled={loading || loadingHistory || !hasAIConsent}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleAdvice();
                                    }
                                }}
                            />
                            <button type="submit" disabled={loading || loadingHistory || !hasAIConsent || !customPrompt.trim()} className="bg-[#003375] text-white w-11 h-11 rounded-full shrink-0 disabled:opacity-50 active:scale-90 shadow-sm flex items-center justify-center transition-transform">
                                {loading ? <Loader2 className="animate-spin" size={20} /> : <Send size={18} className="mr-0.5 mt-0.5" />}
                            </button>
                        </form>
                    </div>
                </div>
            )}
          </div>
        </div>, document.body
      )}
    </>
  );
};
