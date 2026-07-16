// English strings — the complete key set. hi.ts fills a Partial of this; missing keys fall back here.
export const en = {
  // app chrome
  "app.tagline": "Real seller. Real product. Real size.",
  "app.wordmark": "असली Asli",

  // nav / auth
  "nav.signin": "Sign in",
  "nav.signout": "Sign out",
  "nav.sell": "Sell",
  "nav.shop": "Shop",
  "nav.admin": "Admin",
  "nav.voice.on": "Voice guide on — tap to mute",
  "nav.voice.off": "Voice guide off — tap to unmute",

  // onboarding
  "onboarding.title": "Choose how you want to explore",
  "onboarding.subtitle": "Pick a persona to enter the demo.",
  "onboarding.seller": "Seller",
  "onboarding.seller.hint": "List a product and prove it's real",
  "onboarding.buyer": "Buyer",
  "onboarding.buyer.hint": "Shop verified listings you can trust",
  "onboarding.admin": "Admin",
  "onboarding.admin.hint": "Review escalations in Trust & Safety",
  "onboarding.disclaimer": "Demo provision: in production, Admin is invite-only and Seller requires KYC.",

  // landing
  "landing.cta.signedout": "Sign in to try the demo",
  "landing.cta.seller": "Go to seller studio",
  "landing.cta.buyer": "Browse the marketplace",
  "landing.cta.admin": "Open Trust & Safety",

  // login
  "login.title": "Sign in to Asli",
  "login.google": "Sign in with Google",
  // Google sign-in was removed — this is email + password, hashed with scrypt. Don't describe an
  // auth method the app no longer has.
  "login.privacy": "Your password is stored hashed, never in plain text. All demo data is fictional.",

  // shared states
  "state.loading": "Loading…",
  "state.error": "Something went wrong.",
  "state.retry": "Try again",

  // ── seller flow ────────────────────────────────────────────────────────────
  // upload
  "flow.upload.title": "Upload your catalog photo",
  "flow.upload.subtitle": "This is your listing image. Supplier/catalog photos are welcome — sharing one is normal for resellers.",
  "flow.upload.titleLabel": "Listing title",
  "flow.upload.titlePlaceholder": "e.g. Straight Cotton Kurti — Rose",
  "flow.upload.priceLabel": "Price (₹)",
  "flow.upload.categoryLabel": "Category",
  "flow.upload.choosePhoto": "Click to choose a photo",
  "flow.upload.demoBtn": "Use demo catalog photo",
  "flow.upload.runCheck": "Run image check →",
  "flow.upload.checking": "Checking image…",
  "flow.upload.triggerNote": "We reverse-image search this photo. A hit only triggers a live proof — it never blocks you.",
  "flow.upload.voice": "Upload your catalog photo and fill the listing title, then run the image check.",

  // trigger
  "flow.trigger.pill": "⚡ TRIGGER — not a verdict",
  "flow.trigger.headlineSeen": "This photo appears on {n} places online",
  "flow.trigger.headlineClean": "Photo looks original",
  "flow.trigger.subtitle": "We checked this image across the web — Google, Flipkart, Myntra, Amazon, Meesho and more. That’s normal for a reseller using a supplier’s photo, so we don’t block you. We just ask you to prove you physically hold the item.",
  "flow.trigger.seenOn": "Seen on",
  "flow.trigger.evidenceHeading": "Matching products found online",
  "flow.trigger.marketNote": "Found on {m} marketplaces. Prove possession to list it here anyway.",
  "flow.trigger.cta": "Prove possession — get today’s code →",
  "flow.trigger.voice": "Your photo was seen elsewhere online. That is fine — just prove you hold the product with today's code.",

  // challenge
  "flow.challenge.title": "Prove you hold it",
  "flow.challenge.subtitle": "Type today’s code below, then take a live camera photo of the product itself. The code is time-bound and single-use — a screenshot can’t fake this.",
  "flow.challenge.codeLabel": "Today’s code",
  "flow.challenge.typeCodeLabel": "Type today’s code",
  "flow.challenge.enterCode": "Enter today’s code before verifying.",
  "flow.challenge.expiresIn": "Expires in {s}s",
  "flow.challenge.expired": "Expired",
  "flow.challenge.singleUse": "Single-use · attempt {a}",
  "flow.challenge.newCode": "Get a new code",
  "flow.challenge.retake": "Retake",
  "flow.challenge.verify": "Verify possession →",
  "flow.challenge.verifying": "AI verifying…",
  "flow.challenge.checkProduct": "Checking product",
  "flow.challenge.checkCode": "Confirming code",
  "flow.challenge.checkLive": "Scoring live capture",
  "flow.challenge.capture": "📸 Capture live photo",
  "flow.challenge.cameraOnly": "● LIVE · camera only",
  "flow.challenge.voice": "Type today’s code, then capture a live photo of just your product.",

  // sizing
  "flow.sizing.pill": "✓ Possession proven",
  "flow.sizing.title": "Auto-build the size chart",
  "flow.sizing.subtitle": "Lay the garment flat with an A4 sheet (or a measuring tape) in frame for scale. Add a few photos — the clearest one builds the chart. Real centimetres, no manual entry.",
  "flow.sizing.a4": "A4 sheet",
  "flow.sizing.tape": "Measuring tape",
  "flow.sizing.choosePhoto": "Add flat-lay photo",
  "flow.sizing.addMore": "Add more",
  "flow.sizing.photoCount": "{n} photo(s) — the best-confidence shot builds the chart",
  "flow.sizing.bestShot": "BEST SHOT",
  "flow.sizing.scanBtn": "Scan with A4 guide",
  "flow.sizing.retakePill": "⟳ Retake needed",
  "flow.sizing.retryMeasure": "Retake & measure again",
  "flow.sizing.demoBtn": "Use demo flat-lay photo",
  "flow.sizing.measure": "Measure & auto-fill →",
  "flow.sizing.measuring": "Measuring (10–40s)…",
  "flow.sizing.measuredBadge": "Measured, not guessed",
  "flow.sizing.chest": "Chest",
  "flow.sizing.length": "Length",
  "flow.sizing.waist": "Waist",
  "flow.sizing.continue": "Looks right — continue to review →",
  "flow.sizing.declarePrompt": "What is the actual size of this garment?",
  "flow.sizing.declareHint": "Pick the true tag size — we grade the full chart from your measured garment.",
  "flow.sizing.chooseMethod": "How do you want to add the photo?",
  "flow.sizing.optionUpload": "Upload Image",
  "flow.sizing.optionUploadHint": "Add one or more garment photos (A4 sheet in frame for scale).",
  "flow.sizing.optionCapture": "Capture & Upload",
  "flow.sizing.optionCaptureHint": "Open the camera with an A4 guide — capture auto-sends for measurement.",
  // Measurement is deterministic CV (A4 homography → cm) in vlm-service; the Hugging Face model
  // classifies the garment TYPE. Don't credit the measurement to an engine that didn't do it.
  "flow.sizing.inferenceLabel": "Measured by A4-referenced computer vision · garment type by a Hugging Face model",
  "flow.sizing.inferenceRan": "Measured by the {provider} pipeline — live result, no stored sizes",
  "flow.sizing.declareFirst": "Select the actual size to generate the graded chart.",
  "flow.sizing.gradedTitle": "Generated size chart",
  "flow.sizing.gradedSubtitle": "Measured from your garment, graded across every size.",
  "flow.sizing.shoulder": "Shoulder",
  "flow.sizing.overallConf": "Overall confidence",
  "flow.sizing.perDimConf": "Per-dimension confidence",
  "flow.sizing.anchorRow": "Your garment (measured)",
  "flow.sizing.edited": "edited",
  "flow.sizing.voice": "Lay the garment flat with an A4 sheet in the photo, and I will measure the size for you.",

  // review
  "flow.review.blockedPill": "✕ BLOCKED — possession not proven",
  "flow.review.blockedTitle": "This listing can’t go live",
  "flow.review.blockedNote": "A thief holding only a downloaded image can’t photograph it next to today’s live code. That’s the point.",
  "flow.review.startOver": "Start over",
  "flow.review.escalatedPill": "⚑ HUMAN REVIEW — ambiguous",
  "flow.review.escalatedTitle": "Routed to a Trust & Safety reviewer",
  "flow.review.lockedNote": "Locked pending review — a reviewer will decide in the admin queue. You’ll keep your trust record either way.",
  "flow.review.simNote": "simulated reviewer — sign in as admin for the real queue",
  "flow.review.reject": "Reviewer: reject",
  "flow.review.approve": "Reviewer: approve →",
  "flow.review.readyPill": "✓ Verified — ready to publish",
  "flow.review.title": "Review & publish",
  "flow.review.agent1": "Agent 1 · Possession-Proof",
  "flow.review.agent2": "Agent 2 · Smart Sizing",
  "flow.review.sameProduct": "Same product as catalog",
  "flow.review.codeVisible": "Today’s code visible on slip",
  "flow.review.confVsBar": "Match confidence vs required bar",
  "flow.review.barNote": "Required bar this attempt: {p}% (risk-adaptive)",
  "flow.review.publish": "Approve & publish listing →",
  "flow.review.publishing": "Publishing…",
  "flow.review.voice": "Everything checks out. Review the results and publish your listing.",
  "flow.review.blockedVoice": "This listing was blocked because possession was not proven.",
  "flow.review.escalatedVoice": "Your listing was sent to a human reviewer. You will keep your trust record either way.",

  // result
  "flow.result.title": "Your listing is live",
  "flow.result.subtitle": "Possession proven with today’s live code, size chart measured — not guessed. Buyers see a listing they can trust.",
  "flow.result.products": "View in my products →",
  "flow.result.another": "List another product",
  "flow.result.voice": "Congratulations! Your listing is live and Asli Verified.",
} as const;

export type I18nKey = keyof typeof en;
