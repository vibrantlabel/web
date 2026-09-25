import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

// ==========================================================
// Export/Train Format Registry (Object Detection / Segmentation)
// ==========================================================
const FORMAT_OPTIONS = [
  {
    value: "yolo",
    label: "YOLO format (.txt) — เทรนจริงได้",
    desc: "เทรนโมเดล YOLOv8 จริงบน Server GPU "
  },
  {
    value: "yolo_export",
    label: "YOLO format (.txt) — Export เท่านั้น",
    desc: "ส่งออกเป็น .zip (รูปภาพ + labels/*.txt + data.yaml) พร้อมโครงสร้างมาตรฐาน YOLOv8 — นำไปเทรนเองที่เครื่องอื่นหรือ Colab ได้ทันที "
  },
  {
    value: "coco",
    label: "COCO format (.json) — Export เท่านั้น",
    desc: "ได้ไฟล์ .zip (รูปภาพ + annotations.json) ไปเทรนเองด้วย Detectron2/MMDetection"
  },
  {
    value: "csv",
    label: "CSV (Annotations + Image Links) — Export เท่านั้น",
    desc: "ส่งออก annotation พร้อมลิงก์รูปภาพ (image_url/gcs_uri) และพิกัด normalized 0-1 — นำไปเทรนต่อภายนอกได้ "
  },
   {
    value: "qwen2vl",
    label: "Qwen2-VL Fine-tune (Vision-Language)",
    desc: "ส่งออกเป็น dataset แบบ conversation (image + label + description) เทรนโมเดลให้บรรยาย/ตอบคำถามเกี่ยวกับภาพได้ ไม่ใช่แค่ตรวจจับตำแหน่ง"
  }
];

const EDGE_FORMAT_OPTIONS = [
  {
    value: "onnx",
    label: "ONNX — Raspberry Pi / PC ทั่วไป",
    desc: "รันได้กว้างที่สุด ใช้กับ Python (onnxruntime), C++, .NET หรือเซิร์ฟเวอร์ทั่วไปที่ไม่มี GPU ก็รันได้"
  },
  {
    value: "tflite",
    label: "TFLite — Coral TPU / Mobile (Android)",
    desc: "เหมาะกับแอปมือถือ Android หรืออุปกรณ์ Edge TPU (Google Coral) ไฟล์เล็ก ประมวลผลเร็วบนอุปกรณ์พกพา"
  },
  {
    value: "tfjs",
    label: "TF.js — เว็บเบราว์เซอร์ / Node.js",
    desc: "รันตรงในเว็บเบราว์เซอร์ได้เลยโดยไม่ต้องมี backend server หรือใช้กับ Node.js ฝั่งเซิร์ฟเวอร์ก็ได้"
  }
];

const EDGE_FORMAT_DISPLAY_NAMES = {
  onnx: "ONNX",
  tflite: "TFLite",
  tfjs: "TensorFlow.js"
};

const PLAN_TRAINING_CONFIG = {
  Free:       { monthlyQuota: 1,        overagePrice: null },
  Starter:    { monthlyQuota: 10,       overagePrice: 1.99 },
  Pro:        { monthlyQuota: 30,       overagePrice: 1.79 },
  Business:   { monthlyQuota: 80,       overagePrice: 1.49 },
  Enterprise: { monthlyQuota: Infinity, overagePrice: 0 }
};

function getCurrentPlan() {
  return localStorage.getItem("selected_plan") || "Free";
}

// ==========================================================
// 🔧 ค่าคงที่สำหรับการเชื่อมต่อ
// ==========================================================
// poll ล้มเหลวติดต่อกันกี่ครั้งถึงจะเปลี่ยนจาก "retrying" เป็น "lost"
// (ไม่หยุด poll แล้ว แค่เปลี่ยนข้อความ banner และลดความถี่ลง)
const MAX_CONSECUTIVE_POLL_FAILS = 5;
const POLL_INTERVAL_MS = 3000;
const RECONNECT_POLL_INTERVAL_MS = 10000;
// fetch ไม่มี timeout ในตัว ถ้าเน็ตหลุดกลางทาง request อาจค้างนานหลายนาที
const REQUEST_TIMEOUT_MS = 10000;
const START_REQUEST_TIMEOUT_MS = 30000;
// ถ้าคำสั่งเริ่มเทรนไม่ได้รับคำตอบ (เน็ตหลุด) จะรอให้ server แสดงงานเทรนภายในเวลานี้
const START_CONFIRM_GRACE_MS = 20000;

// 🔧 fetch ที่มี timeout — ตัด request ที่ค้างจากเน็ตหลุดให้กลายเป็น error ทันที
async function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// 🔧 สถานะ HTTP ที่ถือว่าเป็นปัญหาชั่วคราว (ควรลองใหม่ ไม่ใช่ผลลัพธ์จริงจาก server)
function isTransientHttpStatus(code) {
  return code === 429 || code === 502 || code === 503 || code === 504;
}

// ==========================================================
// 🔧 resolve URL ของแต่ละ service ผ่าน /app_config
// เดิม: ถ้าเรียกไม่สำเร็จ (เช่นเน็ตหลุดพอดี) จะ cache ค่า null ไว้ตลอด session
// ทำให้ทุก request หลังจากนั้นไปผิด server จนกว่าจะ reload หน้า
// ใหม่: cache เฉพาะตอนเรียกสำเร็จเท่านั้น ถ้าล้มเหลวจะลองใหม่ในครั้งถัดไป
// ==========================================================
let cachedExportServiceUrl;

async function resolveExportServerUrl(trainServerUrl) {
  if (cachedExportServiceUrl !== undefined) return cachedExportServiceUrl;
  try {
    const cleanUrl = trainServerUrl.replace(/\/$/, "");
    const res = await fetchWithTimeout(`${cleanUrl}/app_config`);
    const data = await res.json();
    cachedExportServiceUrl = data?.export_service_url || null;
    return cachedExportServiceUrl;
  } catch (err) {
    console.error("Failed to fetch export service config:", err);
    return null;
  }
}

