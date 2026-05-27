import React, { useState, useRef, useEffect, useMemo } from 'react';
import { MessageSquare, Sparkles, X, Send, Loader2, ThumbsUp, ThumbsDown, Lock, History, Menu, Plus, MessageCircle, MoreVertical, Pin, PinOff, Edit3, Trash2, Check } from 'lucide-react'; 
import { Link } from 'react-router-dom';
import { UserData } from '../types';
import { calculateCumulativeStats, getDegreeClassification, calculateSubjectAverage } from '../utils/calculations';
import { playClick } from '../utils/audio';
import { showConfirm } from '../utils/appNotifications';
import { supabase } from '../utils/supabase'; 
import DOMPurify from 'dompurify';
import { apiHeaders, apiUrl } from '../utils/api';
import { sanitizeAIReply } from '../utils/aiSafety';

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
}

interface ChatSessionLog {
    id: number;
    user_message: string;
    bot_reply: string;
    created_at: string;
    is_helpful: boolean | null;
    title?: string | null;
    is_deleted?: boolean;
    is_pinned?: boolean;
}

export const AIAdvisor: React.FC<AIAdvisorProps> = ({ data, userId }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showSidebar, setShowSidebar] = useState(window.innerWidth >= 768); 
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [savedSessions, setSavedSessions] = useState<ChatSessionLog[]>([]); 
  
  // ✨ State cho tính năng quản lý lịch sử
  const [activeDropdown, setActiveDropdown] = useState<number | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  const [customPrompt, setCustomPrompt] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Đóng dropdown khi click ra ngoài
  useEffect(() => {
      const handleClickOutside = () => setActiveDropdown(null);
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // Kéo danh sách lịch sử chat từ Supabase khi mở cửa sổ AI
  useEffect(() => {
      const fetchHistorySessions = async () => {
          if (isOpen && userId && supabase) {
              setLoadingHistory(true);
              try {
                  const { data: logs, error } = await supabase
                      .from('ai_chat_logs')
                      .select('*')
                      .eq('user_id', userId)
                      .order('created_at', { ascending: false }) 
                      .limit(50); 

                  if (error) throw error;
                  if (logs) {
                    setSavedSessions(logs.map(log => ({
                      ...log,
                      bot_reply: sanitizeAIReply(log.bot_reply || ''),
                    })));
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
      const degree = getDegreeClassification(stats.gpa4);
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

    playClick();
    
    if (!isFirstTime) {
        setChatHistory(prev => [...prev, { role: "user", content: questionToAsk }]);
        setCustomPrompt(""); 
    }

    setLoading(true);

    try {
      const studentContext = getStudentContext();
      
      const cleanHistoryForAI = chatHistory.map(msg => ({ role: msg.role, content: msg.content }));
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      const res = await fetch(apiUrl('/bot'), {
        method: 'POST',
        headers: apiHeaders({
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
        }),
        body: JSON.stringify({ 
            question: questionToAsk,
            message: questionToAsk,
            history: cleanHistoryForAI,
            context: studentContext,
            userId: userId
        })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(errorData?.message || errorData?.error || "Máy chủ AI đang bận hoặc mất kết nối.");
      }

      const resData = await res.json();
      const botReply = sanitizeAIReply(resData.reply || "Xin lỗi, mình không có câu trả lời.");
      const returnedLogId = resData.logId || Date.now(); 

      setChatHistory(prev => [...prev, { role: "assistant", content: botReply, logId: returnedLogId }]);

      const newSessionLog: ChatSessionLog = {
          id: returnedLogId,
          user_message: questionToAsk,
          bot_reply: botReply,
          created_at: new Date().toISOString(),
          is_helpful: null,
          is_pinned: false,
          is_deleted: false
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

      if (msg.logId && supabase) {
        try {
            await supabase.from('ai_chat_logs').update({ is_helpful: isHelpful }).eq('id', msg.logId);
            setSavedSessions(prev => prev.map(s => s.id === msg.logId ? { ...s, is_helpful: isHelpful } : s));
        } catch (err) {}
      }
  };

  const clearHistory = () => {
      playClick();
      setChatHistory([]);
      if (window.innerWidth < 768) setShowSidebar(false);
  }

  const loadPastSession = (session: ChatSessionLog) => {
      playClick();
      setChatHistory([
          { role: 'user', content: session.user_message, isHistory: true },
          { 
              role: 'assistant', 
              content: sanitizeAIReply(session.bot_reply), 
              logId: session.id, 
              rating: session.is_helpful === true ? 'up' : (session.is_helpful === false ? 'down' : null), 
              isHistory: true 
          }
      ]);
      if (window.innerWidth < 768) setShowSidebar(false); 
  };

  // ✨ CÁC HÀM XỬ LÝ OPTIONS CỦA LỊCH SỬ
  const togglePin = async (session: ChatSessionLog) => {
      playClick();
      const newPinStatus = !session.is_pinned;
      setSavedSessions(prev => prev.map(s => s.id === session.id ? { ...s, is_pinned: newPinStatus } : s));
      setActiveDropdown(null);
      if (supabase) {
          await supabase.from('ai_chat_logs').update({ is_pinned: newPinStatus }).eq('id', session.id);
      }
  };

  const deleteSession = async (id: number) => {
      playClick();
      if(!await showConfirm("Xóa cuộc trò chuyện này khỏi danh sách?")) return;
      setSavedSessions(prev => prev.map(s => s.id === id ? { ...s, is_deleted: true } : s));
      setActiveDropdown(null);
      
      // Nếu đang xem session này thì clear chat
      if (chatHistory.length > 0 && chatHistory.some(m => m.logId === id)) {
          setChatHistory([]);
      }
      
      if (supabase) {
          await supabase.from('ai_chat_logs').update({ is_deleted: true }).eq('id', id);
      }
  };

  const startRename = (session: ChatSessionLog) => {
      playClick();
      setEditingSessionId(session.id);
      setEditingTitle(session.title || session.user_message);
      setActiveDropdown(null);
  };

  const saveRename = async (id: number) => {
      playClick();
      const finalTitle = editingTitle.trim();
      setSavedSessions(prev => prev.map(s => s.id === id ? { ...s, title: finalTitle } : s));
      setEditingSessionId(null);
      if (supabase && finalTitle) {
          await supabase.from('ai_chat_logs').update({ title: finalTitle }).eq('id', id);
      }
  };

  // Lọc và Sắp xếp danh sách: Gim lên đầu, sau đó mới tới mới nhất
  const sortedSessions = useMemo(() => {
      return savedSessions
          .filter(s => !s.is_deleted)
          .sort((a, b) => {
              if (a.is_pinned && !b.is_pinned) return -1;
              if (!a.is_pinned && b.is_pinned) return 1;
              return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
          });
  }, [savedSessions]);

  return (
    <>
      <button
        onClick={() => { playClick(); setIsOpen(true); setShowSidebar(window.innerWidth >= 768); }}
        className="fixed bottom-6 right-6 bg-[#003375] hover:bg-[#002855] text-white p-4 rounded-full shadow-lg hover:shadow-2xl transition-all duration-300 z-50 flex items-center gap-2 border-4 border-white active:scale-95 group animate-float hover:animate-none"
      >
        <Sparkles size={24} className="group-hover:animate-pulse text-yellow-300" />
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-2 sm:p-4 animate-fadeIn">
          <div className={`bg-white rounded-xl shadow-2xl flex flex-col h-[85vh] sm:h-[80vh] animate-slideUp relative overflow-hidden transition-all duration-300 w-full ${showSidebar ? 'max-w-4xl' : 'max-w-2xl'}`}>
            
            <div className="p-3 sm:p-4 border-b flex justify-between items-center bg-[#003375] text-white shrink-0 z-20 relative">
              <div className="flex items-center gap-2 sm:gap-3">
                  {userId && (
                      <button onClick={() => { playClick(); setShowSidebar(!showSidebar); }} className={`p-1.5 sm:p-2 hover:bg-white/20 rounded-lg transition-colors active:scale-95 ${showSidebar ? 'bg-white/10' : ''}`} title="Lịch sử trò chuyện">
                          <Menu size={20} />
                      </button>
                  )}
                  <h3 className="font-bold text-base sm:text-lg flex items-center gap-1.5 sm:gap-2">
                      <Sparkles size={18} className="text-yellow-300 hidden sm:block" />
                      Trợ lý Học tập HUB
                  </h3>
              </div>
              <div className="flex items-center gap-1">
                  <button onClick={() => { playClick(); setIsOpen(false); }} className="hover:bg-white/20 p-1.5 sm:p-2 rounded-full transition-colors active:scale-90 ml-1">
                    <X size={20} />
                  </button>
              </div>
            </div>

            {!userId ? (
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center bg-gray-50 rounded-b-xl z-0">
                    <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm mb-4 border border-gray-200">
                        <Lock size={28} className="text-[#003375]" />
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 mb-2">Yêu cầu đăng nhập</h3>
                    <p className="text-sm text-gray-500 mb-6 leading-relaxed px-4 max-w-md">
                        Trợ lý AI cần biết bạn là ai để có thể đọc bảng điểm và tư vấn chính xác lộ trình cá nhân của bạn.
                    </p>
                    <Link 
                        to="/login" 
                        onClick={() => { playClick(); setIsOpen(false); }} 
                        className="bg-[#003375] text-white px-6 py-2.5 rounded-xl font-bold shadow-md hover:bg-[#002855] transition-colors flex items-center gap-2 active:scale-95"
                    >
                        Đăng nhập ngay
                    </Link>
                </div>
            ) : (
                <div className="flex flex-1 overflow-hidden relative bg-white">
                    {/* SIDEBAR */}
                    <div className={`absolute md:relative z-20 h-full bg-[#F8FAFC] border-r border-gray-200 flex flex-col transition-all duration-300 overflow-visible ${showSidebar ? 'w-64 md:w-72 translate-x-0' : 'w-64 md:w-0 -translate-x-full md:translate-x-0 shrink-0'}`}>
                        <div className="p-3 border-b border-gray-200 shrink-0">
                            <button onClick={clearHistory} className="w-full flex items-center gap-2 px-3 py-2.5 bg-white border border-gray-200 shadow-sm rounded-lg hover:bg-gray-50 hover:border-gray-300 text-sm font-bold text-[#003375] transition-all active:scale-95">
                                <Plus size={16}/> Cuộc trò chuyện mới
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1 relative">
                            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-3 py-2 mt-1">Lịch sử gần đây</div>
                            {loadingHistory ? (
                                <div className="p-4 text-center text-xs text-gray-500 flex justify-center"><Loader2 size={16} className="animate-spin"/></div>
                            ) : sortedSessions.length === 0 ? (
                                <div className="p-4 text-center text-xs text-gray-400 italic">Chưa có lịch sử trò chuyện.</div>
                            ) : (
                                sortedSessions.map(session => (
                                    <div key={session.id} className="relative group flex items-center justify-between w-full rounded-lg hover:bg-gray-200/50 transition-colors">
                                        {editingSessionId === session.id ? (
                                            // Chế độ Edit Tên
                                            <div className="flex-1 flex items-center px-2 py-1.5 gap-1 bg-white border border-blue-300 rounded-lg shadow-sm">
                                                <input 
                                                    autoFocus
                                                    type="text" 
                                                    value={editingTitle} 
                                                    onChange={(e) => setEditingTitle(e.target.value)}
                                                    onKeyDown={(e) => { if (e.key === 'Enter') saveRename(session.id); else if (e.key === 'Escape') setEditingSessionId(null); }}
                                                    className="flex-1 text-sm bg-transparent px-1 py-1 outline-none font-medium text-[#003375]"
                                                />
                                                <button onClick={() => saveRename(session.id)} className="p-1.5 text-green-600 hover:bg-green-100 rounded-md"><Check size={14}/></button>
                                                <button onClick={() => setEditingSessionId(null)} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-md"><X size={14}/></button>
                                            </div>
                                        ) : (
                                            // Chế độ Bình thường
                                            <>
                                                <button 
                                                    onClick={() => loadPastSession(session)} 
                                                    className={`flex-1 text-left px-3 py-2.5 text-sm flex items-start gap-2 truncate group/btn rounded-lg transition-colors ${chatHistory.length > 0 && chatHistory[1]?.logId === session.id ? 'bg-blue-50 text-[#003375]' : 'text-gray-700'}`}
                                                    title={session.title || session.user_message}
                                                >
                                                    {session.is_pinned ? (
                                                        <Pin size={14} className="shrink-0 mt-0.5 text-[#003375] fill-current" />
                                                    ) : (
                                                        <MessageCircle size={14} className="shrink-0 mt-0.5 opacity-40 group-hover/btn:text-[#003375] group-hover/btn:opacity-100 transition-colors" />
                                                    )}
                                                    <span className="truncate flex-1 font-medium leading-snug">{session.title || session.user_message}</span>
                                                </button>
                                                
                                                <div className="absolute right-1 opacity-0 group-hover:opacity-100 transition-opacity flex items-center bg-gradient-to-l from-gray-100 via-gray-100 to-transparent pl-4 pr-1 py-1 rounded-r-lg">
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); setActiveDropdown(activeDropdown === session.id ? null : session.id); }} 
                                                        className="p-1 text-gray-500 hover:bg-white hover:text-[#003375] rounded transition-colors shadow-sm bg-transparent"
                                                    >
                                                        <MoreVertical size={14}/>
                                                    </button>
                                                </div>

                                                {/* Dropdown Options */}
                                                {activeDropdown === session.id && (
                                                    <div className="absolute right-8 top-8 w-36 bg-white border border-gray-200 shadow-xl rounded-lg overflow-hidden z-[100] py-1 text-sm font-medium">
                                                        <button onClick={(e) => { e.stopPropagation(); togglePin(session); }} className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2 text-gray-700">
                                                            {session.is_pinned ? <><PinOff size={14}/> Bỏ ghim</> : <><Pin size={14}/> Ghim lên đầu</>}
                                                        </button>
                                                        <button onClick={(e) => { e.stopPropagation(); startRename(session); }} className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2 text-gray-700">
                                                            <Edit3 size={14}/> Đổi tên
                                                        </button>
                                                        <button onClick={(e) => { e.stopPropagation(); deleteSession(session.id); }} className="w-full text-left px-3 py-2 hover:bg-red-50 flex items-center gap-2 text-red-600">
                                                            <Trash2 size={14}/> Xóa cuộc trò chuyện
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

                    {showSidebar && (
                        <div className="absolute inset-0 bg-black/20 z-[15] md:hidden" onClick={() => setShowSidebar(false)}></div>
                    )}

                    <div className="flex-1 flex flex-col min-w-0 bg-white relative z-0">
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4 bg-white" ref={scrollRef}>
                          
                          {chatHistory.length === 0 && !loading ? (
                            <div className="text-center text-gray-500 py-10 flex flex-col items-center animate-message">
                              <div className="bg-blue-50 p-4 rounded-full mb-4">
                                  <MessageSquare size={32} className="text-[#003375]" />
                              </div>
                              <p className="font-medium text-gray-800 text-base">Chào {data.studentName || 'bạn'}!</p>
                              <p className="text-sm mt-1 max-w-xs text-gray-500">Hôm nay mình có thể giúp gì cho quá trình học tập của bạn tại HUB?</p>
                              
                              <div className="mt-8 flex flex-wrap justify-center gap-2 px-2">
                                  <button onClick={() => { handleAdvice(false, "Đánh giá tổng quan kết quả học tập của mình"); }} className="text-xs bg-white border border-gray-200 px-4 py-2.5 rounded-xl hover:bg-blue-50 hover:border-blue-200 hover:text-[#003375] font-medium transition-all shadow-sm active:scale-95">
                                      📊 Đánh giá bảng điểm hiện tại
                                  </button>
                                  <button onClick={() => { handleAdvice(false, "Mục tiêu GPA của mình có khả thi không?"); }} className="text-xs bg-white border border-gray-200 px-4 py-2.5 rounded-xl hover:bg-blue-50 hover:border-blue-200 hover:text-[#003375] font-medium transition-all shadow-sm active:scale-95">
                                      🎯 Đánh giá mục tiêu GPA
                                  </button>
                                  <button onClick={() => { handleAdvice(false, "Điều kiện để đạt học bổng xuất sắc là gì?"); }} className="text-xs bg-white border border-gray-200 px-4 py-2.5 rounded-xl hover:bg-blue-50 hover:border-blue-200 hover:text-[#003375] font-medium transition-all shadow-sm active:scale-95">
                                      🎓 Điều kiện đạt Học bổng
                                  </button>
                              </div>
                            </div>
                          ) : (
                            <>
                                {chatHistory.some(m => m.isHistory) && (
                                    <div className="flex items-center justify-center my-4 opacity-60">
                                        <div className="h-px bg-gray-200 flex-1 max-w-[60px]"></div>
                                        <span className="text-[10px] uppercase font-bold text-gray-500 px-3 flex items-center gap-1.5"><History size={12}/> Đang xem lịch sử cũ</span>
                                        <div className="h-px bg-gray-200 flex-1 max-w-[60px]"></div>
                                    </div>
                                )}

                                {chatHistory.map((msg, idx) => (
                                <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} ${!msg.isHistory ? 'animate-message' : ''}`}>
                                    <div className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm text-sm leading-relaxed ${
                                        msg.role === 'user' ? 'bg-[#003375] text-white rounded-br-none' : 'bg-gray-50 text-gray-800 border border-gray-100 rounded-bl-none'
                                    }`}>
                                    {msg.role === 'assistant' ? (
                                        <div className="prose prose-sm max-w-none prose-p:leading-relaxed" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(msg.content.replace(/\n/g, '<br />').replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')) }} />
                                    ) : ( <p>{msg.content}</p> )}
                                    </div>
                                    {msg.role === 'assistant' && (
                                        <div className="flex gap-2 mt-1.5 ml-2 opacity-40 hover:opacity-100 transition-opacity">
                                            <button onClick={() => handleRate(idx, true)} className={`p-1.5 rounded-full hover:bg-gray-200 transition ${msg.rating === 'up' ? 'text-green-600 bg-green-50' : 'text-gray-500'}`}>
                                                <ThumbsUp size={14} className={msg.rating === 'up' ? 'fill-current' : ''} />
                                            </button>
                                            <button onClick={() => handleRate(idx, false)} className={`p-1.5 rounded-full hover:bg-gray-200 transition ${msg.rating === 'down' ? 'text-red-600 bg-red-50' : 'text-gray-500'}`}>
                                                <ThumbsDown size={14} className={msg.rating === 'down' ? 'fill-current' : ''} />
                                            </button>
                                        </div>
                                    )}
                                </div>
                                ))}
                            </>
                          )}
                          
                          {loading && (
                              <div className="flex justify-start animate-message">
                                <div className="bg-gray-50 border border-gray-100 rounded-2xl rounded-bl-none px-4 py-4 flex items-center gap-1.5 shadow-sm">
                                    <div className="w-2 h-2 bg-gray-400 rounded-full typing-dot"></div>
                                    <div className="w-2 h-2 bg-gray-400 rounded-full typing-dot"></div>
                                    <div className="w-2 h-2 bg-gray-400 rounded-full typing-dot"></div>
                                </div>
                              </div>
                          )}
                        </div>

                        <div className="p-3 sm:p-4 border-t border-gray-100 bg-white z-10 shrink-0">
                          <form onSubmit={(e) => { e.preventDefault(); handleAdvice(); }} className="flex gap-2 relative">
                            <input
                              type="text" placeholder="Nhập câu hỏi tại đây..."
                              className="flex-1 border border-gray-200 rounded-full pl-4 pr-12 py-3 focus:ring-2 focus:ring-[#003375] focus:outline-none bg-gray-50 transition-all text-sm"
                              value={customPrompt} onChange={(e) => setCustomPrompt(e.target.value)} disabled={loading || loadingHistory}
                            />
                            <button type="submit" disabled={loading || loadingHistory || !customPrompt.trim()} className="absolute right-1.5 top-1/2 -translate-y-1/2 bg-[#003375] text-white p-2 rounded-full hover:bg-[#002855] disabled:opacity-50 transition-all active:scale-95 shadow-sm">
                              {loading ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} className={loading ? 'opacity-0' : 'opacity-100'} />}
                            </button>
                          </form>
                          <p className="text-[9px] sm:text-[10px] text-center text-gray-400 mt-2 font-medium">
                            HUB Planner AI có thể cung cấp thông tin chưa chính xác. Vui lòng xác minh lại.
                          </p>
                        </div>
                    </div>
                </div>
            )}

          </div>
        </div>
      )}
    </>
  );
};
