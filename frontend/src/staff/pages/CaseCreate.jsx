import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../../lib/api";
import { useMasters } from "../../context/MastersContext";

const CaseCreate = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const complaintId = searchParams.get("complaintId");

    const caseTypes = useMasters("CASE_TYPE");
    const priorities = useMasters("PRIORITY");
    const riskCategories = useMasters("RISK_CATEGORY");

    const [departments, setDepartments] = useState([]);
    const [officers, setOfficers] = useState([]);
    const [complaintNo, setComplaintNo] = useState("");

    const [form, setForm] = useState({
        caseTypeId: "",
        priorityId: "",
        riskCategoryId: "",
        investigationUnitId: "",
        investigationOfficerId: "",
        dueDate: "",
        remarks: ""
    });

    const [error, setError] = useState("");
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        api.get("/org/departments", { auth: true }).then(setDepartments).catch(() => {});
        api.get("/users", { auth: true }).then(setOfficers).catch(() => {});

        if (complaintId) {
            api.get(`/complaints/${complaintId}`, { auth: true })
                .then((data) => setComplaintNo(data.complaint.complaint_no))
                .catch(() => {});
        }
    }, [complaintId]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setForm((f) => ({ ...f, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");

        if (!complaintId) {
            setError("Missing complaint reference.");
            return;
        }

        setSubmitting(true);

        try {
            const result = await api.post(
                "/cases",
                {
                    complaintId: Number(complaintId),
                    caseTypeId: Number(form.caseTypeId),
                    priorityId: Number(form.priorityId),
                    riskCategoryId: Number(form.riskCategoryId),
                    investigationUnitId: form.investigationUnitId ? Number(form.investigationUnitId) : null,
                    investigationOfficerId: form.investigationOfficerId ? Number(form.investigationOfficerId) : null,
                    dueDate: form.dueDate || null,
                    remarks: form.remarks || null
                },
                { auth: true }
            );

            navigate(`/staff/cases/${result.caseId}`);
        } catch (err) {
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div>
            <div className="staff-page-header">
                <h1>Create Case{complaintNo ? ` — ${complaintNo}` : ""}</h1>
            </div>

            {error && <div className="staff-error">{error}</div>}

            <form className="staff-card" onSubmit={handleSubmit}>
                <div className="staff-form-grid">
                    <div className="staff-form-group">
                        <label>Case Type *</label>
                        <select name="caseTypeId" value={form.caseTypeId} onChange={handleChange} required>
                            <option value="">Select</option>
                            {caseTypes.map((c) => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="staff-form-group">
                        <label>Priority *</label>
                        <select name="priorityId" value={form.priorityId} onChange={handleChange} required>
                            <option value="">Select</option>
                            {priorities.map((c) => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="staff-form-group">
                        <label>Risk Category *</label>
                        <select name="riskCategoryId" value={form.riskCategoryId} onChange={handleChange} required>
                            <option value="">Select</option>
                            {riskCategories.map((c) => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="staff-form-group">
                        <label>Assigned Investigation Unit</label>
                        <select name="investigationUnitId" value={form.investigationUnitId} onChange={handleChange}>
                            <option value="">Select</option>
                            {departments.map((d) => (
                                <option key={d.id} value={d.id}>{d.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="staff-form-group">
                        <label>Investigation Officer</label>
                        <select name="investigationOfficerId" value={form.investigationOfficerId} onChange={handleChange}>
                            <option value="">Select</option>
                            {officers.map((o) => (
                                <option key={o.id} value={o.id}>{o.fullName} ({o.username})</option>
                            ))}
                        </select>
                    </div>

                    <div className="staff-form-group">
                        <label>Due Date</label>
                        <input type="date" name="dueDate" value={form.dueDate} onChange={handleChange} />
                    </div>

                    <div className="staff-form-group full-width">
                        <label>Case Remarks</label>
                        <textarea name="remarks" rows="4" value={form.remarks} onChange={handleChange} />
                    </div>
                </div>

                <div className="staff-actions-row">
                    <button type="submit" className="staff-btn staff-btn-primary" disabled={submitting}>
                        {submitting ? "Creating..." : "Create Case"}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default CaseCreate;
