import React from "react";
import { Link } from "react-router-dom";
import Icon from "../Icon/Icon";
import "./WhistleblowerPolicy.css";

const WhistleblowerPolicy = () => {
  return (
    <div className="policy-page">

      {/* Page Header */}
      <div className="policy-header">
        <div className="policy-header-copy">
          <span className="wms-eyebrow">
            <Icon name="scale" size={13} />
            Governance
          </span>

          <h1>Whistleblower Policy</h1>

          <p>
            How Axis Finance receives, protects and acts on reports of
            suspected wrongdoing.
          </p>

          <div className="policy-downloads">
            <a
              href="/axis-finance-code-of-conduct.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="policy-download"
            >
              <Icon name="document" size={16} />
              <span>Code of Conduct &amp; Ethics</span>
            </a>

            <a
              href="/axis-finance-code-of-conduct.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="policy-download"
            >
              <Icon name="document" size={16} />
              <span>Whistleblower Policy (PDF)</span>
            </a>
          </div>
        </div>

        <Link to="/" className="back-home">
          <Icon name="arrowLeft" size={15} />
          <span>Back to Home</span>
        </Link>
      </div>

      {/* Policy Content */}
      <div className="policy-content">

        <section className="policy-section">
          <h2>1. Purpose</h2>

          <p>
            The purpose of the Whistleblower Policy is to provide a
            secure and confidential mechanism for employees and other
            stakeholders to report concerns relating to suspected
            wrongdoing, misconduct, unethical behaviour or violations
            of applicable policies and regulations.
          </p>
        </section>


        <section className="policy-section">
          <h2>2. Scope</h2>

          <p>
            This policy applies to employees and other eligible
            stakeholders who become aware of suspected misconduct,
            illegal activities, unethical practices or violations
            within the organisation.
          </p>
        </section>


        <section className="policy-section">
          <h2>3. Matters That Can Be Reported</h2>

          <p>
            The following types of concerns may be reported through
            the Whistleblower System:
          </p>

          <ul>
            <li>
              Violation of Code of Conduct and Ethics.
            </li>

            <li>
              Misuse of office or authority.
            </li>

            <li>
              Fraud or suspected fraud.
            </li>

            <li>
              Misappropriation of funds or assets.
            </li>

            <li>
              Violation of laws, regulations or internal policies.
            </li>

            <li>
              Conflict of interest.
            </li>

            <li>
              Manipulation or falsification of records or documents.
            </li>

            <li>
              Discrimination or harassment.
            </li>

            <li>
              Leakage or misuse of confidential information.
            </li>

            <li>
              Any other serious misconduct or unethical behaviour.
            </li>
          </ul>
        </section>


        <section className="policy-section">
          <h2>4. Confidentiality</h2>

          <p>
            All reports submitted through the Whistleblower System
            will be treated as strictly confidential. Information
            relating to a report will be shared only with authorised
            individuals on a need-to-know basis.
          </p>
        </section>


        <section className="policy-section">
          <h2>5. Anonymity</h2>

          <p>
            A whistleblower may choose to remain anonymous while
            submitting a report. The system provides mechanisms to
            communicate with the whistleblower without requiring
            disclosure of their identity.
          </p>
        </section>


        <section className="policy-section">
          <h2>6. Protection Against Retaliation</h2>

          <p>
            Individuals who make reports in good faith should not
            be subject to retaliation, discrimination or adverse
            treatment as a consequence of reporting a concern.
          </p>
        </section>


        <section className="policy-section">
          <h2>7. False or Malicious Reports</h2>

          <p>
            The Whistleblower System must not be used to make
            knowingly false, malicious or deliberately misleading
            accusations against another person.
          </p>
        </section>


        <section className="policy-section">
          <h2>8. Investigation</h2>

          <p>
            Reported concerns may be reviewed and investigated by
            authorised personnel in accordance with applicable
            internal procedures and regulatory requirements.
          </p>
        </section>


        <section className="policy-section">
          <h2>9. Communication</h2>

          <p>
            Where applicable, the whistleblower may use the secure
            post box to communicate with the investigation team,
            provide additional information and respond to follow-up
            questions.
          </p>
        </section>


        <section className="policy-section">
          <h2>10. Important Note</h2>

          <p>
            Please provide accurate and factual information when
            submitting a report. Supporting documents or other
            relevant information may be provided wherever available.
          </p>
        </section>

      </div>

    </div>
  );
};

export default WhistleblowerPolicy;