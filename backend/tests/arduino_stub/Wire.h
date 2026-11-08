#pragma once
#include <stdint.h>

class TwoWire {
 public:
  void begin() {}
  void begin(int, int) {}
  void beginTransmission(uint8_t) {}
  uint8_t endTransmission() { return 0; }
};
extern TwoWire Wire;
#if defined(ESP32)
extern TwoWire Wire1;
#endif
