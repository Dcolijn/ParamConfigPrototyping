"""Operators and runtime helpers for Blender parametric configuration.

This module owns dynamic WindowManager input properties, input syncing from
loaded configuration JSON, soft-limit updates driven by expressions, directory
loading for JSON/BLEND assets, and debug reporting utilities.
"""

import hashlib
import json
import os
import re

import bpy
from bpy.types import Operator, PropertyGroup

from ..content.configurationData import InputType, ConfigurationData
from ..content.evaluator import recalculate_outputs_for_scene, evaluate_configuration


_DYNAMIC_WM_PROPERTIES: set[str] = set()
_INTERNAL_INPUT_UPDATE = False


def _is_effective_numeric_limit(value) -> bool:
    """Return True when a value is a finite-like numeric limit Blender can use."""
    if not isinstance(value, (int, float)):
        return False
    return abs(float(value)) < 1.0e30


def _find_input_item(window_manager, input_id: str):
    """Find a tracked input item in the WindowManager collection by id."""
    input_items = getattr(window_manager, "dim_parametric_inputs", None)
    if input_items is None:
        return None

    for item in input_items:
        if str(item.input_id) == input_id:
            return item
    return None


def _resolve_parametric_source_object(context):
    """Resolve the nearest object that carries parametric configuration JSON."""
    active_object = context.active_object
    if active_object is None:
        return None

    if active_object.get("parametric_configuration_data_json"):
        return active_object

    current = active_object.parent
    while current is not None:
        if current.get("parametric_configuration_data_json"):
            return current
        current = current.parent

    return None


def _show_snap_popup(context, snap_info):
    """Show a popup when a user-entered value is clamped to effective limits."""
    input_id = str(snap_info.get("input_id", "input"))
    old_value = _coerce_number(snap_info.get("old_value"), 0.0)
    new_value = _coerce_number(snap_info.get("new_value"), 0.0)
    effective_min = snap_info.get("effective_min")
    effective_max = snap_info.get("effective_max")

    def draw(self, _context):
        layout = self.layout
        layout.label(text=f"{input_id} was clamped to soft limits")
        layout.label(text=f"{old_value:.4f} -> {new_value:.4f}")

        min_text = "-∞" if effective_min is None else f"{_coerce_number(effective_min):.4f}"
        max_text = "+∞" if effective_max is None else f"{_coerce_number(effective_max):.4f}"
        layout.label(text=f"Allowed range: {min_text} to {max_text}")

    context.window_manager.popup_menu(draw, title="Parametric Input Clamped", icon='INFO')


def _clamp_input_to_soft_limits(window_manager, input_id: str) -> dict | None:
    """Clamp a numeric input to current effective soft/hard limits.

    Returns a dictionary with clamp details when clamping occurred, otherwise
    returns None.
    """
    item = _find_input_item(window_manager, input_id)
    if item is None:
        return None

    if item.input_type == InputType.BOOLEAN.value:
        return None

    prop_name = str(item.prop_name)
    if not prop_name or not hasattr(window_manager, prop_name):
        return None

    current_value = _coerce_number(getattr(window_manager, prop_name), 0.0)

    rna_prop = None
    if prop_name in window_manager.bl_rna.properties:
        rna_prop = window_manager.bl_rna.properties[prop_name]

    soft_min = getattr(rna_prop, "soft_min", None)
    soft_max = getattr(rna_prop, "soft_max", None)
    hard_min = getattr(rna_prop, "hard_min", None)
    hard_max = getattr(rna_prop, "hard_max", None)

    effective_min = soft_min if _is_effective_numeric_limit(soft_min) else None
    effective_max = soft_max if _is_effective_numeric_limit(soft_max) else None

    if effective_min is None and _is_effective_numeric_limit(hard_min):
        effective_min = float(hard_min)
    if effective_max is None and _is_effective_numeric_limit(hard_max):
        effective_max = float(hard_max)

    clamped_value = current_value
    if effective_min is not None and clamped_value < effective_min:
        clamped_value = float(effective_min)
    if effective_max is not None and clamped_value > effective_max:
        clamped_value = float(effective_max)

    if clamped_value == current_value:
        return None

    global _INTERNAL_INPUT_UPDATE
    _INTERNAL_INPUT_UPDATE = True
    try:
        setattr(window_manager, prop_name, clamped_value)
    finally:
        _INTERNAL_INPUT_UPDATE = False

    return {
        "input_id": input_id,
        "old_value": current_value,
        "new_value": clamped_value,
        "effective_min": effective_min,
        "effective_max": effective_max,
    }


