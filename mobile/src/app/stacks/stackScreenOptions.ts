import { NativeStackNavigationOptions } from "@react-navigation/native-stack";
import { colors, fonts } from "../../theme/tokens";

/** Shared native-stack chrome: hairline header, heading typography, no drop shadow. */
export const stackScreenOptions: NativeStackNavigationOptions = {
  headerStyle: { backgroundColor: colors.bg },
  headerShadowVisible: false,
  headerTintColor: colors.accent700,
  headerTitleStyle: {
    fontFamily: fonts.heading,
    fontWeight: "500",
    color: colors.text,
  },
  contentStyle: { backgroundColor: colors.bg },
};
