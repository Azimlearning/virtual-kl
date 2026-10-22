"""A small built-in gazetteer: place name -> coordinates.

Why it exists: GDELT and news APIs give headlines, not coordinates. The
prototype pinned every GDELT event to the centroid of the country that
PUBLISHED the article - which is the wrong place whenever a UK outlet writes
about Ukraine - and fell back to (0, 0) ("Null Island") for unknown
countries. `locate_text()` instead looks for a place the headline actually
NAMES (a city first, then a US state, then a country) and only falls back to
the publisher's country when the text names nothing.

Honest limits (worth stating in the dissertation):
  * It is a dictionary lookup, not NLP: ~130 major cities, ~140 countries,
    a few US states. A headline about a small town resolves to its country
    or not at all.
  * Matching is case-sensitive on capitalised names ("Turkey" the country,
    not "turkey" the bird) and a few names that are also common words or
    first names (Jordan, Georgia, Chad, Guinea) are deliberately left out
    rather than risk wrong pins.
  * Coordinates are approximate centroids, fine for a world map, not for
    navigation.
"""

import re
from typing import NamedTuple


class Place(NamedTuple):
    label: str  # "Kyiv, Ukraine" / "Texas, United States" / "Japan"
    lat: float
    lon: float
    kind: str  # "city" | "region" | "country"