def _read_json_file(path: str):
    """Read JSON from disk using a small set of common encodings."""
    with open(path, "rb") as f:
        raw = f.read()

    decoders = ("utf-8", "utf-8-sig", "utf-16", "utf-16-le", "utf-16-be", "cp1252")
    decode_error = None

    for encoding in decoders:
        try:
            text = raw.decode(encoding)
            return json.loads(text)
        except UnicodeDecodeError as e:
            decode_error = e
        except json.JSONDecodeError:
            continue

    if decode_error is not None:
        raise decode_error

    raise json.JSONDecodeError("Invalid JSON", "", 0)


def _set_object_configuration_data(target_object, data: dict):
    """Persist raw configuration data JSON on a Blender object custom property."""
    target_object["parametric_configuration_data_json"] = json.dumps(data)


def _coerce_number(value, fallback: float = 0.0) -> float:
    """Convert a value to float, returning fallback when conversion is invalid."""
    if isinstance(value, bool):
        return fallback
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(value)
    except (TypeError, ValueError):
        return fallback


def _coerce_bool(value) -> bool:
    """Convert common scalar/string representations to boolean."""
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return bool(value)


def _format_limit_value(value):
    """Format hard/soft limits for concise tooltip text."""
    if value is None:
        return "None"
    if isinstance(value, (int, float)):
        return f"{float(value):.4f}"
    return str(value)


def _build_numeric_limits_tooltip(input_id: str, hard_min, hard_max, soft_min, soft_max) -> str:
    """Build a multiline tooltip describing hard and soft limits for an input."""
    return (
        f"{input_id}\n"
        f"Hard limits: {_format_limit_value(hard_min)} .. {_format_limit_value(hard_max)}\n"
        f"Soft limits: {_format_limit_value(soft_min)} .. {_format_limit_value(soft_max)}"
    )


def _make_input_update_callback(input_id: str):
    """Create a per-input update callback used by dynamic WM properties."""
    def _update(window_manager, context):
        if _INTERNAL_INPUT_UPDATE:
            return
        if context is None:
            return
        context.window_manager["parametric_last_changed_input_id"] = input_id

        snap_info = _clamp_input_to_soft_limits(context.window_manager, input_id)
        recalculate_outputs_for_scene(context)
        _apply_dynamic_soft_limits(context)

        snap_info_after_soft = _clamp_input_to_soft_limits(context.window_manager, input_id)
        if snap_info or snap_info_after_soft:
            recalculate_outputs_for_scene(context)

            popup_info = snap_info_after_soft if snap_info_after_soft is not None else snap_info
            if popup_info is not None:
                _show_snap_popup(context, popup_info)

    return _update


def _sanitize_input_id(input_id: str) -> str:
    """Convert an arbitrary input id to a safe identifier fragment."""
    sanitized = re.sub(r"[^A-Za-z0-9_]", "_", input_id).strip("_")
    if not sanitized:
        sanitized = "input"
    return sanitized.lower()


def _prop_name_for_input_id(input_id: str) -> str:
    """Build a stable dynamic WindowManager property name for an input id."""
    digest = hashlib.md5(input_id.encode("utf-8")).hexdigest()[:8]
    return f"dim_param_input_{_sanitize_input_id(input_id)}_{digest}"


def _cleanup_dynamic_window_manager_properties():
    """Remove all dynamically created WindowManager properties."""
    for prop_name in list(_DYNAMIC_WM_PROPERTIES):
        if hasattr(bpy.types.WindowManager, prop_name):
            delattr(bpy.types.WindowManager, prop_name)
    _DYNAMIC_WM_PROPERTIES.clear()


def cleanup_dynamic_window_manager_properties():
    """Public cleanup hook used by module unregister flow."""
    _cleanup_dynamic_window_manager_properties()


class PARAMETRIC_PG_input_item(PropertyGroup):
    """PropertyGroup storing metadata for one synced parametric input."""
    input_id: bpy.props.StringProperty(name="Input ID")  # type: ignore[valid-type]
    prop_name: bpy.props.StringProperty(name="Property Name")  # type: ignore[valid-type]
    input_type: bpy.props.EnumProperty(
        name="Input Type",
        items=(
            (InputType.NUMBER.value, "Number", ""),
            (InputType.VARIABLE.value, "Variable", ""),
            (InputType.BOOLEAN.value, "Boolean", ""),
        ),
        default=InputType.NUMBER.value,
    )  # type: ignore[valid-type]
    input_name: bpy.props.StringProperty(name="Input Name")  # type: ignore[valid-type]
    has_limits: bpy.props.BoolProperty(name="Has Limits", default=False)  # type: ignore[valid-type]
    min_value: bpy.props.FloatProperty(name="Min", default=0.0)  # type: ignore[valid-type]
    max_value: bpy.props.FloatProperty(name="Max", default=0.0)  # type: ignore[valid-type]


