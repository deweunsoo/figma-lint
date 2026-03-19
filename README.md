# figma-lint

Figma variable binding validator. Checks that all visual properties in your Figma components are bound to variables — ensuring design system compliance.

Works with **any** design system, not tied to a specific token set.

## Rules

### `rules/bindings.js` — 16 checks

| # | Rule | Category | Description |
|---|------|----------|-------------|
| 1 | UNBOUND_FILL | Color | Fill color not bound to variable |
| 2 | UNBOUND_STROKE | Color | Stroke color not bound to variable |
| 3 | UNBOUND_TEXT_FILL | Color | Text color not bound to variable |
| 4 | LOW_CONTRAST | Color | Text-background contrast below 2.5:1 |
| 5 | UNBOUND_PADDING | Layout | Padding not bound to variable |
| 6 | UNBOUND_RADIUS | Layout | Border radius not bound to variable |
| 7 | UNBOUND_GAP | Layout | Item spacing not bound to variable |
| 8 | UNBOUND_STROKE_WEIGHT | Layout | Stroke weight not bound to variable |
| 9 | UNBOUND_FONT_SIZE | Typography | Font size not bound to variable |
| 10 | UNBOUND_FONT_WEIGHT | Typography | Font weight not bound to variable |
| 11 | UNBOUND_FONT_FAMILY | Typography | Font family not bound to variable |
| 12 | UNBOUND_LINE_HEIGHT | Typography | Line height not bound to variable |
| 13 | FRAME_NOT_INSTANCE | Structure | Frame should be a component instance |
| 14 | TEXT_STYLE_CONFLICT | Structure | Text style conflicts with variable bindings |
| 15 | REMOTE_HAS_LOCAL | Structure | Remote instance has a same-name local component set |
| 16 | VARIANT_STRUCTURE_MISMATCH | Structure | Variants in a ComponentSet have inconsistent child structures |

## Usage

### With Figma MCP (`figma_execute`)

Copy the contents of `rules/bindings.js` and paste into `figma_execute`.

The script automatically:
1. Finds the "Components" page
2. Collects all COMPONENT and COMPONENT_SET nodes
3. Validates each node against all 16 rules
4. Returns a summary with pass/fail status

### Output

```json
{
  "====": "✅ ALL PASSED",
  "totalComponents": 10,
  "totalIssues": 0
}
```

Or on failure:

```json
{
  "====": "❌ FAILED",
  "totalComponents": 10,
  "totalIssues": 3,
  "summary": { "Button": { "UNBOUND_FILL": 2 } },
  "issues": [...]
}
```

## License

MIT
