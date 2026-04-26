import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Trophy, X } from 'lucide-react';
import { playClick } from '../utils/audio';

interface SubjectRankingModalProps {
    subjects: any[]; // Using any based on Dashboard implementation usage, ideally should be a typed interface
    onClose: () => void;
}

export const SubjectRankingModal: React.FC<SubjectRankingModalProps> = ({ subjects, onClose }) => {
    // Lock scroll when mounted
    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, []);

    return createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 animate-fadeIn p-4">
            <div className="bg-white rounded-xl w-full max-w-5xl shadow-2xl flex flex-col h-[90vh] animate-scaleIn border border-gray-200 overflow-hidden relative">
                <div className="p-4 border-b bg-[#003375] text-white rounded-t-xl flex justify-between items-center shrink-0">
                    <h3 className="font-bold text-xl flex items-center gap-2">
                        <Trophy size={24} className="text-yellow-300" />
                        Bảng xếp hạng môn học
                    </h3>
                    <button
                        onClick={() => { playClick(); onClose(); }}
                        className="hover:bg-white/20 p-2 rounded-full transition-colors active:scale-90"
                    >
                        <X size={24} />
                    </button>
                </div>

                <div className="overflow-auto custom-scrollbar flex-1 p-0">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-gray-50 text-sm text-gray-500 uppercase font-semibold sticky top-0 shadow-sm z-10">
                            <tr>
                                <th className="p-4 text-center w-16">Hạng</th>
                                <th className="p-4">Môn học</th>
                                <th className="p-4 text-center">TC</th>
                                <th className="p-4 text-center">Điểm (10)</th>
                                <th className="p-4 text-center">Điểm (4)</th>
                                <th className="p-4 text-center">Chữ</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 text-base">
                            {subjects.map((sub, idx) => {
                                let rankColor = "text-gray-500";
                                let rowBg = "hover:bg-gray-50";
                                let iconSize = 20;
                                if (idx === 0) { rankColor = "text-yellow-500"; rowBg = "bg-yellow-50/50 hover:bg-yellow-50"; iconSize = 24; }
                                else if (idx === 1) { rankColor = "text-gray-400"; rowBg = "bg-gray-50/50 hover:bg-gray-100"; iconSize = 22; }
                                else if (idx === 2) { rankColor = "text-orange-400"; rowBg = "bg-orange-50/50 hover:bg-orange-50"; iconSize = 22; }

                                return (
                                    <tr key={idx} className={`${rowBg} transition-colors`}>
                                        <td className="p-4 text-center font-bold">
                                            {idx < 3 ? <Trophy size={iconSize} className={`${rankColor} mx-auto fill-current`} /> : <span className="text-gray-400">#{idx + 1}</span>}
                                        </td>
                                        <td className="p-4">
                                            <div className="font-bold text-gray-800 text-lg">{sub.name}</div>
                                            <div className="text-sm text-gray-500">{sub.semName}</div>
                                        </td>
                                        <td className="p-4 text-center text-gray-500 font-medium">{sub.credits}</td>
                                        <td className="p-4 text-center font-bold text-[#990000] text-lg">{sub.avg.toFixed(1)}</td>
                                        <td className="p-4 text-center font-bold text-[#003375] text-lg">{sub.scale4?.toFixed(1)}</td>
                                        <td className="p-4 text-center">
                                            <span className={`text-sm font-bold px-2 py-1 rounded border ${sub.letter.startsWith('A') ? 'bg-green-50 text-green-700 border-green-200' :
                                                    sub.letter.startsWith('B') ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                                        sub.letter.startsWith('C') ? 'bg-yellow-50 text-yellow-700 border-yellow-200' :
                                                            sub.letter.startsWith('D') ? 'bg-orange-50 text-orange-700 border-orange-200' :
                                                                'bg-red-50 text-red-700 border-red-200'
                                                }`}>
                                                {sub.letter}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                            {subjects.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="p-10 text-center text-gray-400 italic">Chưa có dữ liệu môn học</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                <div className="p-4 bg-gray-50 border-t text-sm text-center text-gray-500 shrink-0">
                    Hiển thị {subjects.length} môn học đã có điểm tổng kết
                </div>
            </div>
        </div>,
        document.body
    );
};

