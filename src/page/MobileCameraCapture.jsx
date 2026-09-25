import { useEffect, useRef, useState } from "react";

// ==========================================================
// 📱 MobileCameraCapture: หน้าเว็บที่มือถือเปิดหลังสแกน QR จากหน้า DetectionCapture
// อ่าน session/email/project/server จาก query string ที่ QR ชี้มา แล้ว:
//   1. เปิดกล้องหลังของมือถือ (facingMode: "environment")
//   2. จับภาพจาก <video> ลง canvas เป็นระยะ (ทุก FRAME_INTERVAL_MS) เป็นพรีวิวต่อเนื่อง
//   3. POST เฟรมล่าสุดขึ้น /upload_mobile_camera_frame ผูกกับ session เดียวกัน
//   4. 🆕 เมื่อผู้ใช้กด "📸 ถ่ายภาพ" จะส่งเฟรมความละเอียดเต็มพร้อม flag captured: true
//      เพื่อบอกฝั่ง PC ว่าเฟรมนี้คือภาพที่ผู้ใช้ยืนยันแล้ว ไม่ใช่แค่พรีวิวต่อเนื่อง
//      ⚠️ ต้องให้ backend รองรับ field "captured" นี้ทั้งใน /upload_mobile_camera_frame
//      (รับเข้า) และ /get_mobile_camera_frame (ส่งกลับ) ไม่งั้นฝั่ง PC จะไม่รู้ว่าภาพไหน
//      คือภาพที่ถูกยืนยันแล้ว
//
// เพิ่ม route นี้ในไฟล์ router หลักของคุณ เช่น:
//   <Route path="/mobile-camera" element={<MobileCameraCapture />} />
// ==========================================================

const FRAME_INTERVAL_MS = 800;     // ความถี่ในการส่งเฟรมขึ้น Server — จงใจให้เท่ากับรอบ polling ฝั่ง desktop
                                    // เพราะแต่ละครั้งคือการเขียนไฟล์จริงขึ้น Cloud Storage (มีต้นทุน) ส่งถี่กว่าที่มีคนดูก็ไม่มีประโยชน์
const FRAME_MAX_DIMENSION = 1280;  // ย่อภาพก่อนส่ง (พรีวิวต่อเนื่อง) กัน payload ใหญ่/เน็ตมือถือช้า

