import csv, pathlib
from training.fit_grading import fit_grades, evaluate   # pure fns; no Hub/network in tests


def _rows():
    p = pathlib.Path(__file__).parent / "data" / "grading_specs.csv"
    with p.open() as f:
        return [ {**r, **{k: float(r[k]) for k in
                 ("size_ord","chest_cm","waist_cm","length_cm","shoulder_cm","sleeve_cm")}}
                 for r in csv.DictReader(f) ]


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
