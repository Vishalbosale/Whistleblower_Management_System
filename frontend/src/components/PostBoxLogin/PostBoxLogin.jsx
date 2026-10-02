import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { POSTBOX_CREDS_KEY } from "../../lib/postboxSession";
import { useAuth } from "../../staff/context/AuthContext";
import Icon from "../Icon/Icon";
import "./PostBoxLogin.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

/* =========================================================
   GENERATE CAPTCHA
========================================================= */

const generateCaptcha = () => {
  const characters =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

  let captcha = "";

  for (let i = 0; i < 6; i++) {
    captcha += characters.charAt(
      Math.floor(Math.random() * characters.length)
    );
  }

  return captcha;
};


/* =========================================================
   COMPONENT
========================================================= */

const PostBoxLogin = () => {

  const navigate = useNavigate();
  const location = useLocation();

  const { login: staffLogin } = useAuth();

  /* Set once on mount from router state (e.g. an idle-timeout redirect) —
     not cleared on re-render, only when the user dismisses or logs in. */
  const [notice, setNotice] = useState(location.state?.notice || "");

  /* Who is logging in: the whistleblower checking their post box, or
     the ethics officer / case owner who acknowledges and assigns
     complaints (screens 6.5 vs 6.6/6.7). */
  const [loginAs, setLoginAs] = useState("complainant");

  const [complaintId, setComplaintId] = useState("");

  const [password, setPassword] = useState("");

  const [captcha, setCaptcha] = useState("");

  const [captchaInput, setCaptchaInput] = useState("");

  const [error, setError] = useState("");

  const [loading, setLoading] = useState(false);

  const [staffUsername, setStaffUsername] = useState("");

  const [staffPassword, setStaffPassword] = useState("");

  const [staffError, setStaffError] = useState("");

  const [staffLoading, setStaffLoading] = useState(false);

  const [ssoEnabled, setSsoEnabled] = useState(false);


  /* =======================================================
     INITIAL CAPTCHA
  ======================================================== */

  useEffect(() => {
    setCaptcha(generateCaptcha());
  }, []);


  /* =======================================================
     SSO AVAILABILITY (Staff / Case Owner tab only)
  ======================================================== */

  useEffect(() => {
    api.get("/auth/saml/status")
      .then((data) => setSsoEnabled(Boolean(data.enabled)))
      .catch(() => setSsoEnabled(false));
  }, []);


  /* =======================================================
     REFRESH CAPTCHA
  ======================================================== */

  const refreshCaptcha = () => {

    setCaptcha(generateCaptcha());

    setCaptchaInput("");

    setError("");

  };


  /* =======================================================
     LOGIN — Complaint ID + Password + Captcha
  ======================================================== */

  const handleLogin = async (e) => {

    e.preventDefault();

    setError("");


    /* Required validation */

    if (!complaintId.trim()) {
      setError("Please enter Complaint ID.");
      return;
    }

    if (!password.trim()) {
      setError("Please enter Password.");
      return;
    }

    if (!captchaInput.trim()) {
      setError("Please enter the Captcha.");
      return;
    }


    /* Captcha validation */

    if (
      captchaInput.trim().toLowerCase() !==
      captcha.toLowerCase()
    ) {

      setError(
        "Invalid Captcha. Please enter the displayed code."
      );

      refreshCaptcha();

      return;

    }


    const credentials = {
      complaintId: complaintId.trim(),
      password
    };

    setLoading(true);

    try {
      await api.post("/public/complaints/track", credentials);

      sessionStorage.setItem(POSTBOX_CREDS_KEY, JSON.stringify(credentials));

      navigate("/post-box-status");
    } catch (err) {
      setError(err.message || "Login failed.");
      refreshCaptcha();
    } finally {
      setLoading(false);
    }

  };


  /* =======================================================
     RESET
  ======================================================== */

  const handleReset = () => {

    setComplaintId("");

    setPassword("");

    setCaptchaInput("");

    setError("");

    setCaptcha(generateCaptcha());

  };


  /* =======================================================
     SWITCH BETWEEN COMPLAINANT / STAFF LOGIN
  ======================================================== */

  const switchLoginAs = (value) => {
    setLoginAs(value);
    setError("");
    setStaffError("");
  };


  /* =======================================================
     STAFF LOGIN (Ethics Officer / Case Owner — screens 6.6 & 6.7)
  ======================================================== */

  const handleStaffLogin = async (e) => {

    e.preventDefault();

    setStaffError("");

    if (!staffUsername.trim() || !staffPassword.trim()) {
      setStaffError("Please enter Username and Password.");
      return;
    }

    setStaffLoading(true);

    try {
      await staffLogin(staffUsername.trim(), staffPassword);
      navigate("/staff/complaints");
    } catch (err) {
      setStaffError(err.message || "Login failed.");
    } finally {
      setStaffLoading(false);
    }

  };


  /* =======================================================
     JSX
  ======================================================== */

  return (

    <div className="postbox-page">

      <div className="postbox-inner">


      {/* ===================================================
          LEFT — REASSURANCE PANEL
      ==================================================== */}

      <aside className="postbox-aside wms-dotgrid">

        <div className="postbox-aside-inner">

          <span className="postbox-aside-mark">
            <Icon name="mailbox" size={26} strokeWidth={1.7} />
          </span>

          <h2>Your secure post box</h2>

          <p>
            Log in with the Complaint ID and password issued when you filed
            your report to follow its progress and answer any questions from
            the review team.
          </p>

          <ul className="postbox-aside-list">
            <li>
              <Icon name="eyeOff" size={16} />
              <span>Stay anonymous — no personal details required</span>
            </li>
            <li>
              <Icon name="clock" size={16} />
              <span>Track every status change end to end</span>
            </li>
            <li>
              <Icon name="shieldCheck" size={16} />
              <span>Two-way messages stay confidential</span>
            </li>
          </ul>

          <p className="postbox-aside-note">
            <Icon name="info" size={15} />
            Lost your credentials? They cannot be recovered — file a new report
            and open a fresh post box.
          </p>

        </div>

      </aside>


      {/* ===================================================
          RIGHT — LOGIN CARD
      ==================================================== */}

      <main className="postbox-main">

        <div className="postbox-card">

          {notice && (
            <div className="postbox-notice">
              <Icon name="info" size={15} />
              <span>{notice}</span>
              <button
                type="button"
                className="postbox-notice-dismiss"
                aria-label="Dismiss"
                onClick={() => setNotice("")}
              >
                <Icon name="close" size={13} />
              </button>
            </div>
          )}


          {/* Card Header */}

          <div className="postbox-card-header">

            <span className="postbox-card-icon">
              <Icon name="lock" size={19} />
            </span>

            <h1>
              Log in to your Post Box
            </h1>

            <p>Select who you are signing in as.</p>

          </div>


          {/* Login As Selector */}

          <div
            className="postbox-role-toggle"
            data-active={loginAs}
            role="tablist"
          >

            <span className="postbox-role-thumb" aria-hidden="true" />

            <button
              type="button"
              role="tab"
              aria-selected={loginAs === "complainant"}
              className={loginAs === "complainant" ? "active" : ""}
              onClick={() => switchLoginAs("complainant")}
            >
              Complainant
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={loginAs === "staff"}
              className={loginAs === "staff" ? "active" : ""}
              onClick={() => switchLoginAs("staff")}
            >
              Staff / Case Owner
            </button>

          </div>


          {loginAs === "complainant" ? (

            /* Form */

            <form
              className="postbox-form"
              onSubmit={handleLogin}
            >


              {/* Complaint ID */}

              <div className="postbox-field">

                <label htmlFor="complaintId">
                  Complaint ID
                </label>

                <input
                  id="complaintId"
                  type="text"
                  value={complaintId}
                  onChange={(e) =>
                    setComplaintId(e.target.value)
                  }
                  placeholder="e.g. WMS-2026-000001"
                  autoComplete="username"
                />

              </div>


              {/* Password */}

              <div className="postbox-field">

                <label htmlFor="password">
                  Password
                </label>

                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) =>
                    setPassword(e.target.value)
                  }
                  placeholder="Enter Password"
                  autoComplete="current-password"
                />

              </div>


              {/* Captcha Label */}

              <div className="postbox-field">

                <label>
                  Captcha
                </label>


                <div className="captcha-row">

                  {/* Captcha */}

                  <div className="captcha-box">

                    <span className="captcha-text">
                      {captcha}
                    </span>

                  </div>


                  {/* Refresh */}

                  <button
                    type="button"
                    className="refresh-captcha"
                    onClick={refreshCaptcha}
                  >
                    <Icon name="refresh" size={14} />
                    <span>New code</span>
                  </button>

                </div>


                {/* Captcha Input */}

                <input
                  type="text"
                  value={captchaInput}
                  onChange={(e) =>
                    setCaptchaInput(e.target.value)
                  }
                  placeholder="Enter Captcha"
                  autoComplete="off"
                />

              </div>


              {/* Error */}

              {error && (

                <div className="login-error">

                  <Icon name="alert" size={15} />
                  <span>{error}</span>

                </div>

              )}


              {/* Buttons */}

              <div className="postbox-actions">

                <button
                  type="submit"
                  className="login-button"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <span className="wms-spinner" />
                      <span>Logging in…</span>
                    </>
                  ) : (
                    <>
                      <span>Login</span>
                      <Icon name="arrowRight" size={15} />
                    </>
                  )}
                </button>


                <button
                  type="button"
                  className="reset-button"
                  onClick={handleReset}
                >
                  Reset
                </button>

              </div>

            </form>

          ) : (

            /* Staff / Case Owner form — acknowledges and assigns
               complaints (screens 6.6 Case Creation / 6.7 Case
               Assignment) once logged in. */

            <form
              className="postbox-form"
              onSubmit={handleStaffLogin}
            >

              <div className="postbox-field">

                <label htmlFor="staffUsername">
                  Username
                </label>

                <input
                  id="staffUsername"
                  type="text"
                  value={staffUsername}
                  onChange={(e) =>
                    setStaffUsername(e.target.value)
                  }
                  placeholder="Enter Username"
                  autoComplete="username"
                />

              </div>

              <div className="postbox-field">

                <label htmlFor="staffPassword">
                  Password
                </label>

                <input
                  id="staffPassword"
                  type="password"
                  value={staffPassword}
                  onChange={(e) =>
                    setStaffPassword(e.target.value)
                  }
                  placeholder="Enter Password"
                  autoComplete="current-password"
                />

              </div>

              {staffError && (

                <div className="login-error">

                  <Icon name="alert" size={15} />
                  <span>{staffError}</span>

                </div>

              )}

              <div className="postbox-actions">

                <button
                  type="submit"
                  className="login-button"
                  disabled={staffLoading}
                >
                  {staffLoading ? (
                    <>
                      <span className="wms-spinner" />
                      <span>Logging in…</span>
                    </>
                  ) : (
                    <>
                      <span>Login</span>
                      <Icon name="arrowRight" size={15} />
                    </>
                  )}
                </button>

              </div>

              {ssoEnabled && (

                <>

                  <div className="postbox-divider">
                    <span>OR</span>
                  </div>

                  <a
                    href={`${API_BASE_URL}/auth/saml/login`}
                    className="sso-button"
                  >
                    <Icon name="shieldCheck" size={15} />
                    <span>Continue with Enterprise SSO</span>
                  </a>

                </>

              )}

            </form>

          )}

        </div>

      </main>

      </div>

    </div>

  );

};

export default PostBoxLogin;
