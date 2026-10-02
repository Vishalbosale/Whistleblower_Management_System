import React from "react";

/* =========================================================
   ICON SET
   Lightweight inline SVGs (no dependency). Every glyph is
   drawn on a 24x24 grid and inherits `currentColor`, so an
   icon always matches the text it sits next to.
========================================================= */

const PATHS = {
    shield: <path d="M12 3 4.5 6.2v5.4c0 4.4 3.1 8.5 7.5 9.4 4.4-.9 7.5-5 7.5-9.4V6.2L12 3Z" />,
    shieldCheck: (
        <>
            <path d="M12 3 4.5 6.2v5.4c0 4.4 3.1 8.5 7.5 9.4 4.4-.9 7.5-5 7.5-9.4V6.2L12 3Z" />
            <path d="m9 12 2.2 2.2L15.5 10" />
        </>
    ),
    lock: (
        <>
            <rect x="4.5" y="10.5" width="15" height="10" rx="2.2" />
            <path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7" />
        </>
    ),
    mailbox: (
        <>
            <path d="M3.5 11.5A4 4 0 0 1 7.5 7.5h9a4 4 0 0 1 4 4v7h-17v-7Z" />
            <path d="M12 18.5v-11" />
            <path d="M7 12h2" />
        </>
    ),
    document: (
        <>
            <path d="M13.5 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9l-5.5-5.5Z" />
            <path d="M13.5 3.5V9H19" />
            <path d="M9 13.5h6M9 17h4" />
        </>
    ),
    eyeOff: (
        <>
            <path d="M10.6 6.3A8.7 8.7 0 0 1 12 6.2c5 0 8.5 5.8 8.5 5.8a15.7 15.7 0 0 1-2.8 3.5M6.3 8.3A15.6 15.6 0 0 0 3.5 12s3.5 5.8 8.5 5.8a8.4 8.4 0 0 0 3.2-.6" />
            <path d="m10.3 10.3a2.4 2.4 0 0 0 3.4 3.4" />
            <path d="m4 4 16 16" />
        </>
    ),
    users: (
        <>
            <path d="M15.5 20v-1.7a3.4 3.4 0 0 0-3.4-3.4H6.9a3.4 3.4 0 0 0-3.4 3.4V20" />
            <circle cx="9.5" cy="8" r="3.2" />
            <path d="M20.5 20v-1.7a3.4 3.4 0 0 0-2.6-3.3M16 5a3.2 3.2 0 0 1 0 6.1" />
        </>
    ),
    inbox: (
        <>
            <path d="M20.5 12.5v5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-5" />
            <path d="M3.5 12.5 6 5.6a2 2 0 0 1 1.9-1.3h8.2A2 2 0 0 1 18 5.6l2.5 6.9h-4.7l-1.2 2.4H9.4l-1.2-2.4H3.5Z" />
        </>
    ),
    briefcase: (
        <>
            <rect x="3.5" y="7.5" width="17" height="12" rx="2" />
            <path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5" />
            <path d="M3.5 12.5h17" />
        </>
    ),
    settings: (
        <>
            <circle cx="12" cy="12" r="2.8" />
            <path d="M19.1 14.4a1.5 1.5 0 0 0 .3 1.7l.1.1a1.8 1.8 0 1 1-2.6 2.6l-.1-.1a1.5 1.5 0 0 0-2.6 1.1v.2a1.8 1.8 0 1 1-3.6 0v-.1a1.5 1.5 0 0 0-2.6-1.1l-.1.1a1.8 1.8 0 1 1-2.6-2.6l.1-.1a1.5 1.5 0 0 0-1.1-2.6h-.2a1.8 1.8 0 1 1 0-3.6h.1a1.5 1.5 0 0 0 1.1-2.6l-.1-.1A1.8 1.8 0 1 1 8 4.7l.1.1a1.5 1.5 0 0 0 2.6-1.1v-.2a1.8 1.8 0 1 1 3.6 0v.1a1.5 1.5 0 0 0 2.6 1.1l.1-.1a1.8 1.8 0 1 1 2.6 2.6l-.1.1a1.5 1.5 0 0 0 1.1 2.6h.2a1.8 1.8 0 1 1 0 3.6h-.1a1.5 1.5 0 0 0-1.4.9Z" />
        </>
    ),
    logout: (
        <>
            <path d="M9.5 20H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h3.5" />
            <path d="m15.5 16 4-4-4-4" />
            <path d="M19.5 12h-11" />
        </>
    ),
    arrowRight: (
        <>
            <path d="M4.5 12h15" />
            <path d="m13.5 6 6 6-6 6" />
        </>
    ),
    arrowLeft: (
        <>
            <path d="M19.5 12h-15" />
            <path d="m10.5 6-6 6 6 6" />
        </>
    ),
    check: <path d="m5 12.5 4.5 4.5L19 6.5" />,
    checkCircle: (
        <>
            <circle cx="12" cy="12" r="8.5" />
            <path d="m8.5 12.2 2.4 2.4 4.6-4.8" />
        </>
    ),
    alert: (
        <>
            <circle cx="12" cy="12" r="8.5" />
            <path d="M12 8v4.8M12 15.8v.1" />
        </>
    ),
    info: (
        <>
            <circle cx="12" cy="12" r="8.5" />
            <path d="M12 11v5M12 8.1v.1" />
        </>
    ),
    search: (
        <>
            <circle cx="11" cy="11" r="6.5" />
            <path d="m16 16 4 4" />
        </>
    ),
    filter: <path d="M4 5.5h16l-6.2 7.3v5.4l-3.6 2v-7.4L4 5.5Z" />,
    clock: (
        <>
            <circle cx="12" cy="12" r="8.5" />
            <path d="M12 7.3V12l3 1.8" />
        </>
    ),
    bell: (
        <>
            <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
            <path d="M10 21h4" />
        </>
    ),
    calendar: (
        <>
            <rect x="3.8" y="5.2" width="16.4" height="15" rx="2" />
            <path d="M3.8 10h16.4M8.4 3.3v3.6M15.6 3.3v3.6" />
        </>
    ),
    upload: (
        <>
            <path d="M20 15.5v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3" />
            <path d="m8 8.5 4-4 4 4" />
            <path d="M12 4.5v11" />
        </>
    ),
    refresh: (
        <>
            <path d="M20 11.5a8 8 0 0 0-13.6-4.4L4 9.4" />
            <path d="M4 4.5v5h5" />
            <path d="M4 12.5a8 8 0 0 0 13.6 4.4L20 14.6" />
            <path d="M20 19.5v-5h-5" />
        </>
    ),
    menu: <path d="M4 7h16M4 12h16M4 17h16" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    chevronRight: <path d="m9.5 6 6 6-6 6" />,
    scale: (
        <>
            <path d="M12 4v16M7 20h10" />
            <path d="M12 7 5 9l-2 5a4 4 0 0 0 8 0L9 9M12 7l7 2 2 5a4 4 0 0 1-8 0l2-5" />
        </>
    ),
    megaphone: (
        <>
            <path d="M4 10.5v3a1.8 1.8 0 0 0 1.8 1.8h1.4l9.3 4.2V4.5L7.2 8.7H5.8A1.8 1.8 0 0 0 4 10.5Z" />
            <path d="M7.2 15.3V19a1.5 1.5 0 0 0 3 0v-2.4M20 9.8v4.4" />
        </>
    ),
    userShield: (
        <>
            <circle cx="10" cy="7.8" r="3.5" />
            <path d="M4 20v-1.4a4 4 0 0 1 4-4h3" />
            <path d="m17.5 12.4 3.2 1.3v2.2c0 1.8-1.3 3.5-3.2 4-1.9-.5-3.2-2.2-3.2-4v-2.2l3.2-1.3Z" />
        </>
    )
};

const Icon = ({ name, size = 18, className = "", strokeWidth = 1.8, ...rest }) => {
    const glyph = PATHS[name];
    if (!glyph) return null;

    return (
        <svg
            viewBox="0 0 24 24"
            width={size}
            height={size}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
            className={`wms-icon ${className}`.trim()}
            {...rest}
        >
            {glyph}
        </svg>
    );
};

export default Icon;
