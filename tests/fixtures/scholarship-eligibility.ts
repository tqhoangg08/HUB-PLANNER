import {eligibilityMapping} from '../../shared/scholarship-eligibility.ts';
export const syntheticEligibility = (count = 1059) => ({
  sourceSha256:'c'.repeat(64), sourceFilename:'synthetic-eligibility.xlsx', mapping:structuredClone(eligibilityMapping),
  rows:Array.from({length:count}, (_, i) => ({sourceRowNumber:i+2, values:{
    STT:i+1, MSSV:String(i+1).padStart(12,'0'), 'Họ tên':`Sinh viên kiểm thử ${i+1}`, 'Mã Lớp SV':i%2 ? 'TEST-B' : 'TEST-A',
    'Ngành học':i%3 ? 'Kế toán' : 'Kinh tế', 'Khóa':i%4 ? 'K24' : 'K23', 'Chương trình đào tạo':i%5 ? 'Chương trình kiểm thử A' : 'Chương trình kiểm thử B',
    'Đểm TB HB':i%2 ? '9,7' : 3.6, 'Điểm RL':100, 'Số TC':17, 'Xếp loại HB':i%2 ? 'Giỏi' : 'Xuất sắc',
    'Thành tiền':13926000, 'Tỷ lệ top trường':0.0125, 'Top trường':i+1, 'Top ngành':i+1, 'Top khóa':i+1, 'Top lớp':i+1,
  }})),
});
