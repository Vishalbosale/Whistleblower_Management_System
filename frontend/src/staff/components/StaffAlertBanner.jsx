import React from "react";
import Icon from "../../components/Icon/Icon";

// A deliberately louder banner than .staff-readonly-banner, reserved for "you
// have been sent a request for additional details and haven't acted on it
// yet" — the one state on a case/complaint screen that is easy to miss by
// scrolling past the card further down the page. `anchor` (an element id
// elsewhere on the same page) turns it into a jump link straight to that card.
//
// `onNavigate` is for pages where that card can be hidden behind a tab (it is
// not in the DOM until its tab is active): pass a callback that switches to
// the right tab, and the link switches first, then scrolls once the target
// has actually mounted, instead of following the plain #anchor href.
const StaffAlertBanner = ({ icon = "megaphone", children, anchor, onNavigate }) => {
    const handleClick = (e) => {
        if (!onNavigate) return;

        e.preventDefault();
        onNavigate();
        setTimeout(() => {
            document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 0);
    };

    return (
        <div className="staff-attention-banner">
            <Icon name={icon} size={17} />
            <span>{children}</span>
            {anchor && (
                <a href={`#${anchor}`} className="staff-attention-banner-link" onClick={handleClick}>
                    View details
                    <Icon name="chevronRight" size={14} />
                </a>
            )}
        </div>
    );
};

export default StaffAlertBanner;
