import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

// ==========================================================
// Export/Train Format Registry (Object Detection / Segmentation)
// ==========================================================
const FORMAT_OPTIONS = [
  {
    value: "yolo",
    label: "YOLO format (.txt) — เทรนจริงได้",
    desc: "เทรนโมเดล YOLOv8 จริงบน Server แล้วดาวน์โหลดไฟล์ .pt ไปใช้งานต่อได้เลย"
  },
  {
    value: "coco",
    label: "COCO format (.json) — Export เท่านั้น",
    desc: "ยังไม่รองรับเทรนอัตโนมัติ จะได้ไฟล์ .zip (รูปภาพ + annotations.json) ไปเทรนเองด้วย Detectron2/MMDetection"
  }
];

// ==========================================================
// 🌐 Edge Export Format Registry
// ต่อยอดจาก best.pt ที่ train เสร็จแล้ว — แปลงเป็นฟอร์แมตที่ใช้บนอุปกรณ์ edge ได้
// ⚠️ "engine" (TensorRT) พิเศษกว่าตัวอื่น: build ข้ามเครื่องไม่ได้
//    ระบบจะให้ ONNX + สคริปต์ build แทนไฟล์ .engine สำเร็จรูป
// ==========================================================
const EDGE_FORMAT_OPTIONS = [
  { value: "onnx", label: "ONNX — Raspberry Pi / PC ทั่วไป" },
  { value: "tflite", label: "TFLite — Coral TPU / Mobile (Android)" },
  { value: "ncnn", label: "NCNN — โทรศัพท์ / อุปกรณ์ ARM ทั่วไป" },
   {
    value: "engine",
    label: "TensorRT — Jetson Orin/AGX (Industrial) 🔒 เร็วๆ นี้",
    disabled: true   // ⬅️ ปิดไว้ก่อน รอทดสอบบนบอร์ดจริง
  }
];

