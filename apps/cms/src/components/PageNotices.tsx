import React from "react";

import PageLiveUrl from "./PageLiveUrl";
import RevalidationStatus from "./RevalidationStatus";

/**
 * 022-ux-improvement — the page's live address and the « save = republish »
 * note, at the top of the form. They used to sit in the sticky Save bar
 * (`beforeDocumentControls`), whose fixed height on screens under 1024 px
 * let them spill over the tabs and the title.
 */
const PageNotices = ({ i18n }: { i18n?: { language?: string } }) => (
  <div className="trefle-page-notices">
    <PageLiveUrl />
    <RevalidationStatus lang={i18n?.language} />
  </div>
);

export default PageNotices;
