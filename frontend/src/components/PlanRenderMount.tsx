import { useEffect, useRef } from "react";
import { PlanDataset } from "../api/client";
import rendererPin from "../../../renderer/PINNED.json";

declare global {
    interface Window {
        PlanRenderer?: { render: (dataset: unknown, container: HTMLElement, opts?: { editBase?: string }) => void };
    }
}

let stylesheetLoaded = false;
let scriptLoadingPromise: Promise<void> | null = null;
const rendererCss = `/renderer/plan-renderer.${rendererPin.files["plan-renderer.css"]}.css`;
const rendererJs = `/renderer/plan-renderer.${rendererPin.files["plan-renderer.js"]}.js`;

function loadRendererOnce(): Promise<void> {
    if (!stylesheetLoaded) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = rendererCss;
        document.head.appendChild(link);
        stylesheetLoaded = true;
    }
    if (window.PlanRenderer) return Promise.resolve();
    if (!scriptLoadingPromise) {
        scriptLoadingPromise = new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = rendererJs;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error("failed to load the plan renderer"));
            document.body.appendChild(script);
        });
    }
    return scriptLoadingPromise;
}

/** Mounts the SAME canonical renderer (renderer/plan-renderer.js) the
 * standalone export embeds, calling PlanRenderer.render() directly
 * against the fetched dataset - never a second, cockpit-local
 * reimplementation of the plan view (INT-PLANS-003).
 */
export function PlanRenderMount({ dataset }: { dataset: PlanDataset }) {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let cancelled = false;
        loadRendererOnce().then(() => {
            if (!cancelled && containerRef.current && window.PlanRenderer) {
                window.PlanRenderer.render(dataset, containerRef.current, {
                    editBase: `/plans/${encodeURIComponent(dataset.meta.id)}/items/`,
                });
            }
        });
        return () => {
            cancelled = true;
        };
    }, [dataset]);

    return <div ref={containerRef} data-testid="plan-render-mount" />;
}