export default function DetSegTrain() {
  const location = useLocation();
  const navigate = useNavigate();

  const project =
    location.state?.project ||
    JSON.parse(localStorage.getItem("selected_det_seg_project") || "null");

  const email = localStorage.getItem("email");
  const SERVER_URL = localStorage.getItem("cloud_url");

  const taskType = project?.project_type === "segmentation" ? "segmentation" : "detection";
  const taskLabel = taskType === "segmentation" ? "⬡ Segmentation" : "🎯 Object Detection";

  const [format, setFormat] = useState("yolo");

  const [isExporting, setIsExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState({ type: "", text: "" });

  const [trainStatus, setTrainStatus] = useState({ status: "idle", progress: 0 });
  const pollRef = useRef(null);

  const [edgeFormat, setEdgeFormat] = useState("onnx");
  const [edgeStatus, setEdgeStatus] = useState({ status: "idle", progress: 0 });
  const edgePollRef = useRef(null);

  useEffect(() => {
    if (project) {
      localStorage.setItem("selected_det_seg_project", JSON.stringify(project));
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (edgePollRef.current) clearInterval(edgePollRef.current);
    };
  }, [project]);

  if (!project) {
    return (
      <div style={{ padding: 20 }}>
        <h2>Project Not Found</h2>
        <p>
          ไม่พบข้อมูลโปรเจกต์ที่เลือก กรุณากลับไปหน้า Projects
          แล้วเลือกโปรเจกต์อีกครั้ง
        </p>
        <button onClick={() => navigate("/projects")}>
          ← Back to Projects
        </button>
      </div>
    );
  }

  const isTrainBusy = trainStatus.status === "starting" || trainStatus.status === "running";
  const isTrainDone = trainStatus.status === "done";

  const handleExportCoco = async () => {
    if (!SERVER_URL || !email) {
      setExportMsg({ type: "error", text: "กรุณาตรวจสอบการตั้งค่า Cloud URL และการ Login ของคุณ" });
      return;
    }

    setIsExporting(true);
    setExportMsg({ type: "", text: "" });

    try {
      const cleanServerUrl = SERVER_URL.replace(/\/$/, "");

      const response = await fetch(`${cleanServerUrl}/export_dataset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, project: project.project, taskType, format: "coco" })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        setExportMsg({ type: "error", text: errData?.message || "Export ไม่สำเร็จ" });
        setIsExporting(false);
        return;
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${project.project}_${taskType}_coco.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      setExportMsg({ type: "success", text: `✅ Export สำเร็จ! ดาวน์โหลดไฟล์ ${project.project}_${taskType}_coco.zip แล้ว` });
    } catch (err) {
      console.error(err);
      setExportMsg({ type: "error", text: "ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาตรวจสอบ Network ของคุณ" });
    } finally {
      setIsExporting(false);
    }
  };

  const startTraining = async () => {
    if (!SERVER_URL || !email) {
      setTrainStatus({ status: "error", message: "กรุณาตรวจสอบการตั้งค่า Cloud URL และการ Login ของคุณ" });
      return;
    }

    setEdgeStatus({ status: "idle", progress: 0 });
    if (edgePollRef.current) {
      clearInterval(edgePollRef.current);
      edgePollRef.current = null;
    }

    setTrainStatus({ status: "starting", progress: 0 });

    try {
      const cleanServerUrl = SERVER_URL.replace(/\/$/, "");

      const response = await fetch(`${cleanServerUrl}/train_det_seg`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, project: project.project, taskType, format: "yolo" })
      });

      const result = await response.json();

      if (!result.success) {
        setTrainStatus({ status: "error", message: result.message || "Training failed to start" });
        return;
      }

      pollTrainStatus();
    } catch (err) {
      console.error(err);
      setTrainStatus({ status: "error", message: "Training failed to start" });
    }
  };

  const pollTrainStatus = () => {
    if (pollRef.current) clearInterval(pollRef.current);

    pollRef.current = setInterval(async () => {
      try {
        const cleanServerUrl = SERVER_URL.replace(/\/$/, "");
        const response = await fetch(`${cleanServerUrl}/train_det_seg_status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, project: project.project, taskType })
        });

        const s = await response.json();
        setTrainStatus(s);

        if (s.status === "done" || s.status === "error") {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } catch (err) {
        console.error(err);
        clearInterval(pollRef.current);
        pollRef.current = null;
        setTrainStatus({ status: "error", message: "Connection lost" });
      }
    }, 3000);
  };

  const downloadTrainedModel = async () => {
    try {
      const cleanServerUrl = SERVER_URL.replace(/\/$/, "");
      const response = await fetch(`${cleanServerUrl}/download_det_seg_model`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, project: project.project, taskType })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        alert(errData?.message || "Download failed");
        return;
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${project.project}_${taskType}_yolov8_model.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert("Download failed");
    }
  };

  const startEdgeExport = async () => {
    if (!SERVER_URL || !email) {
      setEdgeStatus({ status: "error", message: "กรุณาตรวจสอบการตั้งค่า Cloud URL และการ Login ของคุณ" });
      return;
    }

    setEdgeStatus({ status: "starting", progress: 0 });

    try {
      const cleanServerUrl = SERVER_URL.replace(/\/$/, "");

      const response = await fetch(`${cleanServerUrl}/export_edge_format`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, project: project.project, taskType, edgeFormat })
      });

      const result = await response.json();

      if (!result.success) {
        setEdgeStatus({ status: "error", message: result.message || "Export failed to start" });
        return;
      }

      pollEdgeStatus();
    } catch (err) {
      console.error(err);
      setEdgeStatus({ status: "error", message: "Export failed to start" });
    }
  };

  const pollEdgeStatus = () => {
    if (edgePollRef.current) clearInterval(edgePollRef.current);

    edgePollRef.current = setInterval(async () => {
      try {
        const cleanServerUrl = SERVER_URL.replace(/\/$/, "");
        const response = await fetch(`${cleanServerUrl}/export_edge_status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, project: project.project, taskType, edgeFormat })
        });

        const s = await response.json();
        setEdgeStatus(s);

        if (s.status === "done" || s.status === "error") {
          clearInterval(edgePollRef.current);
          edgePollRef.current = null;
        }
      } catch (err) {
        console.error(err);
        clearInterval(edgePollRef.current);
        edgePollRef.current = null;
        setEdgeStatus({ status: "error", message: "Connection lost" });
      }
    }, 3000);
  };

  const downloadEdgeModel = async () => {
    try {
      const cleanServerUrl = SERVER_URL.replace(/\/$/, "");
      const response = await fetch(`${cleanServerUrl}/download_edge_model`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, project: project.project, taskType, edgeFormat })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        alert(errData?.message || "Download failed");
        return;
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      // ⬅️ engine format ได้ zip ที่มี onnx+script ไม่ใช่ .engine ตรงๆ
      //    เปลี่ยนชื่อไฟล์ downloadให้สื่อความหมายถูกต้อง
      const downloadSuffix = edgeFormat === "engine" ? "onnx_trt_build_kit" : edgeFormat;
      link.download = `${project.project}_${taskType}_${downloadSuffix}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert("Download failed");
    }
  };

  const handlePrimaryAction = () => {
    if (format === "coco") {
      handleExportCoco();
    } else {
      startTraining();
    }
  };

  return (
    <div style={{ padding: 20, maxWidth: 700, margin: "0 auto" }}>
      <h2 style={{ marginBottom: 4, fontSize: "20px", fontWeight: "700" }}>
        🚀 Train Model
      </h2>
      <p
        style={{
          color: "#555",
          marginBottom: 20,
          fontSize: "20px",
          fontWeight: "700"
        }}
      >
        Project: <b>{project.project}</b>{" "}
        · <span style={{ color: "#0078D7" }}>{taskLabel}</span>
      </p>

      <h4
        style={{
          marginBottom: 10,
          fontSize: "20px",
          fontWeight: "700",
          color: "#222"
        }}
      >
        Select the Model Type
      </h4>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          marginBottom: 20
        }}
      >
        {FORMAT_OPTIONS.map((opt) => {
          const disabled = isExporting || isTrainBusy;
          return (
            <label
              key={opt.value}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                border: format === opt.value ? "2px solid #0078D7" : "1px solid #ddd",
                borderRadius: 10,
                padding: "12px 15px",
                cursor: disabled ? "not-allowed" : "pointer",
                background: format === opt.value ? "#eaf3fc" : "#fff",
                opacity: disabled ? 0.7 : 1
              }}
            >
              <input
                type="radio"
                name="format"
                value={opt.value}
                checked={format === opt.value}
                disabled={disabled}
                onChange={(e) => setFormat(e.target.value)}
              />
              <div>
                <div style={{ fontWeight: 600 }}>{opt.label}</div>
                <div style={{ fontSize: 13, color: "#666" }}>{opt.desc}</div>
              </div>
            </label>
          );
        })}
      </div>

      {format === "coco" && (
        <div
          style={{
            background: "#fff8e1",
            border: "1px solid #ffe082",
            borderRadius: 10,
            padding: "12px 16px",
            color: "#8a6d00",
            marginBottom: 20,
            fontSize: 13,
            lineHeight: 1.6
          }}
        >
          ⚠️ ฟอร์แมต COCO ยังไม่รองรับการเทรนอัตโนมัติ — ปุ่มด้านล่างจะ Export
          ชุดข้อมูลเป็น .zip ให้นำไปเทรนต่อเองด้วยเครื่องมืออื่น
        </div>
      )}

      <button
        onClick={handlePrimaryAction}
        disabled={format === "coco" ? isExporting : isTrainBusy}
        style={{
          backgroundColor: (format === "coco" ? isExporting : isTrainBusy) ? "#9fc4e0" : "#0078D7",
          color: "white",
          padding: "10px 20px",
          border: "none",
          borderRadius: 8,
          fontSize: 15,
          cursor: (format === "coco" ? isExporting : isTrainBusy) ? "not-allowed" : "pointer",
          marginBottom: 20
        }}
      >
        {format === "coco"
          ? (isExporting ? "⌛ กำลัง Export..." : "📦 Export Dataset (COCO)")
          : (isTrainBusy ? "⌛ กำลังเทรน..." : "🚀 Train (YOLOv8)")}
      </button>

      {format === "coco" && exportMsg.text && (
        <div
          style={{
            background: exportMsg.type === "error" ? "#fdecea" : "#eafaf1",
            border: `1px solid ${exportMsg.type === "error" ? "#f5c2c0" : "#a3e4c1"}`,
            borderRadius: 10,
            padding: "10px 15px",
            color: exportMsg.type === "error" ? "#a12622" : "#1e7e4d",
            marginBottom: 20,
            fontSize: 13
          }}
        >
          {exportMsg.text}
        </div>
      )}

      {format === "yolo" && trainStatus.status !== "idle" && (
        <TrainProgressBlock
          status={trainStatus}
          onDownload={downloadTrainedModel}
          isDone={isTrainDone}
          edgeFormat={edgeFormat}
          setEdgeFormat={setEdgeFormat}
          edgeStatus={edgeStatus}
          onStartEdgeExport={startEdgeExport}
          onDownloadEdgeModel={downloadEdgeModel}
        />
      )}

      <div style={{ marginTop: 20 }}>
        <button
          onClick={() => navigate("/projects")}
          style={{
            background: "none",
            border: "none",
            color: "#0078D7",
            cursor: "pointer"
          }}
        >
          ← Go to Projects
        </button>
      </div>
    </div>
  );
}

