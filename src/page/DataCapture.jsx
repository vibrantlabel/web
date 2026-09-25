import { useNavigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";

export default function DataCapture() {

  const navigate = useNavigate();
  const location = useLocation();

  const project =
    localStorage.getItem("project_name");

  const className =
    localStorage.getItem("class_name");

  const total =
    localStorage.getItem("total_images") || 0;

  const resizeWidth =  localStorage.getItem("resize_width");

  const resizeHeight =  localStorage.getItem("resize_height");

  // ==========================================================
  // 💰 Plan Limits / Usage
  // ลำดับความสำคัญ:
  // 1) รับมาจาก route state ที่ Dashboard.jsx (หรือหน้าก่อนหน้า) ส่งมาให้ตรงๆ
  //    (navigate(..., { state })) — เร็วที่สุด ไม่ต้องยิง API ซ้ำ
  // 2) ถ้าไม่มี state มา (เช่น chain การส่ง state ขาดตอน, ผู้ใช้ reload หน้านี้
  //    ตรงๆ ด้วย URL, หรือเปิดลิงก์นี้จากที่อื่น) -> ยิง /get_user_plan เอง
  //    เหมือนที่ Dashboard.jsx ทำ เพื่อให้หน้านี้เช็ค quota ได้เสมอไม่ว่า
  //    จะเข้ามาทางไหนก็ตาม (fail-safe ต่อการ reload/เข้าตรง)
  // ==========================================================
  const [planLimits, setPlanLimits] = useState(location.state?.planLimits || null);
  const [planUsage, setPlanUsage] = useState(location.state?.planUsage || null);
  const [loadingPlan, setLoadingPlan] = useState(!location.state?.planLimits);

  const fetchWithTimeout = async (url, options = {}, timeoutMs = 15000) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      return response;
    } finally {
      clearTimeout(timer);
    }
  };

  useEffect(() => {
    // ถ้ามี state ส่งมาให้แล้ว (จาก Dashboard หรือหน้าก่อนหน้า) ไม่ต้องยิง API ซ้ำ
    if (location.state?.planLimits) {
      return;
    }

    const cloudUrl = localStorage.getItem("cloud_url");
    const email = localStorage.getItem("email");

    if (!cloudUrl || !email) {
      setLoadingPlan(false);
      return;
    }

    let cancelled = false;

    (async () => {
      setLoadingPlan(true);
      try {
        const response = await fetchWithTimeout(`${cloudUrl}/get_user_plan`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email })
        });

        const result = await response.json();

        if (!cancelled && result.success) {
          setPlanLimits(result.limits || null);
          setPlanUsage(result.usage || null);
        }
      } catch (err) {
        console.error("LOAD USER PLAN FAILED (DataCapture):", err);
        // 🆕 fail-open โดยตั้งใจ: เช็ค quota ไม่ได้ ก็ไม่บล็อกผู้ใช้
        // (planLimits/planUsage ยังเป็น null -> การ์ดโควตาไม่แสดง และ
        // ปุ่มทั้งหมดไม่ถูก disable จากเหตุผลนี้)
      } finally {
        if (!cancelled) setLoadingPlan(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ==========================================================
  // 💰 คำนวณโควตาที่เหลือ (เฉพาะ images)
  // - null = เช็คไม่ได้ / ยังไม่โหลดเสร็จ -> ไม่บล็อกอะไร (fail-open)
  // - Infinity หรือ maxImages ไม่ใช่ finite number -> ไม่จำกัด (เช่น Enterprise)
  // ==========================================================
  const totalImagesUsed = planUsage?.totalImages ?? null;
  const maxImages = planLimits?.maxImages ?? null;

  const hasQuotaInfo = totalImagesUsed != null && maxImages != null;
  const isUnlimitedImages = hasQuotaInfo && !Number.isFinite(maxImages);

  const remainingImages =
    hasQuotaInfo && !isUnlimitedImages
      ? Math.max(0, maxImages - totalImagesUsed)
      : null;

  const isOverImageQuota = remainingImages !== null && remainingImages <= 0;

  // 🆕 โหมด AI Generator คูณภาพ ×11 ต่อการถ่าย 1 ครั้ง — ถ้าเหลือโควตาน้อยกว่า 11
  // รูป ก็มีโอกาสสูงที่จะเกิน quota ตั้งแต่ถ่ายรูปแรก จึงเตือน/บล็อกไว้ก่อน
  const AI_GENERATOR_MULTIPLIER = 11;
  const isAiGeneratorRisky =
    remainingImages !== null && remainingImages < AI_GENERATOR_MULTIPLIER;

  // ==========================================================
  // 🆕 helper: แนบ planLimits/planUsage ไปกับทุก navigate ต่อจากหน้านี้
  // เพื่อให้หน้าถ่ายภาพจริง (/single, /burst, /ai-generator) เช็ค quota
  // ต่อได้เลยโดยไม่ต้องยิง /get_user_plan ซ้ำอีกรอบ
  // ==========================================================
  const goToCapture = (path) => {
    navigate(path, {
      state: {
        project,
        className,
        total,
        resizeWidth,
        resizeHeight,
        planLimits,
        planUsage
      }
    });
  };

  const card = {
    border: "1px solid #E5E7EB",
    borderRadius: 18,
    padding: 22,
    marginBottom: 18,
    cursor: "pointer",
    background: "#FFFFFF",
    boxShadow: "0 6px 18px rgba(0,0,0,.08)",
    transition: "all .25s ease"
  };

  const cardDisabled = {
    ...card,
    cursor: "not-allowed",
    opacity: 0.55,
    boxShadow: "none"
  };

  return (

    <div
      style={{
        maxWidth: 950,
        margin: "30px auto",
        padding: 25,
        fontFamily: "Segoe UI"
      }}
    >

      {/* Header */}

      <div
        style={{
          background:
            "linear-gradient(135deg,#0078D7,#00A2FF)",
          color: "white",
          padding: 25,
          borderRadius: 18,
          marginBottom: 25
        }}
      >

        <h1
          style={{
            margin: 0
          }}
        >
          📷 Data Capture
        </h1>

        <p
          style={{
            marginTop: 10,
            opacity: .95
          }}
        >
          Select a capture mode to
          collect images for your AI dataset.
        </p>

      </div>

      {/* Project */}

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "1fr 1fr 1fr",
          gap: 15,
          marginBottom: 20
        }}
      >

        <div
          style={{
            background: "#fff",
            borderRadius: 15,
            padding: 20,
            boxShadow:
              "0 4px 12px rgba(0,0,0,.08)"
          }}
        >

          <div
            style={{
              color:"#666"
            }}
          >
            Project
          </div>

        <h3>
  {project}
  <span
    style={{
      fontSize: 16,
      color: "#666",
      marginLeft: 10,
      fontWeight: "normal"
    }}
  >
    (📐 {resizeWidth} × {resizeHeight})
  </span>
</h3>

  

        </div>

        <div
          style={{
            background:"#fff",
            borderRadius:15,
            padding:20,
            boxShadow:
              "0 4px 12px rgba(0,0,0,.08)"
          }}
        >

          <div
            style={{
              color:"#666"
            }}
          >
            Class
          </div>

          <h3>{className}</h3>

        </div>

        <div
          style={{
            background:"#fff",
            borderRadius:15,
            padding:20,
            boxShadow:
              "0 4px 12px rgba(0,0,0,.08)"
          }}
        >

          <div
            style={{
              color:"#666"
            }}
          >
            Total Images
          </div>

          <h2
            style={{
              color:"#0078D7"
            }}
          >
            {Number(total).toLocaleString()}
          </h2>

        </div>

      </div>

      {/* ==========================================================
          💰 การ์ดโควตา Images ของแผนปัจจุบัน — ดึงจาก route state (Dashboard)
          หรือ fallback ยิง /get_user_plan เอง ถ้าไม่มี state ส่งมา
          ========================================================== */}
      {loadingPlan && (
        <div
          style={{
            background: "#eef3fb",
            border: "1px solid #cfe0f5",
            borderRadius: 12,
            padding: "12px 18px",
            color: "#2c5282",
            marginBottom: 20,
            fontSize: 13
          }}
        >
          🔍 กำลังตรวจสอบโควตาการใช้งาน รอสักครู่..
        </div>
      )}

      {!loadingPlan && hasQuotaInfo && (
        <div
          style={{
            background: isOverImageQuota ? "#fdecea" : isAiGeneratorRisky ? "#fff8e1" : "#eef3fb",
            border: `1px solid ${isOverImageQuota ? "#f5c2c0" : isAiGeneratorRisky ? "#ffe082" : "#cfe0f5"}`,
            borderRadius: 12,
            padding: "12px 18px",
            marginBottom: 20,
            fontSize: 13,
            color: isOverImageQuota ? "#a12622" : isAiGeneratorRisky ? "#8a6d00" : "#2c5282"
          }}
        >
          {isUnlimitedImages ? (
            <>💾 โควตารูปภาพ: ไม่จำกัด (ใช้ไปแล้ว {totalImagesUsed.toLocaleString()} รูป)</>
          ) : (
            <>
              💾 โควตารูปภาพ: <b>{totalImagesUsed.toLocaleString()}</b> / {maxImages.toLocaleString()} รูป
              {isOverImageQuota && " — ใช้ครบโควตาแล้ว กรุณาอัปเกรดแผนหรือลบข้อมูลเก่าก่อนถ่ายภาพเพิ่ม"}
              {!isOverImageQuota && isAiGeneratorRisky &&
                ` — เหลือ ${remainingImages.toLocaleString()} รูป (โหมด AI Generator คูณ ${AI_GENERATOR_MULTIPLIER} เท่าต่อภาพ อาจเกินโควตาได้)`}
            </>
          )}
        </div>
      )}

      <h2
        style={{ 
          marginBottom:20
        }}
      >
        Select Capture Mode
      </h2>

      {/* Single */}

      <div
        style={isOverImageQuota ? cardDisabled : card}
        onClick={() => {
          if (isOverImageQuota) {
            alert("คุณใช้โควตารูปภาพครบแล้ว กรุณาอัปเกรดแผนหรือลบข้อมูลเก่าก่อนถ่ายภาพเพิ่ม");
            return;
          }
          goToCapture("/single");
        }}
      >

        <h2>
          📷 Single Capture
        </h2>

        <p
          style={{
            color:"#666",
            marginTop:10
          }}
        >
          Capture one image and upload
          directly to Firebase Storage.
        </p>

        <div
          style={{
            marginTop:15,
            color:"#0078D7",
            fontWeight:"bold"
          }}
        >
          ➜ 1 Click = 1 Image
        </div>

      </div>

      {/* Burst */}

      <div
        style={isOverImageQuota ? cardDisabled : card}
        onClick={() => {
          if (isOverImageQuota) {
            alert("คุณใช้โควตารูปภาพครบแล้ว กรุณาอัปเกรดแผนหรือลบข้อมูลเก่าก่อนถ่ายภาพเพิ่ม");
            return;
          }
          goToCapture("/burst");
        }}
      >

        <h2>
          ⚡ Burst Capture
        </h2>

        <p
          style={{
            color:"#666",
            marginTop:10
          }}
        >
          Capture continuously
          at 3~5 FPS for rapid
          dataset collection.
        </p>

        <div
          style={{
            marginTop:15,
            color:"#0078D7",
            fontWeight:"bold"
          }}
        >
          ➜ 1 Click = Multiple Images
        </div>

      </div>

      {/* Generator */}
      {/* 🆕 บล็อกไม่ให้เข้าโหมดนี้ถ้าโควตาเหลือน้อยกว่า 11 รูป (คูณ ×11 ต่อการถ่าย
          1 ครั้ง) เพื่อกันไม่ให้ถ่ายรูปแรกแล้วเกิน quota ไปเลยแบบไม่มีการเตือน */}
      <div
        style={isOverImageQuota || isAiGeneratorRisky ? cardDisabled : card}
        onClick={() => {
          if (isOverImageQuota) {
            alert("คุณใช้โควตารูปภาพครบแล้ว กรุณาอัปเกรดแผนหรือลบข้อมูลเก่าก่อนถ่ายภาพเพิ่ม");
            return;
          }
          if (isAiGeneratorRisky) {
            const proceed = window.confirm(
              `เหลือโควตารูปภาพอีก ${remainingImages.toLocaleString()} รูปเท่านั้น\n` +
              `โหมด AI Dataset Generator จะสร้างรูปเพิ่ม ${AI_GENERATOR_MULTIPLIER} เท่าต่อการถ่าย 1 ครั้ง ` +
              `อาจทำให้เกินโควตาได้\n\nต้องการดำเนินการต่อหรือไม่?`
            );
            if (!proceed) return;
          }
          goToCapture("/ai-generator");
        }}
      >

        <h2>
          🧠 AI Dataset Generator
        </h2>

        <p
          style={{
            color:"#666",
            marginTop:10,
            lineHeight:1.8
          }}
        >
         📷 Original Real Capture ,
  ↩ Rotation -10° , 
  ↪ Rotation +10° , 
  🔍 Zoom In ,
  🔎 Zoom Out ,
  🌙 Brightness Dark ,
  ☀ Brightness Bright ,
  ⬅ Translation Left ,
  ➡ Translation Right ,
  ⬆ Translation Up ,
  ⬇ Translation Down ,
        </p>

        <div
          style={{
            marginTop:15,
            color:"#0078D7",
            fontWeight:"bold"
          }}
        >
          ➜ 1 Real Capture = 11 AI Training Images
        </div>

      </div>

    </div>

  );

}