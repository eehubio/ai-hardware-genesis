
export enum WorkflowMode {
  PROTOTYPE = 'prototype',
  PCB = 'pcb'
}

export type ComponentType = string;

export interface FootprintPin {
  id: string;
  name: string;
  x: number;
  y: number;
}

export interface PCBFootprint {
  type: 'SMD' | 'THT';
  width: number;
  height: number;
  pins: FootprintPin[];
  packageName: string;
  kicadLib?: string;
}

export interface ElectricalIR {
  voltageRange: [number, number];
  currentDraw: number;
  protocols: ('I2C' | 'SPI' | 'UART' | 'GPIO' | 'ADC' | 'DAC' | 'PWM')[];
  pinMapping: Record<string, string>;
  i2cAddress?: string;
}

export interface PhysicalIR {
  dimensions: { width: number; height: number; depth: number };
  weight: number;
  connectorType: 'Grove' | 'PinHeader' | 'USB-C' | 'Castellated';
  mountingHoles?: { x: number; y: number; diameter: number }[];
}

export interface SoftwareIR {
  requiredLibraries: string[];
  initCodeSnippet: Record<string, string>;
  sampleUsageSnippet: Record<string, string>;
  githubUrl?: string;
  documentationUrl?: string;
}

export interface PCB_IR {
  isAnalyzed: boolean;
  sourceFiles: string[];
  components: { designator: string; value: string; footprint: string; category: string }[];
  placementGraph: any;
  netTopologyGraph: any;
  routingConstraints: {
    minTraceWidth: number;
    minClearance: number;
    layers: number;
    impedanceControl?: boolean;
  };
  placementYaml?: string; // 存储 kicad-parts-placer 兼容的 YAML 配置
}

export interface HardwareComponent {
  id: string;
  name: string;
  type: ComponentType;
  thumb: string;
  spec: string;
  price: number;
  sku?: string;
  electrical: ElectricalIR;
  physical: PhysicalIR;
  software: SoftwareIR;
  pcbIR?: PCB_IR;
  footprint?: PCBFootprint;
  moduleFootprint?: PCBFootprint;
  availableFootprints?: PCBFootprint[];
  // Database metadata fields for Vercel/Mock Serverless Database
  description?: string;
  functionalities?: string[];
  voltageSource?: string;
  driverRequired?: string;
  referenceProjectUrl?: string;
  designProjectFiles?: string[];
  llmPromptTags?: string[];
}

export interface CanvasComponent extends HardwareComponent {
  instanceId: string;
  x: number;
  y: number;
  pcbX?: number;
  pcbY?: number;
  isSimplified?: boolean;
  isChipOnly?: boolean; 
}

export interface Connection {
  fromId: string;
  toId: string;
  busType: 'I2C' | 'SPI' | 'GPIO' | 'UART' | 'POWER';
}

export interface AIAgentMessage {
  id: string;
  role: 'assistant' | 'user';
  text: string;
  cards?: ExplainCard[];
  options?: string[]; // Clickable multiple-choice options for step-by-step discovery
}

export interface ExplainCard {
  title: string;
  description: string;
  action?: string;
  type: 'info' | 'warn' | 'success';
  solutionComponents?: string[]; 
}

export type PipelineStatus = 'draft' | 'running' | 'blocked' | 'ready' | 'released';

export type IRType = 
  | 'ProjectIR' 
  | 'PrototypeIR' 
  | 'FirmwareIR' 
  | 'SoftwareUsageIR' 
  | 'SchematicIR' 
  | 'SimplifiedCircuitIR' 
  | 'PCBConstraintIR' 
  | 'PlacementIR' 
  | 'RoutingIR' 
  | 'DRCReportIR' 
  | 'ManufacturingIR' 
  | 'ValidationReportIR';

export interface Artifact {
  id: string;
  label: string;
  status: PipelineStatus;
  type: IRType;
  lastUpdated?: string;
  version: string;
}

export interface ProjectState {
  mode: WorkflowMode;
  currentStep: number;
  components: CanvasComponent[];
  connections: Connection[];
  selectedComponentId: string | null;
  dxfUploaded: boolean;
  dxfFileName?: string;
  status: PipelineStatus;
  pcbConstraints: {
    width: number;
    height: number;
    layers: number;
    thickness: number;
  };
  artifacts: Artifact[];
  library: HardwareComponent[]; 
  categories: string[];
  pastedImages?: { id: string, url: string, x: number, y: number, width: number }[];
}
