
import { HardwareComponent, PCBFootprint, FootprintPin } from './types';

// Utility to create common footprints
const generateXiaoFootprint = (name: string, isModule: boolean = true): PCBFootprint => {
  const pins: FootprintPin[] = [];
  const leftNames = ['D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6'];
  const rightNames = ['5V', 'GND', '3V3', 'D10', 'D9', 'D8', 'D7'];
  for (let i = 0; i < 7; i++) {
    pins.push({ id: `L${i}`, name: leftNames[i], x: 0, y: i * 2.54 + 2.54 });
    pins.push({ id: `R${i}`, name: rightNames[i], x: 17.78, y: i * 2.54 + 2.54 });
  }
  return {
    type: isModule ? 'THT' : 'SMD',
    width: 21, height: 20, pins,
    packageName: `Seeed-XIAO-${name}`,
    kicadLib: `Seeed_XIAO:Seeed_XIAO_${name}`
  };
};

const generateGroveFootprint = (name: string): PCBFootprint => {
  const pins: FootprintPin[] = [
    { id: '1', name: 'GND', x: 2, y: 5 },
    { id: '2', name: 'VCC', x: 2, y: 7.54 },
    { id: '3', name: 'SDA', x: 2, y: 10.08 },
    { id: '4', name: 'SCL', x: 2, y: 12.62 },
  ];
  return { 
    type: 'THT', width: 24, height: 20, pins, 
    packageName: `Grove-${name}`, 
    kicadLib: `Connector_Grove:Grove_Vertical` 
  };
};

const IC_FOOTPRINTS = {
  ESP32_S3: 'Package_DFN_QFN:QFN-56-1EP_7x7mm_P0.4mm_EP5.6x5.6mm',
  NRF52840: 'Package_LGA:LGA-73_7x7mm_P0.5mm',
  RP2040: 'Package_DFN_QFN:QFN-56-1EP_7x7mm_P0.4mm',
  SHT40: 'Package_DFN_QFN:DFN-4-1EP_1.5x1.5mm_P0.5mm_EP0.75x1.0mm',
  SSD1315: 'Package_Custom:SSD1315_COF',
  BME280: 'Package_LGA:LGA-8_2.5x2.5mm_P0.65mm',
  LIS3DHTR: 'Package_LGA:LGA-16_3x3mm_P0.5mm',
  HX6538: 'Package_BGA:BGA-121_6x6mm_P0.5mm',
  P9813: 'Package_SO:SOIC-14_3.9x8.7mm_P1.27mm'
};

