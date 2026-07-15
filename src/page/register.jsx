import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";

function Register() {

  const navigate = useNavigate();

  const [name, setName] =
    useState("");

  const [email, setEmail] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [confirmPassword,
    setConfirmPassword] =
    useState("");

  const [message, setMessage] =
    useState("");

  const [serverUrl,
    setServerUrl] =
    useState("");

  //--------------------------------------------------
  // Load Cloud URL
  //--------------------------------------------------
  useEffect(() => {

    const url =
      localStorage.getItem(
        "cloud_url"
      ) || "";

    setServerUrl(url);

  }, []);

  //--------------------------------------------------
  // Save
  //--------------------------------------------------
  const save = async () => {

    if (!name.trim()) {

      setMessage(
        "กรุณากรอกชื่อ"
      );

      return;
    }

    if (!email.trim()) {

      setMessage(
        "กรุณากรอก Email"
      );

      return;
    }

    if (
      password !==
      confirmPassword
    ) {

      setMessage(
        "Password ไม่ตรงกัน"
      );

      return;
    }

    if (
      password.length < 6
    ) {

      setMessage(
        "Password ต้องอย่างน้อย 6 ตัวอักษร"
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
          `${serverUrl}/register-user`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json"
            },
            body: JSON.stringify({

              name:
                name.trim(),

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

      console.log(
        "REGISTER RESULT",
        result
      );

      setMessage(
        result.message ||
        JSON.stringify(result)
      );

      if (response.ok) {

        localStorage.setItem(
          "email",
          email
            .trim()
            .toLowerCase()
        );

        localStorage.setItem(
          "fullname",
          name.trim()
        );

        alert(
          "ลงทะเบียนสำเร็จ"
        );

        navigate("/login");
      }

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
        User Register
      </h2>

       

      <input
        type="text"
        placeholder="Nmae:"
        value={name}
        onChange={(e) =>
          setName(
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
          marginBottom: "15px",
          boxSizing:
            "border-box"
        }}
      />

      <input
        type="password"
        placeholder="Confirm Password"
        value={confirmPassword}
        onChange={(e) =>
          setConfirmPassword(
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
        onClick={save}
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
        Save
      </button>

      <div
        style={{
          marginTop: "20px",
          textAlign: "center",
          wordBreak:
            "break-word",
          color:
            message.includes(
              "สำเร็จ"
            )
              ? "green"
              : "red"
        }}
      >
        {message}
      </div>

    </div>
  );
}

export default Register;