import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

// ==========================================================
// Export/Train Format Registry (Object Detection / Segmentation)
// ==========================================================
const FORMAT_OPTIONS = [
  {
    value: "yolo",
    label: "YOLO format (.txt) — Train for real",
    desc: "Actually train a YOLOv8 model on the server, then download the .pt file to use right away"
  },
  {
    value: "yolo_export",
    label: "YOLO format (.txt) — Export only",
    desc: "Export as a .zip (images + labels/*.txt + data.yaml) with the standard YOLOv8 structure — ready to train yourself on another machine or Colab, no GPU used on our side"
  },
  {
    value: "coco",
    label: "COCO format (.json) — Export only",
    desc: "Automatic training not yet supported — you'll get a .zip (images + annotations.json) to train yourself with Detectron2/MMDetection"
  },
  {
    value: "csv",
    label: "CSV (Annotations + Image Links) — Export only",
    desc: "Export annotations with image links (image_url/gcs_uri) and normalized 0-1 coordinates — usable for external training (e.g. Vertex AI), no GPU required"
  }
];

const EDGE_FORMAT_OPTIONS = [
  {
    value: "onnx",
    label: "ONNX — Raspberry Pi / General PC",
    desc: "The most widely compatible option — works with Python (onnxruntime), C++, .NET, or any general server, even without a GPU"
  },
  {
    value: "tflite",
    label: "TFLite — Coral TPU / Mobile (Android)",
    desc: "Great for Android mobile apps or Edge TPU devices (Google Coral) — small file size, fast processing on portable devices"
  },
  {
    value: "tfjs",
    label: "TF.js — Web Browser / Node.js",
    desc: "Runs directly in the web browser with no backend server needed, or can be used with Node.js on the server side"
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

let cachedExportServiceUrl;

async function resolveExportServerUrl(trainServerUrl) {
  if (cachedExportServiceUrl !== undefined) return cachedExportServiceUrl;
  try {
    const cleanUrl = trainServerUrl.replace(/\/$/, "");
    const res = await fetch(`${cleanUrl}/app_config`);
    const data = await res.json();
    cachedExportServiceUrl = data?.export_service_url || null;
  } catch (err) {
    console.error("Failed to fetch export service config:", err);
    cachedExportServiceUrl = null;
  }
  return cachedExportServiceUrl;
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
    const res = await fetch(`${cleanUrl}/app_config`);
    const data = await res.json();
    cachedTrainServiceUrl = data?.train_service_url || null;
  } catch (err) {
    console.error("Failed to fetch train service config:", err);
    cachedTrainServiceUrl = null;
  }
  return cachedTrainServiceUrl;
}

async function getTrainServerUrl(cloudUrl) {
  const dedicated = await resolveTrainServerUrl(cloudUrl);
  return dedicated || cloudUrl;
}

function formatDuration(totalSeconds) {
  if (totalSeconds == null || isNaN(totalSeconds)) return "-";
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m === 0) return `${sec} sec`;
  return `${m} min ${sec} sec`;
}

// ==========================================================
// 🆕 Number of consecutive poll failures allowed before considering the
// connection "actually lost". Polling happens every 3s, so 5 failures =
// ~15 seconds of retrying before giving up and unlocking the Train button
// again (this prevents a brief network blip from being mistaken for a
// failed training run when the backend is actually still training fine)
// ==========================================================
const MAX_CONSECUTIVE_POLL_FAILS = 5;

