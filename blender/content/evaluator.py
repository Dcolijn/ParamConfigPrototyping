import json
import re
import bpy
from mathutils import Vector

from .configurationData import ConfigurationData, InputType


_REF_PATTERN = re.compile(r"\$[A-Za-z0-9_-]+(?:\.[A-Za-z_][A-Za-z0-9_]*)?")


def _coerce_number(value, fallback: float = 0.0) -> float:
    if isinstance(value, bool):
        return fallback
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(value)
    except (TypeError, ValueError):
        return fallback


def _coerce_bool(value) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return bool(value)


def _vec3(x, y, z):
    return Vector((_coerce_number(x), _coerce_number(y), _coerce_number(z)))


def _to_serializable(value):
    if isinstance(value, Vector):
        return [float(value.x), float(value.y), float(value.z)]
    if isinstance(value, (int, float, bool, str)) or value is None:
        return value
    if isinstance(value, (list, tuple)):
        return [_to_serializable(v) for v in value]
    return str(value)


def _convert_ternary(expression: str) -> str:
    expr = expression.strip()

    while "?" in expr:
        q_pos = None
        depth = 0
        for index, ch in enumerate(expr):
            if ch == "(":
                depth += 1
            elif ch == ")":
                depth -= 1
            elif ch == "?" and depth == 0:
                q_pos = index
                break

        if q_pos is None:
            break

        c_pos = None
        depth = 0
        nested = 0
        for index in range(q_pos + 1, len(expr)):
            ch = expr[index]
            if ch == "(":
                depth += 1
            elif ch == ")":
                depth -= 1
            elif ch == "?" and depth == 0:
                nested += 1
            elif ch == ":" and depth == 0:
                if nested == 0:
                    c_pos = index
                    break
                nested -= 1

        if c_pos is None:
            break

        condition = expr[:q_pos].strip()
        if_true = expr[q_pos + 1:c_pos].strip()
        if_false = expr[c_pos + 1:].strip()
        expr = f"(({if_true}) if ({condition}) else ({if_false}))"

    return expr


def _replace_refs(expression: str) -> str:
    def replacer(match):
        token = match.group(0)
        if "." in token:
            base, attr = token.rsplit(".", 1)
            return f'__ref__("{base}", "{attr}")'
        return f'__ref__("{token}", None)'

    return _REF_PATTERN.sub(replacer, expression)


def _compile_expression(expression: str) -> str:
    ternary_converted = _convert_ternary(expression)
    return _replace_refs(ternary_converted)


def _build_input_meta(config_data: ConfigurationData):
    input_meta = {}
    for input_data in config_data.input:
        input_meta[input_data.id] = {
            "default": input_data.default,
            "min": input_data.min,
            "max": input_data.max,
            "type": input_data.type.value,
        }
    return input_meta


def _input_values_from_window_manager(window_manager):
    values = {}
    input_items = getattr(window_manager, "dim_parametric_inputs", None)
    if input_items is None:
        return values

    for item in input_items:
        prop_name = getattr(item, "prop_name", "")
        if not prop_name or not hasattr(window_manager, prop_name):
            continue

        prop_value = getattr(window_manager, prop_name)
        if item.input_type == InputType.BOOLEAN.value:
            values[item.input_id] = bool(prop_value)
        else:
            values[item.input_id] = float(prop_value)

    return values


def evaluate_configuration(config_data: ConfigurationData, input_values: dict):
    input_meta = _build_input_meta(config_data)
    expression_map = {expr.id: expr for expr in config_data.expressions if expr.id}
    expression_cache = {}

    def ref_lookup(ref_id: str, attr: str | None):
        if attr in ("min", "max", "default"):
            if ref_id in input_meta:
                return input_meta[ref_id].get(attr)
            return None

        if ref_id in input_values:
            return input_values[ref_id]

        if ref_id in expression_cache:
            return expression_cache[ref_id]

        if ref_id in expression_map:
            return evaluate_expression(ref_id)

        if ref_id in input_meta:
            return input_meta[ref_id].get("default")

        return 0.0

    safe_globals = {
        "__builtins__": {},
        "min": min,
        "max": max,
        "abs": abs,
        "round": round,
        "pow": pow,
        "vec3": _vec3,
    }

    def eval_expression_text(expression_text: str):
        compiled = _compile_expression(expression_text)
        return eval(compiled, safe_globals, {"__ref__": ref_lookup})

    def evaluate_expression(expression_id: str):
        if expression_id in expression_cache:
            return expression_cache[expression_id]

        expression_data = expression_map.get(expression_id)
        if expression_data is None:
            return ref_lookup(expression_id, None)

        value = eval_expression_text(expression_data.expression)
        expression_cache[expression_id] = value
        return value

    for expression_id in expression_map:
        evaluate_expression(expression_id)

    shapekeys = {}
    for output in config_data.output.shapekeys:
        try:
            value = eval_expression_text(output.conversion)
        except Exception:
            value = ref_lookup(output.input, None)
        shapekeys[output.id] = value

    attachment_points = {}
    for output in config_data.output.attachmentpoints:
        location = eval_expression_text(output.input_location)
        rotation = eval_expression_text(output.input_rotation)
        attachment_points[output.id] = {
            "location": location,
            "rotation": rotation,
        }

    values_output = {}
    for output in config_data.output.values:
        values_output[output.id] = ref_lookup(output.input, None)

    result = {
        "expressions": {key: _to_serializable(value) for key, value in expression_cache.items()},
        "outputs": {
            "shapekeys": {key: _to_serializable(value) for key, value in shapekeys.items()},
            "attachment_points": {
                key: {
                    "location": _to_serializable(value["location"]),
                    "rotation": _to_serializable(value["rotation"]),
                }
                for key, value in attachment_points.items()
            },
            "values": {key: _to_serializable(value) for key, value in values_output.items()},
        },
    }

    return result


