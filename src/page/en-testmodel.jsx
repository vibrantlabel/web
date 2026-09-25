import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import * as ort from "onnxruntime-web";

// ⚠️ ONNX Runtime Web needs to load an extra .wasm file (on top of the
// regular JS bundle). The simplest approach: load it directly from a CDN
// like this (no need to manually copy .wasm files into public/).
// If you want to run fully offline, copy the files from
// node_modules/onnxruntime-web/dist/*.wasm into public/ort/ and change the
// path below to "/ort/"
ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/";

export default function EnTestModel() {
  const navigate = useNavigate();

  // ==========================================================
  // 📶 ESP32-CAM / IP Camera: connect to the video stream (same pattern
  // as the DetectionCapture page)
  // ==========================================================
  const [esp32IpInput, setEsp32IpInput] = useState(
    localStorage.getItem("camera_url") || "192.168.43.181/stream"
  );
  const [esp32IpConnected, setEsp32IpConnected] = useState(null);
  const [esp32Status, setEsp32Status] = useState("idle"); // idle | connecting | connected | error
  const [esp32StreamKey, setEsp32StreamKey] = useState(0);
  const esp32ImgRef = useRef(null);
  const overlayCanvasRef = useRef(null); // canvas that draws boxes+labels over the stream
  const inferCanvasRef = useRef(null); // hidden canvas used to crop frames from the stream for processing (doesn't need to be recreated every time)
  const streamContainerRef = useRef(null); // container of the camera image + overlay canvas, used for fullscreen

  // ==========================================================
  // 🎥 Choose the video source: ESP32-CAM (IP stream), the device's webcam
  // (getUserMedia), or a mobile phone (QR scan)
  // ==========================================================
  const [videoSource, setVideoSource] = useState("esp32"); // "esp32" | "webcam" | "mobile"
  const webcamVideoRef = useRef(null);
  const webcamStreamRef = useRef(null); // stores the MediaStream so tracks can be stopped when the camera is closed
  const [webcamStatus, setWebcamStatus] = useState("idle"); // idle | requesting | active | error
  const [webcamError, setWebcamError] = useState("");

  // ==========================================================
  // 📱 Mobile Camera (scan QR Code): use a phone as the camera, sending
  // images through the server (same pattern as DetectionCapture.jsx)
  // ==========================================================
  const [mobileSessionId, setMobileSessionId] = useState(null);
  const [mobileQrUrl, setMobileQrUrl] = useState("");
  const [mobileCaptureUrl, setMobileCaptureUrl] = useState("");
  const [mobileStatus, setMobileStatus] = useState("idle"); // idle | waiting | connected | error
  const mobileImgRef = useRef(null);
  const mobilePollIntervalRef = useRef(null);
  const MOBILE_POLL_INTERVAL_MS = 800;

  const stopWebcamTracks = () => {
    if (webcamStreamRef.current) {
      webcamStreamRef.current.getTracks().forEach((track) => track.stop());
      webcamStreamRef.current = null;
    }
    if (webcamVideoRef.current) webcamVideoRef.current.srcObject = null;
  };

  // Request camera permission via getUserMedia (must run on HTTPS or
  // localhost only, otherwise the browser will block it)
  const handleStartWebcam = async () => {
    setWebcamStatus("requesting");
    setWebcamError("");
    try {
      // facingMode: "environment" requests the rear camera first on mobile
      // (good for scanning objects); falls back to whatever camera is available
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false
      });
      webcamStreamRef.current = stream;
      if (webcamVideoRef.current) {
        webcamVideoRef.current.srcObject = stream;
      }
      setWebcamStatus("active");
    } catch (err) {
      console.error("Failed to open camera:", err);
      setWebcamError(err.message || "Failed to open camera. Check whether camera permission has been granted.");
      setWebcamStatus("error");
    }
  };

  const handleStopWebcam = () => {
    setIsRunning(false);
    stopWebcamTracks();
    setWebcamStatus("idle");
  };

  // Switch video source: always stop scanning + close the previous
  // camera/session first, to avoid having two cameras/streams active at once
  const handleSwitchVideoSource = (source) => {
    if (source === videoSource) return;
    setIsRunning(false);
    if (videoSource === "webcam") stopWebcamTracks();
    if (videoSource === "esp32" && esp32ImgRef.current) esp32ImgRef.current.src = "";
    if (videoSource === "mobile") {
      stopMobilePolling();
      setMobileSessionId(null);
      setMobileQrUrl("");
      setMobileCaptureUrl("");
      setMobileStatus("idle");
    }
    setVideoSource(source);
  };

  // ==========================================================
  // ⛶ Expand the camera view to fullscreen (uses the browser's
  // Fullscreen API)
  // ==========================================================
  const [isFullscreen, setIsFullscreen] = useState(false);

  const handleToggleFullscreen = () => {
    const el = streamContainerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().catch((err) => {
        console.error("Failed to enter fullscreen mode:", err);
      });
    } else {
      document.exitFullscreen?.();
    }
  };

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  function normalizeCameraUrl(raw) {
    let url = raw.trim();
    if (!url) return "";
    if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
    return url;
  }

  const handleConnectEsp32 = () => {
    const normalized = normalizeCameraUrl(esp32IpInput);
    if (!normalized) {
      setEsp32Status("error");
      return;
    }
    localStorage.setItem("camera_url", esp32IpInput.trim());
    setEsp32Status("connecting");
    setEsp32IpConnected(normalized);
    setEsp32StreamKey(Date.now());
  };

  const handleDisconnectEsp32 = () => {
    setIsRunning(false);
    if (esp32ImgRef.current) esp32ImgRef.current.src = "";
    setEsp32IpConnected(null);
    setEsp32Status("idle");
  };

  // ==========================================================
  // 📱 Mobile Camera: create a session + QR for the phone to scan (same as
  // DetectionCapture.jsx)
  // ==========================================================
  const generateMobileSessionId = () => {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  };

  const stopMobilePolling = () => {
    if (mobilePollIntervalRef.current) {
      clearInterval(mobilePollIntervalRef.current);
      mobilePollIntervalRef.current = null;
    }
  };

  const pollMobileFrame = async (serverUrl, email, sessionId) => {
    try {
      const cleanServerUrl = serverUrl.replace(/\/$/, "");
      const response = await fetch(`${cleanServerUrl}/get_mobile_camera_frame`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, session_id: sessionId })
      });
      const result = await response.json();

      if (result.connected && result.image_url) {
        if (mobileImgRef.current) mobileImgRef.current.src = result.image_url;
        setMobileStatus("connected");
      } else {
        setMobileStatus((prev) => (prev === "connected" ? "waiting" : prev));
      }
    } catch (err) {
      console.error("Mobile frame poll failed:", err);
      setMobileStatus("error");
    }
  };

  const handleGenerateMobileQr = async () => {
    const serverUrl = localStorage.getItem("cloud_url");
    const email = localStorage.getItem("email");

    if (!serverUrl || !email) {
      alert("Please check your Cloud URL settings and make sure you're logged in.");
      return;
    }

    stopMobilePolling();
    setMobileStatus("waiting");

    const cleanServerUrl = serverUrl.replace(/\/$/, "");
    let sessionId = generateMobileSessionId();
    const projectLabel = "test-model";

    try {
      const response = await fetch(`${cleanServerUrl}/create_mobile_camera_session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, project: projectLabel, session_id: sessionId })
      });
      const result = await response.json();
      if (result && result.session_id) sessionId = result.session_id;
    } catch (err) {
      console.error("Create mobile session failed:", err);
    }

    const captureUrl = `${window.location.origin}/mobile-camera?session=${sessionId}&email=${encodeURIComponent(email)}&project=${encodeURIComponent(projectLabel)}&server=${encodeURIComponent(serverUrl)}`;
    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=${encodeURIComponent(captureUrl)}`;

    setMobileSessionId(sessionId);
    setMobileCaptureUrl(captureUrl);
    setMobileQrUrl(qrImageUrl);

    mobilePollIntervalRef.current = setInterval(() => {
      pollMobileFrame(serverUrl, email, sessionId);
    }, MOBILE_POLL_INTERVAL_MS);
  };

  // ==========================================================
  // 🧠 Load an ONNX model (upload a .onnx file from disk) — only .onnx
  // files are supported
  // ==========================================================
  const [modelStatus, setModelStatus] = useState("idle"); // idle | loading | ready | error
  const [modelName, setModelName] = useState("");
  const [modelError, setModelError] = useState("");
  const sessionRef = useRef(null);

  // 🆕 Adjustable from the UI below ("Trained input size (imgsz)" field) —
  // this value is only the default when the page first opens
  const [inputSize, setInputSize] = useState(320);

  // 🆕 Always check the file extension first, and only accept .onnx (all
  // .pt support has been removed). Even though <input accept=".onnx">
  // already filters the file picker to show only .onnx files as the first
  // line of defense, "accept" isn't actually enforced (users can switch to
  // "All Files" on some OSes), so it must always be checked again here in
  // JS as a second line of defense — otherwise picking the wrong file type
  // by mistake would surface a raw, hard-to-understand error from
  // onnxruntime-web instead of a clear message.
  const handleModelFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const ext = file.name.toLowerCase().split(".").pop();

    if (ext !== "onnx") {
      setModelStatus("error");
      setModelError(`File extension ".${ext}" is not supported — only .onnx files are supported.`);
      setModelName("");
      sessionRef.current = null;
      return;
    }

    setModelStatus("loading");
    setModelError("");

    try {
      const arrayBuffer = await file.arrayBuffer();
      let session;
      try {
        session = await ort.InferenceSession.create(arrayBuffer, {
          executionProviders: ["webgl"]
        });
      } catch (webglErr) {
        console.warn("webgl not supported, falling back to wasm:", webglErr);
        session = await ort.InferenceSession.create(arrayBuffer, {
          executionProviders: ["wasm"]
        });
      }
      sessionRef.current = session;
      setModelName(file.name);
      setModelStatus("ready");
    } catch (err) {
      console.error("Load model failed:", err);
      setModelError(err.message || "Failed to load model");
      setModelStatus("error");
      sessionRef.current = null;
    }
  };

  // ==========================================================
  // 🏷️ Class names (must exactly match the class order used during training)
  // ==========================================================
  const [classNamesText, setClassNamesText] = useState(
    localStorage.getItem("test_model_classes") || ""
  );
  const classNames = classNamesText
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const handleClassNamesChange = (value) => {
    setClassNamesText(value);
    localStorage.setItem("test_model_classes", value);
  };

  // ==========================================================
  // 🔊 Speak the names of detected objects (Web Speech API)
  // ==========================================================
  const [speechEnabled, setSpeechEnabled] = useState(true);
  const [speechLang, setSpeechLang] = useState("th-TH");
  const speechQueueRef = useRef([]);
  const isSpeakingRef = useRef(false);
  const activeLabelsRef = useRef(new Set());

  const processSpeechQueue = () => {
    if (isSpeakingRef.current) return;
    const next = speechQueueRef.current.shift();
    if (!next) return;

    isSpeakingRef.current = true;
    const utter = new SpeechSynthesisUtterance(next);
    utter.lang = speechLang;
    utter.rate = 1;
    utter.onend = () => {
      isSpeakingRef.current = false;
      processSpeechQueue();
    };
    utter.onerror = () => {
      isSpeakingRef.current = false;
      processSpeechQueue();
    };
    window.speechSynthesis.speak(utter);
  };

  const speakDetections = (boxes) => {
    const allLabelsInFrame = new Set(boxes.map((b) => classNames[b.classId] || `class_${b.classId}`));
    const confidentLabelsInFrame = new Set(
      boxes.filter((b) => b.score >= highConfThreshold).map((b) => classNames[b.classId] || `class_${b.classId}`)
    );

    if (speechEnabled) {
      confidentLabelsInFrame.forEach((label) => {
        if (!activeLabelsRef.current.has(label)) {
          speechQueueRef.current.push(label);
        }
      });
      processSpeechQueue();
    }

    activeLabelsRef.current = allLabelsInFrame;
  };

  const [confThreshold, setConfThreshold] = useState(0.4);
  const [iouThreshold, setIouThreshold] = useState(0.45);
  const [highConfThreshold, setHighConfThreshold] = useState(0.95);
  const [lowConfThreshold, setLowConfThreshold] = useState(0.90);

  useEffect(() => {
    if (lowConfThreshold < confThreshold) setLowConfThreshold(confThreshold);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confThreshold]);
  useEffect(() => {
    if (highConfThreshold < lowConfThreshold) setHighConfThreshold(lowConfThreshold);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lowConfThreshold]);

  const [maxFps, setMaxFps] = useState(0);

  // ==========================================================
  // ▶️ Real-time scanning state
  // ==========================================================
  const [isRunning, setIsRunning] = useState(false);
  const [detections, setDetections] = useState([]);
  const [inferenceMs, setInferenceMs] = useState(null);
  const [actualFps, setActualFps] = useState(null);
  const fpsCounterRef = useRef({ count: 0, windowStart: 0 });
  const runningLoopRef = useRef(false);

  const letterboxToTensor = (source, size) => {
    const srcW = source.naturalWidth || source.videoWidth || source.width;
    const srcH = source.naturalHeight || source.videoHeight || source.height;
    const scale = Math.min(size / srcW, size / srcH);
    const newW = Math.round(srcW * scale);
    const newH = Math.round(srcH * scale);
    const padX = Math.floor((size - newW) / 2);
    const padY = Math.floor((size - newH) / 2);

    if (!inferCanvasRef.current) {
      inferCanvasRef.current = document.createElement("canvas");
    }
    const off = inferCanvasRef.current;
    off.width = size;
    off.height = size;
    const ctx = off.getContext("2d", { willReadFrequently: true });
    ctx.fillStyle = "#727272";
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(source, 0, 0, srcW, srcH, padX, padY, newW, newH);

    const imageData = ctx.getImageData(0, 0, size, size).data;
    const floatData = new Float32Array(3 * size * size);
    const plane = size * size;
    for (let i = 0; i < plane; i++) {
      floatData[i] = imageData[i * 4] / 255;
      floatData[plane + i] = imageData[i * 4 + 1] / 255;
      floatData[2 * plane + i] = imageData[i * 4 + 2] / 255;
    }
    return { floatData, scale, padX, padY, srcW, srcH };
  };

  const computeIoU = (a, b) => {
    const x1 = Math.max(a.x1, b.x1);
    const y1 = Math.max(a.y1, b.y1);
    const x2 = Math.min(a.x2, b.x2);
    const y2 = Math.min(a.y2, b.y2);
    const interW = Math.max(0, x2 - x1);
    const interH = Math.max(0, y2 - y1);
    const interArea = interW * interH;
    const areaA = (a.x2 - a.x1) * (a.y2 - a.y1);
    const areaB = (b.x2 - b.x1) * (b.y2 - b.y1);
    return interArea / (areaA + areaB - interArea + 1e-6);
  };

  const nonMaxSuppression = (boxes, iouThresh) => {
    const sorted = [...boxes].sort((a, b) => b.score - a.score);
    const picked = [];
    while (sorted.length > 0) {
      const current = sorted.shift();
      picked.push(current);
      for (let i = sorted.length - 1; i >= 0; i--) {
        if (computeIoU(current, sorted[i]) > iouThresh) {
          sorted.splice(i, 1);
        }
      }
    }
    return picked;
  };

  const parseYoloOutput = (outputTensor, size, scale, padX, padY, confThresh) => {
    const dims = outputTensor.dims;
    const data = outputTensor.data;
    let C, N, transposed;
    if (dims[1] < dims[2]) {
      C = dims[1]; N = dims[2]; transposed = false;
    } else {
      C = dims[2]; N = dims[1]; transposed = true;
    }
    const numClasses = classNames.length > 0 ? Math.min(classNames.length, C - 4) : C - 4;
    const getVal = (c, i) => (transposed ? data[i * C + c] : data[c * N + i]);

    const boxes = [];
    let debugGlobalMaxScore = -Infinity;
    let debugGlobalMinScore = Infinity;

    for (let i = 0; i < N; i++) {
      const cx = getVal(0, i);
      const cy = getVal(1, i);
      const w = getVal(2, i);
      const h = getVal(3, i);

      let bestScore = 0;
      let bestClass = -1;
      for (let c = 0; c < numClasses; c++) {
        const s = getVal(4 + c, i);
        if (s > debugGlobalMaxScore) debugGlobalMaxScore = s;
        if (s < debugGlobalMinScore) debugGlobalMinScore = s;
        if (s > bestScore) {
          bestScore = s;
          bestClass = c;
        }
      }
      if (bestScore < confThresh) continue;

      const x1m = cx - w / 2;
      const y1m = cy - h / 2;
      const x2m = cx + w / 2;
      const y2m = cy + h / 2;

      boxes.push({
        x1: (x1m - padX) / scale,
        y1: (y1m - padY) / scale,
        x2: (x2m - padX) / scale,
        y2: (y2m - padY) / scale,
        score: bestScore,
        classId: bestClass
      });
    }

    console.log(
      `[DEBUG] N=${N} numClasses=${numClasses} C=${C} transposed=${transposed} ` +
      `maxScore=${debugGlobalMaxScore.toFixed(4)} minScore=${debugGlobalMinScore.toFixed(4)} ` +
      `boxesPassedThreshold=${boxes.length}`
    );

    return boxes;
  };

  const drawDetections = (boxes, srcW, srcH) => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    if (canvas.width !== srcW || canvas.height !== srcH) {
      canvas.width = srcW;
      canvas.height = srcH;
    }
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    boxes.forEach((box) => {
      const isHighConf = box.score >= highConfThreshold;
      const isLowConf = box.score < lowConfThreshold;
      const scorePct = (box.score * 100).toFixed(0);

      const boxColor = isLowConf ? "#F59E0B" : "#22C55E";
      ctx.strokeStyle = boxColor;
      ctx.lineWidth = Math.max(2, srcW / 300);
      ctx.strokeRect(box.x1, box.y1, box.x2 - box.x1, box.y2 - box.y1);

      let text = null;
      if (isHighConf) {
        const label = classNames[box.classId] || `class_${box.classId}`;
        text = `${label} ${scorePct}%`;
      } else if (isLowConf) {
        text = `Add this to dataset ${scorePct}%`;
      }
      if (!text) return;

      ctx.font = `${Math.max(16, srcW / 40)}px Segoe UI, sans-serif`;
      const textWidth = ctx.measureText(text).width;
      const textHeight = Math.max(20, srcW / 32);

      ctx.fillStyle = boxColor;
      ctx.fillRect(box.x1, Math.max(0, box.y1 - textHeight), textWidth + 12, textHeight);

      ctx.fillStyle = "#0B1220";
      ctx.fillText(text, box.x1 + 6, Math.max(textHeight - 5, box.y1 - 5));
    });
  };

  const getActiveMediaElement = () => {
    if (videoSource === "webcam") return webcamVideoRef.current;
    if (videoSource === "mobile") return mobileImgRef.current;
    return esp32ImgRef.current;
  };

  const isMediaReady = (media) => {
    if (!media) return false;
    if (videoSource === "webcam") return media.readyState >= 2 && media.videoWidth > 0;
    if (videoSource === "mobile") return mobileStatus === "connected" && media.complete && media.naturalWidth > 0;
    return media.complete && media.naturalWidth > 0;
  };

  const runInferenceOnce = async () => {
    const session = sessionRef.current;
    const media = getActiveMediaElement();
    if (!session || !isMediaReady(media)) return;

    const { floatData, scale, padX, padY, srcW, srcH } = letterboxToTensor(media, inputSize);
    const inputTensor = new ort.Tensor("float32", floatData, [1, 3, inputSize, inputSize]);

    const inputName = session.inputNames[0];
    const outputName = session.outputNames[0];

    const t0 = performance.now();
    const results = await session.run({ [inputName]: inputTensor });
    const elapsedMs = performance.now() - t0;

    const rawBoxes = parseYoloOutput(results[outputName], inputSize, scale, padX, padY, confThreshold);
    const finalBoxes = nonMaxSuppression(rawBoxes, iouThreshold);

    setDetections(finalBoxes);
    setInferenceMs(Math.round(elapsedMs));
    drawDetections(finalBoxes, srcW, srcH);
    speakDetections(finalBoxes);
  };

  useEffect(() => {
    const isSourceReady =
      videoSource === "webcam" ? webcamStatus === "active" :
      videoSource === "mobile" ? mobileStatus === "connected" :
      esp32Status === "connected";
    if (!isRunning || modelStatus !== "ready" || !isSourceReady) return;

    runningLoopRef.current = true;

    const loop = async () => {
      while (runningLoopRef.current) {
        const frameStart = performance.now();
        try {
          await runInferenceOnce();
        } catch (err) {
          console.error("Inference error:", err);
        }

        const fc = fpsCounterRef.current;
        fc.count += 1;
        const now = performance.now();
        if (now - fc.windowStart >= 1000) {
          setActualFps(fc.count);
          fc.count = 0;
          fc.windowStart = now;
        }

        const targetFrameMs = maxFps > 0 ? 1000 / maxFps : 0;
        const elapsed = now - frameStart;
        const waitMs = Math.max(0, targetFrameMs - elapsed);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
    };
    loop();

    return () => {
      runningLoopRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning, modelStatus, esp32Status, confThreshold, iouThreshold, highConfThreshold, lowConfThreshold, inputSize, classNamesText, speechEnabled, speechLang, maxFps, videoSource, webcamStatus, mobileStatus]);

  useEffect(() => {
    if (!isRunning) {
      const canvas = overlayCanvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      setDetections([]);
      setInferenceMs(null);
      setActualFps(null);
      fpsCounterRef.current = { count: 0, windowStart: 0 };
      window.speechSynthesis.cancel();
      speechQueueRef.current = [];
      isSpeakingRef.current = false;
      activeLabelsRef.current = new Set();
    }
  }, [isRunning]);

  useEffect(() => {
    return () => {
      runningLoopRef.current = false;
      if (esp32ImgRef.current) esp32ImgRef.current.src = "";
      stopWebcamTracks();
      stopMobilePolling();
      window.speechSynthesis.cancel();
    };
  }, []);

  const isSourceConnected =
    videoSource === "webcam" ? webcamStatus === "active" :
    videoSource === "mobile" ? mobileStatus === "connected" :
    esp32Status === "connected";
  const canStartScanning = modelStatus === "ready" && isSourceConnected && classNames.length > 0;

  const detectionSummary = detections.reduce((acc, box) => {
    const label = classNames[box.classId] || `class_${box.classId}`;
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {});

  return (
    <div style={{ maxWidth: 1200, margin: "30px auto", padding: 25, fontFamily: "Segoe UI, sans-serif" }}>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <button onClick={() => navigate(-1)} style={{ padding: "8px 16px", background: "#f3f4f6", border: "1px solid #d1d5db", borderRadius: 8, cursor: "pointer" }}>
          🎒 Back to Home
        </button>
        <h2 style={{ margin: 0, color: "#7C4DFF" }}>🧪 Test Model — Real-time Object Scanning</h2>
      </div>

      <div style={{
        background: "#FFF7ED", border: "1px solid #FED7AA", borderRadius: 10,
        padding: "10px 14px", marginBottom: 20, fontSize: 12.5, color: "#fe4204",
        display: "flex", alignItems: "flex-start", gap: 8
      }}>
        <span style={{ fontSize: 16 }}>⚠️</span>
        <span>
          <strong>The camera used for data collection and the one used in production should be the same model.</strong> — Different
          camera models produce different color, sharpness, and noise, even for the same object, which can reduce accuracy.
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.3fr", gap: 25 }}>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

          <div style={{ background: "#fff", padding: 18, borderRadius: 14, border: "1px solid #E5E7EB" }}>
            <h3 style={{ marginTop: 0, marginBottom: 10, fontSize: 15 }}>🧠 Model (.onnx)</h3>
            <input type="file" accept=".onnx" onChange={handleModelFileChange} style={{ fontSize: 13 }} />
            <div style={{ marginTop: 8, fontSize: 12.5 }}>
              {modelStatus === "idle" && <span style={{ color: "#94A3B8" }}>No model file selected yet</span>}
              {modelStatus === "loading" && <span style={{ color: "#D97706" }}>⏳ Loading model...</span>}
              {modelStatus === "ready" && <span style={{ color: "#16A672" }}>✅ Ready: {modelName}</span>}
              {modelStatus === "error" && <span style={{ color: "#E23D4F" }}>❌ {modelError}</span>}
            </div>

            <div style={{ marginTop: 12 }}>
              <label style={{ fontSize: 12.5, color: "#475569", display: "block", marginBottom: 4 }}>
                Trained input size (imgsz)
              </label>
              <input
                type="number"
                value={inputSize}
                onChange={(e) => setInputSize(Number(e.target.value) || 160)}
                style={{ width: 100, padding: "6px 10px", borderRadius: 6, border: "1px solid #cbd5e1" }}
              />
            </div>
          </div>

          <div style={{ background: "#fff", padding: 18, borderRadius: 14, border: "1px solid #E5E7EB" }}>
            <h3 style={{ marginTop: 0, marginBottom: 10, fontSize: 15 }}>🏷️ Class names (used during model training)</h3>
            <textarea
              value={classNamesText}
              onChange={(e) => handleClassNamesChange(e.target.value)}
              placeholder="e.g.: helmet, no-helmet  (comma-separated, order must exactly match training)"
              rows={3}
              style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 13, resize: "vertical" }}
            />
            <div style={{ fontSize: 11.5, color: "#94A3B8", marginTop: 6 }}>
              Found {classNames.length} class(es): {classNames.join(", ") || "-"}
            </div>
          </div>

          <div style={{ background: "#fff", padding: 18, borderRadius: 14, border: "1px solid #E5E7EB" }}>
            <h3 style={{ marginTop: 0, marginBottom: 10, fontSize: 15 }}>🎥 Video source for scanning</h3>
            <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => handleSwitchVideoSource("esp32")}
                style={{
                  flex: 1, minWidth: 100, padding: "8px 10px", borderRadius: 8, cursor: "pointer", fontSize: 12.5, fontWeight: "bold",
                  border: videoSource === "esp32" ? "1px solid #7C4DFF" : "1px solid #cbd5e1",
                  background: videoSource === "esp32" ? "#F4EFFF" : "#fff",
                  color: videoSource === "esp32" ? "#5B2FD1" : "#475569"
                }}
              >
                📶 IP CAMERA
              </button>
              <button
                type="button"
                onClick={() => handleSwitchVideoSource("webcam")}
                style={{
                  flex: 1, minWidth: 100, padding: "8px 10px", borderRadius: 8, cursor: "pointer", fontSize: 12.5, fontWeight: "bold",
                  border: videoSource === "webcam" ? "1px solid #7C4DFF" : "1px solid #cbd5e1",
                  background: videoSource === "webcam" ? "#F4EFFF" : "#fff",
                  color: videoSource === "webcam" ? "#5B2FD1" : "#475569"
                }}
              >
                💻 Device Webcam
              </button>
              <button
                type="button"
                onClick={() => handleSwitchVideoSource("mobile")}
                style={{
                  flex: 1, minWidth: 100, padding: "8px 10px", borderRadius: 8, cursor: "pointer", fontSize: 12.5, fontWeight: "bold",
                  border: videoSource === "mobile" ? "1px solid #7C4DFF" : "1px solid #cbd5e1",
                  background: videoSource === "mobile" ? "#F4EFFF" : "#fff",
                  color: videoSource === "mobile" ? "#5B2FD1" : "#475569"
                }}
              >
                📱 Mobile (scan QR)
              </button>
            </div>

            {videoSource === "esp32" ? (
              <>
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <input
                    value={esp32IpInput}
                    onChange={(e) => {
                      setEsp32IpInput(e.target.value);
                      setEsp32Status("idle");
                    }}
                    onKeyDown={(e) => { if (e.key === "Enter") handleConnectEsp32(); }}
                    placeholder="192.168.43.181/stream"
                    style={{ flex: 1, padding: 10, fontSize: 14, borderRadius: 8, border: "1px solid #ccc" }}
                  />
                  {esp32Status === "connected" ? (
                    <button onClick={handleDisconnectEsp32} style={{ padding: "0 16px", borderRadius: 8, border: "none", background: "#EF4444", color: "#fff", fontWeight: "bold", cursor: "pointer" }}>
                      Disconnect
                    </button>
                  ) : (
                    <button onClick={handleConnectEsp32} style={{ padding: "0 16px", borderRadius: 8, border: "none", background: "#0078D7", color: "#fff", fontWeight: "bold", cursor: "pointer" }}>
                      🔌 Connect
                    </button>
                  )}
                </div>
                {esp32Status === "connecting" && <p style={{ color: "#D97706", fontSize: 12.5, margin: 0 }}>⏳ Connecting...</p>}
                {esp32Status === "error" && <p style={{ color: "#EF4444", fontSize: 12.5, margin: 0 }}>❌ Connection failed. Check the IP address.</p>}
                {esp32Status === "connected" && <p style={{ color: "#16A672", fontSize: 12.5, margin: 0 }}>✅ Connected</p>}
              </>
            ) : videoSource === "mobile" ? (
              <>
                <button
                  onClick={handleGenerateMobileQr}
                  style={{
                    width: "100%", padding: "10px 16px", borderRadius: 8, border: "none", fontWeight: "bold", cursor: "pointer",
                    background: mobileStatus === "connected" ? "#10B981" : "#0078D7", color: "#fff"
                  }}
                >
                  {mobileSessionId
                    ? (mobileStatus === "connected" ? "✅ Mobile connected (click to generate a new QR)" : "🔄 Generate a new QR Code")
                    : "📱 Generate a QR Code to connect your phone"}
                </button>
                {mobileStatus === "waiting" && (
                  <p style={{ color: "#D97706", fontSize: 12.5, margin: "8px 0 0" }}>⏳ Waiting for the phone to scan the QR and open its camera...</p>
                )}
                {mobileStatus === "error" && (
                  <p style={{ color: "#EF4444", fontSize: 12.5, margin: "8px 0 0" }}>❌ Connection failed. Try generating a new QR.</p>
                )}
                {mobileStatus === "connected" && (
                  <p style={{ color: "#16A672", fontSize: 12.5, margin: "8px 0 0" }}>✅ Phone connected and sending video</p>
                )}
              </>
            ) : (
              <>
                {webcamStatus === "active" ? (
                  <button onClick={handleStopWebcam} style={{ width: "100%", padding: "10px 16px", borderRadius: 8, border: "none", background: "#EF4444", color: "#fff", fontWeight: "bold", cursor: "pointer" }}>
                    📷 Turn off camera
                  </button>
                ) : (
                  <button onClick={handleStartWebcam} disabled={webcamStatus === "requesting"} style={{ width: "100%", padding: "10px 16px", borderRadius: 8, border: "none", background: "#0078D7", color: "#fff", fontWeight: "bold", cursor: webcamStatus === "requesting" ? "not-allowed" : "pointer" }}>
                    {webcamStatus === "requesting" ? "⏳ Requesting camera permission..." : "📷 Turn on camera"}
                  </button>
                )}
                {webcamStatus === "error" && <p style={{ color: "#EF4444", fontSize: 12.5, margin: "8px 0 0" }}>❌ {webcamError}</p>}
                {webcamStatus === "active" && <p style={{ color: "#16A672", fontSize: 12.5, margin: "8px 0 0" }}>✅ Camera is on</p>}
                <p style={{ fontSize: 11, color: "#94A3B8", margin: "8px 0 0" }}>
                  Must be run on HTTPS or localhost only, otherwise the browser will automatically block camera access.
                </p>
              </>
            )}
          </div>

          <div style={{ background: "#fff", padding: 18, borderRadius: 14, border: "1px solid #E5E7EB" }}>
            <h3 style={{ marginTop: 0, marginBottom: 12, fontSize: 15 }}>🎚️ Detection settings</h3>

            <label style={{ fontSize: 12.5, color: "#475569" }}>Confidence ≥ {confThreshold.toFixed(2)}</label>
            <input type="range" min={0.05} max={0.95} step={0.05} value={confThreshold}
              onChange={(e) => setConfThreshold(Number(e.target.value))}
              style={{ width: "100%", accentColor: "#7C4DFF", marginBottom: 12 }} />

            <label style={{ fontSize: 12.5, color: "#475569" }}>IoU (NMS) ≤ {iouThreshold.toFixed(2)}</label>
            <input type="range" min={0.1} max={0.9} step={0.05} value={iouThreshold}
              onChange={(e) => setIouThreshold(Number(e.target.value))}
              style={{ width: "100%", accentColor: "#7C4DFF", marginBottom: 16 }} />

            <label style={{ fontSize: 12.5, color: "#475569" }}>
              ✅ High confidence (show name + speak) ≥ {(highConfThreshold * 100).toFixed(0)}%
            </label>
            <input type="range" min={lowConfThreshold} max={0.99} step={0.01} value={highConfThreshold}
              onChange={(e) => setHighConfThreshold(Number(e.target.value))}
              style={{ width: "100%", accentColor: "#22C55E", marginBottom: 12 }} />

            <label style={{ fontSize: 12.5, color: "#475569" }}>
              ⚠️ Low confidence (show "add to dataset") &lt; {(lowConfThreshold * 100).toFixed(0)}%
            </label>
            <input type="range" min={confThreshold} max={0.99} step={0.01} value={lowConfThreshold}
              onChange={(e) => setLowConfThreshold(Number(e.target.value))}
              style={{ width: "100%", accentColor: "#F59E0B", marginBottom: 4 }} />
            <p style={{ fontSize: 11, color: "#94A3B8", margin: "0 0 16px" }}>
              Boxes always appear based on the Confidence setting above — above the high threshold shows the real name + speaks it / below the low threshold shows a suggestion to collect more images / in between shows no label.
            </p>

            <label style={{ fontSize: 12.5, color: "#475569" }}>
              Max FPS limit: {maxFps === 0 ? "Unlimited" : `${maxFps} FPS`}
            </label>
            <input type="range" min={0} max={30} step={1} value={maxFps}
              onChange={(e) => setMaxFps(Number(e.target.value))}
              style={{ width: "100%", accentColor: "#7C4DFF", marginBottom: 16 }} />
            <p style={{ fontSize: 11, color: "#94A3B8", margin: "-10px 0 16px" }}>
              Leave it at "Unlimited" for the highest responsiveness, or cap it to reduce heat/battery use.
            </p>

            <label style={{ fontSize: 12.5, color: "#475569", display: "flex", alignItems: "center", gap: 8, marginBottom: 8, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={speechEnabled}
                onChange={(e) => {
                  setSpeechEnabled(e.target.checked);
                  if (!e.target.checked) {
                    window.speechSynthesis.cancel();
                    speechQueueRef.current = [];
                    isSpeakingRef.current = false;
                  }
                }}
                style={{ accentColor: "#7C4DFF" }}
              />
              🔊 Speak the names of detected objects
            </label>
            {speechEnabled && (
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                <button
                  type="button"
                  onClick={() => setSpeechLang("th-TH")}
                  style={{
                    flex: 1, padding: "6px 10px", borderRadius: 8, cursor: "pointer", fontSize: 12.5, fontWeight: "bold",
                    border: speechLang === "th-TH" ? "1px solid #7C4DFF" : "1px solid #cbd5e1",
                    background: speechLang === "th-TH" ? "#F4EFFF" : "#fff",
                    color: speechLang === "th-TH" ? "#5B2FD1" : "#475569"
                  }}
                >
                  🇹🇭 Thai
                </button>
                <button
                  type="button"
                  onClick={() => setSpeechLang("en-US")}
                  style={{
                    flex: 1, padding: "6px 10px", borderRadius: 8, cursor: "pointer", fontSize: 12.5, fontWeight: "bold",
                    border: speechLang === "en-US" ? "1px solid #7C4DFF" : "1px solid #cbd5e1",
                    background: speechLang === "en-US" ? "#F4EFFF" : "#fff",
                    color: speechLang === "en-US" ? "#5B2FD1" : "#475569"
                  }}
                >
                  🇬🇧 English
                </button>
              </div>
            )}

            {!canStartScanning && (
              <p style={{ fontSize: 11.5, color: "#94A3B8", marginTop: 8, marginBottom: 0 }}>
                You need to load a model + connect a camera + fill in the class names before you can start scanning.
              </p>
            )}
            {inferenceMs !== null && (
              <p style={{ fontSize: 11.5, color: "#475569", marginTop: 8, marginBottom: 0 }}>
                ⏱️ Inference: {inferenceMs} ms/frame
                {actualFps !== null && <> &nbsp;|&nbsp; 🎞️ Actual FPS: <strong>{actualFps}</strong></>}
              </p>
            )}
          </div>

        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

          <div
            ref={streamContainerRef}
            style={{
              background: "#000",
              borderRadius: isFullscreen ? 0 : 14,
              overflow: "hidden",
              position: "relative",
              minHeight: 320,
              width: isFullscreen ? "100vw" : "100%",
              height: isFullscreen ? "100vh" : "auto",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}
          >
            {videoSource === "esp32" && esp32IpConnected && (
              <div style={{ position: "relative", width: "100%", height: isFullscreen ? "100%" : "auto", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <img
                  ref={esp32ImgRef}
                  crossOrigin="anonymous"
                  src={`${esp32IpConnected}${esp32IpConnected.includes("?") ? "&" : "?"}t=${esp32StreamKey}`}
                  alt="Camera Stream"
                  style={{
                    width: "100%",
                    height: isFullscreen ? "100%" : "auto",
                    objectFit: isFullscreen ? "contain" : "initial",
                    display: "block"
                  }}
                  onLoad={() => setEsp32Status("connected")}
                  onError={() => setEsp32Status("error")}
                />
                <canvas
                  ref={overlayCanvasRef}
                  style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none" }}
                />
              </div>
            )}

            {videoSource === "webcam" && (
              <div style={{ position: "relative", width: "100%", height: isFullscreen ? "100%" : "auto", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <video
                  ref={webcamVideoRef}
                  autoPlay
                  playsInline
                  muted
                  style={{
                    width: "100%",
                    height: isFullscreen ? "100%" : "auto",
                    objectFit: isFullscreen ? "contain" : "initial",
                    display: "block"
                  }}
                />
                <canvas
                  ref={overlayCanvasRef}
                  style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none" }}
                />
              </div>
            )}

            {videoSource === "mobile" && (
              <div style={{ position: "relative", width: "100%", height: isFullscreen ? "100%" : "auto", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {mobileStatus === "connected" ? (
                  <>
                    <img
                      ref={mobileImgRef}
                      crossOrigin="anonymous"
                      alt="Mobile Camera Stream"
                      style={{
                        width: "100%",
                        height: isFullscreen ? "100%" : "auto",
                        objectFit: isFullscreen ? "contain" : "initial",
                        display: "block"
                      }}
                      onError={() => setMobileStatus("error")}
                    />
                    <canvas
                      ref={overlayCanvasRef}
                      style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none" }}
                    />
                  </>
                ) : mobileQrUrl ? (
                  <div style={{ textAlign: "center", padding: 16 }}>
                    <img
                      src={mobileQrUrl}
                      alt="QR Code to connect phone"
                      style={{ width: 180, height: 180, borderRadius: 10, background: "#fff", padding: 8 }}
                    />
                    <p style={{ color: "#fff", fontSize: 12.5, marginTop: 10, marginBottom: 0 }}>
                      📱 Open your phone's camera and scan the QR (use Google Lens to scan the QR Code)
                    </p>
                    {mobileStatus === "waiting" && (
                      <p style={{ color: "#FBBF24", fontSize: 11.5, marginTop: 4 }}>⏳ Waiting for the phone to connect...</p>
                    )}
                    {mobileStatus === "error" && (
                      <p style={{ color: "#F87171", fontSize: 11.5, marginTop: 4 }}>❌ Connection failed. Try generating a new QR.</p>
                    )}
                  </div>
                ) : null}
              </div>
            )}

            {!isSourceConnected && videoSource !== "mobile" && (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#aaa", textAlign: "center", padding: 20, background: "#000" }}>
                <div>
                  <p style={{ fontSize: 48, margin: 0 }}>📹</p>
                  <p>
                    {videoSource === "esp32"
                      ? (esp32Status === "connecting" ? "⏳ Connecting..." : 'Enter the camera IP and click "Connect" on the left first')
                      : (webcamStatus === "requesting" ? "⏳ Requesting camera permission..." : 'Click "Turn on camera" on the left first')}
                  </p>
                </div>
              </div>
            )}

            {!isSourceConnected && videoSource === "mobile" && !mobileQrUrl && (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#aaa", textAlign: "center", padding: 20, background: "#000" }}>
                <div>
                  <p style={{ fontSize: 48, margin: 0 }}>📱</p>
                  <p>Click "Generate a QR Code to connect your phone" on the left first, then scan it with your phone to get started.</p>
                </div>
              </div>
            )}

            {isSourceConnected && (
              <button
                onClick={handleToggleFullscreen}
                title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                style={{
                  position: "absolute",
                  top: 12,
                  right: 12,
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.25)",
                  background: "rgba(0,0,0,0.55)",
                  color: "#fff",
                  fontSize: 18,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  backdropFilter: "blur(2px)"
                }}
              >
                {isFullscreen ? "⤡" : "⛶"}
              </button>
            )}
          </div>

          <div style={{ background: "#fff", padding: 18, borderRadius: 14, border: "1px solid #E5E7EB" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
              <h3 style={{ margin: 0, fontSize: 15 }}>
                📋 Detected objects {isRunning && "(updating in real-time)"}
              </h3>
              <button
                disabled={!canStartScanning}
                onClick={() => setIsRunning((r) => !r)}
                style={{
                  padding: "10px 20px", borderRadius: 10, border: "none", fontWeight: "bold",
                  cursor: canStartScanning ? "pointer" : "not-allowed",
                  background: !canStartScanning ? "#ccc" : isRunning ? "#EF4444" : "#7C4DFF",
                  color: "#fff", whiteSpace: "nowrap"
                }}
              >
                {isRunning ? "⏹️ Stop scanning" : "▶️ Start scanning"}
              </button>
            </div>

            {Object.keys(detectionSummary).length === 0 ? (
              <p style={{ color: "#94A3B8", fontSize: 13, margin: 0 }}>
                {isRunning ? "No objects detected in this frame yet..." : "Scanning hasn't started yet"}
              </p>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {Object.entries(detectionSummary).map(([label, count]) => (
                  <div key={label} style={{ background: "#F4EFFF", color: "#5B2FD1", padding: "8px 14px", borderRadius: 999, fontSize: 13.5, fontWeight: "bold" }}>
                    {label} × {count}
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

      </div>
    </div>
  );
}