/**
 * 内置参考代码片段库(A1 过渡方案)。
 * 优先级:数据库片段(software.initCodeSnippet/sampleUsageSnippet,按语言键)> 本文件 > 诚实 TODO。
 * 片段结构化存储,拼装器负责合并 includes/globals/setup/loop 与依赖库去重。
 * Seeed 官方库优先;MicroPython 只收录有把握的,缺的走 TODO 不硬编。
 * A2 阶段将由 github_harvest 管线把片段收进数据库,本文件逐步退役。
 */
export interface Snippet {
  includes: string[];   // #include / import 行
  globals: string[];    // 全局实例定义
  setup: string[];      // setup()/初始化段
  loop: string[];       // loop()/主循环段
  libs: string[];       // 需要安装的库名(IDE 库管理器)
}
export interface LangSnippets { arduino?: Snippet; micropython?: Snippet; }

export const BUILTIN_SNIPPETS: Record<string, LangSnippets> = {
  oled_096: {
    arduino: {
      includes: ['#include <Wire.h>', '#include <U8g2lib.h>'],
      globals: ['U8G2_SSD1306_128X64_NONAME_F_HW_I2C u8g2(U8G2_R0, U8X8_PIN_NONE);'],
      setup: ['u8g2.begin();'],
      loop: ['u8g2.clearBuffer();', 'u8g2.setFont(u8g2_font_ncenB08_tr);', 'u8g2.drawStr(0, 12, "Seeed Genesis");', 'u8g2.sendBuffer();'],
      libs: ['U8g2'],
    },
    micropython: {
      includes: ['from machine import Pin, I2C', 'import ssd1306'],
      globals: ['i2c = I2C(0, scl=Pin(5), sda=Pin(4))', 'oled = ssd1306.SSD1306_I2C(128, 64, i2c)'],
      setup: [],
      loop: ['oled.fill(0)', 'oled.text("Seeed Genesis", 0, 0)', 'oled.show()'],
      libs: ['micropython-ssd1306'],
    },
  },
  sht40: {
    arduino: {
      includes: ['#include <Wire.h>', '#include "Adafruit_SHT4x.h"'],
      globals: ['Adafruit_SHT4x sht4;'],
      setup: ['if (!sht4.begin()) Serial.println("SHT4x not found");'],
      loop: ['sensors_event_t humi, temp;', 'sht4.getEvent(&humi, &temp);', 'Serial.print("Temp: "); Serial.print(temp.temperature); Serial.print(" C, Humi: "); Serial.println(humi.relative_humidity);'],
      libs: ['Adafruit SHT4x'],
    },
  },
  bme280: {
    arduino: {
      includes: ['#include <Wire.h>', '#include "Seeed_BME280.h"'],
      globals: ['BME280 bme280;'],
      setup: ['if (!bme280.init()) Serial.println("BME280 init failed");'],
      loop: ['Serial.print("Temp: "); Serial.print(bme280.getTemperature()); Serial.print(" C, Pressure: "); Serial.print(bme280.getPressure()); Serial.print(" Pa, Humi: "); Serial.println(bme280.getHumidity());'],
      libs: ['Grove - Barometer Sensor BME280 (Seeed)'],
    },
  },
  grove_aht20_i2c_industrial_grade_temperature_and_humidity_sensor: {
    arduino: {
      includes: ['#include <Wire.h>', '#include "AHT20.h"'],
      globals: ['AHT20 aht20;'],
      setup: ['aht20.begin();'],
      loop: ['float ahtHumi = 0, ahtTemp = 0;', 'aht20.getSensor(&ahtHumi, &ahtTemp);', 'Serial.print("AHT20 Temp: "); Serial.print(ahtTemp); Serial.print(" C, Humi: "); Serial.println(ahtHumi * 100);'],
      libs: ['Seeed_Arduino_AHT20'],
    },
  },
  lis3dhtr: {
    arduino: {
      includes: ['#include <Wire.h>', '#include "LIS3DHTR.h"'],
      globals: ['LIS3DHTR<TwoWire> lis;'],
      setup: ['lis.begin(Wire, 0x19);', 'lis.setOutputDataRate(LIS3DHTR_DATARATE_50HZ);'],
      loop: ['Serial.print("X: "); Serial.print(lis.getAccelerationX()); Serial.print(" Y: "); Serial.print(lis.getAccelerationY()); Serial.print(" Z: "); Serial.println(lis.getAccelerationZ());'],
      libs: ['Seeed_Arduino_LIS3DHTR'],
    },
  },
  sgp40: {
    arduino: {
      includes: ['#include <Wire.h>', '#include "sensirion_common.h"', '#include "sgp40_voc_index.h"'],
      globals: [],
      setup: ['sgp40_probe();'],
      loop: ['int32_t vocIndex = 0;', 'sgp40_measure_voc_index(&vocIndex);', 'Serial.print("VOC Index: "); Serial.println(vocIndex);'],
      libs: ['Seeed_Arduino_SGP40'],
    },
  },
  lcd_rgb_backlight: {
    arduino: {
      includes: ['#include <Wire.h>', '#include "rgb_lcd.h"'],
      globals: ['rgb_lcd lcd;'],
      setup: ['lcd.begin(16, 2);', 'lcd.setRGB(0, 128, 64);'],
      loop: ['lcd.setCursor(0, 0);', 'lcd.print("Seeed Genesis");'],
      libs: ['Grove - LCD RGB Backlight (Seeed)'],
    },
  },
  relay: {
    arduino: {
      includes: [],
      globals: ['const int RELAY_PIN = D2;'],
      setup: ['pinMode(RELAY_PIN, OUTPUT);'],
      loop: ['digitalWrite(RELAY_PIN, HIGH); // 按业务条件控制', 'delay(500);', 'digitalWrite(RELAY_PIN, LOW);'],
      libs: [],
    },
    micropython: {
      includes: ['from machine import Pin'],
      globals: ['relay = Pin(2, Pin.OUT)'],
      setup: [],
      loop: ['relay.on()  # 按业务条件控制', 'time.sleep(0.5)', 'relay.off()'],
      libs: [],
    },
  },
  buzzer: {
    arduino: {
      includes: [],
      globals: ['const int BUZZER_PIN = D3;'],
      setup: ['pinMode(BUZZER_PIN, OUTPUT);'],
      loop: ['tone(BUZZER_PIN, 1000, 200); // 1kHz 响 200ms'],
      libs: [],
    },
    micropython: {
      includes: ['from machine import Pin, PWM'],
      globals: ['buzzer = PWM(Pin(3), freq=1000, duty=0)'],
      setup: [],
      loop: ['buzzer.duty(512)', 'time.sleep(0.2)', 'buzzer.duty(0)'],
      libs: [],
    },
  },
  rotary_encoder: {
    arduino: {
      includes: [],
      globals: ['const int ENC_A = D1; const int ENC_B = D2;', 'volatile long encPos = 0; int lastA = LOW;'],
      setup: ['pinMode(ENC_A, INPUT_PULLUP); pinMode(ENC_B, INPUT_PULLUP);'],
      loop: ['int a = digitalRead(ENC_A);', 'if (a != lastA) { encPos += (digitalRead(ENC_B) != a) ? 1 : -1; Serial.print("Encoder: "); Serial.println(encPos); }', 'lastA = a;'],
      libs: [],
    },
  },
  soil_moisture: {
    arduino: {
      includes: [],
      globals: ['const int SOIL_PIN = A0;'],
      setup: [],
      loop: ['int soil = analogRead(SOIL_PIN); // 模拟量,合法使用 analogRead', 'Serial.print("Soil: "); Serial.println(soil);'],
      libs: [],
    },
    micropython: {
      includes: ['from machine import ADC, Pin'],
      globals: ['soil = ADC(Pin(0))'],
      setup: [],
      loop: ['print("Soil:", soil.read_u16())'],
      libs: [],
    },
  },
  light_sensor: {
    arduino: {
      includes: [],
      globals: ['const int LIGHT_PIN = A0;'],
      setup: [],
      loop: ['int light = analogRead(LIGHT_PIN);', 'Serial.print("Light: "); Serial.println(light);'],
      libs: [],
    },
  },
  ultrasonic: {
    arduino: {
      includes: ['#include "Ultrasonic.h"'],
      globals: ['Ultrasonic ultrasonic(D0);'],
      setup: [],
      loop: ['long cm = ultrasonic.MeasureInCentimeters();', 'Serial.print("Distance: "); Serial.print(cm); Serial.println(" cm");'],
      libs: ['Grove_Ultrasonic_Ranger (Seeed)'],
    },
  },
  gps_air530: {
    arduino: {
      includes: ['#include <TinyGPSPlus.h>', '#include <SoftwareSerial.h>'],
      globals: ['TinyGPSPlus gps;', 'SoftwareSerial gpsSerial(D7, D6); // RX, TX'],
      setup: ['gpsSerial.begin(9600);'],
      loop: ['while (gpsSerial.available()) gps.encode(gpsSerial.read());', 'if (gps.location.isUpdated()) { Serial.print("Lat: "); Serial.print(gps.location.lat(), 6); Serial.print(" Lng: "); Serial.println(gps.location.lng(), 6); }'],
      libs: ['TinyGPSPlus'],
    },
  },
};