def _apply_shapekeys_to_object(target_object, shapekeys: dict):
    """Assign evaluated shapekey values to a single Blender object."""
    if target_object is None:
        return

    object_data = getattr(target_object, "data", None)
    if not hasattr(object_data, "shape_keys") or object_data.shape_keys is None:
        return

    key_blocks = object_data.shape_keys.key_blocks
    for shape_key_id, shape_key_value in shapekeys.items():
        if shape_key_id in key_blocks and isinstance(shape_key_value, (int, float)):
            key_blocks[shape_key_id].value = float(shape_key_value)


def _coerce_vec3_tuple(value, fallback=(0.0, 0.0, 0.0)):
    """Convert a value into a numeric 3-tuple."""
    if isinstance(value, Vector):
        return (float(value.x), float(value.y), float(value.z))

    if isinstance(value, (list, tuple)) and len(value) >= 3:
        return (
            _coerce_number(value[0], fallback[0]),
            _coerce_number(value[1], fallback[1]),
            _coerce_number(value[2], fallback[2]),
        )

    return fallback


def _ensure_attachment_point_child(root_object, attachment_id: str):
    """Create or reuse a child empty that represents one attachment point."""
    for child in root_object.children:
        if child.get("parametric_attachment_point_id") == attachment_id:
            if child.parent != root_object:
                child.parent = root_object
            return child

    attachment_object = bpy.data.objects.new(attachment_id, None)
    attachment_object.empty_display_type = 'ARROWS'
    attachment_object.empty_display_size = 0.1
    attachment_object.parent = root_object
    attachment_object["parametric_attachment_point_id"] = attachment_id

    root_collections = list(root_object.users_collection)
    if len(root_collections) > 0:
        for collection in root_collections:
            if attachment_object.name not in collection.objects:
                collection.objects.link(attachment_object)
    else:
        bpy.context.scene.collection.objects.link(attachment_object)

    return attachment_object


def _sync_attachment_points(root_object, attachment_points: dict):
    """Create/update/remove attachment-point empties under a parametric root."""
    active_ids = set()

    for attachment_id, transform in attachment_points.items():
        if not isinstance(attachment_id, str) or not attachment_id:
            continue

        active_ids.add(attachment_id)
        attachment_object = _ensure_attachment_point_child(root_object, attachment_id)

        location = _coerce_vec3_tuple(transform.get("location") if isinstance(transform, dict) else None)
        rotation = _coerce_vec3_tuple(transform.get("rotation") if isinstance(transform, dict) else None)

        attachment_object.location = location
        attachment_object.rotation_euler = rotation

    stale_children = []
    for child in root_object.children:
        attachment_id = child.get("parametric_attachment_point_id")
        if attachment_id and attachment_id not in active_ids:
            stale_children.append(child)

    for child in stale_children:
        bpy.data.objects.remove(child, do_unlink=True)


def recalculate_outputs_for_scene(context):
    input_values = _input_values_from_window_manager(context.window_manager)

    for obj in context.scene.objects:
        raw_json = obj.get("parametric_configuration_data_json")
        if not raw_json:
            continue

        try:
            data = json.loads(raw_json)
        except (TypeError, json.JSONDecodeError):
            continue

        if not isinstance(data, dict):
            continue

        try:
            config_data = ConfigurationData(data)
        except Exception:
            continue

        if config_data is None:
            continue

        evaluated = evaluate_configuration(config_data, input_values)
        obj["parametric_evaluated_outputs_json"] = json.dumps(evaluated)

        shapekeys = evaluated["outputs"]["shapekeys"]
        attachment_points = evaluated["outputs"]["attachment_points"]
        is_parametric_element = str(data.get("type", "")).strip().lower() == "parametricelement"

        if is_parametric_element and getattr(obj, "type", "") == "EMPTY":
            for child in obj.children:
                _apply_shapekeys_to_object(child, shapekeys)
            _sync_attachment_points(obj, attachment_points)
        else:
            _apply_shapekeys_to_object(obj, shapekeys)
