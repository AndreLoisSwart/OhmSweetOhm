// Just enough of the Arduino API to syntax-check generated sketches (tests/test_bringup.py).
#pragma once
#include <stdint.h>

class __FlashStringHelper;
#define F(s) (reinterpret_cast<const __FlashStringHelper *>(s))

#define HIGH 1
#define LOW 0
#define INPUT 0
#define OUTPUT 1
#define INPUT_PULLUP 2
#define HEX 16
static const uint8_t A0 = 14, A1 = 15, A2 = 16, A3 = 17, A4 = 18, A5 = 19, A6 = 20, A7 = 21;

class SerialPort {
 public:
  void begin(unsigned long) {}
  explicit operator bool() const { return true; }
  void print(const __FlashStringHelper *) {}
  void print(int, int = 10) {}
  void println(const __FlashStringHelper *) {}
  void println(int, int = 10) {}
};
extern SerialPort Serial;

void pinMode(uint8_t, uint8_t);
void digitalWrite(uint8_t, uint8_t);
int digitalRead(uint8_t);
int analogRead(uint8_t);
void delay(unsigned long);
unsigned long millis();
