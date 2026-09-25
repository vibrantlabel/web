import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function ConfirmPayment() {
  const navigate = useNavigate();
  
  // 📥 ดึงค่าจาก localStorage โดยตรงแบบ Realtime
  const serverUrl = localStorage.getItem("cloud_url") || "http://localhost:5000"; // ดักจับเผื่อกรณีลืมเซฟลงเครื่อง
  const email = localStorage.getItem("email") || "guest_user@email.com"; // ปรับให้อ่านคีย์ "email" ตามที่ต้องการ

  // State เก็บข้อมูลฟอร์มที่เหลือ
  const [amount, setAmount] = useState("");
  const [bank, setBank] = useState("KBank");
  const [transferTime, setTransferTime] = useState("");
  const [slipFile, setSlipFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSlipFile(file);
      setPreviewUrl(URL.createObjectURL(file)); 
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!slipFile) {
      alert("กรุณาอัปโหลดสลิปการโอนเงิน");
      return;
    }

    setLoading(true);

    // 📦 บรรจุลง FormData
    const formData = new FormData();
    formData.append("email", email);
    formData.append("amount", amount);
    formData.append("bank", bank);
    formData.append("transfer_time", transferTime);
    formData.append("slip", slipFile);

    try {
      // 🚀 ยิง Endpoint ไปที่ serverUrl ที่ดึงมาจากเครื่อง
      const response = await fetch(`${serverUrl}/api/payment/confirm`, {
        method: "POST",
        body: formData, 
      });

      const result = await response.json();

      if (response.ok) {
        alert("🎉 แจ้งชำระเงินสำเร็จ! ระบบกำลังตรวจสอบหลักฐานของคุณ");
        navigate(-1); 
      } else {
        alert(`❌ เกิดข้อผิดพลาด: ${result.error}`);
      }
    } catch (error) {
      console.error("Error submitting payment:", error);
      alert("❌ ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 500, margin: "40px auto", padding: 20, fontFamily: "Arial, sans-serif" }}>
      <h2 style={{ textAlign: "center", color: "#333" }}>🧾 แจ้งชำระเงิน</h2>
      <p style={{ textAlign: "center", color: "#666", fontSize: 14 }}>
        อีเมลผู้ใช้งาน: <strong>{email}</strong>
      </p>
      
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 15, marginTop: 20 }}>
        <div>
          <label style={{ display: "block", marginBottom: 5, fontSize: 14, fontWeight: "bold" }}>ธนาคารที่โอนเข้า</label>
          <select value={bank} onChange={(e) => setBank(e.target.value)} style={inputStyle}>
            <option value="KBank">กสิกรไทย (KBank)</option>
            <option value="SCB">ไทยพาณิชย์ (SCB)</option>
          </select>
        </div>

        <div>
          <label style={{ display: "block", marginBottom: 5, fontSize: 14, fontWeight: "bold" }}>จำนวนเงิน (บาท)</label>
          <input type="number" placeholder="เช่น 350" required value={amount} onChange={(e) => setAmount(e.target.value)} style={inputStyle} />
        </div>

        <div>
          <label style={{ display: "block", marginBottom: 5, fontSize: 14, fontWeight: "bold" }}>วัน-เวลาที่โอนเงิน (ตามสลิป)</label>
          <input type="datetime-local" required value={transferTime} onChange={(e) => setTransferTime(e.target.value)} style={inputStyle} />
        </div>

        <div>
          <label style={{ display: "block", marginBottom: 5, fontSize: 14, fontWeight: "bold" }}>อัปโหลดภาพสลิป (.jpg / .png)</label>
          <input type="file" accept="image/*" required onChange={handleFileChange} style={{ fontSize: 14 }} />
          {previewUrl && (
            <img src={previewUrl} alt="Slip Preview" style={{ width: "100%", maxWidth: "200px", marginTop: 10, borderRadius: 8, border: "1px solid #ddd" }} />
          )}
        </div>

        <button type="submit" disabled={loading} style={{ ...buttonStyle, background: loading ? "#ccc" : "#007A3E" }}>
          {loading ? "กำลังส่งข้อมูล..." : "ส่งหลักฐานการโอนเงิน"}
        </button>

        <button type="button" onClick={() => navigate(-1)} style={{ ...buttonStyle, background: "none", color: "#666", border: "1px solid #ccc" }}>
          ยกเลิก
        </button>
      </form>
    </div>
  );
}

const inputStyle = { width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #ccc", boxSizing: "border-box" };
const buttonStyle = { color: "white", padding: "12px", borderRadius: "8px", border: "none", fontSize: "16px", fontWeight: "bold", cursor: "pointer", marginTop: 10 };