import hub


def test_sync_grading_no_repo_keeps_cache(monkeypatch):
    monkeypatch.delenv("HF_GRADER_REPO", raising=False)
    assert hub.sync_grading() is False            # offline path, no exception, cache untouched


def test_landmark_endpoint_reads_env(monkeypatch):
    monkeypatch.setenv("HF_LANDMARK_ENDPOINT", "https://x.endpoints.huggingface.cloud")
    assert hub.landmark_endpoint().startswith("https://")
    monkeypatch.delenv("HF_LANDMARK_ENDPOINT")
    assert hub.landmark_endpoint() is None
