import React, { useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { errorCodes, isErrorWithCode, keepLocalCopy, pick, types } from "@react-native-documents/picker";
import ReactNativeBlobUtil from "react-native-blob-util";
import * as XLSX from "xlsx";
import { ImportCommitResponse, ImportPreviewResponse } from "@lapak/shared";
import { Text } from "../../theme/Text";
import { Button } from "../../components/Button";
import { Divider } from "../../components/Divider";
import { colors, radius, space } from "../../theme/tokens";
import { downloadAndShareExport, useImportCommit, useImportPreview } from "../../state/api/catalogIo";
import { StockStackParamList } from "../../app/stacks/StockStack";

const FIELD_LABELS: Record<ImportPreviewResponse["mapping"][number]["field"], string> = {
  name: "Name",
  sellPrice: "Sell price",
  costPrice: "Cost",
  stockQty: "Stock",
  barcode: "Barcode",
  ignored: "Ignored",
};

/**
 * Two real exports, not the prototype's mocked three: PPOB doesn't exist
 * yet (that lands in Phase 4), so a "PPOB commission" export would have
 * nothing behind it. Listing only what actually works is the honest scope
 * trim, not a gap.
 */
const EXPORTS: { key: "sales-ledger" | "stock-valuation"; name: string; sub: string }[] = [
  { key: "sales-ledger", name: "Sales ledger", sub: "Per transaction, this month" },
  { key: "stock-valuation", name: "Stock & valuation", sub: "Every SKU with cost and margin" },
];

/** Reads a picked spreadsheet file into {headers, rows} for the preview API — client-side parsing via SheetJS. */
async function parsePickedFile(uri: string, name: string): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  const [copy] = await keepLocalCopy({
    files: [{ uri, fileName: name }],
    destination: "cachesDirectory",
  });
  if (copy.status === "error") {
    throw new Error(copy.copyError);
  }

  const localPath = copy.localUri.replace(/^file:\/\//, "");
  const base64 = await ReactNativeBlobUtil.fs.readFile(localPath, "base64");
  const workbook = XLSX.read(base64, { type: "base64" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error("The workbook has no sheets");
  }

  const sheet = workbook.Sheets[sheetName];
  // header:1 gives an array-of-arrays so the first row can be read as the
  // literal header text, matching what the backend's alias matcher expects.
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "" });
  const headerRow = (aoa[0] ?? []) as unknown[];
  const headers = headerRow.map((h) => String(h ?? "").trim()).filter((h) => h.length > 0);
  if (headers.length === 0) {
    throw new Error("Couldn't find a header row in the sheet");
  }

  const rows = (aoa.slice(1) as unknown[][])
    .filter((row) => row.some((cell) => String(cell ?? "").trim() !== ""))
    .map((row) => {
      const record: Record<string, string> = {};
      headers.forEach((header, idx) => {
        record[header] = String(row[idx] ?? "").trim();
      });
      return record;
    });
  if (rows.length === 0) {
    throw new Error("The sheet has no data rows");
  }

  return { headers, rows };
}

