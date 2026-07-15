import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function DatasetGeneratorSetting() {

  const navigate = useNavigate();

  const project =
    localStorage.getItem("project_name");

  const className =
    localStorage.getItem("class_name");

  // -----------------------------
  // Expand / Collapse
  // -----------------------------

  const [showBackground, setShowBackground] = useState(false);
  const [showRotation, setShowRotation] = useState(false);
  const [showBrightness, setShowBrightness] = useState(false);
  const [showContrast, setShowContrast] = useState(false);
  const [showBlur, setShowBlur] = useState(false);
  const [showNoise, setShowNoise] = useState(false);

  // -----------------------------
  // Enable
  // -----------------------------

  const [background, setBackground] = useState(true);
  const [rotation, setRotation] = useState(true);
  const [brightness, setBrightness] = useState(true);
  const [contrast, setContrast] = useState(false);
  const [blur, setBlur] = useState(false);
  const [noise, setNoise] = useState(false);

  // -----------------------------
  // จำนวนแต่ละรายการ
  // -----------------------------

 const totalBackgrounds = 1200;

// Default = 10
const [backgroundCount, setBackgroundCount] =
  useState(10);

  const rotationCount = 7;
  const brightnessCount = 3;
  const contrastCount = 3;
  const blurCount = 2;
  const noiseCount = 2;

  let total = 1;

  {/* ---------- Basic ----------*/}

const [showScale, setShowScale] =
  useState(false);

const [scale, setScale] =
  useState(true);

{/* ---------- Advanced ----------*/}

const [showPerspective,
  setShowPerspective] =
  useState(false);

const [showShadow,
  setShowShadow] =
  useState(false);

const [showHue,
  setShowHue] =
  useState(false);

const [showSaturation,
  setShowSaturation] =
  useState(false);

const [perspective,
  setPerspective] =
  useState(false);

const [shadow,
  setShadow] =
  useState(false);

const [hue,
  setHue] =
  useState(false);

const [saturation,
  setSaturation] =
  useState(false);


  const scaleCount = 6;

const perspectiveCount = 4;

const shadowCount = 3;

const hueCount = 3;

const saturationCount = 3;

  {/* ---------- Advanced ----------*/}

  if (background)
    total *= backgroundCount;

  if (rotation)
    total *= rotationCount;

  if (brightness)
    total *= brightnessCount;
  {/* ----------   ----------*/}
   if (scale)
    total *= scaleCount;

if (perspective)
    total *= perspectiveCount;

if (contrast)
    total *= contrastCount;

if (blur)
    total *= blurCount;

if (noise)
    total *= noiseCount;

if (shadow)
    total *= shadowCount;

if (hue)
    total *= hueCount;

if (saturation)
    total *= saturationCount;



  const section = {
    border: "1px solid #ddd",
    borderRadius: 10,
    padding: 15,
    marginBottom: 15
  };



   return (

<div
  style={{
    maxWidth: 900,
    margin: "40px auto",
    padding: 20
  }}
>

<h1
  style={{
    textAlign: "center",
    marginBottom: 10
  }}
>
🧠 AI Dataset Generator
</h1>

<p
  style={{
    textAlign: "center",
    color: "#666",
    marginBottom: 30
  }}
>
Generate an AI Capture Set from a single real image.
</p>

<div
  style={{
    background: "#FFFFFF",
    border: "1px solid #DDD",
    borderRadius: 16,
    padding: 25,
    boxShadow:
      "0 4px 12px rgba(0,0,0,.08)"
  }}
>

<h2>
📦 Capture Set
</h2>

<p style={{color:"#666"}}>

Every real capture automatically generates
one AI Capture Set.

</p>

<hr/>

<div
  style={{
    display:"grid",
    gridTemplateColumns:"1fr 1fr",
    gap:12,
    marginTop:20
  }}
>

<div>📷 Original</div>

<div>↩ Rotation -10°</div>

<div>↪ Rotation +10°</div>

<div>🔍 Zoom In</div>

<div>🔎 Zoom Out</div>

<div>🌙 Brightness Dark</div>

<div>☀ Brightness Bright</div>

<div>⬅ Translation Left</div>

<div>➡ Translation Right</div>

<div>⬆ Translation Up</div>

<div>⬇ Translation Down</div>

</div>

</div>

<div
  style={{
    marginTop:25,
    background:"#EAF5FF",
    border:"1px solid #CDE5FF",
    borderRadius:16,
    padding:20
  }}
>

<h3
  style={{
    marginTop:0
  }}
>
📊 Capture Set Summary
</h3>

<div
  style={{
    fontSize:18,
    lineHeight:2
  }}
>

<b>1 Real Capture</b>

<br/>

↓

<br/>

<b>1 Capture Set</b>

<br/>

↓

<br/>

<b>11 AI Training Images</b>

</div>

</div>

<div
  style={{
    marginTop:25,
    background:"#FFF8E8",
    border:"1px solid #F3D27B",
    borderRadius:16,
    padding:20
  }}
>

<h3
  style={{
    marginTop:0
  }}
>
💡 How It Works
</h3>

<ol
  style={{
    lineHeight:2
  }}
>

<li>Capture one real image.</li>

<li>Create one Capture Set automatically.</li>

<li>Generate 10 augmented images.</li>

<li>Total 11 training images.</li>

<li>All images are grouped into one Capture Set.</li>

<li>Ready for AI model training.</li>

</ol>

</div>

<div
  style={{
    marginTop:30,
    display:"flex",
    justifyContent:"space-between"
  }}
>

<button
  onClick={() => navigate(-1)}
  style={{
    padding:"12px 30px",
    border:"1px solid #CCC",
    borderRadius:10,
    background:"white",
    cursor:"pointer"
  }}
>
← Back
</button>

<button
  style={{
    padding:"12px 35px",
    border:"none",
    borderRadius:10,
    background:"#0078D7",
    color:"white",
    fontWeight:"bold",
    cursor:"pointer"
  }}
>
Save Settings
</button>

</div>

</div>

);
}