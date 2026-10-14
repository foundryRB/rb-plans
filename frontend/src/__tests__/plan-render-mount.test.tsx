/**
 * INT-PLANS-003: the plan view the UI shows is produced by the
 * canonical REF-Plan renderer, not by a second implementation living in
 * the cockpit. PlanRenderMount's only job is to call the global
 * PlanRenderer.render() the canonical script installs - this test proves
 * it does exactly that, against the dataset it was given, rather than
 * building any DOM of its own.
 */
import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, vi } from "vitest";
import type { Mock } from "vitest";
import { intent } from "@psa-department-of-engineering/vitest-intent";
import { PlanRenderMount } from "../components/PlanRenderMount";
import type { PlanDataset } from "../api/client";
import rendererPin from "../../../renderer/PINNED.json";

const sampleDataset: PlanDataset = {
    meta: { id: "sample", title: "Sample" },
    lanes: [],
    items: [],
    gates: [],
    log: [],
};

type RendererRender = NonNullable<Window["PlanRenderer"]>["render"];
let renderSpy: Mock<RendererRender>;

beforeEach(() => {
    renderSpy = vi.fn<RendererRender>();
    // window.PlanRenderer is already typed (optional) by PlanRenderMount's
    // own `declare global` - a plain assignment is the test double for
    // the script-loaded global, no suppression needed. Its presence is
    // what makes loadRendererOnce() resolve immediately without touching
    // the DOM.
    window.PlanRenderer = { render: renderSpy };
});

afterEach(() => {
    delete window.PlanRenderer;
    document.querySelectorAll('link[href^="/renderer/plan-renderer."]').forEach((el) => el.remove());
});

intent(
    "INT-PLANS-003",
    "PlanRenderMount calls the canonical PlanRenderer.render() against the given dataset, never a second implementation",
    async () => {
        render(<PlanRenderMount dataset={sampleDataset} />);
        await waitFor(() => expect(renderSpy).toHaveBeenCalledTimes(1));
        const [calledDataset, container] = renderSpy.mock.calls[0];
        expect(calledDataset).toBe(sampleDataset);
        expect(container).toBeInstanceOf(HTMLElement);
        expect(document.querySelector('link[rel="stylesheet"]')?.getAttribute("href"))
            .toBe(`/renderer/plan-renderer.${rendererPin.files["plan-renderer.css"]}.css`);
    }
);
