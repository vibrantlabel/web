import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

function Login() {

  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [serverId, setServerId] = useState("");
  const [serverUrl, setServerUrl] = useState("");

  //--------------------------------------------------
  // Load Cloud URL
  //--------------------------------------------------
  useEffect(() => {

    setServerUrl(localStorage.getItem("cloud_url") || "");
    setServerId(localStorage.getItem("server_id") || "");

    // เคลียร์ช่องกรอก
    setEmail("");
    setPassword("");

  }, []);

  //--------------------------------------------------
  // Login
  // ลองล็อกอินแบบผู้ใช้ทั่วไปก่อนเสมอ ถ้าไม่ผ่าน ค่อยลองเช็คว่าค่าที่กรอก
  // ในช่อง Password เป็น "รหัส admin" ที่ super admin ตั้งไว้ที่ server
  // หรือไม่ (ไม่มี UI พิเศษให้เห็นเลย — คนทั่วไปเห็นแค่ฟอร์ม login ปกติ)
  //--------------------------------------------------
  const login = async () => {

    if (!email.trim()) {
      setMessage("กรุณากรอก Email");
      return;
    }

    if (!password) {
      setMessage("กรุณากรอก Password");
      return;
    }

    if (!serverUrl) {
      setMessage("ไม่พบ Cloud URL");
      return;
    }

    setIsSubmitting(true);

    try {

      const response = await fetch(`${serverUrl}/login-user`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password
        })
      });

      const result = await response.json();

      if (response.ok) {

        localStorage.setItem("email", result.email);
        localStorage.setItem("fullname", result.fullname);

        setMessage("Login Success");

        navigate("/");

        return;
      }

      // ---------------------------------------------
      // 🆕 Login ผู้ใช้ทั่วไปไม่ผ่าน -> ลองเช็คว่าค่าที่กรอกในช่อง
      // Password เป็นรหัส admin หรือไม่ (เงียบๆ ไม่มี UI บอกว่ากำลังลองอยู่)
      // ---------------------------------------------
      const adminResponse = await fetch(`${serverUrl}/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminKey: password.trim() })
      });

      const adminResult = await adminResponse.json();

      if (adminResult.status === "success") {

        // ⚠️ เก็บ "รหัสดิบ" ไว้ ไม่ใช่ token ที่หมดอายุ เพราะทุก action ของ
        // admin จะแนบรหัสนี้ไปให้ server เช็คสถานะซ้ำทุกครั้ง — ถ้ารหัสถูก
        // ยกเลิกที่ server เมื่อไหร่ คำขอครั้งถัดไปจะถูกปฏิเสธทันที
        localStorage.setItem("admin_code", password.trim());
        localStorage.setItem("admin_role", adminResult.role || "sub");
        localStorage.setItem("admin_label", adminResult.label || "");

        setMessage("Login Success");

        navigate("/admin");

        return;
      }

      // ทั้งสองทางไม่ผ่าน -> โชว์ error ของ user login ตามปกติ
      // (ไม่บอกใบ้ว่ามีการเช็คโหมด admin อยู่เบื้องหลังด้วย)
      setMessage(result.message || "Login Failed");

    } catch (err) {
      console.error(err);
      setMessage(err.toString());
    } finally {
      setIsSubmitting(false);
    }
  };

  return (

    <div style={{ maxWidth: "500px", margin: "40px auto", padding: "20px" }}>

      <h2 style={{ textAlign: "center", marginBottom: "20px" }}>
        Login
      </h2>

      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{
          width: "100%",
          padding: "12px",
          border: "1px solid #ccc",
          borderRadius: "8px",
          marginBottom: "15px",
          boxSizing: "border-box"
        }}
      />

      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") login(); }}
        style={{
          width: "100%",
          padding: "12px",
          border: "1px solid #ccc",
          borderRadius: "8px",
          marginBottom: "20px",
          boxSizing: "border-box"
        }}
      />

      <button
        onClick={login}
        disabled={isSubmitting}
        style={{
          width: "100%",
          backgroundColor: "#0078D7",
          color: "white",
          padding: "12px",
          border: "none",
          borderRadius: "8px",
          fontSize: "16px",
          cursor: isSubmitting ? "not-allowed" : "pointer",
          opacity: isSubmitting ? 0.7 : 1
        }}
      >
        {isSubmitting ? "⏳ กำลังเข้าสู่ระบบ..." : "Login"}
      </button>

      <button
        onClick={() => navigate("/register")}
        style={{
          width: "100%",
          backgroundColor: "#10B981",
          color: "white",
          padding: "12px",
          border: "none",
          borderRadius: "8px",
          fontSize: "16px",
          marginTop: "10px",
          cursor: "pointer"
        }}
      >
        Create Account
      </button>

      <div
        style={{
          marginTop: "20px",
          textAlign: "center",
          color: message === "Login Success" ? "green" : "red"
        }}
      >
        {message}
      </div>

    </div>

  );
}

export default Login;