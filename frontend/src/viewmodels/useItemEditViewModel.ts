import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, PlanDataset } from "../api/client";

const STATUSES = ["ok", "wait", "block", "descoped", "superseded"] as const;
const PRIORITIES = ["blocker", "high", "medium", "low", "optional"] as const;

export type ItemKind = "dependency" | "assumption" | "risk" | "milestone" | "track" | "gate";

/** The edge-forwarded display name, when the edge supplies one - the
 * pre-fill for the decision/log "who" field (DSN-008). No session lives
 * here: this is a courtesy default the human can always overwrite.
 */
function forwardedDisplayName(): string {
    const meta = document.querySelector('meta[name="x-forwarded-user"]');
    return meta?.getAttribute("content") || "";
}

export function useItemEditViewModel(mode: "create" | "edit") {
    const { planId, itemId, itemType } = useParams<{ planId: string; itemId?: string; itemType?: string }>();
    const navigate = useNavigate();

    const [dataset, setDataset] = useState<PlanDataset | null>(null);
    const [fields, setFields] = useState<Record<string, unknown>>({});
    // create mode knows its kind from the route (new-item/:itemType); edit
    // mode does NOT - the route only carries the item's id, so the kind is
    // read off the loaded item itself (its own `type`, or gate-ness) once
    // the plan is fetched. Defaulting this to "dependency" was a real bug:
    // every edited item rendered the dependency form regardless of its
    // actual type until the fetch resolved and corrected it.
    const [kind, setKind] = useState<ItemKind>((itemType as ItemKind) || "dependency");
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [who, setWho] = useState(forwardedDisplayName());
    const [decisionText, setDecisionText] = useState("");
    const [logText, setLogText] = useState("");
    const [reanchorDays, setReanchorDays] = useState(0);

    // Guards against a real race: the dataset fetch below is async, and
    // without this, its resolution would overwrite `fields` even after
    // the person has already started typing into the form - a slow
    // network turns every keystroke made before the response lands into
    // one silently discarded. `fields` is seeded from the loaded item (or
    // the create-mode skeleton) exactly ONCE per navigation to a given
    // item; every fetch after that only refreshes `dataset` (used for
    // lane options and the Parent dropdown), never `fields` again.
    const fieldsSeededFor = useRef<string | null>(null);

    useEffect(() => {
        if (!planId) return;
        const identity = `${planId}:${itemId ?? ""}:${mode}:${itemType ?? ""}`;
        api.getPlan(planId).then((d) => {
            setDataset(d);
            if (fieldsSeededFor.current === identity) return;
            fieldsSeededFor.current = identity;
            if (mode === "edit" && itemId) {
                const gate = d.gates.find((g) => g.id === itemId);
                if (gate) {
                    setKind("gate");
                    setFields(gate);
                    return;
                }
                const item = d.items.find((i) => i.id === itemId);
                if (item) {
                    setKind(item.type as ItemKind);
                    setFields(item);
                    return;
                }
                setFields({});
            } else {
                const createKind = (itemType as ItemKind) || "dependency";
                setKind(createKind);
                setFields({ type: createKind });
            }
        });
    }, [planId, itemId, mode, itemType]);

    const set = (key: string, value: unknown) => setFields((prev) => ({ ...prev, [key]: value }));

    const save = async () => {
        if (!planId) return;
        setError(null);
        setSaving(true);
        try {
            if (kind === "gate") {
                const patch = { gates: [...(dataset?.gates || []).filter((g) => g.id !== fields.id), fields].filter((g) => g.id) };
                const updated = await api.patchMeta(planId, patch as never);
                navigate(`/plans/${encodeURIComponent(planId)}/edit`);
                void updated;
            } else {
                const updated = await api.upsertItem(planId, fields);
                navigate(`/plans/${encodeURIComponent(planId)}`);
                void updated;
            }
        } catch (e) {
            setError(String((e as Error).message || e));
        } finally {
            setSaving(false);
        }
    };

    const recordDecision = async () => {
        if (!planId || !itemId || !decisionText) return;
        await api.recordDecision(planId, itemId, who || "Unknown", decisionText);
        setDecisionText("");
        const refreshed = await api.getPlan(planId);
        setDataset(refreshed);
        setFields(refreshed.items.find((i) => i.id === itemId) || {});
    };

    const appendLog = async () => {
        if (!planId || !logText) return;
        await api.appendLog(planId, who || "Unknown", logText, itemId ? [itemId] : undefined);
        setLogText("");
    };

    const reanchor = async () => {
        if (!planId || !reanchorDays) return;
        await api.reanchor(planId, reanchorDays, who || "Unknown");
        setReanchorDays(0);
        const refreshed = await api.getPlan(planId);
        setDataset(refreshed);
        // Every dependent date moved, including the one this form is
        // showing right now (INT-PLANS-012) - refresh the open item's
        // own fields too, not just the background dataset, or the form
        // keeps displaying the pre-shift date until a manual reload.
        if (itemId) {
            const item = kind === "gate" ? refreshed.gates.find((g) => g.id === itemId) : refreshed.items.find((i) => i.id === itemId);
            if (item) setFields(item);
        }
    };

    return {
        kind,
        mode,
        planId,
        dataset,
        fields,
        set,
        error,
        saving,
        save,
        who,
        setWho,
        decisionText,
        setDecisionText,
        recordDecision,
        logText,
        setLogText,
        appendLog,
        reanchorDays,
        setReanchorDays,
        reanchor,
        statuses: STATUSES,
        priorities: PRIORITIES,
    };
}
