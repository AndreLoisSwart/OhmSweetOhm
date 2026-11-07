def test_crud_and_counts(api):
    tag = api.post("/api/tags", json={"name": "Sensor"}).json()
    api.post("/api/parts", json={"name": "BME280", "kind": "sensor", "tag_ids": [tag["id"]]})
    assert api.get("/api/tags").json() == [
        {"id": tag["id"], "name": "Sensor", "part_count": 1, "design_count": 0}
    ]
    assert api.patch(f"/api/tags/{tag['id']}", json={"name": "I2C"}).json()["name"] == "I2C"


def test_names_are_unique_ignoring_case(api):
    tag = api.post("/api/tags", json={"name": "Sensor"}).json()
    res = api.post("/api/tags", json={"name": "sensor"})
    assert res.status_code == 409
    assert res.json()["detail"] == 'A tag named "Sensor" already exists'
    # Changing only the case of its own name is fine.
    assert api.patch(f"/api/tags/{tag['id']}", json={"name": "sensor"}).status_code == 200


def test_delete_removes_it_from_parts(api):
    tag = api.post("/api/tags", json={"name": "Sensor"}).json()
    part = api.post("/api/parts", json={"name": "BME280", "kind": "sensor", "tag_ids": [tag["id"]]})
    assert api.delete(f"/api/tags/{tag['id']}").status_code == 204
    assert api.get(f"/api/parts/{part.json()['id']}").json()["tags"] == []