COUNTRY_CENTROIDS: dict[str, tuple[float, float]] = {
    "Afghanistan": (33.94, 67.71), "Albania": (41.15, 20.17), "Algeria": (28.03, 1.66),
    "Angola": (-11.20, 17.87), "Argentina": (-38.42, -63.62), "Armenia": (40.07, 45.04),
    "Australia": (-25.27, 133.78), "Austria": (47.52, 14.55), "Azerbaijan": (40.14, 47.58),
    "Bangladesh": (23.68, 90.36), "Belarus": (53.71, 27.95), "Belgium": (50.50, 4.47),
    "Bhutan": (27.51, 90.43), "Bolivia": (-16.29, -63.59), "Bosnia and Herzegovina": (43.92, 17.68),
    "Brazil": (-14.2350, -51.9253), "Brunei": (4.54, 114.73), "Bulgaria": (42.73, 25.49),
    "Burkina Faso": (12.24, -1.56), "Burundi": (-3.37, 29.92), "Cambodia": (12.57, 104.99),
    "Cameroon": (7.37, 12.35), "Canada": (56.13, -106.35), "Central African Republic": (6.61, 20.94),
    "Chile": (-35.68, -71.54), "China": (35.8617, 104.1954), "Colombia": (4.57, -74.30),
    "Costa Rica": (9.75, -83.75), "Croatia": (45.10, 15.20), "Cuba": (21.52, -77.78),
    "Cyprus": (35.13, 33.43), "Czech Republic": (49.82, 15.47),
    "Democratic Republic of the Congo": (-4.04, 21.76), "Denmark": (56.26, 9.50),
    "Dominican Republic": (18.74, -70.16), "Ecuador": (-1.83, -78.18), "Egypt": (26.82, 30.80),
    "El Salvador": (13.79, -88.90), "Eritrea": (15.18, 39.78), "Estonia": (58.60, 25.01),
    "Ethiopia": (9.15, 40.49), "Fiji": (-17.71, 178.07), "Finland": (61.92, 25.75),
    "France": (46.6034, 1.8883), "Gabon": (-0.80, 11.61), "Germany": (51.1657, 10.4515),
    "Ghana": (7.95, -1.02), "Greece": (39.07, 21.82), "Guatemala": (15.78, -90.23),
    "Haiti": (18.97, -72.29), "Honduras": (15.20, -86.24), "Hungary": (47.16, 19.50),
    "Iceland": (64.96, -19.02), "India": (20.5937, 78.9629), "Indonesia": (-0.7893, 113.9213),
    "Iran": (32.43, 53.69), "Iraq": (33.22, 43.68), "Ireland": (53.41, -8.24),
    "Israel": (31.05, 34.85), "Italy": (41.87, 12.57), "Ivory Coast": (7.54, -5.55),
    "Jamaica": (18.11, -77.30), "Japan": (36.2048, 138.2529), "Kazakhstan": (48.02, 66.92),
    "Kenya": (-0.02, 37.91), "Kuwait": (29.31, 47.48), "Kyrgyzstan": (41.20, 74.77),
    "Laos": (19.86, 102.50), "Latvia": (56.88, 24.60), "Lebanon": (33.85, 35.86),
    "Liberia": (6.43, -9.43), "Libya": (26.34, 17.23), "Lithuania": (55.17, 23.88),
    "Madagascar": (-18.77, 46.87), "Malawi": (-13.25, 34.30), "Malaysia": (4.2105, 101.9758),
    "Mali": (17.57, -3.99), "Mauritania": (21.01, -10.94), "Mexico": (23.63, -102.55),
    "Moldova": (47.41, 28.37), "Mongolia": (46.86, 103.85), "Morocco": (31.79, -7.09),
    "Mozambique": (-18.67, 35.53), "Myanmar": (21.9162, 95.9560), "Namibia": (-22.96, 18.49),
    "Nepal": (28.39, 84.12), "Netherlands": (52.13, 5.29), "New Zealand": (-40.90, 174.89),
    "Nicaragua": (12.87, -85.21), "Niger": (17.61, 8.08), "Nigeria": (9.0820, 8.6753),
    "North Korea": (40.34, 127.51), "Norway": (60.47, 8.47), "Oman": (21.51, 55.92),
    "Pakistan": (30.38, 69.35), "Palestine": (31.95, 35.23), "Panama": (8.54, -80.78),
    "Papua New Guinea": (-6.31, 143.96), "Paraguay": (-23.44, -58.44), "Peru": (-9.19, -75.02),
    "Philippines": (12.8797, 121.7740), "Poland": (51.92, 19.15), "Portugal": (39.40, -8.22),
    "Qatar": (25.35, 51.18), "Romania": (45.94, 24.97), "Russia": (61.52, 105.32),
    "Rwanda": (-1.94, 29.87), "Saudi Arabia": (23.89, 45.08), "Senegal": (14.50, -14.45),
    "Serbia": (44.02, 21.01), "Sierra Leone": (8.46, -11.78), "Singapore": (1.3521, 103.8198),
    "Slovakia": (48.67, 19.70), "Slovenia": (46.15, 14.99), "Somalia": (5.15, 46.20),
    "South Africa": (-30.5595, 22.9375), "South Korea": (35.91, 127.77), "South Sudan": (6.88, 31.31),
    "Spain": (40.46, -3.75), "Sri Lanka": (7.87, 80.77), "Sudan": (12.86, 30.22),
    "Sweden": (60.13, 18.64), "Switzerland": (46.82, 8.23), "Syria": (34.80, 38.997),
    "Taiwan": (23.70, 120.96), "Tajikistan": (38.86, 71.28), "Tanzania": (-6.37, 34.89),
    "Thailand": (15.8700, 100.9925), "Togo": (8.62, 0.82), "Tunisia": (33.89, 9.54),
    "Turkey": (38.96, 35.24), "Turkmenistan": (38.97, 59.56), "Uganda": (1.37, 32.29),
    "Ukraine": (48.38, 31.17), "United Arab Emirates": (23.42, 53.85),
    "United Kingdom": (55.3781, -3.4360), "United States": (37.0902, -95.7129),
    "Uruguay": (-32.52, -55.77), "Uzbekistan": (41.38, 64.59), "Venezuela": (6.42, -66.59),
    "Vietnam": (14.0583, 108.2772), "Yemen": (15.55, 48.52), "Zambia": (-13.13, 27.85),
    "Zimbabwe": (-19.02, 29.15),
}

# Alternative names people actually write, mapped to the canonical name above.
COUNTRY_ALIASES: dict[str, str] = {
    "USA": "United States", "U.S.": "United States", "US": "United States",
    "UK": "United Kingdom", "Britain": "United Kingdom", "England": "United Kingdom",
    "Scotland": "United Kingdom", "UAE": "United Arab Emirates",
    "DR Congo": "Democratic Republic of the Congo", "DRC": "Democratic Republic of the Congo",
    "Burma": "Myanmar", "Czechia": "Czech Republic", "Türkiye": "Turkey", "Turkiye": "Turkey",
    "Côte d'Ivoire": "Ivory Coast", "Russian": "Russia",
}

# A few US states that dominate disaster news (hurricanes, wildfires, quakes).
REGION_CENTROIDS: dict[str, tuple[float, float, str]] = {
    "California": (36.78, -119.42, "United States"), "Texas": (31.97, -99.90, "United States"),
    "Florida": (27.66, -81.52, "United States"), "Alaska": (64.20, -149.49, "United States"),
    "Hawaii": (19.90, -155.58, "United States"), "Louisiana": (31.17, -91.87, "United States"),
    "Oregon": (43.80, -120.55, "United States"),
}

