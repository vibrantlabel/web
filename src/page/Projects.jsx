import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

export default function Projects() {
  const SERVER_URL = localStorage.getItem("cloud_url");
  const navigate = useNavigate();
  const email = localStorage.getItem("email");

  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

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

  // โหลดข้อมูลโปรเจกต์ครั้งแรกที่เข้าหน้า (ไม่มีแท็บให้สลับแล้ว)
  useEffect(() => {
    loadProjects();
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
      console.log("[DEBUG] ข้อมูลโปรเจกต์ที่ได้กลับมา:", result);

      if (result.success) {
        setProjects(result.data || []);
      } else {
        console.error("Backend แจ้งเตือนข้อผิดพลาด:", result.error);
        setProjects([]);
      }
    } catch (error) {
      console.error("เกิดข้อผิดพลาดในการโหลดโปรเจกต์:", error);
      setProjects([]);
    } finally {
      setLoading(false);
    }
  };

  // ==========================================================
  // Add Data -> ไปหน้า /detection-capture (ใช้ layout เดียวกับที่เคยใช้กับ
  // แท็บ Detection/Segmentation เดิม เพราะตอนนี้เลือก bbox/polygon ต่อวัตถุ
  // เองในหน้า capture แล้ว ไม่ต้องแยกหน้าตาม type อีก)
  // ==========================================================
  const handleAddData = (project) => {
    localStorage.setItem("project_name", project.project);
    localStorage.setItem("total_images", project.total_images || 0);
    navigate("/detection-capture");
  };

  const goToSelectTraining = (project) => {
    navigate("/det-seg-train", {
      state: { project }
    });
  };

  const deleteProject = async (project) => {
    if (!window.confirm(`ต้องการลบโปรเจกต์ "${project.project}" ใช่หรือไม่? ข้อมูลทั้งหมดจะถูกลบถาวร`)) return;
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

      {/* ส่วนหัวแสดงผลควบคุมระบบหลัก */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 15 }}>
        <h2 style={{ margin: 0, fontSize: "clamp(18px, 4.5vw, 22px)" }}>📂 Project Workspace</h2>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => navigate("/")} style={{ ...smallButton, backgroundColor: "#666" }}>🏠 Home</button>
          <button onClick={loadProjects} style={smallButton}>🔄 Refresh</button>
        </div>
      </div>

      {loading && <p style={{ textAlign: "center", fontSize: "16px", color: "#666" }}>กำลังโหลดข้อมูลโปรเจกต์จาก Firebase...</p>}

      {!loading && projects.length === 0 && (
        <p style={{ textAlign: "center", padding: "40px", background: "#f9fafb", borderRadius: "12px", color: "#888", border: "1px dashed #ccc" }}>
          ไม่มีข้อมูลโปรเจกต์
        </p>
      )}

      {/* รายการการ์ดโปรเจกต์ */}
      {!loading && projects.map((project, index) => (
        <div key={index} style={{ border: "1px solid #ddd", borderRadius: 16, padding: "clamp(14px, 3vw, 20px)", marginBottom: 25, background: "#fff", boxShadow: "0 2px 8px rgba(0,0,0,0.06)", boxSizing: "border-box" }}>

          {/* แสดงชื่อโปรเจกต์ */}
          <h3 style={{ margin: "0 0 10px 0", fontSize: "clamp(16px, 4vw, 19px)", color: "#333" }}>
            📁 Project : {project.project}
          </h3>

          {/* ปุ่มควบคุมระบบโปรเจกต์หลัก */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: "12px", marginBottom: "15px" }}>
            <button
              onClick={() => handleAddData(project)}
              style={{ ...smallButton, backgroundColor: "#28A745" }}
            >
              ➕ Add Data
            </button>

            <button onClick={() => goToSelectTraining(project)} style={smallButton}>⚙️ Training Model</button>
            <button onClick={() => deleteProject(project)} style={dangerButton}>🗑️ Delete Project</button>
          </div>

          {/* สถิติจำนวนรูปรวม */}
          <p style={{ fontSize: "14px", color: "#666", margin: "0 0 15px 0" }}>
            🖼️ รูปภาพรวม: {project.total_images || 0} รูป
          </p>

          <div style={{ background: "#f9fafb", padding: "12px 15px", borderRadius: "8px", border: "1px dashed #ccc", fontSize: "13px", color: "#555" }}>
            🔗 โครงสร้างพาธฐานข้อมูล: <code>{`/user/${email}/project/${project.project}`}</code>
          </div>

        </div>
      ))}
    </div>
  );
}