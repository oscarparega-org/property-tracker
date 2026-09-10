# House Tracker design system

House Tracker uses a **CDMX property dossier** visual language: calm architectural surfaces, blueprint navigation, and jacaranda accents. Property information stays visually dominant; decoration never competes with prices, location, or decision state.

## Foundations

| Token     | Value     | Use                               |
| --------- | --------- | --------------------------------- |
| Ink       | `#182033` | Primary text                      |
| Muted     | `#68748a` | Supporting text                   |
| Paper     | `#f4f6fa` | Application canvas                |
| Panel     | `#ffffff` | Interactive surfaces              |
| Blueprint | `#3348a5` | Primary actions and navigation    |
| Jacaranda | `#78529b` | Categories and secondary emphasis |
| Coral     | `#d45d50` | Time-sensitive or source emphasis |
| Danger    | `#b13d4d` | Destructive actions and errors    |

The interface uses Geist Sans for every role. Headings rely on weight, size, and tighter spacing—not a second decorative family. Body copy should stay below 80 characters per line.

Spacing follows a 4/8 px rhythm: `4, 8, 12, 16, 24, 32, 48, 64`. Controls are 44 px tall. Radii are 10 px for controls, 16 px for cards, and 24 px for large dialogs or feature surfaces.

## Layout and hierarchy

```text
┌──────────────── global navigation ────────────────┐
│ Page purpose                                      │
│ Supporting sentence                              │
├──────────── location or search context ──────────┤
│ Search                         Filters   Sort     │
│ [advanced controls appear only when requested]   │
├──────────────────────────────────────────────────┤
│ Result context                                   │
│ Property cards / workflow / form                 │
└──────────────────────────────────────────────────┘
```

- Content aligns left within a shared 1180 px maximum width.
- Search and location context precede results; destination actions never sit inside geographic controls.
- Advanced filters remain collapsed until requested.
- White panels communicate interaction. The cool paper canvas provides grouping without extra borders.
- Primary buttons are blueprint blue. Use one primary action per local decision area.

## Content and interaction

- Use sentence case and concrete verbs: “Agregar propiedad”, “Guardar cambios”, “Ver resultados”.
- Labels remain visible when meaning would otherwise be ambiguous.
- Empty and error states explain the next useful action.
- Keyboard focus uses a blueprint ring with a soft outer halo.
- Mobile controls keep a 44 px minimum target and filters move into a modal sheet.
- Motion is reserved for state changes and is disabled when reduced motion is requested.
