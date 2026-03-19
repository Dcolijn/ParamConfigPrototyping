import bpy
from .panels import *
from .operators import *

operators = [
    PARAMETRIC_PG_input_item,
    PARAMETRIC_PG_pme_entry,
    PARAMETRIC_OT_load_directory,
    PARAMETRIC_OT_scan_pme_directory,
    PARAMETRIC_OT_load_single_pme,
    PARAMETRIC_OT_sync_inputs,
    PARAMETRIC_OT_debug_evaluation,
    ]
panels = [
    DIM_PT_ParametricConfiguration,
    DIM_PT_ParametricInputs,
    DIM_PT_ParametricOutputs,
    DIM_PT_ParametricOutputShapekeys,
    DIM_PT_ParametricOutputAttachmentPoints,
    DIM_PT_ParametricOutputValues,
    ]

def register():
    
    for cls in operators:
        try:
            bpy.utils.register_class(cls)
        except ValueError:
            try:
                bpy.utils.unregister_class(cls)
                bpy.utils.register_class(cls)
            except Exception as e:
                print(f"Error registering {cls.__name__}: {e}")

    for cls in panels:
        try:
            bpy.utils.register_class(cls)
        except ValueError:
            try:
                bpy.utils.unregister_class(cls)
                bpy.utils.register_class(cls)
            except Exception as e:
                print(f"Error registering {cls.__name__}: {e}")

    if not hasattr(bpy.types.WindowManager, "dim_parametric_inputs"):
        bpy.types.WindowManager.dim_parametric_inputs = bpy.props.CollectionProperty(type=PARAMETRIC_PG_input_item)
    if not hasattr(bpy.types.WindowManager, "dim_parametric_input_index"):
        bpy.types.WindowManager.dim_parametric_input_index = bpy.props.IntProperty(default=0)
    if not hasattr(bpy.types.WindowManager, "dim_available_pmes"):
        bpy.types.WindowManager.dim_available_pmes = bpy.props.CollectionProperty(type=PARAMETRIC_PG_pme_entry)
                
def unregister():

    try:
        cleanup_dynamic_window_manager_properties()
    except Exception:
        pass

    if hasattr(bpy.types.WindowManager, "dim_parametric_inputs"):
        delattr(bpy.types.WindowManager, "dim_parametric_inputs")
    if hasattr(bpy.types.WindowManager, "dim_parametric_input_index"):
        delattr(bpy.types.WindowManager, "dim_parametric_input_index")
    if hasattr(bpy.types.WindowManager, "dim_available_pmes"):
        delattr(bpy.types.WindowManager, "dim_available_pmes")
    
    for cls in reversed(panels):
        try:
            if hasattr(cls, "bl_rna"):
                bpy.utils.unregister_class(cls)
        except RuntimeError as e:
            if "missing bl_rna attribute" not in str(e):
                print(f"Error unregistering {cls.__name__}: {e}")
        except Exception as e:
            print(f"Error unregistering {cls.__name__}: {e}")
    
    for cls in reversed(operators):
        try:
            if hasattr(cls, "bl_rna"):
                bpy.utils.unregister_class(cls)
        except RuntimeError as e:
            if "missing bl_rna attribute" not in str(e):
                print(f"Error unregistering {cls.__name__}: {e}")
        except Exception as e:
            print(f"Error unregistering {cls.__name__}: {e}")
