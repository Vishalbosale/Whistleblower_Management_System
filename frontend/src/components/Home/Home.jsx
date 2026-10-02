import React from "react";
import { Link } from "react-router-dom";
import Icon from "../Icon/Icon";
import "./Home.css";

const Home = () => {
  return (
    <div className="home-page">

      {/* =====================================================
          HERO
      ====================================================== */}
      <section className="home-hero wms-dotgrid">
        <div className="home-hero-inner">

          <div className="hero-copy wms-enter">
            <span className="wms-eyebrow hero-eyebrow">
              <Icon name="lock" size={13} />
              Confidential &amp; Protected
            </span>

            <h1>
              Speak up.
              <span className="hero-accent"> We&apos;ll take it from here.</span>
            </h1>

            <p className="hero-lead">
              The Whistleblower System lets employees and other stakeholders
              report concerns about suspected misconduct, illegal, unethical
              or inappropriate actions — safely, and anonymously if you choose.
            </p>

            <div className="hero-actions">
              <Link to="/reporting" className="hero-btn hero-btn-primary">
                <Icon name="megaphone" size={17} />
                <span>Report a Concern</span>
                <Icon name="arrowRight" size={16} className="hero-btn-arrow" />
              </Link>

              <Link to="/post-box-login" className="hero-btn hero-btn-ghost">
                <Icon name="mailbox" size={17} />
                <span>Check Your Post Box</span>
              </Link>
            </div>

            <ul className="hero-assurances">
              <li>
                <Icon name="checkCircle" size={15} />
                Strictly confidential
              </li>
              <li>
                <Icon name="eyeOff" size={15} />
                Anonymous reporting
              </li>
              <li>
                <Icon name="clock" size={15} />
                Tracked end to end
              </li>
            </ul>
          </div>

          {/* Illustrative status panel — shows what a tracked case looks like */}
          <aside className="hero-panel" aria-hidden="true">
            <div className="hero-panel-glow" />

            <div className="hero-panel-card">
              <div className="hero-panel-head">
                <span className="hero-panel-dot" />
                <span>Secure Post Box</span>
              </div>

              <div className="hero-panel-id">WMS-2026-000148</div>

              <div className="hero-panel-track">
                <div className="hero-track-step is-done">
                  <span className="hero-track-node">
                    <Icon name="check" size={12} strokeWidth={3} />
                  </span>
                  <div>
                    <strong>Report received</strong>
                    <small>Acknowledged within 24 hrs</small>
                  </div>
                </div>

                <div className="hero-track-step is-done">
                  <span className="hero-track-node">
                    <Icon name="check" size={12} strokeWidth={3} />
                  </span>
                  <div>
                    <strong>Case created</strong>
                    <small>Assigned to Ethics Officer</small>
                  </div>
                </div>

                <div className="hero-track-step is-active">
                  <span className="hero-track-node" />
                  <div>
                    <strong>Under investigation</strong>
                    <small>In progress</small>
                  </div>
                </div>

                <div className="hero-track-step">
                  <span className="hero-track-node" />
                  <div>
                    <strong>Committee review</strong>
                    <small>Pending</small>
                  </div>
                </div>
              </div>
            </div>
          </aside>

        </div>
      </section>

      {/* =====================================================
          INTRO NOTE
      ====================================================== */}
      <section className="home-note">
        <div className="home-note-icon">
          <Icon name="info" size={18} />
        </div>

        <div className="home-note-body">
          <p>
            The whistleblower system may not be used to make false accusations
            against others, and deliberately untrue information may not be
            reported.
          </p>

          <p>
            We encourage you to provide your name in the report. Regardless of
            whether you do so or not, please open a secure post box — it makes
            it safer and easier for us to communicate. All reports are strictly
            confidential; more detail is in the{" "}
            <Link to="/whistleblower-policy" className="policy-link">
              Whistleblower Policy
            </Link>
            .
          </p>
        </div>
      </section>

      {/* =====================================================
          INFORMATION CARDS
      ====================================================== */}
      <section className="info-section wms-stagger">

        {/* WHAT CAN BE REPORTED */}
        <article className="info-card">
          <div className="card-header">
            <span className="card-icon">
              <Icon name="scale" size={19} />
            </span>

            <div className="card-heading">
              <h2>What can be reported?</h2>
              <span className="card-kicker">Scope of the policy</span>
            </div>
          </div>

          <div className="card-content">
            <p>
              The{" "}
              <Link to="/whistleblower-policy" className="policy-link">
                Whistleblower Policy
              </Link>{" "}
              addresses concerns of employees relating to wrongdoing within the
              Bank, enabling them to report suspected occurrences of illegal,
              unethical or inappropriate actions, behaviours or practices.
            </p>

            <p className="sub-heading">Key wrongdoing areas:</p>

            <ol>
              <li>Violation of Code of Conduct and Ethics for employees.</li>
              <li>Misuse of office and authority.</li>
              <li>
                Violation of laid down rules and regulations or communication
                of procedures of the Bank.
              </li>
              <li>Misappropriation of financial statements of the Bank.</li>
              <li>
                Failure to comply with legal, compliance and regulatory
                requirements.
              </li>
              <li>Misappropriation of funds.</li>
              <li>
                Actual or suspected fraud or irregularities including forgery
                or alteration of documents.
              </li>
              <li>Conflicts of interest.</li>
              <li>
                Discrimination against a member of staff or service recipient.
              </li>
              <li>Cases of conflict of interest or misuse of Bank resources.</li>
              <li>Leakage or suspected leakage of information.</li>
              <li>Any other concern that may have an impact on the Bank.</li>
            </ol>
          </div>
        </article>

        {/* ANONYMITY */}
        <article className="info-card">
          <div className="card-header">
            <span className="card-icon">
              <Icon name="eyeOff" size={19} />
            </span>

            <div className="card-heading">
              <h2>Anonymity</h2>
              <span className="card-kicker">Protect your identity</span>
            </div>
          </div>

          <div className="card-content">
            <p>To ensure your anonymity, you should do the following:</p>

            <ul className="check-list">
              <li>
                <Icon name="check" size={14} strokeWidth={2.6} />
                <span>
                  If possible, do not report from a PC provided by your company.
                </span>
              </li>
              <li>
                <Icon name="check" size={14} strokeWidth={2.6} />
                <span>
                  Do not use a PC connected to the company&apos;s network,
                  intranet or VPN.
                </span>
              </li>
              <li>
                <Icon name="check" size={14} strokeWidth={2.6} />
                <span>
                  Access the system by typing the URL into your browser rather
                  than clicking a link.
                </span>
              </li>
              <li>
                <Icon name="check" size={14} strokeWidth={2.6} />
                <span>Do not write your own personal details.</span>
              </li>
            </ul>
          </div>
        </article>

        {/* OPEN A POST BOX */}
        <article className="info-card">
          <div className="card-header">
            <span className="card-icon">
              <Icon name="mailbox" size={19} />
            </span>

            <div className="card-heading">
              <h2>Open a post box</h2>
              <span className="card-kicker">Stay reachable, stay anonymous</span>
            </div>
          </div>

          <div className="card-content">
            <p>
              When you send the report, you can choose whether to remain
              available for further inquiries by opening a secure post box.
            </p>

            <p>
              We recommend that you do — we may not be able to finalise the case
              without further information from you.
            </p>

            <p>
              When you create a post box you will be given a secure number and
              you will choose a password. Please remember your case number and
              password so you can log in and see if you have received any
              questions.
            </p>

            <p className="final-note">
              <Icon name="shieldCheck" size={16} />
              All communication with us is anonymous if you wish it to be.
            </p>

            <Link to="/post-box-login" className="card-cta">
              Go to Post Box Login
              <Icon name="chevronRight" size={15} />
            </Link>
          </div>
        </article>

      </section>
    </div>
  );
};

export default Home;
