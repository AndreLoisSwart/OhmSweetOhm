# Ohm Sweet Ohm

A personal electronics workbench, packaged as a Home Assistant add-on.

- **Part library:** the modules you use (ESP32, Arduino, sensor breakouts, displays), with their pins, voltages and quirks.
- **Designs:** drag parts onto a canvas and wire them pin to pin. Server-side checks catch mistakes such as 5 V into a 3.3 V pin or I2C address clashes.
- **Claude over MCP:** Claude can review designs, build them, and add parts to the library.

It is a sibling of [Shelf-help](https://github.com/AndreLoisSwart/ShelfHelp), which tracks stock and projects.

Status: design docs only. See `docs/mvp.md` for the plan.