# (city, country, lat, lon)
CITIES: list[tuple[str, str, float, float]] = [
    ("Manila", "Philippines", 14.5995, 120.9842), ("Cebu City", "Philippines", 10.3157, 123.8854),
    ("Davao", "Philippines", 7.1907, 125.4553), ("Jakarta", "Indonesia", -6.2088, 106.8456),
    ("Surabaya", "Indonesia", -7.2575, 112.7521), ("Bandung", "Indonesia", -6.9175, 107.6191),
    ("Kuala Lumpur", "Malaysia", 3.1390, 101.6869), ("Penang", "Malaysia", 5.4164, 100.3327),
    ("Bangkok", "Thailand", 13.7563, 100.5018), ("Chiang Mai", "Thailand", 18.7883, 98.9853),
    ("Hanoi", "Vietnam", 21.0278, 105.8342), ("Ho Chi Minh City", "Vietnam", 10.8231, 106.6297),
    ("Yangon", "Myanmar", 16.8409, 96.1735), ("Naypyidaw", "Myanmar", 19.7633, 96.0785),
    ("Phnom Penh", "Cambodia", 11.5564, 104.9282), ("Dhaka", "Bangladesh", 23.8103, 90.4125),
    ("Chittagong", "Bangladesh", 22.3569, 91.7832), ("Kolkata", "India", 22.5726, 88.3639),
    ("Mumbai", "India", 19.0760, 72.8777), ("New Delhi", "India", 28.6139, 77.2090),
    ("Delhi", "India", 28.7041, 77.1025), ("Chennai", "India", 13.0827, 80.2707),
    ("Bengaluru", "India", 12.9716, 77.5946), ("Hyderabad", "India", 17.3850, 78.4867),
    ("Karachi", "Pakistan", 24.8607, 67.0011), ("Lahore", "Pakistan", 31.5204, 74.3587),
    ("Islamabad", "Pakistan", 33.6844, 73.0479), ("Kabul", "Afghanistan", 34.5553, 69.2075),
    ("Kathmandu", "Nepal", 27.7172, 85.3240), ("Colombo", "Sri Lanka", 6.9271, 79.8612),
    ("Tehran", "Iran", 35.6892, 51.3890), ("Baghdad", "Iraq", 33.3152, 44.3661),
    ("Damascus", "Syria", 33.5138, 36.2765), ("Aleppo", "Syria", 36.2021, 37.1343),
    ("Beirut", "Lebanon", 33.8938, 35.5018), ("Jerusalem", "Israel", 31.7683, 35.2137),
    ("Tel Aviv", "Israel", 32.0853, 34.7818), ("Gaza", "Palestine", 31.5017, 34.4668),
    ("Amman", "Jordan", 31.9454, 35.9284), ("Riyadh", "Saudi Arabia", 24.7136, 46.6753),
    ("Jeddah", "Saudi Arabia", 21.4858, 39.1925), ("Dubai", "United Arab Emirates", 25.2048, 55.2708),
    ("Doha", "Qatar", 25.2854, 51.5310), ("Sanaa", "Yemen", 15.3694, 44.1910),
    ("Aden", "Yemen", 12.7855, 45.0187), ("Istanbul", "Turkey", 41.0082, 28.9784),
    ("Ankara", "Turkey", 39.9334, 32.8597), ("Cairo", "Egypt", 30.0444, 31.2357),
    ("Khartoum", "Sudan", 15.5007, 32.5599), ("Port Sudan", "Sudan", 19.6158, 37.2164),
    ("Addis Ababa", "Ethiopia", 9.0320, 38.7469), ("Nairobi", "Kenya", -1.2921, 36.8219),
    ("Mogadishu", "Somalia", 2.0469, 45.3182), ("Kampala", "Uganda", 0.3476, 32.5825),
    ("Kinshasa", "Democratic Republic of the Congo", -4.4419, 15.2663),
    ("Goma", "Democratic Republic of the Congo", -1.6792, 29.2228),
    ("Lagos", "Nigeria", 6.5244, 3.3792), ("Abuja", "Nigeria", 9.0765, 7.3986),
    ("Accra", "Ghana", 5.6037, -0.1870), ("Dakar", "Senegal", 14.7167, -17.4677),
    ("Bamako", "Mali", 12.6392, -8.0029), ("Ouagadougou", "Burkina Faso", 12.3714, -1.5197),
    ("Niamey", "Niger", 13.5116, 2.1254), ("Tripoli", "Libya", 32.8872, 13.1913),
    ("Tunis", "Tunisia", 36.8065, 10.1815), ("Algiers", "Algeria", 36.7538, 3.0588),
    ("Casablanca", "Morocco", 33.5731, -7.5898), ("Johannesburg", "South Africa", -26.2041, 28.0473),
    ("Cape Town", "South Africa", -33.9249, 18.4241), ("Durban", "South Africa", -29.8587, 31.0218),
    ("Maputo", "Mozambique", -25.9692, 32.5732), ("Antananarivo", "Madagascar", -18.8792, 47.5079),
    ("Luanda", "Angola", -8.8390, 13.2894), ("Harare", "Zimbabwe", -17.8252, 31.0335),
    ("Lusaka", "Zambia", -15.3875, 28.3228), ("Dar es Salaam", "Tanzania", -6.7924, 39.2083),
    ("Kyiv", "Ukraine", 50.4501, 30.5234), ("Kharkiv", "Ukraine", 49.9935, 36.2304),
    ("Odesa", "Ukraine", 46.4825, 30.7233), ("Moscow", "Russia", 55.7558, 37.6173),
    ("Minsk", "Belarus", 53.9006, 27.5590), ("Warsaw", "Poland", 52.2297, 21.0122),
    ("Berlin", "Germany", 52.5200, 13.4050), ("Paris", "France", 48.8566, 2.3522),
    ("London", "United Kingdom", 51.5074, -0.1278), ("Madrid", "Spain", 40.4168, -3.7038),
    ("Barcelona", "Spain", 41.3851, 2.1734), ("Valencia", "Spain", 39.4699, -0.3763),
    ("Rome", "Italy", 41.9028, 12.4964), ("Athens", "Greece", 37.9838, 23.7275),
    ("Lisbon", "Portugal", 38.7223, -9.1393), ("Brussels", "Belgium", 50.8503, 4.3517),
    ("Amsterdam", "Netherlands", 52.3676, 4.9041), ("Vienna", "Austria", 48.2082, 16.3738),
    ("Prague", "Czech Republic", 50.0755, 14.4378), ("Budapest", "Hungary", 47.4979, 19.0402),
    ("Bucharest", "Romania", 44.4268, 26.1025), ("Belgrade", "Serbia", 44.7866, 20.4489),
    ("Tbilisi", "Georgia", 41.7151, 44.8271), ("Yerevan", "Armenia", 40.1792, 44.4991),
    ("Baku", "Azerbaijan", 40.4093, 49.8671), ("Tashkent", "Uzbekistan", 41.2995, 69.2401),
    ("Almaty", "Kazakhstan", 43.2220, 76.8512), ("Beijing", "China", 39.9042, 116.4074),
    ("Shanghai", "China", 31.2304, 121.4737), ("Hong Kong", "China", 22.3193, 114.1694),
    ("Guangzhou", "China", 23.1291, 113.2644), ("Shenzhen", "China", 22.5431, 114.0579),
    ("Chengdu", "China", 30.5728, 104.0668), ("Wuhan", "China", 30.5928, 114.3055),
    ("Taipei", "Taiwan", 25.0330, 121.5654), ("Seoul", "South Korea", 37.5665, 126.9780),
    ("Pyongyang", "North Korea", 39.0392, 125.7625), ("Tokyo", "Japan", 35.6762, 139.6503),
    ("Osaka", "Japan", 34.6937, 135.5023), ("Sapporo", "Japan", 43.0618, 141.3545),
    ("Sydney", "Australia", -33.8688, 151.2093), ("Melbourne", "Australia", -37.8136, 144.9631),
    ("Brisbane", "Australia", -27.4698, 153.0251), ("Perth", "Australia", -31.9505, 115.8605),
    ("Auckland", "New Zealand", -36.8485, 174.7633), ("Wellington", "New Zealand", -41.2866, 174.7756),
    ("Port Moresby", "Papua New Guinea", -9.4438, 147.1803), ("Suva", "Fiji", -18.1416, 178.4419),
    ("New York", "United States", 40.7128, -74.0060), ("Los Angeles", "United States", 34.0522, -118.2437),
    ("San Francisco", "United States", 37.7749, -122.4194), ("Chicago", "United States", 41.8781, -87.6298),
    ("Houston", "United States", 29.7604, -95.3698), ("Miami", "United States", 25.7617, -80.1918),
    ("Washington, D.C.", "United States", 38.9072, -77.0369), ("Seattle", "United States", 47.6062, -122.3321),
    ("Anchorage", "United States", 61.2181, -149.9003), ("Honolulu", "United States", 21.3069, -157.8583),
    ("New Orleans", "United States", 29.9511, -90.0715), ("Toronto", "Canada", 43.6532, -79.3832),
    ("Vancouver", "Canada", 49.2827, -123.1207), ("Montreal", "Canada", 45.5017, -73.5673),
    ("Mexico City", "Mexico", 19.4326, -99.1332), ("Havana", "Cuba", 23.1136, -82.3666),
    ("Port-au-Prince", "Haiti", 18.5944, -72.3074), ("Santo Domingo", "Dominican Republic", 18.4861, -69.9312),
    ("San Juan", "Puerto Rico", 18.4655, -66.1057), ("Guatemala City", "Guatemala", 14.6349, -90.5069),
    ("Bogota", "Colombia", 4.7110, -74.0721), ("Caracas", "Venezuela", 10.4806, -66.9036),
    ("Lima", "Peru", -12.0464, -77.0428), ("Quito", "Ecuador", -0.1807, -78.4678),
    ("Santiago", "Chile", -33.4489, -70.6693), ("Buenos Aires", "Argentina", -34.6037, -58.3816),
    ("Sao Paulo", "Brazil", -23.5505, -46.6333), ("Rio de Janeiro", "Brazil", -22.9068, -43.1729),
    ("Brasilia", "Brazil", -15.7939, -47.8828), ("La Paz", "Bolivia", -16.4897, -68.1193),
]

