"""vf-plans: the plans engine (REF-Plan). Hexagonal: domain/ and usecases/
import no web framework, no database driver and no adapter module
(INT-PLANS-028); every door (backend.adapters.http, .mcp) and the
Export Composer (backend.adapters.export) enter through the same
backend.usecases.service.PlanService.
"""

__version__ = "0.1.0"
