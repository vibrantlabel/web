import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const SERVER_URL = localStorage.getItem("cloud_url");

// ==========================================================
// 🏭 V3: Industry Template Presets
// Selecting one auto-fills knownClasses immediately (uses the same key
// DetectionCapture.jsx already reads: known_classes_${project})
// To add a new preset in the future, just add an object to this array —
// no need to change anything else.
// ==========================================================
const TEMPLATE_PRESETS = [
  {
    id: "ppe_safety",
    icon: "🦺",
    name: "PPE Safety",
    desc: "Detect safety equipment usage, e.g. helmets, vests",
    classes: ["helmet", "no_helmet"],
    color: { bg: "#FFF3E0", text: "#7C4A03" }
  },
  {
    id: "retail_counting",
    icon: "🛒",
    name: "Retail Counting",
    desc: "Count products / detect empty shelves",
    classes: ["product", "empty_shelf"],
    color: { bg: "#E3F2FD", text: "#0D47A1" }
  },
  {
    id: "defect_detection",
    icon: "🔍",
    name: "Defect Detection",
    desc: "Detect defects / rejects on the production line",
    classes: ["defect", "normal"],
    color: { bg: "#FFEBEE", text: "#B71C1C" }
  },
  {
    id: "custom",
    icon: "✨",
    name: "Custom",
    desc: "Fully custom setup (no preset classes)",
    classes: [],
    color: { bg: "#F5F5F5", text: "#424242" }
  }
];

// ==========================================================
// 🎯 V3: Deployment Target — automatically sets an appropriate
// default image size to avoid mismatched settings (e.g. setting 128px
// while targeting the cloud, or 640px while targeting an ESP32-S3 that
// simply can't run it). This only sets a *default* — it can still be
// changed later on the DetectionCapture.jsx page as usual; it's not locked.
// ==========================================================
const DEPLOYMENT_TARGETS = [
  // ☁️ Server-side
  {
    id: "cloud",
    category: "server",
    label: "☁️ Cloud / Server (API)",
    desc: "Highest accuracy, runs on a server with ample GPU/CPU",
    defaultSize: 640
  },
  {
    id: "web",
    category: "server",
    label: "🌐 Web Browser (TensorFlow.js)",
    desc: "Runs directly in the user's browser, no backend server needed",
    defaultSize: 416
  },

  // 📱 Mobile
  {
    id: "android",
    category: "mobile",
    label: "📱 Android (TFLite / NCNN)",
    desc: "Android mobile app, balances accuracy with speed/battery",
    defaultSize: 320
  },
  {
    id: "ios",
    category: "mobile",
    label: "🍎 iOS (Core ML)",
    desc: "iPhone/iPad mobile app, uses Apple's Core ML toolchain",
    defaultSize: 320
  },

  // 🖥️ Desktop
  {
    id: "desktop",
    category: "desktop",
    label: "🖥️ Desktop App (Windows/Mac/Linux)",
    desc: "App that runs on a regular PC, via ONNX Runtime",
    defaultSize: 640
  },

  // 🔌 Embedded / Edge
  {
    id: "microcontroller",
    category: "embedded",
    label: "📶 Microcontroller (ESP32, etc.)",
    desc: "Very limited RAM — needs the smallest size to run at all, no internet required",
    defaultSize: 160
  },
  {
    id: "raspberry_pi",
    category: "embedded",
    label: "🍓 Raspberry Pi / Linux SBC",
    desc: "Much more powerful than a microcontroller, runs via ONNX Runtime on ARM CPU",
    defaultSize: 320
  },
  {
    id: "coral_tpu",
    category: "embedded",
    label: "🔌 Edge TPU (Google Coral)",
    desc: "Dedicated AI accelerator chip, very fast but needs a specially compiled TFLite model",
    defaultSize: 300
  },
  {
    id: "jetson",
    category: "embedded",
    label: "🤖 NVIDIA Jetson (Industrial/Robotics)",
    desc: "GPU board for industrial/robotics use, supports larger models at speed",
    defaultSize: 640
  }
];

const DEPLOYMENT_CATEGORY_LABELS = {
  server: "☁️ Server-side",
  mobile: "📱 Mobile App",
  desktop: "🖥️ Desktop App",
  embedded: "🔌 Embedded / Edge Device"
};

const DEPLOYMENT_CATEGORY_ORDER = ["server", "mobile", "desktop", "embedded"];

