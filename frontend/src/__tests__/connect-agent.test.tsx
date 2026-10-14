/**
 * INT-PLANS-045, the cockpit half: the connect-an-agent panel fetches the
 * machine door's credential only once opened and fills it into the connect
 * command, keeping the placeholder when the route refuses.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, vi } from "vitest";
import { intent } from "@psa-department-of-engineering/vitest-intent";
import { ConnectAgent } from "../views/ConnectAgent";

const CREDENTIAL = btoa("agent:s3cret");

function stubFetch(response: { ok: boolean; status: number; body: unknown }) {
    const fetchMock = vi.fn().mockResolvedValue({
        ok: response.ok,
        status: response.status,
        statusText: response.ok ? "OK" : "Service Unavailable",
        json: async () => response.body,
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
}

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

intent(
    "INT-PLANS-045",
    "the panel fetches the credential only when opened and fills it into the connect command",
    async () => {
        const fetchMock = stubFetch({ ok: true, status: 200, body: { credential: CREDENTIAL } });
        render(<ConnectAgent />);
        expect(fetchMock).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole("button", { name: "Connect agent" }));

        await waitFor(() =>
            expect(screen.getByText(/claude mcp add/).textContent).toContain(`Authorization: Basic ${CREDENTIAL}`)
        );
        expect(fetchMock).toHaveBeenCalledWith("/api/agent-credential", expect.anything());
        expect(screen.getByText(/claude mcp add/).textContent).toContain(`${window.location.origin}/mcp`);
    }
);

intent(
    "INT-PLANS-045",
    "the panel keeps the placeholder when the credential route refuses",
    async () => {
        stubFetch({ ok: false, status: 503, body: { detail: "MCP credential is not configured" } });
        render(<ConnectAgent />);
        fireEvent.click(screen.getByRole("button", { name: "Connect agent" }));

        await waitFor(() => expect(screen.getByText(/credential is unavailable/)).toBeTruthy());
        expect(screen.getByText(/claude mcp add/).textContent).toContain("Authorization: Basic <credential>");
    }
);
