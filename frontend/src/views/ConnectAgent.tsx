import { useEffect, useRef } from "react";
import { useConnectAgentViewModel } from "../viewmodels/useConnectAgentViewModel";

/** Connect agent, in the header band on every screen: the copyable command that
 * connects an MCP client to this instance, its credential filled in by the view
 * model (STD-002: no data access here). */
export function ConnectAgent() {
    const vm = useConnectAgentViewModel();
    const root = useRef<HTMLDivElement>(null);
    const { open, close } = vm;

    useEffect(() => {
        if (!open) return;
        const onPointer = (e: MouseEvent) => {
            if (root.current && !root.current.contains(e.target as Node)) close();
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") close();
        };
        document.addEventListener("mousedown", onPointer);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onPointer);
            document.removeEventListener("keydown", onKey);
        };
    }, [open, close]);

    return (
        <div className="connect-agent" ref={root}>
            <button
                type="button"
                className="btn btn-band"
                aria-expanded={open}
                aria-controls="connect-agent-panel"
                onClick={vm.toggle}
            >
                Connect agent
            </button>
            {open && (
                <div id="connect-agent-panel" className="connect-agent-panel" role="dialog" aria-label="Connect an agent">
                    <p className="connect-agent-label">MCP</p>
                    <p>Connect your agent once; it can then create, edit, version and export plans through this engine.</p>
                    <pre className="connect-agent-command">{vm.command}</pre>
                    <button type="button" className="btn" onClick={vm.copy}>
                        {vm.copied ? "Copied" : "Copy connect command"}
                    </button>
                    <p className="connect-agent-note">
                        {vm.unavailable
                            ? "The credential is unavailable right now: replace <credential> with the base64 of MCP_USER:MCP_PASSWORD."
                            : vm.ready
                              ? "The command carries this instance's HTTP Basic credential, already filled in."
                              : "Fetching this instance's credential..."}
                    </p>
                </div>
            )}
        </div>
    );
}
