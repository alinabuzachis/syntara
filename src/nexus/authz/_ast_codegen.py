"""AST-based code generation helpers for policy and role migration files.

Builds ``ast`` nodes for ``PolicyAdd`` / ``RolePolicyAppend`` / ``RoleAdd``
constructor calls and the ``apply_policy_ops`` / ``revert_policy_ops`` /
``apply_role_ops`` / ``revert_role_ops`` invocations that appear in Alembic
migration files.  Using the AST avoids hand-rolled string formatting and
``repr()`` for nested data structures.
"""

from __future__ import annotations

import ast
from typing import TYPE_CHECKING, Any, assert_never

if TYPE_CHECKING:
    from nexus.authz.migration_ops import PolicyAdd, RoleAdd, RolePolicyAppend


def _value_to_ast(v: Any) -> ast.expr:  # noqa: ANN401
    """Recursively convert a plain Python value to an ``ast`` expression node.

    Supports ``str``, ``int``, ``float``, ``bool``, ``None``, ``list``,
    and ``dict``.  ``bool`` is checked before ``int`` because ``bool`` is a
    subclass of ``int``.
    """
    if isinstance(v, bool):
        return ast.Constant(value=v)
    if isinstance(v, (str, int, float)) or v is None:
        return ast.Constant(value=v)
    if isinstance(v, list):
        return ast.List(elts=[_value_to_ast(item) for item in v], ctx=ast.Load())
    if isinstance(v, dict):
        return ast.Dict(
            keys=[_value_to_ast(k) for k in v],
            values=[_value_to_ast(val) for val in v.values()],
        )
    msg = f"Unsupported value type for AST conversion: {type(v)!r}"
    raise TypeError(msg)


def _policy_op_to_ast(op: PolicyAdd | RolePolicyAppend) -> ast.Call:
    """Convert a ``PolicyAdd`` or ``RolePolicyAppend`` instance to an AST call node."""
    from nexus.authz.migration_ops import PolicyAdd, RolePolicyAppend  # noqa: PLC0415

    if isinstance(op, PolicyAdd):
        return ast.Call(
            func=ast.Name(id="PolicyAdd", ctx=ast.Load()),
            args=[
                ast.Constant(value=op.name),
                ast.Constant(value=op.description),
                _value_to_ast(op.statements),
            ],
            keywords=[],
        )
    if isinstance(op, RolePolicyAppend):
        return ast.Call(
            func=ast.Name(id="RolePolicyAppend", ctx=ast.Load()),
            args=[
                ast.Constant(value=op.role_name),
                ast.Constant(value=op.policy_name),
            ],
            keywords=[],
        )
    assert_never(op)


def _role_op_to_ast(op: RoleAdd) -> ast.Call:
    """Convert a ``RoleAdd`` instance to an AST call node."""
    args: list[ast.expr] = [
        ast.Constant(value=op.name),
        ast.Constant(value=op.description),
    ]
    keywords: list[ast.keyword] = []
    if not op.is_builtin:
        keywords.append(ast.keyword(arg="is_builtin", value=ast.Constant(value=False)))
    return ast.Call(
        func=ast.Name(id="RoleAdd", ctx=ast.Load()),
        args=args,
        keywords=keywords,
    )


def build_ops_call(fn_name: str, ops: list[PolicyAdd | RolePolicyAppend]) -> str:
    """Return ``ast.unparse`` of ``fn_name([op1, op2, ...])``.

    Produces a compact single-line string; callers are expected to run
    ``ruff format`` on the resulting file to expand it.

    Used by the Alembic renderer hooks in ``env.py``.
    """
    node: ast.expr = ast.Call(
        func=ast.Name(id=fn_name, ctx=ast.Load()),
        args=[ast.List(elts=[_policy_op_to_ast(op) for op in ops], ctx=ast.Load())],
        keywords=[],
    )
    ast.fix_missing_locations(node)
    return ast.unparse(node)


def build_policy_ops_list(ops: list[PolicyAdd | RolePolicyAppend]) -> str:
    """Return ``ast.unparse`` of the list literal ``[PolicyAdd(...), ...]``.

    Produces a compact single-line string; callers are expected to run
    ``ruff format`` on the resulting file to expand it.

    Used by ``migration_generator.py`` for the ``POLICY_OPS`` constant.
    """
    node: ast.expr = ast.List(elts=[_policy_op_to_ast(op) for op in ops], ctx=ast.Load())
    ast.fix_missing_locations(node)
    return ast.unparse(node)


def build_role_ops_call(fn_name: str, ops: list[RoleAdd]) -> str:
    """Return ``ast.unparse`` of ``fn_name([RoleAdd(...), ...])``.

    Used by the Alembic renderer hooks in ``env.py``.
    """
    node: ast.expr = ast.Call(
        func=ast.Name(id=fn_name, ctx=ast.Load()),
        args=[ast.List(elts=[_role_op_to_ast(op) for op in ops], ctx=ast.Load())],
        keywords=[],
    )
    ast.fix_missing_locations(node)
    return ast.unparse(node)


def build_role_ops_list(ops: list[RoleAdd]) -> str:
    """Return ``ast.unparse`` of the list literal ``[RoleAdd(...), ...]``.

    Produces a compact single-line string; callers are expected to run
    ``ruff format`` on the resulting file to expand it.

    Used by ``migration_generator.py`` and the Alembic hook for the
    ``ROLE_OPS`` constant.
    """
    node: ast.expr = ast.List(elts=[_role_op_to_ast(op) for op in ops], ctx=ast.Load())
    ast.fix_missing_locations(node)
    return ast.unparse(node)
