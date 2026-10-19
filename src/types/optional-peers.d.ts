declare module '@napi-rs/canvas' {
  export type Canvas = Readonly<Record<'__napiCanvas', never>>;
  export type SKRSContext2D = Readonly<Record<'__napiContext', never>>;
}
