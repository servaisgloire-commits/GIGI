from app.main import AuthUser
from app.vehicle_main import (
    RideStatusRequest,
    _default_cancellation_reason,
    _optional_data,
    _ride_final_price,
    _ride_has_complete_addresses,
)


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


def test_app_close_cancellation_can_require_searching_state_atomically():
    parsed = RideStatusRequest(
        status="cancelled",
        expected_current_status="searching",
        cancellation_reason="client_app_closed",
    )
    assert parsed.expected_current_status == "searching"
    assert parsed.cancellation_reason == "client_app_closed"

    import inspect
    from app.vehicle_main import update_ride_status_resilient

    source = inspect.getsource(update_ride_status_resilient)
    assert 'query.eq("status", body.expected_current_status)' in source
    assert 'HTTPException(409, "stale_ride_state")' in source


def test_final_price_prefers_agreed_price_then_proposal_then_estimate():
    assert _ride_final_price({"agreed_price": 4500, "customer_proposed_price": 4000, "estimated_price": 5000}) == 4500
    assert _ride_final_price({"agreed_price": None, "customer_proposed_price": 4000, "estimated_price": 5000}) == 4000
    assert _ride_final_price({"agreed_price": None, "customer_proposed_price": None, "estimated_price": 5000}) == 5000


def test_cash_completion_fields_are_present_in_production_endpoint_source():
    import inspect
    from app.vehicle_main import update_ride_status_resilient

    source = inspect.getsource(update_ride_status_resilient)
    assert 'changes["payment_state"] = "cash_received"' in source
    assert 'changes["payment_confirmed_at"]' in source
    assert 'changes["completed_at"]' in source


def test_optional_ride_enrichment_returns_default_on_timeout_like_error():
    def fails():
        raise RuntimeError("504 Gateway Timeout")

    assert _optional_data(fails, {}) == {}
