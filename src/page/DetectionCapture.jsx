import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function DetectionCapture() {
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const imageContainerRef = useRef(null);

  const project = localStorage.getItem("project_name") || "My Project";
  const className = localStorage.getItem("class_name") || "N/A";
  
  const initialTotalImages = Number(localStorage.getItem("total_images")) || 0;
  const [totalImagesSaved, setTotalImagesSaved] = useState(initialTotalImages);

  const [capturedImage, setCapturedImage] = useState(null);
  const [isCameraActive, setIsCameraActive] = useState(false);

  // States สำหรับระบบ Bounding Box
  const [boxes, setBoxes] = useState([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [currentBox, setCurrentBox] = useState(null);
  
  // โหมด Augmentation ส่งไปให้ Backend ประมวลผล
  const [augMode, setAugMode] = useState("original");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // เก็บว่าภาพปัจจุบันถูกบันทึกโหมดไหนไปแล้วบ้าง (กันกดซ้ำโหมดเดิมโดยไม่ตั้งใจ)
  const [savedModes, setSavedModes] = useState([]);

  // 🛠️ กลไกเปิด/ปิดกล้อง
  useEffect(() => {
    if (isCameraActive) {
      navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } })
        .then((stream) => {
          if (videoRef.current) videoRef.current.srcObject = stream;
        })
        .catch((err) => {
          console.error("Error webcam: ", err);
          setIsCameraActive(false);
        });
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [isCameraActive]);

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = videoRef.current.srcObject.getTracks();
      tracks.forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
  };

  const captureSnapshot = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    
    setCapturedImage(canvas.toDataURL("image/jpeg"));
    setBoxes([]);
    setSavedModes([]);
    setAugMode("original");
    stopCamera();
    setIsCameraActive(false);
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setCapturedImage(event.target.result);
        setBoxes([]);
        setSavedModes([]);
        setAugMode("original");
        stopCamera();
        setIsCameraActive(false);
      };
      reader.readAsDataURL(file);
    }
  };

  // 🎯 ฟังก์ชันการคำนวณตำแหน่งเมาส์บนคอนเทนเนอร์
  const getMousePos = (e) => {
    if (!imageContainerRef.current) return { x: 0, y: 0 };
    const rect = imageContainerRef.current.getBoundingClientRect();
    
    // จำกัดไม่ให้ตำแหน่งพิกัดหลุดออกนอกขอบรูปภาพ (Clamp)
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const y = Math.max(0, Math.min(e.clientY - rect.top, rect.height));
    return { x, y };
  };

  const handleMouseDown = (e) => {
    if (!capturedImage) return;
    // บังคับให้วาดกล่องได้เฉพาะตอนพรีวิวโหมด original เท่านั้น
    // (ตอน preview โหมดอื่น รูปถูก transform ด้วย CSS แต่พิกัดเมาส์ยังอ้างอิงกับ container เดิม
    //  ถ้าวาดกล่องตอนนั้นพิกัดจะไม่ตรงกับภาพต้นฉบับ)
    if (augMode !== "original") return;
    const pos = getMousePos(e);
    setIsDrawing(true);
    setStartPos(pos);
    setCurrentBox({ x: pos.x, y: pos.y, w: 0, h: 0 });
  };

  const handleMouseMove = (e) => {
    if (!isDrawing || !currentBox) return;
    const pos = getMousePos(e);

    const x = Math.min(startPos.x, pos.x);
    const y = Math.min(startPos.y, pos.y);
    const w = Math.abs(startPos.x - pos.x);
    const h = Math.abs(startPos.y - pos.y);

    setCurrentBox({ x, y, w, h });
  };

  const handleMouseUp = () => {
    if (!isDrawing || !currentBox) return;
    setIsDrawing(false);
    
    // บันทึกกล่องเฉพาะกรณีที่มีขนาดใหญ่กว่า 5x5 พิกเซล เพื่อป้องกันการกดคลิกพลาด
    if (currentBox.w > 5 && currentBox.h > 5) {
      setBoxes([...boxes, { ...currentBox, id: Date.now(), label: className }]);
    }
    setCurrentBox(null);
  };

  const deleteBox = (id) => {
    setBoxes(boxes.filter(box => box.id !== id));
  };

  const handleLabelChange = (id, newName) => {
    setBoxes(boxes.map(b => b.id === id ? { ...b, label: newName } : b));
  };

  // 🔄 คำนวณ transform สำหรับพรีวิวภาพ+กล่อง ให้ตรงกับ augMode
  // รูปกับกล่องอยู่ใน wrapper เดียวกัน พอ transform พร้อมกันกล่องจะติดไปกับรูปโดยอัตโนมัติ
  const getPreviewTransform = () => {
    switch (augMode) {
      case "rotation_-10": return "rotate(-10deg)";
      case "rotation_10": return "rotate(10deg)";
      case "zoom_in": return "scale(1.15)";
      case "flip_horizontal": return "scaleX(-1)";
      default: return "none";
    }
  };

  // 🌗 pixel-level augmentation ไม่กระทบตำแหน่งกล่อง (geometry) จึงใส่แค่ filter ที่ตัวรูปพอ
  const getPreviewFilter = () => {
    switch (augMode) {
      case "brightness_dark": return "brightness(0.6)";
      case "brightness_bright": return "brightness(1.4)";
      case "grayscale": return "grayscale(1)";
      case "blur": return "blur(3px)";
      case "contrast_low": return "contrast(0.6)";
      case "contrast_high": return "contrast(1.6)";
      case "saturation_low": return "saturate(0.3)";
      case "saturation_high": return "saturate(2.2)";
      default: return "none";
    }
  };

  // 📈 คำนวณสถานะความพร้อมข้อมูล
  const getReadinessStatus = () => {
    const estimatedBoxes = totalImagesSaved * 3; // ปรับตัวคูณตามความเป็นจริงเฉลี่ย
    
    if (totalImagesSaved <= 20) {
      return {
        text: `🔴 ข้อมูลยังน้อยเกินไป (มี ${totalImagesSaved} ภาพ / ~${estimatedBoxes} กล่อง) โมเดลอาจจะเกิดอาการ Overfitting สูง`,
        color: "#EF4444",
        bg: "#FEF2F2",
        percent: Math.min((totalImagesSaved / 100) * 100, 20)
      };
    } else if (totalImagesSaved <= 80) {
      return {
        text: `🟡 ข้อมูลระดับเริ่มต้น (มี ${totalImagesSaved} ภาพ / ~${estimatedBoxes} กล่อง) เหมาะสำหรับทดสอบ POC แนะนำให้เพิ่มภาพคละมุมมอง`,
        color: "#F59E0B",
        bg: "#FEF3C7",
        percent: (totalImagesSaved / 100) * 100
      };
    } else {
      return {
        text: `🟢 ข้อมูลเพียงพอสำหรับระดับพื้นฐาน (มี ${totalImagesSaved} ภาพ) สามารถกดเข้าสู่ขั้นตอนการเทรนโมเดลได้เลย`,
        color: "#10B981",
        bg: "#ECFDF5",
        percent: 100
      };
    }
  };

  const status = getReadinessStatus();

  // 🎨 กลุ่ม augmentation ที่ไม่กระทบตำแหน่ง bounding box (ปลอดภัยที่จะแปลงจริงฝั่ง client)
  const PIXEL_LEVEL_MODES = [
    "grayscale", "blur",
    "brightness_dark", "brightness_bright",
    "contrast_low", "contrast_high",
    "saturation_low", "saturation_high"
  ];

  const getCanvasFilter = (mode) => {
    switch (mode) {
      case "brightness_dark": return "brightness(0.6)";
      case "brightness_bright": return "brightness(1.4)";
      case "grayscale": return "grayscale(1)";
      case "blur": return "blur(3px)";
      case "contrast_low": return "contrast(0.6)";
      case "contrast_high": return "contrast(1.6)";
      case "saturation_low": return "saturate(0.3)";
      case "saturation_high": return "saturate(2.2)";
      default: return "none";
    }
  };

  // แปลงภาพจริงด้วย Canvas ตาม pixel-level augMode ก่อนส่งขึ้นเซิร์ฟเวอร์
  // (ใช้ ctx.filter วาดภาพต้นฉบับใหม่ลง canvas ขนาดเท่าภาพจริง -> ได้ dataURL ที่ถูกแปลงแล้วจริง)
  const applyPixelAugmentation = (dataUrl, mode) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        ctx.filter = getCanvasFilter(mode);
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL("image/jpeg", 0.92));
      };
      img.onerror = () => reject(new Error("โหลดภาพเพื่อประมวลผลไม่สำเร็จ"));
      img.src = dataUrl;
    });
  };

  // 🚀 ส่งข้อมูลเข้า Flask API
  const saveImageToDataset = async () => {
    const serverUrl = localStorage.getItem("cloud_url");
    const email = localStorage.getItem("email");

    if (!serverUrl || !email) {
      alert("กรุณาตรวจสอบการตั้งค่า Cloud URL และการ Login ของคุณ");
      return;
    }

    if (boxes.length === 0) {
      alert("กรุณาวาด Bounding Box อย่างน้อย 1 กล่องก่อนบันทึก");
      return;
    }

    if (savedModes.includes(augMode)) {
      alert(`โหมด [${augMode}] ถูกบันทึกไปแล้วสำหรับภาพนี้ กรุณาเลือกโหมดอื่น`);
      return;
    }

    setIsSubmitting(true);
    const cleanServerUrl = serverUrl.replace(/\/$/, "");

    // ดึงขนาดจริงของ HTML Container เพื่อส่งไปทำ Normalize พิกัดที่ฝั่ง Backend 
    const container = imageContainerRef.current.getBoundingClientRect();

    // 🖼️ ถ้าเป็นโหมด pixel-level (grayscale/blur/brightness/contrast/saturation)
    // แปลงภาพจริงด้วย Canvas ก่อนส่ง เพื่อให้ไฟล์ที่บันทึกตรงกับที่เลือกจริง
    // ส่วนโหมด geometric (rotate/zoom/flip) ยังส่งภาพต้นฉบับ + aug_mode ให้ backend แปลง
    // เพราะต้องคำนวณ bounding box ใหม่ตามรูปทรง ยังไม่รองรับฝั่ง client
    let imageToSend = capturedImage;
    if (PIXEL_LEVEL_MODES.includes(augMode)) {
      try {
        imageToSend = await applyPixelAugmentation(capturedImage, augMode);
      } catch (err) {
        console.error("Canvas augmentation error:", err);
        alert("ไม่สามารถประมวลผลภาพโหมดนี้ได้ กรุณาลองใหม่อีกครั้ง");
        setIsSubmitting(false);
        return;
      }
    }

    const payload = {
      email: email,
      project_name: project,
      class_name: className,
      aug_mode: augMode, 
      image_data: imageToSend, 
      canvas_width: Math.round(container.width),
      canvas_height: Math.round(container.height),
      bounding_boxes: boxes.map(box => ({
        label: box.label,
        x: Math.round(box.x),
        y: Math.round(box.y),
        w: Math.round(box.w),
        h: Math.round(box.h)
      }))
    };

    try {
      const response = await fetch(`${cleanServerUrl}/api/upload_dataset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (response.ok) {
        const newTotal = totalImagesSaved + 1;
        setTotalImagesSaved(newTotal);
        localStorage.setItem("total_images", newTotal);
        setSavedModes([...savedModes, augMode]);

        alert(`บันทึกภาพโหมด [${augMode}] สำเร็จ! (สะสมรวม: ${newTotal} ภาพ) สามารถเลือกโหมด Augmentation อื่นแล้วบันทึกภาพ/กล่องเดิมซ้ำได้`);
        // ไม่ clear capturedImage และ boxes เพื่อให้เลือก augMode อื่นแล้วบันทึกภาพ+กล่องเดิมต่อได้
      } else {
        alert(`Server Error: ${result.error || "เกิดข้อผิดพลาดคลังข้อมูล"}`);
      }
    } catch (error) {
      console.error("Upload error:", error);
      alert("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาตรวจสอบ Network ของคุณ");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ล้างภาพ+กล่องด้วยตัวเอง เมื่อทำครบทุกโหมดที่ต้องการแล้ว
  const clearWorkspace = () => {
    setCapturedImage(null);
    setBoxes([]);
    setSavedModes([]);
    setAugMode("original");
  };

  const isCurrentModeSaved = savedModes.includes(augMode);

  return (
    <div style={{ maxWidth: 1100, margin: "30px auto", padding: 25, fontFamily: "Segoe UI, sans-serif" }}>
      
      {/* ส่วนหัวหน้าเว็บ */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 25 }}>
        <div>
          <button onClick={() => navigate(-1)} style={{ padding: "8px 16px", background: "#f3f4f6", border: "1px solid #d1d5db", borderRadius: 8, cursor: "pointer", marginRight: 15 }}>🎒 กลับหน้าหลัก</button>
          <span style={{ fontSize: 18, fontWeight: "bold", color: "#333" }}>Project: {project}</span>
        </div>
        <h2 style={{ margin: 0, color: "#E28743" }}>🎯 Object Detection Capture</h2>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: 25, marginBottom: 25 }}>
        
        {/* ฝั่งซ้าย: Source */}
        <div style={{ background: "#fff", padding: 20, borderRadius: 15, border: "1px solid #E5E7EB", boxShadow: "0 4px 12px rgba(0,0,0,.04)" }}>
          <h3 style={{ marginTop: 0, marginBottom: 15 }}>📷 Input Source</h3>
          
          <div style={{ display: "flex", gap: 10, marginBottom: 15 }}>
            <button 
              onClick={() => setIsCameraActive(!isCameraActive)}
              style={{ flex: 1, padding: "12px", background: isCameraActive ? "#EF4444" : "#0078D7", color: "white", border: "none", borderRadius: 10, fontWeight: "bold", cursor: "pointer" }}
            >
              {isCameraActive ? "🛑 ปิดกล้องสด" : "🎥 เปิดกล้อง Realtime"}
            </button>
            
            <label style={{ flex: 1, padding: "12px", background: "#10B981", color: "white", borderRadius: 10, fontWeight: "bold", cursor: "pointer", textAlign: "center" }}>
              {"📂 ดึงภาพจากภายนอก"}
              <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: "none" }} />
            </label>
          </div>

          <div style={{ width: "100%", height: 380, background: "#000", borderRadius: 12, overflow: "hidden", position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {isCameraActive ? (
              <>
                <video ref={videoRef} autoPlay playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                <button 
                  onClick={captureSnapshot}
                  style={{ position: "absolute", bottom: 20, left: "50%", transform: "translateX(-50%)", width: 70, height: 70, borderRadius: "50%", background: "#fff", border: "5px solid #0078D7", cursor: "pointer", boxShadow: "0 4px 15px rgba(0,0,0,.3)" }}
                />
              </>
            ) : (
              <div style={{ color: "#666", textAlign: "center" }}>
                <p style={{ fontSize: 48, margin: 0 }}>📹</p>
                <p style={{ color: "#aaa" }}>กดเปิดกล้อง หรือคลิกอัปโหลดภาพทางด้านบน</p>
              </div>
            )}
          </div>
        </div>

        {/* ฝั่งขวา: Interactive Canvas */}
        <div style={{ background: "#fff", padding: 20, borderRadius: 15, border: "1px solid #E5E7EB", boxShadow: "0 4px 12px rgba(0,0,0,.04)", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <h3 style={{ marginTop: 0, marginBottom: 5 }}>🎯 Interactive Canvas</h3>
              {capturedImage && (
                <button
                  onClick={clearWorkspace}
                  style={{ background: "none", border: "none", color: "#94A3B8", fontSize: 12, cursor: "pointer", textDecoration: "underline" }}
                >
                  🗑️ ล้างภาพนี้ทิ้ง
                </button>
              )}
            </div>
            <p style={{ fontSize: 13, color: "#666", marginTop: 0, marginBottom: 8 }}>คลิกแล้วลากกรอบสี่เหลี่ยมครอบตำแหน่งวัตถุที่ต้องการตรวจจับ</p>
            {capturedImage && augMode !== "original" && (
              <p style={{ fontSize: 12, color: "#0078D7", marginTop: 0, marginBottom: 8 }}>
                * กำลังพรีวิวโหมด [{augMode}] แบบประมาณ (ผลจริงคำนวณที่ Server) — สลับกลับ Original เพื่อวาดกล่องเพิ่ม
              </p>
            )}

            <div 
              ref={imageContainerRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              style={{ 
                width: "100%", 
                height: 380, 
                background: "#F3F4F6", 
                borderRadius: 12, 
                overflow: "hidden", 
                position: "relative",
                cursor: capturedImage ? (augMode === "original" ? "crosshair" : "default") : "not-allowed",
                userSelect: "none"
              }}
            >
              {capturedImage ? (
                <div
                  style={{
                    position: "relative",
                    width: "100%",
                    height: "100%",
                    transform: getPreviewTransform(),
                    transformOrigin: "center center",
                    transition: "transform 0.3s ease"
                  }}
                >
                  <img 
                    src={capturedImage} 
                    alt="Workspace" 
                    style={{ 
                      width: "100%", 
                      height: "100%", 
                      objectFit: "contain", 
                      pointerEvents: "none",
                      filter: getPreviewFilter(),
                      transition: "filter 0.3s ease"
                    }} 
                  />
                  
                  {boxes.map((box) => (
                    <div
                      key={box.id}
                      style={{
                        position: "absolute",
                        left: box.x,
                        top: box.y,
                        width: box.w,
                        height: box.h,
                        border: "2px solid #E28743",
                        background: "rgba(226, 135, 67, 0.15)",
                        pointerEvents: "none"
                      }}
                    >
                      <span style={{ position: "absolute", top: -22, left: -2, background: "#E28743", color: "#fff", fontSize: 11, padding: "2px 6px", borderRadius: "4px 4px 0 0", whiteSpace: "nowrap" }}>
                        {box.label}
                      </span>
                    </div>
                  ))}

                  {currentBox && (
                    <div
                      style={{
                        position: "absolute",
                        left: currentBox.x,
                        top: currentBox.y,
                        width: currentBox.w,
                        height: currentBox.h,
                        border: "2px dashed #0078D7",
                        background: "rgba(0, 120, 215, 0.1)",
                        pointerEvents: "none"
                      }}
                    />
                  )}
                </div>
              ) : (
                <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#aaa" }}>
                  ยังไม่มีรูปถ่าย (กรุณากดถ่ายภาพหรือเลือกดึงไฟล์ภาพจากฝั่งซ้ายก่อน)
                </div>
              )}
            </div>
          </div>

          {capturedImage && (
            <div style={{ marginTop: 15, background: "#F8FAFC", padding: 12, borderRadius: 10, border: "1px solid #E2E8F0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontWeight: "bold", color: "#475569", fontSize: 14 }}>🔄 สั่งทำ Augmentation ที่ฝั่ง Server:</span>
              <select
                value={augMode}
                onChange={(e) => setAugMode(e.target.value)}
                style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #CBD5E1", background: "#fff", fontWeight: "bold", color: "#0078D7", cursor: "pointer", width: "45%" }}
              >
                <option value="original">📦 Original (บันทึกภาพปกติ){savedModes.includes("original") ? " ✅" : ""}</option>
                <option value="rotation_-10">↩️ Server Auto Rotation -10°{savedModes.includes("rotation_-10") ? " ✅" : ""}</option>
                <option value="rotation_10">↪️ Server Auto Rotation 10°{savedModes.includes("rotation_10") ? " ✅" : ""}</option>
                <option value="zoom_in">🔍 Server Auto Zoom In{savedModes.includes("zoom_in") ? " ✅" : ""}</option>
                <option value="flip_horizontal">🔀 Server Auto Flip Horizontal{savedModes.includes("flip_horizontal") ? " ✅" : ""}</option>
                <option value="brightness_dark">🌙 Server Auto Reduce Brightness{savedModes.includes("brightness_dark") ? " ✅" : ""}</option>
                <option value="brightness_bright">☀️ Server Auto Increase Brightness{savedModes.includes("brightness_bright") ? " ✅" : ""}</option>
                <option value="grayscale">⚫ Server Auto Grayscale{savedModes.includes("grayscale") ? " ✅" : ""}</option>
                <option value="blur">💧 Server Auto Blur{savedModes.includes("blur") ? " ✅" : ""}</option>
                <option value="contrast_low">🔅 Server Auto Contrast Low{savedModes.includes("contrast_low") ? " ✅" : ""}</option>
                <option value="contrast_high">🔆 Server Auto Contrast High{savedModes.includes("contrast_high") ? " ✅" : ""}</option>
                <option value="saturation_low">🎨 Server Auto Saturation Low{savedModes.includes("saturation_low") ? " ✅" : ""}</option>
                <option value="saturation_high">🌈 Server Auto Saturation High{savedModes.includes("saturation_high") ? " ✅" : ""}</option>
              </select>
            </div>
          )}
        </div>

      </div>

      {/* แผงแสดงความพร้อมข้อมูล */}
      <div style={{ background: status.bg, border: `1px solid ${status.color}`, padding: "15px 20px", borderRadius: 12, marginBottom: 25 }}>
        <div style={{ fontWeight: "bold", color: status.color, fontSize: 15, marginBottom: 8 }}>
          {status.text}
        </div>
        <div style={{ width: "100%", height: 10, background: "#E2E8F0", borderRadius: 5, overflow: "hidden" }}>
          <div style={{ width: `${status.percent}%`, height: "100%", background: status.color, borderRadius: 5, transition: "width 0.5s ease" }} />
        </div>
      </div>

      {/* แผงแสดงรายการข้อมูลพิกัด */}
      <div style={{ background: "#fff", padding: 20, borderRadius: 15, border: "1px solid #E5E7EB", boxShadow: "0 4px 12px rgba(0,0,0,.04)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 15 }}>
          <h3 style={{ margin: 0 }}>📊 รายการพิกัดรูปภาพนี้ ({boxes.length} กล่อง)</h3>
          <button 
            disabled={boxes.length === 0 || isSubmitting || isCurrentModeSaved}
            style={{ padding: "10px 20px", background: (boxes.length === 0 || isSubmitting || isCurrentModeSaved) ? "#ccc" : "#0078D7", color: "white", border: "none", borderRadius: 8, fontWeight: "bold", cursor: (boxes.length === 0 || isSubmitting || isCurrentModeSaved) ? "not-allowed" : "pointer" }}
            onClick={saveImageToDataset}
            title={isCurrentModeSaved ? "โหมดนี้ถูกบันทึกไปแล้วสำหรับภาพนี้ กรุณาเลือกโหมดอื่นก่อนบันทึก" : ""}
          >
            {isCurrentModeSaved ? `✅ บันทึกโหมด [${augMode}] แล้ว` : (isSubmitting ? "⌛ กำลังอัปโหลด..." : `💾 บันทึกรูปภาพโหมด [${augMode}]`)}
          </button>
        </div>

        {boxes.length === 0 ? (
          <p style={{ color: "#aaa", textAlign: "center", padding: "10px 0" }}>ยังไม่มีกล่องพิกัดใด ๆ ถูกวาดในรูปปัจจุบันนี้</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            {boxes.map((box, index) => (
              <div key={box.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f9fafb", border: "1px solid #e5e7eb", padding: "12px 15px", borderRadius: 8 }}>
                <div>
                  <strong style={{ color: "#666" }}>กล่องที่ #{index + 1}</strong>
                  <div style={{ marginTop: 6, marginBottom: 6 }}>
                    <span style={{ fontSize: 13, color: "#444" }}>คลาส:</span>
                    <input 
                      type="text" 
                      value={box.label} 
                      onChange={(e) => handleLabelChange(box.id, e.target.value)}
                      style={{ marginLeft: 8, padding: "3px 8px", border: "1px solid #cbd5e1", borderRadius: 5, fontWeight: "bold", color: "#E28743", width: "120px" }}
                    />
                  </div>
                  <div style={{ fontSize: 11, color: "#888" }}>
                    X: {Math.round(box.x)} | Y: {Math.round(box.y)} | W: {Math.round(box.w)} | H: {Math.round(box.h)}
                  </div>
                </div>
                <button onClick={() => deleteBox(box.id)} style={{ background: "none", border: "none", color: "#EF4444", fontSize: 18, cursor: "pointer", padding: 5 }} title="ลบกล่องนี้">❌</button>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
