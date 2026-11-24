// 统一线性图标：1.7 线宽、圆角端点、currentColor 着色，禁 emoji 当图标

const attrs = 'width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"'

export const icons = {
  archive: `<svg ${attrs}><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8"/><path d="M10 12h4"/></svg>`,
  import: `<svg ${attrs}><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2"/></svg>`,
  generate: `<svg ${attrs}><path d="M4 18c2-6 4-6 6 0s4 6 6 0 2-4 4-2"/><path d="M4 6h16"/><path d="M4 12h16"/></svg>`,
  tune: `<svg ${attrs}><path d="M4 21v-7"/><path d="M4 10V3"/><path d="M12 21v-9"/><path d="M12 8V3"/><path d="M20 21v-5"/><path d="M20 12V3"/><path d="M2 14h4"/><path d="M10 8h4"/><path d="M18 16h4"/></svg>`,
  preview: `<svg ${attrs}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`,
  export: `<svg ${attrs}><path d="M12 15V3"/><path d="m7 8 5-5 5 5"/><path d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2"/></svg>`,
  plus: `<svg ${attrs}><path d="M12 5v14"/><path d="M5 12h14"/></svg>`,
  trash: `<svg ${attrs}><path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>`,
  alert: `<svg ${attrs}><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg>`,
  brush: `<svg ${attrs}><path d="m9.06 11.9 8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08"/><path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02Z"/></svg>`,
  layers: `<svg ${attrs}><path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/></svg>`,
  zoom: `<svg ${attrs}><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/><path d="M11 8v6"/><path d="M8 11h6"/></svg>`,
  check: `<svg ${attrs}><path d="M20 6 9 17l-5-5"/></svg>`,
  back: `<svg ${attrs}><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>`,
}

export type IconName = keyof typeof icons
