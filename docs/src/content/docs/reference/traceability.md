---
title: Traceability
id: DOC-TRACEABILITY
type: Reference
summary: "The 35 requirement IDs of the P1 spine, mapped onto this repo's 46 intent claims, with the one descoped requirement recorded."
status: Active
updated: "2026-10-04"
---

`STD-003` requires the proposal's requirement IDs to be traced by intent tests; `intent.yaml`'s own `derived_from` fields carry the mapping, and `tests/test_traceability.py` (`INT-PLANS-030`) checks it mechanically against the table below.

## Descoped

| REQ | Why |
| --- | --- |
| POS-001 | States that vf-plans is delivered through the standard delivery line - a fact about this delivery process, not the software, which no test in this repo can decide. Attested operationally by the delivery line itself: four recorded gates and the evidence chain, reachable from the `delivered/vf-plans/P1` tag. |

## Requirement to claim

| REQ | Attested by (INT-PLANS-*) |
| --- | --- |
| POS-002 | 001, 007 |
| PLN-001 | 002 |
| PLN-002 | 003 |
| PLN-003 | 004, 005 |
| UI-001 | 001, 006, 039 |
| UI-002 | 008, 009, 010, 011, 012, 037, 038 |
| UI-003 | 013 |
| UI-004 | 014 |
| UI-005 | 007 |
| API-001 | 015 |
| API-002 | 016 |
| API-003 | 017 |
| MCP-001 | 018, 043, 045 |
| MCP-002 | 036, 041 |
| EXP-001 | 019, 020, 039, 046 |
| VER-001 | 021, 022 |
| VER-002 | 023 |
| VER-003 | 024 |
| VER-004 | 025 |
| IMP-001 | 026 |
| IMP-002 | 027 |
| STD-001 | 028 |
| STD-002 | 029 |
| STD-003 | 030 |
| STD-004 | 031 |
| PLT-001 | 032, 044 (two halves descoped to the evidence chain: the manifest's `mcp: true` entry lives in the install's teams folder, and whether the grants are onboarded is a studio read) |
| BND-001 | 033 |
| BND-002 | 034 |
| BND-003 | 035, 042, 043 |
| BND-004 | 036 |
| DONE-001 | 037, 040, 042 |
| DONE-002 | 041, 043 |
| DONE-003 | 027 |
| DONE-004 | 038 (its live-and-conformance-green half is descoped to the evidence chain) |

All 35 requirement IDs are accounted for: 34 by a claim above, one (`POS-001`) explicitly descoped.