class PARAMETRIC_PG_pme_entry(PropertyGroup):
    """PropertyGroup storing a loadable PME entry discovered in a directory."""
    pme_id: bpy.props.StringProperty(name="PME ID")  # type: ignore[valid-type]
    display_name: bpy.props.StringProperty(name="Display Name")  # type: ignore[valid-type]
    json_path: bpy.props.StringProperty(name="JSON Path")  # type: ignore[valid-type]


def _collect_unique_input_specs(context):
    """Collect and merge unique input specs from all scene object configs."""
    unique_inputs = {}

    def merge_input(input_data):
        if not isinstance(input_data, dict):
            return

        input_id = input_data.get("id")
        if not input_id:
            return

        input_type_raw = input_data.get("type", InputType.NUMBER.value)
        try:
            input_type = InputType(input_type_raw)
        except Exception:
            input_type = InputType.NUMBER

        if input_id not in unique_inputs:
            unique_inputs[input_id] = {
                "id": input_id,
                "name": input_data.get("name"),
                "type": input_type.value,
                "default": input_data.get("default"),
                "min": input_data.get("min"),
                "max": input_data.get("max"),
            }
            return

        existing = unique_inputs[input_id]
        if existing["min"] is None and input_data.get("min") is not None:
            existing["min"] = input_data.get("min")
        if existing["max"] is None and input_data.get("max") is not None:
            existing["max"] = input_data.get("max")

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

        inputs = data.get("input", [])
        if isinstance(inputs, list):
            for input_data in inputs:
                merge_input(input_data)

    return [unique_inputs[key] for key in sorted(unique_inputs.keys())]


def _build_existing_values(window_manager):
    """Capture current dynamic input values before rebuilding properties."""
    existing = {}
    for item in window_manager.dim_parametric_inputs:
        prop_name = item.prop_name
        if not prop_name:
            continue
        if hasattr(window_manager, prop_name):
            existing[item.input_id] = {"type": item.input_type, "value": getattr(window_manager, prop_name)}
    return existing


def _register_dynamic_window_manager_property(prop_name: str, input_spec):
    """Register a dynamic WindowManager property for one input specification."""
    input_type = input_spec["type"]
    default_value = input_spec.get("default")
    min_raw = input_spec.get("min")
    max_raw = input_spec.get("max")
    update_callback = _make_input_update_callback(input_spec["id"])

    if input_type == InputType.BOOLEAN.value:
        prop_definition = bpy.props.BoolProperty(
            name=input_spec["id"],
            default=_coerce_bool(default_value),
            description=f"{input_spec['id']}\nNo numeric limits",
            update=update_callback,
        )
    else:
        has_limits = (min_raw is not None) and (max_raw is not None)
        numeric_default = _coerce_number(default_value, 0.0)

        kwargs = {
            "name": input_spec["id"],
            "default": numeric_default,
            "description": _build_numeric_limits_tooltip(
                input_spec["id"],
                None,
                None,
                None,
                None,
            ),
            "update": update_callback,
        }

        if has_limits:
            min_number = _coerce_number(min_raw, numeric_default)
            max_number = _coerce_number(max_raw, numeric_default)
            if min_number > max_number:
                min_number, max_number = max_number, min_number
            kwargs["description"] = _build_numeric_limits_tooltip(
                input_spec["id"],
                min_number,
                max_number,
                min_number,
                max_number,
            )
            kwargs.update(
                {
                    "min": min_number,
                    "max": max_number,
                    "soft_min": min_number,
                    "soft_max": max_number,
                }
            )

        prop_definition = bpy.props.FloatProperty(**kwargs)

    setattr(bpy.types.WindowManager, prop_name, prop_definition)
    _DYNAMIC_WM_PROPERTIES.add(prop_name)


def _get_active_expression_values(context):
    """Return expression values from the most relevant evaluated parametric object.

    Resolution order:
    1) active object,
    2) active object's parent chain,
    3) first scene object with evaluated parametric outputs.
    """

    def _extract_expressions(target_object):
        if target_object is None:
            return None

        raw_json = target_object.get("parametric_evaluated_outputs_json")
        if not raw_json:
            return None

        try:
            data = json.loads(raw_json)
        except (TypeError, json.JSONDecodeError):
            return None

        if not isinstance(data, dict):
            return None

        expressions = data.get("expressions", {})
        if not isinstance(expressions, dict):
            return None

        return expressions

    active_object = context.active_object

    expressions = _extract_expressions(active_object)
    if expressions is not None:
        return expressions

    current = active_object.parent if active_object is not None else None
    while current is not None:
        expressions = _extract_expressions(current)
        if expressions is not None:
            return expressions
        current = current.parent

    for scene_object in context.scene.objects:
        expressions = _extract_expressions(scene_object)
        if expressions is not None:
            return expressions

    return {}


