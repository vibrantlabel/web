import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";

function Login() {

const navigate = useNavigate();

const [email, setEmail] =
useState("");

const [password, setPassword] =
useState("");

const [message, setMessage] =
useState("");

 

const [serverId,
setServerId] =
useState("");

const [serverUrl,
setServerUrl] =
useState("");

 

//--------------------------------------------------
// Load Cloud URL
//--------------------------------------------------
useEffect(() => {

  setServerUrl(
    localStorage.getItem(
      "cloud_url"
    ) || ""
  );

  setServerId(
    localStorage.getItem(
      "server_id"
    ) || ""
  );

  // เคลียร์ช่องกรอก
  setEmail("");
  setPassword("");

}, []);

//--------------------------------------------------
// Login
//--------------------------------------------------
const login = async () => {


if (!email.trim()) {

  setMessage(
    "กรุณากรอก Email"
  );

  return;
}

if (!password) {

  setMessage(
    "กรุณากรอก Password"
  );

  return;
}

if (!serverUrl) {

  setMessage(
    "ไม่พบ Cloud URL"
  );

  return;
}

try {

  const response =
    await fetch(
      `${serverUrl}/login-user`,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json"
        },
        body: JSON.stringify({

          email:
            email
              .trim()
              .toLowerCase(),

          password

        })
      }
    );

  const result =
    await response.json();

  if (!response.ok) {

    setMessage(
      result.message ||
      "Login Failed"
    );

    return;
  }

  localStorage.setItem(
    "email",
    result.email
  );

  localStorage.setItem(
    "fullname",
    result.fullname
  );

  setMessage(
    "Login Success"
  );

  navigate("/");

} catch (err) {

  console.error(err);

  setMessage(
    err.toString()
  );
}


};

return (


<div
  style={{
    maxWidth: "500px",
    margin: "40px auto",
    padding: "20px"
  }}
>

  <h2
    style={{
      textAlign: "center",
      marginBottom: "20px"
    }}
  >
    Login
  </h2>
    

  <input
    type="email"
    placeholder="Email"
    value={email}
    onChange={(e) =>
      setEmail(
        e.target.value
      )
    }
    style={{
      width: "100%",
      padding: "12px",
      border:
        "1px solid #ccc",
      borderRadius: "8px",
      marginBottom: "15px",
      boxSizing:
        "border-box"
    }}
  />

  <input
    type="password"
    placeholder="Password"
    value={password}
    onChange={(e) =>
      setPassword(
        e.target.value
      )
    }
    style={{
      width: "100%",
      padding: "12px",
      border:
        "1px solid #ccc",
      borderRadius: "8px",
      marginBottom: "20px",
      boxSizing:
        "border-box"
    }}
  />
  
  <button
    onClick={login}
    style={{
      width: "100%",
      backgroundColor:
        "#0078D7",
      color: "white",
      padding: "12px",
      border: "none",
      borderRadius: "8px",
      fontSize: "16px",
      cursor: "pointer"
    }}
  >
    Login
  </button>

  <button
    onClick={() =>
      navigate("/register")
    }
    style={{
      width: "100%",
      backgroundColor:
        "#10B981",
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
      color:
        message ===
        "Login Success"
          ? "green"
          : "red"
    }}
  >
    {message}
  </div>

</div>


);
}

export default Login;
