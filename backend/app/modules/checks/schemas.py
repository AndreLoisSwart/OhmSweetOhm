from enum import StrEnum

from pydantic import BaseModel


class Severity(StrEnum):
    ERROR = "error"
    WARNING = "warning"
    NOTE = "note"


class CheckResult(BaseModel):
    id: str
    severity: Severity
    message: str
    # The pins it is about, as `ref.PIN`.
    pins: list[str]
    # The net it is about, by name, if any.
    net: str | None = None


class CheckSummary(BaseModel):
    error: int = 0
    warning: int = 0
    note: int = 0


class DesignChecks(BaseModel):
    design_id: int
    summary: CheckSummary
    results: list[CheckResult]
