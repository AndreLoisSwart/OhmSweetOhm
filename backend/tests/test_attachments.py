import time

import pytest

from app.core import config


@pytest.fixture(autouse=True)
def data_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(config.settings, "data_dir", tmp_path)
    return tmp_path


def files_on_disk(data_dir):
    return sorted(p.name for p in (data_dir / "attachments").iterdir())


def part(api):
    return api.post("/api/parts", json={"name": "BME280", "kind": "sensor"}).json()["id"]


def upload(api, owner_id, filename, content=b"data", owner_type="part"):
    return api.post(
        "/api/attachments",
        data={"owner_type": owner_type, "owner_id": str(owner_id)},
        files={"file": (filename, content, "text/plain")},
    )


def test_upload_list_download_delete(api, data_dir):
    owner = part(api)
    res = upload(api, owner, "manual.pdf", b"%PDF-1.4 hello")
    assert res.status_code == 201
    att = res.json()
    assert (att["original_filename"], att["mime_type"], att["size"]) == (
        "manual.pdf",
        "application/pdf",
        14,
    )
    assert att["viewable"] is True
    stored = files_on_disk(data_dir)
    assert len(stored) == 1 and "manual" not in stored[0]  # generated name, not the upload's

    listed = api.get(f"/api/attachments?owner_type=part&owner_id={owner}").json()
    assert [a["id"] for a in listed] == [att["id"]]

    file = api.get(f"/api/attachments/{att['id']}/file")
    assert file.content == b"%PDF-1.4 hello"
    assert file.headers["content-type"] == "application/pdf"
    assert file.headers["content-disposition"].startswith("inline")

    assert api.delete(f"/api/attachments/{att['id']}").status_code == 204
    assert files_on_disk(data_dir) == []


@pytest.mark.parametrize(
    "filename", ["page.html", "drawing.svg", "data.xml", "script.js", "notes.txt", "noext"]
)
def test_risky_or_unknown_types_download_instead_of_opening(api, filename):
    att = upload(api, part(api), filename, b"<script>alert(1)</script>").json()
    assert att["viewable"] is False
    file = api.get(f"/api/attachments/{att['id']}/file")
    assert file.headers["content-type"] == "application/octet-stream"
    assert file.headers["content-disposition"].startswith("attachment")
    assert file.headers["x-content-type-options"] == "nosniff"


def test_images_open_with_a_locked_down_policy(api):
    att = upload(api, part(api), "photo.JPG", b"\xff\xd8\xff").json()
    file = api.get(f"/api/attachments/{att['id']}/file")
    assert file.headers["content-type"] == "image/jpeg"
    assert file.headers["content-disposition"].startswith("inline")
    assert "sandbox" in file.headers["content-security-policy"]
    assert file.headers["x-content-type-options"] == "nosniff"


def test_original_name_is_kept_for_download(api):
    att = upload(api, part(api), "Bosch GTS 10 – manual.pdf").json()
    disposition = api.get(f"/api/attachments/{att['id']}/file").headers["content-disposition"]
    assert "filename*=utf-8''Bosch%20GTS%2010%20%E2%80%93%20manual.pdf" in disposition


def test_path_in_filename_is_dropped(api):
    att = upload(api, part(api), "..\\..\\evil/../../secret.pdf").json()
    assert att["original_filename"] == "secret.pdf"


def test_size_limit(api, data_dir, monkeypatch):
    monkeypatch.setattr(config.settings, "max_upload_mb", 1)
    owner = part(api)
    res = upload(api, owner, "big.bin", b"x" * (1024 * 1024 + 1))
    assert res.status_code == 413
    assert res.json()["detail"] == "Files can be at most 1 MB"
    assert files_on_disk(data_dir) == []  # the partial file is removed
    assert upload(api, owner, "ok.bin", b"x" * 1024 * 1024).status_code == 201


def test_unknown_owner(api, data_dir):
    assert upload(api, 99, "a.pdf").status_code == 404
    assert not (data_dir / "attachments").exists() or files_on_disk(data_dir) == []


def test_deleting_part_removes_files(api, data_dir):
    owner = part(api)
    att = upload(api, owner, "a.pdf").json()
    assert api.delete(f"/api/parts/{owner}").status_code == 204
    assert files_on_disk(data_dir) == []
    assert api.get(f"/api/attachments/{att['id']}/file").status_code == 404


def test_uploads_touch_the_part(api):
    owner = part(api)
    before = api.get(f"/api/parts/{owner}").json()["updated_at"]
    time.sleep(0.01)
    upload(api, owner, "a.pdf")
    assert api.get(f"/api/parts/{owner}").json()["updated_at"] > before


def test_files_are_revalidated_not_cached(api):
    # Ids can be reused after a delete, so a cached file could show under the wrong id.
    att = upload(api, part(api), "a.pdf").json()
    file = api.get(f"/api/attachments/{att['id']}/file")
    assert "no-cache" in file.headers["cache-control"]
    assert file.headers["etag"]


def test_designs_have_files_too(api, data_dir):
    design = api.post("/api/designs", json={"name": "Station"}).json()["id"]
    att = upload(api, design, "wiring.png", owner_type="design")
    assert att.status_code == 201
    listed = api.get(f"/api/attachments?owner_type=design&owner_id={design}").json()
    assert [a["id"] for a in listed] == [att.json()["id"]]
    api.delete(f"/api/designs/{design}")
    assert files_on_disk(data_dir) == []
