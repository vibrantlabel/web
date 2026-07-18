import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

const SERVER_URL = localStorage.getItem("cloud_url");

export default function CreateProject() {
  const navigate = useNavigate();

  const [projectName, setProjectName] = useState(
    localStorage.getItem("project_name") || ""
  );
  const [result, setResult] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    if (!projectName.trim()) {
      setResult("Please enter Project Name");
      return;
    }

    try {
      setIsSubmitting(true);
      setResult("Creating project...");

      // V2: payload เหลือแค่ email กับชื่อ project
      // (annotation type เลือกได้ทีหลังต่อรูป/ต่อวัตถุในหน้า labeling เอง
      //  ไม่ต้องกำหนดตายตัวตอนสร้าง project แล้ว)
      const payload = {
        email: localStorage.getItem("email"),
        project: projectName.trim()
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
        localStorage.setItem("project_name", projectName.trim());
        navigate("/");
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
      </div>

      <button
        onClick={createProject}
        disabled={isSubmitting}
        style={{
          ...buttonStyle,
          marginTop: "25px",
          width: "100%",
          height: "50px",
          opacity: isSubmitting ? 0.7 : 1,
          cursor: isSubmitting ? "not-allowed" : "pointer"
        }}
      >
        {isSubmitting ? "Creating..." : "Create Project"}
      </button>

      <div
        style={{
          marginTop: "15px",
          color:
            result.includes("failed") ||
            result.includes("Invalid") ||
            result.includes("Please")
              ? "red"
              : "green"
        }}
      >
        {result}
      </div>
    </div>
  );
}