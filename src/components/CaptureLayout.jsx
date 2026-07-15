import { useLocation } from "react-router-dom";

import {
  useEffect,
  useRef,
  useState
} from "react";

export default function CaptureLayout({

    title,

    buttonText,

    buttonColor,

    onCapture,

    captureMode="single",

    burstCount=5,

    onUploadStart,

    onUploadFinish

}) {

  const { state } = useLocation();
const previewRef = useRef(null);

  const project =
    state?.project || "";

  const className =
    state?.className || "";

  const total =
    state?.total || 0;

  const resizeWidth =
    state?.resizeWidth || "";

  const resizeHeight =
    state?.resizeHeight || "";

  // ==========================
  // Upload Result
  // ==========================

  const [uploadResult,
    setUploadResult] =
    useState(null);

  const [uploading,
    setUploading] =
    useState(false);

  const [uploadError,
    setUploadError] =
    useState("");

  // ==========================
  // Camera Source
  // ==========================

  const [cameraSource,
    setCameraSource] =
    useState("browser");

  const [esp32Ip,
    setEsp32Ip] =
    useState("192.168.43.181");

  // ==========================
  // ESP32 Preview
  // ==========================

  const [previewUrl,
    setPreviewUrl] =
    useState("");

  // ==========================
  // Refs
  // ==========================

  const videoRef =
    useRef(null);

  const canvasRef =
    useRef(null);

 
  // ==========================
  // Browser Camera
  // ==========================

  useEffect(() => {

    let stream = null;

    async function startCamera() {

      if (
        cameraSource !==
        "browser"
      )
        return;

      try {

        stream =
          await navigator
            .mediaDevices
            .getUserMedia({

              video: {

                facingMode:
                  "environment"

              },

              audio: false

            });

        videoRef.current.srcObject =
          stream;

        await videoRef.current.play();

      }

      catch (err) {

        console.log(err);

      }

    }

    startCamera();

    return () => {

      if (stream) {

        stream
          .getTracks()
          .forEach(track =>
            track.stop());

      }

    };

  }, [

    cameraSource

  ]);

  // ==========================
  // ESP32 Preview
  // ==========================

  // ==========================
  // Capture
  // ==========================

async function captureFrame() {

  if (!canvasRef.current)
    return null;

  const canvas =
    canvasRef.current;

  const ctx =
    canvas.getContext("2d");

  if (!ctx)
    return null;

  if (
    cameraSource ===
    "browser"
  ) {

    const video =
      videoRef.current;

    if (
      !video ||
      video.videoWidth === 0
    ) {
      return null;
    }

    canvas.width =
      video.videoWidth;

    canvas.height =
      video.videoHeight;

    ctx.drawImage(

      video,

      0,

      0,

      canvas.width,

      canvas.height

    );

  }

  else {

    const img =
      previewRef.current;

    if (
      !img ||
      !img.complete
    ) {
      return null;
    }

    canvas.width =
      img.naturalWidth;

    canvas.height =
      img.naturalHeight;

    ctx.drawImage(

      img,

      0,

      0,

      canvas.width,

      canvas.height

    );

  }

  return canvas;

}

  // ==========================
  // Upload
  // ==========================
 async function handleCapture() {

  try {

    setUploading(true);

    setUploadError("");

    let result;

    if(

    captureMode==="single" ||

    captureMode==="generator"

) {

      const canvas =
        await captureFrame();

      if (!canvas)
        return;

      result =
        await onCapture(

          canvas,

          cameraSource

        );

    }

    else if (captureMode === "burst") {

      const images = [];

      for (

        let i = 0;

        i < burstCount;

        i++

      ) {

        const canvas =
          await captureFrame();

        if (!canvas)
          break;

        images.push(

          canvas.toDataURL(

            "image/jpeg",

            0.95

          )

        );

        // เว้นช่วง 200 ms
        await new Promise(

          resolve =>

            setTimeout(

              resolve,

              200

            )

        );

      }

      result =
        await onCapture(

          images,

          cameraSource

        );

    }

    

    setUploadResult(result);

  }

  catch (err) {

    setUploadError(

      err.toString()

    );

  }

  finally {

    setUploading(false);

  }

}
 {/*========================*/}

  return (

<div
  style={{
    maxWidth:900,
    margin:"30px auto",
    padding:20,
    fontFamily:"Segoe UI"
  }}
>

{/* ================= Header ================= */}

<div
  style={{
    background:
      "linear-gradient(135deg,#0078D7,#00A2FF)",
    color:"#fff",
    padding:25,
    borderRadius:18,
    marginBottom:25
  }}
>

<h1>

{title}

</h1>

</div>

{/* ================= Project ================= */}

<div
  style={{
    display:"grid",
    gridTemplateColumns:"1fr 1fr 1fr",
    gap:15,
    marginBottom:25
  }}
>

<div
style={{
background:"#fff",
borderRadius:15,
padding:20,
boxShadow:
"0 4px 12px rgba(0,0,0,.08)"
}}
>

<div style={{color:"#666"}}>

Project

</div>

<h3>

{project}

<span
style={{
fontSize:15,
marginLeft:10,
fontWeight:"normal",
color:"#666"
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

<div style={{color:"#666"}}>

Class

</div>

<h3>

{className}

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

<div style={{color:"#666"}}>

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

{/* ================= Camera Source ================= */}

<div
style={{
background:"#fff",
padding:20,
borderRadius:15,
marginBottom:25,
boxShadow:
"0 4px 12px rgba(0,0,0,.08)"
}}
>

<h3>

📷 Camera Source

</h3>

<label>

<input

type="radio"

checked={
cameraSource==="browser"
}

onChange={()=>
setCameraSource(
"browser"
)
}

/>

{" "}Browser Camera

</label>

<br/>

<br/>

<label>

<input

type="radio"

checked={
cameraSource==="esp32"
}

onChange={()=>
setCameraSource(
"esp32"
)
}

/>

{" "}ESP32-CAM

</label>

{

cameraSource==="esp32" &&

<div
style={{
marginTop:15
}}
>

<input

value={esp32Ip}

onChange={e=>
setEsp32Ip(
e.target.value
)
}

placeholder="192.168.43.181"

style={{

width:"100%",

padding:12,

fontSize:16,

borderRadius:8,

border:"1px solid #ccc"

}}

/>

</div>

}

</div>

{/* ================= Camera ================= */}

<h3>

📷 Realtime Camera

</h3>

<div
style={{
background:"#000",
borderRadius:18,
overflow:"hidden",
marginBottom:25
}}
>

{

cameraSource==="browser"

?

<video

ref={videoRef}

autoPlay

playsInline

muted

style={{

width:"100%",

height:420,

objectFit:"cover",

display:"block"

}}

/>

:
 

 <img
    ref={previewRef}
   crossOrigin="anonymous"
    src={`http://${esp32Ip}/stream`}

    alt="ESP32 Stream"

    style={{
        width: "100%",
        height: 420,
        objectFit: "cover",
        display: "block"
    }}

    onError={() => {
        console.log("ESP32 Stream Error");
    }}
/>

}

</div>
{/* ================= Canvas ================= */}

<h3>

🖼️ Captured Image

</h3>

<div
style={{
background:"#000",
borderRadius:18,
overflow:"hidden",
marginBottom:25
}}
>

<canvas

ref={canvasRef}

style={{

width:"100%",

height:420,

display:"block"

}}

/>

</div>

{/* ================= Capture ================= */}

<div
style={{
textAlign:"center",
marginBottom:25
}}
>

<button

onClick={handleCapture}

disabled={uploading}

style={{

padding:"15px 40px",

fontSize:18,

background:buttonColor,

color:"#fff",

border:"none",

borderRadius:12,

cursor:
uploading
?
"default"
:
"pointer",

opacity:
uploading
?
0.7
:
1

}}

>

{

uploading

?

"Uploading..."

:

buttonText

}

</button>

</div>

{/* ================= Upload Status ================= */}
<div
style={{
background:"#fff",
borderRadius:15,
padding:20,
boxShadow:
"0 4px 12px rgba(0,0,0,.08)"
}}
>

<h3>

☁️ Firebase Upload Status

</h3>

{

uploadError &&

<div>

<p
style={{
color:"red",
fontWeight:"bold"
}}
>

❌ Upload Failed

</p>

<pre
style={{
whiteSpace:"pre-wrap",
color:"#666"
}}
>

{uploadError}

</pre>

</div>

}

{

uploadResult &&

<div>

<p
style={{
color:"green",
fontWeight:"bold",
fontSize:18
}}
>

✅ Upload Success

</p>

<table
style={{
width:"100%",
borderCollapse:"collapse",
marginTop:15
}}
>

<tbody>

<tr>

<td
style={{
width:180,
padding:8,
fontWeight:"bold"
}}
>

Filename

</td>

<td
style={{
padding:8
}}
>

{uploadResult.filename || "-"}

</td>

</tr>

<tr>

<td
style={{
padding:8,
fontWeight:"bold"
}}
>

Images

</td>

<td
style={{
padding:8
}}
>

{

uploadResult.generated ??

uploadResult.uploaded ??

1

}

</td>

</tr>

<tr>

<td
style={{
padding:8,
fontWeight:"bold"
}}
>

Resolution

</td>

<td
style={{
padding:8
}}
>

{

uploadResult.width ?? "-"

}

×

{

uploadResult.height ?? "-"

}

</td>

</tr>

{

uploadResult.fileSizeKB != null &&

<tr>

<td
style={{
padding:8,
fontWeight:"bold"
}}
>

File Size

</td>

<td
style={{
padding:8
}}
>

{uploadResult.fileSizeKB} KB

</td>

</tr>

}

{

uploadResult.totalSizeKB != null &&

<tr>

<td
style={{
padding:8,
fontWeight:"bold"
}}
>

Total Size

</td>

<td
style={{
padding:8
}}
>

{uploadResult.totalSizeKB} KB

</td>

</tr>

}

{

uploadResult.averageSizeKB != null &&

<tr>

<td
style={{
padding:8,
fontWeight:"bold"
}}
>

Average Size

</td>

<td
style={{
padding:8
}}
>

{uploadResult.averageSizeKB} KB

</td>

</tr>

}

<tr>

<td
style={{
padding:8,
fontWeight:"bold"
}}
>

Total Images

</td>

<td
style={{
padding:8
}}
>

{

uploadResult.totalImages ??

uploadResult.total_images ??

"-"

}

</td>

</tr>

<tr>

<td
style={{
padding:8,
fontWeight:"bold"
}}
>

Storage Path

</td>

<td
style={{
padding:8,
wordBreak:"break-all"
}}
>

{

uploadResult.storagePath ||

uploadResult.storage_path ||

"-"

}

</td>

</tr>

{/* ================= Camera Source ================= */}

<tr>

<td
style={{
padding:8,
fontWeight:"bold"
}}
>

Class Size

</td>

<td
style={{
padding:8
}}
>

{

uploadResult.classSizeMB ??

"-"

}

MB

</td>

</tr>
{/* ================= Camera Source ================= */}


<tr>

<td
style={{
padding:8,
fontWeight:"bold"
}}
>

Camera Source

</td>

<td
style={{
padding:8
}}
>

{

uploadResult.cameraSource ??

cameraSource

}

</td>

</tr>

</tbody>

</table>

{

uploadResult.imageUrl &&

<div
style={{
marginTop:20
}}
>

<img

src={uploadResult.imageUrl}

alt="Uploaded"

style={{

width:260,

borderRadius:12,

border:"1px solid #ddd"

}}

/>

</div>

}

</div>

}

{

!uploadResult &&
!uploadError &&
!uploading &&

<p
style={{
color:"#666"
}}
>

Waiting...

</p>

}

</div>


 

</div>

);

}