from enum import Enum
from typing import Any
from mathutils import Vector, Euler

class OutputType(Enum):
    NUMBER = "number"
    VECTOR = "vector"
    EULER = "euler"
    SHAPEKEY = "shapekey"
    BOOLEAN = "boolean"

class InputType(Enum):
    NUMBER = "number"
    VARIABLE = "variable"
    BOOLEAN = "boolean"

class ConfigurationInput:
    id: str
    name: str | None
    type: InputType
    default: Any
    min: float | None
    max: float | None
    comment: str | None
    
    def __init__(self, data):
        self.id = data.get("id", "")
        self.name = data.get("name")
        self.type = InputType(data.get("type", InputType.NUMBER.value))
        self.default = data.get("default")
        self.min = data.get("min")
        self.max = data.get("max")
        self.comment = data.get("comment")
    
class ShapekeyOutput:
    id: str
    input: str
    type: OutputType
    conversion: str
    comment: str | None
    
    def __init__(self, data):
        self.id = data.get("id", "")
        self.input = data.get("input", data.get("inputs", ""))
        self.type = OutputType(data.get("type", OutputType.SHAPEKEY.value))
        self.conversion = data.get("conversion", "")
        self.comment = data.get("comment")
    
class AttachmentPointLocationOutput:
    id: str
    type: OutputType
    input_location: str
    input_rotation: str
    comment: str | None
    
    def __init__(self, data):
        self.id = data.get("id", "")
        self.type = OutputType(data.get("type", OutputType.VECTOR.value))
        self.input_location = data.get("inputLocation", data.get("inputs", "vec3(0, 0, 0)"))
        self.input_rotation = data.get("inputRotation", data.get("inputs", "vec3(0, 0, 0)"))
        self.comment = data.get("comment")

class ValueOutput:
    id: str
    type: OutputType
    input: str
    comment: str | None
    
    def __init__(self, data):
    
        self.id = data.get("id", "")
        self.type = OutputType(data.get("type", OutputType.NUMBER.value))
        self.input = data.get("input", data.get("inputs", ""))
        self.comment = data.get("comment")
    
class ConfigurationOutput:
    shapekeys: list[ShapekeyOutput] | None
    attachmentpoints: list[AttachmentPointLocationOutput] | None
    values: list[ValueOutput] | None
    
    def __init__(self, data):
        shapekeys = data.get("shapekeys", [])
        attachmentpoints = data.get("attachmentpoints", data.get("attachmentPoints", []))
        values = data.get("values", [])

        self.shapekeys = [ShapekeyOutput(sk) for sk in shapekeys if isinstance(sk, dict)]
        self.attachmentpoints = [AttachmentPointLocationOutput(ap) for ap in attachmentpoints if isinstance(ap, dict)]
        self.values = [ValueOutput(vo) for vo in values if isinstance(vo, dict)]
    
class ConfigurationExpression:
    id: str
    type: OutputType
    inputs: list[str]
    expression: str
    comment: str | None
    
    def __init__(self, data):
        self.id = data.get("id", "")
        self.type = OutputType(data.get("type", OutputType.NUMBER.value))
        inputs = data.get("inputs", [])
        self.inputs = inputs if isinstance(inputs, list) else []
        self.expression = data.get("expression", "")
        self.comment = data.get("comment")
    

class ConfigurationData:
    
    input: list[ConfigurationInput]
    expressions: list[ConfigurationExpression]
    output: ConfigurationOutput
    
    def __init__(self, json_data):
        self.json_data = json_data
        if "input" in json_data and isinstance(json_data["input"], list):
            self.input = [ConfigurationInput(data) for data in json_data["input"] if isinstance(data, dict)]
        else:
            self.input = []
        if "expressions" in json_data and isinstance(json_data["expressions"], list):
            self.expressions = [ConfigurationExpression(data) for data in json_data["expressions"] if isinstance(data, dict)]
        else:
            self.expressions = []
        output_payload = {}
        if "output" in json_data and isinstance(json_data["output"], dict):
            output_payload = dict(json_data["output"])

        if "attachmentpoints" in output_payload:
            pass
        elif "attachmentPoints" in output_payload:
            pass
        elif "attachmentPoints" in json_data and isinstance(json_data["attachmentPoints"], list):
            output_payload["attachmentPoints"] = json_data["attachmentPoints"]

        self.output = ConfigurationOutput(output_payload)
    
