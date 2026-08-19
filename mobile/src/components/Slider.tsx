import React from "react";
import { StyleProp, ViewStyle } from "react-native";
import RNSlider from "@react-native-community/slider";

export interface SliderProps {
  minimumValue: number;
  maximumValue: number;
  step?: number;
  value: number;
  onValueChange: (value: number) => void;
  minimumTrackTintColor?: string;
  maximumTrackTintColor?: string;
  thumbTintColor?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Thin typed wrapper around @react-native-community/slider@5.2.0. Its
 * shipped typings declare the default export as a class extending a
 * `Constructor<...> & typeof SliderComponent` intersection, which this
 * project's TypeScript 6 / @types/react 19 combination doesn't accept as a
 * valid JSX element type (a types-only mismatch — the runtime component
 * itself is fine). Casting once here keeps the workaround in one place
 * instead of an `as unknown as` at every call site.
 */
export const Slider = RNSlider as unknown as React.ComponentType<SliderProps>;
