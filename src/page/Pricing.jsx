import { useNavigate } from "react-router-dom";

export default function Pricing() {

  const navigate = useNavigate();

 const plans = [

  {
    name: "Free",
    price: "Free",
    color: "#6C757D",
    storage: "500 MB",
    projects: "1",
    images: "500 Images (Total)",
    export: "TensorFlow Lite / TensorFlow.js",
    support: "Community",
    description:
`Perfect for learning

✓ AI Dataset Collection
✓ TensorFlow Lite Export
✓ Community Support`
  },

  {
    name: "Starter",
    price: "$12 / Month",
    color: "#0078D7",
    storage: "30 GB",
    projects: "Unlimited",
    images: "30,000 Images / Month",
    export: "TensorFlow Lite / TensorFlow.js",
    support: "Email",
    description:
`Best for Students & Makers

✓ AI Dataset Generator
✓ Cloud Sync
✓ Dataset Versioning`
  },

  {
    name: "Pro ⭐",
    price: "$39 / Month",
    color: "#FF9800",
    storage: "150 GB",
    projects: "Unlimited",
    images: "300,000 Images / Month",
    export: "TensorFlow • TensorFlow.js • ONNX • YOLO",
    support: "Priority Email",
    description:
`Best for AI Developers

✓ AI Dataset Generator
✓ Model Training
✓ Dataset Versioning
✓ Cloud Sync`
  },

  {
    name: "Business",
    price: "$89 / Month",
    color: "#28A745",
    storage: "500 GB",
    projects: "Unlimited",
    images: "1,000,000 Images / Month",
    export: "All Formats",
    support: "Priority Support",
    description:
`For Teams & Organizations

✓ Team Workspace
✓ REST API
✓ AI Training
✓ Cloud Sync`
  },

  {
    name: "Enterprise",
    price: "Contact Us",
    color: "#6F42C1",
    storage: "Custom",
    projects: "Unlimited",
    images: "Unlimited",
    export: "All Formats",
    support: "Dedicated Engineer",
    description:
`✓ Custom Storage
✓ Unlimited Projects
✓ Team Workspace (Coming Soon)
✓ Private Cloud (Coming Soon)
✓ REST API (Coming Soon)
✓ Dedicated Technical Support`
  }

];

  return (

  <div
    style={{
      maxWidth: "100%",
      margin: "40px auto",
      padding: 20
    }}
  >

    <h1
      style={{
        textAlign: "center",
        marginBottom: 10
      }}
    >
      💳 DataLens AI Pricing
    </h1>

    <p
      style={{
        textAlign: "center",
        color: "#666",
        marginBottom: 35
      }}
    >
      Choose the plan that fits your AI Dataset workflow.
    </p>

    {/* Horizontal Cards */}

    <div
      style={{
        display: "flex",
        gap: 25,
        overflowX: "auto",
        paddingBottom: 20,
        scrollBehavior: "smooth"
      }}
    >

      {plans.map((p, index) => (

        <div
          key={index}
          style={{
            position: "relative",

            display: "flex",
            flexDirection: "column",

            flex: "0 0 320px",

            width: 320,

            minHeight: 700,

            background: "#fff",

            border: p.popular
              ? "3px solid #FF9800"
              : "1px solid #ddd",

            borderRadius: 22,

            padding: 25,

            boxShadow: p.popular
              ? "0 14px 35px rgba(255,152,0,.25)"
              : "0 6px 20px rgba(0,0,0,.08)",

            transform: p.popular
              ? "scale(1.03)"
              : "scale(1)",

            transition: "0.25s"
          }}
        >

   

          <h2
            style={{
              color: p.color,
              marginBottom: 5
            }}
          >
            {p.name}
          </h2>

          <h1
            style={{
              marginTop: 0,
              marginBottom: 15
            }}
          >
            {p.price}
          </h1>

          <hr />

          <p>💾 Storage : {p.storage}</p>

          <p>📂 Projects : {p.projects}</p>

          <p>🖼 AI Images : {p.images}</p>

          <p>📦 Export : {p.export}</p>

          <p>☎ Support : {p.support}</p>

          {p.description && (

            <div
              style={{
                marginTop: 15,
                padding: 12,
                background: "#F8F9FA",
                borderRadius: 10,
                color: "#555",
                fontSize: 14,
                whiteSpace: "pre-line",

                minHeight: 170
              }}
            >
              {p.description}
            </div>

          )}

          {/* Push Button to Bottom */}

          <div style={{ flex: 1 }} />

    {/* ================= */}
        <button
  onClick={() => {

    if (p.name === "Enterprise") {

      navigate("/contact-sales");

      return;
    }

    if (p.name !== "Free") {

      localStorage.setItem(
        "selected_plan",
        p.name
      );

      localStorage.setItem(
        "selected_price",
        p.price
      );

      navigate("/checkout");
    }

  }}

  style={{
    width: "100%",
    padding: 14,
    marginTop: 20,
    border: "none",
    borderRadius: 10,
    background: p.color,
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
    cursor: "pointer"
  }}
>
  {p.name === "Enterprise"
    ? "Contact Us"
    : p.name === "Free"
      ? "Current Plan"
      : "Get Started"}
   </button>
 {/* ================= */}
        </div>

      ))}

    </div>

    <div
      style={{
        marginTop: 40,
        textAlign: "center"
      }}
    >

      <button
        onClick={() => navigate(-1)}
        style={{
          padding: "12px 30px",
          background: "#0078D7",
          color: "white",
          border: "none",
          borderRadius: 10,
          cursor: "pointer",
          fontWeight: "bold"
        }}
      >
        ← Back
      </button>

    </div>

  </div>

);
}