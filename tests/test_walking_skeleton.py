"""The suite's first line of defense: the hexagonal boundary claim
(INT-PLANS-028, STD-001). domain/ and usecases/ import no web
framework, no database driver and no adapter module. The cockpit shell's
claim, INT-PLANS-001, attests through e2e/ (component PlanCockpit).
"""

from __future__ import annotations

import ast
from pathlib import Path

from pytest_intent import intent

_REPO = Path(__file__).resolve().parents[1]
_FORBIDDEN_ROOTS = ("fastapi", "starlette", "psycopg", "mcp", "uvicorn")


def _imported_modules(py_file: Path) -> set[str]:
    tree = ast.parse(py_file.read_text(encoding="utf-8"), filename=str(py_file))
    modules: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            modules.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module and node.level == 0:
            modules.add(node.module)
    return modules


@intent("INT-PLANS-028")
def test_domain_and_usecases_import_no_framework_no_driver_no_adapter() -> None:
    for layer in ("domain", "usecases"):
        layer_dir = _REPO / "backend" / layer
        assert layer_dir.is_dir(), f"backend/{layer}/ is missing"
        for py_file in layer_dir.rglob("*.py"):
            modules = _imported_modules(py_file)
            roots = {m.split(".")[0] for m in modules}
            forbidden = roots & set(_FORBIDDEN_ROOTS)
            assert not forbidden, f"{py_file.relative_to(_REPO)} imports {forbidden}, forbidden in {layer}/"
            adapter_imports = {m for m in modules if m == "backend.adapters" or m.startswith("backend.adapters.")}
            assert not adapter_imports, f"{py_file.relative_to(_REPO)} imports an adapter module: {adapter_imports}"
