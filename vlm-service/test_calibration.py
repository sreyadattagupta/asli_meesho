from calibration import dimension_confidence


def test_more_agreeing_images_raise_confidence():
    few = dimension_confidence(1, 0.0, 0.8, 0.8, 0.05, 0.1)
    many = dimension_confidence(4, 0.0, 0.8, 0.8, 0.05, 0.1)
    assert 0.0 <= few <= many <= 1.0


def test_disagreement_lowers_confidence():
    tight = dimension_confidence(3, 0.02, 0.8, 0.8, 0.05, 0.1)
    loose = dimension_confidence(3, 0.25, 0.8, 0.8, 0.05, 0.1)
    assert loose < tight


def test_bad_geometry_lowers_confidence():
    good = dimension_confidence(3, 0.02, 0.8, 0.8, 0.02, 0.05)
    bad = dimension_confidence(3, 0.02, 0.8, 0.8, 0.40, 0.50)
    assert bad < good
