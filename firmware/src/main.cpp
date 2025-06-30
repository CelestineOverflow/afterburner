#include <Arduino.h>
#include <Adafruit_MAX31865.h>
#include <Wire.h>
#include <esp_display_panel.hpp>
#include <lvgl.h>
#include "lvgl_v8_port.h"
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>
#include "driver/ledc.h"
#include <ArduinoJson.h>
#include "esp_err.h"
using namespace esp_panel::drivers;
using namespace esp_panel::board;

#define HEATER_PWM_1 4
#define HEATER_PWM_2 2
#define HEATER_PWM_3 1
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
static uint8_t inaAddr;
static float currentLSB; // in A/bit
static float powerLSB;   // in W/bit


SPIClass spiThermo(HSPI);
Adafruit_MAX31865 thermo_0(SS1, &spiThermo);
Adafruit_MAX31865 thermo_1(SS2, &spiThermo);
Adafruit_MAX31865 thermo_2(SS3, &spiThermo);
Adafruit_MAX31865 thermo_3(SS4, &spiThermo);
#define RREF 430.0
#define RNOMINAL 100.0
uint16_t rtd[4];

void pressureSensorTask(void *pvParameters);

float temp_sensor_values[] = {
    55.1,
    55.2,
    55.3,
    55.4};

float set_temp_values[] = {
    20.0,
    20.0,
    20.0,
    20.0};

bool enable_heater[] = {
    false,
    false,
    false,
    false};



// UI object
lv_obj_t *temp_display;
lv_obj_t *sensor_labels[4];
lv_obj_t *sensor_values[4];
lv_obj_t *set_temp_labels[4];
lv_obj_t *force_label;
lv_obj_t *force_value;
lv_obj_t *force_chart;
lv_chart_series_t *force_series;

// Sensors Containers Color
lv_color_t sensor_colors[4] = {
    lv_color_hex(0x8000ff),
    lv_color_hex(0xffaa00),
    lv_color_hex(0x02db9e),
    lv_color_hex(0xf700ce)};

