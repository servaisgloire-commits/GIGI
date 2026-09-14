from pathlib import Path

from app.vehicle_main import app


def _routes():
    out=set()
    for route in app.router.routes:
        for method in getattr(route, 'methods', set()) or set():
            out.add((getattr(route, 'path', ''), method))
    return out


def test_mobile_routes_are_exposed_by_production_entrypoint():
    routes=_routes()
    required={
        ('/v1/auth/password','POST'),
        ('/v1/auth/signup','POST'),
        ('/v1/auth/recover','POST'),
        ('/v1/places/autocomplete','GET'),
        ('/v1/places/details','GET'),
        ('/v1/routes/estimate','POST'),
        ('/v1/rides','POST'),
        ('/v1/rides/{ride_id}/dispatch','POST'),
        ('/v1/rides/{ride_id}/status','PATCH'),
        ('/v1/driver/vehicle','GET'),
        ('/v1/driver/vehicle','PUT'),
        ('/v1/driver/offers/current','GET'),
    }
    assert required <= routes


def test_android_client_matches_backend_contract():
    root=Path(__file__).resolve().parents[2]
    src='\n'.join(p.read_text(encoding='utf-8') for p in sorted((root/'app/src/main/assets').glob('*.js')))
    assert '/v1/places/autocomplete?q=' in src
    assert 'pickup_address:' in src
    assert 'destination_address:' in src
    assert 'vehicle_type:' in src
    assert "setRideStatus('driver_arriving')" in src
    assert "setRideStatus('in_progress')" in src
    assert "setRideStatus('arrived')" not in src
    assert "setRideStatus('started')" not in src
    assert '/v1/driver/vehicle' in src