export default function MobileCameraCapture() {
  const videoRef = useRef(null);
  const canvasRef = useRef(document.createElement("canvas"));
  const sendIntervalRef = useRef(null);
  const streamRef = useRef(null);

  const [status, setStatus] = useState("starting"); // "starting" | "streaming" | "error" | "missing_params" | "stopped"
  const [errorMessage, setErrorMessage] = useState("");

  // 🆕 สถานะปุ่มถ่ายภาพ: กันกดรัว + โชว์ feedback ว่าส่งสำเร็จแล้ว
  const [capturing, setCapturing] = useState(false);
  const [captureSent, setCaptureSent] = useState(false);

  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get("session") || "";
  const email = params.get("email") || "";
  const project = params.get("project") || "";
  const serverUrl = params.get("server") || "";

  useEffect(() => {
    if (!sessionId || !email || !serverUrl) {
      setStatus("missing_params");
      return;
    }

    let cancelled = false;

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: "environment" }, width: 1280, height: 720 } })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setStatus("streaming");

        sendIntervalRef.current = setInterval(() => {
          sendFrame();
        }, FRAME_INTERVAL_MS);
      })
      .catch((err) => {
        console.error("Camera error:", err);
        setStatus("error");
        setErrorMessage("ไม่สามารถเปิดกล้องได้ กรุณาอนุญาตการใช้กล้องแล้วรีเฟรชหน้านี้");
      });

    return () => {
      cancelled = true;
      if (sendIntervalRef.current) clearInterval(sendIntervalRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 🔁 ส่งเฟรมพรีวิวต่อเนื่อง (ไม่ใช่ภาพที่ผู้ใช้ยืนยัน — แค่ให้ฝั่ง PC เห็นภาพสดๆ)
  const sendFrame = async () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;

    let targetW = video.videoWidth;
    let targetH = video.videoHeight;
    if (targetW > FRAME_MAX_DIMENSION || targetH > FRAME_MAX_DIMENSION) {
      if (targetW >= targetH) {
        targetH = Math.round((targetH / targetW) * FRAME_MAX_DIMENSION);
        targetW = FRAME_MAX_DIMENSION;
      } else {
        targetW = Math.round((targetW / targetH) * FRAME_MAX_DIMENSION);
        targetH = FRAME_MAX_DIMENSION;
      }
    }

    const canvas = canvasRef.current;
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, targetW, targetH);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.7);

    try {
      const cleanServerUrl = serverUrl.replace(/\/$/, "");
      await fetch(`${cleanServerUrl}/upload_mobile_camera_frame`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, session_id: sessionId, image_data: dataUrl })
      });
    } catch (err) {
      console.error("Send frame failed:", err);
      // ไม่ต้อง setStatus("error") ทันทีตรงนี้ เผื่อเน็ตสะดุดชั่วคราว รอบถัดไปอาจส่งผ่านได้
    }
  };

  // 📸 ถ่ายภาพจริง: ต่างจาก sendFrame (พรีวิวต่อเนื่อง) ตรงที่
  // (1) ใช้ resolution เต็มของกล้อง ไม่ resize ลงเท่าพรีวิว
  // (2) แนบ flag "captured: true" บอก backend ว่านี่คือภาพที่ผู้ใช้กดยืนยันแล้ว
  //     ไม่ใช่แค่เฟรมพรีวิวเฉยๆ — ฝั่ง PC (DetectionCapture.jsx) จะเช็ค flag นี้
  //     ตอน polling แล้วดึงภาพนี้ไปใส่ canvas ให้อัตโนมัติ
  // ⚠️ ต้องให้ backend รองรับ field "captured" ทั้งฝั่งรับ (endpoint นี้)
  //    และฝั่งส่งกลับ (/get_mobile_camera_frame) ไม่งั้นฟีเจอร์นี้จะไม่ทำงาน
  const handleCapturePhoto = async () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || capturing) return;

    setCapturing(true);

    const targetW = video.videoWidth;
    const targetH = video.videoHeight;

    const canvas = canvasRef.current;
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, targetW, targetH);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);

    try {
      const cleanServerUrl = serverUrl.replace(/\/$/, "");
      await fetch(`${cleanServerUrl}/upload_mobile_camera_frame`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          session_id: sessionId,
          image_data: dataUrl,
          captured: true // 🆕 ต้องให้ backend รองรับ field นี้
        })
      });
      setCaptureSent(true);
      setTimeout(() => setCaptureSent(false), 2000);
    } catch (err) {
      console.error("Capture photo failed:", err);
      alert("ส่งภาพไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setCapturing(false);
    }
  };

  const handleStopCamera = () => {
    if (sendIntervalRef.current) clearInterval(sendIntervalRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }
    setStatus("stopped");
  };

  return (
    <div style={{ minHeight: "100vh", background: "#000", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "14px 16px", color: "#fff", fontFamily: "Segoe UI, sans-serif" }}>
        <div style={{ fontWeight: "bold", fontSize: 16 }}>📱 กล้องมือถือ — DataLens</div>
        {project && <div style={{ fontSize: 12.5, color: "#94A3B8", marginTop: 2 }}>โปรเจกต์: {project}</div>}
      </div>

      {status === "missing_params" && (
        <div style={{ color: "#F87171", padding: 20, textAlign: "center" }}>
          ❌ ลิงก์นี้ไม่สมบูรณ์ (ขาด session/email/server) กรุณากลับไปสแกน QR ใหม่จากหน้าเว็บหลัก
        </div>
      )}

      {status === "error" && (
        <div style={{ color: "#F87171", padding: 20, textAlign: "center" }}>
          ❌ {errorMessage}
        </div>
      )}

      {status === "stopped" && (
        <div style={{ color: "#94A3B8", padding: 20, textAlign: "center" }}>
          🛑 ปิดกล้องแล้ว — กลับไปดูภาพที่หน้าคอมพิวเตอร์ได้เลย
        </div>
      )}

      <div style={{ flex: 1, position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{ width: "100%", height: "100%", objectFit: "cover", display: status === "streaming" ? "block" : "none" }}
        />
        {status === "starting" && (
          <div style={{ color: "#94A3B8", fontFamily: "Segoe UI, sans-serif" }}>⏳ กำลังเปิดกล้อง...</div>
        )}

        {/* 🆕 Flash feedback ตอนถ่ายภาพสำเร็จ — เด้งขึ้นมุมบนของพรีวิว ไม่บังปุ่มด้านล่าง */}
        {captureSent && (
          <div
            style={{
              position: "absolute",
              top: 16,
              left: "50%",
              transform: "translateX(-50%)",
              background: "rgba(16, 185, 129, 0.95)",
              color: "#fff",
              padding: "8px 18px",
              borderRadius: 999,
              fontSize: 13,
              fontWeight: "bold",
              fontFamily: "Segoe UI, sans-serif",
              boxShadow: "0 4px 12px rgba(0,0,0,.3)"
            }}
          >
            ✅ ส่งภาพไปที่คอมพิวเตอร์แล้ว
          </div>
        )}
      </div>

      {status === "streaming" && (
        <div style={{ padding: 16, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", gap: 10, width: "100%", maxWidth: 320 }}>
            <button
              onClick={handleCapturePhoto}
              disabled={capturing}
              style={{
                flex: 1,
                padding: "14px 20px",
                background: capturing ? "#94A3B8" : "#0078D7",
                color: "#fff",
                border: "none",
                borderRadius: 10,
                fontWeight: "bold",
                fontSize: 15,
                cursor: capturing ? "not-allowed" : "pointer"
              }}
            >
              {capturing ? "⏳ กำลังส่ง..." : "📸 ถ่ายภาพ"}
            </button>
            <button
              onClick={handleStopCamera}
              style={{
                padding: "14px 20px",
                background: "#EF4444",
                color: "#fff",
                border: "none",
                borderRadius: 10,
                fontWeight: "bold",
                fontSize: 14,
                cursor: "pointer"
              }}
            >
              🛑 ปิดกล้อง
            </button>
          </div>
          <p style={{ color: "#64748B", fontSize: 11.5, margin: 0, textAlign: "center", fontFamily: "Segoe UI, sans-serif" }}>
            กด "ถ่ายภาพ" เมื่อพร้อม ภาพจะไปแสดงที่หน้าคอมพิวเตอร์ให้อัตโนมัติ
          </p>
        </div>
      )}
    </div>
  );
}