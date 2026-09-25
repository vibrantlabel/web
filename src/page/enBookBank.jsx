import React from "react";
import { useNavigate } from "react-router-dom";

export default function enBookBank() {
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
          BLOCK 1: International Payment (PayPal)
         ------------------------------------------ */}
      <div style={blockStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 20 }}>💳</span>
          <h3 style={{ margin: 0, color: "#003087" }}>International Payment</h3>
        </div>
        <hr style={{ border: "0.5px solid #F0F0F0", margin: "5px 0" }} />

        <p style={{ fontSize: "14px", color: "#444", lineHeight: "1.5", margin: "5px 0 15px 0" }}>
          Accepts Credit/Debit Card, VISA, Mastercard, and PayPal from anywhere in the world.
        </p>

        <a
          href="https://paypal.me/yourcompany" // ⚠️ อย่าลืมเปลี่ยนเป็นลิงก์ของคุณเอง
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "block",
            textAlign: "center",
            background: "#FFC439",
            color: "#003087",
            padding: "12px",
            borderRadius: "10px",
            textDecoration: "none",
            fontWeight: "bold",
            fontSize: "15px",
            boxShadow: "0 2px 5px rgba(0,0,0,0.1)",
            transition: "background 0.2s"
          }}
          onMouseOver={(e) => e.target.style.background = "#E5AF32"}
          onMouseOut={(e) => e.target.style.background = "#FFC439"}
        >
          🔵 PayPal / Credit Card
        </a>

        <div style={{ fontSize: "11px", color: "#888", textAlign: "center", marginTop: "5px" }}>
          *You will be redirected to PayPal secure checkout.
        </div>
      </div>
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