"""API request/response models are defined in app/schemas, nowhere else."""
import ast
from pathlib import Path

APP = Path(__file__).resolve().parents[1] / "app"
SCHEMAS = APP / "schemas"


def _classes(paths):
    for path in sorted(paths):
        for node in ast.walk(ast.parse(path.read_text())):
            if isinstance(node, ast.ClassDef):
                yield path, node, {ast.unparse(base) for base in node.bases}


def test_pydantic_models_are_defined_only_in_schemas():
    schema_names = {node.name for _, node, _ in _classes(SCHEMAS.glob("*.py"))}
    outside = [p for p in APP.rglob("*.py") if SCHEMAS not in p.parents]

    misplaced = [
        f"{path.relative_to(APP)}: {node.name}"
        for path, node, bases in _classes(outside)
        if bases & {"BaseModel", "pydantic.BaseModel"} or bases & schema_names
    ]

    assert not misplaced, "move these into app/schemas/<domain>.py:\n" + "\n".join(misplaced)
