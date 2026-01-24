
## 1. Bảo vệ Database (Quan trọng nhất)
Hiện tại, logic kiểm tra email sinh viên (`@st.buh.edu.vn`) đang nằm ở phía người dùng (Client). Hacker có thể tắt JavaScript để vượt qua. Bạn cần cài đặt "trốt chặn" cuối cùng tại Database.

### Bước 1: Mở Supabase SQL Editor
Truy cập Dashboard dự án Supabase của bạn -> Chọn mục **SQL Editor** ở thanh bên trái.

### Bước 2: Chạy đoạn mã sau
Copy và Paste đoạn SQL bên dưới rồi bấm **RUN**. Đoạn mã này sẽ tạo ra luật (Policy): "Chỉ cho phép INSERT/UPDATE dòng dữ liệu nếu email người dùng có đuôi `@st.buh.edu.vn`".

```sql
-- 1. Bật tính năng RLS cho bảng profiles (Nếu chưa bật)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 2. Tạo hàm kiểm tra email đuôi HUB
CREATE OR REPLACE FUNCTION is_hub_email(email text)
RETURNS boolean AS $$
BEGIN
  RETURN email LIKE '%@st.buh.edu.vn';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Tạo Policy chặn INSERT (Thêm mới)
CREATE POLICY "Only HUB students can insert profile"
ON profiles
FOR INSERT
WITH CHECK (
  auth.uid() = id AND is_hub_email(auth.jwt() ->> 'email')
);

-- 4. Tạo Policy chặn UPDATE (Cập nhật)
CREATE POLICY "Only HUB students can update own profile"
ON profiles
FOR UPDATE
USING ( auth.uid() = id )
WITH CHECK ( is_hub_email(auth.jwt() ->> 'email') );

-- 5. Cho phép xem (SELECT) - Ai cũng xem được hoặc chỉ chính chủ (tuỳ bạn)
-- Ở đây ví dụ cho chính chủ xem
CREATE POLICY "Users can see own profile"
ON profiles
FOR SELECT
USING ( auth.uid() = id );
```

Sau khi chạy xong, Database của bạn đã an toàn tuyệt đối trước các truy cập trái phép từ tài khoản Gmail thường.

## 2. Bảo vệ Google Gemini API Key
Key `VITE_GEMINI_API_KEY` hiện đang lộ trên trình duyệt. Hacker có thể lấy key này để dùng chùa hạn mức của bạn.

### Cách khắc phục:
1. Truy cập **Google AI Studio** hoặc **Google Cloud Console**.
2. Tìm đến mục **API Keys**.
3. Chọn Key bạn đang dùng.
4. Tại mục **Application restrictions**, chọn **Websites**.
5. Thêm các domain trang web của bạn vào danh sách cho phép:
   - `http://localhost:5173`
   - `https://hub-planner.vercel.app` (hoặc domain thực tế của bạn)
6. Lưu lại (Save).

Lúc này, kể cả khi hacker lấy được Key, họ cũng không thể dùng nó từ máy tính của họ (vì khác domain).
