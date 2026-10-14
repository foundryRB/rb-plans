/**
 * The one place `fetch` is called (STD-002: views hold no data access).
 * Every view model reaches the engine only through this module, which
 * mirrors the REST door 1:1 - no client-side logic beyond shaping the
 * request/response.
 */

export interface PlanSummary {
    id: string;
    title: string;
    updated: string;
    next_milestone: string | null;
}

export interface PlanDataset {
    meta: Record<string, unknown> & { id: string; title: string; version?: string };
    lanes: Array<{ id: string; name: string }>;
    items: Array<Record<string, unknown> & { id: string; type: string }>;
    gates: Array<Record<string, unknown> & { id: string }>;
    log: Array<Record<string, unknown> & { date: string; text: string; who: string; refs?: string[] }>;
}

export interface VersionInfo {
    version: number;
    display: string | null;
    created_at: string;
    ephemeral: boolean;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(path, {
        ...init,
        headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    });
    if (!res.ok) {
        let detail: unknown;
        try {
            detail = (await res.json()).detail;
        } catch {
            detail = res.statusText;
        }
        throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
}

export const api = {
    listPlans: () => request<PlanSummary[]>("/api/plans"),

    createPlan: (dataset: { meta: Record<string, unknown>; lanes: PlanDataset["lanes"] }) =>
        request<PlanDataset>("/api/plans", {
            method: "POST",
            body: JSON.stringify({ ...dataset, items: [], gates: [], log: [] }),
        }),

    importPlan: async (file: File): Promise<PlanDataset> => {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/plans/import", { method: "POST", body: form });
        if (!res.ok) {
            const body = await res.json().catch(() => ({ detail: res.statusText }));
            throw new Error(Array.isArray(body.detail) ? body.detail.join("; ") : String(body.detail));
        }
        return res.json();
    },

    getPlan: (planId: string, version?: number) =>
        request<PlanDataset>(`/api/plans/${encodeURIComponent(planId)}${version ? `?version=${version}` : ""}`),

    listVersions: (planId: string) => request<VersionInfo[]>(`/api/plans/${encodeURIComponent(planId)}/versions`),

    diff: (planId: string, from: number, to: number) =>
        request<{ from: number; to: number; log: PlanDataset["log"] }>(
            `/api/plans/${encodeURIComponent(planId)}/diff?from=${from}&to=${to}`
        ),

    upsertItem: (planId: string, item: Record<string, unknown>) =>
        request<PlanDataset>(`/api/plans/${encodeURIComponent(planId)}/items`, {
            method: "POST",
            body: JSON.stringify(item),
        }),

    setStatus: (planId: string, itemId: string, status: string) =>
        request<PlanDataset>(`/api/plans/${encodeURIComponent(planId)}/items/${encodeURIComponent(itemId)}/status`, {
            method: "POST",
            body: JSON.stringify({ status }),
        }),

    recordDecision: (planId: string, itemId: string, who: string, text: string, date?: string) =>
        request<PlanDataset>(`/api/plans/${encodeURIComponent(planId)}/items/${encodeURIComponent(itemId)}/decision`, {
            method: "POST",
            body: JSON.stringify({ who, text, date }),
        }),

    appendLog: (planId: string, who: string, text: string, refs?: string[]) =>
        request<PlanDataset>(`/api/plans/${encodeURIComponent(planId)}/log`, {
            method: "POST",
            body: JSON.stringify({ who, text, refs }),
        }),

    reanchor: (planId: string, deltaDays: number, who: string) =>
        request<PlanDataset>(`/api/plans/${encodeURIComponent(planId)}/reanchor`, {
            method: "POST",
            body: JSON.stringify({ delta_days: deltaDays, who }),
        }),

    patchMeta: (planId: string, patch: { meta?: Record<string, unknown>; lanes?: PlanDataset["lanes"] }) =>
        request<PlanDataset>(`/api/plans/${encodeURIComponent(planId)}/meta`, {
            method: "POST",
            body: JSON.stringify(patch),
        }),

    exportUrl: (planId: string, version?: number) =>
        `/api/plans/${encodeURIComponent(planId)}/export${version ? `?version=${version}` : ""}`,

    getAgentCredential: () => request<{ credential: string }>("/api/agent-credential"),
};
