import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, PlanSummary } from "../api/client";

export type SortKey = "updated" | "name" | "milestone";

export function usePlansListViewModel() {
    const [plans, setPlans] = useState<PlanSummary[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [query, setQuery] = useState("");
    const [sort, setSort] = useState<SortKey>("updated");
    const [importError, setImportError] = useState<string | null>(null);
    const navigate = useNavigate();

    const load = () => {
        api.listPlans().then(setPlans).catch((e) => setError(String(e.message || e)));
    };

    useEffect(load, []);

    const visible = useMemo(() => {
        const rows = (plans || []).filter((p) => p.title.toLowerCase().includes(query.toLowerCase()));
        const sorted = [...rows];
        if (sort === "name") sorted.sort((a, b) => a.title.localeCompare(b.title));
        else if (sort === "milestone") sorted.sort((a, b) => (a.next_milestone || "").localeCompare(b.next_milestone || ""));
        else sorted.sort((a, b) => (a.updated < b.updated ? 1 : -1));
        return sorted;
    }, [plans, query, sort]);

    const openPlan = (planId: string) => navigate(`/plans/${encodeURIComponent(planId)}`);
    const createPlan = () => navigate("/plans/new");

    const importPlan = async (file: File) => {
        setImportError(null);
        try {
            const dataset = await api.importPlan(file);
            navigate(`/plans/${encodeURIComponent(dataset.meta.id)}`);
        } catch (e) {
            setImportError(String((e as Error).message || e));
        }
    };

    return { plans: visible, loading: plans === null, error, query, setQuery, sort, setSort, openPlan, createPlan, importPlan, importError };
}
