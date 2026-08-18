import math

from app.main import APP_VERSION, app, haversine_km, maneuver_label, parse_seconds


def test_haversine_zero_distance():
    assert haversine_km(-4.2634, 15.2429, -4.2634, 15.2429) == 0


def test_haversine_brazzaville_distance_is_realistic():
    # Madibou -> central Brazzaville is several kilometres, not a zero/negative distance.
    distance = haversine_km(-4.33, 15.22, -4.2634, 15.2429)
    assert 5 < distance < 15


def test_google_duration_parser():
    assert parse_seconds("300s") == 5
    assert parse_seconds("61s") == 2
    assert parse_seconds(None) == 0


def test_navigation_labels_are_localized():
    assert maneuver_label("turn-left") == "Tournez à gauche"
    assert maneuver_label("turn-right") == "Tournez à droite"
    assert maneuver_label("arrive") == "Arrivée"


def test_final_backend_version_is_aligned():
    assert APP_VERSION == "6.0"


def test_history_route_precedes_dynamic_ride_route():
    paths = [route.path for route in app.routes]
    assert paths.index("/v1/rides/history") < paths.index("/v1/rides/{ride_id}")
