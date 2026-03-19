import bpy
from .UI import register as ui_register, unregister as ui_unregister

window_properties = [
    (
        "dim_pme_source_directory",
        bpy.props.StringProperty(
            name="PME Source Directory",
            subtype="DIR_PATH",
            description="Directory containing matching .json and .blend parametric assets",
        ),
    ),
    ]
object_properties = []
scene_properties = []
classes = []

def register():
    for cls in classes:
        try:
            bpy.utils.register_class(cls)
        except ValueError:
            try:
                bpy.utils.unregister_class(cls)
                bpy.utils.register_class(cls)
            except Exception as e:
                print(f"Error registering {cls.__name__}: {e}")
                
    for prop_name, prop_value in window_properties:
        setattr(bpy.types.WindowManager, prop_name, prop_value)
        
    for prop_name, prop_value in object_properties:
        setattr(bpy.types.Object, prop_name, prop_value)
        
    for prop_name, prop_value in scene_properties:
        setattr(bpy.types.Scene, prop_name, prop_value)
    
    try:
        ui_unregister()
    except Exception as e:
        pass
    
    ui_register()
    
def unregister():
    try:
        ui_unregister()
    except Exception as e:
        pass
    
    for cls in reversed(classes):
        try:
            bpy.utils.unregister_class(cls)
        except Exception as e:
            print(f"Error unregistering {cls.__name__}: {e}")
    
    for prop_name, _ in window_properties:
        if hasattr(bpy.types.WindowManager, prop_name):
            delattr(bpy.types.WindowManager, prop_name)
        
    for prop_name, _ in object_properties:
        if hasattr(bpy.types.Object, prop_name):
            delattr(bpy.types.Object, prop_name)
        
    for prop_name, _ in scene_properties:
        if hasattr(bpy.types.Scene, prop_name):
            delattr(bpy.types.Scene, prop_name)