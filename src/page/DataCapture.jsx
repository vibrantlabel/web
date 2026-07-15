import { useNavigate } from "react-router-dom";

export default function DataCapture() {

  const navigate = useNavigate();

  const project =
    localStorage.getItem("project_name");

  const className =
    localStorage.getItem("class_name");

  const total =
    localStorage.getItem("total_images") || 0;

  const resizeWidth =  localStorage.getItem("resize_width");

const resizeHeight =  localStorage.getItem("resize_height");

  const card = {
    border: "1px solid #E5E7EB",
    borderRadius: 18,
    padding: 22,
    marginBottom: 18,
    cursor: "pointer",
    background: "#FFFFFF",
    boxShadow: "0 6px 18px rgba(0,0,0,.08)",
    transition: "all .25s ease"
  };

  return (

    <div
      style={{
        maxWidth: 950,
        margin: "30px auto",
        padding: 25,
        fontFamily: "Segoe UI"
      }}
    >

      {/* Header */}

      <div
        style={{
          background:
            "linear-gradient(135deg,#0078D7,#00A2FF)",
          color: "white",
          padding: 25,
          borderRadius: 18,
          marginBottom: 25
        }}
      >

        <h1
          style={{
            margin: 0
          }}
        >
          📷 Data Capture
        </h1>

        <p
          style={{
            marginTop: 10,
            opacity: .95
          }}
        >
          Select a capture mode to
          collect images for your AI dataset.
        </p>

      </div>

      {/* Project */}

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "1fr 1fr 1fr",
          gap: 15,
          marginBottom: 30
        }}
      >

        <div
          style={{
            background: "#fff",
            borderRadius: 15,
            padding: 20,
            boxShadow:
              "0 4px 12px rgba(0,0,0,.08)"
          }}
        >

          <div
            style={{
              color:"#666"
            }}
          >
            Project
          </div>

        <h3>
  {project}
  <span
    style={{
      fontSize: 16,
      color: "#666",
      marginLeft: 10,
      fontWeight: "normal"
    }}
  >
    (📐 {resizeWidth} × {resizeHeight})
  </span>
</h3>

  

        </div>

        <div
          style={{
            background:"#fff",
            borderRadius:15,
            padding:20,
            boxShadow:
              "0 4px 12px rgba(0,0,0,.08)"
          }}
        >

          <div
            style={{
              color:"#666"
            }}
          >
            Class
          </div>

          <h3>{className}</h3>

        </div>

        <div
          style={{
            background:"#fff",
            borderRadius:15,
            padding:20,
            boxShadow:
              "0 4px 12px rgba(0,0,0,.08)"
          }}
        >

          <div
            style={{
              color:"#666"
            }}
          >
            Total Images
          </div>

          <h2
            style={{
              color:"#0078D7"
            }}
          >
            {Number(total).toLocaleString()}
          </h2>

        </div>

      </div>

      <h2
        style={{ 
          marginBottom:20
        }}
      >
        Select Capture Mode
      </h2>

      {/* Single */}

      <div
        style={card}
        onClick={() =>
  navigate("/single", {
    state: {
      project,
      className,
      total,
      resizeWidth,
    resizeHeight
    }
  })
}
      >

        <h2>
          📷 Single Capture
        </h2>

        <p
          style={{
            color:"#666",
            marginTop:10
          }}
        >
          Capture one image and upload
          directly to Firebase Storage.
        </p>

        <div
          style={{
            marginTop:15,
            color:"#0078D7",
            fontWeight:"bold"
          }}
        >
          ➜ 1 Click = 1 Image
        </div>

      </div>

      {/* Burst */}

      <div
        style={card}
         onClick={() =>
  navigate("/burst", {
    state: {
      project,
      className,
      total,
      resizeWidth,
    resizeHeight
    }
  })
}
      >

        <h2>
          ⚡ Burst Capture
        </h2>

        <p
          style={{
            color:"#666",
            marginTop:10
          }}
        >
          Capture continuously
          at 3~5 FPS for rapid
          dataset collection.
        </p>

        <div
          style={{
            marginTop:15,
            color:"#0078D7",
            fontWeight:"bold"
          }}
        >
          ➜ 1 Click = Multiple Images
        </div>

      </div>

      {/* Generator */}
 {/* onClick={() =>   navigate("/dataset-generator") */}
   <div
  style={card}

  onClick={() =>
  navigate("/ai-generator", {
    state: {
      project,
      className,
      total,
      resizeWidth,
    resizeHeight
    }
  })
        }
        
 
>

  <h2>
    🧠 AI Dataset Generator
  </h2>

  <p
    style={{
      color:"#666",
      marginTop:10,
      lineHeight:1.8
    }}
  >
   📷 Original Real Capture ,
↩ Rotation -10° , 
↪ Rotation +10° , 
🔍 Zoom In ,
🔎 Zoom Out ,
🌙 Brightness Dark ,
☀ Brightness Bright ,
⬅ Translation Left ,
➡ Translation Right ,
⬆ Translation Up ,
⬇ Translation Down ,
  </p>

  <div
    style={{
      marginTop:15,
      color:"#0078D7",
      fontWeight:"bold"
    }}
  >
    ➜ 1 Real Capture = 11 AI Training Images
  </div>

</div>

    </div>

  );

}