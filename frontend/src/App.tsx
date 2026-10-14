import { Link, Route, Routes } from "react-router-dom";
import { PlansTable } from "./views/PlansTable";
import { PlanRender } from "./views/PlanRender";
import { PlanSetup } from "./views/PlanSetup";
import { ItemEdit } from "./views/ItemEdit";
import { VersionsPicker } from "./views/VersionsPicker";
import { ConnectAgent } from "./views/ConnectAgent";
import { Appearance } from "./Appearance";

// The one mark: the lockup as live text (the RB tile and the words). Static markup, no user input.
const LOCKUP = "<div class=\"lockup\"><svg class=\"lockup-tile\" viewBox=\"0 0 120 120\" aria-hidden=\"true\"><rect x=\"6\" y=\"6\" width=\"108\" height=\"108\" rx=\"18\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"8\"/><text x=\"60\" y=\"77\" text-anchor=\"middle\" font-family=\"system-ui,-apple-system,Segoe UI,sans-serif\" font-size=\"48\" font-weight=\"800\" fill=\"currentColor\">RB</text></svg><span class=\"lockup-words\"><b>Software Engineering</b><i>RB</i></span></div>";

export function App() {
    return (
        <div className="app-shell">
            <header className="app-band">
                <Link to="/" aria-label="RB Plans">
                    <span className="rb-lockup" dangerouslySetInnerHTML={{ __html: LOCKUP }} /><span className="app-product">Plans</span>
                </Link>
                <span style={{ flex: 1 }} />
                <ConnectAgent />
                <Appearance />
            </header>
            <main className="app-main">
                <Routes>
                    <Route path="/" element={<PlansTable />} />
                    <Route path="/plans/new" element={<PlanSetup mode="create" />} />
                    <Route path="/plans/:planId" element={<PlanRender />} />
                    <Route path="/plans/:planId/edit" element={<PlanSetup mode="edit" />} />
                    <Route path="/plans/:planId/versions" element={<VersionsPicker />} />
                    <Route path="/plans/:planId/items/:itemId" element={<ItemEdit mode="edit" />} />
                    <Route path="/plans/:planId/new-item/:itemType" element={<ItemEdit mode="create" />} />
                </Routes>
            </main>
        </div>
    );
}
