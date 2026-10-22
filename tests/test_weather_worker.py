from app.workers.weather import MONITORED_CITIES, _build_event


def test_build_event_flags_temperature_anomaly_above_threshold():
    city = MONITORED_CITIES[0]
    baseline = {"temp_mean": 25.0, "temp_std": 2.0, "rain_mean": 2.0, "rain_std": 1.0}
    # 25 + (3 * 2.0) = 31.0 -> exactly 3 std devs above normal -> Red
    current = {"temperature_2m": 31.0, "rain": 0.0}

    event = _build_event(city, current, baseline)

    assert event is not None
    assert event.alert_level == "Red"
    assert event.hazard_type == "extreme_temp"
    assert event.severity_score == 3.0


def test_build_event_returns_none_when_within_normal_range():
    city = MONITORED_CITIES[0]
    baseline = {"temp_mean": 25.0, "temp_std": 2.0, "rain_mean": 2.0, "rain_std": 1.0}
    # 26 is only 0.5 std devs above the mean - well within normal variation
    current = {"temperature_2m": 26.0, "rain": 1.5}

    assert _build_event(city, current, baseline) is None


def test_build_event_same_temperature_different_baseline_different_result():
    """This is the actual point of switching to Z-scores: the exact same
    raw temperature is a genuine anomaly in one climate and unremarkable
    in another, which a single fixed threshold could never express.
    """
    city = MONITORED_CITIES[0]
    hot_climate_baseline = {"temp_mean": 32.0, "temp_std": 3.0, "rain_mean": 2.0, "rain_std": 1.0}
    cool_climate_baseline = {"temp_mean": 15.0, "temp_std": 3.0, "rain_mean": 2.0, "rain_std": 1.0}
    current = {"temperature_2m": 35.0, "rain": 0.0}

    hot_climate_event = _build_event(city, current, hot_climate_baseline)
    cool_climate_event = _build_event(city, current, cool_climate_baseline)

    assert hot_climate_event is None  # unremarkable for a hot climate
    assert cool_climate_event is not None  # genuinely anomalous for a cool climate
