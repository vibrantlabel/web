import { useNavigate } from "react-router-dom";

export default function EnPricing() {
  const navigate = useNavigate();

  // Prices are shown in USD only — no THB conversion.
  const formatPrice = (usdPriceString) => usdPriceString;

  const plans = [
    {
      name: "Free",
      price: "Free",
      color: "#6C757D",
      storage: "1 GB",
      projects: "1",
      images: "1,000 Images (Total)",
      training: "1 time/month (Trial)",
      export: "ONNX, TFLite, TF.js, YOLO/PyTorch (.pt)",
      support: "Community",
      description:
`Perfect for Exploring

✓ AI Dataset Collection
✓ 1 Free Model Training (Trial)
✓ Export to ONNX, TFLite, TF.js, YOLO/PyTorch
✓ Download CSV & YOLO Format (no training needed)
✓ Community Support`
    },
    {
      name: "Starter",
      price: "$29 / Month",
      color: "#0078D7",
      storage: "50 GB",
      projects: "Unlimited",
      images: "50,000 Images / Month",
      training: "10 times/month (overage $1.99/time)",
      export: "ONNX, TFLite, TF.js, YOLO/PyTorch (.pt)",
      support: "Email Support",
      description:
`Best for Students & Makers

✓ AI Dataset Generator
✓ 10 Model Trainings / Month
✓ Export to ONNX, TFLite, TF.js, YOLO/PyTorch
✓ Dataset Versioning
✓ Cloud Sync`
    },
    {
      name: "Pro ⭐",
      price: "$59 / Month",
      color: "#FF9800",
      popular: true,
      storage: "200 GB",
      projects: "Unlimited",
      images: "500,000 Images / Month",
      training: "30 times/month (overage $1.79/time)",
      export: "ONNX, TFLite, TF.js, YOLO/PyTorch (.pt)",
      support: "Priority Email",
      description:
`Best for AI Developers & Consultants

✓ Advanced Dataset Tools & Versioning
✓ 30 Model Trainings / Month
✓ Export to ONNX, TFLite, TF.js, YOLO/PyTorch
✓ High-Speed Cloud Sync
✓ Priority Email Support`
    },
    {
      name: "Business",
      price: "$199 / Month",
      color: "#28A745",
      storage: "1 TB (1,000 GB)",
      projects: "Unlimited",
      images: "2,000,000 Images / Month",
      training: "80 times/month (overage $1.49/time)",
      export: "ONNX, TFLite, TF.js, YOLO/PyTorch (.pt) + REST API Export",
      support: "Priority Support + Onboarding",
      description:
`For Teams & Growing Companies

✓ Team Workspace & Multi-user
✓ REST API Access
✓ 80 Model Trainings / Month
✓ Export to ONNX, TFLite, TF.js, YOLO/PyTorch
✓ 1 TB Storage
✓ Priority Support`
    },
    {
      name: "Enterprise",
      price: "Custom",
      color: "#6F42C1",
      storage: "Custom",
      projects: "Unlimited",
      images: "Unlimited",
      training: "Unlimited (Custom GPU SLA)",
      export: "ONNX, TFLite, TF.js, YOLO/PyTorch (.pt) + Custom Formats on Request",
      support: "Dedicated Engineer",
      description:
`For Large Scale & Enterprise

✓ Custom Storage & Dedicated GPUs
✓ Unlimited Model Training
✓ Export to ONNX, TFLite, TF.js, YOLO/PyTorch
✓ Private Cloud Deployment (On-Premise)
✓ Custom SLA & Dedicated Engineer
✓ Team Workspace & Enterprise Security`
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
        💳 Datasign AI Pricing
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
        {plans.filter((p) => !p.hidden).map((p, index) => (
          <div
            key={index}
            style={{
              position: "relative",
              display: "flex",
              flexDirection: "column",
              flex: "0 0 380px",
              width: 380,
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
                marginBottom: 15,
                fontSize: 24
              }}
            >
              {formatPrice(p.price)}
            </h1>

            <hr />

            <p>💾 Storage : {p.storage}</p>
            <p>📂 Projects : {p.projects}</p>
            <p>🖼 AI Images : {p.images}</p>
            <p>🚀 Training : {p.training}</p>
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

            <button
              onClick={() => {
                if (p.name === "Enterprise") {
                  navigate("/contact-sales");
                  return;
                }

                if (p.name !== "Free") {
                  localStorage.setItem(
                    "selected_plan",
                    p.name.replace(" ⭐", "")
                  );
                  localStorage.setItem(
                    "selected_price",
                    p.price
                  );
                  navigate("/encheckout");
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