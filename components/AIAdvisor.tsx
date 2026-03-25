import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, Sparkles, X, Send, Loader2, ThumbsUp, ThumbsDown } from 'lucide-react'; 
import { UserData } from '../types';
import { calculateCumulativeStats, getDegreeClassification, calculateSubjectAverage } from '../utils/calculations';
import { playClick } from '../utils/audio';
import { supabase } from '../utils/supabase'; 
import DOMPurify from 'dompurify';

interface AIAdvisorProps {
  data: UserData;
  userId?: string;
}

interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    logId?: number; 
    rating?: 'up' | 'down' | null; 
}

export const AIAdvisor: React.FC<AIAdvisorProps> = ({ data, userId }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [customPrompt, setCustomPrompt] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [chatHistory, loading]);

  // Đóng gói dữ liệu sinh viên để gửi lên cho AI hiểu ngữ cảnh
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
      
      // Gửi lịch sử chat, câu hỏi và thông tin sinh viên lên Backend
      const res = await fetch('/api/bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            question: questionToAsk,
            history: chatHistory.map(msg => ({ role: msg.role, content: msg.content })),
            context: studentContext,
            userId: userId
        })
      });

      if (!res.ok) throw new Error("Máy chủ AI đang bận hoặc mất kết nối.");

      const resData = await res.json();
      const botReply = resData.reply || "Xin lỗi, mình không có câu trả lời.";
      const mockLogId = Date.now(); 

      setChatHistory(prev => [...prev, { role: "assistant", content: botReply, logId: mockLogId }]);

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
        } catch (err) {}
      }
  };

  return (
    <>
      <style>{`
        @keyframes messageIn { from { opacity: 0; transform: translateY(10px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
        .animate-message { animation: messageIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        @keyframes bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
        .typing-dot { animation: bounce 1.4s infinite ease-in-out both; }
        .typing-dot:nth-child(1) { animation-delay: -0.32s; }
        .typing-dot:nth-child(2) { animation-delay: -0.16s; }
      `}</style>

      <button
        onClick={() => { playClick(); setIsOpen(true); }}
        className="fixed bottom-6 right-6 bg-[#003375] hover:bg-[#002855] text-white p-4 rounded-full shadow-lg hover:shadow-2xl transition-all duration-300 z-50 flex items-center gap-2 border-4 border-white active:scale-95 group animate-float hover:animate-none"
      >
        <Sparkles size={24} className="group-hover:animate-pulse text-yellow-300" />
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-xl w-full max-w-2xl shadow-2xl flex flex-col h-[80vh] animate-slideUp">
            
            <div className="p-4 border-b flex justify-between items-center bg-[#003375] text-white rounded-t-xl shadow-md">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <Sparkles size={20} className="text-yellow-300" />
                Trợ lý Học tập HUB
              </h3>
              <button onClick={() => { playClick(); setIsOpen(false); }} className="hover:bg-white/20 p-2 rounded-full transition-colors active:scale-90">
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4 bg-gray-50" ref={scrollRef}>
              {chatHistory.length === 0 ? (
                <div className="text-center text-gray-500 py-10 flex flex-col items-center animate-message">
                  <div className="bg-blue-100 p-4 rounded-full mb-4">
                      <MessageSquare size={32} className="text-[#003375]" />
                  </div>
                  <p className="font-medium text-gray-700">Chào {data.studentName || 'bạn'}!</p>
                  <p className="text-sm mt-1 max-w-xs">Mình là AI Cố vấn. Mình đã đọc tài liệu trường và hồ sơ của bạn. Cần hỏi gì cứ nhắn mình nhé!</p>
                  
                  <div className="mt-6 flex flex-wrap justify-center gap-2">
                      <button onClick={() => { handleAdvice(false, "Đánh giá tổng quan kết quả học tập của mình"); }} className="text-xs bg-white border border-gray-300 px-3 py-2 rounded-full hover:bg-blue-50 transition hover:shadow-sm hover:-translate-y-0.5 active:scale-95">
                          📊 Đánh giá bảng điểm
                      </button>
                      <button onClick={() => { handleAdvice(false, "Điều kiện để đạt học bổng xuất sắc là gì?"); }} className="text-xs bg-white border border-gray-300 px-3 py-2 rounded-full hover:bg-blue-50 transition hover:shadow-sm hover:-translate-y-0.5 active:scale-95">
                          🎓 Điều kiện học bổng
                      </button>
                  </div>
                </div>
              ) : (
                chatHistory.map((msg, idx) => (
                  <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} animate-message`}>
                    <div className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm ${
                        msg.role === 'user' ? 'bg-[#003375] text-white rounded-br-none' : 'bg-white text-gray-800 border border-gray-200 rounded-bl-none'
                    }`}>
                      {msg.role === 'assistant' ? (
                          <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(msg.content.replace(/\n/g, '<br />').replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')) }} />
                      ) : ( <p>{msg.content}</p> )}
                    </div>
                    {msg.role === 'assistant' && (
                        <div className="flex gap-2 mt-1 ml-2">
                            <button onClick={() => handleRate(idx, true)} className={`p-1 rounded-full hover:bg-gray-100 transition ${msg.rating === 'up' ? 'text-green-600' : 'text-gray-400'}`}>
                                <ThumbsUp size={14} className={msg.rating === 'up' ? 'fill-current' : ''} />
                            </button>
                            <button onClick={() => handleRate(idx, false)} className={`p-1 rounded-full hover:bg-gray-100 transition ${msg.rating === 'down' ? 'text-red-600' : 'text-gray-400'}`}>
                                <ThumbsDown size={14} className={msg.rating === 'down' ? 'fill-current' : ''} />
                            </button>
                        </div>
                    )}
                  </div>
                ))
              )}
              
              {loading && (
                  <div className="flex justify-start animate-message">
                    <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-none px-4 py-4 flex items-center gap-1.5 shadow-sm">
                        <div className="w-2 h-2 bg-gray-400 rounded-full typing-dot"></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full typing-dot"></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full typing-dot"></div>
                    </div>
                  </div>
              )}
            </div>

            <div className="p-4 border-t bg-white rounded-b-xl">
              <form onSubmit={(e) => { e.preventDefault(); handleAdvice(); }} className="flex gap-2 relative">
                <input
                  type="text" placeholder="Nhập câu hỏi..."
                  className="flex-1 border border-gray-300 rounded-full px-5 py-3 focus:ring-2 focus:ring-[#003375] focus:outline-none bg-gray-50 pr-12 transition-all"
                  value={customPrompt} onChange={(e) => setCustomPrompt(e.target.value)} disabled={loading}
                />
                <button type="submit" disabled={loading || !customPrompt.trim()} className="absolute right-2 top-1/2 -translate-y-1/2 bg-[#003375] text-white p-2 rounded-full hover:bg-[#002855] disabled:opacity-50 transition-all active:scale-95">
                  {loading ? <Loader2 className="animate-spin" size={20} /> : <Send size={20} className={loading ? 'opacity-0' : 'opacity-100'} />}
                </button>
              </form>
              <p className="text-[10px] text-center text-gray-400 mt-2 italic">
                HUB Planner AI lấy dữ liệu từ Sổ tay Sinh viên. Hãy xác minh lại thông tin quan trọng.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
};