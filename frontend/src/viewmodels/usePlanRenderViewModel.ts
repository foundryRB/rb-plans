import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, PlanDataset } from "../api/client";

export function usePlanRenderViewModel() {
    const { planId } = useParams<{ planId: string }>();
    const [dataset, setDataset] = useState<PlanDataset | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!planId) return;
        setDataset(null);
        api.getPlan(planId).then(setDataset).catch((e) => setError(String(e.message || e)));
    }, [planId]);

    return {
        planId: planId!,
        dataset,
        error,
        exportUrl: planId ? api.exportUrl(planId) : "",
    };
}
