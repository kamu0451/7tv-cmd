// CSS string injected into the popup's shadow root (docs/SPEC.md section 7.3). ASCII only,
// no external fonts, no images, no @import.
//
// Every value is copied from the 7TV / Twitch tray reference; the source field is named next to it:
//   dom.json   = docs/recordings/ref-7tv-colon-dark/dom.json (popupWithFilter.*)
//   light.json = docs/recordings/ref-7tv-colon-light/dom.json
//   ref.md     = docs/reference-7tv-popup.md "Visual language"
//   SPEC 7.2   = docs/SPEC.md section 7.2 values (Twitch palette, recorded in docs/LEDGER.md)

/** Row height in px: dom.json popupWithFilter.rowHeight = 42. popup.ts uses it for geometry. */
export const ROW_HEIGHT = 42;

/** Gap between popup and editor in px: dom.json popupWithFilter.gapPx = 4. */
export const GAP_PX = 4;

/** Outer frame width in px (LEDGER P4-2): ref-7tv-colon-dark and -light frames/05-down.png show a 1 px frame at x=4 / y=170. */
export const BORDER_PX = 1;

export const POPUP_CSS = `
:host { all: initial; }
.tray {
  position: fixed;
  z-index: 10000; /* SPEC 7.2: host z-index 10000 (dom.json zIndex "1" is inside Twitch's own stacking context) */
  box-sizing: border-box;
  display: none;
  margin: 0;
  padding: 0 8px;     /* LEDGER P4-2: rows inset 8 px; ref 05-down.png frame x=4, selected bar x=13..1266, frame x=1275 */
  overflow-x: hidden; /* dom.json popupOuterHTMLHead: .scrollable-area overflow-x hidden */
  overflow-y: auto;   /* dom.json scroll.overflowY "auto" */
  border: 1px solid rgb(53, 53, 59); /* LEDGER P4-2: ref-7tv-colon-dark/frames/05-down.png frame pixels rgb(53,53,59) */
  border-radius: 6px; /* LEDGER P4-2: ref 05-down.png corner arc runs x=4..10 / y=170..176 in both themes */
  box-shadow: none;   /* dom.json boxShadow "none"; LEDGER P4-2 no shadow */
  font-family: Inter, "Noto Sans Arabic", Roobert, "Helvetica Neue", Helvetica, Arial, sans-serif; /* dom.json font.family */
  font-size: 14px;    /* dom.json font.size */
  font-weight: 400;   /* dom.json font.weight */
  line-height: 19.6px; /* dom.json font.lineHeight */
  background: rgb(24, 24, 27); /* dom.json colors.popupBackground (dark) */
  color: rgb(239, 239, 241);   /* dom.json colors.text (dark) */
  scrollbar-width: thin;
  overscroll-behavior: contain;
  -webkit-font-smoothing: antialiased;
}
.tray.open { display: block; }
.tray.light {
  border-color: rgb(226, 226, 230); /* LEDGER P4-2: ref-7tv-colon-light/frames/05-down.png frame pixels */
  background: rgb(255, 255, 255); /* light.json colors.popupBackground */
  color: rgb(14, 14, 16);         /* light.json colors.text */
}
.row {
  box-sizing: border-box;
  height: 42px;       /* dom.json rowHeight */
  padding: 3px 10px;  /* SPEC 7.2 padding 3px 10px */
  overflow: hidden;
  cursor: pointer;
  user-select: none;
  background: transparent; /* dom.json colors.rowBackground rgba(0,0,0,0) */
}
.row[aria-selected="true"] { background: rgb(53, 53, 59); } /* sampled from ref-7tv-colon-dark/frames/05-down.png at (700,279); ref.md estimate was rgb(53,53,58) */
.tray.light .row[aria-selected="true"] { background: rgb(226, 226, 230); } /* sampled from ref-7tv-colon-light/frames/05-down.png at (700,279) */
.l1 {
  display: flex;
  align-items: baseline;
  gap: 6px;
  height: 19.6px;     /* dom.json font.lineHeight */
  white-space: nowrap;
  overflow: hidden;
}
.name { flex: 0 1 auto; overflow: hidden; text-overflow: ellipsis; }
.name b { font-weight: 700; color: inherit; } /* SPEC 7.2: matched range weight 700, same colour */
.alias:empty { display: none; } /* round 2 P4-2: no alias, no extra flex gap before the badge */
.alias {
  flex: 0 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  color: rgb(173, 173, 184); /* SPEC 7.2 line-2 colour dark */
}
.badge {
  flex: 0 0 auto; /* inline right after the name, as 7TV places "(7TV)" (dom.json rowHasBadgeOrSecondLine) */
  font-size: 12px;
  color: rgb(41, 182, 246); /* dom.json highlight.color (the 7TV provider label colour) */
}
.l2 {
  height: 16px;        /* SPEC 7.2 line 2: 12px / 16px */
  font-size: 12px;
  line-height: 16px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis; /* SPEC 7.2: response clipped with an ellipsis */
  color: rgb(173, 173, 184); /* SPEC 7.2 line-2 colour dark (Twitch palette, docs/LEDGER.md) */
}
.tray.light .l2, .tray.light .alias { color: rgb(83, 83, 95); } /* SPEC 7.2 line-2 colour light */
`;
