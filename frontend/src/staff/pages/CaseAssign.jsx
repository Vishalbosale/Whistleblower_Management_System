import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../lib/api";

const CaseAssign = () => {
    const { id } = useParams();
    const navigate = useNavigate();

    const [officers, setOfficers] = useState([]);
    const [caseNo, setCaseNo] = useState("");
    const [form, setForm] = useState({
        investigationOfficerId: "",
        reviewerId: "",
        escalationOwnerId: "",
        investigationDueDate: "",
        remarks: ""
    });
    const [error, setError] = useState("");
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        // Only Investigation Unit members may hold a case — offering anyone else
        // would produce a 400 from the server and, worse, imply the identity
        // firewall could be sidestepped by assigning outside the unit.
        api.get("/users?group=IU&activeOnly=1", { auth: true }).then(setOfficers).catch(() => {});
        api.get(`/cases/${id}`, { auth: true })
            .then((data) => setCaseNo(data.case.case_no))
            .catch(() => {});
    }, [id]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setForm((f) => ({ ...f, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");
        setSubmitting(true);

        try {
            await api.patch(
                `/cases/${id}/assign`,
                {
                    investigationOfficerId: Number(form.investigationOfficerId),
                    reviewerId: form.reviewerId ? Number(form.reviewerId) : null,
                    escalationOwnerId: Number(form.escalationOwnerId),
                    investigationDueDate: form.investigationDueDate || null,
                    remarks: form.remarks || null
                },
                { auth: true }
            );

            navigate(`/staff/cases/${id}`);
        } catch (err) {
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div>
            <div className="staff-page-header">
                <h1>Assign Case{caseNo ? ` — ${caseNo}` : ""}</h1>
            </div>

            {error && <div className="staff-error">{error}</div>}

            <form className="staff-card" onSubmit={handleSubmit}>
                <div className="staff-form-grid">
                    <div className="staff-form-group">
                        <label>Investigation Officer *</label>
                        <select name="investigationOfficerId" value={form.investigationOfficerId} onChange={handleChange} required>
                            <option value="">Select</option>
                            {officers.map((o) => (
                                <option key={o.id} value={o.id}>{o.fullName} ({o.username})</option>
                            ))}
                        </select>
                    </div>

                    <div className="staff-form-group">
                        <label>Reviewer</label>
                        <select name="reviewerId" value={form.reviewerId} onChange={handleChange}>
                            <option value="">Select</option>
                            {officers.map((o) => (
                                <option key={o.id} value={o.id}>{o.fullName} ({o.username})</option>
                            ))}
                        </select>
                    </div>

                    <div className="staff-form-group">
                        <label>Escalation Owner *</label>
                        <select name="escalationOwnerId" value={form.escalationOwnerId} onChange={handleChange} required>
                            <option value="">Select</option>
                            {officers.map((o) => (
                                <option key={o.id} value={o.id}>{o.fullName} ({o.username})</option>
                            ))}
                        </select>
                    </div>

                    <div className="staff-form-group">
                        <label>Investigation Due Date</label>
                        <input
                            type="date"
                            name="investigationDueDate"
                            value={form.investigationDueDate}
                            onChange={handleChange}
                        />
                    </div>

                    <div className="staff-form-group full-width">
                        <label>Assignment Remarks</label>
                        <textarea name="remarks" rows="4" value={form.remarks} onChange={handleChange} />
                    </div>
                </div>

                <div className="staff-actions-row">
                    <button type="submit" className="staff-btn staff-btn-primary" disabled={submitting}>
                        {submitting ? "Assigning..." : "Assign Case"}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default CaseAssign;
