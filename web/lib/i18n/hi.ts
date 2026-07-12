// Hindi strings — Partial of en; anything missing falls back to English.
import type { en } from "./en";

export const hi: Partial<Record<keyof typeof en, string>> = {
  "nav.signin": "साइन इन",
  "nav.signout": "साइन आउट",
  "nav.sell": "बेचें",
  "nav.shop": "खरीदें",
  "nav.admin": "एडमिन",

  "onboarding.title": "चुनें कि आप कैसे देखना चाहते हैं",
  "onboarding.subtitle": "डेमो में जाने के लिए एक भूमिका चुनें।",
  "onboarding.seller": "विक्रेता",
  "onboarding.seller.hint": "प्रोडक्ट लिस्ट करें और साबित करें कि वह असली है",
  "onboarding.buyer": "खरीदार",
  "onboarding.buyer.hint": "सत्यापित लिस्टिंग खरीदें जिन पर भरोसा हो",
  "onboarding.admin": "एडमिन",
  "onboarding.admin.hint": "ट्रस्ट और सेफ़्टी में एस्केलेशन देखें",

  "login.title": "Asli में साइन इन करें",
  "login.google": "Google से साइन इन करें",

  "state.loading": "लोड हो रहा है…",
  "state.error": "कुछ गलत हो गया।",
  "state.retry": "फिर कोशिश करें",
};
