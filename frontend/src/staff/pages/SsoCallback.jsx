import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { homeRouteFor } from "../roles";
import Icon from "../../components/Icon/Icon";
import "./Login.css";

// Landing point for the backend's SAML ACS redirect: it hands back either a
// freshly-issued token (success) or an ssoError message (refusal) in the
// query string. This page just adopts the token into the normal session and
// continues on to wherever a password login would have gone.
const SsoCallback = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { loginWithToken } = useAuth();
    const [error, setError] = useState("");
    const ran = useRef(false);

    useEffect(() => {
        if (ran.current) {
            return;
        }
        ran.current = true;

        const token = searchParams.get("token");

        if (!token) {
            navigate("/staff/login", { replace: true });
            return;
        }

        (async () => {
            try {
                const data = await loginWithToken(token);
                navigate(homeRouteFor(data.roles), { replace: true });
            } catch (err) {
                setError(err.message || "Sign-in failed");
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className="staff-login-page wms-dotgrid">
            <div className="staff-login-card">
                <span className="staff-login-mark">
                    <Icon name="shieldCheck" size={24} strokeWidth={1.8} />
                </span>

                {error ? (
                    <>
                        <h1>Sign-in failed</h1>
                        <div className="staff-error">
                            <Icon name="alert" size={15} />
                            <span>{error}</span>
                        </div>
                        <button
                            type="button"
                            className="staff-btn staff-btn-primary staff-login-submit"
                            onClick={() => navigate("/staff/login", { replace: true })}
                        >
                            Back to login
                        </button>
                    </>
                ) : (
                    <>
                        <h1>Signing you in…</h1>
                        <span className="wms-spinner" />
                    </>
                )}
            </div>
        </div>
    );
};

export default SsoCallback;
