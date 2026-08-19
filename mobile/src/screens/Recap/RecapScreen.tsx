import React, { useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, View } from "react-native";
import { RouteProp, useRoute } from "@react-navigation/native";
import { AiChatMessage, formatRupiah, RecapInsight, TopSeller, WeeklyBar } from "@lapak/shared";
import { Text } from "../../theme/Text";
import { Button } from "../../components/Button";
import { TextField } from "../../components/TextField";
import { colors, radius, space } from "../../theme/tokens";
import { useAskChat, useAskChatHistory, useDailyRecap, useRegenerateRecap, useWeeklyReports } from "../../state/api/recap";
import { RecapStackParamList } from "../../app/stacks/RecapStack";

export type RecapTabName = "Story" | "Ask" | "Reports";
const TAB_NAMES: RecapTabName[] = ["Story", "Ask", "Reports"];

const AI_UNAVAILABLE_MESSAGE =
  "AI recap isn't available yet — set ANTHROPIC_API_KEY on the backend to enable it. The numbers below are real, just not AI-written.";

// Mirrors the prototype's `suggestions` chips exactly (Warung POS.dc.html, isRecap/recapIsAsk block).
const ASK_SUGGESTIONS = ["What should I restock?", "How is my margin?", "When am I quiet?"];

const ASK_AI_UNAVAILABLE_MESSAGE =
  "AI isn't available yet — set ANTHROPIC_API_KEY on the backend for real answers. Your questions are still saved, and this thread will pick up as soon as it's configured.";

const BAR_MAX_HEIGHT = 96;

export function RecapScreen() {
  const route = useRoute<RouteProp<RecapStackParamList, "Recap">>();
  const [tab, setTab] = useState<RecapTabName>(route.params?.tab ?? "Story");

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text variant="h2">Recap</Text>

      <View style={styles.tabRow}>
        {TAB_NAMES.map((name) => {
          const active = name === tab;
          return (
            <Button
              key={name}
              title={name}
              variant={active ? "primary" : "secondary"}
              onPress={() => setTab(name)}
              style={styles.tabButton}
            />
          );
        })}
      </View>

      {tab === "Story" ? <StoryTab /> : null}
      {tab === "Ask" ? <AskTab /> : null}
      {tab === "Reports" ? <ReportsTab /> : null}
    </ScrollView>
  );
}

function StoryTab() {
  const recapQuery = useDailyRecap();
  const regenerate = useRegenerateRecap();

  if (recapQuery.isLoading) {
    return <ActivityIndicator style={styles.loading} color={colors.accent} />;
  }
  if (recapQuery.isError || !recapQuery.data) {
    return (
      <Text variant="body" color={colors.accent700} style={styles.loading}>
        Couldn't load today's recap. Pull to retry.
      </Text>
    );
  }

  const recap = recapQuery.data;

  return (
    <View style={styles.storySection}>
      {!recap.aiAvailable ? (
        <View style={styles.aiNotice}>
          <Text variant="caption" color={colors.accent700}>
            {AI_UNAVAILABLE_MESSAGE}
          </Text>
        </View>
      ) : null}

      <Text variant="h3" style={styles.headline}>
        {recap.headline}
      </Text>
      <Text variant="body" color={colors.neutral800} style={styles.storyBody}>
        {recap.body}
      </Text>

      <View style={styles.regenerateRow}>
        <Button
          title={regenerate.isPending ? "Refreshing…" : "Refresh recap"}
          variant="ghost"
          loading={regenerate.isPending}
          onPress={() => regenerate.mutate()}
        />
      </View>

      <Text variant="kicker" style={styles.sectionLabel}>
        Noticed
      </Text>
      {recap.insights.length === 0 ? (
        <Text variant="body" color={colors.neutral600} style={styles.emptyInsights}>
          Nothing stands out today.
        </Text>
      ) : (
        recap.insights.map((insight, index) => <InsightRow key={`${insight.title}-${index}`} insight={insight} />)
      )}
    </View>
  );
}

function InsightRow({ insight }: { insight: RecapInsight }) {
  return (
    <View style={styles.insightRow}>
      <Text variant="h3" style={styles.insightTitle}>
        {insight.title}
      </Text>
      <Text variant="caption" color={colors.neutral700} style={styles.insightBody}>
        {insight.body}
      </Text>
      {insight.action ? (
        <Text variant="caption" color={colors.accent700} style={styles.insightAction}>
          {insight.action}
        </Text>
      ) : null}
    </View>
  );
}

