import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
 

// ==========================================================
// Training Task Registry
// ==========================================================
// เพิ่มประเภทงานใหม่ในอนาคต (เช่น segmentation ที่รอข้อมูล/โมเดลจริง)
// แค่เพิ่ม entry ที่นี่ที่เดียว ไม่ต้องแก้ logic หรือ UI ด้านล่าง
//
// implemented: false  -> หน้าจะโชว์ข้อความ "ยังไม่พร้อมใช้งาน" อัตโนมัติ
// implemented: true   -> ต้องมี formats อย่างน้อย 1 ตัว ถึงจะ train ได้จริง
  const SERVER_URL = localStorage.getItem("cloud_url");
// ==========================================================
const TRAINING_TASKS = {
  classification: {
    label: "Image Classification",
    implemented: true,
    formats: [
      {
        value: "tflite",
        label: "TensorFlow Lite (.tflite)",
        desc: "Best for Android, iOS, Raspberry Pi, and edge AI devices."
      },
      {
        value: "onnx",
        label: "ONNX",
        desc: "Best for cross-platform deployment with broad hardware support."
      },
      {
        value: "tfjs",
        label: "TensorFlow.js",
        desc: "Best for browser-based AI applications and Node.js environments."
      }
    ]
  },
  object_detection: {
    label: "Object Detection",
    implemented: false, // 🚧 ยังไม่มี logic/ข้อมูล training จริง
    formats: []
  },
  segmentation: {
    label: "Segmentation",
    implemented: false, // 🚧 แผนในอนาคต
    formats: []
  }
};

const DEFAULT_TASK = "classification";

