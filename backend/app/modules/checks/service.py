from app.modules.checks.context import Context
from app.modules.checks.rules import RULES
from app.modules.checks.schemas import CheckSummary, DesignChecks, Severity
from app.modules.designs.models import Design

ORDER = list(Severity)


def run_checks(design: Design) -> DesignChecks:
    """Every rule, on the design as it is now. Computed each time, never stored."""
    ctx = Context.build(design)
    results = [result for rule in RULES for result in rule(ctx)]
    results.sort(key=lambda r: ORDER.index(r.severity))
    summary = CheckSummary()
    for result in results:
        setattr(summary, result.severity, getattr(summary, result.severity) + 1)
    return DesignChecks(design_id=design.id, summary=summary, results=results)
