import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

const SERVER_URL =
  "https://gitbackend-416424538655.asia-southeast3.run.app";

 

export default function CreateProject() 
{

const navigate = useNavigate();

const [projectName, setProjectName] =
useState(
localStorage.getItem("project_name") || ""
);

const [className, setClassName] =
useState("");

const [width, setWidth] =
useState(
localStorage.getItem("resize_width") || "224"
);

const [height, setHeight] =
useState(
localStorage.getItem("resize_height") || "224"
);

const [result, setResult] =
useState("");

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

try {

  setResult("Creating project...");

  const response = await fetch(
    `${SERVER_URL}/create_project`,
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/json",
      },
       
      body: JSON.stringify({

  email:
    localStorage.getItem(
      "email"
    ),

  project:
    projectName.trim(),

  className:
    className.trim(),

  resize_width:
    parseInt(width),

  resize_height:
    parseInt(height)

}),
    }
  );

  const data =
    await response.json();

  console.log(data);

  if (
    response.ok &&
    (data.success === true ||
     data.status === "success")
  ) {

    navigate("/projects");

  } else {

    setResult(
      data.message ||
      data.error ||
      "Create failed"
    );
  }

} catch (err) {

  console.error(err);

  setResult(
    err.message ||
    "Network Error"
  );
}


};

return (
<div
style={{
maxWidth: "800px",
margin: "20px auto",
padding: "20px"
}}
>


  <button
    onClick={() =>
      navigate("/projects")
    }
    style={{
      ...buttonStyle,
      backgroundColor: "#666",
      marginBottom: "20px"
    }}
  >
    ← Back
  </button>

  <h2>
    📁 Create Project
  </h2>

  <div
    style={{
      display: "grid",
      gridTemplateColumns:
        "150px 1fr",
      gap: "15px",
      alignItems: "center",
      marginTop: "20px"
    }}
  >

    <label>
      Project Name:
    </label>

    <input
      style={inputStyle}
      value={projectName}
      onChange={(e) =>
        setProjectName(
          e.target.value
        )
      }
      placeholder="Enter project name"
    />

    <label>
      Class Name:
    </label>

    <input
      style={inputStyle}
      value={className}
      onChange={(e) =>
        setClassName(
          e.target.value
        )
      }
      placeholder="Enter class name"
    />

    <label>
      Pixel Size:
    </label>

    <div
      style={{
        display: "flex",
        gap: "10px",
        alignItems: "center"
      }}
    >
      <span>W:</span>

      <input
        type="number"
        value={width}
        onChange={(e) =>
          setWidth(
            e.target.value
          )
        }
        style={{
          ...inputStyle,
          width: "90px"
        }}
      />

      <span>x</span>

      <span>H:</span>

      <input
        type="number"
        value={height}
        onChange={(e) =>
          setHeight(
            e.target.value
          )
        }
        style={{
          ...inputStyle,
          width: "90px"
        }}
      />
    </div>

  </div>

  <button
    onClick={createProject}
    style={{
      ...buttonStyle,
      marginTop: "25px",
      width: "100%",
      height: "50px"
    }}
  >
    Create Project
  </button>

  <div
    style={{
      marginTop: "15px",
      color: result.includes("failed")
        ? "red"
        : "green"
    }}
  >
    {result}
  </div>

</div>


);
}