function AskTab() {
  const historyQuery = useAskChatHistory();
  const askChat = useAskChat();
  const [draft, setDraft] = useState("");
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);

  const handleSend = (rawText: string) => {
    const trimmed = rawText.trim();
    if (!trimmed || askChat.isPending) return;
    setPendingMessage(trimmed);
    setDraft("");
    askChat.mutate(trimmed, { onSettled: () => setPendingMessage(null) });
  };

  if (historyQuery.isLoading) {
    return <ActivityIndicator style={styles.loading} color={colors.accent} />;
  }
  if (historyQuery.isError) {
    return (
      <Text variant="body" color={colors.accent700} style={styles.loading}>
        Couldn't load the chat. Pull to retry.
      </Text>
    );
  }

  const messages = historyQuery.data?.messages ?? [];
  const showAiUnavailableBanner = askChat.data ? !askChat.data.aiAvailable : false;

  return (
    <View style={styles.askSection}>
      {showAiUnavailableBanner ? (
        <View style={styles.aiNotice}>
          <Text variant="caption" color={colors.accent700}>
            {ASK_AI_UNAVAILABLE_MESSAGE}
          </Text>
        </View>
      ) : null}

      <View style={styles.chatThread}>
        {messages.length === 0 && !pendingMessage ? (
          <Text variant="body" color={colors.neutral700}>
            Ask me anything about the shop — restocking, margin, quiet hours.
          </Text>
        ) : null}
        {messages.map((message) => (
          <ChatBubble key={message.id} role={message.role} text={message.content} />
        ))}
        {pendingMessage ? <ChatBubble role="user" text={pendingMessage} /> : null}
        {askChat.isPending ? <ChatBubble role="assistant" text="Thinking…" muted /> : null}
      </View>

      <View style={styles.suggestionsRow}>
        {ASK_SUGGESTIONS.map((suggestion) => (
          <Button
            key={suggestion}
            title={suggestion}
            variant="secondary"
            disabled={askChat.isPending}
            onPress={() => handleSend(suggestion)}
            style={styles.suggestionChip}
          />
        ))}
      </View>

      <View style={styles.askInputRow}>
        <TextField
          value={draft}
          onChangeText={setDraft}
          placeholder="Ask about your shop…"
          editable={!askChat.isPending}
          onSubmitEditing={() => handleSend(draft)}
          style={styles.askInput}
        />
        <Button
          title={askChat.isPending ? "Asking…" : "Ask"}
          onPress={() => handleSend(draft)}
          loading={askChat.isPending}
          disabled={askChat.isPending || draft.trim() === ""}
          style={styles.askButton}
        />
      </View>
    </View>
  );
}

/** Left/right-aligned chat bubble matching the prototype's `chat` rows exactly: user turns align right on a surface fill, assistant turns align left with an accent-bordered, transparent fill. */
function ChatBubble({ role, text, muted }: { role: AiChatMessage["role"]; text: string; muted?: boolean }) {
  const isUser = role === "user";
  return (
    <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
      <Text variant="body" color={muted ? colors.neutral600 : colors.text}>
        {text}
      </Text>
    </View>
  );
}

function ReportsTab() {
  const reportsQuery = useWeeklyReports();

  if (reportsQuery.isLoading) {
    return <ActivityIndicator style={styles.loading} color={colors.accent} />;
  }
  if (reportsQuery.isError || !reportsQuery.data) {
    return (
      <Text variant="body" color={colors.accent700} style={styles.loading}>
        Couldn't load reports. Pull to retry.
      </Text>
    );
  }

  const { bars, topSellers } = reportsQuery.data;

  return (
    <View style={styles.reportsSection}>
      <Text variant="kicker" style={styles.sectionLabel}>
        Last 7 days
      </Text>
      <WeeklyBarChart bars={bars} />
      <View style={styles.legendRow}>
        <LegendSwatch outline label="total" />
        <LegendSwatch label="PPOB share" />
      </View>

      <View style={styles.topSellersHeaderRow}>
        <Text variant="kicker">Top sellers</Text>
        <Text variant="kicker">Qty · Margin</Text>
      </View>
      {topSellers.length === 0 ? (
        <Text variant="body" color={colors.neutral600} style={styles.emptyInsights}>
          No sales in the last 7 days yet.
        </Text>
      ) : (
        topSellers.map((seller) => <TopSellerRow key={seller.name} seller={seller} />)
      )}
    </View>
  );
}

