from app.main import AuthUser
from app.vehicle_main import RideStatusRequest, _default_cancellation_reason, _ride_has_complete_addresses


def test_driver_start_accepts_complete_selected_addresses():
    complete = {
        "pickup_address": "Poto-Poto, Brazzaville",
        "destination_address": "Bacongo, Brazzaville",
        "pickup_lat": -4.266,
        "pickup_lng": 15.283,
        "destination_lat": -4.287,
        "destination_lng": 15.247,
    }
    assert _ride_has_complete_addresses(complete) is True


def test_driver_start_rejects_incomplete_addresses():
    broken = {
        "pickup_address": "Poto-Poto, Brazzaville",
        "destination_address": "",
        "pickup_lat": -4.266,
        "pickup_lng": 15.283,
        "destination_lat": -4.287,
        "destination_lng": 15.247,
    }
    assert _ride_has_complete_addresses(broken) is False


def test_cancellation_contract_has_reason():
    parsed = RideStatusRequest(status="cancelled", cancellation_reason="driver_emergency")
    assert parsed.cancellation_reason == "driver_emergency"
    assert _default_cancellation_reason(AuthUser(id="driver-a", role="driver")) == "driver_cancelled"
    assert _default_cancellation_reason(AuthUser(id="client-a", role="client")) == "client_cancelled"
