# Pages and components

## Navigation

- **Desktop:** a sidebar with Designs, Parts and Settings.
- **Mobile:** a bottom bar with Designs, Parts and Settings.
- **Inside the HA app:** it runs as an Ingress panel, like Shelf-help, and must work inside the companion app's frame.

**Building is desktop- and tablet-first.** On a phone, designs open read-only: you can pan, zoom, tap a part or wire to see its details, and see check results. Wiring on a phone screen isn't worth the effort in phase 1.

## Pages

| Route | Page | Contents |
|---|---|---|
| `/` | Designs | List of designs, most recently changed first: name, part count, check summary (error/warning counts), Shelf-help project link marker. New design button. Filter by tag |
| `/designs/:id` | Design | The canvas (below), with the name editable in the header |
| `/parts` | Parts | The library: search, filter by kind and tag, an "Unverified" filter. Rows show name, kind, logic voltage, pin count and the unverified badge. **New part** opens a dialog (name, kind, logic voltage) and goes to the new part's page, as Shelf-help's New item does. **Starter parts** lists the 21 starter modules, ticks the ones already in the library, and adds the rest (unverified), then shows the Unverified filter |
| `/parts/:id` | Part | Fields (kind, voltages, I2C addresses, datasheet, Shelf-help item id, Wokwi type), the pin editor (each pin's roles, flags, tie, code name and Wokwi name behind its details button), notes (markdown), attachments (datasheets, pinout images), "Used in" designs, and "Mark verified" |
| `/settings` | Settings | Claude (MCP): the token (hidden until shown; copy; make a new one), and the Claude Code command and Claude Desktop config for the add-on's host port 8097. Tag management |

## Design page

The design page has four areas around the canvas:

```
┌──────────┬──────────────────────────────┬────────────┐
│ Library  │                              │ Inspector  │
│ search   │          Canvas              │ (selected  │
│ ───────  │                              │  part/wire)│
│ ESP32 …  │  ┌─────┐       ┌──────┐      │            │
│ BME280   │  │ esp │───────│ bme  │      │            │
│ SSD1306  │  └─────┘       └──────┘      │            │
│ …        │                              │            │
├──────────┴──────────────────────────────┴────────────┤
│ Checks: 1 error, 2 warnings                     ▲     │
└───────────────────────────────────────────────────────┘
```

- **Library panel:** search the parts and drag one onto the canvas. It is placed with an automatic `ref` (`bme`, then `bme2`), which can be renamed.
- **Canvas** (React Flow):
  - **Parts:** each placed part is a card showing its `ref`, part name and pin headers on the sides given by the pin data, in header order. Pins are coloured by kind (power, ground, I2C, SPI…), labelled with their name, and show a small mark for flags (input-only, strapping, flash).
  - **Wiring:** drag from one pin to another to make a wire. It gets the default colour for its pin kinds, which you can change in the Inspector.
  - **Highlighting:** hovering a pin highlights its whole net. While dragging a wire, pins that would trigger an error check are dimmed.
  - **Editing:** select and press Delete to remove a part or wire. Undo/redo (Ctrl+Z / Ctrl+Shift+Z) covers the editing session.
  - **Moving around:** pan, zoom, snap to grid and fit to view. Parts can be rotated in 90° steps.
- **Inspector:**
  - **A selected part:** its ref (editable), the part name (opening the part), its note, its pins with the net each is on, and the Shelf-help item id if set.
  - **A selected wire:** its two ends, colour and label.
  - **Nothing selected:** the design's description and Shelf-help project id.
- **Checks bar:** collapsed to a summary line. When opened, it lists results; clicking one selects and highlights the pins and net involved. It reruns after every change.
- **History:** in the header's ⋯ menu. Revisions with author (you or Claude), time and summary, and Restore on each.
- **Changes from Claude while the page is open:** the page refetches the design every few seconds while visible and shows "Claude changed this design" with a link to History.

**As built in steps 4 to 7:**
- **Saving:** every change is sent straight away and the server answers with the whole design (placements, wires as `ref.PIN`, the parts used, computed nets); the canvas redraws from that answer. React Flow keeps only what is in flight: positions while dragging and the selection. A refused change shows a toast and the canvas stays as the server has it.
- **Library:** on a desktop, a column on the left; drag a part onto the canvas to place it where it's dropped. On a tablet, a **Parts** button opens it over the canvas, and **+** on a part adds it near the middle of the view, beside (not on top of) the parts already there.
- **Inspector:** on a desktop, a column on the right. Below desktop width it is a sheet over the bottom of the canvas that opens when a part or wire is selected or a pin is tapped (and from the ⓘ button for the design itself). A part shows its ref (editable), part, Rotate and Remove, a note and its pins with the net each is on. A wire shows its two ends, colour swatches, a label and Remove wire. Nothing selected: description, tags, Shelf-help project id, the nets, files and Delete design.
- **The app sidebar** is hidden on the design page below desktop width, to give the canvas the room; the header's back arrow goes to Designs.
- **Highlighting:** hovering a pin or wire highlights its net on the canvas; tapping a pin pins the highlight and shows the net in the Inspector. The Inspector shows only pinned nets, never hovered ones: content appearing on hover moved the Remove button out from under the pointer mid-click.
- **Editing keys:** Delete or Backspace removes the selection (through the server); R turns the selected parts a quarter turn about their centre.
- **Unverified parts** are drawn with a dashed edge.
- **Phone and tablet polish** (step 9): on a phone the design fits no smaller than 0.75×, so labels stay readable, and you pan to the rest. Below desktop width the details sheet and the checks list take turns at the bottom of the screen: opening the checks closes the sheet, and picking a result closes the list to show its pins highlighted (and the net in the sheet). On a desktop both stay open side by side.
- **Error messages** (step 9): validation errors name the field and say what's allowed in plain words ("Pin names can't have spaces or dots", "A ref starts with a letter…") instead of the API's patterns; the API's own rule messages pass through as they are.
- **Undo and redo** (step 6): Ctrl+Z, and Ctrl+Shift+Z or Ctrl+Y (Cmd on a Mac), or the arrows in the header, which tablets need. They cover changes to placements and wires while the page is open, up to 50 steps; moving, rotating or deleting a selection is one step. Each step records the design as it was and undo sends it back as a layout, so undo is as reliable as any other save. Name, description and tags aren't part of undo.
- **History** (step 6): in the header's ⋯ menu. Newest first, each with who (you or Claude), when, the summary of the change that followed, its part and wire counts, and Restore. Restoring closes the dialog; it can be undone with Ctrl+Z or from History.
- **Changes from elsewhere** (step 7): the design is refetched every 5 seconds while the page is visible (paused in the background). A version this page didn't save shows a notice, "Claude changed this design" when the newest revision is Claude's, else "changed elsewhere", with a link to History; the undo steps are dropped, since they were recorded against the old design.
- **Pin map** (step 10): in the header's ⋯ menu. The design's `pins.h` (Arduino) or `pins.py` (MicroPython), with a board picker when the design has more than one, Copy and Download. It's fetched fresh each time it opens. A design with no board, or MicroPython for a board with named pins (the Uno's `A0`), shows the reason instead.
- **Who supplies what:** a highlighted rail is described in the Inspector by its supply and loads ("3V3 (3.3 V) — Supplied by esp.3V3 · feeds bme.VIN, oled.VCC"; a rail with loads and no supply says so). In a part's pin list, power pins add "feeds …" or "from …".
- **Checks bar** (step 5): under the canvas, a line with the error, warning and note counts (or "No problems found"); it opens into the results, errors first. Selecting one highlights the pins it's about and the rest of their net, and shows the net in the Inspector. The designs list shows each design's counts.
- **Tried on a real tablet (2026-11-07):** placing parts, wiring, removing wires, pan and zoom all work.

