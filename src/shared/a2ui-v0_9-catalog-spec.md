# **A2UI Basic Catalog v0.9 — Complete and Polished Specification**

**Schema:** [https://a2ui.org/specification/v0_9/basic_catalog.json](https://a2ui.org/specification/v0_9/basic_catalog.json)
**Purpose:** Declarative UI specification for rendering structured interfaces using predefined components, functions, and themes.

---

## 1. Core Principles

* **Declarative UI:** Interfaces are defined using structured JSON components.
* **Discriminator:** `"component"` uniquely identifies each component type.
* **Strict Referencing:** Components must reference children by ID; inline definitions are not allowed.
* **Dynamic Bindings:** Supported via `common_types.json`.
* **Strict Validation:** Additional or undefined properties are prohibited (`unevaluatedProperties: false`).
* **Standards Compliance:**

  * **ISO 8601** for date and time values.
  * **Unicode TR35** for date formatting.
* **Layout Model:** Inspired by CSS Flexbox.
* **Structured Rendering:** Dedicated UI components are preferred over Markdown.
* **Deterministic Behavior:** Enumerations and defaults are strictly enforced.

---

## 2. External Dependencies (`common_types.json`)

### 2.1 Dynamic Types

* `DynamicString`
* `DynamicNumber`
* `DynamicBoolean`
* `DynamicValue`
* `DynamicStringList`

### 2.2 Structural Types

* `ComponentCommon`
* `ComponentId`
* `ChildList`
* `Checkable`
* `Action`

---

## 3. Components

All components inherit from:

* **ComponentCommon**
* **CatalogComponentCommon** (`weight` property)

### 3.1 Common Property

| Property | Type   | Description                                  |
| -------- | ------ | -------------------------------------------- |
| `weight` | number | Flex-grow behavior within `Row` or `Column`. |

---

## 3.2 Content Components

### Text

| Property  | Type              | Required | Description          |
| --------- | ----------------- | -------- | -------------------- |
| component | string (`"Text"`) | ✓        | Component identifier |
| text      | DynamicString     | ✓        | Text content         |
| variant   | string            | ✗        | Text style           |

**Variants:** `h1, h2, h3, h4, h5, caption, body`
**Default:** `body`

---

### Image

| Property    | Type               | Required | Description          |
| ----------- | ------------------ | -------- | -------------------- |
| component   | string (`"Image"`) | ✓        | Component identifier |
| url         | DynamicString      | ✓        | Image URL            |
| description | DynamicString      | ✗        | Accessibility text   |
| fit         | string             | ✗        | Resize behavior      |
| variant     | string             | ✗        | Image style          |

**Fit:** `contain, cover, fill, none, scaleDown`
**Default:** `fill`

**Variants:**
`icon, avatar, smallFeature, mediumFeature, largeFeature, header`
**Default:** `mediumFeature`

---

### Icon

| Property  | Type              | Required | Description           |
| --------- | ----------------- | -------- | --------------------- |
| component | string (`"Icon"`) | ✓        | Component identifier  |
| name      | string or object  | ✓        | Icon name or SVG path |

#### Predefined Icons

```
accountCircle, add, arrowBack, arrowForward, attachFile,
calendarToday, call, camera, check, close, delete, download,
edit, event, error, fastForward, favorite, favoriteOff, folder,
help, home, info, locationOn, lock, lockOpen, mail, menu,
moreVert, moreHoriz, notificationsOff, notifications, pause,
payment, person, phone, photo, play, print, refresh, rewind,
search, send, settings, share, shoppingCart, skipNext,
skipPrevious, star, starHalf, starOff, stop, upload, visibility,
visibilityOff, volumeDown, volumeMute, volumeOff, volumeUp,
warning
```

#### Custom Icon

```json
{
  "path": "SVG_PATH_DATA"
}
```

---

### Video

| Property  | Type               | Required |
| --------- | ------------------ | -------- |
| component | string (`"Video"`) | ✓        |
| url       | DynamicString      | ✓        |

---

### AudioPlayer

| Property    | Type                     | Required |
| ----------- | ------------------------ | -------- |
| component   | string (`"AudioPlayer"`) | ✓        |
| url         | DynamicString            | ✓        |
| description | DynamicString            | ✗        |

---

## 3.3 Layout Components

### Row

| Property  | Type      | Required |
| --------- | --------- | -------- |
| component | `"Row"`   | ✓        |
| children  | ChildList | ✓        |
| justify   | string    | ✗        |
| align     | string    | ✗        |

**Justify:**
`center, end, spaceAround, spaceBetween, spaceEvenly, start, stretch`
**Default:** `start`

**Align:**
`start, center, end, stretch`
**Default:** `stretch`

---

### Column

| Property  | Type       | Required |
| --------- | ---------- | -------- |
| component | `"Column"` | ✓        |
| children  | ChildList  | ✓        |
| justify   | string     | ✗        |
| align     | string     | ✗        |

**Justify:**
`start, center, end, spaceBetween, spaceAround, spaceEvenly, stretch`
**Default:** `start`

**Align:**
`center, end, start, stretch`
**Default:** `stretch`

---

### List

| Property  | Type      | Required |
| --------- | --------- | -------- |
| component | `"List"`  | ✓        |
| children  | ChildList | ✓        |
| direction | string    | ✗        |
| align     | string    | ✗        |

**Direction:** `vertical, horizontal`
**Default:** `vertical`

**Align:** `start, center, end, stretch`
**Default:** `stretch`

---

### Card

| Property  | Type        | Required |
| --------- | ----------- | -------- |
| component | `"Card"`    | ✓        |
| child     | ComponentId | ✓        |

---

### Tabs

| Property  | Type     | Required |
| --------- | -------- | -------- |
| component | `"Tabs"` | ✓        |
| tabs      | array    | ✓        |

Each tab contains:

* `title: DynamicString`
* `child: ComponentId`

---

### Modal

| Property  | Type        | Required |
| --------- | ----------- | -------- |
| component | `"Modal"`   | ✓        |
| trigger   | ComponentId | ✓        |
| content   | ComponentId | ✓        |

---

### Divider

| Property  | Type        | Required |
| --------- | ----------- | -------- |
| component | `"Divider"` | ✓        |
| axis      | string      | ✗        |

**Axis:** `horizontal, vertical`
**Default:** `horizontal`

---

## 3.4 Input and Interactive Components

### Button

| Property  | Type        | Required |
| --------- | ----------- | -------- |
| component | `"Button"`  | ✓        |
| child     | ComponentId | ✓        |
| variant   | string      | ✗        |
| action    | Action      | ✓        |

**Variants:** `default, primary, borderless`
**Default:** `default`

---

### TextField

| Property         | Type          | Required |
| ---------------- | ------------- | -------- |
| component        | `"TextField"` | ✓        |
| label            | DynamicString | ✓        |
| value            | DynamicString | ✗        |
| variant          | string        | ✗        |
| validationRegexp | string        | ✗        |

**Variants:** `longText, number, shortText, obscured`
**Default:** `shortText`

---

### CheckBox

| Property  | Type           | Required |
| --------- | -------------- | -------- |
| component | `"CheckBox"`   | ✓        |
| label     | DynamicString  | ✓        |
| value     | DynamicBoolean | ✓        |

---

### ChoicePicker

| Property     | Type              | Required |
| ------------ | ----------------- | -------- |
| component    | `"ChoicePicker"`  | ✓        |
| label        | DynamicString     | ✗        |
| variant      | string            | ✗        |
| options      | array             | ✓        |
| value        | DynamicStringList | ✓        |
| displayStyle | string            | ✗        |
| filterable   | boolean           | ✗        |

Each option contains:

* `label: DynamicString`
* `value: string`

**Variant:** `multipleSelection, mutuallyExclusive`
**Default:** `mutuallyExclusive`

**Display Style:** `checkbox, chips`
**Default:** `checkbox`

**Filterable Default:** `false`

---

### Slider

| Property  | Type          | Required |
| --------- | ------------- | -------- |
| component | `"Slider"`    | ✓        |
| label     | DynamicString | ✗        |
| min       | number        | ✗        |
| max       | number        | ✓        |
| value     | DynamicNumber | ✓        |

**Default Minimum:** `0`

---

### DateTimeInput

| Property   | Type              | Required |
| ---------- | ----------------- | -------- |
| component  | `"DateTimeInput"` | ✓        |
| value      | DynamicString     | ✓        |
| enableDate | boolean           | ✗        |
| enableTime | boolean           | ✗        |
| min        | DynamicString     | ✗        |
| max        | DynamicString     | ✗        |
| label      | DynamicString     | ✗        |

**Defaults:**

* `enableDate: false`
* `enableTime: false`

Accepted ISO formats:

* `date`
* `time`
* `date-time`

---

## 4. Functions

### 4.1 Validation Functions

| Function                     | Description                |
| ---------------------------- | -------------------------- |
| `required(value)`            | Ensures value is not empty |
| `regex(value, pattern)`      | Matches a regex pattern    |
| `length(value, min?, max?)`  | Checks string length       |
| `numeric(value, min?, max?)` | Checks numeric range       |
| `email(value)`               | Validates email format     |

---

### 4.2 Formatting Functions

| Function                                                  | Description                        |
| --------------------------------------------------------- | ---------------------------------- |
| `formatString(value)`                                     | String interpolation               |
| `formatNumber(value, decimals?, grouping?)`               | Number formatting                  |
| `formatCurrency(value, currency, decimals?, grouping?)`   | Currency formatting                |
| `formatDate(value, format)`                               | Date formatting using Unicode TR35 |
| `pluralize(value, zero?, one?, two?, few?, many?, other)` | CLDR pluralization                 |

---

### 4.3 Logical Functions

| Function        | Description |
| --------------- | ----------- |
| `and(values[])` | Logical AND |
| `or(values[])`  | Logical OR  |
| `not(value)`    | Logical NOT |

---

### 4.4 Action Functions

| Function       | Description |
| -------------- | ----------- |
| `openUrl(url)` | Opens a URL |

---

## 5. Theme Definition

```json
{
  "primaryColor": "#RRGGBB",
  "iconUrl": "https://example.com/icon.png",
  "agentDisplayName": "Agent Name"
}
```

| Property           | Description               |
| ------------------ | ------------------------- |
| `primaryColor`     | Hexadecimal brand color   |
| `iconUrl`          | Agent or tool icon URL    |
| `agentDisplayName` | Display name of the agent |

---

## 6. Global Rules and Constraints

1. `"component"` acts as the schema discriminator.
2. Components must be referenced by ID—no inline definitions.
3. Children use `ComponentId` or `ChildList` (supports templating).
4. Layouts use `Row` and `Column` with Flexbox-like behavior.
5. `weight` acts like CSS `flex-grow` and is valid only within `Row` or `Column`.
6. Multiple elements must be wrapped in layout containers for `Card`, `Tabs`, or `Modal`.
7. Buttons should use a `Text` child unless icon-only is required.
8. ChoicePicker values bind to string arrays.
9. Dedicated UI components are preferred over Markdown.
10. Text supports limited Markdown without HTML, images, or links.
11. Dates must follow ISO 8601 standards.
12. Date formatting follows Unicode TR35.
13. Formatting and pluralization are locale-aware.
14. Slider requires `max`; `min` defaults to `0`.
15. DateTimeInput supports date, time, or both.
16. Dynamic bindings are resolved via `common_types.json`.
17. Additional or undefined properties are not permitted.
18. Custom icons are supported via SVG path data.
19. Renderers may derive styles from the primary theme color.
20. All enumerations are strictly enforced.

---

## 7. Supported Discriminators

### Components

```
Text, Image, Icon, Video, AudioPlayer,
Row, Column, List, Card, Tabs, Modal, Divider,
Button, TextField, CheckBox, ChoicePicker,
Slider, DateTimeInput
```

### Functions

```
required, regex, length, numeric, email,
formatString, formatNumber, formatCurrency, formatDate,
pluralize, openUrl, and, or, not
```
