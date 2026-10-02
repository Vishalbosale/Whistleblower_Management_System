import React, { useEffect, useState } from "react";
import { NavLink, Link, useLocation } from "react-router-dom";
import Icon from "../Icon/Icon";
import "./Header.css";

const NAV_ITEMS = [
  { to: "/", label: "Home", end: true },
  { to: "/whistleblower-policy", label: "Whistleblower Policy" },
  { to: "/post-box-login", label: "Post Box Login" }
];

/* The official Axis Finance wordmark. The supplied artwork is burgundy —
   invisible on the burgundy header — so the header uses the white lockup
   generated from the same file; `axis-finance-logo.svg` keeps the burgundy
   original for any light-background use. */
const LOGO_SRC = "/axis-finance-logo-light.svg";

const Header = () => {
  /* Seeded from the current offset so a mid-page reload renders the
     condensed header on the first paint rather than snapping after it. */
  const [scrolled, setScrolled] = useState(() => window.scrollY > 8);
  const [menuOpen, setMenuOpen] = useState(false);
  const [logoOk, setLogoOk] = useState(true);
  const location = useLocation();

  /* Condense the header once the page scrolls away from the top. */
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* Any navigation closes the mobile drawer. */
  useEffect(() => setMenuOpen(false), [location.pathname]);

  return (
    <header className={`main-header${scrolled ? " is-scrolled" : ""}`}>
      <div className="header-inner">

        {/* LEFT — BRAND */}
        <Link to="/" className="header-logo" aria-label="Axis Finance Whistleblower System">
          {logoOk ? (
            <img
              src={LOGO_SRC}
              alt="Axis Finance"
              className="logo-img"
              width="394"
              height="81"
              onError={() => setLogoOk(false)}
            />
          ) : (
            <span className="logo-mark">
              <Icon name="shieldCheck" size={20} strokeWidth={2} />
            </span>
          )}

          {/* The wordmark supplies "Axis Finance"; this names the application */}
          <span className="logo-copy">
            <span className="logo-divider" aria-hidden="true" />
            <span className="logo-title">Whistleblower System</span>
          </span>
        </Link>

        {/* RIGHT — NAVIGATION */}
        <nav className={`header-nav${menuOpen ? " is-open" : ""}`}>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                isActive ? "nav-link active" : "nav-link"
              }
            >
              {item.label}
            </NavLink>
          ))}

          <Link to="/reporting" className="reporting-btn">
            <Icon name="megaphone" size={16} />
            <span>Report a Concern</span>
          </Link>
        </nav>

        {/* MOBILE TOGGLE */}
        <button
          type="button"
          className="header-menu-btn"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <Icon name={menuOpen ? "close" : "menu"} size={22} />
        </button>

      </div>
    </header>
  );
};

export default Header;