export default function EnDetSegTrain() {
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
      // In case it was never set on the DetectionCapture page -> use the default
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

  // 🆕 Counter for consecutive poll failures (kept in a ref since it doesn't
  // need to trigger a re-render), plus state for showing a "reconnecting"
  // banner while we haven't given up yet
  const pollFailCountRef = useRef(0);
  const [connectionIssue, setConnectionIssue] = useState(false);

  const [edgeFormat, setEdgeFormat] = useState("onnx");
  const [edgeStatus, setEdgeStatus] = useState({ status: "idle", progress: 0 });
  const edgePollRef = useRef(null);

  const [isCheckingModel, setIsCheckingModel] = useState(true);
  const [isDownloadingModel, setIsDownloadingModel] = useState(false);
  const [isDownloadingEdge, setIsDownloadingEdge] = useState(false);

  const [lastTrainingMeta, setLastTrainingMeta] = useState(null);

  const currentPlan = getCurrentPlan();
  const quotaConfig = PLAN_TRAINING_CONFIG[currentPlan] || PLAN_TRAINING_CONFIG.Free;
  const [usedThisMonth, setUsedThisMonth] = useState(null);
  const [isCheckingQuota, setIsCheckingQuota] = useState(true);

  const remainingQuota =
    usedThisMonth == null || !Number.isFinite(quotaConfig.monthlyQuota)
      ? null
      : Math.max(0, quotaConfig.monthlyQuota - usedThisMonth);
  const isOverQuota = remainingQuota !== null && remainingQuota <= 0;

  useEffect(() => {
    if (project) {
      localStorage.setItem("selected_det_seg_project", JSON.stringify(project));
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (edgePollRef.current) clearInterval(edgePollRef.current);
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

        const response = await fetch(`${cleanServerUrl}/get_training_usage`, {
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

        const response = await fetch(`${cleanServerUrl}/check_trained_model`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, project: project.project })
        });

        const result = await response.json();
        if (!cancelled && result.success && result.exists) {
          setTrainStatus({
            status: "done",
            progress: 100,
            classes: result.classes || []
          });

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
  // 🆕 Check the status of a training run that is "actually still running"
  // every time this page is loaded/reloaded (separate from the
  // check_trained_model effect above, which only checks for models that
  // have already "finished" training). Scenario this fixes: the user
  // clicks Train, the network drops partway through (e.g. at 85% progress),
  // so the client sees it as "error/idle" — but the backend never knew the
  // network dropped and **keeps training all the way to completion**. If
  // the user reloads the page at that point (or comes back later), this
  // page must always ask /train_det_seg_status first: "is the server
  // currently training anything for this project?" If it's still
  // running/starting -> sync the status (progress, elapsed) back and show
  // it immediately, instead of letting the user see an empty "Train"
  // button and click it again.
  // ==========================================================
  useEffect(() => {
    if (!project || !SERVER_URL || !email) return;

    let cancelled = false;

    (async () => {
      try {
        const trainServerUrl = await getTrainServerUrl(SERVER_URL);
        const cleanServerUrl = trainServerUrl.replace(/\/$/, "");
        const response = await fetch(`${cleanServerUrl}/train_det_seg_status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, project: project.project, taskType })
        });
        const s = await response.json();

        if (!cancelled && (s.status === "starting" || s.status === "running")) {
          resumeTrackingActiveTraining(s);
        }
      } catch (err) {
        // Check failed (e.g. the backend has never had a status for this
        // project, or a temporary error) -> fail silently, no need to
        // bother the user. Treat it as "no training in progress".
        console.warn("Failed to check active training status on load:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project]);

  // 🆕 Central function: sync the UI with the training status that is
  // "actually currently running" on the server, then start/resume polling
  // right away. Used both when checking on page load and when re-clicking Train.
  const resumeTrackingActiveTraining = (s) => {
    pollFailCountRef.current = 0;
    setConnectionIssue(false);
    setTrainStatus(s);

    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }

    const startingElapsed = s.elapsed_seconds ?? 0;
    clientStartRef.current = Date.now() - startingElapsed * 1000;
    setLocalElapsed(startingElapsed);
    tickRef.current = setInterval(() => {
      setLocalElapsed(Math.floor((Date.now() - clientStartRef.current) / 1000));
    }, 1000);

    pollTrainStatus();
  };

  if (!project) {
    return (
      <div style={{ padding: 20 }}>
        <h2>Project Not Found</h2>
        <p>
          Couldn't find the selected project. Please go back to the Projects
          page and select a project again.
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
      setExportMsg({ type: "error", text: "Please check your Cloud URL settings and make sure you're logged in." });
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
        setExportMsg({ type: "error", text: errData?.message || "Export failed" });
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

      setExportMsg({ type: "success", text: `✅ Export successful! Downloaded ${project.project}_${taskType}_coco.zip` });
    } catch (err) {
      console.error(err);
      setExportMsg({ type: "error", text: "Couldn't connect to the server. Please check your network." });
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportCsv = async () => {
    if (!SERVER_URL || !email) {
      setExportMsg({ type: "error", text: "Please check your Cloud URL settings and make sure you're logged in." });
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
        setExportMsg({ type: "error", text: errData?.message || "Export failed" });
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

      setExportMsg({ type: "success", text: `✅ Export successful! Downloaded ${project.project}_${taskType}.csv` });
    } catch (err) {
      console.error(err);
      setExportMsg({ type: "error", text: "Couldn't connect to the server. Please check your network." });
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportYolo = async () => {
    if (!SERVER_URL || !email) {
      setExportMsg({ type: "error", text: "Please check your Cloud URL settings and make sure you're logged in." });
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
        setExportMsg({ type: "error", text: errData?.message || "Export failed" });
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

      setExportMsg({ type: "success", text: `✅ Export successful! Downloaded ${project.project}_${taskType}_yolo.zip` });
    } catch (err) {
      console.error(err);
      setExportMsg({ type: "error", text: "Couldn't connect to the server. Please check your network." });
    } finally {
      setIsExporting(false);
    }
  };

  const startTraining = async () => {
    if (!SERVER_URL || !email) {
      setTrainStatus({ status: "error", message: "Please check your Cloud URL settings and make sure you're logged in." });
      return;
    }

    // ==========================================================
    // 🆕 Prevent duplicate training jobs (the most important fix here):
    // Before firing /train_det_seg to start a new job every time, always
    // ask the backend first "is there actually a training job for this
    // project running right now?" — because if the network drops mid-training
    // (e.g. at 85% progress), the client sees error/idle even though the
    // backend never stopped and keeps training to completion on its own.
    // Without this check, the user clicking Train again would fire a second
    // job overlapping with the first, unfinished one. If a job really is
    // still running -> sync the current status back instead of starting fresh.
    // ==========================================================
    try {
      const trainServerUrl = await getTrainServerUrl(SERVER_URL);
      const cleanServerUrl = trainServerUrl.replace(/\/$/, "");
      const checkRes = await fetch(`${cleanServerUrl}/train_det_seg_status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, project: project.project, taskType })
      });
      const currentStatus = await checkRes.json();

      if (currentStatus.status === "starting" || currentStatus.status === "running") {
        alert(
          "A training run for this project is already in progress on the server " +
          "(this may be a previous run where the network dropped, but the server kept training).\n\n" +
          "The current progress of that job will be shown instead of starting a new, duplicate run."
        );
        resumeTrackingActiveTraining(currentStatus);
        return;
      }
    } catch (err) {
      // Status check failed (e.g. network hasn't actually recovered yet)
      // -> notify the user instead of silently starting a new training run,
      // since doing that without knowing the real status risks a duplicate.
      console.warn("Pre-check training status failed:", err);
      alert("Couldn't check the current training status from the server. Please check your connection and try again.");
      return;
    }

    if (isOverQuota) {
      if (quotaConfig.overagePrice === null) {
        const msg =
          quotaConfig.monthlyQuota === 0
            ? `The ${currentPlan} plan doesn't include model training.\nPlease upgrade to Starter or higher to train.`
            : `You've used all ${quotaConfig.monthlyQuota} training runs included in the ${currentPlan} plan this month.\nPlease upgrade your plan to keep training.`;
        alert(msg);
        return;
      }

      const confirmed = window.confirm(
        `You've used up your free training quota for the ${currentPlan} plan (${quotaConfig.monthlyQuota} runs/month).\n` +
        `This training run will incur an additional charge of $${quotaConfig.overagePrice.toFixed(2)}\n\n` +
        `Do you want to continue?`
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
    setConnectionIssue(false);
    setTrainStatus({ status: "starting", progress: 0 });

    if (tickRef.current) clearInterval(tickRef.current);
    clientStartRef.current = Date.now();
    setLocalElapsed(0);
    tickRef.current = setInterval(() => {
      setLocalElapsed(Math.floor((Date.now() - clientStartRef.current) / 1000));
    }, 1000);

    try {
      const trainServerUrl = await getTrainServerUrl(SERVER_URL);
      const cleanServerUrl = trainServerUrl.replace(/\/$/, "");

      const response = await fetch(`${cleanServerUrl}/train_det_seg`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          project: project.project,
          taskType,
          format: "yolo",
          imgsz: getProjectTargetImgsz()
        })
      });

      const result = await response.json();

      if (!result.success) {
        if (tickRef.current) {
          clearInterval(tickRef.current);
          tickRef.current = null;
        }
        setTrainStatus({ status: "error", message: result.message || "Training failed to start" });
        return;
      }

      setUsedThisMonth((prev) => (prev == null ? 1 : prev + 1));

      pollTrainStatusOnce();
      pollTrainStatus();
    } catch (err) {
      console.error(err);
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
      setTrainStatus({ status: "error", message: "Training failed to start" });
    }
  };

  const pollTrainStatusOnce = async () => {
    try {
      const trainServerUrl = await getTrainServerUrl(SERVER_URL);
      const cleanServerUrl = trainServerUrl.replace(/\/$/, "");
      const response = await fetch(`${cleanServerUrl}/train_det_seg_status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, project: project.project, taskType })
      });
      const s = await response.json();
      setTrainStatus(s);
    } catch (err) {
      console.error(err);
    }
  };

  // ==========================================================
  // 🆕 Make pollTrainStatus "tolerant of temporary network drops" instead
  // of giving up immediately.
  // Before: one dropped connection -> clear the interval + set status to
  // "error" right away, unlocking the Train button prematurely even though
  // the backend was still training fine.
  //
  // Now: if a poll fails, trainStatus is left unchanged (still
  // running/starting, so the Train button doesn't unlock early) and a
  // "reconnecting" banner is shown instead, retrying every 3s until
  // MAX_CONSECUTIVE_POLL_FAILS is reached (~15s) before finally treating it
  // as a real disconnect and reporting an error. If the connection comes
  // back before that limit, the real status from the server is synced back
  // immediately with no action needed from the user (this is the desired
  // "resume from server" behavior).
  // ==========================================================
  const pollTrainStatus = () => {
    if (pollRef.current) clearInterval(pollRef.current);

    pollRef.current = setInterval(async () => {
      try {
        const trainServerUrl = await getTrainServerUrl(SERVER_URL);
        const cleanServerUrl = trainServerUrl.replace(/\/$/, "");
        const response = await fetch(`${cleanServerUrl}/train_det_seg_status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, project: project.project, taskType })
        });

        const s = await response.json();

        // Connected successfully -> reset the failure counter and hide the banner immediately
        pollFailCountRef.current = 0;
        setConnectionIssue(false);
        setTrainStatus(s);

        if (s.status === "done" || s.status === "error") {
          clearInterval(pollRef.current);
          pollRef.current = null;

          if (tickRef.current) {
            clearInterval(tickRef.current);
            tickRef.current = null;
          }
        }
      } catch (err) {
        pollFailCountRef.current += 1;
        console.warn(`Poll connection failed (attempt ${pollFailCountRef.current}):`, err);

        if (pollFailCountRef.current >= MAX_CONSECUTIVE_POLL_FAILS) {
          // Reached the max number of retries without success -> treat as a
          // real disconnect and stop polling
          clearInterval(pollRef.current);
          pollRef.current = null;
          if (tickRef.current) {
            clearInterval(tickRef.current);
            tickRef.current = null;
          }
          setConnectionIssue(false);
          setTrainStatus({ status: "error", message: "Connection lost" });
        } else {
          // Not giving up yet — leave trainStatus as-is (running/starting)
          // so the Train button doesn't unlock early, just show the warning banner instead
          setConnectionIssue(true);
        }
      }
    }, 3000);
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

  const startEdgeExport = async () => {
    const exportServerUrl = await getExportServerUrl(SERVER_URL);

    if (!exportServerUrl || !email) {
      setEdgeStatus({ status: "error", message: "Please check your Cloud URL settings and make sure you're logged in." });
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
    } else {
      startTraining();
    }
  };

  const visibleFormatOptions = FORMAT_OPTIONS;
  const isExportFormat = format === "coco" || format === "csv" || format === "yolo_export";
  const isBlockedByQuota = isOverQuota && quotaConfig.overagePrice === null;

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
            <>🔒 The <b>{currentPlan}</b> plan allows data (dataset) collection, but doesn't include model training — please upgrade to Starter or higher to train.</>
          ) : usedThisMonth == null ? (
            <>💰 Current plan: <b>{currentPlan}</b></>
          ) : Number.isFinite(quotaConfig.monthlyQuota) ? (
            <>
              💰 Plan <b>{currentPlan}</b> — trained <b>{usedThisMonth}</b> / {quotaConfig.monthlyQuota} times this month
              {isBlockedByQuota && " — Quota reached. Please upgrade your plan to keep training."}
              {isOverQuota && !isBlockedByQuota && ` — the next training run will incur an additional $${quotaConfig.overagePrice.toFixed(2)} charge`}
            </>
          ) : (
            <>💰 Plan <b>{currentPlan}</b> — unlimited training ({usedThisMonth} runs so far this month)</>
          )}
        </div>
      )}

      {/* 🆕 Banner shown during a temporary network drop while polling —
          appears instead of making the page look like training failed
          instantly. Lets the user know the system is trying to reconnect,
          not that the training job has been lost. */}
      {connectionIssue && (
        <div
          style={{
            background: "#fff8e1",
            border: "1px solid #ffe082",
            borderRadius: 10,
            padding: "10px 15px",
            color: "#8a6d00",
            marginBottom: 20,
            fontSize: 13
          }}
        >
          ⚠️ Connection to the server was temporarily lost. Reconnecting... (the training job on the server is still running)
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

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          marginBottom: 20
        }}
      >
        {visibleFormatOptions.map((opt) => {
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
          ⚠️ The COCO format doesn't support automatic training yet — the button
          below will export the dataset as a .zip for you to train yourself with other tools.
        </div>
      )}

      {format === "csv" && (
        <div
          style={{
            background: "#eef3fb",
            border: "1px solid #cfe0f5",
            borderRadius: 10,
            padding: "12px 16px",
            color: "#2c5282",
            marginBottom: 20,
            fontSize: 13,
            lineHeight: 1.6
          }}
        >
          ℹ️ The CSV format exports annotations with image links (image_url + gcs_uri)
          and normalized 0-1 coordinates — usable for external training (e.g. Vertex AI
          Object Detection can use the gcs_uri directly). Available on every plan, including Free.
        </div>
      )}

      {format === "yolo_export" && (
        <div
          style={{
            background: "#eef3fb",
            border: "1px solid #cfe0f5",
            borderRadius: 10,
            padding: "12px 16px",
            color: "#2c5282",
            marginBottom: 20,
            fontSize: 13,
            lineHeight: 1.6
          }}
        >
          ℹ️ Exports a .zip following the standard YOLOv8 structure (images/ + labels/*.txt + data.yaml)
          — ready to train immediately with <code>yolo train data=data.yaml ...</code>
          on your own machine or Google Colab. Available on every plan, including Free.
        </div>
      )}

      {format === "yolo" && (
        <p style={{ fontSize: 12, color: "#0078D7", marginTop: 0, marginBottom: 10 }}>
          🎯 Will train with image size (imgsz): <b>{getProjectTargetImgsz()}px</b>
          {" "}(set this on the capture page — "🎯 Set the ideal image size for your deployment")
        </p>
      )}

      <button
        onClick={handlePrimaryAction}
        disabled={isExportFormat ? isExporting : (isTrainBusy || isBlockedByQuota)}
        style={{
          backgroundColor: (isExportFormat ? isExporting : (isTrainBusy || isBlockedByQuota)) ? "#9fc4e0" : "#0078D7",
          color: "white",
          padding: "10px 20px",
          border: "none",
          borderRadius: 8,
          fontSize: 15,
          cursor: (isExportFormat ? isExporting : (isTrainBusy || isBlockedByQuota)) ? "not-allowed" : "pointer",
          marginBottom: 20
        }}
      >
        {format === "coco"
          ? (isExporting ? "⌛ Please wait.. Exporting" : "📦 Export Dataset (COCO)")
          : format === "csv"
          ? (isExporting ? "⌛ Please wait.. Exporting" : "⬇️ Download CSV")
          : format === "yolo_export"
          ? (isExporting ? "⌛ Please wait.. Exporting" : "⬇️ Download YOLO Format (.zip)")
          : isBlockedByQuota
          ? (quotaConfig.monthlyQuota === 0 ? "🔒 Upgrade plan to train" : "🔒 Quota reached — Upgrade plan")
          : (isTrainBusy ? "⌛ Please wait.. Training" : "🚀 Train (YOLOv8)")}
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
          🔍 Checking model status, please wait..
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
            ⏱️ Total time elapsed before stopping: {formatDuration(status.duration_seconds)}
          </div>
        )}
      </div>
    );
  }

  const pct = status.progress || 0;
  const edgeBusy = edgeStatus.status === "starting" || edgeStatus.status === "running";
  const edgeDone = edgeStatus.status === "done";

  const elapsed = status.elapsed_seconds ?? localElapsed;
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
            ? "⏳ Starting up, please wait.."
            : "⏳ Training in progress, please wait.. (YOLOv8 on GPU can take several minutes)"}
             
        </span>
        <span>
          {pct}%
          {status.total_images != null ? ` · ${status.total_images} images` : ""}
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
          <span>⏱️ Time elapsed: {formatDuration(elapsed)}</span>
          {timeoutLimit != null && (
            <span>
              {nearTimeout ? "⚠️ Approaching the maximum time limit — " : ""}
              Maximum limit {formatDuration(timeoutLimit)}
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
          ⏱️ Total training time: <b>{formatDuration(doneDuration)}</b>
          {imgszUsed != null && (
            <> &nbsp;|&nbsp; 📐 Trained with imgsz: <b>{imgszUsed}×{imgszUsed}</b></>
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
            {isDownloadingModel ? "⌛ Please wait.. Downloading" : "⬇️ Download Model (.pt / YOLO-PyTorch)"}
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
              📱 Export for Edge — ONNX / TFLite / TF.js (available on every plan)
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
                ? `⌛ Please wait.. Exporting (${edgeStatus.progress || 0}%)`
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
                  ? "⌛ Please wait.. Downloading"
                  : `⬇️ Download ${EDGE_FORMAT_DISPLAY_NAMES[edgeFormat] || edgeFormat.toUpperCase()} Model`}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}