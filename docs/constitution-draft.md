# Bản nháp Constitution – 86Job

> **Bản nháp để bạn xem và sửa.** Khi đã ưng ý, chạy:
> `/speckit-constitution Dùng nội dung trong docs/constitution-draft.md`
> Skill sẽ ghi bản chính thức vào `.specify/memory/constitution.md`.
>
> Các chỗ đánh dấu **❓ Cần bạn quyết định** là những điểm mình không tự suy ra được từ code. Hãy sửa hoặc xóa trước khi chạy.

---

## Bối cảnh dự án

86Job là nền tảng tổng hợp việc làm thêm cho **du học sinh và người Việt tại Hàn Quốc**. Người dùng tìm việc theo thành phố, ngành nghề và mức lương, xem việc trên bản đồ, lưu việc yêu thích và đăng tin. Nội dung tin tuyển dụng tiếng Việt/tiếng Hàn được phân tích bằng AI. Admin duyệt tin trước khi hiển thị công khai.

**Công nghệ hiện tại:** React 19 + Vite 6 + Tailwind 4 (frontend), Express + TypeScript (backend, `server.ts`), Supabase (database chính), `db.json` (dự phòng), Firebase Auth (đăng nhập Google), OpenRouter / Gemini (AI parser), Leaflet + Recharts. Deploy bằng Coolify.

---

## Nguyên tắc cốt lõi

### I. Server là nơi quyết định quyền (BẮT BUỘC)
- Mọi API **ghi, sửa, xóa** và mọi API **admin** phải xác thực Firebase ID token ở server (header `Authorization: Bearer <token>`).
- Quyền admin **chỉ** được xác định ở server, từ danh sách cấu hình (ví dụ biến môi trường `ADMIN_EMAILS`). Server **không bao giờ** tin `role`, `userId` hay `status` do client gửi lên.
- Người dùng chỉ đọc và sửa được dữ liệu của chính mình (bookmark, hồ sơ).
- Không có lối tắt nào để vào quyền admin trên giao diện (nút demo, chọn role khi đăng ký, email "chứa chữ admin").
- Kiểm tra quyền ở frontend chỉ để hiển thị cho đẹp, không được coi là lớp bảo mật.

*Lý do:* đợt quét ngày 2026-11-04 phát hiện ai cũng có thể tự thành admin và gọi được API duyệt/xóa tin.

### II. Không để lộ secret và dữ liệu người dùng (BẮT BUỘC)
- API key, service account và secret chỉ nằm trong `.env` hoặc biến môi trường của Coolify. Không đưa vào code, commit hay log.
- Biến `VITE_*` sẽ bị đưa ra trình duyệt, nên chỉ dùng cho key công khai (ví dụ Kakao Map JS key).
- `db.json` là dữ liệu chạy thật, không được commit.
- API response không trả về URL nội bộ, ID database hay thông tin cá nhân của người khác (email, số điện thoại của người dùng).
- Khi một key bị lộ, phải **thu hồi và tạo key mới**. Chỉ xóa key khỏi code là chưa đủ.

### III. Tin tuyển dụng phải qua kiểm duyệt
- Tin do người dùng đăng, do crawler hay AI parser tạo ra luôn có `status: 'pending'`. Chỉ admin mới chuyển được sang `approved` hoặc `rejected`.
- Dữ liệu tin phải hợp lệ trước khi lưu: lương dương và trong khoảng hợp lý (theo giờ khoảng 9.000–50.000 KRW, theo tháng khoảng 1.000.000–10.000.000 KRW), toạ độ nằm trong Hàn Quốc, `category` thuộc danh sách cố định, độ dài chuỗi có giới hạn.
- Lượt xem (`views`) chỉ server được tăng, client không được ghi trực tiếp.
- Mọi người đều bị coi là người lạ cho đến khi được xác minh: cần cảnh báo người dùng về tin lừa đảo, ví dụ thu phí, giữ hộ chiếu hay việc trái phép với visa D2/D4.

> ❓ **Cần bạn quyết định:** khoảng lương hợp lệ ở trên có đúng không? Có cần quy tắc riêng về visa (D2, D4, E9…) cho mỗi tin không?

### IV. Người dùng Việt Nam là ưu tiên
- Toàn bộ giao diện, thông báo lỗi và email bằng **tiếng Việt**. Địa chỉ, tên công ty và từ khóa có thể giữ nguyên tiếng Hàn.
- Tìm kiếm và AI parser phải hiểu cả tiếng Việt lẫn tiếng Hàn (ví dụ `주방` = phụ bếp, `시급` = lương giờ).
- Tiền tệ hiển thị theo KRW, có phân biệt rõ lương **theo giờ** và **theo tháng**.
- Giao diện ưu tiên **điện thoại trước**, vì phần lớn người dùng dùng điện thoại.

> ❓ **Cần bạn quyết định:** có cần hỗ trợ thêm tiếng Hàn hoặc tiếng Anh cho giao diện không?

