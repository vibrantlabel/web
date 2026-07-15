import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function ContactSales() {

  const navigate = useNavigate();

  const [company, setCompany] =
    useState("");

  const [contactName, setContactName] =
    useState("");

  const [email, setEmail] =
    useState(
      localStorage.getItem("email") || ""
    );

  const [phone, setPhone] =
    useState("");

  const [country, setCountry] =
    useState("Thailand");

  const [users, setUsers] =
    useState("");

  const [message, setMessage] =
    useState("");

  const inputStyle = {

    width: "100%",

    padding: 12,

    marginTop: 6,

    marginBottom: 18,

    border: "1px solid #CCC",

    borderRadius: 8,

    fontSize: 15,

    boxSizing: "border-box"

  };

  return (

    <div
      style={{
        maxWidth: 1000,
        margin: "40px auto",
        padding: 20
      }}
    >

      <h1
        style={{
          textAlign: "center"
        }}
      >
        🏢 Enterprise Contact
      </h1>

      <p
        style={{
          textAlign: "center",
          color: "#666",
          marginBottom: 35
        }}
      >
        Contact our Enterprise Team for a custom AI Dataset solution.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 360px",
          gap: 25
        }}
      >

        {/* Left */}

        <div
          style={{
            background: "#fff",
            border: "1px solid #ddd",
            borderRadius: 18,
            padding: 25,
            boxShadow:
              "0 5px 18px rgba(0,0,0,.08)"
          }}
        >

          <h2>
            Contact Information
          </h2>

          <label>

            Company Name

            <input
              style={inputStyle}
              value={company}
              onChange={(e)=>
                setCompany(
                  e.target.value
                )
              }
            />

          </label>

          <label>

            Contact Name

            <input
              style={inputStyle}
              value={contactName}
              onChange={(e)=>
                setContactName(
                  e.target.value
                )
              }
            />

          </label>

          <label>

            Email

            <input
              style={inputStyle}
              value={email}
              onChange={(e)=>
                setEmail(
                  e.target.value
                )
              }
            />

          </label>

          <label>

            Phone

            <input
              style={inputStyle}
              value={phone}
              onChange={(e)=>
                setPhone(
                  e.target.value
                )
              }
            />

          </label>

          <label>

            Country

            <input
              style={inputStyle}
              value={country}
              onChange={(e)=>
                setCountry(
                  e.target.value
                )
              }
            />

          </label>

          <label>

            Estimated Users

            <input
              style={inputStyle}
              value={users}
              onChange={(e)=>
                setUsers(
                  e.target.value
                )
              }
              placeholder="Example : 100 Users"
            />

          </label>

          <label>

            Requirements

            <textarea
              rows={6}
              style={inputStyle}
              value={message}
              onChange={(e)=>
                setMessage(
                  e.target.value
                )
              }
              placeholder="Describe your requirements..."
            />

          </label>

        </div>

        {/* Right */}

        <div
          style={{
            background: "#fff",
            border: "1px solid #ddd",
            borderRadius: 18,
            padding: 25,
            boxShadow:
              "0 5px 18px rgba(0,0,0,.08)"
          }}
        >

          <h2>
            Enterprise Solution
          </h2>

          <hr />

          <p>
            ✓ Custom Storage
          </p>

          <p>
            ✓ Unlimited Projects
          </p>

          <p>
            ✓ Team Workspace
          </p>

          <p>
            ✓ Private Cloud
          </p>

          <p>
            ✓ REST API
          </p>

          <p>
            ✓ Dedicated Technical Support
          </p>

          <p>
            ✓ Custom AI Workflow
          </p>

          <hr />

          <button

            onClick={() => {

              if (
                company === "" ||
                contactName === "" ||
                email === ""
              ) {

                alert(
                  "Please complete Company, Contact Name and Email."
                );

                return;

              }

              alert(
                "Your inquiry has been submitted."
              );

            }}

            style={{
              width: "100%",
              padding: 14,
              border: "none",
              borderRadius: 10,
              background: "#6F42C1",
            }}

          >

            Send Inquiry

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