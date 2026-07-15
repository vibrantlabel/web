import { useState } from "react";

import CaptureLayout
from "../components/CaptureLayout";

export default function Single(){

    const serverUrl =
        localStorage.getItem("cloud_url");

    async function uploadImage(
    canvas,
    cameraSource
      ){

        const image = canvas.toDataURL(
            "image/jpeg",
            0.95
        );

        const payload = {

    email:
        localStorage.getItem(
            "email"
        ),

    project:
        localStorage.getItem(
            "project_name"
        ),

    className:
        localStorage.getItem(
            "class_name"
        ),

    resizeWidth:
        Number(
            localStorage.getItem(
                "resize_width"
            )
        ),

    resizeHeight:
        Number(
            localStorage.getItem(
                "resize_height"
            )
        ),

    cameraSource:
        cameraSource,

    captureMode:
        "single",

    image

};

        const response =
            await fetch(

                `${serverUrl}/upload_dataset_image`,

                {

                    method:"POST",

                    headers:{

                        "Content-Type":
                        "application/json"

                    },

                    body:
                        JSON.stringify(payload)

                }

            );

        const result =
    await response.json();

console.log(result);

if (!response.ok) {

    throw new Error(

        result.message ||

        "Upload failed"

    );

}

return result;

    }

    return(

        <CaptureLayout

            title="📷 Single Capture"

            buttonText="📷 Capture"

            buttonColor="#0078D7"
captureMode="single"
            onCapture={uploadImage}
            onUploadStart={()=>{}}
            onUploadFinish={()=>{}}

        />

    );

}