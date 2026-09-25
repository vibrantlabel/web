import { useNavigate } from "react-router-dom";

export default function enCheckout() {

  const navigate = useNavigate();

  //==============================
  // Selected Plan
  //==============================

  const plan =
    localStorage.getItem("selected_plan") || "";

  const price =
    localStorage.getItem("selected_price") || "";

  //==============================
  // Customer
  //==============================

 const email =
  localStorage.getItem("email") || "";
  //==============================
const card = {
  background: "#fff",
  border: "1px solid #E5E7EB",
  borderRadius: 18,
  padding: 25,
  boxShadow: "0 6px 20px rgba(0,0,0,.08)",
  height: "100%",
  display: "flex",
  flexDirection: "column"
};

  const input = {
    width: "100%",
    padding: 12,
    marginTop: 6,
    marginBottom: 18,
    borderRadius: 8,
    border: "1px solid #CCC",
    fontSize: 15,
    boxSizing: "border-box"
  };

  //==============================

  return (

    <div
      style={{
        maxWidth: 900,
        margin: "40px auto",
        padding: 20
      }}
    >

      <h1
        style={{
          textAlign: "center"
        }}
      >
        💳 Checkout
      </h1>

      <p
        style={{
          textAlign: "center",
          color: "#666",
          marginBottom: 35
        }}
      >
        Complete your subscription.
      </p>

      <div
  style={{
    display: "grid",
    gridTemplateColumns: "50% 50%",
    gap: 25,
    alignItems: "stretch"
  }}
>

        {/*=========================
            Customer Information
        =========================*/}
<div
  style={{
    ...card,
    minHeight: 560,
    display: "flex",
    flexDirection: "column"
  }}
>

  <h2
    style={{
      marginTop: 0,
      marginBottom: 25
    }}
  >
    👤 Account
  </h2>

  {/* Email */}

  <div
    style={{
      background: "#F8F9FA",
      border: "1px solid #E9ECEF",
      borderRadius: 10,
      padding: 15,
      marginBottom: 20
    }}
  >

    <div
      style={{
        fontSize: 13,
        color: "#777"
      }}
    >
      Email
    </div>

    <div
      style={{
        marginTop: 5,
        fontSize: 17,
        fontWeight: "bold",
        color: "#333"
      }}
    >
      {email}
    </div>

  </div>

  {/* Status */}

  <div
    style={{
      display: "flex",
      justifyContent: "space-between",
      padding: "12px 0",
      borderBottom: "1px solid #EEE"
    }}
  >
    <span>
      Status
    </span>

    <span
      style={{
        color: "#28A745",
        fontWeight: "bold"
      }}
    >
      🟢 Active
    </span>

  </div>

  {/* Plan */}

  <div
    style={{
      display: "flex",
      justifyContent: "space-between",
      padding: "12px 0",
      borderBottom: "1px solid #EEE"
    }}
  >
    <span>
      Current Plan
    </span>

    <span
      style={{
        color: "#0078D7",
        fontWeight: "bold"
      }}
    >
      {plan}
    </span>

  </div>

  {/* Billing */}

  <div
    style={{
      display: "flex",
      justifyContent: "space-between",
      padding: "12px 0"
    }}
  >
    <span>
      Billing Cycle
    </span>

    <span
      style={{
        fontWeight: "bold"
      }}
    >
      Monthly
    </span>

  </div>

</div>
 
                {/*=========================
            Order Summary
        =========================*/}

    <div
  style={{
    ...card,
    minHeight: 560,
    display: "flex",
    flexDirection: "column"
  }}
>

          <h2>
            Order Summary
          </h2>

          <hr />

          <p>
            <b>Plan</b>
          </p>

          <p
            style={{
              fontSize: 22,
              color: "#0078D7",
              fontWeight: "bold"
            }}
          >
            {plan}
          </p>

          <p>
            <b>Billing</b>
          </p>

          <p>
            Monthly Subscription
          </p>

          <p>
            <b>Price</b>
          </p>

          <h2>
            {price}
          </h2>

          <hr />

          <div
            style={{
              background: "#F8F9FA",
              padding: 15,
              borderRadius: 10,
              marginBottom: 20
            }}
          >

            <b>Included</b>

            <ul
              style={{
                paddingLeft: 18,
                lineHeight: 1.8
              }}
            >
              <li>Cloud Storage</li>
              <li>Unlimited Projects</li>
              <li>Dataset Collection</li>
              <li>AI Dataset Generator</li>
              <li>Model Export</li>
              <li>Email Support</li>
            </ul>

          </div>

          <button
            style={{
              width: "100%",
              padding: 14,
              border: "none",
              borderRadius: 10,
              background: "#0078D7",
              color: "white",
              fontSize: 16,
              fontWeight: "bold",
              cursor: "pointer"
            }}
           onClick={() => {

  if (email === "") {

    alert("Please login first.");

    return;

  }
     // 🩹 FIX: เดิม navigate("/payment") ทำให้กดแล้วไม่ไปหน้า Bookbank
     // เปลี่ยนเป็น path ที่ map ไปที่ component Bookbank.jsx โดยตรง
     navigate("/enbookbank");

}}




          >
            Continue to Payment
          </button>

          <button
            onClick={() =>
              navigate(-1)
            }
            style={{
              width: "100%",
              marginTop: 12,
              padding: 14,
              borderRadius: 10,
              border: "1px solid #CCC",
              background: "white",
              cursor: "pointer"
            }}
          >
            ← Back
          </button>

        </div>

      </div>

    </div>

  );

}