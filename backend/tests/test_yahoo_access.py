"""All blocking yfinance work goes through app.services.market.yahoo; nothing else touches yfinance from a coroutine."""
import ast
from pathlib import Path

APP = Path(__file__).resolve().parents[1] / "app"
GATEWAY = APP / "services" / "market" / "yahoo.py"
THREADING_NAMES = {"ThreadPoolExecutor", "to_thread", "run_in_executor"}


def _sources():
    for path in sorted(APP.rglob("*.py")):
        yield path, ast.parse(path.read_text())


def _yf_references_in_coroutines(tree):
    """Lines where the yfinance module is used directly inside an `async def` (nested plain functions excluded)."""
    found = []

    def visit(node, in_coroutine):
        for child in ast.iter_child_nodes(node):
            if isinstance(child, ast.AsyncFunctionDef):
                visit(child, True)
            elif isinstance(child, (ast.FunctionDef, ast.Lambda)):
                visit(child, False)
            else:
                if in_coroutine and isinstance(child, ast.Name) and child.id == "yf":
                    found.append(child.lineno)
                visit(child, in_coroutine)

    visit(tree, False)
    return found


def test_no_coroutine_calls_yfinance_directly():
    offenders = [
        f"{path.relative_to(APP)}:{line}"
        for path, tree in _sources()
        for line in _yf_references_in_coroutines(tree)
    ]

    assert offenders == [], "run these through app.services.market.yahoo.run_yahoo:\n" + "\n".join(offenders)


def test_yfinance_work_is_threaded_only_by_the_gateway():
    market = APP / "services" / "market"
    scoped = [p for p in [*market.glob("*.py"), APP / "services" / "performance.py"] if p != GATEWAY]

    offenders = []
    for path in scoped:
        for node in ast.walk(ast.parse(path.read_text())):
            if isinstance(node, ast.ImportFrom):
                names = [alias.name for alias in node.names]
            elif isinstance(node, ast.Name):
                names = [node.id]
            elif isinstance(node, ast.Attribute):
                names = [node.attr]
            else:
                continue
            offenders += [f"{path.relative_to(APP)}:{node.lineno} {name}" for name in names if name in THREADING_NAMES]

    assert offenders == [], "yfinance calls get their threads from the gateway:\n" + "\n".join(offenders)


def test_checker_flags_a_direct_call_in_a_coroutine_but_not_in_a_plain_helper():
    tree = ast.parse(
        "async def bad():\n    return yf.download('A')\n\n"
        "def helper():\n    return yf.download('A')\n\n"
        "async def good():\n    def inner():\n        return yf.Ticker('A')\n    return await run(inner)\n"
    )

    assert _yf_references_in_coroutines(tree) == [2]