### V. AI có giới hạn và luôn có dự phòng
- AI parser luôn có phương án dự phòng (OpenRouter → Gemini → Regex). Khi tất cả AI đều lỗi, ứng dụng vẫn phải chạy được.
- Kết quả của AI chỉ là **gợi ý**. Người dùng phải xem và xác nhận trước khi đăng, và kết quả phải qua bước kiểm tra dữ liệu ở nguyên tắc III.
- API gọi AI phải yêu cầu đăng nhập và có giới hạn số lần gọi (theo người dùng và theo IP) để tránh tốn tiền.
- Tên model AI để trong cấu hình, không viết cứng rải rác trong code.

### VI. Một nguồn dữ liệu chính
- **Supabase là nguồn dữ liệu chính.** `db.json` chỉ dùng khi chạy local hoặc khi Supabase gặp sự cố, và không được ghi đè dữ liệu của Supabase.
- Mọi thao tác dữ liệu đi qua `server/db.ts`. Component React không gọi trực tiếp database, trừ phần đăng nhập Firebase.
- Mỗi thay đổi schema (bảng, cột) phải có migration trong `supabase/`.

> ❓ **Cần bạn quyết định:** hiện có **hai** nơi lưu người dùng là Firestore (ở client) và Supabase/db.json (ở server). Bạn muốn giữ Firestore cho hồ sơ người dùng, hay chuyển hết sang Supabase và chỉ dùng Firebase để đăng nhập?

### VII. Đơn giản, dễ đọc, dễ sửa
- Code TypeScript phải qua `npm run lint` (`tsc --noEmit`) mà không có lỗi.
- Hạn chế dùng `any` trong code mới. Kiểu dữ liệu chung đặt trong `src/types.ts`.
- Mỗi file component nên dưới **400 dòng**. File lớn hơn phải tách nhỏ khi sửa (`App.tsx` đang 1.309 dòng, `MapContainer.tsx` 1.182 dòng).
- Không thêm thư viện mới khi thư viện có sẵn đã làm được. Chỉ dùng một trình quản lý gói (**npm**, bỏ `bun.lock`).
- Comment giải thích *tại sao*, không giải thích *làm gì*.

> ❓ **Cần bạn quyết định:** giới hạn 400 dòng có phù hợp không, hay bạn muốn con số khác?

---

## Yêu cầu bảo mật và vận hành

- **Đăng nhập:** chỉ dùng Google qua Firebase Auth. ❓ *Có giữ đăng nhập bằng email không? Nếu giữ thì bắt buộc dùng Firebase Email/Password hoặc magic link, không được đăng nhập chỉ bằng email.*
- **Giới hạn request:** có cho các API AI parser, đăng tin, đăng nhập và crawler.
- **Dữ liệu cá nhân:** số điện thoại, Kakao và Line của nhà tuyển dụng chỉ hiển thị cho người đã đăng nhập. ❓ *Bạn có muốn quy tắc này không?*
- **Deploy:** Coolify, cổng 3000, lưu dữ liệu ở volume `/app/data` (`DATA_PATH`). ⚠️ *README.coolify.md nhắc tới Dockerfile nhưng repo chưa có file này.*
- **Ghi log:** dùng `console` có tiền tố (`[Supabase]`, `[Database]`…). Không ghi token, key hay dữ liệu cá nhân vào log.
- **Lỗi trả về client:** thông báo tiếng Việt, ngắn gọn, không kèm stack trace hay thông tin nội bộ.

## Quy trình phát triển

- Mỗi tính năng đi theo thứ tự: `/speckit-specify` → (`/speckit-clarify`) → `/speckit-plan` → `/speckit-tasks` → `/speckit-implement`.
- Commit trước khi chạy lệnh tự động có thể ghi đè file (`specify init --force`, các script tạo code).
- Trước khi merge phải đảm bảo: `npm run lint` không lỗi, `npm run build` thành công, và đã tự thử chức năng trên trình duyệt (cả giao diện điện thoại).
- Thay đổi liên quan đến xác thực, phân quyền hoặc dữ liệu cá nhân phải có kiểm thử cho các trường hợp bị từ chối (xem 12 tình huống trong `security_spec.md`).

> ❓ **Cần bạn quyết định:** có muốn bắt buộc viết test tự động (ví dụ Vitest) không? Hiện dự án chưa có test nào.

## Quản lý constitution

- Constitution được ưu tiên hơn mọi thói quen hay hướng dẫn khác trong dự án. Khi plan hoặc tasks mâu thuẫn với constitution, sửa plan hoặc tasks.
- Muốn đổi nguyên tắc thì cập nhật file này qua `/speckit-constitution`, kèm lý do, và tăng version:
  - **MAJOR**: bỏ hoặc đổi hẳn một nguyên tắc.
  - **MINOR**: thêm nguyên tắc hoặc mục mới.
  - **PATCH**: sửa câu chữ, làm rõ nghĩa.
- Nguyên tắc **I** và **II** là bắt buộc. Muốn vi phạm phải ghi rõ lý do trong `plan.md` (phần Complexity Tracking).

**Version**: 1.0.0 | **Ratified**: 2026-11-04 | **Last Amended**: 2026-11-04