export function SheetScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<StockStackParamList>>();
  const importPreview = useImportPreview();
  const importCommit = useImportCommit();

  const [fileName, setFileName] = useState<string | null>(null);
  const [isPicking, setIsPicking] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [commitResult, setCommitResult] = useState<ImportCommitResponse | null>(null);
  const [exportingKey, setExportingKey] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const handleChooseFile = async () => {
    setPickError(null);
    setPreview(null);
    setCommitResult(null);
    setIsPicking(true);
    try {
      const [picked] = await pick({ type: [types.xlsx, types.xls] });
      const { headers, rows } = await parsePickedFile(picked.uri, picked.name ?? "sheet.xlsx");
      setFileName(picked.name ?? "sheet.xlsx");
      const result = await importPreview.mutateAsync({
        fileName: picked.name ?? "sheet.xlsx",
        headers,
        rows,
      });
      setPreview(result);
    } catch (err) {
      if (isErrorWithCode(err) && err.code === errorCodes.OPERATION_CANCELED) {
        // User backed out of the picker — not an error worth surfacing.
        return;
      }
      const message = err instanceof Error ? err.message : "Couldn't read that file.";
      setPickError(message);
    } finally {
      setIsPicking(false);
    }
  };

  const handleImport = async () => {
    if (!preview) return;
    try {
      const result = await importCommit.mutateAsync({ previewId: preview.previewId });
      setCommitResult(result);
    } catch {
      Alert.alert("Import failed", "Couldn't save these products. Check your connection and try again.");
    }
  };

  const handleExport = async (key: "sales-ledger" | "stock-valuation") => {
    setExportError(null);
    setExportingKey(key);
    try {
      await downloadAndShareExport(key);
    } catch {
      setExportError("Couldn't prepare that file. Check your connection and try again.");
    } finally {
      setExportingKey(null);
    }
  };

  const isBusy = isPicking || importPreview.isPending;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text variant="h2">Excel</Text>
      <Text variant="body" color={colors.neutral700} style={styles.intro}>
        Bring a whole catalogue in from a spreadsheet, or take the ledger out for your accountant.
      </Text>

      <View style={styles.dropZone}>
        <Text variant="h3">Drop or choose a .xlsx</Text>
        <Text variant="caption" color={colors.neutral600} style={styles.dropZoneHint}>
          Columns are matched automatically — you confirm before anything saves.
        </Text>
        <Button
          title={isBusy ? "Reading…" : "Choose file"}
          onPress={handleChooseFile}
          loading={isBusy}
          disabled={isBusy}
          style={styles.chooseButton}
        />
      </View>

      {pickError ? (
        <Text variant="caption" color={colors.accent700} style={styles.errorText}>
          {pickError}
        </Text>
      ) : null}

      {preview && !commitResult ? (
        <>
          <View style={styles.previewCard}>
            <View style={styles.previewHeader}>
              <Text variant="h3" numberOfLines={1} style={styles.previewFileName}>
                {fileName}
              </Text>
              <Text variant="caption" color={colors.neutral600} style={styles.previewRowCount}>
                {preview.totalRows} row{preview.totalRows === 1 ? "" : "s"}
              </Text>
            </View>

            {preview.mapping.map((m) => (
              <View key={m.column} style={styles.mapRow}>
                <Text variant="caption" style={styles.mapColumn} numberOfLines={1}>
                  {m.column}
                </Text>
                <Text variant="caption" color={colors.neutral500}>
                  →
                </Text>
                <Text
                  variant="caption"
                  color={m.needsReview ? colors.accent700 : m.field === "ignored" ? colors.neutral500 : colors.neutral800}
                  style={styles.mapField}
                >
                  {FIELD_LABELS[m.field]}
                  {m.needsReview ? " — confirm?" : ""}
                </Text>
              </View>
            ))}

            {preview.flaggedReasons.length > 0 ? (
              <View style={styles.flaggedBox}>
                {preview.flaggedReasons.map((reason) => (
                  <Text key={reason} variant="caption" color={colors.accent700} style={styles.flaggedText}>
                    {reason}
                  </Text>
                ))}
              </View>
            ) : null}
          </View>

          <Button
            title={importCommit.isPending ? "Importing…" : `Import ${preview.importableRowCount} product${preview.importableRowCount === 1 ? "" : "s"}`}
            onPress={handleImport}
            loading={importCommit.isPending}
            disabled={importCommit.isPending || preview.importableRowCount === 0}
            fullWidth
            style={styles.importButton}
          />
        </>
      ) : null}

      {commitResult ? (
        <View style={styles.doneCard}>
          <Text variant="h3">Catalog updated</Text>
          <Text variant="body" color={colors.neutral700} style={styles.doneBody}>
            {commitResult.createdCount} new product{commitResult.createdCount === 1 ? "" : "s"}, {commitResult.updatedCount} updated
            {commitResult.skippedCount > 0
              ? `, ${commitResult.skippedCount} skipped row${commitResult.skippedCount === 1 ? "" : "s"} held back for review`
              : ""}
            .
          </Text>
          <Button title="Back to Stock" onPress={() => navigation.navigate("Stock")} style={styles.doneButton} />
        </View>
      ) : null}

      <Divider />

      <Text variant="kicker" style={styles.exportKicker}>
        Export
      </Text>
      {exportError ? (
        <Text variant="caption" color={colors.accent700} style={styles.errorText}>
          {exportError}
        </Text>
      ) : null}
      {EXPORTS.map((item) => (
        <Pressable
          key={item.key}
          onPress={() => handleExport(item.key)}
          disabled={exportingKey !== null}
          style={styles.exportRow}
          accessibilityRole="button"
        >
          <View style={styles.exportRowBody}>
            <Text variant="body">{item.name}</Text>
            <Text variant="caption" color={colors.neutral600} numberOfLines={1}>
              {item.sub}
            </Text>
          </View>
          {exportingKey === item.key ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : (
            <Text variant="h3" color={colors.accent700} style={styles.exportTag}>
              .xlsx
            </Text>
          )}
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space[4], paddingBottom: space[8] },
  intro: { marginTop: space[2] },
  dropZone: {
    marginTop: space[4],
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.neutral400,
    borderRadius: radius.md,
    paddingVertical: space[6],
    paddingHorizontal: space[3],
    alignItems: "center",
  },
  dropZoneHint: { marginTop: 4, textAlign: "center" },
  chooseButton: { marginTop: space[3] },
  errorText: { marginTop: space[3] },
  previewCard: {
    marginTop: space[4],
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  previewHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: space[2] + 2,
    paddingHorizontal: space[3],
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  previewFileName: { flex: 1, marginRight: space[2] },
  previewRowCount: { flexShrink: 0 },
  mapRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    paddingVertical: space[2],
    paddingHorizontal: space[3],
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  mapColumn: { flex: 1, fontFamily: "ui-monospace" },
  mapField: { flex: 1, textAlign: "right" },
  flaggedBox: { paddingVertical: space[2] + 2, paddingHorizontal: space[3] },
  flaggedText: { lineHeight: 17 },
  importButton: { marginTop: space[3] },
  doneCard: {
    marginTop: space[4],
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.md,
    padding: space[3],
  },
  doneBody: { marginTop: space[1] },
  doneButton: { marginTop: space[3] },
  exportKicker: { marginTop: space[2] },
  exportRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: space[3],
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  exportRowBody: { flex: 1, minWidth: 0, marginRight: space[2] },
  exportTag: { fontSize: 13, flexShrink: 0 },
});
