#include <Arduino.h>
#include <Adafruit_MAX31865.h>
#include <Wire.h>

#define HEATER_PWM_1 1
#define HEATER_PWM_2 2
#define HEATER_PWM_3 4
#define HEATER_PWM_4 5
#define ALERT_INT 6
#define I2C_SDA_PIN 7
#define I2C_SCL_PIN 8
#define MISO 9
#define SCK 10
#define MOSI 11
#define SS1 12
#define SS2 13
#define SS3 14
#define SS4 15
#define LCD_SDA 16
#define LCD_SCL 16
#define LCD_CS 18
#define LCD_DC 19
#define LCD_RST 20
#define LCD_BL 21
#define TP_SDA 47
#define TP_SCL 48
#define TP_IRQ 36
#define TP_RST 35
#define RGB 42
#define FAN_PWM 41
#define HX717_SCK 40
#define HX717_DOUT 38
#define INA226A_HEATER_1_ADDRESS 0xb1000000
#define INA226A_HEATER_2_ADDRESS 0xb1000001
#define INA226A_HEATER_3_ADDRESS 0xb1000100
#define INA226A_HEATER_4_ADDRESS 0xb1000101
// — register addresses —
#define CONFIGURATION 0x00   // config register
#define SHUNT_VOLTAGE 0x01   // shunt voltage (signed)
#define BUS_VOLTAGE 0x02     // bus voltage
#define POWER_REG 0x03       // power (unsigned)
#define CURRENT_REG 0x04     // current (signed)
#define CALIBRATION_REG 0x05 // calibration
// — globals to hold I²C address and LSB scalers —
static uint8_t inaAddr;
static float currentLSB; // in A/bit
static float powerLSB;   // in W/bit
// write a 16-bit register
void writeRegister(uint8_t reg, uint16_t value)
{
  Wire.beginTransmission(inaAddr);
  Wire.write(reg);
  Wire.write(value >> 8);
  Wire.write(value & 0xFF);
  Wire.endTransmission();
}
// read a 16-bit register
uint16_t readRegister(uint8_t reg)
{
  Wire.beginTransmission(inaAddr);
  Wire.write(reg);
  Wire.endTransmission();
  Wire.requestFrom(inaAddr, (uint8_t)2);
  uint16_t hi = Wire.read();
  uint16_t lo = Wire.read();
  return (hi << 8) | lo;
}
// initialize the INA219/INA226-style meter:
void ConfigurationINA22A(uint8_t address)
{
  inaAddr = address;
  // --- build CONFIGURATION word ---
  // bit15 = 1 → reset all registers to default
  // bits 9–11 = 111 → 128-sample averaging
  // bits 6–8 = 100 → bus conv = 1.1 ms
  // bits 3–5 = 100 → shunt conv = 1.1 ms
  // bits 0–2 = 000 → continuous shunt + bus
  uint16_t config = (1 << 15) | (0x07 << 9) | (0x04 << 6) | (0x04 << 3) | 0x00;
  writeRegister(CONFIGURATION, config);
  // --- calibration for 0.1 Ω / 2 A full-scale ---
  const float rShunt = 0.1f;     // Ω
  const float maxCurrent = 2.0f; // A
  // according to datasheet: currentLSB = MaxExpectedCurrent / 2^15
  currentLSB = maxCurrent / 32768.0f; // A per bit
  // calibration = 0.04096 / (currentLSB * Rshunt)
  uint16_t calValue = uint16_t(0.04096f / (currentLSB * rShunt));
  writeRegister(CALIBRATION_REG, calValue);
  // power LSB is 20× current LSB (datasheet)
  powerLSB = currentLSB * 20.0f; // W per bit
}
// read shunt voltage in volts
float shuntVoltage()
{
  int16_t raw = int16_t(readRegister(SHUNT_VOLTAGE));
  // for INA219: LSB = 10 µV → 10e-6 V
  return raw * 10e-6f;
}
// read bus voltage in volts
float busVoltage()
{
  uint16_t raw = readRegister(BUS_VOLTAGE);
  // lower 3 bits are flags → shift them off
  raw >>= 3;
  // INA219: LSB = 4 mV → 4e-3 V
  return raw * 4e-3f;
}
// read current in amps
float current()
{
  int16_t raw = int16_t(readRegister(CURRENT_REG));
  return raw * currentLSB;
}
// read power in watts
float power()
{
  uint16_t raw = readRegister(POWER_REG);
  return raw * powerLSB;
}