def _rebuild_numeric_property_with_soft_limits(window_manager, item, soft_min, soft_max):
    """Recreate a numeric WM property so updated hard/soft limits take effect."""
    prop_name = item.prop_name
    if not prop_name:
        return

    if not hasattr(window_manager, prop_name):
        return

    current_value = _coerce_number(getattr(window_manager, prop_name), 0.0)

    hard_min = item.min_value if item.has_limits else None
    hard_max = item.max_value if item.has_limits else None

    if hard_min is not None and hard_max is not None and hard_min > hard_max:
        hard_min, hard_max = hard_max, hard_min

    if soft_min is not None:
        soft_min = _coerce_number(soft_min, current_value)
    if soft_max is not None:
        soft_max = _coerce_number(soft_max, current_value)

    if hard_min is not None and soft_min is not None and soft_min < hard_min:
        soft_min = hard_min
    if hard_max is not None and soft_max is not None and soft_max > hard_max:
        soft_max = hard_max

    if soft_min is not None and soft_max is not None and soft_min > soft_max:
        soft_min, soft_max = soft_max, soft_min

    if hard_min is not None and current_value < hard_min:
        current_value = hard_min
    if hard_max is not None and current_value > hard_max:
        current_value = hard_max

    if hasattr(bpy.types.WindowManager, prop_name):
        delattr(bpy.types.WindowManager, prop_name)

    kwargs = {
        "name": item.input_id,
        "default": current_value,
        "description": _build_numeric_limits_tooltip(
            item.input_id,
            hard_min,
            hard_max,
            soft_min,
            soft_max,
        ),
        "update": _make_input_update_callback(item.input_id),
    }

    if hard_min is not None and hard_max is not None:
        kwargs["min"] = hard_min
        kwargs["max"] = hard_max

    if soft_min is not None:
        kwargs["soft_min"] = soft_min
    if soft_max is not None:
        kwargs["soft_max"] = soft_max

    setattr(bpy.types.WindowManager, prop_name, bpy.props.FloatProperty(**kwargs))
    _DYNAMIC_WM_PROPERTIES.add(prop_name)

    setattr(window_manager, prop_name, current_value)


def _apply_dynamic_soft_limits(context):
    """Apply expression-driven soft limits ($min-/$max-) to synced numeric inputs."""
    window_manager = context.window_manager
    input_items = getattr(window_manager, "dim_parametric_inputs", None)
    if input_items is None:
        return

    expressions = _get_active_expression_values(context)
    if not expressions:
        return

    global _INTERNAL_INPUT_UPDATE
    _INTERNAL_INPUT_UPDATE = True
    try:
        for item in input_items:
            if item.input_type == InputType.BOOLEAN.value:
                continue

            input_id = str(item.input_id)
            if not input_id:
                continue

            normalized = input_id[1:] if input_id.startswith("$") else input_id
            min_key = f"$min-{normalized}"
            max_key = f"$max-{normalized}"

            min_expr_value = expressions.get(min_key)
            max_expr_value = expressions.get(max_key)

            has_min = isinstance(min_expr_value, (int, float))
            has_max = isinstance(max_expr_value, (int, float))

            if not has_min and not has_max:
                if item.has_limits:
                    _rebuild_numeric_property_with_soft_limits(context.window_manager, item, item.min_value, item.max_value)
                continue

            _rebuild_numeric_property_with_soft_limits(
                context.window_manager,
                item,
                min_expr_value if has_min else (item.min_value if item.has_limits else None),
                max_expr_value if has_max else (item.max_value if item.has_limits else None),
            )
    finally:
        _INTERNAL_INPUT_UPDATE = False


