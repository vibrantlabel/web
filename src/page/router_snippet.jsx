// เพิ่ม route นี้ในไฟล์ router หลักของคุณ (เช่น App.jsx / routes.jsx)
// ที่ประกาศ <Routes> ของ react-router-dom อยู่แล้ว

import MobileCameraCapture from "./MobileCameraCapture"; // ปรับ path ให้ตรงกับที่คุณวางไฟล์จริง

// ...
// <Routes>
//   ...route เดิมทั้งหมดของคุณ...
//   <Route path="/mobile-camera" element={<MobileCameraCapture />} />
// </Routes>

// 📌 ข้อควรระวัง: route นี้ต้อง "ไม่ต้อง login" ถึงจะเข้าได้ (public route)
// เพราะมือถือเปิดจาก QR ตรง ๆ ไม่ได้ผ่านการ login ปกติของเว็บนี้
// ถ้า router ของคุณมี ProtectedRoute/RequireAuth ครอบอยู่ทุก route
// ต้องเอา /mobile-camera ออกนอกการครอบนั้นด้วย ไม่งั้นมือถือจะโดนเด้งไปหน้า login แทน