async function getExportServerUrl(trainServerUrl) {
  const dedicated = await resolveExportServerUrl(trainServerUrl);
  return dedicated || trainServerUrl;
}

let cachedTrainServiceUrl;

async function resolveTrainServerUrl(cloudUrl) {
  if (cachedTrainServiceUrl !== undefined) return cachedTrainServiceUrl;
  try {
    const cleanUrl = cloudUrl.replace(/\/$/, "");
    const res = await fetchWithTimeout(`${cleanUrl}/app_config`);
    const data = await res.json();
    cachedTrainServiceUrl = data?.train_service_url || null;
    return cachedTrainServiceUrl;
  } catch (err) {
    console.error("Failed to fetch train service config:", err);
    return null;
  }
}

async function getTrainServerUrl(cloudUrl) {
  const dedicated = await resolveTrainServerUrl(cloudUrl);
  return dedicated || cloudUrl;
}

// ==========================================================
// URL ของ qwen2vl_service (orchestrator) — resolve ผ่าน /app_config
// ==========================================================
let cachedQwen2vlServiceUrl;

async function resolveQwen2vlServiceUrl(baseUrl) {
  if (cachedQwen2vlServiceUrl !== undefined) return cachedQwen2vlServiceUrl;
  try {
    const cleanUrl = baseUrl.replace(/\/$/, "");
    const res = await fetchWithTimeout(`${cleanUrl}/app_config`);
    const data = await res.json();
    cachedQwen2vlServiceUrl = data?.qwen2vl_service_url || null;
    return cachedQwen2vlServiceUrl;
  } catch (err) {
    console.error("Failed to fetch qwen2vl service config:", err);
    return null;
  }
}

async function getQwen2vlServiceUrl(baseUrl) {
  const dedicated = await resolveQwen2vlServiceUrl(baseUrl);
  return dedicated || baseUrl;
}