def _populate_window_manager_inputs(window_manager, input_specs, reset_variables: bool = False, reset_all: bool = False):
    """Rebuild input metadata and dynamic properties from collected specs.

    When reset_variables is True, inputs of type VARIABLE are always restored
    to their default value instead of preserving the previously set value.
    When reset_all is True, every input is reset to its default regardless of
    any previously set value (used when loading a fresh PME).
    """
    existing_values = {} if reset_all else _build_existing_values(window_manager)

    _cleanup_dynamic_window_manager_properties()

    window_manager.dim_parametric_inputs.clear()

    for input_spec in input_specs:
        input_id = input_spec["id"]
        input_type = input_spec["type"]
        default_value = input_spec.get("default")
        min_raw = input_spec.get("min")
        max_raw = input_spec.get("max")
        prop_name = _prop_name_for_input_id(input_id)

        _register_dynamic_window_manager_property(prop_name, input_spec)

        item = window_manager.dim_parametric_inputs.add()
        item.input_id = input_id
        item.input_name = input_spec.get("name") or ""
        item.prop_name = prop_name
        item.input_type = input_type

        if input_type == InputType.BOOLEAN.value:
            item.has_limits = False
            item.min_value = 0.0
            item.max_value = 0.0

            previous = existing_values.get(input_id)
            if previous and previous["type"] == InputType.BOOLEAN.value:
                setattr(window_manager, prop_name, _coerce_bool(previous["value"]))
            else:
                setattr(window_manager, prop_name, _coerce_bool(default_value))
            continue

        has_limits = (min_raw is not None) and (max_raw is not None)
        item.has_limits = has_limits

        numeric_default = _coerce_number(default_value, 0.0)

        if has_limits:
            min_number = _coerce_number(min_raw, numeric_default)
            max_number = _coerce_number(max_raw, numeric_default)
            if min_number > max_number:
                min_number, max_number = max_number, min_number
            item.min_value = min_number
            item.max_value = max_number
        else:
            min_number = None
            max_number = None
            item.min_value = 0.0
            item.max_value = 0.0

        previous = existing_values.get(input_id)
        is_variable = input_type == InputType.VARIABLE.value
        prev_was_variable = bool(previous) and previous["type"] == InputType.VARIABLE.value
        should_reset = (reset_variables and is_variable) or (prev_was_variable and not is_variable)
        if previous and previous["type"] != InputType.BOOLEAN.value and not should_reset:
            numeric_value = _coerce_number(previous["value"], numeric_default)
        else:
            numeric_value = numeric_default

        if has_limits and min_number is not None and max_number is not None:
            if numeric_value < min_number:
                numeric_value = min_number
            if numeric_value > max_number:
                numeric_value = max_number

        setattr(window_manager, prop_name, numeric_value)


def sync_parametric_inputs_to_window_manager(context, reset_variables: bool = False, reset_all: bool = False):
    """Sync scene configuration inputs into WindowManager dynamic properties."""
    window_manager = context.window_manager
    input_specs = _collect_unique_input_specs(context)

    _populate_window_manager_inputs(window_manager, input_specs, reset_variables=reset_variables, reset_all=reset_all)
    window_manager["parametric_input_specs_json"] = json.dumps(input_specs)
    recalculate_outputs_for_scene(context)
    _apply_dynamic_soft_limits(context)
    return len(input_specs)


def _create_empty_if_missing(name: str, collection):
    """Get an existing object by name or create/link an Empty with that name."""
    existing = bpy.data.objects.get(name)
    if existing is not None:
        return existing

    empty = bpy.data.objects.new(name, None)
    collection.objects.link(empty)
    return empty


def _append_objects_from_blend(blend_path: str, collection):
    """Append all objects from a .blend file and link them to a collection."""
    with bpy.data.libraries.load(blend_path, link=False) as (data_from, data_to):
        data_to.objects = [name for name in data_from.objects if name]

    appended = []
    for obj in data_to.objects:
        if obj is None:
            continue
        if collection not in obj.users_collection:
            collection.objects.link(obj)
        appended.append(obj)

    return appended


def _collect_descendants(root_object, visited: set):
    """Collect all descendant objects recursively."""
    for child in root_object.children:
        if child in visited:
            continue
        visited.add(child)
        _collect_descendants(child, visited)


def _delete_existing_parametric_elements(scene):
    """Delete all currently loaded parametric roots and their descendants."""
    roots = [obj for obj in scene.objects if obj.get("parametric_configuration_data_json")]
    to_delete = set()

    for root_object in roots:
        to_delete.add(root_object)
        _collect_descendants(root_object, to_delete)

    deleted_count = 0
    for obj in list(to_delete):
        if bpy.data.objects.get(obj.name) is None:
            continue
        bpy.data.objects.remove(obj, do_unlink=True)
        deleted_count += 1

    return deleted_count


def _list_parametric_entries_in_directory(directory_path: str):
    """Return loadable parametricElement JSON entries from a directory."""
    entries = []

    try:
        names = os.listdir(directory_path)
    except OSError:
        return entries

    for entry_name in names:
        json_path = os.path.join(directory_path, entry_name)
        if not os.path.isfile(json_path):
            continue

        stem, ext = os.path.splitext(entry_name)
        if ext.lower() != ".json":
            continue

        try:
            data = _read_json_file(json_path)
        except (UnicodeDecodeError, json.JSONDecodeError, OSError):
            continue

        if not _is_parametric_element_data(data):
            continue

        display_name = data.get("name") if isinstance(data, dict) else None
        if not isinstance(display_name, str) or not display_name.strip():
            display_name = stem

        entries.append(
            {
                "pme_id": stem,
                "display_name": display_name.strip(),
                "json_path": json_path,
            }
        )

    entries.sort(key=lambda x: (x["display_name"].lower(), x["pme_id"].lower()))
    return entries


def _populate_available_pme_entries(window_manager, directory_path: str):
    """Refresh WindowManager collection used for PME load buttons."""
    entries = _list_parametric_entries_in_directory(directory_path)

    window_manager.dim_available_pmes.clear()
    for entry in entries:
        item = window_manager.dim_available_pmes.add()
        item.pme_id = entry["pme_id"]
        item.display_name = entry["display_name"]
        item.json_path = entry["json_path"]

    return len(entries)


