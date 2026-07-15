import { useEffect, useRef, useState } from "react";

const SERVER_URL =
  "https://gitbackend-416424538655.asia-southeast3.run.app";

function TestModel() {

  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  const [result, setResult] =
    useState("");

  

 


  useEffect(() => {

    const startCamera = async () => {

      const stream =
        await navigator.mediaDevices.getUserMedia({
          video: true
        });

      videoRef.current.srcObject =
        stream;
    };

    startCamera();

  }, []);

const predictImage = async () => {

  try {

    setResult("Analyzing...");

    const canvas =
      canvasRef.current;

    const ctx =
      canvas.getContext("2d");

    canvas.width =
      videoRef.current.videoWidth;

    canvas.height =
      videoRef.current.videoHeight;

    ctx.drawImage(
      videoRef.current,
      0,
      0
    );

    const imageData =
      canvas.toDataURL(
        "image/jpeg",
        0.9
      );

    const base64 =
      imageData.split(",")[1];

    const response =
      await fetch(
                 `${SERVER_URL}/predict`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json"
          },
          body: JSON.stringify({
            image: base64
          })
        }
      );

    const data =
      await response.json();

    if (data.success) {

   {/*   setResult(

`Class : ${data.label}
Confidence : ${data.confidence} %
Score0 : ${data.scores?.score0}
Score1 : ${data.scores?.score1}
Score2 : ${data.scores?.score2}`

); */}
setResult(

`Class : ${data.label}
Confidence : ${data.confidence} %

Rock : ${(data.scores?.score0 * 100).toFixed(2)} %
Paper : ${(data.scores?.score1 * 100).toFixed(2)} %
Scissors : ${(data.scores?.score2 * 100).toFixed(2)} %`

);

    } else {

      setResult(
        data.error
      );
    }

  } catch (err) {

    setResult(
      err.toString()
    );
  }
};

  return (
    <div>

      <h2>Test Model</h2>

    <video
  ref={videoRef}
  autoPlay
  playsInline
  width="640"
/>

<br/>

<button
  onClick={predictImage}
>
  📷 Predict
</button>

<canvas
  ref={canvasRef}
  style={{
    display: "none"
  }}
/>

<pre>
  {result}
</pre>

    </div>
  );
}

export default TestModel;