**Wire routing** (`features/designs/canvas/routing.ts`)
- Each wire leaves its pin straight out for 20 px, then an A* search on the 10 px grid finds the cheapest square path to the other pin: a step costs 1, a turn 4, running on another wire's track 8 and on the track next to it 3, crossing one 1. Cards plus a 20 px margin are walls, and so is every other pin's stub end, so no wire seems to touch a pin it passes.
- Wires are routed shortest first, from the saved positions, on every change. Two cards and four wires took about 4 ms in the browser. A card being dragged isn't saved yet, so its wires fall back to plain square paths until it's dropped.
- Routes aren't stored: they follow from positions, so adding a wire can re-route others. Bend points chosen by hand (Wokwi stores them) remain a phase 2 idea.
- Fit-to-view counts cards, not the wires looping round them, so it pads by 20%.

## Canvas spike findings

Build step 2 (2026-11-07): a throwaway page at `/spike` (`frontend/src/features/spike/`, not in the nav, no backend) with `@xyflow/react` 12, a hard-coded ESP32 DevKit V1 (30 pins) and a BME280. It is removed when the real canvas lands in step 4; its pure logic (`layout.ts`: card layout, rotation, nets, wire colours) and its CSS tokens are meant to be lifted.

**Recommended approach**
- **Cards lay out from the pin data alone.** `layoutCard(part, rotation)` gives the card's size and each handle's position. Cards and handles are absolutely positioned in px, so nothing depends on the browser's text measurement and the server can compute the same layout (for Claude's automatic positions, phase 2 export). The stored `Part.width/height` is dropped as a result (see `data-model.md`).
- **Grid and pitch:** 10 px grid, 20 px pin pitch (two grid steps), 40 px header. Placements snap to the grid, and every handle and card edge lands on it at every rotation (tested), so straight wires between facing pins are truly straight.
- **Pin density:** 11 px monospace labels at 20 px pitch keep the 30-pin ESP32 readable at 1× (a 200 × 360 px card). Fit-to-view is capped at 1.25×. Marks only for input-only (I), strapping (S) and flash (F), as small amber letters after the name; kind, functions, voltage and all flags are in the pin's tooltip.
- **Handles:** one per pin, `type="source"` with `ConnectionMode.Loose`, since any pin can wire to any other. Handle id = pin (use the pin id in the real canvas, not the name, since pins can be renamed). Colour = pin kind group; a lit pin gets an accent ring.
- **Rotation is logical, not a CSS transform.** Rotating 90° clockwise moves each pin to the next side (left → top → right → bottom → left), reversing the order where the reading direction flips (left → top, right → bottom), and re-lays out the card with labels upright (vertical text on top and bottom sides). Rotation keeps the card's centre, snapped to the grid. After a rotation, `useUpdateNodeInternals(id)` must be called or wires keep pointing at the old handle positions. A CSS rotate of the card would turn the text and confuse React Flow's handle sides (the edge curve direction comes from the handle's `Position`). `Placement.rotation` stores degrees (0/90/180/270), like Wokwi's `rotate`.
- **Wires:** custom `WireEdge`: a 5 px outline path (`--wire-outline`: dark in light mode, light in dark mode) under the 3 px wire in its real colour, plus an accent halo when selected or in the highlighted net. Readable for black wires in dark mode and white in light mode. Square routing (`smoothstep`) reads most like a wiring diagram and is the default; curved and straight were tried. Square wires don't avoid cards, and parallel wires leaving neighbouring pins share a vertical run; fine for small designs. Wokwi stores per-wire waypoints; adding them later is a phase 2 idea, not needed now.
- **Net highlighting:** nets by union-find over the wires (`computeNets`), recomputed on every wire change. The highlighted net lives in a small external store, not React state; each card subscribes only to its own pins (`useSyncExternalStore` with a string snapshot) and each wire to one boolean, so a hover re-renders only what changes. Hover a pin or wire to highlight; click or tap a pin to pin the highlight (touch has no hover); click the pane to clear. Pin events are delegated, one listener per card.
- **Refused wires:** `isValidConnection` blocks a pin to itself and a duplicate pair in either direction, matching the data rules; the target pin shows a red ring while dragging.
- **Default wire colours** by pin kind work as specified (red for power, black for ground, else rotation).
- **Fit on load:** use `useNodesInitialized()` and call `fitView` once. The `fitView` prop fires before a card with 30 handles is measured and fits only the first card.
- **Theme:** React Flow's `colorMode="system"` plus its `--xy-*` variables mapped to our tokens; cards draw their own selected border (copper accent).

**Touch**
- **Tablet (editing):** pan with one finger on the empty canvas, pinch to zoom, drag a card to move it, and wire either by dragging from a pin or by tapping one pin then another (React Flow's `connectOnClick`). Tap-tap is the more reliable pattern on touch and is the one to teach. On a coarse pointer each handle gets a 20 px hit area (one pitch, so neighbours don't overlap) and `connectionRadius` is 14 px. Rotate and delete need buttons (the Inspector), since a tablet often has no keyboard.
- **Tried on a real tablet (2026-11-07), both orientations:** loading, dragging cards, wiring, tap to highlight a net, changing wire colour, rotation, fit, pan and pinch zoom all work and feel responsive. Three problems are listed under Open issues.
- **Phone (read-only):** `(max-width: 639px), (pointer: coarse) and (max-height: 480px)` selects read-only: no dragging, no wiring, no Delete key, and **`connectOnClick` off as well**, or a tap on a pin still starts a wire. Tapping a pin highlights its net and selects the card; the Inspector moves to the bottom and the legend is hidden. A fitted 30-pin board is about 0.6× on a 375 px screen, too small to read without pinching; the real view should fit to at least ~0.75× and let the user pan. (Done in step 9: phones fit no smaller than 0.75×.)
- **Tried on a real phone (2026-11-07):** opens read-only, tapping highlights nets and wires, and nothing can be changed.

**Tablet issues, resolved in step 4**
- **Wires ran through cards, and overlapping wires hid each other.** Wires are now routed (see Wire routing below): around cards, never through them, and on separate tracks where they run side by side.
- **A wire couldn't be removed on a tablet.** The wire Inspector has Remove wire. Dragging a wire's end to another pin (React Flow's reconnectable edges) isn't done; removing and redrawing covers it.

**Performance** (Chromium, desktop, dev build)
- Two parts: nothing measurable.
- 52 boards (1,534 handles, 154 wires): hovering a pin re-renders in about 1 ms; adding 10 boards at once costs about 400 ms of main-thread work (mount and handle measurement). Real designs are a handful of parts, so `onlyRenderVisibleElements` and similar aren't needed.
- Bundle: React Flow plus the spike is about 65 kB gzipped, in its own lazily loaded chunk. The design page should load lazily too, so the designs list doesn't pay for it.

**Pin data notes for step 3**
- Boards repeat silkscreen names (the DevKit has two GND pins), but pin names must be unique within a part. Number the repeats: `GND`, `GND2`.
- Name pins by the chip's GPIO (`GPIO21`), not the board's silkscreen (`D21`, `TX0`, `VP`); `wokwi_name` carries Wokwi's name for the export. The spike's ESP32 pin data (sides, order, kinds, functions and flags) can seed the starter part.
- The 30-pin DevKit doesn't break out the flash pins (GPIO6–11), so its card shows no F marks.

## Components

| Component | Used for |
|---|---|
| `PartNode` | A placed part on the canvas: a `PartCard` with React Flow handles as its pins |
| `PinHandle` | One pin: colour by kind, name, flag marks, net highlight |
| `WireEdge` | A wire, coloured, with an optional label, drawn along its route (Wire routing, above) |
| `PartCard` | The card itself (header, pins on their sides, flag marks), drawn from `layoutCard`. The canvas passes React Flow handles in through `renderPin`; elsewhere pins are plain dots |
| `PinEditor` | The part page's pins, one list per side in header order: name, kind, voltage, a popover for alternate roles, flags and the Wokwi name, side, and drag to reorder (a short hold on touch). Edited as a working copy and saved together, with Paste pin names for a whole header at once (kinds guessed from the names). Invalid or repeated names are marked and block saving |
| `PartPreview` | A `PartCard` of the working copy, live while editing pins, with a rotate button to check the turned card |
| `ChecksPanel` | Check results, used on the design page and the design list summary |
| `UnverifiedBadge` | Parts that need checking |
| `KindBadge` | Part kinds and pin kinds |

Shared components (PageHeader, EmptyState, ConfirmDialog, EditableText, MarkdownEditor, TagEditor, AttachmentList, LoadError, loading placeholders) are copied from Shelf-help and adapted.

## Visual style

- **Theme:** same as Shelf-help: shadcn neutral theme, Geist font, lucide icons, one accent colour, and light and dark modes following the device.
  - **Accent:** a different hue from Shelf-help's muted blue (e.g. copper/amber), so the two panels are easy to tell apart.
  - **Icon:** a circuit-board or house-with-a-plug mark; `mdi:home-lightning-bolt` in the HA sidebar.
- **Pin kinds** have fixed colours: power red, ground black or gray, I2C blue, SPI purple, UART green, analog orange, GPIO neutral.
  - Power pins also show their direction: a supply's output (`power_out`) is a filled red dot with a ring round it, a load's input (`power_in`) a hollow red ring. The same marks are used on the canvas, in the part preview, the pin editor and the Inspector.
  - These, the wire colours and the check severities are the only other colours.
  - Wire colours are drawn as real wire colours. They stay readable in dark mode because of an outline.
