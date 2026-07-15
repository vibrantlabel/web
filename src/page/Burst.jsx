import CaptureLayout
from "../components/CaptureLayout";

export default function Burst(){

    const serverUrl =
        localStorage.getItem("cloud_url");

    async function uploadBurst(
        images,
        cameraSource
    ){

        const payload = {

            email:
                localStorage.getItem("email"),

            project:
                localStorage.getItem("project_name"),

            className:
                localStorage.getItem("class_name"),

            resizeWidth:
                Number(localStorage.getItem("resize_width")),

            resizeHeight:
                Number(localStorage.getItem("resize_height")),

            cameraSource,

            captureMode:"burst",

            images

        };

        const response =
            await fetch(

                `${serverUrl}/upload_dataset_image`,

                {

                    method:"POST",

                    headers:{
                        "Content-Type":"application/json"
                    },

                    body:JSON.stringify(payload)

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

            title="⚡ Burst Capture"

            buttonText="⚡ Start Burst"

            buttonColor="#FF9800"

            captureMode="burst"

            burstCount={5}

            onCapture={uploadBurst}

            onUploadStart={()=>{}}

            onUploadFinish={()=>{}}

        />

    );

}