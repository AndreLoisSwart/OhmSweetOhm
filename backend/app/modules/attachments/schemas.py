from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AttachmentOut(BaseModel):
    model_config = ConfigDict(
        from_attributes=True, json_schema_serialization_defaults_required=True
    )

    id: int
    original_filename: str
    mime_type: str
    size: int
    created_at: datetime
    # Opens in the browser (PDFs and plain images) rather than downloading.
    viewable: bool = False
