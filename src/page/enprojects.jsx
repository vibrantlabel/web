import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

export default function EnProjects() {
  const SERVER_URL = localStorage.getItem("cloud_url");
  const navigate = useNavigate();
  const email = localStorage.getItem("email");

  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  // ==========================================================
  // 🆕 Plan usage/limits — used to check the image quota before
  // clicking "Add Data". Pulled from the same backend endpoint
  // Dashboard.jsx uses (user/{email}/plan/select)
  // ==========================================================
  const [planUsage, setPlanUsage] = useState(null);
  const [planLimits, setPlanLimits] = useState(null);

  const smallButton = {
    backgroundColor: "#0078D7",
    color: "white",
    padding: "8px 16px",
    fontSize: "clamp(12px, 3vw, 14px)",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    height: "38px",
    fontWeight: "bold",
    whiteSpace: "nowrap"
  };

  const dangerButton = {
    ...smallButton,
    backgroundColor: "#DC3545"
  };

  // 🆕 Add Data button when quota is full — grey with not-allowed cursor,
  // to make it obvious it can't be clicked
  const disabledButton = {
    ...smallButton,
    backgroundColor: "#ccc",
    cursor: "not-allowed"
  };

  // Load project data the first time the page loads (no tabs to switch anymore)
  useEffect(() => {
    loadProjects();
    loadUserPlan(); // 🆕 Load usage/limits at the same time to check the quota
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadProjects = async () => {
    try {
      setLoading(true);
      setProjects([]);

      const response = await fetch(`${SERVER_URL}/get_projects_v2`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });

      const result = await response.json();
      console.log("[DEBUG] Project data received:", result);

      if (result.success) {
        setProjects(result.data || []);
      } else {
        console.error("Backend reported an error:", result.error);
        setProjects([]);
      }
    } catch (error) {
      console.error("Error loading projects:", error);
      setProjects([]);
    } finally {
      setLoading(false);
    }
  };

  // ==========================================================
  // 🆕 Load usage/limits for the current plan from user/{email}/plan/select
  // (same endpoint Dashboard.jsx calls) to check whether the image quota
  // has been exceeded
  // ==========================================================
  const loadUserPlan = async () => {
    if (!SERVER_URL || !email) return;
    try {
      const response = await fetch(`${SERVER_URL}/get_user_plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      const result = await response.json();
      if (result.success) {
        setPlanUsage(result.usage || null);
        setPlanLimits(result.limits || null);
      }
    } catch (err) {
      console.error("LOAD USER PLAN FAILED:", err);
      // If loading fails, leave it as null -> isQuotaExceeded will automatically
      // be false (better not to block usage over a failed quota check than to
      // disable the button for an unknown reason)
    }
  };

  // 🆕 Determine whether image usage has exceeded the plan's quota.
  // Only counts as exceeded if limits.maxImages has a real value (not 0/undefined,
  // which may mean "unlimited")
  const isQuotaExceeded =
    !!planLimits?.maxImages && (planUsage?.totalImages ?? 0) >= planLimits.maxImages;

  // ==========================================================
  // Add Data -> goes to /detection-capture (uses the same layout previously
  // used for the old Detection/Segmentation tabs, since bbox/polygon per
  // object is now chosen directly on the capture page — no need for
  // separate pages per type anymore)
  // ==========================================================
  const handleAddData = (project) => {
  if (isQuotaExceeded) {
    alert(
        `You've used up your plan's image quota (${planUsage.totalImages}/${planLimits.maxImages} images)\n` +
        `Please upgrade your plan to increase your image quota`
      );
    return;
  }

  localStorage.setItem("project_name", project.project);
  localStorage.setItem("total_images", project.total_images || 0);

  navigate("/endetection-capture", {
    state: { planUsage, planLimits }   // ✅ Pass along the state already available on this page
  });
};

  const goToSelectTraining = (project) => {
    navigate("/enpage_train_export", {
      state: { project }
    });
  };

  const deleteProject = async (project) => {
    if (!window.confirm(`Are you sure you want to delete the project "${project.project}"? All data will be permanently deleted.`)) return;
    try {
      const response = await fetch(`${SERVER_URL}/delete_project`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, project: project.project })
      });
      const result = await response.json();
      if (result.status === "ok") {
        alert("Project deleted");
        loadProjects();
      } else {
        alert(result.message || "Delete failed");
      }
    } catch (err) {
      console.error(err);
      alert("Delete project failed");
    }
  };

  return (
    <div style={{ width: "100%", maxWidth: 1200, margin: "0 auto", padding: "clamp(12px, 4vw, 20px)", boxSizing: "border-box" }}>

      {/* Header with main system controls */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 15 }}>
        <h2 style={{ margin: 0, fontSize: "clamp(18px, 4.5vw, 22px)" }}>📂 Project Workspace</h2>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => navigate("/")} style={{ ...smallButton, backgroundColor: "#666" }}>🏠 Home</button>
          <button onClick={loadProjects} style={smallButton}>🔄 Refresh</button>
        </div>
      </div>

      {/* 🆕 Quota-full warning banner — shown at the top of the page so it's
          visible right away, without needing to click a button first */}
      {isQuotaExceeded && (
        <div style={{
          background: "#FFF4E0", border: "1px solid #F0C36D", borderRadius: 10,
          padding: "12px 16px", marginBottom: 20, fontSize: 13.5, color: "#8A5A00",
          display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap"
        }}>
          <span>⚠️</span>
          <span>
            You've used up your image quota ({planUsage.totalImages}/{planLimits.maxImages} images) —
            you can't add new data until you upgrade your plan.
          </span>
          <button
            onClick={() => navigate("/pricing")}
            style={{ ...smallButton, backgroundColor: "#D98A16", marginLeft: "auto" }}
          >
            💳 Upgrade Plan
          </button>
        </div>
      )}

      {loading && <p style={{ textAlign: "center", fontSize: "16px", color: "#666" }}>Loading project data from Firebase...</p>}

      {!loading && projects.length === 0 && (
        <p style={{ textAlign: "center", padding: "40px", background: "#f9fafb", borderRadius: "12px", color: "#888", border: "1px dashed #ccc" }}>
          No projects found
        </p>
      )}

      {/* Project card list */}
      {!loading && projects.map((project, index) => (
        <div key={index} style={{ border: "1px solid #ddd", borderRadius: 16, padding: "clamp(14px, 3vw, 20px)", marginBottom: 25, background: "#fff", boxShadow: "0 2px 8px rgba(0,0,0,0.06)", boxSizing: "border-box" }}>

          {/* Project name */}
          <h3 style={{ margin: "0 0 10px 0", fontSize: "clamp(16px, 4vw, 19px)", color: "#333" }}>
            📁 Project : {project.project}
          </h3>

          {/* Main project control buttons */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: "12px", marginBottom: "15px" }}>
            <button
              onClick={() => handleAddData(project)}
              disabled={isQuotaExceeded}
              title={isQuotaExceeded ? "Image quota reached. Please upgrade your plan." : ""}
              style={isQuotaExceeded ? disabledButton : { ...smallButton, backgroundColor: "#28A745" }}
            >
              ➕ Add Data
            </button>

            <button onClick={() => goToSelectTraining(project)} style={smallButton}>⚙️ Training Model</button>
            <button onClick={() => deleteProject(project)} style={dangerButton}>🗑️ Delete Project</button>
          </div>

          {/* Total image count */}
          <p style={{ fontSize: "14px", color: "#666", margin: "0 0 15px 0" }}>
            🖼️ Total images: {project.total_images || 0}
          </p>

          <div style={{ background: "#f9fafb", padding: "12px 15px", borderRadius: "8px", border: "1px dashed #ccc", fontSize: "13px", color: "#555" }}>
            {/*🔗 Database path structure: <code>{`/user/${email}/project/${project.project}`}</code> */}
          </div>

        </div>
      ))}
    </div>
  );
}