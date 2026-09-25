import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";

import logo from "../assets/logo.png";

const HUB_URL = "https://hublineoa-369387278497.asia-southeast3.run.app";

function Dashboard() {

  const navigate = useNavigate();

  const [serverId, setServerId] = useState("");
  const [cloudUrl, setCloudUrl] = useState("");

  const [registerInfo, setRegisterInfo] = useState("Checking...");
  const [isChecking, setIsChecking] = useState(true);
  const [isConnected, setIsConnected] = useState(false);

  // ---------------------------------------------
  // ผู้ใช้ปัจจุบัน (สำหรับแสดงชื่อ + logout)
  // ---------------------------------------------
  const [fullname, setFullname] = useState("");
  const [email, setEmail] = useState("");

  // ---------------------------------------------
  // Language ปัจจุบัน (เก็บใน localStorage เพื่อใช้อ้างอิงในหน้าอื่นๆ)
  // ค่า default = "English"
  // ---------------------------------------------
  const [language, setLanguage] = useState(
    () => localStorage.getItem("language") || "English"
  );

  // ---------------------------------------------
  // Plan ปัจจุบัน (ดึงจริงจาก Firestore: user/{email}/plan/select
  // ผ่าน backend endpoint /get_user_plan)
  // ---------------------------------------------
  const [planName, setPlanName] = useState("Free");
  const [planUsage, setPlanUsage] = useState(null);
  const [planLimits, setPlanLimits] = useState(null);
  const [loadingPlan, setLoadingPlan] = useState(false);

  // ---------------------------------------------
  // Recent Projects preview
  // ---------------------------------------------
  const [recentProjects, setRecentProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(false);

  //--------------------------------------------------
  // Fetch พร้อม timeout (กัน worker ค้าง ไม่ตอบกลับ)
  //--------------------------------------------------
  const fetchWithTimeout = async (url, options = {}, timeoutMs = 15000) => {

    const controller = new AbortController();

    const timer = setTimeout(
      () => controller.abort(),
      timeoutMs
    );

    try {

      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });

      return response;

    } finally {

      clearTimeout(timer);
    }
  };

  //--------------------------------------------------
  // เรียก HUB เพื่อขอ server ใหม่ (load_score น้อยที่สุด)
  //--------------------------------------------------
  const fetchFromHub = async () => {

    const hubResponse = await fetchWithTimeout(
      `${HUB_URL}/app-check-register`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({})
      } ,8000
    );

    const hubData = await hubResponse.json();

    console.log("HUB:", hubData);

    if (!hubData.server_id || !hubData.cloud_url) {
      return null;
    }

    localStorage.setItem("server_id", hubData.server_id);
    localStorage.setItem("cloud_url", hubData.cloud_url);

    return {
      serverId: hubData.server_id,
      cloudUrl: hubData.cloud_url
    };
  };
  

    //--------------------------------------------------
  // Helper: แปลงจำนวนไบต์ -> ข้อความอ่านง่าย (KB/MB/GB)
  // ใช้แสดงพื้นที่จัดเก็บที่ใช้ไป เทียบกับโควต้าของแผน
  //--------------------------------------------------
  const formatBytes = (bytes) => {
    if (!bytes || bytes <= 0) return "0 MB";
    const mb = bytes / (1024 * 1024);
    if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
    return `${mb.toFixed(1)} MB`;
  };
  //--------------------------------------------------
  // หน่วงเวลาเล็กน้อยก่อน retry
  //--------------------------------------------------
  const delay = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  //--------------------------------------------------
  // Check HUB Register
  //--------------------------------------------------
  const checkRegister = async () => {

    setIsChecking(true);
    setIsConnected(false);

    try {

      // ---------------------------------------------
      // STEP 0 : ใช้ค่าที่เก็บไว้ก่อน ถ้ามีแล้วไม่ต้องยิง HUB อีก
      // ---------------------------------------------
      let currentServerId = localStorage.getItem("server_id");
      let currentCloudUrl = localStorage.getItem("cloud_url");

      if (!currentServerId || !currentCloudUrl) {

        // STEP 1 : HUB
        const hubResult = await fetchFromHub();

        if (!hubResult) {

          setRegisterInfo("❌ disconnect from server");
          setIsChecking(false);

          return;
        }

        currentServerId = hubResult.serverId;
        currentCloudUrl = hubResult.cloudUrl;
      }

      setServerId(currentServerId);
      setCloudUrl(currentCloudUrl);

      // ---------------------------------------------
      // STEP 2 : CHECK REGISTER
      // (retry ยิงไปที่ cloud_url ตัวเดิมเท่านั้น
      //  ไม่ลบ cache / ไม่ขอ server ใหม่จาก HUB
      //  เพราะ user ที่ลงทะเบียนไว้แล้วผูกอยู่กับ worker ตัวนี้)
      // ---------------------------------------------
      const currentEmail = localStorage.getItem("email");

      console.log("EMAIL:", currentEmail);

      const MAX_ATTEMPTS = 3;

      let workerResponse = null;
      let lastError = null;

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {

        try {

          if (attempt > 1) {

            setRegisterInfo(
              `⏳ Reconnecting... (${attempt}/${MAX_ATTEMPTS})`
            );

            await delay(1500);
          }

          workerResponse = await fetchWithTimeout(
            `${currentCloudUrl}/check-register`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({ email: currentEmail })
            }
          );

          if (!workerResponse.ok) {
            throw new Error(
              `worker status ${workerResponse.status}`
            );
          }

          // สำเร็จ → เลิก loop
          lastError = null;

          break;

        } catch (workerErr) {

          console.error(
            `WORKER FETCH FAILED (attempt ${attempt}):`,
            workerErr
          );

          lastError = workerErr;
          workerResponse = null;
        }
      }

      // ---------------------------------------------
      // ลอง MAX_ATTEMPTS ครั้งแล้วยัง fail
      // → ไม่ลบ server_id / cloud_url เดิม (server อาจแค่ดับชั่วคราว)
      //   รอบหน้าเข้ามาใหม่จะได้ลองต่อ server เดิมนี้อีก
      // ---------------------------------------------
      if (lastError || !workerResponse) {

        setRegisterInfo("❌ Connection Error");
        setIsChecking(false);

        return;
      }

      const workerData = await workerResponse.json();

      console.log("WORKER:", workerData);

      if (workerData.registered === true) {

        setRegisterInfo("✅ Connected");
        setIsConnected(true);

        // โหลด Recent Projects เมื่อเชื่อมต่อสำเร็จ
        loadRecentProjects(currentCloudUrl, currentEmail);

        // โหลด Plan จริงจาก Firestore (user/{email}/plan/select)
        loadUserPlan(currentCloudUrl, currentEmail);

      } else {

        setRegisterInfo("❌ Not Registered");

        navigate("/login");
      }

    } catch (err) {

      console.error(err);

      setRegisterInfo("❌ Connection Error");

    } finally {

      setIsChecking(false);
    }
  };

  //--------------------------------------------------
  // โหลด Recent Projects (3 รายการล่าสุด) จาก backend
  // endpoint: POST /get_projects_v2 { email }
  // เรียงตาม updated_at (ใหม่สุดก่อน) แล้วตัดเอาแค่ 3 รายการแรก
  //--------------------------------------------------
  const loadRecentProjects = async (cloudUrlValue, emailValue) => {

    if (!cloudUrlValue || !emailValue) return;

    try {

      setLoadingProjects(true);

      const response = await fetchWithTimeout(
        `${cloudUrlValue}/get_projects_v2`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ email: emailValue })
        }
      );

      const result = await response.json();

      console.log("PROJECTS:", result);

      if (result.success && Array.isArray(result.data)) {

        // ---------------------------------------------
        // เรียงตาม updated_at ใหม่สุด -> เก่าสุด
        // (ถ้า parse เป็นวันที่ไม่ได้ เช่น field ว่าง ให้ถือว่าเก่าสุด
        // จะได้ไม่ทำให้ project ที่ข้อมูลไม่ครบมาแทรกอยู่บนสุดผิดที่)
        // ---------------------------------------------
        const sorted = [...result.data].sort((a, b) => {
          const dateA = new Date(a.updated_at || a.created_at || 0).getTime() || 0;
          const dateB = new Date(b.updated_at || b.created_at || 0).getTime() || 0;
          return dateB - dateA;
        });

        setRecentProjects(sorted.slice(0, 3));

      } else {

        setRecentProjects([]);
      }

    } catch (err) {

      console.error("LOAD RECENT PROJECTS FAILED:", err);
      setRecentProjects([]);

    } finally {

      setLoadingProjects(false);
    }
  };

  //--------------------------------------------------
  // โหลด Plan ปัจจุบันของ user จาก Firestore
  // path: user/{email}/plan/select
  // ผ่าน backend endpoint POST /get_user_plan
  //--------------------------------------------------
  const loadUserPlan = async (cloudUrlValue, emailValue) => {

    if (!cloudUrlValue || !emailValue) return;

    try {

      setLoadingPlan(true);

      const response = await fetchWithTimeout(
        `${cloudUrlValue}/get_user_plan`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ email: emailValue })
        }
      );

      const result = await response.json();

      console.log("PLAN:", result);

      if (result.success) {

        const plan = result.plan || "Free";

        setPlanName(plan);
        setPlanUsage(result.usage || null);
        setPlanLimits(result.limits || null);

        // เก็บ cache ไว้ให้หน้าอื่นใช้ต่อได้ (เช่น Pricing.jsx)
        localStorage.setItem("selected_plan", plan);

      } else {

        // ถ้า backend ตอบ fail ให้ fallback ไปใช้ค่าที่เคย cache ไว้
        setPlanName(
          localStorage.getItem("selected_plan") || "Free"
        );
      }

    } catch (err) {

      console.error("LOAD USER PLAN FAILED:", err);

      // network พัง ก็ fallback ไปใช้ค่า cache เดิมไปก่อน
      setPlanName(
        localStorage.getItem("selected_plan") || "Free"
      );

    } finally {

      setLoadingPlan(false);
    }
  };

 
  //--------------------------------------------------
  // Helper: จัดรูปแบบ updated_at ที่ backend ส่งมาเป็น string ดิบจาก
  // Firestore (เช่น "2026-07-22 07:31:41.965000+00:00") ให้อ่านง่ายขึ้น
  // เป็น "2026-07-22 07:31:41 น." (ตัด microseconds + timezone offset ทิ้ง)
  //--------------------------------------------------
  const formatUpdatedAt = (raw) => {

    if (!raw) return "";

    // ดึงแค่ส่วน "YYYY-MM-DD HH:MM:SS" ตัวแรกที่เจอ ทิ้งเศษวินาที/timezone ท้ายสุด
    const match = String(raw).match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/);

    if (!match) return raw; // เจอรูปแบบแปลกๆ ที่ parse ไม่ได้ -> โชว์ค่าดิบไปก่อน ดีกว่าไม่โชว์อะไรเลย

    return `${match[1]} น.`;
  };

  //--------------------------------------------------
  // เปลี่ยนภาษา + เก็บลง localStorage เพื่อให้หน้าอื่นอ้างอิงได้
  //--------------------------------------------------
  const handleLanguageChange = (e) => {

    const lang = e.target.value;

    setLanguage(lang);

    localStorage.setItem("language", lang);
  };

  //--------------------------------------------------
  // Logout
  //--------------------------------------------------
  const logout = () => {

    if (!window.confirm("ต้องการออกจากระบบใช่หรือไม่?")) {
      return;
    }

    // เคลียร์เฉพาะข้อมูลผู้ใช้ ไม่แตะ server_id / cloud_url
    // (จะได้ไม่ต้องขอ server ใหม่จาก HUB ตอน login รอบหน้า)
    localStorage.removeItem("email");
    localStorage.removeItem("fullname");

    navigate("/login");
  };

  //--------------------------------------------------
  // On Load
  //--------------------------------------------------
  useEffect(() => {

    setFullname(localStorage.getItem("fullname") || "");
    setEmail(localStorage.getItem("email") || "");

    // ใช้ค่า cache ไปก่อนระหว่างรอ backend ตอบกลับจริง
    setPlanName(localStorage.getItem("selected_plan") || "Free");

    // ตั้งค่า default ภาษาใน localStorage ถ้ายังไม่เคยตั้งมาก่อน
    if (!localStorage.getItem("language")) {
      localStorage.setItem("language", "English");
    }

    checkRegister();

  }, []);

  {/* Camera View */}
  const addnewproject = () => {

    localStorage.removeItem("project_name");
    localStorage.removeItem("resize_width");
    localStorage.removeItem("resize_height");

    // ไทย -> /new-project (Newproject) | English -> /project (Ennewproject)
    if (language === "ไทย") {
      navigate("/new-project");
    } else {
      navigate("/project");
    }
  };
  {/* end Camera View */}

  //--------------------------------------------------
  // Language-aware navigation สำหรับเมนูอื่นๆ
  //--------------------------------------------------
  const openProjects = () => {
    // ไทย -> /projects (Projects) | English -> /enproject (EnProjects)
    navigate(language === "ไทย" ? "/projects" : "/enproject");
  };

  const openTestModel = () => {
    // ไทย -> /test-model (TestModel) | English -> /entest-model (EnTestModel)
    navigate(language === "ไทย" ? "/test-model" : "/entest-model");
  };

  const openPricing = () => {
    // ไทย -> /pricing (Pricing) | English -> /enpricing (EnPricing)
    navigate(language === "ไทย" ? "/pricing" : "/enpricing");
  };

  //--------------------------------------------------
  // Helper: อักษรตัวแรกของชื่อ สำหรับ avatar
  //--------------------------------------------------
  const initial = (fullname || email || "U").trim().charAt(0).toUpperCase();

  //--------------------------------------------------
  // Status tone configuration
  //--------------------------------------------------
  const statusTone = isChecking ? "checking" : isConnected ? "online" : "offline";

  //--------------------------------------------------
  // ข้อมูลเมนูหลัก (ไอคอน สี และ action)
  //--------------------------------------------------
  const menuItems = [
    { label: "New Project", icon: "📂", tone: "primary", onClick: addnewproject },
    { label: "Open Projects", icon: "🗂️", tone: "primary-soft", onClick: openProjects },
    { label: "Test Model", icon: "🧪", tone: "violet", onClick: openTestModel },
    { label: "Pricing", icon: "💳", tone: "green", onClick: openPricing }
  ];

  return (
    <div className="dl-page">

      {/* ================= Global styles / design tokens ================= */}
      <style>
        {`
          @import url('https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap');

          :root {
            --dl-bg: #F4F6FB;
            --dl-surface: #FFFFFF;
            --dl-border: #E6EAF2;
            --dl-text: #10162B;
            --dl-text-soft: #67708C;
            --dl-text-faint: #9AA3BD;
            --dl-primary: #4E5BF2;
            --dl-primary-dark: #3B46D1;
            --dl-primary-soft: #EEF0FF;
            --dl-violet: #7C4DFF;
            --dl-green: #16A672;
            --dl-green-soft: #E7F8F1;
            --dl-amber: #D98A16;
            --dl-amber-soft: #FFF4E0;
            --dl-red: #E23D4F;
            --dl-red-soft: #FDEBEE;
            --dl-radius-lg: 20px;
            --dl-radius-md: 14px;
            --dl-radius-sm: 10px;
            --dl-shadow-sm: 0 1px 2px rgba(16,22,43,.04), 0 2px 8px rgba(16,22,43,.05);
            --dl-shadow-md: 0 8px 24px rgba(16,22,43,.08);
            --dl-font-display: 'Sora', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            --dl-font-body: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          }

          @keyframes dl-pulse-ring {
            0%   { box-shadow: 0 0 0 0 var(--dl-ring-color, rgba(22,166,114,.45)); }
            70%  { box-shadow: 0 0 0 8px rgba(0,0,0,0); }
            100% { box-shadow: 0 0 0 0 rgba(0,0,0,0); }
          }
          @keyframes dl-skeleton {
            0%   { opacity: .45; }
            50%  { opacity: 1;   }
            100% { opacity: .45; }
          }
          @keyframes dl-fade-up {
            from { opacity: 0; transform: translateY(10px); }
            to   { opacity: 1; transform: translateY(0); }
          }

          * { box-sizing: border-box; }

          .dl-page {
            width: 100%;
            max-width: 720px;
            margin: 0 auto;
            padding: 20px 16px 48px;
            font-family: var(--dl-font-body);
            color: var(--dl-text);
            background: var(--dl-bg);
          }

          .dl-fade { animation: dl-fade-up .5s ease both; }
          .dl-fade-1 { animation-delay: .02s; }
          .dl-fade-2 { animation-delay: .08s; }
          .dl-fade-3 { animation-delay: .14s; }
          .dl-fade-4 { animation-delay: .2s; }

          .dl-skeleton {
            background: linear-gradient(90deg, #E7EBF5, #F1F3FA, #E7EBF5);
            border-radius: 8px;
            animation: dl-skeleton 1.3s ease-in-out infinite;
          }

          /* ---------- Top bar ---------- */
          .dl-topbar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            flex-wrap: wrap;
          }
          .dl-user {
            display: flex;
            align-items: center;
            gap: 12px;
            min-width: 0;
          }
          .dl-avatar {
            flex: 0 0 auto;
            width: 42px;
            height: 42px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: var(--dl-font-display);
            font-weight: 600;
            font-size: 16px;
            color: #fff;
            background: linear-gradient(135deg, var(--dl-primary), var(--dl-violet));
            box-shadow: var(--dl-shadow-sm);
          }
          .dl-user-name {
            font-family: var(--dl-font-display);
            font-weight: 600;
            font-size: 15px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .dl-user-email {
            color: var(--dl-text-faint);
            font-size: 12px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          /* ---------- Top bar actions (language + logout) ---------- */
          .dl-topbar-actions {
            display: flex;
            align-items: center;
            gap: 10px;
            flex-wrap: wrap;
          }

          .dl-lang-select {
            appearance: none;
            -webkit-appearance: none;
            -moz-appearance: none;
            background: var(--dl-surface) url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path d='M1 1l4 4 4-4' stroke='%2367708C' stroke-width='1.5' fill='none' fill-rule='evenodd'/></svg>") no-repeat right 12px center;
            color: var(--dl-text);
            border: 1px solid var(--dl-border);
            padding: 9px 30px 9px 14px;
            font-size: 13px;
            font-weight: 600;
            font-family: var(--dl-font-body);
            border-radius: 999px;
            cursor: pointer;
            transition: background-color .15s ease, transform .1s ease;
          }
          .dl-lang-select:hover { background-color: #F7F8FC; }
          .dl-lang-select:active { transform: scale(.97); }
          .dl-lang-select:focus {
            outline: none;
            border-color: var(--dl-primary);
            box-shadow: 0 0 0 3px rgba(78,91,242,.15);
          }

          .dl-btn-logout {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            background: var(--dl-surface);
            color: var(--dl-red);
            border: 1px solid var(--dl-red-soft);
            padding: 9px 16px;
            font-size: 13px;
            font-weight: 600;
            border-radius: 999px;
            cursor: pointer;
            transition: background .15s ease, transform .1s ease;
            white-space: nowrap;
          }
          .dl-btn-logout:hover { background: var(--dl-red-soft); }
          .dl-btn-logout:active { transform: scale(.97); }

          /* ---------- Hero ---------- */
          .dl-hero {
            text-align: center;
            margin-top: 22px;
            margin-bottom: 22px;
            padding: 28px 20px 24px;
            border-radius: var(--dl-radius-lg);
            background:
              radial-gradient(120% 140% at 50% -20%, rgba(78,91,242,.14), rgba(78,91,242,0) 60%),
              var(--dl-surface);
            border: 1px solid var(--dl-border);
            box-shadow: var(--dl-shadow-sm);
          }
          .dl-logo-ring {
            width: 92px;
            height: 92px;
            margin: 0 auto 12px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            background: linear-gradient(135deg, var(--dl-primary-soft), #fff);
            border: 1px solid var(--dl-border);
          }
          .dl-logo-ring img {
            width: 56px;
            height: 56px;
            object-fit: contain;
            display: block;
          }
          .dl-hero-tagline {
            font-family: var(--dl-font-display);
            font-weight: 600;
            font-size: 15px;
            color: var(--dl-text);
            margin-top: 2px;
          }
          .dl-hero-sub {
            color: var(--dl-text-faint);
            font-size: 12.5px;
            margin-top: 3px;
          }

          .dl-status-row {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            margin-top: 18px;
            flex-wrap: wrap;
          }
          .dl-status-label {
            font-size: 13px;
            color: var(--dl-text-soft);
            font-weight: 600;
          }
          .dl-status-pill {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 6px 14px;
            border-radius: 999px;
            font-size: 13px;
            font-weight: 600;
          }
          .dl-status-pill.online   { background: var(--dl-green-soft); color: var(--dl-green); }
          .dl-status-pill.offline  { background: var(--dl-red-soft);   color: var(--dl-red); }
          .dl-status-pill.checking { background: var(--dl-amber-soft); color: var(--dl-amber); }

          .dl-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            flex: 0 0 auto;
          }
          .dl-dot.online   { background: var(--dl-green);  --dl-ring-color: rgba(22,166,114,.45); animation: dl-pulse-ring 1.8s ease-out infinite; }
          .dl-dot.offline  { background: var(--dl-red); }
          .dl-dot.checking { background: var(--dl-amber);  --dl-ring-color: rgba(217,138,22,.45); animation: dl-pulse-ring 1.4s ease-out infinite; }

          .dl-btn-reconnect {
            background: var(--dl-amber-soft);
            color: var(--dl-amber);
            border: 1px solid rgba(217,138,22,.25);
            padding: 6px 14px;
            font-size: 12.5px;
            font-weight: 600;
            border-radius: 999px;
            cursor: pointer;
            transition: filter .15s ease, transform .1s ease;
          }
          .dl-btn-reconnect:hover { filter: brightness(.97); }
          .dl-btn-reconnect:active { transform: scale(.97); }

          /* ---------- Cards (generic) ---------- */
          .dl-card {
            background: var(--dl-surface);
            border: 1px solid var(--dl-border);
            border-radius: var(--dl-radius-md);
            box-shadow: var(--dl-shadow-sm);
          }

          /* ---------- Plan card ---------- */
          .dl-plan-card {
            padding: 18px 20px;
            margin-bottom: 20px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 14px;
            flex-wrap: wrap;
          }
          .dl-plan-eyebrow {
            color: var(--dl-text-faint);
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: .04em;
          }
          .dl-plan-name {
            font-family: var(--dl-font-display);
            font-weight: 700;
            font-size: 19px;
            color: var(--dl-primary-dark);
            margin-top: 2px;
          }
          .dl-plan-usage {
            color: var(--dl-text-soft);
            font-size: 12px;
            margin-top: 4px;
          }
          .dl-btn-upgrade {
            background: linear-gradient(135deg, var(--dl-primary), var(--dl-primary-dark));
            color: #fff;
            border: none;
            padding: 10px 18px;
            font-size: 13.5px;
            font-weight: 600;
            border-radius: var(--dl-radius-sm);
            cursor: pointer;
            box-shadow: 0 4px 12px rgba(78,91,242,.28);
            transition: transform .12s ease, box-shadow .12s ease;
            white-space: nowrap;
          }
          .dl-btn-upgrade:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(78,91,242,.36); }
          .dl-btn-upgrade:active { transform: translateY(0); }

          /* ---------- Menu grid ---------- */
          .dl-menu-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 12px;
            margin-bottom: 26px;
          }
          .dl-menu-btn {
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            justify-content: center;
            gap: 6px;
            padding: 16px;
            min-height: 84px;
            border: 1px solid var(--dl-border);
            border-radius: var(--dl-radius-md);
            cursor: pointer;
            font-family: var(--dl-font-display);
            font-weight: 600;
            font-size: 14.5px;
            text-align: left;
            transition: transform .12s ease, box-shadow .12s ease, border-color .12s ease;
            box-shadow: var(--dl-shadow-sm);
          }
          .dl-menu-btn:hover { transform: translateY(-2px); box-shadow: var(--dl-shadow-md); }
          .dl-menu-btn:active { transform: translateY(0); }
          .dl-menu-icon { font-size: 22px; line-height: 1; }

          .dl-menu-btn.primary      { background: linear-gradient(135deg, var(--dl-primary), var(--dl-primary-dark)); color: #fff; border-color: transparent; }
          .dl-menu-btn.primary-soft { background: var(--dl-primary-soft); color: var(--dl-primary-dark); }
          .dl-menu-btn.violet       { background: #F4EFFF; color: #5B2FD1; }
          .dl-menu-btn.green        { background: var(--dl-green-soft); color: var(--dl-green); }

          /* ---------- Recent projects ---------- */
          .dl-section-head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 12px;
          }
          .dl-section-title {
            margin: 0;
            font-family: var(--dl-font-display);
            font-weight: 700;
            font-size: 16px;
          }
          .dl-link-btn {
            background: none;
            border: none;
            color: var(--dl-primary);
            font-weight: 600;
            cursor: pointer;
            font-size: 13.5px;
            padding: 4px;
          }

          .dl-project-list { display: flex; flex-direction: column; gap: 10px; }
          .dl-project-card {
            padding: 14px 16px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            cursor: pointer;
            transition: transform .12s ease, box-shadow .12s ease;
          }
          .dl-project-card:hover { transform: translateY(-2px); box-shadow: var(--dl-shadow-md); }
          .dl-project-left { display: flex; align-items: center; gap: 12px; min-width: 0; }
          .dl-project-icon {
            flex: 0 0 auto;
            width: 38px;
            height: 38px;
            border-radius: 10px;
            background: var(--dl-primary-soft);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 17px;
          }
          .dl-project-name {
            font-weight: 700;
            font-size: 14.5px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .dl-project-meta {
            color: var(--dl-text-soft);
            font-size: 12.5px;
            margin-top: 2px;
          }
          .dl-project-arrow { color: var(--dl-primary); font-weight: 700; flex: 0 0 auto; }

          .dl-empty-card {
            padding: 28px 18px;
            text-align: center;
            color: var(--dl-text-faint);
            font-size: 13.5px;
          }

          /* ---------- Responsive: tablet ---------- */
          @media (min-width: 640px) {
            .dl-page { max-width: 760px; padding-top: 28px; }
            .dl-menu-grid { grid-template-columns: repeat(4, 1fr); }
            .dl-hero { padding: 34px 32px 30px; }
          }

          /* ---------- Responsive: desktop ---------- */
          @media (min-width: 1024px) {
            .dl-page { max-width: 920px; padding-top: 36px; }
            .dl-plan-card { padding: 22px 28px; }
            .dl-hero { padding: 40px 40px 36px; }
            .dl-project-card:hover,
            .dl-menu-btn:hover { box-shadow: 0 12px 28px rgba(16,22,43,.1); }
          }

          @media (prefers-reduced-motion: reduce) {
            .dl-fade, .dl-dot.online, .dl-dot.checking, .dl-skeleton { animation: none !important; }
          }
        `}
      </style>

      {/* ================= Top bar: User + Language + Logout ================= */}
      <div className="dl-topbar dl-fade dl-fade-1">

        <div className="dl-user">
          {fullname || email ? (
            <>
              <div className="dl-avatar">{initial}</div>
              <div style={{ minWidth: 0 }}>
                <div className="dl-user-name">👋 {fullname || "User"}</div>
                <div className="dl-user-email">{email}</div>
              </div>
            </>
          ) : (
            <>
              <div className="dl-skeleton" style={{ width: 42, height: 42, borderRadius: "50%" }} />
              <div className="dl-skeleton" style={{ width: 120, height: 30 }} />
            </>
          )}
        </div>

        <div className="dl-topbar-actions">

          <select
            className="dl-lang-select"
            value={language}
            onChange={handleLanguageChange}
            aria-label="Language"
          >
            <option value="English">English</option>
            <option value="ไทย">ไทย</option>
          </select>

          <button className="dl-btn-logout" onClick={logout}>
            🚪 Logout
          </button>

        </div>

      </div>

      {/* ================= Hero: Logo + status ================= */}
      <div className="dl-hero dl-fade dl-fade-2">

        <div className="dl-logo-ring">
          <img src={logo} alt="DataLens AI" />
        </div>

        <div className="dl-hero-tagline">Datasign AI - The Central Network for AI Training Data</div>
        <div className="dl-hero-sub">Powered by Google Cloud</div>

        <div className="dl-status-row">

          <span className="dl-status-label">Server</span>

          {isChecking ? (
            <div className="dl-skeleton" style={{ width: 130, height: 26, borderRadius: 999 }} />
          ) : (
            <span className={`dl-status-pill ${statusTone}`}>
              <span className={`dl-dot ${statusTone}`} />
              {registerInfo}
            </span>
          )}

          {!isChecking && !isConnected && (
            <button className="dl-btn-reconnect" onClick={checkRegister}>
              🔄 Reconnect
            </button>
          )}

        </div>

      </div>

      {/* ================= Plan / Usage ================= */}
      <div className="dl-card dl-plan-card dl-fade dl-fade-3">

        <div>
          <div className="dl-plan-eyebrow">Current Plan</div>

          {loadingPlan ? (
            <div className="dl-skeleton" style={{ width: 90, height: 22, marginTop: 4 }} />
          ) : (
            <div className="dl-plan-name">{planName}</div>
          )}

                   {!loadingPlan && planUsage && planLimits && (
            <>
              <div className="dl-plan-usage">
                📸 {planUsage.totalImages ?? 0}
                {planLimits.maxImages ? ` / ${planLimits.maxImages}` : ""} images
              </div>
              <div className="dl-plan-usage">
                💾 {formatBytes(planUsage.totalStorageBytes)}
                {planLimits.storageBytes ? ` / ${formatBytes(planLimits.storageBytes)}` : ""}
              </div>
              {/* 🆕 แถบแสดงเปอร์เซ็นต์พื้นที่จัดเก็บที่ใช้ไป */}
              {planLimits.storageBytes > 0 && (
                <div style={{
                  width: "100%", maxWidth: 220, height: 6, background: "#EEF0FF",
                  borderRadius: 999, overflow: "hidden", marginTop: 6
                }}>
                  <div style={{
                    width: `${Math.min(100, (planUsage.totalStorageBytes / planLimits.storageBytes) * 100)}%`,
                    height: "100%",
                    background: (planUsage.totalStorageBytes / planLimits.storageBytes) >= 0.9 ? "#E23D4F" : "#4E5BF2",
                    transition: "width 0.4s ease"
                  }} />
                </div>
              )}
            </>
          )}  
        </div>

        <button className="dl-btn-upgrade" onClick={openPricing}>
          Upgrade Plan
        </button>

      </div>

      {/* ================= Menu ================= */}
      <div className="dl-menu-grid dl-fade dl-fade-3">

        {menuItems.map((item) => (
          <button
            key={item.label}
            className={`dl-menu-btn ${item.tone}`}
            onClick={item.onClick}
          >
            <span className="dl-menu-icon">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}

      </div>
      {/* end menu */}

      {/* ================= Recent Projects ================= */}
      <div className="dl-fade dl-fade-4">

        <div className="dl-section-head">
          <h3 className="dl-section-title">📁 Recent Projects</h3>

          <button className="dl-link-btn" onClick={() => navigate("/projects")}>
            View all →
          </button>
        </div>

        {loadingProjects && (
          <div className="dl-project-list">
            <div className="dl-skeleton" style={{ height: 60 }} />
            <div className="dl-skeleton" style={{ height: 60 }} />
          </div>
        )}

        {!loadingProjects && recentProjects.length === 0 && isConnected && (
          <div className="dl-card dl-empty-card">
            ยังไม่มีโปรเจกต์ — เริ่มสร้างโปรเจกต์แรกของคุณได้เลย
          </div>
        )}

        {!loadingProjects && recentProjects.length > 0 && (
          <div className="dl-project-list">

            {recentProjects.map((project, index) => (
              <div
                key={index}
                className="dl-card dl-project-card"
                onClick={() => navigate("/projects")}
              >
                <div className="dl-project-left">
                  <div className="dl-project-icon">📁</div>
                  <div style={{ minWidth: 0 }}>
                    <div className="dl-project-name">{project.project}</div>
                    <div className="dl-project-meta">
                      🖼️ {project.total_images ?? 0} รูป
                      {project.updated_at ? ` · อัปเดตล่าสุด ${formatUpdatedAt(project.updated_at)}` : ""}
                    </div>
                  </div>
                </div>

                <div className="dl-project-arrow">→</div>
              </div>
            ))}

          </div>
        )}

      </div>

    </div>
  );
}

export default Dashboard;