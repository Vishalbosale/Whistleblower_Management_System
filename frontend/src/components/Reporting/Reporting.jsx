import React, { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { useMasters } from "../../context/MastersContext";
import Icon from "../Icon/Icon";
import "./Reporting.css";

/* =========================================================
   FORM SECTIONS
   Drives both the stepper strip and the section headers so
   the two can never drift apart.
========================================================= */

const SECTIONS = [
  {
    id: "section-registration",
    num: "01",
    icon: "document",
    title: "Complaint Registration",
    blurb: "Provide the basic details of the complaint."
  },
  {
    id: "section-complainant",
    num: "02",
    icon: "userShield",
    title: "Complainant Details",
    blurb: "Provide the details of the person raising the complaint."
  },
  {
    id: "section-respondent",
    num: "03",
    icon: "users",
    title: "Complaint Against / Respondent Details",
    blurb: "Provide details of the person against whom the complaint is raised."
  }
];

/* =========================================================
   GET SYSTEM DATE & TIME
========================================================= */

const getSystemDate = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const getSystemDateTime = () => {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
};


/* =========================================================
   INITIAL FORM DATA
========================================================= */

const getInitialFormData = () => ({
  /* Complaint Registration */

  dateOfReceipt: getSystemDate(),

  complaintRegistrationDate: getSystemDateTime(),

  authority: "",

  complaintLanguage: "",

  channelReference: "",

  channel: "",

  complaintNature: "",

  complaintClassification: "",

  complainantType: "",

  anonymousNamed: "",

  complaintDescription: "",

  severity: "",


  /* Complainant Details */

  employeeName: "",

  branch: "",

  region: "",

  email: "",

  mobile: "",


  /* Respondent Details */

  respondentEmployeeId: "",

  respondentEmployeeName: "",

  respondentBranch: "",

  respondentRegion: "",

  respondentDepartment: "",

  respondentDesignation: "",

  multipleRespondents: "No",

  respondentRemarks: "",


  /* Declaration */

  declaration: false,
});


/* =========================================================
   COMPONENT
========================================================= */

const Reporting = () => {

  const navigate = useNavigate();

  const dateInputRef = useRef(null);

  const authorityOptions = useMasters("ADDRESSED_TO");
  const languageOptions = useMasters("LANGUAGE");
  const channelOptions = useMasters("CHANNEL");
  const natureOptions = useMasters("COMPLAINT_NATURE");
  const classificationOptions = useMasters("COMPLAINT_CLASSIFICATION");
  const complainantTypeOptions = useMasters("COMPLAINANT_TYPE");
  const anonymityOptions = useMasters("ANONYMITY_TYPE");
  const severityOptions = useMasters("SEVERITY");

  const [formData, setFormData] = useState(
    getInitialFormData()
  );

  const [attachment, setAttachment] = useState(null);

  const [submitted, setSubmitted] = useState(false);

  const [submitResult, setSubmitResult] = useState(null);

  const [submitError, setSubmitError] = useState("");

  const [submitting, setSubmitting] = useState(false);

  const isAnonymousSelected = formData.anonymousNamed === String(
    anonymityOptions.find((o) => o.code === "ANONYMOUS")?.id
  );
  const isNamedComplaint = Boolean(formData.anonymousNamed) && !isAnonymousSelected;


  /* =========================================================
     HANDLE INPUT CHANGE
  ========================================================= */

  const handleChange = (e) => {

    const {
      name,
      value,
      type,
      checked,
    } = e.target;

    setFormData((previous) => ({
      ...previous,

      [name]:
        type === "checkbox"
          ? checked
          : value,
    }));

  };


  /* =========================================================
     OPEN DATE PICKER
  ========================================================= */

  const openDatePicker = () => {

    if (dateInputRef.current) {

      if (
        typeof dateInputRef.current.showPicker ===
        "function"
      ) {
        dateInputRef.current.showPicker();
      } else {
        dateInputRef.current.focus();
      }

    }

  };


  /* =========================================================
     FILE UPLOAD
  ========================================================= */

  const handleFileChange = (e) => {

    const file = e.target.files[0];

    if (file) {
      setAttachment(file);
    }

  };


  /* =========================================================
     SUBMIT
  ========================================================= */

  const handleSubmit = async (e) => {

    e.preventDefault();

    setSubmitError("");

    if (isNamedComplaint && !String(formData.email || "").trim()) {
      setSubmitError("Email ID is required for named complaints.");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    const isAnonymous = isAnonymousSelected;

    const payload = new FormData();

    payload.append("dateOfReceipt", formData.dateOfReceipt);
    payload.append("addressedToId", formData.authority);
    payload.append("languageId", formData.complaintLanguage);
    payload.append("channelReference", formData.channelReference);
    payload.append("channelId", formData.channel);
    payload.append("natureId", formData.complaintNature);
    payload.append("classificationId", formData.complaintClassification);
    payload.append("complainantTypeId", formData.complainantType);
    payload.append("anonymityTypeId", formData.anonymousNamed);
    payload.append("description", formData.complaintDescription);
    payload.append("severityId", formData.severity);
    payload.append("declaration", formData.declaration);
    payload.append("wantsPostbox", "true");

    payload.append(
      "complainant",
      JSON.stringify(
        isAnonymous
          ? {}
          : {
              employeeName: formData.employeeName,
              branch: formData.branch,
              region: formData.region,
              email: formData.email,
              mobile: formData.mobile,
            }
      )
    );

    const respondent =
      formData.respondentEmployeeName || formData.respondentEmployeeId
        ? [
            {
              employeeName: formData.respondentEmployeeName,
              employeeId: formData.respondentEmployeeId,
              branch: formData.respondentBranch,
              region: formData.respondentRegion,
              department: formData.respondentDepartment,
              designation: formData.respondentDesignation,
              remarks: formData.respondentRemarks,
            },
          ]
        : [];

    payload.append("respondents", JSON.stringify(respondent));

    if (attachment) {
      payload.append("file", attachment);
    }

    setSubmitting(true);

    try {
      const result = await api.post("/public/complaints", payload, { isFormData: true });

      setSubmitResult(result);
      setSubmitted(true);

      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    } catch (err) {
      setSubmitError(err.message || "Failed to submit complaint. Please try again.");
    } finally {
      setSubmitting(false);
    }

  };


  /* =========================================================
     RESET
  ========================================================= */

  const handleReset = () => {

    setFormData(
      getInitialFormData()
    );

    setAttachment(null);

    setSubmitted(false);

    setSubmitResult(null);

    setSubmitError("");

  };


  /* =========================================================
     JSX
  ========================================================= */

  return (
    <div className="reporting-page">

      {/* =====================================================
          PAGE HEADER
      ====================================================== */}

      <div className="reporting-heading">

        <div className="heading-content">

          <span className="wms-eyebrow">
            <Icon name="lock" size={13} />
            Confidential Submission
          </span>

          <h1>
            Register a Complaint
          </h1>

          <p>
            Please provide the details below to register your whistleblower
            complaint. Fields marked <span className="req-dot">*</span> are
            required.
          </p>

        </div>


        <button
          type="button"
          className="back-home-btn"
          onClick={() => navigate("/")}
        >
          <Icon name="arrowLeft" size={15} />
          <span>Back to Home</span>
        </button>

      </div>


      {/* =====================================================
          SECTION STEPPER
      ====================================================== */}

      {!submitted && (
        <nav className="reporting-stepper" aria-label="Form sections">
          {SECTIONS.map((section, index) => (
            <React.Fragment key={section.id}>
              <a href={`#${section.id}`} className="stepper-step">
                <span className="stepper-num">{section.num}</span>
                <span className="stepper-label">{section.title}</span>
              </a>

              {index < SECTIONS.length - 1 && (
                <span className="stepper-rail" aria-hidden="true" />
              )}
            </React.Fragment>
          ))}
        </nav>
      )}


      {/* =====================================================
          SUCCESS MESSAGE
      ====================================================== */}

      {submitted && submitResult && (

        <div className="success-message">

          <div className="success-icon">
            <Icon name="check" size={18} strokeWidth={3} />
          </div>

          <div className="success-body">

            <strong>
              Complaint submitted successfully.
            </strong>

            <p>
              Your complaint has been registered with ID{" "}
              <code className="success-code">{submitResult.complaintId}</code>.
            </p>

            {submitResult.password && (
              <>
                <div className="credentials-box">
                  <div className="credentials-warning">
                    <Icon name="alert" size={25} />
                    Save these post box details now — they will not be shown
                    again.
                  </div>

                  <dl className="credentials-grid">
                    <dt>Complaint ID</dt>
                    <dd><code>{submitResult.complaintId}</code></dd>

                    <dt>Password</dt>
                    <dd><code>{submitResult.password}</code></dd>
                  </dl>
                </div>

                <button
                  type="button"
                  className="success-cta"
                  onClick={() => navigate("/post-box-login")}
                >
                  <Icon name="mailbox" size={16} />
                  <span>Go to Post Box Login</span>
                  <Icon name="arrowRight" size={15} />
                </button>
              </>
            )}

          </div>

        </div>

      )}

      {submitError && (
        <div className="success-message is-error">
          <div className="success-icon">
            <Icon name="alert" size={18} />
          </div>

          <div className="success-body">
            <strong>Submission failed</strong>
            <p>{submitError}</p>
          </div>
        </div>
      )}


      {/* =====================================================
          FORM
      ====================================================== */}

      {!submitted && (
      <form
        className="complaint-form"
        onSubmit={handleSubmit}
      >


        {/* ===================================================
            SECTION 01
            COMPLAINT REGISTRATION
        ==================================================== */}

        <section className="form-card" id={SECTIONS[0].id}>

          <div className="section-header">

            <div className="section-number">
              <Icon name={SECTIONS[0].icon} size={18} />
              <span>{SECTIONS[0].num}</span>
            </div>

            <div>

              <h2 data-step={SECTIONS[0].num}>
                {SECTIONS[0].title}
              </h2>

              <p>
                {SECTIONS[0].blurb}
              </p>

            </div>

          </div>


          <div className="form-grid">


            {/* Complaint ID */}

            <div className="form-group">

              <label>
                Complaint ID
              </label>

              <input
                type="text"
                value="Auto Generated"
                readOnly
                className="readonly-field"
              />

              <span className="field-hint">
                System generated
              </span>

            </div>


            {/* Date Of Receipt */}

            <div className="form-group">

              <label>
                Date of Receipt
                <span>*</span>
              </label>


              <div className="date-input-wrapper">

                <input
                  ref={dateInputRef}
                  type="date"
                  name="dateOfReceipt"
                  value={formData.dateOfReceipt}
                  onChange={handleChange}
                  required
                />


                <button
                  type="button"
                  className="calendar-icon-btn"
                  onClick={openDatePicker}
                  aria-label="Select Date of Receipt"
                >
                  📅
                </button>

              </div>


              <span className="field-hint">
                Select the date on which the complaint
                was received.
              </span>

            </div>


            {/* Complaint Registration Date */}

            <div className="form-group">

              <label>
                Complaint Registration Date/Time
              </label>


              <div className="date-input-wrapper system-date">

                <input
                  type="datetime-local"
                  name="complaintRegistrationDate"
                  value={
                    formData.complaintRegistrationDate
                  }
                  readOnly
                />


                <span className="system-clock-icon">
                  🕒
                </span>

              </div>


              <span className="field-hint">
                Automatically captured from system
                date and time.
              </span>

            </div>


            {/* Authority */}

            <div className="form-group">

              <label>
                MD & CEO / WB
                <span>*</span>
              </label>

              <select
                name="authority"
                value={formData.authority}
                onChange={handleChange}
                required
              >

                <option value="">
                  Select
                </option>

                {authorityOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}

              </select>

            </div>


            {/* Complaint Language */}

            <div className="form-group">

              <label>
                Complaint Language
                <span>*</span>
              </label>

              <select
                name="complaintLanguage"
                value={
                  formData.complaintLanguage
                }
                onChange={handleChange}
                required
              >

                <option value="">
                  Select
                </option>

                {languageOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}

              </select>

            </div>


            {/* Channel Reference */}

            <div className="form-group">

              <label>
                Channel Reference
              </label>

              <input
                type="text"
                name="channelReference"
                value={
                  formData.channelReference
                }
                onChange={handleChange}
                placeholder="Enter channel reference"
              />

            </div>


            {/* Channel */}

            <div className="form-group">

              <label>
                Channel
                <span>*</span>
              </label>

              <select
                name="channel"
                value={formData.channel}
                onChange={handleChange}
                required
              >

                <option value="">
                  Select
                </option>

                {channelOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}

              </select>

            </div>


            {/* Complaint Nature */}

            <div className="form-group">

              <label>
                Complaint Nature
                <span>*</span>
              </label>

              <select
                name="complaintNature"
                value={
                  formData.complaintNature
                }
                onChange={handleChange}
                required
              >

                <option value="">
                  Select
                </option>

                {natureOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}

              </select>

            </div>


            {/* Classification */}

            <div className="form-group">

              <label>
                Complaint Classification
                <span>*</span>
              </label>

              <select
                name="complaintClassification"
                value={
                  formData.complaintClassification
                }
                onChange={handleChange}
                required
              >

                <option value="">
                  Select
                </option>

                {classificationOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}

              </select>

            </div>


            {/* Complainant Type */}

            <div className="form-group">

              <label>
                Complainant Type
                <span>*</span>
              </label>

              <select
                name="complainantType"
                value={
                  formData.complainantType
                }
                onChange={handleChange}
                required
              >

                <option value="">
                  Select
                </option>

                {complainantTypeOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}

              </select>

            </div>


            {/* Anonymous / Named */}

            <div className="form-group">

              <label>
                Anonymous / Named
                <span>*</span>
              </label>

              <select
                name="anonymousNamed"
                value={
                  formData.anonymousNamed
                }
                onChange={handleChange}
                required
              >

                <option value="">
                  Select
                </option>

                {anonymityOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}

              </select>

            </div>


            {/* Complaint Description */}

            <div className="form-group full-width">

              <div className="label-row">

                <label>
                  Complaint Description
                  <span>*</span>
                </label>

                <small>
                  {
                    formData.complaintDescription
                      .length
                  }/2000
                </small>

              </div>


              <textarea
                name="complaintDescription"
                value={
                  formData.complaintDescription
                }
                onChange={(e) => {

                  if (
                    e.target.value.length <= 2000
                  ) {
                    handleChange(e);
                  }

                }}
                rows="7"
                placeholder="Please provide a detailed description of the complaint..."
                required
              />

            </div>


            {/* Severity */}

            <div className="form-group">

              <label>
                Severity
                <span>*</span>
              </label>

              <select
                name="severity"
                value={formData.severity}
                onChange={handleChange}
                required
              >

                <option value="">
                  Select
                </option>

                {severityOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}

              </select>

            </div>


            {/* Attachment */}

            <div className="form-group">

              <label>
                Attachment Upload
              </label>


              <div className="file-upload">

                <input
                  type="file"
                  id="complaintAttachment"
                  onChange={handleFileChange}
                />

                <label
                  htmlFor="complaintAttachment"
                  className="file-label"
                >
                  📎 Choose File
                </label>

              </div>


              {attachment && (

                <div className="selected-file">
                  ✓ {attachment.name}
                </div>

              )}

            </div>


            {/* Declaration */}

            <div className="form-group full-width">

              <label className="declaration">

                <input
                  type="checkbox"
                  name="declaration"
                  checked={
                    formData.declaration
                  }
                  onChange={handleChange}
                  required
                />

                <span>
                  I confirm that the complaint is
                  submitted in good faith.
                </span>

              </label>

            </div>

          </div>

        </section>


        {/* ===================================================
            SECTION 02
            COMPLAINANT DETAILS
        ==================================================== */}

        {!isAnonymousSelected && (
        <section className="form-card" id={SECTIONS[1].id}>

          <div className="section-header">

            <div className="section-number">
              <Icon name={SECTIONS[1].icon} size={18} />
              <span>{SECTIONS[1].num}</span>
            </div>

            <div>

              <h2 data-step={SECTIONS[1].num}>
                {SECTIONS[1].title}
              </h2>

              <p>
                {SECTIONS[1].blurb}
              </p>

            </div>

          </div>


          <div className="form-grid">


            {/* Employee Name */}

            <div className="form-group">

              <label>
                Employee Name
              </label>

              <input
                type="text"
                name="employeeName"
                value={
                  formData.employeeName
                }
                onChange={handleChange}
                placeholder="Enter employee name"
              />

            </div>


            {/* Branch */}

            <div className="form-group">

              <label>
                Branch
              </label>

              <input
                type="text"
                name="branch"
                value={formData.branch}
                onChange={handleChange}
                placeholder="Enter branch"
              />

            </div>


            {/* Region */}

            <div className="form-group">

              <label>
                Region
              </label>

              <input
                type="text"
                name="region"
                value={formData.region}
                onChange={handleChange}
                placeholder="Enter region"
              />

            </div>


            {/* Email */}

            <div className="form-group">

              <label>
                Email ID
                {isNamedComplaint && <span>*</span>}
              </label>

              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="example@company.com"
                required={isNamedComplaint}
                aria-required={isNamedComplaint}
              />

            </div>


            {/* Mobile */}

            <div className="form-group">

              <label>
                Mobile Number
              </label>

              <input
                type="tel"
                name="mobile"
                value={formData.mobile}
                onChange={handleChange}
                placeholder="Enter mobile number"
              />

            </div>

          </div>

        </section>
        )}


        {/* ===================================================
            SECTION 03
            RESPONDENT DETAILS
        ==================================================== */}

        <section className="form-card" id={SECTIONS[2].id}>

          <div className="section-header">

            <div className="section-number">
              <Icon name={SECTIONS[2].icon} size={18} />
              <span>{SECTIONS[2].num}</span>
            </div>

            <div>

              <h2 data-step={SECTIONS[2].num}>
                {SECTIONS[2].title}
              </h2>

              <p>
                {SECTIONS[2].blurb}
              </p>

            </div>

          </div>


          <div className="form-grid">


            {/* Respondent Employee ID */}

            <div className="form-group">

              <label>
                Employee ID
              </label>

              <input
                type="text"
                name="respondentEmployeeId"
                value={
                  formData.respondentEmployeeId
                }
                onChange={handleChange}
                placeholder="Enter employee ID"
              />

            </div>


            {/* Respondent Employee Name */}

            <div className="form-group">

              <label>
                Employee Name
              </label>

              <input
                type="text"
                name="respondentEmployeeName"
                value={
                  formData.respondentEmployeeName
                }
                onChange={handleChange}
                placeholder="Enter employee name"
              />

            </div>


            {/* Respondent Branch */}

            <div className="form-group">

              <label>
                Branch
              </label>

              <input
                type="text"
                name="respondentBranch"
                value={
                  formData.respondentBranch
                }
                onChange={handleChange}
                placeholder="Enter branch"
              />

            </div>


            {/* Respondent Region */}

            <div className="form-group">

              <label>
                Region
              </label>

              <input
                type="text"
                name="respondentRegion"
                value={
                  formData.respondentRegion
                }
                onChange={handleChange}
                placeholder="Enter region"
              />

            </div>


            {/* Respondent Department */}

            <div className="form-group">

              <label>
                Department
              </label>

              <input
                type="text"
                name="respondentDepartment"
                value={
                  formData.respondentDepartment
                }
                onChange={handleChange}
                placeholder="Enter department"
              />

            </div>


            {/* Respondent Designation */}

            <div className="form-group">

              <label>
                Designation
              </label>

              <input
                type="text"
                name="respondentDesignation"
                value={
                  formData.respondentDesignation
                }
                onChange={handleChange}
                placeholder="Enter designation"
              />

            </div>


            {/* Multiple Respondents */}

            <div className="form-group">

              <label>
                Multiple Respondents
              </label>

              <select
                name="multipleRespondents"
                value={
                  formData.multipleRespondents
                }
                onChange={handleChange}
              >

                <option value="No">
                  No
                </option>

                <option value="Yes">
                  Yes
                </option>

              </select>

            </div>


            {/* Respondent Remarks */}

            <div className="form-group full-width">

              <label>
                Respondent Remarks
              </label>

              <textarea
                name="respondentRemarks"
                value={
                  formData.respondentRemarks
                }
                onChange={handleChange}
                rows="4"
                placeholder="Enter any additional remarks..."
              />

            </div>

          </div>

        </section>


        {/* ===================================================
            FORM ACTIONS
        ==================================================== */}

        <div className="form-actions">

          <p className="form-actions-note">
            <Icon name="shieldCheck" size={15} />
            Your submission is encrypted and handled confidentially.
          </p>

          <div className="form-actions-buttons">
            <button
              type="button"
              className="reset-btn"
              onClick={handleReset}
            >
              <Icon name="refresh" size={15} />
              <span>Reset</span>
            </button>


            <button
              type="submit"
              className="submit-btn"
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <span className="wms-spinner" />
                  <span>Submitting…</span>
                </>
              ) : (
                <>
                  <span>Submit Complaint</span>
                  <Icon name="arrowRight" size={16} className="submit-arrow" />
                </>
              )}
            </button>
          </div>

        </div>

      </form>
      )}

    </div>
  );
};

export default Reporting;
