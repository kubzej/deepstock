"""A static route must be registered before any dynamic route that would also match its path."""
import importlib
import pkgutil
import sys

import pytest
from fastapi import APIRouter
from fastapi.routing import APIRoute


def shadowed_routes(router: APIRouter) -> list[str]:
    routes = [r for r in router.routes if isinstance(r, APIRoute)]
    problems = []
    for index, later in enumerate(routes):
        if "{" in later.path:
            continue
        for earlier in routes[:index]:
            if "{" in earlier.path and later.methods & earlier.methods and earlier.path_regex.match(later.path):
                problems.append(f"{sorted(later.methods)} {later.path} is shadowed by {earlier.path}")
    return problems


def test_checker_detects_a_static_route_shadowed_by_a_dynamic_one():
    router = APIRouter()

    @router.post("/prices/{symbol}")
    def dynamic(symbol: str): ...

    @router.post("/prices/batch")
    def static(): ...

    @router.get("/prices/other")
    def other_method(): ...

    assert shadowed_routes(router) == ["['POST'] /prices/batch is shadowed by /prices/{symbol}"]


@pytest.mark.skipif(sys.version_info < (3, 10), reason="the app modules use PEP 604 annotations")
def test_no_endpoint_router_shadows_its_own_static_routes():
    from app.api import endpoints

    problems = {}
    checked = 0
    for module_info in pkgutil.iter_modules(endpoints.__path__):
        router = getattr(importlib.import_module(f"{endpoints.__name__}.{module_info.name}"), "router", None)
        if router is None:
            continue
        checked += 1
        if found := shadowed_routes(router):
            problems[module_info.name] = found

    assert checked > 10  # guards against silently checking nothing
    assert problems == {}
