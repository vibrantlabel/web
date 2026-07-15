import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

export default function Projects() {
  const SERVER_URL = localStorage.getItem("cloud_url");
  const navigate = useNavigate();
  const email = localStorage.getItem("email");

  // 🌟 State หลักสำหรับคุมการแสดงผลตามหมวดหมู่ (Default: classification)
  const [activeTab, setActiveTab] = useState("classification");
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  // สไตล์สำหรับปุ่มทั่วไป
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

  // 🌟 สไตล์สำหรับแท็บสลับโหมดหลักด้านบนสุดของหน้า (ขยายนอกตัวโปรเจกต์)
  const mainTabStyle = (isActive) => ({
    flex: 1,
    padding: "12px 20px",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "15px",
    fontWeight: "bold",
    textAlign: "center",
    border: isActive ? "2px solid #0078D7" : "2px solid #E5E7EB",
    background: isActive ? "#F0F7FF" : "#FFFFFF",
    color: isActive ? "#0078D7" : "#555",
    transition: "all 0.2s ease",
    boxShadow: isActive ? "0 4px 12px rgba(0,120,215,0.15)" : "none"
  });

  // ทำการโหลดข้อมูลใหม่ทุกครั้งที่ผู้ใช้สลับแท็บเมนูด้านบน
  useEffect(() => {
    loadProjects();
  }, [activeTab]);

  const loadProjects = async () => {
    try {
      setLoading(true);
      setProjects([]); // ล้างข้อมูลเก่าก่อนโหลดใหม่ป้องกันข้อมูลปนกัน

      // 🌟 สลับ Endpoint ตามแท็บที่เปิดอยู่
      let endpoint = "/get_classification_projects";
      if (activeTab === "detection") {
        endpoint = "/get_detection_projects";
      } else if (activeTab === "segmentation") {
        endpoint = "/get_segmentation_projects";
      }

      console.log(`[DEBUG] ยิงเรียกประเภทงาน ${activeTab} ไปที่:`, `${SERVER_URL}${endpoint}`);

      const response = await fetch(`${SERVER_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });

      const result = await response.json();
      console.log(`[DEBUG] ข้อมูลที่ได้กลับมาจากแท็บ ${activeTab}:`, result);

      if (result.success) {
        // นำข้อมูลชุดที่ได้ใส่ลง State ตรงๆ ได้เลย ไม่ต้องกรอง .filter ซ้ำซ้อนแล้ว
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
  // ฟังก์ชันสำหรับกดปุ่ม "Add Data" ใต้ชื่อโปรเจกต์ (Dynamic แยกตามแท็บที่ทำงาน)
  // ==========================================================
  const handleAddData = (project) => {
    localStorage.setItem("project_name", project.project);
    localStorage.setItem("project_type", activeTab);
    localStorage.setItem("resize_width", project.resize_width || (activeTab === "classification" ? 224 : 640));
    localStorage.setItem("resize_height", project.resize_height || (activeTab === "classification" ? 224 : 640));

    // 🌟 อัปเดต: ทั้งแท็บ detection และ segmentation ให้วิ่งไปที่หน้า /detection-capture ร่วมกัน
    if (activeTab === "detection" || activeTab === "segmentation") {
      navigate("/detection-capture");
    } else {
      // สำหรับ Classification: ถ้ามีคลาสย่อยให้จับตัวแรกเป็น Default ไม่งั้นใส่ empty
      if (project.classes && project.classes.length > 0) {
        localStorage.setItem("class_name", project.classes[0].label);
        localStorage.setItem("total_images", project.classes[0].total_images);
      } else {
        localStorage.setItem("class_name", "default");
        localStorage.setItem("total_images", 0);
      }
      navigate("/data-capture");
    }
  };

  // ==========================================================
  // ฟังก์ชันกด Inc Data ราย Class ย่อย (เฉพาะ Classification)
  // ==========================================================
  const handleIncDataClass = (project, cls) => {
    localStorage.setItem("project_name", project.project);
    localStorage.setItem("class_name", cls.label);
    localStorage.setItem("total_images", cls.total_images);
    localStorage.setItem("resize_width", project.resize_width || 224);
    localStorage.setItem("resize_height", project.resize_height || 224);
    localStorage.setItem("project_type", "classification");
    navigate("/data-capture");
  };

  const addClass = (project) => {
    localStorage.setItem("project_name", project.project);
    localStorage.setItem("resize_width", project.resize_width || 224);
    localStorage.setItem("resize_height", project.resize_height || 224);
    navigate("/create-project"); // วิ่งไปหน้าสร้างคลาสเพิ่ม
  };

  const goToSelectTraining = (project) => {
    navigate("/select-training", { state: { project } });
  };

  const viewClass = (project, cls) => {
    navigate("/view-class", { state: { project, cls } });
  };

  const deleteClass = async (cls) => {
    if (!window.confirm(`Delete class ${cls.label} ?`)) return;
    try {
      const response = await fetch(`${SERVER_URL}/delete_class`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, project: cls.project, className: cls.label })
      });
      const result = await response.json();
      if (result.status === "ok") {
        alert("Deleted");
        loadProjects();
      } else {
        alert(result.message);
      }
    } catch (err) {
      console.error(err);
      alert("Delete failed");
    }
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

      {/* แท็บสลับหมวดหลัก */}
      <div style={{ display: "flex", gap: "12px", marginBottom: "30px", width: "100%" }}>
        <div style={mainTabStyle(activeTab === "classification")} onClick={() => setActiveTab("classification")}>
          🖼️ Classification (Default)
        </div>
        <div style={mainTabStyle(activeTab === "detection")} onClick={() => setActiveTab("detection")}>
          🎯 Object Detection
        </div>
        <div style={mainTabStyle(activeTab === "segmentation")} onClick={() => setActiveTab("segmentation")}>
          ⬡ Segmentation
        </div>
      </div>

      {loading && <p style={{ textAlign: "center", fontSize: "16px", color: "#666" }}>กำลังโหลดข้อมูลโปรเจกต์จาก Firebase...</p>}

      {!loading && projects.length === 0 && (
        <p style={{ textAlign: "center", padding: "40px", background: "#f9fafb", borderRadius: "12px", color: "#888", border: "1px dashed #ccc" }}>
          ไม่มีข้อมูลโปรเจกต์ในหมวดหมู่ {activeTab.toUpperCase()}
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
            
            {/* แสดงปุ่ม Add Data เฉพาะ Detection และ Segmentation เท่านั้น */}
            {activeTab !== "classification" && (
              <button
                onClick={() => handleAddData(project)}
                style={{ ...smallButton, backgroundColor: "#28A745" }}
              >
                ➕ Add Data
              </button>
            )}

            {activeTab === "classification" && (
              <button onClick={() => addClass(project)} style={{ ...smallButton, backgroundColor: "#FF9800" }}>
                🏷️ Add Class
              </button>
            )}

            <button onClick={() => goToSelectTraining(project)} style={smallButton}>⚙️ Training Model</button>
            <button onClick={() => deleteProject(project)} style={dangerButton}>🗑️ Delete Project</button>
          </div>

          {/* สถิติจำนวนรูปรวมอย่างเดียว */}
          <p style={{ fontSize: "14px", color: "#666", margin: "0 0 15px 0" }}>
           🖼️ รูปภาพรวม: {project.total_images || 0} รูป
          </p>

          {/* พื้นที่จัดการแสดงโครงสร้างย่อยของข้อมูลภายใน */}
          {activeTab === "classification" ? (
            <div style={{ display: "flex", gap: 15, overflowX: "auto", paddingBottom: 10, WebkitOverflowScrolling: "touch" }}>
              {project.classes?.map((cls, idx) => (
                <div key={idx} style={{ minWidth: "240px", maxWidth: "300px", border: "2px solid orange", borderRadius: 16, padding: "12px", flexShrink: 0, boxSizing: "border-box" }}>
                  <h4 style={{ fontSize: "15px", margin: "0 0 8px 0" }}>🏷️ Class: {cls.label}</h4>
                  <p style={{ fontSize: "13px", margin: "0 0 12px 0", color: "#555" }}>🖼️ จำนวนภาพ: {cls.total_images}</p>
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                    <button onClick={() => handleIncDataClass(project, cls)} style={{ ...smallButton, height: "30px", padding: "4px 10px", fontSize: "12px" }}>Inc Data</button>
                    <button onClick={() => deleteClass(cls)} style={{ ...smallButton, height: "30px", padding: "4px 10px", fontSize: "12px", backgroundColor: "#777" }}>Delete</button>
                    <button onClick={() => viewClass(project, cls)} style={{ ...smallButton, height: "30px", padding: "4px 10px", fontSize: "12px", backgroundColor: "#0078D7" }}>View</button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ background: "#f9fafb", padding: "12px 15px", borderRadius: "8px", border: "1px dashed #ccc", fontSize: "13px", color: "#555" }}>
              🔗 โครงสร้างพาธฐานข้อมูล: <code>{`/user/${email}/dataset_session/${activeTab}/${project.project}`}</code>
            </div>
          )}

        </div>
      ))}
    </div>
  );
}