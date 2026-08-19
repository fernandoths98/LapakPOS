import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { RecapScreen, RecapTabName } from "../../screens/Recap/RecapScreen";
import { stackScreenOptions } from "./stackScreenOptions";

export type RecapStackParamList = {
  /** `tab` lets other screens (Home's "Full recap") land directly on a sub-tab; defaults to "Story". */
  Recap: { tab?: RecapTabName } | undefined;
};

const Stack = createNativeStackNavigator<RecapStackParamList>();

/** Phase 6: the real AI-powered Recap screen (Story + Reports; Ask is a "coming soon" placeholder). */
export function RecapStack() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="Recap" component={RecapScreen} options={{ title: "Recap" }} />
    </Stack.Navigator>
  );
}
