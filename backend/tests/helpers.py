def login(client, email: str) -> dict:
    r = client.post("/auth/login", json={"email": email, "password": "ward1234"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}
