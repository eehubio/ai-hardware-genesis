import { HardwareComponent, PCBFootprint, FootprintPin } from '../types';
import { SEEED_MODULE_LIBRARY_IR } from '../constants';

export interface DatabaseComponent extends HardwareComponent {
  description?: string;
  functionalities?: string[];
  voltageSource?: string;
  driverRequired?: string;
  referenceProjectUrl?: string;
  designProjectFiles?: string[]; // e.g., ["schema.sch", "layout.kicad_pcb"]
  llmPromptTags?: string[]; // keywords used by AI
}

const LOCAL_STORAGE_DB_KEY = 'vercel_simulated_db_components';

// Initialize DB with seed library, making sure we enrich with requested fields
const getSeedDatabase = (): DatabaseComponent[] => {
  return SEEED_MODULE_LIBRARY_IR.map(comp => {
    // Determine custom fields based on component ID
    let description = `${comp.name} 是一款高集成、低功耗的优秀硬件模块。`;
    let functionalities = [`作为${comp.type === 'mcu' ? '主控制器' : '外部辅助模块'}参与系统的物理交互与状态感知`];
    let voltageSource = `${comp.electrical.voltageRange[0]}V - ${comp.electrical.voltageRange[1]}V`;
    let driverRequired = comp.software.requiredLibraries?.[0] || '无需特殊驱动';
    let referenceProjectUrl = comp.software.githubUrl || 'https://github.com/seeed-studio';
    let designProjectFiles = comp.pcbIR?.sourceFiles && comp.pcbIR.sourceFiles.length > 0 
      ? comp.pcbIR.sourceFiles 
      : [`${comp.id}_v1.0.schlib`, `${comp.id}_v1.0.kicad_mod`];
    let llmPromptTags = [comp.id, comp.type, 'Grove', 'Seeed_XIAO'];

    if (comp.id === 'xiao_esp32s3') {
      description = '一款基于 ESP32-S3 芯片的高性价比智能主控，具备强大的 Wi-Fi / Bluetooth 5.0 双模无线连接能力，内置双核处理核心，主频高达 240MHz。';
      functionalities = ['连接 Wi-Fi 网络获取云端数据', '蓝牙低功耗广播与本地控制', '管理外接传感器的 I2C 与数字信号', '运行微控制器嵌入式操作逻辑'];
      voltageSource = '5.0V (USB-C) / 3.7V (Lipo 锂电池) / 3.3V (VCC)';
      driverRequired = 'ESP32 S3 Arduino Core / ESP-IDF';
      referenceProjectUrl = 'https://github.com/seeed-studio/Seeed_Arduino_XIAO_ESP32S3/tree/main/examples';
    } else if (comp.id === 'bme280') {
      description = '工业级高精度温湿度及大气压气压传感器，采用 Bosch 原装 BME280 核心芯片，基于 I2C 接口，是环境监测的理想选择。';
      functionalities = ['实时检测当前环境的环境温度 (℃)', '高分辨率检测当前环境的空气湿度 (%RH)', '高精气压检测及海拔高度换算 (hPa)'];
      voltageSource = '3.3V / 5.0V (Grove 接口自动转换)';
      driverRequired = 'Adafruit BME280 Library';
      referenceProjectUrl = 'https://wiki.seeedstudio.com/Grove-BME280/#example';
    } else if (comp.id === 'oled_096') {
      description = '0.96英寸自发光单色 OLED 液晶显示屏，基于 SSD1315 显示驱动，128x64的高对比度点阵，用来直观反映设备的数据状态。';
      functionalities = ['实时渲染设备当前文本数据与中英文字符', '绘制简单的波形、图表与自定义像素图案', '提供系统引导、状态加载以及菜单交互界面'];
      voltageSource = '3.3V / 5.0V';
      driverRequired = 'Adafruit SSD1306 & Adafruit GFX';
      referenceProjectUrl = 'https://github.com/adafruit/Adafruit_SSD1306/tree/master/examples';
    } else if (comp.id === 'rotary_encoder') {
      description = '360度旋转带微动按键的旋转编码器，输出正交脉冲信号，适合做人机交互的参数调节、数值加减以及菜单选项控制。';
      functionalities = ['通过正交脉冲监测左右双向转动格数', '按下集成按键触发选择或重置菜单选项', '作为物理电位器的替代品，提供长寿命无极调节'];
      voltageSource = '3.3V / 5.0V';
      driverRequired = 'Encoder.h / Standard Rotary Library';
    }

    return {
      ...comp,
      description,
      functionalities,
      voltageSource,
      driverRequired,
      referenceProjectUrl,
      designProjectFiles,
      llmPromptTags
    };
  });
};

export const getDatabaseComponents = (): DatabaseComponent[] => {
  const stored = localStorage.getItem(LOCAL_STORAGE_DB_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {
      console.error('Failed to parse simulated Vercel database components', e);
    }
  }
  const seed = getSeedDatabase();
  localStorage.setItem(LOCAL_STORAGE_DB_KEY, JSON.stringify(seed));
  return seed;
};

export const saveDatabaseComponent = (comp: DatabaseComponent): DatabaseComponent[] => {
  const current = getDatabaseComponents();
  const existsIdx = current.findIndex(c => c.id === comp.id);
  
  let updated: DatabaseComponent[];
  if (existsIdx >= 0) {
    updated = [...current];
    updated[existsIdx] = comp;
  } else {
    updated = [...current, comp];
  }
  
  localStorage.setItem(LOCAL_STORAGE_DB_KEY, JSON.stringify(updated));
  return updated;
};

export const resetDatabaseToDefaults = (): DatabaseComponent[] => {
  const seed = getSeedDatabase();
  localStorage.setItem(LOCAL_STORAGE_DB_KEY, JSON.stringify(seed));
  return seed;
};