// Create the temperature control UI
void create_temp_control_ui()
{
    lvgl_port_lock(-1);

    // Create main container with title
    temp_display = lv_obj_create(lv_scr_act());
    lv_obj_set_size(temp_display, 240, 280);
    lv_obj_center(temp_display); // Center the display
    lv_obj_set_style_radius(temp_display, 3, 0);
    lv_obj_set_style_bg_color(temp_display, lv_color_hex(0xffffff), 0);
    lv_obj_set_style_border_width(temp_display, 0, 0);
    lv_obj_set_style_pad_all(temp_display, 3, 0);

    // Create sensor section
    lv_obj_t *sensor_section = lv_obj_create(temp_display);
    lv_obj_set_size(sensor_section, 230, 180);
    lv_obj_set_style_radius(sensor_section, 3, 0);
    lv_obj_set_style_bg_color(sensor_section, lv_color_hex(0xffffff), 0);
    lv_obj_set_style_border_width(sensor_section, 0, 0);
    lv_obj_align(sensor_section, LV_ALIGN_TOP_MID, 0, 5);

    // Create sensors display (2x2 grid)
    char sensor_text[16];
    char value_text[16];

    int section_width = 90;
    int section_height = 80;

    for (int i = 0; i < 4; i++)
    {
        int row = i / 2;
        int col = i % 2;

        // Sensor container
        lv_obj_t *sensor_cont = lv_obj_create(sensor_section);
        lv_obj_set_size(sensor_cont, section_width, section_height);
        lv_obj_set_style_radius(sensor_cont, 3, 0);
        lv_obj_set_style_bg_color(sensor_cont, sensor_colors[i], 0);
        lv_obj_set_style_border_width(sensor_cont, 0, 0);
        lv_obj_align(sensor_cont, LV_ALIGN_TOP_LEFT, 10 + col * 100, 5 + row * (section_height + 5));

        // Sensor label
        sprintf(sensor_text, "Heater %d", i + 1);
        sensor_labels[i] = lv_label_create(sensor_cont);
        lv_label_set_text(sensor_labels[i], sensor_text);
        lv_obj_set_style_text_font(sensor_labels[i], &lv_font_montserrat_16, 0);
        lv_obj_set_style_text_color(sensor_labels[i], lv_color_hex(0xFFFFFF), 0);
        lv_obj_align(sensor_labels[i], LV_ALIGN_TOP_MID, 0, 2);

        // Sensor value
        float temp_value = temp_sensor_values[i];
        sprintf(value_text, "%.1f °C", temp_value);
        sensor_values[i] = lv_label_create(sensor_cont);
        lv_label_set_text(sensor_values[i], value_text);
        lv_obj_set_style_text_font(sensor_values[i], &lv_font_montserrat_12, 0);
        lv_obj_set_style_text_color(sensor_values[i], lv_color_hex(0x00FFFF), 0);
        lv_obj_align_to(sensor_values[i], sensor_labels[i], LV_ALIGN_OUT_BOTTOM_MID, 0, 2);
        // Set Value
        float set_temp = set_temp_values[i];
        sprintf(value_text, "%.1f °C", set_temp);
        set_temp_labels[i] = lv_label_create(sensor_cont);
        lv_label_set_text(set_temp_labels[i], value_text);
        lv_obj_set_style_text_font(set_temp_labels[i], &lv_font_montserrat_12, 0);
        lv_obj_set_style_text_color(set_temp_labels[i], lv_color_hex(0xFFFF00), 0);
        lv_obj_align_to(set_temp_labels[i], sensor_values[i], LV_ALIGN_OUT_BOTTOM_MID, 0, 2);
    }

    // ——— FORCE DISPLAY PANEL (at the bottom) ———
    lv_obj_t *force_section = lv_obj_create(temp_display);
    lv_obj_set_size(force_section, 230, 80);
    lv_obj_set_style_radius(force_section, 3, 0);
    lv_obj_set_style_bg_color(force_section, lv_color_hex(0xEEEEEE), 0);
    lv_obj_set_style_border_width(force_section, 0, 0);
    lv_obj_align(force_section, LV_ALIGN_BOTTOM_MID, 0, -5);

    // —— Tiny force-history chart on left ——
    force_chart = lv_chart_create(force_section);
    lv_obj_set_size(force_chart, 80, 40);
    // minimal style: no border, transparent bg
    lv_obj_set_style_border_width(force_chart, 0, LV_PART_MAIN);
    lv_obj_set_style_bg_opa(force_chart, LV_OPA_TRANSP, LV_PART_MAIN);
    lv_chart_set_type(force_chart, LV_CHART_TYPE_LINE);
    lv_chart_set_point_count(force_chart, 100);
    lv_chart_set_axis_tick(force_chart, LV_CHART_AXIS_PRIMARY_X, 0, 0, 0, 0, true, 0);
    lv_chart_set_axis_tick(force_chart, LV_CHART_AXIS_PRIMARY_Y, 0, 0, 0, 0, true, 0);
    lv_obj_align(force_chart, LV_ALIGN_LEFT_MID, 10, 0);

    // create the series (blue line)
    force_series = lv_chart_add_series(force_chart, lv_color_hex(0x0000FF), LV_CHART_AXIS_PRIMARY_Y);
    for (int i = 0; i < 100; i++)
        force_series->y_points[i] = 0;
    lv_chart_refresh(force_chart);

    // —— Force text on the right of chart ——
    // Label “Force:”
    force_label = lv_label_create(force_section);
    lv_label_set_text(force_label, "Force:");
    lv_obj_set_style_text_font(force_label, &lv_font_montserrat_16, 0);
    // align middle left of this label to the right middle of the chart, with 10px gap
    lv_obj_align_to(force_label, force_chart, LV_ALIGN_OUT_RIGHT_MID, 10, -8);

    // Numeric value below the title
    force_value = lv_label_create(force_section);
    lv_label_set_text(force_value, "123.4 N");
    lv_obj_set_style_text_font(force_value, &lv_font_montserrat_20, 0);
    lv_obj_set_style_text_color(force_value, lv_color_hex(0x0000FF), 0);
    // align top of this label to the bottom-right of the “Force:” label
    lv_obj_align_to(force_value, force_label, LV_ALIGN_OUT_BOTTOM_LEFT, 0, 4);
    
    lvgl_port_unlock();
}

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

volatile bool touchAlert = false;     // set in ISR

void interruptHandler()
{
    touchAlert = true; 
}

