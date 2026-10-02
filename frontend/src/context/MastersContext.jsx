import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import { api } from "../lib/api";

const MastersContext = createContext(null);

export const MastersProvider = ({ children }) => {
    const [mastersByCode, setMastersByCode] = useState({});
    const inFlight = useRef({});

    const getMasters = useCallback(
        async (code) => {
            if (mastersByCode[code]) {
                return mastersByCode[code];
            }

            if (inFlight.current[code]) {
                return inFlight.current[code];
            }

            const promise = api.get(`/masters/${code}`).then((values) => {
                setMastersByCode((prev) => ({ ...prev, [code]: values }));
                delete inFlight.current[code];
                return values;
            });

            inFlight.current[code] = promise;
            return promise;
        },
        [mastersByCode]
    );

    return (
        <MastersContext.Provider value={{ mastersByCode, getMasters }}>
            {children}
        </MastersContext.Provider>
    );
};

// Returns the current list for `code` (empty array until loaded) and kicks
// off the fetch on first use. Shared across components via context so the
// same dropdown list isn't re-fetched every time a form mounts.
export const useMasters = (code) => {
    const ctx = useContext(MastersContext);

    if (!ctx) {
        throw new Error("useMasters must be used within a MastersProvider");
    }

    const { mastersByCode, getMasters } = ctx;

    React.useEffect(() => {
        if (code) {
            getMasters(code);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [code]);

    return mastersByCode[code] || [];
};
