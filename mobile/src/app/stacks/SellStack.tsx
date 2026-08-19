import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Sale } from "@lapak/shared";
import { SellScreen } from "../../screens/Sell/SellScreen";
import { CartScreen } from "../../screens/Sell/CartScreen";
import { PaidScreen } from "../../screens/Sell/PaidScreen";
import { stackScreenOptions } from "./stackScreenOptions";

export type SellStackParamList = {
  Sell: undefined;
  Cart: undefined;
  Paid: { sale: Sale };
};

const Stack = createNativeStackNavigator<SellStackParamList>();

/** Sell → Cart → Paid, matching the prototype's register flow. */
export function SellStack() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="Sell" component={SellScreen} options={{ title: "Sell" }} />
      <Stack.Screen name="Cart" component={CartScreen} options={{ title: "Cart", headerBackTitle: "Sell" }} />
      <Stack.Screen name="Paid" component={PaidScreen} options={{ title: "Paid", headerBackVisible: false }} />
    </Stack.Navigator>
  );
}
