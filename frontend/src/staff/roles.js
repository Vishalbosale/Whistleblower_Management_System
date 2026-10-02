// Mirrors backend/src/utils/permissions.js. The server is the authority — this
// copy only decides what to render, never what is allowed.
export const ADMIN_ROLES = ["WBC_MEMBER"];
export const WBC_ROLES = ["WBC_MEMBER"];
export const IU_ROLES = ["INVESTIGATOR", "INVESTIGATION_HEAD"];

const hasAny = (roles = [], allowed = []) => roles.some((role) => allowed.includes(role));

export const isAdmin = (roles) => hasAny(roles, ADMIN_ROLES);
export const isWbc = (roles) => hasAny(roles, WBC_ROLES);
export const isInvestigationUnit = (roles) => hasAny(roles, IU_ROLES);

// Admin drives the workflow as well as administering it.
export const canActAsWbc = (roles) => isWbc(roles);

// The one landing route every constituency is guaranteed to have access to.
// Anything that decides where to send a signed-in user (the index redirect,
// post-login navigation) must go through this so it can never disagree with
// what ProtectedRoute actually allows.
export const homeRouteFor = (roles) => (canActAsWbc(roles) ? "/staff/complaints" : "/staff/cases");

// How the signed-in user is described in the UI. Investigation Unit is checked
// first so a user who somehow holds both sees the more restricted framing —
// the same precedence the server applies to identity masking.
export const constituencyOf = (roles = []) => {
    if (isInvestigationUnit(roles)) return "Investigation Unit";
    if (isWbc(roles)) return "WB Committee";
    return "Staff";
};
