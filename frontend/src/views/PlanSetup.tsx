import { useState } from "react";
import { Link } from "react-router-dom";
import { usePlanSetupViewModel } from "../viewmodels/usePlanSetupViewModel";

const CONTENT_TYPES: Array<{ key: "dependency" | "assumption" | "risk" | "milestone" | "track"; label: string }> = [
    { key: "dependency", label: "Dependencies" },
    { key: "assumption", label: "Assumptions" },
    { key: "risk", label: "Risks" },
    { key: "milestone", label: "Milestones" },
    { key: "track", label: "Workstreams" },
];

/** Plan · Setup (design.md): the plan's own surface, and the one a plan
 * is CREATED on. Three sections - Plan, Lanes, Contents - plus the
 * pending-changes rail Item · Edit also carries.
 */
export function PlanSetup({ mode }: { mode: "create" | "edit" }) {
    const vm = usePlanSetupViewModel(mode);
    const [newSource, setNewSource] = useState("");

    return (
        <section>
            <h1>{mode === "create" ? "New plan" : `Edit ${vm.title || vm.id}`}</h1>
            {vm.error && (
                <p role="alert" style={{ color: "hsl(var(--destructive))" }}>
                    {vm.error}
                </p>
            )}

            <h2>Plan</h2>
            <div className="field">
                <label htmlFor="plan-id">Id</label>
                <input
                    id="plan-id"
                    value={vm.id}
                    disabled={mode === "edit"}
                    onChange={(e) => vm.setId(e.target.value)}
                    required
                />
            </div>
            <div className="field">
                <label htmlFor="plan-title">Title</label>
                <input id="plan-title" value={vm.title} onChange={(e) => vm.setTitle(e.target.value)} required />
            </div>
            <div className="field">
                <label htmlFor="plan-eyebrow">Eyebrow</label>
                <input id="plan-eyebrow" value={vm.eyebrow} onChange={(e) => vm.setEyebrow(e.target.value)} />
            </div>
            <div className="field">
                <label htmlFor="plan-lede">Lede</label>
                <input id="plan-lede" value={vm.lede} onChange={(e) => vm.setLede(e.target.value)} />
            </div>
            <div className="field">
                <label htmlFor="plan-focus">Focus</label>
                <textarea id="plan-focus" value={vm.focus} onChange={(e) => vm.setFocus(e.target.value)} rows={3} />
            </div>
            <div className="field">
                <label htmlFor="plan-anchor">Anchor date</label>
                <input id="plan-anchor" type="date" value={vm.anchor} onChange={(e) => vm.setAnchor(e.target.value)} />
            </div>
            <div style={{ display: "flex", gap: "1rem" }}>
                <div className="field">
                    <label htmlFor="plan-horizon-start">Horizon start (required)</label>
                    <input
                        id="plan-horizon-start"
                        type="date"
                        value={vm.horizonStart}
                        onChange={(e) => vm.setHorizonStart(e.target.value)}
                        required
                        aria-required="true"
                    />
                </div>
                <div className="field">
                    <label htmlFor="plan-horizon-end">Horizon end (required)</label>
                    <input
                        id="plan-horizon-end"
                        type="date"
                        value={vm.horizonEnd}
                        onChange={(e) => vm.setHorizonEnd(e.target.value)}
                        required
                        aria-required="true"
                    />
                </div>
            </div>
            <div className="field">
                <label htmlFor="plan-classification">Classification</label>
                <select id="plan-classification" value={vm.classification} onChange={(e) => vm.setClassification(e.target.value)}>
                    {vm.classifications.map((c) => (
                        <option key={c} value={c}>
                            {c}
                        </option>
                    ))}
                </select>
            </div>
            <div className="field">
                <label>Version</label>
                <input value={vm.version || "not yet saved"} disabled title="Version is written by a save, never typed" />
            </div>
            <div className="field">
                <label>Sources</label>
                <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "0.4rem" }}>
                    {vm.sources.map((s, i) => (
                        <span key={i} className="chip">
                            {s}
                            <button aria-label={`Remove source ${s}`} onClick={() => vm.removeSource(i)}>
                                &times;
                            </button>
                        </span>
                    ))}
                </div>
                <div style={{ display: "flex", gap: "0.4rem" }}>
                    <input
                        aria-label="Add source"
                        value={newSource}
                        onChange={(e) => setNewSource(e.target.value)}
                        placeholder="Add source"
                    />
                    <button
                        className="btn"
                        onClick={() => {
                            vm.addSource(newSource);
                            setNewSource("");
                        }}
                    >
                        Add
                    </button>
                </div>
            </div>

            <h2>Lanes</h2>
            <p style={{ fontSize: "0.85rem", color: "hsl(var(--muted-foreground))" }}>
                Order is the palette: moving a lane moves its colour with it.
            </p>
            <table className="chrome-table">
                <thead>
                    <tr>
                        <th>Colour</th>
                        <th>Id</th>
                        <th>Name</th>
                        <th />
                    </tr>
                </thead>
                <tbody>
                    {vm.lanes.map((lane, i) => (
                        <tr key={lane.id}>
                            <td>
                                {i < 5 ? (
                                    <span className="chip" style={{ background: `hsl(var(--lane-${i + 1}))`, color: "white" }}>
                                        &nbsp;
                                    </span>
                                ) : (
                                    <span className="chip">No lane colour</span>
                                )}
                            </td>
                            <td className="mono">{lane.id}</td>
                            <td>
                                <input value={lane.name} onChange={(e) => vm.renameLane(i, e.target.value)} aria-label={`Lane ${lane.id} name`} />
                            </td>
                            <td style={{ display: "flex", gap: "0.25rem" }}>
                                <button className="btn" onClick={() => vm.moveLane(i, -1)} aria-label={`Move ${lane.name} up`}>
                                    &uarr;
                                </button>
                                <button className="btn" onClick={() => vm.moveLane(i, 1)} aria-label={`Move ${lane.name} down`}>
                                    &darr;
                                </button>
                                <button className="btn" onClick={() => vm.removeLane(i)} aria-label={`Remove ${lane.name}`}>
                                    Remove
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <button className="btn" onClick={vm.addLane}>
                Add lane
            </button>

            {vm.contents && vm.planId && (
                <>
                    <h2>Contents</h2>
                    {CONTENT_TYPES.map(({ key, label }) => (
                        <div key={key} style={{ marginBottom: "0.75rem" }}>
                            <strong>
                                {label} ({vm.contents![key].length})
                            </strong>{" "}
                            <Link className="btn" to={`/plans/${encodeURIComponent(vm.planId!)}/new-item/${key}`}>
                                Add
                            </Link>
                            <ul>
                                {vm.contents![key].map((item) => (
                                    <li key={item.id as string}>
                                        <Link to={`/plans/${encodeURIComponent(vm.planId!)}/items/${encodeURIComponent(item.id as string)}`}>
                                            <span className="mono">{item.id as string}</span> {item.name as string}
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                    <div style={{ marginBottom: "0.75rem" }}>
                        <strong>Gates ({vm.contents.gate.length})</strong>{" "}
                        <Link className="btn" to={`/plans/${encodeURIComponent(vm.planId!)}/new-item/gate`}>
                            Add gate
                        </Link>
                        <ul>
                            {vm.contents.gate.map((gate) => (
                                <li key={gate.id as string}>
                                    <Link to={`/plans/${encodeURIComponent(vm.planId!)}/items/${encodeURIComponent(gate.id as string)}`}>
                                        <span className="mono">{gate.id as string}</span> {gate.name as string}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>
                </>
            )}

            <div className="pending-rail">
                <h3>Pending changes</h3>
                {vm.pendingChanges.length === 0 ? (
                    <p style={{ fontSize: "0.85rem", color: "hsl(var(--muted-foreground))" }}>None yet.</p>
                ) : (
                    <ul>
                        {vm.pendingChanges.map((c, i) => (
                            <li key={i}>{c}</li>
                        ))}
                    </ul>
                )}
                <button className="btn btn-primary" onClick={vm.save} disabled={vm.saving || !vm.id || !vm.title}>
                    {vm.saving ? "Saving..." : mode === "create" ? "Save as v0.1" : "Save"}
                </button>
            </div>
        </section>
    );
}