// Use software SPI: CS, DI, DO, CLK
Adafruit_MAX31865 thermo_sensor_0 = Adafruit_MAX31865(SS1, MOSI, MISO, SCK);
#define RREF 430.0
#define RNOMINAL 100.0

void initHX71708()
{
  pinMode(HX717_SCK, OUTPUT);
  pinMode(HX717_DOUT, INPUT);
  digitalWrite(HX717_SCK, LOW);
}

long readRaw()
{
  long reading = 0;
  // Wait for DOUT to go LOW
  if (digitalRead(HX717_DOUT) == LOW)
  {
    delayMicroseconds(10);

    // Read 24 bits
    for (int i = 0; i < 24; i++)
    {
      digitalWrite(HX717_SCK, HIGH);
      delayMicroseconds(1);
      digitalWrite(HX717_SCK, LOW);
      reading <<= 1;
      reading |= digitalRead(HX717_DOUT);
    }

    // Sign extend if the 24th bit (MSB) is 1
    if (reading & 0x800000)
    {
      reading |= 0xFF000000;
    }

    // Extra pulses to finish the cycle
    for (int i = 0; i < 4; i++)
    {
      digitalWrite(HX717_SCK, HIGH);
      delayMicroseconds(1);
      digitalWrite(HX717_SCK, LOW);
    }
  }
  // invert the sign of the reading
  return -reading;
}



void setup()
{
  Serial.begin(115200);
  thermo_sensor_0.begin(MAX31865_2WIRE);
  pinMode(HEATER_PWM_1, OUTPUT);
  pinMode(FAN_PWM, OUTPUT);
  initHX71708();
  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
  ConfigurationINA22A(0x40);
}

void loop()
{
  long read = readRaw();
  if (read!=0){
    Serial.println(read);

  }
  // digitalWrite(HEATER_PWM_1, HIGH);
  // digitalWrite(FAN_PWM, HIGH);
  // uint16_t rtd = thermo_sensor_0.readRTD();

  // // Serial.print("RTD value: "); Serial.println(rtd);
  // // float ratio = rtd;
  // // ratio /= 32768;
  // // Serial.print("Ratio = "); Serial.println(ratio,8);
  // // Serial.print("Resistance = "); Serial.println(RREF*ratio,8);
  // Serial.print("Temperature = ");
  // Serial.println(thermo_sensor_0.temperature(RNOMINAL, RREF));

  // // Check and print any faults
  // uint8_t fault = thermo_sensor_0.readFault();
  // if (fault)
  // {
  //   Serial.print("Fault 0x");
  //   Serial.println(fault, HEX);
  //   if (fault & MAX31865_FAULT_HIGHTHRESH)
  //   {
  //     Serial.println("RTD High Threshold");
  //   }
  //   if (fault & MAX31865_FAULT_LOWTHRESH)
  //   {
  //     Serial.println("RTD Low Threshold");
  //   }
  //   if (fault & MAX31865_FAULT_REFINLOW)
  //   {
  //     Serial.println("REFIN- > 0.85 x Bias");
  //   }
  //   if (fault & MAX31865_FAULT_REFINHIGH)
  //   {
  //     Serial.println("REFIN- < 0.85 x Bias - FORCE- open");
  //   }
  //   if (fault & MAX31865_FAULT_RTDINLOW)
  //   {
  //     Serial.println("RTDIN- < 0.85 x Bias - FORCE- open");
  //   }
  //   if (fault & MAX31865_FAULT_OVUV)
  //   {
  //     Serial.println("Under/Over voltage");
  //   }
  //   thermo_sensor_0.clearFault();
  // }
//   Serial.print("Vshunt: "); Serial.print(shuntVoltage(), 6); Serial.println(" V");
//   Serial.print("Vbus:   "); Serial.print(busVoltage(), 3); Serial.println(" V");
//   Serial.print("I:      "); Serial.print(current(), 3); Serial.println(" A");
//   Serial.print("P:      "); Serial.print(power(), 3); Serial.println(" W");
//  Serial.println();
// delay(1000);  

}