def _build_blend_index(directory_path: str):
    """Create a map of blend file stem -> path for a directory."""
    blend_by_stem = {}

    try:
        names = os.listdir(directory_path)
    except OSError:
        return blend_by_stem

    for entry_name in names:
        full_path = os.path.join(directory_path, entry_name)
        if not os.path.isfile(full_path):
            continue
        stem, ext = os.path.splitext(entry_name)
        if ext.lower() == ".blend":
            blend_by_stem[stem] = full_path

    return blend_by_stem


def _pick_target_object(imported_objects, expected_name: str, collection):
    """Choose the object that should receive loaded configuration data."""
    if not imported_objects:
        return _create_empty_if_missing(expected_name, collection)

    named = next((obj for obj in imported_objects if obj.name == expected_name), None)
    if named is not None:
        return named

    preferred = next((obj for obj in imported_objects if obj.type != 'EMPTY'), imported_objects[0])
    preferred.name = expected_name
    return preferred


def _parent_object_keep_world(child_object, parent_object):
    """Parent child_object to parent_object while preserving world transform."""
    if child_object is None or parent_object is None:
        return

    if child_object == parent_object:
        return

    world_matrix = child_object.matrix_world.copy()
    child_object.parent = parent_object
    child_object.matrix_parent_inverse = parent_object.matrix_world.inverted()
    child_object.matrix_world = world_matrix


def _is_parametric_element_data(data: dict) -> bool:
    """Return True when JSON payload follows the parametricElement root schema."""
    if not isinstance(data, dict):
        return False
    return str(data.get("type", "")).strip().lower() == "parametricelement"


def _load_parametric_element(parts, root_name: str, blend_by_stem: dict, collection):
    """Load listed parts from blend files and parent them to a root empty."""
    root_object = _create_empty_if_missing(root_name, collection)
    root_object.empty_display_size = 0.05
    root_object.empty_display_type = 'CUBE'


    loaded_children = 0
    missing_parts = 0

    if not isinstance(parts, list):
        return root_object, loaded_children, missing_parts

    for part_name in parts:
        if not isinstance(part_name, str) or not part_name.strip():
            continue

        normalized_part = part_name.strip()
        blend_path = blend_by_stem.get(normalized_part)
        if blend_path is None:
            missing_parts += 1
            continue

        imported_objects = _append_objects_from_blend(blend_path, collection)
        child_object = _pick_target_object(imported_objects, normalized_part, collection)
        _parent_object_keep_world(child_object, root_object)
        loaded_children += 1

    return root_object, loaded_children, missing_parts


def _load_directory_assets(directory_path: str, collection):
    """Load parametricElement assets from a directory and attach JSON to roots."""
    entries = os.listdir(directory_path)
    json_by_stem = {}
    blend_by_stem = {}

    for entry in entries:
        full_path = os.path.join(directory_path, entry)
        if not os.path.isfile(full_path):
            continue

        stem, ext = os.path.splitext(entry)
        ext_lower = ext.lower()

        if ext_lower == ".json":
            json_by_stem[stem] = full_path
        elif ext_lower == ".blend":
            blend_by_stem[stem] = full_path

    processed = 0
    parametric_element_count = 0
    loaded_part_count = 0
    missing_part_count = 0
    ignored_non_element_count = 0

    for stem, json_path in json_by_stem.items():
        try:
            data = _read_json_file(json_path)
        except (UnicodeDecodeError, json.JSONDecodeError, OSError):
            continue

        if not isinstance(data, dict):
            ignored_non_element_count += 1
            continue

        if not _is_parametric_element_data(data):
            ignored_non_element_count += 1
            continue

        target_object, parts_loaded, parts_missing = _load_parametric_element(
            data.get("parts", []),
            stem,
            blend_by_stem,
            collection,
        )
        _set_object_configuration_data(target_object, data)
        processed += 1
        parametric_element_count += 1
        loaded_part_count += parts_loaded
        missing_part_count += parts_missing

    return (
        processed,
        parametric_element_count,
        loaded_part_count,
        missing_part_count,
        ignored_non_element_count,
    )