void SelfCheckTest()
{
    lvgl_port_lock(-1);

    // Create a dedicated splash screen
    lv_obj_t* splash = lv_obj_create(NULL);
    lv_scr_load(splash);
    lv_obj_set_style_bg_color(splash, lv_color_hex(0x222222), 0);

    // Title
    lv_obj_t* title = lv_label_create(splash);
    lv_label_set_text(title, "Running Self-Test");
    lv_obj_set_style_text_font(title, &lv_font_montserrat_20, 0);
    lv_obj_set_style_text_color(title, lv_color_hex(0xFFFFFF), 0);
    lv_obj_align(title, LV_ALIGN_TOP_MID, 0, 20);

    // Progress bar
    lv_obj_t* bar = lv_bar_create(splash);
    lv_obj_set_size(bar, 200, 10);
    lv_obj_align(bar, LV_ALIGN_TOP_MID, 0, 60);
    lv_bar_set_range(bar, 0, 100);
    lv_bar_set_value(bar, 0, LV_ANIM_OFF);

    // Status list
    const char* tests[] = { "Thermocouples", "Load Cell", "INA226 Power", "Touch Controller" };
    lv_obj_t* status_labels[4];
    for(int i=0;i<4;i++) {
      status_labels[i] = lv_label_create(splash);
      lv_label_set_text_fmt(status_labels[i], "%s: ...", tests[i]);
      lv_obj_set_style_text_font(status_labels[i], &lv_font_montserrat_14, 0);
      lv_obj_set_style_text_color(status_labels[i], lv_color_hex(0xAAAAAA), 0);
      lv_obj_align(status_labels[i], LV_ALIGN_TOP_LEFT, 20, 90 + i* 20);
    }

    lvgl_port_unlock();
    Serial.println("Performing self-check test...");

    // ---- Actual Checks ----
    for(int step=0; step<4; step++) {
      // simulate a check (replace with your real check)
      delay(100);
      bool ok = true; // your check routine here

      // update bar
      lvgl_port_lock(-1);
      lv_bar_set_value(bar, (step+1)*25, LV_ANIM_ON);

      // update status text & color
      if(ok) {
        lv_label_set_text_fmt(status_labels[step], "%s: OK", tests[step]);
        lv_obj_set_style_text_color(status_labels[step], lv_color_hex(0x00FF00), 0);
      } else {
        lv_label_set_text_fmt(status_labels[step], "%s: FAIL", tests[step]);
        lv_obj_set_style_text_color(status_labels[step], lv_color_hex(0xFF0000), 0);
      }
      lvgl_port_unlock();
    }
    Serial.println("Self-check test completed.");

    // short pause so user can read results
    delay(1000);
}


void writeRegister(uint8_t reg, uint16_t value)
{
    Wire1.beginTransmission(inaAddr);
    Wire1.write(reg);
    Wire1.write(value >> 8);
    Wire1.write(value & 0xFF);
    Wire1.endTransmission();
}
// read a 16-bit register
uint16_t readRegister(uint8_t reg)
{
    Wire1.beginTransmission(inaAddr);
    Wire1.write(reg);
    Wire1.endTransmission();
    Wire1.requestFrom(inaAddr, (uint8_t)2);
    uint16_t hi = Wire1.read();
    uint16_t lo = Wire1.read();
    return (hi << 8) | lo;
}


void ConfigurationINA22A(uint8_t address) {
    inaAddr = address;
    // — reset + 128× avg + 1.1 ms conv + continuous —
    uint16_t config = (1 << 15)
                    | (0x07 << 9)
                    | (0x04 << 6)
                    | (0x04 << 3)
                    | 0x00;
    writeRegister(CONFIGURATION, config);
  
    // — calibration for Rshunt = 0.03 Ω, Imax = 2 A —
    const float rShunt     = 0.03f;          // Ω (measure & adjust!)
    const float maxCurrent = 2.0f;           // A
    currentLSB = maxCurrent / 32768.0f;      // ≈6.1035e−5 A/bit
  
    // INA226-specific constant
    const float calConstant = 0.00512f;
    uint16_t calValue = uint16_t(calConstant / (currentLSB * rShunt) + 0.5f);
    writeRegister(CALIBRATION_REG, calValue);
  
    // INA226 power LSB
    powerLSB = currentLSB * 25.0f;           // ≈1.5259e−3 W/bit
  }
  
