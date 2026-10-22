from app.geocode import locate_text, lookup


def test_city_beats_country_and_first_mention_wins():
    place = locate_text("Shelling hits Kharkiv as Kyiv warns of new offensive")
    assert place.label == "Kharkiv, Ukraine" and place.kind == "city"


def test_longest_name_wins_so_south_sudan_is_not_sudan():
    assert locate_text("Floods in South Sudan displace thousands").label == "South Sudan"
    assert locate_text("Sudan conflict deepens").label == "Sudan"


def test_niger_is_not_nigeria_and_vice_versa():
    assert locate_text("Niger coup").label == "Niger"
    assert locate_text("Nigeria floods").label == "Nigeria"


def test_case_sensitive_so_the_bird_is_not_the_country():
    assert locate_text("turkey recipes for dinner") is None
    assert locate_text("Turkey earthquake").label == "Turkey"


def test_aliases_and_regions():
    assert locate_text("Protests in Kiev").label == "Kyiv, Ukraine"
    assert locate_text("Wildfires near Texas").label == "Texas, United States"
    assert locate_text("UK strikes").label == "United Kingdom"


def test_no_place_named_returns_none_instead_of_a_guess():
    assert locate_text("Protests erupt in capital") is None
    assert locate_text("") is None and locate_text(None) is None


def test_publisher_country_fallback_is_unchanged():
    assert lookup("Malaysia") == (4.2105, 101.9758)
    assert lookup("Unknown Nowhereland") == (0.0, 0.0)
    assert lookup("USA") == lookup("United States")