function TrainProgressBlock({
  status,
  onDownload,
  isDone,
  edgeFormat,
  setEdgeFormat,
  edgeStatus,
  onStartEdgeExport,
  onDownloadEdgeModel
}) {
  if (status.status === "error") {
    return (
      <div
        style={{
          background: "#fdecea",
          border: "1px solid #f5c2c0",
          borderRadius: 10,
          padding: "10px 15px",
          color: "#a12622",
          marginBottom: 20
        }}
      >
        ❌ Training failed: {status.message}
      </div>
    );
  }

  const pct = status.progress || 0;
  const edgeBusy = edgeStatus.status === "starting" || edgeStatus.status === "running";
  const edgeDone = edgeStatus.status === "done";
  const isEngineFormat = edgeFormat === "engine";

  return (
    <div style={{ marginBottom: 20 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 13,
          marginBottom: 5,
          color: "#555"
        }}
      >
        <span>
          {isDone
            ? "✅ Training complete"
            : status.status === "starting"
            ? "⏳ Starting..."
            : "⏳ Training... (YOLOv8 บน CPU อาจใช้เวลาหลายนาที)"}
        </span>
        <span>
          {pct}%
          {status.total_images != null ? ` · ${status.total_images} รูป` : ""}
        </span>
      </div>

      <div
        style={{
          width: "100%",
          height: 10,
          background: "#eee",
          borderRadius: 6,
          overflow: "hidden",
          marginBottom: 15
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: isDone ? "#28a745" : "#0078D7",
            transition: "width 0.4s ease"
          }}
        />
      </div>

      {isDone && (
        <>
          <button
            onClick={onDownload}
            style={{
              backgroundColor: "#28a745",
              color: "white",
              padding: "10px 20px",
              border: "none",
              borderRadius: 8,
              fontSize: 15,
              cursor: "pointer"
            }}
          >
            ⬇️ Download Model (.pt)
          </button>

          {/* ============ 🌐 Export for Edge ============ */}
          <div
            style={{
              marginTop: 20,
              padding: "15px",
              border: "1px solid #ddd",
              borderRadius: 10,
              background: "#fafafa"
            }}
          >
            <h4 style={{ marginBottom: 10, fontSize: 15, fontWeight: 700 }}>
              📱 Export for Edge (Raspberry Pi / Mobile / TPU / Industrial)
            </h4>

            <select
              value={edgeFormat}
              onChange={(e) => setEdgeFormat(e.target.value)}
              disabled={edgeBusy}
              style={{
                marginBottom: 10,
                padding: "8px 10px",
                borderRadius: 6,
                width: "100%",
                border: "1px solid #ccc"
              }}
            >
              {/* ถ้าต้องการใช้ตัดออก disabled={opt.disabled}*/}
              {EDGE_FORMAT_OPTIONS.map((opt) => (
                   <option key={opt.value} value={opt.value} disabled={opt.disabled}> 
                {opt.label}
                </option>
                      ))}
            </select>

            {/* ⚠️ คำเตือนพิเศษเฉพาะ TensorRT เพราะ build ข้ามเครื่องไม่ได้ */}
            {isEngineFormat && (
              <div
                style={{
                  background: "#fff8e1",
                  border: "1px solid #ffe082",
                  borderRadius: 8,
                  padding: "10px 12px",
                  color: "#8a6d00",
                  marginBottom: 10,
                  fontSize: 12,
                  lineHeight: 1.6
                }}
              >
                ⚠️ TensorRT engine ต้อง build บนบอร์ด Jetson จริงเท่านั้น
                (build ข้ามเครื่องไม่ได้) ปุ่มนี้จะให้ไฟล์ ONNX + สคริปต์
                สำหรับไปรันบนบอร์ด Jetson ของคุณเอง ไม่ใช่ไฟล์ .engine
                สำเร็จรูปเหมือน format อื่น
              </div>
            )}

            <button
              onClick={onStartEdgeExport}
              disabled={edgeBusy}
              style={{
                backgroundColor: edgeBusy ? "#c9b3e6" : "#6f42c1",
                color: "white",
                padding: "10px 20px",
                border: "none",
                borderRadius: 8,
                fontSize: 14,
                cursor: edgeBusy ? "not-allowed" : "pointer",
                width: "100%"
              }}
            >
              {edgeBusy
                ? `⌛ กำลัง Export (${edgeStatus.progress || 0}%)...`
                : "🚀 Export for Edge"}
            </button>

            {edgeStatus.status === "error" && (
              <div style={{ color: "#a12622", marginTop: 8, fontSize: 13 }}>
                ❌ {edgeStatus.message}
              </div>
            )}

            {edgeDone && (
              <button
                onClick={onDownloadEdgeModel}
                style={{
                  backgroundColor: "#6f42c1",
                  color: "white",
                  padding: "10px 20px",
                  border: "none",
                  borderRadius: 8,
                  fontSize: 14,
                  cursor: "pointer",
                  marginTop: 10,
                  width: "100%"
                }}
              >
                ⬇️ Download {isEngineFormat ? "ONNX + TensorRT Build Script" : `${edgeFormat.toUpperCase()} Model`}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}