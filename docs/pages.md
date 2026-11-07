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
| `/parts` | Parts | The library: search, filter by kind and tag, an "Unverified" filter. Rows show name, kind, logic voltage, pin count and the unverified badge |
| `/parts/:id` | Part | Fields (kind, voltages, I2C addresses, datasheet, Shelf-help item id, Wokwi type), the pin editor, notes (markdown), attachments (datasheets, pinout images), "Used in" designs, and "Mark verified" |
| `/parts/new` | New part | The same form, empty. Can start as a copy of an existing part |
| `/settings` | Settings | Claude (MCP): token and setup, same as Shelf-help. Tag management |

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

## Components

| Component | Used for |
|---|---|
| `PartNode` | A placed part on the canvas, with its pin handles |
| `PinHandle` | One pin: colour by kind, name, flag marks, net highlight |
| `WireEdge` | A wire, coloured, with an optional label |
| `PinEditor` | Table of pins on the part page: name, kind, functions, voltage, flags, side and position, with drag to reorder |
| `PartPreview` | The card as it will look on the canvas, live while editing pins |
| `ChecksPanel` | Check results, used on the design page and the design list summary |
| `UnverifiedBadge` | Parts that need checking |
| `KindBadge` | Part kinds and pin kinds |

Shared components (PageHeader, EmptyState, ConfirmDialog, EditableText, MarkdownEditor, TagEditor, AttachmentList, LoadError, loading placeholders) are copied from Shelf-help and adapted.

## Visual style

- **Theme:** same as Shelf-help: shadcn neutral theme, Geist font, lucide icons, one accent colour, and light and dark modes following the device.
  - **Accent:** a different hue from Shelf-help's muted blue (e.g. copper/amber), so the two panels are easy to tell apart.
  - **Icon:** a circuit-board or house-with-a-plug mark; `mdi:home-lightning-bolt` in the HA sidebar.
- **Pin kinds** have fixed colours: power red, ground black or gray, I2C blue, SPI purple, UART green, analog orange, GPIO neutral.
  - These, the wire colours and the check severities are the only other colours.
  - Wire colours are drawn as real wire colours. They stay readable in dark mode because of an outline.
