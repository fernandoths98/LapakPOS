import React, { useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { RouteProp, useRoute } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SellStackParamList } from '../../app/stacks/SellStack';
import { useSale } from '../../state/api/sales';
import { useMerchant } from '../../state/api/merchant';
import { useAccountSetup } from '../../state/api/account';
import { Text } from '../../theme/Text';
import { Button } from '../../components/Button';
import { colors, radius, space } from '../../theme/tokens';
import { buildSaleReceiptLines } from '../../lib/bluetoothPrinter/receiptFormatting';
import { IOS_UNAVAILABLE_MESSAGE } from '../../lib/bluetoothPrinter';
import { PrintSheetScreen } from '../Print/PrintSheetScreen';

const TENDER_LABEL = { cash: 'Tunai', qris: 'QRIS', debit: 'Debit', split: 'Split' } as const;
const RECEIPT_MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });

export function SaleDetailScreen() {
  const { params } = useRoute<RouteProp<SellStackParamList, 'SaleDetail'>>();
  const saleQuery = useSale(params.saleId);
  const merchant = useMerchant();
  const accountQuery = useAccountSetup();
  const [printVisible, setPrintVisible] = useState(false);
  const sale = saleQuery.data;
  if (!sale) return <SafeAreaView style={styles.loading} edges={[]}><ActivityIndicator color={colors.accent} /></SafeAreaView>;
  const merchantName = merchant.data?.name ?? 'Kotdee POS';
  const outlets = accountQuery.data?.outlets ?? [];
  const saleOutlet = outlets.find((o) => o.id === sale.outletId);
  const receiptOutlet = outlets.length > 1 && saleOutlet ? { name: saleOutlet.name, address: saleOutlet.address } : null;
  const lines = buildSaleReceiptLines(sale, {
    tenderLabel: TENDER_LABEL[sale.tenderType],
    cashierName: sale.cashierName || 'Kasir',
    merchant: { name: merchantName, address: merchant.data?.address ?? null, phone: merchant.data?.phone ?? null },
    outlet: receiptOutlet,
    cashReceived: sale.tenderType === 'cash' ? sale.cashAmount : undefined,
  });
  const print = () => Platform.OS === 'android' ? setPrintVisible(true) : Alert.alert('Cetak struk', IOS_UNAVAILABLE_MESSAGE);
  return <SafeAreaView style={styles.container} edges={[]}>
    <ScrollView contentContainerStyle={styles.content}>
      <Text variant="h2">Struk #{sale.orderNo}</Text>
      <Text variant="caption">{new Date(sale.createdAt).toLocaleString('id-ID')} · {TENDER_LABEL[sale.tenderType]}</Text>
      <View style={styles.receipt}>
        <View style={styles.receiptBlock}>
          {lines.map((line, index) => (
            <Text
              key={index}
              style={[styles.mono, { textAlign: line.align ?? 'left' }, line.bold && styles.monoBold]}
              numberOfLines={1}
            >
              {line.text.length > 0 ? line.text : ' '}
            </Text>
          ))}
        </View>
      </View>
      <Button title="Cetak ulang struk" onPress={print} fullWidth />
    </ScrollView>
    <PrintSheetScreen visible={printVisible} onClose={() => setPrintVisible(false)} jobType="receipt" lines={lines} />
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg }, loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { width: '100%', maxWidth: 620, alignSelf: 'center', padding: space[4], paddingBottom: space[8] },
  receipt: { marginVertical: space[4], paddingVertical: space[4], paddingHorizontal: space[2], backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.divider, borderRadius: radius.md, alignItems: 'center' },
  receiptBlock: { alignSelf: 'center' },
  mono: { fontFamily: RECEIPT_MONO, fontSize: 11, lineHeight: 16, color: colors.text, includeFontPadding: false },
  monoBold: { fontWeight: '700' },
});