// read shunt voltage in volts
float shuntVoltage()
{
  int16_t raw = int16_t(readRegister(SHUNT_VOLTAGE));
  // for INA219: LSB = 10 µV → 10e-6 V
  return raw * 10e-6f;
}
// read bus voltage in volts
float busVoltage() {
    uint16_t raw = readRegister(BUS_VOLTAGE) >> 3;  // top 13 bits
    return raw * 1.8e-3f;                          // 1.25 mV per bit
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

#define LEDC_TIMER_BIT  LEDC_TIMER_8_BIT   // 8-bit resolution ⇒ duty ∈ [0..255]        // 5 kHz
// Instead of “LEDC_SPEED_MODE_MAX”, pick a real mode:

#if defined(LEDC_HIGH_SPEED_MODE)  // (or: #if SOC_LEDC_SUPPORT_HS_MODE)
  #define LEDC_MODE   LEDC_HIGH_SPEED_MODE
#else
  #define LEDC_MODE   LEDC_LOW_SPEED_MODE
#endif

#define LEDC_TIMER     LEDC_TIMER_0
#define LEDC_CHANNEL   LEDC_CHANNEL_0
#define LEDC_FREQ_HZ   44000
#define LEDC_TIMER_BIT LEDC_TIMER_8_BIT


void setup()
{
    Serial.begin(115200);
    Serial.println("Initializing board");
    Board *board = new Board();
    board->init();
    assert(board->begin());
    Serial.println("Initializing LVGL");
    lvgl_port_init(board->getLCD(), board->getTouch());
    lv_indev_enable(NULL, false);
    Serial.println("Creating UI");
    SelfCheckTest();
    create_temp_control_ui();
    spiThermo.begin(SCK, MISO, MOSI, SS1);
    spiThermo.setFrequency(40000000); // 10MHz is safe for MAX31865
    
    thermo_0.begin(MAX31865_2WIRE);
    thermo_1.begin(MAX31865_2WIRE);
    thermo_2.begin(MAX31865_2WIRE);
    thermo_3.begin(MAX31865_2WIRE);
    thermo_0.autoConvert(true);
    initHX71708();
    lv_indev_enable(NULL, false);
    pinMode(36, INPUT);
    attachInterrupt(digitalPinToInterrupt(36), interruptHandler, CHANGE);
    // Set up second i2c bus for INA226
    Wire1.begin(I2C_SDA_PIN, I2C_SCL_PIN);
    Wire1.setClock(400000); // Set I2C clock speed to 400kHz
    // Initialize INA226 for heater 1 for now
    inaAddr = 0x40; // I2C address for INA226
    ConfigurationINA22A(inaAddr);
        ledc_timer_config_t timer_cfg = {
        .speed_mode       = LEDC_MODE,
        .duty_resolution  = LEDC_TIMER_8_BIT,
        .timer_num        = LEDC_TIMER,
        .freq_hz          = LEDC_FREQ_HZ,
        .clk_cfg          = LEDC_AUTO_CLK
    };
    ESP_ERROR_CHECK( ledc_timer_config(&timer_cfg) );

    // 2. Configure the LEDC channel (bind GPIO 4 to channel 0)
    ledc_channel_config_t channel_cfg = {
        .gpio_num       = HEATER_PWM_1,
        .speed_mode     = LEDC_MODE,
        .channel        = LEDC_CHANNEL,
        .intr_type      = LEDC_INTR_DISABLE,
        .timer_sel      = LEDC_TIMER,
        .duty           = 0,     // start “off”
        .hpoint         = 0
    };
    ESP_ERROR_CHECK( ledc_channel_config(&channel_cfg) );

}
bool heaterOn = false;

static float p = 100.0; 
static float i = 0.0; 
static float d = 0.0;
static float integral = 0.0; // integral term
static float lastError = 0.0; // previous error
static unsigned long lastTime = 0; // last time PID was computed


void control(){
  unsigned long now = millis();
  float dt = (now - lastTime) / 1000.0;  
  if (dt <= 0.0) {
    dt = 0.001; // avoid division by zero
  }

  // 2) Calculate current error = (setpoint – measured):
  float error = set_temp_values[0] - temp_sensor_values[0];

  // 3) Integrate error over time:
  integral += error * dt;
  // Limit integral to prevent windup
  integral = constrain(integral, -1000.0, 1000.0); // adjust limits as needed

  // 4) Compute rate of change (derivative):
  float derivative = (error - lastError) / dt;

  // 5) Compute raw PID output:
  float rawOutput = (p * error) + (i * integral) + (d * derivative);

  // 6) Constrain to 0..255 (8-bit PWM duty cycle):
  int outputDuty = constrain((int)rawOutput, 0, 255);
  lastError = error;
  lastTime  = now;
  ledc_set_duty(LEDC_MODE, LEDC_CHANNEL,outputDuty); // turn on heater
  ledc_update_duty(LEDC_MODE, LEDC_CHANNEL);
}


float forcereading = 0.0;

void report(){
  JsonDocument doc;
  JsonArray sensors = doc["sensors"].to<JsonArray>();
  sensors.add(temp_sensor_values[0]);
  sensors.add(temp_sensor_values[1]);
  sensors.add(temp_sensor_values[2]);
  sensors.add(temp_sensor_values[3]);
  JsonArray heaters = doc["heaters"].to<JsonArray>();
  heaters.add(set_temp_values[0]);
  heaters.add(set_temp_values[1]);
  heaters.add(set_temp_values[2]);
  heaters.add(set_temp_values[3]);
  JsonArray enable = doc["enable"].to<JsonArray>();
  enable.add(enable_heater[0]);
  enable.add(enable_heater[1]);
  enable.add(enable_heater[2]);
  enable.add(enable_heater[3]);
  doc["force"] = forcereading;
  serializeJson(doc, Serial);
  Serial.println();
}

void proccessJson(const char* json) {
    StaticJsonDocument<256> doc;
    DeserializationError error = deserializeJson(doc, json);
    if (error) {
        Serial.print(F("deserializeJson() failed: "));
        Serial.println(error.f_str());
        return;
    }
    // Process the JSON data
    // format 
    // {"heater": 0, "set_temp": 200.0}
    if (doc["heater"].is<int>()) {
        int heaterIndex = doc["heater"];
        if (heaterIndex >= 0 && heaterIndex < 4) {
            float setTemp = doc["set_temp"];
            set_temp_values[heaterIndex] = setTemp;
            char value_text[16];
            sprintf(value_text, "%.1f °C", setTemp);
            lvgl_port_lock(-1);
            lv_label_set_text(set_temp_labels[heaterIndex], value_text);
            lvgl_port_unlock();
        } else {
            Serial.println("Invalid heater index in JSON");
        }
    } else {
        Serial.println("No heater key in JSON");
    }
    // Process enable/disable specific heaters by index
    // {"heater": 0, "enable": true}
    if (doc["heater"].is<int>() && doc["enable"].is<bool>()) {
        int heaterIndex = doc["heater"];
        bool enable = doc["enable"];
        if (heaterIndex >= 0 && heaterIndex < 4) {
            enable_heater[heaterIndex] = enable;
        } else {
            Serial.println("Invalid heater index in JSON");
        }
    } else {
        Serial.println("No heater or enable key in JSON");
    }
}

void loop()
{
    if (touchAlert)
    {
        lvgl_port_lock(-1);
        lv_indev_enable(NULL, true);
        touchAlert = false;
        lvgl_port_unlock();
    }
    else
    {
        lvgl_port_lock(-1);
        lv_indev_enable(NULL, false);
        lvgl_port_unlock();
    }
    control();
    report();
    //check for incoming JSON data
    if (Serial.available() > 0) {
        String json = Serial.readStringUntil('\n');
        proccessJson(json.c_str());
    }


    lv_timer_handler();
    delay(10);
    for (int i = 0; i < 4; i++) {
        Adafruit_MAX31865& th = (i==0? thermo_0 : i==1? thermo_1 : i==2? thermo_2 : thermo_3);
        if (th.readRTDAsync(rtd[i])) {
            temp_sensor_values[i] = th.temperatureAsync(rtd[i], RNOMINAL, RREF);

        }
        char value_text[16];
        sprintf(value_text, "%.1f °C", temp_sensor_values[i]);
        lvgl_port_lock(-1);
        lv_label_set_text(sensor_values[i], value_text);

        sprintf(value_text, "%.1f °C", set_temp_values[i]);
        lv_label_set_text(set_temp_labels[i], value_text);
        lvgl_port_unlock();

    }
    long raw = readRaw();
    
    if (raw != 0) {
      forcereading = raw / 10000.0f;
      char buf[16];
      sprintf(buf, "%.1f N", forcereading);

      lvgl_port_lock(-1);
      lv_label_set_text(force_value, buf);
      lv_chart_set_next_value(force_chart, force_series, forcereading);
      lvgl_port_unlock();
    }

    
}