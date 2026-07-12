"""Single source of truth for VLM prompts.

Both jobs force the model to return STRICT JSON only — no prose, no markdown.
Keep all prompt wording here so verification/measurement logic lives in one place.
"""


def match_prompt(code: str) -> str:
    """Agent 1 — Possession-Proof.

    ONE composite image is sent: LEFT half = catalog photo, RIGHT half = live camera
    photo of the real product next to a slip showing the challenge code.
    """
    return f"""You are a strict product-verification vision agent for an e-commerce listing flow.

You are given ONE image split into two halves by a black divider line:
- LEFT half (purple banner "CATALOG") = the seller's catalog/listing photo.
- RIGHT half (pink banner "LIVE PHOTO") = a live camera photo the seller just took of
  the real product, with a handwritten slip of paper next to it showing a challenge code.

The expected challenge code is: "{code}"

Compare the LEFT and RIGHT halves and decide:
1. same_item  — does the RIGHT half show the SAME product as the LEFT half? (same garment
   type, color, pattern, key features). Minor angle/lighting differences are fine.
2. code_visible — is the exact code "{code}" clearly written and readable on the slip in
   the RIGHT half? It must match exactly, character for character.
3. confidence — your overall confidence from 0.0 to 1.0.

Return STRICT JSON ONLY. No markdown, no backticks, no extra text. Exactly this shape:
{{"same_item": true, "code_visible": true, "confidence": 0.0, "reason": "short explanation"}}"""


def measure_prompt(reference_object: str) -> str:
    """Agent 2 — Smart Sizing.

    One image is sent: a garment laid flat with a reference object in frame for scale.
    """
    ref_desc = {
        "a4": "an A4 sheet of paper (real size 21.0 cm wide x 29.7 cm tall)",
        "tape": "a measuring tape (use its printed cm markings for scale)",
    }.get(reference_object, f"a reference object of type '{reference_object}'")

    return f"""You are a garment-measurement vision agent.

You are given ONE image: a garment laid flat on a surface with {ref_desc} in the frame
to use as a known real-world scale reference.

Steps:
1. Use the reference object to calibrate pixels -> centimeters.
2. Measure the garment's key dimensions in centimeters:
   - chest_cm  — flat-lay width across the chest (pit to pit) in cm.
   - length_cm — top (shoulder/collar) to bottom hem in cm.
   - waist_cm  — flat width at the narrowest waist point in cm.

Return STRICT JSON ONLY. No markdown, no backticks, no extra text. Exactly this shape:
{{"chest_cm": 0.0, "length_cm": 0.0, "waist_cm": 0.0, "reference_used": "{reference_object}", "confidence": 0.0}}"""