/** 名称/协议兜底匹配(仅在 id 不在库中时用;analog 只给真 ADC 模块) */
export function matchBuiltinByHeuristic(name: string, protocols: string[] | undefined): string | null {
  const n = name.toLowerCase();
  if (/oled|ssd13/.test(n)) return 'oled_096';
  if (/bme280/.test(n)) return 'bme280';
  if (/sht4/.test(n)) return 'sht40';
  if (/aht20/.test(n)) return 'grove_aht20_i2c_industrial_grade_temperature_and_humidity_sensor';
  if (/lis3dh/.test(n)) return 'lis3dhtr';
  if (/sgp40/.test(n)) return 'sgp40';
  if (/rgb.*lcd|lcd.*rgb|16\s*x\s*2/.test(n)) return 'lcd_rgb_backlight';
  if (/relay|继电器/.test(n)) return 'relay';
  if (/buzzer|蜂鸣/.test(n)) return 'buzzer';
  if (/encoder|编码器/.test(n)) return 'rotary_encoder';
  if (/soil|土壤/.test(n)) return 'soil_moisture';
  if (/ultrasonic|超声/.test(n)) return 'ultrasonic';
  if (/gps|air530/.test(n)) return 'gps_air530';
  if (/light|光线|光照/.test(n) && (protocols || []).includes('ADC')) return 'light_sensor';
  return null;
}
