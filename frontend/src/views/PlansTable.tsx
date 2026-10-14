import { useRef } from "react";
import { usePlansListViewModel } from "../viewmodels/usePlansListViewModel";

/** Plans · Table (design.md "Interaction model"): the approved layout. A
 * row is clickable in full and opens that plan; the trailing Open button
 * is the same act made visible for keyboard and touch. No data access
 * and no plan-domain logic lives here - everything routes through the
 * view model (STD-002).
 */
export function PlansTable() {
    const vm = usePlansListViewModel();
    const fileInput = useRef<HTMLInputElement>(null);

    return (
        <section className="plans-panel">
            <h1>Plans</h1>
            <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap", alignItems: "center" }}>
                <input
                    aria-label="Search plans"
                    placeholder="Search plans..."
                    value={vm.query}
                    onChange={(e) => vm.setQuery(e.target.value)}
                    style={{ padding: "0.4rem 0.6rem", border: "1px solid hsl(var(--input))", borderRadius: "var(--radius)" }}
                />
                <select aria-label="Sort by" value={vm.sort} onChange={(e) => vm.setSort(e.target.value as never)}>
                    <option value="updated">Recently updated</option>
                    <option value="name">Name</option>
                    <option value="milestone">Next milestone</option>
                </select>
                <span style={{ flex: 1 }} />
                <button className="btn btn-primary" onClick={vm.createPlan}>
                    New plan
                </button>
                <button className="btn" onClick={() => fileInput.current?.click()}>
                    Import plan
                </button>
                <input
                    ref={fileInput}
                    type="file"
                    accept=".html"
                    hidden
                    onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) vm.importPlan(file);
                        e.target.value = "";
                    }}
                />
            </div>
            {vm.importError && (
                <p role="alert" style={{ color: "hsl(var(--destructive))" }}>
                    Import refused: {vm.importError}
                </p>
            )}
            {vm.error && (
                <p role="alert" style={{ color: "hsl(var(--destructive))" }}>
                    {vm.error}
                </p>
            )}
            {vm.loading ? (
                <p>Loading...</p>
            ) : vm.plans.length === 0 ? (
                <p>No plans yet. Use "New plan" or "Import plan" to create the first one.</p>
            ) : (
                <table className="chrome-table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Updated</th>
                            <th>Next milestone</th>
                            <th />
                        </tr>
                    </thead>
                    <tbody>
                        {vm.plans.map((p) => (
                            <tr
                                key={p.id}
                                className="row-link"
                                tabIndex={0}
                                onClick={() => vm.openPlan(p.id)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") vm.openPlan(p.id);
                                }}
                            >
                                <td>{p.title}</td>
                                <td className="mono">{new Date(p.updated).toLocaleDateString()}</td>
                                <td>{p.next_milestone || "–"}</td>
                                <td>
                                    <button
                                        className="btn"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            vm.openPlan(p.id);
                                        }}
                                    >
                                        Open
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </section>
    );
}
