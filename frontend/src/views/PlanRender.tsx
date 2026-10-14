import { Link } from "react-router-dom";
import { usePlanRenderViewModel } from "../viewmodels/usePlanRenderViewModel";
import { PlanRenderMount } from "../components/PlanRenderMount";

/** Plan · Render (design.md): the REF-Plan render, read-only. Nothing on
 * this screen writes - every edit is reached from Plan · Setup or from a
 * row the renderer opens. Export downloads the standalone HTML; Edit
 * plan opens Plan · Setup.
 */
export function PlanRender() {
    const vm = usePlanRenderViewModel();

    if (vm.error) {
        return (
            <p role="alert" style={{ color: "hsl(var(--destructive))" }}>
                {vm.error}
            </p>
        );
    }

    return (
        <section>
            <div className="plan-actions">
                <Link className="btn" to="/">
                    Back to plans
                </Link>
                <span style={{ flex: 1 }} />
                <Link className="btn" to={`/plans/${encodeURIComponent(vm.planId)}/versions`}>
                    Versions
                </Link>
                <Link className="btn" to={`/plans/${encodeURIComponent(vm.planId)}/edit`}>
                    Edit plan
                </Link>
                <a className="btn btn-primary" href={vm.exportUrl} download>
                    Export
                </a>
            </div>
            {vm.dataset ? <PlanRenderMount dataset={vm.dataset} /> : <p>Loading...</p>}
        </section>
    );
}
