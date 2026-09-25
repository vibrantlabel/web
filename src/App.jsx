import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useState, useEffect } from "react";

import Dashboard from "./page/Dashboard";
import Projects from "./page/Projects";
import CameraView from "./page/CameraView";

import TestModel from "./page/TestModel";

import Register from "./page/Register";


import NewProject from "./page/Newproject";
import Login from "./page/Login";

 
import DatasetGeneratorSetting from "./page/DatasetGeneratorSetting";
import Pricing  from "./page/Pricing";
import Checkout from "./page/Checkout";
import ContactSales from "./page/ContactSales";
import Single from "./page/Single";

import Burst from "./page/Burst";
import AIGenerator from "./page/AIGenerator";
import aftertraining from "./page/Aftertraining";
import DetectionCapture from "./page/DetectionCapture";
import MobileCameraCapture from "./page/MobileCameraCapture";

import SelectTraining from "./page/SelectTraining";
import Train_export from "./page/Train_export";
import BookBank from "./page/BookBank";
import ConfirmPayment from "./page/ConfirmPayment";

// ---------------------------------------------
// English-version pages (คู่ขนานกับหน้าไทย ตาม language ที่เลือกใน Dashboard)
// ---------------------------------------------
import EnNewproject from "./page/enproject";
import EnProjects from "./page/enprojects";
import EnTestModel from "./page/en-testmodel";
import EnPricing from "./page/enpricing";

import EnTrain_export from "./page/entrain_export";
import EnDetectionCapture from "./page/EnDetectionCapture";

import EnCheckout from "./page/enCheckout";
import EnBookBank from "./page/enBookBank";

// 🆕 Admin page — เข้าถึงผ่านหน้า Login.jsx ปกติเท่านั้น (ไม่มี route
// /admin-login แยกแล้ว) โดย login() ใน Login.jsx จะลองเช็ครหัส admin
// เองเงียบๆ ถ้า login ผู้ใช้ทั่วไปไม่ผ่าน แล้วค่อย navigate มาที่นี่
// ---------------------------------------------
import PageAdmin from "./page/pageadmin";
       

 
//--------------------------------------------------
// Main HUB — จุดเดียวที่ frontend รู้จักแบบ hardcode
// ทุกอย่างต่อจากนี้ (cloud_url / server_id) ได้มาจากที่นี่
//--------------------------------------------------
const HUB_URL = "https://hublineoa-369387278497.asia-southeast3.run.app";

function App() {

  const [hubReady, setHubReady] = useState(false);
  const [hubError, setHubError] = useState("");

  //--------------------------------------------------
  // เรียก HUB ครั้งเดียวตอนแอปเริ่มทำงาน (ก่อน Route ไหนจะ render)
  // เพื่อให้ทุกหน้า ไม่ว่า user จะเข้าเป็นหน้าแรกหรือไม่ก็ตาม
  // มี cloud_url / server_id ใน localStorage พร้อมใช้งานเสมอ
  //--------------------------------------------------
  useEffect(() => {

    const initHub = async () => {

      const cachedUrl = localStorage.getItem("cloud_url");
      const cachedServerId = localStorage.getItem("server_id");

      if (cachedUrl && cachedServerId) {
        setHubReady(true);
        return;
      }

      try {

        const res = await fetch(`${HUB_URL}/app-check-register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({})
        });

        const data = await res.json();

        console.log("HUB INIT (App.jsx):", data);

        if (data.cloud_url && data.server_id) {

          localStorage.setItem("cloud_url", data.cloud_url);
          localStorage.setItem("server_id", data.server_id);

          setHubReady(true);

        } else {

          setHubError("ไม่สามารถเชื่อมต่อ Server ได้ กรุณาลองใหม่อีกครั้ง");
        }

      } catch (err) {

        console.error("HUB INIT ERROR (App.jsx):", err);
        setHubError("เชื่อมต่อ Server ไม่สำเร็จ: " + err.toString());
      }
    };

    initHub();

  }, []);

  //--------------------------------------------------
  // แสดง error ถ้า HUB ล่ม / เชื่อมต่อไม่ได้
  //--------------------------------------------------
  if (hubError) {
    return (
      <div
        style={{
          textAlign: "center",
          marginTop: "80px",
          padding: "0 20px",
          color: "#E23D4F",
          fontFamily: "sans-serif"
        }}
      >
        <div style={{ fontSize: "16px", fontWeight: 600 }}>{hubError}</div>
        <button
          onClick={() => window.location.reload()}
          style={{
            marginTop: "16px",
            padding: "10px 20px",
            border: "none",
            borderRadius: "8px",
            background: "#4E5BF2",
            color: "#fff",
            cursor: "pointer",
            fontWeight: 600
          }}
        >
          🔄 ลองใหม่
        </button>
      </div>
    );
  }

  //--------------------------------------------------
  // แสดง loading ระหว่างรอ HUB ตอบกลับครั้งแรก
  //--------------------------------------------------
  if (!hubReady) {
    return (
      <div
        style={{
          textAlign: "center",
          marginTop: "80px",
          color: "#67708C",
          fontFamily: "sans-serif"
        }}
      >
        กำลังเชื่อมต่อ Server...
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>

  <Route
    path="/login"
    element={<Login />}
  />

  <Route
    path="/register"
    element={<Register />}
  />

 

  <Route
    path="/"
    element={<Dashboard />}
  />

  <Route
    path="/projects"
    element={<Projects />}
  />

  <Route
    path="/camera"
    element={<CameraView />}
  />

  <Route
  path="/test-model"
  element={<TestModel />}
/>



  <Route
    path="/new-project"
    element={<NewProject />}
  />

 

  <Route
  path="/dataset-generator"
  element={<DatasetGeneratorSetting />}
/>


<Route
  path="/pricing"
  element={<Pricing />}
/>

<Route
  path="/checkout"
  element={<Checkout />}
/>

<Route
  path="/contact-sales"
  element={<ContactSales />}
/>

<Route
  path="/single"
  element={<Single />}
/>

<Route
  path="/burst"
  element={<Burst />}
/>

<Route
  path="/ai-generator"
  element={<AIGenerator />}
/>

<Route
  path="/Aftertraining"
  element={<aftertraining />}
/>

<Route path="/detection-capture" element={<DetectionCapture />} />

{/* 📱 หน้ากล้องมือถือ — เปิดจากการสแกน QR ในหน้า DetectionCapture (ไม่ต้อง logi
n) */}
<Route path="/mobile-camera" element={<MobileCameraCapture />} />

<Route path="/select-training" element={<SelectTraining />} />

<Route path="/page_train_export" element={<Train_export />} />
<Route path="/bookbank" element={<BookBank />} />
<Route path="/confirm-payment" element={<ConfirmPayment />} />

{/* ================= English-version pages ================= */}
{/* ใช้เมื่อ Dashboard ตรวจสอบ localStorage "language" แล้วเป็น "English" */}

<Route path="/project" element={<EnNewproject />} />
<Route path="/enproject" element={<EnProjects />} />
<Route path="/entest-model" element={<EnTestModel />} />
<Route path="/enpricing" element={<EnPricing />} />
<Route path="/enpage_train_export" element={<EnTrain_export />} />
<Route path="/endetection-capture" element={<EnDetectionCapture />} />
 <Route path="/encheckout" element={<EnCheckout />} />
 <Route path="/enbookbank" element={<EnBookBank />} />
 <Route path="/admin" element={<PageAdmin />} />
 
</Routes>
    </BrowserRouter>
  );
}

export default App;