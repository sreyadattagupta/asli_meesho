from training.fit_grading import fit_grades, evaluate, load_rows   # pure fns; no Hub/network in tests


def _rows():
    """Load via the PRODUCTION loader (offline CSV source), not a hand-copied cast list.

    The old helper duplicated the float-cast column list, so when hip_cm/neck_cm were added to DIMS
    and the CSV the helper kept them as strings and every fit blew up in `np.allclose(y, 0.0)` on a
    '<U4' array. Casting is the loader's job — calling it here keeps the test honest about what
    production actually does and cannot drift out of sync with DIMS again.
    """
    return load_rows(source="csv")


def test_fit_recovers_linear_slope_for_top_chest():
    params = fit_grades(_rows())
    slope = params["categories"]["top"]["dims"]["chest_cm"]["slope"]
    assert abs(slope - 2.5) < 0.05          # CSV grades chest 2.5 cm / size step


def test_eval_reports_metrics_and_low_error_on_linear_data():
    rep = evaluate(_rows())
    assert set(rep["overall"]) >= {"mae","rmse","r2"}
    assert rep["overall"]["r2"] > 0.99      # data is near-linear by construction
    assert rep["overall"]["mae"] < 1.0


from grading import grade_chart


def test_anchor_row_equals_measured():
    m = {"chest_cm": 55.0, "waist_cm": 47.0, "length_cm": 68.0, "shoulder_cm": 42.0, "sleeve_cm": 23.0}
    chart = grade_chart("top", "XXL", m)
    row = next(r for r in chart["sizes"] if r["size"] == "XXL")
    assert row["chest_cm"] == 55.0 and row["waist_cm"] == 47.0


def test_grades_down_and_up_by_slope():
    m = {"chest_cm": 55.0, "waist_cm": 47.0, "length_cm": 68.0, "shoulder_cm": 42.0, "sleeve_cm": 23.0}
    chart = grade_chart("top", "XXL", m)     # top chest slope 2.5/step; XXL=5
    xl = next(r for r in chart["sizes"] if r["size"] == "XL")   # one step down
    assert abs(xl["chest_cm"] - 52.5) < 0.01
    xxxl = next(r for r in chart["sizes"] if r["size"] == "XXXL")  # one step up
    assert abs(xxxl["chest_cm"] - 57.5) < 0.01
