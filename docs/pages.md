# Pages and components

## Navigation

- **Desktop:** a sidebar with Designs, Parts and Settings. A button beside the name collapses it to its icons (the app's mark and each item's, named in a tooltip) and back; remembered in the browser (2026-11-24).
- **Mobile:** a bottom bar with Designs, Parts and Settings.
- **Inside the HA app:** it runs as an Ingress panel, like Shelf-help, and must work inside the companion app's frame.

**Building is desktop- and tablet-first.** On a phone, designs open read-only: you can pan, zoom, tap a part or wire to see its details, and see check results. Wiring on a phone screen isn't worth the effort in phase 1.

## Pages

| Route | Page | Contents |
|---|---|---|
| `/` | Designs | List of designs, most recently changed first: name, part count, check summary (error/warning counts), Shelf-help project link marker. New design button. Filter by tag |
| `/designs/:id` | Design | The canvas (below), with the name editable in the header |
| `/designs/:id/layouts/:layoutId` | Board layout | The design's parts on a protoboard (step 16; see Layout page below) |
| `/designs/:id/layouts/:layoutId/print` | Build sheet | Two A4 pages to print (copper side, then component side), outside the app's frame (step 19; see Layout page below) |
| `/parts` | Parts | The library: search, filter by kind and tag, an "Unverified" filter. Rows show name, kind, logic voltage, pin count and the unverified badge. **New part** opens a dialog (name, kind, logic voltage) and goes to the new part's page, as Shelf-help's New item does. **Starter parts** lists the 21 starter modules, ticks the ones already in the library, and adds the rest (unverified), then shows the Unverified filter |
| `/parts/:id` | Part | Fields (kind, voltages, I2C addresses, datasheet, Shelf-help item id, Wokwi type; for boards also platform and PlatformIO board), libraries (under the description: each spec, for all boards or one platform, added and removed in place), the pin editor (each pin's roles, flags, tie, code name and Wokwi name behind its details button), the footprint editor (step 14: holes and outline in mm, Generate from sides, a preview on a 2.54 mm grid), notes (markdown), attachments (datasheets, pinout images), "Used in" designs, and "Mark verified" |
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
  - **Wiring:** drag from one pin to another to make a wire. It gets the default colour for its pin kinds, which you can change in the Inspector. A pin always starts a new wire, even one that already has wires.
  - **Moving a wire's end** (`canvas/grab.ts`): the stretch of a wire next to each pin (30 px, starting 8 px out so the pin stays free) is a grab zone. Hovering it lights it and shows a grab cursor; dragging it moves that end to the pin it's dropped on (within 16 px), keeping the wire's id, colour and label, as one undo step. Dropped on empty canvas, back on its own pin, on its other end's pin, or onto a pair already wired, it snaps back; Esc cancels. Pressing without dragging selects the wire, so a wire can be selected and deleted from next to its pin. Where wires share a pin they run together at first: each wire's zone starts where it leaves the others, so you pick a wire by its branch. If they only part more than 40 px out, the latest of them gets the zone by the pin and the others are grabbed at their other end. A zone never passes the wire's middle.
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
- **Closing the side panels** (2026-11-24): on a desktop, a button at the canvas's top left hides and shows the library, and one at its top right the Inspector; each sits at the panel's edge and moves with it, so the canvas can take the whole width. Drag the Inspector's left edge (or focus it and use the arrow keys) to make it 240–560 px wide. Both choices and the width are remembered in the browser, for every design.
- **Inspector:** on a desktop, a column on the right. Below desktop width it is a sheet over the bottom of the canvas that opens when a part or wire is selected or a pin is tapped (and from the ⓘ button for the design itself). A part shows its ref (editable), part, Rotate and Remove, a note and its pins with the net each is on. A wire shows its two ends, colour swatches, a label and Remove wire. Nothing selected: description, tags, Shelf-help project id, firmware repo (step 13: a path or URL, with a link for a URL), the nets, files and Delete design.
- **The app sidebar** is hidden on the design page below desktop width, to give the canvas the room; the header's back arrow goes to Designs.
- **Trace through** (toolbar toggle, remembered per browser): a highlighted net carries on through series parts (data-model.md) to the nets beyond, the whole chain (`canvas/trace.ts`). The net itself stays at full strength; the nets beyond get a fainter pin highlight and dashed wire halo, and each series part passed through a soft ring. The trace stops on reaching a supply or ground net (any ground, power out or power in pin), which only gets a "→ GND" tag on the series part's pin rather than lighting the whole rail, and at any part that isn't series. The Inspector lists the pinned net's path, one hop per line ("→ through r_top → esp.GPIO1 (…)"). Display only: nets and checks are unchanged.
- **Highlighting:** hovering a pin or wire highlights its net on the canvas; tapping a pin pins the highlight and shows the net in the Inspector. The Inspector shows only pinned nets, never hovered ones: content appearing on hover moved the Remove button out from under the pointer mid-click.
- **Editing keys:** Delete or Backspace removes the selection (through the server); R turns the selected parts a quarter turn about their centre.
- **Unverified parts** are drawn with a dashed edge.
- **Phone and tablet polish** (step 9): on a phone the design fits no smaller than 0.75×, so labels stay readable, and you pan to the rest. Below desktop width the details sheet and the checks list take turns at the bottom of the screen: opening the checks closes the sheet, and picking a result closes the list to show its pins highlighted (and the net in the sheet). On a desktop both stay open side by side.
- **Error messages** (step 9): validation errors name the field and say what's allowed in plain words ("Pin names can't have spaces or dots", "A ref starts with a letter…") instead of the API's patterns; the API's own rule messages pass through as they are.
- **Undo and redo** (step 6): Ctrl+Z, and Ctrl+Shift+Z or Ctrl+Y (Cmd on a Mac), or the arrows in the header, which tablets need. They cover changes to placements and wires while the page is open, up to 50 steps; moving, rotating or deleting a selection is one step. Each step records the design as it was and undo sends it back as a layout, so undo is as reliable as any other save. Name, description and tags aren't part of undo.
- **History** (step 6): in the header's ⋯ menu. Newest first, each with who (you or Claude), when, the summary of the change that followed, its part and wire counts, and Restore. Restoring closes the dialog; it can be undone with Ctrl+Z or from History.
- **Changes from elsewhere** (step 7): the design is refetched every 5 seconds while the page is visible (paused in the background). A version this page didn't save shows a notice, "Claude changed this design" when the newest revision is Claude's, else "changed elsewhere", with a link to History; the undo steps are dropped, since they were recorded against the old design.
- **Simulate in Wokwi** (2026-11-08): in the header's ⋯ menu, under PlatformIO project. `diagram.json` and `wokwi.toml` as tabs in the same dialog, with the parts left out (no Wokwi type) listed above the file. See future-enhancements.md, Simulation through Wokwi.
- **Suggest wiring** (2026-11-08): in a part's Inspector, when it has unwired pins and the design has a board. A dialog lists a wire for each pin it can place, with the reason and any warning (a 5 V signal into a 3.3 V pin), all ticked; pins it leaves alone are listed with why. Add N wires adds the ticked ones as one undo step. Rules in `backend/app/modules/designs/suggest.py`; see future-enhancements.md, Pin assignment helper.
- **PlatformIO project** (step 12): in the header's ⋯ menu, under Bring-up sketch. The design's `platformio.ini`, in the same dialog as the bring-up sketch.
- **Bring-up sketch** (step 11): in the header's ⋯ menu, under Pin map. `bringup.ino` and `pins.h` as two tabs, each with Copy and Download, and the same board picker.
- **Pin map** (step 10): in the header's ⋯ menu. The design's `pins.h` (Arduino) or `pins.py` (MicroPython), with a board picker when the design has more than one, Copy and Download. It's fetched fresh each time it opens. A design with no board, or MicroPython for a board with named pins (the Uno's `A0`), shows the reason instead.
- **Focus** (2026-11-08): select parts (click, Ctrl/Cmd-click or drag a box) and press **F** or the **Focus on …** pill at the top of the canvas. The focused parts and the wires between them stay as they are; parts wired to them, and those wires, are greyed; everything else fades right back (faded wires can't be clicked). While focusing, Ctrl/Cmd-click adds a part or takes it out. Esc, F again, the pill's Exit or a click on the empty canvas ends it. Nothing moves or re-routes, and it's a view only: nothing is saved. Logic in `canvas/focus.ts`.
- **Build order** (2026-11-16; rules in data-model.md): a part with a build step shows its number in a small chip in the card's corner, and the Inspector has a **Build step** field (blank: not ordered).
  - **Stepping:** the header's **Build order** button, or **B**, opens a bar at the top of the canvas: ⏮ *Step 3 · 2 of 5* ⏭ with the step's refs. ← and → (or the round skip buttons) move between steps. The label and refs have fixed widths, so the bar keeps its width and the skip buttons stay under the cursor from step to step (at either end they fade rather than vanish). The bar fits the canvas (a container query): on a narrow one the refs go first, then button labels, then the step label shortens to *Step 3*, and below about 380 px it wraps into two rows with the skip buttons on top; Esc, B or Exit closes it. The current step's parts and the wires they bring are drawn as they are; earlier steps are greyed. Later steps are **hidden**, and the wires are routed as if they weren't there, so a busy design stays readable; the bar's **Ghost later steps** switch fades them back in instead (remembered in this browser). Editing still works on what's shown. Opening it ends any focus, and F does nothing while it's open.
  - **Numbering:** the bar's **Number parts** shows every part and lets you click them in build order: each click starts the next step, Shift-click adds the part to the step just made. **Suggest** sets the suggested order, **Clear** takes every part out of the order, **Done** goes back to stepping. Each change is saved, and is one undo step.
  - With no part ordered yet, the bar says so and offers Number parts and Suggest.
  - Logic in `canvas/build-order.ts`; the state is `use-build-order.ts` and the bar `build-order-bar.tsx`.
- **Who supplies what:** a highlighted rail is described in the Inspector by its supply and loads ("3V3 (3.3 V) — Supplied by esp.3V3 · feeds bme.VIN, oled.VCC"; a rail with loads and no supply says so). In a part's pin list, power pins add "feeds …" or "from …".
- **Checks bar** (step 5): under the canvas, a line with the error, warning and note counts (or "No problems found"); it opens into the results, errors first. Selecting one highlights the pins it's about and the rest of their net, and shows the net in the Inspector. The designs list shows each design's counts.
- **Tried on a real tablet (2026-11-07):** placing parts, wiring, removing wires, pan and zoom all work.

**Wire routing** (`features/designs/canvas/routing.ts`)
- Each wire leaves its pin straight out for 20 px, then an A* search on the 10 px grid finds the cheapest square path to the other pin: a step costs 1, a turn 4, running on another wire's track 8 and on the track next to it 3, crossing one 1. Cards plus a 20 px margin are walls, and so is every other pin's stub end, so no wire seems to touch a pin it passes.
- Wires are routed from the saved positions on every change, smallest group first (see trees below). Two cards and four wires took about 4 ms in the browser. A card being dragged isn't saved yet, so its wires fall back to plain square paths until it's dropped.
- Routes aren't stored: they follow from positions, so adding a wire can re-route others. Bend points chosen by hand (Wokwi stores them) remain a phase 2 idea.
- Fit-to-view counts cards, not the wires looping round them, so it pads by 20%.
- **Wires on the same net share tracks** (2026-11-08): a step along a track the wire's own net already uses costs half a fresh one, and the net's own wires don't count as parallel, neighbouring or crossing traffic. So a rail's wires gather into one trunk instead of running side by side. Where three or more ways of one net meet, a **junction dot** is drawn in the net's colour (its first wire's), as on a schematic. Each wire is still its own record, selected, recoloured and removed on its own.
- **Wires that share pins are routed as a tree** (2026-11-12): the group's shortest wire first, pin to pin, then each further pin (nearest first) to the nearest point of what's drawn, so a branch meets the trunk in a T instead of running beside it to the far pin. Each wire is drawn as its path through the tree between its own two pins, so selecting one still shows its whole run. Groups are joined by wires, not by nets: pins joined only inside a part (a board's GND and GND2) are separate trees, which may still share tracks. On Desktop Pet V2 this took same-net wires running side by side from 170 px to none, at about the same total length.
- **Wire labels are placed together after routing** (2026-11-12, `canvas/labels.ts`): each on its own wire, at the middle of the stretch it doesn't share with other wires, slid along the wire to keep clear of other labels and cards, and at least 24 px from either pin. Wires with the fewest places to go are placed first. Sizes are estimated (10 px monospace: 6 px a character, plus 10 px; 17 px tall). On Desktop Pet V2 this took overlapping labels from 2 pairs to none, and labels on cards from 2 to none. While a card is dragged, its wires' labels fall back to the plain path's middle.
- **A wire is drawn exactly on its route,** pin centre to pin centre. React Flow's measured handle positions only tell whether the route is stale (a card mid-drag); joining the route to them drew slanted end stretches whenever a measurement came out a few pixels off (seen on a busy design after moving a card, 2026-11-08). Cards ask React Flow to re-measure their pins only when the pins' names, sides, order or the rotation change, not on every answer from the server.

## Layout page (step 16)

A board layout of a design, from the view switcher in the design header: `Schematic | Stripboard v1 ▾ | New layout…`.

**The view switcher:**
- Each layout shows its state ("2 to join · 1 error", "Matches the design", "Empty").
- On the schematic, an amber dot marks that some layout needs attention.
- New layout asks for the board (stripboard, breadboard pattern or perfboard), its size (strips × holes, blank for the usual 24 × 37, 14 × 62 or 24 × 30; a breadboard pattern always has 14 rows), the hole spacing of a stripboard or perfboard (2.54 mm standard, 2.0, 1.27, or another 1–10 mm, with a note that 2.54 mm modules won't fit a finer board), a name and, optionally, the Shelf-help item of the board it's built on, then opens it.

**The page uses the design page's shell:**
- left: the parts tray;
- centre: the board;
- right: the Inspector;
- bottom: the layout checks bar.

Below 1280 px wide (the board needs the room) the tray and Inspector become overlays, as on tablets. A phone gets a read-only view.

**The board** (`features/layouts/board/`) is drawn as SVG with its own pan and zoom, not React Flow, which is built for nodes and edges rather than a grid of holes:
- **Labels:** strips lettered down the side, holes numbered along the top.
- **Copper:** tinted by the net it carries (ground dark, supplies red, other nets from a palette). Copper that joins pins the design keeps apart, unwired pins included, is hatched red. On the component side the copper is faint; turned over (the button, or F) it's solid and mirrored left to right, with labels staying on their holes.
- **Cuts:** a ring at a hole, or a bar between holes.
- **Bottom links:** grey, or their colour if insulated.
- **Traces** (perfboard): wide copper bands from pad to pad, tinted by net like the pads and hatched red when they short; solid turned over, faint on the component side.
- **Parts:**
  - each pin a dot in its net's colour (a tooltip gives the pin, hole and net);
  - the outline dashed when socketed, solid when soldered;
  - the ref in the corner.
- **Connectors and top jumpers:** drawn over the parts. A connector shows its housing, with a thick line on the side it faces, and a screw terminal a dashed box for the room its wires need; one with a colour has its pins filled in it.
- **The ratsnest:** dashed lines in the net's colour, from the API's `links`.
- **Build order** (step 24): the header's **Build order** button, or **B**, opens a bar over the bottom of the board: ⏮ *Step 2 · 3 of 4* ⏭ with the step's refs, ← and → (or the skip buttons) to move, the **Ghost later steps** switch (shared with the schematic and remembered in this browser), and Exit (or Esc, or B). Stepping only: the order is numbered on the schematic, and with no order yet the bar links there.
  - **Prepare the board** comes first when there are cuts or a stripboard's bottom links, listing how many.
  - The current step's parts, jumpers, traces and connectors are drawn as they are; earlier steps are greyed; later ones are hidden, or ghosted with the switch. Cuts and copper are always drawn.
  - The copper's tints and shorts are worked out from what's on the board by that step (in the browser, from the same joins as path tracing), so a short shows from the step that makes it. The ratsnest shows only links between parts that are in.
  - Path tracing goes through what's shown: with later steps hidden, not through them.
- **Path tracing** (step 23): with Select, **Shift-click** (or Cmd/Ctrl-click) a pin or hole, then another; another Shift-click replaces the second end, Shift-clicking the first again, Esc, a click on the empty board or the grey around it, picking a check or another tool stops it. On a tablet, **Trace from here** beside a pin in the part's Inspector starts it (closing the Inspector below 1280 px), and the next tap picks the other end.
  - **Joined:** everything else dims; the path's copper (only the stretch between where it enters and leaves a run), traces, jumpers and pins keep their own colours over one amber halo, with a moving dashed line along it. A top jumper seen from the copper side is dashed. Pins joined inside a part (its two grounds) show as a dashed arc. Ends are ringed A and B.
  - **Joined across two design nets:** the same, with a red halo: where the short runs.
  - **Through series parts** (the toolbar's trace through toggle, shared with the schematic's): when copper alone doesn't join the ends, the route may cross series parts (a resistor, data-model.md), each crossing a fainter dashed arc between its legs with the part's ref. The chip adds "through r_top". Copper always comes first, so a real short still shows red; a stretch between crossings that joins two design nets is still a short; and two ends the design joins stay "Not connected yet", never bridged by a resistor.
  - **Not joined:** each end's copper is tinted (A blue, B green), with a dashed line between them when the design joins them.
  - A chip under the toolbar says what was found: "a.A (A2) → b.A (D2) · 2 strips, 1 jumper", "Short: SDA and GND meet through 1 strip, 1 trace", or "Not connected yet (net SDA)". Its × stops tracing.
  - The route is found in the browser (`board/path.ts`, fewest hops) from what the API says joins what: copper runs (`segments`), each jumper's and trace's `touches`, and `joins` (pins joined inside parts). The server stays the judge of connectivity.

The board stays fitted to its space until you pan (drag empty board) or zoom (wheel); the fit button fits it again.

**Placing and moving:**
- Drag a part from the tray onto the board, or press Place and click the hole for its first pin (the way to do it on touch). The pins show where it will land while pointing, and R turns it before it's put down.
- Drag a part on the board to move it by whole holes.
- R turns the selected part a quarter clockwise.
- Delete or Backspace sets it back to not placed.
- Esc clears the selection.
- Ctrl+Z and Ctrl+Shift+Z (or Ctrl+Y) undo and redo, as on the design page. Every change is saved straight away and undone through the layout snapshot (`PUT /layouts/{id}/snapshot`).

**Tools** (step 17), in a toolbar over the board:

| Tool | Key | What it does |
|---|---|---|
| Select | V | Click a part, jumper or connector to select it; drag parts and connectors to move them by whole holes. A selected jumper shows a handle on each end: drag one to move just that end; grabbing any jumper or trace close to an end does the same, selected or not. Drag a jumper by its middle to move the whole of it, and press R while dragging to turn it a quarter clockwise about the hole you grabbed. Each move is one undo step, refused like a new jumper (e.g. a top jumper's end on a pin) |
| Cut | C | Click a hole to cut the strip there, or near the gap between two holes to cut between them; click a cut to remove it. A dashed ring or bar shows where it would cut. Cutting a hole with a leg, connector pin or jumper end in it is refused, with the reason. Stripboard only |
| Jumper | J | Click one end, then the other; a line follows the pointer. It goes on the side you're looking at: component side for a top jumper, copper side (turned over) for a bottom link. A top jumper's end in a taken hole is refused. Esc drops the first end. New jumpers aren't selected, so on a tablet the Inspector doesn't cover the board between jumpers |
| Trace | T | Perfboard only. Click where it starts, then along the row or column: the run snaps to whichever the pointer is further along and is laid, and the next run starts from its end, so a bent path is click, click, click. Click the same spot again, or press Esc, to finish. Each run is one undo step. Select picks a trace; drag an end (it stays on the other end's row or column) or its middle, R turns it, Delete removes it |
| Connector | K | Pick the type (female or male header, JST-XH, 5.08 mm screw terminal; a type whose pins don't fit the board's hole spacing is marked and can't be put down) and pin count in the toolbar, then click where pin 1 goes; ghost pins show where it lands, pin 1 darker, inside its housing with the side it faces (and a screw terminal's room for wires), from `GET /api/connector-types`. R (or the toolbar's rotate button) turns it before it's put down. The new connector is selected, to assign its pins |

- **Keys:** R turns the selected part or connector, or the selected jumper a quarter clockwise about its middle hole (also **Rotate** in its Inspector, for tablets). Delete removes the selected jumper or connector, or unplaces a part. B opens or closes the build order, and ← → step through it. Esc steps back: it stops path tracing, closes the build order, drops a jumper's first end, then goes back to Select, then clears the selection. Each tool shows a one-line hint under the toolbar.
- **The middle button** pans with any tool; the left button pans the empty board with Select.

**The parts tray:**
- **Not placed yet:** each part has Place and Off board. A part without a footprint links to its part page instead, or can be kept off the board.
- **On the board:** each part with its first pin's hole.
- **Off the board:** each part with the pins that still need a connector, in the part's own pin order, and **Add a N-pin connector**. That opens the connector tool with those pins assigned in that order (a straight cable), ready to click where pin 1 goes.

**The Inspector:**
- **A selected part:** its first pin's hole and rotation, Rotate, Off board, Unplace, **Cut between rows** (stripboard), Socketed / Soldered, its pins (hole and net, with **Trace from here**), and Show in schematic.
- **A selected jumper:** its ends and length, component or copper side, insulated (bottom links), colour, and Remove.
- **A selected trace:** its ends, pads (a solder bridge or tinned wire), the nets it carries (or that it shorts), Rotate and Remove.
- **A selected connector:** its type, pin count and pin 1's hole; Rotate and Remove; a picker per pin for what it carries (the off-board parts' pins, or nothing); Add a pin and Remove the last pin; its colour (or none).
- **Nothing selected:** the layout's name (editable), board, its Shelf-help item id (editable, blank clears it), hole spacing (editable on a stripboard or perfboard; changing it re-reads every footprint, so parts may come off the grid), part counts, connections still to join, cuts, jumpers, traces (perfboard), area used, notes, **Trim dead copper** (stripboard) and Delete layout.

**The checks bar:**
- It shows the counts and "N to join", "Nothing on the board yet", or "The board matches the design".
- Picking a result lights up its holes and pins on the board.

**Print build sheet** (⋯ menu, step 19; split into two pages 2026-11-24) opens a sheet laid out for A4 (10 mm margins), printed from the browser's own dialog at "Actual size". Every drawing is at true size, in mm, with strip letters, hole numbers and a triangle at A1, and sits with its list beside it (below it when the board is too wide):
- **Page 1, copper side** (mirrored: turned over, left and right swap), with a 50 mm scale bar to check the print with a ruler, a warning box while the layout has errors or missing connections, and the order of work:
  1. **Cuts** (a perfboard's **traces**): solid strips, faint dashed part and connector outlines, bold cut marks with a white edge so a cut on a part's outline stands out from it, traces as grey bands tagged T1, T2…. The cut list (strip by strip, as seen from the copper side) or trace list is always there, saying "No cuts" when there are none. Cuts are numbered on the drawing when there are at most 24; beyond that the marks alone are clearer, and the list's positions find them.
  2. **Bottom links** (a perfboard's bottom jumpers), only when there are some: each in its colour (red on a supply rail, black on ground; bare wire dashed), numbered, with cuts faint and a ring at every joint to solder, and their list.
- **Page 2, component side:** part outlines (dashed when socketed), legs with pin 1 square, connectors with their housing, pin 1 filled and − on a ground pin, + on a supply pin, and top jumpers in their colour, numbered, with the top jumper list. Part and connector names sit beside their outline where they cover the least (other bodies, pins, jumpers, other names), with a white edge. Then the parts in the design's build order, each with its step (pin 1's hole, rotation, mount; unordered parts last, by ref); connectors and their cables (straight or crossed); and what to have ready (board, socket headers by size, connectors, wire). Every list has tick boxes.
- **Cuts SVG** (Traces SVG), **Bottom jumpers SVG** and **Component side SVG** download each drawing.

**History** (⋯ menu) lists the layout's revisions with Restore. Changes made elsewhere (Claude, another tab) show a "Claude changed this layout" notice with a link to History, and drop the undo steps, as on the design page.

**On the schematic:**
- A part that's on a layout gets a small board mark in its card's corner, with a tooltip naming the layout and hole.
- Its Inspector lists the layouts it's on, each with Show on board, which opens the layout with the part selected (`?select=`). Show in schematic does the reverse.

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
| `FootprintEditor` | The part page's footprint (step 14). "Generate from sides" takes the distance between the header rows and the pitch in mm (2.54 by default) and fills in every pin's hole, keeping an outline already entered. Each pin's x and y and the outline's x, y, w, h are edited as text in mm, as a working copy saved together. The preview shows the holes in their pin colours over a 2.54 mm grid lined up with the first pin, with the outline dashed. Holes off the grid are amber and listed, since such a part won't sit on a protoboard as it is. Half-entered holes, two pins in one hole and an outline without a size are marked and block saving |
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
