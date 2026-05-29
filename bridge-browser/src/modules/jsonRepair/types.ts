export type ObjectFrame = {
  type: "object";
  state: "keyOrEnd" | "colon" | "value" | "commaOrEnd";
};

export type ArrayFrame = {
  type: "array";
  state: "valueOrEnd" | "commaOrEnd";
};

export type JsonFrame = ObjectFrame | ArrayFrame;
export type StringRole = "key" | "value";
