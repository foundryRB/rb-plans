import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";

/** Stands in for the credential until the route returns it, so the command
 * shape stays copyable when the key is unavailable. */
export const CREDENTIAL_PLACEHOLDER = "<credential>";

export function connectCommand(origin: string, credential: string | null): string {
    return `claude mcp add --scope user --transport http rb-plans ${origin}/mcp --header "Authorization: Basic ${credential ?? CREDENTIAL_PLACEHOLDER}"`;
}

/** Connect agent (INT-PLANS-045): the one-liner that connects an MCP client
 * to this instance's /mcp door. The credential is fetched when the panel first
 * opens, never on a bare page load. */
export function useConnectAgentViewModel() {
    const [open, setOpen] = useState(false);
    const [credential, setCredential] = useState<string | null>(null);
    const [unavailable, setUnavailable] = useState(false);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!open || credential !== null || unavailable) return;
        let cancelled = false;
        api.getAgentCredential()
            .then((r) => {
                if (!cancelled) setCredential(r.credential);
            })
            .catch(() => {
                if (!cancelled) setUnavailable(true);
            });
        return () => {
            cancelled = true;
        };
    }, [open, credential, unavailable]);

    const command = connectCommand(window.location.origin, credential);

    const toggle = useCallback(() => setOpen((v) => !v), []);
    const close = useCallback(() => setOpen(false), []);
    const copy = useCallback(() => {
        void navigator.clipboard?.writeText(command).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
        });
    }, [command]);

    return { open, toggle, close, command, ready: credential !== null, unavailable, copied, copy };
}
