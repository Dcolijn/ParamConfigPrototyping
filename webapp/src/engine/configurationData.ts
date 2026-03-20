import type {
  AttachmentPointLocationOutput,
  ConfigurationData,
  ConfigurationExpression,
  ConfigurationInput,
  ConfigurationOutput,
  InputType,
  OutputType,
  ShapekeyOutput,
  ValueOutput,
} from './types';

const OUTPUT_TYPES = new Set<OutputType>(['number', 'vector', 'euler', 'shapekey', 'boolean']);
const INPUT_TYPES = new Set<InputType>(['number', 'variable', 'boolean']);

const asObject = (value: unknown): Record<string, unknown> => (value && typeof value === 'object' ? (value as Record<string, unknown>) : {});
const asString = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback);
const asNumber = (value: unknown): number | undefined => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);
const asStringArray = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []);

const assertParametricElementType = (root: Record<string, unknown>): void => {
  // In gewone taal: we accepteren alleen JSON's met type "parametricElement".
  if (root.type !== 'parametricElement') {
    throw new Error('Ongeldige PME JSON: alleen type "parametricElement" is toegestaan.');
  }
};

const asOutputType = (value: unknown, fallback: OutputType): OutputType => {
  const candidate = asString(value);
  return OUTPUT_TYPES.has(candidate as OutputType) ? (candidate as OutputType) : fallback;
};

const asInputType = (value: unknown, fallback: InputType): InputType => {
  const candidate = asString(value);
  return INPUT_TYPES.has(candidate as InputType) ? (candidate as InputType) : fallback;
};

const parseInput = (raw: unknown): ConfigurationInput => {
  const data = asObject(raw);
  return {
    id: asString(data.id),
    name: typeof data.name === 'string' ? data.name : undefined,
    type: asInputType(data.type, 'number'),
    default: data.default,
    min: asNumber(data.min),
    max: asNumber(data.max),
    comment: typeof data.comment === 'string' ? data.comment : undefined,
  };
};

const parseExpression = (raw: unknown): ConfigurationExpression => {
  const data = asObject(raw);
  return {
    id: asString(data.id),
    type: asOutputType(data.type, 'number'),
    inputs: asStringArray(data.inputs),
    expression: asString(data.expression),
    comment: typeof data.comment === 'string' ? data.comment : undefined,
  };
};

const parseShapekey = (raw: unknown): ShapekeyOutput => {
  const data = asObject(raw);
  return {
    id: asString(data.id),
    input: asString(data.input, asString(data.inputs)),
    type: asOutputType(data.type, 'shapekey'),
    conversion: asString(data.conversion),
    comment: typeof data.comment === 'string' ? data.comment : undefined,
  };
};

const parseAttachmentPoint = (raw: unknown): AttachmentPointLocationOutput => {
  const data = asObject(raw);
  return {
    id: asString(data.id),
    type: asOutputType(data.type, 'vector'),
    inputLocation: asString(data.inputLocation, asString(data.inputs, 'vec3(0, 0, 0)')),
    inputRotation: asString(data.inputRotation, asString(data.inputs, 'vec3(0, 0, 0)')),
    comment: typeof data.comment === 'string' ? data.comment : undefined,
  };
};

const parseValue = (raw: unknown): ValueOutput => {
  const data = asObject(raw);
  return {
    id: asString(data.id),
    type: asOutputType(data.type, 'number'),
    input: asString(data.input, asString(data.inputs)),
    comment: typeof data.comment === 'string' ? data.comment : undefined,
  };
};

const parseOutput = (rawOutput: unknown, root: Record<string, unknown>): ConfigurationOutput => {
  const output = asObject(rawOutput);
  const attachmentSource = output.attachmentpoints ?? output.attachmentPoints ?? root.attachmentPoints ?? [];

  return {
    shapekeys: (Array.isArray(output.shapekeys) ? output.shapekeys : []).map(parseShapekey),
    attachmentpoints: (Array.isArray(attachmentSource) ? attachmentSource : []).map(parseAttachmentPoint),
    values: (Array.isArray(output.values) ? output.values : []).map(parseValue),
  };
};

export const parseConfigurationData = (payload: unknown): ConfigurationData => {
  const root = asObject(payload);
  assertParametricElementType(root);

  return {
    input: (Array.isArray(root.input) ? root.input : []).map(parseInput),
    expressions: (Array.isArray(root.expressions) ? root.expressions : []).map(parseExpression),
    parts: asStringArray(root.parts),
    output: parseOutput(root.output, root),
  };
};

export const loadConfigurationDataFromJson = (jsonText: string): ConfigurationData => {
  const parsed = JSON.parse(jsonText) as unknown;
  return parseConfigurationData(parsed);
};
