import { useItemEditViewModel } from "../viewmodels/useItemEditViewModel";

const STATUS_LABEL: Record<string, string> = { ok: "Decided", wait: "Open", block: "Blocked", descoped: "Descoped", superseded: "Superseded" };
const PRIORITY_LABEL: Record<string, string> = { blocker: "Blocker", high: "High", medium: "Medium", low: "Low", optional: "Optional" };

/** Item · Edit (design.md): forms per item type, reached from Plan ·
 * Setup's Add control or from a row on the render. Fields are exactly
 * the REF-Plan section 3 item fields for that type - the engine adds
 * none of its own.
 */
export function ItemEdit({ mode }: { mode: "create" | "edit" }) {
    const vm = useItemEditViewModel(mode);
    const f = vm.fields;

    if (!vm.dataset) return <p>Loading...</p>;

    const laneOptions = vm.dataset.lanes;
    const sameTypeIds = vm.dataset.items.filter((i) => i.type === f.type && i.id !== f.id).map((i) => i.id as string);

    return (
        <section>
            <h1>
                {mode === "create" ? `New ${vm.kind}` : `Edit ${(f.name as string) || f.id}`}
            </h1>
            {vm.error && (
                <p role="alert" style={{ color: "hsl(var(--destructive))" }}>
                    {vm.error}
                </p>
            )}

            <div className="field">
                <label htmlFor="item-name">Name</label>
                <input id="item-name" value={(f.name as string) || ""} onChange={(e) => vm.set("name", e.target.value)} required />
            </div>

            {(vm.kind === "milestone" || vm.kind === "gate") && (
                <div className="field">
                    <label htmlFor="item-short">Short (for calendars/charts, max 20 chars)</label>
                    <input id="item-short" maxLength={20} value={(f.short as string) || ""} onChange={(e) => vm.set("short", e.target.value)} />
                </div>
            )}

            {vm.kind !== "gate" && (
                <div className="field">
                    <label htmlFor="item-body">Body</label>
                    <textarea id="item-body" value={(f.body as string) || ""} onChange={(e) => vm.set("body", e.target.value)} rows={3} />
                </div>
            )}

            {vm.kind === "gate" ? (
                <>
                    <div className="field">
                        <label htmlFor="gate-evidence">Evidence (what closes it, never a date)</label>
                        <input id="gate-evidence" value={(f.evidence as string) || ""} onChange={(e) => vm.set("evidence", e.target.value)} />
                    </div>
                    <div className="field">
                        <label htmlFor="gate-closer">Closer</label>
                        <input id="gate-closer" value={(f.closer as string) || ""} onChange={(e) => vm.set("closer", e.target.value)} />
                    </div>
                    <div className="field">
                        <label htmlFor="gate-due">Due date</label>
                        <input id="gate-due" type="date" value={(f.due as string) || ""} onChange={(e) => vm.set("due", e.target.value)} />
                    </div>
                </>
            ) : (
                <>
                    <div className="field">
                        <label htmlFor="item-note">Note</label>
                        <input id="item-note" value={(f.note as string) || ""} onChange={(e) => vm.set("note", e.target.value)} />
                    </div>
                    <div className="field">
                        <label htmlFor="item-owner">Owner</label>
                        <input id="item-owner" value={(f.owner as string) || ""} onChange={(e) => vm.set("owner", e.target.value)} />
                    </div>
                    <div className="field">
                        <label htmlFor="item-lane">Lane</label>
                        <select id="item-lane" value={(f.lane as string) || ""} onChange={(e) => vm.set("lane", e.target.value)}>
                            <option value="">None</option>
                            {laneOptions.map((l) => (
                                <option key={l.id} value={l.id}>
                                    {l.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <fieldset className="field">
                        <legend>Status</legend>
                        <div role="radiogroup" aria-label="Status" style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                            {vm.statuses.map((s) => (
                                <button
                                    key={s}
                                    role="radio"
                                    aria-checked={f.status === s}
                                    className="chip"
                                    style={f.status === s ? { background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" } : undefined}
                                    onClick={() => vm.set("status", s)}
                                    type="button"
                                >
                                    {STATUS_LABEL[s]}
                                </button>
                            ))}
                        </div>
                    </fieldset>

                    {vm.kind === "dependency" && (
                        <fieldset className="field">
                            <legend>Priority</legend>
                            <div role="radiogroup" aria-label="Priority" style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                                {vm.priorities.map((p) => (
                                    <button
                                        key={p}
                                        role="radio"
                                        aria-checked={f.priority === p}
                                        className="chip"
                                        style={
                                            p === "blocker"
                                                ? f.priority === p
                                                    ? { background: "hsl(var(--foreground))", color: "hsl(var(--background))" }
                                                    : { borderColor: "hsl(var(--foreground))" }
                                                : f.priority === p
                                                  ? { background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }
                                                  : undefined
                                        }
                                        onClick={() => vm.set("priority", p)}
                                        type="button"
                                    >
                                        {PRIORITY_LABEL[p]}
                                    </button>
                                ))}
                            </div>
                        </fieldset>
                    )}

                    <div className="field">
                        <label htmlFor="item-when">When (display text, e.g. "by 2030-01-15")</label>
                        <input id="item-when" value={(f.when as string) || ""} onChange={(e) => vm.set("when", e.target.value)} />
                    </div>
                    <div className="field">
                        <label htmlFor="item-due">Due (ISO date)</label>
                        <input id="item-due" type="date" value={(f.due as string) || ""} onChange={(e) => vm.set("due", e.target.value)} />
                    </div>
                    {vm.kind === "track" && (
                        <div style={{ display: "flex", gap: "1rem" }}>
                            <div className="field">
                                <label htmlFor="item-start">Start</label>
                                <input id="item-start" type="date" value={(f.start as string) || ""} onChange={(e) => vm.set("start", e.target.value)} />
                            </div>
                            <div className="field">
                                <label htmlFor="item-end">End</label>
                                <input id="item-end" type="date" value={(f.end as string) || ""} onChange={(e) => vm.set("end", e.target.value)} />
                            </div>
                        </div>
                    )}
                    {vm.kind === "track" && (
                        <div className="field">
                            <label htmlFor="item-cause">Cause (the gate miss or decision that spawned this track)</label>
                            <input id="item-cause" value={(f.cause as string) || ""} onChange={(e) => vm.set("cause", e.target.value)} />
                        </div>
                    )}

                    <div className="field">
                        <label htmlFor="item-parent">Parent</label>
                        <select id="item-parent" value={(f.parent as string) || ""} onChange={(e) => vm.set("parent", e.target.value || undefined)}>
                            <option value="">None</option>
                            {sameTypeIds.map((id) => (
                                <option key={id} value={id}>
                                    {id}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="field">
                        <label>
                            <input
                                type="checkbox"
                                checked={Boolean(f.critical)}
                                onChange={(e) => vm.set("critical", e.target.checked)}
                            />{" "}
                            Critical path
                        </label>
                    </div>
                </>
            )}

            <div style={{ display: "flex", gap: "0.5rem", margin: "1rem 0" }}>
                <button className="btn btn-primary" onClick={vm.save} disabled={vm.saving || !f.name}>
                    {vm.saving ? "Saving..." : mode === "create" ? `Save as next version` : "Save"}
                </button>
            </div>

            {mode === "edit" && vm.kind !== "gate" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem", marginTop: "2rem" }}>
                    <div>
                        <h2>Decision</h2>
                        {typeof f.decision === "object" && f.decision && (
                            <p className="mono">
                                {(f.decision as { date: string }).date} - {(f.decision as { who: string }).who}:{" "}
                                {(f.decision as { text: string }).text}
                            </p>
                        )}
                        <div className="field">
                            <label htmlFor="decision-who">Who (editable; pre-filled from the edge when it supplies a name)</label>
                            <input id="decision-who" value={vm.who} onChange={(e) => vm.setWho(e.target.value)} list="known-people" />
                        </div>
                        <div className="field">
                            <label htmlFor="decision-text">Decision</label>
                            <textarea id="decision-text" value={vm.decisionText} onChange={(e) => vm.setDecisionText(e.target.value)} rows={2} />
                        </div>
                        <button className="btn" onClick={vm.recordDecision} disabled={!vm.decisionText}>
                            Record a decision
                        </button>
                    </div>

                    <div>
                        <h2>Append log row</h2>
                        <div className="field">
                            <label htmlFor="log-text">Log text</label>
                            <textarea id="log-text" value={vm.logText} onChange={(e) => vm.setLogText(e.target.value)} rows={2} />
                        </div>
                        <button className="btn" onClick={vm.appendLog} disabled={!vm.logText}>
                            Append log row
                        </button>
                    </div>

                    <div>
                        <h2>Re-anchor plan dates</h2>
                        <p style={{ fontSize: "0.85rem", color: "hsl(var(--muted-foreground))" }}>
                            Shifts every dependent date in the whole plan by this many days.
                        </p>
                        <div className="field">
                            <label htmlFor="reanchor-days">Shift by (days)</label>
                            <input
                                id="reanchor-days"
                                type="number"
                                value={vm.reanchorDays}
                                onChange={(e) => vm.setReanchorDays(Number(e.target.value))}
                            />
                        </div>
                        <button className="btn" onClick={vm.reanchor} disabled={!vm.reanchorDays}>
                            Re-anchor dates
                        </button>
                    </div>
                </div>
            )}
        </section>
    );
}
