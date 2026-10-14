import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, VersionInfo } from "../api/client";

export function useVersionsPickerViewModel() {
    const { planId } = useParams<{ planId: string }>();
    const [versions, setVersions] = useState<VersionInfo[]>([]);
    const [selected, setSelected] = useState<number | null>(null);
    const [diff, setDiff] = useState<Array<{ date: string; text: string; who: string; refs?: string[] }>>([]);

    useEffect(() => {
        if (!planId) return;
        api.listVersions(planId).then((vs) => {
            setVersions(vs);
            if (vs.length) setSelected(vs[vs.length - 1].version);
        });
    }, [planId]);

    useEffect(() => {
        if (!planId || selected === null) return;
        const idx = versions.findIndex((v) => v.version === selected);
        const previous = idx > 0 ? versions[idx - 1].version : selected;
        if (previous === selected) {
            setDiff([]);
            return;
        }
        api.diff(planId, previous, selected).then((d) => setDiff(d.log));
    }, [planId, selected, versions]);

    return {
        planId,
        versions,
        selected,
        setSelected,
        diff,
        exportUrl: (v: number) => (planId ? api.exportUrl(planId, v) : ""),
    };
}