class PARAMETRIC_OT_load_directory(Operator):
    """Load all matching JSON/BLEND files from a directory"""

    bl_idname = "dim.load_pme_directory"
    bl_label = "Load Directory"
    bl_options = {"REGISTER", "INTERNAL"}

    def execute(self, context):
        """Import directory assets, sync inputs, and report load summary."""
        directory_path = getattr(context.window_manager, "dim_pme_source_directory", "")

        if not directory_path:
            self.report({"ERROR"}, "No source directory selected")
            return {"CANCELLED"}

        if not os.path.isdir(directory_path):
            self.report({"ERROR"}, "Selected source directory does not exist")
            return {"CANCELLED"}

        try:
            (
                processed,
                parametric_element_count,
                loaded_part_count,
                missing_part_count,
                ignored_non_element_count,
            ) = _load_directory_assets(
                directory_path,
                context.collection,
            )
        except OSError as e:
            self.report({"ERROR"}, f"Could not load directory: {e}")
            return {"CANCELLED"}

        if processed == 0:
            self.report({"WARNING"}, "No valid JSON files were loaded")
            return {"CANCELLED"}

        synced_count = sync_parametric_inputs_to_window_manager(context)

        self.report(
            {"INFO"},
            (
                f"Loaded {processed} configuration(s): "
                f"{parametric_element_count} parametricElement, "
                f"{loaded_part_count} part model(s) loaded, "
                f"{missing_part_count} missing part model(s), "
                f"{ignored_non_element_count} non-parametricElement JSON ignored, "
                f"{synced_count} unique input(s)"
            ),
        )
        return {"FINISHED"}


class PARAMETRIC_OT_scan_pme_directory(Operator):
    """Scan selected directory and build the PME button list"""

    bl_idname = "dim.scan_pme_directory"
    bl_label = "Refresh PME List"
    bl_options = {"REGISTER", "INTERNAL"}

    def execute(self, context):
        directory_path = getattr(context.window_manager, "dim_pme_source_directory", "")
        if not directory_path:
            self.report({"ERROR"}, "No source directory selected")
            return {"CANCELLED"}
        if not os.path.isdir(directory_path):
            self.report({"ERROR"}, "Selected source directory does not exist")
            return {"CANCELLED"}

        count = _populate_available_pme_entries(context.window_manager, directory_path)
        self.report({"INFO"}, f"Found {count} loadable PME configuration(s)")
        return {"FINISHED"}


class PARAMETRIC_OT_load_single_pme(Operator):
    """Load one selected PME after clearing existing loaded PMEs"""

    bl_idname = "dim.load_single_pme"
    bl_label = "Load PME"
    bl_options = {"REGISTER", "INTERNAL"}

    pme_id: bpy.props.StringProperty(name="PME ID")  # type: ignore[valid-type]

    def execute(self, context):
        window_manager = context.window_manager
        directory_path = getattr(window_manager, "dim_pme_source_directory", "")
        if not directory_path:
            self.report({"ERROR"}, "No source directory selected")
            return {"CANCELLED"}
        if not os.path.isdir(directory_path):
            self.report({"ERROR"}, "Selected source directory does not exist")
            return {"CANCELLED"}

        entry = next((item for item in window_manager.dim_available_pmes if str(item.pme_id) == str(self.pme_id)), None)
        if entry is None:
            _populate_available_pme_entries(window_manager, directory_path)
            entry = next((item for item in window_manager.dim_available_pmes if str(item.pme_id) == str(self.pme_id)), None)

        if entry is None:
            self.report({"ERROR"}, f"PME '{self.pme_id}' not found in current directory list")
            return {"CANCELLED"}

        json_path = str(entry.json_path)
        if not json_path or not os.path.isfile(json_path):
            self.report({"ERROR"}, f"Configuration file missing for '{self.pme_id}'")
            return {"CANCELLED"}

        try:
            data = _read_json_file(json_path)
        except (UnicodeDecodeError, json.JSONDecodeError, OSError) as e:
            self.report({"ERROR"}, f"Could not read configuration: {e}")
            return {"CANCELLED"}

        if not _is_parametric_element_data(data):
            self.report({"ERROR"}, f"Selected file is not a parametricElement JSON: {self.pme_id}")
            return {"CANCELLED"}

        blend_by_stem = _build_blend_index(directory_path)

        deleted_count = _delete_existing_parametric_elements(context.scene)

        target_object, loaded_parts, missing_parts = _load_parametric_element(
            data.get("parts", []),
            str(entry.pme_id),
            blend_by_stem,
            context.collection,
        )
        _set_object_configuration_data(target_object, data)

        context.view_layer.objects.active = target_object
        target_object.select_set(True)

        synced_count = sync_parametric_inputs_to_window_manager(context, reset_all=True)

        self.report(
            {"INFO"},
            (
                f"Loaded PME '{entry.display_name}': "
                f"deleted {deleted_count} existing object(s), "
                f"{loaded_parts} part model(s) loaded, "
                f"{missing_parts} missing part model(s), "
                f"{synced_count} unique input(s)"
            ),
        )
        return {"FINISHED"}


