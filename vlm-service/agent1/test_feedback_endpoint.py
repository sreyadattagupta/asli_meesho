from fastapi.testclient import TestClient

import main


def test_feedback_endpoint_returns_prior():
    c = TestClient(main.app)
    r = c.post("/agent1/feedback", data={"listingId": "L1", "sellerId": "S1",
                                         "decision": "approve", "passes": "3", "fails": "1"})
    assert r.status_code == 200
    body = r.json()
    assert body["indexed"] is False  # no image sent → metadata-only prior update
    assert body["prior"] == 0.6667   # (3+1)/(3+1+2)
