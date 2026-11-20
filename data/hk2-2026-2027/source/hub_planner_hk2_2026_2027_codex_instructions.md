# HUB PLANNER - HK2 2026-2027 staged catalog import

Nguon: 2 file Excel trong package nguoi dung; data da chuan hoa tai hub_planner_hk2_2026_2027_staging.json.
Kiem tra manifest SHA256 truoc khi nap. KHONG tu dong deploy/publish/ghi D1.

Trang thai production da xac minh qua read-only query: HK1_2026_2027 co 2103 published; HK2_2026_2027 chua co row nao.
Tao branch + PR review rieng, khong ghi production.

## Xu ly
1. Duyet 2357 class codes staged, doi chieu 2.360 dong Excel. 3 placeholder `_262_` phai cach ly, khong tao class co ma nay. 8 ma `_GHEP` co dau tieng Viet phai giu nguyen va review nghia ghep. Khong tu gop/tach lop theo ten.
2. Giang vien la NULL/khong cong bo; KHONG dung giang vien HK1, KHONG hien ten gia. D1 course field `instructor` la optional.
3. Match tinh nang danh muc course D1 current schema `course_schedules`; chi them records `semester=HK2_2026_2027`. Chuan hoa shift/day/weeks/room/campus theo actual code; gio hoc tu nguon: S=07:00-11:05; C=13:00-17:05; 1-3=07:00-09:15; 4-5=09:35-11:05; 6-8=13:00-15:15; 9-10=15:35-17:05. 8 class with shift `1-2` or `3-5` still need confirmation of exact hours, so block these from publication until resolved. Preserve multiline segments; broadcast singleton values where source uses 1 shift or room for multiple weekdays. Never infer unknown hours.
4. Program standard maps academic_program NULL; TABP to 'Tiếng Anh bán phần'; CT đặc biệt to 'Chương trình đặc biệt'; CT Elite to 'CT Elite'. Giang vien giu NULL.
5. Timeline 22 weeks: week1 15/02/2027; week22 12/07-18/07/2027; HK He starts 19/07. Compare 22/22 mapping in both files. Chi chuong trinh TABP/Dac biet/Elite ghi hoc online 15-20/02/2027; KHONG ap dat dong loat cho chuan.
6. Ngay nghi theo NGAY: 16-18/04, 30/04-03/05; chuong trinh TABP/Dac biet/Elite co hoi nghi/ nghi 09-11/07. Khong set `holidayWeeks=[9,11,12,21]` vi khong phai nghi ca tuan. Tu kiem tra 0 course slot trong ngay nghi theo source.
7. Thi ngay 19-21/07 co 78 lop (thi PM) theo lich khung tuan he; KHONG sua ngay. File regular co 4 lop thi ngay 25/04 khi khung regular ko ghi thi ngay CN, danh dau review source. 15 gia tri 'PHONG THI' co dau 'ĐCGĐ', 'ĐCGĐ2', 'ĐC LG,LTHI', 'ĐC LG' la marker, KHONG hien thi nhu phong thi. 124 class exam_date raw 'Tieu luan' => exam_date NULL, preserve assessment mode not a date.
8. Chi co quy trinh owner-approved batched ADDITIVE/idempotent publication: dry-run, expected row counts, detect existing HK2 rows, validate duplicates, preserve all HK1 2103 classes, preserve history, follow protected release gates. NEVER run `scripts/seed-course-schedules-d1.mjs` on production because it runs `DELETE FROM course_schedules;`. No direct D1 writes, no scripts execution against production without owner-approved independent audit and backup.
9. Add import tests, date/week tests incl single-day holidays, 3 placeholders, 8 merged codes, 8 unknown shifts, 78 practical exams after Jul18, no lecturers and no interference with HK1. Preserve desktop UI unchanged and mobile compact layout.
10. Print PR URL, source-to-target field mapping, dry-run counts, SHA, test results, pending exceptions. NO MERGE, NO DEPLOY, NO PROD WRITES.

Nguon CLC public: https://clc.hub.edu.vn/thong-bao/lich-giang-du-kien-he-dhcq-chuong-trinh-tieng-anh-ban-phan-k12-13-14-dhcq-chuong-trinh-dao-tao-dac-biet-khoa-1-2-3-va-chuong-trinh-elite-class-khoa-1-2-hoc-ky-2-nam-hoc-2026-2027-231148.html