export const SEEED_MODULE_LIBRARY_IR: HardwareComponent[] = [
  // --- MCUs ---
  {
    id: 'xiao_esp32s3',
    name: 'XIAO ESP32S3',
    type: 'mcu',
    thumb: 'https://files.seeedstudio.com/wiki/SeeedStudio-XIAO-ESP32S3/img/xiaoesp32s3.jpg',
    spec: 'WiFi+BLE 5.0 · 8MB PSRAM',
    price: 75,
    sku: '102010484',
    electrical: { voltageRange: [3.3, 5.0], currentDraw: 500, protocols: ['I2C', 'SPI', 'UART'], pinMapping: { 'SDA': 'D4', 'SCL': 'D5' } },
    physical: { dimensions: { width: 21, height: 17.5, depth: 4 }, weight: 5, connectorType: 'USB-C' },
    software: { 
      requiredLibraries: ['WiFi', 'ESP32'], 
      initCodeSnippet: { arduino: 'Serial.begin(115200);', micropython: 'import machine' }, 
      sampleUsageSnippet: { arduino: 'WiFi.begin("SSID", "PASS");', micropython: 'wifi.active(True)' },
      githubUrl: 'https://github.com/seeed-studio/Seeed_Arduino_XIAO_ESP32S3',
      documentationUrl: 'https://wiki.seeedstudio.com/xiao_esp32s3_getting_started/'
    },
    moduleFootprint: generateXiaoFootprint('ESP32S3'),
    footprint: { type: 'SMD', width: 7, height: 7, pins: [], packageName: IC_FOOTPRINTS.ESP32_S3 },
    pcbIR: { 
      isAnalyzed: true, 
      sourceFiles: [], 
      components: [{ designator: 'U1', value: 'ESP32-S3', footprint: IC_FOOTPRINTS.ESP32_S3, category: 'MCU' }], 
      placementGraph: {}, 
      netTopologyGraph: {}, 
      routingConstraints: { minTraceWidth: 0.1, minClearance: 0.1, layers: 4 },
      placementYaml: "ref: U1\ncomponents:\n  C1: {x: 5.0, y: 5.0, angle: 90}\n  C2: {x: -5.0, y: 5.0, angle: 90}\n  L1: {x: 0.0, y: 8.0}"
    }
  },
  {
    id: 'xiao_nrf52840_sense',
    name: 'XIAO nRF52840 Sense',
    type: 'mcu',
    thumb: 'https://qn.eetree.cn/Fh24C90sGewtAysrRWOzmDxl3oZw',
    spec: 'Bluetooth 5.0 · IMU · Mic',
    price: 79,
    sku: '102010469',
    electrical: { voltageRange: [3.3, 5.0], currentDraw: 200, protocols: ['I2C', 'SPI'], pinMapping: { 'SDA': 'D4', 'SCL': 'D5' } },
    physical: { dimensions: { width: 21, height: 17.5, depth: 4 }, weight: 5, connectorType: 'USB-C' },
    software: { 
      requiredLibraries: ['LSM6DS3', 'PDM'], 
      initCodeSnippet: { arduino: 'LSM6DS3 myIMU(I2C_MODE, 0x6A);', micropython: 'from machine import I2C' }, 
      sampleUsageSnippet: { arduino: 'myIMU.begin();', micropython: 'print(imu.accel)' },
      githubUrl: 'https://github.com/seeed-studio/Seeed_Arduino_LSM6DS3',
      documentationUrl: 'https://wiki.seeedstudio.com/XIAO_BLE_Sense_IMU/'
    },
    moduleFootprint: generateXiaoFootprint('nRF52840-Sense'),
    footprint: { type: 'SMD', width: 7, height: 7, pins: [], packageName: IC_FOOTPRINTS.NRF52840 },
    pcbIR: { isAnalyzed: true, sourceFiles: [], components: [{ designator: 'U1', value: 'nRF52840', footprint: IC_FOOTPRINTS.NRF52840, category: 'MCU' }, { designator: 'U2', value: 'LSM6DS3', footprint: IC_FOOTPRINTS.LIS3DHTR, category: 'Sensor' }], placementGraph: {}, netTopologyGraph: {}, routingConstraints: { minTraceWidth: 0.1, minClearance: 0.1, layers: 4 } }
  },
  {
    id: 'xiao_rp2040',
    name: 'XIAO RP2040',
    type: 'mcu',
    thumb: 'https://qn.eetree.cn/FqkyyCyAwyzS64P_bOZG5FQt2LK1',
    spec: 'Dual-core M0+ · 2MB Flash',
    price: 29,
    sku: '102010428',
    electrical: { voltageRange: [3.3, 5.0], currentDraw: 100, protocols: ['I2C', 'SPI'], pinMapping: { 'SDA': 'D4', 'SCL': 'D5' } },
    physical: { dimensions: { width: 21, height: 17.5, depth: 4 }, weight: 5, connectorType: 'USB-C' },
    software: { 
      requiredLibraries: [], initCodeSnippet: {}, sampleUsageSnippet: {},
      githubUrl: 'https://github.com/seeed-studio/Seeed_Arduino_XIAO_RP2040',
      documentationUrl: 'https://wiki.seeedstudio.com/XIAO-RP2040-Main-Features/'
    },
    moduleFootprint: generateXiaoFootprint('RP2040'),
    footprint: { type: 'SMD', width: 7, height: 7, pins: [], packageName: IC_FOOTPRINTS.RP2040 },
    pcbIR: { isAnalyzed: true, sourceFiles: [], components: [{ designator: 'U1', value: 'RP2040', footprint: IC_FOOTPRINTS.RP2040, category: 'MCU' }], placementGraph: {}, netTopologyGraph: {}, routingConstraints: { minTraceWidth: 0.1, minClearance: 0.1, layers: 2 } }
  },

  // --- Sensors ---
  {
    id: 'bme280',
    name: 'Grove BME280',
    type: 'sensor',
    thumb: 'https://qn.eetree.cn/seeed_product_496_0_8f0Sj6InR2SwwQwEyB1CcEZTc',
    spec: 'Temp/Humi/Baro · I2C',
    price: 35,
    sku: '101020193',
    electrical: { voltageRange: [3.3, 5.0], currentDraw: 1, protocols: ['I2C'], pinMapping: {}, i2cAddress: '0x76' },
    physical: { dimensions: { width: 20, height: 20, depth: 10 }, weight: 4, connectorType: 'Grove' },
    software: { 
      requiredLibraries: ['Adafruit_BME280'], initCodeSnippet: { arduino: 'Adafruit_BME280 bme;' }, 
      sampleUsageSnippet: { arduino: 'bme.readTemperature();' },
      githubUrl: 'https://github.com/adafruit/Adafruit_BME280_Library',
      documentationUrl: 'https://wiki.seeedstudio.com/Grove-BME280/'
    },
    moduleFootprint: generateGroveFootprint('BME280'),
    footprint: { type: 'SMD', width: 2.5, height: 2.5, pins: [], packageName: IC_FOOTPRINTS.BME280 },
    pcbIR: { 
      isAnalyzed: true, 
      components: [{ designator: 'U1', value: 'BME280', footprint: IC_FOOTPRINTS.BME280, category: 'Sensor' }], 
      sourceFiles: [], 
      placementGraph: {}, 
      netTopologyGraph: {}, 
      routingConstraints: { minTraceWidth: 0.15, minClearance: 0.15, layers: 2 },
      placementYaml: "ref: U1\ncomponents:\n  C1: {x: 3.0, y: 0.0, angle: 0}\n  R1: {x: 0.0, y: 3.0, angle: 90}"
    }
  },
  {
    id: 'lis3dhtr',
    name: 'Grove 3-Axis Accel',
    type: 'sensor',
    thumb: 'https://qn.eetree.cn/seeed_product_4533_0_dqZTdqyExg6nRdfH7abZ7Z3HO',
    spec: 'LIS3DHTR · I2C',
    price: 22,
    sku: '101020054',
    electrical: { voltageRange: [3.3, 5.0], currentDraw: 2, protocols: ['I2C'], pinMapping: {}, i2cAddress: '0x18' },
    physical: { dimensions: { width: 20, height: 20, depth: 8 }, weight: 3, connectorType: 'Grove' },
    software: { requiredLibraries: ['LIS3DHTR'], initCodeSnippet: {}, sampleUsageSnippet: {} },
    moduleFootprint: generateGroveFootprint('LIS3DHTR'),
    footprint: { type: 'SMD', width: 3, height: 3, pins: [], packageName: IC_FOOTPRINTS.LIS3DHTR }
  },
  {
    id: 'light_sensor',
    name: 'Grove Light Sensor',
    type: 'sensor',
    thumb: 'https://qn.eetree.cn/seeed_product_5603_0_eBSlQCo28wEYV8I9grrKShUWN',
    spec: 'Analog · Visible Light',
    price: 8,
    sku: '101020132',
    electrical: { voltageRange: [3.3, 5.0], currentDraw: 1, protocols: ['ADC'], pinMapping: { 'SIG': 'Pin3' } },
    physical: { dimensions: { width: 20, height: 20, depth: 8 }, weight: 3, connectorType: 'Grove' },
    software: { requiredLibraries: [], initCodeSnippet: {}, sampleUsageSnippet: {} },
    moduleFootprint: generateGroveFootprint('LightSensor')
  },
  {
    id: 'gps_air530',
    name: 'Grove GPS (Air530)',
    type: 'communication',
    thumb: 'https://qn.eetree.cn/seeed_product_4584_0_Y7hB4U6GZgUDtDwuyKfFZjy1i',
    spec: 'Multi-GNSS · UART',
    price: 85,
    sku: '101020668',
    electrical: { voltageRange: [3.3, 5.0], currentDraw: 40, protocols: ['UART'], pinMapping: { 'TX': 'Pin3', 'RX': 'Pin4' } },
    physical: { dimensions: { width: 20, height: 40, depth: 10 }, weight: 10, connectorType: 'Grove' },
    software: { requiredLibraries: ['TinyGPSPlus'], initCodeSnippet: {}, sampleUsageSnippet: {} },
    moduleFootprint: generateGroveFootprint('GPS')
  },
  {
    id: 'grove_vision_ai_v2',
    name: 'Grove Vision AI V2',
    type: 'sensor',
    thumb: 'https://qn.eetree.cn/seeed_product_5851_0_AQRlcQLEr55DDi8eeNLxq92Ub',
    spec: 'Person Detection · I2C',
    price: 185,
    sku: '114993135',
    electrical: { voltageRange: [3.3, 5.0], currentDraw: 120, protocols: ['I2C'], pinMapping: {} },
    physical: { dimensions: { width: 25, height: 25, depth: 12 }, weight: 15, connectorType: 'Grove' },
    software: { requiredLibraries: ['Seeed_Arduino_GroveVisionAI'], initCodeSnippet: {}, sampleUsageSnippet: {} },
    moduleFootprint: generateGroveFootprint('VisionAI-V2')
  },
  {
    id: 'sht40',
    name: 'Grove SHT40',
    type: 'sensor',
    thumb: 'https://qn.eetree.cn/seeed_product_5384_0_haUIXtorchs96DIPn1CrPu0bb',
    spec: 'High Accuracy T/H · I2C',
    price: 28,
    sku: '101020954',
    electrical: { voltageRange: [3.3, 5.0], currentDraw: 0.1, protocols: ['I2C'], pinMapping: {} },
    physical: { dimensions: { width: 20, height: 20, depth: 10 }, weight: 3, connectorType: 'Grove' },
    software: { 
      requiredLibraries: ['Sensirion_SHT4x'], initCodeSnippet: {}, sampleUsageSnippet: {},
      githubUrl: 'https://github.com/Sensirion/arduino-sht',
      documentationUrl: 'https://wiki.seeedstudio.com/Grove-T-H-Sensor-SHT40/'
    },
    moduleFootprint: generateGroveFootprint('SHT40'),
    footprint: { type: 'SMD', width: 1.5, height: 1.5, pins: [], packageName: IC_FOOTPRINTS.SHT40 },
    pcbIR: { isAnalyzed: true, components: [{ designator: 'U1', value: 'SHT40', footprint: IC_FOOTPRINTS.SHT40, category: 'Sensor' }], sourceFiles: [], placementGraph: {}, netTopologyGraph: {}, routingConstraints: { minTraceWidth: 0.15, minClearance: 0.15, layers: 2 } }
  },
  {
    id: 'sgp40',
    name: 'Grove SGP40',
    type: 'sensor',
    thumb: 'https://qn.eetree.cn/seeed_product_5700_0_yljpelYiW4v993n8YSIisZOsQ',
    spec: 'VOC Index · I2C',
    price: 55,
    sku: '101020811',
    electrical: { voltageRange: [3.3, 5.0], currentDraw: 3, protocols: ['I2C'], pinMapping: {} },
    physical: { dimensions: { width: 20, height: 20, depth: 10 }, weight: 4, connectorType: 'Grove' },
    software: { 
      requiredLibraries: ['Sensirion_SGP40'], initCodeSnippet: {}, sampleUsageSnippet: {},
      githubUrl: 'https://github.com/Sensirion/arduino-sgp40',
      documentationUrl: 'https://wiki.seeedstudio.com/Grove-SGP40/'
    },
    moduleFootprint: generateGroveFootprint('SGP40'),
    footprint: { type: 'SMD', width: 2.45, height: 2.45, pins: [], packageName: 'Package_DFN_QFN:DFN-6-1EP_2.45x2.45mm_P0.8mm' },
    pcbIR: { isAnalyzed: true, components: [{ designator: 'U1', value: 'SGP40', footprint: 'DFN-6', category: 'Sensor' }], sourceFiles: [], placementGraph: {}, netTopologyGraph: {}, routingConstraints: { minTraceWidth: 0.15, minClearance: 0.15, layers: 2 } }
  },

  // --- Display & UI ---
  {
    id: 'oled_096',
    name: 'Grove OLED 0.96"',
    type: 'display',
    thumb: 'https://qn.eetree.cn/seeed_product_4294_0_gtdNV05UDNxOd7wIpZI704Mc7',
    spec: '128x64 · I2C · SSD1315',
    price: 42,
    sku: '101020635',
    electrical: { voltageRange: [3.3, 5.0], currentDraw: 20, protocols: ['I2C'], pinMapping: {}, i2cAddress: '0x3C' },
    physical: { dimensions: { width: 40, height: 40, depth: 12 }, weight: 15, connectorType: 'Grove' },
    software: { 
      requiredLibraries: ['Adafruit_SSD1306'], initCodeSnippet: { arduino: 'Adafruit_SSD1306 display(128, 64, &Wire);' }, 
      sampleUsageSnippet: { arduino: 'display.display();' },
      githubUrl: 'https://github.com/adafruit/Adafruit_SSD1306',
      documentationUrl: 'https://wiki.seeedstudio.com/Grove-OLED_Display_0.96/'
    },
    moduleFootprint: generateGroveFootprint('OLED-0.96'),
    footprint: { type: 'SMD', width: 20, height: 2, pins: [], packageName: IC_FOOTPRINTS.SSD1315 },
    pcbIR: { isAnalyzed: true, components: [{ designator: 'U1', value: 'SSD1315', footprint: 'COF', category: 'Display' }], sourceFiles: [], placementGraph: {}, netTopologyGraph: {}, routingConstraints: { minTraceWidth: 0.15, minClearance: 0.15, layers: 2 } }
  },
  {
    id: 'lcd_rgb_backlight',
    name: 'Grove LCD RGB',
    type: 'display',
    thumb: 'https://qn.eetree.cn/seeed_product_1249_0_O4N2XEHhptZYuyU5koQnpvXEa',
    spec: '16x2 Character · I2C',
    price: 65,
    sku: '104030001',
    electrical: { voltageRange: [5.0, 5.0], currentDraw: 100, protocols: ['I2C'], pinMapping: {} },
    physical: { dimensions: { width: 80, height: 40, depth: 15 }, weight: 45, connectorType: 'Grove' },
    software: { requiredLibraries: ['Grove_LCD_RGB_Backlight'], initCodeSnippet: {}, sampleUsageSnippet: {} },
    moduleFootprint: generateGroveFootprint('LCD-RGB')
  },

  // --- Actuators ---
  {
    id: 'led_chainable',
    name: 'Grove RGB LED',
    type: 'actuator',
    thumb: 'https://qn.eetree.cn/seeed_product_2812_0_kB9d8YJ1sdu0bdpnx2GtCULrF',
    spec: 'P9813 · Chainable · GPIO',
    price: 12,
    sku: '104030006',
    electrical: { voltageRange: [5.0, 5.0], currentDraw: 60, protocols: ['GPIO'], pinMapping: { 'CLK': 'Pin3', 'DATA': 'Pin4' } },
    physical: { dimensions: { width: 20, height: 20, depth: 10 }, weight: 4, connectorType: 'Grove' },
    software: { 
      requiredLibraries: ['ChainableLED'], initCodeSnippet: { arduino: 'ChainableLED leds(3, 4, 1);' }, 
      sampleUsageSnippet: { arduino: 'leds.setColorRGB(0, 255, 0, 0);' },
      githubUrl: 'https://github.com/pjpmarques/ChainableLED',
      documentationUrl: 'https://wiki.seeedstudio.com/Grove-Chainable_RGB_LED/'
    },
    moduleFootprint: generateGroveFootprint('RGB-LED'),
    footprint: { type: 'SMD', width: 5, height: 5, pins: [], packageName: IC_FOOTPRINTS.P9813 },
    pcbIR: { isAnalyzed: true, components: [{ designator: 'U1', value: 'P9813', footprint: IC_FOOTPRINTS.P9813, category: 'LED Driver' }], sourceFiles: [], placementGraph: {}, netTopologyGraph: {}, routingConstraints: { minTraceWidth: 0.2, minClearance: 0.2, layers: 2 } }
  },
  {
    id: 'buzzer',
    name: 'Grove Buzzer',
    type: 'actuator',
    thumb: 'https://qn.eetree.cn/seeed_product_4525_0_JaHftX2UHYrmP5Y1dFXN3SJGY',
    spec: 'Piezo · Passive · GPIO',
    price: 4,
    sku: '101020005',
    electrical: { voltageRange: [3.3, 5.0], currentDraw: 20, protocols: ['PWM'], pinMapping: { 'SIG': 'Pin3' } },
    physical: { dimensions: { width: 20, height: 20, depth: 10 }, weight: 4, connectorType: 'Grove' },
    software: { requiredLibraries: [], initCodeSnippet: {}, sampleUsageSnippet: {} },
    moduleFootprint: generateGroveFootprint('Buzzer')
  },
  {
    id: 'rotary_encoder',
    name: 'Grove Encoder',
    type: 'actuator',
    thumb: 'https://qn.eetree.cn/seeed_product_1803_0_jTLMJ2MEKbpzG7n7vqfSZqGXn',
    spec: '360 Pulse · 2xGPIO',
    price: 18,
    sku: '101020052',
    electrical: { voltageRange: [3.3, 5.0], currentDraw: 5, protocols: ['GPIO'], pinMapping: { 'CHA': 'Pin3', 'CHB': 'Pin4' } },
    physical: { dimensions: { width: 20, height: 20, depth: 15 }, weight: 10, connectorType: 'Grove' },
    software: { requiredLibraries: ['Encoder'], initCodeSnippet: {}, sampleUsageSnippet: {} },
    moduleFootprint: generateGroveFootprint('Encoder')
  },

  // --- Interaction & Others ---
  {
    id: 'ultrasonic',
    name: 'Grove Ultrasonic',
    type: 'sensor',
    thumb: 'https://qn.eetree.cn/seeed_product_2281_0_fPKLz0NddJFujKbLGo0Ik6EH3',
    spec: '3cm-350cm · Single Pin',
    price: 12,
    sku: '101020054',
    electrical: { voltageRange: [3.3, 5.0], currentDraw: 15, protocols: ['GPIO'], pinMapping: { 'SIG': 'Pin3' } },
    physical: { dimensions: { width: 40, height: 20, depth: 15 }, weight: 12, connectorType: 'Grove' },
    software: { 
      requiredLibraries: ['Ultrasonic'], initCodeSnippet: {}, sampleUsageSnippet: {},
      githubUrl: 'https://github.com/Seeed-Studio/Seeed_Arduino_UltrasonicRanger',
      documentationUrl: 'https://wiki.seeedstudio.com/Grove-Ultrasonic_Ranger/'
    },
    moduleFootprint: generateGroveFootprint('Ultrasonic'),
    pcbIR: { isAnalyzed: true, components: [{ designator: 'U1', value: 'MCU_Custom', footprint: 'SOP-8', category: 'Logic' }], sourceFiles: [], placementGraph: {}, netTopologyGraph: {}, routingConstraints: { minTraceWidth: 0.3, minClearance: 0.3, layers: 1 } }
  },
  {
    id: 'pir_sensor',
    name: 'Grove PIR Sensor',
    type: 'sensor',
    thumb: 'https://qn.eetree.cn/seeed_product_1772_0_Xx0EeGcN5NrCXZkcQLqYHBBa6',
    spec: 'Infrared Motion · Adj',
    price: 9,
    sku: '101020020',
    electrical: { voltageRange: [3.3, 5.0], currentDraw: 0.1, protocols: ['GPIO'], pinMapping: { 'SIG': 'Pin3' } },
    physical: { dimensions: { width: 20, height: 20, depth: 10 }, weight: 4, connectorType: 'Grove' },
    software: { 
      requiredLibraries: [], initCodeSnippet: {}, sampleUsageSnippet: {},
      githubUrl: 'https://github.com/Seeed-Studio/Grove_PIR_Motion_Sensor',
      documentationUrl: 'https://wiki.seeedstudio.com/Grove-PIR_Motion_Sensor/'
    },
    moduleFootprint: generateGroveFootprint('PIR'),
    pcbIR: { isAnalyzed: true, components: [{ designator: 'U1', value: 'BISS0001', footprint: 'SOP-16', category: 'Logic' }], sourceFiles: [], placementGraph: {}, netTopologyGraph: {}, routingConstraints: { minTraceWidth: 0.2, minClearance: 0.2, layers: 1 } }
  },
  {
    id: 'soil_moisture',
    name: 'Grove Soil Moisture',
    type: 'sensor',
    thumb: 'https://qn.eetree.cn/seeed_product_1678_0_UWyv7ux1lG9jVXMSLiqHUbgJz',
    spec: 'Analog Resistance · Soil',
    price: 6,
    sku: '101020008',
    electrical: { voltageRange: [3.3, 5.0], currentDraw: 5, protocols: ['ADC'], pinMapping: { 'SIG': 'Pin3' } },
    physical: { dimensions: { width: 20, height: 60, depth: 8 }, weight: 10, connectorType: 'Grove' },
    software: { requiredLibraries: [], initCodeSnippet: {}, sampleUsageSnippet: {}, documentationUrl: 'https://wiki.seeedstudio.com/Grove-Moisture_Sensor/' },
    moduleFootprint: generateGroveFootprint('Soil-Moisture'),
    pcbIR: { isAnalyzed: true, components: [{ designator: 'U1', value: 'LM358', footprint: 'SOP-8', category: 'OpAmp' }], sourceFiles: [], placementGraph: {}, netTopologyGraph: {}, routingConstraints: { minTraceWidth: 0.3, minClearance: 0.3, layers: 1 } }
  },
  {
    id: 'relay',
    name: 'Grove Relay',
    type: 'actuator',
    thumb: 'https://qn.eetree.cn/seeed_product_1804_0_kngHNnGjudLy2M0rokAeQTdaQ',
    spec: 'Max 250VAC/5A · Signal',
    price: 15,
    sku: '103020005',
    electrical: { voltageRange: [3.3, 5.0], currentDraw: 100, protocols: ['GPIO'], pinMapping: { 'SIG': 'Pin3' } },
    physical: { dimensions: { width: 40, height: 20, depth: 18 }, weight: 15, connectorType: 'Grove' },
    software: { requiredLibraries: [], initCodeSnippet: {}, sampleUsageSnippet: {}, documentationUrl: 'https://wiki.seeedstudio.com/Grove-Relay/' },
    moduleFootprint: generateGroveFootprint('Relay'),
    pcbIR: { isAnalyzed: true, components: [{ designator: 'K1', value: 'Relay_Generic', footprint: 'Relay_THT', category: 'Electromechanical' }], sourceFiles: [], placementGraph: {}, netTopologyGraph: {}, routingConstraints: { minTraceWidth: 0.5, minClearance: 0.5, layers: 2 } }
  },
  {
    id: 'lora_e5',
    name: 'Grove LoRa-E5',
    type: 'communication',
    thumb: 'https://qn.eetree.cn/seeed_product_4867_0_R46J2deW3OEENWERgdGKw4EOT',
    spec: 'STM32WLE5JC · Long Range',
    price: 125,
    sku: '113020091',
    electrical: { voltageRange: [3.3, 5.0], currentDraw: 80, protocols: ['UART'], pinMapping: { 'TX': 'Pin3', 'RX': 'Pin4' } },
    physical: { dimensions: { width: 40, height: 20, depth: 10 }, weight: 8, connectorType: 'Grove' },
    software: { 
      requiredLibraries: ['LoRaWan_App'], initCodeSnippet: {}, sampleUsageSnippet: {},
      githubUrl: 'https://github.com/Seeed-Studio/LoRa-E5-at-command-firmware',
      documentationUrl: 'https://wiki.seeedstudio.com/Grove_LoRa_E5_New/'
    },
    moduleFootprint: generateGroveFootprint('LoRa-E5'),
    footprint: { type: 'SMD', width: 12, height: 12, pins: [], packageName: 'Package_LGA:LGA-28_12x12mm_P0.75mm' },
    pcbIR: { isAnalyzed: true, components: [{ designator: 'U1', value: 'STM32WLE5', footprint: 'LGA-28', category: 'Wireless' }], sourceFiles: [], placementGraph: {}, netTopologyGraph: {}, routingConstraints: { minTraceWidth: 0.15, minClearance: 0.15, layers: 4 } }
  }
];

export const PROTOTYPE_STEPS = [
  { label: '意图识别', icon: '🎯' },
  { label: '原型连线', icon: '🔗' },
  { label: '固件构建', icon: '💻' },
  { label: '外壳生成', icon: '📦' },
  { label: '原型校验', icon: '✓' }
];

export const PCB_STEPS = [
  { label: '原理图拼装', icon: '📋' },
  { label: '硬件裁剪', icon: '✂️' },
  { label: 'PCB约束', icon: '📐' },
  { label: 'AI布局', icon: '🧩' },
  { label: 'AI布线', icon: '⚡' },
  { label: '制造导出', icon: '📦' }
];
