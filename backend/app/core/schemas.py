from typing import Annotated

from pydantic import StringConstraints

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]


def reject_null(value):
    """For PATCH fields that may be left out but not cleared."""
    if value is None:
        raise ValueError("can't be null")
    return value
