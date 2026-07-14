import io

from PIL import Image

from agent1.feedback import beta_prior, record_case


def _img(color=(70, 140, 90)) -> bytes:
    b = io.BytesIO()
    Image.new("RGB", (96, 96), color).save(b, "PNG")
    return b.getvalue()


def test_beta_prior_cold_start_is_half():
    assert beta_prior(0, 0) == 0.5


def test_beta_prior_monotonic_and_bounded():
    assert beta_prior(10, 0) > beta_prior(1, 0) > beta_prior(0, 0)
    assert beta_prior(0, 10) < beta_prior(0, 1) < beta_prior(0, 0)
    assert 0.0 < beta_prior(3, 7) < 1.0


def test_record_case_indexes_embedding():
    r = record_case(_img(), {"listing_id": "L1", "seller_id": "S1", "verified": True})
    assert r["indexed"] is True
    assert isinstance(r["image_hash"], str) and len(r["image_hash"]) > 0
