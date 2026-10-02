const BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

const STAFF_TOKEN_KEY = "wms_staff_token";

const getStaffToken = () => localStorage.getItem(STAFF_TOKEN_KEY);
const setStaffToken = (token) => localStorage.setItem(STAFF_TOKEN_KEY, token);
const clearStaffToken = () => localStorage.removeItem(STAFF_TOKEN_KEY);

class ApiError extends Error {
    constructor(message, status) {
        super(message);
        this.status = status;
    }
}

const request = async (path, { method = "GET", body, auth = false, isFormData = false } = {}) => {
    const headers = {};

    if (!isFormData) {
        headers["Content-Type"] = "application/json";
    }

    if (auth) {
        const token = getStaffToken();
        if (token) {
            headers.Authorization = `Bearer ${token}`;
        }
    }

    const response = await fetch(`${BASE_URL}${path}`, {
        method,
        headers,
        body: body ? (isFormData ? body : JSON.stringify(body)) : undefined
    });

    let data = null;
    try {
        data = await response.json();
    } catch {
        data = null;
    }

    if (!response.ok) {
        throw new ApiError(data?.message || "Request failed", response.status);
    }

    return data;
};

// Document downloads are authorised the same way as any other call, so they
// cannot be a plain <a href> — the browser would send no token and the server
// would refuse. Fetch it with the header, then hand the blob to a throwaway
// link so the file still lands in the user's downloads folder as expected.
const downloadFile = async (path, fallbackName = "download") => {
    const token = getStaffToken();

    const response = await fetch(`${BASE_URL}${path}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
    });

    if (!response.ok) {
        let message = "Download failed";

        try {
            message = (await response.json())?.message || message;
        } catch {
            // A non-JSON error body tells us nothing useful; keep the default.
        }

        throw new ApiError(message, response.status);
    }

    // Prefer the filename the server sent in Content-Disposition.
    const disposition = response.headers.get("content-disposition") || "";
    const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
    const filename = match ? decodeURIComponent(match[1]) : fallbackName;

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();

    // Revoked on the next tick so the click has definitely been handled.
    setTimeout(() => URL.revokeObjectURL(url), 0);
};

const downloadPublicFile = async (path, body, fallbackName = "download") => {
    const response = await fetch(`${BASE_URL}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        let message = "Download failed";
        try {
            message = (await response.json())?.message || message;
        } catch {
            // Keep the generic message for a non-JSON error response.
        }
        throw new ApiError(message, response.status);
    }

    const disposition = response.headers.get("content-disposition") || "";
    const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
    const filename = match ? decodeURIComponent(match[1]) : fallbackName;
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
};

export const api = {
    get: (path, opts) => request(path, { ...opts, method: "GET" }),
    post: (path, body, opts) => request(path, { ...opts, method: "POST", body }),
    put: (path, body, opts) => request(path, { ...opts, method: "PUT", body }),
    patch: (path, body, opts) => request(path, { ...opts, method: "PATCH", body }),
    del: (path, opts) => request(path, { ...opts, method: "DELETE" }),
    download: downloadFile,
    downloadPublic: downloadPublicFile
};

export { ApiError, getStaffToken, setStaffToken, clearStaffToken };
