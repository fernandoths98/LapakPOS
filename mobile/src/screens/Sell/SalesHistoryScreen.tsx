import React from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatRupiah, Sale } from '@lapak/shared';
import { SellStackParamList } from '../../app/stacks/SellStack';
import { useRecentSales } from '../../state/api/sales';
import { Text } from '../../theme/Text';
import { colors, radius, space } from '../../theme/tokens';

const TENDER_LABEL = { cash: 'Tunai', qris: 'QRIS', debit: 'Debit', split: 'Split' } as const;

export function SalesHistoryScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<SellStackParamList>>();
  const sales = useRecentSales();
  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.back}><Text variant="h2">‹</Text></Pressable>
        <View><Text variant="h2">Riwayat transaksi</Text><Text variant="caption">Ketuk transaksi untuk melihat dan mencetak ulang struk</Text></View>
      </View>
      {sales.isLoading ? <ActivityIndicator style={styles.loading} color={colors.accent} /> : (
        <FlatList
          data={sales.data ?? []}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={sales.isRefetching} onRefresh={async () => { await sales.refetch(); }} />}
          ListEmptyComponent={<Text variant="body" style={styles.empty}>Belum ada transaksi penjualan.</Text>}
          renderItem={({ item }) => <SaleRow sale={item} onPress={() => navigation.navigate('SaleDetail', { saleId: item.id })} />}
        />
      )}
    </SafeAreaView>
  );
}

function SaleRow({ sale, onPress }: { sale: Sale; onPress: () => void }) {
  const date = new Date(sale.createdAt).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  const itemCount = sale.lineItems.reduce((sum, line) => sum + line.qty, 0);
  return <Pressable onPress={onPress} style={styles.row}>
    <View style={styles.rowInfo}><Text variant="h3">#{sale.orderNo}</Text><Text variant="caption">{date} · {itemCount} item · {TENDER_LABEL[sale.tenderType]}</Text></View>
    <Text variant="tabular" style={styles.amount}>{formatRupiah(sale.total)}</Text>
    <Text variant="h3" color={colors.neutral500}>›</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { height: 62, flexDirection: 'row', alignItems: 'center', gap: space[2], paddingHorizontal: space[3], backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.divider },
  back: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.divider, borderRadius: radius.sm },
  loading: { marginTop: space[8] },
  list: { padding: space[3], paddingBottom: space[8] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.divider, borderRadius: radius.md, padding: space[3], marginBottom: space[2] },
  rowInfo: { flex: 1 },
  amount: { fontSize: 15 },
  empty: { textAlign: 'center', marginTop: space[8], color: colors.neutral600 },
});
