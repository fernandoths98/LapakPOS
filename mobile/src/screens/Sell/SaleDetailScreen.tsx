import React, { useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { RouteProp, useRoute } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatRupiah } from '@lapak/shared';
import { SellStackParamList } from '../../app/stacks/SellStack';
import { useSale } from '../../state/api/sales';
import { useMerchant } from '../../state/api/merchant';
import { Text } from '../../theme/Text';
import { Button } from '../../components/Button';
import { colors, radius, space } from '../../theme/tokens';
import { buildSaleReceiptLines } from '../../lib/bluetoothPrinter/receiptFormatting';
import { IOS_UNAVAILABLE_MESSAGE } from '../../lib/bluetoothPrinter';
import { PrintSheetScreen } from '../Print/PrintSheetScreen';

const TENDER_LABEL = { cash: 'Tunai', qris: 'QRIS', debit: 'Debit', split: 'Split' } as const;

export function SaleDetailScreen() {
  const { params } = useRoute<RouteProp<SellStackParamList, 'SaleDetail'>>();
  const saleQuery = useSale(params.saleId);
  const merchant = useMerchant();
  const [printVisible, setPrintVisible] = useState(false);
  const sale = saleQuery.data;
  if (!sale) return <SafeAreaView style={styles.loading} edges={[]}><ActivityIndicator color={colors.accent} /></SafeAreaView>;
  const merchantName = merchant.data?.name ?? 'Kotdee POS';
  const addressLine = [merchant.data?.address, merchant.data?.phone].filter(Boolean).join(' · ');
  const lines = buildSaleReceiptLines(sale, TENDER_LABEL[sale.tenderType], { name: merchantName, addressLine });
  const print = () => Platform.OS === 'android' ? setPrintVisible(true) : Alert.alert('Cetak struk', IOS_UNAVAILABLE_MESSAGE);
  return <SafeAreaView style={styles.container} edges={[]}>
    <ScrollView contentContainerStyle={styles.content}>
      <Text variant="h2">Struk #{sale.orderNo}</Text>
      <Text variant="caption">{new Date(sale.createdAt).toLocaleString('id-ID')} · {TENDER_LABEL[sale.tenderType]}</Text>
      <View style={styles.receipt}>
        {sale.lineItems.map(item => <View key={item.id} style={styles.row}><View style={styles.grow}><Text variant="body">{item.productName}</Text><Text variant="caption">{item.qty} × {formatRupiah(item.unitPrice)}</Text></View><Text variant="tabular">{formatRupiah(item.lineTotal)}</Text></View>)}
        {sale.discount > 0 ? <View style={styles.row}><Text variant="body">Diskon</Text><Text variant="tabular">−{formatRupiah(sale.discount)}</Text></View> : null}
        <View style={[styles.row, styles.total]}><Text variant="h3">TOTAL</Text><Text variant="h2">{formatRupiah(sale.total)}</Text></View>
      </View>
      <Button title="Cetak ulang struk" onPress={print} fullWidth />
    </ScrollView>
    <PrintSheetScreen visible={printVisible} onClose={() => setPrintVisible(false)} jobType="receipt" lines={lines} />
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg }, loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { width: '100%', maxWidth: 620, alignSelf: 'center', padding: space[4], paddingBottom: space[8] },
  receipt: { marginVertical: space[4], padding: space[4], backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.divider, borderRadius: radius.md },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3], paddingVertical: space[2], borderBottomWidth: 1, borderBottomColor: colors.divider },
  grow: { flex: 1 }, total: { borderBottomWidth: 0, paddingTop: space[3] },
});
