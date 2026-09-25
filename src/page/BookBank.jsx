import React from "react";
import { useNavigate } from "react-router-dom";

export default function Bookbank() {
  const navigate = useNavigate();

  // สไตล์สำหรับกล่องธนาคาร (Reuse)
  const blockStyle = {
    background: "#FFF",
    border: "1px solid #E5E7EB",
    borderRadius: 16,
    padding: 25,
    boxShadow: "0 4px 15px rgba(0,0,0,.05)",
    display: "flex",
    flexDirection: "column",
    gap: "10px"
  };

  const labelStyle = {
    fontSize: "13px",
    color: "#666",
    fontWeight: "500"
  };

  const valueStyle = {
    fontSize: "16px",
    color: "#111",
    fontWeight: "bold",
    marginBottom: "5px"
  };

  return (
  <div
    style={{
      maxWidth: 800,
      margin: "40px auto",
      padding: 20,
      fontFamily: "Arial, sans-serif"
    }}
  >
    <h1 style={{ textAlign: "center", marginBottom: 10 }}>
      🏦 Bank Transfer Information
    </h1>
    <p style={{ textAlign: "center", color: "#666", marginBottom: 35 }}>
      Please choose your preferred bank account to complete the payment.
    </p>

    {/* ===================================================
        GRID LAYOUT
       =================================================== */}
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
        gap: 20,
        marginBottom: 35 // เว้นระยะห่างด้านล่างกลุ่มกล่องธนาคาร
      }}
    >
      {/* ------------------------------------------
          BLOCK: ธนาคารในประเทศ (KBank + QR Code)
         ------------------------------------------ */}
      <div style={blockStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 20 }}>🇹🇭</span>
          <h3 style={{ margin: 0, color: "#007A3E" }}>ธนาคารในประเทศ (KBank)</h3>
        </div>
        <hr style={{ border: "0.5px solid #F0F0F0", margin: "5px 0" }} />

        <div>
          <div style={labelStyle}>ธนาคาร</div>
          <div style={valueStyle}>กสิกรไทย (KBank)</div>
        </div>
        <div>
          <div style={labelStyle}>เลขที่บัญชี</div>
          <div style={{ ...valueStyle, color: "#007A3E", fontSize: 18 }}>
            172-3-98056-5
          </div>
        </div>
        <div>
          <div style={labelStyle}>ชื่อบัญชี</div>
          <div style={valueStyle}>ว่าที่ ร.ต. ธนู ทองสี</div>
        </div>
        <div>
          <div style={labelStyle}>สาขา</div>
          <div style={valueStyle}>เลย</div>
        </div>

        {/* ส่วนแสดง QR Code (.jpeg) */}
        <div 
          style={{ 
            marginTop: "10px", 
            padding: "10px", 
            background: "#F9F9F9", 
            borderRadius: "12px", 
            textAlign: "center" 
          }}
        >
          <div style={{ ...labelStyle, marginBottom: "8px" }}>Scan to Pay (PromptPay)</div>
          <img 
            src="/QRcode_Kplus.jpeg" // 👈 วางไว้ในโฟลเดอร์ public เรียบร้อย
            alt="KBank PromptPay QR Code"
            style={{
              width: "100%",
              maxWidth: "180px",
              height: "auto",
              borderRadius: "8px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.05)"
            }}
          />
        </div>
      </div>

      {/* ------------------------------------------
          BLOCK: ธนาคารในประเทศ (SCB + QR Code)
         ------------------------------------------ */}
      <div style={blockStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 20 }}>🇹🇭</span>
          <h3 style={{ margin: 0, color: "#4E2A84" }}>ธนาคารในประเทศ (SCB)</h3>
        </div>
        <hr style={{ border: "0.5px solid #F0F0F0", margin: "5px 0" }} />

        <div>
          <div style={labelStyle}>ธนาคาร</div>
          <div style={valueStyle}>ไทยพาณิชย์ (SCB)</div>
        </div>
        <div>
          <div style={labelStyle}>เลขที่บัญชี</div>
          <div style={{ ...valueStyle, color: "#4E2A84", fontSize: 18 }}>
            xxx-x-xxxxx-x
          </div>
        </div>
        <div>
          <div style={labelStyle}>ชื่อบัญชี</div>
          <div style={valueStyle}>ว่าที่ ร.ต. ธนู ทองสี</div>
        </div>
        <div>
          <div style={labelStyle}>สาขา</div>
          <div style={valueStyle}>เลย</div>
        </div>

        {/* ส่วนแสดง QR Code (.jpeg) */}
        <div 
          style={{ 
            marginTop: "10px", 
            padding: "10px", 
            background: "#F9F9F9", 
            borderRadius: "12px", 
            textAlign: "center" 
          }}
        >
          <div style={{ ...labelStyle, marginBottom: "8px" }}>Scan to Pay (PromptPay)</div>
          <img 
            src="/QRcode_SCB.jpeg" // 👈 วางไว้ในโฟลเดอร์ public เรียบร้อย
            alt="SCB PromptPay QR Code"
            style={{
              width: "100%",
              maxWidth: "180px",
              height: "auto",
              borderRadius: "8px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.05)"
            }}
          />
        </div>
      </div>
    </div>

    {/* ===================================================
        ปุ่มแจ้งชำระเงิน
       =================================================== */}
    <div style={{ margin: "40px 0 20px 0", textAlign: "center" }}> 
      
      <button
        onClick={() => navigate("/confirm-payment")}
        style={{
          background: "#007A3E",
          color: "white",
          padding: "14px 28px",
          borderRadius: "10px",
          border: "none",
          fontSize: "16px",
          fontWeight: "bold",
          cursor: "pointer",
          boxShadow: "0 4px 10px rgba(0, 122, 62, 0.2)",
          width: "100%",
          maxWidth: "340px"
        }}
      >
        🧾 แจ้งชำระเงิน / อัปโหลดสลิป
      </button>
    </div>

    {/* ===================================================
        ปุ่มกดกลับหน้าเดิม (Back to Checkout)
       =================================================== */}
    <div style={{ textAlign: "center", marginTop: 15 }}>
      <button
        onClick={() => navigate(-1)}
        style={{
          width: "100%",
          maxWidth: "340px",
          padding: 14,
          borderRadius: 10,
          border: "1px solid #CCC",
          background: "white",
          fontSize: 16,
          fontWeight: "bold",
          cursor: "pointer",
          transition: "background 0.2s"
        }}
      >
        ← Back to Checkout
      </button>
    </div>
  </div>
);
}