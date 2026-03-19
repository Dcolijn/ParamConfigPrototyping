import bpy
import json
from bpy.types import Context, Panel, Object
from ..content.configurationData import ConfigurationData, InputType, OutputType


def _configuration_data_from_raw_json(raw_json) -> ConfigurationData | None:
    if not raw_json:
        return None

    try:
        data = json.loads(raw_json)
    except (TypeError, json.JSONDecodeError):
        return None

    if not isinstance(data, dict):
        return None

    try:
        return ConfigurationData(data)
    except Exception:
        return None


def _get_configuration_data(context: Context) -> ConfigurationData | None:
    active_object = context.active_object

    if active_object is not None:
        raw_json = active_object.get("parametric_configuration_data_json")
        if not raw_json:
            return None
    else:
        raw_json = context.scene.get("parametric_configuration_data_json")

    return _configuration_data_from_raw_json(raw_json)


def _has_loaded_parametric_json(context: Context) -> bool:
    return _get_configuration_data(context) is not None


def _get_evaluated_outputs(context: Context):
    active_object = context.active_object
    if active_object is None:
        return None

    raw_json = active_object.get("parametric_evaluated_outputs_json")
    if not raw_json:
        return None

    try:
        data = json.loads(raw_json)
    except (TypeError, json.JSONDecodeError):
        return None

    if not isinstance(data, dict):
        return None

    outputs = data.get("outputs")
    if not isinstance(outputs, dict):
        return None

    return outputs

class DIM_PT_ParametricConfiguration(Panel):
    bl_label = "Parametric Configuration"
    bl_idname = "DIM_PT_parametric_configuration"
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = 'Parametric Configuration'

    def draw(self, context):
        window_manager = context.window_manager
        
        layout = self.layout
        scene = context.scene
        
        layout.label(text="Configure parametric dimensions here.")
        # Add more UI elements as needed
        
        box = layout.box()
        box.label(text="JSON Configuration", icon='FILE_SCRIPT')

        if "dim_pme_source_directory" in window_manager.bl_rna.properties:
            box.prop(window_manager, "dim_pme_source_directory", text="Directory")

            row = box.row(align=True)
            row.operator("dim.scan_pme_directory", text="Refresh PME List", icon='FILE_REFRESH')

            available_pmes = getattr(window_manager, "dim_available_pmes", None)
            if available_pmes is None or len(available_pmes) == 0:
                box.label(text="No PMEs found. Click 'Refresh PME List'.", icon='INFO')
            else:
                box.label(text="Load PME:")
                button_column = box.column(align=True)
                for entry in available_pmes:
                    op = button_column.operator(
                        "dim.load_single_pme",
                        text=str(entry.display_name) if entry.display_name else str(entry.pme_id),
                        icon='OBJECT_DATA',
                    )
                    op.pme_id = str(entry.pme_id)

        else:
            box.label(text="Register 'dim_pme_source_directory' first.", icon='ERROR')
            
class DIM_PT_ParametricInputs(Panel):
    bl_label = "Parametric Inputs"
    bl_idname = "DIM_PT_parametric_inputs"
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = 'Parametric Configuration'

    def draw(self, context):
        layout = self.layout
        window_manager = context.window_manager
        input_items = getattr(window_manager, "dim_parametric_inputs", None)

        layout.operator("dim.sync_parametric_inputs", text="Sync Inputs", icon='FILE_REFRESH')
        layout.operator("dim.debug_parametric_evaluation", text="Debug Evaluation", icon='TEXT')

        if input_items is None or len(input_items) == 0:
            layout.label(text="No loaded inputs found.", icon='INFO')
            return

        layout.label(text="Unique inputs:")
        
        for item in input_items:
            label = str(item.input_name) if item.input_name else str(item.input_id)
            prop_name = str(item.prop_name)
            if not prop_name or not hasattr(window_manager, prop_name):
                continue
            if item.input_type == InputType.VARIABLE.value:
                continue
            elif item.input_type == InputType.BOOLEAN.value:
                layout.prop(window_manager, prop_name, text=label)
            else:
                layout.prop(window_manager, prop_name, text=label)
                
        layout.label(text="Set Variables:")
        # These are generally less common and more likely to be used for driving outputs, so we put them in a separate section at the bottom, they are things like global variables that rarely get changed
        
        for item in input_items:
            label = str(item.input_name) if item.input_name else str(item.input_id)
            prop_name = str(item.prop_name)
            if not prop_name or not hasattr(window_manager, prop_name):
                continue
            if item.input_type == InputType.VARIABLE.value:
                layout.prop(window_manager, prop_name, text=label)
            else:
                continue
        