export default function SelectTraining() {
  const location = useLocation();
  const navigate = useNavigate();

  // รับ project มาจากหน้า Projects (ผ่าน navigate state)
  // ถ้าไม่มี (เช่น refresh หน้า) ให้ fallback ไปดึงจาก localStorage
  const project =
    location.state?.project ||
    JSON.parse(localStorage.getItem("selected_project") || "null");

  const email = localStorage.getItem("email");

  // ✅ ถ้า project ยังไม่มีฟิลด์ type (ยังไม่ได้ implement ฝั่งสร้าง project)
  // จะ fallback เป็น classification โดยอัตโนมัติ ไม่พัง
  const taskType = project?.type || DEFAULT_TASK;
  const task = TRAINING_TASKS[taskType] || TRAINING_TASKS[DEFAULT_TASK];

  const [format, setFormat] = useState(task.formats[0]?.value || "");
  const [status, setStatus] = useState({ status: "idle", progress: 0 });
  const pollRef = useRef(null);

  useEffect(() => {
    if (project) {
      localStorage.setItem("selected_project", JSON.stringify(project));
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [project]);

  if (!project) {
    return (
      <div style={{ padding: 20 }}>
        <h2>Project Not Found</h2>
        <p>
          The selected project could not be found. Please go back to the
          Projects page and select a project again.
        </p>
        <button onClick={() => navigate("/projects")}>
          ← Back to Projects
        </button>
      </div>
    );
  }

  // ==========================================================
  // 🚧 ประเภทงานที่ยังไม่รองรับ (Object Detection / Segmentation ตอนนี้)
  // ==========================================================
  if (!task.implemented) {
    return (
      <div style={{ padding: 20, maxWidth: 700, margin: "0 auto" }}>
        <h2 style={{ marginBottom: 4, fontSize: 20, fontWeight: 700 }}>
          🚀 Train Model
        </h2>
        <p
          style={{
            color: "#555",
            marginBottom: 20,
            fontSize: 20,
            fontWeight: 700
          }}
        >
          Project: <b>{project.project}</b>
        </p>

        <div
          style={{
            background: "#fff8e1",
            border: "1px solid #ffe082",
            borderRadius: 10,
            padding: "16px 20px",
            color: "#8a6d00"
          }}
        >
          <b>{task.label}</b> training is not available yet.
          <br />
          This task type is still under development — please check back
          later.
        </div>

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

  const isBusy = status.status === "starting" || status.status === "running";
  const isDone = status.status === "done";

  // ==========================================================
  // Start Training
  // ==========================================================
  const startTraining = async () => {
    try {
      setStatus({ status: "starting", progress: 0 });

      const response = await fetch(`${SERVER_URL}/train_project`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          project: project.project,
          format, // 'tfjs' | 'tflite' | 'onnx'
          taskType // 'classification' | 'object_detection' | 'segmentation'
        })
      });

      const result = await response.json();

      if (!result.success) {
        setStatus({
          status: "error",
          message: result.message || "Training failed to start"
        });
        return;
      }

      pollStatus();
    } catch (err) {
      console.error(err);
      setStatus({ status: "error", message: "Training failed to start" });
    }
  };

  // ==========================================================
  // Poll Status
  // ==========================================================
  const pollStatus = () => {
    if (pollRef.current) clearInterval(pollRef.current);

    pollRef.current = setInterval(async () => {
      try {
        const response = await fetch(`${SERVER_URL}/train_status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, project: project.project })
        });

        const s = await response.json();
        setStatus(s);

        if (s.status === "done" || s.status === "error") {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } catch (err) {
        console.error(err);
        clearInterval(pollRef.current);
        pollRef.current = null;
        setStatus({ status: "error", message: "Connection lost" });
      }
    }, 3000);
  };

  // ==========================================================
  // Download Model (zip)
  // ==========================================================
  const downloadModel = async () => {
    try {
      const response = await fetch(`${SERVER_URL}/download_model`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, project: project.project, format })
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
      link.download = `${project.project}_${format}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert("Download failed");
    }
  };

  // ==========================================================
  // Render
  // ==========================================================
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
        · <span style={{ color: "#0078D7" }}>{task.label}</span>
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
        {task.formats.map((opt) => {
          const optDisabled = isBusy || opt.disabled;
          return (
            <label
              key={opt.value}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                border:
                  format === opt.value
                    ? "2px solid #0078D7"
                    : "1px solid #ddd",
                borderRadius: 10,
                padding: "12px 15px",
                cursor: optDisabled ? "not-allowed" : "pointer",
                background: opt.disabled
                  ? "#f5f5f5"
                  : format === opt.value
                  ? "#eaf3fc"
                  : "#fff",
                opacity: opt.disabled ? 0.6 : 1
              }}
            >
              <input
                type="radio"
                name="format"
                value={opt.value}
                checked={format === opt.value}
                disabled={optDisabled}
                onChange={(e) => setFormat(e.target.value)}
              />
              <div>
                <div style={{ fontWeight: 600, display: "flex", gap: 8 }}>
                  {opt.label}
                  {opt.disabled && (
                    <span
                      style={{
                        fontSize: 11,
                        color: "#fff",
                        background: "#aaa",
                        borderRadius: 6,
                        padding: "2px 8px"
                      }}
                    >
                      {opt.disabledNote}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 13, color: "#666" }}>{opt.desc}</div>
              </div>
            </label>
          );
        })}
      </div>

      <button
        onClick={startTraining}
        disabled={isBusy}
        style={{
          backgroundColor: isBusy ? "#9fc4e0" : "#0078D7",
          color: "white",
          padding: "10px 20px",
          border: "none",
          borderRadius: 8,
          fontSize: 15,
          cursor: isBusy ? "not-allowed" : "pointer",
          marginBottom: 20
        }}
      >
        {isBusy ? "Training..." : "Train"}
      </button>

      {status.status !== "idle" && (
        <ProgressBlock
          status={status}
          onDownload={downloadModel}
          isDone={isDone}
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

function ProgressBlock({ status, onDownload, isDone }) {
  if (status.status === "error") {
    return (
      <div
        style={{
          background: "#fdecea",
          border: "1px solid #f5c2c0",
          borderRadius: 10,
          padding: "10px 15px",
          color: "#a12622"
        }}
      >
        ❌ Training failed: {status.message}
      </div>
    );
  }

  const pct = status.progress || 0;

  return (
    <div>
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
            : "⏳ Training..."}
        </span>
        <span>
          {pct}%
          {status.accuracy != null
            ? ` · acc: ${(status.accuracy * 100).toFixed(1)}%`
            : ""}
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
          ⬇️ Download Model
        </button>
      )}
    </div>
  );
}