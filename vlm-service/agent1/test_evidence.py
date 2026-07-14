from agent1.evidence import parse_product_html

JSONLD = """<html><head><script type="application/ld+json">
{"@type":"Product","name":"Blue Kurta","brand":{"name":"Libas"},
"offers":{"price":"499","priceCurrency":"INR","seller":{"name":"ShopA"}}}
</script></head><body></body></html>"""

OG = """<html><head>
<meta property="og:title" content="Blue Kurta"/>
<meta property="product:price:amount" content="499"/>
<meta property="product:price:currency" content="INR"/>
</head><body></body></html>"""


def test_parse_jsonld_product():
    d = parse_product_html(JSONLD)
    assert d["title"] == "Blue Kurta" and d["brand"] == "Libas"
    assert d["price"] == 499.0 and d["seller"] == "ShopA"


def test_parse_opengraph_fallback():
    d = parse_product_html(OG)
    assert d["title"] == "Blue Kurta" and d["price"] == 499.0


def test_parse_empty_html_all_none():
    d = parse_product_html("<html></html>")
    assert d["title"] is None and d["price"] is None