function formatDuration(totalSeconds) {
  if (totalSeconds == null || isNaN(totalSeconds)) return "-";
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m === 0) return `${sec} วินาที`;
  return `${m} นาที ${sec} วินาที`;
}

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

  const DEFAULT_IMGSZ = 640;

  const getProjectTargetImgsz = () => {
    try {
      const key = `resolution_target_${project.project}`;
      const saved = Number(JSON.parse(localStorage.getItem(key) || "null"));
      if (Number.isFinite(saved) && saved > 0) return Math.round(saved);
    } catch {
      // เผื่อยังไม่เคยตั้งค่าไว้ที่หน้า DetectionCapture -> ใช้ค่าเริ่มต้น
    }
    return DEFAULT_IMGSZ;
  };

  const [format, setFormat] = useState("yolo");

  const [isExporting, setIsExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState({ type: "", text: "" });

  const [trainStatus, setTrainStatus] = useState({ status: "idle", progress: 0 });
  const pollRef = useRef(null);

  const clientStartRef = useRef(null);
  const tickRef = useRef(null);
  const [localElapsed, setLocalElapsed] = useState(null);

  // 🔧 สถานะการเชื่อมต่อระหว่างเทรน: "ok" | "retrying" | "lost"
  // - retrying: poll ล้มเหลวไม่กี่ครั้ง (เน็ตกระตุก)
  // - lost: ล้มเหลวติดต่อกันนาน แต่ยังคง poll ต่อทุก 10 วิ และจะ resume เองเมื่อเน็ตกลับมา
  const pollFailCountRef = useRef(0);
  const [connectionState, setConnectionState] = useState("ok");
  // กันไม่ให้มี poll วิ่งซ้อนกันหลายตัวพร้อมกัน
  const pollInFlightRef = useRef(false);
  // 🔧 คำสั่งเริ่มเทรนส่งออกไปแล้วแต่ไม่ได้รับคำตอบ (เน็ตหลุดตอนกด Train)
  const startUnconfirmedRef = useRef(false);
  const startGraceUntilRef = useRef(0);
  // 🔧 กันไม่ให้ poll ตั้งรอบใหม่หลังจากออกจากหน้านี้ไปแล้ว
  const isMountedRef = useRef(true);

  const [edgeFormat, setEdgeFormat] = useState("onnx");
  const [edgeStatus, setEdgeStatus] = useState({ status: "idle", progress: 0 });
  const edgePollRef = useRef(null);

  const [isCheckingModel, setIsCheckingModel] = useState(true);
  const [isDownloadingModel, setIsDownloadingModel] = useState(false);
  const [isDownloadingEdge, setIsDownloadingEdge] = useState(false);

  const [lastTrainingMeta, setLastTrainingMeta] = useState(null);

  // state สำหรับ Qwen2-VL fine-tune (แยกจาก YOLO training)
  const [qwen2vlStatus, setQwen2vlStatus] = useState({ status: "idle", progress: 0 });
  const qwen2vlPollRef = useRef(null);
  const [isDownloadingQwen2VL, setIsDownloadingQwen2VL] = useState(false);

  const currentPlan = getCurrentPlan();
  const quotaConfig = PLAN_TRAINING_CONFIG[currentPlan] || PLAN_TRAINING_CONFIG.Free;
  const [usedThisMonth, setUsedThisMonth] = useState(null);
  const [isCheckingQuota, setIsCheckingQuota] = useState(true);

  const remainingQuota =
    usedThisMonth == null || !Number.isFinite(quotaConfig.monthlyQuota)
      ? null
      : Math.max(0, quotaConfig.monthlyQuota - usedThisMonth);
  const isOverQuota = remainingQuota !== null && remainingQuota <= 0;

  // 🔧 ย้ายขึ้นมาไว้ก่อน early return เพื่อให้ hooks ทุกตัวถูกเรียกครบทุกครั้ง
  const isTrainBusy = trainStatus.status === "starting" || trainStatus.status === "running";
  const isTrainDone = trainStatus.status === "done";

  const qwen2vlBusy = qwen2vlStatus.status === "starting" || qwen2vlStatus.status === "running";
  const qwen2vlDone = qwen2vlStatus.status === "done";

  // ==========================================================
  // 🔧 ตัวจับเวลาฝั่ง client
  // ==========================================================
  const stopTick = () => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  };

  const ensureTickRunning = () => {
    if (tickRef.current) return;
    if (clientStartRef.current == null) clientStartRef.current = Date.now();
    tickRef.current = setInterval(() => {
      setLocalElapsed(Math.floor((Date.now() - clientStartRef.current) / 1000));
    }, 1000);
  };

  // sync เวลาให้ตรงกับ server ทุกครั้งที่ได้สถานะใหม่ (สำคัญหลังเน็ตหลุดนานๆ)
  const syncElapsedFromServer = (s) => {
    if (s?.elapsed_seconds == null) return;
    clientStartRef.current = Date.now() - s.elapsed_seconds * 1000;
    setLocalElapsed(s.elapsed_seconds);
  };

  // ==========================================================
  // 🔧 ดึงสถานะเทรนจาก server (มี timeout และแยก error ชั่วคราวออกมา)
  // ==========================================================
  const fetchTrainStatus = async () => {
    const trainServerUrl = await getTrainServerUrl(SERVER_URL);
    const cleanServerUrl = trainServerUrl.replace(/\/$/, "");
    const response = await fetchWithTimeout(`${cleanServerUrl}/train_det_seg_status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, project: project.project, taskType })
    });
    if (isTransientHttpStatus(response.status)) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.json();
  };

  // ==========================================================
  // 🔧 จัดการสถานะที่ได้จาก server — คืนค่า true ถ้าต้อง poll ต่อ
  // ==========================================================
  const handleServerStatus = (s) => {
    pollFailCountRef.current = 0;
    setConnectionState("ok");

    const active = s.status === "starting" || s.status === "running";

    if (active) {
      if (startUnconfirmedRef.current) {
        // ยืนยันได้แล้วว่า server ได้รับคำสั่งเทรนจริง
        startUnconfirmedRef.current = false;
        setUsedThisMonth((prev) => (prev == null ? 1 : prev + 1));
      }
      syncElapsedFromServer(s);
      ensureTickRunning();
      setTrainStatus(s);
      return true;
    }

    if (s.status === "done" || s.status === "error") {
      startUnconfirmedRef.current = false;
      stopTick();
      setTrainStatus(s);
      return false;
    }

    // สถานะอื่น (เช่น idle)
    if (startUnconfirmedRef.current) {
      if (Date.now() < startGraceUntilRef.current) {
        return true; // รอให้ server แสดงงานเทรนก่อน คงสถานะ "starting" ไว้
      }
      // เลยเวลารอแล้ว server ยังไม่มีงานเทรน -> คำสั่งเทรนไปไม่ถึง server จริง
      startUnconfirmedRef.current = false;
      stopTick();
      setTrainStatus({
        status: "error",
        message: "ไม่พบงานเทรนบน Server (คำสั่งเทรนอาจไปไม่ถึงตอนเน็ตหลุด) กรุณากด Train อีกครั้ง"
      });
      return false;
    }

    setTrainStatus(s);
    return true;
  };

  // ==========================================================
  // 🔧 poll สถานะเทรนแบบ self-scheduling (setTimeout ทีละรอบ)
  //
  // เดิม: ล้มเหลวครบ 5 ครั้ง (~15 วิ) -> ตั้ง status เป็น error "Connection lost"
  // แล้ว "หยุด poll ถาวร" ต่อให้เน็ตกลับมาแล้ว หน้าเว็บก็ไม่รู้ ผู้ใช้ต้องกด Train ซ้ำ
  //
  // ใหม่: ไม่หยุด poll เพราะเน็ตหลุดอีกต่อไป คงสถานะ running ไว้ แค่ลดความถี่
  // เป็นทุก 10 วิ และเปลี่ยนข้อความ banner พอเน็ตกลับมา poll รอบถัดไปจะได้สถานะ
  // จริงจาก server แล้วแสดงความคืบหน้าต่อทันทีโดยไม่ต้องกดอะไร
  // poll จะหยุดเฉพาะเมื่อ server ตอบกลับว่า done หรือ error เท่านั้น
  // ==========================================================
  const pollTrainStatus = (initialDelay = POLL_INTERVAL_MS) => {
    if (pollRef.current) clearTimeout(pollRef.current);

    const tick = async () => {
      pollRef.current = null;
      if (!isMountedRef.current) return;

      if (pollInFlightRef.current) {
        pollRef.current = setTimeout(tick, POLL_INTERVAL_MS);
        return;
      }

      pollInFlightRef.current = true;
      let keepPolling = true;
      try {
        const s = await fetchTrainStatus();
        if (!isMountedRef.current) return;
        keepPolling = handleServerStatus(s);
      } catch (err) {
        pollFailCountRef.current += 1;
        console.warn(`Poll เชื่อมต่อไม่สำเร็จ (ครั้งที่ ${pollFailCountRef.current}):`, err);
        setConnectionState(
          pollFailCountRef.current >= MAX_CONSECUTIVE_POLL_FAILS ? "lost" : "retrying"
        );
      } finally {
        pollInFlightRef.current = false;
      }

      if (!keepPolling || !isMountedRef.current) return;

      const delay =
        pollFailCountRef.current >= MAX_CONSECUTIVE_POLL_FAILS
          ? RECONNECT_POLL_INTERVAL_MS
          : POLL_INTERVAL_MS;
      pollRef.current = setTimeout(tick, delay);
    };

    pollRef.current = setTimeout(tick, initialDelay);
  };

  // sync UI ให้ตรงกับงานเทรนที่กำลังทำงานอยู่จริงบน server แล้วเริ่ม poll ต่อ
  const resumeTrackingActiveTraining = (s) => {
    pollFailCountRef.current = 0;
    setConnectionState("ok");
    setTrainStatus(s);

    stopTick();
    const startingElapsed = s.elapsed_seconds ?? 0;
    clientStartRef.current = Date.now() - startingElapsed * 1000;
    setLocalElapsed(startingElapsed);
    ensureTickRunning();

    pollTrainStatus();
  };

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (project) {
      localStorage.setItem("selected_det_seg_project", JSON.stringify(project));
    }
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
      if (edgePollRef.current) clearInterval(edgePollRef.current);
      if (qwen2vlPollRef.current) clearInterval(qwen2vlPollRef.current);
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [project]);

  useEffect(() => {
    if (!project || !SERVER_URL || !email) {
      setIsCheckingQuota(false);
      return;
    }

    let cancelled = false;

    (async () => {
      setIsCheckingQuota(true);
      try {
        const trainServerUrl = await getTrainServerUrl(SERVER_URL);
        const cleanServerUrl = trainServerUrl.replace(/\/$/, "");

        const response = await fetchWithTimeout(`${cleanServerUrl}/get_training_usage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email })
        });

        const result = await response.json();
        if (!cancelled && result.success && typeof result.usedThisMonth === "number") {
          setUsedThisMonth(result.usedThisMonth);
        }
      } catch (err) {
        console.warn("Failed to fetch training usage (quota check skipped):", err);
      } finally {
        if (!cancelled) setIsCheckingQuota(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project]);

  useEffect(() => {
    if (!project || !SERVER_URL || !email) {
      setIsCheckingModel(false);
      return;
    }

    let cancelled = false;

    (async () => {
      setIsCheckingModel(true);

      try {
        const trainServerUrl = await getTrainServerUrl(SERVER_URL);
        const cleanServerUrl = trainServerUrl.replace(/\/$/, "");

        const response = await fetchWithTimeout(`${cleanServerUrl}/check_trained_model`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, project: project.project })
        });

        const result = await response.json();
        if (!cancelled && result.success && result.exists) {
          // ถ้ามีงานเทรนรอบใหม่กำลังทำงานอยู่ ไม่ต้องทับด้วยสถานะ "done" ของรอบเก่า
          setTrainStatus((prev) =>
            prev.status === "starting" || prev.status === "running"
              ? prev
              : { status: "done", progress: 100, classes: result.classes || [] }
          );

          if (result.training_meta) {
            setLastTrainingMeta(result.training_meta);
          }
        }
      } catch (err) {
        console.error("Check trained model failed:", err);
      } finally {
        if (!cancelled) setIsCheckingModel(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project]);

  // ==========================================================
  // เช็คสถานะการเทรนที่กำลังทำงานอยู่จริงทุกครั้งที่เข้า/reload หน้านี้
  // ถ้าพบว่ายัง running/starting อยู่ -> sync สถานะกลับมาแสดงต่อทันที
  // ==========================================================
  useEffect(() => {
    if (!project || !SERVER_URL || !email) return;

    let cancelled = false;

    (async () => {
      try {
        const s = await fetchTrainStatus();
        if (!cancelled && (s.status === "starting" || s.status === "running")) {
          resumeTrackingActiveTraining(s);
        }
      } catch (err) {
        console.warn("Failed to check active training status on load:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project]);

  // ==========================================================
  // 🔧 เช็คสถานะทันทีเมื่อ (1) กลับมาที่แท็บนี้ หรือ (2) เบราว์เซอร์แจ้งว่าเน็ตกลับมาแล้ว
  // ไม่ต้องรอรอบ poll ถัดไปที่อาจห่างถึง 10 วิ (หรือนานกว่านั้นถ้าแท็บถูก throttle)
  // pollTrainStatus มีการ์ด pollInFlightRef อยู่แล้ว จึงไม่ยิงซ้อนกับรอบปกติ
  // ==========================================================
  useEffect(() => {
    const recheckNow = () => {
      if (document.visibilityState === "visible" && isTrainBusy) {
        pollTrainStatus(0);
      }
    };
    document.addEventListener("visibilitychange", recheckNow);
    window.addEventListener("online", recheckNow);
    return () => {
      document.removeEventListener("visibilitychange", recheckNow);
      window.removeEventListener("online", recheckNow);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTrainBusy]);

  // 🔧 early return ย้ายมาไว้หลัง hooks ทั้งหมด (เดิมอยู่ก่อน useEffect ของ visibilitychange
  // ซึ่งผิดกฎ Rules of Hooks)
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

  const handleExportCsv = async () => {
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
        body: JSON.stringify({ email, project: project.project, taskType, format: "csv" })
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
      link.download = `${project.project}_${taskType}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      setExportMsg({ type: "success", text: `✅ Export สำเร็จ! ดาวน์โหลดไฟล์ ${project.project}_${taskType}.csv แล้ว` });
    } catch (err) {
      console.error(err);
      setExportMsg({ type: "error", text: "ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาตรวจสอบ Network ของคุณ" });
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportYolo = async () => {
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
        body: JSON.stringify({ email, project: project.project, taskType, format: "yolo_export" })
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
      link.download = `${project.project}_${taskType}_yolo.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      setExportMsg({ type: "success", text: `✅ Export สำเร็จ! ดาวน์โหลดไฟล์ ${project.project}_${taskType}_yolo.zip แล้ว` });
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

    // กันเทรนซ้ำซ้อน: ถาม backend ก่อนเสมอว่ามีงานเทรนของ project นี้ทำงานอยู่แล้วไหม
    try {
      const currentStatus = await fetchTrainStatus();

      if (currentStatus.status === "starting" || currentStatus.status === "running") {
        alert(
          "ตรวจพบว่ามีการเทรนของโปรเจกต์นี้กำลังทำงานอยู่บน Server แล้ว " +
          "(อาจเป็นรอบก่อนหน้าที่เน็ตหลุดระหว่างทาง แต่ Server ยังเทรนต่อไปโดยไม่หยุด)\n\n" +
          "ระบบจะแสดงความคืบหน้าปัจจุบันของงานที่ค้างอยู่แทน แทนที่จะเริ่มเทรนใหม่ซ้ำซ้อน"
        );
        resumeTrackingActiveTraining(currentStatus);
        return;
      }
    } catch (err) {
      console.warn("Pre-check training status failed:", err);
      alert("ไม่สามารถตรวจสอบสถานะการเทรนปัจจุบันจาก Server ได้ กรุณาตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง");
      return;
    }

    if (isOverQuota) {
      if (quotaConfig.overagePrice === null) {
        const msg =
          quotaConfig.monthlyQuota === 0
            ? `แผน ${currentPlan} ไม่รวมสิทธิ์เทรนโมเดล\nกรุณาอัปเกรดเป็น Starter ขึ้นไปเพื่อเทรน`
            : `คุณใช้โควตาการเทรนของแผน ${currentPlan} ครบ ${quotaConfig.monthlyQuota} ครั้งในเดือนนี้แล้ว\nกรุณาอัปเกรดแผนเพื่อเทรนต่อ`;
        alert(msg);
        return;
      }

      const confirmed = window.confirm(
        `คุณใช้โควตาการเทรนฟรีของแผน ${currentPlan} ครบแล้ว (${quotaConfig.monthlyQuota} ครั้ง/เดือน)\n` +
        `การเทรนครั้งนี้จะถูกเรียกเก็บเงินเพิ่ม $${quotaConfig.overagePrice.toFixed(2)}\n\n` +
        `ต้องการดำเนินการต่อหรือไม่?`
      );
      if (!confirmed) return;
    }

    setEdgeStatus({ status: "idle", progress: 0 });
    if (edgePollRef.current) {
      clearInterval(edgePollRef.current);
      edgePollRef.current = null;
    }

    setLastTrainingMeta(null);
    pollFailCountRef.current = 0;
    setConnectionState("ok");
    startUnconfirmedRef.current = false;
    startGraceUntilRef.current = 0;
    setTrainStatus({ status: "starting", progress: 0 });

    stopTick();
    clientStartRef.current = Date.now();
    setLocalElapsed(0);
    ensureTickRunning();

    try {
      const trainServerUrl = await getTrainServerUrl(SERVER_URL);
      const cleanServerUrl = trainServerUrl.replace(/\/$/, "");

      const response = await fetchWithTimeout(
        `${cleanServerUrl}/train_det_seg`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            project: project.project,
            taskType,
            format: "yolo",
            imgsz: getProjectTargetImgsz()
          })
        },
        START_REQUEST_TIMEOUT_MS
      );

      if (isTransientHttpStatus(response.status)) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();

      if (!result.success) {
        stopTick();
        setTrainStatus({ status: "error", message: result.message || "Training failed to start" });
        return;
      }

      setUsedThisMonth((prev) => (prev == null ? 1 : prev + 1));
      pollTrainStatus(0);
    } catch (err) {
      // 🔧 เดิม: เน็ตหลุดตอนส่งคำสั่งเทรน -> แสดง "Training failed to start" ทันที
      // ทั้งที่ server อาจได้รับคำสั่งและเริ่มเทรนไปแล้ว
      // ใหม่: ไม่สรุปว่าล้มเหลว แต่ถามสถานะจริงจาก server แทน ถ้า server มีงานเทรน
      // จะแสดงความคืบหน้าต่อ ถ้าไม่มีภายในเวลารอ จึงค่อยแจ้งให้กด Train ใหม่
      console.warn("ไม่ได้รับคำตอบจากคำสั่งเริ่มเทรน กำลังตรวจสอบสถานะจริงจาก Server:", err);
      startUnconfirmedRef.current = true;
      startGraceUntilRef.current = Date.now() + START_CONFIRM_GRACE_MS;
      setConnectionState("retrying");
      pollTrainStatus(0);
    }
  };

  const downloadTrainedModel = async () => {
    setIsDownloadingModel(true);
    try {
      const trainServerUrl = await getTrainServerUrl(SERVER_URL);
      const cleanServerUrl = trainServerUrl.replace(/\/$/, "");
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
    } finally {
      setIsDownloadingModel(false);
    }
  };

  // ==========================================================
  // Qwen2-VL fine-tune — trigger/poll/download
  // ==========================================================
  const startQwen2VLTraining = async () => {
    if (!SERVER_URL || !email) {
      setQwen2vlStatus({ status: "error", message: "กรุณาตรวจสอบการตั้งค่า Cloud URL และการ Login ของคุณ" });
      return;
    }

    setQwen2vlStatus({ status: "starting", progress: 0 });

    try {
      const qwen2vlServerUrl = await getQwen2vlServiceUrl(SERVER_URL);
      const cleanServerUrl = qwen2vlServerUrl.replace(/\/$/, "");

      const response = await fetch(`${cleanServerUrl}/train_qwen2vl`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, project: project.project })
      });

      const result = await response.json();

      if (!result.success) {
        setQwen2vlStatus({ status: "error", message: result.message || "Training failed to start" });
        return;
      }

      pollQwen2VLStatus();
    } catch (err) {
      console.error(err);
      setQwen2vlStatus({ status: "error", message: "Training failed to start" });
    }
  };

  const pollQwen2VLStatus = () => {
    if (qwen2vlPollRef.current) clearInterval(qwen2vlPollRef.current);

    qwen2vlPollRef.current = setInterval(async () => {
      try {
        const qwen2vlServerUrl = await getQwen2vlServiceUrl(SERVER_URL);
        const cleanServerUrl = qwen2vlServerUrl.replace(/\/$/, "");
        const response = await fetch(`${cleanServerUrl}/train_qwen2vl_status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, project: project.project })
        });

        const s = await response.json();
        setQwen2vlStatus(s);

        if (s.status === "done" || s.status === "error") {
          clearInterval(qwen2vlPollRef.current);
          qwen2vlPollRef.current = null;
        }
      } catch (err) {
        console.error(err);
        clearInterval(qwen2vlPollRef.current);
        qwen2vlPollRef.current = null;
        setQwen2vlStatus({ status: "error", message: "Connection lost" });
      }
    }, 3000);
  };

  const downloadQwen2VLModel = async () => {
    setIsDownloadingQwen2VL(true);
    try {
      const qwen2vlServerUrl = await getQwen2vlServiceUrl(SERVER_URL);
      const cleanServerUrl = qwen2vlServerUrl.replace(/\/$/, "");
      const response = await fetch(`${cleanServerUrl}/download_qwen2vl_model`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, project: project.project })
      });

      const result = await response.json();
      if (!result.success || !result.download_url) {
        alert(result.message || "Download failed");
        return;
      }

      window.open(result.download_url, "_blank");
    } catch (err) {
      console.error(err);
      alert("Download failed");
    } finally {
      setIsDownloadingQwen2VL(false);
    }
  };

  const startEdgeExport = async () => {
    const exportServerUrl = await getExportServerUrl(SERVER_URL);

    if (!exportServerUrl || !email) {
      setEdgeStatus({ status: "error", message: "กรุณาตรวจสอบการตั้งค่า Cloud URL และการ Login ของคุณ" });
      return;
    }

    setEdgeStatus({ status: "starting", progress: 0 });

    try {
      const cleanServerUrl = exportServerUrl.replace(/\/$/, "");

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
        const exportServerUrl = await getExportServerUrl(SERVER_URL);
        const cleanServerUrl = exportServerUrl.replace(/\/$/, "");
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
    setIsDownloadingEdge(true);
    try {
      const exportServerUrl = await getExportServerUrl(SERVER_URL);
      const cleanServerUrl = exportServerUrl.replace(/\/$/, "");
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
      link.download = `${project.project}_${taskType}_${edgeFormat}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert("Download failed");
    } finally {
      setIsDownloadingEdge(false);
    }
  };

  const handlePrimaryAction = () => {
    if (format === "coco") {
      handleExportCoco();
    } else if (format === "csv") {
      handleExportCsv();
    } else if (format === "yolo_export") {
      handleExportYolo();
    } else if (format === "qwen2vl") {
      startQwen2VLTraining();
    } else {
      startTraining();
    }
  };

  const visibleFormatOptions = FORMAT_OPTIONS;
  const isExportFormat = format === "coco" || format === "csv" || format === "yolo_export";
  const isBlockedByQuota = isOverQuota && quotaConfig.overagePrice === null;

  const primaryDisabled = isExportFormat
    ? isExporting
    : format === "qwen2vl"
    ? qwen2vlBusy
    : (isTrainBusy || isBlockedByQuota);

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

      {!isCheckingQuota && (
        <div
          style={{
            background: isBlockedByQuota ? "#fdecea" : isOverQuota ? "#fff8e1" : "#eef3fb",
            border: `1px solid ${isBlockedByQuota ? "#f5c2c0" : isOverQuota ? "#ffe082" : "#cfe0f5"}`,
            borderRadius: 10,
            padding: "10px 15px",
            marginBottom: 20,
            fontSize: 13,
            color: isBlockedByQuota ? "#a12622" : isOverQuota ? "#8a6d00" : "#2c5282"
          }}
        >
          {quotaConfig.monthlyQuota === 0 ? (
            <>🔒 แผน <b>{currentPlan}</b> เก็บข้อมูล (dataset) ได้ แต่ไม่รวมสิทธิ์เทรนโมเดล — กรุณาอัปเกรดเป็น Starter ขึ้นไปเพื่อเทรน</>
          ) : usedThisMonth == null ? (
            <>💰 แผนปัจจุบัน: <b>{currentPlan}</b></>
          ) : Number.isFinite(quotaConfig.monthlyQuota) ? (
            <>
              💰 แผน <b>{currentPlan}</b> — เทรนไปแล้ว <b>{usedThisMonth}</b> / {quotaConfig.monthlyQuota} ครั้งเดือนนี้
              {isBlockedByQuota && " — ครบโควตาแล้ว กรุณาอัปเกรดแผนเพื่อเทรนต่อ"}
              {isOverQuota && !isBlockedByQuota && ` — เทรนครั้งถัดไปจะถูกเรียกเก็บ $${quotaConfig.overagePrice.toFixed(2)} เพิ่มเติม`}
            </>
          ) : (
            <>💰 แผน <b>{currentPlan}</b> — เทรนได้ไม่จำกัด (เทรนไปแล้ว {usedThisMonth} ครั้งเดือนนี้)</>
          )}
        </div>
      )}

      {/* 🔧 Banner สถานะการเชื่อมต่อระหว่างเทรน — แสดงเฉพาะตอนมีงานเทรนอยู่ */}
      {isTrainBusy && connectionState !== "ok" && (
        <div
          style={{
            background: "#fff8e1",
            border: "1px solid #ffe082",
            borderRadius: 10,
            padding: "10px 15px",
            color: "#8a6d00",
            marginBottom: 20,
            fontSize: 13,
            lineHeight: 1.6
          }}
        >
          {connectionState === "retrying" ? (
            <>⚠️ การเชื่อมต่อกับ Server ขาดหายชั่วคราว กำลังพยายามเชื่อมต่อใหม่... (งานเทรนบน Server ยังทำงานต่อเนื่องอยู่)</>
          ) : (
            <>
              📡 ขาดการเชื่อมต่อกับ Server เป็นเวลานาน — ระบบจะลองเชื่อมต่อใหม่อัตโนมัติทุก 10 วินาที
              และแสดงความคืบหน้าต่อทันทีเมื่อเน็ตกลับมา ไม่ต้องกด Train ซ้ำ (งานเทรนบน Server ยังทำงานต่ออยู่)
              <div style={{ marginTop: 8 }}>
                <button
                  onClick={() => pollTrainStatus(0)}
                  style={{
                    background: "#fff",
                    border: "1px solid #e0b400",
                    color: "#8a6d00",
                    borderRadius: 6,
                    padding: "4px 12px",
                    fontSize: 12,
                    cursor: "pointer"
                  }}
                >
                  🔄 ตรวจสอบตอนนี้
                </button>
              </div>
            </>
          )}
        </div>
      )}

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

      <select
        value={format}
        onChange={(e) => setFormat(e.target.value)}
        disabled={isExporting || isTrainBusy || qwen2vlBusy}
        style={{
          marginBottom: 10,
          padding: "10px 12px",
          borderRadius: 8,
          width: "100%",
          border: "1px solid #ccc",
          fontSize: 14
        }}
      >
        {visibleFormatOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {(() => {
        const selectedOpt = visibleFormatOptions.find((opt) => opt.value === format);
        if (!selectedOpt?.desc) return null;
        return (
          <div
            style={{
              background: "#f0f4fa",
              border: "1px solid #d5e0ee",
              borderRadius: 8,
              padding: "10px 14px",
              color: "#3a4a5e",
              marginBottom: 20,
              fontSize: 13,
              lineHeight: 1.6
            }}
          >
            💡 {selectedOpt.desc}
          </div>
        );
      })()}

      {format === "yolo" && (
        <p style={{ fontSize: 12, color: "#0078D7", marginTop: 0, marginBottom: 10 }}>
          🎯 จะเทรนด้วยขนาดภาพ (imgsz): <b>{getProjectTargetImgsz()}px</b>
          {" "}
        </p>
      )}

      <button
        onClick={handlePrimaryAction}
        disabled={primaryDisabled}
        style={{
          backgroundColor: primaryDisabled ? "#9fc4e0" : "#0078D7",
          color: "white",
          padding: "10px 20px",
          border: "none",
          borderRadius: 8,
          fontSize: 15,
          cursor: primaryDisabled ? "not-allowed" : "pointer",
          marginBottom: 20
        }}
      >
        {format === "coco"
          ? (isExporting ? "⌛ รอสักครู่.. กำลัง Export" : "📦 Export Dataset (COCO)")
          : format === "csv"
          ? (isExporting ? "⌛ รอสักครู่.. กำลัง Export" : "⬇️ Export CSV")
          : format === "yolo_export"
          ? (isExporting ? "⌛ รอสักครู่.. กำลัง Export" : "⬇️ Export YOLO Format (.zip)")
          : format === "qwen2vl"
          ? (qwen2vlBusy ? `⌛ รอสักครู่.. กำลังเทรน Qwen2-VL (${qwen2vlStatus.progress || 0}%)` : "🧠 Train (Qwen2-VL)")
          : isBlockedByQuota
          ? (quotaConfig.monthlyQuota === 0 ? "🔒 อัปเกรดแผนเพื่อเทรน" : "🔒 ครบโควตาแล้ว — อัปเกรดแผน")
          : (isTrainBusy ? "⌛ รอสักครู่.. กำลังเทรน" : "🚀 Train (YOLOv8)")}
      </button>

      {isExportFormat && exportMsg.text && (
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

      {isCheckingModel && (
        <div
          style={{
            background: "#eef3fb",
            border: "1px solid #cfe0f5",
            borderRadius: 10,
            padding: "10px 15px",
            color: "#2c5282",
            marginBottom: 20,
            fontSize: 13
          }}
        >
          🔍 กำลังตรวจสอบสถานะโมเดล รอสักครู่..
        </div>
      )}

      {format === "yolo" && trainStatus.status !== "idle" && (
        <TrainProgressBlock
          status={trainStatus}
          lastTrainingMeta={lastTrainingMeta}
          localElapsed={localElapsed}
          onDownload={downloadTrainedModel}
          isDone={isTrainDone}
          isDownloadingModel={isDownloadingModel}
          edgeFormat={edgeFormat}
          setEdgeFormat={setEdgeFormat}
          edgeStatus={edgeStatus}
          onStartEdgeExport={startEdgeExport}
          onDownloadEdgeModel={downloadEdgeModel}
          isDownloadingEdge={isDownloadingEdge}
        />
      )}

      {format === "qwen2vl" && qwen2vlStatus.status !== "idle" && (
        <div style={{ marginBottom: 20 }}>
          {qwen2vlStatus.status === "error" ? (
            <div
              style={{
                background: "#fdecea",
                border: "1px solid #f5c2c0",
                borderRadius: 10,
                padding: "10px 15px",
                color: "#a12622"
              }}
            >
              ❌ Training failed: {qwen2vlStatus.message}
            </div>
          ) : (
            <>
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
                  {qwen2vlDone
                    ? "✅ Training complete"
                    : qwen2vlStatus.status === "starting"
                    ? "⏳ กำลังเริ่มต้น รอสักครู่.."
                    : "⏳ กำลังเทรน Qwen2-VL รอสักครู่.."}
                </span>
                <span>
                  {qwen2vlStatus.progress || 0}%
                  {qwen2vlStatus.total_images != null ? ` · ${qwen2vlStatus.total_images} รูป` : ""}
                </span>
              </div>

              <div
                style={{
                  width: "100%",
                  height: 10,
                  background: "#eee",
                  borderRadius: 6,
                  overflow: "hidden",
                  marginBottom: 8
                }}
              >
                <div
                  style={{
                    width: `${qwen2vlStatus.progress || 0}%`,
                    height: "100%",
                    background: qwen2vlDone ? "#28a745" : "#0078D7",
                    transition: "width 0.4s ease"
                  }}
                />
              </div>

              {qwen2vlDone && (
                <button
                  onClick={downloadQwen2VLModel}
                  disabled={isDownloadingQwen2VL}
                  style={{
                    backgroundColor: isDownloadingQwen2VL ? "#8fd1a8" : "#28a745",
                    color: "white",
                    padding: "10px 20px",
                    border: "none",
                    borderRadius: 8,
                    fontSize: 15,
                    cursor: isDownloadingQwen2VL ? "not-allowed" : "pointer"
                  }}
                >
                  {isDownloadingQwen2VL ? "⌛ รอสักครู่.. กำลังดาวน์โหลด" : "⬇️ Download LoRA Adapter (.zip)"}
                </button>
              )}
            </>
          )}
        </div>
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
  lastTrainingMeta,
  localElapsed,
  onDownload,
  isDone,
  isDownloadingModel,
  edgeFormat,
  setEdgeFormat,
  edgeStatus,
  onStartEdgeExport,
  onDownloadEdgeModel,
  isDownloadingEdge
}) {
  if (status.status === "error") {
    const isTimeout = status.timeout === true;
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
        <div>
          {isTimeout ? "⏱️ " : "❌ "}
          Training failed: {status.message}
        </div>
        {status.duration_seconds != null && (
          <div style={{ fontSize: 12, marginTop: 6, opacity: 0.85 }}>
            ⏱️ ใช้เวลาไปทั้งหมดก่อนหยุด: {formatDuration(status.duration_seconds)}
          </div>
        )}
      </div>
    );
  }

  const pct = status.progress || 0;
  const edgeBusy = edgeStatus.status === "starting" || edgeStatus.status === "running";
  const edgeDone = edgeStatus.status === "done";

  // 🔧 ใช้เวลาจากตัวจับเวลาฝั่ง client ก่อน (ถูก sync กับ server ทุกครั้งที่ poll สำเร็จ)
  // เพื่อให้เวลายังเดินต่อระหว่างเน็ตหลุด แทนที่จะค้างอยู่ที่ค่าล่าสุดจาก server
  const elapsed = localElapsed ?? status.elapsed_seconds;
  const timeoutLimit = status.timeout_seconds;
  const doneDuration = status.duration_seconds ?? lastTrainingMeta?.duration_seconds;
  const nearTimeout = elapsed != null && timeoutLimit != null && elapsed > timeoutLimit * 0.8;

  const imgszUsed = status.imgsz ?? lastTrainingMeta?.imgsz;

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
            ? "⏳ กำลังเริ่มต้น รอสักครู่.."
            : "⏳ กำลังเทรน รอสักครู่.. (YOLOv8 บน Cloud GPU)"}
        </span>
        <span>
          {pct}%
          {status.total_images != null ? ` · ${status.total_images} รูป` : ""}
          {imgszUsed != null ? ` · imgsz ${imgszUsed}` : ""}
        </span>
      </div>

      {!isDone && elapsed != null && (
        <div
          style={{
            fontSize: 12,
            color: nearTimeout ? "#c77700" : "#666",
            marginBottom: 8,
            display: "flex",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 6
          }}
        >
          <span>⏱️ เวลาที่ใช้ไปแล้ว: {formatDuration(elapsed)}</span>
          {timeoutLimit != null && (
            <span>
              {nearTimeout ? "⚠️ ใกล้ครบเวลาสูงสุดแล้ว — " : ""}
              จำกัดสูงสุด {formatDuration(timeoutLimit)}
            </span>
          )}
        </div>
      )}

      <div
        style={{
          width: "100%",
          height: 10,
          background: "#eee",
          borderRadius: 6,
          overflow: "hidden",
          marginBottom: 8
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

      {isDone && doneDuration != null && (
        <div
          style={{
            background: "#eafaf1",
            border: "1px solid #a3e4c1",
            borderRadius: 8,
            padding: "8px 12px",
            color: "#1e7e4d",
            marginBottom: 15,
            fontSize: 13
          }}
        >
          ⏱️ การเทรนใช้เวลาไปทั้งหมด: <b>{formatDuration(doneDuration)}</b>
          {imgszUsed != null && (
            <> &nbsp;|&nbsp; 📐 เทรนด้วย imgsz: <b>{imgszUsed}×{imgszUsed}</b></>
          )}
        </div>
      )}

      {isDone && (
        <>
          <button
            onClick={onDownload}
            disabled={isDownloadingModel}
            style={{
              backgroundColor: isDownloadingModel ? "#8fd1a8" : "#28a745",
              color: "white",
              padding: "10px 20px",
              border: "none",
              borderRadius: 8,
              fontSize: 15,
              cursor: isDownloadingModel ? "not-allowed" : "pointer"
            }}
          >
            {isDownloadingModel ? "⌛ รอสักครู่.. กำลังดาวน์โหลด" : "⬇️ Download Model (.pt / YOLO-PyTorch)"}
          </button>

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
              📱 Export for Edge — ONNX / TFLite / TF.js (ทุกแผนใช้ได้)
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
              {EDGE_FORMAT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            {(() => {
              const selectedOpt = EDGE_FORMAT_OPTIONS.find((opt) => opt.value === edgeFormat);
              if (!selectedOpt?.desc) return null;
              return (
                <div
                  style={{
                    background: "#f0f4fa",
                    border: "1px solid #d5e0ee",
                    borderRadius: 8,
                    padding: "8px 12px",
                    color: "#3a4a5e",
                    marginBottom: 10,
                    fontSize: 12,
                    lineHeight: 1.6
                  }}
                >
                  💡 {selectedOpt.desc}
                </div>
              );
            })()}

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
                ? `⌛ รอสักครู่.. กำลัง Export (${edgeStatus.progress || 0}%)`
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
                disabled={isDownloadingEdge}
                style={{
                  backgroundColor: isDownloadingEdge ? "#c9b3e6" : "#6f42c1",
                  color: "white",
                  padding: "10px 20px",
                  border: "none",
                  borderRadius: 8,
                  fontSize: 14,
                  cursor: isDownloadingEdge ? "not-allowed" : "pointer",
                  marginTop: 10,
                  width: "100%"
                }}
              >
                {isDownloadingEdge
                  ? "⌛ รอสักครู่.. กำลังดาวน์โหลด"
                  : `⬇️ Download ${EDGE_FORMAT_DISPLAY_NAMES[edgeFormat] || edgeFormat.toUpperCase()} Model`}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}