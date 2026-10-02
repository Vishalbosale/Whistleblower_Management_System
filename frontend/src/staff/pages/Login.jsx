import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { homeRouteFor } from "../roles";
import { api } from "../../lib/api";
import Icon from "../../components/Icon/Icon";
import "../staff-common.css";
import "./Login.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

const Login = () => {
    const navigate = useNavigate();
    const { login } = useAuth();
    const [searchParams] = useSearchParams();

    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState(searchParams.get("ssoError") || "");
    const [loading, setLoading] = useState(false);
    const [ssoEnabled, setSsoEnabled] = useState(false);

    useEffect(() => {
        api.get("/auth/saml/status")
            .then((data) => setSsoEnabled(Boolean(data.enabled)))
            .catch(() => setSsoEnabled(false));
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");
        setLoading(true);

        try {
            const data = await login(username, password);
            navigate(homeRouteFor(data.roles));
        } catch (err) {
            setError(err.message || "Login failed");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="staff-login-page wms-dotgrid">
            <form className="staff-login-card" onSubmit={handleSubmit}>
                <span className="staff-login-mark">
                    <Icon name="shieldCheck" size={24} strokeWidth={1.8} />
                </span>

                <h1>WMS Staff Login</h1>
                <p>WB Committee · Investigation Unit</p>

                {error && (
                    <div className="staff-error">
                        <Icon name="alert" size={15} />
                        <span>{error}</span>
                    </div>
                )}

                <div className="staff-login-field">
                    <label htmlFor="username">Username</label>
                    <input
                        id="username"
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        autoComplete="username"
                        placeholder="Enter your username"
                        required
                    />
                </div>

                <div className="staff-login-field">
                    <label htmlFor="password">Password</label>
                    <input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="current-password"
                        placeholder="Enter your password"
                        required
                    />
                </div>

                <button
                    type="submit"
                    className="staff-btn staff-btn-primary staff-login-submit"
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
                            <Icon name="arrowRight" size={16} />
                        </>
                    )}
                </button>

                {ssoEnabled && (
                    <a href={`${API_BASE_URL}/auth/saml/login`} className="staff-btn staff-login-submit">
                        Sign in with SSO
                    </a>
                )}

                <p className="staff-login-foot">
                    <Icon name="lock" size={13} />
                    Access is logged and audited.
                </p>
            </form>
        </div>
    );
};

export default Login;
