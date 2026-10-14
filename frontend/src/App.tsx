import { Link, Route, Routes } from "react-router-dom";
import { PlansTable } from "./views/PlansTable";
import { PlanRender } from "./views/PlanRender";
import { PlanSetup } from "./views/PlanSetup";
import { ItemEdit } from "./views/ItemEdit";
import { VersionsPicker } from "./views/VersionsPicker";
import { ConnectAgent } from "./views/ConnectAgent";
import { Appearance } from "./Appearance";

// The one mark: the lockup as live text (speechmark, words, flag). Static markup, no user input.
const LOCKUP = "<div class=\"lockup\"><svg class=\"lockup-tile\" viewBox=\"0 0 120 120\" aria-hidden=\"true\"><path fill=\"#E60000\" d=\"M113.415 33.2927C107.561 21.2195 97.6829 11.7073 85.2439 5.85366C74.2683 8.04878 65.8536 18.2927 65.8536 29.6341C65.8536 30 65.8536 30.3659 65.8536 30.7317C84.1463 35.122 92.561 46.0976 92.561 61.4634C92.561 76.8293 80.4878 93.2927 60.3658 93.2927C43.9024 93.2927 26.7073 79.3902 26.7073 56.7073C26.7073 41.7073 34.7561 27.439 45 19.0244C54.878 10.6098 68.7805 5.4878 81.2195 5.4878C82.6829 5.4878 84.5122 5.4878 85.6097 5.85366C77.9268 2.19512 69.1463 0 60 0C46.0975 0 33.2927 4.7561 23.0488 12.8049C9.14634 23.7805 0 40.6098 0 60C0 92.9268 26.7073 120 60 120C93.2927 120 120 93.2927 120 60C119.634 50.122 117.439 41.3415 113.415 33.2927Z\"/><path fill=\"#FFFFFF\" d=\"M85.6097 5.4878C84.5121 5.12195 83.0487 5.12195 81.2195 5.12195C68.7805 5.12195 54.878 10.6098 45 18.6585C34.7561 27.0732 26.7073 41.7073 26.7073 56.3414C26.7073 79.0244 43.9024 92.9268 60.3658 92.9268C80.8536 92.9268 92.5609 76.0975 92.5609 61.0975C92.5609 45.7317 84.1463 34.7561 65.8536 30.3658C65.8536 30 65.8536 29.6341 65.8536 29.2683C65.8536 17.9268 74.6341 8.04878 85.6097 5.4878Z\"/></svg><span class=\"lockup-words\"><b>Digital Engineering</b><i>Vodafone Portugal</i></span><svg class=\"lockup-flag\" viewBox=\"0 0 28 19\" aria-hidden=\"true\"><defs><clipPath id=\"lockup-flag-clip\"><rect x=\"0\" y=\"0\" width=\"28\" height=\"19\" rx=\"3\"/></clipPath></defs><g clip-path=\"url(#lockup-flag-clip)\"><rect width=\"11.8\" height=\"19\" fill=\"#036A3A\"/><rect x=\"11.8\" width=\"16.2\" height=\"19\" fill=\"#DA020E\"/></g><g transform=\"translate(11.8,9.5)\"><circle r=\"5.7\" fill=\"#ffe14d\" fill-opacity=\"0.18\" stroke=\"#ffcf1f\" stroke-width=\"0.9\"/><ellipse rx=\"5.7\" ry=\"2.39\" fill=\"none\" stroke=\"#ffcf1f\" stroke-width=\"0.7\"/><ellipse rx=\"2.39\" ry=\"5.7\" fill=\"none\" stroke=\"#ffcf1f\" stroke-width=\"0.7\"/><rect x=\"-2.3\" y=\"-3.1\" width=\"4.6\" height=\"5.6\" rx=\"0.6\" fill=\"#DA020E\" stroke=\"#fff\" stroke-width=\"0.6\"/><rect x=\"-1.3\" y=\"-2\" width=\"2.6\" height=\"3.2\" rx=\"0.4\" fill=\"#fff\"/></g></svg></div>";

export function App() {
    return (
        <div className="app-shell">
            <header className="app-band">
                <Link to="/" aria-label="Vodafone Plans">
                    <span className="vfd-lockup" dangerouslySetInnerHTML={{ __html: LOCKUP }} /><span className="app-product">Plans</span>
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
