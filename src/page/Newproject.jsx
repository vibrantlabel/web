import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

 
    const SERVER_URL =
        localStorage.getItem("cloud_url");

export default function CreateProject() {
  const navigate = useNavigate();

  // 🌟 State คุมโหมด: "classification", "detection", "segmentation"
  const [projectType, setProjectType] = useState("classification");
  const [projectName, setProjectName] = useState(localStorage.getItem("project_name") || "");
  const [className, setClassName] = useState("");
  const [width, setWidth] = useState(localStorage.getItem("resize_width") || "224");
  const [height, setHeight] = useState(localStorage.getItem("resize_height") || "224");
  const [result, setResult] = useState("");

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

  const tabButtonStyle = (isActive) => ({
    flex: 1,
    padding: "10px",
    fontSize: "15px",
    fontWeight: "bold",
    border: isActive ? "2px solid #0078D7" : "1px solid #ccc",
    background: isActive ? "#F0F7FF" : "#fff",
    color: isActive ? "#0078D7" : "#555",
    borderRadius: "8px",
    cursor: "pointer",
    textAlign: "center",
    transition: "all 0.2s ease"
  });

  const createProject = async () => {
    if (!projectName.trim()) {
      setResult("Please enter Project Name");
      return;
    }

    // ตรวจสอบความถูกต้องฟิลด์ย่อยเฉพาะโหมด Classification เท่านั้น
    if (projectType === "classification") {
      if (!className.trim()) {
        setResult("Please enter Class Name");
        return;
      }
      if (!width || parseInt(width) <= 0) {
        setResult("Invalid Width");
        return;
      }
      if (!height || parseInt(height) <= 0) {
        setResult("Invalid Height");
        return;
      }
    }

    try {
      setResult("Creating project...");

      // เตรียมฐานข้อมูล Payload หลักส่งเข้า API หลังบ้าน
      const payload = {
        email: localStorage.getItem("email"),
        project: projectName.trim(),
        projectType: projectType // ส่ง "classification", "detection" หรือ "segmentation"
      };

      // แนบข้อมูลเพิ่มเติมเฉพาะเมื่อใช้งานประเภท Classification
      if (projectType === "classification") {
        payload.className = className.trim();
        payload.resize_width = parseInt(width);
        payload.resize_height = parseInt(height);
      }

      const response = await fetch(`${SERVER_URL}/create_project`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      console.log(data);

      if (response.ok && (data.success === true || data.status === "success")) {
        // ลงทะเบียนชื่อโปรเจกต์และสถานะลงเครื่องจำลองชั่วคราว
        localStorage.setItem("project_name", projectName.trim());
        localStorage.setItem("project_type", projectType);
        navigate("/");
      } else {
        setResult(data.message || data.error || "Create failed");
      }
    } catch (err) {
      console.error(err);
      setResult(err.message || "Network Error");
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

      {/* แท็บสลับกลุ่มการทำงานตาม Diagram */}
      <div style={{ display: "flex", gap: "10px", marginTop: "20px", marginBottom: "10px" }}>
        <button type="button" style={tabButtonStyle(projectType === "classification")} onClick={() => setProjectType("classification")}>
          🖼️ Classification
        </button>
        <button type="button" style={tabButtonStyle(projectType === "detection")} onClick={() => setProjectType("detection")}>
          🎯 Detection
        </button>
        <button type="button" style={tabButtonStyle(projectType === "segmentation")} onClick={() => setProjectType("segmentation")}>
          ⬡ Segment
        </button>
      </div>

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
        />

        {/* จัดการซ่อนฟิลด์เหล่านี้อัตโนมัติหากเป็นโหมด Detection หรือ Segment */}
        {projectType === "classification" && (
          <>
            <label>Class Name:</label>
            <input
              style={inputStyle}
              value={className}
              onChange={(e) => setClassName(e.target.value)}
              placeholder="Enter class name"
            />

            <label>Pixel Size:</label>
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <span>W:</span>
              <input
                type="number"
                value={width}
                onChange={(e) => setWidth(e.target.value)}
                style={{ ...inputStyle, width: "90px" }}
              />
              <span>x</span>
              <span>H:</span>
              <input
                type="number"
                value={height}
                onChange={(e) => setHeight(e.target.value)}
                style={{ ...inputStyle, width: "90px" }}
              />
            </div>
          </>
        )}
      </div>

      <button
        onClick={createProject}
        style={{ ...buttonStyle, marginTop: "25px", width: "100%", height: "50px" }}
      >
        Create Project
      </button>

      <div
        style={{
          marginTop: "15px",
          color: result.includes("failed") || result.includes("Invalid") || result.includes("Please") ? "red" : "green"
        }}
      >
        {result}
      </div>
    </div>
  );
}