class PARAMETRIC_OT_sync_inputs(Operator):
    """Sync unique parametric inputs to WindowManager variables"""

    bl_idname = "dim.sync_parametric_inputs"
    bl_label = "Sync Inputs"
    bl_options = {"REGISTER", "INTERNAL"}

    def execute(self, context):
        """Rebuild dynamic input properties from scene configuration data."""
        synced_count = sync_parametric_inputs_to_window_manager(context)
        self.report({"INFO"}, f"Synced {synced_count} unique input(s)")
        return {"FINISHED"}


class PARAMETRIC_OT_debug_evaluation(Operator):
    """Create a debug report for current parametric evaluation"""

    bl_idname = "dim.debug_parametric_evaluation"
    bl_label = "Debug Evaluation"
    bl_options = {"REGISTER", "INTERNAL"}

    def execute(self, context):
        """Evaluate active object configuration and write a debug text report."""
        source_object = _resolve_parametric_source_object(context)
        if source_object is None:
            self.report({"ERROR"}, "No active parametric object found (selection or parent)")
            return {"CANCELLED"}

        raw_json = source_object.get("parametric_configuration_data_json")
        if not raw_json:
            self.report({"ERROR"}, "Resolved parametric object has no configuration JSON")
            return {"CANCELLED"}

        try:
            parsed = json.loads(raw_json)
        except (TypeError, json.JSONDecodeError) as e:
            self.report({"ERROR"}, f"Invalid object configuration JSON: {e}")
            return {"CANCELLED"}

        if not isinstance(parsed, dict):
            self.report({"ERROR"}, "Object configuration JSON is not an object")
            return {"CANCELLED"}

        try:
            config_data = ConfigurationData(parsed)
        except Exception as e:
            self.report({"ERROR"}, f"Configuration parse failed: {e}")
            return {"CANCELLED"}

        window_manager = context.window_manager
        input_items = getattr(window_manager, "dim_parametric_inputs", None)

        input_values = {}
        input_debug = []

        if input_items is not None:
            for item in input_items:
                prop_name = str(item.prop_name)
                if not prop_name or not hasattr(window_manager, prop_name):
                    continue

                prop_value = getattr(window_manager, prop_name)
                input_values[item.input_id] = bool(prop_value) if item.input_type == InputType.BOOLEAN.value else float(prop_value)

                rna_prop = None
                if prop_name in window_manager.bl_rna.properties:
                    rna_prop = window_manager.bl_rna.properties[prop_name]

                input_debug.append(
                    {
                        "id": item.input_id,
                        "type": item.input_type,
                        "prop_name": prop_name,
                        "value": input_values[item.input_id],
                        "item_has_limits": bool(item.has_limits),
                        "item_min": float(item.min_value),
                        "item_max": float(item.max_value),
                        "rna_hard_min": getattr(rna_prop, "hard_min", None),
                        "rna_hard_max": getattr(rna_prop, "hard_max", None),
                        "rna_soft_min": getattr(rna_prop, "soft_min", None),
                        "rna_soft_max": getattr(rna_prop, "soft_max", None),
                    }
                )

        recalculate_outputs_for_scene(context)
        evaluated = evaluate_configuration(config_data, input_values)

        stored_outputs = None
        stored_raw = source_object.get("parametric_evaluated_outputs_json")
        if stored_raw:
            try:
                stored_outputs = json.loads(stored_raw)
            except (TypeError, json.JSONDecodeError):
                stored_outputs = None

        report = {
            "active_object": context.active_object.name if context.active_object is not None else None,
            "source_object": source_object.name,
            "input_count": len(input_debug),
            "inputs": input_debug,
            "expression_count": len(config_data.expressions),
            "output_counts": {
                "shapekeys": len(config_data.output.shapekeys),
                "attachmentpoints": len(config_data.attachmentpoints),
                "values": len(config_data.output.values),
            },
            "evaluated_now": evaluated,
            "stored_on_object": stored_outputs,
        }

        text_name = "parametric_debug_report"
        if text_name in bpy.data.texts:
            text_block = bpy.data.texts[text_name]
            text_block.clear()
        else:
            text_block = bpy.data.texts.new(text_name)

        text_block.write(json.dumps(report, indent=2))
        self.report({"INFO"}, f"Wrote debug report to Text Editor: {text_name}")
        return {"FINISHED"}


CLASSES = (
    PARAMETRIC_PG_input_item,
    PARAMETRIC_PG_pme_entry,
    PARAMETRIC_OT_load_directory,
    PARAMETRIC_OT_scan_pme_directory,
    PARAMETRIC_OT_load_single_pme,
    PARAMETRIC_OT_sync_inputs,
    PARAMETRIC_OT_debug_evaluation,
)


def register():
    """Register classes defined in this module."""
    for cls in CLASSES:
        bpy.utils.register_class(cls)


def unregister():
    """Unregister classes defined in this module."""
    for cls in reversed(CLASSES):
        bpy.utils.unregister_class(cls)
