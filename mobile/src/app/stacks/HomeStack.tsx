import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { HomeScreen } from "../../screens/Home/HomeScreen";
import { AddExpenseScreen } from "../../screens/Home/AddExpenseScreen";
import { OpenShiftScreen } from "../../screens/Home/OpenShiftScreen";
import { ShiftCloseScreen } from "../../screens/Shift/ShiftCloseScreen";
import { ProfileScreen } from "../../screens/Profile/ProfileScreen";
import { AccountManagementScreen } from "../../screens/Profile/AccountManagementScreen";
import { SubscriptionScreen } from "../../screens/Profile/SubscriptionScreen";
import { FranchiseScreen } from "../../screens/Profile/FranchiseScreen";
import { stackScreenOptions } from "./stackScreenOptions";

export type HomeStackParamList = {
  /** The real Home dashboard: takings, tender mix, recap teaser, shortcuts, alerts. */
  Home: undefined;
  /** Opening-float form for the explicit start-of-day shift open (Phase 5). */
  OpenShift: undefined;
  /** Close-shift accounting screen (Phase 5). */
  ShiftClose: undefined;
  /** Minimal add-expense form (Phase 5). */
  AddExpense: undefined;
  Profile: undefined;
  AccountManagement: undefined;
  Subscription: undefined;
  Franchise: undefined;
};

const Stack = createNativeStackNavigator<HomeStackParamList>();

/** Home dashboard plus Phase 5's shift open/close and add-expense screens. */
export function HomeStack() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
      <Stack.Screen
        name="OpenShift"
        component={OpenShiftScreen}
        options={{ title: "Open shift", headerBackTitle: "Home" }}
      />
      <Stack.Screen
        name="ShiftClose"
        component={ShiftCloseScreen}
        options={{ title: "Close shift", headerBackTitle: "Home" }}
      />
      <Stack.Screen
        name="AddExpense"
        component={AddExpenseScreen}
        options={{ title: "Add expense", headerBackTitle: "Home" }}
      />
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ headerShown: false }} />
      <Stack.Screen name="AccountManagement" component={AccountManagementScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Subscription" component={SubscriptionScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Franchise" component={FranchiseScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}
