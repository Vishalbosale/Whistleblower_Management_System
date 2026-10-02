// Shared sessionStorage key for anonymous post-box tracking credentials
// (complaintId, password) — set by PostBoxLogin once verified, read by
// PostBoxStatus. Deliberately sessionStorage (not localStorage) so the
// plaintext password doesn't outlive the tab.
export const POSTBOX_CREDS_KEY = "wms_postbox_creds";
