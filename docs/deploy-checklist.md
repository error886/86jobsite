# Đưa 86Job lên https://86job.site — việc còn lại

Tình trạng lúc 04/11/2026 (đêm):

- Domain `86job.site` đã trỏ về máy chủ Coolify (`72.61.118.39`). Trang trả **503** vì app trên Coolify đang **Exited**.
- App trên Coolify: project **86jobsite** → `error886/86jobsite`, nhánh `main`, Build Pack **Dockerfile**, cổng **80**.
- Cả 4 lần deploy trước đều **Failed**. Nguyên nhân: `package-lock.json` không khớp `package.json`, nên `npm ci` trong Dockerfile cũ dừng ngay. Đã sửa trong commit `d3342c9`.
- Code mới đã sẵn ở nhánh local **`deploy-86jobsite`**, có thể push dạng fast-forward lên `error886/86jobsite` `main` mà không cần `--force` (đã nối lịch sử cũ của repo đó vào).

## 1. Push code (bạn chạy)

Remote `origin` trên máy đang là địa chỉ mẫu `https://github.com/<owner>/<repo>.git`. Sửa lại:

```bash
git remote set-url origin https://github.com/error886/86jobsite.git
```

```bash
git push origin deploy-86jobsite:main
```

Nếu Git hỏi đăng nhập, dùng tài khoản GitHub **error886**.

## 2. Biến môi trường trên Coolify (bạn điền)

Coolify → 86jobsite → app → **Environment Variables**. Hiện chỉ có `NIXPACKS_NODE_VERSION`.

| Biến | Giá trị | Build variable? |
|---|---|---|
| `ADMIN_EMAILS` | email Google của admin, cách nhau bằng dấu phẩy | Không |
| `SUPABASE_URL` | như trong `.env` | Không |
| `SUPABASE_SECRET_KEY` | như trong `.env` | Không |
| `SUPABASE_PUBLISHABLE_KEY` | như trong `.env` | Không |
| `GEMINI_API_KEY` | như trong `.env` (AI phân tích tin) | Không |
| `TMAP_APP_KEY` | như trong `.env` (đường đi bộ) | Không |
| `VITE_KAKAO_MAP_KEY` | như trong `.env` | **Có** (đánh dấu *Build Variable*) |
| `OPENROUTER_API_KEY` | chỉ khi đã nạp credit; không thì bỏ trống | Không |

**Không** đặt `DEV_AUTH` trên Coolify. Kể cả có đặt thì server production vẫn bỏ qua.

Thiếu biến nào thì app vẫn chạy nhưng dùng phương án dự phòng: không Supabase thì dùng `db.json`; không Gemini thì dùng Regex; không Kakao key thì dùng OpenStreetMap; không `ADMIN_EMAILS` thì không ai vào được trang quản trị.

## 3. Lưu dữ liệu dự phòng (nên làm)

Coolify → app → **Persistent Storage** → thêm volume, Destination `/app/data`.

## 4. Deploy

Coolify → app → **Deploy**. Build khoảng 2–4 phút. Khi xong, mở https://86job.site và kiểm tra `https://86job.site/api/health`.

## 5. Các dịch vụ cần thêm domain

- **Firebase** → Authentication → Settings → Authorized domains: thêm `86job.site` (và `localhost` để test). Đăng nhập Google đang lỗi `auth/unauthorized-domain` vì thiếu bước này.
- **Kakao Developers**: `https://86job.site` đã được thêm cho Default JS Key. Không cần làm gì.
- **SK Open API (TMAP)**: app 86Job đã tạo, key đã ở `.env`, nhưng **chưa đăng ký gói Free** → API đi bộ trả 403 và bản đồ đang vẽ đường chim bay. Vào Products → TMAP → API 사용 요금 → **Free 사용하기**, chọn app 86Job.

## Đã làm đêm nay

- Đường đi bộ: server gọi TMAP (cache 12 giờ, giới hạn lượt gọi); khi không có tuyến thật thì vẽ đường thẳng nét đứt ghi rõ "đường chim bay". Bỏ OSRM (chỉ có tuyến ô tô, từng báo 3 phút cho 2,8 km) và đường zíc zắc bịa ra.
- Tối ưu: tab Đăng tin, Quản trị và biểu đồ lương chỉ tải khi mở; tách react/firebase/leaflet ra file riêng. JS chính giảm từ 1,57 MB xuống 281 kB (86 kB gzip).
- AI: OpenRouter hết credit (402) thì chuyển ngay sang Gemini, không thử thêm 3 model.
- Dockerfile mới (node 22, cổng 80, health check) và `package-lock.json` đã đồng bộ.
- Đã thử bản build production trên máy: health OK, trang chủ 200, tài khoản test bị tắt.
