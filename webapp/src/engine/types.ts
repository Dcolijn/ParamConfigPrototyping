export type Scalar = number | boolean;
export type Vec3 = [number, number, number];
export type EvaluatedValue = Scalar | Vec3;

export type OutputType = 'number' | 'vector' | 'euler' | 'shapekey' | 'boolean';
export type InputType = 'number' | 'variable' | 'boolean';

export interface ConfigurationInput {
  id: string;
  name?: string;
  type: InputType;
  default?: unknown;
  min?: number;
  max?: number;
  comment?: string;
}

export interface ShapekeyOutput {
  id: string;
  input: string;
  type: OutputType;
  conversion: string;
  comment?: string;
}

export interface AttachmentPointLocationOutput {
  id: string;
  type: OutputType;
  inputLocation: string;
  inputRotation: string;
  comment?: string;
}

export interface ValueOutput {
  id: string;
  type: OutputType;
  input: string;
  comment?: string;
}

export interface ConfigurationOutput {
  shapekeys: ShapekeyOutput[];
  attachmentpoints: AttachmentPointLocationOutput[];
  values: ValueOutput[];
}

export interface ConfigurationExpression {
  id: string;
  type: OutputType;
  inputs: string[];
  expression: string;
  comment?: string;
}

export interface ConfigurationData {
  input: ConfigurationInput[];
  expressions: ConfigurationExpression[];
  output: ConfigurationOutput;
}

export interface EvaluationResult {
  expressions: Record<string, EvaluatedValue>;
  outputs: {
    shapekeys: Record<string, EvaluatedValue>;
    attachment_points: Record<string, { location: Vec3; rotation: Vec3 }>;
    values: Record<string, EvaluatedValue>;
  };
}
