import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, PlanDataset } from "../api/client";

const CLASSIFICATIONS = ["internal", "confidential", "public"];

export type Lane = { id: string; name: string };

export function usePlanSetupViewModel(mode: "create" | "edit") {
    const { planId: routePlanId } = useParams<{ planId: string }>();
    const navigate = useNavigate();

    const [original, setOriginal] = useState<PlanDataset | null>(null);
    const [id, setId] = useState("");
    const [title, setTitle] = useState("");
    const [eyebrow, setEyebrow] = useState("");
    const [lede, setLede] = useState("");
    const [focus, setFocus] = useState("");
    const [anchor, setAnchor] = useState("");
    const [horizonStart, setHorizonStart] = useState("");
    const [horizonEnd, setHorizonEnd] = useState("");
    const [classification, setClassification] = useState("internal");
    const [sources, setSources] = useState<string[]>([]);
    const [lanes, setLanes] = useState<Lane[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (mode === "edit" && routePlanId) {
            api.getPlan(routePlanId).then((dataset) => {
                setOriginal(dataset);
                const meta = dataset.meta as Record<string, string> & { horizon?: [string, string] };
                setId(meta.id);
                setTitle(meta.title || "");
                setEyebrow(meta.eyebrow || "");
                setLede(meta.lede || "");
                setFocus(meta.focus || "");
                setAnchor(meta.anchor || "");
                setHorizonStart(meta.horizon?.[0] || "");
                setHorizonEnd(meta.horizon?.[1] || "");
                setClassification(meta.classification || "internal");
                setSources((dataset.meta.sources as string[]) || []);
                setLanes(dataset.lanes);
            });
        }
    }, [mode, routePlanId]);

    const pendingChanges: string[] = [];
    if (original) {
        const om = original.meta as Record<string, unknown>;
        if (om.title !== title) pendingChanges.push(`title -> "${title}"`);
        if (om.eyebrow !== eyebrow) pendingChanges.push(`eyebrow -> "${eyebrow}"`);
        if (om.lede !== lede) pendingChanges.push(`lede -> "${lede}"`);
        if (om.focus !== focus) pendingChanges.push(`focus -> "${focus}"`);
        if (om.anchor !== anchor) pendingChanges.push(`anchor -> ${anchor}`);
        const oh = (om.horizon as [string, string]) || ["", ""];
        if (oh[0] !== horizonStart || oh[1] !== horizonEnd) pendingChanges.push(`horizon -> ${horizonStart}..${horizonEnd}`);
        if (om.classification !== classification) pendingChanges.push(`classification -> ${classification}`);
        if (JSON.stringify(original.lanes) !== JSON.stringify(lanes)) pendingChanges.push("lanes reordered/edited");
    }

    const addSource = (s: string) => s && setSources((prev) => [...prev, s]);
    const removeSource = (i: number) => setSources((prev) => prev.filter((_, idx) => idx !== i));

    const addLane = () => setLanes((prev) => [...prev, { id: `lane-${prev.length + 1}`, name: "New lane" }]);
    const removeLane = (i: number) => setLanes((prev) => prev.filter((_, idx) => idx !== i));
    const renameLane = (i: number, name: string) =>
        setLanes((prev) => prev.map((l, idx) => (idx === i ? { ...l, name } : l)));
    const moveLane = (i: number, dir: -1 | 1) =>
        setLanes((prev) => {
            const next = [...prev];
            const j = i + dir;
            if (j < 0 || j >= next.length) return prev;
            [next[i], next[j]] = [next[j], next[i]];
            return next;
        });

    const save = async () => {
        setError(null);
        setSaving(true);
        try {
            const meta = {
                title,
                eyebrow,
                lede,
                focus,
                anchor,
                horizon: [horizonStart, horizonEnd],
                classification,
                sources,
            };
            if (mode === "create") {
                const created = await api.createPlan({ meta: { id, ...meta }, lanes });
                navigate(`/plans/${encodeURIComponent(created.meta.id)}`);
            } else if (routePlanId) {
                const updated = await api.patchMeta(routePlanId, { meta, lanes });
                navigate(`/plans/${encodeURIComponent(updated.meta.id)}`);
            }
        } catch (e) {
            setError(String((e as Error).message || e));
        } finally {
            setSaving(false);
        }
    };

    return {
        mode,
        planId: routePlanId,
        id,
        setId,
        title,
        setTitle,
        eyebrow,
        setEyebrow,
        lede,
        setLede,
        focus,
        setFocus,
        anchor,
        setAnchor,
        horizonStart,
        setHorizonStart,
        horizonEnd,
        setHorizonEnd,
        classification,
        setClassification,
        classifications: CLASSIFICATIONS,
        sources,
        addSource,
        removeSource,
        lanes,
        addLane,
        removeLane,
        renameLane,
        moveLane,
        original,
        contents: original
            ? {
                  dependency: original.items.filter((i) => i.type === "dependency"),
                  assumption: original.items.filter((i) => i.type === "assumption"),
                  risk: original.items.filter((i) => i.type === "risk"),
                  milestone: original.items.filter((i) => i.type === "milestone"),
                  track: original.items.filter((i) => i.type === "track"),
                  gate: original.gates,
              }
            : null,
        pendingChanges,
        version: original?.meta.version as string | undefined,
        error,
        saving,
        save,
    };
}
