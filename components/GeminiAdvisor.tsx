import React, { useState } from 'react';
import { GoogleGenAI } from "@google/genai";
import { MessageSquare, Sparkles, Loader2, X } from 'lucide-react';
import { UserData, Subject } from '../types';
import { calculateCumulativeStats, getDegreeClassification, calculateSubjectAverage } from '../utils/calculations';
import { playClick } from '../utils/audio';

interface GeminiAdvisorProps {
  data: UserData;
}

export const GeminiAdvisor: React.FC<GeminiAdvisorProps> = ({ data }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<string | null>(null);
  const [customPrompt, setCustomPrompt] = useState("");

  const handleAdvice = async () => {
    playClick();
    if (!process.env.API_KEY) {
      setResponse("Vui lòng cấu hình API KEY để sử dụng tính năng này.");
      return;
    }

    setLoading(true);
    setResponse(null);

    try {
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

      const context = `
        Bạn là một Cố vấn Học tập ảo tại trường Đại học Ngân hàng TP.HCM (HUB).
        
        Thông tin sinh viên:
        - Tên: ${data.studentName || "Sinh viên"}
        - Khóa: ${data.cohort || "N/A"}
        - Chương trình: ${data.programName || "N/A"}
        - Chuyên ngành: ${data.specializationName || data.majorName || "N/A"}
        
        Dữ liệu học tập:
        - GPA (Hệ 4): ${stats.gpa4.toFixed(1)}
        - GPA (Hệ 10): ${stats.gpa10.toFixed(1)}
        - Tổng tín chỉ tích lũy: ${stats.passedCredits}/${data.totalCreditsRequired || 125}
        - Xếp loại tạm thời: ${degree}
        - Môn rớt (cần học lại): ${failedSubjects.length > 0 ? failedSubjects.join(', ') : 'Không có'}
        - Điểm rèn luyện: ${avgTrainingScore}
        - Mục tiêu GPA: ${data.targetGPA}

        Câu hỏi của sinh viên: "${customPrompt || "Hãy đánh giá kết quả học tập của tôi và đưa ra lời khuyên chi tiết theo chuyên ngành của tôi để đạt mục tiêu."}"

        Hãy trả lời ngắn gọn, thân thiện, gọi sinh viên bằng tên. Sử dụng markdown để định dạng. Tập trung vào các môn cần cải thiện hoặc chiến lược học tập phù hợp với chuyên ngành ${data.specializationName || "của sinh viên"}.
      `;

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const result = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: context,
      });

      setResponse(result.text || "Xin lỗi, tôi không thể đưa ra lời khuyên lúc này.");
    } catch (error) {
      console.error(error);
      setResponse("Có lỗi xảy ra khi kết nối với Gemini AI.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => { playClick(); setIsOpen(true); }}
        className="fixed bottom-6 right-6 bg-[#990000] hover:bg-[#7a0000] text-white p-4 rounded-full shadow-lg hover:shadow-2xl transition-all duration-300 z-50 flex items-center gap-2 border-4 border-white active:scale-95 group"
      >
        <Sparkles size={24} className="group-hover:animate-pulse" />
        <span className="font-semibold hidden md:inline group-hover:translate-x-1 transition-transform">Cố vấn AI</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh] animate-slideUp">
            <div className="p-4 border-b flex justify-between items-center bg-[#003375] text-white rounded-t-xl">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <Sparkles size={20} className="text-yellow-300" />
                HUB AI Advisor
              </h3>
              <button 
                onClick={() => { playClick(); setIsOpen(false); }} 
                className="hover:bg-white/20 p-2 rounded-full transition-colors active:scale-90"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 flex-1 overflow-y-auto">
              {response ? (
                <div className="prose prose-sm max-w-none bg-gray-50 p-4 rounded-lg border border-gray-100 text-gray-800 animate-fadeIn">
                  <div dangerouslySetInnerHTML={{ 
                    __html: response.replace(/\n/g, '<br />').replace(/\*\*(.*?)\*\*/g, '<b>$1</b>') 
                  }} />
                </div>
              ) : (
                <div className="text-center text-gray-500 py-10">
                  <MessageSquare size={48} className="mx-auto mb-4 opacity-20" />
                  <p>Chào {data.studentName || 'bạn'}, tôi có thể giúp phân tích bảng điểm ngành {data.majorName || 'học'} của bạn.</p>
                </div>
              )}
            </div>

            <div className="p-4 border-t bg-gray-50 rounded-b-xl">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Hỏi gì đó... (VD: Môn này có quan trọng không?)"
                  className="flex-1 border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-[#003375] focus:outline-none transition-shadow"
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAdvice()}
                />
                <button
                  onClick={handleAdvice}
                  disabled={loading}
                  className="bg-[#003375] text-white px-6 py-2 rounded-lg font-medium hover:bg-[#002855] disabled:opacity-50 flex items-center gap-2 min-w-[100px] justify-center transition-all duration-200 active:scale-95 shadow-md hover:shadow-lg"
                >
                  {loading ? <Loader2 className="animate-spin" size={20} /> : 'Gửi'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
