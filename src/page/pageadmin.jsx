import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";

// รายชื่อแผนให้เลือก ต้องตรงกับชื่อ plan ในหน้า Pricing.jsx (Free/Starter/Pro/Business/Enterprise)
const PLAN_OPTIONS = ["Free", "Starter", "Pro", "Business", "Enterprise"];

export default function AdminDashboard() {
  const navigate = useNavigate();

  const adminCode = localStorage.getItem("admin_code") || "";
  const adminRole = localStorage.getItem("admin_role") || "sub";
  const adminLabel = localStorage.getItem("admin_label") || "";
  const isSuper = adminRole === "super";

  const [cloudUrl] = useState(() => localStorage.getItem("cloud_url") || "");

  // ---------------- Users ----------------
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [savingEmail, setSavingEmail] = useState(""); // email ที่กำลังบันทึกแผนอยู่ (โชว์สถานะ)

  // ---------------- Sub-admin codes (super only) ----------------
  const [codes, setCodes] = useState([]);
  const [loadingCodes, setLoadingCodes] = useState(false);
  const [newCodeValue, setNewCodeValue] = useState("");
  const [newCodeLabel, setNewCodeLabel] = useState("");
  const [addingCode, setAddingCode] = useState(false);

  const [globalError, setGlobalError] = useState("");

  //--------------------------------------------------
  // ถ้าไม่มีรหัสเก็บไว้เลย (ยังไม่ login) -> เด้งกลับหน้าแรกของเว็บ
  // (ไม่มี route /admin-login แยกแล้ว เข้าผ่าน Login.jsx ปกติเท่านั้น)
  //--------------------------------------------------
  useEffect(() => {
    if (!adminCode) {
      navigate("/", { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  //--------------------------------------------------
  // Helper: เรียก backend แบบแนบรหัส admin ไปด้วยทุกครั้ง
  // ถ้า backend ตอบว่ารหัสถูกยกเลิก/ไม่ถูกต้อง (revoked) ให้เคลียร์ session
  // แล้วเด้งกลับหน้า login ทันที — นี่คือกลไกที่ทำให้ super admin
  // "ยกเลิกรหัส sub admin แล้วมีผลทันที" โดยไม่ต้องรอ token หมดอายุ
  //--------------------------------------------------
  const callAdminApi = useCallback(async (path, extraBody = {}) => {
    if (!cloudUrl) throw new Error("ไม่พบการเชื่อมต่อ Server");

    const cleanCloudUrl = cloudUrl.replace(/\/$/, "");
    const response = await fetch(`${cleanCloudUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: adminCode, ...extraBody })
    });

    const result = await response.json();

    if (result.revoked) {
      localStorage.removeItem("admin_code");
      localStorage.removeItem("admin_role");
      localStorage.removeItem("admin_label");
      navigate("/", { replace: true });
      throw new Error("รหัสถูกยกเลิกแล้ว");
    }

    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudUrl, adminCode]);

  //--------------------------------------------------
  // โหลดรายชื่อผู้ใช้ + แผนปัจจุบันของแต่ละคน
  // Server: POST /admin_list_users { code } -> { success, users: [{ email, plan, totalImages, maxImages }] }
  //--------------------------------------------------
  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    setGlobalError("");
    try {
      const result = await callAdminApi("/admin_list_users");
      if (result.success) {
        setUsers(result.users || []);
      } else {
        setGlobalError(result.message || "โหลดรายชื่อผู้ใช้ไม่สำเร็จ");
      }
    } catch (err) {
      console.error("LOAD USERS FAILED:", err);
      setGlobalError(err.message || "เชื่อมต่อ Server ไม่สำเร็จ");
    } finally {
      setLoadingUsers(false);
    }
  }, [callAdminApi]);

  //--------------------------------------------------
  // โหลดรายชื่อรหัส sub-admin ทั้งหมด (เฉพาะ super admin)
  // Server: POST /admin_list_codes { code } -> { success, codes: [{ id, label, role, active, created_at }] }
  //--------------------------------------------------
  const loadCodes = useCallback(async () => {
    if (!isSuper) return;
    setLoadingCodes(true);
    try {
      const result = await callAdminApi("/admin_list_codes");
      if (result.success) {
        setCodes(result.codes || []);
      }
    } catch (err) {
      console.error("LOAD CODES FAILED:", err);
    } finally {
      setLoadingCodes(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callAdminApi, isSuper]);

  useEffect(() => {
    if (!adminCode) return;
    loadUsers();
    loadCodes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminCode]);

  //--------------------------------------------------
  // เปลี่ยนแผนของผู้ใช้คนหนึ่ง
  // Server: POST /admin_update_user_plan { code, target_email, new_plan }
  //--------------------------------------------------
  const handlePlanChange = async (targetEmail, newPlan) => {
    setSavingEmail(targetEmail);
    try {
      const result = await callAdminApi("/admin_update_user_plan", {
        target_email: targetEmail,
        new_plan: newPlan
      });

      if (result.success) {
        setUsers((prev) =>
          prev.map((u) => (u.email === targetEmail ? { ...u, plan: newPlan } : u))
        );
      } else {
        alert(result.message || "เปลี่ยนแผนไม่สำเร็จ");
      }
    } catch (err) {
      console.error("UPDATE PLAN FAILED:", err);
      alert(err.message || "เชื่อมต่อ Server ไม่สำเร็จ");
    } finally {
      setSavingEmail("");
    }
  };

  //--------------------------------------------------
  // เพิ่มรหัส sub-admin ใหม่ (เฉพาะ super admin)
  // Server: POST /admin_add_code { code, new_code, label } -> { success }
  // ⚠️ new_code ควรให้ backend เป็นคน generate ให้เอง (สุ่มรหัสปลอดภัย)
  // ถ้า backend รองรับแบบนั้น ให้ตัด input newCodeValue ออกแล้วโชว์รหัสที่ backend คืนมาแทน
  //--------------------------------------------------
  const handleAddCode = async (e) => {
    e.preventDefault();
    if (!newCodeValue.trim()) {
      alert("กรุณากรอกรหัสใหม่ที่จะสร้าง");
      return;
    }

    setAddingCode(true);
    try {
      const result = await callAdminApi("/admin_add_code", {
        new_code: newCodeValue.trim(),
        label: newCodeLabel.trim() || "ไม่ระบุชื่อ"
      });

      if (result.success) {
        setNewCodeValue("");
        setNewCodeLabel("");
        loadCodes();
      } else {
        alert(result.message || "เพิ่มรหัสไม่สำเร็จ");
      }
    } catch (err) {
      console.error("ADD CODE FAILED:", err);
      alert(err.message || "เชื่อมต่อ Server ไม่สำเร็จ");
    } finally {
      setAddingCode(false);
    }
  };

  //--------------------------------------------------
  // ยกเลิกรหัส sub-admin (เฉพาะ super admin)
  // Server: POST /admin_revoke_code { code, target_code_id } -> { success }
  // มีผลทันทีกับ sub-admin ที่ใช้รหัสนี้อยู่ เพราะทุก action ของ sub-admin
  // จะถูกเช็คสถานะรหัสซ้ำที่ server ทุกครั้ง (ดู callAdminApi ด้านบน)
  //--------------------------------------------------
  const handleRevokeCode = async (codeId, label) => {
    if (!window.confirm(`ต้องการยกเลิกรหัสของ "${label}" ใช่หรือไม่? การกระทำนี้มีผลทันที`)) {
      return;
    }
    try {
      const result = await callAdminApi("/admin_revoke_code", { target_code_id: codeId });
      if (result.success) {
        loadCodes();
      } else {
        alert(result.message || "ยกเลิกรหัสไม่สำเร็จ");
      }
    } catch (err) {
      console.error("REVOKE CODE FAILED:", err);
      alert(err.message || "เชื่อมต่อ Server ไม่สำเร็จ");
    }
  };

  const logout = () => {
    localStorage.removeItem("admin_code");
    localStorage.removeItem("admin_role");
    localStorage.removeItem("admin_label");
    navigate("/");
  };

  const filteredUsers = users.filter((u) =>
    (u.email || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  // 🆕 เช็คว่าวันหมดอายุ (รูปแบบ "YYYY-MM-DD") ผ่านมาแล้วหรือยัง
  // ใช้ไฮไลต์สีแดงในตารางให้เห็นชัดว่าคนไหนหมดอายุแล้ว
  const isExpired = (expireAtStr) => {
    if (!expireAtStr) return false;
    const expireDate = new Date(expireAtStr);
    if (isNaN(expireDate.getTime())) return false;
    return expireDate < new Date();
  };

  // 🆕 นับจำนวนวันที่เหลือก่อนหมดอายุ (ค่าติดลบ = หมดอายุไปแล้วกี่วัน)
  // ปัดเป็นวันเต็มด้วย Math.ceil เพื่อกันปัญหาเรื่องเวลา (ชั่วโมง/นาที) ที่ต่างกัน
  const getDaysRemaining = (expireAtStr) => {
    if (!expireAtStr) return null;
    const expireDate = new Date(expireAtStr);
    if (isNaN(expireDate.getTime())) return null;

    const now = new Date();
    const msPerDay = 1000 * 60 * 60 * 24;
    return Math.ceil((expireDate.setHours(0, 0, 0, 0) - now.setHours(0, 0, 0, 0)) / msPerDay);
  };

  // 🆕 สีของตัวเลขวันคงเหลือ ตามความเร่งด่วน
  const getDaysRemainingColor = (days) => {
    if (days === null) return "#94A3B8";
    if (days < 0) return "#EF4444";      // หมดอายุแล้ว -> แดง
    if (days <= 7) return "#F59E0B";     // เหลือ 7 วันหรือน้อยกว่า -> ส้ม เตือนใกล้หมด
    return "#10B981";                    // เหลือเยอะ -> เขียว
  };

  // 🆕 ข้อความแสดงจำนวนวันคงเหลือ อ่านง่ายเป็นภาษาไทย
  const formatDaysRemaining = (days) => {
    if (days === null) return "—";
    if (days < 0) return `หมดอายุแล้ว ${Math.abs(days)} วัน`;
    if (days === 0) return "หมดอายุวันนี้";
    return `เหลืออีก ${days} วัน`;
  };

  const card = {
    background: "#fff",
    border: "1px solid #E5E7EB",
    borderRadius: 16,
    padding: 22,
    boxShadow: "0 4px 15px rgba(0,0,0,.04)"
  };

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "30px 20px", fontFamily: "Arial, sans-serif" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 26, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24 }}>🛡️ Admin Panel</h1>
          <p style={{ margin: "4px 0 0", color: "#6B7280", fontSize: 13 }}>
            สิทธิ์: {isSuper ? "👑 Super Admin" : "🧑‍💼 Sub Admin"} {adminLabel && `— ${adminLabel}`}
          </p>
        </div>
        <button
          onClick={logout}
          style={{
            padding: "9px 18px",
            borderRadius: 8,
            border: "1px solid #FCA5A5",
            background: "#FEF2F2",
            color: "#EF4444",
            fontWeight: "bold",
            fontSize: 13,
            cursor: "pointer"
          }}
        >
          🚪 ออกจากระบบ
        </button>
      </div>

      {globalError && (
        <div style={{ background: "#FEF2F2", border: "1px solid #FCA5A5", color: "#EF4444", padding: "10px 16px", borderRadius: 10, marginBottom: 20, fontSize: 13.5 }}>
          ❌ {globalError}
        </div>
      )}

      {/* ===================== ผู้ใช้ + แผน ===================== */}
      <div style={{ ...card, marginBottom: 26 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>👥 ผู้ใช้ที่สร้าง Dataset ({users.length})</h3>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="ค้นหาอีเมล..."
            style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #CCC", fontSize: 13, width: 220 }}
          />
        </div>

        {loadingUsers ? (
          <p style={{ color: "#94A3B8", fontSize: 13.5, textAlign: "center", padding: "20px 0" }}>⏳ กำลังโหลด...</p>
        ) : filteredUsers.length === 0 ? (
          <p style={{ color: "#94A3B8", fontSize: 13.5, textAlign: "center", padding: "20px 0" }}>ไม่พบผู้ใช้</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "#6B7280", borderBottom: "1px solid #E5E7EB" }}>
                  <th style={{ padding: "8px 6px" }}>อีเมล</th>
                  <th style={{ padding: "8px 6px" }}>ภาพที่ใช้ไป</th>
                  <th style={{ padding: "8px 6px" }}>แผนปัจจุบัน</th>
                  <th style={{ padding: "8px 6px" }}>วันสมัคร</th>
                  <th style={{ padding: "8px 6px" }}>วันหมดอายุ</th>
                  <th style={{ padding: "8px 6px" }}>คงเหลือ</th>
                  <th style={{ padding: "8px 6px" }}>เปลี่ยนแผน</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => (
                  <tr key={u.email} style={{ borderBottom: "1px solid #F1F5F9" }}>
                    <td style={{ padding: "10px 6px" }}>{u.email}</td>
                    <td style={{ padding: "10px 6px", color: "#6B7280" }}>
                      {u.totalImages ?? 0}{u.maxImages ? ` / ${u.maxImages}` : ""}
                    </td>
                    <td style={{ padding: "10px 6px", fontWeight: "bold", color: "#0078D7" }}>{u.plan || "Free"}</td>
                    <td style={{ padding: "10px 6px", color: "#6B7280" }}>{u.createdAt || "—"}</td>
                    <td
                      style={{
                        padding: "10px 6px",
                        color: isExpired(u.expireAt) ? "#EF4444" : "#6B7280",
                        fontWeight: isExpired(u.expireAt) ? "bold" : "normal"
                      }}
                    >
                      {u.expireAt || "—"}
                      {isExpired(u.expireAt) && " ⚠️"}
                    </td>
                    <td
                      style={{
                        padding: "10px 6px",
                        color: getDaysRemainingColor(getDaysRemaining(u.expireAt)),
                        fontWeight: "bold",
                        whiteSpace: "nowrap"
                      }}
                    >
                      {formatDaysRemaining(getDaysRemaining(u.expireAt))}
                    </td>
                    <td style={{ padding: "10px 6px" }}>
                      <select
                        value={u.plan || "Free"}
                        disabled={savingEmail === u.email}
                        onChange={(e) => handlePlanChange(u.email, e.target.value)}
                        style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #CCC", fontSize: 13 }}
                      >
                        {PLAN_OPTIONS.map((p) => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                      {savingEmail === u.email && <span style={{ marginLeft: 8, fontSize: 12, color: "#94A3B8" }}>⏳ กำลังบันทึก...</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ===================== จัดการรหัส Sub Admin (เฉพาะ Super Admin) ===================== */}
      {isSuper && (
        <div style={card}>
          <h3 style={{ margin: "0 0 14px", fontSize: 16 }}>🔑 จัดการรหัส Sub Admin</h3>

          <form onSubmit={handleAddCode} style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
            <input
              type="text"
              value={newCodeValue}
              onChange={(e) => setNewCodeValue(e.target.value)}
              placeholder="รหัสใหม่ (เช่น สุ่มเลข/ตัวอักษรที่คาดเดายาก)"
              style={{ flex: "1 1 220px", padding: "10px 12px", borderRadius: 8, border: "1px solid #CCC", fontSize: 13.5 }}
            />
            <input
              type="text"
              value={newCodeLabel}
              onChange={(e) => setNewCodeLabel(e.target.value)}
              placeholder="ชื่อ/หมายเหตุ เช่น ชื่อพนักงาน"
              style={{ flex: "1 1 180px", padding: "10px 12px", borderRadius: 8, border: "1px solid #CCC", fontSize: 13.5 }}
            />
            <button
              type="submit"
              disabled={addingCode}
              style={{
                padding: "10px 20px",
                borderRadius: 8,
                border: "none",
                background: addingCode ? "#94A3B8" : "#10B981",
                color: "#fff",
                fontWeight: "bold",
                fontSize: 13.5,
                cursor: addingCode ? "not-allowed" : "pointer"
              }}
            >
              {addingCode ? "⏳ กำลังเพิ่ม..." : "➕ เพิ่มรหัส"}
            </button>
          </form>

          {loadingCodes ? (
            <p style={{ color: "#94A3B8", fontSize: 13.5 }}>⏳ กำลังโหลดรายการรหัส...</p>
          ) : codes.length === 0 ? (
            <p style={{ color: "#94A3B8", fontSize: 13.5 }}>ยังไม่มีรหัส sub-admin ที่สร้างไว้</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {codes.map((c) => (
                <div
                  key={c.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    background: c.active === false ? "#F8FAFC" : "#F0FDF4",
                    border: `1px solid ${c.active === false ? "#E2E8F0" : "#BBF7D0"}`,
                    borderRadius: 10,
                    padding: "10px 14px"
                  }}
                >
                  <div>
                    <div style={{ fontWeight: "bold", fontSize: 13.5, color: c.active === false ? "#94A3B8" : "#166534" }}>
                      {c.label || "ไม่ระบุชื่อ"} {c.role === "super" && "👑"}
                    </div>
                    <div style={{ fontSize: 11.5, color: "#94A3B8" }}>
                      {c.active === false ? "ยกเลิกแล้ว" : "ใช้งานอยู่"}
                      {c.created_at ? ` · สร้างเมื่อ ${c.created_at}` : ""}
                    </div>
                  </div>
                  {c.active !== false && c.role !== "super" && (
                    <button
                      onClick={() => handleRevokeCode(c.id, c.label)}
                      style={{
                        background: "none",
                        border: "1px solid #FCA5A5",
                        color: "#EF4444",
                        borderRadius: 8,
                        padding: "6px 14px",
                        fontSize: 12.5,
                        cursor: "pointer",
                        fontWeight: "bold"
                      }}
                    >
                      ยกเลิกรหัส
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

    </div>
  );
}