// Two staff constituencies use this system — the WB Committee and the
// Investigation Unit. The WB Committee role also carries administration
// permissions, so there is no standalone Admin role.
// role codes here keeps route guards and UI gating reading off one definition.
//
// The schema's role_permissions matrix (screen 6.30) is finer-grained but has
// no admin UI yet, so these allowlists stand in for it (see Phase 1 notes).
const ADMIN_ROLES = ["WBC_MEMBER"];

// The WB Committee owns intake, acknowledgement, the sufficiency decision,
// review of the investigation report and the closure call. ETHICS_OFFICER is
// the Phase 1 role that held these duties before the committee existed.
const WBC_ROLES = ["WBC_MEMBER"];

// The Investigation Unit conducts the inquiry and submits the IVR.
const IU_ROLES = ["INVESTIGATOR", "INVESTIGATION_HEAD"];

const hasAny = (roles = [], allowed = []) => roles.some((role) => allowed.includes(role));

const isAdmin = (roles = []) => hasAny(roles, ADMIN_ROLES);
const isWbc = (roles = []) => hasAny(roles, WBC_ROLES);
const isInvestigationUnit = (roles = []) => hasAny(roles, IU_ROLES);

const canActAsWbc = (roles = []) => isWbc(roles);

// Complainant identity is visible to the WB Committee and CEtO.
//
// The Investigation Unit is deliberately excluded and the exclusion WINS over
// every other role a user might also hold: once a case reaches the IU, the
// complainant's identity must not be visible to it. A user carrying an IU role
// is therefore identity-blind system-wide, which is the only reading that
// cannot be defeated by handing an investigator a second role.
const IDENTITY_VISIBLE_ROLES = [...WBC_ROLES, "CETO"];

const canViewIdentity = (roles = []) => {
    if (isInvestigationUnit(roles)) {
        return false;
    }

    return hasAny(roles, IDENTITY_VISIBLE_ROLES);
};

// Label used in the UI wherever a masked identity is rendered.
const MASKED = "*** withheld ***";

const maskValue = (value, canView) => {
    if (canView) {
        return value ?? null;
    }

    return value === null || value === undefined || value === "" ? null : MASKED;
};

// A short, human label for "who is acting here" — used in notification text
// so a recipient sees a role (e.g. "WB Committee"), never raw role codes.
const roleLabel = (roles = []) => {
    if (isWbc(roles)) return "WB Committee";
    if (isInvestigationUnit(roles)) return "Investigation Unit";
    return "Staff";
};

module.exports = {
    ADMIN_ROLES,
    WBC_ROLES,
    IU_ROLES,
    MASKED,
    hasAny,
    isAdmin,
    isWbc,
    isInvestigationUnit,
    canActAsWbc,
    canViewIdentity,
    maskValue,
    roleLabel
};