// 🎨 Colors by category, so groups are clearly visible when the dropdown opens
// (used for both each <option> and the <select> box itself for the current value)
const DEPLOYMENT_CATEGORY_COLORS = {
  server: { bg: "#E3F2FD", text: "#0D47A1" },
  mobile: { bg: "#E8F5E9", text: "#1B5E20" },
  desktop: { bg: "#F3E5F5", text: "#4A148C" },
  embedded: { bg: "#FFF3E0", text: "#E65100" }
};

export default function EnCreateProject() {
  const navigate = useNavigate();

  const [projectName, setProjectName] = useState(
    localStorage.getItem("project_name") || ""
  );
  const [selectedTemplateId, setSelectedTemplateId] = useState(TEMPLATE_PRESETS[0].id);
  const [selectedDeploymentId, setSelectedDeploymentId] = useState(DEPLOYMENT_TARGETS[0].id);
  const [result, setResult] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ==========================================================
  // 💰 Project Quota: number of existing projects compared against
  // the current plan's limit. Pulled from 2 existing endpoints:
  // - /get_user_plan -> gives limits.maxProjects (Free=1, Starter/Pro/Business=null=unlimited)
  // - /get_projects_v2 -> gives the actual current project count (data.length)
  // Doesn't rely solely on the backend to block, since we want the user to
  // see the quota even before filling out the form.
  // (the backend /create_project_v2 still double-checks for safety — see
  // the comment on the app.py side)
  // ==========================================================
  const [planName, setPlanName] = useState(null);
  const [maxProjects, setMaxProjects] = useState(null); // null = not known yet / unlimited (check together with isCheckingQuota)
  const [currentProjectCount, setCurrentProjectCount] = useState(null);
  const [isCheckingQuota, setIsCheckingQuota] = useState(true);

  useEffect(() => {
    const email = localStorage.getItem("email");
    if (!SERVER_URL || !email) {
      setIsCheckingQuota(false);
      return;
    }

    let cancelled = false;

    (async () => {
      setIsCheckingQuota(true);
      try {
        const [planRes, projectsRes] = await Promise.all([
          fetch(`${SERVER_URL}/get_user_plan`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email })
          }),
          fetch(`${SERVER_URL}/get_projects_v2`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email })
          })
        ]);

        const planData = await planRes.json();
        const projectsData = await projectsRes.json();

        if (!cancelled) {
          if (planData.success) {
            setPlanName(planData.plan || "Free");
            // maxProjects: undefined/null both mean unlimited (Starter and above)
            const limit = planData.limits?.maxProjects;
            setMaxProjects(typeof limit === "number" ? limit : null);
          }
          if (projectsData.success) {
            setCurrentProjectCount((projectsData.data || []).length);
          }
        }
      } catch (err) {
        // 🆕 Intentionally fail-open: if the check fails, still allow creating
        // a project (the backend /create_project_v2 still enforces the real
        // quota either way).
        console.warn("Failed to check project quota (check skipped):", err);
      } finally {
        if (!cancelled) setIsCheckingQuota(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const isOverProjectLimit =
    maxProjects != null &&
    currentProjectCount != null &&
    currentProjectCount >= maxProjects;

  const inputStyle = {
    width: "100%",
    padding: "10px",
    fontSize: "16px",
    border: "1px solid #ccc",
    borderRadius: "8px",
    boxSizing: "border-box"
  };

  const buttonStyle = {
    backgroundColor: "#0078D7",
    color: "white",
    padding: "12px 24px",
    fontSize: "16px",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer"
  };

  const createProject = async () => {
    // 💰 Check quota before even sending the create request — avoids
    // wasting time filling out the form only to get blocked later
    // (the backend still double-checks anyway, in case the frontend check
    // is wrong).
    if (isOverProjectLimit) {
      setResult(
        `The ${planName} plan allows up to ${maxProjects} project(s) (you currently have ${currentProjectCount}). ` +
        `Please upgrade your plan to create more projects.`
      );
      return;
    }

    if (!projectName.trim()) {
      setResult("Please enter Project Name");
      return;
    }

    const trimmedName = projectName.trim();
    const selectedTemplate =
      TEMPLATE_PRESETS.find((t) => t.id === selectedTemplateId) || TEMPLATE_PRESETS[0];
    const selectedDeployment =
      DEPLOYMENT_TARGETS.find((d) => d.id === selectedDeploymentId) || DEPLOYMENT_TARGETS[0];

    try {
      setIsSubmitting(true);
      setResult("Creating project...");

      // V3: also send deployment_target (stored in the Firestore project doc,
      // in case the future Train Model page needs to validate imgsz against
      // the actual target).
      const payload = {
        email: localStorage.getItem("email"),
        project: trimmedName,
        deployment_target: selectedDeployment.id
      };

      const response = await fetch(`${SERVER_URL}/create_project_v2`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      console.log(data);

      if (response.ok && (data.success === true || data.status === "success")) {
        localStorage.setItem("project_name", trimmedName);

        // 🏭 V3: Prefill known classes from the selected template (if any).
        // Uses the same key DetectionCapture.jsx already reads
        // (known_classes_${project}).
        if (selectedTemplate.classes.length > 0) {
          localStorage.setItem(
            `known_classes_${trimmedName}`,
            JSON.stringify(selectedTemplate.classes)
          );
        }

        // 🎯 V3: Prefill the default image size based on the selected
        // deployment target (same key DetectionCapture.jsx already reads:
        // resolution_target_${project}).
        localStorage.setItem(
          `resolution_target_${trimmedName}`,
          JSON.stringify(selectedDeployment.defaultSize)
        );

        // Remember the deployment target per project (used to validate
        // imgsz later on DetectionCapture.jsx / DetSegTrain.jsx).
        localStorage.setItem(`deployment_target_${trimmedName}`, selectedDeployment.id);

        navigate("/");
      } else if (response.status === 403 && data.quotaExceeded) {
        // 💰 Backend blocked because maxProjects for the plan was exceeded
        // (server-side double-check).
        setResult(data.message || "You've reached the maximum number of projects for this plan.");
      } else {
        setResult(data.message || data.error || "Create failed");
      }
    } catch (err) {
      console.error(err);
      setResult(err.message || "Network Error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: "800px", margin: "20px auto", padding: "20px" }}>
      {/* Back Button */}
      <button
        onClick={() => navigate("/")}
        style={{ ...buttonStyle, backgroundColor: "#666", marginBottom: "20px" }}
      >
        ← Back
      </button>

      <h2>📁 Create Project</h2>

      {/* 💰 Card showing the current plan's project quota — shown before the form always */}
      {!isCheckingQuota && maxProjects != null && (
        <div
          style={{
            background: isOverProjectLimit ? "#fdecea" : "#eef3fb",
            border: `1px solid ${isOverProjectLimit ? "#f5c2c0" : "#cfe0f5"}`,
            borderRadius: 10,
            padding: "10px 15px",
            marginTop: 15,
            marginBottom: 10,
            fontSize: 13,
            color: isOverProjectLimit ? "#a12622" : "#2c5282"
          }}
        >
          💰 Plan <b>{planName}</b> — you have <b>{currentProjectCount}</b> / {maxProjects} project(s)
          {isOverProjectLimit && " — Limit reached. Please upgrade your plan to create more projects."}
        </div>
      )}

      {!isCheckingQuota && maxProjects == null && planName && (
        <div
          style={{
            background: "#eef3fb",
            border: "1px solid #cfe0f5",
            borderRadius: 10,
            padding: "10px 15px",
            marginTop: 15,
            marginBottom: 10,
            fontSize: 13,
            color: "#2c5282"
          }}
        >
          💰 Plan <b>{planName}</b> — unlimited projects
          {currentProjectCount != null && ` (currently have ${currentProjectCount} project(s))`}
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "150px 1fr",
          gap: "15px",
          alignItems: "center",
          marginTop: "20px"
        }}
      >
        <label>Project Name:</label>
        <input
          style={inputStyle}
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          placeholder="Enter project name"
          disabled={isOverProjectLimit}
        />
      </div>

      {/* ========================================================
          🏭 V3: Choose an Industry Template Preset
      ======================================================== */}
      <h4 style={{ marginTop: 25, marginBottom: 10, fontSize: 15, color: "#333" }}>
        🏭 Choose a Template (auto-fills class names)
      </h4>
      <select
        value={selectedTemplateId}
        onChange={(e) => setSelectedTemplateId(e.target.value)}
        disabled={isOverProjectLimit}
        style={{
          ...inputStyle,
          cursor: "pointer",
          marginBottom: 10,
          backgroundColor:
            TEMPLATE_PRESETS.find((tpl) => tpl.id === selectedTemplateId)?.color.bg || "#fff",
          color:
            TEMPLATE_PRESETS.find((tpl) => tpl.id === selectedTemplateId)?.color.text || "#000",
          fontWeight: 600
        }}
      >
        {TEMPLATE_PRESETS.map((tpl) => (
          <option
            key={tpl.id}
            value={tpl.id}
            style={{ backgroundColor: tpl.color.bg, color: tpl.color.text }}
          >
            {tpl.icon} {tpl.name}
          </option>
        ))}
      </select>

      {/* 📝 Description + class list of the currently selected template
          (kept separate from <select> since <option> can't show long descriptions) */}
      {(() => {
        const selectedTemplate = TEMPLATE_PRESETS.find(
          (tpl) => tpl.id === selectedTemplateId
        );
        if (!selectedTemplate) return null;
        return (
          <div
            style={{
              background: "#f0f4fa",
              border: "1px solid #d5e0ee",
              borderRadius: 8,
              padding: "8px 12px",
              color: "#3a4a5e",
              fontSize: 12,
              lineHeight: 1.6
            }}
          >
            💡 {selectedTemplate.desc}
            {selectedTemplate.classes.length > 0 && (
              <> — Classes: <b>{selectedTemplate.classes.join(", ")}</b></>
            )}
          </div>
        );
      })()}

      {/* ========================================================
          🎯 V3: Choose a Deployment Target
      ======================================================== */}
      <h4 style={{ marginTop: 25, marginBottom: 10, fontSize: 15, color: "#333" }}>
        🎯 Where will the model be deployed? (auto-sets a default image size)
      </h4>
      <select
        value={selectedDeploymentId}
        onChange={(e) => setSelectedDeploymentId(e.target.value)}
        disabled={isOverProjectLimit}
        style={{
          ...inputStyle,
          cursor: "pointer",
          marginBottom: 10,
          backgroundColor:
            DEPLOYMENT_CATEGORY_COLORS[
              DEPLOYMENT_TARGETS.find((dep) => dep.id === selectedDeploymentId)?.category
            ]?.bg || "#fff",
          color:
            DEPLOYMENT_CATEGORY_COLORS[
              DEPLOYMENT_TARGETS.find((dep) => dep.id === selectedDeploymentId)?.category
            ]?.text || "#000",
          fontWeight: 600
        }}
      >
        {DEPLOYMENT_CATEGORY_ORDER.map((category) => (
          <optgroup key={category} label={DEPLOYMENT_CATEGORY_LABELS[category]}>
            {DEPLOYMENT_TARGETS.filter((dep) => dep.category === category).map((dep) => (
              <option
                key={dep.id}
                value={dep.id}
                style={{
                  backgroundColor: DEPLOYMENT_CATEGORY_COLORS[category].bg,
                  color: DEPLOYMENT_CATEGORY_COLORS[category].text
                }}
              >
                {dep.label} — {dep.defaultSize}px
              </option>
            ))}
          </optgroup>
        ))}
      </select>

      {/* 📝 Description of the currently selected option (kept separate from
          <select> since <option> can't show long descriptions) */}
      {(() => {
        const selectedDeployment = DEPLOYMENT_TARGETS.find(
          (dep) => dep.id === selectedDeploymentId
        );
        if (!selectedDeployment) return null;
        return (
          <div
            style={{
              background: "#f0f4fa",
              border: "1px solid #d5e0ee",
              borderRadius: 8,
              padding: "8px 12px",
              color: "#3a4a5e",
              fontSize: 12,
              lineHeight: 1.6
            }}
          >
            💡 {selectedDeployment.desc} — default image size {selectedDeployment.defaultSize}px
          </div>
        );
      })()}

      <button
        onClick={createProject}
        disabled={isSubmitting || isOverProjectLimit}
        style={{
          ...buttonStyle,
          marginTop: "25px",
          width: "100%",
          height: "50px",
          backgroundColor: isOverProjectLimit ? "#9fc4e0" : buttonStyle.backgroundColor,
          opacity: isSubmitting ? 0.7 : 1,
          cursor: isSubmitting || isOverProjectLimit ? "not-allowed" : "pointer"
        }}
      >
        {isOverProjectLimit
          ? "🔒 Project limit reached — Upgrade plan"
          : isSubmitting
          ? "Creating..."
          : "Create Project"}
      </button>

      <div
        style={{
          marginTop: "15px",
          color:
            result.includes("failed") ||
            result.includes("Invalid") ||
            result.includes("Please") ||
            result.includes("upgrade")
              ? "red"
              : "green"
        }}
      >
        {result}
      </div>
    </div>
  );
}