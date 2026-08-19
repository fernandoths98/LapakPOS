import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import {
  createBottomTabNavigator,
  BottomTabBarProps,
} from "@react-navigation/bottom-tabs";
import { NavigatorScreenParams } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "../theme/Text";
import { colors } from "../theme/tokens";
import { HomeStack, HomeStackParamList } from "./stacks/HomeStack";
import { SellStack } from "./stacks/SellStack";
import { BillsStack, BillsStackParamList } from "./stacks/BillsStack";
import { StockStack, StockStackParamList } from "./stacks/StockStack";
import { RecapStack, RecapStackParamList } from "./stacks/RecapStack";

/**
 * Each tab's param list is typed as `NavigatorScreenParams<...>` (not plain
 * `undefined`) so a screen in one tab's stack can cross-navigate into a
 * specific screen of another tab — e.g. Home's shortcuts jumping straight to
 * Stock's `Sheet` route — via `navigation.navigate("StockTab", { screen:
 * "Sheet" })` and have it typecheck.
 */
export type MainTabsParamList = {
  HomeTab: NavigatorScreenParams<HomeStackParamList>;
  SellTab: undefined;
  BillsTab: NavigatorScreenParams<BillsStackParamList>;
  StockTab: NavigatorScreenParams<StockStackParamList>;
  RecapTab: NavigatorScreenParams<RecapStackParamList>;
};

const Tab = createBottomTabNavigator<MainTabsParamList>();

const TAB_LABELS: Record<keyof MainTabsParamList, string> = {
  HomeTab: "Home",
  SellTab: "Sell",
  BillsTab: "Bills",
  StockTab: "Stock",
  RecapTab: "Recap",
};

/**
 * Custom tab bar matching the prototype's `tabs` render logic: a 2px
 * accent-colored bar above the label marks the active group, never a filled
 * pill or icon — color is stroke/mark only, per the design system.
 */
function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.tabBar, { paddingBottom: Math.max(10, insets.bottom) }]}>
      {state.routes.map((route, index) => {
        const isFocused = state.index === index;
        const label = TAB_LABELS[route.name as keyof MainTabsParamList] ?? route.name;

        const onPress = () => {
          const event = navigation.emit({
            type: "tabPress",
            target: route.key,
            canPreventDefault: true,
          });
          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        return (
          <Pressable
            key={route.key}
            accessibilityRole="button"
            accessibilityState={isFocused ? { selected: true } : {}}
            onPress={onPress}
            style={styles.tabItem}
          >
            <View style={[styles.mark, isFocused && styles.markActive]} />
            <Text
              variant="kicker"
              style={styles.label}
              color={isFocused ? colors.accent700 : colors.neutral600}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function MainTabs() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false }} tabBar={TabBar}>
      <Tab.Screen name="HomeTab" component={HomeStack} />
      <Tab.Screen name="SellTab" component={SellStack} />
      <Tab.Screen name="BillsTab" component={BillsStack} />
      <Tab.Screen name="StockTab" component={StockStack} />
      <Tab.Screen name="RecapTab" component={RecapStack} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: colors.text,
    backgroundColor: colors.bg,
    paddingTop: 6,
    paddingBottom: 10,
    paddingHorizontal: 4,
  },
  tabItem: {
    flex: 1,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 4,
    paddingTop: 7,
    paddingBottom: 4,
  },
  mark: {
    width: 16,
    height: 2,
    backgroundColor: "transparent",
  },
  markActive: {
    backgroundColor: colors.accent,
  },
  label: {
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: "none",
  },
});
