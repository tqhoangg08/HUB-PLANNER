import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, Sparkles, Loader2, X, Send } from 'lucide-react';
import { UserData } from '../types';
import { calculateCumulativeStats, getDegreeClassification, calculateSubjectAverage } from '../utils/calculations';
import { playClick } from '../utils/audio';
import DOMPurify from 'dompurify';

interface AIAdvisorProps {
  data: UserData;
}

export const AIAdvisor: React.FC<AIAdvisorProps> = ({ data }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  // Lưu lịch sử chat để trò chuyện liên tục
  const [chatHistory, setChatHistory] = useState<{role: string, content: string}[]>([]);
  const [customPrompt, setCustomPrompt] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Tự động cuộn xuống cuối khi có tin nhắn mới
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatHistory, loading]);

  const handleAdvice = async (isFirstTime = false) => {
    if (!customPrompt.trim() && !isFirstTime) return;

    playClick();
    setLoading(true);

    const userQuestion = customPrompt || "Hãy phân tích bảng điểm của tôi và đưa ra lời khuyên.";
    
    // Nếu không phải lần đầu, xóa ô nhập liệu ngay
    if (!isFirstTime) {
        setChatHistory(prev => [...prev, { role: "user", content: userQuestion }]);
        setCustomPrompt("");
    }

    try {
      // 1. TÍNH TOÁN DỮ LIỆU SINH VIÊN (Context)
      // Chỉ gửi kèm dữ liệu này trong tin nhắn ĐẦU TIÊN để AI nắm bắt
      let contextPrefix = "";
      
      if (chatHistory.length === 0) {
          const stats = calculateCumulativeStats(data.semesters);
          const degree = getDegreeClassification(stats.gpa4);
          
          const failedSubjects = data.semesters.flatMap(sem => sem.subjects)
            .filter(s => {
                const avg = calculateSubjectAverage(s);
                return avg !== null && avg < 4.0 && !s.isNonGPA;
            })
            .map(s => s.name);

          const filledTrainingScores = data.semesters
            .map(s => s.trainingScore)
            .filter((s): s is number => s !== null && s !== undefined);
          
          const avgTrainingScore = filledTrainingScores.length > 0
            ? Math.round(filledTrainingScores.reduce((a, b) => a + b, 0) / filledTrainingScores.length)
            : 0;

          // Tạo ngữ cảnh (Context) cho Llama 3
          contextPrefix = `
          DƯỚI ĐÂY LÀ DỮ LIỆU HỌC TẬP CỦA TÔI (Hãy đọc để tư vấn, không cần tóm tắt lại nếu không được hỏi):
          - Sinh viên: ${data.studentName || "Bạn"} | Khóa: ${data.cohort || "?"}
          - Ngành: ${data.majorName || "N/A"}
          - GPA hệ 4: ${stats.gpa4.toFixed(2)} (${degree})
          - GPA hệ 10: ${stats.gpa10.toFixed(2)}
          - Tín chỉ đã đạt: ${stats.passedCredits}/${data.totalCreditsRequired || 125}
          - Môn nợ (Rớt): ${failedSubjects.length > 0 ? failedSubjects.join(', ') : 'Không có'}
          - ĐRL trung bình: ${avgTrainingScore}
          - Mục tiêu GPA: ${data.targetGPA || 3.2}
          
          CÂU HỎI CỦA TÔI: `;
      }

      // 2. GỬI VỀ API /api/bot (Dùng Llama 3)
      const res = await fetch('/api/bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            message: contextPrefix + userQuestion,
            history: chatHistory // Gửi kèm lịch sử để AI nhớ
        })
      });

      if (!res.ok) {
          if (res.status === 429) throw new Error("Bot đang quá tải, đợi xíu nhé!");
          throw new Error(`Lỗi Server: ${res.status}`);
      }

      const resData = await res.json();
      const botReply = resData.reply || "Xin lỗi, mình đang mất kết nối.";

      setChatHistory(prev => [...prev, { role: "assistant", content: botReply }]);

    } catch (error: any) {
      console.error(error);
      setChatHistory(prev => [...prev, { role: "assistant", content: error.message || "Có lỗi xảy ra." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Nút nổi (Floating Button) */}
      <button
        onClick={() => { playClick(); setIsOpen(true); }}
        className="fixed bottom-6 right-6 bg-[#003375] hover:bg-[#002855] text-white p-4 rounded-full shadow-lg hover:shadow-2xl transition-all duration-300 z-50 flex items-center gap-2 border-4 border-white active:scale-95 group animate-float hover:animate-none"
      >
        <Sparkles size={24} className="group-hover:animate-pulse text-yellow-300" />
        <span className="font-semibold hidden md:inline group-hover:translate-x-1 transition-transform">Cố vấn AI</span>
      </button>

      {/* Modal Chat */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-xl w-full max-w-2xl shadow-2xl flex flex-col h-[80vh] animate-slideUp">
            
            {/* Header */}
            <div className="p-4 border-b flex justify-between items-center bg-[#003375] text-white rounded-t-xl shadow-md">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <Sparkles size={20} className="text-yellow-300" />
                Trợ lý Học tập HUB
              </h3>
              <button 
                onClick={() => { playClick(); setIsOpen(false); }} 
                className="hover:bg-white/20 p-2 rounded-full transition-colors active:scale-90"
              >
                <X size={20} />
              </button>
            </div>

            {/* Chat Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4 bg-gray-50" ref={scrollRef}>
              {chatHistory.length === 0 ? (
                <div className="text-center text-gray-500 py-10 flex flex-col items-center">
                  <div className="bg-blue-100 p-4 rounded-full mb-4">
                     <MessageSquare size={32} className="text-[#003375]" />
                  </div>
                  <p className="font-medium text-gray-700">Chào {data.studentName || 'bạn'}!</p>
                  <p className="text-sm mt-1 max-w-xs">Mình là AI Cố vấn. Mình đã đọc bảng điểm của bạn. Bạn muốn mình tư vấn gì nào?</p>
                  
                  <div className="mt-6 flex flex-wrap justify-center gap-2">
                      <button onClick={() => { setCustomPrompt("Đánh giá tổng quan kết quả học tập của mình"); handleAdvice(true); }} className="text-xs bg-white border border-gray-300 px-3 py-2 rounded-full hover:bg-blue-50 transition">
                          📊 Đánh giá bảng điểm
                      </button>
                      <button onClick={() => { setCustomPrompt("Mình cần cải thiện những môn nào?"); handleAdvice(true); }} className="text-xs bg-white border border-gray-300 px-3 py-2 rounded-full hover:bg-blue-50 transition">
                          ⚠️ Môn cần cải thiện
                      </button>
                  </div>
                </div>
              ) : (
                chatHistory.map((msg, idx) => (
                  <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm ${
                        msg.role === 'user' 
                        ? 'bg-[#003375] text-white rounded-br-none' 
                        : 'bg-white text-gray-800 border border-gray-200 rounded-bl-none'
                    }`}>
                      {msg.role === 'assistant' ? (
                          <div 
                            className="prose prose-sm max-w-none"
                            dangerouslySetInnerHTML={{ 
                                __html: DOMPurify.sanitize(msg.content.replace(/\n/g, '<br />').replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')) 
                            }} 
                          />
                      ) : (
                          <p>{msg.content}</p>
                      )}
                    </div>
                  </div>
                ))
              )}
              
              {loading && (
                  <div className="flex justify-start">
                      <div className="bg-gray-200 rounded-2xl rounded-bl-none px-4 py-3 flex items-center gap-2">
                          <Loader2 size={16} className="animate-spin text-gray-500" />
                          <span className="text-xs text-gray-500">Đang suy nghĩ...</span>
                      </div>
                  </div>
              )}
            </div>

            {/* Input Area */}
            <div className="p-4 border-t bg-white rounded-b-xl">
              <form
                onSubmit={(e) => { e.preventDefault(); handleAdvice(); }}
                className="flex gap-2 relative"
              >
                <input
                  type="text"
                  placeholder="Nhập câu hỏi..."
                  className="flex-1 border border-gray-300 rounded-full px-5 py-3 focus:ring-2 focus:ring-[#003375] focus:outline-none bg-gray-50 pr-12"
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  disabled={loading}
                />
                <button
                  type="submit"
                  disabled={loading || !customPrompt.trim()}
                  className="absolute right-2 top-1/2 -translate-y-1/2 bg-[#003375] text-white p-2 rounded-full hover:bg-[#002855] disabled:opacity-50 transition-all active:scale-95"
                >
                  {loading ? <Loader2 className="animate-spin" size={20} /> : <Send size={20} />}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
// Update fix import path