class DIM_PT_ParametricOutputs(Panel):
    bl_label = "Parametric Outputs"
    bl_idname = "DIM_PT_parametric_outputs"
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = 'Parametric Configuration'

    @classmethod
    def poll(cls, context: Context):
        return _has_loaded_parametric_json(context)

    def draw(self, context):
        layout = self.layout
        scene = context.scene
        config_data = _get_configuration_data(context)

        if config_data is None:
            layout.label(text="No valid configuration data loaded.", icon='ERROR')
            return
            
class DIM_PT_ParametricOutputShapekeys(Panel):
    bl_label = "Shapekeys"
    bl_idname = "DIM_PT_parametric_output_shapekeys"
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = 'Parametric Configuration'
    bl_parent_id = "DIM_PT_parametric_outputs"
    
    @classmethod
    def poll(cls, context: Context):
        return _get_configuration_data(context) is not None

    def draw(self, context):
        layout = self.layout
        config_data = _get_configuration_data(context)
        object: Object = context.active_object
        evaluated_outputs = _get_evaluated_outputs(context)
        evaluated_shapekeys = {}
        if evaluated_outputs is not None:
            evaluated_shapekeys = evaluated_outputs.get("shapekeys", {})

        if config_data is None:
            return
        
        for output in config_data.output.shapekeys:
            row = layout.row()
            row.label(text=f"{output.id}", text_ctxt="", translate=False)
            row.scale_x = 0.80
            evaluated_value = evaluated_shapekeys.get(output.id)
            if isinstance(evaluated_value, (int, float)):
                row.label(text=f"{float(evaluated_value):.4f}")
            elif object.data.shape_keys and output.id in object.data.shape_keys.key_blocks:
                row.label(text=f"{object.data.shape_keys.key_blocks[output.id].value:.4f}")
            else:
                row.label(text="N/A")
            
class DIM_PT_ParametricOutputAttachmentPoints(Panel):
    bl_label = "Attachment Points"
    bl_idname = "DIM_PT_parametric_output_attachment_points"
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = 'Parametric Configuration'
    bl_parent_id = "DIM_PT_parametric_outputs"
    
    @classmethod
    def poll(cls, context: Context):
        return _get_configuration_data(context) is not None

    def draw(self, context):
        layout = self.layout
        config_data = _get_configuration_data(context)
        evaluated_outputs = _get_evaluated_outputs(context)
        evaluated_attachment_points = {}
        if evaluated_outputs is not None:
            evaluated_attachment_points = evaluated_outputs.get("attachment_points", {})

        if config_data is None:
            return
        
        for output in config_data.output.attachmentpoints:
            box = layout.box()
            box.label(text=f"{output.id}", icon='CON_CHILDOF')
            evaluated = evaluated_attachment_points.get(output.id, {})
            location = evaluated.get("location", output.input_location)
            rotation = evaluated.get("rotation", output.input_rotation)
            box.label(text=f"Location: {location}")
            box.label(text=f"Rotation: {rotation}")
            
class DIM_PT_ParametricOutputValues(Panel):
    bl_label = "Values"
    bl_idname = "DIM_PT_parametric_output_values"
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = 'Parametric Configuration'
    bl_parent_id = "DIM_PT_parametric_outputs"
    
    @classmethod
    def poll(cls, context: Context):
        return _get_configuration_data(context) is not None

    def draw(self, context):
        layout = self.layout
        config_data = _get_configuration_data(context)
        evaluated_outputs = _get_evaluated_outputs(context)
        evaluated_values = {}
        if evaluated_outputs is not None:
            evaluated_values = evaluated_outputs.get("values", {})

        if config_data is None:
            return
        
        for output in config_data.output.values:
            box = layout.box()
            evaluated_value = evaluated_values.get(output.id, "N/A")
            if output.type == OutputType.NUMBER:
                box.label(text=f"{output.input}", icon='DOT')
            elif output.type == OutputType.VECTOR:
                box.label(text=f"{output.input}", icon='EMPTY_DATA')
            elif output.type == OutputType.BOOLEAN:
                box.label(text=f"{output.input}", icon='CHECKMARK')
            box.label(text=f"Value: {evaluated_value}")