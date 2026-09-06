# Gemini 3.5 Flash-Lite và File Search cho HUB Planner

## 1. Kiến trúc khóa API

Hệ thống dùng hai nhóm khóa tách biệt:

- `GEMINI_API_KEYS`: nhiều khóa chat thông thường, cách nhau bằng dấu phẩy. Mỗi request xáo trộn thứ tự và thử mỗi khóa tối đa một lần khi gặp lỗi tạm thời (429/503/timeout).
- `GEMINI_FILE_SEARCH_API_KEY`: một khóa cố định thuộc đúng Google AI project đã tạo File Search store.

Không đưa khóa File Search vào pool chat và không dùng khóa ngẫu nhiên để truy cập store. Store là tài nguyên theo project nên khóa của project khác sẽ không truy cập được.

## 2. Tạo các khóa chat trên Google AI Studio

1. Đăng nhập từng tài khoản Google dùng cho pool chat tại [Google AI Studio](https://aistudio.google.com/apikey).
2. Tạo/chọn một Google Cloud project cho tài khoản đó và tạo API key.
3. Lặp lại với các tài khoản/project khác nếu cần phân bổ quota.
4. Ghép khóa bằng dấu phẩy vào `GEMINI_API_KEYS`. Không có khoảng trắng hoặc dòng mới thừa.
5. Không commit khóa vào Git và không đặt khóa trong biến `VITE_*`.

## 3. Tạo project chuyên dụng cho File Search

1. Chọn một Google Cloud project duy nhất dành cho kho tài liệu HUB Planner.
2. Tạo API key của project đó và đặt vào `GEMINI_FILE_SEARCH_API_KEY` trong `.env.local`.
3. Chạy:

   ```powershell
   npm run gemini:create-store
   ```

4. Script sẽ tìm store có display name `HUB Planner Knowledge Base`; nếu đã có thì tái sử dụng, nếu chưa có mới tạo với embedding model `models/gemini-embedding-2`.
5. Sao chép đúng dòng `GEMINI_FILE_SEARCH_STORE=fileSearchStores/...` vào môi trường. Script không in API key.

## 4. Cấu hình Supabase

1. Sao lưu database trước khi chạy migration.
2. Chạy migration `supabase/migrations/20260805190000_create_ai_documents.sql` bằng quy trình migration hiện tại.
3. Xác nhận bảng `public.ai_documents`, các index, cột nguồn trong `ai_chat_logs` và bucket private `ai-documents` đã được tạo.
4. Kiểm tra bucket có `public = false`, giới hạn 20 MB và đúng MIME allowlist.
5. Kiểm tra RLS: người dùng thường chỉ đọc metadata tài liệu hoàn tất/public; chỉ role `admin` upload, sửa và xóa file.

Rollback khẩn cấp nằm tại `supabase/migrations/rollback/20260805190000_create_ai_documents.rollback.sql`. Trước rollback, xóa tài liệu trong Gemini store bằng trang quản trị để tránh index mồ côi.

## 5. Biến môi trường local

Sao chép `.env.example` sang `.env.local` và điền:

```env
GEMINI_CHAT_MODEL=gemini-3.5-flash-lite
GEMINI_THINKING_LEVEL=minimal
GEMINI_API_KEYS=key_project_a,key_project_b
GEMINI_FILE_SEARCH_ENABLED=true
GEMINI_FILE_SEARCH_API_KEY=key_of_dedicated_store_project
GEMINI_FILE_SEARCH_STORE=fileSearchStores/your-store-id
GEMINI_FILE_SEARCH_EMBEDDING_MODEL=models/gemini-embedding-2
AI_DOCUMENTS_BUCKET=ai-documents
AI_DOCUMENT_MAX_SIZE_MB=20
```

`GEMINI_THINKING_LEVEL` chỉ nhận `minimal`, `medium`, `high`; giá trị khác tự về `minimal`. Không cấu hình `temperature`, `top_p` hoặc `top_k` cho model 3.5.

## 6. Cấu hình Cloudflare Worker

AI Documents và Gemini File Search chạy trong Public Cloudflare Worker. Cấu hình các biến không nhạy cảm bằng Wrangler config và đưa `GEMINI_FILE_SEARCH_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` vào Worker secrets; không dùng tiền tố `VITE_`.

Các route runtime là `/api/private/v1/ai-advisor`, `/api/admin/v1/ai-documents` và `/api/private/v1/ai-document-source/:id`. Mọi route dùng Better Auth cookie server-side; trình duyệt không gọi Supabase Auth/Storage trực tiếp.

Rollback ứng dụng: tắt `GEMINI_FILE_SEARCH_ENABLED=false` trên Worker. Chat vẫn fallback sang provider hiện hành; không cần xóa store hoặc dữ liệu.

## 7. Kiểm thử local

1. `npm run typecheck`
2. `npm run test:gemini`
3. `npm run build`
4. Đăng nhập bằng admin, mở `/admin/ai-documents`.
5. Tải PDF/DOCX hợp lệ dưới 20 MB; trạng thái phải chuyển `Đang lập chỉ mục` → `Sẵn sàng`.
6. Tải lại cùng nội dung với tên khác; API phải báo trùng SHA-256.
7. Thử EXE, MIME sai, file quá 20 MB và đường dẫn giả; API phải từ chối.
8. Hỏi chatbot câu có nội dung trong tài liệu. Chỉ nguồn do Gemini trả `file_citation` mới xuất hiện; bấm nguồn mới tạo signed URL 60 giây.
9. Tạm xóa/sai `GEMINI_FILE_SEARCH_STORE`: chatbot vẫn trả lời từ pool chat và UI hiển thị cảnh báo kho tài liệu tạm không khả dụng.
10. Mở lại lịch sử chat; nguồn tài liệu và cảnh báo phải còn.

## 8. Kiểm thử Cloudflare candidate/production

- Xác nhận admin/auditor/user: chỉ admin thấy và truy cập kho tài liệu.
- Xác nhận Storage không có public URL.
- Xác nhận người dùng chỉ nhận signed URL khi bấm nguồn và URL hết hạn nhanh.
- Xác nhận một khóa chat 429 không gây vòng lặp vô hạn và khóa File Search không xuất hiện trong pool.
- Theo dõi log Gemini upload operation, lỗi lập chỉ mục và thời gian xử lý tài liệu lớn.
- Xác nhận dữ liệu cũ (`system_knowledge`, sự kiện, thông báo, đồ thất lạc, môn học) vẫn được đưa vào prompt.

## 9. Runbook Google AI Studio

### Các tài khoản chat thông thường

1. Mở cửa sổ riêng tư, truy cập <https://aistudio.google.com/apikey>, bấm **Sign in** và đăng nhập đúng tài khoản Google cần dùng.
2. Bấm **Create API key**. Chọn project hiện có hoặc **Create project**, ví dụ `hub-planner-chat-01`.
3. Lưu key trong trình quản lý mật khẩu kèm email và tên project. Lặp lại bằng cửa sổ riêng tư mới cho từng account/project khác.
4. Điền một dòng `GEMINI_API_KEYS=key_1,key_2,key_3` trong `.env.local`; không dùng JSON, dấu ngoặc hoặc tiền tố `VITE_`.
5. Để test từng key, tạm chỉ giữ một key, chạy `npm run dev`, đăng nhập và hỏi AI Advisor. HTTP 200 là thành công; 429 nghĩa là project đó chạm quota.
6. Trong AI Studio, mở **Usage** hoặc **View usage** của project để xem RPM/TPM/RPD. Lặp lại cho từng account vì các key không cùng quota.
7. Nếu key lộ, vào **API keys**, chọn **Delete/Revoke**, tạo key mới, cập nhật Worker secret qua luồng an toàn rồi tạo candidate mới.

### Tài khoản File Search riêng

1. Chọn một tài khoản Google riêng, mở AI Studio và tạo/chọn project `hub-planner-file-search`.
2. Tạo key trong đúng project, lưu thành `GEMINI_FILE_SEARCH_API_KEY` trong `D:\Projects\HUB-PLANNER\.env.local`.
3. Chạy `npm install`, sau đó `npm run gemini:create-store`.
4. Kết quả mong đợi: `GEMINI_FILE_SEARCH_STORE=fileSearchStores/...`. Copy toàn bộ dòng vào `.env.local`.
5. Chạy lại lệnh để xác minh: script tìm display name `HUB Planner Knowledge Base` và tái sử dụng, không tạo trùng.
6. Key và store phải cùng project. 401/403 thường là sai key/project; 429 là quota File Search. Không thử store bằng key ngẫu nhiên.
7. Khi cần xóa store thử nghiệm, dùng đúng key project và SDK `ai.fileSearchStores.delete({ name: 'fileSearchStores/...', config: { force: true } })`. Không xóa store production để xử lý một file lỗi.

Đối chiếu phương thức mới nhất tại <https://ai.google.dev/gemini-api/docs/file-search>.

## 10. Runbook Supabase Database và Storage

### Database

1. Mở <https://supabase.com/dashboard>, chọn project HUB Planner.
2. Vào **SQL Editor** → **New query**.
3. Mở `supabase/migrations/20260805190000_create_ai_documents.sql`, copy toàn bộ vào editor và bấm **Run**.
4. Kết quả mong đợi là `Success. No rows returned`, không có lỗi policy/cột.
5. Vào **Table Editor** → `ai_documents`, kiểm tra các cột `content_hash`, `gemini_*`, `indexing_status`, `visibility`, `uploaded_by`, `deleted_at`.
6. Vào **Authentication** → **Policies**, xác nhận RLS của `ai_documents` đang bật.

Query xác minh:

```sql
select tablename, rowsecurity from pg_tables
where schemaname = 'public' and tablename = 'ai_documents';
select policyname, cmd, roles from pg_policies
where schemaname = 'public' and tablename = 'ai_documents'
order by policyname;
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name in ('ai_documents','ai_chat_logs')
order by table_name, ordinal_position;
```

### Storage

1. Vào **Storage** → `ai-documents`. Migration đã tạo bucket; refresh Dashboard trước khi tạo thủ công.
2. Mở **Configuration**: bucket phải **Private**, giới hạn `20 MB`, MIME gồm PDF, Word/OpenXML, PPTX, XLSX, TXT, CSV.
3. Vào **Policies**: chỉ role admin được select/insert/update/delete; object upload phải nằm trong folder UUID của admin.
4. Đăng nhập user thường và thử upload: phải bị từ chối. Đăng nhập admin, mở `/admin/ai-documents`, upload file nhỏ: phải thành công.
5. Bấm icon tải tại một dòng: trình duyệt nhận signed URL 60 giây, không phải public URL cố định.
6. Xóa file thử bằng nút xóa; object biến mất và metadata chuyển `deleted`.

Rollback nằm tại `supabase/migrations/rollback/20260805190000_create_ai_documents.rollback.sql`. Chỉ chạy sau khi sao lưu vì rollback xóa bucket, bảng và dữ liệu nguồn chat mới.

## 11. Runbook Cloudflare

1. Cấu hình binding/secret trên một Worker candidate cô lập; không đưa giá trị secret vào lệnh, log hoặc Git.
2. Chạy typecheck, test và build trước khi tạo candidate.
3. Kiểm tra ba route Cloudflare ở mục 6 bằng Better Auth session của admin/user phù hợp.
4. 401 là thiếu session, 403 là sai quyền, 429 là quota Gemini, 503 là dịch vụ chưa cấu hình hoặc tạm lỗi.
5. Chỉ promote sau canary; giữ version production cũ làm rollback.

## 12. Chạy local và upload đầu tiên

1. Mở PowerShell: `cd D:\Projects\HUB-PLANNER`.
2. Chạy `npm install`.
3. Copy `.env.example` thành `.env.local`, điền Supabase và Gemini env; không commit `.env.local`.
4. Chạy `npm run gemini:create-store` nếu chưa có store, rồi điền store name.
5. Chạy `npm run typecheck`, `npm run test`, `npm run test:gemini`, `npm run build`.
6. Chạy `npm run dev`, mở URL Vite trong terminal và đăng nhập admin.
7. Mở `/admin/ai-documents`. Upload PDF dưới 20 MB, nhập tiêu đề/danh mục/năm học/mã ngành, để phạm vi **Công khai cho chatbot**.
8. Bấm **Tải và lập chỉ mục**; chờ `Đang tải lên`/`Đang lập chỉ mục` chuyển thành `Hoàn tất`. UI polling khoảng 5 giây.
9. Hỏi AI Advisor: `Theo tài liệu [tên tài liệu], điều kiện xét tốt nghiệp là gì? Chỉ trả lời điều khoản tìm thấy trong tài liệu.`
10. Kết quả mong đợi: câu trả lời có **Nguồn tài liệu**, đúng tên và số trang nếu Gemini cung cấp. Bấm nguồn mới tạo signed URL.
11. Tạm cấu hình store sai trong môi trường test: chat vẫn trả lời từ nguồn cũ và UI báo kho tài liệu tạm không khả dụng. Khôi phục ngay sau test.
12. Mở lại lịch sử chat; nguồn và cờ fallback phải còn.

## 13. Checklist production

- [ ] Pull code và chạy `npm install`.
- [ ] Chạy typecheck, toàn bộ unit test, Gemini test và build.
- [ ] Sao lưu Supabase, chạy migration, kiểm tra RLS/bucket private.
- [ ] Tạo key File Search trong project chuyên dụng.
- [ ] Chạy `npm run gemini:create-store`, lưu store name.
- [ ] Thêm đủ Cloudflare Worker vars/secrets vào candidate và chạy canary.
- [ ] Upload tài liệu không nhạy cảm đầu tiên, chờ `Hoàn tất`.
- [ ] Hỏi thử chatbot, kiểm tra citation và signed URL.
- [ ] Kiểm tra fallback, lịch sử chat và Function Logs.

## 14. Sự cố thường gặp

- **Thiếu File Search env:** chat thường vẫn chạy; điền key/store và redeploy.
- **429 File Search:** chờ quota hồi phục/giảm tần suất; không ghép store với key project khác.
- **429 chat:** pool thử từng account một lần; kiểm tra Usage từng project, không thêm retry vô hạn.
- **File `failed`:** đọc lỗi đã sanitize, sửa file/quyền rồi bấm thử lại.
- **Trùng tài liệu:** SHA-256 nhận ra cùng nội dung dù đổi tên; xóa/phiên bản hóa tài liệu cũ.
- **Không có citation:** Gemini không trả `file_citation`, tài liệu chưa hoàn tất hoặc truy vấn không khớp; UI không tự bịa nguồn.
- **403 khi xem:** tài liệu admin-only hoặc mã ngành không trùng onboarding.
- **Tắt nhanh:** đặt `GEMINI_FILE_SEARCH_ENABLED=false` và redeploy; file/store vẫn được giữ.

## 15. Chi phí và vòng đời

Theo tài liệu Gemini, File Search không thu phí lưu trữ/truy vấn riêng nhưng việc tạo embedding lúc lập chỉ mục và token model vẫn có thể phát sinh chi phí. File upload tạm thời của Gemini có vòng đời ngắn, còn tài liệu đã nhập vào File Search store tồn tại đến khi xóa. File gốc của HUB Planner vẫn nằm trong Supabase Storage private để quản trị, tải xuống có kiểm soát và phục hồi.
