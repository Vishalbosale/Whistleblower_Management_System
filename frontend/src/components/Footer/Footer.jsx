import { Link } from "react-router-dom";
import Icon from "../Icon/Icon";
import "./Footer.css";

function Footer() {
    const currentYear = new Date().getFullYear();

    return (
        <footer className="main-footer">

            <div className="footer-top">
                <div className="footer-brand">
                    <span className="footer-mark">
                        <Icon name="shieldCheck" size={18} strokeWidth={2} />
                    </span>

                    <div>
                        <strong>Axis Finance Limited</strong>
                        <p>
                            A confidential channel for reporting suspected
                            misconduct, protected end to end.
                        </p>
                    </div>
                </div>

                <nav className="footer-nav" aria-label="Footer">
                    <div className="footer-col">
                        <h3>Report</h3>
                        <Link to="/reporting">Register a Complaint</Link>
                        <Link to="/post-box-login">Post Box Login</Link>
                    </div>

                    <div className="footer-col">
                        <h3>Learn</h3>
                        <Link to="/whistleblower-policy">Whistleblower Policy</Link>
                        <a href="/privacy">Privacy Policy</a>
                        <a href="/terms">Terms &amp; Conditions</a>
                    </div>
                </nav>
            </div>

            <div className="footer-bottom">
                <div className="footer-bottom-inner">
                    <span className="footer-left">
                        © {currentYear} Axis Finance Limited. All Rights Reserved.
                    </span>

                    <span className="footer-secure">
                        <Icon name="lock" size={13} />
                        Secure &amp; confidential submission
                    </span>
                </div>
            </div>

        </footer>
    );
}

export default Footer;