function WeeklyBarChart({ bars }: { bars: WeeklyBar[] }) {
  const maxTotal = useMemo(() => Math.max(1, ...bars.map((b) => b.total)), [bars]);

  return (
    <View style={styles.chart}>
      <View style={styles.chartBars}>
        {bars.map((bar, index) => {
          const totalHeight = Math.max(1, Math.round((bar.total / maxTotal) * BAR_MAX_HEIGHT));
          const ppobHeight = Math.max(0, Math.round((bar.ppobShare / maxTotal) * BAR_MAX_HEIGHT));
          return (
            <View key={`${bar.label}-${index}`} style={styles.barColumn}>
              <View style={styles.barTrack}>
                <View style={[styles.barTotal, { height: totalHeight }]} />
                <View style={[styles.barPpob, { height: ppobHeight }]} />
              </View>
            </View>
          );
        })}
      </View>
      <View style={styles.chartLabels}>
        {bars.map((bar, index) => (
          <Text key={`${bar.label}-${index}-label`} variant="caption" color={colors.neutral600} style={styles.chartLabel}>
            {bar.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

function LegendSwatch({ label, outline }: { label: string; outline?: boolean }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendSwatch, outline ? styles.legendSwatchOutline : styles.legendSwatchFill]} />
      <Text variant="caption" color={colors.neutral600}>
        {label}
      </Text>
    </View>
  );
}

function TopSellerRow({ seller }: { seller: TopSeller }) {
  return (
    <View style={styles.topSellerRow}>
      <Text variant="body" numberOfLines={1} style={styles.topSellerName}>
        {seller.name}
      </Text>
      <Text variant="tabular" color={colors.neutral700} style={styles.topSellerRight}>
        {seller.qty} · {formatRupiah(seller.margin)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space[4], paddingBottom: space[8] },
  tabRow: { flexDirection: "row", gap: space[2] - 2, marginTop: space[3] },
  tabButton: { flex: 1, paddingHorizontal: space[2], minHeight: 38 },
  loading: { marginTop: space[6] },

  // Story tab
  storySection: {
    marginTop: space[4],
    borderTopWidth: 1,
    borderTopColor: colors.text,
    paddingTop: space[3],
  },
  aiNotice: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.md,
    padding: space[3],
    marginBottom: space[3],
  },
  headline: { fontWeight: "400", lineHeight: 26 },
  storyBody: { marginTop: space[2], lineHeight: 22 },
  regenerateRow: { alignItems: "flex-start", marginTop: space[2] },
  sectionLabel: { marginTop: space[6], marginBottom: space[2] },
  emptyInsights: { paddingVertical: space[2] },
  insightRow: {
    borderLeftWidth: 2,
    borderLeftColor: colors.accent300,
    paddingLeft: space[3],
    paddingVertical: space[2],
    marginBottom: space[2],
  },
  insightTitle: { fontSize: 14.5 },
  insightBody: { marginTop: 3, lineHeight: 18 },
  insightAction: { marginTop: space[1] + 2 },

  // Ask tab
  askSection: {
    marginTop: space[4],
    borderTopWidth: 1,
    borderTopColor: colors.text,
    paddingTop: space[4],
  },
  chatThread: { gap: space[2] + 3 },
  bubble: {
    maxWidth: "84%",
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: space[2] + 2,
    paddingHorizontal: space[3],
  },
  bubbleUser: {
    alignSelf: "flex-end",
    borderColor: colors.divider,
    backgroundColor: colors.surface,
  },
  bubbleAssistant: {
    alignSelf: "flex-start",
    borderColor: colors.accent,
    backgroundColor: "transparent",
  },
  suggestionsRow: { flexDirection: "row", flexWrap: "wrap", gap: space[2] - 2, marginTop: space[4] },
  suggestionChip: { paddingHorizontal: space[3], minHeight: 0, paddingVertical: space[2] - 3 },
  askInputRow: { flexDirection: "row", gap: space[2], marginTop: space[4], alignItems: "flex-start" },
  askInput: { flex: 1 },
  askButton: { paddingHorizontal: space[4] },

  // Reports tab
  reportsSection: {
    marginTop: space[4],
    borderTopWidth: 1,
    borderTopColor: colors.text,
    paddingTop: space[3],
  },
  chart: { marginTop: space[2] },
  chartBars: { flexDirection: "row", alignItems: "flex-end", height: BAR_MAX_HEIGHT + 2, gap: space[1] },
  barColumn: { flex: 1, alignItems: "center" },
  barTrack: { width: "72%", height: BAR_MAX_HEIGHT, justifyContent: "flex-end" },
  barTotal: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  barPpob: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(182, 130, 53, 0.18)",
  },
  chartLabels: { flexDirection: "row", marginTop: space[1] },
  chartLabel: { flex: 1, textAlign: "center" },
  legendRow: { flexDirection: "row", gap: space[4], marginTop: space[2] },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendSwatch: { width: 12, height: 12, borderRadius: 2 },
  legendSwatchOutline: { borderWidth: 1, borderColor: colors.accent, backgroundColor: "transparent" },
  legendSwatchFill: { backgroundColor: "rgba(182, 130, 53, 0.18)" },
  topSellersHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: colors.text,
    paddingBottom: space[2] - 2,
    marginTop: space[6],
  },
  topSellerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: space[2] + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  topSellerName: { flex: 1, marginRight: space[2] },
  topSellerRight: { fontSize: 13.5 },
});
