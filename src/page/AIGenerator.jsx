import CaptureLayout from "../components/CaptureLayout";

import { useState } from "react";

export default function AIGenerator() {

    const serverUrl =
        localStorage.getItem("cloud_url");

    async function uploadGenerator(
        canvas,
        cameraSource
    ){

        const image =
            canvas.toDataURL(
                "image/jpeg",
                0.95
            );

        const payload={

            email:
                localStorage.getItem("email"),

            project:
                localStorage.getItem("project_name"),

            className:
                localStorage.getItem("class_name"),

            resizeWidth:
                Number(
                    localStorage.getItem("resize_width")
                ),

            resizeHeight:
                Number(
                    localStorage.getItem("resize_height")
                ),

            cameraSource,

            captureMode:
                "generator",

            image

        };

        const response =
            await fetch(

                `${serverUrl}/upload_dataset_image`,

                {

                    method:"POST",

                    headers:{
                        "Content-Type":"application/json"
                    },

                    body:
                        JSON.stringify(payload)

                }

            );

        const result =
            await response.json();

        if(!response.ok){

            throw new Error(

                result.message ||

                "Upload Failed"

            );

        }

        return result;

    }

    return(

        <CaptureLayout

            title="🧠 AI Dataset Generator"

            buttonText="🧠 Capture & Generate"

            buttonColor="#8E44AD"

            captureMode="generator"

            onCapture={uploadGenerator}
            onUploadStart={()=>{}}

            onUploadFinish={()=>{}}

        />

    );

}