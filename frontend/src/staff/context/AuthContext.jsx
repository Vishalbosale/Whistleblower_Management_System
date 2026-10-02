import React, { createContext, useContext, useEffect, useState } from "react";
import { api, getStaffToken, setStaffToken, clearStaffToken } from "../../lib/api";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [roles, setRoles] = useState([]);
    const [loading, setLoading] = useState(true);

    const loadProfile = async () => {
        if (!getStaffToken()) {
            setLoading(false);
            return;
        }

        try {
            const data = await api.get("/auth/me", { auth: true });
            setUser(data.user);
            setRoles(data.roles);
        } catch {
            clearStaffToken();
            setUser(null);
            setRoles([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadProfile();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const login = async (username, password) => {
        const data = await api.post("/auth/login", { username, password });
        setStaffToken(data.token);
        setUser(data.user);
        setRoles(data.roles);
        return data;
    };

    // Used by the SAML ACS callback page: the backend already authenticated
    // the user and handed back a token via redirect (there's no username/
    // password step to run here), so this just adopts it and loads /me.
    const loginWithToken = async (token) => {
        setStaffToken(token);
        const data = await api.get("/auth/me", { auth: true });
        setUser(data.user);
        setRoles(data.roles);
        return data;
    };

    const logout = () => {
        clearStaffToken();
        setUser(null);
        setRoles([]);
    };

    return (
        <AuthContext.Provider value={{ user, roles, loading, login, loginWithToken, logout }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const ctx = useContext(AuthContext);

    if (!ctx) {
        throw new Error("useAuth must be used within an AuthProvider");
    }

    return ctx;
};
