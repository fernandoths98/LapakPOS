/**
 * Lapak — Indonesian merchant POS
 *
 * @format
 */

import React from 'react';
import {StatusBar, StyleSheet, View} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {NavigationContainer} from '@react-navigation/native';
import {QueryClientProvider} from '@tanstack/react-query';
import {queryClient} from './src/state/api/queryClient';
import {RootNavigator} from './src/app/RootNavigator';
import {colors} from './src/theme/tokens';
import {SyncStatusBar} from './src/components/SyncStatusBar';
import {useSyncManager} from './src/state/offline/syncManager';

// react-navigation's native-stack headers and this app's own bottom tab bar
// each read insets from SafeAreaProvider directly, so no manual inset
// padding is applied here — that would double it up. SyncStatusBar is the
// one exception: it sits above NavigationContainer entirely (Phase 8's
// always-visible offline-queue indicator, not part of any screen), so it
// applies its own top safe-area inset.
function App() {
  useSyncManager();

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      <QueryClientProvider client={queryClient}>
        <View style={styles.container}>
          <SyncStatusBar />
          <NavigationContainer>
            <RootNavigator />
          </NavigationContainer>
        </View>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
});

export default App;
