/**
 * The canonical REF-Plan renderer (REF-Plan.md section 4/6). One inline,
 * framework-free module: `PlanRenderer.render(dataset, container, opts)`
 * projects a REF-Plan section 3 dataset into every view this REF names.
 *
 * Runtime rules held throughout (REF-Plan.md section 6): textContent /
 * createElement only, never innerHTML; no external dependency.
 *
 * This file is the ONE canonical source (ADR-001, INT-PLANS-004): the
 * cockpit's Plan Render view loads it and calls PlanRenderer.render()
 * directly against the fetched dataset, and the Export Composer embeds
 * this same file's bytes into the standalone export. Neither consumer
 * reimplements any of it.
 */
(function (global) {
    "use strict";

    var STATUS_LABEL = { ok: "Decided", wait: "Open", block: "Blocked", descoped: "Descoped", superseded: "Superseded" };
    var STATUS_TONE = { ok: "pr-ok", wait: "pr-warn", block: "pr-crit", descoped: "pr-muted", superseded: "pr-muted" };
    var PRIORITY_LABEL = { blocker: "Blocker", high: "High", medium: "Medium", low: "Low", optional: "Optional" };
    var LANE_COUNT = 5;
    var MS_PER_DAY = 86400000;

    // Set for the duration of one render() call only (this module is used
    // synchronously, never re-entrantly). When the cockpit passes
    // opts.editBase, every opened row detail carries a link back into
    // Item * Edit (design.md: editing is reached "from a Plan * Setup Add
    // control or from a row on the render"). The standalone export never
    // sets this - there is nothing for a static file to save an edit to -
    // so it never shows the link; the renderer stays the one canonical
    // source either way (ADR-001).
    var _editBase = null;

    // The hashchange listener of the latest render() call. A host that mounts
    // the renderer again (the cockpit, on every plan it opens) replaces it, so
    // one window carries one listener, bound to the plan on screen.
    var _hashListener = null;

    // ---- small DOM helper (textContent/createElement only) ----------------

    function el(tag, attrs, children) {
        var node = document.createElement(tag);
        attrs = attrs || {};
        for (var key in attrs) {
            if (!Object.prototype.hasOwnProperty.call(attrs, key)) continue;
            var val = attrs[key];
            if (key.indexOf("aria-") === 0 && typeof val === "boolean") val = String(val);
            if (val === null || val === undefined || val === false) continue;
            if (key === "class") node.className = val;
            else if (key === "text") node.textContent = val;
            else if (key.indexOf("on") === 0 && typeof val === "function") node.addEventListener(key.slice(2), val);
            else node.setAttribute(key, val === true ? "" : String(val));
        }
        children = children || [];
        for (var i = 0; i < children.length; i++) {
            var c = children[i];
            if (c === null || c === undefined || c === false) continue;
            node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
        }
        return node;
    }

    function svgEl(tag, attrs, children) {
        var node = document.createElementNS("http://www.w3.org/2000/svg", tag);
        attrs = attrs || {};
        for (var key in attrs) {
            if (!Object.prototype.hasOwnProperty.call(attrs, key)) continue;
            if (attrs[key] === null || attrs[key] === undefined) continue;
            node.setAttribute(key, attrs[key]);
        }
        children = children || [];
        for (var i = 0; i < children.length; i++) node.appendChild(children[i]);
        return node;
    }

    function clear(node) {
        while (node.firstChild) node.removeChild(node.firstChild);
    }

    // ---- date helpers -------------------------------------------------------

    function parseISO(s) {
        if (!s) return null;
        var d = new Date(s + "T00:00:00Z");
        return isNaN(d.getTime()) ? null : d;
    }
    function toISO(d) {
        return d.toISOString().slice(0, 10);
    }
    function addDaysISO(iso, n) {
        var d = parseISO(iso);
        d.setUTCDate(d.getUTCDate() + n);
        return toISO(d);
    }
    function daysBetween(a, b) {
        return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
    }
    function isWeekend(d) {
        var day = d.getUTCDay();
        return day === 0 || day === 6;
    }
    function todayISO() {
        return toISO(new Date());
    }
    function fmtShort(iso) {
        var d = parseISO(iso);
        if (!d) return "";
        var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        return months[d.getUTCMonth()] + " " + d.getUTCDate();
    }
    function workingDaysBetween(startISO, endISO) {
        var a = parseISO(startISO), b = parseISO(endISO);
        if (!a || !b) return 0;
        var count = 0;
        var cur = new Date(a.getTime());
        var dir = b > a ? 1 : -1;
        while (toISO(cur) !== endISO) {
            cur.setUTCDate(cur.getUTCDate() + dir);
            if (!isWeekend(cur)) count++;
            if (Math.abs(daysBetween(a, cur)) > 20000) break;
        }
        return count * dir;
    }

    // ---- dataset helpers ------------------------------------------------

    function laneIndexOf(dataset, laneId) {
        var lanes = dataset.lanes || [];
        for (var i = 0; i < lanes.length; i++) if (lanes[i].id === laneId) return i;
        return -1;
    }
    function laneShort(lane) {
        if (!lane) return "";
        var parts = String(lane.name).split("·");
        return parts[0].trim();
    }
    function laneSwatchClass(index) {
        return index >= 0 && index < LANE_COUNT ? "pr-lane-" + (index + 1) : "pr-lane-none";
    }
    function items(dataset) {
        return dataset.items || [];
    }
    function itemsOfType(dataset, type) {
        return items(dataset).filter(function (it) { return it.type === type; });
    }
    function itemById(dataset, id) {
        return items(dataset).filter(function (it) { return it.id === id; })[0];
    }
    function isLive(item) {
        return item.status !== "descoped" && item.status !== "superseded";
    }

    // ---- stats / ledger (derived; never authored, REF-Plan section 2) ---

    function computeStats(dataset) {
        var live = items(dataset).filter(isLive);
        var open = live.filter(function (i) { return i.status === "wait"; }).length;
        var blocked = live.filter(function (i) { return i.status === "block"; }).length;
        var decided = live.filter(function (i) { return i.status === "ok"; }).length;
        var ledger = computeLedger(dataset);
        // The next milestone is the soonest one still ahead of the plan: dated, not yet
        // closed, and not withdrawn. A closed or descoped milestone is not "next", so the
        // tile advances the moment one closes instead of holding it as overdue for ever.
        var nextMs = itemsOfType(dataset, "milestone")
            .filter(function (m) {
                return m.due && !m.closed && m.status !== "ok" && m.status !== "descoped" && m.status !== "superseded";
            })
            .sort(function (a, b) { return a.due < b.due ? -1 : 1; })[0];
        var today = todayISO();
        var nextMilestoneLabel = "–";
        if (nextMs) {
            var daysRemaining = daysBetween(parseISO(today), parseISO(nextMs.due));
            nextMilestoneLabel = (nextMs.short || nextMs.name) + " (" + (daysRemaining >= 0 ? daysRemaining + "d" : "overdue") + ")";
        }
        return {
            tracked: live.length,
            open: open,
            blocked: blocked,
            decided: decided,
            ledgerDays: ledger.totalDays,
            nextMilestone: nextMilestoneLabel,
        };
    }

    function computeLedger(dataset) {
        var rows = { superseded: [], cause: [], descoped: [], overdueGates: [] };
        items(dataset).forEach(function (it) {
            if (it.type !== "track") return;
            if (it.status === "superseded" && it.start && it.end) {
                rows.superseded.push({ item: it, days: workingDaysBetween(it.start, it.end) });
            } else if (it.cause && it.start && it.end) {
                rows.cause.push({ item: it, days: workingDaysBetween(it.start, it.end) });
            } else if (it.status === "descoped" && it.start && it.end) {
                rows.descoped.push({ item: it, days: -workingDaysBetween(it.start, it.end) });
            }
        });
        var today = todayISO();
        (dataset.gates || []).forEach(function (g) {
            if (!g.closed && g.due && g.due < today) {
                rows.overdueGates.push({ gate: g, days: workingDaysBetween(g.due, today) });
            } else if (g.closed && g.closed.date && g.due && g.closed.date > g.due) {
                rows.overdueGates.push({ gate: g, days: workingDaysBetween(g.due, g.closed.date) });
            }
        });
        var total = 0;
        rows.superseded.forEach(function (r) { total += r.days; });
        rows.cause.forEach(function (r) { total += r.days; });
        rows.descoped.forEach(function (r) { total += r.days; });
        rows.overdueGates.forEach(function (r) { total += r.days; });
        rows.totalDays = total;
        return rows;
    }

    // ---- id links --------------------------------------------------------

    function linkifyIntoNode(container, text, dataset, onOpen) {
        var re = /\b([A-Z]{2,4}-\d{2,3}|M\d{1,2}|G\d{1,2})\b/g;
        var lastIndex = 0;
        var match;
        var known = {};
        items(dataset).forEach(function (it) { known[it.id] = it; });
        (dataset.gates || []).forEach(function (g) { known[g.id] = g; });
        while ((match = re.exec(text))) {
            if (!known[match[0]]) continue;
            if (match.index > lastIndex) container.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
            var id = match[0];
            container.appendChild(el("a", {
                class: "pr-id-link", href: "#row-" + id,
                onclick: function (evt) {
                    evt.preventDefault();
                    if (onOpen) onOpen(id);
                },
            }, [id]));
            lastIndex = match.index + match[0].length;
        }
        if (lastIndex < text.length) container.appendChild(document.createTextNode(text.slice(lastIndex)));
    }

    // ================================================================
    // render()
    // ================================================================

    function render(dataset, container, opts) {
        opts = opts || {};
        _editBase = opts.editBase || null;
        var state = {
            lanes: new Set(),
            statuses: new Set(),
            priorities: new Set(),
            owner: "",
            showMilestones: true,
            showGates: true,
            gatesAsLines: true,
        };

        function openRow(id) {
            var target = container.querySelector('[data-row-id="' + id + '"]');
            if (target) {
                var toggle = target.querySelector(".pr-row-toggle");
                if (toggle && toggle.getAttribute("aria-expanded") === "false") toggle.click();
                // A row that fits under the sticky bar centres; a taller one
                // lands on its head, just below the bar, so the reader sees
                // which row opened before its detail.
                var bar = container.querySelector(".pr-sticky");
                var under = bar ? bar.offsetHeight : 0;
                var tall = target.getBoundingClientRect().height > (global.innerHeight || 0) - under;
                target.style.scrollMarginTop = (under + 8) + "px";
                target.scrollIntoView({ block: tall ? "start" : "center" });
                target.classList.add("pr-highlight");
                setTimeout(function () { target.classList.remove("pr-highlight"); }, 1500);
            }
        }

        // Lane/priority/owner only - used both by passesFilters (below) and
        // by the descoped/superseded tallies (design.md: "the section
        // counts report them separately"), which must count against the
        // SAME cut the live list uses on every other axis, just not the
        // status-hide rule itself.
        function passesNonStatusFilters(item) {
            if (state.lanes.size && item.lane && !state.lanes.has(item.lane)) return false;
            if (state.lanes.size && !item.lane) return false;
            if (state.priorities.size && !state.priorities.has(item.priority)) return false;
            if (state.owner && item.owner !== state.owner) return false;
            return true;
        }

        function passesFilters(item) {
            if (!passesNonStatusFilters(item)) return false;
            if (state.statuses.size) {
                if (!state.statuses.has(item.status)) return false;
            } else if (item.status === "descoped" || item.status === "superseded") {
                // Hidden under every filter state EXCEPT their own pill
                // (design.md "Plan * Render"): the section's live count
                // never silently folds these in.
                return false;
            }
            return true;
        }

        function statusTallies(list) {
            var superseded = 0, descoped = 0;
            list.forEach(function (item) {
                if (!passesNonStatusFilters(item)) return;
                if (item.status === "superseded") superseded++;
                else if (item.status === "descoped") descoped++;
            });
            return { superseded: superseded, descoped: descoped };
        }

        // A link from another instrument lands on its row: <plan file>#item-<id>
        // (REF-StatusReport.md section 3). Only an id this dataset carries is
        // honoured, so a host page's own hashes pass through. A row the filters
        // hide shows itself first: the filters fall back to the one state that
        // shows it, then the row opens.
        function openFromHash() {
            var match = /^#item-([\w.-]+)$/.exec(global.location ? global.location.hash : "");
            if (!match) return;
            var id = match[1];
            var item = (dataset.items || []).filter(function (i) { return i.id === id; })[0];
            var gate = (dataset.gates || []).some(function (g) { return g.id === id; });
            if (!item && !gate) return;
            if (item && !passesFilters(item)) {
                state.lanes.clear();
                state.priorities.clear();
                state.owner = "";
                state.statuses.clear();
                if (item.status === "descoped" || item.status === "superseded") state.statuses.add(item.status);
                renderAll();
            }
            openRow(id);
        }

        function renderAll() {
            clear(container);
            container.classList.add("pr-root");
            container.appendChild(buildMasthead(dataset));
            container.appendChild(buildFilterBar(dataset, state, renderAll));
            container.appendChild(buildSection(
                "milestones", "Milestones",
                itemsOfType(dataset, "milestone").filter(passesFilters),
                function (list) { return buildMilestoneRail(dataset, list, openRow); },
                statusTallies(itemsOfType(dataset, "milestone"))
            ));
            container.appendChild(buildScheduleSection(dataset, state, passesFilters, openRow));
            container.appendChild(buildDependenciesSection(dataset, passesFilters, statusTallies, openRow));
            container.appendChild(buildAssumptionsSection(dataset, passesFilters, statusTallies));
            container.appendChild(buildWorkstreamsSection(dataset, passesFilters, statusTallies, openRow));
            container.appendChild(buildRisksSection(dataset, passesFilters, statusTallies));
            container.appendChild(buildGatesSection(dataset));
            container.appendChild(buildLogSection(dataset, openRow));
            container.appendChild(buildLedgerSection(dataset));
        }

        renderAll();
        if (global.addEventListener) {
            if (_hashListener) global.removeEventListener("hashchange", _hashListener);
            _hashListener = openFromHash;
            global.addEventListener("hashchange", _hashListener);
        }
        openFromHash();
        return { rerender: renderAll };
    }

    // The one mark: the lockup as live text. Static markup owned by this file, never
    // dataset input, which is why it may be set as HTML at all (REF-Plan section 6).
    var LOCKUP = "<div class=\"lockup\"><svg class=\"lockup-tile\" viewBox=\"0 0 120 120\" aria-hidden=\"true\"><path fill=\"#E60000\" d=\"M113.415 33.2927C107.561 21.2195 97.6829 11.7073 85.2439 5.85366C74.2683 8.04878 65.8536 18.2927 65.8536 29.6341C65.8536 30 65.8536 30.3659 65.8536 30.7317C84.1463 35.122 92.561 46.0976 92.561 61.4634C92.561 76.8293 80.4878 93.2927 60.3658 93.2927C43.9024 93.2927 26.7073 79.3902 26.7073 56.7073C26.7073 41.7073 34.7561 27.439 45 19.0244C54.878 10.6098 68.7805 5.4878 81.2195 5.4878C82.6829 5.4878 84.5122 5.4878 85.6097 5.85366C77.9268 2.19512 69.1463 0 60 0C46.0975 0 33.2927 4.7561 23.0488 12.8049C9.14634 23.7805 0 40.6098 0 60C0 92.9268 26.7073 120 60 120C93.2927 120 120 93.2927 120 60C119.634 50.122 117.439 41.3415 113.415 33.2927Z\"/><path fill=\"#FFFFFF\" d=\"M85.6097 5.4878C84.5121 5.12195 83.0487 5.12195 81.2195 5.12195C68.7805 5.12195 54.878 10.6098 45 18.6585C34.7561 27.0732 26.7073 41.7073 26.7073 56.3414C26.7073 79.0244 43.9024 92.9268 60.3658 92.9268C80.8536 92.9268 92.5609 76.0975 92.5609 61.0975C92.5609 45.7317 84.1463 34.7561 65.8536 30.3658C65.8536 30 65.8536 29.6341 65.8536 29.2683C65.8536 17.9268 74.6341 8.04878 85.6097 5.4878Z\"/></svg><span class=\"lockup-words\"><b>Digital Engineering</b><i>Vodafone Portugal</i></span><svg class=\"lockup-flag\" viewBox=\"0 0 28 19\" aria-hidden=\"true\"><defs><clipPath id=\"lockup-flag-clip\"><rect x=\"0\" y=\"0\" width=\"28\" height=\"19\" rx=\"3\"/></clipPath></defs><g clip-path=\"url(#lockup-flag-clip)\"><rect width=\"11.8\" height=\"19\" fill=\"#036A3A\"/><rect x=\"11.8\" width=\"16.2\" height=\"19\" fill=\"#DA020E\"/></g><g transform=\"translate(11.8,9.5)\"><circle r=\"5.7\" fill=\"#ffe14d\" fill-opacity=\"0.18\" stroke=\"#ffcf1f\" stroke-width=\"0.9\"/><ellipse rx=\"5.7\" ry=\"2.39\" fill=\"none\" stroke=\"#ffcf1f\" stroke-width=\"0.7\"/><ellipse rx=\"2.39\" ry=\"5.7\" fill=\"none\" stroke=\"#ffcf1f\" stroke-width=\"0.7\"/><rect x=\"-2.3\" y=\"-3.1\" width=\"4.6\" height=\"5.6\" rx=\"0.6\" fill=\"#DA020E\" stroke=\"#fff\" stroke-width=\"0.6\"/><rect x=\"-1.3\" y=\"-2\" width=\"2.6\" height=\"3.2\" rx=\"0.4\" fill=\"#fff\"/></g></svg></div>";
    function lockupMark() {
        var node = el("div", { class: "pr-wordmark" });
        node.innerHTML = LOCKUP;
        return node;
    }

    // ---- masthead ----------------------------------------------------------

    function buildMasthead(dataset) {
        var meta = dataset.meta || {};
        var stats = computeStats(dataset);
        return el("header", { class: "pr-band", id: "top" }, [
            lockupMark(),
            el("h1", {}, [meta.title || meta.id || "Untitled plan"]),
            el("div", { class: "pr-version pr-mono" }, [
                (meta.version || "") + (meta.date ? " · " + meta.date : ""),
            ]),
            el("p", { class: "pr-focus" }, [meta.focus || meta.lede || ""]),
            el("div", { class: "pr-stats" }, [
                statTile(stats.tracked, "Tracked"),
                statTile(stats.open, "Open"),
                statTile(stats.blocked, "Blocked"),
                statTile(stats.decided, "Decided"),
                statTile(stats.ledgerDays, "Ledger days"),
                statTile(stats.nextMilestone, "Next milestone"),
            ]),
        ]);
    }
    function statTile(value, label) {
        return el("div", { class: "pr-stat" + (label === "Next milestone" ? " pr-stat-next" : "") }, [
            el("div", { class: "pr-stat-num" }, [String(value)]),
            el("div", { class: "pr-stat-label" }, [label]),
        ]);
    }

    // ---- filter bar ----------------------------------------------------------

    function buildFilterBar(dataset, state, onChange) {
        var anchors = el("nav", { class: "pr-anchors", "aria-label": "Plan sections" }, [
            el("a", { href: "#milestones" }, ["Milestones"]),
            el("a", { href: "#schedule" }, ["Schedule"]),
            el("a", { href: "#dependencies" }, ["Dependencies"]),
            el("a", { href: "#assumptions" }, ["Assumptions"]),
            el("a", { href: "#workstreams" }, ["Workstreams"]),
            el("a", { href: "#risks" }, ["Risks"]),
            el("a", { href: "#gates" }, ["Gates"]),
            el("a", { href: "#log" }, ["Log"]),
            el("a", { href: "#ledger" }, ["Ledger"]),
        ]);

        var lanePills = el("div", { class: "pr-pillrow", role: "group", "aria-label": "Filter by lane" });
        lanePills.appendChild(el("span", { class: "pr-filter-label" }, ["Lane"]));
        (dataset.lanes || []).forEach(function (lane, idx) {
            var pressed = state.lanes.has(lane.id);
            lanePills.appendChild(el("button", {
                class: "pr-pill", type: "button", "aria-pressed": pressed,
                onclick: function () {
                    if (state.lanes.has(lane.id)) state.lanes.delete(lane.id); else state.lanes.add(lane.id);
                    onChange();
                },
            }, [
                el("span", { class: "pr-swatch " + laneSwatchClass(idx) }),
                laneShort(lane),
            ]));
        });
        lanePills.appendChild(el("button", {
            class: "pr-pill", type: "button", "aria-pressed": state.lanes.size === 0,
            onclick: function () { state.lanes.clear(); onChange(); },
        }, ["All"]));

        var statusesPresent = {};
        items(dataset).forEach(function (i) { if (i.status) statusesPresent[i.status] = true; });
        var statusPills = el("div", { class: "pr-pillrow", role: "group", "aria-label": "Filter by status" });
        statusPills.appendChild(el("span", { class: "pr-filter-label" }, ["Status"]));
        Object.keys(STATUS_LABEL).forEach(function (s) {
            if (!statusesPresent[s]) return;
            var pressed = state.statuses.has(s);
            statusPills.appendChild(el("button", {
                class: "pr-pill", type: "button", "aria-pressed": pressed,
                onclick: function () {
                    if (state.statuses.has(s)) state.statuses.delete(s); else state.statuses.add(s);
                    onChange();
                },
            }, [STATUS_LABEL[s]]));
        });
        statusPills.appendChild(el("button", {
            class: "pr-pill", type: "button", "aria-pressed": state.statuses.size === 0,
            onclick: function () { state.statuses.clear(); onChange(); },
        }, ["All"]));

        var prioritiesPresent = {};
        items(dataset).forEach(function (i) { if (i.priority) prioritiesPresent[i.priority] = true; });
        var priorityPills = el("div", { class: "pr-pillrow", role: "group", "aria-label": "Filter by priority" });
        priorityPills.appendChild(el("span", { class: "pr-filter-label" }, ["Priority"]));
        Object.keys(PRIORITY_LABEL).forEach(function (p) {
            if (!prioritiesPresent[p]) return;
            var pressed = state.priorities.has(p);
            priorityPills.appendChild(el("button", {
                class: "pr-pill", type: "button", "aria-pressed": pressed,
                onclick: function () {
                    if (state.priorities.has(p)) state.priorities.delete(p); else state.priorities.add(p);
                    onChange();
                },
            }, [PRIORITY_LABEL[p]]));
        });
        priorityPills.appendChild(el("button", {
            class: "pr-pill", type: "button", "aria-pressed": state.priorities.size === 0,
            onclick: function () { state.priorities.clear(); onChange(); },
        }, ["All"]));

        var owners = {};
        items(dataset).forEach(function (i) { if (i.owner) owners[i.owner] = true; });
        var ownerSelect = el("select", {
            class: "pr-pill", "aria-label": "Filter by owner",
            onchange: function (evt) { state.owner = evt.target.value; onChange(); },
        }, [el("option", { value: "" }, ["Owner: All"])].concat(
            Object.keys(owners).sort().map(function (o) {
                return el("option", { value: o, selected: state.owner === o || null }, [o]);
            })
        ));

        return el("div", { class: "pr-sticky" }, [anchors, el("div", { class: "pr-filters" }, [lanePills, statusPills, priorityPills, ownerSelect])]);
    }

    // ---- generic collapsible section -------------------------------------

    function buildSection(id, title, list, bodyBuilder, tallies) {
        var countText = String(list.length) + (list.length === 1 ? " item" : " items");
        if (tallies && (tallies.superseded || tallies.descoped)) {
            var extra = [];
            if (tallies.superseded) extra.push(tallies.superseded + " superseded");
            if (tallies.descoped) extra.push(tallies.descoped + " descoped");
            // Reported separately, never folded into the live count above
            // (design.md "Plan * Render": "the section counts report them
            // separately").
            countText += " · " + extra.join(", ");
        }
        return el("section", { class: "pr-section", id: id }, [
            el("h2", {}, [title]),
            el("p", { class: "pr-count" }, [countText]),
            bodyBuilder(list),
        ]);
    }

    function buildRow(id, headLine, detailBuilder) {
        var expanded = false;
        var detail = el("div", { class: "pr-detail", id: "detail-" + id, hidden: true });
        var toggle = el("button", {
            class: "pr-row-toggle", type: "button", "aria-expanded": "false", "aria-controls": "detail-" + id,
            onclick: function () {
                expanded = !expanded;
                toggle.setAttribute("aria-expanded", String(expanded));
                detail.hidden = !expanded;
                if (expanded) {
                    clear(detail);
                    if (detailBuilder) detail.appendChild(detailBuilder());
                    if (_editBase) {
                        detail.appendChild(el("div", { style: "margin-top:0.5rem" }, [
                            el("a", { class: "pr-id-link", href: _editBase + encodeURIComponent(id) }, ["Edit →"]),
                        ]));
                    }
                }
            },
        }, [el("span", { class: "pr-caret", "aria-hidden": "true" }, ["›"]), el("span", { class: "pr-row-label" }, headLine)]);
        return el("div", { class: "pr-disclosure", "data-row-id": id, id: "row-" + id }, [toggle, detail]);
    }

    // ---- milestone rail -----------------------------------------------------

    function buildMilestoneRail(dataset, list, openRow) {
        var sorted = list.slice().sort(function (a, b) { return (a.due || "") < (b.due || "") ? -1 : 1; });
        return el("div", { class: "pr-rail", tabindex: "0", role: "region", "aria-label": "Milestones" }, sorted.map(function (m) {
            var laneIdx = laneIndexOf(dataset, m.lane);
            var children = [
                el("div", { class: "pr-rail-date pr-mono" }, [fmtShort(m.due)]),
                el("div", {}, [m.short || m.name]),
                m.critical ? criticalChip() : null,
            ];
            if (_editBase) {
                children.push(el("div", { style: "margin-top:0.35rem" }, [
                    el("a", { class: "pr-id-link", href: _editBase + encodeURIComponent(m.id) }, ["Edit →"]),
                ]));
            }
            return el("div", {
                class: "pr-rail-card", "data-row-id": m.id, id: "row-" + m.id,
                style: "border-left-color: var(--lane-" + (laneIdx >= 0 ? laneIdx + 1 : 1) + ")",
            }, children);
        }));
    }
    function criticalChip() {
        return el("span", { class: "pr-badge pr-crit-outline" }, ["Critical"]);
    }

    // ---- schedule (SVG) ------------------------------------------------------

    function buildScheduleSection(dataset, state, passesFilters, openRow) {
        var meta = dataset.meta || {};
        var horizon = meta.horizon || [];
        var start = parseISO(horizon[0]);
        var end = parseISO(horizon[1]);
        var body = el("div", {});
        if (!start || !end) {
            body.appendChild(el("p", { class: "pr-count" }, ["No horizon set; the schedule cannot draw."]));
            return el("section", { class: "pr-section", id: "schedule" }, [el("h2", {}, ["Schedule"]), body]);
        }

        var toolbar = el("div", { class: "pr-schedule-toolbar" });
        var msToggle = switchControl("Milestones", state.showMilestones, function (v) { state.showMilestones = v; rerenderSvg(); });
        var gatesToggle = switchControl("Gates", state.showGates, function (v) { state.showGates = v; rerenderSvg(); });
        var linesToggle = switchControl("Gate days as lines", state.gatesAsLines, function (v) { state.gatesAsLines = v; rerenderSvg(); });
        toolbar.appendChild(msToggle);
        toolbar.appendChild(gatesToggle);
        toolbar.appendChild(linesToggle);

        var scrollWrap = el("div", { class: "pr-schedule-scroll", tabindex: "0", role: "region", "aria-label": "Schedule timeline" });
        var legend = el("div", { class: "pr-legend" });

        function rerenderSvg() {
            clear(scrollWrap);
            clear(legend);
            var svgBits = buildScheduleSvg(dataset, state, passesFilters, start, end, openRow);
            scrollWrap.appendChild(svgBits.svg);
            legend.appendChild(svgBits.legend);
        }
        rerenderSvg();

        return el("section", { class: "pr-section", id: "schedule" }, [
            el("h2", {}, ["Schedule"]),
            toolbar,
            scrollWrap,
            legend,
        ]);
    }

    function switchControl(label, checked, onChange) {
        var state = checked;
        var track = el("button", {
            class: "pr-switch-track", type: "button", role: "switch", "aria-checked": String(state),
            onclick: function () {
                state = !state;
                track.setAttribute("aria-checked", String(state));
                onChange(state);
            },
        }, [el("span", { class: "pr-switch-knob" })]);
        return el("label", { class: "pr-schedule-toolbar", style: "gap:0.4rem" }, [label, track]);
    }

    function buildScheduleSvg(dataset, state, passesFilters, start, end, openRow) {
        var totalDays = daysBetween(start, end) || 1;
        var dayWidth = 6;
        var width = Math.max(600, totalDays * dayWidth + 220);
        var leftLabelWidth = 200;
        var rowHeight = 28;
        var tracks = itemsOfType(dataset, "track").filter(passesFilters);
        var milestones = itemsOfType(dataset, "milestone").filter(passesFilters);
        var gatesByDay = {};
        (dataset.gates || []).forEach(function (g) {
            if (!g.due) return;
            gatesByDay[g.due] = gatesByDay[g.due] || [];
            gatesByDay[g.due].push(g);
        });
        var chartHeight = 60 + tracks.length * rowHeight + 40;
        var height = chartHeight;

        function xFor(iso) {
            var d = parseISO(iso);
            if (!d) return leftLabelWidth;
            return leftLabelWidth + Math.max(0, daysBetween(start, d)) * dayWidth;
        }

        var g = [];

        // weekend shading + month/week grid
        var cur = new Date(start.getTime());
        while (cur <= end) {
            if (isWeekend(cur)) {
                g.push(svgEl("rect", {
                    x: xFor(toISO(cur)), y: 40, width: dayWidth, height: chartHeight - 60,
                    fill: "var(--muted)", opacity: 0.12,
                }));
            }
            if (cur.getUTCDay() === 1) {
                g.push(svgEl("line", {
                    x1: xFor(toISO(cur)), y1: 40, x2: xFor(toISO(cur)), y2: chartHeight - 20,
                    stroke: "var(--edge)", "stroke-width": 1,
                }));
            }
            if (cur.getUTCDate() === 1 || toISO(cur) === toISO(start)) {
                var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                g.push(svgEl("line", {
                    x1: xFor(toISO(cur)), y1: 20, x2: xFor(toISO(cur)), y2: chartHeight - 20,
                    stroke: "var(--muted)", "stroke-width": 1.25,
                }));
                g.push(svgEl("text", {
                    x: xFor(toISO(cur)) + 4, y: 32, fill: "var(--muted)", "font-size": 11, "font-family": "var(--font-mono)",
                }, []));
                g[g.length - 1].textContent = months[cur.getUTCMonth()];
            }
            cur.setUTCDate(cur.getUTCDate() + 1);
        }

        // today line
        var today = todayISO();
        if (today >= toISO(start) && today <= toISO(end)) {
            g.push(svgEl("line", {
                x1: xFor(today), y1: 20, x2: xFor(today), y2: chartHeight - 20,
                stroke: "var(--accent)", "stroke-width": 2,
            }));
        }

        // gate day lines/diamonds
        Object.keys(gatesByDay).forEach(function (day) {
            var gates = gatesByDay[day];
            var allClosed = gates.every(function (gt) { return gt.closed; });
            var overdue = !allClosed && day < today;
            var color = allClosed ? "var(--ok)" : overdue ? "var(--crit)" : "var(--muted)";
            if (!state.showGates) return;
            var x = xFor(day);
            var title = gates.map(function (gt) { return gt.id + " " + gt.name; }).join("; ");
            if (state.gatesAsLines) {
                var line = svgEl("line", { x1: x, y1: 20, x2: x, y2: chartHeight - 20, stroke: color, "stroke-width": 1.5, "stroke-dasharray": "4,3" });
                line.appendChild(svgEl("title", {}, []));
                line.lastChild.textContent = title;
                g.push(line);
            } else {
                var dia = svgEl("path", { d: diamondPath(x, 20, 6), fill: color });
                dia.appendChild(svgEl("title", {}, []));
                dia.lastChild.textContent = title;
                g.push(dia);
            }
        });

        // track bars
        tracks.forEach(function (t, idx) {
            var y = 60 + idx * rowHeight;
            var laneIdx = laneIndexOf(dataset, t.lane);
            var laneColor = "var(--lane-" + ((laneIdx >= 0 && laneIdx < LANE_COUNT) ? laneIdx + 1 : 1) + ")";
            var hueFree = laneIdx < 0 || laneIdx >= LANE_COUNT;
            // A bar is a WINDOW: it is drawn only for a track that states both ends. An undated track
            // keeps its row and its label and draws nothing in the plot. Falling back to the horizon
            // (as this did) invented a window the dataset never stated: every undated track became a
            // full-width bar, identical to a track that really spans the plan, and a reader cannot
            // tell the two apart. The skill's renderer already draws nothing here (REF-Plan: the
            // timeline consumes only the ISO fields).
            var label = svgEl("text", { x: 4, y: y + rowHeight - 12, fill: "var(--ink)", "font-size": 13 }, []);
            label.textContent = (t.short || t.name).slice(0, 26);
            if (!(t.start && t.end)) {
                label.setAttribute("fill", "var(--muted)");
                label.appendChild(svgEl("title", {}, []));
                label.lastChild.textContent = t.id + " " + t.name + " (no start and end: not drawn)";
                g.push(label);
                return;
            }
            var x1 = xFor(t.start);
            var x2 = xFor(t.end);
            var bar = svgEl("rect", {
                x: x1, y: y, width: Math.max(2, x2 - x1), height: rowHeight - 8, rx: 3,
                fill: hueFree ? "var(--panel)" : laneColor,
                stroke: hueFree ? "var(--input)" : (t.critical ? "var(--crit)" : "none"),
                "stroke-width": t.critical ? 2 : (hueFree ? 1 : 0),
            });
            bar.appendChild(svgEl("title", {}, []));
            bar.lastChild.textContent = t.id + " " + t.name;
            bar.addEventListener("click", function () { openRow(t.id); });
            bar.style.cursor = "pointer";
            g.push(bar);
            g.push(label);
        });

        // milestone diamonds
        if (state.showMilestones) {
            milestones.forEach(function (m) {
                if (!m.due) return;
                var x = xFor(m.due);
                var dia = svgEl("path", { d: diamondPath(x, chartHeight - 20, 5), fill: m.critical ? "var(--crit)" : "var(--ink)" });
                dia.appendChild(svgEl("title", {}, []));
                dia.lastChild.textContent = m.id + " " + m.name;
                dia.addEventListener("click", function () { openRow(m.id); });
                dia.style.cursor = "pointer";
                g.push(dia);
            });
        }

        var svg = svgEl("svg", { viewBox: "0 0 " + width + " " + height, width: width, height: height, role: "img", "aria-label": "Schedule chart" }, g);

        var legend = el("div", {}, [
            legendItem("var(--lane-1)", "Lane bar"),
            legendItem("var(--accent)", "Today"),
            legendItem("var(--muted)", "Weekend"),
            legendItem("var(--ok)", "Gate closed"),
            legendItem("var(--crit)", "Gate overdue / critical"),
        ]);

        return { svg: svg, legend: legend };
    }
    function diamondPath(cx, cy, r) {
        return "M " + cx + " " + (cy - r) + " L " + (cx + r) + " " + cy + " L " + cx + " " + (cy + r) + " L " + (cx - r) + " " + cy + " Z";
    }
    function legendItem(color, label) {
        return el("span", {}, [el("span", { class: "pr-legend-swatch", style: "background:" + color }), label]);
    }

    // Each item is one row group: aligned summary cells and a full-width detail row.
    function buildTable(headers, rows, kind) {
        return el("div", { class: "pr-table-scroll", tabindex: "0", role: "region", "aria-label": kind + " table" }, [
            el("table", { class: "pr-table pr-table-" + kind.toLowerCase() }, [
                el("colgroup", {}, headers.map(function (h) { return el("col", { class: "pr-col-" + h.toLowerCase() }); })),
                el("thead", {}, [el("tr", {}, headers.map(function (h) { return el("th", { scope: "col" }, [h]); }))]),
            ].concat(rows)),
        ]);
    }

    function buildTableRow(item, cells, detailBuilder) {
        var disclosure = buildRow(item.id, [item.name, item.critical ? criticalChip() : null], detailBuilder);
        var toggle = disclosure.firstChild;
        var detail = disclosure.lastChild;
        var detailRow = el("tr", { class: "pr-detail-row", hidden: true }, [
            el("td", { colspan: cells.length + 2 }, [detail]),
        ]);
        toggle.addEventListener("click", function () { detailRow.hidden = detail.hidden; });
        return el("tbody", { "data-row-id": item.id, id: "row-" + item.id }, [
            el("tr", { class: "pr-summary-row" }, [
                el("td", { class: "pr-mono pr-item-id" }, [item.id]),
                el("td", {}, [toggle]),
            ].concat(cells.map(function (cell) { return el("td", {}, [cell]); }))),
            detailRow,
        ]);
    }

    function laneChip(dataset, item) {
        var idx = laneIndexOf(dataset, item.lane);
        var lane = (dataset.lanes || [])[idx];
        return lane ? el("span", { class: "pr-chip" }, [el("span", { class: "pr-swatch " + laneSwatchClass(idx) }), laneShort(lane)]) : "";
    }

    function itemDetail(item, noteLabel) {
        var wrap = el("div", {});
        if (item.body) wrap.appendChild(el("p", {}, [item.body]));
        if (item.when) wrap.appendChild(el("p", {}, ["Timing: " + item.when]));
        if (item.note) wrap.appendChild(el("p", {}, [noteLabel + ": " + item.note]));
        if (item.needs && item.needs.length) wrap.appendChild(el("p", {}, ["Needs: " + item.needs.join(", ")]));
        if (item.decision) wrap.appendChild(el("p", {}, [item.decision.date + " · " + item.decision.who + ": " + item.decision.text]));
        return wrap;
    }

    // ---- dependencies --------------------------------------------------------

    function buildDependenciesSection(dataset, passesFilters, statusTallies, openRow) {
        var deps = itemsOfType(dataset, "dependency").filter(passesFilters);
        deps.sort(function (a, b) { return a.id < b.id ? -1 : 1; });
        return buildSection("dependencies", "Dependencies", deps, function (list) {
            return buildTable(["Id", "Item", "Owner", "Lane", "Priority", "Due", "Status"], list.map(function (dep) {
                return buildTableRow(dep, [
                    dep.owner || "",
                    laneChip(dataset, dep),
                    dep.priority ? el("span", { class: "pr-badge " + (dep.priority === "blocker" ? "pr-filled" : "pr-outline") }, [PRIORITY_LABEL[dep.priority]]) : "",
                    el("span", { class: "pr-mono pr-date" }, [dep.due || ""]),
                    statusChip(dep.status),
                ], function () { return itemDetail(dep, "Note"); });
            }), "Dependencies");
        }, statusTallies(itemsOfType(dataset, "dependency")));
    }
    function statusChip(status) {
        if (!status) return "";
        return el("span", { class: "pr-chip " + (STATUS_TONE[status] || "pr-muted") }, [STATUS_LABEL[status] || status]);
    }

    // ---- assumptions ----------------------------------------------------------

    function buildAssumptionsSection(dataset, passesFilters, statusTallies) {
        var list = itemsOfType(dataset, "assumption").filter(passesFilters);
        return buildSection("assumptions", "Assumptions", list, function (rows) {
            return el("div", {}, rows.map(function (a, idx) {
                return buildRow(a.id, [
                    el("span", { class: "pr-mono" }, [String(idx + 1) + "."]),
                    " " + a.name,
                    " ",
                    a.owner ? el("span", { class: "pr-mono" }, [a.owner]) : null,
                    statusChip(a.status),
                ], function () {
                    var wrap = el("div", {});
                    if (a.body) wrap.appendChild(el("p", {}, [a.body]));
                    if (a.note) wrap.appendChild(el("p", { class: "pr-note" }, ["If it does not hold: " + a.note]));
                    return wrap;
                });
            }));
        }, statusTallies(itemsOfType(dataset, "assumption")));
    }

    // ---- workstreams / risks ---------------------------------------------------

    function buildWorkstreamsSection(dataset, passesFilters, statusTallies, openRow) {
        var list = itemsOfType(dataset, "track").filter(passesFilters);
        return buildSection("workstreams", "Workstreams", list, function (rows) {
            return buildTable(["Id", "Item", "Owner", "Lane", "Status"], rows.map(function (t) {
                return buildTableRow(t, [t.owner || "", laneChip(dataset, t), statusChip(t.status)], function () {
                    var wrap = itemDetail(t, "Note");
                    if (t.start && t.end) wrap.appendChild(el("p", {}, ["Window: " + t.start + " to " + t.end]));
                    return wrap;
                });
            }), "Workstreams");
        }, statusTallies(itemsOfType(dataset, "track")));
    }

    function buildRisksSection(dataset, passesFilters, statusTallies) {
        var list = itemsOfType(dataset, "risk").filter(passesFilters);
        return buildSection("risks", "Risks", list, function (rows) {
            return buildTable(["Id", "Risk", "Owner", "Status"], rows.map(function (r) {
                return buildTableRow(r, [r.owner || "", statusChip(r.status)], function () { return itemDetail(r, "Mitigation"); });
            }), "Risks");
        }, statusTallies(itemsOfType(dataset, "risk")));
    }

    // ---- gates ----------------------------------------------------------------

    function buildGatesSection(dataset) {
        var gates = (dataset.gates || []).slice().sort(function (a, b) { return (a.due || "") < (b.due || "") ? -1 : 1; });
        var closedCount = gates.filter(function (g) { return g.closed; }).length;
        return el("section", { class: "pr-section", id: "gates" }, [
            el("h2", {}, ["Gates"]),
            el("p", { class: "pr-count" }, ["A gate is a date, not a task: on its due date the named evidence is granted or it is not. " + closedCount + " of " + gates.length + " closed."]),
            el("div", {}, gates.map(function (g) {
                return buildRow(g.id, [
                    el("span", { class: "pr-mono" }, [g.id]),
                    " " + g.name + " ",
                    el("span", { class: "pr-mono" }, [g.due || ""]),
                    " ",
                    g.closed ? el("span", { class: "pr-chip pr-ok" }, ["Closed"]) : el("span", { class: "pr-chip pr-warn" }, ["Open"]),
                ], function () {
                    var wrap = el("div", {});
                    wrap.appendChild(el("p", {}, ["Evidence: " + g.evidence]));
                    wrap.appendChild(el("p", {}, ["Closer: " + g.closer]));
                    if (g.closed) wrap.appendChild(el("p", {}, ["Closed " + g.closed.date + " by " + g.closed.who + " (" + g.closed.where + ")"]));
                    return wrap;
                });
            })),
        ]);
    }

    // ---- decision log -----------------------------------------------------------

    function buildLogSection(dataset, openRow) {
        var log = (dataset.log || []).slice();
        var byDay = {};
        log.forEach(function (row) {
            byDay[row.date] = byDay[row.date] || [];
            byDay[row.date].push(row);
        });
        var days = Object.keys(byDay).sort().reverse();
        return el("section", { class: "pr-section", id: "log" }, [
            el("h2", {}, ["Decision log"]),
            el("p", { class: "pr-count" }, [String(log.length) + " rows over " + days.length + " days"]),
            el("div", {}, days.map(function (day) {
                var rows = byDay[day];
                var ids = [];
                rows.forEach(function (r) { (r.refs || []).forEach(function (id) { if (ids.indexOf(id) < 0) ids.push(id); }); });
                var expanded = false;
                var body = el("div", { class: "pr-log-rows", hidden: true });
                var head = el("button", {
                    class: "pr-log-day-head", type: "button",
                    onclick: function () {
                        expanded = !expanded;
                        body.hidden = !expanded;
                    },
                }, [
                    el("span", {}, [day + " · " + rows.length + " row" + (rows.length === 1 ? "" : "s")]),
                    el("span", { class: "pr-mono" }, [ids.join(", ")]),
                ]);
                rows.forEach(function (r) {
                    var line = el("div", { class: "pr-log-row" });
                    linkifyIntoNode(line, ((r.refs || []).join(", ") || "PLAN") + ": " + r.text + " (" + r.who + ")", dataset, openRow);
                    body.appendChild(line);
                });
                return el("div", { class: "pr-log-day" }, [head, body]);
            })),
        ]);
    }

    // ---- ledger ------------------------------------------------------------------

    function buildLedgerSection(dataset) {
        var ledger = computeLedger(dataset);
        function foldRow(title, rows, dayField) {
            if (!rows.length) return null;
            var sum = rows.reduce(function (acc, r) { return acc + r.days; }, 0);
            return buildRow(title, [title + ": " + rows.length + " · " + sum + " days"], function () {
                return el("div", {}, rows.map(function (r) {
                    var name = r.item ? r.item.id + " " + r.item.name : r.gate.id + " " + r.gate.name;
                    return el("p", {}, [name + ": " + r.days + " days"]);
                }));
            });
        }
        return el("section", { class: "pr-section", id: "ledger" }, [
            el("h2", {}, ["Ledger"]),
            el("div", { class: "pr-ledger-total" }, [String(ledger.totalDays) + " days"]),
            foldRow("Superseded work", ledger.superseded),
            foldRow("Spawned / added work", ledger.cause),
            foldRow("Descoped work (kept window)", ledger.descoped),
            foldRow("Overdue / late-closed gates", ledger.overdueGates),
        ].filter(Boolean));
    }

    var PlanRenderer = { render: render, _internal: { computeStats: computeStats, computeLedger: computeLedger, workingDaysBetween: workingDaysBetween } };
    global.PlanRenderer = PlanRenderer;
    if (typeof module !== "undefined" && module.exports) module.exports = PlanRenderer;
})(typeof window !== "undefined" ? window : globalThis);
