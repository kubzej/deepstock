"""Minimal in-memory stand-in for the Supabase query builder, for service-level tests."""
import re

# The only PostgREST `or` grammar the services build: keyset pagination (see app.core.pagination)
_KEYSET_OR = re.compile(r'^(\w+)\.lt\."([^"]*)",and\(\1\.eq\."\2",id\.lt\."([^"]*)"\)$')
_LTE_OR = re.compile(r'^(\w+)\.lte\."([^"]*)"$')


class FakeQuery:
    def __init__(self, db: "FakeSupabase", table: str):
        self.db = db
        self.table = table
        self.op = "select"
        self.payload = None
        self.filters: list[tuple[str, object]] = []
        self.predicates: list = []
        self.orderings: list[tuple[str, bool]] = []
        self.max_rows: int | None = None

    def select(self, *_args, **_kwargs):
        self.op = "select"
        return self

    def insert(self, payload):
        self.op, self.payload = "insert", payload
        return self

    def upsert(self, payload, on_conflict):
        self.op, self.payload, self.conflict_columns = "upsert", payload, on_conflict.split(",")
        return self

    def update(self, payload):
        self.op, self.payload = "update", payload
        return self

    def delete(self):
        self.op = "delete"
        return self

    def eq(self, column, value):
        self.filters.append((column, value))
        return self

    def in_(self, column, values):
        allowed = set(values)
        self.predicates.append(lambda row: row.get(column) in allowed)
        return self

    def gte(self, column, value):
        self.predicates.append(lambda row: row.get(column) is not None and row[column] >= value)
        return self

    def lt(self, column, value):
        self.predicates.append(lambda row: row.get(column) is not None and row[column] < value)
        return self

    def or_(self, expression):
        keyset = _KEYSET_OR.match(expression)
        if keyset:
            column, value, row_id = keyset.groups()
            self.predicates.append(
                lambda row: row.get(column) < value or (row.get(column) == value and row["id"] < row_id)
            )
            return self
        lte = _LTE_OR.match(expression)
        if lte:
            column, value = lte.groups()
            self.predicates.append(lambda row: row.get(column) <= value)
            return self
        raise NotImplementedError(f"FakeQuery does not understand or_({expression!r})")

    def order(self, column, desc=False):
        self.orderings.append((column, desc))
        return self

    def limit(self, count):
        self.max_rows = count
        return self

    def execute(self):
        failure = self.db.failures.get((self.table, self.op))
        if failure is not None:
            raise failure
        rows = self.db.tables.setdefault(self.table, [])
        matching = [
            r for r in rows
            if all(r.get(c) == v for c, v in self.filters) and all(p(r) for p in self.predicates)
        ]
        # Apply the least significant ordering first; Python's sort is stable
        for column, desc in reversed(self.orderings):
            matching.sort(key=lambda r: r.get(column), reverse=desc)
        if self.max_rows is not None:
            matching = matching[: self.max_rows]
        if self.op == "insert":
            row = {"id": f"{self.table}-{len(rows) + 1}", "created_at": "2026-01-01T00:00:00+00:00", **self.payload}
            rows.append(row)
            return type("R", (), {"data": [dict(row)]})()
        if self.op == "upsert":
            written = []
            for incoming in self.payload if isinstance(self.payload, list) else [self.payload]:
                key = {c: incoming.get(c) for c in self.conflict_columns}
                row = next((r for r in rows if all(r.get(c) == v for c, v in key.items())), None)
                if row is None:
                    row = {"id": f"{self.table}-{len(rows) + 1}", "created_at": "2026-01-01T00:00:00+00:00"}
                    rows.append(row)
                row.update(incoming)
                written.append(dict(row))
            return type("R", (), {"data": written})()
        if self.op == "update":
            for row in matching:
                row.update(self.payload)
            return type("R", (), {"data": [dict(r) for r in matching]})()
        if self.op == "delete":
            for row in matching:
                rows.remove(row)
            return type("R", (), {"data": [dict(r) for r in matching]})()
        return type("R", (), {"data": [dict(r) for r in matching]})()


class FakeSupabase:
    def __init__(self):
        self.tables: dict[str, list[dict]] = {}
        # (table, operation) -> exception raised by execute(), to simulate outages
        self.failures: dict[tuple[str, str], Exception] = {}

    def table(self, name):
        return FakeQuery(self, name)
