import numpy as np
from landmarks import landmarks_from_mask


def _tshirt_mask():
    # 200x160 mask: wide shoulders/sleeves band up top, narrower body below — a crude tee silhouette.
    m = np.zeros((200, 160), np.uint8)
    m[20:60, 10:150] = 1     # shoulders + sleeves (wide)
    m[60:190, 45:115] = 1    # body (narrow)
    return m


def test_finds_wide_shoulder_above_narrow_waist():
    m = _tshirt_mask()
    lm = landmarks_from_mask(m, (10, 20, 150, 190))
    sw = lm["shoulder"][2] - lm["shoulder"][0]
    ww = lm["waist"][2] - lm["waist"][0]
    assert sw > ww                       # shoulders wider than waist
    assert lm["length"][3] - lm["length"][1] > 100   # vertical body length spans most of the mask
    assert 0.0 <= lm["landmark_conf"] <= 1.0