CITY_ALIASES: dict[str, str] = {
    "Kiev": "Kyiv", "Bombay": "Mumbai", "Calcutta": "Kolkata", "Saigon": "Ho Chi Minh City",
    "Peking": "Beijing", "Rangoon": "Yangon", "Sao Paulo": "Sao Paulo", "São Paulo": "Sao Paulo",
    "Bogotá": "Bogota", "Washington DC": "Washington, D.C.", "NYC": "New York",
    "Odessa": "Odesa", "Kharkov": "Kharkiv",
}

DEFAULT_CENTROID = (0.0, 0.0)


def lookup(country_name: str | None) -> tuple[float, float]:
    """Publisher-country fallback (the original behaviour): the centroid of a
    named country, or (0, 0) if unknown. Used only when the text itself
    names no place."""
    if not country_name:
        return DEFAULT_CENTROID
    name = COUNTRY_ALIASES.get(country_name.strip(), country_name.strip())
    return COUNTRY_CENTROIDS.get(name, DEFAULT_CENTROID)


# --- text search ----------------------------------------------------------------

_CITY_INDEX = {name: (country, lat, lon) for name, country, lat, lon in CITIES}
_RANK = {"city": 0, "region": 1, "country": 2}


def _build_names() -> dict[str, tuple[str, str]]:
    """surface form -> (kind, canonical name)."""
    names: dict[str, tuple[str, str]] = {}
    for c in COUNTRY_CENTROIDS:
        names[c] = ("country", c)
    for alias, canonical in COUNTRY_ALIASES.items():
        names[alias] = ("country", canonical)
    for r in REGION_CENTROIDS:
        names[r] = ("region", r)
    for city in _CITY_INDEX:
        names[city] = ("city", city)
    for alias, canonical in CITY_ALIASES.items():
        names[alias] = ("city", canonical)
    return names


_NAMES = _build_names()
# Longest names first so "South Sudan" / "New York" win over "Sudan" / "York".
_PATTERN = re.compile(
    r"(?<![\w.])(" + "|".join(re.escape(n) for n in sorted(_NAMES, key=len, reverse=True)) + r")(?![\w])"
)


def locate_text(text: str | None) -> Place | None:
    """The most specific place the text names, or None. Cities beat regions
    beat countries; among equals the one mentioned first wins."""
    if not text:
        return None
    best: tuple[int, int, str] | None = None  # (rank, position, surface form)
    for match in _PATTERN.finditer(text):
        kind, _canonical = _NAMES[match.group(1)]
        candidate = (_RANK[kind], match.start(), match.group(1))
        if best is None or candidate < best:
            best = candidate
    if best is None:
        return None

    kind, canonical = _NAMES[best[2]]
    if kind == "city":
        country, lat, lon = _CITY_INDEX[canonical]
        return Place(f"{canonical}, {country}", lat, lon, "city")
    if kind == "region":
        lat, lon, country = REGION_CENTROIDS[canonical]
        return Place(f"{canonical}, {country}", lat, lon, "region")
    lat, lon = COUNTRY_CENTROIDS[canonical]
    return Place(canonical, lat, lon, "country")
